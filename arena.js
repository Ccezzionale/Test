const squadre = [
  { nome: "Rubinkebab", logo: "img/Rubinkebab.png", eliminata: true, ultimaEliminata: false },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.png", eliminata: true, ultimaEliminata: false },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.png", eliminata: true, ultimaEliminata: false },
  { nome: "Golden Knights", logo: "img/Golden Knights.png", eliminata: false, ultimaEliminata: true },
  { nome: "Ibla", logo: "img/Ibla.png", eliminata: true, ultimaEliminata: false },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.png", eliminata: true, ultimaEliminata: false },
  { nome: "Riverfilo", logo: "img/Riverfilo.png", eliminata: true, ultimaEliminata: false },
  { nome: "Desperados", logo: "img/Desperados.png", eliminata: true, ultimaEliminata: false },
  { nome: "Wildboys 78", logo: "img/wildboys78.png", eliminata: true, ultimaEliminata: false },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.png", eliminata: true, ultimaEliminata: false },
  { nome: "Pokermantra", logo: "img/PokerMantra.png", eliminata: true, ultimaEliminata: false },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.png", eliminata: true, ultimaEliminata: false },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.png", eliminata: true, ultimaEliminata: false },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.png", eliminata: true, ultimaEliminata: false },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.png", eliminata: true, ultimaEliminata: false },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.png", eliminata: true, ultimaEliminata: false }
];

const mapPositions = [
  { x: 20, y: 25 }, { x: 36, y: 18 }, { x: 54, y: 19 }, { x: 70, y: 24 },
  { x: 82, y: 38 }, { x: 75, y: 56 }, { x: 62, y: 70 }, { x: 47, y: 77 },
  { x: 32, y: 70 }, { x: 18, y: 56 }, { x: 15, y: 39 }, { x: 28, y: 43 },
  { x: 41, y: 34 }, { x: 59, y: 35 }, { x: 68, y: 45 }, { x: 35, y: 57 }
];

const fallbackRounds = [15, 14, 14, 15, 13, 15, 11, 9, 10, 8, 10, 7, 6, 5, 12, 4];

const inGioco = squadre.filter(s => !s.eliminata);
const eliminate = squadre.filter(s => s.eliminata);
const latestEliminated = squadre.find(s => s.eliminata && s.ultimaEliminata) || eliminate[eliminate.length - 1] || null;
const champion = inGioco[0] || null;
const totalTeams = squadre.length;
const currentTurn = eliminate.length || 1;

const els = {
  total: document.getElementById("totale-squadre"),
  alive: document.getElementById("vive-attuali"),
  eliminated: document.getElementById("eliminate-attuali"),
  turn: document.getElementById("turno-attuale"),
  mapStatus: document.getElementById("map-status"),
  lastCard: document.getElementById("ultima-eliminata-card"),
  layer: document.getElementById("territories-layer"),
  championCore: document.getElementById("champion-core"),
  historyList: document.getElementById("history-list"),
  historyCount: document.getElementById("history-count"),
  recentItems: document.getElementById("recent-items")
};

function setText(el, value) {
  if (el) el.textContent = value;
}

function getRound(team, index) {
  if (!team.eliminata) return currentTurn;
  return team.turno || fallbackRounds[index] || index + 1;
}

function shortName(name) {
  return name.length > 18 ? `${name.slice(0, 16)}…` : name;
}

function renderStats() {
  setText(els.total, totalTeams);
  setText(els.alive, inGioco.length);
  setText(els.eliminated, eliminate.length);
  setText(els.turn, `${currentTurn} di ${totalTeams - 1}`);
  setText(els.mapStatus, inGioco.length === 1 ? "Verdetto finale" : "Battaglia in corso");
}

