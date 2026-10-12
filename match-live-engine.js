/* Lega degli Eroi • Motore LIVE sperimentale (dati PRIVATI, solo anteprima Admin).
 * Importa formazioni/voti dalle tabelle mc_ della Fase 1, NON scrive sul database.
 * Regole MASTER dal regolamento ufficiale Mantra e tabella sostituzioni.
 * ATTENZIONE: l'Excel non specifica assist gold/soft e gol vittoria/pareggio;
 * le proiezioni non equivalgono necessariamente al totale ufficiale di Leghe Fantacalcio.
 */

export const GOAL_BASE = 66;
export const GOAL_STEP = 6;
export const MAX_SUBS = 5;

export const FIELD_BONUS_BY_COMPETITION = Object.freeze({
  'Conf A': 2,
  'Conf B': 2,
  'Unificata': 0,
  'Crash Out Cup': 0,        // Rivalry Games; distinguere SEMPRE la fase
  'Crash Out Cup Playoff': 2
});

const CLUB_CODES = Object.freeze({
  ATA:'Atalanta', BOL:'Bologna', CAG:'Cagliari', COM:'Como', FIO:'Fiorentina',
  FRO:'Frosinone', GEN:'Genoa', INT:'Inter', JUV:'Juventus', LAZ:'Lazio',
  LEC:'Lecce', MIL:'Milan', MON:'Monza', NAP:'Napoli', PAR:'Parma',
  ROM:'Roma', SAS:'Sassuolo', TOR:'Torino', UDI:'Udinese', VEN:'Venezia'
});

export const normalize = input => String(input ?? '').trim()
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const dec = (n) => Number.isFinite(Number(n)) ? Number(n) : 0;
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const roles = text => String(text || '').split('/').map(s => s.trim()).filter(Boolean);
export const pointsToGoals = total => total < GOAL_BASE ? 0 : 1 + Math.floor((total-GOAL_BASE+1e-8)/GOAL_STEP);

// Schema posizioni Mantra 2024/25 pubblicato da Fantacalcio.it; verificare a ogni stagione.
// Ogni barra denota una posizione alternativa, non due slot.
export const TACTICAL_MODULES = Object.freeze({
  '3-4-3':     ['Dc','Dc','Dc/B','E','M/C','C','E','W/A','A/Pc','W/A'],
  '3-4-1-2':   ['Dc','Dc','Dc/B','E','M/C','C','E','T','A/Pc','A/Pc'],
  '3-4-2-1':   ['Dc','Dc','Dc/B','E','M','M/C','E/W','T','T/A','A/Pc'],
  '3-5-2':     ['Dc','Dc','Dc/B','E','M','M/C','C','E/W','A/Pc','A/Pc'],
  '3-5-1-1':   ['Dc','Dc','Dc/B','E/W','M','M','C','E/W','T/A','A/Pc'],
  '4-3-3':     ['Ds','Dc','Dc','Dd','M','M/C','C','W/A','A/Pc','W/A'],
  '4-3-1-2':   ['Ds','Dc','Dc','Dd','M','M/C','C','T','T/A/Pc','A/Pc'],
  '4-4-2':     ['Ds','Dc','Dc','Dd','E','M/C','C','E/W','A/Pc','A/Pc'],
  '4-1-4-1':   ['Ds','Dc','Dc','Dd','M','C/T','T','E/W','W','A/Pc'],
  '4-4-1-1':   ['Ds','Dc','Dc','Dd','E/W','M','C','E/W','T/A','A/Pc'],
  '4-2-3-1':   ['Ds','Dc','Dc','Dd','M','M/C','W/T','T','W/A','A/Pc']
});

// Per ogni posizione: ruoli ammessi con -1 secondo tabella ufficiale.
// Per combinazione exact di ruoli, la penalità è zero; assenti dalla tabella => vietati.
const ADAPTED = Object.freeze({
  'Dc':['Dd','Ds','B'], 'Dc/B':['Dd','Ds'],
  'Dd':['Ds','Dc','B'], 'Ds':['Dd','Dc','B'],
  'E':['Dd','Ds','Dc','B','M'],
  'M':['Dd','Ds','Dc','B','E'],
  'M/C':['Dd','Ds','Dc','B','E'],
  'C':['Dd','Ds','Dc','B','E','M'],
  'E/W':['Dd','Ds','Dc','B','M','C','T'],
  'W/A':['Dd','Ds','Dc','B','E','M','C','T'],
  'T':['Dd','Ds','Dc','B','E','M','C','W'],
  'T/A':['Dd','Ds','Dc','B','E','M','C','W'],
  'A/Pc':['Dd','Ds','Dc','B','E','M','C','T','W'],
  'T/A/Pc':['Dd','Ds','Dc','B','E','M','C','W'],
  'C/T':['Dd','Ds','Dc','B','E','M'],
  'W':['Dd','Ds','Dc','B','E','M','C'],
  'W/T':['Dd','Ds','Dc','B','E','M','C']
});

