import { supabase } from "./supabase.js";
import { loadResultsRows } from "./results-source.js";

const GOAL_BASE = 66;
const GOAL_STEP = 6;

const squadreBase = [
  { nome: "Atlético Leon", logo: "img/Atlético Leon.webp", shirt: "img/maglie/leon-mascotte.webp", mascotWin: "img/maglie/leon-mascotte-win.webp", mascotDraw: "img/maglie/leon-mascotte-draw.webp", mascotLoss: "img/maglie/leon-mascotte-loss.webp", coach: "Coach Leo e Anthony" },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.webp", shirt: "img/maglie/bayern-mascotte.webp", mascotWin: "img/maglie/bayern-mascotte-win.webp", mascotDraw: "img/maglie/bayern-mascotte-draw.webp", mascotLoss: "img/maglie/bayern-mascotte-loss.webp", coach: "Coach Christian" },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.webp", shirt: "img/maglie/bartowski-mascotte.webp", mascotWin: "img/maglie/bartowski-mascotte-win.webp", mascotDraw: "img/maglie/bartowski-mascotte-draw.webp", mascotLoss: "img/maglie/bartowski-mascotte-loss.webp", coach: "Coach Marco" },
  { nome: "Golden Knights", logo: "img/Golden Knights.webp", shirt: "img/maglie/golden-mascotte.webp", mascotWin: "img/maglie/golden-mascotte-win.webp", mascotDraw: "img/maglie/golden-mascotte-draw.webp", mascotLoss: "img/maglie/golden-mascotte-loss.webp", coach: "Coach Mimmo&Francesco" },
  { nome: "Ibla", logo: "img/Ibla.webp", shirt: "img/maglie/ibla-mascotte.webp", mascotWin: "img/maglie/ibla-mascotte-win.webp", mascotDraw: "img/maglie/ibla-mascotte-draw.webp", mascotLoss: "img/maglie/ibla-mascotte-loss.webp", coach: "Coach Francesco" },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.webp", shirt: "img/maglie/fantaugusta-mascotte.webp", mascotWin: "img/maglie/fantaugusta-mascotte-win.webp", mascotDraw: "img/maglie/fantaugusta-mascotte-draw.webp", mascotLoss: "img/maglie/fantaugusta-mascotte-loss.webp", coach: "Coach Giancarlo" },
  { nome: "Riverfilo", logo: "img/Riverfilo.webp", shirt: "img/maglie/riverfilo-mascotte.webp", mascotWin: "img/maglie/riverfilo-mascotte-win.webp", mascotDraw: "img/maglie/riverfilo-mascotte-draw.webp", mascotLoss: "img/maglie/riverfilo-mascotte-loss.webp", coach: "Coach Federico" },
  { nome: "Desperados", logo: "img/Desperados.webp", shirt: "img/maglie/desperados-mascotte.webp", mascotWin: "img/maglie/desperados-mascotte-win.webp", mascotDraw: "img/maglie/desperados-mascotte-draw.webp", mascotLoss: "img/maglie/desperados-mascotte-loss.webp", coach: "Coach Stefano" },
  { nome: "Wildboys 78", logo: "img/wildboys78.webp", shirt: "img/maglie/wildboys-mascotte.webp", mascotWin: "img/maglie/wildboys-mascotte-win.webp", mascotDraw: "img/maglie/wildboys-mascotte-draw.webp", mascotLoss: "img/maglie/wildboys-mascotte-loss.webp", coach: "Coach Francesco" },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.webp", shirt: "img/maglie/pandini-mascotte.webp", mascotWin: "img/maglie/pandini-mascotte-win.webp", mascotDraw: "img/maglie/pandini-mascotte-draw.webp", mascotLoss: "img/maglie/pandini-mascotte-loss.webp", coach: "Coach Davide" },
  { nome: "Pokermantra", logo: "img/PokerMantra.webp", shirt: "img/maglie/pokermantra-mascotte.webp", mascotWin: "img/maglie/pokermantra-mascotte-win.webp", mascotDraw: "img/maglie/pokermantra-mascotte-draw.webp", mascotLoss: "img/maglie/pokermantra-mascotte-loss.webp", coach: "Coach Omar" },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.webp", shirt: "img/maglie/minnesode-mascotte.webp", mascotWin: "img/maglie/minnesode-mascotte-win.webp", mascotDraw: "img/maglie/minnesode-mascotte-draw.webp", mascotLoss: "img/maglie/minnesode-mascotte-loss.webp", coach: "Coach Pierpaolo&Leandro" },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.webp", shirt: "img/maglie/snakes-mascotte.webp", mascotWin: "img/maglie/snakes-mascotte-win.webp", mascotDraw: "img/maglie/snakes-mascotte-draw.webp", mascotLoss: "img/maglie/snakes-mascotte-loss.webp", coach: "Coach Alberto" },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.webp", shirt: "img/maglie/franco-mascotte.webp", mascotWin: "img/maglie/franco-mascotte-win.webp", mascotDraw: "img/maglie/franco-mascotte-draw.webp", mascotLoss: "img/maglie/franco-mascotte-loss.webp", coach: "Coach Lorenzo" },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.webp", shirt: "img/maglie/disoneste-mascotte.webp", mascotWin: "img/maglie/disoneste-mascotte-win.webp", mascotDraw: "img/maglie/disoneste-mascotte-draw.webp", mascotLoss: "img/maglie/disoneste-mascotte-loss.webp", coach: "Coach Basilio" },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.webp", shirt: "img/maglie/pongao-mascotte.webp", mascotWin: "img/maglie/pongao-mascotte-win.webp", mascotDraw: "img/maglie/pongao-mascotte-draw.webp", mascotLoss: "img/maglie/pongao-mascotte-loss.webp", coach: "Coach Dario&Giorgio" }
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