function renderLastEliminated() {
  if (!els.lastCard) return;

  if (!latestEliminated) {
    els.lastCard.innerHTML = `
      <span class="panel-title">Ultima eliminata</span>
      <div class="empty-state">Nessuna eliminazione registrata.</div>
    `;
    return;
  }

  const index = squadre.indexOf(latestEliminated);
  const round = getRound(latestEliminated, index);

  els.lastCard.innerHTML = `
    <span class="panel-title">Ultima eliminata</span>
    <div class="last-team-card">
      <img src="${latestEliminated.logo}" alt="${latestEliminated.nome}" loading="lazy">
      <div>
        <h2 class="last-team-name">${latestEliminated.nome}</h2>
        <p class="last-team-meta">Eliminata al turno ${round}<br>Il territorio si è spento.</p>
      </div>
      <p class="last-quote">“Combattuta fino alla fine.”</p>
    </div>
  `;
}

function renderChampion() {
  if (!els.championCore) return;

  if (!champion) {
    els.championCore.innerHTML = `
      <div class="champion-card">
        <span class="champion-label">⚔️ In corso</span>
        <h2 class="champion-name">Nessun sopravvissuto</h2>
        <p class="champion-sub">La mappa attende il suo verdetto.</p>
      </div>
    `;
    return;
  }

  els.championCore.innerHTML = `
    <div class="champion-card">
      <span class="champion-label">🏆 Ultimo sopravvissuto</span>
      <img src="${champion.logo}" alt="${champion.nome}" loading="lazy">
      <h2 class="champion-name">${champion.nome}</h2>
      <p class="champion-sub">La leggenda continua.</p>
    </div>
  `;
}

function renderTerritories() {
  if (!els.layer) return;
  els.layer.innerHTML = "";

  squadre.forEach((team, index) => {
    if (team === champion) return;

    const pos = mapPositions[index] || { x: 50, y: 50 };
    const isLatest = latestEliminated && latestEliminated.nome === team.nome;
    const territory = document.createElement("button");
    territory.type = "button";
    territory.className = `territory ${team.eliminata ? "eliminata" : "in-gioco"} ${isLatest ? "recente" : ""}`;
    territory.style.left = `${pos.x}%`;
    territory.style.top = `${pos.y}%`;
    territory.title = team.eliminata
      ? `${team.nome} - eliminata al turno ${getRound(team, index)}`
      : `${team.nome} - ancora in gioco`;

    territory.innerHTML = `
      <img src="${team.logo}" alt="${team.nome}" loading="lazy">
      <span class="territory-name">${shortName(team.nome)}</span>
    `;

    els.layer.appendChild(territory);
  });
}

function getHistoryItems() {
  return eliminate
    .map((team, index) => ({ team, index: squadre.indexOf(team), round: getRound(team, squadre.indexOf(team)) }))
    .sort((a, b) => b.round - a.round || a.team.nome.localeCompare(b.team.nome));
}

function renderHistory() {
  if (!els.historyList) return;
  const items = getHistoryItems();
  setText(els.historyCount, `${items.length} cadute`);

  els.historyList.innerHTML = items.map(({ team, round }) => {
    const latest = latestEliminated && latestEliminated.nome === team.nome;
    return `
      <div class="history-item ${latest ? "latest" : ""}">
        <img src="${team.logo}" alt="${team.nome}" loading="lazy">
        <div>
          <span class="history-turn">Turno ${round}</span>
          <span class="history-name">${team.nome}</span>
        </div>
        <span class="history-badge">${latest ? "Ultima" : "Caduta"}</span>
      </div>
    `;
  }).join("");
}

function renderRecent() {
  if (!els.recentItems) return;
  const recent = getHistoryItems().slice(0, 5);

  els.recentItems.innerHTML = recent.map(({ team, round }) => `
    <div class="recent-card">
      <img src="${team.logo}" alt="${team.nome}" loading="lazy">
      <div>
        <b>T${round}</b>
        <span>${team.nome}</span>
      </div>
    </div>
  `).join("");
}

renderStats();
renderLastEliminated();
renderChampion();
renderTerritories();
renderHistory();
renderRecent();
