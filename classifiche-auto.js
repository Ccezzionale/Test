/* =========================================
   CLASSIFICHE AUTO - LEGA DEGLI EROI
   Fonte unica: Risultati PR – Master
   ========================================= */

const CLASSIFICHE_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vRhEJKfZhVb7V08KI29T_aPTR0hfx7ayIOlFjQn_v-fqgktImjXFg-QAEA6z7w5eyEh2B3w5KLpaRYz/pub?gid=1118969717&single=true&output=csv";

const LOGO_DIR = "img/";

const COMPETITIONS = {
  "Conf.League": {
    title: "Classifica Conference League",
    conference: "Conf A",
    highlight: "top1"
  },
  "Conf. Championship": {
    title: "Classifica Conference Championship",
    conference: "Conf B",
    highlight: "top1"
  },
  "Round Robin": {
    title: "Classifica Round Robin",
    conference: "Unificata",
    highlight: "top1"
  },
  "Totale": {
    title: "Classifica Totale",
    conference: "ALL",
    highlight: "top4-bottom4"
  }
};

/* =========================================
   UTILS
   ========================================= */

function parseNumber(value) {
  if (value === null || value === undefined) return 0;
  const n = parseFloat(String(value).replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function formatNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return value;

  if (Number.isInteger(n)) return String(n);

  return n.toFixed(1).replace(".", ",");
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

  const headers = rows.shift().map(h => h.trim());

  return rows
    .filter(r => r.some(cell => String(cell || "").trim() !== ""))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = String(r[i] ?? "").trim();
      });
      return obj;
    });
}

