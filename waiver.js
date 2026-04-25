import { supabase } from "./supabase.js";

/* ===============================
   ELEMENTI BASE
================================ */

const teamNameEl = document.getElementById("teamName");
const teamConferenceEl = document.getElementById("teamConference");
const activePhaseEl = document.getElementById("activePhase");
const activeWeekEl = document.getElementById("activeWeek");

const myWaiverCallsEl = document.getElementById("myWaiverCalls");
const callMessageEl = document.getElementById("callMessage");

const publicCallsEl = document.getElementById("publicCalls");
const allCallsEl = document.getElementById("allCalls");

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

const activePhaseSelect = document.getElementById("activePhaseSelect");
const activeWeekInput = document.getElementById("activeWeekInput");

const slot1OpenInput = document.getElementById("slot1OpenInput");
const slot1CloseInput = document.getElementById("slot1CloseInput");

const slot1SOpenInput = document.getElementById("slot1SOpenInput");
const slot1SCloseInput = document.getElementById("slot1SCloseInput");

const slot2OpenInput = document.getElementById("slot2OpenInput");
const slot2CloseInput = document.getElementById("slot2CloseInput");

const slot2SOpenInput = document.getElementById("slot2SOpenInput");
const slot2SCloseInput = document.getElementById("slot2SCloseInput");

const setStandardFridayBtn = document.getElementById("setStandardFridayBtn");
const setPlayoffFridayBtn = document.getElementById("setPlayoffFridayBtn");
const saveWaiverSettingsBtn = document.getElementById("saveWaiverSettingsBtn");
const settingsMessageEl = document.getElementById("settingsMessage");

/* ===============================
   STATO APP
================================ */

let currentTeam = null;
let currentSettings = null;
let currentUserEmail = null;

let teamsCache = [];
let teamMap = {};
let waiverOrderRows = [];
let myOrderRows = [];
let mySavedCalls = [];
let freeAgents = [];

let activeWaiverOrderId = null;
let draggedAdminOrderId = null;
let draggedAdminGroupKey = null;

/* ===============================
   HELPERS
================================ */

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

function getPriorityGroupForTeam(team) {
  if (isConferencePhase()) {
    return team.conference || "Senza Conference";
  }

  return "Totale";
}

