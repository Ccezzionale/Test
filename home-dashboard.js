import { supabase } from "./supabase.js";
import { loadResultsRows } from "./results-source.js";

const GOAL_BASE = 66;
const GOAL_STEP = 6;

const squadreBase = [
  { nome: "Atlético Leon", logo: "img/Atlético Leon.webp", shirt: "img/maglie/leon-mascotte.webp", coach: "Coach Leo e Anthony" },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.webp", shirt: "img/maglie/bayern-mascotte.webp", coach: "Coach Christian" },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.webp", shirt: "img/maglie/bartowski-mascotte.webp", coach: "Coach Marco" },
  { nome: "Golden Knights", logo: "img/Golden Knights.webp", shirt: "img/maglie/golden-mascotte.webp", coach: "Coach Mimmo&Francesco" },
  { nome: "Ibla", logo: "img/Ibla.webp", shirt: "img/maglie/ibla-mascotte.webp", coach: "Coach Francesco" },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.webp", shirt: "img/maglie/fantaugusta-mascotte.webp", coach: "Coach Giancarlo" },
  { nome: "Riverfilo", logo: "img/Riverfilo.webp", shirt: "img/maglie/riverfilo-mascotte.webp", coach: "Coach Federico" },
  { nome: "Desperados", logo: "img/Desperados.webp", shirt: "img/maglie/desperados-mascotte.webp", coach: "Coach Stefano" },
  { nome: "Wildboys 78", logo: "img/wildboys78.webp", shirt: "img/maglie/wildboys-mascotte.webp", coach: "Coach Francesco" },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.webp", shirt: "img/maglie/pandini-mascotte.webp", coach: "Coach Davide" },
  { nome: "Pokermantra", logo: "img/PokerMantra.webp", shirt: "img/maglie/pokermantra-mascotte.webp", coach: "Coach Omar" },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.webp", shirt: "img/maglie/minnesode-mascotte.webp", coach: "Coach Pierpaolo&Leandro" },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.webp", shirt: "img/maglie/snakes-mascotte.webp", coach: "Coach Alberto" },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.webp", shirt: "img/maglie/franco-mascotte.webp", coach: "Coach Lorenzo" },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.webp", shirt: "img/maglie/disoneste-mascotte.webp", coach: "Coach Basilio" },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.webp", shirt: "img/maglie/pongao-mascotte.webp", coach: "Coach Dario&Giorgio" }
];

