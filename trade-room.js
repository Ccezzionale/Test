import { supabase, supabaseUrl, supabaseKey } from './supabase.js';

/* ===============================
   TRADE ROOM - LEGA DEGLI EROI
   Versione 2: scambio pick + giocatori già chiamati
   Struttura Supabase:
   - draft_order: draft_name, pick_number, team_id
   - draft_picks: id, draft_name, pick_number, team_id, player_name
   - teams: id, name
   - profiles: email, team_id
   - trade_proposals: from_team, to_team, status, message, draft_name
   - trade_assets: proposal_id, side, asset_type, asset_id, asset_label
   
================================ */

const CONFIG = {
  DRAFT_TABLE: "draft_order",
  DEFAULT_DRAFT_NAME: "Draft Championship",

  PICK_NUMBER_COL: "pick_number",
  PICK_OWNER_COL: "team_id",
  DRAFT_NAME_COL: "draft_name",

  PICKS_TABLE: "draft_picks",
  PICKS_ID_COL: "id",
  PICKS_DRAFT_NAME_COL: "draft_name",
  PICKS_PICK_NUMBER_COL: "pick_number",
  PICKS_OWNER_COL: "team_id",
  PICKS_PLAYER_NAME_COL: "player_name",

  TEAM_TABLE: "teams",
  TEAM_ID_COL: "id",
  TEAM_NAME_COL: "name",

  PROFILE_TABLE: "profiles",
  PROFILE_EMAIL_COL: "email",
  PROFILE_TEAM_COL: "team_id",

  FUTURE_PICKS_TABLE: "future_draft_picks",
  FUTURE_PICK_SEASON: 2027
};


let currentUser = null;
let currentTeamId = null;
let currentTeamName = null;
let currentTeamConference = null;
let currentDraftName = CONFIG.DEFAULT_DRAFT_NAME;
let currentTradePhase = "draft";
let marketOpen = true;
let futurePickSeason = 2027;

let currentUserRole = "coach";
let currentIsAdmin = false;
let marketOpenAt = null;
let marketCloseAt = null;

let allPicks = [];
let allPickedPlayers = [];
let allTeams = [];
let usedPickNumbers = new Set();
let allFuturePicks = [];

let pendingAcceptProposalId = null;
let requiredCutsCount = 0;

/* ========= ELEMENTI ========= */

const userInfo = document.getElementById("userInfo");
const tradeApp = document.getElementById("tradeApp");

const myTeamLabel = document.getElementById("myTeamLabel");
const toTeamSelect = document.getElementById("toTeamSelect");
const myPicksBox = document.getElementById("myPicksBox");
const theirPicksBox = document.getElementById("theirPicksBox");
const tradeMessageInput = document.getElementById("tradeMessageInput");
const sendTradeBtn = document.getElementById("sendTradeBtn");
const tradeMessage = document.getElementById("tradeMessage");
const myPicksSummary = document.getElementById("myPicksSummary");
const theirPicksSummary = document.getElementById("theirPicksSummary");
const activeDraftLabel = document.getElementById("activeDraftLabel");
const tradeAdminPanel = document.getElementById("tradeAdminPanel");
const adminTradePhase = document.getElementById("adminTradePhase");
const adminMarketOpen = document.getElementById("adminMarketOpen");
const adminFutureSeason = document.getElementById("adminFutureSeason");
const adminMarketOpenAt = document.getElementById("adminMarketOpenAt");
const adminMarketCloseAt = document.getElementById("adminMarketCloseAt");
const saveTradeSettingsBtn = document.getElementById("saveTradeSettingsBtn");
const tradeSettingsMessage = document.getElementById("tradeSettingsMessage");

const receivedTradesBox = document.getElementById("receivedTradesBox");
const sentTradesBox = document.getElementById("sentTradesBox");
const completedTradesBox = document.getElementById("completedTradesBox");
const pendingCutsPanel = document.getElementById("pendingCutsPanel");
const pendingCutsBox = document.getElementById("pendingCutsBox");

const cutPlayersModal = document.getElementById("cutPlayersModal");
const cutPlayersModalText = document.getElementById("cutPlayersModalText");
const cutPlayersList = document.getElementById("cutPlayersList");
const confirmCutPlayersBtn = document.getElementById("confirmCutPlayersBtn");
const cancelCutPlayersBtn = document.getElementById("cancelCutPlayersBtn");
const cutPlayersModalMessage = document.getElementById("cutPlayersModalMessage");

const teamDashboardLogo = document.getElementById("teamDashboardLogo");
const teamDashboardName = document.getElementById("teamDashboardName");
const teamDashboardMeta = document.getElementById("teamDashboardMeta");
const teamDashboardStatus = document.getElementById("teamDashboardStatus");

/* ========= INIT ========= */

document.addEventListener("DOMContentLoaded", initTradeRoom);

async function initTradeRoom() {
  setupNavbar();
  setupEvents();

  const ok = await checkUser();
  if (!ok) return;

  await loadTradeSettings();
   if (activeDraftLabel) {
  activeDraftLabel.textContent = `${getTradePhaseLabel()} · ${currentDraftName}`;
}

  await loadTeams();
  await loadAssetsForTrade();

  renderTeamSelect();
  renderMyAssets();

  await loadTrades();

  tradeApp.style.display = "block";
   renderTradeAdminPanel();
applyMarketOpenState();
}

function isDraftPhase() {
  return currentTradePhase === "draft";
}



/* ========= NAVBAR MOBILE ========= */

function setupNavbar() {
  // Navbar gestita da navbar.js
}

/* ========= EVENTI ========= */

function setupEvents() {
  if (toTeamSelect) {
    toTeamSelect.addEventListener("change", () => {
      renderTheirAssets();
      updateAssetSummaries();
    });
  }

  if (sendTradeBtn) {
    sendTradeBtn.addEventListener("click", sendTradeProposal);
  }

  document.addEventListener("change", (e) => {
if (
  e.target.classList.contains("my-pick-checkbox") ||
  e.target.classList.contains("their-pick-checkbox") ||
  e.target.classList.contains("my-player-checkbox") ||
  e.target.classList.contains("their-player-checkbox") ||
  e.target.classList.contains("my-future-pick-checkbox") ||
  e.target.classList.contains("their-future-pick-checkbox")
) {
  updateAssetSummaries();
}
  });

   if (saveTradeSettingsBtn) {
  saveTradeSettingsBtn.addEventListener("click", saveTradeSettings);
}

   if (cancelCutPlayersBtn) {
  cancelCutPlayersBtn.addEventListener("click", closeCutPlayersModal);
}

if (confirmCutPlayersBtn) {
  confirmCutPlayersBtn.addEventListener("click", confirmTradeWithCuts);
}
   }

/* ========= AUTH ========= */

async function checkUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error || !data || !data.user) {
    userInfo.textContent = "Devi effettuare il login per accedere alla Trade Room.";
    return false;
  }

  currentUser = data.user;
  const email = currentUser.email;

  const { data: profile, error: profileError } = await supabase
    .from(CONFIG.PROFILE_TABLE)
    .select("*")
    .eq(CONFIG.PROFILE_EMAIL_COL, email)
    .maybeSingle();

  if (profileError || !profile) {
    console.error(profileError);
    userInfo.textContent = "Profilo non trovato. Controlla la tabella profiles.";
    return false;
  }

  currentTeamId = profile[CONFIG.PROFILE_TEAM_COL];
currentUserRole = profile.role || "coach";
currentIsAdmin = currentUserRole === "admin";
  if (!currentTeamId) {
    userInfo.textContent = "Nessuna squadra collegata a questo utente.";
    return false;
  }

  const { data: team, error: teamError } = await supabase
    .from(CONFIG.TEAM_TABLE)
    .select("*")
    .eq(CONFIG.TEAM_ID_COL, currentTeamId)
    .maybeSingle();

  if (teamError || !team) {
    console.error(teamError);
    userInfo.textContent = "Squadra non trovata nella tabella teams.";
    return false;
  }

  currentTeamName = team[CONFIG.TEAM_NAME_COL];
  currentTeamConference = team.conference;

  if (currentTeamConference === "Conference League") {
    currentDraftName = "Draft Conference";
  } else {
    currentDraftName = "Draft Championship";
  }

userInfo.textContent = `Accesso effettuato come ${email}`;

if (teamDashboardName) {
  teamDashboardName.textContent = currentTeamName;
}

