import { supabase } from "./supabase.js";

const teamNameEl = document.getElementById("teamName");
const teamConferenceEl = document.getElementById("teamConference");
const activePhaseEl = document.getElementById("activePhase");
const activeWeekEl = document.getElementById("activeWeek");

const calculateSlot1Btn = document.getElementById("calculateSlot1Btn");
const calculateSlot2Btn = document.getElementById("calculateSlot2Btn");
const adminPanel = document.getElementById("adminPanel");

const priorityListEl = document.getElementById("priorityList");
const savePriorityBtn = document.getElementById("savePriorityBtn");
const priorityMessageEl = document.getElementById("priorityMessage");

let currentTeam = null;
let currentSettings = null;
let priorityTeams = [];
let draggedPriorityTeamId = null;

const playerInEl = document.getElementById("playerIn");
const playerOutEl = document.getElementById("playerOut");
const saveCallBtn = document.getElementById("saveCallBtn");
const callMessageEl = document.getElementById("callMessage");

const playerInEl2 = document.getElementById("playerIn2");
const playerOutEl2 = document.getElementById("playerOut2");
const saveCallBtn2 = document.getElementById("saveCallBtn2");
const callMessageEl2 = document.getElementById("callMessage2");

const resetCallBtn1 = document.getElementById("resetCallBtn1");
const resetCallBtn2 = document.getElementById("resetCallBtn2");

const selectedPlayerBox1 = document.getElementById("selectedPlayerBox1");
const selectedPlayerName1 = document.getElementById("selectedPlayerName1");
const selectedPlayerRole1 = document.getElementById("selectedPlayerRole1");

const selectedPlayerBox2 = document.getElementById("selectedPlayerBox2");
const selectedPlayerName2 = document.getElementById("selectedPlayerName2");
const selectedPlayerRole2 = document.getElementById("selectedPlayerRole2");

/* ===============================
   UI SELEZIONE GIOCATORI
================================ */

function clearSelectedRows() {
  document
    .querySelectorAll("#freeAgentsTable tbody tr.selected-player")
    .forEach(row => {
      row.classList.remove("selected-player");
    });
}

function updateSelectedPlayerBox(slot, playerName, role) {
  const box = slot === "1" ? selectedPlayerBox1 : selectedPlayerBox2;
  const nameEl = slot === "1" ? selectedPlayerName1 : selectedPlayerName2;
  const roleEl = slot === "1" ? selectedPlayerRole1 : selectedPlayerRole2;

  if (!box || !nameEl || !roleEl) return;

  box.classList.remove("hidden");
  nameEl.textContent = playerName;
  roleEl.textContent = role || "";
  roleEl.style.display = role ? "inline-flex" : "none";
}

function selectPlayerForSlot(slot, player, rowElement = null) {
  const playerName = player.name || "";
  const role = player.role || "";

  const value = role ? `${playerName} (${role})` : playerName;

  if (slot === "1") {
    playerInEl.value = value;
    updateSelectedPlayerBox("1", playerName, role);
  }

  if (slot === "2") {
    playerInEl2.value = value;
    updateSelectedPlayerBox("2", playerName, role);
  }

  clearSelectedRows();

  if (rowElement) {
    rowElement.classList.add("selected-player");
  }
}

function resetCallForm(slot) {
  if (slot === "1") {
    playerInEl.value = "";
    playerOutEl.value = "";
    callMessageEl.textContent = "";

    if (selectedPlayerBox1) selectedPlayerBox1.classList.add("hidden");
    if (selectedPlayerName1) selectedPlayerName1.textContent = "";
    if (selectedPlayerRole1) selectedPlayerRole1.textContent = "";
  }

  if (slot === "2") {
    playerInEl2.value = "";
    playerOutEl2.value = "";
    callMessageEl2.textContent = "";

    if (selectedPlayerBox2) selectedPlayerBox2.classList.add("hidden");
    if (selectedPlayerName2) selectedPlayerName2.textContent = "";
    if (selectedPlayerRole2) selectedPlayerRole2.textContent = "";
  }

  clearSelectedRows();
}