// Calendari 2026/27: fallback quando le righe future non sono ancora in fantacalcio_results.
const FALLBACK_FIXTURES = {
  "Conf A": {
    label: "Conference League",
    rounds: {
      1: [["Pandinicoccolosini", "Ibla"], ["Bayern Christiansen", "Team Bartowski"], ["Desperados", "Minnesota Snakes"], ["Minnesode Timberland", "Athletic Pongao"]],
      2: [["Ibla", "Minnesode Timberland"], ["Athletic Pongao", "Desperados"], ["Minnesota Snakes", "Bayern Christiansen"], ["Team Bartowski", "Pandinicoccolosini"]],
      3: [["Bayern Christiansen", "Athletic Pongao"], ["Desperados", "Ibla"], ["Minnesode Timberland", "Pandinicoccolosini"], ["Minnesota Snakes", "Team Bartowski"]],
      4: [["Pandinicoccolosini", "Desperados"], ["Ibla", "Bayern Christiansen"], ["Athletic Pongao", "Minnesota Snakes"], ["Team Bartowski", "Minnesode Timberland"]],
      5: [["Bayern Christiansen", "Pandinicoccolosini"], ["Desperados", "Minnesode Timberland"], ["Athletic Pongao", "Team Bartowski"], ["Minnesota Snakes", "Ibla"]],
      6: [["Pandinicoccolosini", "Minnesota Snakes"], ["Ibla", "Athletic Pongao"], ["Desperados", "Team Bartowski"], ["Minnesode Timberland", "Bayern Christiansen"]],
      7: [["Bayern Christiansen", "Desperados"], ["Athletic Pongao", "Pandinicoccolosini"], ["Minnesota Snakes", "Minnesode Timberland"], ["Team Bartowski", "Ibla"]],
      8: [["Desperados", "Pandinicoccolosini"], ["Athletic Pongao", "Bayern Christiansen"], ["Minnesode Timberland", "Ibla"], ["Team Bartowski", "Minnesota Snakes"]],
      9: [["Pandinicoccolosini", "Athletic Pongao"], ["Ibla", "Team Bartowski"], ["Bayern Christiansen", "Minnesode Timberland"], ["Minnesota Snakes", "Desperados"]],
      10: [["Desperados", "Bayern Christiansen"], ["Minnesode Timberland", "Minnesota Snakes"], ["Team Bartowski", "Athletic Pongao"], ["Ibla", "Pandinicoccolosini"]],
      11: [["Minnesode Timberland", "Desperados"], ["Bayern Christiansen", "Minnesota Snakes"], ["Athletic Pongao", "Ibla"], ["Pandinicoccolosini", "Team Bartowski"]],
      12: [["Ibla", "Desperados"], ["Pandinicoccolosini", "Minnesode Timberland"], ["Minnesota Snakes", "Athletic Pongao"], ["Team Bartowski", "Bayern Christiansen"]],
      13: [["Bayern Christiansen", "Ibla"], ["Desperados", "Athletic Pongao"], ["Minnesode Timberland", "Team Bartowski"], ["Minnesota Snakes", "Pandinicoccolosini"]],
      14: [["Pandinicoccolosini", "Bayern Christiansen"], ["Ibla", "Minnesota Snakes"], ["Athletic Pongao", "Minnesode Timberland"], ["Team Bartowski", "Desperados"]]
    }
  },
  "Conf B": {
    label: "Conference Championship",
    rounds: {
      1: [["FC Disoneste", "Fantaugusta"], ["Wildboys 78", "Pokermantra"], ["Riverfilo", "Golden Knights"], ["Atlético Leon", "Eintracht Franco 126"]],
      2: [["Fantaugusta", "Atlético Leon"], ["Eintracht Franco 126", "Riverfilo"], ["Golden Knights", "Wildboys 78"], ["Pokermantra", "FC Disoneste"]],
      3: [["Wildboys 78", "Eintracht Franco 126"], ["Riverfilo", "Fantaugusta"], ["Atlético Leon", "FC Disoneste"], ["Golden Knights", "Pokermantra"]],
      4: [["FC Disoneste", "Riverfilo"], ["Fantaugusta", "Wildboys 78"], ["Eintracht Franco 126", "Golden Knights"], ["Pokermantra", "Atlético Leon"]],
      5: [["Wildboys 78", "FC Disoneste"], ["Riverfilo", "Atlético Leon"], ["Eintracht Franco 126", "Pokermantra"], ["Golden Knights", "Fantaugusta"]],
      6: [["FC Disoneste", "Golden Knights"], ["Fantaugusta", "Eintracht Franco 126"], ["Riverfilo", "Pokermantra"], ["Atlético Leon", "Wildboys 78"]],
      7: [["Wildboys 78", "Riverfilo"], ["Eintracht Franco 126", "FC Disoneste"], ["Golden Knights", "Atlético Leon"], ["Pokermantra", "Fantaugusta"]],
      8: [["Riverfilo", "FC Disoneste"], ["Eintracht Franco 126", "Wildboys 78"], ["Atlético Leon", "Fantaugusta"], ["Pokermantra", "Golden Knights"]],
      9: [["FC Disoneste", "Eintracht Franco 126"], ["Fantaugusta", "Pokermantra"], ["Wildboys 78", "Atlético Leon"], ["Golden Knights", "Riverfilo"]],
      10: [["Riverfilo", "Wildboys 78"], ["Atlético Leon", "Golden Knights"], ["Pokermantra", "Eintracht Franco 126"], ["Fantaugusta", "FC Disoneste"]],
      11: [["Atlético Leon", "Riverfilo"], ["Wildboys 78", "Golden Knights"], ["Eintracht Franco 126", "Fantaugusta"], ["FC Disoneste", "Pokermantra"]],
      12: [["Fantaugusta", "Riverfilo"], ["FC Disoneste", "Atlético Leon"], ["Golden Knights", "Eintracht Franco 126"], ["Pokermantra", "Wildboys 78"]],
      13: [["Wildboys 78", "Fantaugusta"], ["Riverfilo", "Eintracht Franco 126"], ["Atlético Leon", "Pokermantra"], ["Golden Knights", "FC Disoneste"]],
      14: [["FC Disoneste", "Wildboys 78"], ["Fantaugusta", "Golden Knights"], ["Eintracht Franco 126", "Atlético Leon"], ["Pokermantra", "Riverfilo"]]
    }
  }
};