function penaltyFor(roleString, slot, module) {
  const playerRoles = roles(roleString);
  const target = roles(slot);
  if (playerRoles.some(p => target.includes(p))) return 0;
  let allowed = ADAPTED[slot] || [];
  // Eccezione dell'ufficiale 4-1-4-1: T e W non sono intercambiabili, neppure con malus.
  if (module === '4-1-4-1' && (slot === 'E/W' || slot === 'W')) {
    allowed = allowed.filter(p => p !== 'T');
  }
  if (module === '4-1-4-1' && slot === 'T') {
    allowed = allowed.filter(p => p !== 'W');
  }
  return playerRoles.some(p => allowed.includes(p)) ? 1 : Infinity;
}

// Assegna N giocatori a N posizioni diverse tra le 10 disponibili;
// i giocatori mancanti lasciano posizioni vuote, NON creano sei d'ufficio.
function assignPlayers(players, module) {
  const target = TACTICAL_MODULES[module];
  if (!target || players.length > 10) return null;
  let states = new Map([[0,{malus:0, positions:[]}]]);
  for (const player of players) {
    const next = new Map();
    for (const [mask,state] of states) {
      for (let slot=0;slot<10;slot++) {
        if (mask & (1<<slot)) continue;
        const cost=penaltyFor(player.role,target[slot],module);
        if (!Number.isFinite(cost)) continue;
        const newMask=mask | (1<<slot);
        const previous=next.get(newMask);
        const malus=state.malus+cost;
        if (!previous || malus<previous.malus) next.set(newMask,{malus,positions:[...state.positions,slot]});
      }
    }
    states=next;
    if (!states.size) return null;
  }
  let best=null;
  for (const state of states.values()) if (!best || state.malus < best.malus) best=state;
  return best && {module,malus:best.malus, positions:best.positions};
}

export function makeVoteIndex(votes) {
  const byPlayer=new Map(), clubs=new Set(), conflicts=new Set();
  for (const vote of votes || []) {
    const club=normalize(vote.club_name);
    const name=normalize(vote.player_name);
    clubs.add(club);
    const key=club+'|'+name;
    if (byPlayer.has(key)) conflicts.add(key);
    else byPlayer.set(key,vote);
  }
  return {byPlayer,clubs,conflicts};
}

function scorePlayer(vote, playerRole) {
  const s=vote.stats||{};
  const stat=(field)=>dec(s[field]);
  const v=dec(vote.vote_numeric);
  const bonus=3*stat('goals_scored') - stat('goals_conceded') + 3*stat('penalties_saved')
    -3*stat('penalties_missed') + 3*stat('penalties_scored') - 2*stat('own_goals')
    -0.5*stat('yellow_cards') -stat('red_cards') +stat('assists');
  // Portieri: porta inviolata (+1) solo quando voto reale e nessun gol subito.
  // Non assegnarlo a 6 provvisori né a tutti i giocatori con 0 gol subiti.
  const isKeeper = roles(playerRole).includes('Por');
  const keeperCleanSheet = isKeeper && stat('goals_conceded')===0 ? 1 : 0;
  return {base:v, bonus:round(bonus+keeperCleanSheet), total:round(v+bonus+keeperCleanSheet)};
}

function playerStatus(p,voteIndex,simOverrides={}) {
  const c=CLUB_CODES[String(p.club_code||'').toUpperCase()];
  if (!c) return {...p,status:'unknown',base:0,fantavote:0,reason:`Codice club sconosciuto: ${p.club_code}`};
  const key=normalize(c)+'|'+normalize(p.player_name);
  if (voteIndex.conflicts.has(key)) return {...p,status:'unknown',base:0,fantavote:0,reason:'Nome duplicato nel file voti'};
  const v=voteIndex.byPlayer.get(key);
  if (!v) {
    if (!voteIndex.clubs.has(normalize(c))) return {...p,status:'pending',base:6,fantavote:6,reason:'Partita non ancora pubblicata'};
    return {...p,status:'sv',base:0,fantavote:0,reason:'SV: assente dal file della squadra già pubblicata'};
  }
  if (v.status==='sv' || String(v.vote_raw||'').includes('*')) {
    return {...p,status:'sv',base:0,fantavote:0,reason:`SV (${v.vote_raw})`};
  }
  const r=scorePlayer(v,p.role);
  const keyOverride=normalize(p.team_name)+'|'+normalize(p.player_name);
  const override=simOverrides[keyOverride];
  if (override) {
    const newBase=dec(override.vote);
    const extra=dec(override.goal)*3+dec(override.assist);
    return {...p,status:'simulated',base:newBase,fantavote:round(newBase+r.bonus+extra),bonus:round(r.bonus+extra),reason:'Simulazione manuale'};
  }
  // Un 6 provvisorio già esistente può essere sostituito dal simulatore.
  return {...p,status:'rated',base:r.base,fantavote:r.total,bonus:r.bonus,reason:'Voto pubblicato'};
}

