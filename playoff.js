/* =========================================
   STATISTICHE MASTER (Google Sheet)
   ========================================= */
const URL_STATS_MASTER =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSG3HrTJsfZGhgfJJx8l63QYhooGsyiydLf1OTt2JldOPx5nSZyJz00IplWA5YHGwjymNL9EXIVX5XA/pub?gid=1118969717&single=true&output=csv";

/* =========================================
   SUPABASE
   ========================================= */
const SUPABASE_URL = "https://vfzadnfpwsbzfiyzbpvx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PL6nGBOyzAOiXWXjuplwYw_-fr60KdO";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


/* =========================================
   UTILS
   ========================================= */
const norm = (s) => (s || "")
  .toString()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/^\s*\d+\s*°?\s*/, "")
  .replace(/\s+/g, " ")
  .trim()
  .toLowerCase();

const stripSeed = (txt) => (txt || "").replace(/^\s*\d+\s*°\s*/, "").trim();

const truthy = v => !(v === '' || v === 0 || v === null || v === undefined || v === false);

let isPlayoffAdmin = false;

async function checkPlayoffAdmin() {
  const { data: userData } = await supabaseClient.auth.getUser();
  const user = userData?.user;

  if (!user) {
    isPlayoffAdmin = false;
    hidePlayoffAdminPanel();
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (error) {
    console.error("Errore controllo admin playoff:", error);
    isPlayoffAdmin = false;
    hidePlayoffAdminPanel();
    return;
  }

  isPlayoffAdmin = data?.role === "admin";

  if (!isPlayoffAdmin) {
    hidePlayoffAdminPanel();
  }
}

function hidePlayoffAdminPanel() {
  const panel = document.getElementById("playoff-admin-panel");
  if (panel) panel.style.display = "none";
}

function showPlayoffAdminPanel() {
  const panel = document.getElementById("playoff-admin-panel");
  if (panel && isPlayoffAdmin) panel.style.display = "";
}


/* =========================================
   HTML CARD
   ========================================= */
function getScoreValue(value){
  return value !== undefined && value !== null && value !== "" ? value : "–";
}

function isNumericScore(value){
  return value !== "" && value !== null && value !== undefined && !isNaN(Number(value));
}

function usesSeedTieBreaker(code) {
  return code.startsWith("WC") || code.startsWith("Q");
}

function getBestSeedSide(matchData) {
  const homeSeed = Number(matchData?.home?.seed);
  const awaySeed = Number(matchData?.away?.seed);

  if (!Number.isFinite(homeSeed) || !Number.isFinite(awaySeed)) return null;

  if (homeSeed < awaySeed) return "home";
  if (awaySeed < homeSeed) return "away";

  return null;
}

function getWinnerSide(code, matchData = null){
  const pick = PICKS[code];
  if (!pick) return null;

  const h = pick.home;
  const a = pick.away;

  if (isNumericScore(h) && isNumericScore(a)) {
    const hn = Number(h);
    const an = Number(a);

    if (hn > an) return "home";
    if (an > hn) return "away";

    // Pareggio: in Wildcard e Quarti passa il seed migliore
    if (usesSeedTieBreaker(code) && matchData) {
      return getBestSeedSide(matchData);
    }

    return null;
  }

  if (truthy(h) && !truthy(a)) return "home";
  if (truthy(a) && !truthy(h)) return "away";

  return null;
}

function getMatchWinnerSide(code, matchData = null) {
  if (typeof getWinnerSide === "function") {
    return getWinnerSide(code, matchData);
  }

  return null;
}

function getMobileStageData(P) {
  const stages = {};

  Object.entries(MOBILE_STAGE_META).forEach(([stageKey, meta]) => {
    stages[stageKey] = meta.matches.map(item => ({
      code: item.code,
      next: item.next,
      home: P[item.code]?.home || null,
      away: P[item.code]?.away || null,
      winnerSide: getMatchWinnerSide(item.code, P[item.code])
    }));
  });

  return stages;
}

function creaMatchRowHTML(team, score, isWinner = false, isPlaceholder = false, isFinal = false) {
  const nomePulito = stripSeed(team?.name || "");
  const seed = team?.seed || "";
  const fileLogo = `img/${nomePulito}.webp`;

  return `
    <div class="match-row ${isWinner ? "is-winner" : ""} ${isPlaceholder ? "placeholder" : ""}">
      <div class="seed-box">${seed ? `#${seed}` : ""}</div>

      <div class="team-core">
        ${!isPlaceholder ? `<img src="${fileLogo}" alt="${nomePulito}" class="team-logo" onerror="this.style.display='none'">` : ""}
      </div>

      <div class="score-box">${getScoreValue(score)}</div>
    </div>
  `;
}

function creaHTMLPartita(code, matchData) {
  const home = matchData?.home || {};
  const away = matchData?.away || {};

 const winnerSide = getWinnerSide(code, matchData);

  const homePlaceholder = !home.seed && /vincente/i.test(home.name || "");
  const awayPlaceholder = !away.seed && /vincente/i.test(away.name || "");

  return `
    ${creaMatchRowHTML(home, PICKS[code]?.home, winnerSide === "home", homePlaceholder, code === "F")}
    ${creaMatchRowHTML(away, PICKS[code]?.away, winnerSide === "away", awayPlaceholder, code === "F")}
  `;
}

/* =========================================
   BRACKET MANUALE
   ========================================= */

const DEFAULT_PICKS = {
  WC1: { home: "", away: "" },
  WC2: { home: "", away: "" },
  WC3: { home: "", away: "" },
  WC4: { home: "", away: "" },

  Q1:  { home: "", away: "" },
  Q2:  { home: "", away: "" },
  Q3:  { home: "", away: "" },
  Q4:  { home: "", away: "" },

  S1:  { home: "", away: "" },
  S2:  { home: "", away: "" },

  F:   { home: "", away: "" },
};

const PICKS = structuredClone(DEFAULT_PICKS);

async function loadPlayoffResultsFromSupabase() {
  const { data, error } = await supabaseClient
    .from("playoff_results")
    .select("match_code, home_score, away_score");

  if (error) {
    console.error("Errore caricamento risultati playoff:", error);
    return;
  }

  Object.keys(DEFAULT_PICKS).forEach(code => {
    PICKS[code].home = "";
    PICKS[code].away = "";
  });

  data.forEach(row => {
    const code = row.match_code;
    if (!PICKS[code]) return;

    PICKS[code].home =
      row.home_score === null || row.home_score === undefined
        ? ""
        : Number(row.home_score);

    PICKS[code].away =
      row.away_score === null || row.away_score === undefined
        ? ""
        : Number(row.away_score);
  });
}

const WC_PAIRS = {
  WC1: [7, 8],
  WC3: [4, 11],
  WC2: [6, 9],
  WC4: [5, 10],
};

/* =========================================
   COMPUTE PARTECIPANTI
   ========================================= */
function computeParticipants() {
  const S = window.squadre || [];
  if (S.length < 12) return {};

  const P = {};

  for (const [code, [iH, iA]] of Object.entries(WC_PAIRS)) {
    P[code] = {
      home: { name: S[iH].nome, seed: iH + 1 },
      away: { name: S[iA].nome, seed: iA + 1 }
    };
  }

const winnerOf = (code) => {
  const p = PICKS[code];
  const m = P[code];
  if (!p || !m) return null;

  const homeScore = p.home;
  const awayScore = p.away;

  const hasHomeScore =
    homeScore !== "" &&
    homeScore !== null &&
    homeScore !== undefined &&
    !isNaN(Number(homeScore));

  const hasAwayScore =
    awayScore !== "" &&
    awayScore !== null &&
    awayScore !== undefined &&
    !isNaN(Number(awayScore));

if (hasHomeScore && hasAwayScore) {
  const h = Number(homeScore);
  const a = Number(awayScore);

  if (h > a) {
    return {
      name: stripSeed(m.home.name),
      seed: m.home.seed
    };
  }

  if (a > h) {
    return {
      name: stripSeed(m.away.name),
      seed: m.away.seed
    };
  }

  // Pareggio: in Wildcard e Quarti passa il seed migliore
  if (usesSeedTieBreaker(code)) {
    const bestSeedSide = getBestSeedSide(m);

    if (bestSeedSide === "home") {
      return {
        name: stripSeed(m.home.name),
        seed: m.home.seed
      };
    }

    if (bestSeedSide === "away") {
      return {
        name: stripSeed(m.away.name),
        seed: m.away.seed
      };
    }
  }

  return null;
}

  if (truthy(homeScore) && !truthy(awayScore)) {
    return {
      name: stripSeed(m.home.name),
      seed: m.home.seed
    };
  }

  if (truthy(awayScore) && !truthy(homeScore)) {
    return {
      name: stripSeed(m.away.name),
      seed: m.away.seed
    };
  }

  return null;
};

  P.Q1 = { home: { name: S[0].nome, seed: 1 }, away: winnerOf("WC1") || { name: "Vincente WC1" } };
  P.Q4 = { home: { name: S[3].nome, seed: 4 }, away: winnerOf("WC3") || { name: "Vincente WC3" } };

  P.Q2 = { home: { name: S[1].nome, seed: 2 }, away: winnerOf("WC2") || { name: "Vincente WC2" } };
  P.Q3 = { home: { name: S[2].nome, seed: 3 }, away: winnerOf("WC4") || { name: "Vincente WC4" } };

  P.S1 = { home: winnerOf("Q1") || { name: "Vincente Q1" }, away: winnerOf("Q4") || { name: "Vincente Q4" } };
  P.S2 = { home: winnerOf("Q2") || { name: "Vincente Q2" }, away: winnerOf("Q3") || { name: "Vincente Q3" } };

  P.F = { home: winnerOf("S1") || { name: "Vincente S1" }, away: winnerOf("S2") || { name: "Vincente S2" } };

  return P;
}

/* =========================================
   RENDER
   ========================================= */
function aggiornaPlayoff() {
  const P = computeParticipants();
  if (!Object.keys(P).length) return;

  const codes = ["WC1","WC2","WC3","WC4","Q1","Q2","Q3","Q4","S1","S2","F"];

  codes.forEach(code => {
    const el = document.querySelector(`.game-card[data-series="${code}"]`);
    if (!el || !P[code]) return;

    el.innerHTML = creaHTMLPartita(code, P[code]);
  });

  renderCampione(P);
  renderMobilePlayoff(P);
  renderPlayoffAdminPanel(P);
}

/* =========================================
   CAMPIONE ASSOLUTO
   ========================================= */
function renderCampione(P) {
  const container = document.getElementById("vincitore-assoluto");
  if (!container) return;

  const winnerSide = getWinnerSide("F");
  const champ = winnerSide ? P.F?.[winnerSide]?.name : null;

  if (!champ || /vincente/i.test(champ)) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <img src="img/${champ}.png" alt="${champ}" class="logo-vincitore" onerror="this.style.display='none'">
    <div class="champion-chip">🏆 Campione dei Playoff</div>
    <div class="nome-vincitore">${champ}</div>
  `;
}



/* =========================================
   ADMIN PANEL RISULTATI PLAYOFF
   ========================================= */

const ADMIN_MATCH_ORDER = [
  "WC1", "WC2", "WC3", "WC4",
  "Q1", "Q2", "Q3", "Q4",
  "S1", "S2",
  "F"
];

function getAdminMatchLabel(code) {
  if (code.startsWith("WC")) return `Wild Card ${code.replace("WC", "")}`;
  if (code.startsWith("Q")) return `Quarto ${code.replace("Q", "")}`;
  if (code.startsWith("S")) return `Semifinale ${code.replace("S", "")}`;
  if (code === "F") return "Finale";
  return code;
}

function renderPlayoffAdminPanel(P) {
  const container = document.getElementById("admin-playoff-results");
  if (!container) return;

  if (!isPlayoffAdmin) {
    hidePlayoffAdminPanel();
    return;
  }

  showPlayoffAdminPanel();

  if (!P || !Object.keys(P).length) return;

  container.innerHTML = ADMIN_MATCH_ORDER.map(code => {
    const match = P[code];
    if (!match) return "";

    const homeName = stripSeed(match.home?.name || "In attesa");
    const awayName = stripSeed(match.away?.name || "In attesa");

    return `
      <div class="admin-match-row" data-admin-code="${code}">
        <div class="admin-match-title">
          <strong>${getAdminMatchLabel(code)}</strong>
          <span>${code}</span>
        </div>

        <div class="admin-team-line">
          <span>${match.home?.seed ? "#" + match.home.seed : ""} ${homeName}</span>
          <input
            type="number"
            min="0"
            inputmode="numeric"
            class="admin-score-input"
            data-code="${code}"
            data-side="home"
            value="${PICKS[code]?.home ?? ""}"
            placeholder="-"
          >
        </div>

        <div class="admin-team-line">
          <span>${match.away?.seed ? "#" + match.away.seed : ""} ${awayName}</span>
          <input
            type="number"
            min="0"
            inputmode="numeric"
            class="admin-score-input"
            data-code="${code}"
            data-side="away"
            value="${PICKS[code]?.away ?? ""}"
            placeholder="-"
          >
        </div>
      </div>
    `;
  }).join("");

  bindPlayoffAdminButtons();
}

async function savePlayoffAdminResults() {
  if (!isPlayoffAdmin) {
    alert("Non sei autorizzato a modificare i risultati.");
    return;
  }

  const rows = [];

  document.querySelectorAll(".admin-score-input").forEach(input => {
    const code = input.dataset.code;
    const side = input.dataset.side;

    if (!PICKS[code]) PICKS[code] = { home: "", away: "" };

    PICKS[code][side] = input.value === "" ? "" : Number(input.value);
  });

  const { data: userData } = await supabaseClient.auth.getUser();
  const userId = userData?.user?.id || null;

  Object.entries(PICKS).forEach(([code, score]) => {
    rows.push({
      match_code: code,
      home_score: score.home === "" ? null : Number(score.home),
      away_score: score.away === "" ? null : Number(score.away),
      updated_at: new Date().toISOString(),
      updated_by: userId
    });
  });

  const { error } = await supabaseClient
    .from("playoff_results")
    .upsert(rows, { onConflict: "match_code" });

  if (error) {
    console.error("Errore salvataggio risultati playoff:", error);
    alert("Errore nel salvataggio dei risultati.");
    return;
  }

await checkPlayoffAdmin();
await loadPlayoffResultsFromSupabase();

aggiornaPlayoff();
}

async function resetPlayoffAdminResults() {
  if (!isPlayoffAdmin) {
    alert("Non sei autorizzato a cancellare i risultati.");
    return;
  }

  const conferma = confirm("Vuoi davvero cancellare tutti i risultati playoff?");
  if (!conferma) return;

  const { error } = await supabaseClient
    .from("playoff_results")
    .delete()
    .neq("match_code", "");

  if (error) {
    console.error("Errore reset risultati playoff:", error);
    alert("Errore nel reset dei risultati.");
    return;
  }

  Object.keys(DEFAULT_PICKS).forEach(code => {
    PICKS[code].home = "";
    PICKS[code].away = "";
  });

  aggiornaPlayoff();

  alert("Risultati cancellati.");
}

function bindPlayoffAdminButtons() {
  const saveBtn = document.getElementById("save-playoff-results");
  const resetBtn = document.getElementById("reset-playoff-results");

  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.addEventListener("click", savePlayoffAdminResults);
    saveBtn.dataset.bound = "true";
  }

  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.addEventListener("click", resetPlayoffAdminResults);
    resetBtn.dataset.bound = "true";
  }
}

