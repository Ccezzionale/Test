// =========================================================
// ALL STAR GAME 2027 - SUPABASE EDITION
// Voti reali + Top 5 per Conference + 10 auto-pick + Draft dinamico
// Regola: chi vince fa iniziare il draft alla Conference opposta.
// =========================================================

import { supabase } from "./supabase.js";

// Consente all'HTML di riconoscere anche un errore di importazione del modulo.
window.__allstarModuleStarted = true;

const SEASON = 2027;
const ALLSTAR_CLIENT_VERSION = "20261030-allstar-chibi-final-v2";
// Questa identificazione raggruppa solo gli eventi di una singola apertura pagina.
const diagnosticPageInstance = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
  ? crypto.randomUUID()
  : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
      const n = Math.floor(Math.random() * 16);
      return (ch === "x" ? n : (n & 3 | 8)).toString(16);
    });
let diagnosticEventCount = 0;
let simulatedTeamId = null;
let allstarInitialLoadOk = true;

const TOTAL_PLAYERS = 46;
const PLAYERS_PER_TEAM = 23;
const AUTO_PICK_COUNT = 10;


const ALLSTAR_MASCOT_ASSETS = {
  generic: "assets/allstar-mascots/generic.webp",
  malen: "assets/allstar-mascots/malen.webp",
  lautaro: "assets/allstar-mascots/lautaro.webp",
  mctominay: "assets/allstar-mascots/mctominay.webp",
  calhanoglu: "assets/allstar-mascots/calhanoglu.webp",
  nicopaz: "assets/allstar-mascots/nicopaz.webp",
  debruyne: "assets/allstar-mascots/debruyne.webp",
  raimondo: "assets/allstar-mascots/raimondo.webp",
  rabiot: "assets/allstar-mascots/rabiot.webp?v=allstar-final-v2",
  dimarco: "assets/allstar-mascots/dimarco.webp?v=allstar-final-v2"
};

const ALLSTAR_PLAYER_MASCOTS = [
  { tokens: ["malen"], asset: ALLSTAR_MASCOT_ASSETS.malen, title: "Malen" },
  { tokens: ["lautaro", "martinez l", "martinez"], asset: ALLSTAR_MASCOT_ASSETS.lautaro, title: "Lautaro Martinez" },
  { tokens: ["mctominay"], asset: ALLSTAR_MASCOT_ASSETS.mctominay, title: "McTominay" },
  { tokens: ["calhanoglu", "çalhanoğlu"], asset: ALLSTAR_MASCOT_ASSETS.calhanoglu, title: "Calhanoglu" },
  { tokens: ["nico paz", "paz n", "paz"], asset: ALLSTAR_MASCOT_ASSETS.nicopaz, title: "Nico Paz" },
  { tokens: ["de bruyne", "debruyne"], asset: ALLSTAR_MASCOT_ASSETS.debruyne, title: "De Bruyne" },
  { tokens: ["raimondo"], asset: ALLSTAR_MASCOT_ASSETS.raimondo, title: "Raimondo" },
  { tokens: ["rabiot"], asset: ALLSTAR_MASCOT_ASSETS.rabiot, title: "Rabiot" },
  { tokens: ["dimarco", "di marco"], asset: ALLSTAR_MASCOT_ASSETS.dimarco, title: "Dimarco" }
];
const ALLSTAR_TIME_ZONE = "Europe/Brussels";
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

const VOTE_SLOT_CONFIG = [
  { inputId: "vote10", slot: "first", points: 10 },
  { inputId: "vote5", slot: "second", points: 5 },
  { inputId: "vote3", slot: "third", points: 3 },
  { inputId: "vote2", slot: "fourth", points: 2 },
  { inputId: "vote1", slot: "fifth", points: 1 }
];

const CONFERENCE_LEAGUE = "Conference League";
const CONFERENCE_CHAMPIONSHIP = "Conference Championship";

let currentUser = null;
let currentProfile = null;
let currentTeam = null;
let isAdmin = false;

let players = [];
let allPlayersById = new Map();
let playerIdAliasMap = new Map();
let teamsById = new Map();
let state = defaultState();
let stateLoaded = false;
let allstarReadyToVote = false;
let picks = [];
let votes = [];
let mobileLiveConference = CONFERENCE_LEAGUE;

const els = {
  hamburger: document.getElementById("hamburger"),
  navMenu: document.getElementById("navMenu") || document.getElementById("mainMenu"),

  draftStatusLabel: document.getElementById("draftStatusLabel"),
  activeWeekInfo: document.getElementById("activeWeekInfo"),
  voteWeekPill: document.getElementById("voteWeekPill"),
  leagueVoteLeaderInfo: document.getElementById("leagueVoteLeaderInfo"),
  champVoteLeaderInfo: document.getElementById("champVoteLeaderInfo"),
  voterConference: document.getElementById("voterConference"),
  voteForm: document.getElementById("voteForm"),
  vote10: document.getElementById("vote10"),
  vote5: document.getElementById("vote5"),
  vote3: document.getElementById("vote3"),
  vote2: document.getElementById("vote2"),
  vote1: document.getElementById("vote1"),
  voteFeedback: document.getElementById("voteFeedback"),
  voteCountdownLabel: document.getElementById("voteCountdownLabel"),
  voteCountdownValue: document.getElementById("voteCountdownValue"),

  leagueWeekStarName: document.getElementById("leagueWeekStarName"),
  leagueWeekStarDetails: document.getElementById("leagueWeekStarDetails"),
  champWeekStarName: document.getElementById("champWeekStarName"),
  champWeekStarDetails: document.getElementById("champWeekStarDetails"),

  leagueVoteRankingList: document.getElementById("leagueVoteRankingList"),
  champVoteRankingList: document.getElementById("champVoteRankingList"),
  autoPickPreview: document.getElementById("autoPickPreview"),
  autoPickPreviewBroadcast: document.getElementById("autoPickPreviewBroadcast"),
  demoVotesBtn: document.getElementById("demoVotesBtn"),
  resetVotesBtn: document.getElementById("resetVotesBtn"),
  adminResetVotesBtn: document.getElementById("adminResetVotesBtn"),
  generateAutoPicksBtn: document.getElementById("generateAutoPicksBtn"),
  winnerConferenceSelect: document.getElementById("winnerConferenceSelect"),
  saveWinnerConferenceBtn: document.getElementById("saveWinnerConferenceBtn"),
  winnerConferenceInfo: document.getElementById("winnerConferenceInfo"),
  firstConferenceInfo: document.getElementById("firstConferenceInfo"),
  startVotingBtn: document.getElementById("startVotingBtn"),
  activeWeekAdminInfo: document.getElementById("activeWeekAdminInfo"),
  votingStatusInfo: document.getElementById("votingStatusInfo"),
  votingStartedInfo: document.getElementById("votingStartedInfo"),
  votingClosedInfo: document.getElementById("votingClosedInfo"),

  currentPickInfo: document.getElementById("currentPickInfo"),
  currentConferenceInfo: document.getElementById("currentConferenceInfo"),
  selectedCountInfo: document.getElementById("selectedCountInfo"),
  leagueCount: document.getElementById("leagueCount"),
  championshipCount: document.getElementById("championshipCount"),
  leagueRoster: document.getElementById("leagueRoster"),
  championshipRoster: document.getElementById("championshipRoster"),
  currentPickBig: document.getElementById("currentPickBig"),
  currentConferenceBig: document.getElementById("currentConferenceBig"),
  lastPicksList: document.getElementById("lastPicksList"),
  playersTbody: document.getElementById("playersTbody"),
  searchInput: document.getElementById("searchInput"),
  roleFilter: document.getElementById("roleFilter"),
  teamFilter: document.getElementById("teamFilter"),
  originFilter: document.getElementById("originFilter"),
  conferenceFilter: document.getElementById("conferenceFilter"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  openPickModalBtn: document.getElementById("openPickModalBtn"),
  pickModal: document.getElementById("pickModal"),
  closePickModalBtn: document.getElementById("closePickModalBtn"),
  modalPickText: document.getElementById("modalPickText"),
  modalSearchInput: document.getElementById("modalSearchInput"),
  modalPlayersList: document.getElementById("modalPlayersList"),
  adminPanel: document.getElementById("adminPanel"),
  adminToggle: document.getElementById("adminToggle"),
  adminBody: document.getElementById("adminBody"),
  adminChevron: document.getElementById("adminChevron"),
  toggleDraftBtn: document.getElementById("toggleDraftBtn"),
  undoPickBtn: document.getElementById("undoPickBtn"),
  resetDraftBtn: document.getElementById("resetDraftBtn"),

  // Mobile UX
  mobileLiveSummary: document.getElementById("mobileLiveSummary"),
  mobileLiveKicker: document.getElementById("mobileLiveKicker"),
  mobileLiveText: document.getElementById("mobileLiveText"),
  mobileLiveChip: document.getElementById("mobileLiveChip"),
  mobileLiveTop5: document.getElementById("mobileLiveTop5"),
  mobileLiveTop5Title: document.getElementById("mobileLiveTop5Title"),
  mobileLiveTop5Week: document.getElementById("mobileLiveTop5Week"),
  mobilePrevPick: document.getElementById("mobilePrevPick"),
  mobilePrevPlayer: document.getElementById("mobilePrevPlayer"),
  mobileNowPick: document.getElementById("mobileNowPick"),
  mobileNowConference: document.getElementById("mobileNowConference"),
  mobileNextPick: document.getElementById("mobileNextPick"),
  mobileNextConference: document.getElementById("mobileNextConference"),
  mobileAutoPicksCard: document.getElementById("mobileAutoPicksCard"),
  toggleAutoPicksBtn: document.getElementById("toggleAutoPicksBtn"),
  coachPreviewSelect: document.getElementById("allstarCoachPreviewSelect"),
  coachPreviewStart: document.getElementById("allstarCoachPreviewStart"),
  coachPreviewStop: document.getElementById("allstarCoachPreviewStop"),
  coachPreviewBar: document.getElementById("allstarCoachPreviewBar"),
  coachPreviewName: document.getElementById("allstarCoachPreviewName"),
  diagnosticsTeamFilter: document.getElementById("allstarDiagTeamFilter"),
  diagnosticsRefresh: document.getElementById("allstarDiagRefresh"),
  diagnosticsStatus: document.getElementById("allstarDiagStatus"),
  diagnosticsRows: document.getElementById("allstarDiagRows")
};

// Non tracciare mai password, token, URL completi o messaggi di errore grezzi.
function getDiagnosticCode(error) {
  if (!error) return null;
  const message = String(error.message || "");
  const timeout = /^Timeout caricamento (.+)$/.exec(message);
  const code = timeout ? `timeout_${timeout[1]}` : String(error.code || error.name || "unknown_error");
  return code.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

function logAllstarDiagnostic(eventName, level = "info", error = null) {
  if (diagnosticEventCount >= 24) return;
  diagnosticEventCount += 1;
  const pwa = Boolean(window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true);
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || "");
  const payload = {
    season: SEASON,
    page_instance: diagnosticPageInstance,
    event_name: eventName,
    level,
    client_version: ALLSTAR_CLIENT_VERSION,
    client_mode: pwa ? "pwa" : "browser",
    device_class: mobile ? "mobile" : "desktop",
    observed_week: stateLoaded ? state.activeWeek : null,
    diagnostic_code: getDiagnosticCode(error),
    user_id: currentUser?.id || null,
    team_id: currentProfile?.team_id || null,
    simulated_team_id: isAdmin && simulatedTeamId ? simulatedTeamId : null
  };
  // Un errore nella telemetria non deve bloccare la pagina o creare un loop.
  try {
    Promise.resolve(supabase.from("allstar_client_diagnostics").insert(payload))
      .then(({ error: insertError }) => {
        if (insertError) console.warn("All Star: diagnostica non inviata", insertError.code);
      })
      .catch(() => {});
  } catch (_) { /* mai bloccare il caricamento */ }
}


function getMascotEntryForPlayer(player) {
  if (!player?.name) return null;
  const key = normalizeTextKey(player.name).replace(/[.]/g, "").trim();
  const club = normalizeTextKey(player.serieATeam);

  // Distinguiamo i nomi abbreviati del listone: Martinez L. e Paz N.
  // Evita di assegnare il personaggio a un omonimo della stessa Serie A.
  if ((key === "martinez l" || key === "lautaro martinez" || key === "martinez lautaro" || key === "lautaro") && club === "inter") {
    return ALLSTAR_PLAYER_MASCOTS.find((entry) => entry.title === "Lautaro Martinez");
  }
  if ((key === "paz n" || key === "nico paz" || key === "paz nico") && club === "como") {
    return ALLSTAR_PLAYER_MASCOTS.find((entry) => entry.title === "Nico Paz");
  }

  const simpleKeys = [
    ["malen", "Malen"], ["mctominay", "McTominay"],
    ["calhanoglu", "Calhanoglu"], ["de bruyne", "De Bruyne"],
    ["debruyne", "De Bruyne"], ["raimondo", "Raimondo"],
    ["rabiot", "Rabiot"], ["dimarco", "Dimarco"],
    ["di marco", "Dimarco"]
  ];
  const hit = simpleKeys.find(([token]) => key === token || key.startsWith(token + " ") || key.endsWith(" " + token));
  return hit ? ALLSTAR_PLAYER_MASCOTS.find((entry) => entry.title === hit[1]) : null;
}

function getMascotAssetForPlayer(player) {
  return getMascotEntryForPlayer(player)?.asset || ALLSTAR_MASCOT_ASSETS.generic;
}

function getMascotTitleForPlayer(player) {
  return getMascotEntryForPlayer(player)?.title || player?.name || "Eroe All-Star";
}

function getPlayerInitials(player) {
  const name = String(player?.name || "Eroe").trim();
  const parts = name.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || "E") + (parts[1]?.[0] || "");
}