function findTeamResultMascot(teamName, state) {
  const team = findTeam(teamName);
  if (!team) return "img/maglie/default-shirt.png";
  if (state === "win") return team.mascotWin || team.shirt;
  if (state === "draw") return team.mascotDraw || team.shirt;
  if (state === "loss") return team.mascotLoss || team.shirt;
  return team.shirt;
}

function previousMascotState(slide, side) {
  const result = String(slide?.result || "").toUpperCase();
  if (result === "N") return "draw";
  if (side === "home") return result === "V" ? "win" : "loss";
  return result === "V" ? "loss" : "win";
}

function matchCarouselTeamVisual(slide, teamName, side) {
  if (slide.kind === "current") {
    return {
      src: findTeamLogo(teamName),
      fallback: "icon-192.png",
      className: "is-logo",
      altPrefix: "Logo"
    };
  }

  if (slide.kind === "next") {
    return {
      src: findTeamShirt(teamName),
      fallback: "img/maglie/default-shirt.png",
      className: "is-mascot is-standard-mascot",
      altPrefix: "Mascotte"
    };
  }

  const mascotState = previousMascotState(slide, side);
  return {
    src: findTeamResultMascot(teamName, mascotState),
    fallback: findTeamShirt(teamName),
    className: `is-mascot is-result-mascot is-${mascotState}`,
    altPrefix: "Mascotte"
  };
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

function fixtureForTeamAndRound(rows, conferenceCode, gw, teamName) {
  if (!gw) return null;
  const liveFixture = findTeamFixture(uniqueFixturesFromRows(rows, conferenceCode, gw), teamName);
  if (liveFixture) return liveFixture;
  return findTeamFixture(fallbackFixtures(conferenceCode, gw), teamName) || null;
}

function completedMatchForTeamAndRound(rows, conferenceCode, gw, teamName) {
  if (!gw) return null;
  const teamKey = normalizeTeamName(teamName);
  const row = rows.find(item =>
    String(item.Conference || "").trim() === conferenceCode &&
    Number(item.GW) === Number(gw) &&
    normalizeTeamName(item.Team) === teamKey &&
    isCompletedRow(item)
  );
  if (!row) return null;

  return {
    gw: Number(row.GW) || Number(gw),
    home: canonicalTeamName(row.Team),
    away: canonicalTeamName(row.Opponent),
    homeScore: parseNumber(row.PointsFor),
    awayScore: parseNumber(row.PointsAgainst),
    result: rowResult(row)
  };
}

function matchRankingText(fixture, standings) {
  if (!fixture) return "";
  const positionMap = new Map(standings.map((row, index) => [normalizeTeamName(row.squadra), index + 1]));
  const homePosition = positionMap.get(normalizeTeamName(fixture.home));
  const awayPosition = positionMap.get(normalizeTeamName(fixture.away));
  return homePosition && awayPosition ? `${homePosition}° vs ${awayPosition}°` : "";
}

function resultLabel(result) {
  if (result === "V") return "Vittoria";
  if (result === "P") return "Sconfitta";
  if (result === "N") return "Pareggio";
  return "Finale";
}

function matchCenterUrl(slide, competitionCode) {
  const params = new URLSearchParams({
    home: slide.home,
    away: slide.away,
    gw: String(slide.gw),
    competition: competitionCode
  });
  return `match.html?${params.toString()}`;
}

function matchSlideMarkup(slide, competitionLabel, competitionCode) {
  const stateClass = slide.kind === "previous" ? "is-previous" : slide.kind === "next" ? "is-next" : "is-current";
  const statusLabel = slide.kind === "previous" ? "Precedente" : slide.kind === "next" ? "Successivo" : "Attuale";
  const middle = slide.completed
    ? `<div class="match-carousel-score"><strong>${pointsToGoals(slide.homeScore)}</strong><span>–</span><strong>${pointsToGoals(slide.awayScore)}</strong></div>`
    : `<div class="match-carousel-vs">VS</div>`;
  const footerRight = slide.completed ? resultLabel(slide.result) : (slide.ranking || "Match Preview");
  const cta = slide.completed ? "MATCH REPORT" : "MATCH PREVIEW";
  const homeVisual = matchCarouselTeamVisual(slide, slide.home, "home");
  const awayVisual = matchCarouselTeamVisual(slide, slide.away, "away");

  return `
    <article class="match-carousel-slide ${stateClass}" data-match-kind="${slide.kind}" data-gw="${slide.gw}">
      <div class="match-carousel-card">
        <img class="competition-cup-art competition-cup-art-league" src="${HOME_COMPETITION_CUPS.league}" alt="" aria-hidden="true">
        <div class="match-carousel-card-head">
          <span>${statusLabel}</span>
          <strong>GIORNATA ${slide.gw}</strong>
        </div>

        <div class="match-carousel-versus">
          <div class="match-carousel-team">
            <img class="${homeVisual.className}" src="${homeVisual.src}" data-fallback="${homeVisual.fallback}" alt="${homeVisual.altPrefix} ${escapeHtml(slide.home)}">
            <strong>${escapeHtml(slide.home)}</strong>
          </div>
          ${middle}
          <div class="match-carousel-team">
            <img class="${awayVisual.className}" src="${awayVisual.src}" data-fallback="${awayVisual.fallback}" alt="${awayVisual.altPrefix} ${escapeHtml(slide.away)}">
            <strong>${escapeHtml(slide.away)}</strong>
          </div>
        </div>

        <div class="match-carousel-meta">
          <span>${escapeHtml(competitionLabel)}</span>
          <strong>${escapeHtml(footerRight)}</strong>
        </div>

        <a class="match-carousel-cta" href="${matchCenterUrl(slide, competitionCode)}" aria-label="Apri ${cta}: ${escapeHtml(slide.home)} contro ${escapeHtml(slide.away)}">
          <span>${cta}</span><b>→</b>
        </a>
      </div>
    </article>`;
}

function setupMatchCarouselImageFallbacks() {
  document.querySelectorAll("#dashboard-match-track .match-carousel-team img[data-fallback]").forEach(image => {
    image.addEventListener("error", () => {
      const fallback = image.dataset.fallback;
      if (!fallback || image.dataset.fallbackApplied === "true") return;
      image.dataset.fallbackApplied = "true";
      image.src = fallback;
    }, { once: true });
  });
}

function setupMatchCarousel(initialIndex = 0) {
  const viewport = document.getElementById("dashboard-match-viewport");
  const slides = [...document.querySelectorAll("#dashboard-match-track .match-carousel-slide")];
  const prevButton = document.getElementById("dashboard-match-prev");
  const nextButton = document.getElementById("dashboard-match-next");
  const roundButtons = [...document.querySelectorAll("#dashboard-match-rounds .match-carousel-round")];
  const dots = [...document.querySelectorAll("#dashboard-match-dots .match-carousel-dot")];
  const stateEl = document.getElementById("dashboard-match-carousel-state");
  if (!viewport || !slides.length) return;

  let activeIndex = Math.max(0, Math.min(initialIndex, slides.length - 1));
  let scrollTimer = null;

  const updateUi = index => {
    activeIndex = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((slide, slideIndex) => slide.classList.toggle("is-active", slideIndex === activeIndex));
    roundButtons.forEach((button, buttonIndex) => {
      button.classList.toggle("is-active", buttonIndex === activeIndex);
      button.setAttribute("aria-current", buttonIndex === activeIndex ? "true" : "false");
    });
    dots.forEach((dot, dotIndex) => dot.classList.toggle("is-active", dotIndex === activeIndex));
    if (prevButton) prevButton.disabled = activeIndex === 0;
    if (nextButton) nextButton.disabled = activeIndex === slides.length - 1;
    if (stateEl) {
      const kind = slides[activeIndex]?.dataset.matchKind;
      stateEl.textContent = kind === "previous" ? "Ultimo risultato" : kind === "next" ? "Prossimo turno" : "Partita attuale";
    }
  };

  const goTo = (index, behavior = "smooth") => {
    const targetIndex = Math.max(0, Math.min(index, slides.length - 1));
    const target = slides[targetIndex];
    if (!target) return;
    viewport.scrollTo({ left: target.offsetLeft, behavior });
    updateUi(targetIndex);
  };

  prevButton?.addEventListener("click", () => goTo(activeIndex - 1));
  nextButton?.addEventListener("click", () => goTo(activeIndex + 1));
  roundButtons.forEach((button, index) => button.addEventListener("click", () => goTo(index)));

  viewport.addEventListener("scroll", () => {
    window.clearTimeout(scrollTimer);
    scrollTimer = window.setTimeout(() => {
      const closestIndex = slides.reduce((bestIndex, slide, index) => {
        const bestDistance = Math.abs(slides[bestIndex].offsetLeft - viewport.scrollLeft);
        const currentDistance = Math.abs(slide.offsetLeft - viewport.scrollLeft);
        return currentDistance < bestDistance ? index : bestIndex;
      }, 0);
      updateUi(closestIndex);
    }, 70);
  }, { passive: true });

  viewport.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") { event.preventDefault(); goTo(activeIndex - 1); }
    if (event.key === "ArrowRight") { event.preventDefault(); goTo(activeIndex + 1); }
  });

  window.addEventListener("resize", () => goTo(activeIndex, "auto"), { passive: true });
  requestAnimationFrame(() => goTo(activeIndex, "auto"));
}

