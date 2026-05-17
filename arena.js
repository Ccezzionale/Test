/* =========================
   HIGHLANDER ARENA - SUPABASE VERSION
   ========================= */

const HIGHLANDER_SEASON = "2026";

const squadreBase = [
  { nome: "Rubinkebab", logo: "img/Rubinkebab.png" },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.png" },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.png" },
  { nome: "Golden Knights", logo: "img/Golden Knights.png" },
  { nome: "Ibla", logo: "img/Ibla.png" },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.png" },
  { nome: "Riverfilo", logo: "img/Riverfilo.png" },
  { nome: "Desperados", logo: "img/Desperados.png" },
  { nome: "Wildboys 78", logo: "img/wildboys78.png" },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.png" },
  { nome: "Pokermantra", logo: "img/PokerMantra.png" },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.png" },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.png" },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.png" },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.png" },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.png" }
];

let squadre = [];
let eliminazioniDb = [];

let ultimaEliminata = null;
let inGioco = [];
let eliminate = [];
let eliminateOrdinate = [];
let sopravvissute = 0;
let eliminateCount = 0;
let ultimoTurno = 0;
let turnoAttuale = 1;
let isFinale = false;

const center = document.getElementById("arena-center");
const arena = document.querySelector(".arena");
const subtitle = document.getElementById("arena-subtitle");

const turnoAttualeEl = document.getElementById("turno-attuale");
const viveAttualiEl = document.getElementById("vive-attuali");
const eliminateAttualiEl = document.getElementById("eliminate-attuali");

const zonaTitle = document.getElementById("zona-title");
const zonaPericoloEl = document.getElementById("zona-pericolo");
const registroEl = document.getElementById("registro-eliminazioni");

const adminPanel = document.getElementById("highlander-admin-panel");
const adminTurnoInput = document.getElementById("admin-turno");
const adminSquadraSelect = document.getElementById("admin-squadra-eliminata");
const adminMagicInput = document.getElementById("admin-magic-punti");
const adminSaveBtn = document.getElementById("admin-salva-eliminazione");
const adminMsg = document.getElementById("admin-highlander-msg");

/* =========================
   SUPABASE HELPER
   ========================= */

function getSupabaseClient() {
  if (typeof supabase !== "undefined" && supabase && typeof supabase.from === "function") {
    return supabase;
  }

  if (window.supabaseClient && typeof window.supabaseClient.from === "function") {
    return window.supabaseClient;
  }

  if (window.supabase && typeof window.supabase.from === "function") {
    return window.supabase;
  }

  return null;
}

const db = getSupabaseClient();

/* =========================
   DATA
   ========================= */

async function loadEliminazioni() {
  if (!db) {
    console.warn("Supabase client non trovato. Uso dati locali vuoti.");
    eliminazioniDb = [];
    return;
  }

  const { data, error } = await db
    .from("highlander_eliminations")
    .select("*")
    .eq("season", HIGHLANDER_SEASON)
    .order("turno", { ascending: true });

  if (error) {
    console.error("Errore caricamento eliminazioni Highlander:", error);
    eliminazioniDb = [];
    return;
  }

  eliminazioniDb = data || [];
}

function buildSquadreState() {
  const eliminazioniByTeam = new Map();

  eliminazioniDb.forEach(row => {
    eliminazioniByTeam.set(row.team_name, row);
  });

  const maxTurno = eliminazioniDb.length
    ? Math.max(...eliminazioniDb.map(row => Number(row.turno) || 0))
    : 0;

  squadre = squadreBase.map(team => {
    const eliminazione = eliminazioniByTeam.get(team.nome);
    const eliminata = Boolean(eliminazione);

    return {
      nome: team.nome,
      logo: team.logo,
      eliminata,
      ultimaEliminata: eliminata && Number(eliminazione.turno) === maxTurno,
      turnoEliminazione: eliminazione ? Number(eliminazione.turno) : null,
      magicPunti: eliminazione && eliminazione.magic_punti !== null
        ? Number(eliminazione.magic_punti)
        : null
    };
  });

  ultimaEliminata = squadre.find(s => s.ultimaEliminata) || null;
  inGioco = squadre.filter(s => !s.eliminata);
  eliminate = squadre.filter(s => s.eliminata);

  eliminateOrdinate = [...eliminate].sort((a, b) => {
    return (b.turnoEliminazione || 0) - (a.turnoEliminazione || 0);
  });

  sopravvissute = inGioco.length;
  eliminateCount = eliminate.length;
  ultimoTurno = Math.max(...eliminate.map(s => s.turnoEliminazione || 0), 0);
  turnoAttuale = eliminateCount === 0 ? 1 : ultimoTurno;
  isFinale = inGioco.length === 1;
}