function normalizeTeamName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function findTeam(teamName) {
  const normalized = normalizeTeamName(teamName);
  return squadreBase.find(team => normalizeTeamName(team.nome) === normalized);
}

function canonicalTeamName(teamName) {
  return findTeam(teamName)?.nome || String(teamName || "Squadra").trim();
}

function findTeamLogo(teamName) {
  return findTeam(teamName)?.logo || "icon-192.png";
}

function findTeamShirt(teamName) {
  return findTeam(teamName)?.shirt || "img/maglie/default-shirt.png";
}

function findTeamCoach(teamName) {
  return findTeam(teamName)?.coach || "Coach";
}

function formatRole(role) {
  return role === "admin" ? "Admin" : "Coach";
}

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "–";
  return Number.isInteger(number) ? String(number) : number.toFixed(1).replace(".", ",");
}

function pointsToGoals(points) {
  const value = parseNumber(points);
  if (value < GOAL_BASE) return 0;
  return 1 + Math.floor((value - GOAL_BASE) / GOAL_STEP);
}

function rowResult(row) {
  const explicit = String(row?.Result || "").trim().toUpperCase();
  if (["V", "N", "P"].includes(explicit)) return explicit;
  const goalsFor = pointsToGoals(row?.PointsFor);
  const goalsAgainst = pointsToGoals(row?.PointsAgainst);
  if (goalsFor > goalsAgainst) return "V";
  if (goalsFor < goalsAgainst) return "P";
  return "N";
}

function isCompletedRow(row) {
  const explicit = String(row?.Result || "").trim().toUpperCase();
  if (["V", "N", "P"].includes(explicit)) return true;
  return !(parseNumber(row?.PointsFor) === 0 && parseNumber(row?.PointsAgainst) === 0);
}

function conferenceCodeFromLabel(label) {
  const value = String(label || "").toLowerCase();
  if (value.includes("championship") || value === "conf b") return "Conf B";
  if (value.includes("unificata") || value.includes("round robin")) return "Unificata";
  return "Conf A";
}

function conferenceLabel(code) {
  if (code === "Conf B") return "Conference Championship";
  if (code === "Unificata") return "Round Robin";
  return "Conference League";
}