/* =========================================
   CALCOLO CLASSIFICA DA STATISTICHE
   ========================================= */

function parseCSV(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === "," && !inQuotes) {
      row.push(field);
      field = "";
    } else if ((c === "\n" || c === "\r") && !inQuotes) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      field = "";
      row = [];
    } else {
      field += c;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const headers = rows.shift().map(h => String(h || "").trim());

  return rows
    .filter(r => r.some(c => String(c || "").trim() !== ""))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = String(r[i] ?? "").trim();
      });
      return obj;
    });
}

function parseNumber(value) {
  const n = parseFloat(String(value || "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function cleanTeamName(name) {
  return String(name || "")
    .replace(/[👑🎖️💀]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function teamKey(name) {
  return cleanTeamName(name)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const GOAL_BASE = 66;
const GOAL_STEP = 6;

function pointsToGoals(points) {
  const p = parseNumber(points);
  if (p < GOAL_BASE) return 0;
  return 1 + Math.floor((p - GOAL_BASE) / GOAL_STEP);
}

function removeDuplicateRows(rows) {
  const seen = new Set();

  return rows.filter(r => {
    const key = [
      String(r.GW || "").trim(),
      String(r.GW_Stagionale || "").trim(),
      cleanTeamName(r.Team),
      cleanTeamName(r.Opponent),
      String(r.PointsFor || "").replace(",", ".").trim(),
      String(r.PointsAgainst || "").replace(",", ".").trim(),
      String(r.Conference || "").trim()
    ].join("|");

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function buildTotalRankingFromStats(statsCSV) {
  const rawRows = parseCSV(statsCSV);
  const rows = removeDuplicateRows(rawRows);

  const table = new Map();

  rows.forEach(r => {
    const conference = String(r.Conference || "").trim();
const phase = String(r.Phase || "").trim();

// Per i playoff contano solo Conference + Round Robin della Regular Season
const competizioneValida = ["Conf A", "Conf B", "Unificata"].includes(conference);

if (!competizioneValida) return;
if (phase !== "Regular") return;

    const squadra = cleanTeamName(r.Team);
    const opponent = cleanTeamName(r.Opponent);
    const pf = parseNumber(r.PointsFor);
    const pa = parseNumber(r.PointsAgainst);

    if (!squadra || !opponent) return;
    if (pf === 0 && pa === 0) return;

    const key = teamKey(squadra);

    if (!table.has(key)) {
      table.set(key, {
        nome: squadra,
        punti: 0,
        mp: 0,
        gf: 0,
        gs: 0
      });
    }

    const rec = table.get(key);

    const gf = pointsToGoals(pf);
    const gs = pointsToGoals(pa);

    rec.mp += pf;
    rec.gf += gf;
    rec.gs += gs;

    if (gf > gs) {
      rec.punti += 3;
    } else if (gf === gs) {
      rec.punti += 1;
    }
  });

return Array.from(table.values()).sort((a, b) => {
  return (
    b.punti - a.punti ||
    b.mp - a.mp ||
    b.gf - a.gf ||
    (a.gs - b.gs) ||
    a.nome.localeCompare(b.nome)
  );
});
   }

/* =========================================
   FETCH CLASSIFICA
   ========================================= */
fetch(URL_STATS_MASTER + "&nocache=" + Date.now(), { cache: "no-store" })
  .then(res => res.text())
  .then(async csv => {
    const classificaTotale = buildTotalRankingFromStats(csv);

    // Playoff: prime 12 della classifica totale
    window.squadre = classificaTotale.slice(0, 12);

    await checkPlayoffAdmin();
    await loadPlayoffResultsFromSupabase();

    aggiornaPlayoff();

    window.addEventListener("resize", () => {
      if (typeof alignLikeExcel === "function") {
        alignLikeExcel();
      }
    });
  })
  .catch(err => console.error("Errore nel caricamento classifica playoff:", err));

/* =========================================
   MOBILE APP VIEW
   - Usa gli stessi dati P giÃ  calcolati.
   - Non modifica PICKS, computeParticipants o winnerOf.
   ========================================= */
let currentMobileStage = "wildcard";
let mobileTabsBound = false;
let lastMobileParticipants = null;

const MOBILE_STAGE_META = {
  wildcard: {
    title: "Wildcard",
    matches: [
      { code: "WC1", next: "Quarti" },
      { code: "WC3", next: "Quarti" },
      { code: "WC2", next: "Quarti" },
      { code: "WC4", next: "Quarti" }
    ]
  },
  quarti: {
    title: "Quarti",
    matches: [
      { code: "Q1", next: "Semifinale" },
      { code: "Q4", next: "Semifinale" },
      { code: "Q2", next: "Semifinale" },
      { code: "Q3", next: "Semifinale" }
    ]
  },
  semifinali: {
    title: "Semifinali",
    matches: [
      { code: "S1", next: "Finale" },
      { code: "S2", next: "Finale" }
    ]
  },
  finale: {
    title: "Finale",
    matches: [
      { code: "F", next: "Campione" }
    ]
  }
};

function isPlaceholderTeam(team) {
  const name = stripSeed(team?.name || "");
  return !team || (!team.seed && /vincente|classificata|in attesa/i.test(name));
}

function getMatchWinnerSide(code, matchData = null) {
  if (typeof getWinnerSide === "function") {
    return getWinnerSide(code, matchData);
  }

  return null;
}

function getMobileStageData(P) {
  const stages = {};

  Object.entries(MOBILE_STAGE_META).forEach(([stageKey, meta]) => {
    stages[stageKey] = meta.matches.map(item => ({
      code: item.code,
      next: item.next,
      home: P[item.code]?.home || null,
      away: P[item.code]?.away || null,
      winnerSide: getMatchWinnerSide(item.code, P[item.code])
    }));
  });

  return stages;
}

function getMobileScoreDisplay(code) {
  const pick = PICKS[code];
  if (!pick) return "VS";

  const home = pick.home;
  const away = pick.away;

  const hasHome = home !== "" && home !== null && home !== undefined && !isNaN(Number(home));
  const hasAway = away !== "" && away !== null && away !== undefined && !isNaN(Number(away));

  if (hasHome && hasAway) {
    return `${home} - ${away}`;
  }

  return "VS";
}

function createMobileTeamSide(team, side, isWinner) {
  const cleanName = stripSeed(team?.name || "In attesa");
  const placeholder = isPlaceholderTeam(team);
  const logo = `img/${cleanName}.webp`;

  return `
    <div class="mobile-team-side ${side} ${isWinner ? "is-winner" : ""} ${placeholder ? "is-placeholder" : ""}">
      ${team?.seed ? `<span class="mobile-seed">#${team.seed}</span>` : ""}

      <div class="mobile-team-logo-wrap">
        ${!placeholder ? `<img src="${logo}" alt="${cleanName}" onerror="this.style.display='none'">` : ""}
      </div>

      <div class="mobile-team-name">${cleanName}</div>

      ${isWinner ? `<div class="mobile-qualified-badge">✓ Qualificata</div>` : ""}
    </div>
  `;
}

function createMobileMatchCard(match) {
  const home = match.home || { name: "In attesa" };
  const away = match.away || { name: "In attesa" };

  const homeWinner = match.winnerSide === "home";
  const awayWinner = match.winnerSide === "away";
const hasWinner = !!match.winnerSide;
const scoreDisplay = getMobileScoreDisplay(match.code);
const stageClass = match.code === "F" ? "is-final" : "";;

  return `
    <article class="mobile-match-card ${stageClass}" data-mobile-match="${match.code}">
      <div class="mobile-match-code">${match.code}</div>

      <div class="mobile-match-main">
        ${createMobileTeamSide(home, "left", homeWinner)}

<div class="mobile-vs-center">
  <div class="mobile-match-label">Sfida playoff</div>
  <div class="mobile-vs-pill ${hasWinner ? "has-score" : ""}">${scoreDisplay}</div>
  <div class="mobile-match-status">
    ${hasWinner ? "Risultato finale" : "In attesa"}
  </div>
</div>

        ${createMobileTeamSide(away, "right", awayWinner)}
      </div>

      <div class="mobile-match-footer">
        <span>Vincitore <strong>&rarr;</strong> ${match.next}</span>
        <span class="mobile-footer-arrow">&rsaquo;</span>
      </div>
    </article>
  `;
}

function renderMobilePlayoff(P) {
  lastMobileParticipants = P;

  const container = document.getElementById("mobile-stage-content");
  if (!container) return;

  bindMobileStageTabs();

  const stages = getMobileStageData(P);
  const meta = MOBILE_STAGE_META[currentMobileStage] || MOBILE_STAGE_META.wildcard;
  const matches = stages[currentMobileStage] || [];

  const title = `
    <div class="mobile-stage-title-row">
      <h2>${meta.title}</h2>
      <span>${matches.length} sfide</span>
    </div>
  `;

  container.innerHTML = title + matches.map(createMobileMatchCard).join("");

  document.querySelectorAll(".stage-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.stage === currentMobileStage);
  });
}

function bindMobileStageTabs() {
  if (mobileTabsBound) return;

  document.querySelectorAll(".stage-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      currentMobileStage = tab.dataset.stage || "wildcard";
      if (lastMobileParticipants) {
        renderMobilePlayoff(lastMobileParticipants);
      }
    });
  });

  mobileTabsBound = true;
}


