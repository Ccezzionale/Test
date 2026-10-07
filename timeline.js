import { supabase } from "./supabase.js";
import { loadResultsRows } from "./results-source.js";

/* =========================================================
   LA STAGIONE · LIVE TIMELINE
   Costruisce la cronologia leggendo le fonti già usate
   dall'app. Ogni fonte è opzionale: se una tabella non è
   disponibile, la pagina continua con le altre.
   ========================================================= */

const CONFIG = {
  season: "2026/27",
  shortSeason: "2026",
  allStarSeason: 2027,
  draftNames: ["Draft Conference", "Draft Championship"],
  maxTradeEvents: 8,
  maxLeagueInsightEvents: 7
};

const CHAPTERS = {
  all: "Tutto",
  preseason: "Preseason",
  regular: "Regular Season",
  rivalry: "Rivalry Games",
  allstar: "All-Star",
  push: "Playoff Push",
  playoff: "Playoff",
  finale: "Finali",
  supercoppa: "Supercoppa"
};

const CHAPTER_ORDER = {
  preseason: 10,
  regular: 20,
  rivalry: 30,
  allstar: 40,
  push: 50,
  playoff: 60,
  finale: 70,
  supercoppa: 80
};

const CHAPTER_ANCHORS = {
  preseason: new Date("2026-08-01T12:00:00"),
  regular: new Date("2026-08-25T12:00:00"),
  rivalry: new Date("2026-10-01T12:00:00"),
  allstar: new Date("2026-11-01T12:00:00"),
  push: new Date("2026-12-01T12:00:00"),
  playoff: new Date("2027-01-01T12:00:00"),
  finale: new Date("2027-05-01T12:00:00"),
  supercoppa: new Date("2027-06-01T12:00:00")
};

const TEAM_ASSETS = [
  ["Atlético Leon", "img/Atlético Leon.webp", "img/maglie/leon-mascotte.webp"],
  ["Bayern Christiansen", "img/Bayern Christiansen.webp", "img/maglie/bayern-mascotte.webp"],
  ["Team Bartowski", "img/Team Bartowski.webp", "img/maglie/bartowski-mascotte.webp"],
  ["Golden Knights", "img/Golden Knights.webp", "img/maglie/golden-mascotte.webp"],
  ["Ibla", "img/Ibla.webp", "img/maglie/ibla-mascotte.webp"],
  ["Fantaugusta", "img/Fantaugusta.webp", "img/maglie/fantaugusta-mascotte.webp"],
  ["Riverfilo", "img/Riverfilo.webp", "img/maglie/riverfilo-mascotte.webp"],
  ["Desperados", "img/Desperados.webp", "img/maglie/desperados-mascotte.webp"],
  ["Wildboys 78", "img/wildboys78.webp", "img/maglie/wildboys-mascotte.webp"],
  ["Pandinicoccolosini", "img/Pandinicoccolosini.webp", "img/maglie/pandini-mascotte.webp"],
  ["Pokermantra", "img/PokerMantra.webp", "img/maglie/pokermantra-mascotte.webp"],
  ["Minnesode Timberland", "img/Minnesode Timberland.webp", "img/maglie/minnesode-mascotte.webp"],
  ["Minnesota Snakes", "img/MinneSota Snakes.webp", "img/maglie/snakes-mascotte.webp"],
  ["Eintracht Franco 126", "img/Eintracht Franco 126.webp", "img/maglie/franco-mascotte.webp"],
  ["FC Disoneste", "img/FC Disoneste.webp", "img/maglie/disoneste-mascotte.webp"],
  ["Athletic Pongao", "img/Athletic Pongao.webp", "img/maglie/pongao-mascotte.webp"]
];

const state = {
  chapter: "all",
  events: [],
  sourceErrors: {},
  timelineTableAvailable: true,
  isAdmin: false
};

const els = {
  loading: document.getElementById("timelineLoading"),
  content: document.getElementById("timelineContent"),
  error: document.getElementById("timelineError"),
  errorText: document.getElementById("timelineErrorText"),
  filters: document.getElementById("chapterFilters"),
  list: document.getElementById("timelineList"),
  liveState: document.getElementById("liveState"),
  currentChapter: document.getElementById("currentChapter"),
  eventCount: document.getElementById("eventCount"),
  nextBigEvent: document.getElementById("nextBigEvent"),
  future: document.getElementById("futureStory"),
  admin: document.getElementById("timelineAdmin"),
  adminToggle: document.getElementById("timelineAdminToggle"),
  adminBody: document.getElementById("timelineAdminBody"),
  adminSetup: document.getElementById("timelineAdminSetup"),
  adminForm: document.getElementById("timelineAdminForm"),
  adminStatus: document.getElementById("timelineAdminStatus")
};

function normalizeTeamName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function canonicalTeamName(value) {
  const key = normalizeTeamName(value);
  const match = TEAM_ASSETS.find(([name]) => normalizeTeamName(name) === key);
  if (match) return match[0];

  if (key === normalizeTeamName("Wildboys78")) return "Wildboys 78";
  if (key === normalizeTeamName("PokerMantra")) return "Pokermantra";
  if (key === normalizeTeamName("DC Disoneste")) return "FC Disoneste";
  if (key === normalizeTeamName("Rubinkebab")) return "Atlético Leon";

  return String(value || "").trim();
}

function teamAsset(value, kind = "mascot") {
  const name = canonicalTeamName(value);
  const row = TEAM_ASSETS.find(([team]) => normalizeTeamName(team) === normalizeTeamName(name));
  if (!row) return "icon-192.png";
  return kind === "logo" ? row[1] : row[2];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function safeHref(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(javascript|data):/i.test(raw)) return "";
  return raw;
}

function safeImage(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^(javascript|data):/i.test(raw)) return "";
  return raw;
}