function applySimulationOverride(p, overrides) {
  const key=normalize(p.team_name)+'|'+normalize(p.player_name);
  const override=overrides[key];
  if (!override || (p.status!=='pending' && p.status!=='simulated')) return p;
  return {...p,status:'simulated',base:dec(override.vote),fantavote:round(dec(override.vote)+3*dec(override.goal)+dec(override.assist)),reason:'Simulazione manuale'};
}

function handleSwitches(starters,bench,warnings) {
  const ss=starters.filter(p=>p.switch_state==='occurred');
  const bs=bench.filter(p=>p.switch_state==='occurred');
  if (ss.length!==bs.length) {
    if (ss.length || bs.length) warnings.push(`Switch non abbinati (${ss.length} titolari, ${bs.length} riserve). Confermare export.`);
    return {starters,bench};
  }
  const copyS=[...starters], copyB=[...bench];
  ss.forEach((starter,i)=>{
    const substitute=bs[i];
    const si=copyS.indexOf(starter), bi=copyB.indexOf(substitute);
    if(si<0||bi<0) return;
    // Il giocatore entrante occupa lo slot titolare, quello uscito lo slot panchina.
    copyS[si]={...substitute,slot_type:'starter',slot_index:starter.slot_index,fromSwitch:true};
    copyB[bi]={...starter,slot_type:'bench',slot_index:substitute.slot_index,fromSwitch:true};
  });
  if (starters.some(p=>p.switch_state==='pending') || bench.some(p=>p.switch_state==='pending'))
    warnings.push('Uno o più switch in attesa di conferma: la proiezione potrebbe cambiare.');
  return {starters:copyS,bench:copyB};
}

function lexicographic(a,b) {
  for(let i=0;i<Math.min(a.length,b.length);i++) if (a[i]!==b[i]) return a[i]-b[i];
  return a.length-b.length;
}
function combinations(a,k) {
  const out=[];
  const gen=(start,current)=>{
    if(current.length===k){out.push([...current]);return;}
    for(let i=start;i<=a.length-(k-current.length);i++){current.push(a[i]);gen(i+1,current);current.pop();}
  };
  gen(0,[]);return out;
}

function selectMantraMovement(starters,bench,maxSubs,initialModule) {
  const unavailable=starters.filter(x=>x.status==='sv'||x.status==='unknown');
  const confirmed=starters.filter(x=>x.status!=='sv'&&x.status!=='unknown');
  const options=bench.filter(x=>x.status!=='sv'&&x.status!=='unknown'&&!roles(x.role).includes('Por'))
    .sort((a,b)=>a.slot_index-b.slot_index);
  const count=Math.min(unavailable.length,maxSubs);
  // Senza cambi resta lo schema effettivamente schierato: MASTER non riassegna
  // gli undici per cercare un modulo migliore se non occorrono sostituzioni.
  if (unavailable.length===0 && TACTICAL_MODULES[initialModule]) {
    return {players:confirmed,benchUsed:[],selectedIds:[],fit:assignPlayers(confirmed,initialModule),missing:0};
  }
  const allModules=Object.keys(TACTICAL_MODULES);
  for(let substitutions=count;substitutions>=0;substitutions--) {
    const combos=combinations(options.map((_,i)=>i),substitutions);
    let bestAdapted=null;
    for(const selectedIds of combos) {
      const players=[...confirmed,...selectedIds.map(i=>options[i])];
      for(const module of allModules) {
        const fit=assignPlayers(players,module);
        if(!fit) continue;
        const candidate={players,benchUsed:selectedIds.map(i=>options[i]),selectedIds,fit};
        if(fit.malus===0) return {...candidate,missing:10-players.length};
        if(!bestAdapted || fit.malus<bestAdapted.fit.malus ||
           (fit.malus===bestAdapted.fit.malus && lexicographic(selectedIds,bestAdapted.selectedIds)<0))
          bestAdapted=candidate;
      }
    }
    if(bestAdapted) return {...bestAdapted,missing:10-bestAdapted.players.length};
  }
  return {players:confirmed,benchUsed:[],selectedIds:[],fit:null,missing:10-confirmed.length};
}