if (teamDashboardMeta) {
  teamDashboardMeta.textContent = `${currentTeamConference || "Conference"} · Stagione 2026`;
}

if (teamDashboardStatus) {
  teamDashboardStatus.textContent = "Mercato aperto";
}

if (teamDashboardLogo) {
  teamDashboardLogo.src = `img/${currentTeamName}.png`;
  teamDashboardLogo.alt = currentTeamName;
}

myTeamLabel.textContent = currentTeamName;

  if (activeDraftLabel) {
    activeDraftLabel.textContent = currentDraftName;
  }

  return true;
}


/* ========= DATI ========= */

async function loadTradeSettings() {
  const { data, error } = await supabase
    .from("trade_settings")
    .select("*")
    .eq("id", 1)
    .maybeSingle();

  if (error) {
    console.error("Errore caricamento trade_settings:", error);
    currentTradePhase = "draft";
    marketOpen = true;
    futurePickSeason = CONFIG.FUTURE_PICK_SEASON || 2027;
    return;
  }

  currentTradePhase = data?.active_phase || "draft";
  marketOpen = data?.market_open ?? true;
  futurePickSeason = data?.future_pick_season || CONFIG.FUTURE_PICK_SEASON || 2027;

   marketOpenAt = data?.market_open_at || null;
marketCloseAt = data?.market_close_at || null;
}

async function loadTeams() {
  const { data, error } = await supabase
    .from(CONFIG.TEAM_TABLE)
    .select("*")
    .order(CONFIG.TEAM_NAME_COL, { ascending: true });

  if (error) {
    console.error(error);
    allTeams = [];
    return;
  }

  allTeams = data || [];
}

async function loadAssetsForTrade() {
  await Promise.all([
    loadPicks(),
    loadPickedPlayers(),
    loadFuturePicks()
  ]);
}

async function loadPicks() {
  const { data: orderData, error: orderError } = await supabase
    .from(CONFIG.DRAFT_TABLE)
    .select("*")
    .eq(CONFIG.DRAFT_NAME_COL, currentDraftName)
    .order(CONFIG.PICK_NUMBER_COL, { ascending: true });

  if (orderError) {
    console.error(orderError);
    myPicksBox.textContent = "Errore nel caricamento delle pick.";
    return;
  }

  const { data: usedData, error: usedError } = await supabase
    .from(CONFIG.PICKS_TABLE)
    .select(CONFIG.PICKS_PICK_NUMBER_COL)
    .eq(CONFIG.PICKS_DRAFT_NAME_COL, currentDraftName);

  if (usedError) {
    console.error(usedError);
    myPicksBox.textContent = "Errore nel controllo delle pick già usate.";
    return;
  }

  usedPickNumbers = new Set(
    (usedData || []).map(row => Number(row[CONFIG.PICKS_PICK_NUMBER_COL]))
  );

  // Sono scambiabili solo le pick non ancora usate.
  allPicks = (orderData || []).filter(pick => {
    const pickNumber = Number(pick[CONFIG.PICK_NUMBER_COL]);
    return !usedPickNumbers.has(pickNumber);
  });
}

async function loadPickedPlayers() {
  /*
    FASE DRAFT:
    I giocatori scambiabili sono quelli già chiamati nel draft,
    quindi leggiamo da draft_picks e poi recuperiamo i dettagli da players.

    FASE CONFERENCE / ROUND ROBIN:
    Le rose vere sono in players.owner_team_id,
    quindi leggiamo direttamente da players.
  */

  if (isDraftPhase()) {
    const { data, error } = await supabase
      .from(CONFIG.PICKS_TABLE)
      .select("*")
      .eq(CONFIG.PICKS_DRAFT_NAME_COL, currentDraftName)
      .order(CONFIG.PICKS_PICK_NUMBER_COL, { ascending: true });

    if (error) {
      console.error(error);
      allPickedPlayers = [];
      return;
    }

    const rows = data || [];
    const playerIds = rows
      .map(row => row.player_id)
      .filter(Boolean);

    let playersMap = new Map();

    if (playerIds.length) {
      const { data: playersData, error: playersError } = await supabase
        .from("players")
        .select(`
          id,
          is_u21,
          is_u21_slot,
          is_u21_keeper,
          u21_keeper_year,
          is_fp,
          is_fp_keeper,
          fp_keeper_year,
          is_top6_protected,
          top6_protected_team_id,
          is_rfa_matched,
          role,
          role_mantra,
          serie_a_team,
          quotation
        `)
        .in("id", playerIds);

      if (playersError) {
        console.error("Errore caricamento dettagli players:", playersError);
      } else {
        playersMap = new Map(
          (playersData || []).map(p => [p.id, p])
        );
      }
    }

    allPickedPlayers = rows.map(row => {
      const playerDetails = playersMap.get(row.player_id) || {};

      return {
        ...row,
        is_u21: !!playerDetails.is_u21,
        is_u21_slot: !!playerDetails.is_u21_slot,
        is_u21_keeper: !!playerDetails.is_u21_keeper,
        u21_keeper_year: playerDetails.u21_keeper_year,
        is_fp: !!playerDetails.is_fp,
        is_fp_keeper: !!playerDetails.is_fp_keeper,
        fp_keeper_year: playerDetails.fp_keeper_year,
        is_rfa_matched: !!playerDetails.is_rfa_matched,
         is_top6_protected:
  !!playerDetails.is_top6_protected &&
  row.team_id === playerDetails.top6_protected_team_id,
top6_protected_team_id: playerDetails.top6_protected_team_id,
        role: playerDetails.role,
        role_mantra: playerDetails.role_mantra,
        serie_a_team: playerDetails.serie_a_team,
        quotation: playerDetails.quotation
      };
    });

    return;
  }

let query = supabase
  .from("players")
  .select(`
    id,
    name,
    role,
    role_mantra,
    serie_a_team,
    quotation,
    is_u21,
    is_u21_slot,
    is_top6_protected,
    top6_protected_team_id,
    is_u21_keeper,
    u21_keeper_year,
    is_fp,
    is_fp_keeper,
    fp_keeper_year,
    is_rfa_matched,
    owner_team_id,
    status,
    pool
  `)
    .eq("status", "active")
    .not("owner_team_id", "is", null)
    .order("name", { ascending: true });

  if (currentTradePhase === "conference_market") {
    const pool =
      currentDraftName === "Draft Championship"
        ? "conference_championship"
        : "conference_league";

    query = query.eq("pool", pool);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Errore caricamento giocatori da players:", error);
    allPickedPlayers = [];
    return;
  }

 allPickedPlayers = (data || []).map(player => ({
  id: player.id,
  player_id: player.id,
  draft_name: currentDraftName,
  pick_number: null,
  team_id: player.owner_team_id,
  player_name: player.name,
  role: player.role,
  role_mantra: player.role_mantra,
  serie_a_team: player.serie_a_team,
  quotation: player.quotation,
  is_u21: !!player.is_u21,
  is_u21_slot: !!player.is_u21_slot,
  is_u21_keeper: !!player.is_u21_keeper,
  u21_keeper_year: player.u21_keeper_year,
  is_fp: !!player.is_fp,
  is_fp_keeper: !!player.is_fp_keeper,
  fp_keeper_year: player.fp_keeper_year,
  is_rfa_matched: !!player.is_rfa_matched,
  is_top6_protected:
    !!player.is_top6_protected &&
    player.owner_team_id === player.top6_protected_team_id,
  top6_protected_team_id: player.top6_protected_team_id
}));
}

async function loadFuturePicks() {
  const { data, error } = await supabase
    .from(CONFIG.FUTURE_PICKS_TABLE)
    .select(`
      id,
      season,
      draft_name,
      round,
      original_team_id,
      owner_team_id,
      pick_kind,
      bonus_for_team_id,
      protection_note,
      notes,
      status,
      original:teams!future_draft_picks_original_team_id_fkey(id, name, conference),
      owner:teams!future_draft_picks_owner_team_id_fkey(id, name, conference)
    `)
    .eq("season", futurePickSeason)
    .eq("pick_kind", "normal")
    .eq("status", "active")
    .order("draft_name", { ascending: true })
    .order("round", { ascending: true });

  if (error) {
    console.error("Errore caricamento future pick:", error);
    allFuturePicks = [];
    return;
  }

  allFuturePicks = data || [];
}

