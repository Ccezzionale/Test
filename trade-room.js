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

const cutPlayersModal = document.getElementById("cutPlayersModal");
const cutPlayersModalText = document.getElementById("cutPlayersModalText");
const cutPlayersList = document.getElementById("cutPlayersList");
const confirmCutPlayersBtn = document.getElementById("confirmCutPlayersBtn");
const cancelCutPlayersBtn = document.getElementById("cancelCutPlayersBtn");
const cutPlayersModalMessage = document.getElementById("cutPlayersModalMessage");

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

  // Sono scambiabili solo i giocatori già chiamati.
  allPickedPlayers = data || [];
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

      const conferenceLabel = team.conference === currentTeamConference
        ? "stessa Conference"
        : "altra Conference";

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
    getLabel: formatPlayerLabel
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
    getLabel: formatPlayerLabel
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

function renderAssetGroup({ title, emptyText, items, inputClass, getValue, getLabel }) {
  const list = items.length
    ? items.map(item => `
        <label class="pick-choice trade-asset-choice">
          <input
            type="checkbox"
            class="${inputClass}"
            value="${escapeHtml(getValue(item))}"
          />
          ${escapeHtml(getLabel(item))}
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

function formatPlayerLabel(player) {
  const pickNumber = player[CONFIG.PICKS_PICK_NUMBER_COL];
  const playerName = player[CONFIG.PICKS_PLAYER_NAME_COL] || "Giocatore senza nome";

  return pickNumber
    ? `${playerName} (pick ${pickNumber})`
    : playerName;
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

   if (!isDraftPhase() && mySelectedFuturePickIds.length !== theirSelectedFuturePickIds.length) {
  showMessage(
    "Le pick future devono sempre essere scambiate con rapporto 1:1. Puoi scambiare giocatori in modo sbilanciato, ma non puoi creare una squadra con una pick futura in più e un'altra con una pick futura in meno.",
    "error"
  );
  return;
}

if (!isDraftPhase()) {
  const warnings = [];

  if (myPlayerBalance > 0) {
    warnings.push(
      `La tua squadra riceverà ${myPlayerBalance} giocatore/i netto/i: dovrai svincolare ${myPlayerBalance} giocatore/i.`
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
        status: "pending",
        message
      })
      .select()
      .single();

    if (proposalError) throw proposalError;

    const assets = assetsToInsert.map(asset => ({
      ...asset,
      proposal_id: proposal.id
    }));

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
  await Promise.all([
    loadReceivedTrades(),
    loadSentTrades(),
    loadCompletedTrades()
  ]);
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
    .eq("status", "pending")
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
    .or(`from_team.eq.${currentTeamId},to_team.eq.${currentTeamId}`)
    .order("accepted_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error(error);
    completedTradesBox.textContent = "Errore nel caricamento dello storico.";
    return;
  }

  const note = document.getElementById("historySummaryNote");

  if (note) {
    const count = data?.length || 0;
    note.textContent = count
      ? `${count} trade conclusa${count > 1 ? "e" : ""}`
      : "Nessuna trade conclusa";
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

  container.innerHTML = trades.map(trade => {
    const tradeAssets = assets.filter(a => a.proposal_id === trade.id);

    const fromAssets = tradeAssets
      .filter(a => a.side === "from")
      .map(a => `<li>${escapeHtml(a.asset_label)}</li>`)
      .join("");

    const toAssets = tradeAssets
      .filter(a => a.side === "to")
      .map(a => `<li>${escapeHtml(a.asset_label)}</li>`)
      .join("");

    let actions = "";

    if (mode === "received") {
      actions = `
        <button type="button" onclick="acceptTrade('${trade.id}')">Accetta</button>
        <button type="button" onclick="rejectTrade('${trade.id}')">Rifiuta</button>
      `;
    }

    if (mode === "sent") {
      actions = `
        <button type="button" onclick="cancelTrade('${trade.id}')">Annulla proposta</button>
      `;
    }

    let statusLabel = trade.status;

    if (trade.status === "accepted") statusLabel = "Affare concluso";
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

        ${trade.message ? `<p><em>${escapeHtml(trade.message)}</em></p>` : ""}

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

    if (!isDraftPhase() && receiverPlayerBalance > 0) {
      openCutPlayersModal(proposalId, receiverPlayerBalance, assets || []);
      return;
    }

    const ok = confirm("Confermi di voler accettare questa trade?");
    if (!ok) return;

    await acceptTradeRpc(proposalId, []);

  } catch (err) {
    console.error(err);
    alert(err.message || "Errore durante l’accettazione della trade.");
  }
}

function openCutPlayersModal(proposalId, cutsCount, tradeAssets) {
  pendingAcceptProposalId = proposalId;
  requiredCutsCount = cutsCount;

  const outgoingPlayerIds = new Set(
    tradeAssets
      .filter(asset => asset.side === "to" && asset.asset_type === "player")
      .map(asset => String(asset.asset_id))
  );

  const cuttablePlayers = allPickedPlayers.filter(player =>
    player[CONFIG.PICKS_OWNER_COL] === currentTeamId &&
    !outgoingPlayerIds.has(String(player[CONFIG.PICKS_ID_COL]))
  );

  if (!cuttablePlayers.length) {
    alert("Non ci sono giocatori disponibili da svincolare.");
    return;
  }

  cutPlayersModalText.textContent =
    `Questa trade ti farebbe ricevere ${cutsCount} giocatore/i netto/i. ` +
    `Per accettarla devi selezionare ${cutsCount} giocatore/i da svincolare.`;

  cutPlayersList.innerHTML = cuttablePlayers.map(player => `
    <label class="cut-player-choice">
      <input
        type="checkbox"
        class="cut-player-checkbox"
        value="${escapeHtml(player.player_id)}"
      />
      ${escapeHtml(formatPlayerLabel(player))}
    </label>
  `).join("");

  cutPlayersModalMessage.textContent = "";
  cutPlayersModal.style.display = "flex";
   document.body.classList.add("modal-open");
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
  }
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
    `Confermi la trade e lo svincolo di ${selectedCutPlayerIds.length} giocatore/i?`
  );

  if (!ok) return;

  confirmCutPlayersBtn.disabled = true;
  confirmCutPlayersBtn.textContent = "Accettazione in corso...";

  try {
    await acceptTradeRpc(pendingAcceptProposalId, selectedCutPlayerIds);
    closeCutPlayersModal();
  } catch (err) {
    console.error(err);
    cutPlayersModalMessage.textContent =
      err.message || "Errore durante l’accettazione della trade.";
    cutPlayersModalMessage.className = "error-message";
  } finally {
    confirmCutPlayersBtn.disabled = false;
    confirmCutPlayersBtn.textContent = "Conferma e accetta trade";
  }
}

async function acceptTradeRpc(proposalId, cutPlayerIds = []) {
  const { error } = await supabase.rpc("accept_trade", {
    p_proposal_id: proposalId
  });

  if (error) {
    console.error("ERRORE ACCEPT_TRADE RPC:", error);
    alert(JSON.stringify(error, null, 2));
    throw error;
  }

  const { data: proposal, error: proposalError } = await supabase
    .from("trade_proposals")
    .select("from_team, to_team")
    .eq("id", proposalId)
    .single();

  if (proposalError) throw proposalError;

  const { data: assets, error: assetsError } = await supabase
    .from("trade_assets")
    .select("*")
    .eq("proposal_id", proposalId);

  if (assetsError) throw assetsError;

  const fromPlayers = (assets || []).filter(
    a => a.side === "from" && a.asset_type === "player"
  ).length;

  const toPlayers = (assets || []).filter(
    a => a.side === "to" && a.asset_type === "player"
  ).length;

  const fromTeamBalance = toPlayers - fromPlayers;
  const toTeamBalance = fromPlayers - toPlayers;

  const compensatoryRows = [];

  if (fromTeamBalance < 0) {
    compensatoryRows.push({
      team_id: proposal.from_team,
      proposal_id: proposalId,
      count: Math.abs(fromTeamBalance),
      status: "pending"
    });
  }

  if (toTeamBalance < 0) {
    compensatoryRows.push({
      team_id: proposal.to_team,
      proposal_id: proposalId,
      count: Math.abs(toTeamBalance),
      status: "pending"
    });
  }

  if (compensatoryRows.length) {
    const { error: compError } = await supabase
      .from("waiver_compensatory_calls")
      .insert(compensatoryRows);

    if (compError) {
      console.error("ERRORE CREAZIONE COMPENSATIVE:", compError);
      alert("Trade accettata, ma errore durante la creazione delle chiamate compensative.");
      throw compError;
    }
  }

  if (cutPlayerIds.length) {
    const { error: cutError } = await supabase
      .from("players")
      .update({
        owner_team_id: null,
        status: "free"
      })
      .in("id", cutPlayerIds);

    if (cutError) {
      console.error("ERRORE SVINCOLI POST-TRADE:", cutError);
      alert("Trade accettata, ma errore durante lo svincolo dei giocatori. Controlla Supabase.");
      throw cutError;
    }

    const { error: cutDraftPickError } = await supabase
      .from("draft_picks")
      .update({
        team_id: null
      })
      .in("player_id", cutPlayerIds);

    if (cutDraftPickError) {
      console.error("ERRORE RESET DRAFT_PICKS POST-SVINCOLO:", cutDraftPickError);
      alert("Giocatori svincolati, ma errore durante l'aggiornamento delle draft_picks.");
      throw cutDraftPickError;
    }

    alert(`Trade accettata. ${cutPlayerIds.length} giocatore/i svincolato/i correttamente.`);
  } else {
    alert("Trade accettata. Pick e giocatori sono stati aggiornati.");
  }

  await refreshAll();
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