/* ===============================
   SLOT / DISPONIBILITÀ
================================ */

function isSlotOpen(openAt, closeAt) {
  const now = new Date();

  if (!openAt || !closeAt) return true;

  return now >= new Date(openAt) && now < new Date(closeAt);
}

function applySlotAvailability() {
  if (!currentSettings) return;

  const slot1Open = isSlotOpen(
    currentSettings.slot1_open_at,
    currentSettings.slot1_close_at
  );

  const slot2Open = isSlotOpen(
    currentSettings.slot2_open_at,
    currentSettings.slot2_close_at
  );

  playerInEl.disabled = !slot1Open;
  playerOutEl.disabled = !slot1Open;
  saveCallBtn.disabled = !slot1Open;

  playerInEl2.disabled = !slot2Open;
  playerOutEl2.disabled = !slot2Open;
  saveCallBtn2.disabled = !slot2Open;

  if (!slot1Open) {
    callMessageEl.textContent = "Prima chiamata chiusa.";
  }

  if (!slot2Open) {
    callMessageEl2.textContent = "Seconda chiamata non disponibile in questo momento.";
  }
}

/* ===============================
   DATI UTENTE / SETTINGS
================================ */

async function getMyTeam() {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    console.error("Utente non loggato:", authError);
    teamNameEl.textContent = "Utente non loggato";
    return null;
  }

  const userEmail = authData.user.email;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("team_id")
    .eq("email", userEmail)
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

/* ===============================
   ADMIN - CHIAMATE
================================ */

async function loadAllCalls() {
  if (!currentSettings) return;

  const { data: calls, error: callsError } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .order("slot", { ascending: true });

  if (callsError) {
    console.error("Errore caricamento chiamate:", callsError);
    return;
  }

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name");

  if (teamsError) {
    console.error("Errore caricamento squadre:", teamsError);
    return;
  }

  const teamMap = {};

  teams.forEach(team => {
    teamMap[team.id] = team.name;
  });

  const container = document.getElementById("allCalls");

  if (!container) return;

  container.innerHTML = "";

  if (!calls || calls.length === 0) {
    container.innerHTML = "<p>Nessuna chiamata ancora.</p>";
    return;
  }

  calls.forEach(call => {
    const div = document.createElement("div");
    div.style.marginBottom = "8px";

    div.innerHTML = `
      <strong>${teamMap[call.team_id] || call.team_id}</strong>
      → ${call.player_in} 
      <span>(slot ${call.slot})</span>
      <strong>${call.status || "pending"}</strong>
    `;

    container.appendChild(div);
  });
}

/* ===============================
   ADMIN - PRIORITY PANEL
================================ */

async function loadPriorityPanel() {
  if (!currentSettings || !priorityListEl) return;

  priorityListEl.innerHTML = "<p>Caricamento priorità...</p>";

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, conference")
    .order("name", { ascending: true });

  if (teamsError) {
    console.error("Errore caricamento squadre:", teamsError);
    priorityListEl.innerHTML = "<p>Errore nel caricamento squadre.</p>";
    return;
  }

  const { data: priorities, error: priorityError } = await supabase
    .from("waiver_priority")
    .select("team_id, priority_number, conference")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase);

  if (priorityError) {
    console.error("Errore caricamento priorità:", priorityError);
    priorityListEl.innerHTML = "<p>Errore nel caricamento priorità.</p>";
    return;
  }

  const priorityMap = {};

  priorities?.forEach(row => {
    priorityMap[String(row.team_id)] = row.priority_number;
  });

  priorityTeams = teams.map(team => ({
    id: team.id,
    name: team.name,
    conference: team.conference,
    priority_number: priorityMap[String(team.id)] ?? 9999
  }));

  priorityTeams.sort((a, b) => {
    if (a.priority_number !== b.priority_number) {
      return a.priority_number - b.priority_number;
    }

    return a.name.localeCompare(b.name);
  });

  renderPriorityList();
}

