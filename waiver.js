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
const calculateSlot2Btn = document.getElementById("calculateSlot2Btn");
const waiverOrderMessageEl = document.getElementById("waiverOrderMessage");
const waiverOrderAdminEl = document.getElementById("waiverOrderAdmin");

const searchInput = document.getElementById("searchInput");
const freeAgentsTableBody = document.querySelector("#freeAgentsTable tbody");

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

/* ===============================
   HELPERS
================================ */

function isConferencePhase() {
  return (currentSettings?.active_phase || "").toLowerCase() === "conference";
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

function getSlotTimes(slot) {
  if (!currentSettings) return { openAt: null, closeAt: null };

  if (String(slot) === "1") {
    return {
      openAt: currentSettings.slot1_open_at,
      closeAt: currentSettings.slot1_close_at
    };
  }

  if (String(slot) === "2") {
    return {
      openAt: currentSettings.slot2_open_at,
      closeAt: currentSettings.slot2_close_at
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

function groupRowsByConferenceAndSlot(rows) {
  const groups = {};

  rows.forEach(row => {
    const conference = row.conference || "Totale";
    const slot = String(row.slot || "");
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
      "Conference League__slot_2",
      "Conference Championship__slot_1",
      "Conference Championship__slot_2",
      "Totale__slot_1",
      "Totale__slot_2"
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

  Object.keys(groups).forEach(groupKey => {
    ["1", "2"].forEach(slot => {
      groups[groupKey].forEach((team, index) => {
rows.push({
  week: currentSettings.active_week,
  phase: currentSettings.active_phase,
  conference: groupKey,
  slot,
  priority_number: index + 1,
  original_team_id: team.id,
  owner_team_id: team.id,
  updated_at: new Date().toISOString()
});
      });
    });
  });

  const { error } = await supabase
    .from("waiver_order")
    .upsert(rows, {
      onConflict: "week,phase,conference,slot,original_team_id"
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

  const rows = waiverOrderRows.map(row => ({
    id: row.id,
    week: row.week,
    phase: row.phase,
    conference: row.conference,
    slot: row.slot,
    priority_number: row.priority_number,
    original_team_id: row.original_team_id,
    owner_team_id: row.owner_team_id,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from("waiver_order")
    .upsert(rows, {
      onConflict: "id"
    });

  if (error) {
    console.error("Errore salvataggio ordine waiver:", error);
    setAdminMessage("Errore salvataggio ordine waiver: " + error.message, true);
    return;
  }

  setAdminMessage("Ordine waiver salvato correttamente.");

  await loadWaiverOrder();
  renderWaiverOrderAdmin();
  await loadMyWaiverCalls();
}

/* ===============================
   ADMIN ORDER UI
================================ */

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
      const ownerTeam = teamMap[row.owner_team_id];

      const rowDiv = document.createElement("div");
      rowDiv.className = "waiver-admin-row";
      rowDiv.dataset.orderId = row.id;

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
            <strong>Chiamata #${orderRow.priority_number} - Slot ${orderRow.slot}</strong>
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
              : `Slot ${orderRow.slot} chiuso o non disponibile.`
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
    slot: orderRow.slot,
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
    .eq("slot", orderRow.slot)
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
      <span>(slot ${call.slot}, #${call.priority_number || "-"})</span>
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

  if (isSlotPublic("1")) visibleSlots.push("1");
  if (isSlotPublic("2")) visibleSlots.push("2");

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
    return;
  }

  if (!calls || calls.length === 0) {
    publicCallsEl.innerHTML = "<p>Nessuna chiamata pubblicata.</p>";
    return;
  }

  calls.forEach(call => {
    const owner = teamMap[call.owner_team_id] || teamMap[call.team_id];
    const playerName = call.player_in || "-";

    let resultText = "⏳ In attesa";
    let resultClass = "pending";

    if (call.status === "won") {
      resultText = `🟢 ${owner?.name || "Squadra"} prende ${playerName}`;
      resultClass = "won";
    }

    if (call.status === "lost") {
      resultText = `🔴 ${owner?.name || "Squadra"} perde ${playerName}`;
      resultClass = "lost";
    }

    const div = document.createElement("div");
    div.className = "public-call-row";

    div.innerHTML = `
      <div class="public-call-main ${resultClass}">
        <strong>${resultText}</strong>
        <span>Slot ${call.slot} - #${call.priority_number || "-"}</span>
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

  const { data: calls, error: callsError } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("slot", String(slot));

  if (callsError) {
    console.error("Errore caricamento chiamate:", callsError);
    alert("Errore caricamento chiamate.");
    return;
  }

  if (!calls || calls.length === 0) {
    alert("Nessuna chiamata da calcolare.");
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

  alert(`Risultati slot ${slot} calcolati.`);

  await loadAllCalls();
  await loadPublicCalls();
  await loadMyWaiverCalls();
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

calculateSlot2Btn?.addEventListener("click", () => {
  calculateResultsForSlot("2");
});

searchInput?.addEventListener("input", () => {
  renderFreeAgents();
});

initWaiverRoom();
