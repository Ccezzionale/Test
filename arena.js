import { supabase } from './supabase.js';

/* =========================
   HIGHLANDER ARENA - SUPABASE VERSION
   ========================= */

const HIGHLANDER_SEASON = "2026";

const squadreBase = [
  {
    nome: "Rubinkebab",
    logo: "img/Rubinkebab.png",
    mascotte: "img/maglie/rubinkebab-mascotte.webp",
    highlander: "img/maglie/rubinkebab-higlander.webp"
  },
  {
    nome: "Bayern Christiansen",
    logo: "img/Bayern Christiansen.png",
    mascotte: "img/maglie/bayern-mascotte.webp",
    highlander: "img/maglie/bayern-higlander.webp"
  },
  {
    nome: "Team Bartowski",
    logo: "img/Team Bartowski.png",
    mascotte: "img/maglie/bartowski-mascotte.webp",
    highlander: "img/maglie/bartowski-higlander.webp"
  },
  {
    nome: "Golden Knights",
    logo: "img/Golden Knights.png",
    mascotte: "img/maglie/golden-mascotte.webp",
    highlander: "img/maglie/golden-higlander.webp"
  },
  {
    nome: "Ibla",
    logo: "img/Ibla.png",
    mascotte: "img/maglie/ibla-mascotte.webp",
    highlander: "img/maglie/ibla-higlander.webp"
  },
  {
    nome: "Fantaugusta",
    logo: "img/Fantaugusta.png",
    mascotte: "img/maglie/fantaugusta-mascotte.webp",
    highlander: "img/maglie/fantaugusta-higlander.webp"
  },
  {
    nome: "Riverfilo",
    logo: "img/Riverfilo.png",
    mascotte: "img/maglie/riverfilo-mascotte.webp",
    highlander: "img/maglie/riverfilo-higlander.webp"
  },
  {
    nome: "Desperados",
    logo: "img/Desperados.png",
    mascotte: "img/maglie/desperados-mascotte.webp",
    highlander: "img/maglie/desperados-higlander.webp"
  },
  {
    nome: "Wildboys 78",
    logo: "img/wildboys78.png",
    mascotte: "img/maglie/wildboys-mascotte.webp",
    highlander: "img/maglie/wildboys-higlander.webp"
  },
  {
    nome: "Pandinicoccolosini",
    logo: "img/Pandinicoccolosini.png",
    mascotte: "img/maglie/pandini-mascotte.webp",
    highlander: "img/maglie/pandini-higlander.webp"
  },
  {
    nome: "Pokermantra",
    logo: "img/PokerMantra.png",
    mascotte: "img/maglie/pokermantra-mascotte.webp",
    highlander: "img/maglie/pokermantra-higlander.webp"
  },
  {
    nome: "Minnesode Timberland",
    logo: "img/Minnesode Timberland.png",
    mascotte: "img/maglie/minnesode-mascotte.webp",
    highlander: "img/maglie/minnesode-higlander.webp"
  },
  {
    nome: "Minnesota Snakes",
    logo: "img/MinneSota Snakes.png",
    mascotte: "img/maglie/snakes-mascotte.webp",
    highlander: "img/maglie/minnesota-higlander.webp"
  },
  {
    nome: "Eintracht Franco 126",
    logo: "img/Eintracht Franco 126.png",
    mascotte: "img/maglie/franco-mascotte.webp",
    highlander: "img/maglie/franco-higlander.webp"
  },
  {
    nome: "FC Disoneste",
    logo: "img/FC Disoneste.png",
    mascotte: "img/maglie/disoneste-mascotte.webp",
    highlander: "img/maglie/disoneste-higlander.webp"
  },
  {
    nome: "Athletic Pongao",
    logo: "img/Athletic Pongao.png",
    mascotte: "img/maglie/pongao-mascotte.webp",
    highlander: "img/maglie/pongao-higlander.webp"
  }
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
const adminRiskTeam1 = document.getElementById("admin-risk-team-1");
const adminRiskTeam2 = document.getElementById("admin-risk-team-2");
const adminRiskTeam3 = document.getElementById("admin-risk-team-3");

const adminRiskPoints1 = document.getElementById("admin-risk-points-1");
const adminRiskPoints2 = document.getElementById("admin-risk-points-2");
const adminRiskPoints3 = document.getElementById("admin-risk-points-3");
const adminResetBtn = document.getElementById("admin-reset-highlander");

/* =========================
   SUPABASE HELPER
   ========================= */

const db = supabase;

function getTeamImage(team) {
  if (!team) return "";

  return team.eliminata ? team.highlander : team.mascotte;
}

function escapeAttr(value = "") {
  return String(value).replace(/"/g, "&quot;");
}

function buildImgHtml(team, className = "") {
  const src = escapeAttr(getTeamImage(team));
  const alt = escapeAttr(team?.nome || "");

  return `<img src="${src}" class="${className}" alt="${alt}" />`;
}

function setTeamImage(img, team) {
  if (!img || !team) return;

  img.src = getTeamImage(team);
  img.alt = team.nome;
}

/* =========================
   DATA
   ========================= */
async function resetHighlander() {
  if (!db) {
    setAdminMsg("Supabase non trovato: impossibile resettare.", "error");
    return;
  }

  const conferma = confirm(
    "Vuoi davvero resettare la Highlander Cup?\n\nQuesta azione cancellerà tutte le eliminazioni salvate per questa stagione."
  );

  if (!conferma) return;

  if (adminResetBtn) {
    adminResetBtn.disabled = true;
    adminResetBtn.textContent = "Reset in corso...";
  }

  setAdminMsg("Sto resettando l’arena...", "");

  const { error } = await db
    .from("highlander_eliminations")
    .delete()
    .eq("season", HIGHLANDER_SEASON);

  if (error) {
    console.error(error);
    setAdminMsg("Errore durante il reset. Controlla Supabase/RLS.", "error");

    if (adminResetBtn) {
      adminResetBtn.disabled = false;
      adminResetBtn.textContent = "Reset Highlander";
    }

    return;
  }

  if (adminMagicInput) adminMagicInput.value = "";

  if (adminRiskTeam1) adminRiskTeam1.value = "";
  if (adminRiskTeam2) adminRiskTeam2.value = "";
  if (adminRiskTeam3) adminRiskTeam3.value = "";

  if (adminRiskPoints1) adminRiskPoints1.value = "";
  if (adminRiskPoints2) adminRiskPoints2.value = "";
  if (adminRiskPoints3) adminRiskPoints3.value = "";

  setAdminMsg("Reset completato. L’arena è tornata al turno 1.", "ok");

  await refreshArena();

  if (adminResetBtn) {
    adminResetBtn.disabled = false;
    adminResetBtn.textContent = "Reset Highlander";
  }
}

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
  mascotte: team.mascotte,
  highlander: team.highlander,
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
        ${buildImgHtml(vincitore, "eliminata-logo vincitore-logo")}
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
        ${buildImgHtml(ultimaEliminata, "eliminata-logo ultimo-logo")}
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

const cx = 450;
const cy = 450;
const r = 350;

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
    setTeamImage(img, s);

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
      ${buildImgHtml(ultimaEliminata, "mobile-verdict-logo")}
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
      ${buildImgHtml(s)}
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
        ${buildImgHtml(vincitore)}
        <div>
          <span class="mini-label">Campione dell’Arena</span>
          <h3>${vincitore.nome}</h3>
          <p>Ha attraversato tutti i turni ed è rimasta l’unica squadra in piedi.</p>
        </div>
      </div>
    `;
    return;
  }

  const latestRow = eliminazioniDb
    .slice()
    .sort((a, b) => Number(b.turno) - Number(a.turno))[0];

  const eliminata = ultimaEliminata || eliminateOrdinate[0];
  const dangerZone = Array.isArray(latestRow?.danger_zone)
    ? latestRow.danger_zone
    : [];

  const sogliaSalvezza = typeof eliminata?.magicPunti === "number"
    ? eliminata.magicPunti + 0.5
    : null;

  if (zonaTitle) zonaTitle.textContent = "Zona Pericolo";

  zonaPericoloEl.innerHTML = `
    <div class="danger-head neutral">
      <div class="danger-icon">🛡️</div>
      <div>
        <span class="mini-label">Soglia salvezza turno ${eliminata?.turnoEliminazione || turnoAttuale}</span>
        <h3>${formatPunti(sogliaSalvezza)} MP</h3>
        <p>
          ${eliminata?.nome || "La squadra eliminata"} è caduta con ${formatPunti(eliminata?.magicPunti)} MP.
          Bastava mezzo punto in più per restare nell’arena.
        </p>
      </div>
    </div>

    <div class="danger-table">
      ${
        dangerZone.length
          ? dangerZone.map((s, index) => `
              <div class="danger-row ${index === 0 ? "safe-line" : ""}">
                <span>${index === 0 ? "Prima salva" : "A rischio"}</span>
                <strong>${s.team_name}</strong>
                <em>${formatPunti(s.magic_punti)} MP</em>
              </div>
            `).join("")
          : `
              <div class="danger-row">
                <span>Squadre a rischio</span>
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
        ${buildImgHtml(s)}
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

  adminTurnoInput.value = prossimoTurno <= squadreBase.length - 1
    ? prossimoTurno
    : squadreBase.length - 1;

  const squadreSelezionabili = squadre.filter(s => !s.eliminata);

  adminSquadraSelect.innerHTML = squadreSelezionabili.map(s => `
    <option value="${s.nome}">${s.nome}</option>
  `).join("");

  const riskSelects = [
    adminRiskTeam1,
    adminRiskTeam2,
    adminRiskTeam3
  ];

  riskSelects.forEach(select => {
    if (!select) return;

    select.innerHTML = `
      <option value="">-- Seleziona squadra --</option>
      ${squadreSelezionabili.map(s => `
        <option value="${s.nome}">${s.nome}</option>
      `).join("")}
    `;
  });

  if (!squadreSelezionabili.length || squadreSelezionabili.length === 1) {
    adminSquadraSelect.innerHTML = `
      <option value="">Torneo concluso</option>
    `;

    riskSelects.forEach(select => {
      if (select) {
        select.innerHTML = `<option value="">Torneo concluso</option>`;
      }
    });

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

const dangerZone = [
  {
    team_name: adminRiskTeam1?.value || "",
    magic_punti: adminRiskPoints1?.value === "" ? null : Number(adminRiskPoints1?.value)
  },
  {
    team_name: adminRiskTeam2?.value || "",
    magic_punti: adminRiskPoints2?.value === "" ? null : Number(adminRiskPoints2?.value)
  },
  {
    team_name: adminRiskTeam3?.value || "",
    magic_punti: adminRiskPoints3?.value === "" ? null : Number(adminRiskPoints3?.value)
  }
]
  .filter(row => row.team_name)
  .map(row => {
    const baseTeam = squadreBase.find(s => s.nome === row.team_name);

    return {
      team_name: row.team_name,
      logo: baseTeam?.logo || "",
      magic_punti: row.magic_punti
    };
  });
   
const payload = {
  season: HIGHLANDER_SEASON,
  turno,
  team_name: team.nome,
  logo: team.logo,
  magic_punti: magicPunti,
  danger_zone: dangerZone
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

/* Pulisce i campi admin dopo il salvataggio */
if (adminMagicInput) adminMagicInput.value = "";

if (adminRiskTeam1) adminRiskTeam1.value = "";
if (adminRiskTeam2) adminRiskTeam2.value = "";
if (adminRiskTeam3) adminRiskTeam3.value = "";

if (adminRiskPoints1) adminRiskPoints1.value = "";
if (adminRiskPoints2) adminRiskPoints2.value = "";
if (adminRiskPoints3) adminRiskPoints3.value = "";

await refreshArena();

if (adminSaveBtn) {
  adminSaveBtn.disabled = false;
  adminSaveBtn.textContent = "Salva eliminazione";
}
}

function initAdminEvents() {
  const saveBtn = document.getElementById("admin-salva-eliminazione");
  const resetBtn = document.getElementById("admin-reset-highlander");

  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.addEventListener("click", salvaEliminazione);
    saveBtn.dataset.bound = "1";
  }

  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.addEventListener("click", resetHighlander);
    resetBtn.dataset.bound = "1";
    console.log("✅ Bottone Reset Highlander collegato");
  } else {
    console.warn("⚠️ Bottone Reset Highlander non trovato");
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