function completedRowsFor(rows, conferenceCode) {
  const seen = new Set();
  return rows
    .filter(row => String(row.Conference || "").trim() === conferenceCode && isCompletedRow(row))
    .filter(row => {
      const key = `${conferenceCode}|${Number(row.GW) || 0}|${normalizeTeamName(row.Team)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function buildStandings(rows) {
  const table = new Map();
  rows.forEach(row => {
    const name = canonicalTeamName(row.Team);
    const key = normalizeTeamName(name);
    if (!key) return;
    if (!table.has(key)) {
      table.set(key, { squadra: name, g: 0, v: 0, n: 0, p: 0, pt: 0, mp: 0, gf: 0, gs: 0 });
    }
    const record = table.get(key);
    const result = rowResult(row);
    const gf = pointsToGoals(row.PointsFor);
    const gs = pointsToGoals(row.PointsAgainst);
    record.g += 1;
    record.mp += parseNumber(row.PointsFor);
    record.gf += gf;
    record.gs += gs;
    if (result === "V") { record.v += 1; record.pt += 3; }
    else if (result === "N") { record.n += 1; record.pt += 1; }
    else record.p += 1;
  });
  return [...table.values()].sort((a, b) =>
    b.pt - a.pt || b.mp - a.mp || b.gf - a.gf || a.gs - b.gs || a.squadra.localeCompare(b.squadra)
  );
}

function uniqueFixturesFromRows(rows, conferenceCode, gw) {
  const seen = new Set();
  const fixtures = [];
  rows
    .filter(row => String(row.Conference || "").trim() === conferenceCode && Number(row.GW) === Number(gw))
    .forEach(row => {
      const home = canonicalTeamName(row.Team);
      const away = canonicalTeamName(row.Opponent);
      if (!home || !away) return;
      const pairKey = [normalizeTeamName(home), normalizeTeamName(away)].sort().join("|");
      if (seen.has(pairKey)) return;
      seen.add(pairKey);
      fixtures.push({ home, away });
    });
  return fixtures;
}

function fallbackFixtures(conferenceCode, gw) {
  return (FALLBACK_FIXTURES[conferenceCode]?.rounds?.[gw] || [])
    .map(([home, away]) => ({ home, away }));
}

function nextRoundForConference(rows, conferenceCode) {
  const completedGws = completedRowsFor(rows, conferenceCode).map(row => Number(row.GW) || 0);
  const lastCompletedGw = completedGws.length ? Math.max(...completedGws) : 0;
  const futureFromRows = [...new Set(rows
    .filter(row => String(row.Conference || "").trim() === conferenceCode && !isCompletedRow(row))
    .map(row => Number(row.GW) || 0)
    .filter(gw => gw > lastCompletedGw))]
    .sort((a, b) => a - b);
  if (futureFromRows.length) return futureFromRows[0];
  const fallbackGws = Object.keys(FALLBACK_FIXTURES[conferenceCode]?.rounds || {})
    .map(Number)
    .filter(gw => gw > lastCompletedGw)
    .sort((a, b) => a - b);
  return fallbackGws[0] || null;
}

function fixturesForRound(rows, conferenceCode, gw) {
  if (!gw) return [];
  const liveFixtures = uniqueFixturesFromRows(rows, conferenceCode, gw);
  return liveFixtures.length ? liveFixtures : fallbackFixtures(conferenceCode, gw);
}

function findTeamFixture(fixtures, teamName) {
  const teamKey = normalizeTeamName(teamName);
  return fixtures.find(fixture =>
    normalizeTeamName(fixture.home) === teamKey || normalizeTeamName(fixture.away) === teamKey
  );
}

function activeCompetitionCode(rows) {
  const phase = String(activeLeaguePhase || "").trim().toLowerCase();
  const roundRobinIsActive = phase === "round_robin" || phase === "round robin";
  const roundRobinHasStarted = rows.some(row =>
    String(row.Conference || "").trim() === "Unificata" && isCompletedRow(row)
  );
  return roundRobinIsActive || roundRobinHasStarted ? "Unificata" : null;
}

async function loadDashboardTeam() {
  const logoEl = document.getElementById("dashboard-team-logo");
  const bgLogoEl = document.getElementById("dashboard-team-bg-logo");
  const shirtEl = document.getElementById("dashboard-team-shirt");
  const nameEl = document.getElementById("dashboard-team-name");
  const coachEl = document.getElementById("dashboard-team-coach");
  const conferenceEl = document.getElementById("dashboard-team-conference");
  const roleEl = document.getElementById("dashboard-user-role");
  if (!logoEl || !nameEl || !conferenceEl || !roleEl) return null;
  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      nameEl.textContent = "Lega degli Eroi";
      coachEl.textContent = "Guest";
      conferenceEl.textContent = "Accedi per vedere la tua squadra";
      roleEl.textContent = "Guest";
      return null;
    }
    const { data: profile, error: profileError } = await supabase
      .from("profiles").select("team_id, role").eq("id", userData.user.id).single();
    if (profileError || !profile?.team_id) throw profileError || new Error("Profilo senza squadra");
    scheduleHomeActionBadgesRefresh(profile.team_id);
    const { data: team, error: teamError } = await supabase
      .from("teams").select("id, name, conference").eq("id", profile.team_id).single();
    if (teamError || !team) throw teamError || new Error("Squadra non trovata");
    const teamName = canonicalTeamName(team.name);
    const teamLogo = findTeamLogo(teamName);
    nameEl.textContent = teamName;
    coachEl.textContent = findTeamCoach(teamName);
    conferenceEl.textContent = team.conference || "Conference";
    roleEl.textContent = formatRole(profile.role);
    logoEl.src = teamLogo;
    logoEl.alt = `Logo ${teamName}`;
    if (bgLogoEl) bgLogoEl.src = teamLogo;
    if (shirtEl) { shirtEl.src = findTeamShirt(teamName); shirtEl.alt = `Mascotte ${teamName}`; }
    return { teamId: profile.team_id, role: profile.role, team: { ...team, name: teamName } };
  } catch (error) {
    console.error("Errore dashboard home:", error);
    nameEl.textContent = "Lega degli Eroi";
    coachEl.textContent = "Coach";
    conferenceEl.textContent = "Dashboard ufficiale";
    roleEl.textContent = "Coach";
    return null;
  }
}

function renderTeamStatsAndForm(context, rows) {
  if (!context?.team) return;
  const competitionCode = activeCompetitionCode(rows) || conferenceCodeFromLabel(context.team.conference);
  const standings = buildStandings(completedRowsFor(rows, competitionCode));
  const teamIndex = standings.findIndex(row => normalizeTeamName(row.squadra) === normalizeTeamName(context.team.name));
  const teamStanding = teamIndex >= 0 ? standings[teamIndex] : null;
  const positionEl = document.getElementById("dashboard-team-position");
  if (positionEl) positionEl.textContent = teamStanding ? `${teamIndex + 1}° posto · ${teamStanding.pt} pt` : "Classifica in attesa";

  const teamRows = rows
    .filter(isCompletedRow)
    .filter(row => normalizeTeamName(row.Team) === normalizeTeamName(context.team.name))
    .sort((a, b) => (Number(a.GW_Stagionale) || Number(a.GW) || 0) - (Number(b.GW_Stagionale) || Number(b.GW) || 0));
  const lastResults = teamRows.slice(-4).map(rowResult);
  const padded = [...Array(Math.max(0, 4 - lastResults.length)).fill("–"), ...lastResults];
  const formEl = document.getElementById("dashboard-form-dots");
  if (formEl) {
    formEl.innerHTML = "";
    padded.forEach(result => {
      const dot = document.createElement("span");
      dot.className = `form-dot ${result === "V" ? "win" : result === "P" ? "loss" : result === "N" ? "draw" : "neutral"}`;
      dot.textContent = result;
      formEl.appendChild(dot);
    });
  }
}

function renderNextMatch(context, rows) {
  if (!context?.team) return;
  const competitionCode = activeCompetitionCode(rows) || conferenceCodeFromLabel(context.team.conference);
  const nextGw = nextRoundForConference(rows, competitionCode);
  const fixture = findTeamFixture(fixturesForRound(rows, competitionCode, nextGw), context.team.name);
  const gwEl = document.getElementById("dashboard-next-gw");
  const homeLogo = document.getElementById("dashboard-next-home-logo");
  const awayLogo = document.getElementById("dashboard-next-away-logo");
  const homeName = document.getElementById("dashboard-next-home-name");
  const awayName = document.getElementById("dashboard-next-away-name");
  const metaEl = document.getElementById("dashboard-next-meta");
  if (!fixture) {
    if (gwEl) gwEl.textContent = "CALENDARIO";
    if (homeName) homeName.textContent = context.team.name;
    if (awayName) awayName.textContent = "In aggiornamento";
    if (homeLogo) homeLogo.src = findTeamLogo(context.team.name);
    if (awayLogo) awayLogo.src = "icon-192.png";
    if (metaEl) metaEl.textContent = `${conferenceLabel(competitionCode)} · Prossimo turno da definire`;
    return;
  }
  if (gwEl) gwEl.textContent = `GIORNATA ${nextGw}`;
  if (homeName) homeName.textContent = fixture.home;
  if (awayName) awayName.textContent = fixture.away;
  if (homeLogo) { homeLogo.src = findTeamLogo(fixture.home); homeLogo.alt = fixture.home; }
  if (awayLogo) { awayLogo.src = findTeamLogo(fixture.away); awayLogo.alt = fixture.away; }
  if (metaEl) metaEl.textContent = `${conferenceLabel(competitionCode)} · Giornata ${nextGw}`;
}

function matchupScore(fixture, standings) {
  const count = Math.max(standings.length, 8);
  const position = new Map(standings.map((row, index) => [normalizeTeamName(row.squadra), index + 1]));
  const points = new Map(standings.map(row => [normalizeTeamName(row.squadra), row.pt]));
  const rankA = position.get(normalizeTeamName(fixture.home)) || count;
  const rankB = position.get(normalizeTeamName(fixture.away)) || count;
  const ptsA = points.get(normalizeTeamName(fixture.home)) || 0;
  const ptsB = points.get(normalizeTeamName(fixture.away)) || 0;
  const level = (count + 1 - rankA) + (count + 1 - rankB);
  const balance = count - Math.abs(rankA - rankB);
  const pointsBalance = Math.max(0, 8 - Math.abs(ptsA - ptsB));
  const playoffBonus = rankA <= 5 && rankB <= 5 ? 10 : 0;
  return level * 4 + balance * 3 + pointsBalance * 2 + playoffBonus;
}

function selectFeaturedFixture(fixtures, standings) {
  return [...fixtures].sort((a, b) => matchupScore(b, standings) - matchupScore(a, standings))[0] || null;
}

function renderMatchups(rows) {
  const container = document.getElementById("dashboard-matchups");
  if (!container) return;
  const activeCode = activeCompetitionCode(rows);
  const conferenceCodes = activeCode ? ["Unificata"] : ["Conf A", "Conf B"];
  const cards = conferenceCodes.map(code => {
    const nextGw = nextRoundForConference(rows, code);
    const standings = buildStandings(completedRowsFor(rows, code));
    const fixture = selectFeaturedFixture(fixturesForRound(rows, code, nextGw), standings);
    if (!fixture) return "";
    const positionMap = new Map(standings.map((row, index) => [normalizeTeamName(row.squadra), index + 1]));
    const homePosition = positionMap.get(normalizeTeamName(fixture.home));
    const awayPosition = positionMap.get(normalizeTeamName(fixture.away));
    const rankText = homePosition && awayPosition ? `${homePosition}° contro ${awayPosition}°` : "Sfida da non perdere";
    return `
      <article class="league-matchup-card">
        <div class="league-matchup-label">${conferenceLabel(code)} · Giornata ${nextGw}</div>
        <div class="league-matchup-versus">
          <div><img src="${findTeamLogo(fixture.home)}" alt=""><strong>${escapeHtml(fixture.home)}</strong></div>
          <span>VS</span>
          <div><img src="${findTeamLogo(fixture.away)}" alt=""><strong>${escapeHtml(fixture.away)}</strong></div>
        </div>
        <small>${rankText}</small>
      </article>`;
  }).filter(Boolean);
  container.innerHTML = cards.length ? cards.join("") : '<article class="league-matchup-card loading-card">Calendario matchup in aggiornamento</article>';
}

function renderRecord(rows) {
  const valueEl = document.getElementById("dashboard-record-value");
  const teamEl = document.getElementById("dashboard-record-team");
  if (!valueEl || !teamEl) return;
  const activeCode = activeCompetitionCode(rows);
  const relevantRows = rows
    .filter(isCompletedRow)
    .filter(row => activeCode ? String(row.Conference || "").trim() === activeCode : ["Conf A", "Conf B"].includes(String(row.Conference || "").trim()));
  const byTeam = new Map();
  relevantRows.forEach(row => {
    const team = canonicalTeamName(row.Team);
    const key = normalizeTeamName(team);
    if (!byTeam.has(key)) byTeam.set(key, { team, rows: [] });
    byTeam.get(key).rows.push(row);
  });
  let best = { team: "", streak: 0, mp: 0 };
  byTeam.forEach(entry => {
    entry.rows.sort((a, b) => (Number(a.GW_Stagionale) || Number(a.GW) || 0) - (Number(b.GW_Stagionale) || Number(b.GW) || 0));
    let streak = 0;
    for (let index = entry.rows.length - 1; index >= 0; index--) {
      if (rowResult(entry.rows[index]) !== "V") break;
      streak += 1;
    }
    const mp = entry.rows.reduce((sum, row) => sum + parseNumber(row.PointsFor), 0);
    if (streak > best.streak || (streak === best.streak && mp > best.mp)) best = { team: entry.team, streak, mp };
  });
  if (best.streak >= 2) {
    valueEl.textContent = `${best.streak} vittorie di fila`;
    teamEl.textContent = best.team;
    return;
  }
  let topPerformance = { team: "", points: 0 };
  relevantRows.forEach(row => {
    const points = parseNumber(row.PointsFor);
    if (points > topPerformance.points) topPerformance = { team: canonicalTeamName(row.Team), points };
  });
  valueEl.textContent = topPerformance.points ? `${formatNumber(topPerformance.points)} punti` : "In attesa";
  teamEl.textContent = topPerformance.team || "Primi risultati stagionali";
}

let waiverDeadline = null;
let waiverDeadlineLabel = "";
let activeLeaguePhase = "";

function renderWaiverCountdown() {
  const valueEl = document.getElementById("dashboard-waiver-countdown");
  const noteEl = document.getElementById("dashboard-waiver-note");
  if (!valueEl || !noteEl) return;
  if (!waiverDeadline) {
    valueEl.textContent = "Chiuso";
    noteEl.textContent = "Prossimo turno da programmare";
    return;
  }
  const remaining = waiverDeadline.getTime() - Date.now();
  if (remaining <= 0) { waiverDeadline = null; renderWaiverCountdown(); return; }
  const totalMinutes = Math.floor(remaining / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  valueEl.textContent = days > 0 ? `${days}g ${String(hours).padStart(2, "0")}h` : hours > 0 ? `${hours}h ${String(minutes).padStart(2, "0")}m` : `${Math.max(minutes, 1)}m`;
  noteEl.textContent = `${waiverDeadlineLabel} · alla chiusura`;
}

async function loadWaiverCountdown() {
  try {
    const { data, error } = await supabase
      .from("waiver_settings")
      .select("active_phase, slot1_close_at, slot1s_close_at, slot2_close_at, slot2s_close_at, compensatory_close_at")
      .order("id", { ascending: false }).limit(1);
    if (error) throw error;
    const settings = data?.[0];
    activeLeaguePhase = settings?.active_phase || "";
    const deadlines = [
      ["Slot 1", settings?.slot1_close_at], ["Slot 1S", settings?.slot1s_close_at],
      ["Slot 2", settings?.slot2_close_at], ["Slot 2S", settings?.slot2s_close_at],
      ["Compensative", settings?.compensatory_close_at]
    ]
      .map(([label, value]) => ({ label, date: value ? new Date(value) : null }))
      .filter(item => item.date && !Number.isNaN(item.date.getTime()) && item.date.getTime() > Date.now())
      .sort((a, b) => a.date - b.date);
    waiverDeadline = deadlines[0]?.date || null;
    waiverDeadlineLabel = deadlines[0]?.label || "";
  } catch (error) {
    console.warn("Countdown waiver non disponibile:", error);
  }
  renderWaiverCountdown();
}

async function loadLatestTrade() {
  const valueEl = document.getElementById("dashboard-latest-trade");
  const noteEl = document.getElementById("dashboard-latest-trade-note");
  if (!valueEl || !noteEl) return;
  try {
    const [{ data: trades, error: tradeError }, { data: teams, error: teamsError }] = await Promise.all([
      supabase.from("trade_proposals").select("id, from_team, to_team, accepted_at, created_at").eq("status", "accepted").order("accepted_at", { ascending: false }).limit(1),
      supabase.from("teams").select("id, name")
    ]);
    if (tradeError) throw tradeError;
    if (teamsError) throw teamsError;
    const trade = trades?.[0];
    if (!trade) {
      valueEl.textContent = "Nessuna trade completata";
      noteEl.textContent = "Lo storico apparirà qui";
      return;
    }
    const teamMap = new Map((teams || []).map(team => [String(team.id), canonicalTeamName(team.name)]));
    valueEl.textContent = `${teamMap.get(String(trade.from_team)) || "Squadra A"} ↔ ${teamMap.get(String(trade.to_team)) || "Squadra B"}`;
    const { data: assets } = await supabase.from("trade_assets").select("asset_label").eq("proposal_id", trade.id).limit(2);
    noteEl.textContent = assets?.length ? assets.map(asset => asset.asset_label).filter(Boolean).join(" · ") : "Scambio completato";
  } catch (error) {
    console.warn("Ultima trade non disponibile:", error);
    valueEl.textContent = "Trade in aggiornamento";
    noteEl.textContent = "Apri lo storico completo";
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

let currentDashboardTeamId = null;

async function countRows(tableName, filters) {
  let query = supabase.from(tableName).select("id", { count: "exact", head: true });
  filters.forEach(filter => { query = query.eq(filter.column, filter.value); });
  const { count, error } = await query;
  if (error) { console.warn(`Errore conteggio ${tableName}:`, error); return 0; }
  return count || 0;
}

function ensureBadge(target, count, label) {
  if (!target) return;
  target.classList.add("app-alert-anchor");
  let badge = target.querySelector(":scope > .app-alert-badge");
  if (!badge) { badge = document.createElement("span"); badge.className = "app-alert-badge"; target.appendChild(badge); }
  if (count > 0) {
    badge.textContent = count > 9 ? "9+" : String(count);
    badge.setAttribute("aria-label", label || `${count} avvisi`);
    target.classList.add("has-app-alert");
  } else {
    badge.textContent = "";
    badge.removeAttribute("aria-label");
    target.classList.remove("has-app-alert");
  }
}

function findDraftMenuLink() {
  return [...document.querySelectorAll("#mainMenu .toggle-submenu")]
    .find(link => String(link.textContent || "").toLowerCase().includes("draft"));
}

function updateBadgeTargets({ tradeCount, rfaCount }) {
  ensureBadge(document.querySelector(".quick-trade"), tradeCount, `${tradeCount} proposta/e trade da valutare`);
  ensureBadge(document.getElementById("quick-draft-link"), rfaCount, `${rfaCount} decisione/i RFA da prendere`);
  ensureBadge(document.getElementById("trade-badge"), tradeCount, `${tradeCount} proposta/e trade da valutare`);
  document.querySelectorAll('.mobile-bottom-link[href="trade-room.html"]').forEach(el => ensureBadge(el, tradeCount, `${tradeCount} proposta/e trade da valutare`));
  document.querySelectorAll('.mobile-more-grid a[href="trade-room.html"]').forEach(el => ensureBadge(el, tradeCount, `${tradeCount} proposta/e trade da valutare`));
  ensureBadge(findDraftMenuLink(), rfaCount, `${rfaCount} decisione/i RFA da prendere`);
  ensureBadge(document.getElementById("mobile-more-btn"), rfaCount, `${rfaCount} decisione/i RFA da prendere`);
}

async function updateHomeActionBadges(teamId) {
  if (!teamId) return;
  try {
    const [tradeCount, rfaCount] = await Promise.all([
      countRows("trade_proposals", [{ column: "to_team", value: teamId }, { column: "status", value: "pending" }]),
      countRows("rfa_draft_claims", [{ column: "original_team_id", value: teamId }, { column: "status", value: "pending" }])
    ]);
    updateBadgeTargets({ tradeCount, rfaCount });
  } catch (error) { console.warn("Errore aggiornamento badge home:", error); }
}

function scheduleHomeActionBadgesRefresh(teamId) {
  currentDashboardTeamId = teamId;
  updateHomeActionBadges(teamId);
  setTimeout(() => updateHomeActionBadges(teamId), 350);
  setTimeout(() => updateHomeActionBadges(teamId), 1200);
  window.addEventListener("focus", () => updateHomeActionBadges(teamId));
  document.addEventListener("visibilitychange", () => { if (!document.hidden) updateHomeActionBadges(teamId); });
}

async function initHomeDashboard() {
  const context = await loadDashboardTeam();
  const [rowsResult] = await Promise.allSettled([loadResultsRows(), loadWaiverCountdown(), loadLatestTrade()]);
  const rows = rowsResult.status === "fulfilled" && Array.isArray(rowsResult.value) ? rowsResult.value : [];
  if (rowsResult.status === "rejected") console.warn("Risultati home non disponibili:", rowsResult.reason);
  renderTeamStatsAndForm(context, rows);
  renderNextMatch(context, rows);
  renderMatchups(rows);
  renderRecord(rows);
  window.setInterval(renderWaiverCountdown, 60000);
}

document.addEventListener("DOMContentLoaded", initHomeDashboard);