/* ========= RENDER FORM ========= */
function canTradeWithTeam(team) {
  if (team[CONFIG.TEAM_ID_COL] === currentTeamId) return false;

  if (currentTradePhase === "draft") {
    return team.conference === currentTeamConference;
  }

  if (currentTradePhase === "conference_market") {
    return team.conference === currentTeamConference;
  }

  if (currentTradePhase === "round_robin_market") {
    return true;
  }

  return false;
}

function isMarketCurrentlyOpen() {
  if (!marketOpen) return false;

  const now = new Date();

  if (marketOpenAt && now < new Date(marketOpenAt)) {
    return false;
  }

  if (marketCloseAt && now > new Date(marketCloseAt)) {
    return false;
  }

  return true;
}

function showCurrentDraftAssets() {
  return currentTradePhase === "draft";
}

function showFuturePickAssets() {
  return (
    currentTradePhase === "draft" ||
    currentTradePhase === "conference_market" ||
    currentTradePhase === "round_robin_market"
  );
}

function showPlayerAssets() {
  return true;
}

function getTradePhaseLabel() {
  if (currentTradePhase === "draft") return "Mercato durante il Draft";
  if (currentTradePhase === "conference_market") return "Mercato Conferences";
  if (currentTradePhase === "round_robin_market") return "Mercato Round Robin";
  return currentTradePhase;
}


function renderTeamSelect() {
  toTeamSelect.innerHTML = `<option value="">Seleziona squadra...</option>`;

  allTeams
    .filter(canTradeWithTeam)
    .forEach(team => {
      const option = document.createElement("option");
      option.value = team[CONFIG.TEAM_ID_COL];

      const conferenceLabel = team.conference || "Conference";

      option.textContent = `${team[CONFIG.TEAM_NAME_COL]} (${conferenceLabel})`;
      toTeamSelect.appendChild(option);
    });
}

function renderMyAssets() {
  const myPicks = allPicks.filter(
    pick => pick[CONFIG.PICK_OWNER_COL] === currentTeamId
  );

  const myPlayers = allPickedPlayers.filter(
    player => player[CONFIG.PICKS_OWNER_COL] === currentTeamId
  );

   const myFuturePicks = allFuturePicks.filter(
  pick => pick.owner_team_id === currentTeamId
);

const myAssetGroups = [];

if (showCurrentDraftAssets()) {
  myAssetGroups.push(renderAssetGroup({
    title: "Pick draft in corso",
    emptyText: "Nessuna pick disponibile.",
    items: myPicks,
    inputClass: "my-pick-checkbox",
    getValue: pick => pick[CONFIG.PICK_NUMBER_COL],
    getLabel: formatPickLabel
  }));
}

if (showPlayerAssets()) {
  myAssetGroups.push(renderAssetGroup({
    title: "Giocatori",
    emptyText: "Nessun giocatore disponibile.",
    items: myPlayers,
    inputClass: "my-player-checkbox",
    getValue: player => player[CONFIG.PICKS_ID_COL],
    getLabel: formatPlayerLabel,
    getBadgeHtml: renderTradeBadgeImages
  }));
}

if (showFuturePickAssets()) {
  myAssetGroups.push(renderAssetGroup({
    title: `Pick future ${futurePickSeason}`,
    emptyText: "Nessuna pick futura disponibile.",
    items: myFuturePicks,
    inputClass: "my-future-pick-checkbox",
    getValue: pick => pick.id,
    getLabel: formatFuturePickLabel
  }));
}

myPicksBox.innerHTML = myAssetGroups.join("");

  updateAssetSummaries();
}

function renderTheirAssets() {
  const selectedTeamId = toTeamSelect.value;

  if (!selectedTeamId) {
    theirPicksBox.innerHTML = "Seleziona prima una squadra...";
    updateAssetSummaries();
    return;
  }

  const selectedTeamName = getTeamName(selectedTeamId);

  const theirPicks = allPicks.filter(
    pick => pick[CONFIG.PICK_OWNER_COL] === selectedTeamId
  );

  const theirPlayers = allPickedPlayers.filter(
    player => player[CONFIG.PICKS_OWNER_COL] === selectedTeamId
  );
   
const theirFuturePicks = allFuturePicks.filter(
  pick => pick.owner_team_id === selectedTeamId
);
   
const theirAssetGroups = [];

if (showCurrentDraftAssets()) {
  theirAssetGroups.push(renderAssetGroup({
    title: `Pick draft in corso di ${selectedTeamName}`,
    emptyText: `Nessuna pick disponibile per ${selectedTeamName}.`,
    items: theirPicks,
    inputClass: "their-pick-checkbox",
    getValue: pick => pick[CONFIG.PICK_NUMBER_COL],
    getLabel: formatPickLabel
  }));
}

if (showPlayerAssets()) {
  theirAssetGroups.push(renderAssetGroup({
    title: `Giocatori di ${selectedTeamName}`,
    emptyText: `Nessun giocatore disponibile per ${selectedTeamName}.`,
    items: theirPlayers,
    inputClass: "their-player-checkbox",
    getValue: player => player[CONFIG.PICKS_ID_COL],
    getLabel: formatPlayerLabel,
    getBadgeHtml: renderTradeBadgeImages
  }));
}

if (showFuturePickAssets()) {
  theirAssetGroups.push(renderAssetGroup({
    title: `Pick future ${futurePickSeason} di ${selectedTeamName}`,
    emptyText: `Nessuna pick futura disponibile per ${selectedTeamName}.`,
    items: theirFuturePicks,
    inputClass: "their-future-pick-checkbox",
    getValue: pick => pick.id,
    getLabel: formatFuturePickLabel
  }));
}

theirPicksBox.innerHTML = theirAssetGroups.join("");

  updateAssetSummaries();
}

function renderAssetGroup({ title, emptyText, items, inputClass, getValue, getLabel, getBadgeHtml }) {
  const list = items.length
    ? items.map(item => `
        <label class="pick-choice trade-asset-choice">
          <input
            type="checkbox"
            class="${inputClass}"
            value="${escapeHtml(getValue(item))}"
          />
          <span class="trade-asset-label">
            ${escapeHtml(getLabel(item))}
            ${typeof getBadgeHtml === "function" ? getBadgeHtml(item) : ""}
          </span>
        </label>
      `).join("")
    : `<p>${escapeHtml(emptyText)}</p>`;

  return `
    <div class="trade-asset-group">
      <h4>${escapeHtml(title)}</h4>
      ${list}
    </div>
  `;
}

function formatPickLabel(pick) {
  return `Pick ${pick[CONFIG.PICK_NUMBER_COL]}`;
}

function renderTradeBadgeImages(player) {
  const badges = [];

  if (player.is_fp_keeper === true) {
    const isSecondYear = Number(player.fp_keeper_year) === 2;
    badges.push(`
      <img
        class="badge-img badge-img-star trade-badge-img"
        src="${isSecondYear ? "img/badges/fp-confermato.webp" : "img/badges/fp.webp"}"
        alt="FP"
        title="${isSecondYear ? "Franchise Player confermato 2° anno" : "Franchise Player confermato 1° anno"}"
      >
    `);
  } else if (player.is_fp === true) {
    badges.push(`
      <img
        class="badge-img badge-img-star trade-badge-img"
        src="img/badges/fp.webp"
        alt="FP"
        title="Franchise Player"
      >
    `);
  }

  if (player.is_u21_keeper === true) {
    const isSecondYear = Number(player.u21_keeper_year) === 2;
    badges.push(`
      <img
        class="badge-img badge-img-star trade-badge-img"
        src="${isSecondYear ? "img/badges/u21-confermato-secondo-anno.webp" : "img/badges/u21-confermato.webp"}"
        alt="U21"
        title="${isSecondYear ? "U21 confermato 2° anno" : "U21 confermato 1° anno"}"
      >
    `);
  } else if (player.is_u21_slot === true) {
    badges.push(`
      <img
        class="badge-img badge-img-pill trade-badge-img"
        src="img/badges/u21.webp"
        alt="U21"
        title="Under 21"
      >
    `);
  }

  if (player.is_rfa_matched === true) {
    badges.push(`
      <img
        class="badge-img badge-img-pill trade-badge-img"
        src="img/badges/rfa.webp"
        alt="RFA"
        title="RFA pareggiato"
      >
    `);
  }

  if (player.is_top6_protected === true) {
    badges.push(`
      <img
        class="badge-img badge-img-protected trade-badge-img"
        src="img/badges/protetto-p6-lucchetto.webp"
        alt="P6"
        title="Giocatore protetto mercato: può generare priorità waiver speciale"
      >
    `);
  }

  return badges.join("");
}

