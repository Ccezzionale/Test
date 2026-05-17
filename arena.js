const squadre = [
  { nome: "Rubinkebab", logo: "img/Rubinkebab.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Golden Knights", logo: "img/Golden Knights.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Ibla", logo: "img/Ibla.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Riverfilo", logo: "img/Riverfilo.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Desperados", logo: "img/Desperados.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Wildboys 78", logo: "img/wildboys78.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Pokermantra", logo: "img/PokerMantra.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.png", eliminata: false, ultimaEliminata: false, turnoEliminazione: null, magicPunti: null }
];

/*
  Aggiornamento settimanale rapido:
  - metti eliminata: true sulla squadra caduta
  - metti ultimaEliminata: true solo sulla squadra appena eliminata
  - aggiungi turnoEliminazione e magicPunti se vuoi popolare Registro e Zona Pericolo
  - quando resta una sola squadra con eliminata:false, la pagina passa automaticamente alla modalità finale
*/

const center = document.getElementById("arena-center");
const arena = document.querySelector(".arena");
const subtitle = document.getElementById("arena-subtitle");

const turnoAttualeEl = document.getElementById("turno-attuale");
const viveAttualiEl = document.getElementById("vive-attuali");
const eliminateAttualiEl = document.getElementById("eliminate-attuali");
const zonaTitle = document.getElementById("zona-title");
const zonaPericoloEl = document.getElementById("zona-pericolo");
const registroEl = document.getElementById("registro-eliminazioni");

const ultimaEliminata = squadre.find(s => s.ultimaEliminata);
const inGioco = squadre.filter(s => !s.eliminata);
const eliminate = squadre.filter(s => s.eliminata);
const eliminateOrdinate = [...eliminate].sort((a, b) => (b.turnoEliminazione || 0) - (a.turnoEliminazione || 0));

const sopravvissute = inGioco.length;
const eliminateCount = eliminate.length;
const ultimoTurno = Math.max(...eliminate.map(s => s.turnoEliminazione || 0), 0);
const turnoAttuale = eliminateCount === 0 ? 1 : ultimoTurno;
const isFinale = inGioco.length === 1;

if (turnoAttualeEl) turnoAttualeEl.textContent = turnoAttuale;
if (viveAttualiEl) viveAttualiEl.textContent = sopravvissute;
if (eliminateAttualiEl) eliminateAttualiEl.textContent = eliminateCount;

if (subtitle) {
  if (eliminateCount === 0) subtitle.textContent = "Sedici squadre entrano nell’arena. Da qui in poi, ogni punto pesa.";
  if (!isFinale && eliminateCount > 0) subtitle.textContent = "Ogni settimana cade una squadra. Nell’arena ne resterà soltanto una.";
  if (isFinale) subtitle.textContent = "Il cerchio si è chiuso. L’arena ha scelto il suo ultimo sopravvissuto.";
}

function renderCenter() {
  if (!center) return;

  if (isFinale) {
    const vincitore = inGioco[0];
    center.innerHTML = `
      <div class="eliminata-wrapper finale-wrapper">
        <div class="center-ring"></div>
        <img src="${vincitore.logo}" class="eliminata-logo vincitore-logo" alt="${vincitore.nome}" />
        <div class="eliminata-testo vincitore-box">
          <span class="label-top">🏆 Ultimo sopravvissuto</span>
          <span class="main-name">${vincitore.nome}</span>
        </div>
        <div class="centro-caption">L’arena ha emesso il suo verdetto finale</div>
      </div>
    `;
    return;
  }

  if (ultimaEliminata) {
    center.innerHTML = `
      <div class="eliminata-wrapper">
        <div class="center-ring danger-ring"></div>
        <img src="${ultimaEliminata.logo}" class="eliminata-logo ultimo-logo" alt="${ultimaEliminata.nome}" />
        <div class="eliminata-testo danger-box">
          <span class="label-top">❌ Ultima eliminata</span>
          <span class="main-name">${ultimaEliminata.nome}</span>
        </div>
        <div class="centro-caption">L’arena reclama un’altra vittima</div>
      </div>
    `;
    return;
  }

  center.innerHTML = `
    <div class="eliminata-wrapper">
      <div class="center-ring"></div>
      <div class="start-emblem">⚔️</div>
      <div class="eliminata-testo">
        <span class="label-top">Sfida in corso</span>
        <span class="main-name">Nessun verdetto ancora</span>
      </div>
      <div class="centro-caption">Sedici entrano. Una resterà.</div>
    </div>
  `;
}