function updateStatsAndSubtitle() {
  if (turnoAttualeEl) turnoAttualeEl.textContent = turnoAttuale;
  if (viveAttualiEl) viveAttualiEl.textContent = sopravvissute;
  if (eliminateAttualiEl) eliminateAttualiEl.textContent = eliminateCount;

  if (!subtitle) return;

  if (eliminateCount === 0) {
    subtitle.textContent = "Sedici squadre entrano nell’arena. Da qui in poi, ogni punto pesa.";
  } else if (!isFinale) {
    subtitle.textContent = "Ogni settimana cade una squadra. Nell’arena ne resterà soltanto una.";
  } else {
    subtitle.textContent = "Il cerchio si è chiuso. L’arena ha scelto il suo ultimo sopravvissuto.";
  }
}

/* =========================
   RENDER CENTER
   ========================= */

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

/* =========================
   RENDER DESKTOP ARENA
   ========================= */

function renderArenaTeams() {
  if (!arena) return;

  arena.querySelectorAll(".squadra").forEach(el => el.remove());

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

/* =========================
   RENDER MOBILE DASHBOARD
   ========================= */

function renderMobileDashboard() {
  const mobileVerdict = document.getElementById("mobile-verdict");
  const mobileGrid = document.getElementById("mobile-teams-grid");

  if (!mobileVerdict || !mobileGrid) return;

  if (inGioco.length === 1) {
    const vincitore = inGioco[0];

    mobileVerdict.innerHTML = `
      <div class="mobile-verdict-icon">🏆</div>
      <div class="mobile-verdict-kicker">Ultimo sopravvissuto</div>
      <div class="mobile-verdict-name">${vincitore.nome}</div>
      <div class="mobile-verdict-subtitle">L’arena ha emesso il suo verdetto finale.</div>
    `;
  } else if (ultimaEliminata) {
    mobileVerdict.innerHTML = `
      <img src="${ultimaEliminata.logo}" alt="${ultimaEliminata.nome}" class="mobile-verdict-logo">
      <div class="mobile-verdict-kicker danger">Ultima eliminata</div>
      <div class="mobile-verdict-name">${ultimaEliminata.nome}</div>
      <div class="mobile-verdict-subtitle">L’arena reclama un’altra vittima.</div>
    `;
  } else {
    mobileVerdict.innerHTML = `
      <div class="mobile-verdict-icon">⚔️</div>
      <div class="mobile-verdict-kicker">Sfida in corso</div>
      <div class="mobile-verdict-name">Nessun verdetto ancora</div>
      <div class="mobile-verdict-subtitle">Sedici entrano. Una resterà.</div>
    `;
  }

  mobileGrid.innerHTML = "";

  squadre.forEach(s => {
    const card = document.createElement("div");
    card.className = "mobile-team-card";

    if (s.eliminata) card.classList.add("is-out");
    if (!s.eliminata) card.classList.add("is-alive");
    if (s.ultimaEliminata) card.classList.add("is-latest");

    card.title = s.nome;

    card.innerHTML = `
      <img src="${s.logo}" alt="${s.nome}">
      <span>${s.nome}</span>
    `;

    mobileGrid.appendChild(card);
  });
}

/* =========================
   ZONA PERICOLO
   ========================= */

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
          <em>${formatPunti(ultimaEliminata?.magicPunti ?? eliminateOrdinate[0]?.magicPunti)} MP</em>
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

  const salvatePerPoco = inGioco
    .filter(s => typeof s.magicPunti === "number")
    .sort((a, b) => a.magicPunti - b.magicPunti)
    .slice(0, 3);

  const sogliaSalvezza = salvatePerPoco[0];

  const distanza = sogliaSalvezza && ultima?.magicPunti !== null && ultima?.magicPunti !== undefined
    ? (sogliaSalvezza.magicPunti - ultima.magicPunti).toFixed(1).replace(".", ",")
    : null;

  if (zonaTitle) zonaTitle.textContent = "Zona Pericolo";

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
      ${
        salvatePerPoco.length
          ? salvatePerPoco.map((s, index) => `
              <div class="danger-row ${index === 0 ? "safe-line" : ""}">
                <span>${index === 0 ? "Soglia salvezza" : "A rischio"}</span>
                <strong>${s.nome}</strong>
                <em>${formatPunti(s.magicPunti)} MP</em>
              </div>
            `).join("")
          : `
              <div class="danger-row">
                <span>Soglia salvezza</span>
                <strong>Dati non ancora inseriti</strong>
                <em>-- MP</em>
              </div>
            `
      }
    </div>
  `;
}

/* =========================
   REGISTRO ELIMINAZIONI
   ========================= */

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

/* =========================
   ADMIN PANEL
   ========================= */

function setAdminMsg(text, type = "") {
  if (!adminMsg) return;

  adminMsg.textContent = text;
  adminMsg.classList.remove("ok", "error");

  if (type) adminMsg.classList.add(type);
}

async function checkIsAdmin() {
  if (!db || !adminPanel) return false;

  const { data: userData, error: userError } = await db.auth.getUser();

  if (userError || !userData?.user) {
    adminPanel.style.display = "none";
    return false;
  }

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profileError) {
    console.warn("Impossibile verificare ruolo admin:", profileError);
    adminPanel.style.display = "none";
    return false;
  }

  const isAdmin = profile?.role === "admin";

  adminPanel.style.display = isAdmin ? "block" : "none";
  return isAdmin;
}

function populateAdminPanel() {
  if (!adminPanel || !adminSquadraSelect || !adminTurnoInput) return;

  const prossimoTurno = eliminateCount + 1;

  adminTurnoInput.value = prossimoTurno <= squadreBase.length - 1 ? prossimoTurno : squadreBase.length - 1;

  const squadreSelezionabili = squadre.filter(s => !s.eliminata);

  adminSquadraSelect.innerHTML = squadreSelezionabili.map(s => `
    <option value="${s.nome}">${s.nome}</option>
  `).join("");

  if (!squadreSelezionabili.length || squadreSelezionabili.length === 1) {
    adminSquadraSelect.innerHTML = `
      <option value="">Torneo concluso</option>
    `;

    if (adminSaveBtn) adminSaveBtn.disabled = true;
  } else if (adminSaveBtn) {
    adminSaveBtn.disabled = false;
  }
}

async function salvaEliminazione() {
  if (!db) {
    setAdminMsg("Supabase non trovato: impossibile salvare.", "error");
    return;
  }

  const turno = Number(adminTurnoInput?.value);
  const teamName = adminSquadraSelect?.value;
  const magicPuntiRaw = adminMagicInput?.value;
  const magicPunti = magicPuntiRaw === "" ? null : Number(magicPuntiRaw);

  if (!turno || turno < 1 || turno > 15) {
    setAdminMsg("Inserisci un turno valido da 1 a 15.", "error");
    return;
  }

  if (!teamName) {
    setAdminMsg("Seleziona una squadra da eliminare.", "error");
    return;
  }

  if (magicPuntiRaw !== "" && Number.isNaN(magicPunti)) {
    setAdminMsg("Inserisci Magic Punti validi.", "error");
    return;
  }

  const team = squadreBase.find(s => s.nome === teamName);

  if (!team) {
    setAdminMsg("Squadra non trovata.", "error");
    return;
  }

  if (adminSaveBtn) {
    adminSaveBtn.disabled = true;
    adminSaveBtn.textContent = "Salvataggio...";
  }

  setAdminMsg("Sto salvando l’eliminazione...", "");

  const payload = {
    season: HIGHLANDER_SEASON,
    turno,
    team_name: team.nome,
    logo: team.logo,
    magic_punti: magicPunti
  };

  const { error } = await db
    .from("highlander_eliminations")
    .upsert(payload, {
      onConflict: "season,turno"
    });

  if (error) {
    console.error(error);

    if (String(error.message || "").includes("highlander_eliminations_season_team_name")) {
      setAdminMsg("Questa squadra risulta già eliminata in un altro turno.", "error");
    } else {
      setAdminMsg("Errore nel salvataggio. Controlla Supabase/RLS.", "error");
    }

    if (adminSaveBtn) {
      adminSaveBtn.disabled = false;
      adminSaveBtn.textContent = "Salva eliminazione";
    }

    return;
  }

  setAdminMsg("Eliminazione salvata. L’arena si aggiorna.", "ok");

  if (adminMagicInput) adminMagicInput.value = "";

  await refreshArena();

  if (adminSaveBtn) {
    adminSaveBtn.disabled = false;
    adminSaveBtn.textContent = "Salva eliminazione";
  }
}

function initAdminEvents() {
  if (adminSaveBtn) {
    adminSaveBtn.addEventListener("click", salvaEliminazione);
  }
}

/* =========================
   RENDER ALL
   ========================= */

function renderAll() {
  buildSquadreState();
  updateStatsAndSubtitle();

  renderCenter();
  renderArenaTeams();
  renderMobileDashboard();
  renderZonaPericolo();
  renderRegistroEliminazioni();
  populateAdminPanel();
}

async function refreshArena() {
  await loadEliminazioni();
  renderAll();
}

/* =========================
   INIT
   ========================= */

async function initHighlanderArena() {
  await refreshArena();

  const isAdmin = await checkIsAdmin();

  if (isAdmin) {
    populateAdminPanel();
    initAdminEvents();
  }
}

initHighlanderArena();