function getTradeBadgeTokens(player) {
  const tokens = [];

  if (player.is_fp_keeper === true) {
    tokens.push(Number(player.fp_keeper_year) === 2 ? "[FP2]" : "[FP]");
  } else if (player.is_fp === true) {
    tokens.push("[FP]");
  }

if (player.is_u21_keeper === true) {
  tokens.push(Number(player.u21_keeper_year) === 2 ? "[U21K2]" : "[U21K]");
} else if (player.is_u21_slot === true) {
  tokens.push("[U21]");
}

  if (player.is_rfa_matched === true) {
    tokens.push("[RFA]");
  }

   if (player.is_top6_protected === true) {
  tokens.push("[P6]");
}

  return tokens.length ? ` ${tokens.join(" ")}` : "";
}

function formatTradeAssetLabelHtml(label) {
  let html = escapeHtml(label);

  const replacements = {
    "[FP2]": `<img class="badge-img badge-img-star trade-badge-img" src="img/badges/fp-confermato.webp" alt="FP" title="Franchise Player confermato 2° anno">`,
    "[FP]": `<img class="badge-img badge-img-star trade-badge-img" src="img/badges/fp.webp" alt="FP" title="Franchise Player">`,
    "[U21-2]": `<img class="badge-img badge-img-star trade-badge-img" src="img/badges/u21-confermato-secondo-anno.webp" alt="U21" title="U21 confermato 2° anno">`,
    "[U21]": `<img class="badge-img badge-img-pill trade-badge-img" src="img/badges/u21.webp" alt="U21" title="Under 21">`,
    "[RFA]": `<img class="badge-img badge-img-pill trade-badge-img" src="img/badges/rfa.webp" alt="RFA" title="RFA pareggiato">`,
     "[U21K2]": `<img class="badge-img badge-img-star trade-badge-img" src="img/badges/u21-confermato-secondo-anno.webp" alt="U21" title="U21 confermato 2° anno">`,
"[U21K]": `<img class="badge-img badge-img-star trade-badge-img" src="img/badges/u21-confermato.webp" alt="U21" title="U21 confermato 1° anno">`,
     "[P6]": `<img class="badge-img badge-img-protected trade-badge-img" src="img/badges/protetto-p6-lucchetto.webp" alt="P6" title="Giocatore protetto mercato: può generare priorità waiver speciale">`
  };

  Object.entries(replacements).forEach(([token, imageHtml]) => {
    html = html.replaceAll(escapeHtml(token), imageHtml);
  });

  return html;
}

function formatPlayerLabel(player) {
  const pickNumber = player[CONFIG.PICKS_PICK_NUMBER_COL];
  const playerName =
    player[CONFIG.PICKS_PLAYER_NAME_COL] ||
    player.player_name ||
    player.name ||
    "Giocatore senza nome";

  const role = player.role_mantra || player.role || "";
  const serieATeam = player.serie_a_team || "";

  if (isDraftPhase() && pickNumber) {
    return `${playerName} (pick ${pickNumber})`;
  }

  const details = [role, serieATeam].filter(Boolean).join(" · ");

  return details
    ? `${playerName} (${details})`
    : `${playerName}`;
}
function formatFuturePickLabel(pick) {
  const originalName = pick.original?.name || getTeamName(pick.original_team_id);
  const ownerName = pick.owner?.name || getTeamName(pick.owner_team_id);

  const originalShort = shortTeamName(originalName);
  const ownerShort = shortTeamName(ownerName);

  const tradedLabel = originalShort !== ownerShort
    ? ` · da ${originalShort}`
    : "";

 return `R${pick.round} ${futurePickSeason}${tradedLabel}`;
}

function shortTeamName(name) {
  const map = {
    "Bayern Christiansen": "Bayern",
    "Pandinicoccolosini": "Pandinico",
    "Minnesode Timberland": "Minnesode",
    "MinneSota Snakes": "Snakes",
    "Eintracht Franco 126": "Eintracht",
    "Fc Disoneste": "Disoneste",
    "Golden Knights": "Golden",
    "Team Bartowski": "Bartowski"
  };

  return map[name] || name;
}

function getTeamName(teamId) {
  const team = allTeams.find(t => t[CONFIG.TEAM_ID_COL] === teamId);
  return team ? team[CONFIG.TEAM_NAME_COL] : teamId;
}

/* ========= INVIO PROPOSTA ========= */

async function sendTradeProposal() {
  if (!isMarketCurrentlyOpen()) {
    showMessage("Mercato chiuso. Non puoi inviare proposte in questo momento.", "error");
    return;
  }

  clearMessage();

  const toTeamId = toTeamSelect.value;

  if (!toTeamId) {
    showMessage("Seleziona una squadra a cui proporre la trade.", "error");
    return;
  }

  const mySelectedPickNumbers = getCheckedValues(".my-pick-checkbox");
  const theirSelectedPickNumbers = getCheckedValues(".their-pick-checkbox");
  const mySelectedPlayerIds = getCheckedValues(".my-player-checkbox");
  const theirSelectedPlayerIds = getCheckedValues(".their-player-checkbox");
  const mySelectedFuturePickIds = getCheckedValues(".my-future-pick-checkbox");
  const theirSelectedFuturePickIds = getCheckedValues(".their-future-pick-checkbox");

  const myDraftSlotCount =
    mySelectedPickNumbers.length +
    mySelectedPlayerIds.length;

  const theirDraftSlotCount =
    theirSelectedPickNumbers.length +
    theirSelectedPlayerIds.length;

  const myAssetCount =
    mySelectedPickNumbers.length +
    mySelectedPlayerIds.length +
    mySelectedFuturePickIds.length;

  const theirAssetCount =
    theirSelectedPickNumbers.length +
    theirSelectedPlayerIds.length +
    theirSelectedFuturePickIds.length;

  const myPlayersOut = mySelectedPlayerIds.length;
  const myPlayersIn = theirSelectedPlayerIds.length;

  const theirPlayersOut = theirSelectedPlayerIds.length;
  const theirPlayersIn = mySelectedPlayerIds.length;

  const myPlayerBalance = myPlayersIn - myPlayersOut;
  const theirPlayerBalance = theirPlayersIn - theirPlayersOut;

  let tradeWarningMessage = "";

const myU21Out = countSelectedNormalU21Players(mySelectedPlayerIds);
const theirU21Out = countSelectedNormalU21Players(theirSelectedPlayerIds);

if (myU21Out !== theirU21Out) {
  showMessage(
    `Trade non valida: gli Under 21 normali possono essere scambiati solo con altri Under 21 normali e sempre in rapporto 1:1. In questa proposta ci sono ${myU21Out} U21 normali da una parte e ${theirU21Out} dall'altra.`,
    "error"
  );
  return;
}

  if (!myAssetCount || !theirAssetCount) {
    showMessage("La trade deve contenere almeno un asset per entrambe le squadre.", "error");
    return;
  }

  if (isDraftPhase() && myDraftSlotCount !== theirDraftSlotCount) {
    showMessage(
      "Durante il draft la trade deve mantenere lo stesso numero di slot rosa: giocatori già chiamati + pick del draft in corso devono essere pari da entrambe le parti. Le pick future non contano.",
      "error"
    );
    return;
  }

if (mySelectedFuturePickIds.length !== theirSelectedFuturePickIds.length) {
  showMessage(
    "Le pick future devono sempre essere scambiate con rapporto 1:1. Non puoi creare una squadra con pick future in più e un'altra con pick future in meno.",
    "error"
  );
  return;
}
   
  if (!isDraftPhase()) {
    const warnings = [];

     if (myPlayerBalance > 0) {
  warnings.push(
    `La tua squadra riceverà ${myPlayerBalance} giocatore/i netto/i: dovrai svincolare ${myPlayerBalance} giocatore/i prima che la trade venga completata.`
  );
}

    if (myPlayerBalance < 0) {
      warnings.push(
        `La tua squadra cederà ${Math.abs(myPlayerBalance)} giocatore/i netto/i: riceverai ${Math.abs(myPlayerBalance)} chiamata/e compensativa/e nel waiver.`
      );
    }

    if (theirPlayerBalance > 0) {
      warnings.push(
        `L'altra squadra riceverà ${theirPlayerBalance} giocatore/i netto/i: dovrà svincolare ${theirPlayerBalance} giocatore/i.`
      );
    }

    if (theirPlayerBalance < 0) {
      warnings.push(
        `L'altra squadra cederà ${Math.abs(theirPlayerBalance)} giocatore/i netto/i: riceverà ${Math.abs(theirPlayerBalance)} chiamata/e compensativa/e nel waiver.`
      );
    }

    tradeWarningMessage = warnings.join(" ");
  }

  const message = tradeMessageInput.value.trim();

  sendTradeBtn.disabled = true;
  sendTradeBtn.textContent = "Invio in corso...";

  try {
    await loadAssetsForTrade();

    const assetsToInsert = buildTradeAssets({
      proposalId: null,
      toTeamId,
      mySelectedPickNumbers,
      theirSelectedPickNumbers,
      mySelectedPlayerIds,
      theirSelectedPlayerIds,
      mySelectedFuturePickIds,
      theirSelectedFuturePickIds
    });

    const fromAssets = assetsToInsert.filter(asset => asset.side === "from");
    const toAssets = assetsToInsert.filter(asset => asset.side === "to");

    if (fromAssets.length !== myAssetCount || toAssets.length !== theirAssetCount) {
      showMessage("Trade bloccata: uno o più asset non sono più disponibili.", "error");
      return;
    }

    const { data: proposal, error: proposalError } = await supabase
      .from("trade_proposals")
      .insert({
  from_team: currentTeamId,
  to_team: toTeamId,
  draft_name: currentDraftName,
  trade_phase: currentTradePhase,
  status: "pending",
  message
      })
      .select()
      .single();

    if (proposalError) throw proposalError;

const sideCounters = {
  from: 0,
  to: 0
};

const assets = assetsToInsert.map(asset => {
  sideCounters[asset.side] += 1;

  return {
    ...asset,
    proposal_id: proposal.id,
    asset_order: sideCounters[asset.side]
  };
});

    const { error: assetsError } = await supabase
      .from("trade_assets")
      .insert(assets);

    if (assetsError) throw assetsError;

    await sendTradeNotification(toTeamId);

    if (tradeWarningMessage) {
      showMessage(
        `Proposta inviata correttamente. ${tradeWarningMessage}`,
        "error"
      );
    } else {
      showMessage("Proposta inviata correttamente.", "success");
    }

    tradeMessageInput.value = "";
    toTeamSelect.value = "";

    await refreshAll();

  } catch (err) {
    console.error(err);
    showMessage("Errore durante l’invio della proposta.", "error");
  } finally {
    sendTradeBtn.disabled = false;
    sendTradeBtn.textContent = "Invia proposta";
  }
}

