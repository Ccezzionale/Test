import { supabase } from "./supabase.js";
import { loadResultsRows } from "./results-source.js";

/* ===============================
   ELEMENTI BASE
================================ */

const teamNameEl = document.getElementById("teamName");
const teamConferenceEl = document.getElementById("teamConference");
const activePhaseEl = document.getElementById("activePhase");
const activeWeekEl = document.getElementById("activeWeek");

const myWaiverCallsEl = document.getElementById("myWaiverCalls");
const callMessageEl = document.getElementById("callMessage");

const myCompensatoryCallsEl = document.getElementById("myCompensatoryCalls");
const allCompensatoryCallsEl = document.getElementById("allCompensatoryCalls");
const calculateHighCompensatoryBtn = document.getElementById("calculateHighCompensatoryBtn");
const calculateCompensatoryBtn = document.getElementById("calculateCompensatoryBtn");

const allCallsEl = document.getElementById("allCalls");
const publicWaiverOrderEl = document.getElementById("publicWaiverOrder");
const injuryReserveListEl = document.getElementById("injuryReserveList");

const adminPanel = document.getElementById("adminPanel");
const generateWaiverOrderBtn = document.getElementById("generateWaiverOrderBtn");
const saveWaiverOrderBtn = document.getElementById("saveWaiverOrderBtn");

const calculateSlot1Btn = document.getElementById("calculateSlot1Btn");
const calculateSlot1SBtn = document.getElementById("calculateSlot1SBtn");
const calculateSlot2Btn = document.getElementById("calculateSlot2Btn");
const calculateSlot2SBtn = document.getElementById("calculateSlot2SBtn");

const waiverOrderMessageEl = document.getElementById("waiverOrderMessage");
const waiverOrderAdminEl = document.getElementById("waiverOrderAdmin");

const searchInput = document.getElementById("searchInput");
const freeAgentsTableBody = document.querySelector("#freeAgentsTable tbody");
const roleFilter = document.getElementById("roleFilter");
const serieATeamFilter = document.getElementById("serieATeamFilter");
const u21Filter = document.getElementById("u21Filter");

const activePhaseSelect = document.getElementById("activePhaseSelect");
const activeWeekInput = document.getElementById("activeWeekInput");

const highCompensatoryOpenInput = document.getElementById("highCompensatoryOpenInput");
const highCompensatoryCloseInput = document.getElementById("highCompensatoryCloseInput");

const slot1OpenInput = document.getElementById("slot1OpenInput");
const slot1CloseInput = document.getElementById("slot1CloseInput");

const slot1SOpenInput = document.getElementById("slot1SOpenInput");
const slot1SCloseInput = document.getElementById("slot1SCloseInput");

const slot2OpenInput = document.getElementById("slot2OpenInput");
const slot2CloseInput = document.getElementById("slot2CloseInput");

const slot2SOpenInput = document.getElementById("slot2SOpenInput");
const slot2SCloseInput = document.getElementById("slot2SCloseInput");

const compensatoryOpenInput = document.getElementById("compensatoryOpenInput");
const compensatoryCloseInput = document.getElementById("compensatoryCloseInput");

const adminCompTeamSelect = document.getElementById("adminCompTeamSelect");
const adminCompTierSelect = document.getElementById("adminCompTierSelect");
const adminCompPriorityInput = document.getElementById("adminCompPriorityInput");
const adminCompModeSelect = document.getElementById("adminCompModeSelect");
const adminCompReasonSelect = document.getElementById("adminCompReasonSelect");
const adminCompReasonNoteInput = document.getElementById("adminCompReasonNoteInput");
const addCompensatoryBtn = document.getElementById("addCompensatoryBtn");

const setStandardFridayBtn = document.getElementById("setStandardFridayBtn");
const setPlayoffFridayBtn = document.getElementById("setPlayoffFridayBtn");
const saveWaiverSettingsBtn = document.getElementById("saveWaiverSettingsBtn");
const settingsMessageEl = document.getElementById("settingsMessage");

const fantacalcioFileInput = document.getElementById("fantacalcioFileInput");
const applyFantacalcioListoneBtn = document.getElementById("applyFantacalcioListoneBtn");
const fantacalcioListoneMessage = document.getElementById("fantacalcioListoneMessage");
const fantacalcioListonePreview = document.getElementById("fantacalcioListonePreview");

const teamLogoEl = document.getElementById("teamLogo");
const heroPriorityEl = document.getElementById("heroPriority");

const adminViewAsSelect = document.getElementById("adminViewAsSelect");
const adminViewAsBtn = document.getElementById("adminViewAsBtn");
const adminViewAsResetBtn = document.getElementById("adminViewAsResetBtn");
const adminViewAsBanner = document.getElementById("adminViewAsBanner");
const adminViewAsBannerTeam = document.getElementById("adminViewAsBannerTeam");
const adminViewAsBannerResetBtn = document.getElementById("adminViewAsBannerResetBtn");

const waiverTradePartnerSelect = document.getElementById("waiverTradePartnerSelect");
const waiverTradeOfferAssetsEl = document.getElementById("waiverTradeOfferAssets");
const waiverTradeRequestAssetsEl = document.getElementById("waiverTradeRequestAssets");
const waiverTradeNoteInput = document.getElementById("waiverTradeNoteInput");
const waiverTradeSubmitBtn = document.getElementById("waiverTradeSubmitBtn");
const waiverTradeMessageEl = document.getElementById("waiverTradeMessage");
const waiverTradeReceivedEl = document.getElementById("waiverTradeReceived");
const waiverTradeSentEl = document.getElementById("waiverTradeSent");
const waiverTradeHistoryEl = document.getElementById("waiverTradeHistory");
const waiverTradeReceivedCountEl = document.getElementById("waiverTradeReceivedCount");
const waiverTradeSentCountEl = document.getElementById("waiverTradeSentCount");
const mobileTradesBadge = document.getElementById("mobileTradesBadge");

/* ===============================
   STATO APP
================================ */

let currentTeam = null;
let currentSettings = null;
let currentUserEmail = null;
let currentUserIsAdmin = false;
let currentRealTeam = null;

const WAIVER_VIEW_AS_STORAGE_KEY = "waiver_admin_view_as_team_id";

let teamsCache = [];
let teamMap = {};
let waiverOrderRows = [];
let myOrderRows = [];
let mySavedCalls = [];
let freeAgents = [];
let myOwnedPlayers = [];
let myReplacementCandidates = [];
let freeAgentsSortKey = "name";
let freeAgentsSortDirection = "asc";

let activeWaiverOrderId = null;
let draggedAdminOrderId = null;
let draggedAdminGroupKey = null;

let myCompensatoryCalls = [];
let activeCompensatoryCallId = null;
let activeInjuryReserveRows = [];
let currentTeamIrPlayerIds = new Set();

let playerSelectionOrigin = null;

let pendingFantacalcioRows = [];
let pendingFantacalcioFileName = "";

const WAIVER_TRADE_FUTURE_WEEKS = 6;
let waiverTradeAssets = [];
let waiverCallTrades = [];

function isMobileWaiverView() {
  return window.matchMedia("(max-width: 768px)").matches;
}

function activateWaiverMobileTab(tabName) {
  const tabButtons = document.querySelectorAll("[data-waiver-mobile-tab]");
  const panels = document.querySelectorAll("[data-waiver-mobile-panel]");

  if (!tabButtons.length || !panels.length) return;

  tabButtons.forEach(button => {
    const isActive = button.dataset.waiverMobileTab === tabName;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", String(isActive));
  });

  panels.forEach(panel => {
    const isActive = panel.dataset.waiverMobilePanel === tabName;
    panel.classList.toggle("mobile-panel-active", isActive);
  });
}

function syncWaiverMobileTabColumns() {
  const tabs = document.querySelector(".waiver-mobile-tabs");
  if (!tabs) return;

  const visibleCount = Array.from(
    tabs.querySelectorAll("[data-waiver-mobile-tab]")
  ).filter(button => getComputedStyle(button).display !== "none").length;

  tabs.style.setProperty(
    "--waiver-mobile-tab-count",
    String(Math.max(visibleCount, 1))
  );
}

function scrollWaiverElementIntoView(element, block = "start") {
  if (!element) return;

  requestAnimationFrame(() => {
    element.scrollIntoView({
      behavior: "smooth",
      block
    });
  });
}

function setPlayerSelectionContext(text = "") {
  const contextEl = document.getElementById("playerSelectionContext");
  if (!contextEl) return;

  if (!text) {
    contextEl.hidden = true;
    contextEl.textContent = "";
    return;
  }

  contextEl.hidden = false;
  contextEl.textContent = text;
}

function clearPlayerSelectionState() {
  activeWaiverOrderId = null;
  activeCompensatoryCallId = null;
  playerSelectionOrigin = null;

  document
    .querySelectorAll(".dynamic-call-card.active-call-target")
    .forEach(card => card.classList.remove("active-call-target"));

  setPlayerSelectionContext("");
}

function beginWaiverPlayerSelection(orderId) {
  const orderRow = myOrderRows.find(
    row => String(row.id) === String(orderId)
  );

  if (!orderRow || !isSlotOpen(orderRow.slot)) {
    setMessage("Questa chiamata non è disponibile in questo momento.", true);
    return;
  }

  setActiveCallCard(orderId);

  playerSelectionOrigin = {
    type: "waiver",
    id: String(orderId)
  };

  setPlayerSelectionContext(
    `🎯 Stai scegliendo il giocatore da acquistare per Chiamata #${orderRow.priority_number} · Slot ${normalizeSlot(orderRow.slot)}`
  );

  if (isMobileWaiverView()) {
    activateWaiverMobileTab("calls");
  }

  scrollWaiverElementIntoView(
    document.querySelector(".free-agents-card"),
    "start"
  );
}

function beginCompensatoryPlayerSelection(callId) {
  const call = myCompensatoryCalls.find(
    item => String(item.id) === String(callId)
  );

  if (!call) {
    setMessage("Compensativa non trovata.", true);
    return;
  }

  setActiveCompensatoryCallCard(callId);

  playerSelectionOrigin = {
    type: "compensatory",
    id: String(callId)
  };

  setPlayerSelectionContext(
    `🎯 Stai scegliendo il giocatore da acquistare per Compensativa #${call.priority_order || "-"}`
  );

  if (isMobileWaiverView()) {
    activateWaiverMobileTab("calls");
  }

  scrollWaiverElementIntoView(
    document.querySelector(".free-agents-card"),
    "start"
  );
}

function finishPlayerSelection(origin) {
  if (!origin) return;

  const targetSelector =
    origin.type === "compensatory"
      ? `.compensatory-call-card[data-call-id="${origin.id}"]`
      : `.dynamic-call-card[data-order-id="${origin.id}"]`;

  if (isMobileWaiverView()) {
    activateWaiverMobileTab(
      origin.type === "compensatory" ? "extra" : "calls"
    );
  }

  clearPlayerSelectionState();

  scrollWaiverElementIntoView(
    document.querySelector(targetSelector),
    "center"
  );
}

/* ===============================
   HELPERS
================================ */

function getTeamLogoPath(teamName) {
  if (!teamName) return "";
  return `img/${teamName}.webp`;
}

function formatWaiverDateTime(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date.toLocaleString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isConferencePhase() {
  return (currentSettings?.active_phase || "").toLowerCase() === "conference";
}

function isPlayoffPhase() {
  return (currentSettings?.active_phase || "").toLowerCase() === "playoff";
}

function normalizeSlot(slot) {
  return String(slot || "").toUpperCase();
}

function normalizePlayerName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
}