function num(value) {
  const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function pointsToGoals(points) {
  const value = num(points);
  if (value < 66) return 0;
  return 1 + Math.floor((value - 66) / 6);
}

function rowOutcome(row) {
  const explicit = String(row?.Result || "").trim().toUpperCase();

  if (["V", "W"].includes(explicit)) return "W";
  if (["N", "D"].includes(explicit)) return "D";
  if (["P", "L"].includes(explicit)) return "L";

  const gf = pointsToGoals(row?.PointsFor);
  const ga = pointsToGoals(row?.PointsAgainst);
  return gf > ga ? "W" : gf < ga ? "L" : "D";
}

function isCompletedResult(row) {
  const explicit = String(row?.Result || "").trim().toUpperCase();
  if (["V", "N", "P", "W", "D", "L"].includes(explicit)) return true;
  return !(num(row?.PointsFor) === 0 && num(row?.PointsAgainst) === 0);
}

function parseDateLike(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const italian = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (italian) {
    const [, dd, mm, yyyy, hh = "12", min = "00"] = italian;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function firstValidDate(...values) {
  for (const value of values.flat(Infinity)) {
    const parsed = parseDateLike(value);
    if (parsed) return parsed;
  }
  return null;
}

function minDate(values) {
  const parsed = values.map(parseDateLike).filter(Boolean);
  if (!parsed.length) return null;
  return new Date(Math.min(...parsed.map(d => d.getTime())));
}

function maxDate(values) {
  const parsed = values.map(parseDateLike).filter(Boolean);
  if (!parsed.length) return null;
  return new Date(Math.max(...parsed.map(d => d.getTime())));
}

function formatDateParts(date, fallbackLabel = "EVENTO") {
  const parsed = parseDateLike(date);

  if (!parsed) {
    return {
      main: fallbackLabel,
      year: ""
    };
  }

  const month = new Intl.DateTimeFormat("it-IT", { month: "short" })
    .format(parsed)
    .replace(".", "")
    .toUpperCase();

  return {
    main: `${String(parsed.getDate()).padStart(2, "0")} ${month}`,
    year: String(parsed.getFullYear())
  };
}

function eventSortValue(event) {
  const chapterBase = (CHAPTER_ORDER[event.chapter] || 99) * 10_000_000_000_000;
  const date = parseDateLike(event.occurredAt);
  const datePart = date ? date.getTime() : (CHAPTER_ANCHORS[event.chapter]?.getTime() || 0);
  return chapterBase + datePart + Number(event.sortBump || 0);
}

function makeEvent(raw) {
  const chapter = raw.chapter || "regular";
  return {
    id: raw.id || `${raw.source || "auto"}-${chapter}-${raw.title}-${Math.random().toString(36).slice(2, 8)}`,
    chapter,
    occurredAt: raw.occurredAt || null,
    dateLabel: raw.dateLabel || "",
    badge: raw.badge || "Evento",
    extra: raw.extra || "",
    title: raw.title || "Evento",
    text: raw.text || "",
    image: safeImage(raw.image),
    icon: raw.icon || "",
    meta: Array.isArray(raw.meta) ? raw.meta.filter(Boolean) : [],
    href: safeHref(raw.href),
    major: Boolean(raw.major),
    locked: Boolean(raw.locked),
    manual: Boolean(raw.manual),
    source: raw.source || "AUTO",
    sortBump: raw.sortBump || 0
  };
}

async function safeRows(key, builder) {
  try {
    const response = await builder();
    if (response?.error) throw response.error;
    return response?.data || [];
  } catch (error) {
    state.sourceErrors[key] = error;
    console.warn(`[Timeline] ${key} non disponibile:`, error);
    return [];
  }
}

async function safeSingle(key, builder) {
  try {
    const response = await builder();
    if (response?.error) throw response.error;
    return response?.data || null;
  } catch (error) {
    state.sourceErrors[key] = error;
    console.warn(`[Timeline] ${key} non disponibile:`, error);
    return null;
  }
}

async function loadSources() {
  state.sourceErrors = {};

  const resultsPromise = loadResultsRows().catch(error => {
    state.sourceErrors.results = error;
    console.warn("[Timeline] risultati non disponibili:", error);
    return [];
  });

  const [
    results,
    teams,
    trades,
    crashRivalry,
    crashSeeds,
    crashScores,
    highlanderState,
    highlanderElims,
    allStarState,
    allStarPicks,
    playoffResults,
    supercoppa,
    finalizations,
    draftStates,
    draftPicks,
    manualEvents
  ] = await Promise.all([
    resultsPromise,

    safeRows("teams", () =>
      supabase.from("teams").select("id, name, conference")
    ),

    safeRows("trades", () =>
      supabase
        .from("trade_proposals")
        .select("*")
        .eq("status", "accepted")
        .order("accepted_at", { ascending: true })
    ),

    safeRows("crashRivalry", () =>
      supabase
        .from("crashout_rivalry_matches")
        .select("*")
        .eq("season", CONFIG.shortSeason)
        .order("matchday", { ascending: true })
        .order("match_index", { ascending: true })
    ),

    safeRows("crashSeeds", () =>
      supabase
        .from("crashout_playoff_seeds")
        .select("*")
        .eq("season", CONFIG.shortSeason)
        .order("seed_number", { ascending: true })
    ),

    safeRows("crashScores", () =>
      supabase
        .from("crashout_playoff_scores")
        .select("*")
    ),

    safeSingle("highlanderState", () =>
      supabase
        .from("highlander_state")
        .select("*")
        .eq("season", CONFIG.shortSeason)
        .maybeSingle()
    ),

    safeRows("highlanderElims", () =>
      supabase
        .from("highlander_eliminations")
        .select("*")
        .eq("season", CONFIG.shortSeason)
        .order("turno", { ascending: true })
    ),

    safeSingle("allStarState", () =>
      supabase
        .from("allstar_state")
        .select("*")
        .eq("season", CONFIG.allStarSeason)
        .maybeSingle()
    ),

    safeRows("allStarPicks", () =>
      supabase
        .from("allstar_picks")
        .select("*")
        .eq("season", CONFIG.allStarSeason)
        .order("pick_number", { ascending: true })
    ),

    safeRows("playoffResults", () =>
      supabase
        .from("playoff_results")
        .select("*")
    ),

    safeSingle("supercoppa", () =>
      supabase
        .from("supercoppa_settings")
        .select("*")
        .eq("season", CONFIG.season)
        .maybeSingle()
    ),

    safeRows("finalizations", () =>
      supabase
        .from("hall_of_fame_finalizations")
        .select("*")
        .eq("season", CONFIG.season)
        .order("finalized_at", { ascending: true })
    ),

    safeRows("draftStates", () =>
      supabase
        .from("draft_state")
        .select("*")
        .in("draft_name", CONFIG.draftNames)
    ),

    safeRows("draftPicks", () =>
      supabase
        .from("draft_picks")
        .select("*")
        .in("draft_name", CONFIG.draftNames)
        .order("pick_number", { ascending: true })
    ),

    safeRows("manualTimeline", () =>
      supabase
        .from("season_timeline_events")
        .select("*")
        .eq("season", CONFIG.season)
        .eq("is_published", true)
        .order("occurred_at", { ascending: true })
    )
  ]);

  const manualError = state.sourceErrors.manualTimeline;
  if (manualError) {
    state.timelineTableAvailable = !/relation .*season_timeline_events.* does not exist|Could not find the table|schema cache/i.test(
      String(manualError.message || manualError)
    );
  } else {
    state.timelineTableAvailable = true;
  }

  const tradeIds = trades.map(row => row.id).filter(Boolean);
  const tradeAssets = tradeIds.length
    ? await safeRows("tradeAssets", () =>
        supabase
          .from("trade_assets")
          .select("*")
          .in("proposal_id", tradeIds)
      )
    : [];

  return {
    results,
    teams,
    trades,
    tradeAssets,
    crashRivalry,
    crashSeeds,
    crashScores,
    highlanderState,
    highlanderElims,
    allStarState,
    allStarPicks,
    playoffResults,
    supercoppa,
    finalizations,
    draftStates,
    draftPicks,
    manualEvents
  };
}

function teamMapFromRows(teams) {
  return new Map((teams || []).map(team => [String(team.id), canonicalTeamName(team.name)]));
}

function buildDraftEvents(data) {
  const states = data.draftStates || [];
  const picks = data.draftPicks || [];
  if (!states.length && !picks.length) return [];

  const byDraft = new Map();
  picks.forEach(row => {
    const name = row.draft_name || "Draft";
    if (!byDraft.has(name)) byDraft.set(name, []);
    byDraft.get(name).push(row);
  });

  const totalPicks = picks.length;
  const closed = states.length > 0 && states.every(row => row.is_open === false);

  const date = minDate([
    ...picks.map(row => row.created_at || row.updated_at),
    ...states.map(row => row.created_at || row.updated_at)
  ]);

  const detail = [...byDraft.entries()]
    .map(([name, rows]) => `${name.includes("Championship") ? "Championship" : "League"} ${rows.length}`)
    .join(" · ");

  return [
    makeEvent({
      id: "draft-season",
      chapter: "preseason",
      occurredAt: date,
      dateLabel: "DRAFT",
      badge: "Draft",
      extra: closed ? "Board chiusi" : "Preseason",
      title: closed ? "Il Draft apre la stagione" : "Draft in corso",
      text: closed
        ? `Le due conference hanno completato la costruzione delle rose. ${totalPicks} scelte registrate e si può finalmente iniziare a litigare sulle valutazioni.`
        : `Il Draft è in corso. Al momento risultano ${totalPicks} scelte registrate.`,
      image: "img/home/prossimo-anno/draft-conference.webp",
      meta: [detail || `${totalPicks} scelte`, "2 conference"],
      href: "draft_conference.html",
      major: true,
      source: "DRAFT"
    })
  ];
}

function cleanLeagueRows(rows) {
  const seen = new Set();

  return (rows || [])
    .filter(isCompletedResult)
    .filter(row => ["Conf A", "Conf B", "Unificata"].includes(String(row.Conference || "").trim()))
    .filter(row => {
      const key = [
        String(row.Conference || ""),
        Number(row.GW_Stagionale || row.GW || 0),
        normalizeTeamName(row.Team)
      ].join("|");

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
      table.set(key, {
        name,
        games: 0,
        points: 0,
        fantasy: 0,
        gf: 0,
        ga: 0
      });
    }

    const rec = table.get(key);
    const outcome = rowOutcome(row);
    const gf = pointsToGoals(row.PointsFor);
    const ga = pointsToGoals(row.PointsAgainst);

    rec.games += 1;
    rec.fantasy += num(row.PointsFor);
    rec.gf += gf;
    rec.ga += ga;

    if (outcome === "W") rec.points += 3;
    else if (outcome === "D") rec.points += 1;
  });

  return [...table.values()].sort((a, b) =>
    b.points - a.points ||
    b.fantasy - a.fantasy ||
    b.gf - a.gf ||
    a.ga - b.ga ||
    a.name.localeCompare(b.name, "it")
  );
}

function dateForResultRow(row) {
  return firstValidDate(row?.Date, row?.match_date);
}

function buildLeagueEvents(data) {
  const rows = cleanLeagueRows(data.results);
  if (!rows.length) return [];

  const events = [];

  const sorted = [...rows].sort((a, b) => {
    const ga = Number(a.GW_Stagionale || a.GW || 0);
    const gb = Number(b.GW_Stagionale || b.GW || 0);
    return ga - gb;
  });

  const firstGw = Math.min(...sorted.map(row => Number(row.GW_Stagionale || row.GW || 0)).filter(Boolean));
  const openingRows = sorted.filter(row => Number(row.GW_Stagionale || row.GW || 0) === firstGw);
  const bestOpening = [...openingRows].sort((a, b) => num(b.PointsFor) - num(a.PointsFor))[0];
  const openingDate = minDate(openingRows.map(dateForResultRow));

  events.push(makeEvent({
    id: "league-opening",
    chapter: "regular",
    occurredAt: openingDate,
    dateLabel: `GW ${firstGw}`,
    badge: `GW ${firstGw}`,
    extra: "Kickoff",
    title: "Si comincia",
    text: bestOpening
      ? `La Regular Season parte ufficialmente. ${canonicalTeamName(bestOpening.Team)} firma il miglior punteggio della giornata con ${num(bestOpening.PointsFor).toFixed(1).replace(".", ",")} FP.`
      : "La Regular Season parte ufficialmente. Da qui ogni punto comincia a pesare.",
    image: "img/home/competizioni/classifiche.webp",
    meta: ["Regular Season", "Opening Day"],
    href: "classifica.html",
    major: true,
    source: "RISULTATI"
  }));

  const recordEvents = [];
  let currentRecord = -Infinity;

  const bySeasonGw = new Map();
  rows.forEach(row => {
    const gw = Number(row.GW_Stagionale || row.GW || 0);
    if (!bySeasonGw.has(gw)) bySeasonGw.set(gw, []);
    bySeasonGw.get(gw).push(row);
  });

  [...bySeasonGw.keys()].sort((a, b) => a - b).forEach(gw => {
    const weekRows = bySeasonGw.get(gw);
    const best = [...weekRows].sort((a, b) => num(b.PointsFor) - num(a.PointsFor))[0];
    if (!best) return;

    const score = num(best.PointsFor);
    if (score > currentRecord) {
      const improvement = currentRecord === -Infinity ? 0 : score - currentRecord;
      currentRecord = score;

      if (gw !== firstGw && improvement >= 1) {
        recordEvents.push(makeEvent({
          id: `record-${gw}-${normalizeTeamName(best.Team)}`,
          chapter: "regular",
          occurredAt: dateForResultRow(best),
          dateLabel: `GW ${gw}`,
          badge: "Record",
          extra: "Nuovo primato",
          title: `${canonicalTeamName(best.Team)} alza l'asticella`,
          text: `Nuovo miglior punteggio stagionale: ${score.toFixed(1).replace(".", ",")} fantapunti.`,
          image: teamAsset(best.Team),
          meta: [`GW ${gw}`, `${score.toFixed(1).replace(".", ",")} FP`],
          href: "statistiche.html",
          source: "STATISTICHE"
        }));
      }
    }
  });

  events.push(...recordEvents.slice(0, 2));

  const leaderEvents = [];
  ["Conf A", "Conf B", "Unificata"].forEach(conf => {
    const confRows = rows.filter(row => String(row.Conference || "").trim() === conf);
    if (!confRows.length) return;

    const gws = [...new Set(confRows.map(row => Number(row.GW || 0)).filter(Boolean))].sort((a, b) => a - b);
    let previousLeader = "";

    gws.forEach((gw, index) => {
      const table = buildStandings(confRows.filter(row => Number(row.GW || 0) <= gw));
      const leader = table[0]?.name || "";
      if (!leader) return;

      if (index > 0 && previousLeader && normalizeTeamName(leader) !== normalizeTeamName(previousLeader)) {
        const weekRows = confRows.filter(row => Number(row.GW || 0) === gw);
        const date = minDate(weekRows.map(dateForResultRow));
        const confLabel = conf === "Conf A"
          ? "Conference League"
          : conf === "Conf B"
            ? "Conference Championship"
            : "Round Robin";

        leaderEvents.push(makeEvent({
          id: `leader-${conf}-${gw}-${normalizeTeamName(leader)}`,
          chapter: conf === "Unificata" ? "push" : "regular",
          occurredAt: date,
          dateLabel: `GW ${gw}`,
          badge: "Classifica",
          extra: "Cambio al vertice",
          title: `${leader} prende la vetta`,
          text: `Cambio di leader in ${confLabel}. La corsa cambia padrone.`,
          image: teamAsset(leader),
          meta: [confLabel, "1° posto"],
          href: "classifica.html",
          source: "CLASSIFICA"
        }));
      }

      previousLeader = leader;
    });
  });

  events.push(...leaderEvents.slice(-2));

  const streakEvents = [];
  const byTeam = new Map();

  rows.forEach(row => {
    const name = canonicalTeamName(row.Team);
    if (!byTeam.has(name)) byTeam.set(name, []);
    byTeam.get(name).push(row);
  });

  byTeam.forEach((teamRows, team) => {
    teamRows.sort((a, b) =>
      Number(a.GW_Stagionale || a.GW || 0) - Number(b.GW_Stagionale || b.GW || 0)
    );

    let streak = 0;
    const announced = new Set();

    teamRows.forEach(row => {
      streak = rowOutcome(row) === "W" ? streak + 1 : 0;

      [3, 5].forEach(milestone => {
        if (streak === milestone && !announced.has(milestone)) {
          announced.add(milestone);
          streakEvents.push(makeEvent({
            id: `streak-${normalizeTeamName(team)}-${milestone}-${row.GW_Stagionale || row.GW}`,
            chapter: Number(row.GW_Stagionale || row.GW || 0) >= 10 ? "push" : "regular",
            occurredAt: dateForResultRow(row),
            dateLabel: `GW ${row.GW_Stagionale || row.GW}`,
            badge: "Serie",
            extra: `${milestone} vittorie`,
            title: `${team} non si ferma più`,
            text: `${milestone} vittorie consecutive: la squadra più calda del momento entra nel racconto della stagione.`,
            image: teamAsset(team),
            meta: [`${milestone} W di fila`, "Momentum"],
            href: "statistiche.html",
            source: "RISULTATI"
          }));
        }
      });
    });
  });

  events.push(...streakEvents.slice(0, 2));

  return events.slice(0, CONFIG.maxLeagueInsightEvents + 1);
}

function buildTradeEvents(data) {
  const teamMap = teamMapFromRows(data.teams);
  const assetsByProposal = new Map();

  (data.tradeAssets || []).forEach(asset => {
    const id = String(asset.proposal_id || "");
    if (!assetsByProposal.has(id)) assetsByProposal.set(id, []);
    assetsByProposal.get(id).push(asset);
  });

  const grouped = new Map();

  (data.trades || []).forEach(trade => {
    const date = firstValidDate(trade.accepted_at, trade.updated_at, trade.created_at);
    if (!date) return;

    const key = date.toISOString().slice(0, 10);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(trade);
  });

  return [...grouped.entries()]
    .slice(-CONFIG.maxTradeEvents)
    .map(([day, trades]) => {
      const date = parseDateLike(day);

      if (trades.length > 1) {
        const pairs = trades.slice(0, 3).map(trade => {
          const from = teamMap.get(String(trade.from_team)) || "Squadra A";
          const to = teamMap.get(String(trade.to_team)) || "Squadra B";
          return `${from} ↔ ${to}`;
        });

        return makeEvent({
          id: `trades-${day}`,
          chapter: "regular",
          occurredAt: date,
          badge: "Trade Room",
          extra: `${trades.length} affari`,
          title: "Mercato in fiamme",
          text: `Giornata movimentata: ${pairs.join(" · ")}${trades.length > 3 ? " · …" : ""}.`,
          image: "img/home/bottom-nav/mercato.webp",
          meta: [`${trades.length} trade completate`, "HERE WE GO!"],
          href: "trade-room.html",
          source: "TRADE"
        });
      }

      const trade = trades[0];
      const from = teamMap.get(String(trade.from_team)) || "Squadra A";
      const to = teamMap.get(String(trade.to_team)) || "Squadra B";
      const assets = assetsByProposal.get(String(trade.id)) || [];

      const fromAssets = assets
        .filter(asset => asset.side === "from")
        .map(asset => asset.asset_label)
        .filter(Boolean)
        .slice(0, 2);

      const toAssets = assets
        .filter(asset => asset.side === "to")
        .map(asset => asset.asset_label)
        .filter(Boolean)
        .slice(0, 2);

      const detail = [
        fromAssets.length ? `${from}: ${fromAssets.join(", ")}` : "",
        toAssets.length ? `${to}: ${toAssets.join(", ")}` : ""
      ].filter(Boolean).join(" · ");

      return makeEvent({
        id: `trade-${trade.id}`,
        chapter: "regular",
        occurredAt: date,
        badge: "Trade",
        extra: "HERE WE GO!",
        title: `${from} ↔ ${to}`,
        text: detail || "Scambio completato e ufficiale. Il mercato cambia gli equilibri della Lega.",
        image: "img/home/bottom-nav/mercato.webp",
        meta: ["Trade completata", "Movimento ufficiale"],
        href: "trade-room.html",
        source: "TRADE"
      });
    });
}

function buildCrashOutEvents(data) {
  const rows = data.crashRivalry || [];
  const events = [];

  if (rows.length) {
    const played = rows.filter(row => row.is_played);
    if (played.length) {
      const firstPlayed = minDate(played.map(row => row.updated_at || row.created_at));

      events.push(makeEvent({
        id: "crashout-rivalry-start",
        chapter: "rivalry",
        occurredAt: firstPlayed,
        dateLabel: "RIVALRY",
        badge: "Crash Out Cup",
        extra: "Rivalry Games",
        title: "Le rivalità si accendono",
        text: `La Crash Out Cup entra in scena. ${played.length} partite risultano già giocate su ${rows.length}. Qui si gioca anche per il diritto di prendere in giro gli altri.`,
        image: "img/home/competizioni/crashout-rivalry.webp",
        meta: ["Rivalry Games", `${played.length}/${rows.length} giocate`],
        href: "crashoutcup.html",
        major: true,
        source: "CRASH OUT"
      }));
    }

    if (played.length === rows.length) {
      events.push(makeEvent({
        id: "crashout-rivalry-complete",
        chapter: "rivalry",
        occurredAt: maxDate(played.map(row => row.updated_at || row.created_at)),
        dateLabel: "RIVALRY",
        badge: "Crash Out Cup",
        extra: "Fase completata",
        title: "Rivalry Games: verdetti emessi",
        text: "La prima fase è completa. La classifica della Crash Out decide il seeding della fase finale.",
        image: "img/home/competizioni/crashout-rivalry.webp",
        meta: ["Rivalry completata", "Seed playoff"],
        href: "crashoutcup.html",
        source: "CRASH OUT",
        sortBump: 10
      }));
    }
  }

  const lockedSeeds = (data.crashSeeds || []).filter(row => row.team_name && Number(row.seed_number));
  if (lockedSeeds.length >= 16) {
    events.push(makeEvent({
      id: "crashout-playoff-start",
      chapter: "playoff",
      occurredAt: firstValidDate(lockedSeeds[0]?.locked_at),
      dateLabel: "PLAYOFF",
      badge: "Crash Out",
      extra: "Fase finale",
      title: "Il bracket è pronto",
      text: "I sedici seed sono bloccati. La Crash Out Cup entra nella fase a eliminazione fino alla finale.",
      image: "img/home/competizioni/crashout-finale.webp",
      meta: ["16 seed", "Primo a 3 vittorie"],
      href: "crashoutplayoff.html",
      major: true,
      source: "CRASH OUT"
    }));
  }

  return events;
}

function buildHighlanderEvents(data) {
  const stateRow = data.highlanderState;
  const eliminations = data.highlanderElims || [];
  const events = [];

  if (stateRow?.is_active || eliminations.length) {
    events.push(makeEvent({
      id: "highlander-start",
      chapter: "rivalry",
      occurredAt: firstValidDate(
        stateRow?.updated_at,
        minDate(eliminations.map(row => row.created_at || row.updated_at))
      ),
      dateLabel: "ARENA",
      badge: "Highlander",
      extra: "Ne resterà uno",
      title: "L'Arena apre le porte",
      text: eliminations.length
        ? `La Highlander è in corso: ${eliminations.length} squadre risultano già eliminate.`
        : "La Highlander è attiva. Una squadra alla volta verrà cancellata dall'Arena.",
      image: "img/home/competizioni/highlander.webp",
      meta: [`${Math.max(0, 16 - eliminations.length)} sopravvissute`, `${eliminations.length} eliminate`],
      href: "arena.html",
      major: true,
      source: "HIGHLANDER"
    }));
  }

  if (eliminations.length >= 12 && eliminations.length < 15) {
    events.push(makeEvent({
      id: "highlander-final-four",
      chapter: "push",
      occurredAt: maxDate(eliminations.map(row => row.created_at || row.updated_at)),
      dateLabel: "TOP 4",
      badge: "Highlander",
      extra: "Ultimi superstiti",
      title: "Ne sono rimaste quattro",
      text: "L'Arena si restringe. La Highlander entra nella sua fase più cattiva.",
      image: "img/home/competizioni/highlander.webp",
      meta: ["Final Four", "Highlander"],
      href: "arena.html",
      source: "HIGHLANDER"
    }));
  }

  if (eliminations.length >= 15) {
    const eliminated = new Set(eliminations.map(row => normalizeTeamName(row.team_name)));
    const winner = TEAM_ASSETS.map(row => row[0]).find(team => !eliminated.has(normalizeTeamName(team)));

    if (winner) {
      events.push(makeEvent({
        id: "highlander-winner",
        chapter: "finale",
        occurredAt: maxDate(eliminations.map(row => row.created_at || row.updated_at)),
        dateLabel: "HIGHLANDER",
        badge: "Campione",
        extra: "There can be only one",
        title: `${winner} sopravvive a tutti`,
        text: "La Highlander ha il suo ultimo superstite.",
        image: teamAsset(winner),
        meta: ["Vincitore Highlander"],
        href: "arena.html",
        major: true,
        source: "HIGHLANDER"
      }));
    }
  }

  return events;
}

function buildAllStarEvents(data) {
  const allstar = data.allStarState;
  const picks = data.allStarPicks || [];
  if (!allstar && !picks.length) return [];

  const events = [];

  if (allstar?.voting_started_at) {
    events.push(makeEvent({
      id: "allstar-voting",
      chapter: "allstar",
      occurredAt: allstar.voting_started_at,
      badge: "All-Star",
      extra: "Vote Now!",
      title: "Si aprono le votazioni",
      text: "La Lega sceglie le proprie stelle. Da qui nasce l'All-Star Game.",
      image: "img/maglie/evidenzaallstar.webp",
      meta: [`Week ${allstar.active_week || 1}`, "Votazioni"],
      href: "allstar.html",
      source: "ALL-STAR"
    }));
  }

  if (picks.length) {
    events.push(makeEvent({
      id: "allstar-draft",
      chapter: "allstar",
      occurredAt: minDate(picks.map(row => row.created_at)),
      dateLabel: "ALL-STAR",
      badge: "All-Star",
      extra: "Le stelle della Lega",
      title: "Le squadre All-Star prendono forma",
      text: `${picks.length} scelte risultano registrate nel Draft All-Star.`,
      image: "img/maglie/evidenzaallstar.webp",
      meta: [`${picks.length} pick`, "Draft All-Star"],
      href: "allstar.html",
      major: true,
      source: "ALL-STAR",
      sortBump: 5
    }));
  }

  if (allstar?.winner_conference) {
    const latestPickDate = maxDate(picks.map(row => row.created_at));

    events.push(makeEvent({
      id: "allstar-winner",
      chapter: "allstar",
      occurredAt: firstValidDate(allstar.voting_closed_at, latestPickDate),
      dateLabel: "ALL-STAR",
      badge: "Verdetto",
      extra: "Showtime",
      title: `${allstar.winner_conference} vince l'All-Star Game`,
      text: "L'evento delle stelle ha la sua Conference vincitrice.",
      image: "img/maglie/evidenzaallstar.webp",
      meta: ["All-Star Game", "Vincitrice"],
      href: "allstar.html",
      major: true,
      source: "ALL-STAR",
      sortBump: 20
    }));
  }

  return events;
}

function buildPlayoffEvents(data) {
  const events = [];
  const playoffRows = cleanLeagueRows(data.results).filter(row =>
    String(row.Phase || "").toLowerCase().includes("playoff")
  );

  const scores = data.playoffResults || [];
  const hasScores = scores.some(row =>
    row.home_score !== null && row.home_score !== undefined && row.home_score !== "" ||
    row.away_score !== null && row.away_score !== undefined && row.away_score !== ""
  );

  if (playoffRows.length || hasScores) {
    events.push(makeEvent({
      id: "league-playoff-start",
      chapter: "playoff",
      occurredAt: minDate(playoffRows.map(dateForResultRow)),
      dateLabel: "PLAYOFF",
      badge: "Playoff",
      extra: "Road to Glory",
      title: "Comincia la postseason",
      text: "La stagione entra nella fase decisiva. Niente più margine: si gioca per arrivare fino in fondo.",
      image: "img/home/competizioni/playoff.webp",
      meta: ["Postseason", "Dentro o fuori"],
      href: "playoff.html",
      major: true,
      source: "PLAYOFF"
    }));
  }

  const finalRow = scores.find(row => String(row.match_code || "").toUpperCase() === "F");
  const finalPlayed = finalRow &&
    finalRow.home_score !== null &&
    finalRow.home_score !== undefined &&
    finalRow.away_score !== null &&
    finalRow.away_score !== undefined &&
    String(finalRow.home_score) !== "" &&
    String(finalRow.away_score) !== "";

  if (finalPlayed) {
    events.push(makeEvent({
      id: "league-playoff-final-played",
      chapter: "finale",
      dateLabel: "FINALE",
      badge: "Finale",
      extra: "Verdetto sul campo",
      title: "La finale è stata giocata",
      text: `Il tabellone registra il risultato della finale: ${finalRow.home_score}–${finalRow.away_score}. La Hall of Fame può trasformare il risultato in storia ufficiale.`,
      image: "img/home/competizioni/playoff.webp",
      meta: ["Finale Playoff", `${finalRow.home_score}–${finalRow.away_score}`],
      href: "playoff.html",
      source: "PLAYOFF",
      sortBump: 20
    }));
  }

  return events;
}

function buildSupercoppaEvents(data) {
  const row = data.supercoppa;
  const payload = row?.data;
  if (!payload || typeof payload !== "object") return [];

  const selectedTeams = Object.values(payload.teams || {}).filter(Boolean);
  const scores = payload.scores || {};
  const started = selectedTeams.length > 0 || Object.values(scores).flat().some(value => String(value ?? "") !== "");

  if (!started) return [];

  const finalScores = Array.isArray(scores.final) ? scores.final : ["", ""];
  const finalPlayed = finalScores.every(value => String(value ?? "") !== "");

  return [
    makeEvent({
      id: "supercoppa-season",
      chapter: "supercoppa",
      occurredAt: row.updated_at,
      dateLabel: "SUPERCOPPA",
      badge: "Supercoppa",
      extra: finalPlayed ? "Finale disputata" : "Ultima sfida",
      title: finalPlayed ? "La Supercoppa ha il suo verdetto" : "La Supercoppa chiude il cerchio",
      text: finalPlayed
        ? `Il tabellone registra la finale ${finalScores[0]}–${finalScores[1]}.`
        : `${selectedTeams.length} qualificate risultano già definite per la sfida tra i campioni.`,
      image: "img/home/competizioni/supercoppa.webp",
      meta: [`${selectedTeams.length} qualificate`, finalPlayed ? "Finale completata" : "In preparazione"],
      href: "supercoppa.html",
      major: true,
      source: "SUPERCOPPA"
    })
  ];
}

function finalizationChapter(row) {
  const key = String(row.competition_key || row.competition_name || "").toLowerCase();

  if (key.includes("supercoppa")) return "supercoppa";
  if (key.includes("highlander")) return "finale";
  if (key.includes("crash")) return "finale";
  if (key.includes("playoff") || key.includes("campionato")) return "finale";
  return "finale";
}

function finalizationHref(row) {
  const key = String(row.competition_key || row.competition_name || "").toLowerCase();

  if (key.includes("supercoppa")) return "supercoppa.html";
  if (key.includes("highlander")) return "arena.html";
  if (key.includes("crash") && key.includes("play")) return "crashoutplayoff.html";
  if (key.includes("crash")) return "crashoutcup.html";
  if (key.includes("playoff") || key.includes("campionato")) return "playoff.html";
  return "hall-of-fame.html";
}

function buildFinalizationEvents(data) {
  return (data.finalizations || []).map(row => {
    const podium = Array.isArray(row.podium) ? row.podium : [];
    const winnerRow = podium
      .map(item => ({
        position: Number(item.position),
        team: canonicalTeamName(item.team_name)
      }))
      .find(item => item.position === 1);

    const winner = winnerRow?.team || "";
    const competition = row.competition_name || row.competition_key || "Competizione";

    return makeEvent({
      id: `finalization-${row.competition_key || competition}`,
      chapter: finalizationChapter(row),
      occurredAt: row.finalized_at,
      dateLabel: "HALL OF FAME",
      badge: "Campione",
      extra: "Ufficiale",
      title: winner ? `${winner} conquista ${competition}` : `${competition} finalizzata`,
      text: winner
        ? `Il verdetto è ufficiale: ${winner} entra nella Hall of Fame della Lega degli Eroi.`
        : "La competizione è stata finalizzata e registrata nella Hall of Fame.",
      image: winner ? teamAsset(winner) : "img/home/esplora/hall-of-fame.webp",
      meta: [competition, "Hall of Fame"],
      href: "hall-of-fame.html",
      major: true,
      source: "HALL OF FAME"
    });
  });
}

function buildManualEvents(data) {
  return (data.manualEvents || []).map(row =>
    makeEvent({
      id: `manual-${row.id}`,
      chapter: row.chapter || "regular",
      occurredAt: row.occurred_at,
      badge: row.badge || "Commissioner",
      extra: "Momento della Lega",
      title: row.title,
      text: row.description,
      image: row.image_path,
      icon: "♛",
      meta: Array.isArray(row.meta) ? row.meta : [],
      href: row.href,
      major: row.is_major,
      manual: true,
      source: "COMMISSIONER"
    })
  );
}

function addLockedFutureEvents(events) {
  const ids = new Set(events.map(event => event.id));
  const hasSource = source => events.some(event => event.source === source && !event.locked);
  const hasChapter = chapter => events.some(event => event.chapter === chapter && !event.locked);

  if (!hasSource("CRASH OUT")) {
    events.push(makeEvent({
      id: "locked-crashout",
      chapter: "rivalry",
      dateLabel: "IN ARRIVO",
      badge: "Crash Out Cup",
      extra: "Bloccato",
      title: "Rivalry Games",
      text: "La rivalità deve ancora accendersi.",
      image: "img/home/competizioni/crashout-rivalry.webp",
      locked: true,
      source: "FUTURO"
    }));
  }

  if (!hasSource("HIGHLANDER")) {
    events.push(makeEvent({
      id: "locked-highlander",
      chapter: "rivalry",
      dateLabel: "IN ARRIVO",
      badge: "Highlander",
      extra: "Bloccato",
      title: "L'Arena",
      text: "La Highlander non è ancora iniziata.",
      image: "img/home/competizioni/highlander.webp",
      locked: true,
      source: "FUTURO",
      sortBump: 20
    }));
  }

  if (!hasSource("ALL-STAR")) {
    events.push(makeEvent({
      id: "locked-allstar",
      chapter: "allstar",
      dateLabel: "IN ARRIVO",
      badge: "All-Star",
      extra: "Bloccato",
      title: "All-Star Game",
      text: "Le stelle della Lega devono ancora essere scelte.",
      image: "img/maglie/evidenzaallstar.webp",
      locked: true,
      source: "FUTURO"
    }));
  }

  if (!hasChapter("playoff")) {
    events.push(makeEvent({
      id: "locked-playoff",
      chapter: "playoff",
      dateLabel: "IN ARRIVO",
      badge: "Playoff",
      extra: "Road to Glory",
      title: "La postseason",
      text: "Il tabellone deve ancora prendere forma.",
      image: "img/home/competizioni/playoff.webp",
      locked: true,
      source: "FUTURO"
    }));
  }

  const hasMajorFinal = events.some(event =>
    event.chapter === "finale" &&
    event.major &&
    !event.locked &&
    ["HALL OF FAME", "PLAYOFF", "HIGHLANDER"].includes(event.source)
  );

  if (!hasMajorFinal) {
    events.push(makeEvent({
      id: "locked-final",
      chapter: "finale",
      dateLabel: "LA FINALE",
      badge: "Finale",
      extra: "Bloccato",
      title: "La storia deve ancora essere scritta",
      text: "Qui arriverà il momento che chiuderà la corsa al titolo.",
      icon: "🔒",
      locked: true,
      source: "FUTURO"
    }));
  }

  if (!hasSource("SUPERCOPPA")) {
    events.push(makeEvent({
      id: "locked-supercoppa",
      chapter: "supercoppa",
      dateLabel: "ULTIMO ATTO",
      badge: "Supercoppa",
      extra: "Bloccato",
      title: "La sfida dei campioni",
      text: "La Supercoppa aspetta i suoi qualificati.",
      image: "img/home/competizioni/supercoppa.webp",
      locked: true,
      source: "FUTURO"
    }));
  }

  return events;
}

function dedupeEvents(events) {
  const seen = new Set();

  return events.filter(event => {
    const key = event.id || [
      event.chapter,
      event.title,
      parseDateLike(event.occurredAt)?.toISOString().slice(0, 10) || event.dateLabel
    ].join("|");

    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildAllEvents(data) {
  const events = [
    ...buildDraftEvents(data),
    ...buildLeagueEvents(data),
    ...buildTradeEvents(data),
    ...buildCrashOutEvents(data),
    ...buildHighlanderEvents(data),
    ...buildAllStarEvents(data),
    ...buildPlayoffEvents(data),
    ...buildSupercoppaEvents(data),
    ...buildFinalizationEvents(data),
    ...buildManualEvents(data)
  ];

  addLockedFutureEvents(events);

  return dedupeEvents(events).sort((a, b) => eventSortValue(a) - eventSortValue(b));
}

function eventDateMarkup(event) {
  const parts = formatDateParts(event.occurredAt, event.dateLabel || CHAPTERS[event.chapter] || "EVENTO");

  return `
    <div class="timeline-date">
      <strong>${escapeHtml(parts.main)}</strong>
      <span>${escapeHtml(parts.year)}</span>
      <span class="timeline-node"></span>
    </div>
  `;
}

function eventArtMarkup(event) {
  if (event.image) {
    return `<img src="${escapeHtml(event.image)}" alt="" loading="lazy" onerror="this.style.display='none'">`;
  }

  return `<div class="story-icon">${escapeHtml(event.icon || (event.locked ? "🔒" : "★"))}</div>`;
}

function storyCardMarkup(event) {
  const cardClass = [
    "story-card",
    event.major ? "is-major" : "",
    event.locked ? "is-locked" : "",
    event.manual ? "is-manual" : ""
  ].filter(Boolean).join(" ");

  const inner = `
    <div class="story-card-inner">
      <div class="story-art">${eventArtMarkup(event)}</div>

      <div class="story-content">
        <div class="story-top">
          <span class="story-tag">${escapeHtml(event.badge)}</span>
          ${event.extra ? `<span class="story-extra">${escapeHtml(event.extra)}</span>` : ""}
          <span class="story-source">${escapeHtml(event.source)}</span>
        </div>

        <h3>${escapeHtml(event.title)}</h3>
        <p>${escapeHtml(event.text)}</p>

        ${event.meta.length ? `
          <div class="story-meta">
            ${event.meta.map(item => `<span>${escapeHtml(item)}</span>`).join("")}
          </div>
        ` : ""}
      </div>
    </div>

    ${event.href && !event.locked ? `<span class="story-arrow" aria-hidden="true">›</span>` : ""}
  `;

  if (event.href && !event.locked) {
    return `<a class="${cardClass}" href="${escapeHtml(event.href)}">${inner}</a>`;
  }

  return `<article class="${cardClass}">${inner}</article>`;
}

function renderFilters() {
  const present = new Set(state.events.map(event => event.chapter));
  const chapters = ["all", ...Object.keys(CHAPTER_ORDER).filter(chapter => present.has(chapter))];

  els.filters.innerHTML = chapters.map(chapter => `
    <button
      type="button"
      class="timeline-filter ${state.chapter === chapter ? "is-active" : ""}"
      data-chapter="${escapeHtml(chapter)}"
    >
      ${escapeHtml(CHAPTERS[chapter] || chapter)}
    </button>
  `).join("");

  els.filters.querySelectorAll("[data-chapter]").forEach(button => {
    button.addEventListener("click", () => {
      state.chapter = button.dataset.chapter;
      renderTimeline();
      renderFilters();
    });
  });
}

function renderTimeline() {
  const events = state.chapter === "all"
    ? state.events
    : state.events.filter(event => event.chapter === state.chapter);

  if (!events.length) {
    els.list.innerHTML = `<div class="timeline-empty">Nessun evento per questo capitolo.</div>`;
    return;
  }

  els.list.innerHTML = events.map(event => `
    <article class="timeline-event ${event.major ? "is-major" : ""} ${event.locked ? "is-locked" : ""} ${event.manual ? "is-manual" : ""}">
      ${eventDateMarkup(event)}
      ${storyCardMarkup(event)}
    </article>
  `).join("");
}

function renderSummary() {
  const completed = state.events.filter(event => !event.locked);
  const locked = state.events.filter(event => event.locked);

  const last = completed[completed.length - 1] || null;
  const next = locked[0] || null;

  els.eventCount.textContent = String(completed.length);
  els.currentChapter.textContent = last ? (CHAPTERS[last.chapter] || "Stagione") : "Preseason";
  els.nextBigEvent.textContent = next?.title || "Da scrivere";
  els.future.hidden = locked.length === 0;
}

function updateLiveState() {
  const errorCount = Object.keys(state.sourceErrors).length;
  const live = document.querySelector(".timeline-live-state");

  if (!errorCount) {
    els.liveState.textContent = "Dati live";
    live?.classList.add("is-live");
    live?.classList.remove("is-partial");
    return;
  }

  const usableSources = 16 - errorCount;
  els.liveState.textContent = `${Math.max(1, usableSources)} fonti attive`;
  live?.classList.add("is-partial");
  live?.classList.remove("is-live");
}

async function detectAdmin() {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return false;

    const { data, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    if (error) return false;
    return ["admin", "commissioner"].includes(String(data?.role || "").toLowerCase());
  } catch {
    return false;
  }
}

function setupAdminUi() {
  if (!state.isAdmin) return;

  els.admin.hidden = false;
  els.adminSetup.hidden = state.timelineTableAvailable;
  els.adminForm.hidden = !state.timelineTableAvailable;

  els.adminToggle?.addEventListener("click", () => {
    const willOpen = els.adminBody.hidden;
    els.adminBody.hidden = !willOpen;
    els.adminToggle.querySelector("b").textContent = willOpen ? "−" : "＋";
  });

  if (!state.timelineTableAvailable || !els.adminForm) return;

  els.adminForm.addEventListener("submit", saveManualEvent);
}

async function saveManualEvent(event) {
  event.preventDefault();

  const saveButton = document.getElementById("timelineAdminSave");
  const occurredLocal = document.getElementById("manualOccurredAt").value;
  const occurredDate = occurredLocal ? new Date(occurredLocal) : null;

  const payload = {
    season: CONFIG.season,
    occurred_at: occurredDate && !Number.isNaN(occurredDate.getTime())
      ? occurredDate.toISOString()
      : new Date().toISOString(),
    chapter: document.getElementById("manualChapter").value || "regular",
    event_type: "commissioner",
    badge: document.getElementById("manualBadge").value.trim() || "Commissioner",
    title: document.getElementById("manualTitle").value.trim(),
    description: document.getElementById("manualDescription").value.trim(),
    href: document.getElementById("manualHref").value.trim() || null,
    image_path: document.getElementById("manualImage").value.trim() || null,
    meta: [],
    is_major: document.getElementById("manualMajor").checked,
    is_published: true
  };

  if (!payload.title || !payload.description) {
    els.adminStatus.textContent = "Titolo e descrizione sono obbligatori.";
    return;
  }

  saveButton.disabled = true;
  els.adminStatus.textContent = "Pubblicazione…";

  const { error } = await supabase
    .from("season_timeline_events")
    .insert(payload);

  saveButton.disabled = false;

  if (error) {
    console.error("Errore inserimento Timeline:", error);
    els.adminStatus.textContent = error.message || "Errore durante il salvataggio.";
    return;
  }

  els.adminStatus.textContent = "Evento pubblicato.";
  els.adminForm.reset();

  await refreshTimeline();
}

async function refreshTimeline() {
  els.loading.hidden = false;
  els.content.hidden = true;
  els.error.hidden = true;

  try {
    const data = await loadSources();
    state.events = buildAllEvents(data);

    renderFilters();
    renderTimeline();
    renderSummary();
    updateLiveState();

    els.loading.hidden = true;
    els.content.hidden = false;
  } catch (error) {
    console.error("Errore Timeline:", error);
    els.loading.hidden = true;
    els.error.hidden = false;
    els.errorText.textContent = error?.message || "Errore durante il caricamento della stagione.";
  }
}

async function init() {
  state.isAdmin = await detectAdmin();
  await refreshTimeline();
  setupAdminUi();
}

init();