function buildTradeAssets({
  proposalId,
  toTeamId,
  mySelectedPickNumbers,
  theirSelectedPickNumbers,
  mySelectedPlayerIds,
  theirSelectedPlayerIds,
  mySelectedFuturePickIds,
  theirSelectedFuturePickIds
}) {
  const assets = [];

  mySelectedPickNumbers.forEach(pickNumber => {
    const pick = allPicks.find(p =>
      String(p[CONFIG.PICK_NUMBER_COL]) === String(pickNumber) &&
      p[CONFIG.PICK_OWNER_COL] === currentTeamId
    );

    if (pick) {
      assets.push({
        proposal_id: proposalId,
        side: "from",
        asset_type: "pick",
        asset_id: String(pick[CONFIG.PICK_NUMBER_COL]),
        asset_label: formatPickLabel(pick)
      });
    }
  });

  mySelectedPlayerIds.forEach(playerId => {
    const player = allPickedPlayers.find(p =>
      String(p[CONFIG.PICKS_ID_COL]) === String(playerId) &&
      p[CONFIG.PICKS_OWNER_COL] === currentTeamId
    );

    if (player) {
      assets.push({
        proposal_id: proposalId,
        side: "from",
        asset_type: "player",
        asset_id: String(player[CONFIG.PICKS_ID_COL]),
        asset_label: formatPlayerLabel(player)
      });
    }
  });

  mySelectedFuturePickIds.forEach(pickId => {
    const pick = allFuturePicks.find(p =>
      String(p.id) === String(pickId) &&
      p.owner_team_id === currentTeamId
    );

    if (pick) {
      assets.push({
        proposal_id: proposalId,
        side: "from",
        asset_type: "future_pick",
        asset_id: String(pick.id),
        asset_label: formatFuturePickLabel(pick)
      });
    }
  });

  theirSelectedPickNumbers.forEach(pickNumber => {
    const pick = allPicks.find(p =>
      String(p[CONFIG.PICK_NUMBER_COL]) === String(pickNumber) &&
      p[CONFIG.PICK_OWNER_COL] === toTeamId
    );

    if (pick) {
      assets.push({
        proposal_id: proposalId,
        side: "to",
        asset_type: "pick",
        asset_id: String(pick[CONFIG.PICK_NUMBER_COL]),
        asset_label: formatPickLabel(pick)
      });
    }
  });

  theirSelectedPlayerIds.forEach(playerId => {
    const player = allPickedPlayers.find(p =>
      String(p[CONFIG.PICKS_ID_COL]) === String(playerId) &&
      p[CONFIG.PICKS_OWNER_COL] === toTeamId
    );

    if (player) {
      assets.push({
        proposal_id: proposalId,
        side: "to",
        asset_type: "player",
        asset_id: String(player[CONFIG.PICKS_ID_COL]),
        asset_label: formatPlayerLabel(player)
      });
    }
  });

  theirSelectedFuturePickIds.forEach(pickId => {
    const pick = allFuturePicks.find(p =>
      String(p.id) === String(pickId) &&
      p.owner_team_id === toTeamId
    );

    if (pick) {
      assets.push({
        proposal_id: proposalId,
        side: "to",
        asset_type: "future_pick",
        asset_id: String(pick.id),
        asset_label: formatFuturePickLabel(pick)
      });
    }
  });

  return assets;
}

/* ========= CARICAMENTO TRADE ========= */

async function loadTrades() {
  await loadPendingCutsMap();

  await Promise.all([
    loadPendingCutTrades(),
    loadReceivedTrades(),
    loadSentTrades(),
    loadCompletedTrades()
  ]);
}

async function loadPendingCutsMap() {
  const { data, error } = await supabase
    .from("trade_required_cuts")
    .select("*")
    .eq("status", "pending");

  if (error) {
    console.error("Errore caricamento pending cuts map:", error);
    window.pendingCutsByProposalId = new Map();
    return;
  }

  window.pendingCutsByProposalId = new Map(
    (data || []).map(row => [row.proposal_id, row])
  );
}

async function loadPendingCutTrades() {
  if (!pendingCutsPanel || !pendingCutsBox) return;

  const { data, error } = await supabase
    .from("trade_required_cuts")
    .select(`
      *,
      proposal:trade_proposals(*)
    `)
    .eq("team_id", currentTeamId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Errore caricamento pending cuts:", error);
    pendingCutsPanel.style.display = "block";
    pendingCutsBox.innerHTML = `<p>Errore nel caricamento degli svincoli obbligatori.</p>`;
    return;
  }

  const rows = data || [];

  if (!rows.length) {
    pendingCutsPanel.style.display = "none";
    pendingCutsBox.innerHTML = "";
    return;
  }

  pendingCutsPanel.style.display = "block";

  pendingCutsBox.innerHTML = rows.map(row => {
    const proposal = row.proposal;
    const remaining = Number(row.cuts_required || 0) - Number(row.cuts_done || 0);

    if (!proposal || remaining <= 0) return "";

    const fromName = getTeamName(proposal.from_team);
    const toName = getTeamName(proposal.to_team);

    return `
      <div class="trade-card pending-cuts-card">
        <h3>${escapeHtml(fromName)} → ${escapeHtml(toName)}</h3>

        <p>
          Hai una trade in attesa di svincolo.
          Devi svincolare <strong>${remaining}</strong> giocatore/i per completarla.
        </p>

        <div class="trade-actions">
          <button type="button" onclick="openPendingCutModal('${proposal.id}', ${remaining})">
            Svincola e completa trade
          </button>
        </div>
      </div>
    `;
  }).join("");
}

async function loadReceivedTrades() {
  const { data, error } = await supabase
    .from("trade_proposals")
    .select("*")
    .eq("to_team", currentTeamId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    receivedTradesBox.textContent = "Errore nel caricamento delle proposte ricevute.";
    return;
  }

  await renderTrades(receivedTradesBox, data || [], "received");
}