function renderMatchCarousel(context, rows) {
  const track = document.getElementById("dashboard-match-track");
  const roundsEl = document.getElementById("dashboard-match-rounds");
  const dotsEl = document.getElementById("dashboard-match-dots");
  if (!track || !roundsEl || !dotsEl || !context?.team) return;

  const competitionCode = activeCompetitionCode(rows) || conferenceCodeFromLabel(context.team.conference);
  const competitionLabel = conferenceLabel(competitionCode);
  const standings = buildStandings(completedRowsFor(rows, competitionCode));
  const currentGw = nextRoundForConference(rows, competitionCode);

  const completedTeamRows = completedRowsFor(rows, competitionCode)
    .filter(row => normalizeTeamName(row.Team) === normalizeTeamName(context.team.name))
    .sort((a, b) => (Number(a.GW_Stagionale) || Number(a.GW) || 0) - (Number(b.GW_Stagionale) || Number(b.GW) || 0));

  const previousGw = completedTeamRows.length ? Number(completedTeamRows[completedTeamRows.length - 1].GW) : null;
  const previousMatch = completedMatchForTeamAndRound(rows, competitionCode, previousGw, context.team.name);
  const currentFixture = fixtureForTeamAndRound(rows, competitionCode, currentGw, context.team.name);
  const nextGw = currentGw ? currentGw + 1 : null;
  const nextFixture = fixtureForTeamAndRound(rows, competitionCode, nextGw, context.team.name);

  const slides = [];
  if (previousMatch) {
    slides.push({
      kind: "previous",
      completed: true,
      ...previousMatch
    });
  }
  if (currentFixture && currentGw) {
    slides.push({
      kind: "current",
      completed: false,
      gw: currentGw,
      home: currentFixture.home,
      away: currentFixture.away,
      ranking: matchRankingText(currentFixture, standings)
    });
  }
  if (nextFixture && nextGw) {
    slides.push({
      kind: "next",
      completed: false,
      gw: nextGw,
      home: nextFixture.home,
      away: nextFixture.away,
      ranking: matchRankingText(nextFixture, standings)
    });
  }

  if (!slides.length) {
    track.innerHTML = `
      <article class="match-carousel-slide is-active">
        <div class="match-carousel-card match-carousel-empty">
          <strong>Calendario in aggiornamento</strong>
          <span>La prossima partita comparirà qui appena disponibile.</span>
        </div>
      </article>`;
    roundsEl.innerHTML = '<span class="match-carousel-round is-active">–</span>';
    dotsEl.innerHTML = '<span class="match-carousel-dot is-active"></span>';
    setupMatchCarousel(0);
    return;
  }

  track.innerHTML = slides.map(slide => matchSlideMarkup(slide, competitionLabel, competitionCode)).join("");
  setupMatchCarouselImageFallbacks();
  roundsEl.innerHTML = slides.map((slide, index) => `
    <button type="button" class="match-carousel-round" data-index="${index}" aria-label="Vai alla giornata ${slide.gw}">G${slide.gw}</button>`
  ).join("");
  dotsEl.innerHTML = slides.map(() => '<span class="match-carousel-dot"></span>').join("");

  const currentIndex = Math.max(0, slides.findIndex(slide => slide.kind === "current"));
  setupMatchCarousel(currentIndex);
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
    const matchHref = matchCenterUrl({
      home: fixture.home,
      away: fixture.away,
      gw: nextGw
    }, code);

    return `
      <article
        class="league-matchup-card weekly-broadcast-card is-match-center-link"
        role="link"
        tabindex="0"
        data-match-href="${matchHref}"
        aria-label="Apri Match Center: ${escapeHtml(fixture.home)} contro ${escapeHtml(fixture.away)}, giornata ${nextGw}"
        style="cursor:pointer"
      >
        <div class="league-matchup-label">
          <span>${conferenceLabel(code)}</span>
          <b>G${nextGw}</b>
        </div>
        <div class="league-matchup-versus">
          <div class="weekly-broadcast-team weekly-home">
            <img src="${findTeamLogo(fixture.home)}" alt="">
            <strong>${escapeHtml(fixture.home)}</strong>
            <em>${homePosition ? `${homePosition}°` : "–"}</em>
          </div>
          <span class="weekly-broadcast-vs">VS</span>
          <div class="weekly-broadcast-team weekly-away">
            <img src="${findTeamLogo(fixture.away)}" alt="">
            <strong>${escapeHtml(fixture.away)}</strong>
            <em>${awayPosition ? `${awayPosition}°` : "–"}</em>
          </div>
        </div>
        <small>${rankText}</small>
      </article>`;
  }).filter(Boolean);

  container.innerHTML = cards.length
    ? cards.join("")
    : '<article class="league-matchup-card loading-card">Calendario matchup in aggiornamento</article>';

  container.querySelectorAll(".weekly-broadcast-card[data-match-href]").forEach(card => {
    const openMatchCenter = () => {
      const href = card.dataset.matchHref;
      if (href) window.location.href = href;
    };

    card.addEventListener("click", openMatchCenter);
    card.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openMatchCenter();
    });
  });
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


