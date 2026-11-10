import { supabase } from "./supabase.js";
import { loadResultsRows } from "./results-source.js";

const GOAL_BASE = 66;
const GOAL_STEP = 6;
const CURRENT_SEASON = "2026/27";

const TEAM_META = [
  { name: "Atlético Leon", logo: "img/Atlético Leon.webp" },
  { name: "Bayern Christiansen", logo: "img/Bayern Christiansen.webp" },
  { name: "Team Bartowski", logo: "img/Team Bartowski.webp" },
  { name: "Golden Knights", logo: "img/Golden Knights.webp" },
  { name: "Ibla", logo: "img/Ibla.webp" },
  { name: "Fantaugusta", logo: "img/Fantaugusta.webp" },
  { name: "Riverfilo", logo: "img/Riverfilo.webp" },
  { name: "Desperados", logo: "img/Desperados.webp" },
  { name: "Wildboys 78", logo: "img/wildboys78.webp" },
  { name: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.webp" },
  { name: "Pokermantra", logo: "img/PokerMantra.webp" },
  { name: "Minnesode Timberland", logo: "img/Minnesode Timberland.webp" },
  { name: "Minnesota Snakes", logo: "img/MinneSota Snakes.webp" },
  { name: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.webp" },
  { name: "FC Disoneste", logo: "img/FC Disoneste.webp" },
  { name: "Athletic Pongao", logo: "img/Athletic Pongao.webp" }
];

function normalizeTeamName(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function canonicalTeamName(name) {
  const key = normalizeTeamName(name);
  return TEAM_META.find(team => normalizeTeamName(team.name) === key)?.name || String(name || "").trim();
}

function teamLogo(name) {
  const key = normalizeTeamName(name);
  return TEAM_META.find(team => normalizeTeamName(team.name) === key)?.logo || "icon-192.png";
}

function parseNumber(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "–";
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ",");
}

function pointsToGoals(points) {
  const value = parseNumber(points);
  if (value < GOAL_BASE) return 0;
  return 1 + Math.floor((value - GOAL_BASE) / GOAL_STEP);
}

function resultFromPoints(pointsFor, pointsAgainst) {
  const gf = pointsToGoals(pointsFor);
  const ga = pointsToGoals(pointsAgainst);
  if (gf > ga) return "V";
  if (gf < ga) return "P";
  return "N";
}

function rowResult(row) {
  const explicit = String(row?.Result || "").trim().toUpperCase();
  if (["V", "N", "P"].includes(explicit)) return explicit;
  return resultFromPoints(row?.PointsFor, row?.PointsAgainst);
}

function isCompletedRow(row) {
  const explicit = String(row?.Result || "").trim().toUpperCase();
  if (["V", "N", "P"].includes(explicit)) return true;
  return !(parseNumber(row?.PointsFor) === 0 && parseNumber(row?.PointsAgainst) === 0);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function competitionLabel(code) {
  if (code === "Conf B") return "Conference Championship";
  if (code === "Unificata") return "Round Robin";
  if (String(code).toLowerCase().includes("playoff")) return "Playoff";
  if (String(code).toLowerCase().includes("crash out")) return "Crash Out Cup · Rivalry Games";
  return "Conference League";
}

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    home: canonicalTeamName(params.get("home")),
    away: canonicalTeamName(params.get("away")),
    gw: Number(params.get("gw")) || null,
    competition: params.get("competition") || "Conf A",
    source: params.get("source") || "league",
    matchId: params.get("matchId") || "",
    seriesId: params.get("seriesId") || "",
    gameNumber: Number(params.get("gameNumber")) || null,
    stage: params.get("stage") || "",
    seriesHome: canonicalTeamName(params.get("seriesHome")),
    seriesAway: canonicalTeamName(params.get("seriesAway"))
  };
}

function pairMatches(a, b, home, away) {
  const pair = [normalizeTeamName(a), normalizeTeamName(b)].sort().join("|");
  const target = [normalizeTeamName(home), normalizeTeamName(away)].sort().join("|");
  return pair === target;
}

function completedRowsFor(rows, competition, predicate = () => true) {
  const seen = new Set();
  return rows
    .filter(row => String(row.Conference || "").trim() === competition)
    .filter(isCompletedRow)
    .filter(predicate)
    .filter(row => {
      const key = `${competition}|${Number(row.GW) || 0}|${normalizeTeamName(row.Team)}`;
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
    if (!table.has(key)) table.set(key, { team: name, g: 0, w: 0, d: 0, l: 0, pts: 0, fp: 0, gf: 0, ga: 0 });
    const rec = table.get(key);
    const result = rowResult(row);
    rec.g += 1;
    rec.fp += parseNumber(row.PointsFor);
    rec.gf += pointsToGoals(row.PointsFor);
    rec.ga += pointsToGoals(row.PointsAgainst);
    if (result === "V") { rec.w += 1; rec.pts += 3; }
    else if (result === "N") { rec.d += 1; rec.pts += 1; }
    else rec.l += 1;
  });
  return [...table.values()].sort((a, b) =>
    b.pts - a.pts || b.fp - a.fp || b.gf - a.gf || a.ga - b.ga || a.team.localeCompare(b.team)
  );
}

function standingSnapshot(rows, competition, maxGwExclusive = null) {
  const filtered = completedRowsFor(rows, competition, row =>
    maxGwExclusive == null || Number(row.GW) < Number(maxGwExclusive)
  );
  return buildStandings(filtered);
}

function standingSnapshotThrough(rows, competition, maxGwInclusive) {
  const filtered = completedRowsFor(rows, competition, row => Number(row.GW) <= Number(maxGwInclusive));
  return buildStandings(filtered);
}

function positionOf(standings, team) {
  const idx = standings.findIndex(row => normalizeTeamName(row.team) === normalizeTeamName(team));
  return idx >= 0 ? idx + 1 : null;
}

function pointsOf(standings, team) {
  return standings.find(row => normalizeTeamName(row.team) === normalizeTeamName(team))?.pts ?? null;
}

function targetMatch(rows, params) {
  const candidates = rows.filter(row =>
    String(row.Conference || "").trim() === params.competition &&
    Number(row.GW) === Number(params.gw) &&
    (params.source !== "crashoutplayoff" || row.MatchId === params.matchId) &&
    pairMatches(row.Team, row.Opponent, params.home, params.away) &&
    isCompletedRow(row)
  );
  if (!candidates.length) return null;

  const direct = candidates.find(row => normalizeTeamName(row.Team) === normalizeTeamName(params.home)) || candidates[0];
  const directIsHome = normalizeTeamName(direct.Team) === normalizeTeamName(params.home);
  return {
    pointsHome: directIsHome ? parseNumber(direct.PointsFor) : parseNumber(direct.PointsAgainst),
    pointsAway: directIsHome ? parseNumber(direct.PointsAgainst) : parseNumber(direct.PointsFor),
    date: direct.Date || "",
    seasonalGw: Number(direct.GW_Stagionale) || Number(params.gw),
    resultHome: directIsHome ? rowResult(direct) : ({ V: "P", P: "V", N: "N" }[rowResult(direct)] || "N"),
    goalsHome: directIsHome ? direct.GoalsFor : direct.GoalsAgainst,
    goalsAway: directIsHome ? direct.GoalsAgainst : direct.GoalsFor
  };
}

function roundIsComplete(rows, params) {
  const uniqueTeams = new Set(
    completedRowsFor(rows, params.competition, row => Number(row.GW) === Number(params.gw))
      .map(row => normalizeTeamName(row.Team))
  );
  const expected = params.competition === "Unificata" || params.competition === "Crash Out Cup" ? 16 : 8;
  return uniqueTeams.size >= expected;
}

function currentSeasonMeetings(rows, params) {
  const seen = new Set();
  const meetings = [];

  rows.filter(isCompletedRow).forEach(row => {
    if (!pairMatches(row.Team, row.Opponent, params.home, params.away)) return;
    const key = `${String(row.Conference || "")}|${String(row.Phase || "")}|${row.MatchId || Number(row.GW) || 0}|${[normalizeTeamName(row.Team), normalizeTeamName(row.Opponent)].sort().join("|")}`;
    if (seen.has(key)) return;
    seen.add(key);

    // pointsHome/pointsAway restano riferiti alle due squadre del Match Center
    // e servono per statistiche H2H, medie e record.
    const rowIsParamHome = normalizeTeamName(row.Team) === normalizeTeamName(params.home);
    const pointsHome = rowIsParamHome ? parseNumber(row.PointsFor) : parseNumber(row.PointsAgainst);
    const pointsAway = rowIsParamHome ? parseNumber(row.PointsAgainst) : parseNumber(row.PointsFor);

    // is_home arriva dal calendario importato: prima squadra della riga = casa.
    const venueKnown = typeof row.IsHome === "boolean";
    const venueHomeTeam = venueKnown
      ? canonicalTeamName(row.IsHome ? row.Team : row.Opponent)
      : null;
    const venueAwayTeam = venueKnown
      ? canonicalTeamName(row.IsHome ? row.Opponent : row.Team)
      : null;
    const pointsVenueHome = venueKnown
      ? parseNumber(row.IsHome ? row.PointsFor : row.PointsAgainst)
      : null;
    const pointsVenueAway = venueKnown
      ? parseNumber(row.IsHome ? row.PointsAgainst : row.PointsFor)
      : null;

    meetings.push({
      season: CURRENT_SEASON,
      seasonWeek: Number(row.GW_Stagionale) || Number(row.GW) || 0,
      localGw: Number(row.GW) || 0,
      competition: String(row.Conference || ""),
      phase: row.Phase || "Regular",
      pointsHome,
      pointsAway,
      venueKnown,
      venueHomeTeam,
      venueAwayTeam,
      pointsVenueHome,
      pointsVenueAway,
      isTarget: String(row.Conference || "").trim() === params.competition && Number(row.GW) === Number(params.gw) && (params.source !== "crashoutplayoff" || row.MatchId === params.matchId)
    });
  });

  return meetings;
}

async function historicalMeetings(params) {
  const { data, error } = await supabase
    .from("match_history")
    .select("season, season_week, competition, phase, conference, team_a, team_b, score_a, score_b, home_team, away_team")
    .in("team_a", [params.home, params.away])
    .in("team_b", [params.home, params.away])
    .order("season", { ascending: true })
    .order("season_week", { ascending: true });

  if (error) throw error;

  return (data || [])
    .filter(row => pairMatches(row.team_a, row.team_b, params.home, params.away))
    .map(row => {
      const aIsParamHome = normalizeTeamName(row.team_a) === normalizeTeamName(params.home);
      const pointsHome = aIsParamHome ? parseNumber(row.score_a) : parseNumber(row.score_b);
      const pointsAway = aIsParamHome ? parseNumber(row.score_b) : parseNumber(row.score_a);

      const venueHomeTeam = row.home_team ? canonicalTeamName(row.home_team) : null;
      const venueAwayTeam = row.away_team ? canonicalTeamName(row.away_team) : null;
      const venueKnown = Boolean(venueHomeTeam && venueAwayTeam);

      const scoreForTeam = team => {
        if (normalizeTeamName(team) === normalizeTeamName(row.team_a)) return parseNumber(row.score_a);
        if (normalizeTeamName(team) === normalizeTeamName(row.team_b)) return parseNumber(row.score_b);
        return null;
      };

      return {
        season: row.season,
        seasonWeek: Number(row.season_week) || 0,
        localGw: Number(row.season_week) || 0,
        competition: row.conference || row.competition || "",
        phase: row.phase || "",
        pointsHome,
        pointsAway,
        venueKnown,
        venueHomeTeam,
        venueAwayTeam,
        pointsVenueHome: venueKnown ? scoreForTeam(venueHomeTeam) : null,
        pointsVenueAway: venueKnown ? scoreForTeam(venueAwayTeam) : null,
        isTarget: false
      };
    });
}

// Uno storico unico: una partita entra una sola volta anche se è presente
// sia in match_history sia nei risultati della stagione corrente.
function normalizedHistoryCompetition(meeting) {
  const competition = String(meeting.competition || "").trim();
  const normalized = normalizeTeamName(competition);
  if (normalized.includes("crashout") || normalized === "coc") return "Crash Out Cup";
  if (normalized === "confa" || normalized === "conferenceleague") return "Conf A";
  if (normalized === "confb" || normalized === "conferencechampionship") return "Conf B";
  if (normalized === "unificata" || normalized === "roundrobin") return "Unificata";
  return competition;
}

function historyCompetitionLabel(meeting) {
  const competition = normalizedHistoryCompetition(meeting);
  const phase = String(meeting.phase || "").trim();
  if (competition === "Crash Out Cup") {
    return /playoff|quarti|semifinal|finale|ottavi/i.test(phase)
      ? "Crash Out Cup · Playoff"
      : "Crash Out Cup · Rivalry Games";
  }
  if (competition === "Conf A") return "Conference League";
  if (competition === "Conf B") return "Conference Championship";
  if (competition === "Unificata") return "Round Robin";
  return competition || phase || "Competizione";
}

function isCrashOutHistory(meeting) {
  return normalizedHistoryCompetition(meeting) === "Crash Out Cup";
}

function uniqueMeetings(meetings) {
  const byKey = new Map();
  meetings.forEach(meeting => {
    // Non unire competizioni diverse disputate nella stessa giornata.
    const season = String(meeting.season || "").trim().replace(/^((?:19|20)\d{2})$/, (_, year) => `${year}/${String(Number(year) + 1).slice(-2)}`);
    const key = [
      season,
      normalizedHistoryCompetition(meeting),
      Number(meeting.seasonWeek) || 0,
      // Due match con punteggi diversi nella stessa giornata restano distinti.
      Number(meeting.pointsHome),
      Number(meeting.pointsAway)
    ].join("|");
    const previous = byKey.get(key);
    // A parità di match usiamo la versione con casa/trasferta conosciute.
    if (!previous || (!previous.venueKnown && meeting.venueKnown)) byKey.set(key, meeting);
  });
  return [...byKey.values()];
}

function sortMeetings(meetings) {
  // Funziona anche quando aggiungiamo una nuova stagione allo storico.
  const seasonYear = value => Number(String(value || "").match(/^(?:19|20)\d{2}/)?.[0]) || 9999;
  return [...meetings].sort((a, b) =>
    seasonYear(a.season) - seasonYear(b.season) || a.seasonWeek - b.seasonWeek
  );
}

function h2hStats(meetings) {
  let homeWins = 0;
  let awayWins = 0;
  let draws = 0;
  let totalHome = 0;
  let totalAway = 0;
  let best = null;
  let biggest = null;

  meetings.forEach(meeting => {
    totalHome += meeting.pointsHome;
    totalAway += meeting.pointsAway;
    const result = resultFromPoints(meeting.pointsHome, meeting.pointsAway);
    if (result === "V") homeWins += 1;
    else if (result === "P") awayWins += 1;
    else draws += 1;

    for (const candidate of [
      { team: "home", value: meeting.pointsHome, meeting },
      { team: "away", value: meeting.pointsAway, meeting }
    ]) {
      if (!best || candidate.value > best.value) best = candidate;
    }
    const diff = Math.abs(meeting.pointsHome - meeting.pointsAway);
    if (!biggest || diff > biggest.diff) biggest = { diff, meeting };
  });

  return {
    count: meetings.length,
    homeWins,
    awayWins,
    draws,
    avgHome: meetings.length ? totalHome / meetings.length : 0,
    avgAway: meetings.length ? totalAway / meetings.length : 0,
    best,
    biggest
  };
}

function teamForm(rows, team, params, includeTarget) {
  return rows
    .filter(isCompletedRow)
    .filter(row => normalizeTeamName(row.Team) === normalizeTeamName(team))
    .filter(row => {
      if (!includeTarget && String(row.Conference || "").trim() === params.competition && Number(row.GW) === Number(params.gw)) return false;
      return true;
    })
    .sort((a, b) => (Number(a.GW_Stagionale) || Number(a.GW) || 0) - (Number(b.GW_Stagionale) || Number(b.GW) || 0))
    .slice(-5);
}

function formMarkup(rows, team, params, includeTarget) {
  const form = teamForm(rows, team, params, includeTarget);
  const average = form.length ? form.reduce((sum, row) => sum + parseNumber(row.PointsFor), 0) / form.length : 0;
  const dots = form.map(row => {
    const result = rowResult(row);
    return `<span class="mc-form-dot ${result === "V" ? "win" : result === "P" ? "loss" : "draw"}">${result}</span>`;
  }).join("") || '<span class="mc-form-empty">Nessun risultato</span>';
  return { dots, average };
}


async function loadLeagueFixtures(params) {
  if (params.source === "crashout" || params.source === "crashoutplayoff") return [];

  const { data, error } = await supabase
    .from("fantacalcio_fixtures")
    .select("conference, phase, gw, home_team, away_team, match_date")
    .eq("conference", params.competition)
    .eq("gw", params.gw)
    .order("home_team", { ascending: true });

  if (error) {
    console.warn("Fixture Match Center non disponibili:", error);
    return [];
  }

  return (data || []).map(row => ({
    conference: row.conference,
    gw: Number(row.gw),
    home: canonicalTeamName(row.home_team),
    away: canonicalTeamName(row.away_team),
    date: row.match_date || ""
  }));
}

function resultForPair(rows, competition, gw, home, away) {
  const candidates = rows.filter(row =>
    String(row.Conference || "").trim() === competition &&
    Number(row.GW) === Number(gw) &&
    pairMatches(row.Team, row.Opponent, home, away) &&
    isCompletedRow(row)
  );

  if (!candidates.length) return null;

  const direct = candidates.find(row => normalizeTeamName(row.Team) === normalizeTeamName(home)) || candidates[0];
  const directIsHome = normalizeTeamName(direct.Team) === normalizeTeamName(home);

  return {
    pointsHome: directIsHome ? parseNumber(direct.PointsFor) : parseNumber(direct.PointsAgainst),
    pointsAway: directIsHome ? parseNumber(direct.PointsAgainst) : parseNumber(direct.PointsFor)
  };
}

function uniqueMatchesForGw(rows, competition, gw) {
  const seen = new Set();
  const matches = [];

  rows
    .filter(isCompletedRow)
    .filter(row => String(row.Conference || "").trim() === competition && Number(row.GW) === Number(gw))
    .forEach(row => {
      const a = canonicalTeamName(row.Team);
      const b = canonicalTeamName(row.Opponent);
      const key = [normalizeTeamName(a), normalizeTeamName(b)].sort().join("|");
      if (seen.has(key)) return;
      seen.add(key);

      const rowIsA = normalizeTeamName(row.Team) === normalizeTeamName(a);
      matches.push({
        teamA: a,
        teamB: b,
        pointsA: rowIsA ? parseNumber(row.PointsFor) : parseNumber(row.PointsAgainst),
        pointsB: rowIsA ? parseNumber(row.PointsAgainst) : parseNumber(row.PointsFor)
      });
    });

  return matches;
}

function stakesContext(params, rows) {
  const before = standingSnapshot(rows, params.competition, params.gw);
  const homePos = positionOf(before, params.home);
  const awayPos = positionOf(before, params.away);
  const homePts = pointsOf(before, params.home);
  const awayPts = pointsOf(before, params.away);

  const playoffCut = params.competition === "Unificata" ? 8 : 4;
  let badge = "MATCH CONTEXT";

  if (homePos && awayPos) {
    if (homePos <= 2 && awayPos <= 2) badge = "SFIDA PER LA VETTA";
    else if (homePos <= playoffCut && awayPos <= playoffCut) badge = params.competition === "Unificata" ? "SCONTRO PLAYOFF" : "SCONTRO DIRETTO TOP 4";
    else if ((homePos <= playoffCut && awayPos > playoffCut) || (awayPos <= playoffCut && homePos > playoffCut)) {
      badge = params.competition === "Unificata" ? "PLAYOFF LINE" : "ASSALTO ALLA TOP 4";
    }
  }

  const winScenario = (team, pts, opp, oppPts) => {
    if (pts == null || oppPts == null) return `${team}: tre punti pesanti in palio.`;
    const after = pts + 3;
    const currentGap = pts - oppPts;
    const newGap = after - oppPts;

    if (currentGap > 0) {
      return `${team}: con una vittoria sale a ${after} punti e va a +${newGap} su ${opp}.`;
    }

    if (after > oppPts) {
      return `${team}: con una vittoria sale a ${after} punti e supera ${opp} in classifica.`;
    }

    if (after === oppPts) {
      return `${team}: con una vittoria aggancia ${opp} a ${after} punti.`;
    }

    return `${team}: con una vittoria sale a ${after} punti e si porta a -${oppPts - after} da ${opp}.`;
  };

  const drawText = homePts != null && awayPts != null
    ? `Con un pareggio: ${params.home} va a ${homePts + 1} pt, ${params.away} va a ${awayPts + 1} pt.`
    : "Con un pareggio, le distanze restano sostanzialmente invariate.";

  return {
    badge,
    before,
    homePos,
    awayPos,
    homePts,
    awayPts,
    scenarios: [
      { icon: "▲", title: `Se vince ${params.home}`, text: winScenario(params.home, homePts, params.away, awayPts) },
      { icon: "▲", title: `Se vince ${params.away}`, text: winScenario(params.away, awayPts, params.home, homePts) },
      { icon: "=", title: "Se finisce pari", text: drawText }
    ]
  };
}

function renderStakes(params, rows, target, completed, roundComplete) {
  const badge = document.getElementById("mc-stakes-badge");
  const scenarios = document.getElementById("mc-stakes-scenarios");
  const storyTitle = document.getElementById("mc-story-title");
  const storyBody = document.getElementById("mc-story-body");
  if (!badge || !scenarios || !storyTitle || !storyBody) return;

  const ctx = stakesContext(params, rows);

  if (!completed) {
    storyTitle.textContent = "What's at stake";
    badge.textContent = ctx.badge;

    if (ctx.homePos && ctx.awayPos && ctx.homePts != null && ctx.awayPts != null) {
      const diff = Math.abs(ctx.homePts - ctx.awayPts);
      storyBody.textContent = `${params.home} è ${ctx.homePos}° con ${ctx.homePts} pt, ${params.away} è ${ctx.awayPos}° con ${ctx.awayPts} pt. ${diff === 0 ? "Sono a pari punti." : `Le separano ${diff} ${diff === 1 ? "punto" : "punti"}.`}`;
    } else {
      storyBody.textContent = "Il contesto della classifica si aggiornerà appena saranno disponibili abbastanza risultati.";
    }

    scenarios.innerHTML = ctx.scenarios.map(item => `
      <div class="mc-stakes-row">
        <span>${item.icon}</span>
        <div>
          <strong>${escapeHtml(item.title)}</strong>
          <small>${escapeHtml(item.text)}</small>
        </div>
      </div>
    `).join("");
    return;
  }

  storyTitle.textContent = "Match impact";
  badge.textContent = roundComplete ? "GIORNATA COMPLETA" : "RISULTATO REGISTRATO";

  const result = resultFromPoints(target.pointsHome, target.pointsAway);
  const goalsHome = pointsToGoals(target.pointsHome);
  const goalsAway = pointsToGoals(target.pointsAway);

  let opening = `La partita termina ${goalsHome} - ${goalsAway}.`;
  if (result === "V") opening = `${params.home} supera ${params.away} ${goalsHome} - ${goalsAway}.`;
  if (result === "P") opening = `${params.away} supera ${params.home} ${goalsAway} - ${goalsHome}.`;
  storyBody.textContent = opening;

  if (!roundComplete) {
    scenarios.innerHTML = `
      <div class="mc-stakes-row pending">
        <span>…</span>
        <div>
          <strong>Impatto definitivo in attesa</strong>
          <small>La classifica finale della giornata comparirà quando tutte le partite del turno saranno concluse.</small>
        </div>
      </div>`;
    return;
  }

  const after = standingSnapshotThrough(rows, params.competition, params.gw);
  const afterHome = positionOf(after, params.home);
  const afterAway = positionOf(after, params.away);

  scenarios.innerHTML = [
    {
      icon: "↗",
      title: params.home,
      text: `${ctx.homePos ? `${ctx.homePos}°` : "–"} → ${afterHome ? `${afterHome}°` : "–"}`
    },
    {
      icon: "↗",
      title: params.away,
      text: `${ctx.awayPos ? `${ctx.awayPos}°` : "–"} → ${afterAway ? `${afterAway}°` : "–"}`
    }
  ].map(item => `
    <div class="mc-stakes-row">
      <span>${item.icon}</span>
      <div>
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.text)}</small>
      </div>
    </div>
  `).join("");
}

function formatFixtureDate(value) {
  if (!value) return "";
  const d = new Date(`${value}T12:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

function renderAroundLeague(params, rows, fixtures) {
  const host = document.getElementById("mc-around-list");
  const title = document.getElementById("mc-around-title");
  const subtitle = document.getElementById("mc-around-subtitle");
  if (!host) return;

  if (title) title.textContent = "Around the League";
  if (subtitle) subtitle.textContent = `GW ${params.gw} · ${competitionLabel(params.competition)}`;

  let schedule = fixtures;

  // Fallback: se non abbiamo fixtures, ricaviamo le partite già giocate.
  if (!schedule.length) {
    const seen = new Set();
    schedule = [];
    rows
      .filter(row => String(row.Conference || "").trim() === params.competition && Number(row.GW) === Number(params.gw))
      .forEach(row => {
        const home = canonicalTeamName(row.IsHome === false ? row.Opponent : row.Team);
        const away = canonicalTeamName(row.IsHome === false ? row.Team : row.Opponent);
        const key = [normalizeTeamName(home), normalizeTeamName(away)].sort().join("|");
        if (seen.has(key)) return;
        seen.add(key);
        schedule.push({ home, away, date: row.Date || "" });
      });
  }

  if (!schedule.length) {
    host.innerHTML = '<div class="mc-empty">Calendario della giornata non disponibile.</div>';
    return;
  }

  const before = standingSnapshot(rows, params.competition, params.gw);

  host.innerHTML = schedule.map(f => {
    const home = canonicalTeamName(f.home);
    const away = canonicalTeamName(f.away);
    const result = resultForPair(rows, params.competition, params.gw, home, away);
    const current = pairMatches(home, away, params.home, params.away);

    const homePos = positionOf(before, home);
    const awayPos = positionOf(before, away);
    const date = formatFixtureDate(f.date);

    const href = `match.html?home=${encodeURIComponent(home)}&away=${encodeURIComponent(away)}&gw=${encodeURIComponent(params.gw)}&competition=${encodeURIComponent(params.competition)}&source=${encodeURIComponent(params.source || "league")}`;

    const scoreMarkup = result
      ? `<div class="mc-around-score"><strong>${pointsToGoals(result.pointsHome)} - ${pointsToGoals(result.pointsAway)}</strong><small>${formatNumber(result.pointsHome)} - ${formatNumber(result.pointsAway)} FP</small></div>`
      : `<div class="mc-around-score upcoming"><strong>VS</strong><small>${date || "Da giocare"}</small></div>`;

    const status = current ? "QUESTA PARTITA" : result ? "FINALE" : "PREVIEW";

    return `
      <article class="mc-around-match ${current ? "is-current" : ""}">
        <div class="mc-around-team">
          <img src="${teamLogo(home)}" alt="">
          <strong>${escapeHtml(home)}</strong>
          <small>${homePos ? `${homePos}°` : "–"}</small>
        </div>

        ${scoreMarkup}

        <div class="mc-around-team away">
          <img src="${teamLogo(away)}" alt="">
          <strong>${escapeHtml(away)}</strong>
          <small>${awayPos ? `${awayPos}°` : "–"}</small>
        </div>

        <a class="mc-around-link" href="${href}">
          ${status}<span>›</span>
        </a>
      </article>`;
  }).join("");
}

function renderWeekNumbers(params, rows, roundComplete) {
  const host = document.getElementById("mc-week-numbers");
  const status = document.getElementById("mc-week-status");
  if (!host) return;

  if (!roundComplete) {
    if (status) status.textContent = "Si accende a giornata completa";
    host.innerHTML = `
      <div class="mc-week-pending">
        <span>▥</span>
        <div>
          <strong>Recap in attesa</strong>
          <small>Quando tutte le partite della GW saranno registrate compariranno best score, partita più equilibrata, vittoria più ampia e biggest mover.</small>
        </div>
      </div>`;
    return;
  }

  if (status) status.textContent = `GW ${params.gw} completata`;

  const matches = uniqueMatchesForGw(rows, params.competition, params.gw);
  const teamRows = completedRowsFor(rows, params.competition, row => Number(row.GW) === Number(params.gw));

  if (!matches.length || !teamRows.length) {
    host.innerHTML = '<div class="mc-empty">Statistiche della giornata non disponibili.</div>';
    return;
  }

  const best = [...teamRows].sort((a,b) => parseNumber(b.PointsFor) - parseNumber(a.PointsFor))[0];
  const worst = [...teamRows].sort((a,b) => parseNumber(a.PointsFor) - parseNumber(b.PointsFor))[0];

  const closest = [...matches].sort((a,b) =>
    Math.abs(a.pointsA-a.pointsB) - Math.abs(b.pointsA-b.pointsB)
  )[0];

  const biggest = [...matches].sort((a,b) =>
    Math.abs(b.pointsA-b.pointsB) - Math.abs(a.pointsA-a.pointsB)
  )[0];

  const before = standingSnapshot(rows, params.competition, params.gw);
  const after = standingSnapshotThrough(rows, params.competition, params.gw);

  const movers = after.map((rec, idx) => {
    const beforePos = positionOf(before, rec.team);
    const afterPos = idx + 1;
    return {
      team: rec.team,
      beforePos,
      afterPos,
      delta: beforePos ? beforePos - afterPos : 0
    };
  }).sort((a,b) => b.delta-a.delta);

  const mover = movers[0];
  const biggestWinner = biggest.pointsA >= biggest.pointsB ? biggest.teamA : biggest.teamB;
  const biggestDiff = Math.abs(biggest.pointsA - biggest.pointsB);

  const cards = [
    {
      cls: "best",
      icon: "★",
      label: "Miglior punteggio",
      value: `${formatNumber(best.PointsFor)} FP`,
      team: canonicalTeamName(best.Team),
      logo: teamLogo(best.Team)
    },
    {
      cls: "worst",
      icon: "☠",
      label: "Peggior punteggio",
      value: `${formatNumber(worst.PointsFor)} FP`,
      team: canonicalTeamName(worst.Team),
      logo: teamLogo(worst.Team)
    },
    {
      cls: "closest",
      icon: "≈",
      label: "Partita più equilibrata",
      value: `${formatNumber(closest.pointsA)} - ${formatNumber(closest.pointsB)}`,
      team: `${closest.teamA} vs ${closest.teamB}`,
      logo: teamLogo(closest.teamA)
    },
    {
      cls: "biggest",
      icon: "▲",
      label: "Vittoria più ampia",
      value: `+${formatNumber(biggestDiff)} FP`,
      team: biggestWinner,
      logo: teamLogo(biggestWinner)
    },
    {
      cls: "mover",
      icon: "↗",
      label: "Maggior salto",
      value: mover && mover.delta > 0 ? `+${mover.delta} ${mover.delta === 1 ? "posizione" : "posizioni"}` : "Nessun salto",
      team: mover?.team || "–",
      logo: mover ? teamLogo(mover.team) : "icon-192.png",
      detail: mover && mover.beforePos ? `${mover.beforePos}° → ${mover.afterPos}°` : ""
    }
  ];

  host.innerHTML = cards.map(card => `
    <article class="mc-week-stat ${card.cls}">
      <div class="mc-week-label"><span>${card.icon}</span>${card.label}</div>
      <div class="mc-week-team">
        <img src="${card.logo}" alt="">
        <div>
          <strong>${escapeHtml(card.value)}</strong>
          <span>${escapeHtml(card.team)}</span>
          ${card.detail ? `<small>${escapeHtml(card.detail)}</small>` : ""}
        </div>
      </div>
    </article>
  `).join("");
}

function renderHeader(params, target, completed) {
  if (params.source === "crashoutplayoff") {
    const back = document.querySelector(".mc-back");
    if (back) {back.href="crashoutplayoff.html";back.setAttribute("aria-label","Torna al tabellone Crash Out Cup");}
  }
  document.title = `${completed ? "Match Report" : "Match Preview"} - ${params.home} vs ${params.away}`;
  document.getElementById("mc-mode").textContent = completed ? "Match Report" : "Match Preview";
  document.getElementById("mc-status").textContent = completed ? "Finale" : "Pre-partita";
  document.getElementById("mc-subtitle").textContent = params.source === "crashoutplayoff"
    ? `Crash Out Cup · ${params.stage || "Playoff"} · Gara ${params.gameNumber} · ${target?.seasonalGw ? `${target.seasonalGw}ª Serie A` : "Best of 5"}`
    : params.source === "crashout"
      ? `Crash Out Cup · Rivalry Games · Giornata ${target?.seasonalGw || params.gw}`
      : `Giornata ${target?.seasonalGw || params.gw} · ${competitionLabel(params.competition)}`;

  const homeLogo = document.getElementById("mc-home-logo");
  const awayLogo = document.getElementById("mc-away-logo");
  homeLogo.src = teamLogo(params.home);
  awayLogo.src = teamLogo(params.away);
  homeLogo.alt = `Logo ${params.home}`;
  awayLogo.alt = `Logo ${params.away}`;
  document.getElementById("mc-home-name").textContent = params.home;
  document.getElementById("mc-away-name").textContent = params.away;

  const score = document.getElementById("mc-score");
  score.innerHTML = completed
    ? `<strong>${Number.isFinite(Number(target.goalsHome)) && target.goalsHome != null ? target.goalsHome : pointsToGoals(target.pointsHome)}</strong><span>–</span><strong>${Number.isFinite(Number(target.goalsAway)) && target.goalsAway != null ? target.goalsAway : pointsToGoals(target.pointsAway)}</strong>`
    : `<span class="mc-vs-large">VS</span>`;
}

function renderStandings(params, rows, target, completed, roundComplete) {
  const before = standingSnapshot(rows, params.competition, params.gw);
  const beforeHome = positionOf(before, params.home);
  const beforeAway = positionOf(before, params.away);
  const beforeHomePts = pointsOf(before, params.home);
  const beforeAwayPts = pointsOf(before, params.away);
  const rankChip = document.getElementById("mc-rank-chip");
  rankChip.textContent = beforeHome && beforeAway ? `${beforeHome}° vs ${beforeAway}°` : "Classifica in aggiornamento";

  const box = document.getElementById("mc-standings-body");
  const title = document.getElementById("mc-standings-title");

  if (!completed) {
    title.textContent = "Contesto classifica";
    box.innerHTML = `
      <div class="mc-position-grid">
        <div><img src="${teamLogo(params.home)}" alt=""><strong>${beforeHome ? `${beforeHome}°` : "–"}</strong><small>${beforeHomePts != null ? `${beforeHomePts} pt` : ""}</small></div>
        <span>VS</span>
        <div><img src="${teamLogo(params.away)}" alt=""><strong>${beforeAway ? `${beforeAway}°` : "–"}</strong><small>${beforeAwayPts != null ? `${beforeAwayPts} pt` : ""}</small></div>
      </div>
      <p class="mc-muted">Posizioni prima della partita.</p>`;
    return;
  }

  if (!roundComplete) {
    title.textContent = "Giornata in corso";
    box.innerHTML = `
      <div class="mc-round-pending">Il risultato è registrato, ma il turno non è ancora completo.</div>
      <p class="mc-muted">L'impatto definitivo sulla classifica comparirà quando tutte le partite della giornata saranno concluse.</p>`;
    return;
  }

  const after = standingSnapshotThrough(rows, params.competition, params.gw);
  const afterHome = positionOf(after, params.home);
  const afterAway = positionOf(after, params.away);
  title.textContent = "Impatto classifica";
  box.innerHTML = `
    <div class="mc-impact-row">
      <div class="mc-impact-team"><img src="${teamLogo(params.home)}" alt=""><span>${escapeHtml(params.home)}</span></div>
      <div class="mc-impact-change"><strong>${beforeHome ? `${beforeHome}°` : "–"}</strong><b>→</b><strong>${afterHome ? `${afterHome}°` : "–"}</strong></div>
    </div>
    <div class="mc-impact-row">
      <div class="mc-impact-team"><img src="${teamLogo(params.away)}" alt=""><span>${escapeHtml(params.away)}</span></div>
      <div class="mc-impact-change"><strong>${beforeAway ? `${beforeAway}°` : "–"}</strong><b>→</b><strong>${afterAway ? `${afterAway}°` : "–"}</strong></div>
    </div>`;
}

// Le etichette sono incluse nel JS: non serve aggiornare match.css.
function ensureHistoryCompetitionStyles() {
  if (document.getElementById("mc-history-competition-styles")) return;
  const style = document.createElement("style");
  style.id = "mc-history-competition-styles";
  style.textContent = `
    .mc-recent-meta .mc-history-competition {
      display:block;
      margin-top:4px;
      color:#65738b;
      font-size:.59rem;
      line-height:1.3;
      font-weight:800;
      overflow-wrap:anywhere;
    }
    .mc-recent-meta .mc-history-competition.is-crashout {
      display:inline-block;
      width:max-content;
      max-width:100%;
      padding:3px 6px;
      border:1px solid rgba(241,41,166,.36);
      border-radius:7px;
      background:rgba(255,49,223,.12);
      color:#a91278;
      font-size:.59rem;
      line-height:1.2;
      font-weight:950;
      letter-spacing:.02em;
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.25);
    }
  `;
  document.head.appendChild(style);
}

function renderH2H(params, meetings, targetCompleted) {
  ensureHistoryCompetitionStyles();
  const stats = h2hStats(meetings);
  document.getElementById("mc-h2h-home-logo").src = teamLogo(params.home);
  document.getElementById("mc-h2h-away-logo").src = teamLogo(params.away);
  document.getElementById("mc-h2h-home-logo").alt = `Logo ${params.home}`;
  document.getElementById("mc-h2h-away-logo").alt = `Logo ${params.away}`;
  document.getElementById("mc-h2h-count").textContent = `${stats.count} sfide disponibili`;
  document.getElementById("mc-h2h-home").textContent = stats.homeWins;
  document.getElementById("mc-h2h-draw").textContent = stats.draws;
  document.getElementById("mc-h2h-away").textContent = stats.awayWins;
  document.getElementById("mc-h2h-home-label").textContent = params.home;
  document.getElementById("mc-h2h-away-label").textContent = params.away;
  document.getElementById("mc-h2h-average").textContent = stats.count
    ? `${formatNumber(stats.avgHome)} - ${formatNumber(stats.avgAway)}`
    : "–";

  const list = document.getElementById("mc-recent-list");
  // Mostriamo tutti gli scontri disponibili, compreso il match del report
  // quando è già concluso. In questo modo il numero "sfide disponibili"
  // coincide sempre con le righe consultabili negli Ultimi confronti.
  const allRecent = sortMeetings(meetings).reverse();

  const recentRowMarkup = (meeting) => {
    // Se conosciamo casa/trasferta, mostriamo SEMPRE trasferta a sinistra e casa a destra.
    // Per lo storico senza dato venue (2025/26), manteniamo l'ordine neutro delle due squadre.
    const leftTeam = meeting.venueKnown ? meeting.venueAwayTeam : params.home;
    const rightTeam = meeting.venueKnown ? meeting.venueHomeTeam : params.away;
    const leftPoints = meeting.venueKnown ? meeting.pointsVenueAway : meeting.pointsHome;
    const rightPoints = meeting.venueKnown ? meeting.pointsVenueHome : meeting.pointsAway;

    const leftResult = resultFromPoints(leftPoints, rightPoints);
    const rightResult = leftResult === "V" ? "P" : leftResult === "P" ? "V" : "N";
    const resultClass = result => result === "V" ? "win" : result === "P" ? "loss" : "draw";
    const isCrashOut = isCrashOutHistory(meeting);
    const historyLabel = historyCompetitionLabel(meeting);
    const displayLabel = isCrashOut
      ? (historyLabel.includes("Playoff") ? "✦ COC Playoff" : "✦ COC")
      : historyLabel === "Conference League" ? "Conf. League"
        : historyLabel === "Conference Championship" ? "Conf. Champ."
        : historyLabel;
    const rowTitle = meeting.venueKnown
      ? `${leftTeam} in trasferta · ${rightTeam} in casa`
      : "Casa/trasferta non disponibile nello storico";

    return `
      <div class="mc-recent-row ${meeting.venueKnown ? "has-venue" : "venue-unknown"}" title="${escapeHtml(rowTitle)}">
        <div class="mc-recent-meta">
          <strong>${escapeHtml(meeting.season)}</strong>
          <span>Giornata ${meeting.seasonWeek}</span>
          <span class="mc-history-competition ${isCrashOut ? "is-crashout" : ""}" title="${escapeHtml(historyLabel)}">${escapeHtml(displayLabel)}</span>
        </div>

        <div class="mc-recent-team mc-recent-team-left" aria-label="${escapeHtml(leftTeam)}${meeting.venueKnown ? " · trasferta" : ""}">
          <img src="${teamLogo(leftTeam)}" alt="Logo ${escapeHtml(leftTeam)}">
          <span class="mc-result-pill ${resultClass(leftResult)}" title="Risultato ${escapeHtml(leftTeam)}">${leftResult}</span>
        </div>

        <span class="mc-recent-score">
          <strong>${pointsToGoals(leftPoints)} - ${pointsToGoals(rightPoints)}</strong>
          <small>${formatNumber(leftPoints)} - ${formatNumber(rightPoints)} FP</small>
        </span>

        <div class="mc-recent-team mc-recent-team-right" aria-label="${escapeHtml(rightTeam)}${meeting.venueKnown ? " · casa" : ""}">
          <span class="mc-result-pill ${resultClass(rightResult)}" title="Risultato ${escapeHtml(rightTeam)}">${rightResult}</span>
          <img src="${teamLogo(rightTeam)}" alt="Logo ${escapeHtml(rightTeam)}">
        </div>
      </div>`;
  };

  if (!allRecent.length) {
    list.innerHTML = '<div class="mc-empty">Nessun precedente disponibile.</div>';
  } else {
    const INITIAL_RECENT_COUNT = 4;
    let expanded = false;

    const renderRecentMeetings = () => {
      const visible = expanded ? allRecent : allRecent.slice(0, INITIAL_RECENT_COUNT);
      const hiddenCount = Math.max(0, allRecent.length - INITIAL_RECENT_COUNT);

      list.innerHTML = visible.map(recentRowMarkup).join("");

      if (allRecent.length > INITIAL_RECENT_COUNT) {
        const controls = document.createElement("div");
        controls.className = "mc-recent-controls";

        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "mc-recent-toggle";
        toggle.setAttribute("aria-expanded", String(expanded));
        toggle.innerHTML = expanded
          ? 'Mostra meno <span aria-hidden="true">↑</span>'
          : `Mostra altri ${hiddenCount} <span aria-hidden="true">↓</span>`;

        toggle.addEventListener("click", () => {
          expanded = !expanded;
          renderRecentMeetings();
          if (!expanded) {
            list.closest(".mc-recent-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
        });

        controls.appendChild(toggle);
        list.appendChild(controls);
      }
    };

    renderRecentMeetings();
  }

  const records = document.getElementById("mc-records");
  const bestText = stats.best
    ? `${stats.best.team === "home" ? params.home : params.away} · ${formatNumber(stats.best.value)} FP`
    : "–";
  const biggestText = stats.biggest
    ? `${formatNumber(stats.biggest.diff)} FP`
    : "–";
  records.innerHTML = `
    <div><span>Miglior punteggio H2H</span><strong>${escapeHtml(bestText)}</strong></div>
    <div><span>Scarto massimo</span><strong>${escapeHtml(biggestText)}</strong></div>`;
}

function renderForm(params, rows, completed) {
  const home = formMarkup(rows, params.home, params, completed);
  const away = formMarkup(rows, params.away, params, completed);
  document.getElementById("mc-form-home-logo").src = teamLogo(params.home);
  document.getElementById("mc-form-away-logo").src = teamLogo(params.away);
  document.getElementById("mc-form-home-name").textContent = params.home;
  document.getElementById("mc-form-away-name").textContent = params.away;
  document.getElementById("mc-form-home-dots").innerHTML = home.dots;
  document.getElementById("mc-form-away-dots").innerHTML = away.dots;
  document.getElementById("mc-form-home-avg").textContent = home.average ? formatNumber(home.average) : "–";
  document.getElementById("mc-form-away-avg").textContent = away.average ? formatNumber(away.average) : "–";
}

function renderStory(params, meetings, rows, target, completed, roundComplete) {
  renderStakes(params, rows, target, completed, roundComplete);
}


async function loadCrashoutMatchRows() {
  const { data, error } = await supabase
    .from("crashout_rivalry_matches")
    .select("id, season, match_type, matchday, home_team, away_team, home_magic, away_magic, home_goals, away_goals, is_played")
    .eq("season", "2026")
    .order("matchday", { ascending: true });
  if (error) throw error;
  const rows = [];
  (data || []).forEach(match => {
    const played = !!match.is_played;
    const homeMagic = played ? parseNumber(match.home_magic) : 0;
    const awayMagic = played ? parseNumber(match.away_magic) : 0;
    const hg = Number(match.home_goals);
    const ag = Number(match.away_goals);
    const homeResult = played ? (hg > ag ? "V" : hg < ag ? "P" : "N") : "";
    const awayResult = homeResult === "V" ? "P" : homeResult === "P" ? "V" : homeResult;
    const phase = match.match_type === "rivalry" ? "Rivalry Games" : "Rivalry Games";
    rows.push(
      {
        MatchId: match.id, GW: Number(match.matchday), GW_Stagionale: Number(match.matchday), Date: "",
        Team: canonicalTeamName(match.home_team), Opponent: canonicalTeamName(match.away_team),
        PointsFor: homeMagic, PointsAgainst: awayMagic, GoalsFor: played ? hg : null, GoalsAgainst: played ? ag : null, Result: homeResult, Phase: phase,
        Conference: "Crash Out Cup", TeamKey: `Crash Out Cup::${canonicalTeamName(match.home_team)}`, IsHome: true
      },
      {
        MatchId: match.id, GW: Number(match.matchday), GW_Stagionale: Number(match.matchday), Date: "",
        Team: canonicalTeamName(match.away_team), Opponent: canonicalTeamName(match.home_team),
        PointsFor: awayMagic, PointsAgainst: homeMagic, GoalsFor: played ? ag : null, GoalsAgainst: played ? hg : null, Result: awayResult, Phase: phase,
        Conference: "Crash Out Cup", TeamKey: `Crash Out Cup::${canonicalTeamName(match.away_team)}`, IsHome: false
      }
    );
  });
  return rows;
}


// ---- Crash Out Cup BO5: le gare importate dall'Excel sono separate dai punteggi aggregati.
function playoffGameHref(record) {
  const params = new URLSearchParams({
    source: "crashoutplayoff", competition: "Crash Out Cup",
    seriesId: record.SeriesId, gameNumber: String(record.GameNumber),
    matchId: record.MatchId, stage: record.Phase,
    home: record.Team, away: record.Opponent, seriesHome:record.Team, seriesAway:record.Opponent,
    gw: String(record.GameNumber)
  });
  return `match.html?${params.toString()}`;
}

async function loadPlayoffMatchRows() {
  const {data, error} = await supabase.from("crashout_playoff_games")
    .select("season, series_id, stage, game_number, league_gw, serie_a_gw, home_team, away_team, home_magic, away_magic, home_goals, away_goals, is_played")
    .eq("season", "2026")
    .order("game_number", {ascending: true});
  if (error) throw new Error("Risultati playoff non disponibili. Verifica la tabella crashout_playoff_games e i permessi di lettura.");
  const rows = [];
  (data || []).forEach(game => {
    const played = game.is_played === true;
    const h = played ? parseNumber(game.home_magic) : 0;
    const a = played ? parseNumber(game.away_magic) : 0;
    const gh = Number(game.home_goals);
    const ga = Number(game.away_goals);
    const result = played && gh > ga ? "V" : played && gh < ga ? "P" : played ? "N" : "";
    const reverse = result === "V" ? "P" : result === "P" ? "V" : result;
    const id = `${game.series_id}:${game.game_number}`;
    const base = {MatchId:id, SeriesId:game.series_id, GameNumber:Number(game.game_number),
      GW:Number(game.game_number), GW_Stagionale:Number(game.serie_a_gw) || Number(game.game_number),
      Date:"", Phase:game.stage, Conference:"Crash Out Cup"};
    rows.push({...base, Team:canonicalTeamName(game.home_team), Opponent:canonicalTeamName(game.away_team),
      PointsFor:h, PointsAgainst:a, GoalsFor:gh, GoalsAgainst:ga, Result:result,
      TeamKey:`Crash Out Cup::${canonicalTeamName(game.home_team)}`, IsHome:true});
    rows.push({...base, Team:canonicalTeamName(game.away_team), Opponent:canonicalTeamName(game.home_team),
      PointsFor:a, PointsAgainst:h, GoalsFor:ga, GoalsAgainst:gh, Result:reverse,
      TeamKey:`Crash Out Cup::${canonicalTeamName(game.away_team)}`, IsHome:false});
  });
  return rows;
}

async function loadPlayoffSeriesScore(seriesId) {
  const [scoreResult,seedResult]=await Promise.all([
    supabase.from("crashout_playoff_scores").select("series_id,home_score,away_score"),
    supabase.from("crashout_playoff_seeds").select("seed_number,team_name").eq("season","2026")
  ]);
  if (scoreResult.error) console.warn("Punteggi serie playoff non disponibili:",scoreResult.error);
  if (seedResult.error) console.warn("Seed playoff non disponibili:",seedResult.error);
  const scoreMap=new Map((scoreResult.data || []).map(r=>[r.series_id,{home:Number(r.home_score||0),away:Number(r.away_score||0)}]));
  const bySeed=Object.fromEntries((seedResult.data||[]).map(r=>[Number(r.seed_number),canonicalTeamName(r.team_name)]));
  const bracket=new Map();
  const pair=(id,home,away)=>{bracket.set(id,{seriesHome:home||null,seriesAway:away||null});};
  pair("L1",bySeed[1],bySeed[16]);pair("L2",bySeed[8],bySeed[9]);
  pair("L3",bySeed[5],bySeed[12]);pair("L4",bySeed[4],bySeed[13]);
  pair("R1",bySeed[3],bySeed[14]);pair("R2",bySeed[6],bySeed[11]);
  pair("R3",bySeed[7],bySeed[10]);pair("R4",bySeed[2],bySeed[15]);
  const winner=(id)=>{
    const s=scoreMap.get(id)||{home:0,away:0};
    const m=bracket.get(id);
    return s.home>=3&&s.home>s.away ? m?.seriesHome : s.away>=3&&s.away>s.home ? m?.seriesAway : null;
  };
  pair("LSF1",winner("L1"),winner("L2"));pair("LSF2",winner("L3"),winner("L4"));
  pair("RSF1",winner("R1"),winner("R2"));pair("RSF2",winner("R3"),winner("R4"));
  pair("LCF",winner("LSF1"),winner("LSF2"));pair("RCF",winner("RSF1"),winner("RSF2"));
  pair("F",winner("LCF"),winner("RCF"));
  return {...(scoreMap.get(seriesId)||{home:0,away:0}),...(bracket.get(seriesId)||{})};
}

function playoffSeriesCurrentLabel(params, score) {
  return `Best of 5 · ${score.home}–${score.away}`;
}

function renderPlayoffSeriesContext(params, score, playedRows, target) {
  document.getElementById("mc-standings-title").textContent = "Situazione serie · Best of 5";
  // Il tabellone è ordinato per seed; l'Excel può invertire casa e trasferta.
  const firstTeam=score.seriesHome || params.seriesHome;
  const switched=firstTeam && normalizeTeamName(params.home)!==normalizeTeamName(firstTeam);
  const homeWins=switched ? score.away : score.home;
  const awayWins=switched ? score.home : score.away;
  document.getElementById("mc-rank-chip").textContent=`Best of 5 · ${homeWins}–${awayWins}`;
  const winner = homeWins >= 3 && homeWins > awayWins ? params.home : awayWins >= 3 && awayWins > homeWins ? params.away : null;
  const imported = new Set(playedRows.filter(r=>r.SeriesId===params.seriesId && r.IsHome && isCompletedRow(r)).map(r=>r.GameNumber)).size;
  document.getElementById("mc-standings-body").innerHTML = `
    <div class="mc-position-grid">
      <div><img src="${teamLogo(params.home)}" alt=""><strong>${homeWins}</strong><small>Vittorie serie *</small></div>
      <span>–</span>
      <div><img src="${teamLogo(params.away)}" alt=""><strong>${awayWins}</strong><small>Vittorie serie *</small></div>
    </div>
    <p class="mc-muted">${winner ? `${escapeHtml(winner)} qualificata.` : "La prima squadra a 3 vittorie passa il turno."} ${imported} ${imported===1?"gara importata":"gare importate"} nel Match Center. * Punteggio della serie pubblicato sul tabellone, distinto dai gol della singola gara.</p>`;
  const title = document.getElementById("mc-story-title");
  const badge = document.getElementById("mc-stakes-badge");
  const story = document.getElementById("mc-story-body");
  const scenarios = document.getElementById("mc-stakes-scenarios");
  if (target) {
    title.textContent="Match impact";
    badge.textContent=`${(params.stage || "Playoff").toUpperCase()} · GARA ${params.gameNumber}`;
    const gh=target.goalsHome ?? pointsToGoals(target.pointsHome);
    const ga=target.goalsAway ?? pointsToGoals(target.pointsAway);
    story.textContent=`Gara ${params.gameNumber}: ${params.home} ${gh} - ${ga} ${params.away} (${formatNumber(target.pointsHome)} - ${formatNumber(target.pointsAway)} fantapunti).`;
    scenarios.innerHTML=`<div class="mc-stakes-row"><span>◎</span><div><strong>Serie ${homeWins}–${awayWins}</strong><small>Il punteggio Bo5 è gestito separatamente sul tabellone. Un pareggio nei gol non viene convertito automaticamente in una vittoria della serie.</small></div></div>`;
  } else {
    title.textContent="What's at stake";
    badge.textContent=`MATCH PREVIEW · GARA ${params.gameNumber}`;
    story.textContent=`La Gara ${params.gameNumber} di ${params.stage || "playoff"} non è ancora stata importata nel Match Center. Il tabellone può comunque avere un punteggio aggiornato.`;
    scenarios.innerHTML=`<div class="mc-stakes-row pending"><span>◎</span><div><strong>Risultato da importare</strong><small>L'amministratore può caricare il file Excel di questa gara dalla pagina Crash Out Cup.</small></div></div>`;
  }
}

function renderPlayoffOtherMatches(params, playedRows) {
  const host=document.getElementById("mc-around-list");
  document.getElementById("mc-around-title").textContent="Altre sfide della Gara";
  document.getElementById("mc-around-subtitle").textContent=`${params.stage || "Playoff"} · Gara ${params.gameNumber}`;
  const games=playedRows.filter(r=>r.IsHome && r.Phase===(params.stage||r.Phase) && r.GameNumber===params.gameNumber && isCompletedRow(r));
  if (!games.length) { host.innerHTML='<div class="mc-empty">Nessun risultato ancora importato per questa gara.</div>';return;}
  host.innerHTML=games.map(r=>{
    const current=r.MatchId===params.matchId;
    const href=playoffGameHref(r);
    return `<article class="mc-around-match ${current ? "is-current" : ""}">
      <div class="mc-around-team"><img src="${teamLogo(r.Team)}" alt=""><strong>${escapeHtml(r.Team)}</strong></div>
      <div class="mc-around-score"><strong>${r.GoalsFor} - ${r.GoalsAgainst}</strong><small>${formatNumber(r.PointsFor)} - ${formatNumber(r.PointsAgainst)} FP</small></div>
      <div class="mc-around-team away"><img src="${teamLogo(r.Opponent)}" alt=""><strong>${escapeHtml(r.Opponent)}</strong></div>
      <a class="mc-around-link" href="${href}">${current ? "QUESTA PARTITA" : "MATCH REPORT"}<span>›</span></a>
    </article>`;
  }).join("");
}

function renderPlayoffWeekNumbers(params, playedRows) {
  const host=document.getElementById("mc-week-numbers");
  const status=document.getElementById("mc-week-status");
  const games=playedRows.filter(r=>r.IsHome && r.Phase===(params.stage||r.Phase) && r.GameNumber===params.gameNumber && isCompletedRow(r));
  const expected={"Ottavi":8,"Quarti":4,"Semifinali":2,"Finale":1}[params.stage] || 0;
  status.textContent=`${games.length}${expected ? `/${expected}` : ""} partite importate`;
  if (!games.length) {host.innerHTML='<div class="mc-empty">Statistiche disponibili dopo il caricamento dei risultati.</div>';return;}
  const teams=games.flatMap(g=>[{name:g.Team,points:g.PointsFor},{name:g.Opponent,points:g.PointsAgainst}]);
  const best=[...teams].sort((a,b)=>b.points-a.points)[0];
  const closest=[...games].sort((a,b)=>Math.abs(a.PointsFor-a.PointsAgainst)-Math.abs(b.PointsFor-b.PointsAgainst))[0];
  host.innerHTML=`<article class="mc-week-stat best"><div class="mc-week-label">★ Miglior fantapunteggio</div><div class="mc-week-team"><img src="${teamLogo(best.name)}" alt=""><div><strong>${formatNumber(best.points)} FP</strong><span>${escapeHtml(best.name)}</span></div></div></article>
  <article class="mc-week-stat closest"><div class="mc-week-label">≈ Sfida più equilibrata</div><div class="mc-week-team"><img src="${teamLogo(closest.Team)}" alt=""><div><strong>${formatNumber(closest.PointsFor)} - ${formatNumber(closest.PointsAgainst)} FP</strong><span>${escapeHtml(closest.Team)} vs ${escapeHtml(closest.Opponent)}</span></div></div></article>`;
}


// ============ MATCH CENTER INSIGHTS: ANDAMENTO & RIVALITA' ============
// I dati restano di sola lettura: nessuna modifica a risultati, notifiche o Bo5.
const MC_TREND_COLORS = ["#3ad4e9", "#fc73c4"];

function isChampionshipSource(competition) {
  const key = normalizeTeamName(competition);
  return ["confa", "confb", "unificata", "roundrobin", "conferenceleague",
    "conferencechampionship", "campionato", "playoff", "playoffs"].includes(key)
    || (key.startsWith("playoff") && !key.includes("crashout"));
}

// Classifica progressiva ricostruita giornata per giornata.
// Il campionato assegna 3 punti per vittoria e 1 per pareggio; i fantapunti
// servono soltanto a risolvere i pari punti, NON diventano il valore del grafico.
function mcLeagueGroup(row) {
  const key = normalizeTeamName(row.Conference);
  if (key === "confa" || key === "conferenceleague") return "Conf A";
  if (key === "confb" || key === "conferencechampionship") return "Conf B";
  if (key === "unificata" || key === "roundrobin") return "Unificata";
  return null;
}

function mcLeagueMatchResult(row) {
  // Usa il risultato omologato quando è disponibile, anche nelle versioni
  // W/D/L del database; altrimenti applica la conversione gol della lega.
  const explicit = String(row.Result || "").trim().toUpperCase();
  if (["V", "W"].includes(explicit)) return "V";
  if (["N", "D", "X"].includes(explicit)) return "N";
  if (["P", "L"].includes(explicit)) return "P";
  return resultFromPoints(row.PointsFor, row.PointsAgainst);
}

function mcLeagueStandingsTimeline(rows) {
  const games = new Map();
  const groupTeams = new Map();
  const groupWeeks = new Map();

  rows.forEach(row => {
    const group=mcLeagueGroup(row);
    if (!group) return;
    const official=String(row.Result || "").trim().toUpperCase();
    if (!isCompletedRow(row) && !["V","N","P","W","D","L","X"].includes(official)) return;
    const week=Number(row.GW_Stagionale) || Number(row.GW);
    const fp=Number(String(row.PointsFor ?? "").replace(",", "."));
    if (!Number.isInteger(week) || week<1 || !Number.isFinite(fp) || fp<0) return;
    const team=canonicalTeamName(row.Team);
    const key=normalizeTeamName(team);
    if (!key) return;
    if (!groupTeams.has(group)) groupTeams.set(group,new Map());
    groupTeams.get(group).set(key,team);
    if (!groupWeeks.has(group)) groupWeeks.set(group,new Set());
    groupWeeks.get(group).add(week);
    // Una stessa giornata/team può arrivare due volte da fonti diverse.
    const id=`${group}|${week}|${key}`;
    if (!games.has(id)) games.set(id,{group,week,team,key,fp,
      gf:pointsToGoals(row.PointsFor),ga:pointsToGoals(row.PointsAgainst),result:mcLeagueMatchResult(row)});
  });

  const timeline=new Map();
  const groupSizes=new Map();
  for (const [group,teamMap] of groupTeams) {
    const state=new Map([...teamMap].map(([key,team])=>[key,{team,key,pts:0,fp:0,gf:0,ga:0,played:0}]));
    groupSizes.set(group,teamMap.size);
    for (const week of [...groupWeeks.get(group)].sort((a,b)=>a-b)) {
      for (const [key,entry] of state) {
        const game=games.get(`${group}|${week}|${key}`);
        if (!game) continue;
        entry.pts += game.result==="V" ? 3 : game.result==="N" ? 1 : 0;
        entry.fp += game.fp;
        entry.gf += game.gf;
        entry.ga += game.ga;
        entry.played++;
      }
      const ordered=[...state.values()].sort((a,b)=>
        b.pts-a.pts || b.fp-a.fp || b.gf-a.gf || a.ga-b.ga || a.team.localeCompare(b.team,"it")
      );
      ordered.forEach((entry,index)=>{
        // Non creare un punto fittizio nel grafico se la squadra non ha
        // effettivamente un risultato registrato per questa giornata.
        if (!games.has(`${group}|${week}|${entry.key}`)) return;
        timeline.set(`${group}|${week}|${entry.key}`,{
          gw:week,group,teamKey:entry.key,position:index+1,points:entry.pts,played:entry.played
        });
      });
    }
  }
  return {timeline,groupSizes};
}

function renderSeasonTrend(params, leagueRows) {
  const shell=document.getElementById("mc-trends-section");
  const svg=document.getElementById("mc-trends-svg");
  const legend=document.getElementById("mc-trends-legend");
  const summary=document.getElementById("mc-trends-summary");
  const caption=document.getElementById("mc-trends-caption");
  if (!shell || !svg || !legend || !summary || !caption) return;
  shell.hidden=false;

  const names=[params.home,params.away];
  const {timeline,groupSizes}=mcLeagueStandingsTimeline(leagueRows);
  const tracked=names.map(name=>{
    const key=normalizeTeamName(name);
    return [...timeline.values()].filter(point=>point.teamKey===key)
      .sort((a,b)=>a.gw-b.gw);
  });
  const allWeeks=[...new Set(tracked.flatMap(list=>list.map(p=>p.gw)))].sort((a,b)=>a-b);
  const groups=[...new Set(tracked.flatMap(list=>list.map(p=>p.group)))];
  const mixedGroups=groups.includes("Conf A") && groups.includes("Conf B");
  caption.textContent=`Stagione ${CURRENT_SEASON} · solo campionato · ${allWeeks.length} giornate`;
  if (!allWeeks.length) {
    svg.removeAttribute("viewBox");svg.innerHTML="";legend.innerHTML="";
    summary.innerHTML='<p class="mc-insights-empty">La classifica non è ancora disponibile per queste squadre.</p>';
    return;
  }

  let mode="position";
  const buttons=shell.querySelectorAll("[data-mc-trend-mode]");
  const draw=()=>{
    const maxRank=Math.max(8,...[...groupSizes.values()],...tracked.flatMap(list=>list.map(p=>p.position)));
    const allPoints=tracked.flatMap(list=>list.map(p=>p.points));
    const maxPts=Math.max(3,Math.ceil(Math.max(...allPoints)/5)*5);
    const width=Math.max(650,105+(allWeeks.length-1)*55),height=315;
    const left=57,right=23,top=27,bottom=49;
    const w=width-left-right,h=height-top-bottom;
    const x=week=>left+(allWeeks.indexOf(week)/Math.max(1,allWeeks.length-1))*w;
    // La classifica ha 1° IN ALTO. I punti vanno invece dal basso verso l'alto.
    const y=value=>mode==="position"
      ? top+(value-1)/Math.max(1,maxRank-1)*h
      : top+(maxPts-value)/maxPts*h;
    const ticks=mode==="position"
      ? Array.from({length:maxRank<=8?maxRank:5},(_,i)=>maxRank<=8?i+1:Math.round(1+i*(maxRank-1)/4))
      : Array.from({length:6},(_,i)=>maxPts*i/5);
    const grid=ticks.map(t=>`<g><line x1="${left}" x2="${width-right}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}" stroke="#a8b7c9" stroke-opacity=".16" stroke-dasharray="3 5"/><text x="${left-12}" y="${(y(t)+4).toFixed(1)}" text-anchor="end" fill="#aab9d0" font-size="12">${mode==="position"?t+"°":formatNumber(t)}</text></g>`).join("");
    const axisTitle=mode==="position"?"POSIZIONE":"PUNTI";
    const labels=allWeeks.map(week=>`<text x="${x(week).toFixed(1)}" y="${height-21}" text-anchor="middle" fill="#aebcd0" font-size="12">${week}</text>`).join("");
    const paths=tracked.map((list,side)=>{
      const color=MC_TREND_COLORS[side],field=mode==="position"?"position":"points";
      // Separare i segmenti se mancano giornate o cambia la fase del torneo.
      let d="",previous=null;
      for (const p of list) {
        const continuous=previous && p.gw===previous.gw+1 && p.group===previous.group;
        d+=`${continuous?" L":" M"} ${x(p.gw).toFixed(1)} ${y(p[field]).toFixed(1)}`;
        previous=p;
      }
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
      ${list.map(p=>{
        const value=mode==="position"?p.position+"° posto":p.points+" punti";
        const label=`${names[side]} · G${p.gw} · ${value}`;
        return `<circle cx="${x(p.gw).toFixed(1)}" cy="${y(p[field]).toFixed(1)}" r="5" fill="${color}" stroke="#081728" stroke-width="2" tabindex="0" role="img" aria-label="${escapeHtml(label)}"><title>${escapeHtml(label)} · ${escapeHtml(p.group)}</title></circle>`;
      }).join("")}`;
    }).join("");
    svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
    svg.setAttribute("width",String(width));svg.setAttribute("height",String(height));
    svg.setAttribute("aria-label",`Andamento ${mode==="position"?"della posizione":"dei punti"} in classifica di ${names.join(" e ")} · ${CURRENT_SEASON}`);
    svg.innerHTML=`<rect x="0" y="0" width="${width}" height="${height}" fill="transparent"/>${grid}${paths}${labels}<text x="${left}" y="${height-5}" font-size="10" fill="#7189a6">GIORNATA · ${axisTitle}</text>`;
    legend.innerHTML=names.map((name,i)=>{
      const last=tracked[i].at(-1);
      const current=last ? mode==="position"?`${last.position}° posto`:`${last.points} pt` : "–";
      return `<div class="mc-trend-team"><i style="background:${MC_TREND_COLORS[i]}"></i><img src="${teamLogo(name)}" alt=""><span>${escapeHtml(name)}</span><strong>${current}</strong></div>`;
    }).join("");
    const changes=tracked.map((list,i)=>{
      if (!list.length)return `${escapeHtml(names[i])}: nessun dato`;
      const first=list[0],last=list.at(-1);
      if (mode==="points")return `${escapeHtml(names[i])}: <strong>${last.points} pt</strong> (G${last.gw})`;
      const delta=first.position-last.position;
      return `${escapeHtml(names[i])}: <strong>${last.position}°</strong> ${delta>0?`(↑${delta})`:delta<0?`(↓${-delta})`:"(stabile)"}`;
    });
    summary.innerHTML=`<span>${mode==="position"?"1° posto in alto · posizione dopo ogni giornata":"Punti cumulati in classifica (3-1-0)"}${mixedGroups?" · ogni squadra nella propria conference":""}</span><span>${changes.join(" · ")}</span>`;
    buttons.forEach(button=>{
      const active=button.dataset.mcTrendMode===mode;
      button.classList.toggle("is-active",active);
      button.setAttribute("aria-pressed",String(active));
    });
  };
  buttons.forEach(button=>button.addEventListener("click",()=>{
    mode=button.dataset.mcTrendMode==="points"?"points":"position";
    draw();
  }));
  draw();
}

async function loadAllHistoricalMatchRows() {
  // L'archivio può superare i 1000 record in futuro: paginazione esplicita.
  const all=[];
  const pageSize=1000;
  for(let offset=0;offset<10000;offset+=pageSize) {
    const {data,error}=await supabase.from("match_history")
      .select("season,season_week,competition,phase,conference,team_a,team_b,score_a,score_b")
      .order("season",{ascending:true}).order("season_week",{ascending:true})
      .order("team_a",{ascending:true}).order("team_b",{ascending:true})
      .range(offset,offset+pageSize-1);
    if(error)throw error;
    all.push(...(data||[]));
    if(!data||data.length<pageSize)break;
  }
  return all;
}

function buildHistoricalRivalries(historyRows,currentRows) {
  const records=new Map();
  const matchPhaseKey=value=>{
    const k=normalizeTeamName(value||"regular");
    if(k.includes("rivalry"))return "rivalry";
    if(k.includes("ottav"))return "ottavi";
    if(k.includes("quart"))return "quarti";
    if(k.includes("semifinal"))return "semifinali";
    if(k.includes("final"))return "finale";
    return k;
  };
  const insert=(id,teamA,teamB,pointsA,pointsB,competition,goalsA=null,goalsB=null,preferCurrent=false)=>{
    if(!teamA||!teamB||normalizeTeamName(teamA)===normalizeTeamName(teamB))return;
    const a=canonicalTeamName(teamA),b=canonicalTeamName(teamB);
    const fpA=Number(String(pointsA??"").replace(",","."));
    const fpB=Number(String(pointsB??"").replace(",","."));
    if(!Number.isFinite(fpA)||!Number.isFinite(fpB))return;
    const gA=goalsA===null||goalsA===undefined?pointsToGoals(fpA):Number(goalsA);
    const gB=goalsB===null||goalsB===undefined?pointsToGoals(fpB):Number(goalsB);
    if(!Number.isFinite(gA)||!Number.isFinite(gB))return;
    const normPair=[normalizeTeamName(a),normalizeTeamName(b)].sort().join("|");
    const key=`${id}|${normPair}`;
    if(!records.has(key)||preferCurrent)records.set(key,{a,b,goalsA:gA,goalsB:gB,kind:isChampionshipSource(competition)?"league":"cup"});
  };

  (historyRows||[]).forEach(row=>{
    const type=row.conference||row.competition||"Campionato";
    const kind=/crash\s*out|\bcoc\b/i.test(String(row.competition||""))?"Crash Out Cup":type;
    const id=`${row.season}:${row.season_week}:${normalizeTeamName(kind)}:${matchPhaseKey(row.phase)}`;
    insert(id,row.team_a,row.team_b,row.score_a,row.score_b,kind);
  });

  (currentRows||[]).filter(isCompletedRow).forEach(row=>{
    const week=Number(row.GW_Stagionale)||Number(row.GW)||0;
    const id=`${CURRENT_SEASON}:${week}:${normalizeTeamName(row.Conference)}:${matchPhaseKey(row.Phase)}`;
    // Le righe speculari e l'eventuale storico già archiviato valgono una sola volta.
    insert(id,row.Team,row.Opponent,row.PointsFor,row.PointsAgainst,row.Conference,row.GoalsFor,row.GoalsAgainst,true);
  });
  return [...records.values()];
}

function teamRivalryLeaderboard(team,matches,scope) {
  const byOpponent=new Map();
  const target=normalizeTeamName(team);
  matches.forEach(match=>{
    if(scope==="league"&&match.kind!=="league")return;
    const isA=normalizeTeamName(match.a)===target;
    const isB=normalizeTeamName(match.b)===target;
    if(!isA&&!isB)return;
    const rival=isA?match.b:match.a;
    const key=normalizeTeamName(rival);
    if(!byOpponent.has(key))byOpponent.set(key,{name:rival,w:0,d:0,l:0,n:0});
    const rec=byOpponent.get(key);
    const gf=isA?match.goalsA:match.goalsB;
    const ga=isA?match.goalsB:match.goalsA;
    rec.n++;
    if(gf>ga)rec.w++;
    else if(gf<ga)rec.l++;
    else rec.d++;
  });
  const vals=[...byOpponent.values()];
  const losses=vals.filter(r=>r.l>0).sort((a,b)=>b.l-a.l||(b.l/b.n)-(a.l/a.n)||b.n-a.n||a.name.localeCompare(b.name,"it"));
  const wins=vals.filter(r=>r.w>0).sort((a,b)=>b.w-a.w||(b.w/b.n)-(a.w/a.n)||b.n-a.n||a.name.localeCompare(b.name,"it"));
  return {nemesis:losses[0]||null,victim:wins[0]||null, total:vals.reduce((s,r)=>s+r.n,0),
    tiedNemesis:losses[0]?losses.filter(r=>r.l===losses[0].l).length:0,
    tiedVictim:wins[0]?wins.filter(r=>r.w===wins[0].w).length:0};
}

function renderRivalryFortunes(params, historicalRecords,currentRows,historyError=false) {
  const section=document.getElementById("mc-rivalries-section");
  const grid=document.getElementById("mc-rivalries-grid");
  const caption=document.getElementById("mc-rivalries-caption");
  if(!section||!grid||!caption)return;
  section.hidden=false;
  const matches=buildHistoricalRivalries(historicalRecords,currentRows);
  let scope="all";
  const filters=section.querySelectorAll("[data-mc-rivalry-scope]");
  const card=(team,record,type,tiedCount)=>{
    const isNemesis=type==="nemesis";
    const cls=isNemesis?"nemesis":"victim";
    const title=isNemesis?"BESTIA NERA":"VITTIMA PREFERITA";
    const icon=isNemesis?"☠":"♛";
    if(!record)return `<div class="mc-rivalry-stat ${cls}"><div class="mc-rivalry-stat-heading"><span>${icon}</span>${title}</div><div class="mc-rivalry-no-data">Nessuna ${isNemesis?"sconfitta":"vittoria"} registrata</div></div>`;
    const amount=isNemesis?record.l:record.w;
    const pct=Math.round(100*amount/record.n);
    return `<div class="mc-rivalry-stat ${cls}">
      <div class="mc-rivalry-stat-heading"><span>${icon}</span>${title}</div>
      <div class="mc-rivalry-rival"><img src="${teamLogo(record.name)}" alt=""><strong>${escapeHtml(record.name)}</strong></div>
      <div class="mc-rivalry-number"><strong>${amount}</strong><span>${isNemesis?"sconfitte":"vittorie"}<small>${pct}% su ${record.n} sfide</small></span></div>
      <div class="mc-rivalry-record"><span>${record.w}V</span><span>${record.d}N</span><span>${record.l}P</span></div>
      ${tiedCount>1?`<small class="mc-rivalry-tie">${tiedCount-1} ${tiedCount===2?"altro avversario a pari numero":"altri avversari a pari numero"} di ${isNemesis?"sconfitte":"vittorie"}</small>`:""}
    </div>`;
  };
  const draw=()=>{
    grid.innerHTML=[params.home,params.away].map(team=>{
      const r=teamRivalryLeaderboard(team,matches,scope);
      return `<article class="mc-rivalry-team">
        <div class="mc-rivalry-team-head"><img src="${teamLogo(team)}" alt=""><div><h3>${escapeHtml(team)}</h3><small>${r.total} partite nello storico selezionato</small></div></div>
        <div class="mc-rivalry-stats">${card(team,r.nemesis,"nemesis",r.tiedNemesis)}${card(team,r.victim,"victim",r.tiedVictim)}</div>
      </article>`;
    }).join("");
    filters.forEach(button=>{
      const active=button.dataset.mcRivalryScope===scope;
      button.classList.toggle("is-active",active);
      button.setAttribute("aria-pressed",String(active));
    });
    caption.textContent=(scope==="league"?"Campionato e playoff di lega":"Campionato, Rivalry Games e Crash Out Playoff")
      +" · stagioni disponibili · vittorie calcolate sui gol (non sui soli fantapunti)."
      +(historyError?" Archivio storico precedente non disponibile: vengono usati i risultati correnti.":"");
  };
  filters.forEach(button=>button.addEventListener("click",()=>{scope=button.dataset.mcRivalryScope;draw();}));
  draw();
}
// ============ FINE MATCH CENTER INSIGHTS ============

function showError(message) {
  document.getElementById("mc-loading").style.display = "none";
  const app = document.getElementById("mc-app");
  app.hidden = false;
  app.innerHTML = `<section class="mc-error"><strong>Match Center non disponibile</strong><p>${escapeHtml(message)}</p><a href="index.html">← Torna alla Home</a></section>`;
}

async function initMatchCenter() {
  const params = getParams();
  if (!params.home || !params.away || !params.gw || (params.source === "crashoutplayoff" && (!params.seriesId || !params.gameNumber || !params.matchId)) || normalizeTeamName(params.home) === normalizeTeamName(params.away)) {
    showError("Parametri della partita mancanti o non validi.");
    return;
  }

  try {
    // Carichiamo sia campionato sia Crash Out Cup per gli H2H,
    // ma usiamo SEMPRE la competizione corrente per risultato e classifica.
    // Un problema alla fonte secondaria non deve bloccare il Match Center.
    const primaryIsCrashout = params.source === "crashout";
    const primaryIsPlayoff = params.source === "crashoutplayoff";
    const [rows, history, fixtures, extraHistoryRows, seriesScore, allHistoricalResult] = await Promise.all([
      primaryIsPlayoff ? loadPlayoffMatchRows() : primaryIsCrashout ? loadCrashoutMatchRows() : loadResultsRows(),
      historicalMeetings(params),
      loadLeagueFixtures(params),
      // Storico H2H unificato in ogni Match Center: campionato + Rivalry + playoff Bo5.
      // La fonte della partita resta quella primaria, quindi non confondiamo i risultati.
      Promise.allSettled([
        ...(primaryIsPlayoff ? [] : [loadPlayoffMatchRows()]),
        ...(primaryIsCrashout ? [] : [loadCrashoutMatchRows()]),
        ...(primaryIsPlayoff || primaryIsCrashout ? [loadResultsRows()] : [])
      ]).then(results => results.flatMap(result => {
        if (result.status === "fulfilled") return result.value;
        console.warn("Fonte secondaria H2H non disponibile:", result.reason);
        return [];
      })),
      primaryIsPlayoff ? loadPlayoffSeriesScore(params.seriesId) : Promise.resolve(null),
      loadAllHistoricalMatchRows().then(data=>({data,error:false})).catch(error=>{
        console.warn("Archivio storico per Bestia Nera non disponibile:",error);
        return {data:[],error:true};
      })
    ]);

    const target = targetMatch(rows, params);
    const completed = !!target;
    const roundComplete = completed && roundIsComplete(rows, params);
    const currentMeetings = currentSeasonMeetings([...rows, ...extraHistoryRows], params);
    const meetings = sortMeetings(uniqueMeetings([...history, ...currentMeetings]));

    document.getElementById("mc-loading").style.display = "none";
    document.getElementById("mc-app").hidden = false;

    renderHeader(params, target, completed);
    // Il grafico usa SOLO i risultati del campionato corrente anche se si arriva dalla coppa.
    renderSeasonTrend(params, [...rows,...extraHistoryRows]);
    // Rivalità: vecchie stagioni + dati correnti di tutte le competizioni, una sfida per volta.
    renderRivalryFortunes(params, allHistoricalResult.data, [...rows,...extraHistoryRows], allHistoricalResult.error);
    if (primaryIsPlayoff) {
      // La serie Bo5 è indipendente dal singolo risultato e non viene mai modificata qui.
      renderPlayoffSeriesContext(params, seriesScore, rows, target);
      renderH2H(params, meetings, completed);
      renderForm(params, [...rows, ...extraHistoryRows], completed);
      renderPlayoffOtherMatches(params, rows);
      renderPlayoffWeekNumbers(params, rows);
    } else {
      renderStandings(params, rows, target, completed, roundComplete);
      renderH2H(params, meetings, completed);
      renderForm(params, rows, completed);
      renderStory(params, meetings, rows, target, completed, roundComplete);
      renderAroundLeague(params, rows, fixtures);
      renderWeekNumbers(params, rows, roundComplete);
    }
  } catch (error) {
    console.error("Errore Match Center:", error);
    showError(error?.message || "Errore durante il caricamento dei dati.");
  }
}

document.addEventListener("DOMContentLoaded", initMatchCenter);