async function loadSentTrades() {
  const { data, error } = await supabase
    .from("trade_proposals")
    .select("*")
    .eq("from_team", currentTeamId)
    .in("status", ["pending", "accepted_pending_cuts"])
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    sentTradesBox.textContent = "Errore nel caricamento delle proposte inviate.";
    return;
  }

  await renderTrades(sentTradesBox, data || [], "sent");
}

async function loadCompletedTrades() {
  const { data, error } = await supabase
    .from("trade_proposals")
    .select("*")
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error(error);
    completedTradesBox.textContent = "Errore nel caricamento dello storico.";
    return;
  }

  const note = document.getElementById("historySummaryNote");

  if (note) {
    const count = data?.length || 0;
    note.textContent = count
      ? `${count} movimento${count > 1 ? "i" : ""} ufficiale${count > 1 ? "i" : ""}`
      : "Nessun movimento ufficiale";
  }

  await renderTrades(completedTradesBox, data || [], "completed");
}

async function renderTrades(container, trades, mode) {
  if (!trades.length) {
    container.innerHTML = `<p>Nessuna trade da mostrare.</p>`;
    return;
  }

  const proposalIds = trades.map(t => t.id);

  const { data: assets, error } = await supabase
    .from("trade_assets")
    .select("*")
    .in("proposal_id", proposalIds);

  if (error) {
    console.error(error);
    container.innerHTML = `<p>Errore nel caricamento dei dettagli trade.</p>`;
    return;
  }

  let cutRows = [];

  if (mode === "completed") {
    const { data: cutsData, error: cutsError } = await supabase
      .from("trade_cut_players")
      .select(`
        proposal_id,
        team_id,
        player_id,
        player:players(
          id,
          name,
          role,
          role_mantra,
          serie_a_team
        )
      `)
      .in("proposal_id", proposalIds);

    if (cutsError) {
      console.error("Errore caricamento svincoli trade:", cutsError);
    } else {
      cutRows = cutsData || [];
    }
  }

  container.innerHTML = trades.map(trade => {
    const tradeAssets = assets.filter(a => a.proposal_id === trade.id);

    const fromAssets = tradeAssets
      .filter(a => a.side === "from")
      .map(a => `<li>${formatTradeAssetLabelHtml(a.asset_label)}</li>`)
      .join("");

    const toAssets = tradeAssets
      .filter(a => a.side === "to")
      .map(a => `<li>${formatTradeAssetLabelHtml(a.asset_label)}</li>`)
      .join("");

    const tradeCuts = cutRows.filter(row => row.proposal_id === trade.id);

    const cutsHtml = tradeCuts.length
      ? `
        <div class="trade-cuts-box">
          <strong>Svincoli obbligatori:</strong>
          <ul>
            ${tradeCuts.map(row => {
              const playerData = Array.isArray(row.player)
                ? row.player[0]
                : row.player;

              const teamName = getTeamName(row.team_id);
              const playerName = playerData?.name || "Giocatore sconosciuto";
              const role = playerData?.role_mantra || playerData?.role || "";
              const serieATeam = playerData?.serie_a_team || "";
              const details = [role, serieATeam].filter(Boolean).join(" · ");

              return `
                <li>
                  ${escapeHtml(teamName)} ha svincolato:
                  <strong>${escapeHtml(playerName)}</strong>
                  ${details ? `(${escapeHtml(details)})` : ""}
                </li>
              `;
            }).join("")}
          </ul>
        </div>
      `
      : "";

    let actions = "";
    const pendingCutInfo = window.pendingCutsByProposalId?.get(trade.id);

    if (mode === "received") {
      actions = `
        <button type="button" onclick="acceptTrade('${trade.id}')">Accetta</button>
        <button type="button" onclick="rejectTrade('${trade.id}')">Rifiuta</button>
      `;
    }

    if (mode === "sent" && trade.status === "pending") {
      actions = `
        <button type="button" onclick="cancelTrade('${trade.id}')">Annulla proposta</button>
      `;
    }

    if (pendingCutInfo && pendingCutInfo.team_id === currentTeamId && pendingCutInfo.status === "pending") {
      const remainingCuts = pendingCutInfo.cuts_required - pendingCutInfo.cuts_done;

      actions += `
        <button type="button" onclick="openPendingCutModal('${trade.id}', ${remainingCuts})">
          Svincola e completa trade
        </button>
      `;
    }

    let statusLabel = trade.status;

    if (trade.status === "accepted") statusLabel = "Affare concluso";
    if (trade.status === "accepted_pending_cuts") statusLabel = "Accettata - in attesa di svincolo";
    if (trade.status === "rejected") statusLabel = "Rifiutata";
    if (trade.status === "cancelled") statusLabel = "Annullata";

    const dateLabel = trade.accepted_at
      ? formatDateTime(trade.accepted_at)
      : formatDateTime(trade.created_at);

    const fromName = getTeamName(trade.from_team);
    const toName = getTeamName(trade.to_team);

    return `
      <div class="trade-card">
        <h3>${escapeHtml(fromName)} → ${escapeHtml(toName)}</h3>

        <div>
          <strong>${escapeHtml(fromName)} offre:</strong>
          <ul>${fromAssets || "<li>Nessun asset</li>"}</ul>
        </div>

        <div>
          <strong>${escapeHtml(toName)} offre:</strong>
          <ul>${toAssets || "<li>Nessun asset</li>"}</ul>
        </div>

      ${trade.message && mode !== "completed" ? `<p><em>${escapeHtml(trade.message)}</em></p>` : ""}

        ${cutsHtml}

        <p class="trade-status ${escapeHtml(trade.status)}">
          ${escapeHtml(statusLabel)}
          ${mode === "completed" ? ` · ${escapeHtml(dateLabel)}` : ""}
        </p>

        <div class="trade-actions">
          ${actions}
        </div>
      </div>
    `;
  }).join("");
}

/* ========= AZIONI TRADE ========= */

async function acceptTrade(proposalId) {
  if (!isMarketCurrentlyOpen()) {
    alert("Mercato chiuso. Non puoi accettare trade in questo momento.");
    return;
  }

  try {
    await loadAssetsForTrade();

    const { data: proposal, error: proposalError } = await supabase
      .from("trade_proposals")
      .select("*")
      .eq("id", proposalId)
      .maybeSingle();

    if (proposalError) throw proposalError;

    if (!proposal) {
      alert("Proposta non trovata.");
      return;
    }

    const { data: assets, error: assetsError } = await supabase
      .from("trade_assets")
      .select("*")
      .eq("proposal_id", proposalId);

    if (assetsError) throw assetsError;

    const fromPlayerCount = (assets || []).filter(
      asset => asset.side === "from" && asset.asset_type === "player"
    ).length;

    const toPlayerCount = (assets || []).filter(
      asset => asset.side === "to" && asset.asset_type === "player"
    ).length;

    const receiverPlayerBalance = fromPlayerCount - toPlayerCount;

    let confirmMessage = "Confermi di voler accettare questa trade?";

    if (!isDraftPhase() && receiverPlayerBalance > 0) {
      confirmMessage =
        `Questa trade ti farà ricevere ${receiverPlayerBalance} giocatore/i netto/i. ` +
        `Dopo l'accettazione dovrai svincolare ${receiverPlayerBalance} giocatore/i per completarla. Confermi?`;
    }

    const ok = confirm(confirmMessage);
    if (!ok) return;

    const result = await acceptTradeRpc(proposalId);

    if (result?.status === "accepted_pending_cuts") {
      if (result.cut_team_id === currentTeamId) {
        openCutPlayersModal(proposalId, result.cuts_required, assets || [], proposal);
      } else {
        alert(
          `Trade accettata. La trade sarà conclusa quando ${result.cut_team_name} svincolerà ${result.cuts_required} giocatore/i.`
        );
      }
    } else {
      alert("Trade accettata. Pick e giocatori sono stati aggiornati.");
    }

    await refreshAll();

  } catch (err) {
    console.error(err);
    alert(err.message || "Errore durante l’accettazione della trade.");
  }
}

