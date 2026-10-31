import { supabase } from "./supabase.js";

// ======== CONFIG ========
const CRASHOUT_SEASON = "2026";
const LOGO_BASE_PATH = "img/";
const LOGO_EXT = ".webp";

// Stessa lista della pagina Rivalry: serve per calcolare il seeding dinamico.
const TEAM_DATA = [
  { nome: "Atlètico Leon", logo: "img/Atlético Leon.webp" },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.webp" },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.webp" },
  { nome: "Golden Knights", logo: "img/Golden Knights.webp" },
  { nome: "Ibla", logo: "img/Ibla.webp" },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.webp" },
  { nome: "Riverfilo", logo: "img/Riverfilo.webp" },
  { nome: "Desperados", logo: "img/Desperados.webp" },
  { nome: "Wildboys 78", logo: "img/wildboys78.webp" },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.webp" },
  { nome: "Pokermantra", logo: "img/PokerMantra.webp" },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.webp" },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.webp" },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.webp" },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.webp" },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.webp" }
];

const TEAM_NAMES = TEAM_DATA.map(team => team.nome);
const TEAM_LOGOS = Object.fromEntries(TEAM_DATA.map(team => [team.nome, team.logo]));

// PUNTEGGI playoff caricati da Supabase
let SCORES = {};
let SEED_LOCK = { locked: false, seeds: [], lockedAt: null };

// Mobile Miami Vice. I dati dei punteggi continuano a vivere nella
// tabella Supabase crashout_playoff_scores gia' usata dalla versione desktop.
const MIAMI_IMG_PATH = "img/crashout-miami/";
const TEAM_MIAMI_IMAGES = {
  "Atlètico Leon": "atletico-leon.webp",
  "Bayern Christiansen": "bayern-christiansen.webp",
  "Team Bartowski": "team-bartowski.webp",
  "Golden Knights": "golden-knights.webp",
  "Ibla": "ibla.webp",
  "Fantaugusta": "fantaugusta.webp",
  "Riverfilo": "riverfilo.webp",
  "Desperados": "desperados.webp",
  "Wildboys 78": "wildboys.webp",
  "Pandinicoccolosini": "pandini.webp",
  "Pokermantra": "pokermantra.webp",
  "Minnesode Timberland": "minnesode.webp",
  "Minnesota Snakes": "minnesota-snakes.webp",
  "Eintracht Franco 126": "eintracht-franco.webp",
  "FC Disoneste": "fc-disoneste.webp",
  "Athletic Pongao": "athletic-pongao.webp"
};
let IS_CRASH_ADMIN = false;
let LAST_CRASH_BRACKET = null;
let ACTIVE_MIAMI_ROUND = "ottavi";
let ACTIVE_MIAMI_SERIES = { ottavi: 0, quarti: 0, semifinali: 0, finale: 0 };
let MIAMI_EDIT_SERIES_ID = null;
let MIAMI_SAVING = false;

function crashEscape(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}


const SERIES_META = [
  { id: "L1", label: "Ottavo 1", side: "Sinistra" },
  { id: "L2", label: "Ottavo 2", side: "Sinistra" },
  { id: "L3", label: "Ottavo 3", side: "Sinistra" },
  { id: "L4", label: "Ottavo 4", side: "Sinistra" },

  { id: "R1", label: "Ottavo 1", side: "Destra" },
  { id: "R2", label: "Ottavo 2", side: "Destra" },
  { id: "R3", label: "Ottavo 3", side: "Destra" },
  { id: "R4", label: "Ottavo 4", side: "Destra" },

  { id: "LSF1", label: "Quarto 1", side: "Sinistra" },
  { id: "LSF2", label: "Quarto 2", side: "Sinistra" },
  { id: "RSF1", label: "Quarto 1", side: "Destra" },
  { id: "RSF2", label: "Quarto 2", side: "Destra" },

  { id: "LCF", label: "Semifinale", side: "Sinistra" },
  { id: "RCF", label: "Semifinale", side: "Destra" },

  { id: "F", label: "Finale", side: "Finale" }
];

