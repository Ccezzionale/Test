// =====================================
// LA GAZZETTA DEGLI EROI
// Gazzetta Premium Edition
// Manuale + Stats editoriali
// =====================================

// ===== CSV URLs =====
const STATS_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRhEJKfZhVb7V08KI29T_aPTR0hfx7ayIOlFjQn_v-fqgktImjXFg-QAEA6z7w5eyEh2B3w5KLpaRYz/pub?gid=1118969717&single=true&output=csv";

const MANUAL_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vTIIcMsU01jJD0WJ8bz_V3rhlYXQOTpU0q8rnFaGzeG1edoqIVk9U3WaIb1WvCBKkrm8ciWYRgdY1ae/pub?output=csv";

// ===== Column mapping =====
const COL = {
  gw: "GW_Stagionale",
  team: "Team",
  opp: "Opponent",
  pf: "PointsFor",
  pa: "PointsAgainst",
  gf: "GoalsFor",
  ga: "GoalsAgainst"
};

const MAN = {
  gw: "GW",
  title: "Titolo_manual",
  text: "Testo_manual",
  updated: "UpdatedAt",
  image: "Immagine",
  teaserImage: "Immagine_teaser",
  teaser: "Teaser"
};

// ===== Cache =====
const CACHE_KEY_HTML = "giornale_cache_html_v4_premium";
const CACHE_KEY_TS = "giornale_cache_ts_v4_premium";
const AUTO_REFRESH_MS = 12 * 60 * 60 * 1000;

// ===== State =====
let STATS_DATA = [];
let MANUAL_MAP = new Map();
let CURRENT_GW = null;

// ===== DOM helper =====
const $ = (id) => document.getElementById(id);

// ===== Generic helpers =====
function norm(v){
  return String(v ?? "").trim();
}