function renderMascotAvatar(player, extraClass = "") {
  const src = getMascotAssetForPlayer(player);
  const title = getMascotTitleForPlayer(player);
  return `<span class="allstar-avatar ${extraClass}"><img src="${escapeAttr(src)}" alt="${escapeAttr(title)}" loading="lazy"><span class="allstar-avatar-glow"></span></span>`;
}

function updateVoteSlotHero(targetId) {
  const root = document.querySelector(`[data-vote-hero="${targetId}"]`);
  const input = document.getElementById(targetId);
  if (!root || !input) return;
  const media = root.querySelector('.vote-slot-hero-media');
  const copy = root.querySelector('.vote-slot-hero-copy');
  const player = players.find((item) => String(item.id) === String(input.value));
  if (!player) {
    root.classList.remove('is-selected');
    if (media) media.innerHTML = '<span class="vote-slot-hero-empty">★</span>';
    if (copy) copy.innerHTML = '<strong>Nessun eroe selezionato</strong><small>Seleziona un giocatore per vedere la sua mascotte All-Star.</small>';
    return;
  }
  root.classList.add('is-selected');
  if (media) media.innerHTML = `<img src="${escapeAttr(getMascotAssetForPlayer(player))}" alt="${escapeAttr(getMascotTitleForPlayer(player))}" loading="lazy">`;
  if (copy) copy.innerHTML = `<strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.role)} · ${escapeHtml(player.serieATeam)} · Q. ${escapeHtml(player.quotation ?? '-')}</small>`;
}

function updateAllVoteSlotHeroes() {
  VOTE_SLOT_CONFIG.forEach((config) => updateVoteSlotHero(config.inputId));
}

function getViewingTeam() {
  return simulatedTeamId ? (teamsById.get(simulatedTeamId) || null) : currentTeam;
}

window.addEventListener("error", (event) => {
  logAllstarDiagnostic("js_error", "error", event.error || { name: "script_error" });
});
window.addEventListener("unhandledrejection", (event) => {
  logAllstarDiagnostic("js_rejection", "error", event.reason || { name: "unhandled_rejection" });
});

init();

async function init() {
  bindEvents();
  setupVotePickers();
  updateAllVoteSlotHeroes();
  setLoadingUI();
  logAllstarDiagnostic("page_open");

  // Lo stato della votazione deve comparire anche quando login, profilo,
  // giocatori o voti sono lenti/indisponibili. Non bloccarlo dietro getSession().
  const stateTask = withLoadTimeout(loadState(), 10000, "stato All Star")
    .then(() => {
      renderPublicAllstarStatus();
      logAllstarDiagnostic("state_ok");
    })
    .catch((error) => {
      allstarInitialLoadOk = false;
      logAllstarDiagnostic("state_error", "error", error);
      console.error("All Star: errore lettura stato:", error);
      showLoadIssue("Impossibile leggere lo stato delle votazioni. Ricarica la pagina; se il problema continua, avvisa l'amministratore.");
    });

  const profileTask = withLoadTimeout(loadSessionAndProfile(), 10000, "sessione utente")
    .then(() => logAllstarDiagnostic(currentUser ? "auth_ok" : "auth_missing", currentUser ? "info" : "warning"))
    .catch((error) => {
      allstarInitialLoadOk = false;
      logAllstarDiagnostic("auth_error", "error", error);
      console.warn("All Star: profilo non caricato:", error);
      currentProfile = null;
      currentTeam = null;
      isAdmin = false;
      showLoadIssue("Non è stato possibile verificare il tuo login. Le votazioni sono visibili, ma per inviare i voti potrebbe essere necessario rientrare nell'app.");
    });

  await Promise.all([stateTask, profileTask]);
  setupUserControls();

  // Carichiamo separatamente i dati non essenziali: un errore su una tabella
  // non deve più lasciare per sempre Week 1 / Votazioni chiuse.
  const teamResult = await withLoadTimeout(loadTeams(), 12000, "squadre")
    .then(() => true)
    .catch((error) => {
      allstarInitialLoadOk = false;
      logAllstarDiagnostic("teams_error", "error", error);
      console.error("All Star: errore caricamento squadre:", error);
      showLoadIssue("Non è stato possibile caricare le squadre. Ricarica la pagina per poter votare.");
      return false;
    });

  // La conference e le opzioni di anteprima dipendono dalla tabella squadre.
  if (teamResult) setupUserControls();

  const playerResult = await withLoadTimeout(loadPlayers(), 12000, "giocatori")
    .then(() => true)
    .catch((error) => {
      allstarInitialLoadOk = false;
      logAllstarDiagnostic("players_error", "error", error);
      console.error("All Star: errore caricamento giocatori:", error);
      showLoadIssue("Non è stato possibile caricare il listone dei giocatori. Ricarica la pagina per poter votare.");
      return false;
    });

  // Prima players, poi votes/picks: gli ID dei giocatori salvati hanno bisogno
  // della mappa del listone per ricostruire nomi e classifiche.
  const [votesResult, picksResult] = await Promise.allSettled([
    withLoadTimeout(loadVotes(), 12000, "voti"),
    withLoadTimeout(loadPicks(), 12000, "pick")
  ]);

  if (votesResult.status === "rejected") {
    allstarInitialLoadOk = false;
    logAllstarDiagnostic("votes_error", "error", votesResult.reason);
    console.error("All Star: errore caricamento voti:", votesResult.reason);
    showLoadIssue("Classifiche dei voti momentaneamente non disponibili. Ricarica la pagina.");
  }
  if (picksResult.status === "rejected") {
    allstarInitialLoadOk = false;
    logAllstarDiagnostic("picks_error", "error", picksResult.reason);
    console.error("All Star: errore caricamento draft:", picksResult.reason);
    showLoadIssue("Dati del draft momentaneamente non disponibili. Ricarica la pagina.");
  }

  allstarReadyToVote = Boolean(
    stateLoaded && teamResult && playerResult &&
    votesResult.status === "fulfilled" && currentTeam?.id
  );
  updateVoteSubmitAvailability();
  populateFilters();
  hydrateVotePickersFromSavedVotes();
  if (stateLoaded) renderAll();
  logAllstarDiagnostic(allstarInitialLoadOk && allstarReadyToVote ? "init_ok" : "init_partial", allstarInitialLoadOk && allstarReadyToVote ? "info" : "warning");
  if (isAdmin) refreshAllstarDiagnostics();

  subscribeRealtime();
  startAutoWeekTicker();
  startAllstarStateRefresh();
}

