/* =========================================
   STATISTICHE MASTER (Google Sheet)
   ========================================= */
const URL_STATS_MASTER =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRhEJKfZhVb7V08KI29T_aPTR0hfx7ayIOlFjQn_v-fqgktImjXFg-QAEA6z7w5eyEh2B3w5KLpaRYz/pub?gid=1118969717&single=true&output=csv";
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

/* =========================================
   COLORI SQUADRE
   ========================================= */
const TEAM_COLORS = {
  "team bartowski": "#C1121F",
  "bayern christiansen": "#8B0A1A",
  "wildboys78": "#A07900",
  "desperados": "#2E4A7F",
  "minnesode timberland": "#00A651",
  "golden knights": "#B4975A",
  "pokermantra": "#5B2A86",
  "rubinkebab": "#C27A33",
  "pandinicoccolosini": "#228B22",
  "ibla": "#F97316",
  "fc disoneste": "#A78BFA",
  "athletic pongao": "#C1121F",
  "riverfilo": "#D5011D",
  "eintracht franco 126": "#E1000F",
  "fantaugusta": "#164E3B",
  "costantinobull": "#B91C1C",
  "real mimmo": "#D97706",
  "union librino": "#8B5CF6",
  "giody": "#1E3A8A",
  "golden knight": "#B4975A"
};

function getTeamColor(name) {
  return TEAM_COLORS[norm(name)] || "#123c7a";
}

function applyTeamColorFromCard(cardEl){
  const nameEl = cardEl.querySelector(".team-name");
  if (!nameEl) return;
  cardEl.style.setProperty("--team-color", getTeamColor(nameEl.textContent));
}

/* =========================================
   HTML CARD
   ========================================= */