function renderPriorityList() {
  if (!priorityListEl) return;

  priorityListEl.innerHTML = "";

  if (!priorityTeams || priorityTeams.length === 0) {
    priorityListEl.innerHTML = "<p>Nessuna squadra trovata.</p>";
    return;
  }

  priorityTeams.forEach((team, index) => {
    const item = document.createElement("div");

    item.className = "priority-item";
    item.draggable = true;
    item.dataset.teamId = team.id;

    item.innerHTML = `
      <span class="priority-rank">${index + 1}</span>
      <span class="priority-team-name">
        ${team.name}
        <small>${team.conference || ""}</small>
      </span>
      <span class="priority-drag-icon">☰</span>
    `;

    item.addEventListener("dragstart", () => {
      draggedPriorityTeamId = String(team.id);
      item.classList.add("dragging");
    });

    item.addEventListener("dragend", () => {
      draggedPriorityTeamId = null;
      item.classList.remove("dragging");
    });

    item.addEventListener("dragover", event => {
      event.preventDefault();
    });

    item.addEventListener("drop", event => {
      event.preventDefault();

      const targetTeamId = String(team.id);

      if (!draggedPriorityTeamId || draggedPriorityTeamId === targetTeamId) return;

      reorderPriorityTeams(draggedPriorityTeamId, targetTeamId);
    });

    priorityListEl.appendChild(item);
  });
}

function reorderPriorityTeams(draggedId, targetId) {
  const draggedIndex = priorityTeams.findIndex(team => String(team.id) === draggedId);
  const targetIndex = priorityTeams.findIndex(team => String(team.id) === targetId);

  if (draggedIndex === -1 || targetIndex === -1) return;

  const [draggedTeam] = priorityTeams.splice(draggedIndex, 1);
  priorityTeams.splice(targetIndex, 0, draggedTeam);

  renderPriorityList();

  if (priorityMessageEl) {
    priorityMessageEl.textContent = "Ordine modificato. Ricordati di salvare.";
  }
}

async function savePriorityOrder() {
  if (!currentSettings || !priorityTeams || priorityTeams.length === 0) return;

  if (priorityMessageEl) {
    priorityMessageEl.textContent = "Salvataggio in corso...";
  }

  const rows = priorityTeams.map((team, index) => ({
    week: currentSettings.active_week,
    phase: currentSettings.active_phase,
    conference: team.conference || null,
    team_id: team.id,
    priority_number: index + 1,
    updated_at: new Date().toISOString()
  }));

const { data, error } = await supabase
  .from("waiver_priority")
  .upsert(rows, {
    onConflict: "week,phase,conference,team_id"
  })
  .select();

if (error) {
  console.error("Errore salvataggio priorità completo:", error);

  if (priorityMessageEl) {
    priorityMessageEl.textContent =
      "Errore salvataggio: " + (error.message || "controlla console");
  }

  return;
}

  if (error) {
    console.error("Errore salvataggio priorità:", error);

    if (priorityMessageEl) {
      priorityMessageEl.textContent = "Errore nel salvataggio priorità.";
    }

    return;
  }

  if (priorityMessageEl) {
    priorityMessageEl.textContent = "Priorità salvata correttamente.";
  }

  await loadPriorityPanel();
}

/* ===============================
   CHIAMATE SALVATE UTENTE
================================ */

async function loadMySavedCall() {
  if (!currentTeam || !currentSettings) return;

  const { data, error } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("team_id", currentTeam.id)
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase);

  if (error) {
    console.error("Errore caricamento chiamate:", error);
    return;
  }

  data?.forEach(call => {
    if (call.slot === "1") {
      playerInEl.value = call.player_in || "";
      playerOutEl.value = call.player_out || "";
    }

    if (call.slot === "2") {
      playerInEl2.value = call.player_in || "";
      playerOutEl2.value = call.player_out || "";
    }
  });
}

/* ===============================
   CHIAMATE PUBBLICHE
================================ */

