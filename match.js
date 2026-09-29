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
  return "Conference League";
}

function getParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    home: canonicalTeamName(params.get("home")),
    away: canonicalTeamName(params.get("away")),
    gw: Number(params.get("gw")) || null,
    competition: params.get("competition") || "Conf A"
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
    resultHome: directIsHome ? rowResult(direct) : ({ V: "P", P: "V", N: "N" }[rowResult(direct)] || "N")
  };
}

function roundIsComplete(rows, params) {
  const uniqueTeams = new Set(
    completedRowsFor(rows, params.competition, row => Number(row.GW) === Number(params.gw))
      .map(row => normalizeTeamName(row.Team))
  );
  const expected = params.competition === "Unificata" ? 16 : 8;
  return uniqueTeams.size >= expected;
}

function currentSeasonMeetings(rows, params) {
  const seen = new Set();
  const meetings = [];

  rows.filter(isCompletedRow).forEach(row => {
    if (!pairMatches(row.Team, row.Opponent, params.home, params.away)) return;
    const key = `${String(row.Conference || "")}|${Number(row.GW) || 0}|${[normalizeTeamName(row.Team), normalizeTeamName(row.Opponent)].sort().join("|")}`;
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
      isTarget: String(row.Conference || "").trim() === params.competition && Number(row.GW) === Number(params.gw)
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

function sortMeetings(meetings) {
  const seasonOrder = { "2023/24": 1, "2025/26": 2, "2026/27": 3 };
  return [...meetings].sort((a, b) =>
    (seasonOrder[a.season] || 99) - (seasonOrder[b.season] || 99) || a.seasonWeek - b.seasonWeek
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

function renderHeader(params, target, completed) {
  document.title = `${completed ? "Match Report" : "Match Preview"} - ${params.home} vs ${params.away}`;
  document.getElementById("mc-mode").textContent = completed ? "MATCH REPORT" : "MATCH PREVIEW";
  document.getElementById("mc-status").textContent = completed ? "Finale" : "Pre-partita";
  document.getElementById("mc-subtitle").textContent = `Giornata ${target?.seasonalGw || params.gw} · ${competitionLabel(params.competition)}`;

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
    ? `<strong>${pointsToGoals(target.pointsHome)}</strong><span>–</span><strong>${pointsToGoals(target.pointsAway)}</strong>`
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

function renderH2H(params, meetings, targetCompleted) {
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
  const allRecent = sortMeetings(meetings)
    .filter(meeting => !(targetCompleted && meeting.isTarget))
    .reverse();

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
    const rowTitle = meeting.venueKnown
      ? `${leftTeam} in trasferta · ${rightTeam} in casa`
      : "Casa/trasferta non disponibile nello storico";

    return `
      <div class="mc-recent-row ${meeting.venueKnown ? "has-venue" : "venue-unknown"}" title="${escapeHtml(rowTitle)}">
        <div class="mc-recent-meta">
          <strong>${escapeHtml(meeting.season)}</strong>
          <span>Giornata ${meeting.seasonWeek}</span>
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
  const stats = h2hStats(meetings);
  const storyTitle = document.getElementById("mc-story-title");
  const storyBody = document.getElementById("mc-story-body");

  if (!completed) {
    storyTitle.textContent = "Prima del match";
    if (!stats.count) {
      storyBody.textContent = "Nessun precedente disponibile tra le due squadre. Il confronto parte senza uno storico utilizzabile.";
      return;
    }
    if (stats.homeWins === stats.awayWins) {
      storyBody.textContent = `Precedenti in equilibrio: ${stats.homeWins} vittorie per parte${stats.draws ? ` e ${stats.draws} pareggi${stats.draws === 1 ? "o" : ""}` : ""}. Media fantapunti: ${formatNumber(stats.avgHome)} per ${params.home}, ${formatNumber(stats.avgAway)} per ${params.away}.`;
    } else {
      const leader = stats.homeWins > stats.awayWins ? params.home : params.away;
      storyBody.textContent = `${leader} è avanti nei precedenti disponibili. Bilancio: ${stats.homeWins}-${stats.draws}-${stats.awayWins} dal punto di vista di ${params.home}. Media fantapunti: ${formatNumber(stats.avgHome)} - ${formatNumber(stats.avgAway)}.`;
    }
    return;
  }

  storyTitle.textContent = "Match story";
  const result = resultFromPoints(target.pointsHome, target.pointsAway);
  const goalsHome = pointsToGoals(target.pointsHome);
  const goalsAway = pointsToGoals(target.pointsAway);
  let opening = `La partita termina ${goalsHome} - ${goalsAway}.`;
  if (result === "V") opening = `${params.home} supera ${params.away} ${goalsHome} - ${goalsAway}.`;
  if (result === "P") opening = `${params.away} supera ${params.home} ${goalsAway} - ${goalsHome}.`;

  let impact = "";
  if (roundComplete) {
    const before = standingSnapshot(rows, params.competition, params.gw);
    const after = standingSnapshotThrough(rows, params.competition, params.gw);
    const beforeH = positionOf(before, params.home);
    const afterH = positionOf(after, params.home);
    const beforeA = positionOf(before, params.away);
    const afterA = positionOf(after, params.away);
    const changes = [];
    if (beforeH && afterH && beforeH !== afterH) changes.push(`${params.home}: ${beforeH}° → ${afterH}°`);
    if (beforeA && afterA && beforeA !== afterA) changes.push(`${params.away}: ${beforeA}° → ${afterA}°`);
    if (changes.length) impact = ` A giornata completa, l'impatto in classifica è ${changes.join("; ")}.`;
  }

  storyBody.textContent = `${opening} Dopo questo risultato, il bilancio disponibile degli scontri diretti è ${stats.homeWins}-${stats.draws}-${stats.awayWins} dal punto di vista di ${params.home}.${impact}`;
}

function showError(message) {
  document.getElementById("mc-loading").style.display = "none";
  const app = document.getElementById("mc-app");
  app.hidden = false;
  app.innerHTML = `<section class="mc-error"><strong>Match Center non disponibile</strong><p>${escapeHtml(message)}</p><a href="index.html">← Torna alla Home</a></section>`;
}

async function initMatchCenter() {
  const params = getParams();
  if (!params.home || !params.away || !params.gw || normalizeTeamName(params.home) === normalizeTeamName(params.away)) {
    showError("Parametri della partita mancanti o non validi.");
    return;
  }

  try {
    const [rows, history] = await Promise.all([
      loadResultsRows(),
      historicalMeetings(params)
    ]);

    const target = targetMatch(rows, params);
    const completed = !!target;
    const roundComplete = completed && roundIsComplete(rows, params);
    const currentMeetings = currentSeasonMeetings(rows, params);
    const meetings = sortMeetings([...history, ...currentMeetings]);

    document.getElementById("mc-loading").style.display = "none";
    document.getElementById("mc-app").hidden = false;

    renderHeader(params, target, completed);
    renderStandings(params, rows, target, completed, roundComplete);
    renderH2H(params, meetings, completed);
    renderForm(params, rows, completed);
    renderStory(params, meetings, rows, target, completed, roundComplete);
  } catch (error) {
    console.error("Errore Match Center:", error);
    showError(error?.message || "Errore durante il caricamento dei dati.");
  }
}

document.addEventListener("DOMContentLoaded", initMatchCenter);