const DEF_ROLES=['Dc','Dd','Ds','B','E','M'];
const CORE_DEF_ROLES=['Dc','Dd','Ds','B'];
function factorDifensivo(onField) {
  const keeper=onField.find(p=>roles(p.role).includes('Por'));
  const eligible=onField.filter(p=>!roles(p.role).includes('Por') && roles(p.role).some(r=>DEF_ROLES.includes(r)));
  if(!keeper || eligible.length<5) return {bonus:0,mean:null,why:'Reparto difensivo incompleto'};
  // Primi 5 per voto, con almeno 3 tra Dc/B/Dd/Ds; il portiere è il sesto voto.
  let best=null;
  for(const set of combinations(eligible.map((_,i)=>i),5)) {
    const group=set.map(i=>eligible[i]);
    if(group.filter(p=>roles(p.role).some(r=>CORE_DEF_ROLES.includes(r))).length<3) continue;
    const total=group.reduce((s,p)=>s+p.base,0)+keeper.base;
    if(!best || total>best.total)best={total,group};
  }
  if(!best) return {bonus:0,mean:null,why:'Meno di tre difensori Dc/B/Dd/Ds'};
  const mean=round(best.total/6);
  const tiers=[[7.5,7],[7.25,6],[7,5],[6.75,4],[6.5,3],[6.25,2],[6,1]];
  const bonus=(tiers.find(([min])=>best.total/6+1e-9>=min)||[0,0])[1];
  return {bonus,mean,players:best.group.map(x=>x.player_name),why:'D-Factor 5 difensori + portiere'};
}

export function scoreTeam(formations, index, options={}) {
  const maxSubs=options.maxSubs??MAX_SUBS;
  const overrides=options.overrides||{};
  const warnings=[];
  const starters=formations.filter(p=>p.slot_type==='starter').sort((a,b)=>a.slot_index-b.slot_index)
    .map(p=>applySimulationOverride(playerStatus(p,index,overrides),overrides));
  const bench=formations.filter(p=>p.slot_type==='bench').sort((a,b)=>a.slot_index-b.slot_index)
    .map(p=>applySimulationOverride(playerStatus(p,index,overrides),overrides));
  if(starters.length!==11) return {error:`Attesi 11 titolari, trovati ${starters.length}`};
  const swapped=handleSwitches(starters,bench,warnings);
  const startersAfter=swapped.starters, benchAfter=swapped.bench;
  const unknownStarters=startersAfter.filter(p=>p.status==='unknown');
  if(unknownStarters.length)warnings.push('Giocatori titolari non identificati: '+unknownStarters.map(p=>p.player_name).join(', ')+'. Non considerarli SV finché non vengono verificati.');
  const keeper=startersAfter.find(p=>roles(p.role).includes('Por'));
  if(!keeper) return {error:'Nessun portiere titolare'};
  let onField=[];
  let used=[];
  let keeperUsed=null;
  let substitutions=0;
  if(keeper.status==='sv'||keeper.status==='unknown') {
    keeperUsed=benchAfter.find(p=>roles(p.role).includes('Por') && p.status!=='sv'&&p.status!=='unknown');
    if(keeperUsed && maxSubs>0) {onField.push(keeperUsed);used.push(keeperUsed);substitutions++;}
    else warnings.push('Portiere senza voto e nessun sostituto disponibile.');
  } else onField.push(keeper);
  const movements=startersAfter.filter(p=>!roles(p.role).includes('Por'));
  const picked=selectMantraMovement(movements,benchAfter,Math.max(0,maxSubs-substitutions),formations[0]?.module);
  onField.push(...picked.players);
  used.push(...picked.benchUsed);
  substitutions+=picked.benchUsed.length;
  if(!picked.fit)warnings.push('Modulo Mantra non ricostruibile: risultato non affidabile.');
  if(picked.missing)warnings.push(`Squadra in inferiorità numerica: ${picked.missing} giocatori di movimento mancanti.`);
  const missingCount=startersAfter.filter(p=>p.status==='sv'||p.status==='unknown').length;
  const pending=onField.filter(p=>p.status==='pending').length;
  const uncertain=unknownStarters.length;
  if(uncertain)warnings.push('Abbinamento nomi/club incompleto: il risultato è da verificare.');
  const factor=factorDifensivo(onField);
  const fieldBonus=dec(options.fieldBonus);
  const roleMalus=picked.fit?.malus||0;
  const baseFP=round(onField.reduce((sum,p)=>sum+p.fantavote,0));
  const total=round(baseFP+factor.bonus+fieldBonus-roleMalus);
  if(pending)warnings.push(`${pending} ${pending===1?'voto è ancora stimato':'voti sono ancora stimati'} a 6.`);
  if(onField.some(p=>p.status==='rated'&&p.bonus))warnings.push('Verificare assist gold/soft e gol decisivi non presenti nell’Excel.');
  return {team:formations[0]?.team_name||'',module:formations[0]?.module,selectedModule:picked.fit?.module||null,
    total,goals:pointsToGoals(total),baseFP,fieldBonus,roleMalus,defensiveFactor:factor,
    substitutions,missingStarters:missingCount,pending,onField,benchUsed:used,starters:startersAfter,bench:benchAfter,
    warnings,switched:startersAfter.filter(p=>p.fromSwitch).length,complete:pending===0 && uncertain===0 && !warnings.some(w=>w.includes('non ricostruibile')||w.includes('Switch non abbinati'))};
}

