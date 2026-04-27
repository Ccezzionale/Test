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

const allCallsEl = document.getElementById("allCalls");
const publicWaiverOrderEl = document.getElementById("publicWaiverOrder");

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
let myOwnedPlayers = [];

let activeWaiverOrderId = null;
let draggedAdminOrderId = null;
let draggedAdminGroupKey = null;

/* ===============================
   HELPERS
================================ */

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
   CLASSIFICHE PER ORDINE WAIVER
================================ */

const STATS_MASTER_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSG3HrTJsfZGhgfJJx8l63QYhooGsyiydLf1OTt2JldOPx5nSZyJz00IplWA5YHGwjymNL9EXIVX5XA/pub?gid=1118969717&single=true&output=csv";

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
  const res = await fetch(STATS_MASTER_CSV_URL + "&nocache=" + Date.now(), {
    cache: "no-store"
  });

  if (!res.ok) {
    throw new Error("Errore caricamento statistiche: " + res.status);
  }

  const text = await res.text();
  return removeDuplicateStatsRows(parseCSV(text));
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

    groups[groupKey].sort((a, b) => {
      const rankA = getTeamPriorityIndex(a.name, priorityList);
      const rankB = getTeamPriorityIndex(b.name, priorityList);

      if (rankA !== rankB) return rankA - rankB;

      return a.name.localeCompare(b.name);
    });
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

try {
  await sortWaiverGroupsByStandings(groups);
} catch (err) {
  console.error("Errore ordinamento waiver da classifiche:", err);
  setAdminMessage(
    "Errore nel caricamento classifiche. Uso ordine alfabetico di emergenza.",
    true
  );

  Object.keys(groups).forEach(groupKey => {
    groups[groupKey].sort((a, b) => a.name.localeCompare(b.name));
  });
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
          resultText = `🟢 Prende ${call.player_in || "-"}`;
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

function buildPlayerOutOptions(savedPlayerOutId = null, savedPlayerOutName = "") {
  const options = [
    `<option value="">Seleziona giocatore da svincolare</option>`
  ];

  myOwnedPlayers.forEach(player => {
    const selected =
      String(player.id) === String(savedPlayerOutId)
        ? "selected"
        : "";

    const label = `${player.name}${player.role ? ` (${player.role})` : ""}`;

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
            savedCall
              ? `✅ Chiamata salvata il ${formatWaiverDateTime(savedCall.updated_at)}`
              : slotOpen
                ? "Nessuna chiamata salvata."
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

     const slotContent = slotBlock.querySelector(".waiver-slot-content");
slotContent.appendChild(card);
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
   input.dataset.playerId = player.id || "";

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
    is_fp: !!p.is_fp,
    pool: p.pool
  };
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

  myOwnedPlayers = (data || []).map(mapPlayerRow);
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
      pool
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

      freeAgents = (data || []).map(mapPlayerRow);
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

freeAgents = (data || []).map(mapPlayerRow);

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

const poolBadge =
  player.pool === "conference_league"
    ? "🟨"
    : player.pool === "conference_championship"
      ? "🟦"
      : "";

const badges = [
  poolBadge,
  player.is_u21 ? "🟢 U21" : "",
  player.is_fp ? "⭐ FP" : ""
].filter(Boolean).join(" ");

tr.innerHTML = `
  <td>${player.name} ${badges ? `<span class="player-badges">${badges}</span>` : ""}</td>
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

async function applyWinningWaiverCall(call) {
  const winningTeamId = call.owner_team_id || call.team_id;

  if (!winningTeamId) {
    throw new Error("Squadra vincitrice non trovata.");
  }

  if (!call.player_in_id || !call.player_out_id) {
    throw new Error("Chiamata senza player_in_id o player_out_id.");
  }

  const nowIso = new Date().toISOString();

  // 1. assegna il giocatore preso alla squadra vincitrice
  const { data: incomingPlayer, error: incomingError } = await supabase
    .from("players")
    .update({
      owner_team_id: winningTeamId,
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

  // 2. svincola il giocatore in uscita, solo se appartiene davvero alla squadra vincitrice
  const { data: outgoingPlayer, error: outgoingError } = await supabase
    .from("players")
    .update({
      owner_team_id: null,
      updated_at: nowIso
    })
    .eq("id", call.player_out_id)
    .eq("owner_team_id", winningTeamId)
    .select("id, name")
    .maybeSingle();

  if (outgoingError) {
    throw outgoingError;
  }

  if (!outgoingPlayer) {
    throw new Error("Il giocatore da svincolare non appartiene più alla squadra vincitrice.");
  }
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

  for (const playerKey in callsByPlayer) {
    const entries = callsByPlayer[playerKey];

    entries.sort((a, b) => {
      return a.order.priority_number - b.order.priority_number;
    });

    const winner = entries[0];
    const losers = entries.slice(1);

    try {
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
  }
} catch (err) {
  console.error("Errore aggiornamento rosa waiver:", err);
  alert(`Errore aggiornamento rosa: ${err.message || err}`);
  return;
}
  }

  alert(`Risultati slot ${normalizedSlot} calcolati.`);

 await loadMyOwnedPlayers();
await loadFreeAgents();
await loadAllCalls();
await loadMyWaiverCalls();
await renderPublicWaiverOrder();;
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

  setInputDateTime(slot1OpenInput, slot1Open);
  setInputDateTime(slot1CloseInput, slot1Close);

  setInputDateTime(slot2OpenInput, slot2Open);
  setInputDateTime(slot2CloseInput, slot2Close);

  if (slot1SOpenInput) slot1SOpenInput.value = "";
  if (slot1SCloseInput) slot1SCloseInput.value = "";
  if (slot2SOpenInput) slot2SOpenInput.value = "";
  if (slot2SCloseInput) slot2SCloseInput.value = "";

  setSettingsMessage(
    "Venerdì standard impostato: Slot 1 da martedì 00:00 a venerdì 15:00; Slot 2 da venerdì 15:01 a venerdì 16:00. Ricordati di salvare."
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

  setInputDateTime(slot1OpenInput, slot1Open);
  setInputDateTime(slot1CloseInput, slot1Close);

  setInputDateTime(slot1SOpenInput, slot1SOpen);
  setInputDateTime(slot1SCloseInput, slot1SClose);

  setInputDateTime(slot2OpenInput, slot2Open);
  setInputDateTime(slot2CloseInput, slot2Close);

  setInputDateTime(slot2SOpenInput, slot2SOpen);
  setInputDateTime(slot2SCloseInput, slot2SClose);

  setSettingsMessage(
    "Venerdì playoff impostato: Slot 1 da martedì 00:00 a venerdì 15:00; Slot 1S 15:01-15:30; Slot 2 15:31-16:00; Slot 2S 16:01-16:30. Ricordati di salvare."
  );
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

await loadMyOwnedPlayers();
await loadMyWaiverCalls();
await loadFreeAgents();

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
   await renderPublicWaiverOrder();

  if (currentUserEmail === "tringali0511@gmail.com") {
    adminPanel.style.display = "block";
    renderWaiverOrderAdmin();
    await loadAllCalls();
  }

await loadMyOwnedPlayers();
await loadMyWaiverCalls();
await loadFreeAgents();
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