function openCutPlayersModal(proposalId, cutsCount, tradeAssets, proposal) {
  pendingAcceptProposalId = proposalId;
  requiredCutsCount = cutsCount;

  const myOutgoingSide =
    proposal?.from_team === currentTeamId
      ? "from"
      : "to";

  const outgoingPlayerIds = new Set(
    tradeAssets
      .filter(asset => asset.side === myOutgoingSide && asset.asset_type === "player")
      .map(asset => String(asset.asset_id))
  );

const cuttablePlayers = allPickedPlayers.filter(player => {
  const isMine = player[CONFIG.PICKS_OWNER_COL] === currentTeamId;
  const isOutgoing = outgoingPlayerIds.has(String(player[CONFIG.PICKS_ID_COL]));

  const isNormalU21 =
    player.is_u21_slot === true;

  return isMine && !isOutgoing && !isNormalU21;
});

  if (!cuttablePlayers.length) {
    alert("Non ci sono giocatori disponibili da svincolare. Gli Under 21 slot non possono essere svincolati.");
    return;
  }

  cutPlayersModalText.textContent =
    `Hai una trade in attesa di svincolo. ` +
    `Devi selezionare ${cutsCount} giocatore/i da svincolare per completarla.`;

  cutPlayersList.innerHTML = cuttablePlayers.map(player => `
    <label class="cut-player-choice">
      <input
        type="checkbox"
        class="cut-player-checkbox"
        value="${escapeHtml(player.player_id)}"
      />
      ${formatTradeAssetLabelHtml(formatPlayerLabel(player))}
    </label>
  `).join("");

  cutPlayersModalMessage.textContent = "";
  cutPlayersModal.style.display = "flex";
  document.body.classList.add("modal-open");
}

async function openPendingCutModal(proposalId, cutsCount) {
  try {
    await loadAssetsForTrade();

    const { data: proposal, error: proposalError } = await supabase
      .from("trade_proposals")
      .select("*")
      .eq("id", proposalId)
      .maybeSingle();

    if (proposalError) throw proposalError;

    if (!proposal) {
      alert("Trade non trovata.");
      return;
    }

    const { data: assets, error: assetsError } = await supabase
      .from("trade_assets")
      .select("*")
      .eq("proposal_id", proposalId);

    if (assetsError) throw assetsError;

    openCutPlayersModal(proposalId, cutsCount, assets || [], proposal);

  } catch (err) {
    console.error(err);
    alert(err.message || "Errore durante l'apertura degli svincoli.");
  }
}

function closeCutPlayersModal() {
  pendingAcceptProposalId = null;
  requiredCutsCount = 0;

  if (cutPlayersModal) {
    cutPlayersModal.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  if (cutPlayersList) {
    cutPlayersList.innerHTML = "";
  }

  if (cutPlayersModalMessage) {
    cutPlayersModalMessage.textContent = "";
    cutPlayersModalMessage.className = "";
  }
}

function countSelectedNormalU21Players(selectedPlayerIds) {
  return selectedPlayerIds.filter(playerId => {
    const player = allPickedPlayers.find(p =>
      String(p.id) === String(playerId) ||
      String(p.player_id) === String(playerId) ||
      String(p[CONFIG.PICKS_ID_COL]) === String(playerId)
    );

    return player?.is_u21_slot === true;
  }).length;
}

async function confirmTradeWithCuts() {
  const selectedCutPlayerIds = getCheckedValues(".cut-player-checkbox");

  if (selectedCutPlayerIds.length !== requiredCutsCount) {
    cutPlayersModalMessage.textContent =
      `Devi selezionare esattamente ${requiredCutsCount} giocatore/i da svincolare.`;
    cutPlayersModalMessage.className = "error-message";
    return;
  }

  const ok = confirm(
    `Confermi lo svincolo di ${selectedCutPlayerIds.length} giocatore/i? La trade verrà completata subito dopo.`
  );

  if (!ok) return;

  confirmCutPlayersBtn.disabled = true;
  confirmCutPlayersBtn.textContent = "Svincolo in corso...";

  try {
    const { data, error } = await supabase.rpc("cut_trade_players", {
      p_proposal_id: pendingAcceptProposalId,
      p_player_ids: selectedCutPlayerIds
    });

    if (error) throw error;

    closeCutPlayersModal();

    if (data?.trade_completed) {
      alert(`Svincoli completati. Trade conclusa.`);
    } else {
      alert(`Svincoli registrati.`);
    }

    await refreshAll();

  } catch (err) {
    console.error(err);
    cutPlayersModalMessage.textContent =
      err.message || "Errore durante lo svincolo.";
    cutPlayersModalMessage.className = "error-message";
  } finally {
    confirmCutPlayersBtn.disabled = false;
    confirmCutPlayersBtn.textContent = "Conferma e accetta trade";
  }
}

async function acceptTradeRpc(proposalId) {
  const { data, error } = await supabase.rpc("accept_trade", {
    p_proposal_id: proposalId
  });

  if (error) {
    console.error("ERRORE ACCEPT_TRADE RPC:", error);
    alert(JSON.stringify(error, null, 2));
    throw error;
  }

  return data;
}

async function moveAssetToTeam(asset, newTeamId, draftName) {
  if (asset.asset_type === "pick") {
    const { data, error } = await supabase
      .from(CONFIG.DRAFT_TABLE)
      .update({ [CONFIG.PICK_OWNER_COL]: newTeamId })
      .eq(CONFIG.DRAFT_NAME_COL, draftName)
      .eq(CONFIG.PICK_NUMBER_COL, Number(asset.asset_id))
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      throw new Error(`Nessuna pick aggiornata: ${asset.asset_label}`);
    }

    return;
  }

if (asset.asset_type === "player") {
  const { data: playerPick, error: readError } = await supabase
    .from(CONFIG.PICKS_TABLE)
    .select("id, draft_name, pick_number, team_id, player_name")
    .eq("id", asset.asset_id)
    .maybeSingle();

  if (readError) throw readError;

  if (!playerPick) {
    throw new Error(`Giocatore non trovato: ${asset.asset_label}`);
  }

  const { data: updatedPlayer, error: playerError } = await supabase
    .from(CONFIG.PICKS_TABLE)
    .update({ [CONFIG.PICK_OWNER_COL]: newTeamId })
    .eq("id", asset.asset_id)
    .select();

  if (playerError) throw playerError;

  if (!updatedPlayer || updatedPlayer.length === 0) {
    throw new Error(`Nessun giocatore aggiornato: ${asset.asset_label}`);
  }

  const { data: updatedOrder, error: orderError } = await supabase
    .from(CONFIG.DRAFT_TABLE)
    .update({ [CONFIG.PICK_OWNER_COL]: newTeamId })
    .eq(CONFIG.DRAFT_NAME_COL, playerPick.draft_name)
    .eq(CONFIG.PICK_NUMBER_COL, Number(playerPick.pick_number))
    .select();

  if (orderError) throw orderError;

  if (!updatedOrder || updatedOrder.length === 0) {
    throw new Error(`Draft order non aggiornato per ${asset.asset_label}`);
  }

  return;
}
  throw new Error(`Asset type non gestito: ${asset.asset_type}`);
}

function checkOwnershipBeforeTrade(proposal, fromAssets, toAssets) {
  return fromAssets.every(asset => assetBelongsToTeam(asset, proposal.from_team)) &&
    toAssets.every(asset => assetBelongsToTeam(asset, proposal.to_team));
}

function assetBelongsToTeam(asset, teamId) {
  if (asset.asset_type === "pick") {
    const pick = allPicks.find(p =>
      String(p[CONFIG.PICK_NUMBER_COL]) === String(asset.asset_id)
    );

    return Boolean(pick && pick[CONFIG.PICK_OWNER_COL] === teamId);
  }

  if (asset.asset_type === "player") {
    const player = allPickedPlayers.find(p =>
      String(p[CONFIG.PICKS_ID_COL]) === String(asset.asset_id)
    );

    return Boolean(player && player[CONFIG.PICKS_OWNER_COL] === teamId);
  }

  return false;
}

async function cancelProposalBySystem(proposalId) {
  const { error } = await supabase
    .from("trade_proposals")
    .update({ status: "cancelled" })
    .eq("id", proposalId);

  if (error) throw error;
}

async function rejectTrade(proposalId) {
  const ok = confirm("Vuoi rifiutare questa proposta?");
  if (!ok) return;

  const { error } = await supabase
    .from("trade_proposals")
    .update({ status: "rejected" })
    .eq("id", proposalId)
    .eq("to_team", currentTeamId)
    .eq("status", "pending");

  if (error) {
    console.error(error);
    alert("Errore durante il rifiuto della proposta.");
    return;
  }

  await refreshAll();
}