function parseQuotation(value) {
  const n = Number(String(value ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function findMyOwnedPlayerById(playerId) {
  if (!playerId) return null;

  return myOwnedPlayers.find(player =>
    String(player.id) === String(playerId)
  ) || null;
}

function findFreeAgentById(playerId) {
  if (!playerId) return null;

  return freeAgents.find(player =>
    String(player.id) === String(playerId)
  ) || null;
}

function validateU21WaiverRule(playerOutId, playerInId) {
  const playerOut = findMyOwnedPlayerById(playerOutId);
  const playerIn = findFreeAgentById(playerInId);

  if (!playerOut || !playerIn) {
    return { valid: true };
  }

  // Regola SOLO per U21 normali.
  // Gli U21 confermati/keeper non entrano in questa regola.
  const isDroppingNormalU21 = playerOut.is_u21_slot === true;

  if (!isDroppingNormalU21) {
    return { valid: true };
  }

  const incomingIsU21 = playerIn.is_u21 === true;
  const incomingQuotation = parseQuotation(playerIn.quotation);

  if (!incomingIsU21) {
    return {
      valid: false,
      message: `${playerOut.name} è un U21 normale: puoi svincolarlo solo per prendere un altro U21.`
    };
  }

  if (incomingQuotation > 5) {
    return {
      valid: false,
      message: `${playerOut.name} è un U21 normale: puoi svincolarlo solo per un U21 con quotazione uguale o inferiore a 5. ${playerIn.name} ha quotazione ${incomingQuotation}.`
    };
  }

  return { valid: true };
}

function getPriorityGroupForTeam(team) {
  if (isConferencePhase()) {
    return team.conference || "Senza Conference";
  }

  return "Totale";
}

function getCompensatoryGroupForTeamId(teamId) {
  if (!isConferencePhase()) {
    return "Totale";
  }

  const team = teamMap[teamId];

  return team?.conference || "Senza Conference";
}

function getCompensatoryReasonLabel(call) {
  const reasonType = String(call?.reason_type || "trade").toLowerCase();
  const note = String(call?.reason_note || "").trim();

  if (reasonType === "serie_a_exit") {
    return note || "giocatore uscito dalla Serie A";
  }

  if (reasonType === "injury_reserve") {
    return note || "Injury Reserve";
  }

  if (reasonType === "other") {
    return note || "compensativa speciale";
  }

  return note || "trade sbilanciata";
}

function escapeWaiverHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function localWaiverDateValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function getIrDay(record) {
  const start = new Date(`${record.activated_on}T00:00:00`);
  const today = new Date(`${localWaiverDateValue()}T00:00:00`);
  return Math.max(1, Math.floor((today - start) / 86400000) + 1);
}

function getIrPhase(record) {
  const day = getIrDay(record);
  if (day <= 60) return { label: "Protetto", className: "protected" };
  if (day <= 90) return { label: "Scelta disponibile", className: "flexible" };
  return { label: "Decisione obbligatoria", className: "final" };
}

function formatIrDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
}

function renderInjuryReserveMonitor() {
  if (!injuryReserveListEl) return;

  if (!activeInjuryReserveRows.length) {
    injuryReserveListEl.innerHTML = `
      <div class="ir-monitor-empty">
        <strong>Nessuna IR attiva</strong>
        <span>Gli slot attivati compariranno qui.</span>
      </div>
    `;
    return;
  }

  injuryReserveListEl.innerHTML = activeInjuryReserveRows.map(record => {
    const team = teamMap[record.team_id];
    const phase = getIrPhase(record);
    const day = getIrDay(record);
    const progress = Math.min(100, Math.max(2, (day / 104) * 100));

    return `
      <article class="ir-monitor-row">
        <div class="ir-monitor-icon">IR</div>
        <div class="ir-monitor-main">
          <strong>${escapeWaiverHtml(record.player_name)}</strong>
          <span>${escapeWaiverHtml(team?.name || "Squadra sconosciuta")}</span>
          <small>Giorno ${day} di 104 · scadenza ${formatIrDate(record.expires_on)}</small>
          <div class="ir-monitor-progress"><span style="width:${progress}%"></span></div>
        </div>
        <span class="ir-monitor-phase ${phase.className}">${phase.label}</span>
      </article>
    `;
  }).join("");
}

async function loadInjuryReserveMonitor() {
  if (!injuryReserveListEl) return;

  const { data, error } = await supabase
    .from("injury_reserve")
    .select("id, team_id, player_id, player_name, activated_on, expires_on, status, compensatory_status")
    .eq("status", "active")
    .order("expires_on", { ascending: true });

  if (error) {
    console.error("Errore caricamento Injury Reserve:", error);
    injuryReserveListEl.innerHTML = "<p>Errore nel caricamento delle Injury Reserve.</p>";
    return;
  }

  activeInjuryReserveRows = data || [];
  currentTeamIrPlayerIds = new Set(
    activeInjuryReserveRows
      .filter(record => String(record.team_id) === String(currentTeam?.id))
      .map(record => String(record.player_id))
  );
  renderInjuryReserveMonitor();
}

function getCompensatoryModeLabel(call) {
  return call?.requires_player_out
    ? "sostituzione 1→1"
    : "solo ingresso";
}

function normalizeCompensatoryTier(value) {
  return String(value || "normal").toLowerCase() === "high"
    ? "high"
    : "normal";
}

function getCompensatoryTierLabel(value) {
  const tier = typeof value === "object"
    ? normalizeCompensatoryTier(value?.priority_tier)
    : normalizeCompensatoryTier(value);

  return tier === "high"
    ? "Compensativa prioritaria"
    : "Compensativa normale";
}

function getCompensatoryTierShortLabel(value) {
  return normalizeCompensatoryTier(
    typeof value === "object" ? value?.priority_tier : value
  ) === "high"
    ? "Prioritaria"
    : "Normale";
}

function getCompensatoryTierSortValue(value) {
  return normalizeCompensatoryTier(
    typeof value === "object" ? value?.priority_tier : value
  ) === "high"
    ? 0
    : 1;
}

function sortCompensatoryCalls(a, b) {
  return (
    getCompensatoryTierSortValue(a) - getCompensatoryTierSortValue(b) ||
    (Number(a?.priority_order) || 999) - (Number(b?.priority_order) || 999) ||
    String(a?.id || "").localeCompare(String(b?.id || ""))
  );
}

function getCompensatoryPositionLabel(callOrPriority, tierValue = null) {
  const call = typeof callOrPriority === "object" ? callOrPriority : null;
  const tier = normalizeCompensatoryTier(call || tierValue);
  const priority = call
    ? Number(call.priority_order) || "-"
    : Number(callOrPriority) || "-";

  return `${tier === "high" ? "P" : "C"}${priority}`;
}

function isCompensatoryOrderEditable(calls = []) {
  if (isAdminViewingAsTeam() || calls.length < 2) return false;
  if (!calls.every(call => String(call.status || "pending") === "pending")) {
    return false;
  }

  const { closeAt } = getCompensatoryTimesForTier(calls[0]);
  return !closeAt || new Date() < new Date(closeAt);
}

function buildCompensatoryOrderManager(tier, calls = []) {
  if (calls.length < 2) return null;

  const sortedCalls = calls.slice().sort(sortCompensatoryCalls);
  const positions = sortedCalls
    .map(call => Number(call.priority_order))
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const canEdit = isCompensatoryOrderEditable(sortedCalls);
  const hasSubmittedCall = sortedCalls.some(
    call => String(call.status || "pending") !== "pending"
  );

  const manager = document.createElement("section");
  manager.className = `my-compensatory-order-manager compensatory-tier-${tier}`;
  manager.dataset.tier = tier;
  manager.innerHTML = `
    <div class="my-compensatory-order-head">
      <div>
        <strong>Scegli come usare le tue priorità</strong>
        <span>Assegna ogni diritto a una delle tue posizioni ${tier === "high" ? "prioritarie" : "compensative"}.</span>
      </div>
      <span class="my-compensatory-order-count">${sortedCalls.length} diritti</span>
    </div>

    <div class="my-compensatory-order-list">
      ${sortedCalls.map(call => `
        <div class="my-compensatory-order-row">
          <div class="my-compensatory-order-reason">
            <strong>${escapeWaiverHtml(getCompensatoryReasonLabel(call))}</strong>
            <span>Attualmente ${getCompensatoryPositionLabel(call)}</span>
          </div>
          <label>
            Posizione
            <select
              class="my-compensatory-order-select"
              data-tier="${tier}"
              data-call-id="${call.id}"
              data-selected-priority="${call.priority_order}"
              ${canEdit ? "" : "disabled"}
            >
              ${positions.map(priority => `
                <option value="${priority}" ${Number(call.priority_order) === priority ? "selected" : ""}>
                  ${getCompensatoryPositionLabel(priority, tier)}
                </option>
              `).join("")}
            </select>
          </label>
        </div>
      `).join("")}
    </div>

    <div class="my-compensatory-order-actions">
      <small>
        ${
          canEdit
            ? "Puoi cambiare soltanto l’ordine delle tue chiamate: le altre squadre non vengono spostate."
            : hasSubmittedCall
              ? "Ordine bloccato perché almeno una chiamata è già stata inviata."
              : "Ordine non modificabile dopo la chiusura della finestra."
        }
      </small>
      <button
        type="button"
        class="primary-btn save-compensatory-order-btn"
        data-tier="${tier}"
        ${canEdit ? "" : "disabled"}
      >
        Salva ordine
      </button>
    </div>
  `;

  return manager;
}

function getGeneratedSlots() {
  if (isPlayoffPhase()) {
    return ["1", "1S", "2", "2S"];
  }

  return ["1", "2"];
}

function getRecallSlotAfterLoss(slot) {
  const normalizedSlot = normalizeSlot(slot);

  if (normalizedSlot === "1") return "2";

  // In caso playoff, se vuoi usare anche i supplementari:
  if (normalizedSlot === "1S") return "2S";

  return null;
}

async function activateRecallSlotForLosers(currentSlot, loserEntries = []) {
  console.log("=== RICHIAMO AUTOMATICO START ===", {
    currentSlot,
    loserEntries,
    currentSettings
  });

  if (!currentSettings || !loserEntries.length) {
    console.warn("Stop richiamo: mancano settings o loserEntries vuoto.");
    return 0;
  }

  const recallSlot = getRecallSlotAfterLoss(currentSlot);

  console.log("Slot richiamo calcolato:", {
    currentSlot,
    recallSlot
  });

  if (!recallSlot) return 0;

  const losersByPackage = new Map();
  let activated = 0;

  loserEntries.forEach(entry => {
    const call = entry.call;
    const order = entry.order;

    const loserTeamId = call.owner_team_id || call.team_id;
    const packageOriginalTeamId =
      order?.original_team_id || call.original_team_id || loserTeamId;
    const conference = order?.conference || call.conference || "Totale";

    console.log("Analizzo loser:", {
      call,
      order,
      loserTeamId,
      packageOriginalTeamId,
      conference
    });

    if (!loserTeamId || !packageOriginalTeamId) return;

    const key = `${loserTeamId}__${packageOriginalTeamId}__${conference}`;

    if (!losersByPackage.has(key)) {
      losersByPackage.set(key, {
        teamId: loserTeamId,
        originalTeamId: packageOriginalTeamId,
        conference
      });
    }
  });

  console.log(
    "Pacchetti persi da richiamare:",
    Array.from(losersByPackage.values())
  );

  for (const loser of losersByPackage.values()) {
    console.log("Cerco riga waiver_order richiamo:", {
      week: currentSettings.active_week,
      phase: currentSettings.active_phase,
      conference: loser.conference,
      slot: recallSlot,
      original_team_id: loser.originalTeamId,
      owner_team_id: loser.teamId
    });

    const { data: recallOrder, error: recallOrderError } = await supabase
      .from("waiver_order")
      .select("id, owner_team_id, original_team_id, conference, slot, priority_number")
      .eq("week", currentSettings.active_week)
      .eq("phase", currentSettings.active_phase)
      .eq("conference", loser.conference)
      .eq("slot", recallSlot)
      .eq("original_team_id", loser.originalTeamId)
      .maybeSingle();

    console.log("Risultato ricerca richiamo:", {
      recallOrder,
      recallOrderError
    });

    if (recallOrderError) {
      console.error("Errore ricerca richiamo waiver:", recallOrderError);
      continue;
    }

    if (!recallOrder) {
      console.warn("Nessuna chiamata richiamo trovata per:", loser);
      continue;
    }

    if (
      recallOrder.owner_team_id &&
      String(recallOrder.owner_team_id) !== String(loser.teamId)
    ) {
      console.warn("Richiamo già assegnato ad altra squadra, non sovrascrivo:", {
        recallOrder,
        loser
      });
      continue;
    }

    const { data: updatedRecall, error: updateError } = await supabase
      .from("waiver_order")
      .update({
        owner_team_id: loser.teamId,
        updated_at: new Date().toISOString()
      })
      .eq("id", recallOrder.id)
      .select("id, owner_team_id, original_team_id, conference, slot, priority_number")
      .maybeSingle();

    console.log("Risultato update richiamo:", {
      updatedRecall,
      updateError
    });

    if (updateError) {
      console.error("Errore assegnazione richiamo waiver:", updateError);
      continue;
    }

    if (
      updatedRecall &&
      String(updatedRecall.owner_team_id) === String(loser.teamId)
    ) {
      activated++;
    }
  }

  console.log("=== RICHIAMO AUTOMATICO END ===");
  return activated;
}

async function syncRecallSlotsFromLostCalls(sourceSlot) {
  if (!currentSettings) return 0;

  const normalizedSourceSlot = normalizeSlot(sourceSlot);
  const recallSlot = getRecallSlotAfterLoss(normalizedSourceSlot);

  if (!recallSlot) return 0;

  const { data: lostCalls, error: lostError } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("slot", normalizedSourceSlot)
    .eq("status", "lost");

  if (lostError) {
    console.error("Errore caricamento chiamate perse per richiamo:", lostError);
    return 0;
  }

  if (!lostCalls || lostCalls.length === 0) {
    console.log("Nessuna chiamata persa da sincronizzare.");
    return 0;
  }

  let activated = 0;

  for (const call of lostCalls) {
    const loserTeamId = call.owner_team_id || call.team_id;
    const packageOriginalTeamId = call.original_team_id || loserTeamId;
    const conference = call.conference || "Totale";

    if (!loserTeamId || !packageOriginalTeamId) continue;

    const { data: recallOrder, error: recallOrderError } = await supabase
      .from("waiver_order")
      .select("id, owner_team_id, original_team_id, conference, slot")
      .eq("week", currentSettings.active_week)
      .eq("phase", currentSettings.active_phase)
      .eq("conference", conference)
      .eq("slot", recallSlot)
      .eq("original_team_id", packageOriginalTeamId)
      .maybeSingle();

    if (recallOrderError) {
      console.error("Errore ricerca slot richiamo:", recallOrderError);
      continue;
    }

    if (!recallOrder) {
      console.warn("Slot richiamo non trovato per chiamata persa:", call);
      continue;
    }

    if (
      recallOrder.owner_team_id &&
      String(recallOrder.owner_team_id) !== String(loserTeamId)
    ) {
      console.warn("Slot richiamo già assegnato ad altra squadra:", {
        recallOrder,
        call
      });
      continue;
    }

    const { data: updatedRecall, error: updateError } = await supabase
      .from("waiver_order")
      .update({
        owner_team_id: loserTeamId,
        updated_at: new Date().toISOString()
      })
      .eq("id", recallOrder.id)
      .select("id, owner_team_id")
      .maybeSingle();

    if (updateError) {
      console.error("Errore aggiornamento slot richiamo:", updateError);
      continue;
    }

    if (updatedRecall && String(updatedRecall.owner_team_id) === String(loserTeamId)) {
      activated++;
    }
  }

  console.log(`Richiami sincronizzati da chiamate lost nello slot ${recallSlot}:`, activated);

  return activated;
}

function populateFreeAgentsFilters() {
  if (!serieATeamFilter) return;

  const currentTeam = serieATeamFilter.value;

  const serieATeams = [...new Set(
    freeAgents
      .map(player => player.serieATeam)
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));

  serieATeamFilter.innerHTML = `
    <option value="">Tutte le squadre</option>
    ${serieATeams
      .map(team => `<option value="${team}">${team}</option>`)
      .join("")}
  `;

  serieATeamFilter.value = currentTeam;
}

function getCompensatoryTimes() {
  if (!currentSettings) return { openAt: null, closeAt: null };

  return {
    openAt: currentSettings.compensatory_open_at || null,
    closeAt: currentSettings.compensatory_close_at || null
  };
}

function getCompensatoryTimesForTier(value) {
  const tier = normalizeCompensatoryTier(
    typeof value === "object" ? value?.priority_tier : value
  );

  if (tier === "high") {
    return {
      openAt:
        currentSettings?.high_compensatory_open_at ||
        currentSettings?.slot1_open_at ||
        null,
      closeAt:
        currentSettings?.high_compensatory_close_at ||
        currentSettings?.slot1_close_at ||
        null
    };
  }

  return getCompensatoryTimes();
}

function isCompensatoryOpen(value = "normal") {
  const { openAt, closeAt } = getCompensatoryTimesForTier(value);
  const now = new Date();

  if (!openAt || !closeAt) return true;

  return now >= new Date(openAt) && now < new Date(closeAt);
}

function getCompensatoryPublishAt(value = "normal") {
  if (!currentSettings) return null;

  if (normalizeCompensatoryTier(
    typeof value === "object" ? value?.priority_tier : value
  ) === "high") {
    return (
      currentSettings.high_compensatory_close_at ||
      currentSettings.slot1_close_at ||
      null
    );
  }

  return (
    currentSettings.compensatory_close_at ||
    currentSettings.slot2s_close_at ||
    currentSettings.slot2_close_at ||
    currentSettings.slot1_close_at
  );
}

function areCompensatoryResultsPublic(value = "normal") {
  const publishAt = getCompensatoryPublishAt(value);

  if (!publishAt) return false;

  return new Date() >= new Date(publishAt);
}

function getSlotTimes(slot) {
  if (!currentSettings) return { openAt: null, closeAt: null };

  const normalizedSlot = normalizeSlot(slot);

  if (normalizedSlot === "1") {
    return {
      openAt: currentSettings.slot1_open_at,
      closeAt: currentSettings.slot1_close_at
    };
  }

  if (normalizedSlot === "1S") {
    return {
      openAt: currentSettings.slot1s_open_at,
      closeAt: currentSettings.slot1s_close_at
    };
  }

  if (normalizedSlot === "2") {
    return {
      openAt: currentSettings.slot2_open_at,
      closeAt: currentSettings.slot2_close_at
    };
  }

  if (normalizedSlot === "2S") {
    return {
      openAt: currentSettings.slot2s_open_at,
      closeAt: currentSettings.slot2s_close_at
    };
  }

  return { openAt: null, closeAt: null };
}

function isSlotOpen(slot) {
  const { openAt, closeAt } = getSlotTimes(slot);
  const now = new Date();

  if (!openAt || !closeAt) return true;

  return now >= new Date(openAt) && now < new Date(closeAt);
}

function isSlotPublic(slot) {
  const { closeAt } = getSlotTimes(slot);
  const now = new Date();

  if (!closeAt) return false;

  return now >= new Date(closeAt);
}

function setMessage(text, isError = false) {
  if (!callMessageEl) return;

  callMessageEl.textContent = text || "";
  callMessageEl.style.color = isError ? "#dc2626" : "#334155";
}

function setAdminMessage(text, isError = false) {
  if (!waiverOrderMessageEl) return;

  waiverOrderMessageEl.textContent = text || "";
  waiverOrderMessageEl.style.color = isError ? "#dc2626" : "#334155";
}

function setActiveCallCard(orderId) {
  if (isAdminViewingAsTeam()) return;
  activeWaiverOrderId = orderId;
  activeCompensatoryCallId = null;

  document.querySelectorAll(".dynamic-call-card").forEach(card => {
    card.classList.toggle(
      "active-call-target",
      card.dataset.orderId === String(orderId)
    );
  });

  document.querySelectorAll(".compensatory-call-card").forEach(card => {
    card.classList.remove("active-call-target");
  });
}

function setActiveCompensatoryCallCard(callId) {
  if (isAdminViewingAsTeam()) return;
  activeCompensatoryCallId = callId;
  activeWaiverOrderId = null;

  document.querySelectorAll(".compensatory-call-card").forEach(card => {
    card.classList.toggle(
      "active-call-target",
      card.dataset.callId === String(callId)
    );
  });

  document.querySelectorAll(".dynamic-call-card").forEach(card => {
    card.classList.remove("active-call-target");
  });
}

function getCallByOrderId(orderId) {
  return mySavedCalls.find(call => String(call.waiver_order_id) === String(orderId));
}

function getAdminOrderGroupKey(row) {
  return `${row.conference || "Totale"}__slot_${normalizeSlot(row.slot)}`;
}

function groupRowsByConferenceAndSlot(rows) {
  const groups = {};

  rows.forEach(row => {
    const conference = row.conference || "Totale";
    const slot = normalizeSlot(row.slot);
    const key = `${conference}__slot_${slot}`;

    if (!groups[key]) {
      groups[key] = {
        conference,
        slot,
        rows: []
      };
    }

    groups[key].rows.push(row);
  });

  Object.values(groups).forEach(group => {
    group.rows.sort((a, b) => a.priority_number - b.priority_number);
  });

  return groups;
}

function sortGroupKeys(keys) {
  return keys.sort((a, b) => {
    const order = [
      "Conference League__slot_1",
      "Conference League__slot_1S",
      "Conference League__slot_2",
      "Conference League__slot_2S",
      "Conference Championship__slot_1",
      "Conference Championship__slot_1S",
      "Conference Championship__slot_2",
      "Conference Championship__slot_2S",
      "Totale__slot_1",
      "Totale__slot_1S",
      "Totale__slot_2",
      "Totale__slot_2S"
    ];

    const indexA = order.indexOf(a);
    const indexB = order.indexOf(b);

    if (indexA !== -1 || indexB !== -1) {
      return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
    }

    return a.localeCompare(b);
  });
}

function updateHeroPriority() {
  if (!heroPriorityEl) return;

  if (!myOrderRows || myOrderRows.length === 0) {
    heroPriorityEl.textContent = "-";
    return;
  }

  const firstOpenCall =
    myOrderRows.find(row => isSlotOpen(row.slot)) ||
    myOrderRows[0];

  heroPriorityEl.textContent = firstOpenCall?.priority_number
    ? `#${firstOpenCall.priority_number}`
    : "-";
}

/* ===============================
   CLASSIFICHE PER ORDINE WAIVER
================================ */

const GOAL_BASE = 66;
const GOAL_STEP = 6;

function teamKey(name) {
  return String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[👑🎖️💀]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanTeamName(name) {
  return String(name || "")
    .replace(/[👑🎖️💀]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumber(value) {
  const n = parseFloat(String(value || "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
}

function pointsToGoals(points) {
  const p = parseNumber(points);
  if (p < GOAL_BASE) return 0;
  return 1 + Math.floor((p - GOAL_BASE) / GOAL_STEP);
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

  const headers = rows.shift().map(h => String(h || "").trim());

  return rows
    .filter(r => r.some(c => String(c || "").trim() !== ""))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        obj[h] = String(r[i] ?? "").trim();
      });
      return obj;
    });
}

async function fetchStatsRows() {
  const rows = await loadResultsRows();
  return removeDuplicateStatsRows(rows);
}

function removeDuplicateStatsRows(rows) {
  const seen = new Set();

  return rows.filter(r => {
    const key = [
      String(r.GW || "").trim(),
      String(r.GW_Stagionale || "").trim(),
      cleanTeamName(r.Team),
      cleanTeamName(r.Opponent),
      String(r.PointsFor || "").replace(",", ".").trim(),
      String(r.PointsAgainst || "").replace(",", ".").trim(),
      String(r.Conference || "").trim()
    ].join("|");

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function getStatsRowsForConference(rows, conferenceName) {
  return rows.filter(r => {
    const team = cleanTeamName(r.Team);
    const opponent = cleanTeamName(r.Opponent);
    const pf = parseNumber(r.PointsFor);
    const pa = parseNumber(r.PointsAgainst);
    const conference = String(r.Conference || "").trim();
    const phase = String(r.Phase || "").trim();

    if (!team || !opponent) return false;
    if (pf === 0 && pa === 0) return false;
    if (phase !== "Regular") return false;

    return conference === conferenceName;
  });
}

function buildStandingsFromRows(rows) {
  const table = new Map();

  rows.forEach(r => {
    const squadra = cleanTeamName(r.Team);
    const key = teamKey(squadra);

    if (!key) return;

    const pf = parseNumber(r.PointsFor);
    const pa = parseNumber(r.PointsAgainst);

    const gf = pointsToGoals(pf);
    const gs = pointsToGoals(pa);

    if (!table.has(key)) {
      table.set(key, {
        squadra,
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
    rec.gs += gs;
    rec.mp += pf;

    if (gf > gs) {
      rec.v += 1;
      rec.pt += 3;
    } else if (gf === gs) {
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

function mergeStandings(...standingsLists) {
  const merged = new Map();

  standingsLists.flat().forEach(r => {
    const key = teamKey(r.squadra);

    if (!merged.has(key)) {
      merged.set(key, {
        squadra: r.squadra,
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

    const rec = merged.get(key);

    rec.g += r.g;
    rec.v += r.v;
    rec.n += r.n;
    rec.p += r.p;
    rec.gf += r.gf;
    rec.gs += r.gs;
    rec.pt += r.pt;
    rec.mp += r.mp;
  });

  return Array.from(merged.values()).sort((a, b) => {
    return (
      b.pt - a.pt ||
      b.mp - a.mp ||
      b.gf - a.gf ||
      (a.gs - b.gs) ||
      a.squadra.localeCompare(b.squadra)
    );
  });
}

function buildWaiverPriorityMapFromStats(rows) {
  const confLeague = buildStandingsFromRows(
    getStatsRowsForConference(rows, "Conf A")
  );

  const confChampionship = buildStandingsFromRows(
    getStatsRowsForConference(rows, "Conf B")
  );

  const roundRobin = buildStandingsFromRows(
    getStatsRowsForConference(rows, "Unificata")
  );

  const totale = mergeStandings(
    confLeague,
    confChampionship,
    roundRobin
  );

  return {
    "Conference League": confLeague.slice().reverse(),
    "Conference Championship": confChampionship.slice().reverse(),
    "Totale": totale.slice().reverse()
  };
}

function getTeamPriorityIndex(teamName, priorityList) {
  const key = teamKey(teamName);
  const index = priorityList.findIndex(row => teamKey(row.squadra) === key);

  return index === -1 ? 999 : index;
}

async function sortWaiverGroupsByStandings(groups) {
  const statsRows = await fetchStatsRows();
  const priorityMap = buildWaiverPriorityMapFromStats(statsRows);

  Object.keys(groups).forEach(groupKey => {
    const priorityList = priorityMap[groupKey] || [];
    const missingTeams = groups[groupKey]
      .filter(team => getTeamPriorityIndex(team.name, priorityList) === 999)
      .map(team => team.name);

    if (priorityList.length === 0 || missingTeams.length > 0) {
      const details = missingTeams.length
        ? ` Squadre non trovate: ${missingTeams.join(", ")}.`
        : "";

      throw new Error(
        `Classifica ${groupKey} incompleta: trovate ${priorityList.length} squadre su ${groups[groupKey].length}.${details}`
      );
    }

    groups[groupKey].sort((a, b) => {
      const rankA = getTeamPriorityIndex(a.name, priorityList);
      const rankB = getTeamPriorityIndex(b.name, priorityList);

      if (rankA !== rankB) return rankA - rankB;

      return a.name.localeCompare(b.name);
    });
  });
}


function isAdminViewingAsTeam() {
  return Boolean(
    currentUserIsAdmin &&
    currentRealTeam &&
    currentTeam &&
    String(currentRealTeam.id) !== String(currentTeam.id)
  );
}

function renderCurrentTeamIdentity() {
  if (!currentTeam) return;

  if (teamNameEl) {
    teamNameEl.textContent = currentTeam.name || "Squadra";
  }

  if (teamConferenceEl) {
    teamConferenceEl.textContent = currentTeam.conference || "Non assegnata";
  }

  if (teamLogoEl) {
    teamLogoEl.style.display = "";
    teamLogoEl.src = getTeamLogoPath(currentTeam.name);
    teamLogoEl.alt = `Logo ${currentTeam.name}`;

    teamLogoEl.onerror = () => {
      teamLogoEl.style.display = "none";
    };
  }
}

function populateAdminViewAsSelect() {
  if (!adminViewAsSelect || !currentUserIsAdmin) return;

  const selectedValue = isAdminViewingAsTeam()
    ? String(currentTeam.id)
    : "";

  adminViewAsSelect.innerHTML = `
    <option value="">Seleziona squadra</option>
    ${
      (teamsCache || [])
        .slice()
        .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
        .map(team => `
          <option value="${team.id}">
            ${team.name}${String(team.id) === String(currentRealTeam?.id) ? " (la mia)" : ""}
          </option>
        `)
        .join("")
    }
  `;

  adminViewAsSelect.value = selectedValue;
}

function updateAdminViewAsUI() {
  const active = isAdminViewingAsTeam();

  document.body.classList.toggle("waiver-view-as-mode", active);

  if (adminViewAsBanner) {
    adminViewAsBanner.style.display = active ? "flex" : "none";
  }

  if (adminViewAsBannerTeam) {
    adminViewAsBannerTeam.textContent = active
      ? currentTeam?.name || "Squadra"
      : "-";
  }

  const adminMobileTab = document.querySelector(".admin-mobile-tab");

  if (active) {
    if (adminPanel) adminPanel.style.display = "none";
    if (adminMobileTab) adminMobileTab.style.display = "none";

    const currentAdminTab = document.querySelector(
      '.waiver-mobile-tab[data-waiver-mobile-tab="admin"].active'
    );

    if (currentAdminTab) {
      document
        .querySelector('.waiver-mobile-tab[data-waiver-mobile-tab="calls"]')
        ?.click();
    }
  } else if (currentUserIsAdmin) {
    if (adminPanel) adminPanel.style.display = "block";
    if (adminMobileTab) adminMobileTab.style.display = "";
  }

  populateAdminViewAsSelect();
  syncWaiverMobileTabColumns();
}

function blockTeamWriteWhileViewingAs() {
  if (!isAdminViewingAsTeam()) return false;

  setMessage(
    `Modalità test: stai visualizzando come ${currentTeam?.name || "un'altra squadra"}. Le modifiche sono disabilitate.`,
    true
  );

  return true;
}

async function refreshTeamScopedWaiverView() {
  activeWaiverOrderId = null;
  activeCompensatoryCallId = null;

  myOrderRows = [];
  mySavedCalls = [];
  myCompensatoryCalls = [];
  myOwnedPlayers = [];
  myReplacementCandidates = [];
  freeAgents = [];
  waiverTradeAssets = [];
  waiverCallTrades = [];

  renderCurrentTeamIdentity();
  updateAdminViewAsUI();

  await loadInjuryReserveMonitor();
  await loadMyOwnedPlayers();
  await loadMyReplacementCandidates();
  await loadMyWaiverCalls();
  await loadWaiverCallTrades();
  await loadMyCompensatoryCalls();
  await loadFreeAgents();

  updateAdminViewAsUI();
}

async function enterAdminViewAsTeam(teamId) {
  if (!currentUserIsAdmin) return;

  const targetTeam = teamMap[teamId];

  if (!targetTeam) {
    setAdminMessage("Squadra da visualizzare non trovata.", true);
    return;
  }

  if (String(targetTeam.id) === String(currentRealTeam?.id)) {
    await exitAdminViewAsTeam();
    return;
  }

  currentTeam = targetTeam;
  sessionStorage.setItem(WAIVER_VIEW_AS_STORAGE_KEY, String(targetTeam.id));

  await refreshTeamScopedWaiverView();
}

async function exitAdminViewAsTeam() {
  if (!currentUserIsAdmin || !currentRealTeam) return;

  currentTeam = currentRealTeam;
  sessionStorage.removeItem(WAIVER_VIEW_AS_STORAGE_KEY);

  await refreshTeamScopedWaiverView();

  setAdminMessage("Modalità test terminata. Sei tornato alla tua squadra.");
}

function restoreAdminViewAsTeamFromSession() {
  if (!currentUserIsAdmin) return;

  const savedTeamId = sessionStorage.getItem(WAIVER_VIEW_AS_STORAGE_KEY);

  if (!savedTeamId) return;

  const targetTeam = teamMap[savedTeamId];

  if (
    targetTeam &&
    String(targetTeam.id) !== String(currentRealTeam?.id)
  ) {
    currentTeam = targetTeam;
  } else {
    sessionStorage.removeItem(WAIVER_VIEW_AS_STORAGE_KEY);
  }
}

/* ===============================
   AUTH / TEAM / SETTINGS
================================ */

async function getMyTeam() {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    console.error("Utente non loggato:", authError);
    teamNameEl.textContent = "Utente non loggato";
    return null;
  }

  currentUserEmail = authData.user.email;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, team_id, role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError || !profile) {
    console.error("Profilo non trovato:", profileError);
    teamNameEl.textContent = "Profilo non trovato";
    currentUserIsAdmin = false;
    return null;
  }

  currentUserIsAdmin = ["admin", "commissioner"].includes(
    String(profile.role || "").toLowerCase()
  );

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, name, conference")
    .eq("id", profile.team_id)
    .single();

  if (teamError || !team) {
    console.error("Squadra non trovata:", teamError);
    teamNameEl.textContent = "Squadra non trovata";
    return null;
  }

  return team;
}

async function getWaiverSettings() {
  const { data, error } = await supabase
    .from("waiver_settings")
    .select("*")
    .order("id", { ascending: false })
    .limit(1);

  if (error || !data || data.length === 0) {
    console.error("Impostazioni waiver non trovate:", error);
    return null;
  }

  return data[0];
}

async function loadTeams() {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, conference")
    .order("name", { ascending: true });

  if (error) {
    console.error("Errore caricamento squadre:", error);
    teamsCache = [];
    teamMap = {};
    return;
  }

  teamsCache = data || [];
  teamMap = {};

  teamsCache.forEach(team => {
    teamMap[team.id] = team;
  });
}

function populateAdminCompensatoryTeamSelect() {
  if (!adminCompTeamSelect) return;

  const currentValue = adminCompTeamSelect.value;

  adminCompTeamSelect.innerHTML = `
    <option value="">Seleziona squadra</option>
    ${
      teamsCache
        .map(team => `
          <option value="${team.id}">
            ${team.name}
          </option>
        `)
        .join("")
    }
  `;

  adminCompTeamSelect.value = currentValue;
}

/* ===============================
   WAIVER ORDER
================================ */

async function loadWaiverOrder() {
  if (!currentSettings) return [];

  const { data, error } = await supabase
    .from("waiver_order")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .order("conference", { ascending: true })
    .order("slot", { ascending: true })
    .order("priority_number", { ascending: true });

  if (error) {
    console.error("Errore caricamento waiver_order:", error);
    return [];
  }

  waiverOrderRows = data || [];
  return waiverOrderRows;
}

async function generateWaiverOrder() {
  if (!currentSettings) return;

  if (!teamsCache || teamsCache.length === 0) {
    await loadTeams();
  }

  setAdminMessage("Generazione ordine waiver in corso...");

  const existingCallsResult = await supabase
    .from("waiver_calls")
    .select("id")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .limit(1);

  if (existingCallsResult.data && existingCallsResult.data.length > 0) {
    const confirmed = confirm(
      "Esistono già chiamate salvate per questa settimana/fase. Generare di nuovo l'ordine può creare confusione. Vuoi continuare?"
    );

    if (!confirmed) {
      setAdminMessage("Generazione annullata.");
      return;
    }
  }

  const groups = {};

  teamsCache.forEach(team => {
    const groupKey = getPriorityGroupForTeam(team);

    if (!groups[groupKey]) {
      groups[groupKey] = [];
    }

    groups[groupKey].push(team);
  });

try {
  await sortWaiverGroupsByStandings(groups);
} catch (err) {
  console.error("Errore ordinamento waiver da classifiche:", err);
  setAdminMessage(
    "Impossibile generare l'ordine dalla classifica: " + err.message,
    true
  );
  return;
}

  const rows = [];
  const slots = getGeneratedSlots();

  Object.keys(groups).forEach(groupKey => {
    slots.forEach(slot => {
      groups[groupKey].forEach((team, index) => {
        const normalizedSlot = normalizeSlot(slot);

        let ownerTeamId = null;

        if (isPlayoffPhase()) {
          ownerTeamId =
            normalizedSlot === "1" || normalizedSlot === "2"
              ? team.id
              : null;
        } else {
          ownerTeamId = normalizedSlot === "1" ? team.id : null;
        }

        rows.push({
          week: currentSettings.active_week,
          phase: currentSettings.active_phase,
          conference: groupKey,
          slot: normalizedSlot,
          priority_number: index + 1,
          original_team_id: team.id,
          owner_team_id: ownerTeamId,
          updated_at: new Date().toISOString()
        });
      });
    });
  });

  const { error } = await supabase
    .from("waiver_order")
    .upsert(rows, {
      onConflict: "week,phase,conference,slot,priority_number"
    });

  if (error) {
    console.error("Errore generazione ordine waiver:", error);
    setAdminMessage("Errore generazione ordine waiver: " + error.message, true);
    return;
  }

  const { error: tradedRightsError } = await supabase.rpc(
    "apply_waiver_call_rights_to_order",
    {
      p_week: currentSettings.active_week,
      p_phase: currentSettings.active_phase
    }
  );

  if (tradedRightsError) {
    console.error("Errore applicazione chiamate scambiate:", tradedRightsError);
    setAdminMessage(
      "Ordine generato, ma non riesco ad applicare gli scambi: " +
        tradedRightsError.message,
      true
    );
    return;
  }

  setAdminMessage("Ordine waiver generato correttamente.");

await loadWaiverOrder();
renderWaiverOrderAdmin();
await renderPublicWaiverOrder();
await loadMyWaiverCalls();
}

async function saveWaiverOrderAdmin() {
  if (!waiverOrderRows || waiverOrderRows.length === 0) {
    setAdminMessage("Nessun ordine waiver da salvare.", true);
    return;
  }

  setAdminMessage("Salvataggio ordine waiver in corso...");

  // Prima fase: sposta temporaneamente i priority_number in negativo
  // per evitare conflitti tipo #1 ↔ #2 durante il salvataggio.
  for (const row of waiverOrderRows) {
    const { error } = await supabase
      .from("waiver_order")
      .update({
        priority_number: -Math.abs(row.priority_number),
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id);

    if (error) {
      console.error("Errore salvataggio temporaneo ordine waiver:", error);
      setAdminMessage("Errore salvataggio ordine waiver: " + error.message, true);
      return;
    }
  }

  // Seconda fase: salva valori definitivi
  for (const row of waiverOrderRows) {
    const { error } = await supabase
      .from("waiver_order")
      .update({
        week: row.week,
        phase: row.phase,
        conference: row.conference,
        slot: normalizeSlot(row.slot),
        priority_number: row.priority_number,
        original_team_id: row.original_team_id,
        owner_team_id: row.owner_team_id,
        updated_at: new Date().toISOString()
      })
      .eq("id", row.id);

    if (error) {
      console.error("Errore salvataggio ordine waiver:", error);
      setAdminMessage("Errore salvataggio ordine waiver: " + error.message, true);
      return;
    }
  }

  const { error: rightsSyncError } = await supabase.rpc(
    "admin_sync_waiver_call_rights_from_order",
    {
      p_week: currentSettings.active_week,
      p_phase: currentSettings.active_phase
    }
  );

  if (rightsSyncError) {
    console.error(
      "Errore sincronizzazione correzioni manuali chiamate:",
      rightsSyncError
    );
    setAdminMessage(
      "Ordine salvato, ma la correzione manuale non è stata memorizzata nel registro scambi: " +
        rightsSyncError.message,
      true
    );
    return;
  }

  setAdminMessage("Ordine waiver salvato correttamente.");

await loadWaiverOrder();
renderWaiverOrderAdmin();
await renderPublicWaiverOrder();
await loadMyWaiverCalls();
    }

/* ===============================
   ADMIN ORDER UI
================================ */

function reorderAdminWaiverOrder(groupKey, draggedId, targetId) {
  const groupRows = waiverOrderRows
    .filter(row => getAdminOrderGroupKey(row) === groupKey)
    .sort((a, b) => a.priority_number - b.priority_number);

  const draggedIndex = groupRows.findIndex(row => String(row.id) === String(draggedId));
  const targetIndex = groupRows.findIndex(row => String(row.id) === String(targetId));

  if (draggedIndex === -1 || targetIndex === -1) return;

  const [draggedRow] = groupRows.splice(draggedIndex, 1);
  groupRows.splice(targetIndex, 0, draggedRow);

  groupRows.forEach((row, index) => {
    row.priority_number = index + 1;
  });

  waiverOrderRows = waiverOrderRows.map(row => {
    const updatedRow = groupRows.find(item => String(item.id) === String(row.id));
    return updatedRow || row;
  });

  renderWaiverOrderAdmin();

  setAdminMessage("Ordine modificato. Ricordati di premere Salva ordine waiver.");
}

function renderWaiverOrderAdmin() {
  if (!waiverOrderAdminEl) return;

  waiverOrderAdminEl.innerHTML = "";

  if (!waiverOrderRows || waiverOrderRows.length === 0) {
    waiverOrderAdminEl.innerHTML = `
      <p>Nessun ordine waiver trovato. Premi <strong>Genera ordine waiver</strong>.</p>
    `;
    return;
  }

  const groups = groupRowsByConferenceAndSlot(waiverOrderRows);
  const sortedKeys = sortGroupKeys(Object.keys(groups));

  sortedKeys.forEach(key => {
    const group = groups[key];

    const groupDiv = document.createElement("div");
    groupDiv.className = "waiver-admin-group";

    groupDiv.innerHTML = `
      <h4>${group.conference} - Slot ${group.slot}</h4>
    `;

    group.rows.forEach(row => {
      const originalTeam = teamMap[row.original_team_id];

      const rowDiv = document.createElement("div");
      rowDiv.className = "waiver-admin-row";
      rowDiv.dataset.orderId = row.id;
      rowDiv.dataset.groupKey = key;
      rowDiv.draggable = true;

      const selectOptions = `
        <option value="" ${!row.owner_team_id ? "selected" : ""}>
          Nessuna
        </option>
        ${
          teamsCache
            .map(team => `
              <option value="${team.id}" ${String(team.id) === String(row.owner_team_id) ? "selected" : ""}>
                ${team.name}
              </option>
            `)
            .join("")
        }
      `;

      rowDiv.innerHTML = `
        <span class="priority-rank">${row.priority_number}</span>

        <div class="waiver-admin-original">
          <strong>${originalTeam?.name || row.original_team_id}</strong>
          <span>Chiamata originale</span>
        </div>

        <select class="waiver-owner-select" data-order-id="${row.id}">
          ${selectOptions}
        </select>
      `;

      const select = rowDiv.querySelector(".waiver-owner-select");

      select.addEventListener("change", event => {
        const newOwnerId = event.target.value || null;

        waiverOrderRows = waiverOrderRows.map(item => {
          if (String(item.id) === String(row.id)) {
            return {
              ...item,
              owner_team_id: newOwnerId
            };
          }

          return item;
        });

        const newOwner = newOwnerId ? teamMap[newOwnerId] : null;

        setAdminMessage(
          newOwner
            ? `Modifica pronta: ${originalTeam?.name || "chiamata"} ora appartiene a ${newOwner.name}. Ricordati di salvare.`
            : `Modifica pronta: ${originalTeam?.name || "chiamata"} non appartiene a nessuno. Ricordati di salvare.`
        );
      });

      rowDiv.addEventListener("dragstart", () => {
        draggedAdminOrderId = String(row.id);
        draggedAdminGroupKey = key;
        rowDiv.classList.add("dragging");
      });

      rowDiv.addEventListener("dragend", () => {
        draggedAdminOrderId = null;
        draggedAdminGroupKey = null;
        rowDiv.classList.remove("dragging");
      });

      rowDiv.addEventListener("dragover", event => {
        event.preventDefault();
      });

      rowDiv.addEventListener("drop", event => {
        event.preventDefault();

        const targetOrderId = String(row.id);
        const targetGroupKey = key;

        if (!draggedAdminOrderId || !draggedAdminGroupKey) return;

        if (draggedAdminGroupKey !== targetGroupKey) {
          setAdminMessage("Puoi riordinare solo dentro lo stesso slot.", true);
          return;
        }

        if (draggedAdminOrderId === targetOrderId) return;

        reorderAdminWaiverOrder(targetGroupKey, draggedAdminOrderId, targetOrderId);
      });

      groupDiv.appendChild(rowDiv);
    });

    waiverOrderAdminEl.appendChild(groupDiv);
  });
}

async function renderPublicWaiverOrder() {
  if (!publicWaiverOrderEl || !currentSettings) return;

  publicWaiverOrderEl.innerHTML = "";

  if (!waiverOrderRows || waiverOrderRows.length === 0) {
    publicWaiverOrderEl.innerHTML = `
      <p>Nessun ordine waiver generato per questa settimana/fase.</p>
    `;
    return;
  }

  const { data: calls, error } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase);

  if (error) {
    console.error("Errore caricamento chiamate per ordine pubblico:", error);
    publicWaiverOrderEl.innerHTML = `
      <p>Errore nel caricamento dell'ordine waiver pubblico.</p>
    `;
    return;
  }

  const callsByOrderId = {};

  (calls || []).forEach(call => {
    if (call.waiver_order_id) {
      callsByOrderId[String(call.waiver_order_id)] = call;
    }
  });

  const groups = groupRowsByConferenceAndSlot(waiverOrderRows);
  const sortedKeys = sortGroupKeys(Object.keys(groups));

  sortedKeys.forEach(key => {
    const group = groups[key];
    const slotPublic = isSlotPublic(group.slot);
    const { closeAt } = getSlotTimes(group.slot);

    const isCollapsiblePublicSlot =
      normalizeSlot(group.slot) === "2" || normalizeSlot(group.slot) === "2S";

    const groupBlock = document.createElement("div");
    groupBlock.className = "public-waiver-group";

    if (isCollapsiblePublicSlot) {
      groupBlock.classList.add("public-collapsible-slot", "public-slot-closed");
    }

    groupBlock.innerHTML = `
      <button
        type="button"
        class="public-waiver-group-title public-waiver-toggle"
        aria-expanded="${isCollapsiblePublicSlot ? "false" : "true"}"
      >
        <h3>${group.conference} - Slot ${group.slot}</h3>

        <span>
          ${
            slotPublic
              ? "Risultati visibili"
              : closeAt
                ? `Risultati visibili ${formatWaiverDateTime(closeAt)}`
                : "Risultati non ancora programmati"
          }
          ${
            isCollapsiblePublicSlot
              ? `<strong class="public-toggle-icon">▾</strong>`
              : ""
          }
        </span>
      </button>

      <div class="public-waiver-group-content"></div>
    `;

    const groupContent = groupBlock.querySelector(".public-waiver-group-content");

    group.rows
      .sort((a, b) => a.priority_number - b.priority_number)
      .forEach(row => {
        const originalTeam = teamMap[row.original_team_id];
        const ownerTeam = row.owner_team_id ? teamMap[row.owner_team_id] : null;
        const call = callsByOrderId[String(row.id)];

        const ownerName = ownerTeam?.name || "Nessun proprietario";
        const originalName = originalTeam?.name || "Squadra originale";

        const isVia =
          ownerTeam &&
          originalTeam &&
          String(ownerTeam.id) !== String(originalTeam.id);

        let statusClass = "waiting";
        let resultText = "";

        if (!slotPublic) {
          resultText = closeAt
            ? `Le chiamate saranno visibili ${formatWaiverDateTime(closeAt)}`
            : "Le chiamate saranno visibili dopo la chiusura dello slot.";
        } else if (!call) {
          statusClass = "empty";
          resultText = "Nessuna chiamata registrata.";
        } else if (call.status === "won") {
          statusClass = "won";
          resultText = `🟢 Prende ${call.player_in || "-"}<br>🔻 Svincola ${call.player_out || "-"}`;
        } else if (call.status === "lost") {
          statusClass = "lost";
          resultText = `🔴 Perde ${call.player_in || "-"}`;
        } else {
          statusClass = "pending";
          resultText = `⏳ Chiama ${call.player_in || "-"}`;
        }

        const rowDiv = document.createElement("div");
        rowDiv.className = `public-waiver-row ${statusClass}`;

        rowDiv.innerHTML = `
          <div class="public-waiver-rank">#${row.priority_number}</div>

          <div class="public-waiver-main">
            <strong>${ownerName}</strong>
            ${
              isVia
                ? `<span class="public-waiver-via">via ${originalName}</span>`
                : `<span class="public-waiver-via">chiamata originale</span>`
            }
            <span class="public-waiver-result">${resultText}</span>
          </div>
        `;

        groupContent.appendChild(rowDiv);
      });

    const publicToggleBtn = groupBlock.querySelector(".public-waiver-toggle");

    if (isCollapsiblePublicSlot && publicToggleBtn) {
      publicToggleBtn.addEventListener("click", () => {
        const isClosed = groupBlock.classList.toggle("public-slot-closed");
        publicToggleBtn.setAttribute("aria-expanded", String(!isClosed));
      });
    }

    publicWaiverOrderEl.appendChild(groupBlock);
  });
     await renderPublicCompensatoryOrder();
}

async function renderPublicCompensatoryOrder() {
  if (!publicWaiverOrderEl || !currentSettings) return;

  const { data, error } = await supabase.rpc(
    "get_public_waiver_compensatory_calls",
    {
      p_week: Number(currentSettings.active_week),
      p_phase: currentSettings.active_phase
    }
  );

  if (error) {
    console.error("Errore caricamento compensative pubbliche:", error);
    return;
  }

  const visibleCompensatoryCalls = (data || []).filter(
    call => call.status !== "cancelled"
  );

  if (visibleCompensatoryCalls.length === 0) return;
  const groupOrder = isConferencePhase()
    ? ["Conference League", "Conference Championship"]
    : ["Totale"];

  for (const tier of ["high", "normal"]) {
    const tierCalls = visibleCompensatoryCalls
      .filter(call => normalizeCompensatoryTier(call.priority_tier) === tier)
      .sort(sortCompensatoryCalls);

    if (tierCalls.length === 0) continue;

    const publishAt = getCompensatoryPublishAt(tier);
    const tierIsPublic = tierCalls.some(call => call.is_revealed === true);
    const tierTitle = tier === "high"
      ? "Compensative prioritarie"
      : "Compensative normali";

    const groupBlock = document.createElement("div");
    groupBlock.className = `public-waiver-group public-compensatory-group compensatory-tier-${tier}`;
    groupBlock.innerHTML = `
      <button
        type="button"
        class="public-waiver-group-title public-waiver-toggle"
        aria-expanded="true"
      >
        <h3>${tierTitle}</h3>
        <span>
          ${
            tierIsPublic
              ? "Risultati visibili"
              : publishAt
                ? `Risultati visibili ${formatWaiverDateTime(publishAt)}`
                : "Risultati non ancora programmati"
          }
        </span>
      </button>
      <div class="public-waiver-group-content"></div>
    `;

    const groupContent = groupBlock.querySelector(".public-waiver-group-content");

    groupOrder.forEach(groupName => {
      const calls = tierCalls.filter(
        call => getCompensatoryGroupForTeamId(call.team_id) === groupName
      );

      if (calls.length === 0) return;

      const subGroup = document.createElement("div");
      subGroup.className = `public-compensatory-subgroup compensatory-tier-${tier}`;
      subGroup.innerHTML = `
        <h4 class="public-compensatory-subtitle">
          ${groupName === "Totale" ? tierTitle : groupName}
          <span class="compensatory-tier-badge ${tier}">${getCompensatoryTierShortLabel(tier)}</span>
        </h4>
      `;

      calls.forEach(call => {
        const team = teamMap[call.team_id];
        const callIsPublic = call.is_revealed === true;
        let statusClass = "waiting";
        let resultText = "";

        if (!callIsPublic) {
          resultText = publishAt
            ? `La chiamata sarà visibile ${formatWaiverDateTime(publishAt)}`
            : "La chiamata sarà visibile dopo la chiusura.";
        } else if (!call.player_in) {
          statusClass = "empty";
          resultText = "Nessuna chiamata registrata.";
        } else if (call.status === "won") {
          statusClass = "won";
          resultText = call.requires_player_out && call.player_out
            ? `🟢 Prende ${call.player_in}<br>🔻 Svincola ${call.player_out}`
            : `🟢 Prende ${call.player_in}`;
        } else if (call.status === "lost") {
          statusClass = "lost";
          resultText = `🔴 Perde ${call.player_in}`;
        } else {
          statusClass = "pending";
          resultText = `⏳ Chiama ${call.player_in}`;
        }

        const rowDiv = document.createElement("div");
        rowDiv.className = `public-waiver-row public-compensatory-row compensatory-tier-${tier} ${statusClass}`;
        rowDiv.innerHTML = `
          <div class="public-waiver-rank">${tier === "high" ? "P" : "C"}${call.priority_order || "-"}</div>
          <div class="public-waiver-main">
            <strong>${team?.name || "Squadra sconosciuta"}</strong>
            <span class="public-waiver-via">${getCompensatoryReasonLabel(call)} · ${getCompensatoryModeLabel(call)}</span>
            <span class="public-waiver-result">${resultText}</span>
          </div>
        `;

        subGroup.appendChild(rowDiv);
      });

      groupContent.appendChild(subGroup);
    });

    const toggleBtn = groupBlock.querySelector(".public-waiver-toggle");
    toggleBtn?.addEventListener("click", () => {
      const isClosed = groupBlock.classList.toggle("public-slot-closed");
      toggleBtn.setAttribute("aria-expanded", String(!isClosed));
    });

    if (tier === "high") {
      publicWaiverOrderEl.insertBefore(
        groupBlock,
        publicWaiverOrderEl.firstElementChild
      );
    } else {
      publicWaiverOrderEl.appendChild(groupBlock);
    }
  }
}
/* ===============================
   LE MIE CHIAMATE DINAMICHE
================================ */

async function loadMyWaiverCalls() {
  if (!currentTeam || !currentSettings || !myWaiverCallsEl) return;

  const { data: orders, error: orderError } = await supabase
    .from("waiver_order")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("owner_team_id", currentTeam.id)
    .order("slot", { ascending: true })
    .order("priority_number", { ascending: true });

  if (orderError) {
    console.error("Errore caricamento mie chiamate:", orderError);
    myWaiverCallsEl.innerHTML = "<p>Errore nel caricamento chiamate disponibili.</p>";
    return;
  }

  myOrderRows = orders || [];
   updateHeroPriority();

  const { data: calls, error: callsError } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("owner_team_id", currentTeam.id);

  if (callsError) {
    console.error("Errore caricamento chiamate salvate:", callsError);
    myWaiverCallsEl.innerHTML = "<p>Errore nel caricamento chiamate salvate.</p>";
    return;
  }

  mySavedCalls = calls || [];

  renderMyWaiverCalls();
}

function getOwnedPlayerBadges(player) {
  const badges = [];

  if (player.is_u21_slot) {
    badges.push("🟡 U21");
  }

  if (player.is_u21_keeper) {
    badges.push("🔒 U21 confermato");
  }

  if (player.is_fp) {
    badges.push("⭐ FP");
  }

  return badges;
}

function getOwnedPlayerOptionLabel(player) {
  const role = player.role ? ` (${player.role})` : "";
  const badges = getOwnedPlayerBadges(player);

  return `${player.name}${role}${badges.length ? `  ${badges.join(" ")}` : ""}`;
}

function buildPlayerOutOptions(savedPlayerOutId = null, savedPlayerOutName = "") {
  const options = [
    `<option value="">Seleziona giocatore da svincolare</option>`
  ];

  myOwnedPlayers.forEach(player => {
    const selected =
      String(player.id) === String(savedPlayerOutId)
        ? "selected"
        : "";

    const label = getOwnedPlayerOptionLabel(player);

    options.push(`
      <option value="${player.id}" ${selected}>
        ${label}
      </option>
    `);
  });

  // Paracadute: se esiste una vecchia chiamata salvata solo come testo,
  // la mostriamo comunque.
  if (savedPlayerOutName && !savedPlayerOutId) {
    options.push(`
      <option value="" selected>
        ${savedPlayerOutName}
      </option>
    `);
  }

  return options.join("");
}

function buildCompensatoryPlayerOutOptions(savedPlayerOutId = null, savedPlayerOutName = "") {
  const options = [
    `<option value="">Seleziona giocatore da sostituire</option>`
  ];

  myReplacementCandidates.forEach(player => {
    const selected =
      String(player.id) === String(savedPlayerOutId)
        ? "selected"
        : "";

    const statusBadge = player.status && player.status !== "active"
      ? "  🚪 fuori Serie A / inattivo"
      : "";

    const label = `${getOwnedPlayerOptionLabel(player)}${statusBadge}`;

    options.push(`
      <option value="${player.id}" ${selected}>
        ${label}
      </option>
    `);
  });

  if (savedPlayerOutName && !savedPlayerOutId) {
    options.push(`
      <option value="" selected>
        ${savedPlayerOutName}
      </option>
    `);
  }

  return options.join("");
}

function renderMyWaiverCalls() {
  if (!myWaiverCallsEl) return;

  myWaiverCallsEl.innerHTML = "";

  if (!myOrderRows || myOrderRows.length === 0) {
    myWaiverCallsEl.innerHTML = `
      <p>Nessuna chiamata disponibile per la tua squadra. Se l'ordine non è stato generato, contatta l'admin.</p>
    `;
    return;
  }

  const groups = groupRowsByConferenceAndSlot(myOrderRows);
  const sortedKeys = sortGroupKeys(Object.keys(groups));

  sortedKeys.forEach(key => {
    const group = groups[key];

    const slotBlock = document.createElement("div");
    slotBlock.className = "waiver-slot-block";

slotBlock.innerHTML = `
  <h3 class="waiver-slot-title">${group.conference} - Slot ${group.slot}</h3>
  <div class="waiver-slot-content"></div>
`;

    group.rows.forEach(orderRow => {
      const originalTeam = teamMap[orderRow.original_team_id];
      const savedCall = getCallByOrderId(orderRow.id);
      const slotActuallyOpen = isSlotOpen(orderRow.slot);
      const slotOpen = slotActuallyOpen && !isAdminViewingAsTeam();

      const isVia = String(orderRow.original_team_id) !== String(orderRow.owner_team_id);

      const card = document.createElement("div");
      card.className = "dynamic-call-card";
      card.dataset.orderId = orderRow.id;

      if (String(activeWaiverOrderId) === String(orderRow.id)) {
        card.classList.add("active-call-target");
      }

      card.innerHTML = `
        <div class="dynamic-call-header">
          <div class="dynamic-call-title">
            <strong>Chiamata #${orderRow.priority_number} - Slot ${normalizeSlot(orderRow.slot)}</strong>
            <span>${group.conference}</span>
            ${isVia ? `<span class="via-badge">via ${originalTeam?.name || "squadra originale"}</span>` : ""}
          </div>

          <span class="order-position-pill">#${orderRow.priority_number}</span>
        </div>

        <label class="player-choice-label">Giocatore da acquistare</label>
        <input
          type="text"
          class="dynamic-player-in ${savedCall?.player_in ? "has-player-selection" : ""}"
          data-order-id="${orderRow.id}"
          readonly
          placeholder="Nessun giocatore selezionato"
          value="${savedCall?.player_in || ""}"
          ${slotOpen ? "" : "disabled"}
        />

        <div class="player-choice-actions">
          <button
            type="button"
            class="secondary-btn choose-player-btn select-dynamic-call-btn"
            data-order-id="${orderRow.id}"
            ${slotOpen ? "" : "disabled"}
          >
            ${savedCall?.player_in ? "✏️ Cambia giocatore" : "🔍 Scegli giocatore"}
          </button>
        </div>

        <label>Giocatore da svincolare</label>
        <select
          class="dynamic-player-out"
          data-order-id="${orderRow.id}"
          ${slotOpen ? "" : "disabled"}
        >
          ${buildPlayerOutOptions(savedCall?.player_out_id, savedCall?.player_out || "")}
        </select>

        <div class="call-actions">
          <button
            type="button"
            class="primary-btn save-dynamic-call-btn"
            data-order-id="${orderRow.id}"
            ${slotOpen ? "" : "disabled"}
          >
            Salva chiamata
          </button>

          <button
            type="button"
            class="secondary-btn reset-dynamic-call-btn"
            data-order-id="${orderRow.id}"
            ${slotOpen ? "" : "disabled"}
          >
            Cancella chiamata
          </button>
        </div>

        <p class="call-message">
          ${
            isAdminViewingAsTeam()
              ? savedCall
                ? `👁️ Modalità test · chiamata salvata il ${formatWaiverDateTime(savedCall.updated_at)}`
                : "👁️ Modalità test · nessuna chiamata salvata."
              : savedCall
                ? `✅ Chiamata salvata il ${formatWaiverDateTime(savedCall.updated_at)}`
                : slotOpen
                  ? "Nessuna chiamata salvata."
                  : `Slot ${normalizeSlot(orderRow.slot)} chiuso o non disponibile.`
          }
        </p>
      `;

     const slotContent = slotBlock.querySelector(".waiver-slot-content");
slotContent.appendChild(card);
    });
     
    myWaiverCallsEl.appendChild(slotBlock);
  });

  document.querySelectorAll(".select-dynamic-call-btn").forEach(button => {
    button.addEventListener("click", () => {
      beginWaiverPlayerSelection(button.dataset.orderId);
    });
  });

  document.querySelectorAll(".save-dynamic-call-btn").forEach(button => {
    button.addEventListener("click", () => {
      saveDynamicCall(button.dataset.orderId);
    });
  });

  document.querySelectorAll(".reset-dynamic-call-btn").forEach(button => {
    button.addEventListener("click", () => {
      resetDynamicCall(button.dataset.orderId);
    });
  });
}

async function loadMyCompensatoryCalls() {
  if (!currentTeam || !currentSettings || !myCompensatoryCallsEl) return;

  const { data, error } = await supabase
    .from("waiver_compensatory_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("team_id", currentTeam.id)
    .neq("status", "cancelled")
    .order("priority_order", { ascending: true });

  if (error) {
    console.error("Errore caricamento compensative:", error);
    myCompensatoryCallsEl.innerHTML = "<p>Errore nel caricamento delle chiamate compensative.</p>";
    return;
  }

  myCompensatoryCalls = (data || []).slice().sort(sortCompensatoryCalls);
  renderMyCompensatoryCalls();
}

function renderMyCompensatoryCalls() {
  if (!myCompensatoryCallsEl) return;

  const mobileExtraBadge = document.getElementById("mobileExtraBadge");

  if (mobileExtraBadge) {
    mobileExtraBadge.style.display =
      myCompensatoryCalls && myCompensatoryCalls.length > 0
        ? "inline-flex"
        : "none";
  }

  if (!myCompensatoryCalls || myCompensatoryCalls.length === 0) {
    myCompensatoryCallsEl.innerHTML = "<p>Nessuna chiamata compensativa disponibile.</p>";
    return;
  }

  myCompensatoryCallsEl.innerHTML = "";

  const callsByTier = {
    high: myCompensatoryCalls.filter(
      call => normalizeCompensatoryTier(call.priority_tier) === "high"
    ),
    normal: myCompensatoryCalls.filter(
      call => normalizeCompensatoryTier(call.priority_tier) === "normal"
    )
  };

  let renderedTier = null;

  myCompensatoryCalls.forEach(call => {
    const tier = normalizeCompensatoryTier(call.priority_tier);
    const isInjuryReserveCall = Boolean(call.injury_reserve_id);

    if (tier !== renderedTier) {
      const tierHeader = document.createElement("div");
      tierHeader.className = `my-compensatory-tier-header compensatory-tier-${tier}`;
      tierHeader.innerHTML = `
        <strong>${getCompensatoryTierLabel(tier)}</strong>
        <span>${tier === "high" ? "Prima del waiver · finestra prioritarie" : "Dopo il waiver · finestra compensative"}</span>
      `;
      myCompensatoryCallsEl.appendChild(tierHeader);

      const orderManager = buildCompensatoryOrderManager(
        tier,
        callsByTier[tier]
      );
      if (orderManager) {
        myCompensatoryCallsEl.appendChild(orderManager);
      }

      renderedTier = tier;
    }

    const isEditable =
      (call.status === "pending" || call.status === "submitted") &&
      isCompensatoryOpen(call) &&
      !isAdminViewingAsTeam();

    const requiresPlayerOut = call.requires_player_out === true;
    const reasonLabel = getCompensatoryReasonLabel(call);
    const modeLabel = getCompensatoryModeLabel(call);

    const card = document.createElement("div");
    card.className = `dynamic-call-card compensatory-call-card compensatory-tier-${tier}`;
    card.dataset.callId = call.id;

    if (String(activeCompensatoryCallId) === String(call.id)) {
      card.classList.add("active-call-target");
    }

    card.innerHTML = `
      <div class="dynamic-call-header">
        <div class="dynamic-call-title">
          <strong>${getCompensatoryTierLabel(call)} #${call.priority_order || "-"}</strong>
          <span>${call.phase || ""} - Week ${call.week || ""}</span>
          <span class="compensatory-tier-badge ${tier}">${getCompensatoryTierShortLabel(call)}</span>
          <span class="via-badge">${reasonLabel}</span>
          <span class="via-badge">${modeLabel}</span>
        </div>

        <span class="order-position-pill">${tier === "high" ? "P" : "C"}${call.priority_order || "-"}</span>
      </div>

      <label class="player-choice-label">
        ${requiresPlayerOut ? `<span class="call-step-number">1</span>` : ""}
        Giocatore da acquistare
      </label>
      <input
        type="text"
        class="compensatory-player-in ${call.player_in ? "has-player-selection" : ""}"
        data-call-id="${call.id}"
        readonly
        placeholder="Nessun giocatore selezionato"
        value="${call.player_in || ""}"
        ${isEditable ? "" : "disabled"}
      />

      <div class="player-choice-actions">
        <button
          type="button"
          class="secondary-btn choose-player-btn select-compensatory-call-btn"
          data-call-id="${call.id}"
          ${isEditable ? "" : "disabled"}
        >
          ${call.player_in ? "✏️ Cambia giocatore" : "🔍 Scegli giocatore"}
        </button>
      </div>

      ${requiresPlayerOut ? `
        <label class="player-choice-label">
          <span class="call-step-number">2</span>
          Giocatore da svincolare
        </label>
        <select
          class="compensatory-player-out"
          data-call-id="${call.id}"
          ${isEditable ? "" : "disabled"}
        >
          ${buildCompensatoryPlayerOutOptions(call.player_out_id, call.player_out || "")}
        </select>
      ` : ""}

      <div class="call-actions">
        <button
          type="button"
          class="primary-btn save-compensatory-call-btn"
          data-call-id="${call.id}"
          ${isEditable ? "" : "disabled"}
        >
          ${isInjuryReserveCall ? "Attiva IR e salva chiamata" : "Salva compensativa"}
        </button>

        <button
          type="button"
          class="secondary-btn reset-compensatory-call-btn"
          data-call-id="${call.id}"
          ${isEditable ? "" : "disabled"}
        >
          ${isInjuryReserveCall && call.status === "submitted" ? "Annulla attivazione IR" : "Cancella compensativa"}
        </button>
      </div>

      <p class="call-message">
        ${
          call.player_in
            ? `${isInjuryReserveCall ? "✅ Injury Reserve attivata" : "✅ Compensativa salvata"}: ${call.player_in}${requiresPlayerOut && call.player_out ? ` · sostituisce ${call.player_out}` : ""}`
            : isCompensatoryOpen(call)
              ? isInjuryReserveCall
                ? "Lo slot IR non è ancora consumato. Si attiverà soltanto quando salvi questa chiamata."
                : "Nessuna compensativa salvata."
              : "Compensative chiuse o non disponibili."
        }
        <br>
        Stato: <strong>${call.status || "pending"}</strong>
      </p>
    `;

    myCompensatoryCallsEl.appendChild(card);
  });

  document.querySelectorAll(".select-compensatory-call-btn").forEach(button => {
    button.addEventListener("click", () => {
      beginCompensatoryPlayerSelection(button.dataset.callId);
    });
  });

  document.querySelectorAll(".save-compensatory-call-btn").forEach(button => {
    button.addEventListener("click", () => {
      saveCompensatoryCall(button.dataset.callId);
    });
  });

  document.querySelectorAll(".reset-compensatory-call-btn").forEach(button => {
    button.addEventListener("click", () => {
      resetCompensatoryCall(button.dataset.callId);
    });
  });

  document.querySelectorAll(".save-compensatory-order-btn").forEach(button => {
    button.addEventListener("click", () => {
      saveMyCompensatoryOrder(button.dataset.tier);
    });
  });

  document.querySelectorAll(".my-compensatory-order-select").forEach(select => {
    select.addEventListener("change", () => {
      const previousPriority = String(select.dataset.selectedPriority || "");
      const selectedPriority = String(select.value || "");
      const tier = select.dataset.tier;
      const sibling = Array.from(document.querySelectorAll(
        `.my-compensatory-order-select[data-tier="${tier}"]`
      )).find(item => item !== select && String(item.value) === selectedPriority);

      if (sibling && previousPriority) {
        sibling.value = previousPriority;
        sibling.dataset.selectedPriority = previousPriority;
      }

      select.dataset.selectedPriority = selectedPriority;
    });
  });
}

async function saveMyCompensatoryOrder(tierValue) {
  if (blockTeamWriteWhileViewingAs()) return;

  const tier = normalizeCompensatoryTier(tierValue);
  const calls = myCompensatoryCalls.filter(
    call => normalizeCompensatoryTier(call.priority_tier) === tier
  );

  if (!isCompensatoryOrderEditable(calls)) {
    setMessage("L’ordine di queste compensative non è modificabile.", true);
    return;
  }

  const selects = Array.from(document.querySelectorAll(
    `.my-compensatory-order-select[data-tier="${tier}"]`
  ));
  const assignments = selects.map(select => ({
    call_id: select.dataset.callId,
    priority_order: Number(select.value)
  }));
  const selectedPriorities = assignments.map(item => item.priority_order);
  const availablePriorities = calls
    .map(call => Number(call.priority_order))
    .sort((a, b) => a - b);

  if (
    assignments.length !== calls.length ||
    new Set(selectedPriorities).size !== selectedPriorities.length ||
    selectedPriorities.slice().sort((a, b) => a - b).join(",") !==
      availablePriorities.join(",")
  ) {
    setMessage("Ogni posizione può essere assegnata a un solo diritto.", true);
    return;
  }

  const saveButton = document.querySelector(
    `.save-compensatory-order-btn[data-tier="${tier}"]`
  );
  if (saveButton) saveButton.disabled = true;

  const { error } = await supabase.rpc("reorder_my_compensatory_calls", {
    p_assignments: assignments
  });

  if (error) {
    console.error("Errore modifica ordine compensative:", error);
    setMessage("Errore modifica ordine: " + error.message, true);
    if (saveButton) saveButton.disabled = false;
    return;
  }

  setMessage("Ordine delle compensative aggiornato correttamente.");
  await loadMyCompensatoryCalls();
  await renderPublicWaiverOrder();

  if (currentUserIsAdmin) {
    await loadAllCompensatoryCalls();
  }
}

async function saveCompensatoryCall(callId) {
  if (blockTeamWriteWhileViewingAs()) return;
  if (!currentTeam || !currentSettings) return;

  const call = myCompensatoryCalls.find(
    item => String(item.id) === String(callId)
  );

  if (!call) {
    setMessage("Compensativa non trovata.", true);
    return;
  }

  const playerInEl = document.querySelector(
    `.compensatory-player-in[data-call-id="${callId}"]`
  );

  const playerIn = playerInEl?.value.trim() || "";
  const playerInId = playerInEl?.dataset.playerId || call.player_in_id || null;

  if (!playerIn || !playerInId) {
    setMessage("Seleziona il giocatore da prendere con la compensativa.", true);
    return;
  }

  let playerOut = null;
  let playerOutId = null;

  if (call.requires_player_out === true) {
    const playerOutEl = document.querySelector(
      `.compensatory-player-out[data-call-id="${callId}"]`
    );

    playerOutId = playerOutEl?.value || null;
    const selectedOption = playerOutEl?.selectedOptions?.[0];
    playerOut = selectedOption && playerOutId
      ? selectedOption.textContent.trim()
      : "";

    if (!playerOut || !playerOutId) {
      setMessage(
        "Questa compensativa richiede anche il giocatore da sostituire.",
        true
      );
      return;
    }
  }

  const { error } = await supabase
    .from("waiver_compensatory_calls")
    .update({
      player_in: playerIn,
      player_in_id: playerInId,
      player_out: playerOut,
      player_out_id: playerOutId,
      status: "submitted",
      updated_at: new Date().toISOString()
    })
    .eq("id", callId)
    .eq("team_id", currentTeam.id);

  if (error) {
    console.error("Errore salvataggio compensativa:", error);
    setMessage("Errore salvataggio compensativa: " + error.message, true);
    return;
  }

  setMessage(
    call.injury_reserve_id
      ? "Injury Reserve attivata e chiamata salvata correttamente."
      : "Chiamata compensativa salvata correttamente."
  );

  await loadMyCompensatoryCalls();

  if (call.injury_reserve_id) {
    await loadInjuryReserveMonitor();
    await Promise.all([
      loadMyOwnedPlayers(),
      loadMyReplacementCandidates(),
      loadFreeAgents()
    ]);
  }

  if (currentUserIsAdmin) {
    await loadAllCompensatoryCalls();
  }
}

async function resetCompensatoryCall(callId) {
  if (blockTeamWriteWhileViewingAs()) return;
  const call = myCompensatoryCalls.find(
    item => String(item.id) === String(callId)
  );
  const confirmed = confirm(
    call?.injury_reserve_id
      ? "Vuoi annullare la chiamata IR? Lo slot tornerà disponibile e il conteggio dei giorni verrà azzerato."
      : "Vuoi cancellare questa chiamata compensativa?"
  );
  if (!confirmed) return;

  const { error } = await supabase
    .from("waiver_compensatory_calls")
    .update({
      player_in: null,
      player_in_id: null,
      player_out: null,
      player_out_id: null,
      status: "pending",
      updated_at: new Date().toISOString()
    })
    .eq("id", callId)
    .eq("team_id", currentTeam.id);

  if (error) {
    console.error("Errore cancellazione compensativa:", error);
    setMessage("Errore nella cancellazione della compensativa.", true);
    return;
  }

  setMessage(
    call?.injury_reserve_id
      ? "Chiamata IR annullata. Lo slot non risulta utilizzato."
      : "Compensativa cancellata."
  );

  await loadMyCompensatoryCalls();

  if (call?.injury_reserve_id) {
    await loadInjuryReserveMonitor();
    await Promise.all([
      loadMyOwnedPlayers(),
      loadMyReplacementCandidates(),
      loadFreeAgents()
    ]);
  }

  if (currentUserIsAdmin) {
    await loadAllCompensatoryCalls();
  }
}

function fillActiveCallWithPlayer(player) {
  if (blockTeamWriteWhileViewingAs()) return;

  const origin = playerSelectionOrigin
    ? { ...playerSelectionOrigin }
    : null;

  if (activeCompensatoryCallId) {
    const callId = String(activeCompensatoryCallId);

    const input = document.querySelector(
      `.compensatory-player-in[data-call-id="${callId}"]`
    );

    if (!input) return;

    input.value = player.role ? `${player.name} (${player.role})` : player.name;
    input.dataset.playerId = player.id || "";
    input.classList.add("has-player-selection");

    const chooseButton = document.querySelector(
      `.select-compensatory-call-btn[data-call-id="${callId}"]`
    );

    if (chooseButton) {
      chooseButton.textContent = "✏️ Cambia giocatore";
    }

    document
      .querySelectorAll("#freeAgentsTable tbody tr.selected-player")
      .forEach(row => row.classList.remove("selected-player"));

    if (player.rowElement) {
      player.rowElement.classList.add("selected-player");
    }

    setMessage(`Giocatore da acquistare selezionato: ${input.value}`);
    finishPlayerSelection(origin || { type: "compensatory", id: callId });
    return;
  }

  if (!activeWaiverOrderId) {
    alert('Prima premi "Scegli giocatore" nella chiamata che vuoi compilare.');
    return;
  }

  const orderId = String(activeWaiverOrderId);

  const orderRow = myOrderRows.find(
    row => String(row.id) === orderId
  );

  if (!orderRow) {
    alert("Chiamata non trovata.");
    return;
  }

  if (!isSlotOpen(orderRow.slot)) {
    alert("Questo slot non è aperto.");
    return;
  }

  const input = document.querySelector(
    `.dynamic-player-in[data-order-id="${orderId}"]`
  );

  if (!input) return;

  input.value = player.role ? `${player.name} (${player.role})` : player.name;
  input.dataset.playerId = player.id || "";
  input.classList.add("has-player-selection");

  const chooseButton = document.querySelector(
    `.select-dynamic-call-btn[data-order-id="${orderId}"]`
  );

  if (chooseButton) {
    chooseButton.textContent = "✏️ Cambia giocatore";
  }

  document
    .querySelectorAll("#freeAgentsTable tbody tr.selected-player")
    .forEach(row => row.classList.remove("selected-player"));

  if (player.rowElement) {
    player.rowElement.classList.add("selected-player");
  }

  setMessage(`Giocatore da acquistare selezionato: ${input.value}`);
  finishPlayerSelection(origin || { type: "waiver", id: orderId });
}

async function saveDynamicCall(orderId) {
  if (blockTeamWriteWhileViewingAs()) return;
  if (!currentTeam || !currentSettings) return;

  const orderRow = myOrderRows.find(row => String(row.id) === String(orderId));

  if (!orderRow) {
    setMessage("Errore: chiamata non trovata.", true);
    return;
  }

  if (!isSlotOpen(orderRow.slot)) {
    setMessage("Questo slot non è aperto.", true);
    return;
  }

  const playerInEl = document.querySelector(`.dynamic-player-in[data-order-id="${orderId}"]`);
  const playerOutEl = document.querySelector(`.dynamic-player-out[data-order-id="${orderId}"]`);

const playerIn = playerInEl?.value.trim() || "";
const playerInId = playerInEl?.dataset.playerId || null;

const playerOutId = playerOutEl?.value || null;
const selectedOutOption = playerOutEl?.selectedOptions?.[0];
const playerOut = selectedOutOption && playerOutId
  ? selectedOutOption.textContent.trim()
  : "";

if (!playerIn || !playerInId || !playerOut || !playerOutId) {
  setMessage("Seleziona giocatore chiamato e giocatore da svincolare.", true);
  return;
}

   const u21RuleCheck = validateU21WaiverRule(playerOutId, playerInId);

if (!u21RuleCheck.valid) {
  setMessage(u21RuleCheck.message, true);
  return;
}

  const payload = {
    waiver_order_id: orderRow.id,
    team_id: currentTeam.id,
    owner_team_id: orderRow.owner_team_id,
    original_team_id: orderRow.original_team_id,
    priority_number: orderRow.priority_number,
    week: currentSettings.active_week,
    phase: currentSettings.active_phase,
    conference: orderRow.conference,
    slot: normalizeSlot(orderRow.slot),
   player_in: playerIn,
player_out: playerOut,
player_in_id: playerInId,
player_out_id: playerOutId,
status: "pending",
    updated_at: new Date().toISOString()
  };

  const { data: existingCall, error: existingError } = await supabase
    .from("waiver_calls")
    .select("id")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("slot", normalizeSlot(orderRow.slot))
    .eq("waiver_order_id", orderRow.id)
    .maybeSingle();

  if (existingError) {
    console.error("Errore ricerca chiamata esistente:", existingError);
    setMessage("Errore nel salvataggio.", true);
    return;
  }

  let error;

  if (existingCall) {
    const result = await supabase
      .from("waiver_calls")
      .update(payload)
      .eq("id", existingCall.id);

    error = result.error;
  } else {
    const result = await supabase
      .from("waiver_calls")
      .insert(payload);

    error = result.error;
  }

  if (error) {
    console.error("Errore salvataggio chiamata:", error);
    setMessage("Errore salvataggio: " + error.message, true);
    return;
  }

  setMessage("Chiamata salvata correttamente.");

  await loadMyWaiverCalls();
  await loadAllCalls();
   await renderPublicWaiverOrder();
}

async function resetDynamicCall(orderId) {
  if (blockTeamWriteWhileViewingAs()) return;
  const playerInEl = document.querySelector(`.dynamic-player-in[data-order-id="${orderId}"]`);
  const playerOutEl = document.querySelector(`.dynamic-player-out[data-order-id="${orderId}"]`);

  if (playerInEl) {
    playerInEl.value = "";
    delete playerInEl.dataset.playerId;
    playerInEl.classList.remove("has-player-selection");
  }

  const chooseButton = document.querySelector(
    `.select-dynamic-call-btn[data-order-id="${orderId}"]`
  );

  if (chooseButton) {
    chooseButton.textContent = "🔍 Scegli giocatore";
  }

  if (playerOutEl) playerOutEl.value = "";

  const existingCall = mySavedCalls.find(
    call => String(call.waiver_order_id) === String(orderId)
  );

  if (existingCall) {
    const confirmed = confirm("Vuoi cancellare questa chiamata salvata?");
    if (!confirmed) return;

    const { error } = await supabase
      .from("waiver_calls")
      .delete()
      .eq("id", existingCall.id);

    if (error) {
      console.error("Errore cancellazione chiamata:", error);
      setMessage("Errore nella cancellazione.", true);
      return;
    }

    setMessage("Chiamata cancellata.");
    await loadMyWaiverCalls();
    await loadAllCalls();
     await renderPublicWaiverOrder();
    return;
  }

  setMessage("Box pulito.");
}

/* ===============================
   ADMIN CHIAMATE
================================ */

async function loadAllCalls() {
  if (!currentSettings || !allCallsEl) return;

  /*
    PRIVACY ADMIN:
    NON carichiamo player_in, player_out o relativi ID.
    L'admin deve sapere solo se una chiamata è stata ricevuta.
  */
  const { data: calls, error } = await supabase
    .from("waiver_calls")
    .select(`
      id,
      waiver_order_id,
      team_id,
      owner_team_id,
      original_team_id,
      priority_number,
      conference,
      slot,
      status,
      updated_at
    `)
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase);

  if (error) {
    console.error("Errore caricamento ricevute chiamate admin:", error);
    allCallsEl.innerHTML =
      "<p>Errore nel caricamento dello stato delle chiamate.</p>";
    return;
  }

  const callsByOrderId = {};

  (calls || []).forEach(call => {
    if (call.waiver_order_id) {
      callsByOrderId[String(call.waiver_order_id)] = call;
    }
  });

  allCallsEl.innerHTML = "";

  if (!waiverOrderRows || waiverOrderRows.length === 0) {
    allCallsEl.innerHTML = "<p>Nessun ordine waiver disponibile.</p>";
    return;
  }

  const groups = groupRowsByConferenceAndSlot(waiverOrderRows);
  const sortedKeys = sortGroupKeys(Object.keys(groups));

  sortedKeys.forEach(key => {
    const group = groups[key];

    const groupDiv = document.createElement("div");
    groupDiv.className = "admin-calls-group";

    groupDiv.innerHTML = `
      <h4>${group.conference} - Slot ${group.slot}</h4>
    `;

    group.rows
      .slice()
      .sort((a, b) => a.priority_number - b.priority_number)
      .forEach(orderRow => {
        const call = callsByOrderId[String(orderRow.id)];

        const originalTeam = teamMap[orderRow.original_team_id];
        const ownerTeam = orderRow.owner_team_id
          ? teamMap[orderRow.owner_team_id]
          : null;

        const ownerName =
          ownerTeam?.name ||
          originalTeam?.name ||
          "Squadra sconosciuta";

        const isVia =
          ownerTeam &&
          originalTeam &&
          String(ownerTeam.id) !== String(originalTeam.id);

        const div = document.createElement("div");
        div.className = "admin-call-receipt";

        div.innerHTML = `
          <strong>#${orderRow.priority_number} ${ownerName}</strong>

          ${
            isVia
              ? `<span>via ${originalTeam.name}</span>`
              : ""
          }

          <span>
            ${
              call
                ? "✅ Chiamata ricevuta"
                : "⏳ Nessuna chiamata ricevuta"
            }
          </span>

          ${
            call?.updated_at
              ? `<small>Ultimo salvataggio: ${formatWaiverDateTime(call.updated_at)}</small>`
              : ""
          }
        `;

        groupDiv.appendChild(div);
      });

    allCallsEl.appendChild(groupDiv);
  });
}

async function loadAllCompensatoryCalls() {
  if (!currentSettings || !allCompensatoryCallsEl) return;

  /*
    PRIVACY ADMIN COMPENSATIVE:
    niente player_in / player_out.
    L'admin vede stato, tipo e motivo, ma non il giocatore chiamato.
  */
  const { data, error } = await supabase
    .from("waiver_compensatory_calls")
    .select(`
      id,
      team_id,
      priority_tier,
      priority_order,
      requires_player_out,
      reason_type,
      reason_note,
      injury_reserve_id,
      status,
      updated_at
    `)
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .order("priority_order", { ascending: true });

  if (error) {
    console.error("Errore caricamento compensative admin:", error);
    allCompensatoryCallsEl.innerHTML =
      "<p>Errore nel caricamento compensative.</p>";
    return;
  }

  if (!data || data.length === 0) {
    allCompensatoryCallsEl.innerHTML =
      "<p>Nessuna chiamata compensativa.</p>";
    return;
  }

  allCompensatoryCallsEl.innerHTML = "";

  const groups = {};

  data.filter(call => call.status !== "cancelled").forEach(call => {
    const groupName = getCompensatoryGroupForTeamId(call.team_id);
    const tier = normalizeCompensatoryTier(call.priority_tier);
    const key = `${groupName}__${tier}`;

    if (!groups[key]) {
      groups[key] = [];
    }

    groups[key].push(call);
  });

  const groupOrder = isConferencePhase()
    ? ["Conference League", "Conference Championship"]
    : ["Totale"];

  ["high", "normal"].forEach(tier => {
    groupOrder.forEach(groupName => {
    const calls = groups[`${groupName}__${tier}`];

    if (!calls || calls.length === 0) return;

    calls.sort(sortCompensatoryCalls);

    const groupDiv = document.createElement("div");
    groupDiv.className = "admin-calls-group";

    groupDiv.innerHTML = `
      <h4>
        ${
          groupName === "Totale"
            ? getCompensatoryTierLabel(tier)
            : `${groupName} - ${getCompensatoryTierLabel(tier)}`
        }
        <span class="compensatory-tier-badge ${tier}">${getCompensatoryTierShortLabel(tier)}</span>
      </h4>
    `;

    calls.forEach(call => {
      const team = teamMap[call.team_id];
      const isSystemIrCall = Boolean(call.injury_reserve_id);

      const submitted =
        call.status === "submitted" ||
        call.status === "won" ||
        call.status === "lost";

      const teamOptions = teamsCache
        .map(item => `
          <option value="${item.id}" ${String(item.id) === String(call.team_id) ? "selected" : ""}>
            ${item.name}
          </option>
        `)
        .join("");

      const div = document.createElement("div");
      div.className = `admin-compensatory-row compensatory-tier-${tier}`;

      div.innerHTML = `
        <div class="admin-compensatory-main">
          <strong>
            ${tier === "high" ? "P" : "C"}${call.priority_order || "-"}
            ${team?.name || "Squadra sconosciuta"}
          </strong>

          <span>${getCompensatoryTierShortLabel(call)} · ${getCompensatoryModeLabel(call)} · ${getCompensatoryReasonLabel(call)}</span>

          <span>
            ${submitted ? "✅ Chiamata ricevuta" : "⏳ Nessuna chiamata ricevuta"}
          </span>

          ${
            submitted && call.updated_at
              ? `<small>Ultimo salvataggio: ${formatWaiverDateTime(call.updated_at)}</small>`
              : ""
          }

          <div class="admin-compensatory-edit-grid">
            <label>
              Squadra
              <select class="waiver-owner-select admin-comp-team-edit" data-call-id="${call.id}" ${isSystemIrCall ? "disabled" : ""}>
                ${teamOptions}
              </select>
            </label>

            <label>
              Priorità
              <input
                type="number"
                min="1"
                class="admin-comp-priority-edit"
                data-call-id="${call.id}"
                value="${call.priority_order || 1}"
              />
            </label>

            <label>
              Tipo
              <select class="waiver-owner-select admin-comp-tier-edit" data-call-id="${call.id}" ${isSystemIrCall ? "disabled" : ""}>
                <option value="high" ${tier === "high" ? "selected" : ""}>Prioritaria</option>
                <option value="normal" ${tier === "normal" ? "selected" : ""}>Normale</option>
              </select>
            </label>

            <label>
              Modalità
              <select class="waiver-owner-select admin-comp-mode-edit" data-call-id="${call.id}" ${isSystemIrCall ? "disabled" : ""}>
                <option value="extra" ${call.requires_player_out ? "" : "selected"}>Solo ingresso</option>
                <option value="replace" ${call.requires_player_out ? "selected" : ""}>Sostituzione 1→1</option>
              </select>
            </label>

            <label>
              Motivo
              <select class="waiver-owner-select admin-comp-reason-edit" data-call-id="${call.id}" ${isSystemIrCall ? "disabled" : ""}>
                <option value="trade" ${(call.reason_type || "trade") === "trade" ? "selected" : ""}>Trade sbilanciata</option>
                <option value="serie_a_exit" ${call.reason_type === "serie_a_exit" ? "selected" : ""}>Giocatore uscito dalla Serie A</option>
                <option value="injury_reserve" ${call.reason_type === "injury_reserve" ? "selected" : ""}>Injury Reserve</option>
                <option value="other" ${call.reason_type === "other" ? "selected" : ""}>Altro</option>
              </select>
            </label>

            <label>
              Nota / descrizione
              <input
                type="text"
                class="admin-comp-note-edit"
                data-call-id="${call.id}"
                value="${String(call.reason_note || "").replace(/"/g, "&quot;")}"
                placeholder="Opzionale"
                ${isSystemIrCall ? "disabled" : ""}
              />
            </label>
          </div>
        </div>

        <div class="admin-compensatory-actions">
          <button
            type="button"
            class="primary-btn small-btn save-admin-compensatory-btn"
            data-call-id="${call.id}"
          >
            ${isSystemIrCall ? "Salva priorità IR" : "Salva modifiche"}
          </button>

          <button
            type="button"
            class="secondary-btn small-btn delete-compensatory-btn"
            data-call-id="${call.id}"
            ${isSystemIrCall ? "disabled" : ""}
          >
            Elimina
          </button>
        </div>
      `;

      groupDiv.appendChild(div);
    });

    allCompensatoryCallsEl.appendChild(groupDiv);
  });
  });

  document
    .querySelectorAll(".save-admin-compensatory-btn")
    .forEach(button => {
      button.addEventListener("click", () => {
        updateAdminCompensatoryCall(button.dataset.callId);
      });
    });

  document
    .querySelectorAll(".delete-compensatory-btn")
    .forEach(button => {
      button.addEventListener("click", () => {
        deleteAdminCompensatoryCall(button.dataset.callId);
      });
    });
}

async function updateAdminCompensatoryCall(callId) {
  const teamId = document.querySelector(
    `.admin-comp-team-edit[data-call-id="${callId}"]`
  )?.value || "";

  const priority = Number(document.querySelector(
    `.admin-comp-priority-edit[data-call-id="${callId}"]`
  )?.value || 0);

  const priorityTier = normalizeCompensatoryTier(document.querySelector(
    `.admin-comp-tier-edit[data-call-id="${callId}"]`
  )?.value || "normal");

  const mode = document.querySelector(
    `.admin-comp-mode-edit[data-call-id="${callId}"]`
  )?.value || "extra";

  const reasonType = document.querySelector(
    `.admin-comp-reason-edit[data-call-id="${callId}"]`
  )?.value || "trade";

  const reasonNote = document.querySelector(
    `.admin-comp-note-edit[data-call-id="${callId}"]`
  )?.value?.trim() || null;

  if (!teamId || !priority || priority < 1) {
    setAdminMessage("Controlla squadra e priorità della compensativa.", true);
    return;
  }

  const requiresPlayerOut = mode === "replace";

  const { data: existingCall, error: existingCallError } = await supabase
    .from("waiver_compensatory_calls")
    .select("team_id, priority_tier, requires_player_out, injury_reserve_id, status")
    .eq("id", callId)
    .maybeSingle();

  if (existingCallError || !existingCall) {
    console.error("Errore lettura compensativa prima della modifica:", existingCallError);
    setAdminMessage("Impossibile leggere la compensativa da modificare.", true);
    return;
  }

  if (existingCall.injury_reserve_id) {
    const { error: irPriorityError } = await supabase
      .from("waiver_compensatory_calls")
      .update({
        priority_order: priority,
        updated_at: new Date().toISOString()
      })
      .eq("id", callId);

    if (irPriorityError) {
      console.error("Errore modifica priorità compensativa IR:", irPriorityError);
      setAdminMessage(
        "Errore modifica priorità IR: " + irPriorityError.message,
        true
      );
      return;
    }

    setAdminMessage("Priorità della compensativa IR aggiornata correttamente.");
    await loadMyCompensatoryCalls();
    await loadAllCompensatoryCalls();
    await renderPublicWaiverOrder();
    return;
  }

  const structureChanged =
    String(existingCall.team_id) !== String(teamId) ||
    normalizeCompensatoryTier(existingCall.priority_tier) !== priorityTier ||
    existingCall.requires_player_out === true !== requiresPlayerOut;

  const { error } = await supabase
    .from("waiver_compensatory_calls")
    .update({
      team_id: teamId,
      priority_tier: priorityTier,
      priority_order: priority,
      requires_player_out: requiresPlayerOut,
      reason_type: reasonType,
      reason_note: reasonNote,
      ...(structureChanged
        ? {
            player_in: null,
            player_in_id: null,
            player_out: null,
            player_out_id: null,
            status: "pending"
          }
        : requiresPlayerOut
          ? {}
          : {
              player_out: null,
              player_out_id: null
            }),
      updated_at: new Date().toISOString()
    })
    .eq("id", callId);

  if (error) {
    console.error("Errore modifica compensativa admin:", error);
    setAdminMessage("Errore modifica compensativa: " + error.message, true);
    return;
  }

  setAdminMessage("Compensativa aggiornata correttamente.");

  await loadMyReplacementCandidates();
  await loadMyCompensatoryCalls();
  await loadAllCompensatoryCalls();
  await renderPublicWaiverOrder();
}

/* ===============================
   SVINCOLATI
================================ */

function getPoolForTeamConference(team) {
  if (!team) return null;

  return team.conference === "Conference Championship"
    ? "conference_championship"
    : "conference_league";
}

function isUnifiedWaiverPhase() {
  const phase = String(currentSettings?.active_phase || "").toLowerCase();
  return phase === "round_robin" || phase === "playoff";
}

function mapPlayerRow(p) {
  return {
    id: p.id,
    external_id: p.external_id,
    name: p.name || "",
    role: p.role || p.role_mantra || "",
    serieATeam: p.serie_a_team || "",
    quotation: p.quotation ?? "",
is_u21: !!p.is_u21,
is_u21_slot: !!p.is_u21_slot,
is_u21_keeper: !!p.is_u21_keeper,
is_fp: !!p.is_fp,
    pool: p.pool,
    status: p.status || "",
    unavailable_until_week: p.unavailable_until_week,
    unavailable_until_phase: p.unavailable_until_phase,
    unavailable_reason: p.unavailable_reason
  };
}

function isPlayerBlockedThisWaiverWeek(player) {
  if (!currentSettings) return false;

  const blockedReasons = [
    "trade_cut",
    "waiver_cut",
    "ir_cut",
    "ir_reintegration_cut",
    "ir_auto_cut"
  ];

  return (
    blockedReasons.includes(String(player.unavailable_reason || "")) &&
    Number(player.unavailable_until_week) === Number(currentSettings.active_week) &&
    String(player.unavailable_until_phase || "") === String(currentSettings.active_phase || "")
  );
}

function filterAvailableFreeAgents(players) {
  return (players || []).filter(player => !isPlayerBlockedThisWaiverWeek(player));
}

async function loadMyOwnedPlayers() {
  if (!currentTeam || !currentSettings) return;

const selectFields = `
  id,
  external_id,
  name,
  role,
  role_mantra,
  serie_a_team,
  quotation,
  is_u21,
  is_u21_slot,
  is_u21_keeper,
  is_fp,
  owner_team_id,
  status,
  pool
`;

  let query = supabase
    .from("players")
    .select(selectFields)
    .eq("status", "active")
    .eq("owner_team_id", currentTeam.id);

  // In Conference vedo solo la mia copia/pool.
  // In Round Robin e Playoff vedo tutti i miei giocatori, anche se arrivano dai due pool.
  if (!isUnifiedWaiverPhase()) {
    query = query.eq("pool", getPoolForTeamConference(currentTeam));
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    console.error("Errore caricamento rosa squadra:", error);
    myOwnedPlayers = [];
    return;
  }

  myOwnedPlayers = (data || [])
    .filter(player => !currentTeamIrPlayerIds.has(String(player.id)))
    .map(mapPlayerRow);
}

async function loadMyReplacementCandidates() {
  if (!currentTeam || !currentSettings) return;

  const selectFields = `
    id,
    external_id,
    name,
    role,
    role_mantra,
    serie_a_team,
    quotation,
    is_u21,
    is_u21_slot,
    is_u21_keeper,
    is_fp,
    owner_team_id,
    status,
    pool
  `;

  let query = supabase
    .from("players")
    .select(selectFields)
    .eq("owner_team_id", currentTeam.id);

  // Qui NON filtro status=active: il giocatore da sostituire può essere
  // proprio quello appena uscito dalla Serie A e quindi già inattivo.
  if (!isUnifiedWaiverPhase()) {
    query = query.eq("pool", getPoolForTeamConference(currentTeam));
  }

  const { data, error } = await query.order("name", { ascending: true });

  if (error) {
    console.error("Errore caricamento candidati sostituzione:", error);
    myReplacementCandidates = [];
    return;
  }

  myReplacementCandidates = (data || [])
    .filter(player => !currentTeamIrPlayerIds.has(String(player.id)))
    .map(mapPlayerRow);
}

async function loadFreeAgents() {
  try {
    if (!currentSettings) return;

    freeAgents = [];

const selectFields = `
  id,
  external_id,
  name,
  role,
  role_mantra,
  serie_a_team,
  quotation,
  is_u21,
  is_fp,
  owner_team_id,
  status,
  pool,
  unavailable_until_week,
  unavailable_until_phase,
  unavailable_reason
`;

    // FASE CONFERENCE: ogni Conference vede solo il proprio pool
    if (!isUnifiedWaiverPhase()) {
      const pool = getPoolForTeamConference(currentTeam);

      const { data, error } = await supabase
        .from("players")
        .select(selectFields)
        .eq("status", "active")
        .eq("pool", pool)
        .is("owner_team_id", null)
        .order("name", { ascending: true });

      if (error) throw error;

freeAgents = filterAvailableFreeAgents((data || []).map(mapPlayerRow));
populateFreeAgentsFilters();
renderFreeAgents();
return;
    }

// ROUND ROBIN / PLAYOFF:
// la lista è unica come competizione, ma mantiene le due copie dei pool.
// Se un giocatore è libero in entrambe le Conference, compare due volte.
// Se è libero solo in una Conference, compare una volta.
const { data, error } = await supabase
  .from("players")
  .select(selectFields)
  .eq("status", "active")
  .is("owner_team_id", null)
  .in("pool", ["conference_league", "conference_championship"])
  .order("name", { ascending: true })
  .order("pool", { ascending: true });

if (error) throw error;

freeAgents = filterAvailableFreeAgents((data || []).map(mapPlayerRow));
populateFreeAgentsFilters();
renderFreeAgents();

  } catch (err) {
    console.error("Errore caricamento svincolati da Supabase:", err);

    if (freeAgentsTableBody) {
      freeAgentsTableBody.innerHTML = `
        <tr>
          <td colspan="4">Errore caricamento svincolati da Supabase.</td>
        </tr>
      `;
    }
  }
}

function sortFreeAgentsList(players) {
  return [...players].sort((a, b) => {
    let aValue = a[freeAgentsSortKey];
    let bValue = b[freeAgentsSortKey];

    if (freeAgentsSortKey === "quotation") {
      aValue = Number(aValue) || 0;
      bValue = Number(bValue) || 0;

      return freeAgentsSortDirection === "asc"
        ? aValue - bValue
        : bValue - aValue;
    }

    if (freeAgentsSortKey === "is_u21") {
      aValue = a.is_u21 ? 1 : 0;
      bValue = b.is_u21 ? 1 : 0;

      return freeAgentsSortDirection === "asc"
        ? bValue - aValue
        : aValue - bValue;
    }

    aValue = String(aValue || "").toLowerCase();
    bValue = String(bValue || "").toLowerCase();

    return freeAgentsSortDirection === "asc"
      ? aValue.localeCompare(bValue)
      : bValue.localeCompare(aValue);
  });
}

function updateFreeAgentsSortArrows() {
  document.querySelectorAll("#freeAgentsTable thead th[data-sort]").forEach(th => {
    const baseLabel = th.dataset.label || th.textContent.replace(/[↑↓]/g, "").trim();
    th.dataset.label = baseLabel;

    if (th.dataset.sort === freeAgentsSortKey) {
      th.textContent = `${baseLabel} ${freeAgentsSortDirection === "asc" ? "↑" : "↓"}`;
    } else {
      th.textContent = baseLabel;
    }
  });
}

function setupFreeAgentsSorting() {
  document.querySelectorAll("#freeAgentsTable thead th[data-sort]").forEach(th => {
    th.style.cursor = "pointer";

    th.addEventListener("click", () => {
      const sortKey = th.dataset.sort;

      if (freeAgentsSortKey === sortKey) {
        freeAgentsSortDirection = freeAgentsSortDirection === "asc" ? "desc" : "asc";
      } else {
        freeAgentsSortKey = sortKey;
        freeAgentsSortDirection = "asc";
      }

      updateFreeAgentsSortArrows();
      renderFreeAgents();
    });
  });

  updateFreeAgentsSortArrows();
}

function renderFreeAgents() {
  if (!freeAgentsTableBody) return;

  const query = (searchInput?.value || "").toLowerCase().trim();
  const selectedRole = (roleFilter?.value || "").toLowerCase().trim();
  const selectedSerieATeam = (serieATeamFilter?.value || "").toLowerCase().trim();
  const selectedU21 = u21Filter?.value || "";

  const filtered = freeAgents.filter(player => {
    const name = String(player.name || "").toLowerCase();
    const role = String(player.role || "").toLowerCase();
    const serieATeam = String(player.serieATeam || "").toLowerCase();
    const quotation = String(player.quotation || "").toLowerCase();

    const blob = `${name} ${role} ${serieATeam} ${quotation}`;

    const matchSearch = !query || blob.includes(query);
    const roleParts = role
  .split(";")
  .map(r => r.trim())
  .filter(Boolean);

const matchRole =
  !selectedRole ||
  roleParts.includes(selectedRole);
    const matchSerieATeam = !selectedSerieATeam || serieATeam === selectedSerieATeam;

    let matchU21 = true;

    if (selectedU21 === "u21") {
      matchU21 = player.is_u21 === true;
    }

    if (selectedU21 === "non-u21") {
      matchU21 = player.is_u21 !== true;
    }

    return matchSearch && matchRole && matchSerieATeam && matchU21;
  });

   const sortedFiltered = sortFreeAgentsList(filtered);

  freeAgentsTableBody.innerHTML = "";
sortedFiltered.forEach(player => {
    const tr = document.createElement("tr");

    const poolBadge =
      player.pool === "conference_league"
        ? "🟨"
        : player.pool === "conference_championship"
          ? "🟦"
          : "";

    const fpBadge = player.is_fp ? "⭐ FP" : "";

    tr.innerHTML = `
      <td>
        ${player.name}
        ${poolBadge || fpBadge ? `<span class="player-badges">${poolBadge} ${fpBadge}</span>` : ""}
      </td>
      <td>${player.role}</td>
      <td>${player.serieATeam}</td>
      <td>${player.quotation}</td>
      <td class="u21-cell">
        ${player.is_u21 ? `<span class="u21-table-badge">U21</span>` : ""}
      </td>
    `;

    tr.addEventListener("click", () => {
      if (isAdminViewingAsTeam()) return;

      fillActiveCallWithPlayer({
        ...player,
        rowElement: tr
      });
    });

    freeAgentsTableBody.appendChild(tr);
  });
}

async function applyWinningWaiverCall(call) {
  const winningTeamId = call.owner_team_id || call.team_id;

  if (!winningTeamId) {
    throw new Error("Squadra vincitrice non trovata.");
  }

  if (!call.player_in_id || !call.player_out_id) {
    throw new Error("Chiamata senza player_in_id o player_out_id.");
  }

  const nowIso = new Date().toISOString();

  // Leggiamo prima il giocatore in uscita.
  // Se occupa lo slot U21 normale, lo slot deve passare al nuovo U21.
  const { data: outgoingBefore, error: outgoingBeforeError } = await supabase
    .from("players")
    .select("id, name, is_u21_slot, is_u21_keeper")
    .eq("id", call.player_out_id)
    .eq("owner_team_id", winningTeamId)
    .maybeSingle();

  if (outgoingBeforeError) {
    throw outgoingBeforeError;
  }

  if (!outgoingBefore) {
    throw new Error("Il giocatore da svincolare non appartiene più alla squadra vincitrice.");
  }

  const transferU21Slot =
    outgoingBefore.is_u21_slot === true &&
    outgoingBefore.is_u21_keeper !== true;

  // 1. assegna il giocatore preso alla squadra vincitrice
  const { data: incomingPlayer, error: incomingError } = await supabase
    .from("players")
    .update({
      owner_team_id: winningTeamId,
      unavailable_until_week: null,
      unavailable_until_phase: null,
      unavailable_reason: null,
      ...(transferU21Slot ? { is_u21_slot: true } : {}),
      updated_at: nowIso
    })
    .eq("id", call.player_in_id)
    .is("owner_team_id", null)
    .select("id, name, is_u21_slot")
    .maybeSingle();

  if (incomingError) {
    throw incomingError;
  }

  if (!incomingPlayer) {
    throw new Error("Il giocatore richiesto non è più disponibile.");
  }

  // 2. svincola il giocatore in uscita e lo blocca fino al waiver successivo.
  // Se era lo slot U21 normale, togliamo il flag perché è passato al nuovo giocatore.
  const { data: outgoingPlayer, error: outgoingError } = await supabase
    .from("players")
    .update({
      owner_team_id: null,
      unavailable_until_week: Number(currentSettings.active_week),
      unavailable_until_phase: currentSettings.active_phase,
      unavailable_reason: "waiver_cut",
      ...(transferU21Slot ? { is_u21_slot: false } : {}),
      updated_at: nowIso
    })
    .eq("id", call.player_out_id)
    .eq("owner_team_id", winningTeamId)
    .select("id, name, is_u21_slot")
    .maybeSingle();

  if (outgoingError || !outgoingPlayer) {
    await supabase
      .from("players")
      .update({
        owner_team_id: null,
        ...(transferU21Slot ? { is_u21_slot: false } : {}),
        updated_at: new Date().toISOString()
      })
      .eq("id", call.player_in_id)
      .eq("owner_team_id", winningTeamId);

    if (outgoingError) throw outgoingError;
    throw new Error("Impossibile completare lo svincolo del giocatore in uscita.");
  }
}

/* ===============================
   CALCOLO RISULTATI
================================ */

async function hasSubmittedHighCompensatoryCalls() {
  if (!currentSettings) return false;

  const { count, error } = await supabase
    .from("waiver_compensatory_calls")
    .select("id", { count: "exact", head: true })
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("priority_tier", "high")
    .eq("status", "submitted");

  if (error) throw error;
  return Number(count || 0) > 0;
}

async function hasPendingRegularWaiverCalls() {
  if (!currentSettings) return false;

  const { count, error } = await supabase
    .from("waiver_calls")
    .select("id", { count: "exact", head: true })
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("status", "pending");

  if (error) throw error;
  return Number(count || 0) > 0;
}

async function hasCalculatedRegularWaiverCalls() {
  if (!currentSettings) return false;

  const { count, error } = await supabase
    .from("waiver_calls")
    .select("id", { count: "exact", head: true })
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .in("status", ["won", "lost"]);

  if (error) throw error;
  return Number(count || 0) > 0;
}

async function isPlayerCurrentlyAvailable(playerId) {
  if (!playerId) return false;

  const { data, error } = await supabase
    .from("players")
    .select("id, owner_team_id")
    .eq("id", playerId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data) && !data.owner_team_id;
}

async function calculateResultsForSlot(slot) {
  if (!currentSettings) return;

  try {
    if (await hasSubmittedHighCompensatoryCalls()) {
      alert("Calcola prima le compensative prioritarie: vengono prima di tutte le chiamate waiver.");
      return;
    }
  } catch (error) {
    console.error("Errore controllo compensative prioritarie:", error);
    alert("Impossibile verificare le compensative prioritarie.");
    return;
  }

  const normalizedSlot = normalizeSlot(slot);
   console.log("=== CALCOLO SLOT START ===", {
  slot,
  normalizedSlot,
  activeWeek: currentSettings?.active_week,
  activePhase: currentSettings?.active_phase
});

  const { data: calls, error: callsError } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("slot", normalizedSlot)
    .eq("status", "pending");
   console.log("Chiamate trovate per slot:", calls);

  if (callsError) {
    console.error("Errore caricamento chiamate:", callsError);
    alert("Errore caricamento chiamate.");
    return;
  }

  if (!calls || calls.length === 0) {
    alert(`Nessuna chiamata da calcolare per lo slot ${normalizedSlot}.`);
    return;
  }

  const orderIds = calls
    .map(call => call.waiver_order_id)
    .filter(Boolean);

  const { data: orders, error: ordersError } = await supabase
    .from("waiver_order")
    .select("*")
    .in("id", orderIds);

  if (ordersError) {
    console.error("Errore caricamento ordine waiver:", ordersError);
    alert("Errore caricamento ordine waiver.");
    return;
  }

  const orderMap = {};

  orders?.forEach(order => {
    orderMap[order.id] = order;
  });
   console.log("Ordini collegati alle chiamate:", orders);

  const callsByPlayer = {};

  calls.forEach(call => {
    const order = orderMap[call.waiver_order_id];

    if (!order) return;

const playerKey = call.player_in_id
  ? String(call.player_in_id)
  : isConferencePhase()
    ? `${normalizePlayerName(call.player_in)}__${order.conference}`
    : normalizePlayerName(call.player_in);

    if (!callsByPlayer[playerKey]) {
      callsByPlayer[playerKey] = [];
    }

    callsByPlayer[playerKey].push({
      call,
      order
    });
  });

const loserEntriesForRecall = [];   
  for (const playerKey in callsByPlayer) {
    const entries = callsByPlayer[playerKey];

    entries.sort((a, b) => {
      return a.order.priority_number - b.order.priority_number;
    });

    const winner = entries[0];
    const losers = entries.slice(1);

     console.log("Gruppo chiamate stesso giocatore:", {
  playerKey,
  winner,
  losers
});

    try {
  const playerIsAvailable = await isPlayerCurrentlyAvailable(winner.call.player_in_id);

  if (!playerIsAvailable) {
    for (const unavailableEntry of entries) {
      await supabase
        .from("waiver_calls")
        .update({ status: "lost" })
        .eq("id", unavailableEntry.call.id);

      loserEntriesForRecall.push(unavailableEntry);
    }

    continue;
  }

  await applyWinningWaiverCall(winner.call);

  await supabase
    .from("waiver_calls")
    .update({ status: "won" })
    .eq("id", winner.call.id);

for (const loser of losers) {
  await supabase
    .from("waiver_calls")
    .update({ status: "lost" })
    .eq("id", loser.call.id);

  loserEntriesForRecall.push(loser);
}
} catch (err) {
  console.error("Errore aggiornamento rosa waiver:", err);
  alert(`Errore aggiornamento rosa: ${err.message || err}`);
  return;
}
  }
   
const activatedFromLiveCalc = await activateRecallSlotForLosers(
  normalizedSlot,
  loserEntriesForRecall
);

const activatedFromLostCalls = await syncRecallSlotsFromLostCalls(normalizedSlot);

const totalActivated = Math.max(activatedFromLiveCalc, activatedFromLostCalls);

if (totalActivated > 0) {
  setAdminMessage(
    `Risultati slot ${normalizedSlot} calcolati. Richiami automatici attivati: ${totalActivated}.`
  );
} else {
  setAdminMessage(
    `Risultati slot ${normalizedSlot} calcolati. Nessun richiamo automatico attivato.`,
    true
  );
}

alert(`Risultati slot ${normalizedSlot} calcolati.`);

await loadWaiverOrder();
await loadMyOwnedPlayers();
await loadFreeAgents();
await loadAllCalls();
await loadMyWaiverCalls();

if (currentUserIsAdmin) {
  renderWaiverOrderAdmin();
}

await renderPublicWaiverOrder();
}

async function applyWinningCompensatoryCall(call) {
  const winningTeamId = call.team_id;

  if (!winningTeamId) {
    throw new Error("Squadra vincitrice non trovata.");
  }

  if (!call.player_in_id) {
    throw new Error("Compensativa senza player_in_id.");
  }

  const nowIso = new Date().toISOString();
  const requiresPlayerOut = call.requires_player_out === true;

  // Per le sostituzioni controlliamo PRIMA che il giocatore in uscita
  // appartenga ancora alla squadra. Può essere anche inattivo/fuori Serie A.
  if (requiresPlayerOut) {
    if (!call.player_out_id) {
      throw new Error("Compensativa di sostituzione senza giocatore in uscita.");
    }

    const { data: outgoingCheck, error: outgoingCheckError } = await supabase
      .from("players")
      .select("id, name, owner_team_id")
      .eq("id", call.player_out_id)
      .eq("owner_team_id", winningTeamId)
      .maybeSingle();

    if (outgoingCheckError) {
      throw outgoingCheckError;
    }

    if (!outgoingCheck) {
      throw new Error("Il giocatore da sostituire non appartiene più alla squadra.");
    }
  }

  const { data: incomingPlayer, error: incomingError } = await supabase
    .from("players")
    .update({
      owner_team_id: winningTeamId,
      unavailable_until_week: null,
      unavailable_until_phase: null,
      unavailable_reason: null,
      updated_at: nowIso
    })
    .eq("id", call.player_in_id)
    .is("owner_team_id", null)
    .select("id, name")
    .maybeSingle();

  if (incomingError) {
    throw incomingError;
  }

  if (!incomingPlayer) {
    throw new Error("Il giocatore richiesto non è più disponibile.");
  }

  if (!requiresPlayerOut) return;

  const { data: outgoingPlayer, error: outgoingError } = await supabase
    .from("players")
    .update({
      owner_team_id: null,
      unavailable_until_week: Number(currentSettings.active_week),
      unavailable_until_phase: currentSettings.active_phase,
      unavailable_reason: "waiver_cut",
      updated_at: nowIso
    })
    .eq("id", call.player_out_id)
    .eq("owner_team_id", winningTeamId)
    .select("id, name")
    .maybeSingle();

  if (outgoingError || !outgoingPlayer) {
    // Rollback prudenziale: se l'uscita fallisce, restituiamo il nuovo giocatore
    // agli svincolati per non lasciare la rosa con un uomo in più.
    await supabase
      .from("players")
      .update({
        owner_team_id: null,
        updated_at: new Date().toISOString()
      })
      .eq("id", call.player_in_id)
      .eq("owner_team_id", winningTeamId);

    if (outgoingError) throw outgoingError;
    throw new Error("Impossibile completare la sostituzione del giocatore in uscita.");
  }
}

async function calculateCompensatoryResults(priorityTier = "normal") {
  if (!currentSettings) return;

  const tier = normalizeCompensatoryTier(priorityTier);
  const tierLabel = getCompensatoryTierLabel(tier).toLowerCase();

  try {
    if (tier === "high" && await hasCalculatedRegularWaiverCalls()) {
      alert("Il waiver è già stato calcolato: le compensative prioritarie devono essere risolte prima.");
      return;
    }

    if (tier === "normal" && await hasSubmittedHighCompensatoryCalls()) {
      alert("Calcola prima le compensative prioritarie.");
      return;
    }

    if (tier === "normal" && await hasPendingRegularWaiverCalls()) {
      alert("Calcola prima tutte le chiamate waiver: le compensative normali vengono per ultime.");
      return;
    }
  } catch (guardError) {
    console.error("Errore controllo ordine di calcolo:", guardError);
    alert("Impossibile verificare l'ordine di calcolo.");
    return;
  }

  const { data: calls, error } = await supabase
    .from("waiver_compensatory_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("priority_tier", tier)
    .eq("status", "submitted")
    .order("priority_order", { ascending: true });

  if (error) {
    console.error("Errore caricamento compensative:", error);
    alert("Errore caricamento compensative.");
    return;
  }

  if (!calls || calls.length === 0) {
    alert(`Nessuna ${tierLabel} da calcolare.`);
    return;
  }

const callsByPlayer = {};

calls.forEach(call => {
  const playerIdKey = call.player_in_id
    ? String(call.player_in_id)
    : normalizePlayerName(call.player_in);

  const compensatoryGroup = getCompensatoryGroupForTeamId(call.team_id);

  const playerKey = isConferencePhase()
    ? `${compensatoryGroup}__${playerIdKey}`
    : playerIdKey;

  if (!callsByPlayer[playerKey]) {
    callsByPlayer[playerKey] = [];
  }

  callsByPlayer[playerKey].push(call);
});

  for (const playerKey in callsByPlayer) {
    const entries = callsByPlayer[playerKey];

    entries.sort((a, b) => {
      return (a.priority_order || 999) - (b.priority_order || 999);
    });

    const winner = entries[0];
    const losers = entries.slice(1);

    try {
      const playerIsAvailable = await isPlayerCurrentlyAvailable(winner.player_in_id);

      if (!playerIsAvailable) {
        for (const unavailableCall of entries) {
          await supabase
            .from("waiver_compensatory_calls")
            .update({ status: "lost" })
            .eq("id", unavailableCall.id);
        }

        continue;
      }

      await applyWinningCompensatoryCall(winner);

      await supabase
        .from("waiver_compensatory_calls")
        .update({ status: "won" })
        .eq("id", winner.id);

      for (const loser of losers) {
        await supabase
          .from("waiver_compensatory_calls")
          .update({ status: "lost" })
          .eq("id", loser.id);
      }
    } catch (err) {
      console.error("Errore aggiornamento rosa compensativa:", err);
      alert(`Errore aggiornamento rosa compensativa: ${err.message || err}`);
      return;
    }
  }

  alert(
    tier === "high"
      ? "Compensative prioritarie calcolate."
      : "Compensative normali calcolate."
  );

  await loadInjuryReserveMonitor();
  await loadMyOwnedPlayers();
  await loadMyReplacementCandidates();
  await loadFreeAgents();
  await loadMyCompensatoryCalls();

  if (currentUserIsAdmin) {
    await loadAllCompensatoryCalls();
  }

  await renderPublicWaiverOrder();
}

function setPhaseMessage(text, isError = false) {
  if (!phaseMessageEl) return;

  phaseMessageEl.textContent = text || "";
  phaseMessageEl.style.color = isError ? "#dc2626" : "#334155";
}

function syncPhaseSelect() {
  if (!activePhaseSelect || !currentSettings) return;

  activePhaseSelect.value = currentSettings.active_phase || "conference";
}

async function saveActivePhase() {
  if (!currentSettings || !activePhaseSelect) return;

  const newPhase = activePhaseSelect.value;

  setPhaseMessage("Salvataggio fase in corso...");

  const { error } = await supabase
    .from("waiver_settings")
    .update({
      active_phase: newPhase,
      updated_at: new Date().toISOString()
    })
    .eq("id", currentSettings.id);

  if (error) {
    console.error("Errore salvataggio fase:", error);
    setPhaseMessage("Errore salvataggio fase: " + error.message, true);
    return;
  }

  currentSettings.active_phase = newPhase;
  activePhaseEl.textContent = newPhase;

  activeWaiverOrderId = null;
  waiverOrderRows = [];
  myOrderRows = [];
  mySavedCalls = [];

  await loadWaiverOrder();

  if (currentUserIsAdmin) {
    renderWaiverOrderAdmin();
    await loadAllCalls();
  }

  await loadMyWaiverCalls();

  setPhaseMessage(
    `Fase aggiornata a ${newPhase}. Se l'ordine è vuoto, premi Genera ordine waiver.`
  );
}

function setSettingsMessage(text, isError = false) {
  if (!settingsMessageEl) return;

  settingsMessageEl.textContent = text || "";
  settingsMessageEl.style.color = isError ? "#dc2626" : "#334155";
}

function toDateTimeLocalValue(dateValue) {
  if (!dateValue) return "";

  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) return "";

  const pad = number => String(number).padStart(2, "0");

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());

  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function fromDateTimeLocalValue(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date.toISOString();
}

function syncSettingsPanel() {
  if (!currentSettings) return;

  if (activePhaseSelect) {
    activePhaseSelect.value = currentSettings.active_phase || "conference";
  }

  if (activeWeekInput) {
    activeWeekInput.value = currentSettings.active_week || "";
  }

  if (highCompensatoryOpenInput) {
    highCompensatoryOpenInput.value = toDateTimeLocalValue(
      currentSettings.high_compensatory_open_at || currentSettings.slot1_open_at
    );
  }

  if (highCompensatoryCloseInput) {
    highCompensatoryCloseInput.value = toDateTimeLocalValue(
      currentSettings.high_compensatory_close_at || currentSettings.slot1_close_at
    );
  }

  if (slot1OpenInput) {
    slot1OpenInput.value = toDateTimeLocalValue(currentSettings.slot1_open_at);
  }

  if (slot1CloseInput) {
    slot1CloseInput.value = toDateTimeLocalValue(currentSettings.slot1_close_at);
  }

  if (slot1SOpenInput) {
    slot1SOpenInput.value = toDateTimeLocalValue(currentSettings.slot1s_open_at);
  }

  if (slot1SCloseInput) {
    slot1SCloseInput.value = toDateTimeLocalValue(currentSettings.slot1s_close_at);
  }

  if (slot2OpenInput) {
    slot2OpenInput.value = toDateTimeLocalValue(currentSettings.slot2_open_at);
  }

  if (slot2CloseInput) {
    slot2CloseInput.value = toDateTimeLocalValue(currentSettings.slot2_close_at);
  }

  if (slot2SOpenInput) {
    slot2SOpenInput.value = toDateTimeLocalValue(currentSettings.slot2s_open_at);
  }

  if (slot2SCloseInput) {
    slot2SCloseInput.value = toDateTimeLocalValue(currentSettings.slot2s_close_at);
  }

   if (compensatoryOpenInput) {
  compensatoryOpenInput.value = toDateTimeLocalValue(currentSettings.compensatory_open_at);
}

if (compensatoryCloseInput) {
  compensatoryCloseInput.value = toDateTimeLocalValue(currentSettings.compensatory_close_at);
}
}

function getNextFriday() {
  const now = new Date();
  const result = new Date(now);

  const day = result.getDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;

  result.setDate(result.getDate() + daysUntilFriday);
  result.setHours(15, 0, 0, 0);

  return result;
}

function setInputDateTime(input, date) {
  if (!input || !date) return;

  input.value = toDateTimeLocalValue(date.toISOString());
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

function fillStandardFridaySettings() {
  const friday = getNextFriday();

  // Slot 1: da martedì 00:00 a venerdì 15:00
  const slot1Open = new Date(friday);
  slot1Open.setDate(friday.getDate() - 3);
  slot1Open.setHours(0, 0, 0, 0);

  const slot1Close = new Date(friday);
  slot1Close.setHours(15, 0, 0, 0);

  // Slot 2: da venerdì 15:01 a venerdì 16:00
  const slot2Open = new Date(friday);
  slot2Open.setHours(15, 1, 0, 0);

  const slot2Close = new Date(friday);
  slot2Close.setHours(16, 0, 0, 0);

  if (activePhaseSelect) activePhaseSelect.value = "round_robin";

  setInputDateTime(highCompensatoryOpenInput, slot1Open);
  setInputDateTime(highCompensatoryCloseInput, slot1Close);

  setInputDateTime(slot1OpenInput, slot1Open);
  setInputDateTime(slot1CloseInput, slot1Close);

  setInputDateTime(slot2OpenInput, slot2Open);
  setInputDateTime(slot2CloseInput, slot2Close);

  if (slot1SOpenInput) slot1SOpenInput.value = "";
  if (slot1SCloseInput) slot1SCloseInput.value = "";
  if (slot2SOpenInput) slot2SOpenInput.value = "";
  if (slot2SCloseInput) slot2SCloseInput.value = "";

  setSettingsMessage(
    "Venerdì standard impostato: prioritarie e Slot 1 da martedì 00:00 a venerdì 15:00; Slot 2 da venerdì 15:01 a venerdì 16:00. Ricordati di salvare."
  );
}

function fillPlayoffFridaySettings() {
  const friday = getNextFriday();

  // Slot 1: da martedì 00:00 a venerdì 15:00
  const slot1Open = new Date(friday);
  slot1Open.setDate(friday.getDate() - 3);
  slot1Open.setHours(0, 0, 0, 0);

  const slot1Close = new Date(friday);
  slot1Close.setHours(15, 0, 0, 0);

  // Slot 1S: venerdì 15:01 - 15:30
  const slot1SOpen = new Date(friday);
  slot1SOpen.setHours(15, 1, 0, 0);

  const slot1SClose = new Date(friday);
  slot1SClose.setHours(15, 30, 0, 0);

  // Slot 2: venerdì 15:31 - 16:00
  const slot2Open = new Date(friday);
  slot2Open.setHours(15, 31, 0, 0);

  const slot2Close = new Date(friday);
  slot2Close.setHours(16, 0, 0, 0);

  // Slot 2S: venerdì 16:01 - 16:30
  const slot2SOpen = new Date(friday);
  slot2SOpen.setHours(16, 1, 0, 0);

  const slot2SClose = new Date(friday);
  slot2SClose.setHours(16, 30, 0, 0);

  if (activePhaseSelect) activePhaseSelect.value = "playoff";

  setInputDateTime(highCompensatoryOpenInput, slot1Open);
  setInputDateTime(highCompensatoryCloseInput, slot1Close);

  setInputDateTime(slot1OpenInput, slot1Open);
  setInputDateTime(slot1CloseInput, slot1Close);

  setInputDateTime(slot1SOpenInput, slot1SOpen);
  setInputDateTime(slot1SCloseInput, slot1SClose);

  setInputDateTime(slot2OpenInput, slot2Open);
  setInputDateTime(slot2CloseInput, slot2Close);

  setInputDateTime(slot2SOpenInput, slot2SOpen);
  setInputDateTime(slot2SCloseInput, slot2SClose);

  setSettingsMessage(
    "Venerdì playoff impostato: prioritarie e Slot 1 da martedì 00:00 a venerdì 15:00; Slot 1S 15:01-15:30; Slot 2 15:31-16:00; Slot 2S 16:01-16:30. Ricordati di salvare."
  );
}

async function saveWaiverSettings() {
  if (!currentSettings) return;

  const activeWeek = Number(activeWeekInput?.value || currentSettings.active_week);

  if (!activeWeek || activeWeek < 1) {
    setSettingsMessage("Inserisci una settimana valida.", true);
    return;
  }

  const highCompensatoryOpenAt = fromDateTimeLocalValue(
    highCompensatoryOpenInput?.value
  );
  const highCompensatoryCloseAt = fromDateTimeLocalValue(
    highCompensatoryCloseInput?.value
  );
  const slot1CloseAt = fromDateTimeLocalValue(slot1CloseInput?.value);

  if (Boolean(highCompensatoryOpenAt) !== Boolean(highCompensatoryCloseAt)) {
    setSettingsMessage(
      "Per le compensative prioritarie inserisci sia apertura sia chiusura.",
      true
    );
    return;
  }

  if (
    highCompensatoryOpenAt &&
    new Date(highCompensatoryOpenAt) >= new Date(highCompensatoryCloseAt)
  ) {
    setSettingsMessage(
      "La chiusura delle compensative prioritarie deve essere successiva all'apertura.",
      true
    );
    return;
  }

  if (
    highCompensatoryCloseAt &&
    slot1CloseAt &&
    new Date(highCompensatoryCloseAt) > new Date(slot1CloseAt)
  ) {
    setSettingsMessage(
      "Le compensative prioritarie devono chiudere prima dello Slot 1 o nello stesso momento.",
      true
    );
    return;
  }

  const payload = {
    active_phase: activePhaseSelect?.value || currentSettings.active_phase,
    active_week: activeWeek,

    high_compensatory_open_at: highCompensatoryOpenAt,
    high_compensatory_close_at: highCompensatoryCloseAt,

    slot1_open_at: fromDateTimeLocalValue(slot1OpenInput?.value),
    slot1_close_at: fromDateTimeLocalValue(slot1CloseInput?.value),

    slot1s_open_at: fromDateTimeLocalValue(slot1SOpenInput?.value),
    slot1s_close_at: fromDateTimeLocalValue(slot1SCloseInput?.value),

    slot2_open_at: fromDateTimeLocalValue(slot2OpenInput?.value),
    slot2_close_at: fromDateTimeLocalValue(slot2CloseInput?.value),

    slot2s_open_at: fromDateTimeLocalValue(slot2SOpenInput?.value),
    slot2s_close_at: fromDateTimeLocalValue(slot2SCloseInput?.value),

   compensatory_open_at: fromDateTimeLocalValue(compensatoryOpenInput?.value),
compensatory_close_at: fromDateTimeLocalValue(compensatoryCloseInput?.value)
  };

  setSettingsMessage("Salvataggio impostazioni in corso...");

  const { data, error } = await supabase
    .from("waiver_settings")
    .update(payload)
    .eq("id", currentSettings.id)
    .select()
    .single();

  if (error) {
    console.error("Errore salvataggio impostazioni waiver:", error);
    setSettingsMessage("Errore salvataggio impostazioni: " + error.message, true);
    return;
  }

  currentSettings = data;

  if (currentUserIsAdmin) {
    const { error: irSyncError } = await supabase.rpc('admin_sync_ir_compensatory_calls');
    if (irSyncError) {
      console.error('Errore sincronizzazione compensative IR:', irSyncError);
    }
  }

if (activePhaseEl) activePhaseEl.textContent = currentSettings.active_phase || "Non impostata";
if (activeWeekEl) activeWeekEl.textContent = currentSettings.active_week || "-";

  activeWaiverOrderId = null;
  waiverOrderRows = [];
  myOrderRows = [];
  mySavedCalls = [];

  await loadWaiverOrder();

  if (currentUserIsAdmin) {
    renderWaiverOrderAdmin();
    await loadAllCalls();
  }

await loadInjuryReserveMonitor();
await loadMyOwnedPlayers();
await loadMyReplacementCandidates();
await loadMyWaiverCalls();
await loadFreeAgents();
await loadMyCompensatoryCalls();

if (currentUserIsAdmin) {
  await loadAllCompensatoryCalls();
}

syncSettingsPanel();

setSettingsMessage("Impostazioni waiver salvate correttamente.");
}

async function addManualCompensatoryCall() {
  if (!currentSettings) return;

  const teamId = adminCompTeamSelect?.value || "";
  const priorityTier = normalizeCompensatoryTier(adminCompTierSelect?.value || "normal");
  const priority = Number(adminCompPriorityInput?.value || 0);
  const mode = adminCompModeSelect?.value || "extra";
  const reasonType = adminCompReasonSelect?.value || "trade";
  const reasonNote = adminCompReasonNoteInput?.value?.trim() || null;

  if (!teamId) {
    setAdminMessage("Seleziona una squadra per la compensativa.", true);
    return;
  }

  if (!priority || priority < 1) {
    setAdminMessage("Inserisci una priorità valida per la compensativa.", true);
    return;
  }

  const { error } = await supabase
    .from("waiver_compensatory_calls")
    .insert({
      team_id: teamId,
      week: currentSettings.active_week,
      phase: currentSettings.active_phase,
      priority_tier: priorityTier,
      priority_order: priority,
      requires_player_out: mode === "replace",
      reason_type: reasonType,
      reason_note: reasonNote,
      status: "pending",
      player_in: null,
      player_in_id: null,
      player_out: null,
      player_out_id: null,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error("Errore aggiunta compensativa:", error);
    setAdminMessage("Errore aggiunta compensativa: " + error.message, true);
    return;
  }

  setAdminMessage("Compensativa aggiunta correttamente.");

  if (adminCompPriorityInput) adminCompPriorityInput.value = "";
  if (adminCompReasonNoteInput) adminCompReasonNoteInput.value = "";

  await loadMyReplacementCandidates();
  await loadMyCompensatoryCalls();
  await loadAllCompensatoryCalls();
  await renderPublicWaiverOrder();
}

async function deleteAdminCompensatoryCall(callId) {
  const confirmed = confirm("Vuoi eliminare questa chiamata compensativa?");
  if (!confirmed) return;

  console.log("Elimino compensativa:", callId);

  const { data, error } = await supabase
    .from("waiver_compensatory_calls")
    .delete()
    .eq("id", callId)
    .select("id");

  if (error) {
    console.error("Errore eliminazione compensativa:", error);
    setAdminMessage("Errore eliminazione compensativa: " + error.message, true);
    return;
  }

  if (!data || data.length === 0) {
    console.warn("Nessuna compensativa eliminata. Probabile policy RLS DELETE mancante.", {
      callId
    });

    setAdminMessage(
      "Nessuna compensativa eliminata. Probabile policy DELETE mancante su Supabase.",
      true
    );
    return;
  }

  setAdminMessage("Compensativa eliminata.");

  await loadMyCompensatoryCalls();
  await loadAllCompensatoryCalls();
  await renderPublicWaiverOrder();
}


/* ===============================
   ADMIN - IMPORT LISTONE FANTACALCIO
================================ */

function escapeListoneHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setFantacalcioListoneMessage(message, type = "neutral") {
  if (!fantacalcioListoneMessage) return;

  fantacalcioListoneMessage.textContent = message;
  fantacalcioListoneMessage.classList.remove(
    "is-loading",
    "is-success",
    "is-error"
  );

  if (type === "loading") {
    fantacalcioListoneMessage.classList.add("is-loading");
  } else if (type === "success") {
    fantacalcioListoneMessage.classList.add("is-success");
  } else if (type === "error") {
    fantacalcioListoneMessage.classList.add("is-error");
  }
}

function resetFantacalcioPreview() {
  pendingFantacalcioRows = [];
  pendingFantacalcioFileName = "";

  if (fantacalcioListonePreview) {
    fantacalcioListonePreview.innerHTML = "";
    fantacalcioListonePreview.style.display = "none";
  }

  if (applyFantacalcioListoneBtn) {
    applyFantacalcioListoneBtn.style.display = "none";
    applyFantacalcioListoneBtn.disabled = false;
  }
}

function normalizeFantacalcioHeader(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function numberFromFantacalcioCell(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = String(value ?? "")
    .trim()
    .replace(/\./g, "")
    .replace(",", ".");

  if (!normalized) return null;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

async function parseFantacalcioListoneFile(file) {
  if (!window.XLSX) {
    throw new Error("Lettore Excel non disponibile. Ricarica la pagina e riprova.");
  }

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: "array" });

  if (!workbook.SheetNames?.length) {
    throw new Error("Il file non contiene fogli leggibili.");
  }

  const tuttiSheetName =
    workbook.SheetNames.find(
      name => String(name).trim().toLowerCase() === "tutti"
    ) || workbook.SheetNames[0];

  const sheet = workbook.Sheets[tuttiSheetName];
  const matrix = window.XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true
  });

  const requiredHeaders = ["ID", "R", "RM", "NOME", "SQUADRA", "QT.A"];

  const headerRowIndex = matrix.findIndex(row => {
    const normalized = (row || []).map(normalizeFantacalcioHeader);
    return requiredHeaders.every(header => normalized.includes(header));
  });

  if (headerRowIndex === -1) {
    throw new Error(
      'Non trovo le colonne Id, R, RM, Nome, Squadra e Qt.A. Usa il listone Fantacalcio originale.'
    );
  }

  const headerRow = matrix[headerRowIndex].map(normalizeFantacalcioHeader);
  const indexByHeader = Object.fromEntries(
    headerRow.map((header, index) => [header, index])
  );

  const rows = matrix
    .slice(headerRowIndex + 1)
    .map(row => {
      const externalId = numberFromFantacalcioCell(row[indexByHeader["ID"]]);
      const quotation = numberFromFantacalcioCell(row[indexByHeader["QT.A"]]);

      return {
        external_id:
          externalId === null ? null : String(Math.trunc(externalId)),
        role: String(row[indexByHeader["R"]] ?? "").trim(),
        role_mantra: String(row[indexByHeader["RM"]] ?? "").trim(),
        name: String(row[indexByHeader["NOME"]] ?? "").trim(),
        serie_a_team: String(row[indexByHeader["SQUADRA"]] ?? "").trim(),
        quotation
      };
    })
    .filter(row => row.external_id !== null && row.name);

  if (rows.length < 100) {
    throw new Error(
      `Ho letto solo ${rows.length} giocatori. Il file sembra incompleto o non è il listone corretto.`
    );
  }

  const duplicatedIds = [];
  const seenIds = new Set();

  rows.forEach(row => {
    const key = String(row.external_id);

    if (seenIds.has(key)) {
      duplicatedIds.push(key);
    }

    seenIds.add(key);
  });

  if (duplicatedIds.length) {
    throw new Error(
      `Nel foglio ${tuttiSheetName} ci sono Id duplicati (${[
        ...new Set(duplicatedIds)
      ].slice(0, 5).join(", ")}). Import annullato.`
    );
  }

  const invalidQuotation = rows.find(row => row.quotation === null);

  if (invalidQuotation) {
    throw new Error(
      `Quotazione non valida per ${invalidQuotation.name}. Import annullato.`
    );
  }

  return {
    sheetName: tuttiSheetName,
    rows
  };
}

function renderFantacalcioPlayersList(title, players, emptyText) {
  const safePlayers = Array.isArray(players) ? players : [];

  return `
    <details class="admin-listone-details" ${safePlayers.length ? "" : "disabled"}>
      <summary>
        ${escapeListoneHtml(title)}
        <strong>${safePlayers.length}</strong>
      </summary>
      ${
        safePlayers.length
          ? `
            <div class="admin-listone-detail-list">
              ${safePlayers
                .map(
                  player => `
                    <div class="admin-listone-detail-row">
                      <strong>${escapeListoneHtml(player.name || "-")}</strong>
                      <span>${escapeListoneHtml(player.serie_a_team || "-")}</span>
                      ${
                        player.quotation !== undefined
                          ? `<b>Q ${escapeListoneHtml(player.quotation)}</b>`
                          : ""
                      }
                    </div>
                  `
                )
                .join("")}
            </div>
          `
          : `<p class="admin-listone-empty">${escapeListoneHtml(emptyText)}</p>`
      }
    </details>
  `;
}

function renderFantacalcioQuotationChanges(changes) {
  const safeChanges = Array.isArray(changes) ? changes : [];

  return `
    <details class="admin-listone-details" ${safeChanges.length ? "" : "disabled"}>
      <summary>
        Quotazioni cambiate
        <strong>${safeChanges.length}</strong>
      </summary>
      ${
        safeChanges.length
          ? `
            <div class="admin-listone-detail-list">
              ${safeChanges
                .map(
                  player => `
                    <div class="admin-listone-detail-row">
                      <strong>${escapeListoneHtml(player.name || "-")}</strong>
                      <span>${escapeListoneHtml(player.serie_a_team || "-")}</span>
                      <b>${escapeListoneHtml(player.old_quotation)} → ${escapeListoneHtml(player.new_quotation)}</b>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
          : `<p class="admin-listone-empty">Nessuna quotazione modificata.</p>`
      }
    </details>
  `;
}

function renderFantacalcioPreview(preview, fileName, sheetName) {
  if (!fantacalcioListonePreview) return;

  const total = Number(preview?.file_players || 0);
  const newPlayers = Number(preview?.new_players_count || 0);
  const removedPlayers = Number(preview?.removed_players_count || 0);
  const changedPlayers = Number(preview?.changed_players_count || 0);
  const quotationChanges = Number(preview?.quotation_changes_count || 0);
  const reactivatedPlayers = Number(preview?.reactivated_players_count || 0);
  const unchangedPlayers = Number(preview?.unchanged_players_count || 0);

  fantacalcioListonePreview.innerHTML = `
    <div class="admin-listone-file-summary">
      <strong>${escapeListoneHtml(fileName)}</strong>
      <span>Foglio: ${escapeListoneHtml(sheetName)}</span>
    </div>

    <div class="admin-listone-stats">
      <div><span>Nel file</span><strong>${total}</strong></div>
      <div><span>Quotazioni</span><strong>${quotationChanges}</strong></div>
      <div><span>Nuovi</span><strong>${newPlayers}</strong></div>
      <div><span>Da disattivare</span><strong>${removedPlayers}</strong></div>
      <div><span>Altri cambi</span><strong>${changedPlayers}</strong></div>
      <div><span>Riattivati</span><strong>${reactivatedPlayers}</strong></div>
      <div><span>Invariati</span><strong>${unchangedPlayers}</strong></div>
    </div>

    <div class="admin-listone-warning">
      Verranno aggiornati solo dati Fantacalcio: nome, ruolo, ruolo Mantra,
      squadra, quotazione e stato attivo/inattivo. Rose, U21, slot U21,
      keeper e blocchi waiver/trade non vengono toccati.
    </div>

    <div class="admin-listone-details-grid">
      ${renderFantacalcioPlayersList(
        "Nuovi giocatori",
        preview?.new_players,
        "Nessun nuovo giocatore."
      )}

      ${renderFantacalcioPlayersList(
        "Non più nel listone",
        preview?.removed_players,
        "Nessun giocatore da disattivare."
      )}

      ${renderFantacalcioQuotationChanges(preview?.quotation_changes)}
    </div>
  `;

  fantacalcioListonePreview.style.display = "block";

  if (applyFantacalcioListoneBtn) {
    applyFantacalcioListoneBtn.style.display = "";
    applyFantacalcioListoneBtn.disabled = false;
  }
}

async function previewFantacalcioListoneFile(file) {
  if (!currentUserIsAdmin || isAdminViewingAsTeam()) {
    throw new Error("Questa funzione è disponibile solo all'admin reale.");
  }

  resetFantacalcioPreview();
  setFantacalcioListoneMessage("Sto leggendo e confrontando il listone...", "loading");

  const parsed = await parseFantacalcioListoneFile(file);

  const { data, error } = await supabase.rpc(
    "preview_fantacalcio_listone",
    {
      p_rows: parsed.rows
    }
  );

  if (error) {
    throw error;
  }

  pendingFantacalcioRows = parsed.rows;
  pendingFantacalcioFileName = file.name;

  renderFantacalcioPreview(data || {}, file.name, parsed.sheetName);

  setFantacalcioListoneMessage(
    "Anteprima pronta. Controlla i numeri e poi conferma l'aggiornamento.",
    "success"
  );
}

async function applyFantacalcioListone() {
  if (!currentUserIsAdmin || isAdminViewingAsTeam()) {
    setFantacalcioListoneMessage(
      "Questa funzione è disponibile solo all'admin reale.",
      "error"
    );
    return;
  }

  if (!pendingFantacalcioRows.length) {
    setFantacalcioListoneMessage(
      "Seleziona prima un listone e attendi l'anteprima.",
      "error"
    );
    return;
  }

  const confirmed = window.confirm(
    `Confermi l'aggiornamento con "${pendingFantacalcioFileName}"?\n\n` +
    "Rose, U21, slot U21, keeper e blocchi waiver/trade NON verranno modificati."
  );

  if (!confirmed) return;

  if (applyFantacalcioListoneBtn) {
    applyFantacalcioListoneBtn.disabled = true;
    applyFantacalcioListoneBtn.textContent = "Aggiornamento...";
  }

  if (fantacalcioFileInput) {
    fantacalcioFileInput.disabled = true;
  }

  setFantacalcioListoneMessage(
    "Aggiornamento Supabase in corso. Non chiudere questa pagina...",
    "loading"
  );

  try {
    const { data, error } = await supabase.rpc(
      "apply_fantacalcio_listone",
      {
        p_rows: pendingFantacalcioRows,
        p_file_name: pendingFantacalcioFileName || null
      }
    );

    if (error) {
      throw error;
    }

    const result = data || {};

    setFantacalcioListoneMessage(
      `Aggiornamento completato: ${Number(result.file_players || 0)} giocatori nel listone, ` +
      `${Number(result.new_players_count || 0)} nuovi, ` +
      `${Number(result.removed_players_count || 0)} disattivati, ` +
      `${Number(result.quotation_changes_count || 0)} quotazioni cambiate.`,
      "success"
    );

    if (applyFantacalcioListoneBtn) {
      applyFantacalcioListoneBtn.style.display = "none";
    }

    if (fantacalcioFileInput) {
      fantacalcioFileInput.value = "";
    }

    pendingFantacalcioRows = [];
    pendingFantacalcioFileName = "";

    await loadMyOwnedPlayers();
    await loadMyReplacementCandidates();
    await loadFreeAgents();

  } catch (error) {
    console.error("Errore aggiornamento listone Fantacalcio:", error);

    setFantacalcioListoneMessage(
      error?.message || "Errore durante l'aggiornamento del listone.",
      "error"
    );

    if (applyFantacalcioListoneBtn) {
      applyFantacalcioListoneBtn.disabled = false;
      applyFantacalcioListoneBtn.style.display = "";
    }
  } finally {
    if (applyFantacalcioListoneBtn) {
      applyFantacalcioListoneBtn.textContent = "Conferma aggiornamento";
    }

    if (fantacalcioFileInput) {
      fantacalcioFileInput.disabled = false;
    }
  }
}


/* ===============================
   SCAMBI CHIAMATE SETTIMANALI
================================ */

function setWaiverTradeMessage(text, isError = false) {
  if (!waiverTradeMessageEl) return;

  waiverTradeMessageEl.textContent = text || "";
  waiverTradeMessageEl.style.color = isError ? "#dc2626" : "#334155";
}

function blockWaiverTradeWriteWhileViewingAs() {
  if (!isAdminViewingAsTeam()) return false;

  setWaiverTradeMessage(
    `Modalità test: stai visualizzando come ${currentTeam?.name || "un'altra squadra"}. Gli scambi sono disabilitati.`,
    true
  );
  return true;
}

function getWaiverTradeAssetKey(asset) {
  return String(
    asset?.key ||
      `${asset?.phase || ""}:${asset?.week || ""}:${asset?.original_team_id || ""}`
  );
}

function getSelectedWaiverTradeAssetKeys(container) {
  if (!container) return new Set();

  return new Set(
    Array.from(
      container.querySelectorAll('.waiver-trade-asset input[type="checkbox"]:checked')
    ).map(input => input.value)
  );
}

function getSelectedWaiverTradeItems(container) {
  const selectedKeys = getSelectedWaiverTradeAssetKeys(container);

  return waiverTradeAssets
    .filter(asset => selectedKeys.has(getWaiverTradeAssetKey(asset)))
    .map(asset => ({
      week: Number(asset.week),
      original_team_id: asset.original_team_id
    }));
}

function formatWaiverTradeAssetMeta(asset) {
  if (Number.isFinite(Number(asset?.priority_number))) {
    return `Priorità #${Number(asset.priority_number)} · pacchetto Slot 1 + Slot 2`;
  }

  return "Priorità definita quando verrà generato l’ordine";
}

function renderWaiverTradeAssetList(container, assets, selectedKeys = new Set()) {
  if (!container) return;

  const tradableAssets = (assets || [])
    .filter(asset => asset.tradable)
    .sort((a, b) => {
      const weekDiff = Number(a.week) - Number(b.week);
      if (weekDiff !== 0) return weekDiff;
      return String(a.original_team_name || "").localeCompare(
        String(b.original_team_name || ""),
        "it"
      );
    });

  if (tradableAssets.length === 0) {
    container.innerHTML = "<p>Nessuna chiamata negoziabile in questo intervallo.</p>";
    return;
  }

  let lastWeek = null;

  container.innerHTML = tradableAssets
    .map(asset => {
      const week = Number(asset.week);
      const key = getWaiverTradeAssetKey(asset);
      const weekHeading = week !== lastWeek
        ? `<div class="waiver-trade-week-label">Settimana ${week}</div>`
        : "";

      lastWeek = week;

      const originalName = escapeWaiverHtml(
        asset.original_team_name || "Squadra originale"
      );
      const checked = selectedKeys.has(key) ? "checked" : "";
      const disabled = isAdminViewingAsTeam() ? "disabled" : "";

      return `
        ${weekHeading}
        <label class="waiver-trade-asset">
          <input
            type="checkbox"
            value="${escapeWaiverHtml(key)}"
            ${checked}
            ${disabled}
          />
          <span class="waiver-trade-asset-copy">
            <strong>Chiamata di ${originalName}</strong>
            <small>${escapeWaiverHtml(formatWaiverTradeAssetMeta(asset))}</small>
            ${
              asset.has_saved_call
                ? '<small class="waiver-trade-saved-warning">Scelta già salvata: verrà cancellata se accetti lo scambio</small>'
                : ""
            }
          </span>
        </label>
      `;
    })
    .join("");
}

function populateWaiverTradePartnerSelect() {
  if (!waiverTradePartnerSelect || !currentTeam) return;

  const previousValue = waiverTradePartnerSelect.value;
  const partnerIds = new Set(
    waiverTradeAssets
      .filter(
        asset =>
          asset.tradable &&
          String(asset.owner_team_id) !== String(currentTeam.id)
      )
      .map(asset => String(asset.owner_team_id))
  );

  const eligibleTeams = teamsCache
    .filter(team => partnerIds.has(String(team.id)))
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "it"));

  waiverTradePartnerSelect.innerHTML = `
    <option value="">Seleziona squadra</option>
    ${eligibleTeams
      .map(
        team => `
          <option value="${team.id}">${escapeWaiverHtml(team.name)}</option>
        `
      )
      .join("")}
  `;

  if (eligibleTeams.some(team => String(team.id) === String(previousValue))) {
    waiverTradePartnerSelect.value = previousValue;
  }

  waiverTradePartnerSelect.disabled = isAdminViewingAsTeam();
}

function renderWaiverTradeBuilder() {
  if (!currentTeam) return;

  const selectedOfferKeys = getSelectedWaiverTradeAssetKeys(
    waiverTradeOfferAssetsEl
  );
  const selectedRequestKeys = getSelectedWaiverTradeAssetKeys(
    waiverTradeRequestAssetsEl
  );
  const partnerTeamId = waiverTradePartnerSelect?.value || "";

  const myAssets = waiverTradeAssets.filter(
    asset => String(asset.owner_team_id) === String(currentTeam.id)
  );

  const partnerAssets = partnerTeamId
    ? waiverTradeAssets.filter(
        asset => String(asset.owner_team_id) === String(partnerTeamId)
      )
    : [];

  renderWaiverTradeAssetList(
    waiverTradeOfferAssetsEl,
    myAssets,
    selectedOfferKeys
  );

  if (!partnerTeamId) {
    if (waiverTradeRequestAssetsEl) {
      waiverTradeRequestAssetsEl.innerHTML =
        "<p>Seleziona prima una squadra.</p>";
    }
  } else {
    renderWaiverTradeAssetList(
      waiverTradeRequestAssetsEl,
      partnerAssets,
      selectedRequestKeys
    );
  }

  if (waiverTradeSubmitBtn) {
    waiverTradeSubmitBtn.disabled = isAdminViewingAsTeam();
  }

  if (waiverTradeNoteInput) {
    waiverTradeNoteInput.disabled = isAdminViewingAsTeam();
  }
}

function getWaiverTradeStatusLabel(status) {
  const labels = {
    pending: "In attesa",
    accepted: "Accettata",
    rejected: "Rifiutata",
    cancelled: "Annullata",
    expired: "Scaduta"
  };

  return labels[String(status || "").toLowerCase()] || status || "-";
}

function formatWaiverTradeItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => {
      const name = escapeWaiverHtml(
        item.original_team_name || "squadra originale"
      );
      return `sett. ${Number(item.week)} · chiamata di ${name}`;
    })
    .join("<br>");
}

function buildWaiverTradeProposalCard(trade, mode = "history") {
  const isReceived =
    String(trade.receiving_team_id) === String(currentTeam?.id);
  const counterpartyName = isReceived
    ? trade.proposing_team_name
    : trade.receiving_team_name;
  const giveItems = isReceived ? trade.request_items : trade.offer_items;
  const receiveItems = isReceived ? trade.offer_items : trade.request_items;
  const status = String(trade.status || "pending").toLowerCase();
  const pendingActions = status === "pending" && !isAdminViewingAsTeam();

  let actions = "";

  if (pendingActions && mode === "received") {
    actions = `
      <div class="waiver-trade-proposal-actions">
        <button type="button" class="primary-btn accept-waiver-trade-btn" data-proposal-id="${trade.id}">
          Accetta
        </button>
        <button type="button" class="secondary-btn reject-waiver-trade-btn" data-proposal-id="${trade.id}">
          Rifiuta
        </button>
      </div>
    `;
  } else if (pendingActions && mode === "sent") {
    actions = `
      <div class="waiver-trade-proposal-actions single">
        <button type="button" class="secondary-btn cancel-waiver-trade-btn" data-proposal-id="${trade.id}">
          Annulla proposta
        </button>
      </div>
    `;
  }

  return `
    <article class="waiver-trade-proposal ${escapeWaiverHtml(status)} ${isReceived ? "received" : "sent"}">
      <div class="waiver-trade-proposal-head">
        <strong>${isReceived ? "Da" : "A"}: ${escapeWaiverHtml(counterpartyName || "Squadra")}</strong>
        <span class="waiver-trade-status ${escapeWaiverHtml(status)}">${escapeWaiverHtml(getWaiverTradeStatusLabel(status))}</span>
      </div>

      <div class="waiver-trade-exchange">
        <div class="waiver-trade-exchange-row">
          <b>Tu cedi:</b><br>${formatWaiverTradeItems(giveItems)}
        </div>
        <div class="waiver-trade-exchange-row">
          <b>Tu ricevi:</b><br>${formatWaiverTradeItems(receiveItems)}
        </div>
      </div>

      ${
        trade.note
          ? `<p class="waiver-trade-proposal-note">“${escapeWaiverHtml(trade.note)}”</p>`
          : ""
      }

      <small class="waiver-trade-proposal-date">${escapeWaiverHtml(formatWaiverDateTime(trade.created_at))}</small>
      ${actions}
    </article>
  `;
}

function bindWaiverTradeProposalActions() {
  document.querySelectorAll(".accept-waiver-trade-btn").forEach(button => {
    button.addEventListener("click", () => {
      respondToWaiverCallTrade(button.dataset.proposalId, true);
    });
  });

  document.querySelectorAll(".reject-waiver-trade-btn").forEach(button => {
    button.addEventListener("click", () => {
      respondToWaiverCallTrade(button.dataset.proposalId, false);
    });
  });

  document.querySelectorAll(".cancel-waiver-trade-btn").forEach(button => {
    button.addEventListener("click", () => {
      cancelWaiverCallTrade(button.dataset.proposalId);
    });
  });
}

function renderWaiverCallTradeProposals() {
  if (!currentTeam) return;

  const received = waiverCallTrades.filter(
    trade =>
      trade.status === "pending" &&
      String(trade.receiving_team_id) === String(currentTeam.id)
  );
  const sent = waiverCallTrades.filter(
    trade =>
      trade.status === "pending" &&
      String(trade.proposing_team_id) === String(currentTeam.id)
  );
  const history = waiverCallTrades.filter(trade => trade.status !== "pending");

  if (waiverTradeReceivedCountEl) {
    waiverTradeReceivedCountEl.textContent = String(received.length);
  }

  if (waiverTradeSentCountEl) {
    waiverTradeSentCountEl.textContent = String(sent.length);
  }

  if (mobileTradesBadge) {
    mobileTradesBadge.style.display = received.length ? "inline-flex" : "none";
    mobileTradesBadge.textContent = received.length > 9 ? "9+" : String(received.length || "!");
  }

  if (waiverTradeReceivedEl) {
    waiverTradeReceivedEl.innerHTML = received.length
      ? received
          .map(trade => buildWaiverTradeProposalCard(trade, "received"))
          .join("")
      : "<p>Nessuna proposta ricevuta.</p>";
  }

  if (waiverTradeSentEl) {
    waiverTradeSentEl.innerHTML = sent.length
      ? sent.map(trade => buildWaiverTradeProposalCard(trade, "sent")).join("")
      : "<p>Nessuna proposta inviata.</p>";
  }

  if (waiverTradeHistoryEl) {
    waiverTradeHistoryEl.innerHTML = history.length
      ? history
          .slice(0, 30)
          .map(trade => buildWaiverTradeProposalCard(trade, "history"))
          .join("")
      : "<p>Nessuna proposta conclusa.</p>";
  }

  bindWaiverTradeProposalActions();
}

async function loadWaiverCallTrades() {
  if (!currentTeam || !currentSettings || !waiverTradeOfferAssetsEl) return;

  const viewTeamId = currentTeam.id;

  const [assetsResult, tradesResult] = await Promise.all([
    supabase.rpc("get_waiver_call_trade_assets", {
      p_view_team_id: viewTeamId,
      p_weeks_ahead: WAIVER_TRADE_FUTURE_WEEKS
    }),
    supabase.rpc("get_my_waiver_call_trades", {
      p_view_team_id: viewTeamId
    })
  ]);

  if (assetsResult.error || tradesResult.error) {
    const error = assetsResult.error || tradesResult.error;
    console.error("Errore caricamento scambi chiamate waiver:", error);

    waiverTradeAssets = [];
    waiverCallTrades = [];
    populateWaiverTradePartnerSelect();
    renderWaiverTradeBuilder();
    renderWaiverCallTradeProposals();
    setWaiverTradeMessage(
      "Scambi non disponibili: esegui prima lo script SQL degli scambi chiamate.",
      true
    );
    return;
  }

  waiverTradeAssets = Array.isArray(assetsResult.data)
    ? assetsResult.data
    : [];
  waiverCallTrades = Array.isArray(tradesResult.data)
    ? tradesResult.data
    : [];

  populateWaiverTradePartnerSelect();
  renderWaiverTradeBuilder();
  renderWaiverCallTradeProposals();
}

async function createWaiverCallTradeProposal() {
  if (blockWaiverTradeWriteWhileViewingAs()) return;

  const partnerTeamId = waiverTradePartnerSelect?.value || "";
  const offered = getSelectedWaiverTradeItems(waiverTradeOfferAssetsEl);
  const requested = getSelectedWaiverTradeItems(waiverTradeRequestAssetsEl);

  if (!partnerTeamId) {
    setWaiverTradeMessage("Seleziona la squadra con cui trattare.", true);
    return;
  }

  if (offered.length === 0 || requested.length === 0) {
    setWaiverTradeMessage(
      "Seleziona almeno una chiamata da cedere e una da ricevere.",
      true
    );
    return;
  }

  const selectedKeys = new Set([
    ...getSelectedWaiverTradeAssetKeys(waiverTradeOfferAssetsEl),
    ...getSelectedWaiverTradeAssetKeys(waiverTradeRequestAssetsEl)
  ]);
  const hasSavedSelection = waiverTradeAssets.some(
    asset => selectedKeys.has(getWaiverTradeAssetKey(asset)) && asset.has_saved_call
  );
  const partner = teamMap[partnerTeamId];
  const warning = hasSavedSelection
    ? " Una o più scelte già salvate verranno cancellate solo se la proposta sarà accettata."
    : "";

  const confirmed = confirm(
    `Inviare questa proposta a ${partner?.name || "questa squadra"}?${warning}`
  );

  if (!confirmed) return;

  if (waiverTradeSubmitBtn) waiverTradeSubmitBtn.disabled = true;
  setWaiverTradeMessage("Invio proposta in corso...");

  const { error } = await supabase.rpc(
    "create_waiver_call_trade_proposal",
    {
      p_to_team_id: partnerTeamId,
      p_offered: offered,
      p_requested: requested,
      p_note: waiverTradeNoteInput?.value?.trim() || null
    }
  );

  if (error) {
    console.error("Errore invio proposta scambio:", error);
    setWaiverTradeMessage("Errore invio proposta: " + error.message, true);
    if (waiverTradeSubmitBtn) waiverTradeSubmitBtn.disabled = false;
    return;
  }

  if (waiverTradeNoteInput) waiverTradeNoteInput.value = "";
  waiverTradePartnerSelect.value = "";
  document
    .querySelectorAll('.waiver-trade-asset input[type="checkbox"]')
    .forEach(input => {
      input.checked = false;
    });
  setWaiverTradeMessage("Proposta inviata correttamente.");
  await loadWaiverCallTrades();
}

async function refreshWaiverAfterCallTrade() {
  await loadWaiverOrder();
  await renderPublicWaiverOrder();
  await loadMyWaiverCalls();
  await loadWaiverCallTrades();

  if (currentUserIsAdmin && !isAdminViewingAsTeam()) {
    renderWaiverOrderAdmin();
    await loadAllCalls();
  }
}

async function respondToWaiverCallTrade(proposalId, accept) {
  if (blockWaiverTradeWriteWhileViewingAs()) return;

  const prompt = accept
    ? "Accettare lo scambio? Le eventuali scelte waiver già salvate sui pacchetti coinvolti verranno cancellate."
    : "Rifiutare questa proposta?";

  if (!confirm(prompt)) return;

  setWaiverTradeMessage(
    accept ? "Accettazione scambio in corso..." : "Rifiuto proposta in corso..."
  );

  const { data, error } = await supabase.rpc("respond_waiver_call_trade", {
    p_proposal_id: proposalId,
    p_accept: accept
  });

  if (error) {
    console.error("Errore risposta proposta scambio:", error);
    setWaiverTradeMessage("Errore: " + error.message, true);
    await loadWaiverCallTrades();
    return;
  }

  if (accept) {
    const deletedCalls = Number(data?.deleted_saved_calls || 0);
    setWaiverTradeMessage(
      deletedCalls > 0
        ? `Scambio completato. ${deletedCalls} scelta/e salvata/e cancellata/e.`
        : "Scambio completato."
    );
    await refreshWaiverAfterCallTrade();
  } else {
    setWaiverTradeMessage("Proposta rifiutata.");
    await loadWaiverCallTrades();
  }
}

async function cancelWaiverCallTrade(proposalId) {
  if (blockWaiverTradeWriteWhileViewingAs()) return;
  if (!confirm("Annullare questa proposta?")) return;

  const { error } = await supabase.rpc("cancel_waiver_call_trade", {
    p_proposal_id: proposalId
  });

  if (error) {
    console.error("Errore annullamento proposta scambio:", error);
    setWaiverTradeMessage("Errore: " + error.message, true);
    return;
  }

  setWaiverTradeMessage("Proposta annullata.");
  await loadWaiverCallTrades();
}

/* ===============================
   INIT
================================ */

async function initWaiverRoom() {
  const team = await getMyTeam();
  const settings = await getWaiverSettings();

  currentRealTeam = team;
  currentTeam = team;
  currentSettings = settings;

  if (settings) {
    if (activePhaseEl) activePhaseEl.textContent = settings.active_phase || "Non impostata";
    if (activeWeekEl) activeWeekEl.textContent = settings.active_week || "-";
  }

  syncSettingsPanel();

  await loadTeams();

  if (currentUserIsAdmin) {
    const { error: irSyncError } = await supabase.rpc('admin_sync_ir_compensatory_calls');
    if (irSyncError) {
      console.error('Errore sincronizzazione compensative IR:', irSyncError);
    }
  }

  if (currentUserIsAdmin) {
    restoreAdminViewAsTeamFromSession();
  }

  await loadInjuryReserveMonitor();

  renderCurrentTeamIdentity();
  populateAdminCompensatoryTeamSelect();
  populateAdminViewAsSelect();

  await loadWaiverOrder();
  await renderPublicWaiverOrder();

  if (currentUserIsAdmin && !isAdminViewingAsTeam()) {
    if (adminPanel) adminPanel.style.display = "block";

    const adminMobileTab = document.querySelector(".admin-mobile-tab");
    if (adminMobileTab) adminMobileTab.style.display = "";

    renderWaiverOrderAdmin();
    await loadAllCalls();
    await loadAllCompensatoryCalls();
  }

  await loadMyOwnedPlayers();
  await loadMyReplacementCandidates();
  await loadMyWaiverCalls();
  await loadWaiverCallTrades();
  await loadMyCompensatoryCalls();
  await loadFreeAgents();

  updateAdminViewAsUI();
}

function setupMobileWaiverTabs() {
  const tabButtons = document.querySelectorAll("[data-waiver-mobile-tab]");

  if (!tabButtons.length) return;

  tabButtons.forEach(button => {
    button.addEventListener("click", () => {
      activateWaiverMobileTab(button.dataset.waiverMobileTab);
    });
  });

  syncWaiverMobileTabColumns();
  activateWaiverMobileTab("calls");
}

/* ===============================
   EVENT LISTENERS
================================ */

adminViewAsBtn?.addEventListener("click", async () => {
  const teamId = adminViewAsSelect?.value || "";

  if (!teamId) {
    setAdminMessage("Seleziona prima una squadra da visualizzare.", true);
    return;
  }

  await enterAdminViewAsTeam(teamId);
});

adminViewAsResetBtn?.addEventListener("click", async () => {
  await exitAdminViewAsTeam();
});

adminViewAsBannerResetBtn?.addEventListener("click", async () => {
  await exitAdminViewAsTeam();
});

generateWaiverOrderBtn?.addEventListener("click", () => {
  generateWaiverOrder();
});

saveWaiverOrderBtn?.addEventListener("click", () => {
  saveWaiverOrderAdmin();
});

calculateSlot1Btn?.addEventListener("click", () => {
  calculateResultsForSlot("1");
});

calculateSlot1SBtn?.addEventListener("click", () => {
  calculateResultsForSlot("1S");
});

calculateSlot2Btn?.addEventListener("click", () => {
  calculateResultsForSlot("2");
});

calculateSlot2SBtn?.addEventListener("click", () => {
  calculateResultsForSlot("2S");
});

calculateHighCompensatoryBtn?.addEventListener("click", () => {
  calculateCompensatoryResults("high");
});

calculateCompensatoryBtn?.addEventListener("click", () => {
  calculateCompensatoryResults("normal");
});

addCompensatoryBtn?.addEventListener("click", () => {
  addManualCompensatoryCall();
});

waiverTradePartnerSelect?.addEventListener("change", () => {
  renderWaiverTradeBuilder();
});

waiverTradeSubmitBtn?.addEventListener("click", () => {
  createWaiverCallTradeProposal();
});


fantacalcioFileInput?.addEventListener("change", async () => {
  const file = fantacalcioFileInput.files?.[0];

  if (!file) {
    resetFantacalcioPreview();
    setFantacalcioListoneMessage("Nessun file selezionato.");
    return;
  }

  try {
    await previewFantacalcioListoneFile(file);
  } catch (error) {
    console.error("Errore anteprima listone Fantacalcio:", error);
    resetFantacalcioPreview();
    setFantacalcioListoneMessage(
      error?.message || "Impossibile leggere il listone.",
      "error"
    );
  }
});

applyFantacalcioListoneBtn?.addEventListener("click", () => {
  applyFantacalcioListone();
});

[searchInput, roleFilter, serieATeamFilter, u21Filter].forEach(el => {
  el?.addEventListener("input", renderFreeAgents);
  el?.addEventListener("change", renderFreeAgents);
});
setStandardFridayBtn?.addEventListener("click", () => {
  fillStandardFridaySettings();
});

setPlayoffFridayBtn?.addEventListener("click", () => {
  fillPlayoffFridaySettings();
});

saveWaiverSettingsBtn?.addEventListener("click", () => {
  saveWaiverSettings();
});
setupFreeAgentsSorting();
setupMobileWaiverTabs();

initWaiverRoom();