function renderArenaTeams() {
  if (!arena) return;

  const cx = 350;
  const cy = 350;
  const r = 255;

  squadre.forEach((s, i) => {
    const angle = (-Math.PI / 2) + (2 * Math.PI / squadre.length) * i;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    const div = document.createElement("div");
    div.className = "squadra";

    if (s.eliminata) div.classList.add("eliminata");
    else div.classList.add("in-gioco");

    if (s.ultimaEliminata) div.classList.add("recente");

    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.title = s.nome;

    const img = document.createElement("img");
    img.src = s.logo;
    img.alt = s.nome;

    div.appendChild(img);
    arena.appendChild(div);
  });
}

function formatPunti(value) {
  if (value === null || value === undefined || value === "") return "--";
  return String(value).replace(".", ",");
}

function renderZonaPericolo() {
  if (!zonaPericoloEl) return;

  if (eliminateCount === 0) {
    if (zonaTitle) zonaTitle.textContent = "Prima Battaglia";
    zonaPericoloEl.innerHTML = `
      <div class="danger-head neutral">
        <div class="danger-icon">⚔️</div>
        <div>
          <h3>L’arena è ancora intatta</h3>
          <p>Nessuna squadra è caduta. La prima eliminazione aprirà il registro.</p>
        </div>
      </div>
    `;
    return;
  }

  if (isFinale) {
    const vincitore = inGioco[0];
    if (zonaTitle) zonaTitle.textContent = "Verdetto Finale";
    zonaPericoloEl.innerHTML = `
      <div class="danger-head champion">
        <img src="${vincitore.logo}" alt="${vincitore.nome}">
        <div>
          <span class="mini-label">Campione dell’Arena</span>
          <h3>${vincitore.nome}</h3>
          <p>Ha attraversato tutti i turni ed è rimasta l’unica squadra in piedi.</p>
        </div>
      </div>
      <div class="danger-table">
        <div class="danger-row danger-row-final">
          <span>Ultima caduta</span>
          <strong>${ultimaEliminata ? ultimaEliminata.nome : eliminateOrdinate[0]?.nome || "--"}</strong>
          <em>${formatPunti(ultimaEliminata?.magicPunti || eliminateOrdinate[0]?.magicPunti)} MP</em>
        </div>
        <div class="danger-row">
          <span>Squadre eliminate</span>
          <strong>${eliminateCount}</strong>
          <em>su ${squadre.length}</em>
        </div>
      </div>
    `;
    return;
  }

  const ultima = ultimaEliminata || eliminateOrdinate[0];
  const sogliaSalvezza = inGioco
    .filter(s => typeof s.magicPunti === "number")
    .sort((a, b) => a.magicPunti - b.magicPunti)[0];

  const salvatePerPoco = inGioco
    .filter(s => typeof s.magicPunti === "number")
    .sort((a, b) => a.magicPunti - b.magicPunti)
    .slice(0, 3);

  const distanza = sogliaSalvezza && ultima?.magicPunti !== undefined
    ? (sogliaSalvezza.magicPunti - ultima.magicPunti).toFixed(1).replace(".", ",")
    : null;

  zonaPericoloEl.innerHTML = `
    <div class="danger-head">
      <img src="${ultima.logo}" alt="${ultima.nome}">
      <div>
        <span class="mini-label">Eliminata del turno ${ultima.turnoEliminazione || turnoAttuale}</span>
        <h3>${ultima.nome}</h3>
        <p>${formatPunti(ultima.magicPunti)} Magic Punti. ${distanza ? `Salvezza mancata per ${distanza} punti.` : "Il margine è stato sottilissimo."}</p>
      </div>
    </div>
    <div class="danger-table">
      ${salvatePerPoco.map((s, index) => `
        <div class="danger-row ${index === 0 ? "safe-line" : ""}">
          <span>${index === 0 ? "Soglia salvezza" : "A rischio"}</span>
          <strong>${s.nome}</strong>
          <em>${formatPunti(s.magicPunti)} MP</em>
        </div>
      `).join("")}
    </div>
  `;
}

function renderRegistroEliminazioni() {
  if (!registroEl) return;

  if (!eliminateOrdinate.length) {
    registroEl.innerHTML = `<p class="empty-registro">Il registro è ancora vuoto.</p>`;
    return;
  }

  registroEl.innerHTML = eliminateOrdinate.map(s => `
    <div class="registro-row ${s.ultimaEliminata ? "registro-current" : ""}">
      <div class="registro-marker">${s.ultimaEliminata ? "💀" : "☠️"}</div>
      <div class="registro-turno">Turno ${s.turnoEliminazione || "--"}</div>
      <div class="registro-team">
        <img src="${s.logo}" alt="${s.nome}">
        <span>${s.nome}</span>
      </div>
      <div class="registro-score">${formatPunti(s.magicPunti)} MP</div>
    </div>
  `).join("");
}

renderCenter();
renderArenaTeams();
renderZonaPericolo();
renderRegistroEliminazioni();
