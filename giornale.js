import { supabase as sb } from "./supabase-config.js";

// =====================================
// LA GAZZETTA DEGLI EROI
// Full Admin Edition, senza CSV statistiche
// =====================================

const $ = (id) => document.getElementById(id);

let EDITIONS = [];
let CURRENT_GW = null;

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

function splitParagraphsRaw(text){
  return String(text ?? "")
    .split(/\n\s*\n/g)
    .map(s => s.trim())
    .filter(Boolean);
}

function makePullQuote(text){
  const raw = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "La Lega degli Eroi riparte da qui.";

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 35 && s.length <= 150);

  const preferred = sentences.find(s => /Excel|polemiche|irripetibile|trono|rivolta|leggenda|storia/i.test(s));
  const fallback = sentences[Math.min(2, Math.max(0, sentences.length - 1))];

  return preferred || fallback || "La Lega degli Eroi riparte da qui.";
}

function textToEditorialWithQuote(text, quoteOverride = "", signature = "Costantino"){
  const parts = splitParagraphsRaw(text);

  if (!parts.length) {
    return `<p>Per questa giornata non è stato ancora inserito un editoriale manuale.</p>`;
  }

  const quote = norm(quoteOverride) || makePullQuote(text);
  const insertAfter = Math.min(2, Math.max(1, parts.length - 1));
  const sig = norm(signature);

  return parts.map((p, idx) => {
    const html = `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`;
    if (idx === insertAfter - 1 && quote) {
      return `${html}
        <aside class="pull-quote">
          <span class="quote-mark">“</span>
          <strong>${escapeHtml(quote)}</strong>
          ${sig ? `<em>${escapeHtml(sig)}</em>` : ""}
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

function normalizeImageUrl(value){
  const raw = norm(value);
  if (!raw) return "";
  return buildDriveImageUrl(raw) || raw;
}

function setStatus(msg, isErr = false){
  const el = $("status");
  if (!el) return;
  el.textContent = msg || "";
  el.className = isErr ? "error" : "muted";
}

function getEditionByGw(gw){
  return EDITIONS.find(e => Number(e.gw) === Number(gw)) || null;
}

function fillGWSelect(){
  const sel = $("gwSelect");
  if (!sel) return;

  const sorted = EDITIONS.slice().sort((a, b) => Number(a.gw) - Number(b.gw));
  sel.innerHTML = "";

  for (const e of sorted){
    const opt = document.createElement("option");
    opt.value = String(e.gw);
    opt.textContent = `GW ${e.gw}`;
    if (Number(e.gw) === Number(CURRENT_GW)) opt.selected = true;
    sel.appendChild(opt);
  }
}

async function loadEditions(){
  if (!sb) throw new Error("Supabase non configurato per la Gazzetta.");

  const { data, error } = await sb
    .from("gazzetta_editions")
    .select("*")
    .eq("is_published", true)
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Supabase Gazzetta: ${error.message}`);

  EDITIONS = data || [];

  if (!EDITIONS.length) {
    CURRENT_GW = null;
    return;
  }

  const existsCurrent = EDITIONS.some(e => Number(e.gw) === Number(CURRENT_GW));
  if (!existsCurrent) {
    CURRENT_GW = EDITIONS[0].gw;
  }
}

function buildRatings(row){
  const ratings = [];
  for (let i = 1; i <= 5; i++){
    const team = norm(row[`rating_${i}_team`]);
    const vote = norm(row[`rating_${i}_vote`]);
    const label = norm(row[`rating_${i}_label`]);
    const text = norm(row[`rating_${i}_text`]);
    const icon = normalizeImageUrl(row[`rating_${i}_icon_url`]);
    if (team || vote || label || text || icon) {
      ratings.push({ team, vote, label, text, icon });
    }
  }

  if (!ratings.length) return "";

  return `
    <section class="ratings-section">
      <div class="section-headline">
        <h3>Pagelle degli Eroi</h3>
      </div>
      <div class="ratings-grid">
        ${ratings.map((r, idx) => `
          <article class="rating-card">
            <div class="rating-team">${escapeHtml(r.team || `Pagella ${idx + 1}`)}</div>
            ${r.icon ? `<img class="rating-logo" src="${r.icon}" alt="${escapeHtml(r.team || "Logo")}">` : `<div class="rating-logo rating-logo-fallback">♛</div>`}
            ${r.vote ? `<div class="rating-vote">${escapeHtml(r.vote)}</div>` : ""}
            ${r.label ? `<div class="rating-label">${escapeHtml(r.label)}</div>` : ""}
            ${r.text ? `<p>${escapeHtml(r.text)}</p>` : ""}
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function buildTopFlop(row){
  const tops = [];
  const flops = [];

  for (let i = 1; i <= 3; i++){
    const topTitle = norm(row[`top_${i}_title`]);
    const topText = norm(row[`top_${i}_text`]);
    if (topTitle || topText) tops.push({ title: topTitle, text: topText });

    const flopTitle = norm(row[`flop_${i}_title`]);
    const flopText = norm(row[`flop_${i}_text`]);
    if (flopTitle || flopText) flops.push({ title: flopTitle, text: flopText });
  }

  if (!tops.length && !flops.length) return "";

  const list = (items, type) => items.length
    ? items.map(item => `
        <li>
          <span class="tf-dot ${type}">${type === "top" ? "✓" : "×"}</span>
          <div>
            ${item.title ? `<strong>${escapeHtml(item.title)}</strong>` : ""}
            ${item.text ? `<p>${escapeHtml(item.text)}</p>` : ""}
          </div>
        </li>
      `).join("")
    : `<li class="tf-empty">Nessuna voce inserita.</li>`;

  return `
    <section class="topflop-section">
      <div class="section-headline compact">
        <h3>Top & Flop</h3>
      </div>
      <div class="topflop-grid">
        <div class="tf-column">
          <div class="tf-label top">Top</div>
          <ul>${list(tops, "top")}</ul>
        </div>
        <div class="tf-column">
          <div class="tf-label flop">Flop</div>
          <ul>${list(flops, "flop")}</ul>
        </div>
      </div>
    </section>
  `;
}

function buildNextOn(row){
  const title = norm(row.next_title) || "Next on Lega degli Eroi";
  const eventTitle = norm(row.next_event_title);
  const subtitle = norm(row.next_subtitle);
  const text = norm(row.next_text);
  const image = normalizeImageUrl(row.next_image_url);
  const date = norm(row.next_date);
  const time = norm(row.next_time);
  const ctaLabel = norm(row.next_cta_label);
  const ctaUrl = norm(row.next_cta_url);

  if (!eventTitle && !subtitle && !text && !image && !date && !time) return "";

  return `
    <section class="next-section">
      <div class="next-media next-media-image-only">
        ${
          image
            ? `<img src="${image}" alt="${escapeHtml(eventTitle || title)}">`
            : `<div class="next-placeholder">Teaser in arrivo</div>`
        }
      </div>

      <div class="next-copy">
        <div class="section-eyebrow">${escapeHtml(title)}</div>
        ${eventTitle ? `<h3>${escapeHtml(eventTitle)}</h3>` : ""}
        ${subtitle ? `<h4>${escapeHtml(subtitle)}</h4>` : ""}
        ${text ? `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>` : ""}

        ${(date || time || ctaLabel) ? `
          <div class="next-meta-row">
            ${date ? `<span>📅 ${escapeHtml(date)}</span>` : ""}
            ${time ? `<span>🕒 ${escapeHtml(time)}</span>` : ""}
            ${ctaLabel && ctaUrl ? `<a href="${escapeHtml(ctaUrl)}">${escapeHtml(ctaLabel)}</a>` : ""}
          </div>
        ` : ""}
      </div>
    </section>
  `;
}

function renderEdition(row){
  const title = norm(row.title) || `GW ${row.gw} | La Gazzetta degli Eroi`;
  const deck = norm(row.deck) || "La redazione ha pubblicato una nuova edizione della Gazzetta.";
  const heroImage = normalizeImageUrl(row.hero_image_url);
  const heroAlt = norm(row.hero_image_alt) || title;
  const editorialTitle = norm(row.editorial_title) || "Il Punto di Costantino";
  const editorialSignature = norm(row.editorial_signature) || "Costantino";
  const editorialContent = textToEditorialWithQuote(row.editorial_text, row.pull_quote, editorialSignature);

  return `
    <section class="front-hero">
      <div class="lede-copy">
        <span class="kicker"><span>♕</span> Lega degli Eroi</span>
        <h1>${escapeHtml(title)}</h1>
        <p class="deck">${escapeHtml(deck)}</p>
        <div class="story-meta">
          <span>Editoriale</span>
          <span>GW ${escapeHtml(row.gw)}</span>
          <span>Prima pagina</span>
        </div>
      </div>
      ${heroImage ? `
        <figure class="hero-media">
          <img src="${heroImage}" alt="${escapeHtml(heroAlt)}">
        </figure>
      ` : `<div class="hero-media hero-placeholder"><span>Immagine editoriale</span></div>`}
    </section>

    <section class="editorial-wide">
      <article class="editorial-card">
        <div class="article-label"><span>✒</span> ${escapeHtml(editorialTitle)}</div>
        <div class="article-body">
          ${editorialContent}
        </div>
      </article>
    </section>

    <section class="lower-grid">
      <div>
        ${buildRatings(row)}
      </div>
      <div>
        ${buildTopFlop(row)}
      </div>
    </section>

    ${buildNextOn(row)}

    <footer class="paper-foot">
      Edizione della Gazzetta • GW ${escapeHtml(row.gw)}
    </footer>
  `;
}

function renderCurrent(){
  const out = $("output");
  if (!out) return;

  if (!EDITIONS.length) {
    out.innerHTML = `
      <div class="loading-card empty-state">
        <h3>Nessuna edizione pubblicata.</h3>
        <p>Apri Admin Gazzetta, crea una nuova edizione e spunta “Pubblicata”.</p>
      </div>
    `;
    setStatus("Nessuna edizione pubblicata", true);
    return;
  }

  const row = getEditionByGw(CURRENT_GW) || EDITIONS[0];
  CURRENT_GW = row.gw;

  const chipDate = $("chipDate");
  const chipGW = $("chipGW");
  if (chipDate) chipDate.textContent = norm(row.edition_date) || new Date(row.updated_at || Date.now()).toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  if (chipGW) chipGW.textContent = `GW ${row.gw}`;

  out.innerHTML = renderEdition(row);
  setStatus(`GW ${row.gw} aggiornata`);
  const sel = $("gwSelect");
  if (sel) sel.value = String(row.gw);
}

async function reloadGazzetta({ keepCurrent = true } = {}){
  const selected = keepCurrent ? Number($("gwSelect")?.value || CURRENT_GW) : null;
  await loadEditions();
  if (selected && EDITIONS.some(e => Number(e.gw) === selected)) {
    CURRENT_GW = selected;
  }
  fillGWSelect();
  renderCurrent();
}

document.addEventListener("DOMContentLoaded", () => {
  $("gwSelect")?.addEventListener("change", (e) => {
    CURRENT_GW = Number(e.target.value);
    renderCurrent();
  });

  $("btnReload")?.addEventListener("click", async () => {
    try {
      setStatus("Aggiorno…");
      await reloadGazzetta({ keepCurrent: true });
      setStatus("Aggiornato ✅");
      setTimeout(() => setStatus(""), 1200);
    } catch (e) {
      console.error(e);
      setStatus(`Errore: ${e.message}`, true);
      const out = $("output");
      if (out) out.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
    }
  });

  (async () => {
    try {
      setStatus("Caricamento…");
      await reloadGazzetta({ keepCurrent: false });
      setStatus("");
    } catch (e) {
      console.error(e);
      setStatus(`Errore: ${e.message}`, true);
      const out = $("output");
      if (out) out.innerHTML = `<p class="error">${escapeHtml(e.message)}</p>`;
    }
  })();
});