// ======== UTILS ========
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function urlNoCache(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_cb=${Date.now()}`;
}

function isNumeric(v) {
  return /^\d+$/.test((v ?? "").toString().trim());
}

function logoSrc(team) {
  return encodeURI(TEAM_LOGOS[team] || `${LOGO_BASE_PATH}${team}${LOGO_EXT}`);
}

function clamp03(n) {
  n = Number(n || 0);
  return Math.max(0, Math.min(3, n));
}

async function loadScoresFromSupabase() {
  const { data, error } = await supabase
    .from("crashout_playoff_scores")
    .select("series_id, home_score, away_score");

  if (error) {
    console.error("Errore caricamento risultati Crash Out:", error);
    return;
  }

  SCORES = {};

  (data || []).forEach(row => {
    SCORES[row.series_id] = {
      home: clamp03(row.home_score),
      away: clamp03(row.away_score)
    };
  });
}

async function isCurrentUserAdmin() {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    return false;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profileError) {
    console.error("Errore profilo admin Crash Out:", profileError);
    return false;
  }

  return String(profile?.role || "").toLowerCase() === "admin";
}

async function initCrashAdminPanel() {
  const panel = document.getElementById("crash-admin-panel");
  const toggle = document.getElementById("crash-admin-toggle");
  const saveBtn = document.getElementById("crash-admin-save");
  const seedLockBtn = document.getElementById("crash-seed-lock-btn");

  if (!panel) return;

  const isAdmin = await isCurrentUserAdmin();
  IS_CRASH_ADMIN = isAdmin;
  if (LAST_CRASH_BRACKET) renderMobileList(LAST_CRASH_BRACKET);

  if (!isAdmin) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");

  // Ricarica i risultati e popola sempre la griglia admin
  await loadScoresFromSupabase();
  renderSeedLockPanel();
  renderCrashAdminPanel();

  toggle?.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  seedLockBtn?.addEventListener("click", lockCurrentPlayoffSeeds);
  saveBtn?.addEventListener("click", saveCrashAdminScores);
}

function renderCrashAdminPanel() {
  const grid = document.getElementById("crash-admin-grid");
  if (!grid) return;

  grid.innerHTML = SERIES_META.map(series => {
    const score = getScoreFor(series.id);

    return `
      <article class="crash-admin-row">
        <div class="crash-admin-series">
          <strong>${series.id}</strong>
          <span>${series.label} · ${series.side}</span>
        </div>

        <label>
          Casa
          <input
            type="number"
            min="0"
            max="3"
            value="${score.home}"
            data-series-id="${series.id}"
            data-score-side="home"
          >
        </label>

        <label>
          Trasferta
          <input
            type="number"
            min="0"
            max="3"
            value="${score.away}"
            data-series-id="${series.id}"
            data-score-side="away"
          >
        </label>
      </article>
    `;
  }).join("");
}

async function saveCrashAdminScores() {
  const status = document.getElementById("crash-admin-status");
  const inputs = Array.from(
    document.querySelectorAll("#crash-admin-grid input[data-series-id]")
  );

  const grouped = {};

  inputs.forEach(input => {
    const seriesId = input.dataset.seriesId;
    const side = input.dataset.scoreSide;

    if (!grouped[seriesId]) {
      grouped[seriesId] = {
        series_id: seriesId,
        home_score: 0,
        away_score: 0
      };
    }

    const value = clamp03(input.value);

    if (side === "home") grouped[seriesId].home_score = value;
    if (side === "away") grouped[seriesId].away_score = value;
  });

  const payload = Object.values(grouped).map(row => ({
    ...row,
    updated_at: new Date().toISOString()
  }));

  if (status) status.textContent = SEED_LOCK.locked
    ? "Salvataggio in corso..."
    : "Salvataggio in corso... Nota: i seed non sono ancora bloccati.";

  const { error } = await supabase
    .from("crashout_playoff_scores")
    .upsert(payload, {
      onConflict: "series_id"
    });

  if (error) {
    console.error("Errore salvataggio risultati Crash Out:", error);
    if (status) status.textContent = "Errore durante il salvataggio.";
    return;
  }

  if (status) status.textContent = SEED_LOCK.locked
    ? "Risultati salvati. Bracket aggiornato."
    : "Risultati salvati. Bracket aggiornato, ma i seed sono ancora dinamici.";

  await loadScoresFromSupabase();
  await buildBracket();
  renderSeedLockPanel();
  renderCrashAdminPanel();
}

function getScoreFor(seriesId) {
  const s = SCORES?.[seriesId] || {};
  return { home: clamp03(s.home), away: clamp03(s.away) };
}

function safeTeamName(team) {
  return team && team !== "TBD" ? team : "TBD";
}

// ======== NAVBAR ========
document.addEventListener("DOMContentLoaded", () => {
  const hamburger = $("#hamburger");
  const mainMenu = $("#mainMenu");
  const submenuToggles = $$(".toggle-submenu");

  hamburger?.addEventListener("click", () => {
    mainMenu?.classList.toggle("show");
  });

  submenuToggles.forEach(toggle => {
    toggle.addEventListener("click", e => {
      e.preventDefault();
      toggle.closest(".dropdown")?.classList.toggle("show");
    });
  });
});

// ======== SEED PLAYOFF: DINAMICO DA RIVALRY O BLOCCATO DA ADMIN ========
function initialRank(team) {
  const idx = TEAM_NAMES.indexOf(team);
  return idx === -1 ? 999 : idx;
}

function formatSeedLockDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

async function loadLockedSeedsFromSupabase() {
  const { data, error } = await supabase
    .from("crashout_playoff_seeds")
    .select("seed_number, team_name, locked_at")
    .eq("season", CRASHOUT_SEASON)
    .order("seed_number", { ascending: true });

  if (error) {
    console.warn("Seed playoff non bloccati o tabella non ancora creata:", error.message || error);
    return null;
  }

  if (!data || data.length < 16) {
    return { locked: false, seeds: [], lockedAt: null };
  }

  const seeds = data.slice(0, 16).map(row => ({
    seed: Number(row.seed_number),
    team: row.team_name
  }));

  const complete = seeds.length === 16 && seeds.every(row => row.seed && row.team);

  return {
    locked: complete,
    seeds: complete ? seeds : [],
    lockedAt: complete ? data[0]?.locked_at : null
  };
}

async function calculateRivalrySeedsFromSupabase() {
  const { data, error } = await supabase
    .from("crashout_rivalry_matches")
    .select("home_team, away_team, home_goals, away_goals, home_magic, away_magic, is_played")
    .eq("season", CRASHOUT_SEASON);

  if (error) {
    console.error("Errore caricamento risultati Rivalry per seed playoff:", error);
    return TEAM_NAMES.map((team, index) => ({ seed: index + 1, team }));
  }

  const table = new Map();

  TEAM_NAMES.forEach(team => {
    table.set(team, {
      team,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
      fantasyPoints: 0
    });
  });

  (data || []).forEach(match => {
    if (!match.is_played) return;

    const home = table.get(match.home_team);
    const away = table.get(match.away_team);
    if (!home || !away) return;

    const homeGoals = Number(match.home_goals);
    const awayGoals = Number(match.away_goals);
    if (!Number.isFinite(homeGoals) || !Number.isFinite(awayGoals)) return;

    home.played += 1;
    away.played += 1;

    home.gf += homeGoals;
    home.ga += awayGoals;
    away.gf += awayGoals;
    away.ga += homeGoals;

    home.fantasyPoints += Number(match.home_magic || 0);
    away.fantasyPoints += Number(match.away_magic || 0);

    if (homeGoals > awayGoals) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (homeGoals < awayGoals) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  });

  const standings = Array.from(table.values()).map(row => ({
    ...row,
    gd: row.gf - row.ga
  }));

  standings.sort((a, b) =>
    b.points - a.points ||
    b.fantasyPoints - a.fantasyPoints ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    initialRank(a.team) - initialRank(b.team)
  );

  return standings.slice(0, 16).map((row, index) => ({
    seed: index + 1,
    team: row.team,
    points: row.points,
    played: row.played,
    gd: row.gd,
    gf: row.gf,
    fantasyPoints: row.fantasyPoints
  }));
}

async function loadStandings() {
  const locked = await loadLockedSeedsFromSupabase();

  if (locked?.locked) {
    SEED_LOCK = locked;
    return locked.seeds;
  }

  const dynamicSeeds = await calculateRivalrySeedsFromSupabase();

  SEED_LOCK = {
    locked: false,
    seeds: dynamicSeeds,
    lockedAt: null
  };

  return dynamicSeeds.map(row => ({ seed: row.seed, team: row.team }));
}

function renderSeedLockPanel() {
  const status = document.getElementById("crash-seed-lock-status");
  const btn = document.getElementById("crash-seed-lock-btn");
  const preview = document.getElementById("crash-seed-preview");

  if (!status || !btn || !preview) return;

  if (SEED_LOCK.locked) {
    btn.disabled = true;
    btn.textContent = "Tabellone bloccato";
    status.textContent = `Seed bloccati${SEED_LOCK.lockedAt ? ` il ${formatSeedLockDate(SEED_LOCK.lockedAt)}` : ""}. Da ora i risultati playoff non cambiano più gli accoppiamenti.`;
    status.classList.add("is-ok");
  } else {
    btn.disabled = false;
    btn.textContent = "Blocca tabellone playoff";
    status.textContent = "Seed dinamici attivi: il tabellone segue la classifica Rivalry finché non lo blocchi.";
    status.classList.remove("is-ok");
  }

  const seeds = SEED_LOCK.seeds || [];
  preview.innerHTML = seeds.slice(0, 16).map(row => `
    <span class="seed-preview-chip">
      <strong>#${row.seed}</strong>${row.team}
    </span>
  `).join("");
}

async function lockCurrentPlayoffSeeds() {
  const status = document.getElementById("crash-seed-lock-status");
  const btn = document.getElementById("crash-seed-lock-btn");

  if (SEED_LOCK.locked) return;

  if (status) status.textContent = "Blocco tabellone in corso...";
  if (btn) btn.disabled = true;

  const currentSeeds = await calculateRivalrySeedsFromSupabase();

  if (!currentSeeds || currentSeeds.length < 16) {
    if (status) status.textContent = "Impossibile bloccare: servono 16 seed validi.";
    if (btn) btn.disabled = false;
    return;
  }

  const now = new Date().toISOString();
  const payload = currentSeeds.slice(0, 16).map(row => ({
    season: CRASHOUT_SEASON,
    seed_number: row.seed,
    team_name: row.team,
    locked_at: now,
    updated_at: now
  }));

  const { error } = await supabase
    .from("crashout_playoff_seeds")
    .upsert(payload, { onConflict: "season,seed_number" });

  if (error) {
    console.error("Errore blocco seed playoff:", error);
    if (status) status.textContent = "Errore: non riesco a bloccare il tabellone. Controlla SQL/policy Supabase.";
    if (btn) btn.disabled = false;
    return;
  }

  SEED_LOCK = {
    locked: true,
    seeds: payload.map(row => ({ seed: row.seed_number, team: row.team_name })),
    lockedAt: now
  };

  renderSeedLockPanel();
  await buildBracket();
}

// ======== BRACKET MODEL ========
function makeRound1Pairs(seeds) {
  const bySeed = Object.fromEntries(seeds.map(x => [x.seed, x]));

  return {
    left: [
      { id: "L1", home: bySeed[1], away: bySeed[16] },
      { id: "L2", home: bySeed[8], away: bySeed[9] },
      { id: "L3", home: bySeed[5], away: bySeed[12] },
      { id: "L4", home: bySeed[4], away: bySeed[13] },
    ],
    right: [
      { id: "R1", home: bySeed[3], away: bySeed[14] },
      { id: "R2", home: bySeed[6], away: bySeed[11] },
      { id: "R3", home: bySeed[7], away: bySeed[10] },
      { id: "R4", home: bySeed[2], away: bySeed[15] },
    ]
  };
}

function makeEmptyMatch(id) {
  return {
    id,
    home: { seed: "", team: "TBD" },
    away: { seed: "", team: "TBD" }
  };
}

function makeBracketStructure(seeds) {
  const r1 = makeRound1Pairs(seeds);

  return {
    r1,
    leftSF:  [makeEmptyMatch("LSF1"), makeEmptyMatch("LSF2")],
    rightSF: [makeEmptyMatch("RSF1"), makeEmptyMatch("RSF2")],
    leftCF:  [makeEmptyMatch("LCF")],
    rightCF: [makeEmptyMatch("RCF")],
    finals:  [makeEmptyMatch("F")]
  };
}

// ======== WINNERS ========
const TBD = { seed: "", team: "TBD" };

function winnerOf(match, seriesId) {
  const s = getScoreFor(seriesId);

  if (s.home >= 3 && s.home > s.away) return match.home;
  if (s.away >= 3 && s.away > s.home) return match.away;

  return null;
}

function propagateWinners(bracket) {
  const [L1m, L2m, L3m, L4m] = bracket.r1.left;
  const [R1m, R2m, R3m, R4m] = bracket.r1.right;

  const wL1 = winnerOf(L1m, "L1");
  const wL2 = winnerOf(L2m, "L2");
  const wL3 = winnerOf(L3m, "L3");
  const wL4 = winnerOf(L4m, "L4");

  bracket.leftSF[0].home = wL1 || TBD;
  bracket.leftSF[0].away = wL2 || TBD;
  bracket.leftSF[1].home = wL3 || TBD;
  bracket.leftSF[1].away = wL4 || TBD;

  const wR1 = winnerOf(R1m, "R1");
  const wR2 = winnerOf(R2m, "R2");
  const wR3 = winnerOf(R3m, "R3");
  const wR4 = winnerOf(R4m, "R4");

  bracket.rightSF[0].home = wR1 || TBD;
  bracket.rightSF[0].away = wR2 || TBD;
  bracket.rightSF[1].home = wR3 || TBD;
  bracket.rightSF[1].away = wR4 || TBD;

  const wLSF1 = winnerOf(bracket.leftSF[0], "LSF1");
  const wLSF2 = winnerOf(bracket.leftSF[1], "LSF2");
  bracket.leftCF[0].home = wLSF1 || TBD;
  bracket.leftCF[0].away = wLSF2 || TBD;

  const wRSF1 = winnerOf(bracket.rightSF[0], "RSF1");
  const wRSF2 = winnerOf(bracket.rightSF[1], "RSF2");
  bracket.rightCF[0].home = wRSF1 || TBD;
  bracket.rightCF[0].away = wRSF2 || TBD;

  const wLCF = winnerOf(bracket.leftCF[0], "LCF");
  const wRCF = winnerOf(bracket.rightCF[0], "RCF");
  bracket.finals[0].home = wLCF || TBD;
  bracket.finals[0].away = wRCF || TBD;
}

// ======== CLEAR ========
function clearBracket() {
  [
    "left-round-1",
    "left-round-2",
    "left-round-3",
    "right-round-1",
    "right-round-2",
    "right-round-3",
    "finals-top",
    "finals-bottom",
    "bracket-mobile"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
}

// ======== MATCH UI ========
function applyScoresToNode(node, seriesId) {
  const scoreBoxes = node.querySelectorAll(".score-box");
  const s = getScoreFor(seriesId);

  if (scoreBoxes[0]) scoreBoxes[0].textContent = String(s.home);
  if (scoreBoxes[1]) scoreBoxes[1].textContent = String(s.away);

  scoreBoxes.forEach(box => {
    box.setAttribute("contenteditable", "false");
  });
}

function applyWinnerStyles(node, seriesId) {
  const s = getScoreFor(seriesId);
  const teams = node.querySelectorAll(".team");
  const homeEl = teams[0];
  const awayEl = teams[1];

  if (homeEl && s.home >= 3 && s.home > s.away) {
    homeEl.classList.add("is-winner");
    node.classList.add("winner-home");
  }

  if (awayEl && s.away >= 3 && s.away > s.home) {
    awayEl.classList.add("is-winner");
    node.classList.add("winner-away");
  }
}

function applyTeamLogo(img, team) {
  const wrap = img?.parentElement;
  const isTbd = !team || team === "TBD";

  if (isTbd) {
    img.removeAttribute("src");
    img.alt = "";
    img.classList.add("hidden");
    wrap?.classList.add("no-logo", "is-tbd");
    return;
  }

  img.alt = team;
  img.src = logoSrc(team);
  img.classList.remove("hidden");
  wrap?.classList.remove("no-logo", "is-tbd");
}

function createMatchElement(match) {
  const tpl = document.getElementById("match-template");
  const node = tpl.content.firstElementChild.cloneNode(true);
  node.dataset.series = match.id;

  const [homeEl, awayEl] = node.querySelectorAll(".team");
  const [homeSeed, awaySeed] = node.querySelectorAll(".seed");
  const [homeLogo, awayLogo] = node.querySelectorAll(".logo");
  const [homeName, awayName] = node.querySelectorAll(".team-name");

  const homeIsTbd = !match.home.team || match.home.team === "TBD";
  const awayIsTbd = !match.away.team || match.away.team === "TBD";

  homeSeed.textContent = match.home.seed || "";
  awaySeed.textContent = match.away.seed || "";

  homeName.textContent = homeIsTbd ? "" : safeTeamName(match.home.team);
  awayName.textContent = awayIsTbd ? "" : safeTeamName(match.away.team);

  homeEl.classList.toggle("is-tbd", homeIsTbd);
  awayEl.classList.toggle("is-tbd", awayIsTbd);

  homeEl.title = homeIsTbd ? "" : safeTeamName(match.home.team);
  awayEl.title = awayIsTbd ? "" : safeTeamName(match.away.team);

  applyTeamLogo(homeLogo, match.home.team);
  applyTeamLogo(awayLogo, match.away.team);

  homeLogo.onerror = () => {
    homeLogo.classList.add("hidden");
    homeLogo.parentElement.classList.add("no-logo");
  };

  awayLogo.onerror = () => {
    awayLogo.classList.add("hidden");
    awayLogo.parentElement.classList.add("no-logo");
  };

  applyScoresToNode(node, match.id);
  applyWinnerStyles(node, match.id);

  return node;
}

function createFinalSide(teamObj, side, seriesId) {
  const node = createMatchElement({
    id: seriesId,
    home: side === "home" ? teamObj : { seed: "", team: "TBD" },
    away: side === "away" ? teamObj : { seed: "", team: "TBD" }
  });

  const rows = node.querySelectorAll(".team");

  if (side === "home") {
    rows[1]?.remove();
  } else {
    rows[0]?.remove();
  }

  node.classList.add("one-team");

  const scoreBox = node.querySelector(".score-box");
  const s = getScoreFor(seriesId);

  if (scoreBox) {
    scoreBox.textContent = String(side === "home" ? s.home : s.away);
  }

  const remainingTeam = node.querySelector(".team");
  if (remainingTeam) {
    const homeWon = s.home >= 3 && s.home > s.away;
    const awayWon = s.away >= 3 && s.away > s.home;

    if ((side === "home" && homeWon) || (side === "away" && awayWon)) {
      remainingTeam.classList.add("is-winner");
      node.classList.add("winner-both");
    }
  }

  return node;
}

// ======== RENDER ========
function renderRound(containerId, matches) {
  const container = document.getElementById(containerId);
  if (!container) return;

  matches.forEach(match => {
    container.appendChild(createMatchElement(match));
  });
}

function createMobileTrophyHero() {
  const hero = document.createElement("section");
  hero.className = "mobile-trophy-hero";
  hero.innerHTML = `
    <div class="mobile-trophy-kicker">Lega degli Eroi</div>
    <div class="mobile-trophy-image" aria-hidden="true"></div>
    <h2 class="mobile-trophy-title">Crash Out Cup</h2>
    <div class="mobile-trophy-subtitle">Best of 5 Series</div>
  `;
  return hero;
}

function createMobileLogo(teamObj) {
  const wrap = document.createElement("span");
  wrap.className = "mobile-logo-wrap";

  const img = document.createElement("img");
  img.className = "mobile-logo";
  img.alt = safeTeamName(teamObj?.team);

  if (teamObj?.team && teamObj.team !== "TBD") {
    img.src = logoSrc(teamObj.team);
  } else {
    img.classList.add("hidden");
    wrap.classList.add("no-logo");
  }

  img.onerror = () => {
    img.classList.add("hidden");
    wrap.classList.add("no-logo");
  };

  wrap.appendChild(img);
  return wrap;
}

// ======== MIAMI VICE MOBILE: ONE FIGHT CARD PER SERIES ========
const MIAMI_ROUNDS = [
  { id: "ottavi", label: "Ottavi", title: "OTTAVI DI FINALE", short: "OTTAVI", prefix: "SERIE" },
  { id: "quarti", label: "Quarti", title: "QUARTI DI FINALE", short: "QUARTI", prefix: "QUARTO" },
  { id: "semifinali", label: "Semifinali", title: "SEMIFINALI", short: "SEMIFINALI", prefix: "SEMIFINALE" },
  { id: "finale", label: "Finale", title: "GRAN FINALE", short: "FINALE", prefix: "FINALE" }
];

function getMiamiPanels(bracket) {
  return {
    ottavi: [...bracket.r1.left, ...bracket.r1.right],
    quarti: [...bracket.leftSF, ...bracket.rightSF],
    semifinali: [...bracket.leftCF, ...bracket.rightCF],
    finale: bracket.finals
  };
}

function getMatchById(bracket, id) {
  return Object.values(getMiamiPanels(bracket)).flat().find(m => m.id === id) || null;
}

function createMiamiPortrait(teamObj, side) {
  const team = teamObj?.team || "TBD";
  const isTbd = team === "TBD";
  if (isTbd) return `<div class="cv-portrait cv-${side} cv-pending" aria-hidden="true">?</div>`;
  const image = TEAM_MIAMI_IMAGES[team];
  if (!image) return `<div class="cv-portrait cv-${side} cv-pending" aria-hidden="true">?</div>`;
  return `<img class="cv-portrait cv-${side}" src="${MIAMI_IMG_PATH}${image}" alt="Mascotte di ${crashEscape(team)}" loading="eager" decoding="async">`;
}

function createMiamiMatchCard(match, meta, index) {
  const s = getScoreFor(match.id);
  const homeTeam = match.home?.team && match.home.team !== "TBD" ? match.home.team : "Da definire";
  const awayTeam = match.away?.team && match.away.team !== "TBD" ? match.away.team : "Da definire";
  const hasTeams = homeTeam !== "Da definire" && awayTeam !== "Da definire";
  const homeWon = s.home >= 3 && s.home > s.away;
  const awayWon = s.away >= 3 && s.away > s.home;
  const winner = homeWon ? homeTeam : awayWon ? awayTeam : null;
  const totalPlayed = Math.min(5, s.home + s.away);
  const badges = Array.from({ length: 5 }, (_, i) => {
    // Questo e' un progresso aggregato (numero vittorie), non uno storico cronologico
    // delle gare: il database attuale salva 2 totali, non 5 risultati individuali.
    const side = i < s.home ? "home" : i < totalPlayed ? "away" : "";
    const team = side === "home" ? homeTeam : side === "away" ? awayTeam : "";
    return `<span class="cv-game ${side ? `cv-game-${side}` : "cv-game-empty"}" title="${side ? `Vittoria ${crashEscape(team)}` : "Vittoria ancora da assegnare"}" aria-label="${side ? `Una vittoria per ${crashEscape(team)}` : "Vittoria da assegnare"}">${side ? `<img src="${crashEscape(logoSrc(team))}" alt="" loading="lazy" onerror="this.style.display='none'">` : `<span>${i + 1}</span>`}</span>`;
  }).join("");
  const editor = IS_CRASH_ADMIN && hasTeams;
  const scoreboardInner = `
    <span class="cv-score-title">BEST OF 5</span>
    <span class="cv-score-numbers"><b>${s.home}</b><span>–</span><b>${s.away}</b></span>
    <span class="cv-score-caption">${editor ? "TOCCA PER ASSEGNARE UNA VITTORIA" : "PRIMO A 3 VITTORIE"}</span>
    <span class="cv-games">${badges}</span>
    ${winner ? `<span class="cv-qualified">✦ ${crashEscape(winner)} QUALIFICATA</span>` : ""}
  `;
  const scoreBox = editor
    ? `<button type="button" class="cv-scoreboard cv-scoreboard-admin" data-edit-miami="${match.id}" aria-label="Gestisci Best of 5: ${crashEscape(homeTeam)} contro ${crashEscape(awayTeam)}">${scoreboardInner}</button>`
    : `<div class="cv-scoreboard">${scoreboardInner}</div>`;
  return `
    <article class="cv-fight${winner ? " cv-fight-finished" : ""}" data-series="${match.id}">
      <div class="cv-fight-head"><strong>${meta.prefix} ${index + 1}</strong><span>${meta.short} · ROAD TO THE CRASH</span></div>
      <div class="cv-scene">
        <div class="cv-city" aria-hidden="true"></div>
        <img class="cv-palm cv-palm-left" src="${MIAMI_IMG_PATH}palma.svg" alt="" aria-hidden="true">
        <img class="cv-palm cv-palm-right" src="${MIAMI_IMG_PATH}palma.svg" alt="" aria-hidden="true">
        <div class="cv-person${homeWon ? " cv-person-advance" : awayWon ? " cv-person-eliminated" : ""}">${createMiamiPortrait(match.home, "home")}</div>
        <div class="cv-person${awayWon ? " cv-person-advance" : homeWon ? " cv-person-eliminated" : ""}">${createMiamiPortrait(match.away, "away")}</div>
        <span class="cv-vs" aria-hidden="true">VS</span>
      </div>
      <div class="cv-names">
        <div class="cv-nameplate"><span class="cv-seed">${match.home?.seed ? "#"+crashEscape(match.home.seed) : "?"}</span><strong>${crashEscape(homeTeam)}</strong></div>
        <div class="cv-nameplate cv-nameplate-away"><strong>${crashEscape(awayTeam)}</strong><span class="cv-seed">${match.away?.seed ? "#"+crashEscape(match.away.seed) : "?"}</span></div>
      </div>
      ${scoreBox}
    </article>
  `;
}

function renderMobileList(bracket) {
  LAST_CRASH_BRACKET = bracket;
  const mobile = document.getElementById("bracket-mobile");
  if (!mobile) return;
  const panels = getMiamiPanels(bracket);
  const meta = MIAMI_ROUNDS.find(m => m.id === ACTIVE_MIAMI_ROUND) || MIAMI_ROUNDS[0];
  const matches = panels[meta.id];
  const index = Math.max(0, Math.min(matches.length - 1, ACTIVE_MIAMI_SERIES[meta.id] || 0));
  ACTIVE_MIAMI_SERIES[meta.id] = index;
  const match = matches[index];
  mobile.innerHTML = `
    <section class="cv-mobile" aria-label="Crash Out Cup Miami Vice">
      <nav class="cv-rounds" aria-label="Turni Crash Out">
        ${MIAMI_ROUNDS.map(m => `<button type="button" data-cv-round="${m.id}" class="${m.id === meta.id ? "is-active" : ""}" aria-pressed="${m.id === meta.id}">${m.label}</button>`).join("")}
      </nav>
      <div class="cv-round-heading"><strong>${meta.title}</strong><span>BEST OF 5 · ${matches.length} ${matches.length === 1 ? "SFIDA" : "SFIDE"}</span></div>
      <nav class="cv-series-nav" aria-label="Seleziona sfida">
        ${matches.map((m, i) => `<button type="button" data-cv-series="${i}" class="${i === index ? "is-active" : ""}" aria-pressed="${i === index}">${meta.prefix} ${i + 1}</button>`).join("")}
      </nav>
      ${createMiamiMatchCard(match, meta, index)}
      <div class="cv-series-footer">
        <button type="button" data-cv-prev ${index === 0 ? "disabled" : ""}>‹ PRECEDENTE</button>
        <span>${index + 1} / ${matches.length}</span>
        <button type="button" data-cv-next ${index === matches.length - 1 ? "disabled" : ""}>SUCCESSIVA ›</button>
      </div>
    </section>
  `;
  mobile.querySelectorAll("[data-cv-round]").forEach(btn => btn.addEventListener("click", () => {
    ACTIVE_MIAMI_ROUND = btn.dataset.cvRound;
    renderMobileList(LAST_CRASH_BRACKET);
  }));
  mobile.querySelectorAll("[data-cv-series]").forEach(btn => btn.addEventListener("click", () => {
    ACTIVE_MIAMI_SERIES[meta.id] = Number(btn.dataset.cvSeries);
    renderMobileList(LAST_CRASH_BRACKET);
  }));
  mobile.querySelector("[data-cv-prev]")?.addEventListener("click", () => {
    ACTIVE_MIAMI_SERIES[meta.id] = Math.max(0, index - 1);
    renderMobileList(LAST_CRASH_BRACKET);
  });
  mobile.querySelector("[data-cv-next]")?.addEventListener("click", () => {
    ACTIVE_MIAMI_SERIES[meta.id] = Math.min(matches.length - 1, index + 1);
    renderMobileList(LAST_CRASH_BRACKET);
  });
  mobile.querySelector("[data-edit-miami]")?.addEventListener("click", () => {
    if (IS_CRASH_ADMIN) openMiamiScoreEditor(match.id);
  });
  // Mantiene il bottone della serie attiva visibile nello scorrimento orizzontale.
  const activeChip = mobile.querySelector(".cv-series-nav .is-active");
  if (activeChip) {
    const scroller = activeChip.parentElement;
    scroller.scrollLeft = Math.max(0, activeChip.offsetLeft - scroller.offsetLeft - 10);
  }
}

function closeMiamiScoreEditor() {
  const modal = document.getElementById("cv-admin-modal");
  if (modal) modal.hidden = true;
  document.body.classList.remove("cv-modal-open");
  MIAMI_EDIT_SERIES_ID = null;
}

function openMiamiScoreEditor(seriesId) {
  if (!IS_CRASH_ADMIN || !LAST_CRASH_BRACKET) return;
  const match = getMatchById(LAST_CRASH_BRACKET, seriesId);
  if (!match || !match.home?.team || !match.away?.team || match.home.team === "TBD" || match.away.team === "TBD") return;
  MIAMI_EDIT_SERIES_ID = seriesId;
  const modal = document.getElementById("cv-admin-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("cv-modal-open");
  renderMiamiScoreEditor();
  modal.querySelector(".cv-modal-close")?.focus();
}

function renderMiamiScoreEditor(statusText = "") {
  if (!MIAMI_EDIT_SERIES_ID) return;
  const match = getMatchById(LAST_CRASH_BRACKET, MIAMI_EDIT_SERIES_ID);
  const modal = document.getElementById("cv-admin-modal");
  if (!match || !modal) return;
  const score = getScoreFor(match.id);
  const maxed = score.home >= 3 || score.away >= 3 || score.home + score.away >= 5;
  const adminBody = modal.querySelector(".cv-modal-body");
  const roundMeta = MIAMI_ROUNDS.find(m => getMiamiPanels(LAST_CRASH_BRACKET)[m.id].some(x => x.id === match.id));
  const matchIndex = roundMeta ? getMiamiPanels(LAST_CRASH_BRACKET)[roundMeta.id].findIndex(x => x.id === match.id) : 0;
  const roundLabel = roundMeta ? `${roundMeta.prefix} ${matchIndex + 1}` : match.id;
  adminBody.innerHTML = `
    <div class="cv-edit-kicker">COMMISSIONER CONTROL</div>
    <h2 id="cv-editor-title">BEST OF 5 · ${crashEscape(roundLabel)}</h2>
    <p class="cv-edit-subtitle">Assegna una vittoria. I punteggi vengono salvati su Supabase e aggiornano il tabellone.</p>
    <div class="cv-edit-score"><b>${score.home}</b><span>:</span><b>${score.away}</b></div>
    <div class="cv-edit-actions">
      <div class="cv-edit-team cv-edit-team-home">
        <img src="${crashEscape(logoSrc(match.home.team))}" alt="" onerror="this.style.display='none'">
        <strong>${crashEscape(match.home.team)}</strong>
        <button type="button" data-cv-award="home" ${maxed || MIAMI_SAVING ? "disabled" : ""}>+1 VITTORIA</button>
        <button class="cv-edit-undo" type="button" data-cv-remove="home" ${!score.home || MIAMI_SAVING ? "disabled" : ""}>−1 CORREGGI</button>
      </div>
      <div class="cv-edit-team cv-edit-team-away">
        <img src="${crashEscape(logoSrc(match.away.team))}" alt="" onerror="this.style.display='none'">
        <strong>${crashEscape(match.away.team)}</strong>
        <button type="button" data-cv-award="away" ${maxed || MIAMI_SAVING ? "disabled" : ""}>+1 VITTORIA</button>
        <button class="cv-edit-undo" type="button" data-cv-remove="away" ${!score.away || MIAMI_SAVING ? "disabled" : ""}>−1 CORREGGI</button>
      </div>
    </div>
    ${maxed ? "<p class=\"cv-edit-done\">Serie conclusa. Per correggerla, togli prima una vittoria.</p>" : ""}
    ${!SEED_LOCK.locked ? `<div class="cv-edit-seed-warning"><span>⚠ Seed ancora dinamici: gli accoppiamenti possono cambiare.</span><button data-cv-lock-seeds type="button" ${MIAMI_SAVING ? "disabled" : ""}>Blocca tabellone</button></div>` : ""}
    <p class="cv-edit-status" role="status">${crashEscape(statusText)}</p>
  `;
  adminBody.querySelectorAll("[data-cv-award]").forEach(btn => btn.addEventListener("click", () => updateMiamiWin(btn.dataset.cvAward, 1)));
  adminBody.querySelectorAll("[data-cv-remove]").forEach(btn => btn.addEventListener("click", () => updateMiamiWin(btn.dataset.cvRemove, -1)));
  adminBody.querySelector("[data-cv-lock-seeds]")?.addEventListener("click", async () => {
    if (MIAMI_SAVING) return;
    MIAMI_SAVING = true;
    renderMiamiScoreEditor("Blocco seed in corso...");
    await lockCurrentPlayoffSeeds();
    MIAMI_SAVING = false;
    renderMiamiScoreEditor(SEED_LOCK.locked ? "Seed bloccati correttamente." : "Impossibile bloccare i seed. Controlla le autorizzazioni.");
  });
}

async function updateMiamiWin(side, delta) {
  if (!IS_CRASH_ADMIN || MIAMI_SAVING || !MIAMI_EDIT_SERIES_ID || !["home", "away"].includes(side) || ![-1, 1].includes(delta)) return;
  const match = getMatchById(LAST_CRASH_BRACKET, MIAMI_EDIT_SERIES_ID);
  if (!match || match.home?.team === "TBD" || match.away?.team === "TBD") return;
  const oldScore = getScoreFor(match.id);
  if (delta > 0 && (oldScore.home >= 3 || oldScore.away >= 3 || oldScore.home + oldScore.away >= 5)) return;
  const updated = { ...oldScore, [side]: oldScore[side] + delta };
  if (updated.home < 0 || updated.away < 0 || updated.home > 3 || updated.away > 3 || updated.home + updated.away > 5) return;
  MIAMI_SAVING = true;
  renderMiamiScoreEditor("Salvataggio in corso...");
  const { error } = await supabase.from("crashout_playoff_scores").upsert({
    series_id: match.id,
    home_score: updated.home,
    away_score: updated.away,
    updated_at: new Date().toISOString()
  }, { onConflict: "series_id" });
  MIAMI_SAVING = false;
  if (error) {
    console.error("Errore salvataggio Best of 5:", error);
    renderMiamiScoreEditor("Errore nel salvataggio. Verifica la policy admin Supabase.");
    return;
  }
  await buildBracket();
  renderCrashAdminPanel();
  renderMiamiScoreEditor("Vittoria aggiornata e tabellone ricalcolato.");
}

function initializeMiamiEditor() {
  const modal = document.getElementById("cv-admin-modal");
  if (!modal) return;
  modal.querySelector(".cv-modal-close")?.addEventListener("click", closeMiamiScoreEditor);
  modal.addEventListener("click", e => { if (e.target === modal) closeMiamiScoreEditor(); });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !modal.hidden) closeMiamiScoreEditor();
  });
}

document.addEventListener("DOMContentLoaded", initializeMiamiEditor);

// ======== WIRES ========
function ensureWireLayer(clear = false) {
  const bracket = document.querySelector(".bracket");
  if (!bracket) return null;

  if (getComputedStyle(bracket).position === "static") {
    bracket.style.position = "relative";
  }

  const layers = bracket.querySelectorAll(".wire-layer");
  layers.forEach((layer, index) => {
    if (index > 0) layer.remove();
  });

  let layer = layers[0];

  if (!layer) {
    layer = document.createElement("div");
    layer.className = "wire-layer";
    Object.assign(layer.style, {
      position: "absolute",
      inset: "0",
      pointerEvents: "none",
      zIndex: "0"
    });
    bracket.appendChild(layer);
  }

  if (clear) layer.replaceChildren();
  return layer;
}

function addSeg(layer, x, y, w, h) {
  const seg = document.createElement("div");
  seg.className = "wire";

  Object.assign(seg.style, {
    position: "absolute",
    left: `${x}px`,
    top: `${y}px`,
    width: `${w}px`,
    height: `${h}px`,
    background: "var(--wire-color)",
    borderRadius: (h <= 3 || w <= 3) ? "2px" : "6px"
  });

  layer.appendChild(seg);
}

function drawWires() {
  if (window.innerWidth <= 768) return;

  const layer = ensureWireLayer(true);
  if (!layer) return;

  const bracketRect = document.querySelector(".bracket").getBoundingClientRect();
  const H_PAD = 16;
  const STROKE = 4;

  function elbow(fromEl, toEl, nearTo = false) {
    const fr = fromEl.getBoundingClientRect();
    const tr = toEl.getBoundingClientRect();

    let ax = fr.right - bracketRect.left;
    let ay = fr.top - bracketRect.top + fr.height / 2;

    let bx = tr.left - bracketRect.left;
    let by = tr.top - bracketRect.top + tr.height / 2;

    if (ax > bx) {
      ax = fr.left - bracketRect.left;
      bx = tr.right - bracketRect.left;
    }

    const dir = (bx > ax) ? 1 : -1;
    const xk = nearTo ? (bx - dir * H_PAD) : (ax + (bx - ax) / 2);

    addSeg(layer, Math.min(ax, xk), ay - STROKE / 2, Math.abs(xk - ax), STROKE);
    addSeg(layer, xk - STROKE / 2, Math.min(ay, by), STROKE, Math.abs(by - ay));
    addSeg(layer, Math.min(xk, bx), by - STROKE / 2, Math.abs(bx - xk), STROKE);
  }

  const MAP = [
    { from: "#left-round-1 .match:nth-of-type(1)", to: "#left-round-2 .match:nth-of-type(1)" },
    { from: "#left-round-1 .match:nth-of-type(2)", to: "#left-round-2 .match:nth-of-type(1)" },
    { from: "#left-round-1 .match:nth-of-type(3)", to: "#left-round-2 .match:nth-of-type(2)" },
    { from: "#left-round-1 .match:nth-of-type(4)", to: "#left-round-2 .match:nth-of-type(2)" },

    { from: "#left-round-2 .match:nth-of-type(1)", to: "#left-round-3 .match:nth-of-type(1)", nearTo: true },
    { from: "#left-round-2 .match:nth-of-type(2)", to: "#left-round-3 .match:nth-of-type(1)", nearTo: true },

    { from: "#right-round-1 .match:nth-of-type(1)", to: "#right-round-2 .match:nth-of-type(1)" },
    { from: "#right-round-1 .match:nth-of-type(2)", to: "#right-round-2 .match:nth-of-type(1)" },
    { from: "#right-round-1 .match:nth-of-type(3)", to: "#right-round-2 .match:nth-of-type(2)" },
    { from: "#right-round-1 .match:nth-of-type(4)", to: "#right-round-2 .match:nth-of-type(2)" },

    { from: "#right-round-2 .match:nth-of-type(1)", to: "#right-round-3 .match:nth-of-type(1)", nearTo: true },
    { from: "#right-round-2 .match:nth-of-type(2)", to: "#right-round-3 .match:nth-of-type(1)", nearTo: true },

    { from: "#left-round-3 .match:nth-of-type(1)", to: "#finals-top .match:nth-of-type(1)" },
    { from: "#right-round-3 .match:nth-of-type(1)", to: "#finals-bottom .match:nth-of-type(1)" }
  ];

  MAP.forEach(({ from, to, nearTo }) => {
    const fromEl = document.querySelector(from);
    const toEl = document.querySelector(to);
    if (fromEl && toEl) elbow(fromEl, toEl, !!nearTo);
  });
}

// ======== BUILD ========
async function buildBracket() {
  try {
       await loadScoresFromSupabase();
    clearBracket();

    const seeds = await loadStandings();
    if (seeds.length < 16) {
      console.warn("Trovate meno di 16 squadre. Ne servono 16.");
    }

    const bracket = makeBracketStructure(seeds);
    propagateWinners(bracket);

    renderRound("left-round-1", bracket.r1.left);
    renderRound("right-round-1", bracket.r1.right);
    renderRound("left-round-2", bracket.leftSF);
    renderRound("right-round-2", bracket.rightSF);
    renderRound("left-round-3", bracket.leftCF);
    renderRound("right-round-3", bracket.rightCF);

    const finalMatch = bracket.finals[0];

    document
      .getElementById("finals-top")
      ?.appendChild(createFinalSide(finalMatch.home, "home", "F"));

    document
      .getElementById("finals-bottom")
      ?.appendChild(createFinalSide(finalMatch.away, "away", "F"));

    renderMobileList(bracket);
    renderSeedLockPanel();

    requestAnimationFrame(() => {
      drawWires();
      setTimeout(drawWires, 0);
    });

  } catch (error) {
    console.error("Errore costruzione bracket:", error);
  }
}

// ======== EVENTS ========
window.addEventListener("resize", () => {
  requestAnimationFrame(drawWires);
});

document.addEventListener("DOMContentLoaded", async () => {
  await buildBracket();
  await initCrashAdminPanel();
});

// =========================================================
// FIX NAVBAR MOBILE - CRASH OUT CUP
// =========================================================

document.addEventListener("DOMContentLoaded", () => {
  const hamburger = document.getElementById("hamburger");
  const mainMenu = document.getElementById("mainMenu");

  if (!hamburger || !mainMenu) return;

  hamburger.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();

    mainMenu.classList.toggle("show");
  });

  document.querySelectorAll("#mainMenu .toggle-submenu").forEach(toggle => {
    toggle.addEventListener("click", (event) => {
      if (window.innerWidth > 900) return;

      event.preventDefault();
      event.stopPropagation();

      const dropdown = toggle.closest(".dropdown");
      if (!dropdown) return;

      dropdown.classList.toggle("show");
    });
  });

  document.addEventListener("click", (event) => {
    if (window.innerWidth > 900) return;

    const clickedInsideNav = event.target.closest(".site-nav");

    if (!clickedInsideNav) {
      mainMenu.classList.remove("show");

      document.querySelectorAll("#mainMenu .dropdown.show").forEach(dropdown => {
        dropdown.classList.remove("show");
      });
    }
  });
});
