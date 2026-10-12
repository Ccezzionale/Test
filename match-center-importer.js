/* Lega degli Eroi — parser Excel formazioni e voti.
   Modulo senza dipendenze: riceve matrici XLSX.utils.sheet_to_json(...,{header:1}).
   Non calcola i fantapunti Mantra e non pubblica i voti. */

export const SEASON_DEFAULT = "2026/27";
export const COMPETITIONS = Object.freeze({
  "Conf A": "Conference League",
  "Conf B": "Conference Championship",
  "Unificata": "Round Robin"
});

const TEAM_NAMES = [
  "Atlético Leon", "Bayern Christiansen", "Team Bartowski", "Golden Knights", "Ibla",
  "Fantaugusta", "Riverfilo", "Desperados", "Wildboys 78", "Pandinicoccolosini",
  "Pokermantra", "Minnesode Timberland", "Minnesota Snakes", "Eintracht Franco 126",
  "FC Disoneste", "Athletic Pongao"
];
const clean = value => String(value ?? "").trim();
const norm = value => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const at = (row, index) => clean(row?.[index]);
const neat = str => clean(str).replace(/\s+/g," ");
const numeric = value => Number(String(value).replace(",", "."));
const finite = value => Number.isFinite(numeric(value));

export function canonicalTeamName(name) {
  return TEAM_NAMES.find(team => norm(team) === norm(name)) || neat(name);
}
function validFileMeta(firstRow, fileName) {
  const first = neat(firstRow?.[0]);
  const fromTitle = first.match(/giornata\s*(\d+)/i);
  const fromFilename = clean(fileName).match(/(?:^|[_\s-])g(\d+)(?:\.|[_\s-]|$)/i);
  const gw = Number(fromTitle?.[1] || fromFilename?.[1] || 0);
  let competition = null;
  if (/conference\s+championship/i.test(first)) competition = "Conf B";
  else if (/conference\s+league/i.test(first)) competition = "Conf A";
  else if (/round\s*robin|unificata/i.test(first)) competition = "Unificata";
  return { title:first, gw, competition };
}
function playerInfo(value) {
  const raw = neat(value);
  const hasSwitch = raw.includes("⇄");
  const switchState = !hasSwitch ? "none" : raw.includes("✓") ? "occurred" : raw.includes("✗") ? "not_occurred" : "pending";
  const captain = /Ⓒ|\(C\)/.test(raw);
  const vice = /Ⓥ|\(VC\)/.test(raw);
  return {
    player_name: neat(raw.replace(/\s*⇄\s*[✓✗]?/g, "").replace(/[ⒸⓋ]/g, "").replace(/\s*\((?:VC|C)\)/g, "")),
    switch_state: switchState,
    is_captain: captain,
    is_vice_captain: vice
  };
}

export function parseFormationRows(rows, fileName="") {
  if (!Array.isArray(rows) || rows.length < 12) throw new Error("Il file formazioni sembra vuoto o incompleto.");
  const meta = validFileMeta(rows[0], fileName);
  const matches = [];
  const players = [];
  const seen = new Set();
  for (let i=0; i<rows.length-3; i++) {
    const matchup = rows[i] || [];
    const moduleRow = rows[i+2] || [];
    const header = rows[i+3] || [];
    if (at(matchup,3) !== "-" || norm(at(moduleRow,0)) !== "modulo" || norm(at(moduleRow,4)) !== "modulo" ||
        norm(at(header,0)) !== "ruolo" || norm(at(header,4)) !== "ruolo") continue;
    const home = canonicalTeamName(at(matchup,0));
    const away = canonicalTeamName(at(matchup,4));
    if (!home || !away || norm(home)===norm(away)) throw new Error(`Incontro non valido alla riga ${i+1}.`);
    const matchKey = [norm(home), norm(away)].sort().join("|");
    if (seen.has(matchKey)) throw new Error(`Incontro duplicato: ${home} vs ${away}.`);
    seen.add(matchKey);
    const modules = [at(moduleRow,1),at(moduleRow,5)];
    const record = {home,away,home_module:modules[0],away_module:modules[1]};
    matches.push(record);
    const slotCounts = [{starter:0,bench:0},{starter:0,bench:0}];
    let isBench = false;
    let k = i+4;
    for (;k<rows.length;k++) {
      const row=rows[k] || [];
      if (at(row,3)==="-" && k>i+4) break;
      if (norm(at(row,0))==="panchina" || norm(at(row,4))==="panchina") { isBench=true;continue; }
      if (norm(at(row,0))==="modulo" || norm(at(row,0))==="ruolo") break;
      for (const side of [0,1]) {
        const col=side===0?0:4;
        const role=at(row,col);
        const player=at(row,col+1);
        const club=at(row,col+2);
        if (!player) continue;
        // Ignora righe descrittive. I giocatori devono avere ruolo e club Serie A.
        if (!role || !club || !/^[A-Z]{2,4}$/i.test(club) || /^(?:modulo|calciatore|panchina)$/i.test(role)) continue;
        const slot_type=isBench?"bench":"starter";
        const slot_index=++slotCounts[side][slot_type];
        players.push({
          team_name: side===0?home:away,
          opponent_name: side===0?away:home,
          module:modules[side], slot_type, slot_index,
          role, club_code:club.toUpperCase(), ...playerInfo(player)
        });
      }
    }
    for (let side=0;side<2;side++) {
      if (slotCounts[side].starter !== 11) {
        const team=side===0?home:away;
        throw new Error(`${team}: trovati ${slotCounts[side].starter} titolari, attesi 11. File non salvato.`);
      }
    }
    i=k-1;
  }
  if (!matches.length) throw new Error("Nessun incontro riconosciuto. Controlla che sia l'export formazioni di Fantacalcio.");
  const teamNames = new Set(players.map(p=>norm(p.team_name)));
  if (teamNames.size !== matches.length*2) throw new Error("Una franchigia appare in più incontri: controlla il file.");
  return {
    ...meta, matches, players,
    stats:{matches:matches.length,teams:teamNames.size,starters:players.filter(p=>p.slot_type==="starter").length,
      bench:players.filter(p=>p.slot_type==="bench").length,
      switches:players.filter(p=>p.switch_state!=="none").length}
  };
}