async function cancelTrade(proposalId) {
  const ok = confirm("Vuoi annullare questa proposta?");
  if (!ok) return;

  const { error } = await supabase
    .from("trade_proposals")
    .update({ status: "cancelled" })
    .eq("id", proposalId)
    .eq("from_team", currentTeamId)
    .eq("status", "pending");

  if (error) {
    console.error(error);
    alert("Errore durante l’annullamento della proposta.");
    return;
  }

  await refreshAll();
}

/* ========= UTILS ========= */

function updateAssetSummaries() {
  const myPickCount = getCheckedValues(".my-pick-checkbox").length;
  const theirPickCount = getCheckedValues(".their-pick-checkbox").length;
  const myPlayerCount = getCheckedValues(".my-player-checkbox").length;
  const theirPlayerCount = getCheckedValues(".their-player-checkbox").length;
  const myFuturePickCount = getCheckedValues(".my-future-pick-checkbox").length;
  const theirFuturePickCount = getCheckedValues(".their-future-pick-checkbox").length;

  const myCount = myPickCount + myPlayerCount + myFuturePickCount;
  const theirCount = theirPickCount + theirPlayerCount + theirFuturePickCount;

  if (myPicksSummary) {
    myPicksSummary.textContent = myCount
      ? `${myCount} asset selezionat${myCount > 1 ? "i" : "o"} (${myPickCount} pick, ${myPlayerCount} giocatori, ${myFuturePickCount} future)`
      : "Seleziona i tuoi asset";
  }

  if (theirPicksSummary) {
    const selectedTeamId = toTeamSelect.value;
    const selectedTeamName = selectedTeamId ? getTeamName(selectedTeamId) : "";

    theirPicksSummary.textContent = theirCount
      ? `${theirCount} asset selezionat${theirCount > 1 ? "i" : "o"} (${theirPickCount} pick, ${theirPlayerCount} giocatori, ${theirFuturePickCount} future)`
      : selectedTeamId
        ? `Asset disponibili di ${selectedTeamName}`
        : "Seleziona prima una squadra";
  }
}

   function renderTradeAdminPanel() {
  if (!tradeAdminPanel) return;

  if (!currentIsAdmin) {
    tradeAdminPanel.style.display = "none";
    return;
  }

  tradeAdminPanel.style.display = "block";

  if (adminTradePhase) {
    adminTradePhase.value = currentTradePhase;
  }

  if (adminMarketOpen) {
    adminMarketOpen.checked = marketOpen;
  }

  if (adminFutureSeason) {
    adminFutureSeason.value = futurePickSeason;
  }
      if (adminMarketOpenAt) {
  adminMarketOpenAt.value = toDatetimeLocalValue(marketOpenAt);
}

if (adminMarketCloseAt) {
  adminMarketCloseAt.value = toDatetimeLocalValue(marketCloseAt);
}
}

function toDatetimeLocalValue(value) {
  if (!value) return "";

  const date = new Date(value);
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60000);

  return localDate.toISOString().slice(0, 16);
}

async function saveTradeSettings() {
  if (!currentIsAdmin) return;

  const nextPhase = adminTradePhase?.value || "draft";
  const nextMarketOpen = !!adminMarketOpen?.checked;
  const nextSeason = Number(adminFutureSeason?.value || futurePickSeason || 2027);
   const nextMarketOpenAt = adminMarketOpenAt?.value
  ? new Date(adminMarketOpenAt.value).toISOString()
  : null;

const nextMarketCloseAt = adminMarketCloseAt?.value
  ? new Date(adminMarketCloseAt.value).toISOString()
  : null;

  if (!Number.isFinite(nextSeason) || nextSeason < 2026) {
    showTradeSettingsMessage("Stagione pick future non valida.", "error");
    return;
  }

  saveTradeSettingsBtn.disabled = true;
  saveTradeSettingsBtn.textContent = "Salvataggio...";

  try {
    const { error } = await supabase
      .from("trade_settings")
 .update({
  active_phase: nextPhase,
  market_open: nextMarketOpen,
  future_pick_season: nextSeason,
  market_open_at: nextMarketOpenAt,
  market_close_at: nextMarketCloseAt,
  updated_at: new Date().toISOString()
})
      .eq("id", 1);

    if (error) throw error;

    currentTradePhase = nextPhase;
    marketOpen = nextMarketOpen;
    futurePickSeason = nextSeason;
     marketOpenAt = nextMarketOpenAt;
marketCloseAt = nextMarketCloseAt;

    showTradeSettingsMessage("Impostazioni mercato salvate.", "success");

    await refreshAll();
    renderTeamSelect();
    renderMyAssets();
    applyMarketOpenState();
    renderTradeAdminPanel();

    if (activeDraftLabel) {
      activeDraftLabel.textContent = `${getTradePhaseLabel()} · ${currentDraftName}`;
    }
  } catch (err) {
    console.error(err);
    showTradeSettingsMessage("Errore durante il salvataggio delle impostazioni.", "error");
  } finally {
    saveTradeSettingsBtn.disabled = false;
    saveTradeSettingsBtn.textContent = "Salva impostazioni mercato";
  }
}

function showTradeSettingsMessage(text, type) {
  if (!tradeSettingsMessage) return;

  tradeSettingsMessage.textContent = text;
  tradeSettingsMessage.className = type === "success" ? "success-message" : "error-message";
}

   function applyMarketOpenState() {
 const locked = !isMarketCurrentlyOpen();

  if (sendTradeBtn) {
    sendTradeBtn.disabled = locked;
    sendTradeBtn.textContent = locked ? "Mercato chiuso" : "Invia proposta";
  }

  if (tradeApp) {
    const inputs = tradeApp.querySelectorAll("select, textarea, input, button");

    inputs.forEach(el => {
      if (tradeAdminPanel && tradeAdminPanel.contains(el)) return;
      el.disabled = locked;
    });
  }

  const actionButtons = document.querySelectorAll(".trade-actions button");
  actionButtons.forEach(btn => {
    btn.disabled = locked;
  });

  if (locked) {
  userInfo.textContent = getMarketClosedMessage();
} else if (currentUser?.email) {
  userInfo.textContent = `Accesso effettuato come ${currentUser.email}`;
}

      if (teamDashboardStatus) {
  teamDashboardStatus.textContent = locked ? "Mercato chiuso" : "Mercato aperto";
  teamDashboardStatus.classList.toggle("closed", locked);
}
}

function getMarketClosedMessage() {
  const now = new Date();

  if (!marketOpen) {
    return "Mercato chiuso manualmente. Puoi consultare le trade, ma non crearne o accettarne.";
  }

  if (marketOpenAt && now < new Date(marketOpenAt)) {
    return `Mercato non ancora aperto. Apertura prevista: ${formatDateTime(marketOpenAt)}.`;
  }

  if (marketCloseAt && now > new Date(marketCloseAt)) {
    return `Mercato chiuso. Chiusura avvenuta: ${formatDateTime(marketCloseAt)}.`;
  }

  return "Mercato chiuso. Puoi consultare le trade, ma non crearne o accettarne.";
}

async function refreshAll() {
  await loadAssetsForTrade();
  renderMyAssets();
  renderTheirAssets();
  await loadTrades();
}

function getCheckedValues(selector) {
  return [...document.querySelectorAll(selector)]
    .filter(input => input.checked)
    .map(input => input.value);
}

function showMessage(text, type) {
  tradeMessage.textContent = text;
  tradeMessage.className = type === "success" ? "success-message" : "error-message";
}

function clearMessage() {
  tradeMessage.textContent = "";
  tradeMessage.className = "";
}

function formatDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

async function sendTradeNotification(toTeamId) {
  try {
    console.log("📣 Invio notifica trade a team:", toTeamId);

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      console.warn("Sessione non valida per inviare la notifica trade.", sessionError);
      return;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/send-trade-notification`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionData.session.access_token}`,
          "apikey": supabaseKey
        },
        body: JSON.stringify({
          to_team: toTeamId,
          from_team_name: currentTeamName
        })
      }
    );

    let result = null;

    try {
      result = await response.json();
    } catch (jsonError) {
      result = { error: "Risposta non JSON", details: String(jsonError) };
    }

    console.log("📬 Risposta send-trade-notification:", response.status, result);

    if (!response.ok) {
      console.warn("Notifica trade non inviata:", result);
    }
  } catch (err) {
    console.warn("Errore notifica trade:", err);
  }
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

window.acceptTrade = acceptTrade;
window.rejectTrade = rejectTrade;
window.cancelTrade = cancelTrade;
window.openPendingCutModal = openPendingCutModal;