function withLoadTimeout(promise, milliseconds, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Timeout caricamento ${label}`)), milliseconds))
  ]);
}

function showLoadIssue(message) {
  const notice = document.getElementById("allstarLoadNotice");
  if (!notice) return;
  notice.hidden = false;
  const text = notice.querySelector("[data-allstar-load-message]");
  if (text) text.textContent = message;
}

function updateVoteSubmitAvailability() {
  const submit = els.voteForm?.querySelector('[type="submit"]');
  if (submit) submit.disabled = !allstarReadyToVote || Boolean(simulatedTeamId);
}

function renderPublicAllstarStatus() {
  if (!stateLoaded) return;
  setText(els.draftStatusLabel, getAllStarStatusLabel());
  setText(els.activeWeekInfo, `Week ${state.activeWeek}`);
  setText(els.voteWeekPill, `Week ${state.activeWeek}`);
  setText(els.mobileLiveTop5Week, `Week ${state.activeWeek}`);
  renderMobileLiveSummary();
  updateVoteCountdown();
}

function startAllstarStateRefresh() {
  // Poll leggero di sicurezza se la connessione Realtime cade sul telefono.
  setInterval(async () => {
    try {
      await withLoadTimeout(loadState(), 10000, "stato All Star");
      renderAll();
    } catch (error) {
      logAllstarDiagnostic("refresh_error", "warning", error);
      console.warn("All Star: sincronizzazione stato non riuscita:", error);
      if (!stateLoaded) showLoadIssue("Stato delle votazioni non disponibile. Controlla la connessione e ricarica la pagina.");
    }
  }, 90000);
}

function bindEvents() {
  els.hamburger?.addEventListener("click", () => {
    els.navMenu?.classList.toggle("open");
  });

  els.voteForm?.addEventListener("submit", handleVoteSubmit);
  els.toggleAutoPicksBtn?.addEventListener("click", toggleMobileAutoPicks);
  document.querySelectorAll("[data-live-conference]").forEach((button) => {
    button.addEventListener("click", () => {
      const conference = button.dataset.liveConference;
      if (!isValidConference(conference)) return;
      mobileLiveConference = conference;
      renderMobileVoteTop5();
    });
  });
  els.demoVotesBtn?.addEventListener("click", () => alert("I voti demo sono stati disattivati: ora la pagina usa Supabase."));
  els.resetVotesBtn?.addEventListener("click", resetVotes);
  els.adminResetVotesBtn?.addEventListener("click", resetVotes);
  els.generateAutoPicksBtn?.addEventListener("click", generateAutoPicksFromVotes);
  els.saveWinnerConferenceBtn?.addEventListener("click", saveWinnerConferenceFromAdmin);
  els.startVotingBtn?.addEventListener("click", startAllStarVoting);

[els.searchInput, els.roleFilter, els.teamFilter].forEach((el) => {
  el?.addEventListener("input", renderPool);
  el?.addEventListener("change", renderPool);
});

els.clearFiltersBtn?.addEventListener("click", () => {
  els.searchInput.value = "";
  els.roleFilter.value = "";
  els.teamFilter.value = "";
  renderPool();
});

  els.openPickModalBtn?.addEventListener("click", openPickModal);
  els.closePickModalBtn?.addEventListener("click", () => els.pickModal?.close());
  els.modalSearchInput?.addEventListener("input", renderModalPlayers);

  els.adminToggle?.addEventListener("click", () => {
    els.adminBody.classList.toggle("open");
    els.adminChevron.textContent = els.adminBody.classList.contains("open") ? "⌃" : "⌄";
  });

  els.toggleDraftBtn?.addEventListener("click", toggleDraftOpen);
  els.undoPickBtn?.addEventListener("click", undoLastPick);
  els.resetDraftBtn?.addEventListener("click", resetDraft);
  els.coachPreviewStart?.addEventListener("click", startCoachPreview);
  els.coachPreviewStop?.addEventListener("click", stopCoachPreview);
  els.diagnosticsRefresh?.addEventListener("click", refreshAllstarDiagnostics);
  els.diagnosticsTeamFilter?.addEventListener("change", refreshAllstarDiagnostics);
}

function setLoadingUI() {
  if (els.playersTbody) els.playersTbody.innerHTML = `<tr><td colspan="7">Caricamento dati All Star...</td></tr>`;
  setText(els.draftStatusLabel, "Caricamento...");
  setText(els.activeWeekInfo, "Caricamento...");
  setText(els.voteWeekPill, "...");
  setText(els.mobileLiveTop5Week, "...");
  setText(els.mobileLiveKicker, "ALL STAR GAME");
  setText(els.mobileLiveText, "Sincronizzazione votazioni...");
  setText(els.mobileLiveChip, "ATTESA");
  if (els.adminPanel) els.adminPanel.style.display = "none";
  const adminTab = document.querySelector('[data-allstar-tab="admin"]');
  if (adminTab) adminTab.style.display = "none";
  if (els.openPickModalBtn) els.openPickModalBtn.disabled = true;
  updateVoteSubmitAvailability();
}

async function loadSessionAndProfile() {
  // Non usare getUser() come primo controllo: senza sessione genera
  // AuthSessionMissingError e blocca anche il caricamento dei giocatori.
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) {
    console.warn("Errore lettura sessione All Star:", sessionError);
  }

  currentUser = sessionData?.session?.user || null;
  currentProfile = null;
  currentTeam = null;
  isAdmin = false;

  // La lista giocatori e le classifiche devono caricarsi anche senza sessione.
  // Il controllo login resta necessario soltanto quando si prova a votare.
  if (!currentUser) return;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, team_id, role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  currentProfile = profile;
  isAdmin = ["admin", "commissioner"].includes(String(profile?.role || "").toLowerCase());
}

async function loadAllData() {
  await loadTeams();

  // IMPORTANT:
  // players must be loaded before votes and picks.
  // Votes/picks need playerIdAliasMap and allPlayersById to rebuild old saved picks
  // after the deduplication of the All Star player pool.
  await loadPlayers();

  await Promise.all([loadState(), loadVotes(), loadPicks()]);
}

async function loadTeams() {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, conference")
    .order("name", { ascending: true });

  if (error) throw error;

  teamsById = new Map((data || []).map((team) => [team.id, team]));
  currentTeam = currentProfile?.team_id ? teamsById.get(currentProfile.team_id) : null;
  populateAllstarAdminTeamLists();
}

async function loadState() {
  const { data, error } = await supabase
    .from("allstar_state")
    .select("season, voting_open, draft_open, active_week, winner_conference, first_conference, current_pick, voting_started_at, voting_closed_at")
    .eq("season", SEASON)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Stato All Star non restituito da Supabase: controllare sessione e permessi RLS.");
  state = normalizeState(data);
  stateLoaded = true;
}

async function loadPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("id, name, role, role_mantra, serie_a_team, quotation, status, pool")
    .eq("status", "active")
    .eq("pool", "conference_championship")
    .order("name", { ascending: true });

  if (error) throw error;

  players = (data || [])
    .map((raw) => ({
      id: raw.id,
      name: raw.name || "",
      role: raw.role || raw.role_mantra || "-",
      roleMantra: raw.role_mantra || "",
      serieATeam: raw.serie_a_team || "-",
      quotation: raw.quotation ?? "-",
      ownerTeamId: null,
      originTeam: "Listone",
      conference: "Listone",
      status: raw.status || "active",
      pool: raw.pool || "quotazioni"
    }))
    .filter((p) => p.name);

  allPlayersById = new Map(players.map((player) => [player.id, player]));
  playerIdAliasMap = new Map(players.map((player) => [player.id, player.id]));
}

async function loadVotes() {
  const { data, error } = await supabase
    .from("allstar_votes")
    .select("id, season, week, voter_team_id, voter_conference, player_id, points, slot, created_at, updated_at")
    .eq("season", SEASON);

  if (error) throw error;
  votes = (data || []).map(normalizeVote);
}

async function loadPicks() {
  const { data, error } = await supabase
    .from("allstar_picks")
    .select("id, season, pick_number, conference, player_id, source, points_total, created_by, created_at")
    .eq("season", SEASON)
    .order("pick_number", { ascending: true });

  if (error) throw error;
  picks = (data || []).map(normalizePick).filter((pick) => pick.player);
}

function normalizePlayer(raw) {
  const ownerTeam = raw.owner_team_id ? teamsById.get(raw.owner_team_id) : null;

  return {
    id: raw.id,
    name: raw.name || "",
    role: raw.role || raw.role_mantra || "-",
    roleMantra: raw.role_mantra || "",
    serieATeam: raw.serie_a_team || "-",
    quotation: raw.quotation ?? "-",
    ownerTeamId: raw.owner_team_id || null,
    originTeam: ownerTeam?.name || "Svincolato",
    conference: ownerTeam?.conference || "Senza Conference",
    status: raw.status || "active",
    pool: raw.pool || null
  };
}

function getPlayerDedupeKey(player) {
  return normalizeTextKey(player.name);
}

function normalizeTextKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getPlayerQualityScore(player) {
  const quotation = Number(player.quotation);
  let score = Number.isFinite(quotation) ? quotation : 0;

  // Prefer the cleaner “quotazioni/listone” row when duplicates come from conference pools.
  if (!player.pool) score += 1000;
  if (String(player.pool || "").toLowerCase() === "quotazioni") score += 900;
  if (String(player.pool || "").toLowerCase() === "allstar") score += 800;
  
// Prefer the owned row, so the player keeps team origine and conference.
if (player.ownerTeamId) score += 100;
  if (player.serieATeam && player.serieATeam !== "-") score += 10;
  if (player.role && player.role !== "-") score += 5;

  return score;
}

function dedupePlayers(rawPlayers, aliasSourcePlayers = rawPlayers) {
  const byKey = new Map();
  playerIdAliasMap = new Map();

  rawPlayers.forEach((player) => {
    const key = getPlayerDedupeKey(player);
    const current = byKey.get(key);

    if (!current || getPlayerQualityScore(player) > getPlayerQualityScore(current)) {
      byKey.set(key, player);
    }
  });

  aliasSourcePlayers.forEach((player) => {
    const canonical = byKey.get(getPlayerDedupeKey(player));
    if (canonical) playerIdAliasMap.set(player.id, canonical.id);
  });

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function getCanonicalPlayerId(playerId) {
  return playerIdAliasMap.get(playerId) || playerId;
}

function getPlayerForStoredId(originalPlayerId, canonicalPlayerId = getCanonicalPlayerId(originalPlayerId)) {
  return (
    players.find((p) => p.id === canonicalPlayerId) ||
    players.find((p) => p.id === originalPlayerId) ||
    allPlayersById.get(originalPlayerId) ||
    allPlayersById.get(canonicalPlayerId) ||
    null
  );
}

function normalizeVote(raw) {
  const canonicalPlayerId = getCanonicalPlayerId(raw.player_id);
  const player = getPlayerForStoredId(raw.player_id, canonicalPlayerId);
  return {
    id: raw.id,
    season: raw.season,
    week: raw.week,
    voterTeamId: raw.voter_team_id,
    voterConference: raw.voter_conference,
    playerId: canonicalPlayerId,
    player,
    points: Number(raw.points || 0),
    slot: raw.slot,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at
  };
}

function normalizePick(raw) {
  const canonicalPlayerId = getCanonicalPlayerId(raw.player_id);
  const player = getPlayerForStoredId(raw.player_id, canonicalPlayerId);
  return {
    id: raw.id,
    season: raw.season,
    pickNumber: Number(raw.pick_number),
    conference: raw.conference,
    playerId: canonicalPlayerId,
    player,
    source: raw.source,
    pointsTotal: raw.points_total,
    createdBy: raw.created_by,
    createdAt: raw.created_at
  };
}

function defaultState() {
  return {
    season: SEASON,
    votingOpen: false,
    isOpen: false,
    activeWeek: 1,
    votingStartedAt: null,
    votingClosedAt: null,
    currentPick: AUTO_PICK_COUNT + 1,
    winnerConference: null,
    firstConference: null
  };
}

function normalizeState(rawState) {
  const base = defaultState();
  const next = {
    ...base,
    season: rawState?.season ?? SEASON,
    votingOpen: rawState?.voting_open ?? rawState?.votingOpen ?? false,
    isOpen: rawState?.draft_open ?? rawState?.isOpen ?? false,
    activeWeek: Number(rawState?.active_week ?? rawState?.activeWeek ?? 1),
    votingStartedAt: rawState?.voting_started_at ?? rawState?.votingStartedAt ?? null,
    votingClosedAt: rawState?.voting_closed_at ?? rawState?.votingClosedAt ?? null,
    currentPick: Number(rawState?.current_pick ?? rawState?.currentPick ?? AUTO_PICK_COUNT + 1),
    winnerConference: rawState?.winner_conference ?? rawState?.winnerConference ?? null,
    firstConference: rawState?.first_conference ?? rawState?.firstConference ?? null
  };

  if (!isValidConference(next.winnerConference)) next.winnerConference = null;
  if (!isValidConference(next.firstConference)) next.firstConference = getOppositeConference(next.winnerConference);

  next.currentPick = Math.max(AUTO_PICK_COUNT + 1, Number(next.currentPick || AUTO_PICK_COUNT + 1));
  next.isOpen = Boolean(next.isOpen && next.firstConference);
  next.votingOpen = next.votingOpen !== false;
  next.activeWeek = getComputedActiveWeek(next);

  return next;
}

function setupUserControls() {
  if (els.voterConference && getViewingTeam()?.conference) {
    els.voterConference.value = getViewingTeam().conference;
    els.voterConference.disabled = true;
  }

  if (els.adminPanel) {
    els.adminPanel.style.display = isAdmin && !simulatedTeamId ? "" : "none";
  }

  const adminMobileTab = document.querySelector('[data-allstar-tab="admin"]');
  if (adminMobileTab) adminMobileTab.style.display = isAdmin && !simulatedTeamId ? "" : "none";

  const mobileTabs = document.querySelector(".mobile-allstar-tabs");
  mobileTabs?.classList.toggle("has-admin", isAdmin && !simulatedTeamId);

  // Il live apre di default sulla Conference dell'utente, ma resta sempre commutabile.
  if (isValidConference(getViewingTeam()?.conference)) {
    mobileLiveConference = getViewingTeam().conference;
  }

  if (els.demoVotesBtn) {
    els.demoVotesBtn.style.display = isAdmin && !simulatedTeamId ? "" : "none";
    els.demoVotesBtn.textContent = "Demo disattivata";
  }

  if (els.resetVotesBtn) els.resetVotesBtn.style.display = isAdmin && !simulatedTeamId ? "" : "none";
  if (els.adminResetVotesBtn) els.adminResetVotesBtn.style.display = isAdmin && !simulatedTeamId ? "" : "none";
}

function populateAllstarAdminTeamLists() {
  if (!isAdmin) return;
  const options = [...teamsById.values()].sort((a, b) => a.name.localeCompare(b.name, "it"));
  const addOptions = (select, placeholder) => {
    if (!select) return;
    const selected = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>` + options.map(team =>
      `<option value="${escapeAttr(team.id)}">${escapeHtml(team.name)}</option>`
    ).join("");
    if ([...select.options].some(option => option.value === selected)) select.value = selected;
  };
  addOptions(els.coachPreviewSelect, "Scegli una squadra");
  addOptions(els.diagnosticsTeamFilter, "Tutte le squadre");
}