// =========================================================
// HOME · SWITCH COMPETIZIONI
// Campionato = carousel standard.
// Crash Out Cup = una sola sfida corrente. Rivalry prima,
// poi stessa tab con la serie playoff quando la prima fase termina.
// =========================================================
const HOME_CRASHOUT_SEASON = "2026";
const HOME_HIGHLANDER_SEASON = "2026";

// VISUALE CAMPIONATO AUTOMATICA:
// Conference + Round Robin -> look Campionato
// Playoff -> look Playoff
// Legge direttamente active_phase da waiver_settings.
function getHomeLeagueVisualPhase() {
  const phase = String(activeLeaguePhase || "").trim().toLowerCase();
  return phase === "playoff" ? "playoff" : "regular";
}

function applyHomeLeagueVisualPhase() {
  const shell = document.getElementById("dashboard-match-carousel");
  const leagueVisualPhase = getHomeLeagueVisualPhase();

  if (shell) {
    shell.classList.remove("league-visual-regular", "league-visual-playoff");
    shell.classList.add(`league-visual-${leagueVisualPhase}`);
  }

  document.body.classList.remove(
    "home-league-visual-regular",
    "home-league-visual-playoff"
  );
  document.body.classList.add(`home-league-visual-${leagueVisualPhase}`);
}

const HOME_COMPETITION_CUPS = {
  league: "img/cups/campionato-cup.webp",
  playoff: "img/cups/playoff-cup.webp",
  crashout: "img/cups/crashout-cup.webp",
  highlander: "img/cups/highlander-cup.webp"
};