const DATA_CLUB_NAMES = ["Atalanta","Bologna","Cagliari","Como","Fiorentina","Frosinone","Genoa","Inter","Juventus","Lazio","Lecce","Milan","Monza","Napoli","Parma","Roma","Sassuolo","Torino","Udinese","Venezia"];
const CLUBS_SET = new Set(DATA_CLUB_NAMES.map(norm));
const FLOAT_STATS = ["goals_scored","goals_conceded","penalties_saved","penalties_missed","penalties_scored","own_goals","yellow_cards","red_cards","assists"];

export function parseVoteRows(rows) {
  if (!Array.isArray(rows) || rows.length<8) throw new Error("Il foglio Fantacalcio è vuoto o incompleto.");
  const header=neat(rows[0]?.[0]);
  const m=header.match(/(?:^|\s)(\d+)[ªº°]?\s*giornata/i);
  const gw=Number(m?.[1] || 0);
  if (!/voti\s+fantacalcio/i.test(header)) throw new Error("Non sembra l'Excel dei voti Fantacalcio.");
  const votes=[];
  const clubs=new Set();
  const seen=new Set();
  let club=null;
  for (let i=1;i<rows.length;i++) {
    const row=rows[i]||[];
    const clubCandidate=at(row,0);
    if (CLUBS_SET.has(norm(clubCandidate)) && norm(at(rows[i+1],0))==="cod") {
      club=DATA_CLUB_NAMES.find(c=>norm(c)===norm(clubCandidate));
      clubs.add(club);
      i++; continue;
    }
    if (!club) continue;
    const code=Number(row[0]);
    if (!Number.isInteger(code) || code<=0) continue;
    if (seen.has(code)) throw new Error(`Codice calciatore duplicato: ${code}.`);
    seen.add(code);
    const player_name=at(row,2);
    const raw=at(row,3);
    if (!player_name || !raw) throw new Error(`Voto incompleto per codice ${code}, riga ${i+1}.`);
    const starred=raw.includes("*");
    const is_numeric=!starred && finite(raw);
    const vote_numeric=is_numeric?numeric(raw):null;
    const status=is_numeric?"rated":"sv";
    const stats={};
    FLOAT_STATS.forEach((key,j)=>{
      const original=row[j+4];
      stats[key]=original==null||original===""?0:(finite(original)?numeric(original):0);
    });
    votes.push({player_code:code,player_name,club_name:club,vote_raw:raw,vote_numeric,status,stats});
  }
  if (!clubs.size || !votes.length) throw new Error("Nessun voto riconosciuto. Verifica di aver caricato il file corretto.");
  return {gw, clubs:[...clubs], votes, stats:{clubs:clubs.size,players:votes.length,rated:votes.filter(v=>v.status==="rated").length,sv:votes.filter(v=>v.status==="sv").length}};
}