async function loadPublicCalls() {
  if (!currentSettings) return;

  const now = new Date();

  const showSlot1 = currentSettings.slot1_close_at
    ? now >= new Date(currentSettings.slot1_close_at)
    : false;

  const showSlot2 = currentSettings.slot2_close_at
    ? now >= new Date(currentSettings.slot2_close_at)
    : false;

  const visibleSlots = [];

  if (showSlot1) visibleSlots.push("1");
  if (showSlot2) visibleSlots.push("2");

  const container = document.getElementById("publicCalls");

  if (!container) return;

  container.innerHTML = "";

  if (visibleSlots.length === 0) {
    container.innerHTML = "<p>Le chiamate non sono ancora pubbliche.</p>";
    return;
  }

  const { data: calls, error } = await supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .in("slot", visibleSlots)
    .order("slot", { ascending: true });

  if (error) {
    console.error("Errore caricamento chiamate pubbliche:", error);
    return;
  }

  const { data: teams } = await supabase
    .from("teams")
    .select("id, name");

  const teamMap = {};

  teams?.forEach(team => {
    teamMap[team.id] = team.name;
  });

  if (!calls || calls.length === 0) {
    container.innerHTML = "<p>Nessuna chiamata pubblicata.</p>";
    return;
  }

  calls.forEach(call => {
    const div = document.createElement("div");
    div.className = "public-call-row";

    const teamName = teamMap[call.team_id] || call.team_id;
    const playerName = call.player_in || "-";

    let resultText = "⏳ In attesa";
    let resultClass = "pending";

    if (call.status === "won") {
      resultText = `🟢 ${teamName} prende ${playerName}`;
      resultClass = "won";
    }

    if (call.status === "lost") {
      resultText = `🔴 ${teamName} perde ${playerName}`;
      resultClass = "lost";
    }

    div.innerHTML = `
      <div class="public-call-main ${resultClass}">
        <strong>${resultText}</strong>
        <span>Slot ${call.slot}</span>
      </div>
    `;

    container.appendChild(div);
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
    const rows = text.split("\n").slice(1);
    const tableBody = document.querySelector("#freeAgentsTable tbody");

    tableBody.innerHTML = "";

    rows.forEach(row => {
      const cols = row.split(",");

      if (cols.length < 4) return;

      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${cols[0]}</td>
        <td>${cols[1]}</td>
        <td>${cols[2]}</td>
        <td>${cols[3]}</td>
      `;

      tr.addEventListener("click", () => {
        const player = {
          name: cols[0].trim(),
          role: cols[1].trim(),
          serieATeam: cols[2].trim(),
          quotation: cols[3].trim()
        };

        if (!playerInEl.disabled && !playerInEl.value) {
          selectPlayerForSlot("1", player, tr);
          return;
        }

        if (!playerInEl2.disabled && !playerInEl2.value) {
          selectPlayerForSlot("2", player, tr);
          return;
        }

        if (!playerInEl.disabled) {
          selectPlayerForSlot("1", player, tr);
          return;
        }

        if (!playerInEl2.disabled) {
          selectPlayerForSlot("2", player, tr);
          return;
        }

        alert("Nessuna finestra di chiamata è aperta in questo momento.");
      });

      tableBody.appendChild(tr);
    });

  } catch (err) {
    console.error("Errore caricamento svincolati:", err);
  }
}

/* ===============================
   CALCOLO RISULTATI
================================ */

async function calculateResultsForSlot(slot) {
  if (!currentSettings) return;

  let query = supabase
    .from("waiver_calls")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("slot", slot);

  if (slot === "2") {
    query = query.eq("status", "pending");
  }

  const { data: calls, error: callsError } = await query;

  if (callsError) {
    console.error("Errore caricamento chiamate:", callsError);
    return;
  }

  if (!calls || calls.length === 0) {
    alert("Nessuna chiamata da calcolare.");
    return;
  }

  const { data: priorities, error: priorityError } = await supabase
    .from("waiver_priority")
    .select("*")
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase);

  if (priorityError) {
    console.error("Errore caricamento priorità:", priorityError);
    return;
  }

  if (!priorities || priorities.length === 0) {
    alert("Prima salva l'ordine di priorità waiver.");
    return;
  }

  const priorityMap = {};

  priorities.forEach(row => {
    priorityMap[row.team_id] = row.priority_number;
  });

  const callsByPlayer = {};

  calls.forEach(call => {
    const playerKey = normalizePlayerName(call.player_in);

    if (!callsByPlayer[playerKey]) {
      callsByPlayer[playerKey] = [];
    }

    callsByPlayer[playerKey].push(call);
  });

  for (const playerKey in callsByPlayer) {
    const playerCalls = callsByPlayer[playerKey];

    playerCalls.sort((a, b) => {
      const priorityA = priorityMap[a.team_id] ?? 9999;
      const priorityB = priorityMap[b.team_id] ?? 9999;
      return priorityA - priorityB;
    });

    const winner = playerCalls[0];
    const losers = playerCalls.slice(1);

    await supabase
      .from("waiver_calls")
      .update({ status: "won" })
      .eq("id", winner.id);

    for (const loser of losers) {
      await supabase
        .from("waiver_calls")
        .update({ status: "lost" })
        .eq("id", loser.id);
    }
  }

  alert(`Risultati slot ${slot} calcolati.`);

  await loadAllCalls();
  await loadPublicCalls();
}

function normalizePlayerName(name) {
  return (name || "")
    .toLowerCase()
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
}

/* ===============================
   SALVATAGGIO CHIAMATE
================================ */

async function saveCall(slot, playerInElRef, playerOutElRef, messageEl) {
  if (!currentTeam || !currentSettings) {
    messageEl.textContent = "Errore: squadra o impostazioni non caricate.";
    return;
  }

  const playerIn = playerInElRef.value.trim();
  const playerOut = playerOutElRef.value.trim();

  if (!playerIn || !playerOut) {
    messageEl.textContent = "Compila tutti i campi.";
    return;
  }

  const payload = {
    team_id: currentTeam.id,
    week: currentSettings.active_week,
    phase: currentSettings.active_phase,
    conference: currentTeam.conference,
    slot: slot,
    player_in: playerIn,
    player_out: playerOut,
    status: "pending"
  };

  const { data: existingCall } = await supabase
    .from("waiver_calls")
    .select("id")
    .eq("team_id", currentTeam.id)
    .eq("week", currentSettings.active_week)
    .eq("phase", currentSettings.active_phase)
    .eq("slot", slot)
    .maybeSingle();

  let error;

  if (existingCall) {
    const result = await supabase
      .from("waiver_calls")
      .update({
        player_in: playerIn,
        player_out: playerOut,
        conference: currentTeam.conference,
        status: "pending",
        updated_at: new Date().toISOString()
      })
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
    messageEl.textContent = "Errore nel salvataggio.";
    return;
  }

  messageEl.textContent = slot === "1"
    ? "Chiamata salvata correttamente."
    : "Seconda chiamata salvata correttamente.";

  await loadMySavedCall();
}

/* ===============================
   INIT
================================ */

async function initWaiverRoom() {
  const team = await getMyTeam();
  const settings = await getWaiverSettings();

  const { data: authData } = await supabase.auth.getUser();
  const userEmail = authData?.user?.email;

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

  if (userEmail === "tringali0511@gmail.com") {
    adminPanel.style.display = "block";
    await loadAllCalls();
    await loadPriorityPanel();
  }

  await loadFreeAgents();
  await loadMySavedCall();
  applySlotAvailability();
  await loadPublicCalls();
}

/* ===============================
   EVENT LISTENERS
================================ */

calculateSlot1Btn?.addEventListener("click", () => {
  calculateResultsForSlot("1");
});

calculateSlot2Btn?.addEventListener("click", () => {
  calculateResultsForSlot("2");
});

savePriorityBtn?.addEventListener("click", () => {
  savePriorityOrder();
});

saveCallBtn?.addEventListener("click", () => {
  saveCall("1", playerInEl, playerOutEl, callMessageEl);
});

saveCallBtn2?.addEventListener("click", () => {
  saveCall("2", playerInEl2, playerOutEl2, callMessageEl2);
});

resetCallBtn1?.addEventListener("click", () => {
  resetCallForm("1");
});

resetCallBtn2?.addEventListener("click", () => {
  resetCallForm("2");
});

initWaiverRoom();