function creaHTMLSquadra(nome, seed = "", isPlaceholder = false, isVincente = false) {
  const nomePulito = stripSeed(nome || "");
  const mostraLogo = !isPlaceholder && !/vincente|classificata/i.test(nomePulito);
  const fileLogo = `img/${nomePulito}.png`;
  const stato = isVincente ? "Qualificata" : (isPlaceholder ? "In attesa" : "Sfida playoff");
  const flag = isVincente ? "✓" : "•";

  return `
    <div class="squadra orizzontale">
      <div class="team-logo-wrap">
        ${mostraLogo ? `<img src="${fileLogo}" alt="${nomePulito}" onerror="this.style.display='none'">` : ""}
      </div>

      <div class="team-main">
        <div class="team-text">
          ${seed ? `<span class="seed-badge">#${seed}</span>` : ""}
          <span class="team-name">${nomePulito}</span>
          <span class="team-status">${stato}</span>
        </div>

        <span class="team-flag">${flag}</span>
      </div>
    </div>
  `;
}

/* =========================================
   BRACKET MANUALE
   ========================================= */
const PICKS = {
  WC1: { home: '', away: '' },
  WC2: { home: '', away: '' },
  WC3: { home: '', away: '' },
  WC4: { home: '', away: '' },

  Q1:  { home: '', away: '' },
  Q2:  { home: '', away: '' },
  Q3:  { home: '', away: '' },
  Q4:  { home: '', away: '' },

  S1:  { home: '', away: '' },
  S2:  { home: '', away: '' },

  F:   { home: '', away: '' },
};

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

    const h = truthy(p.home);
    const a = truthy(p.away);

    if (h && !a) return { name: stripSeed(m.home.name), seed: m.home.seed };
    if (a && !h) return { name: stripSeed(m.away.name), seed: m.away.seed };
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

  const fill = (code, side) => {
    const data = P[code]?.[side];
    if (!data) return;

    const slot = side === "home" ? "A" : "B";
    const el = document.querySelector(`.match[data-match="${code}-${slot}"]`);
    if (!el) return;

    const pick = PICKS[code];
    const isWinner =
      pick &&
      truthy(pick[side]) &&
      !truthy(pick[side === "home" ? "away" : "home"]);

    const isPlaceholder = !data.seed && /vincente/i.test(data.name || "");
    el.innerHTML = creaHTMLSquadra(data.name, data.seed || "", isPlaceholder, !!isWinner);
    el.classList.toggle("vincente", !!isWinner);

    applyTeamColorFromCard(el);
  };

  codes.forEach(code => {
    fill(code, "home");
    fill(code, "away");
  });

  renderCampione(P);
  placeQuarterPairs();
  alignLikeExcel();
}

/* =========================================
   CAMPIONE ASSOLUTO
   ========================================= */
function renderCampione(P) {
  const container = document.getElementById("vincitore-assoluto");
  if (!container) return;

  const fPick = PICKS.F;
  const winnerSide = fPick && truthy(fPick.home) !== truthy(fPick.away)
    ? (truthy(fPick.home) ? "home" : "away")
    : null;

  const champ = winnerSide ? P.F?.[winnerSide]?.name : null;

  if (!champ) {
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
   HELPERS LAYOUT
   ========================================= */
function ensurePairWrap(code) {
  const a = document.querySelector(`.match[data-match="${code}-A"]`);
  const b = document.querySelector(`.match[data-match="${code}-B"]`);
  if (!a || !b) return null;

  if (
    a.parentElement.classList.contains("pair-offset") &&
    a.parentElement === b.parentElement
  ) {
    return a.parentElement;
  }

  const parent = a.parentElement;
  if (parent !== b.parentElement) return null;

  const w = document.createElement("div");
  w.className = "pair-offset";
  parent.insertBefore(w, a);
  w.appendChild(a);
  w.appendChild(b);
  return w;
}

function getCol(selector, nthFallback){
  return document.querySelector(`${selector} .colonna`)
      || document.querySelector(`.bracket > .blocco-colonna:nth-of-type(${nthFallback}) .colonna`);
}

function placeQuarterPairs() {
  const colQsx = getCol(".q-sx", 2);
  const colQdx = getCol(".q-dx", 6);

  if (colQsx) {
    const q1 = ensurePairWrap("Q1");
    const q4 = ensurePairWrap("Q4");
    colQsx.innerHTML = "";
    if (q1) colQsx.append(q1);
    if (q4) colQsx.append(q4);
  }

  if (colQdx) {
    const q2 = ensurePairWrap("Q2");
    const q3 = ensurePairWrap("Q3");
    colQdx.innerHTML = "";
    if (q2) colQdx.append(q2);
    if (q3) colQdx.append(q3);
  }
}

function alignLikeExcel() {
  const wcL = getCol(".wc-sx", 1);
  const qL  = getCol(".q-sx", 2);
  const sL  = getCol(".s-sx", 3);

  const wcR = getCol(".wc-dx", 7);
  const qR  = getCol(".q-dx", 6);
  const sR  = getCol(".s-dx", 5);

  [qL, qR].forEach(c => c && c.classList.add("col--spread"));
  [sL, sR].forEach(c => c && c.classList.add("col--center"));

  const hL = wcL ? wcL.offsetHeight : 0;
  const hR = wcR ? wcR.offsetHeight : 0;

  if (qL) { qL.style.height = hL + "px"; qL.style.minHeight = hL + "px"; }
  if (sL) { sL.style.height = hL + "px"; sL.style.minHeight = hL + "px"; }

  if (qR) { qR.style.height = hR + "px"; qR.style.minHeight = hR + "px"; }
  if (sR) { sR.style.height = hR + "px"; sR.style.minHeight = hR + "px"; }

  if (sL) centerSemiColumn(sL, hL);
  if (sR) centerSemiColumn(sR, hR);
}

function centerSemiColumn(col, targetHeight){
  if (!col) return;

  col.style.paddingTop = "0px";
  col.style.paddingBottom = "0px";

  const items = Array.from(col.children).filter(el => el.nodeType === 1);
  const cs = getComputedStyle(col);
  const gap = parseFloat(cs.rowGap || cs.gap || 0) || 0;

  let contentH = 0;
  items.forEach((el, i) => {
    contentH += el.offsetHeight;
    if (i > 0) contentH += gap;
  });

  const pad = Math.max(0, (targetHeight - contentH) / 2);

  const root = getComputedStyle(document.documentElement);
  const bias =
    col.closest(".s-sx") ? (parseFloat(root.getPropertyValue("--semi-shift-left")) || 0) :
    col.closest(".s-dx") ? (parseFloat(root.getPropertyValue("--semi-shift-right")) || 0) :
    0;

  const topPad = Math.max(0, pad - bias);
  const bottomPad = Math.max(0, pad + bias);

  col.style.paddingTop = topPad + "px";
  col.style.paddingBottom = bottomPad + "px";
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
  .then(csv => {
    const classificaTotale = buildTotalRankingFromStats(csv);

    // Playoff: prime 12 della classifica totale
    window.squadre = classificaTotale.slice(0, 12);

    aggiornaPlayoff();

    window.addEventListener("resize", () => {
      alignLikeExcel();
    });
  })
  .catch(err => console.error("Errore nel caricamento classifica playoff:", err));