function startCoachPreview() {
  if (!isAdmin) return;
  const candidate = els.coachPreviewSelect?.value;
  const team = candidate && teamsById.get(candidate);
  if (!team) {
    alert("Seleziona prima la squadra da simulare.");
    return;
  }
  simulatedTeamId = team.id;
  logAllstarDiagnostic("simulation_on");
  refreshCoachPreview();
  document.querySelector('[data-allstar-tab="vote"]')?.click();
  els.coachPreviewBar?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function stopCoachPreview() {
  if (!isAdmin || !simulatedTeamId) return;
  logAllstarDiagnostic("simulation_off");
  simulatedTeamId = null;
  refreshCoachPreview();
}

function refreshCoachPreview() {
  if (els.coachPreviewBar) els.coachPreviewBar.hidden = !simulatedTeamId;
  if (els.coachPreviewName) els.coachPreviewName.textContent = getViewingTeam()?.name || "";
  if (els.voteFeedback) els.voteFeedback.textContent = "";
  setupUserControls();
  hydrateVotePickersFromSavedVotes();
  updateVoteSubmitAvailability();
  renderAll();
}

async function refreshAllstarDiagnostics() {
  if (!isAdmin || !els.diagnosticsRows) return;
  if (els.diagnosticsStatus) els.diagnosticsStatus.textContent = "Caricamento diagnostica...";
  try {
    let query = supabase.from("allstar_client_diagnostics")
      .select("created_at,event_name,level,client_version,client_mode,device_class,observed_week,diagnostic_code,team_id,simulated_team_id")
      .order("created_at", { ascending: false }).limit(60);
    if (els.diagnosticsTeamFilter?.value) query = query.eq("team_id", els.diagnosticsTeamFilter.value);
    const { data, error } = await withLoadTimeout(query, 10000, "diagnostica");
    if (error) throw error;
    if (els.diagnosticsStatus) els.diagnosticsStatus.textContent = `${(data || []).length} eventi recenti. Se la sessione è assente, la squadra non è identificabile.`;
    els.diagnosticsRows.innerHTML = (data || []).map(event => {
      const team = teamsById.get(event.team_id)?.name || (event.team_id ? "Squadra sconosciuta" : "Sessione non identificata");
      const stamp = new Date(event.created_at).toLocaleString("it-IT", { day:"2-digit", month:"2-digit", hour:"2-digit",minute:"2-digit" });
      const code = event.diagnostic_code ? ` (${escapeHtml(event.diagnostic_code)})` : "";
      return `<tr>
        <td>${escapeHtml(stamp)}</td>
        <td>${escapeHtml(team)}</td>
        <td>${escapeHtml(event.client_mode)} / ${escapeHtml(event.device_class)}</td>
        <td>${escapeHtml(event.event_name)}${code}</td>
        <td>${escapeHtml(event.observed_week ?? "-")}</td>
        <td>${escapeHtml(event.client_version)}</td>
      </tr>`;
    }).join("") || '<tr><td colspan="6">Nessun evento ancora registrato dalla nuova versione.</td></tr>';
  } catch (error) {
    console.warn("All Star: diagnostica non disponibile:", error);
    if (els.diagnosticsStatus) els.diagnosticsStatus.textContent = "Impossibile leggere la diagnostica. Controlla i permessi admin o la connessione.";
  }
}

async function startAllStarVoting() {
  if (!isAdmin || simulatedTeamId) return;

  if (state.votingStartedAt) {
    alert("Il conteggio delle votazioni è già stato avviato. Per ripartire dalla Week 1 usa prima ‘Reset votazioni e timer’.");
    return;
  }

  const ok = confirm("Vuoi iniziare le votazioni All Star? La Week 1 parte adesso e terminerà domenica alle 23:59. Da lunedì inizierà automaticamente la Week 2, poi ogni lunedì una nuova week.");
  if (!ok) return;

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("allstar_state")
    .update({
      voting_started_at: now,
      voting_closed_at: null,
      voting_open: true,
      active_week: 1
    })
    .eq("season", SEASON);

  if (error) {
    alert("Errore avvio votazioni All Star. Controlla colonne SQL/RLS.");
    console.error(error);
    return;
  }

  await refreshAndRender();
}

function populateFilters() {
  const serieATeams = unique(players.map((p) => p.serieATeam)).filter((v) => v !== "-").sort();

  if (els.teamFilter) {
    els.teamFilter.innerHTML = `<option value="">Squadra Serie A</option>` +
      serieATeams.map((team) => `<option value="${escapeAttr(team)}">${escapeHtml(team)}</option>`).join("");
  }
}

function setupVotePickers() {
  document.querySelectorAll("[data-vote-input]").forEach((input) => {
    const targetId = input.dataset.voteInput;
    if (!targetId) return;

    input.addEventListener("input", () => {
      const hidden = document.getElementById(targetId);
      const picker = input.closest(".vote-player-picker");

      if (hidden?.value) {
        hidden.value = "";
        picker?.classList.remove("is-selected");
  updateVoteSlotHero(targetId);
      }

      renderVotePickerResults(targetId, input.value);
    });

    input.addEventListener("focus", () => {
      renderVotePickerResults(targetId, input.value);
    });
  });

  document.querySelectorAll("[data-vote-clear]").forEach((button) => {
    button.addEventListener("click", () => clearVotePicker(button.dataset.voteClear, true));
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest(".vote-player-picker")) return;
    closeAllVotePickerResults();
  });
}

function renderVotePickerResults(targetId, rawQuery) {
  const resultsEl = document.querySelector(`[data-vote-results="${targetId}"]`);
  const metaEl = document.querySelector(`[data-vote-meta="${targetId}"]`);
  if (!resultsEl) return;

  const query = normalizeTextKey(rawQuery || "");
  if (query.length < 2) {
    resultsEl.innerHTML = "";
    resultsEl.classList.remove("open");
    if (metaEl && !document.getElementById(targetId)?.value) {
      metaEl.textContent = "Scrivi almeno 2 lettere: nome, ruolo o squadra Serie A.";
    }
    return;
  }

  const alreadySelected = new Set(
    VOTE_SLOT_CONFIG
      .filter((config) => config.inputId !== targetId)
      .map((config) => document.getElementById(config.inputId)?.value)
      .filter(Boolean)
  );

  const matches = players
    .filter((player) => {
      if (alreadySelected.has(player.id)) return false;
      const haystack = normalizeTextKey(`${player.name} ${player.role} ${player.roleMantra} ${player.serieATeam}`);
      return haystack.includes(query);
    })
    .sort((a, b) => {
      const aName = normalizeTextKey(a.name);
      const bName = normalizeTextKey(b.name);
      const aStarts = aName.startsWith(query) ? 0 : 1;
      const bStarts = bName.startsWith(query) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name);
    })
    .slice(0, 8);

  if (!matches.length) {
    resultsEl.innerHTML = `<div class="vote-player-no-results">Nessun giocatore trovato.</div>`;
    resultsEl.classList.add("open");
    return;
  }

  resultsEl.innerHTML = matches.map((player) => `
    <button type="button" class="vote-player-result" data-vote-result-target="${escapeAttr(targetId)}" data-player-id="${escapeAttr(player.id)}">
      <span>
        <strong>${escapeHtml(player.name)}</strong>
        <small>${escapeHtml(player.role)} · ${escapeHtml(player.serieATeam)}</small>
      </span>
      <em>Q. ${escapeHtml(player.quotation ?? "-")}</em>
    </button>
  `).join("");
  resultsEl.classList.add("open");

  resultsEl.querySelectorAll("[data-player-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectVotePlayer(targetId, button.dataset.playerId, true);
    });
  });
}

