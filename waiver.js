import { supabase } from "./supabase.js";

const teamNameEl = document.getElementById("teamName");
const teamConferenceEl = document.getElementById("teamConference");
const activePhaseEl = document.getElementById("activePhase");
const activeWeekEl = document.getElementById("activeWeek");

let currentTeam = null;
let currentSettings = null;

const playerInEl = document.getElementById("playerIn");
const playerOutEl = document.getElementById("playerOut");
const saveCallBtn = document.getElementById("saveCallBtn");
const callMessageEl = document.getElementById("callMessage");
const playerInEl2 = document.getElementById("playerIn2");
const playerOutEl2 = document.getElementById("playerOut2");
const saveCallBtn2 = document.getElementById("saveCallBtn2");
const callMessageEl2 = document.getElementById("callMessage2");

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

  await loadFreeAgents();
  await loadMySavedCall();
}

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
        const name = cols[0].trim();
        const role = cols[1].trim();

        if (!playerInEl.value) {
          playerInEl.value = `${name} (${role})`;
        } else {
          playerInEl2.value = `${name} (${role})`;
        }
      });

      tableBody.appendChild(tr);
    });

  } catch (err) {
    console.error("Errore caricamento svincolati:", err);
  }
}

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
}

saveCallBtn.addEventListener("click", () => {
  saveCall("1", playerInEl, playerOutEl, callMessageEl);
});

saveCallBtn2.addEventListener("click", () => {
  saveCall("2", playerInEl2, playerOutEl2, callMessageEl2);
});

initWaiverRoom();