function normalizeFixtureMatch(f, home,away) {
  const fh=normalize(f.home_team||f.home);
  const fa=normalize(f.away_team||f.away);
  return (fh===normalize(home)&&fa===normalize(away)) || (fh===normalize(away)&&fa===normalize(home));
}
function fieldBonus({competition,phase,homeTeam,team}) {
  const cup=String(competition||'').toLowerCase();
  if(cup.includes('crash')) return /playoff/i.test(String(phase||'')) && normalize(homeTeam)===normalize(team) ? 2 : 0;
  return (FIELD_BONUS_BY_COMPETITION[competition]||0) && normalize(homeTeam)===normalize(team) ? 2 : 0;
}

export function calculateRound({season='2026/27',gw,competition,formations,votes,fixtures=[],overrides={}}) {
  const index=makeVoteIndex(votes);
  const byTeam=new Map();
  for(const p of formations||[]) {
    const key=normalize(p.team_name);
    if(!byTeam.has(key))byTeam.set(key,[]);
    byTeam.get(key).push(p);
  }
  const output=[];
  const completed=new Set();
  for(const [key,list] of byTeam) {
    if(completed.has(key))continue;
    const team=list[0]?.team_name;
    const opponent=list[0]?.opponent_name;
    const otherKey=normalize(opponent),other=byTeam.get(otherKey);
    completed.add(key);completed.add(otherKey);
    if(!other) {output.push({error:`Manca la formazione di ${opponent}`,home:team,away:opponent});continue;}
    const f=(fixtures||[]).find(row=>normalizeFixtureMatch(row,team,opponent));
    let home=f?.home_team || f?.home || null;
    let away=f?.away_team || f?.away || null;
    const fixtureMissing=!home||!away;
    if(fixtureMissing){home=team;away=opponent;}
    const homePlayers=byTeam.get(normalize(home)) || list;
    const awayPlayers=byTeam.get(normalize(away)) || other;
    const bonusHome=fixtureMissing?0:fieldBonus({competition,phase:f?.phase,homeTeam:home,team:home});
    const bonusAway=fixtureMissing?0:fieldBonus({competition,phase:f?.phase,homeTeam:home,team:away});
    const homeScore=scoreTeam(homePlayers,index,{fieldBonus:bonusHome,overrides});
    const awayScore=scoreTeam(awayPlayers,index,{fieldBonus:bonusAway,overrides});
    const issues=[];
    if(fixtureMissing && (FIELD_BONUS_BY_COMPETITION[competition]||0)>0)
      issues.push('Calendario casa/trasferta non trovato: +2 sospeso, punteggio da verificare.');
    if(homeScore.error || awayScore.error)issues.push(homeScore.error||awayScore.error);
    output.push({season,gw,competition,home,away,homeScore,awayScore,fixtureMissing,issues});
  }
  return {season,gw,competition,matches:output,clubCount:index.clubs.size,playersCount:(votes||[]).length};
}

export function requiredForWin(opponentGoals,currentPoints) {
  const target=GOAL_BASE+GOAL_STEP*opponentGoals;
  return {target,missing:round(Math.max(0,target-currentPoints))};
}