function selectVotePlayer(targetId, playerId, focusNext = false) {
  const hidden = document.getElementById(targetId);
  const input = document.querySelector(`[data-vote-input="${targetId}"]`);
  const metaEl = document.querySelector(`[data-vote-meta="${targetId}"]`);
  const resultsEl = document.querySelector(`[data-vote-results="${targetId}"]`);
  const picker = input?.closest(".vote-player-picker");
  const player = players.find((item) => item.id === playerId);

  if (!hidden || !input || !player) return;

  hidden.value = player.id;
  input.value = player.name;
  picker?.classList.add("is-selected");
  updateVoteSlotHero(targetId);
  if (metaEl) metaEl.textContent = `${player.role} · ${player.serieATeam} · Q. ${player.quotation ?? "-"}`;
  if (resultsEl) {
    resultsEl.innerHTML = "";
    resultsEl.classList.remove("open");
  }

  if (focusNext) {
    const index = VOTE_SLOT_CONFIG.findIndex((config) => config.inputId === targetId);
    const next = VOTE_SLOT_CONFIG[index + 1];
    if (next) {
      const nextInput = document.querySelector(`[data-vote-input="${next.inputId}"]`);
      window.setTimeout(() => nextInput?.focus(), 80);
    }
  }
}

function clearVotePicker(targetId, focusInput = false) {
  const hidden = document.getElementById(targetId);
  const input = document.querySelector(`[data-vote-input="${targetId}"]`);
  const metaEl = document.querySelector(`[data-vote-meta="${targetId}"]`);
  const resultsEl = document.querySelector(`[data-vote-results="${targetId}"]`);
  const picker = input?.closest(".vote-player-picker");

  if (hidden) hidden.value = "";
  if (input) input.value = "";
  picker?.classList.remove("is-selected");
  updateVoteSlotHero(targetId);
  if (metaEl) metaEl.textContent = "Scrivi almeno 2 lettere: nome, ruolo o squadra Serie A.";
  if (resultsEl) {
    resultsEl.innerHTML = "";
    resultsEl.classList.remove("open");
  }
  if (focusInput) input?.focus();
}

function closeAllVotePickerResults() {
  document.querySelectorAll("[data-vote-results]").forEach((resultsEl) => {
    resultsEl.innerHTML = "";
    resultsEl.classList.remove("open");
  });
}

function hydrateVotePickersFromSavedVotes() {
  VOTE_SLOT_CONFIG.forEach((config) => clearVotePicker(config.inputId));
  updateAllVoteSlotHeroes();
  if (!getViewingTeam()?.id) return;

  const slotToInput = new Map(VOTE_SLOT_CONFIG.map((config) => [config.slot, config.inputId]));
  votes
    .filter((vote) => vote.week === state.activeWeek && vote.voterTeamId === getViewingTeam().id)
    .forEach((vote) => {
      const inputId = slotToInput.get(vote.slot);
      if (inputId && vote.playerId) selectVotePlayer(inputId, vote.playerId, false);
    });
  updateAllVoteSlotHeroes();
}