async function fetchCSV(url) {
  const bust = url.includes("?") ? "&nocache=" : "?nocache=";
  const res = await fetch(url + bust + Date.now(), { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Errore caricamento CSV: ${res.status}`);
  }

  const text = await res.text();
  return parseCSV(text);
}

/* =========================================
   REGOLE FANTACALCIO
   ========================================= */

const GOAL_BASE = 66;
const GOAL_STEP = 6;

function pointsToGoals(points) {
  const p = parseNumber(points);
  if (p < GOAL_BASE) return 0;
  return 1 + Math.floor((p - GOAL_BASE) / GOAL_STEP);
}

function resultFromGoals(gf, ga) {
  if (gf > ga) return "V";
  if (gf < ga) return "P";
  return "N";
}

/* =========================================
   CALCOLO CLASSIFICA
   ========================================= */

function getRowsForCompetition(rows, competitionName) {
  const config = COMPETITIONS[competitionName];

  if (!config) return [];

  return rows.filter(r => {
    const team = cleanTeamName(r.Team);
    const opponent = cleanTeamName(r.Opponent);
    const pf = parseNumber(r.PointsFor);
    const pa = parseNumber(r.PointsAgainst);
    const conference = String(r.Conference || "").trim();

    if (!team || !opponent) return false;
    if (!Number.isFinite(pf) || !Number.isFinite(pa)) return false;
    if (pf === 0 && pa === 0) return false;

    if (config.conference === "ALL") {
      return ["Conf A", "Conf B", "Unificata"].includes(conference);
    }

    return conference === config.conference;
  });
}

function buildStandings(rows) {
  const table = new Map();

  rows.forEach(r => {
    const name = cleanTeamName(r.Team);
    const key = teamKey(name);

    if (!key) return;

    const pf = parseNumber(r.PointsFor);
    const pa = parseNumber(r.PointsAgainst);

    const gf = pointsToGoals(pf);
    const ga = pointsToGoals(pa);
    const result = resultFromGoals(gf, ga);

    if (!table.has(key)) {
      table.set(key, {
        squadra: name,
        g: 0,
        v: 0,
        n: 0,
        p: 0,
        gf: 0,
        gs: 0,
        pt: 0,
        mp: 0
      });
    }

    const rec = table.get(key);

    rec.g += 1;
    rec.gf += gf;
    rec.gs += ga;
    rec.mp += pf;

    if (result === "V") {
      rec.v += 1;
      rec.pt += 3;
    } else if (result === "N") {
      rec.n += 1;
      rec.pt += 1;
    } else {
      rec.p += 1;
    }
  });

  return Array.from(table.values()).sort((a, b) => {
    return (
      b.pt - a.pt ||
      b.mp - a.mp ||
      b.gf - a.gf ||
      (a.gs - b.gs) ||
      a.squadra.localeCompare(b.squadra)
    );
  });
}

/* =========================================
   RENDER DESKTOP
   ========================================= */

function resetClassificaDOM() {
  const thead = document.querySelector("#tabella-classifica thead");
  const tbody = document.querySelector("#tabella-classifica tbody");
  const mobile = document.getElementById("classifica-mobile");

  if (thead) thead.innerHTML = "";
  if (tbody) tbody.innerHTML = "";
  if (mobile) mobile.innerHTML = "";
}

function renderHeader() {
  const thead = document.querySelector("#tabella-classifica thead");
  if (!thead) return;

  thead.innerHTML = `
    <tr>
      <th>Pos</th>
      <th>Squadra</th>
      <th>G</th>
      <th>V</th>
      <th>N</th>
      <th>P</th>
      <th>GF</th>
      <th>GS</th>
      <th>PT</th>
      <th>MP</th>
    </tr>
  `;
}

function logoCell(team) {
  const td = document.createElement("td");
  const div = document.createElement("div");
  div.className = "logo-nome";

  const img = document.createElement("img");
  img.src = `${LOGO_DIR}${team}.png`;
  img.alt = team;
  img.onerror = function () {
    if (!this.dataset.jpg) {
      this.dataset.jpg = "1";
      this.src = `${LOGO_DIR}${team}.jpg`;
    } else {
      this.style.display = "none";
    }
  };

  const span = document.createElement("span");
  span.textContent = team;

  div.appendChild(img);
  div.appendChild(span);
  td.appendChild(div);

  return td;
}

function rowClasses(index, total, competitionName) {
  const config = COMPETITIONS[competitionName];
  const classes = [];

  if (config.highlight === "top1" && index === 0) {
    classes.push("top1");
  }

  if (config.highlight === "top4-bottom4") {
    if (index < 4) classes.push("top4");
    if (index >= total - 4) classes.push("ultime4");
  }

  return classes;
}

function renderDesktop(standings, competitionName) {
  const tbody = document.querySelector("#tabella-classifica tbody");
  if (!tbody) return;

  standings.forEach((r, index) => {
    const tr = document.createElement("tr");
    tr.classList.add("riga-classifica");

    rowClasses(index, standings.length, competitionName).forEach(cls => {
      tr.classList.add(cls);
    });

    const tdPos = document.createElement("td");
    tdPos.textContent = `${index + 1}°`;
    tr.appendChild(tdPos);

    tr.appendChild(logoCell(r.squadra));

    ["g", "v", "n", "p", "gf", "gs", "pt"].forEach(key => {
      const td = document.createElement("td");
      td.textContent = r[key];
      tr.appendChild(td);
    });

    const tdMp = document.createElement("td");
    tdMp.textContent = formatNumber(r.mp);
    tr.appendChild(tdMp);

    tbody.appendChild(tr);
  });
}

/* =========================================
   RENDER MOBILE
   ========================================= */

function renderMobile(standings, competitionName) {
  const mobile = document.getElementById("classifica-mobile");
  if (!mobile) return;

  standings.forEach((r, index) => {
    const item = document.createElement("div");
    item.className = "accordion-item";

    rowClasses(index, standings.length, competitionName).forEach(cls => {
      item.classList.add(cls);
    });

    const header = document.createElement("div");
    header.className = "accordion-header";

    const img = document.createElement("img");
    img.src = `${LOGO_DIR}${r.squadra}.png`;
    img.alt = r.squadra;
    img.onerror = function () {
      if (!this.dataset.jpg) {
        this.dataset.jpg = "1";
        this.src = `${LOGO_DIR}${r.squadra}.jpg`;
      } else {
        this.style.display = "none";
      }
    };

    const span = document.createElement("span");
    span.innerHTML = `
      <strong>${index + 1}° ${r.squadra}</strong><br>
      <span style="font-weight:normal">PT. ${r.pt} / MP. ${formatNumber(r.mp)}</span>
    `;

    header.appendChild(img);
    header.appendChild(span);

    const body = document.createElement("div");
    body.className = "accordion-body";

    body.innerHTML = `
      <span><strong>G:</strong> ${r.g}</span>
      <span><strong>V:</strong> ${r.v}</span>
      <span><strong>N:</strong> ${r.n}</span>
      <span><strong>P:</strong> ${r.p}</span>
      <span><strong>GF:</strong> ${r.gf}</span>
      <span><strong>GS:</strong> ${r.gs}</span>
      <span><strong>PT:</strong> ${r.pt}</span>
      <span><strong>MP:</strong> ${formatNumber(r.mp)}</span>
    `;

    header.addEventListener("click", () => {
      item.classList.toggle("active");
    });

    item.appendChild(header);
    item.appendChild(body);
    mobile.appendChild(item);
  });
}

/* =========================================
   MAIN
   ========================================= */

let allRows = [];

async function caricaClassifica(competitionName = "Conf.League") {
  const config = COMPETITIONS[competitionName];
  if (!config) return;

  const h1 = document.querySelector("h1");
  if (h1) h1.textContent = config.title;

  resetClassificaDOM();
  renderHeader();

  const rows = getRowsForCompetition(allRows, competitionName);
  const standings = buildStandings(rows);

  renderDesktop(standings, competitionName);
  renderMobile(standings, competitionName);
}

function gestisciSwitcher() {
  const buttons = document.querySelectorAll(".switcher button");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      buttons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      const competitionName = btn.textContent.trim();
      caricaClassifica(competitionName);
    });
  });
}

async function initClassifiche() {
  try {
    allRows = await fetchCSV(CLASSIFICHE_CSV_URL);

    gestisciSwitcher();
    caricaClassifica("Conf.League");
  } catch (err) {
    console.error("Errore classifiche auto:", err);

    const tbody = document.querySelector("#tabella-classifica tbody");
    if (tbody) {
      tbody.innerHTML = `
        <tr>
          <td colspan="10">Errore nel caricamento delle classifiche.</td>
        </tr>
      `;
    }
  }
}

document.addEventListener("DOMContentLoaded", initClassifiche);