const HOME_HIGHLANDER_MASCOTS = {
  atleticoleon: "img/maglie/rubinkebab-higlander.webp",
  bayernchristiansen: "img/maglie/bayern-higlander.webp",
  teambartowski: "img/maglie/bartowski-higlander.webp",
  goldenknights: "img/maglie/golden-higlander.webp",
  ibla: "img/maglie/ibla-higlander.webp",
  fantaugusta: "img/maglie/fantaugusta-higlander.webp",
  riverfilo: "img/maglie/riverfilo-higlander.webp",
  desperados: "img/maglie/desperados-higlander.webp",
  wildboys78: "img/maglie/wildboys-higlander.webp",
  pandinicoccolosini: "img/maglie/pandini-higlander.webp",
  pokermantra: "img/maglie/pokermantra-higlander.webp",
  minnesodetimberland: "img/maglie/minnesode-higlander.webp",
  minnesotasnakes: "img/maglie/minnesota-higlander.webp",
  eintrachtfranco126: "img/maglie/franco-higlander.webp",
  fcdisoneste: "img/maglie/disoneste-higlander.webp",
  athleticpongao: "img/maglie/pongao-higlander.webp"
};

function findHomeHighlanderMascot(teamName) {
  return HOME_HIGHLANDER_MASCOTS[normalizeTeamName(teamName)] || findTeamLogo(teamName);
}

function ensureHomeCompetitionCupArts() {
  const targets = [
    ["dashboard-crashout-card", "crashout", "Crash Out Cup"],
    ["dashboard-highlander-card", "highlander", "Highlander Cup"]
  ];

  targets.forEach(([cardId, type, label]) => {
    const card = document.getElementById(cardId);
    if (!card || card.querySelector(".competition-cup-art")) return;

    const img = document.createElement("img");
    img.className = `competition-cup-art competition-cup-art-${type}`;
    img.src = HOME_COMPETITION_CUPS[type];
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    img.decoding = "async";
    img.loading = "eager";
    card.prepend(img);
  });
}

function setupHomeMatchTabs() {
  ensureHomeCompetitionCupArts();
  const shell = document.getElementById("dashboard-match-carousel");

  // Primo render: regular finché non viene letto active_phase.
  // Dopo il caricamento settings viene aggiornato automaticamente.
  applyHomeLeagueVisualPhase();
  const tabs = [...document.querySelectorAll("#dashboard-match-tabs [data-match-tab]")];
  const panels = [...document.querySelectorAll("#dashboard-match-carousel [data-match-panel]")];
  const stateEl = document.getElementById("dashboard-match-carousel-state");
  if (!tabs.length || !panels.length) return;

  const activate = name => {
    tabs.forEach(tab => {
      const active = tab.dataset.matchTab === name;
      tab.classList.toggle("is-active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    panels.forEach(panel => {
      const active = panel.dataset.matchPanel === name;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });

    if (shell) {
      shell.classList.remove("theme-league", "theme-crashout", "theme-highlander");
      shell.classList.add(`theme-${name}`);
    }

    // Tema ambientale dell'intera Home.
    // Le card restano leggibili e coerenti, cambia l'atmosfera dietro l'app.
    document.body.classList.remove(
      "home-app-theme-league",
      "home-app-theme-crashout",
      "home-app-theme-highlander"
    );
    document.body.classList.add(`home-app-theme-${name}`);

    if (stateEl) {
      stateEl.textContent = name === "crashout"
        ? "Crash Out Cup"
        : name === "highlander"
          ? "Highlander Cup"
          : "Partita attuale";
    }
  };

  tabs.forEach(tab => tab.addEventListener("click", () => activate(tab.dataset.matchTab)));

  const crashoutCard = document.getElementById("dashboard-crashout-card");
  if (crashoutCard && !crashoutCard.dataset.cardLinkBound) {
    const openCompetition = event => {
      if (event.target.closest("a, button")) return;
      const href = crashoutCard.dataset.competitionHref;
      if (href) window.location.href = href;
    };

    crashoutCard.addEventListener("click", openCompetition);
    crashoutCard.addEventListener("keydown", event => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest("a, button")) return;
      event.preventDefault();
      const href = crashoutCard.dataset.competitionHref;
      if (href) window.location.href = href;
    });

    crashoutCard.dataset.cardLinkBound = "1";
  }

  activate("league");
}

function crashoutResult(homeGoals, awayGoals, side) {
  const hg = Number(homeGoals);
  const ag = Number(awayGoals);
  if (!Number.isFinite(hg) || !Number.isFinite(ag)) return "";
  const homeResult = hg > ag ? "V" : hg < ag ? "P" : "N";
  return side === "home" ? homeResult : homeResult === "V" ? "P" : homeResult === "P" ? "V" : "N";
}

function crashoutMatchCenterUrl(match) {
  const params = new URLSearchParams({
    source: "crashout",
    matchId: match.id,
    home: canonicalTeamName(match.home_team),
    away: canonicalTeamName(match.away_team),
    gw: String(match.matchday),
    competition: "Crash Out Cup"
  });
  return `match.html?${params.toString()}`;
}