async function handleVoteSubmit(event) {
  event.preventDefault();

  if (simulatedTeamId) {
    showVoteFeedback("Modalità test: nessun voto può essere inviato. Premi Esci dalla simulazione per tornare al tuo account.", true);
    return;
  }

  if (!allstarReadyToVote) {
    showVoteFeedback("I dati del voto non sono ancora pronti. Controlla il login e ricarica la pagina.", true);
    return;
  }

  if (!canVoteNow()) {
    showVoteFeedback(getVotingClosedMessage(), true);
    return;
  }

  if (!currentTeam?.id || !currentTeam?.conference) {
    showVoteFeedback("Non riesco a trovare la tua squadra/profilo. Controlla il login.", true);
    return;
  }

  const selected = VOTE_SLOT_CONFIG.map((config) => ({
    playerId: document.getElementById(config.inputId)?.value || "",
    points: config.points,
    slot: config.slot
  }));

  if (selected.some((v) => !v.playerId)) {
    showVoteFeedback("Seleziona tutti e cinque i giocatori.", true);
    return;
  }

  const uniqueIds = new Set(selected.map((v) => v.playerId));
  if (uniqueIds.size !== 5) {
    showVoteFeedback("Devi scegliere cinque giocatori diversi.", true);
    return;
  }

  const rows = selected.map((vote) => ({
    season: SEASON,
    week: state.activeWeek,
    voter_team_id: currentTeam.id,
    voter_conference: currentTeam.conference,
    player_id: vote.playerId,
    points: vote.points,
    slot: vote.slot
  }));

  const { error } = await supabase
    .from("allstar_votes")
    .upsert(rows, { onConflict: "season,week,voter_team_id,slot" });

  if (error) {
    console.error("Errore salvataggio voti:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
    showVoteFeedback("Non riesco a salvare il voto. Controlla la configurazione SQL della tabella All Star.", true);
    return;
  }

  await loadVotes();
  hydrateVotePickersFromSavedVotes();
  showVoteFeedback(`Voti salvati per ${currentTeam.name}.`);
  renderVotesArea();
}

function showVoteFeedback(message, isError = false) {
  if (!els.voteFeedback) return;
  els.voteFeedback.textContent = message;
  els.voteFeedback.style.color = isError ? "#ff8e9d" : "#35d07f";
}

async function resetVotes() {
  if (!isAdmin || simulatedTeamId) return;

  const ok = confirm(
    "Vuoi cancellare tutti i voti e azzerare il conteggio delle settimane? Dopo il reset dovrai premere ‘Inizia votazioni All Star’ per far partire la Week 1."
  );
  if (!ok) return;

  const { error: votesError } = await supabase
    .from("allstar_votes")
    .delete()
    .eq("season", SEASON);

  if (votesError) {
    alert("Errore reset voti. Controlla RLS/permessi admin.");
    console.error(votesError);
    return;
  }

  const { error: stateError } = await supabase
    .from("allstar_state")
    .update({
      voting_started_at: null,
      voting_closed_at: null,
      voting_open: false,
      active_week: 1
    })
    .eq("season", SEASON);

  if (stateError) {
    alert("I voti sono stati cancellati, ma non sono riuscito ad azzerare il timer delle votazioni. Controlla RLS/permessi admin.");
    console.error(stateError);
    return;
  }

  votes = [];
  await refreshAndRender();
  showVoteFeedback("Votazioni e timer azzerati. La Week 1 partirà quando l’admin darà il via.");
}

function getVoteTotalsByConference(conference) {
  const map = new Map();

  votes
    .filter((vote) => vote.voterConference === conference)
    .forEach((vote) => {
      const player = vote.player || players.find((p) => p.id === vote.playerId);
      if (!player) return;

      if (!map.has(vote.playerId)) {
        map.set(vote.playerId, {
          playerId: vote.playerId,
          player,
          total: 0,
          weekTotal: 0
        });
      }

      const entry = map.get(vote.playerId);
      entry.total += Number(vote.points || 0);

      if (vote.week === state.activeWeek) {
        entry.weekTotal += Number(vote.points || 0);
      }
    });

  return [...map.values()]
    .filter((entry) => entry.player)
    .sort((a, b) => b.total - a.total || a.player.name.localeCompare(b.player.name));
}

function getWeekRankingByConference(conference) {
  return getVoteTotalsByConference(conference)
    .filter((entry) => entry.weekTotal > 0)
    .sort((a, b) => b.weekTotal - a.weekTotal || a.player.name.localeCompare(b.player.name));
}

function renderVotesArea() {
  const leagueTotals = getVoteTotalsByConference(CONFERENCE_LEAGUE);
  const champTotals = getVoteTotalsByConference(CONFERENCE_CHAMPIONSHIP);

  const leagueLeader = leagueTotals[0];
  const champLeader = champTotals[0];

  setText(els.activeWeekInfo, `Week ${state.activeWeek}`);
  setText(els.voteWeekPill, `Week ${state.activeWeek}`);
  updateVoteCountdown();
  setText(els.leagueVoteLeaderInfo, leagueLeader ? `${leagueLeader.player.name} (${leagueLeader.total} pt)` : "-");
  setText(els.champVoteLeaderInfo, champLeader ? `${champLeader.player.name} (${champLeader.total} pt)` : "-");

  renderWeekStars();
  renderMobileVoteTop5();
  renderConferenceRanking(els.leagueVoteRankingList, leagueTotals, CONFERENCE_LEAGUE);
  renderConferenceRanking(els.champVoteRankingList, champTotals, CONFERENCE_CHAMPIONSHIP);
  renderAutoPickPreview(leagueTotals, champTotals);
}

function renderMobileVoteTop5() {
  if (!els.mobileLiveTop5) return;

  const conference = isValidConference(mobileLiveConference)
    ? mobileLiveConference
    : CONFERENCE_LEAGUE;

  setText(els.mobileLiveTop5Week, `Week ${state.activeWeek}`);
  setText(els.mobileLiveTop5Title, `Top 5 ${conference.replace("Conference ", "")}`);

  document.querySelectorAll("[data-live-conference]").forEach((button) => {
    const active = button.dataset.liveConference === conference;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });

  // Mobile = stessa classifica cumulativa mostrata su desktop.
  // Manteniamo anche il numero totale di chiamate come dettaglio compatto.
  const callsByPlayer = new Map();

  votes
    .filter((vote) => vote.voterConference === conference)
    .forEach((vote) => {
      const canonicalId = getCanonicalPlayerId(vote.playerId) || vote.playerId;
      callsByPlayer.set(canonicalId, (callsByPlayer.get(canonicalId) || 0) + 1);
    });

  const top = getVoteTotalsByConference(conference).slice(0, 5);

  if (!top.length) {
    els.mobileLiveTop5.innerHTML = `
      <div class="mobile-live-top5-empty">
        <strong>Nessun voto ancora</strong>
        <small>La Top 5 ${escapeHtml(conference)} si aggiorna appena arrivano i primi voti.</small>
      </div>
    `;
    return;
  }

  els.mobileLiveTop5.innerHTML = top.map((entry, index) => {
    const calls = callsByPlayer.get(entry.playerId) || 0;

    return `
      <div class="mobile-live-top5-row is-rich">
        <span class="mobile-live-top5-pos">${index + 1}</span>
        ${renderMascotAvatar(entry.player, "mobile")}
        <span class="mobile-live-top5-player">
          <strong>${escapeHtml(entry.player.name)}</strong>
          <small>${escapeHtml(entry.player.role)} · ${escapeHtml(entry.player.serieATeam)} · ${calls} ${calls === 1 ? "chiamata" : "chiamate"}</small>
        </span>
        <span class="mobile-live-top5-points">${entry.total} pt</span>
      </div>
    `;
  }).join("");
}

function renderWeekStars() {
  const leagueStar = getWeekRankingByConference(CONFERENCE_LEAGUE)[0];
  const champStar = getWeekRankingByConference(CONFERENCE_CHAMPIONSHIP)[0];

  renderSingleWeekStar(leagueStar, els.leagueWeekStarName, els.leagueWeekStarDetails);
  renderSingleWeekStar(champStar, els.champWeekStarName, els.champWeekStarDetails);
}

function renderSingleWeekStar(star, nameEl, detailsEl) {
  if (!star) {
    setText(nameEl, "-");
    setText(detailsEl, "Nessun voto registrato.");
    return;
  }

  setText(nameEl, star.player.name);
  setText(detailsEl, `${star.weekTotal} pt questa week · Totale ${star.total} · ${star.player.role} · ${star.player.serieATeam}`);
}

function renderConferenceRanking(container, totals, conference) {
  if (!container) return;
  const top = totals.slice(0, 5);

  if (!top.length) {
    container.innerHTML = `
      <div class="ranking-empty">
        <div>
          <strong>Nessun voto registrato</strong>
          <small>La Top 5 ${escapeHtml(conference)} apparirà appena arrivano i primi voti.</small>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = top.map((entry, index) => {
    const pos = index + 1;
    return `
      <div class="ranking-row auto-zone is-rich">
        <span class="ranking-pos">${pos}</span>
        ${renderMascotAvatar(entry.player)}
        <span class="ranking-player">
          <strong>${escapeHtml(entry.player.name)}</strong>
          <small>${escapeHtml(entry.player.role)} · ${escapeHtml(entry.player.serieATeam)} · ${escapeHtml(entry.player.originTeam)} · Q. ${escapeHtml(entry.player.quotation)}</small>
        </span>
        <span class="ranking-points">${entry.total} pt</span>
        <span class="auto-badge">Top 5</span>
      </div>
    `;
  }).join("");
}

function getAutoPickPreviewRows(leagueTotals, champTotals) {
  if (!state.firstConference) {
    return Array.from({ length: AUTO_PICK_COUNT }, (_, index) => ({
      pickNumber: index + 1,
      conference: null,
      entry: null
    }));
  }

  const first = state.firstConference;
  const second = getOppositeConference(first);
  const usedPlayerIds = new Set();

  const totalsByConference = {
    [CONFERENCE_LEAGUE]: leagueTotals,
    [CONFERENCE_CHAMPIONSHIP]: champTotals
  };

  return Array.from({ length: AUTO_PICK_COUNT }, (_, index) => {
    const conference = index % 2 === 0 ? first : second;
    const ranking = totalsByConference[conference] || [];
    const entry = ranking.find((candidate) => !usedPlayerIds.has(candidate.playerId)) || null;

    if (entry) usedPlayerIds.add(entry.playerId);

    return {
      pickNumber: index + 1,
      conference,
      entry
    };
  });
}

function renderAutoPickPreview(leagueTotals, champTotals) {
  const rows = getAutoPickPreviewRows(leagueTotals, champTotals);
  const selectedIds = rows.filter((row) => row.entry).map((row) => row.entry.playerId);
  const duplicateIds = selectedIds.filter((id, index) => selectedIds.indexOf(id) !== index);

  const html = rows.map((row) => {
    if (!row.conference) {
      return `
        <div class="auto-pick-row">
          <span class="pick-number-pill">Pick ${row.pickNumber}</span>
          <div>
            <strong>In attesa</strong>
            <small>Prima imposta la Conference vincitrice</small>
          </div>
        </div>
      `;
    }

    const className = row.conference === CONFERENCE_CHAMPIONSHIP ? "championship" : "league";

    if (!row.entry) {
      return `
        <div class="auto-pick-row ${className}">
          <span class="pick-number-pill">Pick ${row.pickNumber}</span>
          <div>
            <strong>In attesa</strong>
            <small>${escapeHtml(row.conference)} · servono voti</small>
          </div>
        </div>
      `;
    }

    const isDuplicate = duplicateIds.includes(row.entry.playerId);

    return `
      <div class="auto-pick-row ${className}">
        <span class="pick-number-pill">Pick ${row.pickNumber}</span>
        <div>
          <strong>${escapeHtml(row.entry.player.name)}</strong>
          <small>${escapeHtml(row.conference)} · ${row.entry.total} pt</small>
          ${isDuplicate ? `<span class="duplicate-badge">Doppione manuale</span>` : ""}
        </div>
      </div>
    `;
  }).join("");

  if (els.autoPickPreview) els.autoPickPreview.innerHTML = html;
  if (els.autoPickPreviewBroadcast) els.autoPickPreviewBroadcast.innerHTML = html;
}

async function generateAutoPicksFromVotes() {
  if (!isAdmin || simulatedTeamId) return;

  if (!state.firstConference) {
    alert("Prima scegli la Conference vincitrice: il draft partirà dalla Conference opposta.");
    return;
  }

  const leagueTotals = getVoteTotalsByConference(CONFERENCE_LEAGUE);
  const champTotals = getVoteTotalsByConference(CONFERENCE_CHAMPIONSHIP);
  const rows = getAutoPickPreviewRows(leagueTotals, champTotals);

  if (rows.some((row) => !row.entry)) {
    alert("Servono almeno 5 giocatori votati per ciascuna conference.");
    return;
  }

  const ok = confirm("Generare/sostituire le prime 10 auto-pick da Supabase?");
  if (!ok) return;

  const { error: deleteError } = await supabase
    .from("allstar_picks")
    .delete()
    .eq("season", SEASON)
    .lte("pick_number", AUTO_PICK_COUNT);

  if (deleteError) {
    alert("Errore eliminazione auto-pick esistenti.");
    console.error(deleteError);
    return;
  }

  const insertRows = rows.map((row) => ({
    season: SEASON,
    pick_number: row.pickNumber,
    conference: row.conference,
    player_id: row.entry.playerId,
    source: "vote",
    points_total: row.entry.total,
    created_by: currentUser.id
  }));

  const { error: insertError } = await supabase.from("allstar_picks").insert(insertRows);

  if (insertError) {
    alert("Errore generazione auto-pick. Controlla duplicati/RLS.");
    console.error(insertError);
    return;
  }

  await updateState({
    current_pick: Math.max(AUTO_PICK_COUNT + 1, state.currentPick),
    voting_open: false,
    voting_closed_at: new Date().toISOString(),
    active_week: state.activeWeek
  });
  await refreshAndRender();
}

async function saveWinnerConferenceFromAdmin() {
  if (!isAdmin || simulatedTeamId) return;

  const winner = els.winnerConferenceSelect?.value || "";
  if (!isValidConference(winner)) {
    alert("Scegli una Conference vincitrice valida.");
    return;
  }

  const first = getOppositeConference(winner);

  const { error } = await supabase
    .from("allstar_state")
    .update({
      winner_conference: winner,
      first_conference: first,
      draft_open: false,
      current_pick: Math.max(AUTO_PICK_COUNT + 1, state.currentPick || AUTO_PICK_COUNT + 1)
    })
    .eq("season", SEASON);

  if (error) {
    alert("Errore salvataggio Conference vincitrice.");
    console.error(error);
    return;
  }

  await refreshAndRender();
}

function getCurrentConference() {
  if (!state.firstConference) return null;

  const first = state.firstConference;
  const second = getOppositeConference(first);
  return state.currentPick % 2 === 1 ? first : second;
}

function getAvailablePlayers() {
  const pickedIds = new Set(picks.map((pick) => pick.playerId));
  const pickedNames = new Set(picks.map((pick) => getPlayerDedupeKey(pick.player)).filter(Boolean));

  return players.filter((player) => {
    const canonicalId = getCanonicalPlayerId(player.id);
    const key = getPlayerDedupeKey(player);
    return !pickedIds.has(player.id) && !pickedIds.has(canonicalId) && !pickedNames.has(key);
  });
}

function renderAll() {
  renderVotesArea();
  renderHeader();
  renderRosters();
  renderLastPicks();
  renderPool();
  renderModalPlayers();
  renderMobileDraftFlow();
  renderMobileLiveSummary();
}

function getConferenceForPickNumber(pickNumber) {
  if (!state.firstConference || !Number.isFinite(Number(pickNumber))) return null;
  const first = state.firstConference;
  const second = getOppositeConference(first);
  return Number(pickNumber) % 2 === 1 ? first : second;
}

function renderMobileDraftFlow() {
  const currentPick = Number(state.currentPick || AUTO_PICK_COUNT + 1);
  const completed = picks.length >= TOTAL_PLAYERS;
  const previous = picks
    .filter((pick) => pick.pickNumber < currentPick)
    .slice()
    .sort((a, b) => b.pickNumber - a.pickNumber)[0] || null;

  if (completed) {
    setText(els.mobilePrevPick, previous ? `Pick ${previous.pickNumber}` : "Ultima pick");
    setText(els.mobilePrevPlayer, previous?.player?.name || "-");
    setText(els.mobileNowPick, "Draft completato");
    setText(els.mobileNowConference, `${picks.length} / ${TOTAL_PLAYERS}`);
    setText(els.mobileNextPick, "Fine");
    setText(els.mobileNextConference, "Rose complete");
    return;
  }

  setText(els.mobilePrevPick, previous ? `Pick ${previous.pickNumber}` : "Nessuna pick");
  setText(els.mobilePrevPlayer, previous?.player?.name || "-");
  setText(els.mobileNowPick, `Pick ${currentPick}`);
  setText(els.mobileNowConference, getConferenceForPickNumber(currentPick) || "Da decidere");
  setText(els.mobileNextPick, `Pick ${Math.min(currentPick + 1, TOTAL_PLAYERS)}`);
  setText(els.mobileNextConference, currentPick >= TOTAL_PLAYERS ? "Fine draft" : (getConferenceForPickNumber(currentPick + 1) || "In attesa"));
}

function renderMobileLiveSummary(forcedTab = null) {
  if (!els.mobileLiveSummary) return;
  if (!stateLoaded) {
    setText(els.mobileLiveKicker, "ALL STAR GAME");
    setText(els.mobileLiveText, "Sincronizzazione votazioni...");
    setText(els.mobileLiveChip, "ATTESA");
    return;
  }

  const activeTab = forcedTab || document.querySelector(".mobile-tab-btn.is-active")?.dataset.allstarTab || "vote";
  const leagueLeader = getVoteTotalsByConference(CONFERENCE_LEAGUE)[0];
  const champLeader = getVoteTotalsByConference(CONFERENCE_CHAMPIONSHIP)[0];
  const myVoteCount = getViewingTeam()?.id
    ? new Set(votes.filter((vote) => vote.week === state.activeWeek && vote.voterTeamId === getViewingTeam().id).map((vote) => vote.slot)).size
    : 0;

  let kicker = "ALL STAR LIVE";
  let text = "Tutto pronto";
  let chip = "LIVE";

  if (activeTab === "vote") {
    kicker = `WEEK ${state.activeWeek} · VOTAZIONE`;
    if (state.votingOpen) {
      text = getViewingTeam()?.id
        ? (simulatedTeamId ? `${getViewingTeam().name}: ${myVoteCount}/5 voti questa week` : `Hai votato ${myVoteCount}/5 giocatori`)
        : "Votazioni aperte";
      chip = myVoteCount >= 5 ? "FATTO" : "APERTA";
    } else {
      text = "Votazioni chiuse";
      chip = "CHIUSA";
    }
  } else if (activeTab === "draft") {
    const currentConference = getCurrentConference();
    kicker = `DRAFT · PICK ${state.currentPick}`;
    text = currentConference ? `Ora sceglie ${currentConference}` : "In attesa della Conference vincitrice";
    chip = `${picks.length}/${TOTAL_PLAYERS}`;
  } else if (activeTab === "pool") {
    kicker = "PLAYER POOL";
    text = `${getAvailablePlayers().length} giocatori disponibili`;
    chip = "POOL";
  } else if (activeTab === "admin") {
    kicker = "AREA ADMIN";
    text = state.isOpen ? "Draft aperto" : (state.votingOpen ? "Votazioni aperte" : "Controlli All Star");
    chip = "ADMIN";
  }

  setText(els.mobileLiveKicker, kicker);
  setText(els.mobileLiveText, text);
  setText(els.mobileLiveChip, chip);
  els.mobileLiveSummary.dataset.activeTab = activeTab;
}

function toggleMobileAutoPicks() {
  if (!els.mobileAutoPicksCard || !els.toggleAutoPicksBtn) return;
  const expanded = els.mobileAutoPicksCard.classList.toggle("is-expanded");
  els.toggleAutoPicksBtn.textContent = expanded ? "Riduci" : "Tutte";
  els.toggleAutoPicksBtn.setAttribute("aria-expanded", String(expanded));
}

function renderHeader() {
  const currentConference = getCurrentConference();
  const selected = picks.length;
  const completed = selected >= TOTAL_PLAYERS;

  setText(els.draftStatusLabel, getAllStarStatusLabel());
  setText(els.currentPickInfo, String(state.currentPick));
  setText(els.currentConferenceInfo, currentConference || "Da decidere");
  setText(els.selectedCountInfo, `${selected} / ${TOTAL_PLAYERS}`);
  setText(els.currentPickBig, String(state.currentPick));
  setText(els.currentConferenceBig, currentConference || "Da decidere");

  if (els.currentConferenceBig) {
    els.currentConferenceBig.dataset.conf = currentConference || "";
  }

  if (els.winnerConferenceSelect) {
    els.winnerConferenceSelect.value = state.winnerConference || "";
  }

  setText(els.winnerConferenceInfo, state.winnerConference || "Non ancora decisa");
  setText(els.firstConferenceInfo, state.firstConference || "In attesa");
  setText(els.activeWeekAdminInfo, state.votingStartedAt ? `Week ${state.activeWeek}` : "Non iniziata");
  setText(els.votingStatusInfo, getAllStarStatusLabel());
  setText(els.votingStartedInfo, formatDateTime(state.votingStartedAt));
  setText(els.votingClosedInfo, formatDateTime(state.votingClosedAt));

  if (els.startVotingBtn) {
    if (state.votingStartedAt && state.votingClosedAt) {
      els.startVotingBtn.textContent = "Resetta prima le votazioni";
    } else if (state.votingStartedAt) {
      els.startVotingBtn.textContent = "Votazioni già iniziate";
    } else {
      els.startVotingBtn.textContent = "Inizia votazioni All Star";
    }

    els.startVotingBtn.disabled = !isAdmin || Boolean(state.votingStartedAt);
  }

  if (els.openPickModalBtn) {
    const canPick = isAdmin && !simulatedTeamId && state.isOpen && state.firstConference && !completed;
    els.openPickModalBtn.disabled = !canPick;
    if (completed) {
      els.openPickModalBtn.textContent = "Draft completato";
    } else if (!state.firstConference) {
      els.openPickModalBtn.textContent = "Scegli vincitrice";
    } else if (!state.isOpen) {
      els.openPickModalBtn.textContent = "Draft chiuso";
    } else {
      els.openPickModalBtn.textContent = "Effettua chiamata";
    }
  }

  if (els.toggleDraftBtn) {
    els.toggleDraftBtn.textContent = state.isOpen ? "Chiudi Draft" : "Apri Draft";
  }
}

function renderRosters() {
  const leaguePicks = picks.filter((pick) => pick.conference === CONFERENCE_LEAGUE);
  const championshipPicks = picks.filter((pick) => pick.conference === CONFERENCE_CHAMPIONSHIP);

  setText(els.leagueCount, `${leaguePicks.length} / ${PLAYERS_PER_TEAM} giocatori selezionati`);
  setText(els.championshipCount, `${championshipPicks.length} / ${PLAYERS_PER_TEAM} giocatori selezionati`);

  if (els.leagueRoster) els.leagueRoster.innerHTML = renderDraftPickTable(leaguePicks);
  if (els.championshipRoster) els.championshipRoster.innerHTML = renderDraftPickTable(championshipPicks);
}

function renderDraftPickTable(teamPicks) {
  const rows = teamPicks
    .filter((pick) => pick.pickNumber >= AUTO_PICK_COUNT + 1)
    .slice()
    .sort((a, b) => a.pickNumber - b.pickNumber);

  if (!rows.length) {
    return `
      <div class="allstar-draft-table-wrap empty">
        <div class="empty-draft-table">
          <strong>Nessuna chiamata manuale</strong>
          <span>La tabella partirà dalla pick ${AUTO_PICK_COUNT + 1}.</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="allstar-draft-table-wrap">
      <table class="allstar-draft-table">
        <thead>
          <tr>
            <th>Pick</th>
            <th>Giocatore</th>
            <th>Ruolo</th>
            <th>Squadra</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((pick) => `
            <tr>
              <td class="pick-col">${pick.pickNumber}</td>
              <td>
                <strong>${escapeHtml(pick.player.name)}${pick.source === "vote" ? " ⭐" : ""}</strong>
              </td>
              <td><span class="role-pill role-${escapeAttr(String(pick.player.role).charAt(0))}">${escapeHtml(pick.player.role)}</span></td>
              <td>${escapeHtml(pick.player.serieATeam)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLastPicks() {
  if (!els.lastPicksList) return;
  const recent = picks.slice().sort((a, b) => b.pickNumber - a.pickNumber).slice(0, 5);

  if (!recent.length) {
    els.lastPicksList.innerHTML = `<div class="last-pick-row"><span>-</span><strong>Nessuna chiamata</strong><em>-</em></div>`;
    return;
  }

  els.lastPicksList.innerHTML = recent.map((pick) => `
    <div class="last-pick-row">
      <span>${pick.pickNumber}</span>
      <strong>${escapeHtml(pick.conference)}</strong>
      <em>${escapeHtml(pick.player.name)}${pick.source === "vote" ? " ⭐" : ""}</em>
    </div>
  `).join("");
}

function getFilteredPlayers() {
  const q = (els.searchInput?.value || "").trim().toLowerCase();
  const role = els.roleFilter?.value || "";
  const serieATeam = els.teamFilter?.value || "";

  return getAvailablePlayers().filter((player) => {
    const matchesSearch =
      !q ||
      player.name.toLowerCase().includes(q) ||
      player.serieATeam.toLowerCase().includes(q);

    return (
      matchesSearch &&
      (!role || player.role === role || String(player.role).startsWith(role)) &&
      (!serieATeam || player.serieATeam === serieATeam)
    );
  });
}

function renderPool() {
  if (!els.playersTbody) return;
  const filtered = getFilteredPlayers();

  if (!filtered.length) {
   els.playersTbody.innerHTML = `<tr><td colspan="5">Nessun giocatore disponibile.</td></tr>`;
    return;
  }

 els.playersTbody.innerHTML = filtered.map((player) => `
  <tr>
    <td>
      <div class="player-name-cell">
        <span class="player-dot"></span>
        <span>${escapeHtml(player.name)}</span>
      </div>
    </td>
    <td><span class="role-pill role-${escapeAttr(String(player.role).charAt(0))}">${escapeHtml(player.role)}</span></td>
    <td>${escapeHtml(player.serieATeam)}</td>
    <td>${escapeHtml(player.quotation ?? "-")}</td>
    <td>
      <button class="pick-btn" data-player-id="${escapeAttr(player.id)}" ${!isAdmin || simulatedTeamId || !state.isOpen ? "disabled" : ""}>Scegli</button>
    </td>
  </tr>
`).join("");
  document.querySelectorAll(".pick-btn[data-player-id]").forEach((btn) => {
    btn.addEventListener("click", () => makePick(btn.dataset.playerId));
  });
}

function openPickModal() {
  if (!isAdmin || simulatedTeamId) return;

  if (!state.firstConference) {
    alert("Prima scegli la Conference vincitrice.");
    return;
  }

  if (!state.isOpen) {
    alert("Il draft è chiuso.");
    return;
  }

  if (els.modalPickText) els.modalPickText.textContent = `Pick ${state.currentPick} - ${getCurrentConference()}`;
  if (els.modalSearchInput) els.modalSearchInput.value = "";
  renderModalPlayers();
  els.pickModal?.showModal();
}

function renderModalPlayers() {
  if (!els.modalPlayersList) return;

  const query = (els.modalSearchInput?.value || "").trim().toLowerCase();
  const available = getAvailablePlayers()
    .filter((player) => {
      if (!query) return true;
      return (
        player.name.toLowerCase().includes(query) ||
        player.serieATeam.toLowerCase().includes(query) ||
        player.originTeam.toLowerCase().includes(query)
      );
    })
    .slice(0, 100);

  if (!available.length) {
    els.modalPlayersList.innerHTML = `<div class="modal-player-row"><strong>Nessun giocatore disponibile</strong></div>`;
    return;
  }

  els.modalPlayersList.innerHTML = available.map((player) => `
    <div class="modal-player-row">
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        <small>${escapeHtml(player.role)} · ${escapeHtml(player.serieATeam)} · Q. ${escapeHtml(player.quotation ?? "-")} · ${escapeHtml(player.originTeam)}</small>
      </div>
      <button class="pick-btn" data-modal-player-id="${escapeAttr(player.id)}" ${!isAdmin || simulatedTeamId || !state.isOpen ? "disabled" : ""}>Scegli</button>
    </div>
  `).join("");

  document.querySelectorAll("[data-modal-player-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await makePick(btn.dataset.modalPlayerId);
      els.pickModal?.close();
    });
  });
}

async function makePick(playerId) {
  if (!isAdmin || simulatedTeamId) return;

  if (!state.isOpen) {
    alert("Il draft è chiuso.");
    return;
  }

  if (!state.firstConference) {
    alert("Prima scegli la Conference vincitrice.");
    return;
  }

  if (picks.length >= TOTAL_PLAYERS) {
    alert("Draft già completato.");
    return;
  }

  const player = players.find((p) => p.id === playerId);
  if (!player) return;

  const playerKey = getPlayerDedupeKey(player);
  const alreadyPicked = picks.some((pick) => pick.playerId === playerId || getPlayerDedupeKey(pick.player) === playerKey);
  if (alreadyPicked) {
    alert("Giocatore già selezionato.");
    return;
  }

  const conference = getCurrentConference();
  const conferencePickCount = picks.filter((pick) => pick.conference === conference).length;

  if (conferencePickCount >= PLAYERS_PER_TEAM) {
    alert(`${conference} ha già completato la rosa.`);
    return;
  }

  const { error: insertError } = await supabase.from("allstar_picks").insert({
    season: SEASON,
    pick_number: state.currentPick,
    conference,
    player_id: player.id,
    source: "manual",
    created_by: currentUser.id
  });

  if (insertError) {
    alert("Errore salvataggio pick. Controlla duplicati/RLS.");
    console.error(insertError);
    return;
  }

  await updateState({ current_pick: state.currentPick + 1 });
  await refreshAndRender();
}

async function undoLastPick() {
  if (!isAdmin || simulatedTeamId) return;
  const manualPicks = picks.filter((pick) => pick.pickNumber >= AUTO_PICK_COUNT + 1 && pick.source === "manual");
  const lastManual = manualPicks.sort((a, b) => b.pickNumber - a.pickNumber)[0];

  if (!lastManual) {
    alert("Le prime 10 auto-pick non si annullano da qui. Puoi resettare il draft o rigenerarle.");
    return;
  }

  const { error } = await supabase
    .from("allstar_picks")
    .delete()
    .eq("id", lastManual.id);

  if (error) {
    alert("Errore annullamento pick.");
    console.error(error);
    return;
  }

  await updateState({ current_pick: Math.max(AUTO_PICK_COUNT + 1, lastManual.pickNumber) });
  await refreshAndRender();
}

async function resetDraft() {
  if (!isAdmin || simulatedTeamId) return;

  const ok = confirm("Vuoi davvero resettare tutto il draft All Star? I voti resteranno salvati.");
  if (!ok) return;

  const { error: deleteError } = await supabase
    .from("allstar_picks")
    .delete()
    .eq("season", SEASON);

  if (deleteError) {
    alert("Errore reset pick.");
    console.error(deleteError);
    return;
  }

  const { error: stateError } = await supabase
    .from("allstar_state")
    .update({
      draft_open: false,
      current_pick: AUTO_PICK_COUNT + 1,
      winner_conference: null,
      first_conference: null
    })
    .eq("season", SEASON);

  if (stateError) {
    alert("Errore reset stato draft.");
    console.error(stateError);
    return;
  }

  await refreshAndRender();
}

async function toggleDraftOpen() {
  if (!isAdmin || simulatedTeamId) return;

  if (!state.firstConference) {
    alert("Prima scegli la Conference vincitrice.");
    return;
  }

  await updateState({ draft_open: !state.isOpen });
  await refreshAndRender();
}

async function updateState(patch) {
  const { error } = await supabase
    .from("allstar_state")
    .update(patch)
    .eq("season", SEASON);

  if (error) {
    console.error("Errore update state:", error);
    throw error;
  }
}

async function refreshAndRender() {
  const results = await Promise.allSettled([loadState(), loadVotes(), loadPicks()]);
  for (const result of results) {
    if (result.status === "rejected") console.warn("All Star: aggiornamento parziale:", result.reason);
  }
  if (stateLoaded) renderAll();
}

function startAutoWeekTicker() {
  // Week = lunedì 00:00 -> domenica 23:59:59 (orario Europe/Brussels).
  // Il countdown si aggiorna ogni secondo; il cambio week viene controllato ogni 15s.
  updateVoteCountdown();
  setInterval(updateVoteCountdown, 1000);

  setInterval(() => {
    const nextWeek = getComputedActiveWeek(state);
    if (nextWeek !== state.activeWeek) {
      state.activeWeek = nextWeek;
      hydrateVotePickersFromSavedVotes();
      renderAll();
    }
  }, 15 * 1000);
}

function subscribeRealtime() {
  supabase
    .channel(`allstar-${SEASON}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "allstar_state" }, refreshAndRender)
    .on("postgres_changes", { event: "*", schema: "public", table: "allstar_votes" }, refreshVotesAndRender)
    .on("postgres_changes", { event: "*", schema: "public", table: "allstar_picks" }, refreshPicksAndRender)
    .subscribe();
}

async function refreshVotesAndRender() {
  await loadVotes();
  renderVotesArea();
}

async function refreshPicksAndRender() {
  await loadPicks();
  renderHeader();
  renderRosters();
  renderLastPicks();
  renderPool();
  renderModalPlayers();
}

function getComputedActiveWeek(stateLike = state) {
  const startedAt = stateLike?.votingStartedAt;
  if (!startedAt) return Math.max(1, Number(stateLike?.activeWeek || 1));

  const startDate = new Date(startedAt);
  if (Number.isNaN(startDate.getTime())) return Math.max(1, Number(stateLike?.activeWeek || 1));

  const effectiveDate = stateLike?.votingClosedAt ? new Date(stateLike.votingClosedAt) : new Date();
  if (Number.isNaN(effectiveDate.getTime())) return Math.max(1, Number(stateLike?.activeWeek || 1));

  // Conta le settimane di calendario, non blocchi di 7 giorni dall'istante di avvio.
  // Quindi se la Week 1 viene attivata di sabato, il lunedì successivo parte già la Week 2.
  const startMonday = getBrusselsMondaySerial(startDate);
  const currentMonday = getBrusselsMondaySerial(effectiveDate);
  return Math.max(1, Math.floor((currentMonday - startMonday) / WEEK_MS) + 1);
}

function getBrusselsDateParts(date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: ALLSTAR_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function getBrusselsMondaySerial(date) {
  const parts = getBrusselsDateParts(date);
  const weekdayIndex = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6
  }[parts.weekday] ?? 0;

  const localDateSerial = Date.UTC(parts.year, parts.month - 1, parts.day);
  return localDateSerial - weekdayIndex * DAY_MS;
}

function getTimeZoneOffsetMs(date) {
  const parts = getBrusselsDateParts(date);
  const asIfUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  const roundedDateMs = Math.floor(date.getTime() / 1000) * 1000;
  return asIfUtc - roundedDateMs;
}

function brusselsLocalDateTimeToDate(year, month, day, hour = 0, minute = 0, second = 0) {
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let candidate = new Date(localAsUtc);
  let offset = getTimeZoneOffsetMs(candidate);
  candidate = new Date(localAsUtc - offset);

  const refinedOffset = getTimeZoneOffsetMs(candidate);
  if (refinedOffset !== offset) candidate = new Date(localAsUtc - refinedOffset);
  return candidate;
}

function getCurrentWeekDeadline(now = new Date()) {
  const mondaySerial = getBrusselsMondaySerial(now);
  const nextMondaySerial = mondaySerial + WEEK_MS;
  const nextMonday = new Date(nextMondaySerial);

  return brusselsLocalDateTimeToDate(
    nextMonday.getUTCFullYear(),
    nextMonday.getUTCMonth() + 1,
    nextMonday.getUTCDate(),
    0,
    0,
    0
  );
}

function updateVoteCountdown() {
  if (!els.voteCountdownValue) return;

  if (!state.votingStartedAt) {
    setText(els.voteCountdownLabel, "Votazioni non iniziate");
    setText(els.voteCountdownValue, "--");
    return;
  }

  if (state.votingClosedAt || !state.votingOpen) {
    setText(els.voteCountdownLabel, "Votazioni chiuse");
    setText(els.voteCountdownValue, "--");
    return;
  }

  const now = new Date();
  const deadline = getCurrentWeekDeadline(now);
  const remaining = Math.max(0, deadline.getTime() - now.getTime());

  const totalSeconds = Math.floor(remaining / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  setText(els.voteCountdownLabel, `Week ${state.activeWeek} · chiude domenica 23:59`);
  setText(
    els.voteCountdownValue,
    `${String(days).padStart(2, "0")}g ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`
  );
}

function canVoteNow() {
  return Boolean(state.votingOpen && state.votingStartedAt && !state.votingClosedAt);
}

function getVotingClosedMessage() {
  if (!state.votingStartedAt) return "Le votazioni All Star non sono ancora iniziate.";
  if (state.votingClosedAt) return "Le votazioni All Star sono chiuse.";
  return "Le votazioni sono chiuse.";
}

function getAllStarStatusLabel() {
  if (!state.votingStartedAt) return "Votazioni non iniziate";
  if (state.votingClosedAt || !state.votingOpen) return state.isOpen ? "Draft aperto" : "Votazioni chiuse";
  return `Votazioni aperte · Week ${state.activeWeek}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isValidConference(conference) {
  return conference === CONFERENCE_LEAGUE || conference === CONFERENCE_CHAMPIONSHIP;
}

function getOppositeConference(conference) {
  if (conference === CONFERENCE_LEAGUE) return CONFERENCE_CHAMPIONSHIP;
  if (conference === CONFERENCE_CHAMPIONSHIP) return CONFERENCE_LEAGUE;
  return null;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function setText(el, value) {
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

// =========================================================
// MOBILE ALL STAR TABS
// Desktop: tutto visibile. Mobile: una sezione alla volta.
// =========================================================

function initMobileAllStarTabs() {
  const tabButtons = [...document.querySelectorAll("[data-allstar-tab]")];
  const sections = [...document.querySelectorAll("[data-mobile-section]")];

  if (!tabButtons.length || !sections.length) return;

  const mq = window.matchMedia("(max-width: 768px)");

  function activateTab(tabName) {
    tabButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.allstarTab === tabName);
    });

    sections.forEach((section) => {
      section.classList.toggle("is-mobile-active", section.dataset.mobileSection === tabName);
    });

    renderMobileLiveSummary(tabName);
  }

  function syncMode() {
    if (mq.matches) {
      const active = document.querySelector(".mobile-tab-btn.is-active")?.dataset.allstarTab || "vote";
      activateTab(active);
    } else {
      sections.forEach((section) => section.classList.remove("is-mobile-active"));
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.allstarTab);
      const summary = document.querySelector(".mobile-live-summary");
      if (summary) summary.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  if (mq.addEventListener) {
    mq.addEventListener("change", syncMode);
  } else if (mq.addListener) {
    mq.addListener(syncMode);
  }

  syncMode();
}

document.addEventListener("DOMContentLoaded", initMobileAllStarTabs);