function escapeHtml(value){
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function toNum(x){
  const v = String(x ?? "").trim().replace(",", ".");
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

function gwNum(v){
  const m = String(v ?? "").match(/\d+/);
  return m ? Number(m[0]) : NaN;
}

function formatScore(n){
  const num = Number(n);
  if (!Number.isFinite(num)) return "-";
  return Number.isInteger(num) ? String(num) : num.toFixed(1);
}

function splitParagraphsRaw(text){
  return String(text ?? "")
    .split(/\n\s*\n/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function textToParagraphs(text){
  const parts = splitParagraphsRaw(text);

  if (!parts.length) {
    return `<p>Nessun testo disponibile per questa giornata.</p>`;
  }

  return parts
    .map(p => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function makePullQuote(text){
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "La Lega degli Eroi riparte da qui.";

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 35 && s.length <= 150);

  const preferred = sentences.find(s => /Excel|polemiche|irripetibile|trono|rivolta|leggenda/i.test(s));
  const fallback = sentences[Math.min(3, Math.max(0, sentences.length - 1))];

  return preferred || fallback || "La Lega degli Eroi riparte da qui.";
}

function textToEditorialWithQuote(text){
  const parts = splitParagraphsRaw(text);

  if (!parts.length) {
    return `<p>Per questa giornata non è stato ancora inserito un editoriale manuale.</p>`;
  }

  const quote = makePullQuote(text);
  const insertAfter = Math.min(2, Math.max(1, parts.length - 1));

  return parts.map((p, idx) => {
    const html = `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`;
    if (idx === insertAfter - 1) {
      return `${html}
        <aside class="pull-quote">
          <span class="quote-mark">“</span>
          <strong>${escapeHtml(quote)}</strong>
        </aside>`;
    }
    return html;
  }).join("");
}

function extractDriveFileId(value){
  const v = String(value ?? "").trim();
  if (!v) return "";

  if (/^[a-zA-Z0-9_-]{20,}$/.test(v) && !v.includes("http")) {
    return v;
  }

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /\/open\?id=([a-zA-Z0-9_-]+)/
  ];

  for (const p of patterns){
    const m = v.match(p);
    if (m && m[1]) return m[1];
  }

  return "";
}

function buildDriveImageUrl(value){
  const id = extractDriveFileId(value);
  return id ? `https://drive.google.com/thumbnail?id=${id}&sz=w1600` : "";
}

// ===== Cache helpers =====
function showCachedIfAny(){
  const cached = localStorage.getItem(CACHE_KEY_HTML);
  if (!cached) return false;

  const output = $("output");
  if (output) output.innerHTML = cached;

  if (!localStorage.getItem(CACHE_KEY_TS)) {
    localStorage.setItem(CACHE_KEY_TS, Date.now().toString());
  }
  return true;
}

function saveCacheFromDom(){
  const output = $("output");
  if (!output) return;
  localStorage.setItem(CACHE_KEY_HTML, output.innerHTML);
  localStorage.setItem(CACHE_KEY_TS, Date.now().toString());
}

function shouldAutoRefresh(){
  const ts = Number(localStorage.getItem(CACHE_KEY_TS) || "0");
  return !ts || (Date.now() - ts) > AUTO_REFRESH_MS;
}

// ===== CSV parsing =====
function parseCSV(text){
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < text.length; i++){
    const ch = text[i];
    const nxt = text[i + 1];

    if (ch === '"' && inQ && nxt === '"'){
      cur += '"';
      i++;
      continue;
    }

    if (ch === '"'){
      inQ = !inQ;
      continue;
    }

    if (!inQ && ch === ","){
      row.push(cur);
      cur = "";
      continue;
    }

    if (!inQ && (ch === "\n" || ch === "\r")){
      if (ch === "\r" && nxt === "\n") i++;
      row.push(cur);
      cur = "";

      if (row.some(cell => cell !== "")) rows.push(row);
      row = [];
      continue;
    }

    cur += ch;
  }

  row.push(cur);
  if (row.some(cell => cell !== "")) rows.push(row);

  return rows;
}

function rowsToObjects(rows){
  if (!rows.length) return [];
  const header = rows[0].map(h => norm(h));

  return rows.slice(1).map(r => {
    const obj = {};
    header.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    return obj;
  });
}

async function fetchCSV(url){
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Fetch fallita (${res.status})`);
  const text = await res.text();
  return rowsToObjects(parseCSV(text));
}

// ===== Data load =====
async function loadManualMap(){
  const data = await fetchCSV(MANUAL_CSV_URL);
  const map = new Map();

  for (const r of data){
    const g = gwNum(r[MAN.gw]);
    if (!Number.isFinite(g)) continue;

    const title = norm(r[MAN.title]);
    const text = norm(r[MAN.text]);
    const upd = norm(r[MAN.updated]);
    const imageUrl = buildDriveImageUrl(norm(r[MAN.image]));
    const teaserImageUrl = buildDriveImageUrl(norm(r[MAN.teaserImage]));
    const teaser = norm(r[MAN.teaser]);

    if (title || text || imageUrl || teaserImageUrl || teaser){
      map.set(g, { title, text, updatedAt: upd, imageUrl, teaserImageUrl, teaser });
    }
  }

  return map;
}

function getAllGWs(data){
  const set = new Set();

  for (const r of data){
    const n = gwNum(r[COL.gw]);
    if (Number.isFinite(n)) set.add(n);
  }

  return Array.from(set).sort((a, b) => a - b);
}

function fillGWSelect(gws, selected){
  const sel = $("gwSelect");
  if (!sel) return;

  sel.innerHTML = "";
  for (const g of gws){
    const opt = document.createElement("option");
    opt.value = String(g);
    opt.textContent = `GW ${g}`;
    if (Number(g) === Number(selected)) opt.selected = true;
    sel.appendChild(opt);
  }
}

// ===== Stats building =====
function buildMatchesForGW(data, gw){
  const rows = data.filter(r => gwNum(r[COL.gw]) === Number(gw));
  const seen = new Set();
  const matches = [];

  for (const r of rows){
    const A = norm(r[COL.team]);
    const B = norm(r[COL.opp]);
    const pf = toNum(r[COL.pf]);
    const pa = toNum(r[COL.pa]);

    if (!A || !B || !Number.isFinite(pf) || !Number.isFinite(pa)) continue;

    const key = [A, B].sort().join("||");
    if (seen.has(key)) continue;
    seen.add(key);

    const winner = pf > pa ? A : (pa > pf ? B : null);
    const loser = pf > pa ? B : (pa > pf ? A : null);
    const margin = Math.abs(pf - pa);

    matches.push({
      gw,
      home: A,
      away: B,
      aPoints: pf,
      bPoints: pa,
      winner,
      loser,
      margin
    });
  }

  return matches.sort((a, b) => b.margin - a.margin);
}

function buildTeamStats(matches){
  const map = new Map();

  function add(name, pf, pa){
    if (!map.has(name)) {
      map.set(name, { name, pf: 0, pa: 0, w: 0, l: 0, t: 0 });
    }

    const t = map.get(name);
    t.pf += pf;
    t.pa += pa;

    if (pf > pa) t.w++;
    else if (pf < pa) t.l++;
    else t.t++;
  }

  for (const m of matches){
    add(m.home, m.aPoints, m.bPoints);
    add(m.away, m.bPoints, m.aPoints);
  }

  return Array.from(map.values());
}

function buildAutoArticle(data, gw){
  const matches = buildMatchesForGW(data, gw);
  const teamStats = buildTeamStats(matches);

  let topTeam = null;
  let topPF = -Infinity;
  let flopTeam = null;
  let flopPF = Infinity;

  for (const t of teamStats){
    if (t.pf > topPF){
      topPF = t.pf;
      topTeam = t.name;
    }
    if (t.pf < flopPF){
      flopPF = t.pf;
      flopTeam = t.name;
    }
  }

  const closestMatch = matches.slice().sort((a, b) => a.margin - b.margin)[0] || null;

  const thief = matches
    .filter(m => m.winner)
    .map(m => {
      const winnerPts = m.winner === m.home ? m.aPoints : m.bPoints;
      return { ...m, winnerPts };
    })
    .sort((a, b) => (a.winnerPts - b.winnerPts) || (a.margin - b.margin))[0] || null;

  return {
    gw,
    matches,
    teamStats,
    matchOfWeek: closestMatch,
    top: { team: topTeam, pf: Number.isFinite(topPF) ? topPF : 0 },
    flop: { team: flopTeam, pf: Number.isFinite(flopPF) ? flopPF : 0 },
    thief
  };
}

// ===== HTML blocks =====
function buildStatsBlocks(article){
  const matchHTML = article.matchOfWeek
    ? `
      <div class="match-widget">
        <div class="widget-label">Partita più tirata</div>
        <div class="scoreboard-line">
          <span class="score-team">${escapeHtml(article.matchOfWeek.home)}</span>
          <span class="score-pill">${formatScore(article.matchOfWeek.aPoints)} - ${formatScore(article.matchOfWeek.bPoints)}</span>
          <span class="score-team">${escapeHtml(article.matchOfWeek.away)}</span>
        </div>
        <div class="widget-note">Scarto ${formatScore(article.matchOfWeek.margin)}</div>
      </div>
    `
    : `<div class="empty-note">Nessun match trovato.</div>`;

  const premiHTML = `
    <div class="award-list">
      <div class="award-row">
        <span class="award-icon">♛</span>
        <div class="award-copy"><b>Re</b><span>${escapeHtml(article.top.team || "-")}</span></div>
        <span class="award-score gold">${formatScore(article.top.pf)}</span>
      </div>
      <div class="award-row">
        <span class="award-icon">♟</span>
        <div class="award-copy"><b>Pagliaccio d’Oro</b><span>${escapeHtml(article.flop.team || "-")}</span></div>
        <span class="award-score">${formatScore(article.flop.pf)}</span>
      </div>
      ${
        article.thief
          ? `<div class="award-row">
              <span class="award-icon">◆</span>
              <div class="award-copy"><b>Ladro</b><span>${escapeHtml(article.thief.winner || "-")} <em>scarto ${formatScore(article.thief.margin)}</em></span></div>
              <span class="award-score blue">${formatScore(article.thief.winnerPts)}</span>
            </div>`
          : `<div class="award-row muted-row">Nessun ladro di giornata.</div>`
      }
    </div>
  `;

  return { matchHTML, premiHTML };
}

function buildProssimamenteHTML(manual){
  const teaserImageUrl = manual?.teaserImageUrl || "";
  const teaserText = manual?.teaser || "";

  if (!teaserImageUrl && !teaserText) {
    return `
      <section class="cinema-card empty-cinema">
        <div class="section-eyebrow">Trailer</div>
        <h3>Nel prossimo episodio</h3>
        <p>La redazione sta ancora montando il teaser. Tagli, dissolvenze, sospetti.</p>
      </section>
    `;
  }

  return `
    <section class="cinema-card">
      <div class="cinema-head">
        <div>
          <div class="section-eyebrow">Trailer</div>
          <h3>Nel prossimo episodio</h3>
        </div>
        <span class="next-chip">Next on</span>
      </div>

      ${teaserImageUrl ? `
        <figure class="cinema-media">
          <img src="${teaserImageUrl}" alt="Prossima giornata">
        </figure>
      ` : ""}

      ${teaserText ? `
        <blockquote class="cinema-teaser">
          ${escapeHtml(teaserText).replace(/\n/g, "<br>")}
        </blockquote>
      ` : ""}
    </section>
  `;
}

function renderManualHTML(gw, manual, stats){
  const title = manual?.title
    ? escapeHtml(manual.title)
    : `GW ${gw} | Edizione della Gazzetta`;

  const deck = manual?.text
    ? "La giornata lascia sentenze, rilancia gerarchie e mette qualcuno davanti allo specchio."
    : "Testo editoriale non ancora inserito. Ma l’aria, intorno alla Lega degli Eroi, sa già di prossima battaglia.";

  const subtitle = manual?.updatedAt
    ? `Aggiornato: ${escapeHtml(manual.updatedAt)}`
    : "Editoriale";

  const editorialContent = manual?.text
    ? textToEditorialWithQuote(manual.text)
    : `<p>Per questa giornata non è stato ancora inserito un editoriale manuale.</p>`;

  const heroImage = manual?.imageUrl
    ? `
      <figure class="hero-media">
        <img src="${manual.imageUrl}" alt="${title}">
      </figure>
    `
    : `<div class="hero-media hero-placeholder"><span>Immagine editoriale</span></div>`;

  const prossimamenteHTML = buildProssimamenteHTML(manual);

  return `
    <section class="front-hero">
      <div class="lede-copy">
        <span class="kicker"><span>♕</span> Lega degli Eroi</span>
        <h1>${title}</h1>
        <p class="deck">${escapeHtml(deck)}</p>
        <div class="story-meta">
          <span>${subtitle}</span>
          <span>GW ${gw}</span>
          <span>Prima pagina</span>
        </div>
      </div>
      ${heroImage}
    </section>

    <section class="news-grid">
      <div class="main-column">
        <article class="editorial-card">
          <div class="article-label"><span>✒</span> Il Punto di Costantino</div>
          <div class="article-body">
            ${editorialContent}
          </div>
        </article>
      </div>

      <aside class="side-column">
        <section class="side-card match-card">
          <div class="side-card-head">
            <span class="section-eyebrow">Rubrica</span>
            <h3>Match della Settimana</h3>
          </div>
          ${stats.matchHTML}
        </section>

        <section class="side-card awards-card">
          <div class="side-card-head">
            <span class="section-eyebrow">Rubrica</span>
            <h3>Premi Discutibili</h3>
          </div>
          ${stats.premiHTML}
        </section>

        ${prossimamenteHTML}
      </aside>
    </section>

    <footer class="paper-foot">
      Edizione automatica della Gazzetta • GW ${gw}
    </footer>
  `;
}

// ===== Render flow =====
function setStatus(msg, isErr = false){
  const el = $("status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = isErr ? "error" : "muted";
}

function renderCurrent(){
  const out = $("output");
  if (!out) return;

  if (!CURRENT_GW){
    out.innerHTML = `<p class="error">Nessuna GW disponibile.</p>`;
    return;
  }

  const gw = Number(CURRENT_GW);
  const manual = MANUAL_MAP.get(gw) || null;
  const auto = buildAutoArticle(STATS_DATA, gw);
  const statsBlocks = buildStatsBlocks(auto);

  const d = new Date().toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  const chipDate = $("chipDate");
  const chipGW = $("chipGW");
  if (chipDate) chipDate.textContent = d;
  if (chipGW) chipGW.textContent = `GW ${gw}`;

  out.innerHTML = renderManualHTML(gw, manual, statsBlocks);
  setStatus(`GW ${gw} aggiornata`);
}

async function loadAll(){
  setStatus("Aggiorno…");

  if (STATS_CSV_URL.includes("INCOLLA_QUI")) {
    throw new Error("Devi impostare STATS_CSV_URL con il tuo link CSV delle statistiche.");
  }

  STATS_DATA = await fetchCSV(STATS_CSV_URL);

  try {
    MANUAL_MAP = await loadManualMap();
  } catch (e) {
    console.warn("Manuale non disponibile:", e.message);
    MANUAL_MAP = new Map();
  }

  const gws = getAllGWs(STATS_DATA);
  if (!gws.length) throw new Error("Nessuna GW trovata nel CSV statistiche.");

  if (!CURRENT_GW || !gws.includes(Number(CURRENT_GW))) {
    CURRENT_GW = gws[gws.length - 1];
  }

  fillGWSelect(gws, CURRENT_GW);
}

async function reloadKeepingGW(){
  const selected = Number($("gwSelect")?.value || CURRENT_GW);
  await loadAll();
  CURRENT_GW = selected;
  const sel = $("gwSelect");
  if (sel) sel.value = String(CURRENT_GW);
  renderCurrent();
}

// ===== Boot =====
document.addEventListener("DOMContentLoaded", () => {
  const gwSelect = $("gwSelect");
  const btnReload = $("btnReload");
  const output = $("output");

  gwSelect?.addEventListener("change", (e) => {
    CURRENT_GW = Number(e.target.value);
    renderCurrent();
    saveCacheFromDom();
  });

  btnReload?.addEventListener("click", async () => {
    try {
      setStatus("Aggiorno…");
      await reloadKeepingGW();
      saveCacheFromDom();
      setStatus("Aggiornato ✅");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      console.error(e);
      setStatus(`Errore: ${e.message}`, true);
      if (output) output.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
    }
  });

  (async () => {
    try {
      const hadCache = showCachedIfAny();
      if (!hadCache) setStatus("Caricamento…");

      const forceRefresh = shouldAutoRefresh() || !hadCache;
      if (forceRefresh) {
        await loadAll();
        renderCurrent();
        saveCacheFromDom();
      } else {
        await loadAll();
        renderCurrent();
      }

      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(`Errore: ${e.message}`, true);
      if (output) output.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
    }
  })();
});