function renderCrashoutHomeRivalry(match) {
  const card = document.getElementById("dashboard-crashout-card");
  const tab = document.getElementById("dashboard-match-tab-crashout");
  if (!card || !tab || !match) return;
  const home = canonicalTeamName(match.home_team);
  const away = canonicalTeamName(match.away_team);
  const played = !!match.is_played;

  tab.hidden = false;
  card.classList.remove("is-loading", "is-playoff");
  card.classList.toggle("is-completed", played);
  card.classList.add("is-clickable");
  card.dataset.competitionHref = "crashoutcup.html";
  card.setAttribute("role", "link");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", "Apri Crash Out Cup - Rivalry Games");
  document.getElementById("dashboard-crashout-stage").textContent = `Giornata ${match.matchday}`;
  document.getElementById("dashboard-crashout-badge").textContent = played ? "FINALE" : "SFIDA ATTUALE";
  document.getElementById("dashboard-crashout-home-logo").src = findTeamLogo(home);
  document.getElementById("dashboard-crashout-home-logo").alt = `Logo ${home}`;
  document.getElementById("dashboard-crashout-away-logo").src = findTeamLogo(away);
  document.getElementById("dashboard-crashout-away-logo").alt = `Logo ${away}`;
  document.getElementById("dashboard-crashout-home-name").textContent = home;
  document.getElementById("dashboard-crashout-away-name").textContent = away;
  document.getElementById("dashboard-crashout-score").innerHTML = played
    ? `<strong>${Number(match.home_goals)}</strong><span>–</span><strong>${Number(match.away_goals)}</strong>`
    : "VS";
  document.getElementById("dashboard-crashout-meta").textContent = "Crash Out Cup · Rivalry Games";
  document.getElementById("dashboard-crashout-status").textContent = played ? "Risultato ufficiale" : "Match Preview";
  const cta = document.getElementById("dashboard-crashout-cta");
  cta.href = crashoutMatchCenterUrl(match);
  cta.querySelector("span").textContent = played ? "MATCH REPORT" : "MATCH PREVIEW";
}

function playoffWinner(match, scoreMap) {
  const score = scoreMap.get(match.id) || { home: 0, away: 0 };
  if (score.home >= 3 && score.home > score.away) return match.home;
  if (score.away >= 3 && score.away > score.home) return match.away;
  return null;
}

function buildHomePlayoffBracket(seeds, scoreMap) {
  const bySeed = Object.fromEntries(seeds.map(row => [Number(row.seed), row.team]));
  const mk = (id, h, a, stage) => ({ id, home: h || "TBD", away: a || "TBD", stage });
  const r1 = [
    mk("L1", bySeed[1], bySeed[16], "Ottavi"), mk("L2", bySeed[8], bySeed[9], "Ottavi"),
    mk("L3", bySeed[5], bySeed[12], "Ottavi"), mk("L4", bySeed[4], bySeed[13], "Ottavi"),
    mk("R1", bySeed[3], bySeed[14], "Ottavi"), mk("R2", bySeed[6], bySeed[11], "Ottavi"),
    mk("R3", bySeed[7], bySeed[10], "Ottavi"), mk("R4", bySeed[2], bySeed[15], "Ottavi")
  ];
  const winners = Object.fromEntries(r1.map(m => [m.id, playoffWinner(m, scoreMap)]));
  const qf = [
    mk("LSF1", winners.L1, winners.L2, "Quarti"), mk("LSF2", winners.L3, winners.L4, "Quarti"),
    mk("RSF1", winners.R1, winners.R2, "Quarti"), mk("RSF2", winners.R3, winners.R4, "Quarti")
  ];
  qf.forEach(m => { winners[m.id] = playoffWinner(m, scoreMap); });
  const sf = [mk("LCF", winners.LSF1, winners.LSF2, "Semifinale"), mk("RCF", winners.RSF1, winners.RSF2, "Semifinale")];
  sf.forEach(m => { winners[m.id] = playoffWinner(m, scoreMap); });
  const final = mk("F", winners.LCF, winners.RCF, "Finale");
  return [...r1, ...qf, ...sf, final];
}

function calculateHomeCrashoutSeeds(rows) {
  const records = new Map(squadreBase.map(team => [normalizeTeamName(team.nome), { team: team.nome, pts: 0, gf: 0, ga: 0, fp: 0 }]));
  rows.filter(row => row.is_played).forEach(row => {
    const home = records.get(normalizeTeamName(row.home_team));
    const away = records.get(normalizeTeamName(row.away_team));
    if (!home || !away) return;
    const hg = Number(row.home_goals); const ag = Number(row.away_goals);
    home.gf += hg; home.ga += ag; away.gf += ag; away.ga += hg;
    home.fp += Number(row.home_magic || 0); away.fp += Number(row.away_magic || 0);
    if (hg > ag) home.pts += 3; else if (hg < ag) away.pts += 3; else { home.pts += 1; away.pts += 1; }
  });
  return [...records.values()]
    .sort((a,b) => b.pts-a.pts || (b.gf-b.ga)-(a.gf-a.ga) || b.gf-a.gf || b.fp-a.fp || a.team.localeCompare(b.team))
    .map((row,index) => ({ seed:index+1, team:row.team }));
}

async function loadHomeCrashoutPlayoffSeries(teamName, rivalryRows) {
  const [{ data: seedRows, error: seedError }, { data: scoreRows, error: scoreError }] = await Promise.all([
    supabase.from("crashout_playoff_seeds").select("seed_number, team_name").eq("season", HOME_CRASHOUT_SEASON).order("seed_number"),
    supabase.from("crashout_playoff_scores").select("series_id, home_score, away_score")
  ]);
  if (seedError) console.warn("Seed Crash Out non disponibili:", seedError);
  if (scoreError) throw scoreError;
  const seeds = seedRows?.length >= 16
    ? seedRows.slice(0,16).map(row => ({ seed:Number(row.seed_number), team:canonicalTeamName(row.team_name) }))
    : calculateHomeCrashoutSeeds(rivalryRows);
  if (seeds.length < 16) return null;
  const scoreMap = new Map((scoreRows || []).map(row => [row.series_id, { home:Number(row.home_score||0), away:Number(row.away_score||0) }]));
  const bracket = buildHomePlayoffBracket(seeds, scoreMap);
  const teamKey = normalizeTeamName(teamName);
  const current = bracket.find(match =>
    (normalizeTeamName(match.home) === teamKey || normalizeTeamName(match.away) === teamKey) &&
    !playoffWinner(match, scoreMap)
  );
  if (!current) return null;
  return { ...current, score: scoreMap.get(current.id) || { home:0, away:0 } };
}

