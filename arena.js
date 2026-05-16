const squadre = [
  { nome: "Golden Knights", logo: "img/Golden Knights.png", eliminata: false, turno: null, punti: null, nota: "La leggenda continua." },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.png", eliminata: true, ultimaEliminata: true, turno: 15, punti: "58.5 - 72.0", nota: "Combattuta fino alla fine." },
  { nome: "Rubinkebab", logo: "img/Rubinkebab.png", eliminata: true, turno: 15, punti: "61.0 - 69.5" },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.png", eliminata: true, turno: 14, punti: "60.0 - 71.5" },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.png", eliminata: true, turno: 14, punti: "57.5 - 68.0" },
  { nome: "Ibla", logo: "img/Ibla.png", eliminata: true, turno: 13, punti: "62.0 - 70.5" },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.png", eliminata: true, turno: 12, punti: "59.5 - 67.0" },
  { nome: "Riverfilo", logo: "img/Riverfilo.png", eliminata: true, turno: 11, punti: "58.0 - 66.0" },
  { nome: "Pokermantra", logo: "img/PokerMantra.png", eliminata: true, turno: 10, punti: "61.0 - 70.0" },
  { nome: "Wildboys 78", logo: "img/wildboys78.png", eliminata: true, turno: 9, punti: "62.5 - 71.0" },
  { nome: "Desperados", logo: "img/Desperados.png", eliminata: true, turno: 8, punti: "60.5 - 71.0" },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.png", eliminata: true, turno: 7, punti: "59.5 - 70.0" },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.png", eliminata: true, turno: 6, punti: "60.0 - 78.5" },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.png", eliminata: true, turno: 5, punti: "64.0 - 77.0" },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.png", eliminata: true, turno: 4, punti: "58.5 - 72.0" },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.png", eliminata: true, turno: 3, punti: "55.0 - 65.5" }
];

const byId = (id) => document.getElementById(id);
const inGioco = squadre.filter(s => !s.eliminata);
const eliminate = squadre.filter(s => s.eliminata);
const ultimaEliminata = squadre.find(s => s.ultimaEliminata) || eliminate.sort((a, b) => (b.turno || 0) - (a.turno || 0))[0];
const campione = inGioco[0] || null;
const turnoAttuale = Math.max(...eliminate.map(s => s.turno || 0), 1);
const turniTotali = squadre.length - 1;

function updateStats(){
  byId("vive-attuali").textContent = inGioco.length;
  byId("totale-squadre").textContent = squadre.length;
  byId("turno-attuale").textContent = turnoAttuale;
  byId("turni-totali").textContent = turniTotali;
  byId("eliminate-attuali").textContent = eliminate.length;
  byId("chrono-count").textContent = eliminate.length;
}

function renderChampion(){
  const target = byId("champion-banner");
  if (!target) return;

  if (!campione) {
    target.innerHTML = `
      <div class="champion-empty">
        <span class="champion-kicker">⚔️ Battaglia in corso</span>
        <h2>Nessun ultimo sopravvissuto</h2>
        <p>Il verdetto dell'arena non è ancora stato scritto.</p>
      </div>
    `;
    return;
  }

  target.innerHTML = `
    <div class="champion-logo-wrap">
      <img src="${campione.logo}" alt="${campione.nome}" class="champion-logo">
    </div>
    <div class="champion-copy">
      <span class="champion-kicker">🏆 Ultimo sopravvissuto</span>
      <h2>${campione.nome}</h2>
      <p>${campione.nota || "La leggenda continua."}</p>
    </div>
  `;
}

function renderLastOut(){
  const target = byId("last-out-panel");
  if (!target || !ultimaEliminata) return;

  target.innerHTML = `
    <h2>Ultima eliminata</h2>
    <div class="last-out-body">
      <img src="${ultimaEliminata.logo}" alt="${ultimaEliminata.nome}">
      <div>
        <h3>${ultimaEliminata.nome}</h3>
        <p>Eliminata al turno ${ultimaEliminata.turno}</p>
        <strong>${ultimaEliminata.punti || ""}</strong>
      </div>
    </div>
    <blockquote>“${ultimaEliminata.nota || "Caduta, ma non dimenticata."}”</blockquote>
    <button type="button" class="gold-button small">Vedi dettagli</button>
  `;
}

function renderFallenGrid(){
  const target = byId("fallen-grid");
  if (!target) return;

  const ordered = [...eliminate].sort((a, b) => (b.turno || 0) - (a.turno || 0) || a.nome.localeCompare(b.nome));

  target.innerHTML = ordered.map(team => `
    <article class="fallen-card ${team.ultimaEliminata ? "last-fallen" : ""}">
      <span class="card-corner">T${team.turno}</span>
      <img src="${team.logo}" alt="${team.nome}">
      <h3>${team.nome}</h3>
      <p>Turno ${team.turno}</p>
      <strong>${team.punti || ""}</strong>
    </article>
  `).join("");
}

function renderChronology(){
  const target = byId("chronology-list");
  if (!target) return;

  const ordered = [...eliminate].sort((a, b) => (b.turno || 0) - (a.turno || 0) || a.nome.localeCompare(b.nome));

  target.innerHTML = ordered.map(team => `
    <article class="chronology-item ${team.ultimaEliminata ? "hot" : ""}">
      <img src="${team.logo}" alt="${team.nome}">
      <div>
        <span>Turno ${team.turno}</span>
        <h3>${team.nome}</h3>
      </div>
      <strong>${team.punti || "Caduta"}</strong>
    </article>
  `).join("");
}

function renderTimeline(){
  const target = byId("timeline-track");
  if (!target) return;

  const ordered = [...eliminate].sort((a, b) => (a.turno || 0) - (b.turno || 0) || a.nome.localeCompare(b.nome));

  target.innerHTML = ordered.map(team => `
    <article class="timeline-node ${team.ultimaEliminata ? "final-node" : ""}">
      <div class="timeline-dot"></div>
      <img src="${team.logo}" alt="${team.nome}">
      <span>${team.nome}</span>
      <strong>T${team.turno}</strong>
    </article>
  `).join("");
}

function init(){
  updateStats();
  renderChampion();
  renderLastOut();
  renderFallenGrid();
  renderChronology();
  renderTimeline();
}

init();