function getGeneratedSlots() {
  if (isPlayoffPhase()) {
    return ["1", "1S", "2", "2S"];
  }

  return ["1", "2"];
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
  activeWaiverOrderId = orderId;

  document.querySelectorAll(".dynamic-call-card").forEach(card => {
    card.classList.toggle(
      "active-call-target",
      card.dataset.orderId === String(orderId)
    );
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
    .select("team_id")
    .eq("email", currentUserEmail)
    .single();

  if (profileError || !profile) {
    console.error("Profilo non trovato:", profileError);
    teamNameEl.textContent = "Profilo non trovato";
    return null;
  }

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

  Object.keys(groups).forEach(groupKey => {
    groups[groupKey].sort((a, b) => a.name.localeCompare(b.name));
  });

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

  setAdminMessage("Ordine waiver generato correttamente.");

  await loadWaiverOrder();
  renderWaiverOrderAdmin();
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

  setAdminMessage("Ordine waiver salvato correttamente.");

  await loadWaiverOrder();
  renderWaiverOrderAdmin();
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
    `;

    group.rows.forEach(orderRow => {
      const originalTeam = teamMap[orderRow.original_team_id];
      const savedCall = getCallByOrderId(orderRow.id);
      const slotOpen = isSlotOpen(orderRow.slot);

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

        <label>Giocatore chiamato</label>
        <input
          type="text"
          class="dynamic-player-in"
          data-order-id="${orderRow.id}"
          readonly
          placeholder="Seleziona questo box e clicca uno svincolato"
          value="${savedCall?.player_in || ""}"
          ${slotOpen ? "" : "disabled"}
        />

        <label>Giocatore da svincolare</label>
        <input
          type="text"
          class="dynamic-player-out"
          data-order-id="${orderRow.id}"
          placeholder="Scrivi il giocatore da svincolare"
          value="${savedCall?.player_out || ""}"
          ${slotOpen ? "" : "disabled"}
        />

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
            Reset
          </button>

          <button
            type="button"
            class="secondary-btn select-dynamic-call-btn"
            data-order-id="${orderRow.id}"
            ${slotOpen ? "" : "disabled"}
          >
            Seleziona box
          </button>
        </div>

        <p class="call-message">
          ${
            slotOpen
              ? "Disponibile ora."
              : `Slot ${normalizeSlot(orderRow.slot)} chiuso o non disponibile.`
          }
        </p>
      `;

      card.addEventListener("click", event => {
        const tag = event.target.tagName.toLowerCase();

        if (["input", "button"].includes(tag)) return;

        if (!slotOpen) return;

        setActiveCallCard(orderRow.id);
      });

      slotBlock.appendChild(card);
    });

    myWaiverCallsEl.appendChild(slotBlock);
  });

  document.querySelectorAll(".select-dynamic-call-btn").forEach(button => {
    button.addEventListener("click", () => {
      setActiveCallCard(button.dataset.orderId);
      setMessage("Box selezionato. Ora clicca uno svincolato dalla lista.");
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

  if (!activeWaiverOrderId) {
    const firstOpen = myOrderRows.find(row => isSlotOpen(row.slot));

    if (firstOpen) {
      setActiveCallCard(firstOpen.id);
    }
  }
}

function fillActiveCallWithPlayer(player) {
  if (!activeWaiverOrderId) {
    const firstOpen = myOrderRows.find(row => isSlotOpen(row.slot));

    if (!firstOpen) {
      alert("Nessuna chiamata disponibile in questo momento.");
      return;
    }

    setActiveCallCard(firstOpen.id);
  }

  const orderRow = myOrderRows.find(row => String(row.id) === String(activeWaiverOrderId));

  if (!orderRow) {
    alert("Seleziona prima un box chiamata.");
    return;
  }

  if (!isSlotOpen(orderRow.slot)) {
    alert("Questo slot non è aperto.");
    return;
  }

  const input = document.querySelector(
    `.dynamic-player-in[data-order-id="${activeWaiverOrderId}"]`
  );

  if (!input) return;

  input.value = player.role ? `${player.name} (${player.role})` : player.name;

  document
    .querySelectorAll("#freeAgentsTable tbody tr.selected-player")
    .forEach(row => row.classList.remove("selected-player"));

  if (player.rowElement) {
    player.rowElement.classList.add("selected-player");
  }

  setMessage(`Giocatore selezionato: ${input.value}`);
}

async function saveDynamicCall(orderId) {
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
  const playerOut = playerOutEl?.value.trim() || "";

  if (!playerIn || !playerOut) {
    setMessage("Compila giocatore chiamato e giocatore da svincolare.", true);
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
}

async function resetDynamicCall(orderId) {
  const playerInEl = document.querySelector(`.dynamic-player-in[data-order-id="${orderId}"]`);
  const playerOutEl = document.querySelector(`.dynamic-player-out[data-order-id="${orderId}"]`);

  if (playerInEl) playerInEl.value = "";
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
    return;
  }

  setMessage("Box pulito.");
}

/* ===============================
   ADMIN CHIAMATE
================================ */

async function loadAllCalls() {
  if (!currentSettings || !allCallsEl) return;

  const { data: calls, error } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .order("slot", { ascending: true })
    .order("priority_number", { ascending: true });

  if (error) {
    console.error("Errore caricamento chiamate admin:", error);
    return;
  }

  allCallsEl.innerHTML = "";

  if (!calls || calls.length === 0) {
    allCallsEl.innerHTML = "<p>Nessuna chiamata ancora.</p>";
    return;
  }

  calls.forEach(call => {
    const owner = teamMap[call.owner_team_id] || teamMap[call.team_id];
    const original = teamMap[call.original_team_id];

    const div = document.createElement("div");

    div.innerHTML = `
      <strong>${owner?.name || call.owner_team_id || call.team_id}</strong>
      → ${call.player_in}
      <span>(slot ${normalizeSlot(call.slot)}, #${call.priority_number || "-"})</span>
      ${
        original && String(original.id) !== String(owner?.id)
          ? `<span>via ${original.name}</span>`
          : ""
      }
      <strong>${call.status || "pending"}</strong>
    `;

    allCallsEl.appendChild(div);
  });
}

/* ===============================
   CHIAMATE PUBBLICATE
================================ */

async function loadPublicCalls() {
  if (!currentSettings || !publicCallsEl) return;

  const visibleSlots = [];

  getGeneratedSlots().forEach(slot => {
    if (isSlotPublic(slot)) {
      visibleSlots.push(normalizeSlot(slot));
    }
  });

  publicCallsEl.innerHTML = "";

  if (visibleSlots.length === 0) {
    publicCallsEl.innerHTML = "<p>Le chiamate non sono ancora pubbliche.</p>";
    return;
  }

  const { data: calls, error } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .in("slot", visibleSlots)
    .order("slot", { ascending: true })
    .order("priority_number", { ascending: true });

  if (error) {
    console.error("Errore caricamento chiamate pubbliche:", error);
    publicCallsEl.innerHTML = "<p>Errore nel caricamento delle chiamate pubblicate.</p>";
    return;
  }

  if (!calls || calls.length === 0) {
    publicCallsEl.innerHTML = "<p>Nessuna chiamata pubblicata.</p>";
    return;
  }

  calls.forEach(call => {
    const owner = teamMap[call.owner_team_id] || teamMap[call.team_id];
    const original = teamMap[call.original_team_id];

    const ownerName = owner?.name || "Squadra";
    const originalName = original?.name || "";
    const playerName = call.player_in || "-";
    const slotLabel = normalizeSlot(call.slot);
    const priorityLabel = call.priority_number || "-";

    const isVia =
      original &&
      owner &&
      String(original.id) !== String(owner.id);

    let statusIcon = "⏳";
    let statusLabel = "In attesa";
    let actionText = `${ownerName} chiama ${playerName}`;
    let statusClass = "pending";

    if (call.status === "won") {
      statusIcon = "🟢";
      statusLabel = "Presa";
      actionText = `${ownerName} prende ${playerName}`;
      statusClass = "won";
    }

    if (call.status === "lost") {
      statusIcon = "🔴";
      statusLabel = "Persa";
      actionText = `${ownerName} perde ${playerName}`;
      statusClass = "lost";
    }

    const div = document.createElement("div");
    div.className = `public-result-card ${statusClass}`;

    div.innerHTML = `
      <div class="public-result-status">
        <span class="public-result-icon">${statusIcon}</span>
        <span class="public-result-label">${statusLabel}</span>
      </div>

      <div class="public-result-body">
        <strong>${actionText}</strong>

        <div class="public-result-meta">
          <span>Slot ${slotLabel}</span>
          <span>Priorità #${priorityLabel}</span>
        </div>

        ${
          isVia
            ? `<div class="public-result-via">via ${originalName}</div>`
            : ""
        }
      </div>
    `;

    publicCallsEl.appendChild(div);
  });
}

/* ===============================
   SVINCOLATI
================================ */

async function loadFreeAgents() {
  try {
    const response = await fetch("./svincolati.csv");

    if (!response.ok) {
      throw new Error("CSV non trovato: " + response.status);
    }

    const text = await response.text();

    freeAgents = text
      .split("\n")
      .slice(1)
      .map(row => row.trim())
      .filter(Boolean)
      .map(row => {
        const cols = row.split(",");

        return {
          name: (cols[0] || "").trim(),
          role: (cols[1] || "").trim(),
          serieATeam: (cols[2] || "").trim(),
          quotation: (cols[3] || "").trim()
        };
      })
      .filter(player => player.name);

    renderFreeAgents();

  } catch (err) {
    console.error("Errore caricamento svincolati:", err);

    if (freeAgentsTableBody) {
      freeAgentsTableBody.innerHTML = `
        <tr>
          <td colspan="4">Errore caricamento svincolati.</td>
        </tr>
      `;
    }
  }
}

function renderFreeAgents() {
  if (!freeAgentsTableBody) return;

  const query = (searchInput?.value || "").toLowerCase().trim();

  const filtered = freeAgents.filter(player => {
    const blob = `${player.name} ${player.role} ${player.serieATeam} ${player.quotation}`
      .toLowerCase();

    return blob.includes(query);
  });

  freeAgentsTableBody.innerHTML = "";

  filtered.forEach(player => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${player.name}</td>
      <td>${player.role}</td>
      <td>${player.serieATeam}</td>
      <td>${player.quotation}</td>
    `;

    tr.addEventListener("click", () => {
      fillActiveCallWithPlayer({
        ...player,
        rowElement: tr
      });
    });

    freeAgentsTableBody.appendChild(tr);
  });
}

/* ===============================
   CALCOLO RISULTATI
================================ */

async function calculateResultsForSlot(slot) {
  if (!currentSettings) return;

  const normalizedSlot = normalizeSlot(slot);

  const { data: calls, error: callsError } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("slot", normalizedSlot);

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

  const callsByPlayer = {};

  calls.forEach(call => {
    const order = orderMap[call.waiver_order_id];

    if (!order) return;

    const playerKey = isConferencePhase()
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

  for (const playerKey in callsByPlayer) {
    const entries = callsByPlayer[playerKey];

    entries.sort((a, b) => {
      return a.order.priority_number - b.order.priority_number;
    });

    const winner = entries[0];
    const losers = entries.slice(1);

    await supabase
      .from("waiver_calls")
      .update({ status: "won" })
      .eq("id", winner.call.id);

    for (const loser of losers) {
      await supabase
        .from("waiver_calls")
        .update({ status: "lost" })
        .eq("id", loser.call.id);
    }
  }

  alert(`Risultati slot ${normalizedSlot} calcolati.`);

  await loadAllCalls();
  await loadPublicCalls();
  await loadMyWaiverCalls();
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

  if (currentUserEmail === "tringali0511@gmail.com") {
    renderWaiverOrderAdmin();
    await loadAllCalls();
  }

  await loadMyWaiverCalls();
  await loadPublicCalls();

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

  const slot1Open = new Date(friday);
  const slot1Close = addMinutes(slot1Open, 60);

  const slot2Open = new Date(slot1Close);
  const slot2Close = addMinutes(slot2Open, 60);

  if (activePhaseSelect) activePhaseSelect.value = "round_robin";

  setInputDateTime(slot1OpenInput, slot1Open);
  setInputDateTime(slot1CloseInput, slot1Close);

  setInputDateTime(slot2OpenInput, slot2Open);
  setInputDateTime(slot2CloseInput, slot2Close);

  if (slot1SOpenInput) slot1SOpenInput.value = "";
  if (slot1SCloseInput) slot1SCloseInput.value = "";
  if (slot2SOpenInput) slot2SOpenInput.value = "";
  if (slot2SCloseInput) slot2SCloseInput.value = "";

  setSettingsMessage("Venerdì standard impostato: slot 1 alle 15:00, slot 2 alle 16:00. Ricordati di salvare.");
}

function fillPlayoffFridaySettings() {
  const friday = getNextFriday();

  const slot1Open = new Date(friday);
  const slot1Close = addMinutes(slot1Open, 30);

  const slot1SOpen = new Date(slot1Close);
  const slot1SClose = addMinutes(slot1SOpen, 30);

  const slot2Open = new Date(slot1SClose);
  const slot2Close = addMinutes(slot2Open, 30);

  const slot2SOpen = new Date(slot2Close);
  const slot2SClose = addMinutes(slot2SOpen, 30);

  if (activePhaseSelect) activePhaseSelect.value = "playoff";

  setInputDateTime(slot1OpenInput, slot1Open);
  setInputDateTime(slot1CloseInput, slot1Close);

  setInputDateTime(slot1SOpenInput, slot1SOpen);
  setInputDateTime(slot1SCloseInput, slot1SClose);

  setInputDateTime(slot2OpenInput, slot2Open);
  setInputDateTime(slot2CloseInput, slot2Close);

  setInputDateTime(slot2SOpenInput, slot2SOpen);
  setInputDateTime(slot2SCloseInput, slot2SClose);

  setSettingsMessage("Venerdì playoff impostato: 15:00, 15:30, 16:00, 16:30. Ricordati di salvare.");
}

async function saveWaiverSettings() {
  if (!currentSettings) return;

  const activeWeek = Number(activeWeekInput?.value || currentSettings.active_week);

  if (!activeWeek || activeWeek < 1) {
    setSettingsMessage("Inserisci una settimana valida.", true);
    return;
  }

  const payload = {
    active_phase: activePhaseSelect?.value || currentSettings.active_phase,
    active_week: activeWeek,

    slot1_open_at: fromDateTimeLocalValue(slot1OpenInput?.value),
    slot1_close_at: fromDateTimeLocalValue(slot1CloseInput?.value),

    slot1s_open_at: fromDateTimeLocalValue(slot1SOpenInput?.value),
    slot1s_close_at: fromDateTimeLocalValue(slot1SCloseInput?.value),

    slot2_open_at: fromDateTimeLocalValue(slot2OpenInput?.value),
    slot2_close_at: fromDateTimeLocalValue(slot2CloseInput?.value),

    slot2s_open_at: fromDateTimeLocalValue(slot2SOpenInput?.value),
    slot2s_close_at: fromDateTimeLocalValue(slot2SCloseInput?.value)
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

  activePhaseEl.textContent = currentSettings.active_phase || "Non impostata";
  activeWeekEl.textContent = currentSettings.active_week || "-";

  activeWaiverOrderId = null;
  waiverOrderRows = [];
  myOrderRows = [];
  mySavedCalls = [];

  await loadWaiverOrder();

  if (currentUserEmail === "tringali0511@gmail.com") {
    renderWaiverOrderAdmin();
    await loadAllCalls();
  }

  await loadMyWaiverCalls();
  await loadPublicCalls();

  syncSettingsPanel();

  setSettingsMessage("Impostazioni waiver salvate correttamente.");
}

/* ===============================
   INIT
================================ */

async function initWaiverRoom() {
  const team = await getMyTeam();
  const settings = await getWaiverSettings();

  currentTeam = team;
  currentSettings = settings;

  if (team) {
    teamNameEl.textContent = team.name;
    teamConferenceEl.textContent = team.conference || "Non assegnata";
  }

  if (settings) {
    activePhaseEl.textContent = settings.active_phase || "Non impostata";
    activeWeekEl.textContent = settings.active_week || "-";
  }
   syncSettingsPanel();

  await loadTeams();
  await loadWaiverOrder();

  if (currentUserEmail === "tringali0511@gmail.com") {
    adminPanel.style.display = "block";
    renderWaiverOrderAdmin();
    await loadAllCalls();
  }

  await loadMyWaiverCalls();
  await loadFreeAgents();
  await loadPublicCalls();
}

/* ===============================
   EVENT LISTENERS
================================ */

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

searchInput?.addEventListener("input", () => {
  renderFreeAgents();
});

savePhaseBtn?.addEventListener("click", () => {
  saveActivePhase();
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

initWaiverRoom();