function renderCrashoutHomePlayoff(series) {
  const card = document.getElementById("dashboard-crashout-card");
  const tab = document.getElementById("dashboard-match-tab-crashout");
  if (!card || !tab || !series) return;
  const home = series.home === "TBD" ? "Da definire" : canonicalTeamName(series.home);
  const away = series.away === "TBD" ? "Da definire" : canonicalTeamName(series.away);
  tab.hidden = false;
  card.classList.remove("is-loading", "is-completed");
  card.classList.add("is-playoff", "is-clickable");
  card.dataset.competitionHref = "crashoutplayoff.html";
  card.setAttribute("role", "link");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", "Apri Crash Out Cup - Playoff");
  const playoffGameNumber = Math.min(
    5,
    Number(series.score.home || 0) + Number(series.score.away || 0) + 1
  );
  document.getElementById("dashboard-crashout-stage").textContent =
    `${series.stage} · Gara ${playoffGameNumber}`;
  document.getElementById("dashboard-crashout-badge").textContent = "FASE FINALE";
  document.getElementById("dashboard-crashout-home-logo").src = home === "Da definire" ? "icon-192.png" : findTeamLogo(home);
  document.getElementById("dashboard-crashout-away-logo").src = away === "Da definire" ? "icon-192.png" : findTeamLogo(away);
  document.getElementById("dashboard-crashout-home-name").textContent = home;
  document.getElementById("dashboard-crashout-away-name").textContent = away;
  document.getElementById("dashboard-crashout-score").innerHTML = `<strong>${series.score.home}</strong><span>–</span><strong>${series.score.away}</strong>`;
  document.getElementById("dashboard-crashout-meta").textContent = "Crash Out Cup · Serie al meglio delle 5";
  const seriesStarted = Number(series.score.home) > 0 || Number(series.score.away) > 0;
  document.getElementById("dashboard-crashout-status").textContent =
    home === "Da definire" || away === "Da definire"
      ? "Avversario in attesa"
      : seriesStarted
        ? `Serie ${series.score.home}–${series.score.away} · primo a 3 vittorie`
        : "Serie 0–0 · primo a 3 vittorie";
  const cta = document.getElementById("dashboard-crashout-cta");
  cta.href = "crashoutplayoff.html";
  cta.querySelector("span").textContent = "VAI AI PLAYOFF";
}

async function renderHomeCrashoutTab(context) {
  const tab = document.getElementById("dashboard-match-tab-crashout");
  if (!tab || !context?.team?.name) return;
  tab.hidden = true;
  try {
    const { data, error } = await supabase
      .from("crashout_rivalry_matches")
      .select("id, season, match_type, bucket_id, matchday, match_index, home_team, away_team, home_magic, away_magic, home_goals, away_goals, is_played")
      .eq("season", HOME_CRASHOUT_SEASON)
      .order("matchday", { ascending:true })
      .order("match_index", { ascending:true });
    if (error) throw error;
    const rows = data || [];
    const teamKey = normalizeTeamName(context.team.name);
    const teamRows = rows.filter(row => normalizeTeamName(row.home_team) === teamKey || normalizeTeamName(row.away_team) === teamKey);
    if (!teamRows.length) return;

    const allRivalryComplete = rows.length > 0 && rows.every(row => !!row.is_played);
    if (!allRivalryComplete) {
      const upcoming = teamRows.find(row => !row.is_played);
      const latest = [...teamRows].filter(row => row.is_played).sort((a,b) => Number(b.matchday)-Number(a.matchday))[0];
      renderCrashoutHomeRivalry(upcoming || latest);
      return;
    }

    const series = await loadHomeCrashoutPlayoffSeries(context.team.name, rows);
    if (series) renderCrashoutHomePlayoff(series);
    // Se la squadra è eliminata, la tab sparisce automaticamente.
  } catch (error) {
    console.warn("Crash Out Cup non disponibile nella Home:", error);
  }
}


// =========================================================
// HOME · HIGHLANDER
// La tab compare soltanto quando la competizione è attivata
// dall'admin e la squadra dell'utente non è stata eliminata.
// =========================================================
async function renderHomeHighlanderTab(context) {
  const tab = document.getElementById("dashboard-match-tab-highlander");
  const card = document.getElementById("dashboard-highlander-card");
  if (!tab || !card || !context?.team?.name) return;

  tab.hidden = true;

  try {
    const [{ data: stateRow, error: stateError }, { data: eliminationRows, error: eliminationError }] = await Promise.all([
      supabase
        .from("highlander_state")
        .select("season, is_active")
        .eq("season", HOME_HIGHLANDER_SEASON)
        .maybeSingle(),
      supabase
        .from("highlander_eliminations")
        .select("season, turno, team_name, magic_punti")
        .eq("season", HOME_HIGHLANDER_SEASON)
        .order("turno", { ascending: true })
    ]);

    if (stateError) throw stateError;
    if (eliminationError) throw eliminationError;
    if (!stateRow?.is_active) return;

    const rows = eliminationRows || [];
    const teamKey = normalizeTeamName(context.team.name);
    const eliminated = rows.some(row => normalizeTeamName(row.team_name) === teamKey);

    // Dopo l'eliminazione la tab sparisce dalla Home di quella squadra.
    if (eliminated) return;

    const eliminatedCount = rows.length;
    const survivors = Math.max(0, squadreBase.length - eliminatedCount);
    const lastRound = rows.length
      ? Math.max(...rows.map(row => Number(row.turno) || 0))
      : 0;
    const currentRound = Math.min(15, lastRound + 1);
    const isChampion = survivors === 1;

    tab.hidden = false;
    card.classList.remove("is-loading");
    card.classList.toggle("is-champion", isChampion);

    document.getElementById("dashboard-highlander-stage").textContent = isChampion
      ? "Verdetto finale"
      : `Turno ${currentRound}`;
    document.getElementById("dashboard-highlander-badge").textContent = isChampion
      ? "CAMPIONE"
      : "IN CORSO";

    const image = document.getElementById("dashboard-highlander-image");
    // In gara: mascotte standard. Campione: variante vittoria.
    // L'immagine Highlander "eliminata" resta riservata alla pagina Arena.
    image.src = isChampion
      ? findTeamResultMascot(context.team.name, "win")
      : findTeamResultMascot(context.team.name, "standard");
    image.alt = isChampion
      ? `Mascotte vittoria ${context.team.name}`
      : `Mascotte ${context.team.name}`;

    document.getElementById("dashboard-highlander-team").textContent = context.team.name;
    document.getElementById("dashboard-highlander-status").textContent = isChampion
      ? "ULTIMO SOPRAVVISSUTO"
      : "ANCORA IN GARA";
    document.getElementById("dashboard-highlander-survivors").textContent = String(survivors);
    document.getElementById("dashboard-highlander-eliminated").textContent = String(eliminatedCount);
  } catch (error) {
    // Se la tabella highlander_state non è stata ancora creata, la Home continua
    // semplicemente senza tab Highlander.
    console.warn("Highlander non disponibile nella Home:", error);
  }
}


// =========================================================
// HOME · RIORDINO SEZIONI INFERIORI
// - In evidenza: Gazzetta + All Star
// - Competizioni: unisce Competizioni + Coppe & Eventi
// - Esplora: aggiunge Regolamento
// Nessuna modifica alle logiche delle competizioni.
// =========================================================
function reorganizeHomeLowerSections() {
  const sections = [...document.querySelectorAll('.home-app-section')];

  const normalizeHeading = value => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

  const findSection = title => sections.find(section => {
    const heading = section.querySelector('.home-app-heading h2');
    return normalizeHeading(heading?.textContent) === normalizeHeading(title);
  });

  const featuredSection = findSection('In evidenza');
  const competitionsSection = findSection('Competizioni');
  const cupsSection = findSection('Coppe & Eventi');
  const exploreSection = findSection('Esplora');

  // 1) IN EVIDENZA: teniamo solo contenuti realmente editoriali/evento.
  if (featuredSection) {
    const featuredTrack = featuredSection.querySelector('.featured-track, .home-horizontal-track');
    if (featuredTrack) {
      [...featuredTrack.querySelectorAll('a.home-image-card')].forEach(card => {
        const href = String(card.getAttribute('href') || '').toLowerCase();
        const keep =
          href.includes('giornale.html') ||
          href.includes('allstar.html') ||
          href.includes('statistiche.html');
        if (!keep) card.remove();
      });
    }
  }

  // 2) COMPETIZIONI:
  // Mobile: accorpiamo Coppe & Eventi come nella Home mobile definitiva.
  // Desktop: le teniamo separate per sfruttare lo spazio orizzontale.
  if (window.innerWidth <= 900 && competitionsSection && cupsSection) {
    const competitionTrack = competitionsSection.querySelector('.competition-track, .home-horizontal-track');
    const cupTrack = cupsSection.querySelector('.cup-track, .home-horizontal-track');

    if (competitionTrack && cupTrack) {
      [...cupTrack.querySelectorAll('a.home-image-card')].forEach(card => {
        card.classList.remove('cup-app-card');
        card.classList.add('competition-app-card');
        competitionTrack.appendChild(card);
      });
    }

    cupsSection.remove();
  }

  // 3) ESPLORA: Regolamento come voce permanente della lega.
  if (exploreSection) {
    const exploreTrack = exploreSection.querySelector('.explore-grid');
    if (exploreTrack && !exploreTrack.querySelector('a[href*="regolamento"]')) {
      const regulationCard = document.createElement('a');
      regulationCard.href = 'regolamento.html';
      regulationCard.className = 'home-image-card explore-card';
      regulationCard.innerHTML = `
        <img src="img/maglie/evidenzaregolamento.webp?v=20260915-2" alt="Regolamento" loading="lazy">
      `;
      exploreTrack.appendChild(regulationCard);
    }
  }
}

async function initHomeDashboard() {
  reorganizeHomeLowerSections();
  setupHomeMatchTabs();
  const context = await loadDashboardTeam();
  const [rowsResult] = await Promise.allSettled([loadResultsRows(), loadWaiverCountdown(), loadLatestTrade()]);

  // loadWaiverCountdown() ha appena valorizzato activeLeaguePhase:
  // aggiorniamo subito Campionato/Playoff senza interventi manuali.
  applyHomeLeagueVisualPhase();

  const rows = rowsResult.status === "fulfilled" && Array.isArray(rowsResult.value) ? rowsResult.value : [];
  if (rowsResult.status === "rejected") console.warn("Risultati home non disponibili:", rowsResult.reason);
  renderTeamStatsAndForm(context, rows);
  renderMatchCarousel(context, rows);
  renderMatchups(rows);
  renderRecord(rows);
  await renderHomeCrashoutTab(context);
  await renderHomeHighlanderTab(context);
}

document.addEventListener("DOMContentLoaded", initHomeDashboard);
