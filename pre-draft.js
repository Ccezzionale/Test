import { supabase } from "./supabase.js";

let currentUser = null;
let currentProfile = null;
let currentTeam = null;
let keeperSettings = null;
let roster = [];
let selections = [];
let eligiblePlayers = [];
let previousKeeperSelections = [];

const TYPE_LABELS = {
  FP: "Franchise Player",
  U21_KEEPER: "Under 21 confermato",
  RFA: "Restricted Free Agent"
};

const TYPE_BADGES = {
  FP: "badge-fp",
  U21_KEEPER: "badge-u21-keeper",
  RFA: "badge-rfa"
};

document.addEventListener("DOMContentLoaded", initPreDraftPage);

async function initPreDraftPage() {
  bindEvents();

  try {
    setStatus("Caricamento dati Pre-Draft...");

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;

    currentUser = sessionData?.session?.user || null;

    if (!currentUser) {
      setStatus("Devi effettuare il login per accedere alle scelte Pre-Draft.");
      hideMainSections();
      return;
    }

    await loadProfileAndTeam();
    await loadKeeperSettings();
    await loadRoster();
    await loadEligiblePlayers();
    await loadSelections();
    await loadPreviousKeeperSelections();

    renderPage();

    if (isAdmin()) {
      await loadAdminSummary();
    }

  } catch (error) {
    console.error("Errore Pre-Draft:", error);
    setStatus("Errore nel caricamento della pagina Pre-Draft.");
  }
}

function bindEvents() {
  document.getElementById("btn-save-fp")?.addEventListener("click", () => saveSelection("FP"));
  document.getElementById("btn-save-u21")?.addEventListener("click", () => saveSelection("U21_KEEPER"));
  document.getElementById("btn-save-rfa")?.addEventListener("click", () => saveSelection("RFA"));
  document.getElementById("btn-save-settings")?.addEventListener("click", saveKeeperSettings);
  document.getElementById("btn-scan-conflicts")?.addEventListener("click", scanKeeperConflicts);
  document.getElementById("btn-apply-predraft")?.addEventListener("click", applyPreDraftToDraft);
}

async function applyPreDraftToDraft() {
  if (!isAdmin()) return;

  const ok = confirm(
    "Vuoi applicare definitivamente il Pre-Draft al Draft? Verranno bruciati i round FP/U21 e il Pre-Draft verrà chiuso."
  );

  if (!ok) return;

  const statusEl = document.getElementById("admin-apply-status");
  if (statusEl) statusEl.textContent = "⏳ Applicazione Pre-Draft in corso...";

  const { data, error } = await supabase.rpc("apply_predraft_if_ready");

  if (error) {
    console.error(error);
    if (statusEl) statusEl.textContent = `❌ ${error.message}`;
    alert(error.message || "Errore durante l'applicazione Pre-Draft.");
    return;
  }

  if (statusEl) {
    statusEl.textContent = "✅ Pre-Draft applicato correttamente al Draft.";
  }

  console.log("APPLY PREDRAFT RESULT:", data);

  await loadKeeperSettings();
  await loadSelections();
  renderPage();

  if (isAdmin()) {
    await loadAdminSummary();
  }
}

async function loadProfileAndTeam() {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, team_id, role")
    .eq("id", currentUser.id)
    .single();

  if (profileError) throw profileError;
  currentProfile = profile;

  if (!currentProfile?.team_id) {
    throw new Error("Profilo senza team_id");
  }

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id, name, conference")
    .eq("id", currentProfile.team_id)
    .single();

  if (teamError) throw teamError;
  currentTeam = team;
}

async function loadKeeperSettings() {
  const { data, error } = await supabase
    .from("keeper_settings")
    .select("id, season, is_open, open_at, close_at, applied_at, is_applied")
    .eq("id", 1)
    .single();

  if (error) throw error;
  keeperSettings = data;
}

async function loadRoster() {
  const snapshotSeason = Number(keeperSettings.season) - 1;

  const { data, error } = await supabase
    .from("season_roster_snapshots")
    .select(`
      id,
      season,
      team_id,
      player_id,
      player_name,
      role,
      role_mantra,
      serie_a_team,
      quotation,
      is_u21,
      is_fp,
      players (
        id,
        name,
        role,
        role_mantra,
        serie_a_team,
        quotation,
        is_u21,
        is_fp
      )
    `)
    .eq("team_id", currentTeam.id)
    .eq("season", snapshotSeason)
    .order("role", { ascending: true })
    .order("player_name", { ascending: true });

  if (error) throw error;

  roster = (data || []).map(row => {
    const linkedPlayer = row.players || {};

    return {
      snapshot_id: row.id,
      id: row.player_id,
      name: row.player_name || linkedPlayer.name || "",
      role: row.role || linkedPlayer.role || "",
      role_mantra: row.role_mantra || linkedPlayer.role_mantra || "",
      serie_a_team: row.serie_a_team || linkedPlayer.serie_a_team || "",
      quotation: row.quotation ?? linkedPlayer.quotation ?? "",
      is_u21: !!row.is_u21,
      is_fp: !!row.is_fp,
      snapshot_season: row.season
    };
  });
}

async function loadEligiblePlayers() {
  const { data, error } = await supabase
    .from("predraft_eligible_players")
    .select(`
      id,
      season,
      team_id,
      player_id,
      can_be_fp,
      can_be_rfa
    `)
    .eq("season", keeperSettings.season)
    .eq("team_id", currentTeam.id);

  if (error) throw error;

  eligiblePlayers = data || [];
}

async function loadPreviousKeeperSelections() {
  const previousSeason = Number(keeperSettings.season) - 1;

  const { data, error } = await supabase
    .from("keeper_selections")
    .select(`
      id,
      season,
      team_id,
      player_id,
      selection_type,
      confirmation_year,
      cost_round,
      actual_paid_round,
      status
    `)
    .eq("season", previousSeason)
    .eq("team_id", currentTeam.id)
    .eq("status", "active")
    .in("selection_type", ["FP", "U21_KEEPER"]);

  if (error) throw error;

  previousKeeperSelections = data || [];
}

async function loadSelections() {
  const { data, error } = await supabase
    .from("keeper_selections")
    .select(`
      id,
      season,
      team_id,
      player_id,
      selection_type,
      confirmation_year,
      cost_round,
      actual_paid_round,
      status,
      notes,
      players (
        id,
        name,
        role,
        role_mantra,
        serie_a_team,
        quotation,
        is_u21,
        is_fp
      )
    `)
    .eq("season", keeperSettings.season)
    .eq("team_id", currentTeam.id)
    .eq("status", "active");

  if (error) throw error;
  selections = data || [];
}

function renderPage() {
  setStatus(
    keeperSettings.is_open
      ? `🟢 Modulo aperto · Stagione ${keeperSettings.season}`
      : `🔒 Modulo chiuso · Stagione ${keeperSettings.season}`
  );

  document.getElementById("keeper-team-box")?.classList.remove("hidden");

  const teamNameEl = document.getElementById("keeper-team-name");
  const seasonLabelEl = document.getElementById("keeper-season-label");

  if (teamNameEl) teamNameEl.textContent = currentTeam.name;
  if (seasonLabelEl) {
    seasonLabelEl.textContent = `${currentTeam.conference || "Conference N/A"} · Stagione ${keeperSettings.season}`;
  }

  const closedBox = document.getElementById("keeper-closed-box");
  const selectionsBox = document.getElementById("keeper-selections");

  if (keeperSettings.is_open || isAdmin()) {
    closedBox?.classList.add("hidden");
    selectionsBox?.classList.remove("hidden");
  } else {
    closedBox?.classList.remove("hidden");
    selectionsBox?.classList.add("hidden");
  }

  renderSelects();
  renderCurrentSelections();
  renderRoster();

  if (isAdmin()) {
    renderAdminControls();
    document.getElementById("keeper-admin")?.classList.remove("hidden");
  }
}

function renderSelects() {
  fillSelect("select-fp", getEligiblePlayers("FP"), "Scegli Franchise Player");
  fillSelect("select-u21", getEligiblePlayers("U21_KEEPER"), "Scegli Under 21 confermato");
  fillSelect("select-rfa", getEligiblePlayers("RFA"), "Scegli Restricted Free Agent");

  const disabled = !keeperSettings.is_open && !isAdmin();

  [
    "select-fp",
    "select-u21",
    "select-rfa",
    "btn-save-fp",
    "btn-save-u21",
    "btn-save-rfa"
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.disabled = disabled;
  });
}

function fillSelect(selectId, players, placeholder) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const type =
    selectId === "select-fp" ? "FP" :
    selectId === "select-u21" ? "U21_KEEPER" :
    "RFA";

  select.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder;
  select.appendChild(empty);

  players.forEach(player => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = formatPlayerOption(player, type);
    select.appendChild(option);
  });
}

function getEligiblePlayers(type) {
  const alreadySelectedOtherTypes = new Set(
    selections
      .filter(s => s.selection_type !== type)
      .map(s => s.player_id)
  );

  return roster.filter(player => {
    if (alreadySelectedOtherTypes.has(player.id)) return false;

    if (type === "FP") {
      return isEligibleFP(player);
    }

    if (type === "U21_KEEPER") {
      return isEligibleU21Keeper(player);
    }

    if (type === "RFA") {
      return isEligibleRFA(player);
    }

    return false;
  });
}

function getPreviousSameTeamKeeper(playerId, type) {
  return previousKeeperSelections.find(s =>
    s.player_id === playerId &&
    s.selection_type === type &&
    s.team_id === currentTeam.id
  ) || null;
}

function getConfirmationYear(playerId, type) {
  const previous = getPreviousSameTeamKeeper(playerId, type);
  return previous ? 2 : 1;
}

function getDefaultCostRound(type, confirmationYear = 1) {
  if (type === "FP") {
    return confirmationYear >= 2 ? 4 : 8;
  }

  if (type === "U21_KEEPER") {
    return 15;
  }

  return null;
}

function isEligibleFP(player) {
  const isNormallyEligible = eligiblePlayers.some(e =>
    e.player_id === player.id &&
    e.can_be_fp === true
  );

  const isSecondYearFP = !!getPreviousSameTeamKeeper(player.id, "FP");

  return isNormallyEligible || isSecondYearFP;
}

async function scanKeeperConflicts() {
  if (!isAdmin()) return;

  const container = document.getElementById("admin-conflicts");
  if (container) container.innerHTML = "⏳ Ricerca conflitti in corso...";

  const { error } = await supabase.rpc("mark_keeper_conflicts", {
    p_season: keeperSettings.season
  });

  if (error) {
    console.error(error);
    if (container) container.innerHTML = "Errore nella ricerca conflitti.";
    return;
  }

  await loadAdminSummary();
  await loadAdminConflicts();
}

async function loadAdminConflicts() {
  const container = document.getElementById("admin-conflicts");
  if (!container) return;

  const { data, error } = await supabase
    .from("keeper_selections")
    .select(`
      id,
      season,
      team_id,
      player_id,
      selection_type,
      conflict_group_id,
      conflict_status,
      admin_approved,
      teams (
        name,
        conference
      ),
      players (
        name,
        role,
        role_mantra,
        serie_a_team,
        quotation
      )
    `)
    .eq("season", keeperSettings.season)
    .eq("status", "active")
    .eq("conflict_status", "pending")
    .order("selection_type", { ascending: true });

  if (error) {
    console.error(error);
    container.innerHTML = "Errore nel caricamento dei conflitti.";
    return;
  }

  if (!data?.length) {
    container.innerHTML = "<p>✅ Nessun conflitto pending.</p>";
    return;
  }

  const groups = {};

  data.forEach(row => {
    const groupId = row.conflict_group_id || "no-group";
    if (!groups[groupId]) groups[groupId] = [];
    groups[groupId].push(row);
  });

  container.innerHTML = Object.entries(groups).map(([groupId, rows]) => {
    const first = rows[0];
    const playerName = first.players?.name || "Giocatore";
    const conference = first.teams?.conference || "-";
    const role = first.players?.role || first.players?.role_mantra || "-";
    const serieA = first.players?.serie_a_team || "-";

    return `
      <div class="predraft-card conflict-card">
        <h4 class="conflict-title">
          ⚠️ Conflitto: ${escapeHtml(playerName)}
        </h4>

        <p class="conflict-meta">
          ${escapeHtml(role)} · ${escapeHtml(serieA)} · ${escapeHtml(conference)}
        </p>

        <div class="conflict-teams">
          ${rows.map(row => {
            const rowTypeLabel = TYPE_LABELS[row.selection_type] || row.selection_type;
            const rowBadgeClass = TYPE_BADGES[row.selection_type] || "badge-muted";
            const teamName = row.teams?.name || "Squadra";

            return `
              <div class="conflict-team-option">
                <div class="conflict-team-info">
                  <strong>${escapeHtml(teamName)}</strong>
                  <span class="badge ${rowBadgeClass}">
                    ${escapeHtml(rowTypeLabel)}
                  </span>
                </div>

                <button
                  class="predraft-btn"
                  type="button"
                  data-resolve-conflict="${escapeHtml(groupId)}"
                  data-winner-selection="${escapeHtml(row.id)}"
                >
                  Assegna a ${escapeHtml(teamName)}
                </button>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll("[data-resolve-conflict]").forEach(button => {
    button.addEventListener("click", async () => {
      const conflictGroupId = button.dataset.resolveConflict;
      const winnerSelectionId = button.dataset.winnerSelection;
      await resolveKeeperConflict(conflictGroupId, winnerSelectionId);
    });
  });
}

async function resolveKeeperConflict(conflictGroupId, winnerSelectionId) {
  if (!isAdmin()) return;

  const ok = confirm("Vuoi assegnare questo giocatore a questa squadra?");
  if (!ok) return;

  const { error } = await supabase.rpc("resolve_keeper_conflict", {
    p_conflict_group_id: conflictGroupId,
    p_winner_selection_id: winnerSelectionId
  });

  if (error) {
    console.error(error);
    alert("Errore nella risoluzione del conflitto.");
    return;
  }

  alert("Conflitto risolto.");

  await loadAdminSummary();
  await loadAdminConflicts();
}

function isEligibleU21Keeper(player) {
  const role = String(player.role || player.role_mantra || "").toUpperCase();

  if (role === "P") return false;

  const isNormallyEligible = !!player.is_u21;

  const isSecondYearU21Keeper = !!getPreviousSameTeamKeeper(player.id, "U21_KEEPER");

  return isNormallyEligible || isSecondYearU21Keeper;
}

function isEligibleRFA(player) {
  return eligiblePlayers.some(e =>
    e.player_id === player.id &&
    e.can_be_rfa === true
  );
}

function formatPlayerOption(player, type = null) {
  const role = player.role || player.role_mantra || "-";
  const team = player.serie_a_team || "-";
  const quotation = player.quotation ?? "-";

  const badges = [];

  if (type === "FP" && getPreviousSameTeamKeeper(player.id, "FP")) {
    badges.push("2° anno FP · costa R4");
  }

  if (type === "U21_KEEPER" && getPreviousSameTeamKeeper(player.id, "U21_KEEPER")) {
    badges.push("2° anno U21");
  }

  const badgeText = badges.length ? ` · ${badges.join(" · ")}` : "";

  return `${player.name} · ${role} · ${team} · Q ${quotation}${badgeText}`;
}

function renderCurrentSelections() {
  renderCurrentSelection("FP", "current-fp");
  renderCurrentSelection("U21_KEEPER", "current-u21");
  renderCurrentSelection("RFA", "current-rfa");
}

function renderCurrentSelection(type, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const selection = selections.find(s => s.selection_type === type);

  if (!selection) {
    container.innerHTML = `<p>Nessuna scelta salvata.</p>`;
    return;
  }

  const player = selection.players;
  const canEdit = keeperSettings.is_open || isAdmin();

  container.innerHTML = `
    <div class="selection-pill">
      <div>
        <span class="selection-name">${escapeHtml(player?.name || "Giocatore")}</span>
        <span class="selection-meta">
         ${TYPE_LABELS[type]} · ${escapeHtml(player?.role || player?.role_mantra || "-")}
· ${escapeHtml(player?.serie_a_team || "-")}
· Anno ${selection.confirmation_year || 1}
${selection.actual_paid_round ? `· Round ${selection.actual_paid_round}` : ""}
        </span>
      </div>

      ${
        canEdit
          ? `<button class="predraft-btn danger" data-remove-selection="${selection.id}">Rimuovi</button>`
          : ""
      }
    </div>
  `;

  container.querySelector("[data-remove-selection]")?.addEventListener("click", async () => {
    await removeSelection(selection.id);
  });
}

function renderRoster() {
  const container = document.getElementById("keeper-roster");
  if (!container) return;

if (!roster.length) {
  const snapshotSeason = Number(keeperSettings.season) - 1;

  container.innerHTML = `
    <p>
      Nessuna rosa finale trovata per <strong>${escapeHtml(currentTeam.name)}</strong>
      nella stagione ${snapshotSeason}.
    </p>
    <p>
      Il Pre-Draft ${keeperSettings.season} legge le rose finali ${snapshotSeason}.
    </p>
  `;
  return;
}

  const selectionByPlayerId = {};
  selections.forEach(s => {
    selectionByPlayerId[s.player_id] = s.selection_type;
  });

  const u21CountForRoster = roster.filter(player => {
    const selectedType = selectionByPlayerId[player.id];
    return player.is_u21 && selectedType !== "U21_KEEPER";
  }).length;

  const u21KeeperCount = roster.filter(player => {
    const selectedType = selectionByPlayerId[player.id];
    return selectedType === "U21_KEEPER";
  }).length;

  container.innerHTML = `
    <div class="roster-summary">
      <span class="badge ${u21CountForRoster >= 4 ? "badge-u21" : "badge-rfa"}">
        U21 obbligatori: ${u21CountForRoster}/4
      </span>
      <span class="badge badge-u21-keeper">
        U21 confermati: ${u21KeeperCount}
      </span>
    </div>

    <table>
      <thead>
        <tr>
          <th>Ruolo</th>
          <th>Nome</th>
          <th>Squadra</th>
          <th>Quotazione</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${roster.map(player => {
          const type = selectionByPlayerId[player.id];

          return `
            <tr>
              <td>${escapeHtml(player.role || player.role_mantra || "-")}</td>
              <td>${escapeHtml(player.name || "-")}</td>
              <td>${escapeHtml(player.serie_a_team || "-")}</td>
              <td>${escapeHtml(player.quotation ?? "-")}</td>
              <td>
                ${player.is_fp ? `<span class="badge badge-fp">FP attuale</span>` : ""}
                ${
                  player.is_u21 && type !== "U21_KEEPER"
                    ? `<span class="badge badge-u21">U21 rosa</span>`
                    : ""
                }
                ${
                  type
                    ? `<span class="badge ${TYPE_BADGES[type]}">${TYPE_LABELS[type]}</span>`
                    : ""
                }
                ${
                  !player.is_fp && !player.is_u21 && !type
                    ? `<span class="badge badge-muted">Standard</span>`
                    : ""
                }
              </td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
  `;
}

async function saveSelection(type) {
  if (!keeperSettings.is_open && !isAdmin()) {
    alert("Il modulo Pre-Draft è chiuso.");
    return;
  }

  const selectId =
    type === "FP" ? "select-fp" :
    type === "U21_KEEPER" ? "select-u21" :
    "select-rfa";

  const select = document.getElementById(selectId);
  const playerId = select?.value;

  if (!playerId) {
    alert("Seleziona prima un giocatore.");
    return;
  }

  const player = roster.find(p => p.id === playerId);

  if (!player) {
    alert("Giocatore non trovato nella tua rosa.");
    return;
  }

  if (type === "FP" && !isEligibleFP(player)) {
    alert("Questo giocatore non risulta eleggibile come Franchise Player.");
    return;
  }

  if (type === "U21_KEEPER" && !isEligibleU21Keeper(player)) {
    alert("Questo giocatore non risulta eleggibile come Under 21 confermato.");
    return;
  }

  const confirmationYear = getConfirmationYear(playerId, type);
const costRound = getDefaultCostRound(type, confirmationYear);

const payload = {
  season: keeperSettings.season,
  team_id: currentTeam.id,
  player_id: playerId,
  selection_type: type,
  confirmation_year: confirmationYear,
  cost_round: costRound,
  actual_paid_round: costRound,
  status: "active",
  created_by: currentUser.id,
  admin_approved: true,
  conflict_status: "none",
  conflict_group_id: null
};

  const existing = selections.find(s => s.selection_type === type);

  let result;

  if (existing) {
    result = await supabase
      .from("keeper_selections")
.update({
  player_id: playerId,
  confirmation_year: confirmationYear,
  cost_round: costRound,
  actual_paid_round: costRound,
  status: "active",
  notes: null,
  admin_approved: true,
  conflict_status: "none",
  conflict_group_id: null
})
      .eq("id", existing.id);
  } else {
    result = await supabase
      .from("keeper_selections")
      .insert(payload);
  }

  if (result.error) {
    console.error(result.error);
    alert("Errore nel salvataggio della scelta.");
    return;
  }

  await loadSelections();
  renderPage();

  if (isAdmin()) {
    await loadAdminSummary();
  }
}

async function removeSelection(selectionId) {
  if (!keeperSettings.is_open && !isAdmin()) {
    alert("Il modulo Pre-Draft è chiuso.");
    return;
  }

  const ok = confirm("Vuoi rimuovere questa scelta?");
  if (!ok) return;

  const { error } = await supabase
    .from("keeper_selections")
    .delete()
    .eq("id", selectionId);

  if (error) {
    console.error(error);
    alert("Errore nella rimozione della scelta.");
    return;
  }

  await loadSelections();
  renderPage();

  if (isAdmin()) {
    await loadAdminSummary();
  }
}

function renderAdminControls() {
  const seasonInput = document.getElementById("admin-season");
  const openInput = document.getElementById("admin-is-open");

  if (seasonInput) seasonInput.value = keeperSettings.season;
  if (openInput) openInput.checked = !!keeperSettings.is_open;
}

async function saveKeeperSettings() {
  if (!isAdmin()) return;

  const season = Number(document.getElementById("admin-season")?.value);
  const isOpen = !!document.getElementById("admin-is-open")?.checked;

  if (!season || season < 2026) {
    alert("Stagione non valida.");
    return;
  }

  const { error } = await supabase
    .from("keeper_settings")
    .update({
      season,
      is_open: isOpen
    })
    .eq("id", 1);

  if (error) {
    console.error(error);
    alert("Errore nel salvataggio impostazioni.");
    return;
  }

  await loadKeeperSettings();
  await loadSelections();
  renderPage();

  if (isAdmin()) {
    await loadAdminSummary();
  }

  alert("Impostazioni Pre-Draft salvate.");
}

async function loadAdminSummary() {
  const container = document.getElementById("admin-summary");
  if (!container) return;

  const { data, error } = await supabase
    .from("keeper_selections")
    .select(`
      id,
      season,
      selection_type,
      status,
      teams (
        name,
        conference
      ),
      players (
        name,
        role,
        role_mantra,
        serie_a_team,
        quotation
      )
    `)
    .eq("season", keeperSettings.season)
    .eq("status", "active")
    .order("selection_type", { ascending: true });

  if (error) {
    console.error(error);
    container.innerHTML = "Errore nel caricamento del riepilogo.";
    return;
  }

  if (!data?.length) {
    container.innerHTML = "<p>Nessuna scelta registrata.</p>";
    await loadAdminConflicts(); // ✅ qui, così aggiorna comunque i conflitti
    return;
  }

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Squadra</th>
          <th>Conference</th>
          <th>Tipo</th>
          <th>Giocatore</th>
          <th>Ruolo</th>
          <th>Serie A</th>
          <th>Q</th>
        </tr>
      </thead>
      <tbody>
        ${data.map(row => `
          <tr>
            <td>${escapeHtml(row.teams?.name || "-")}</td>
            <td>${escapeHtml(row.teams?.conference || "-")}</td>
            <td>${escapeHtml(TYPE_LABELS[row.selection_type] || row.selection_type)}</td>
            <td>${escapeHtml(row.players?.name || "-")}</td>
            <td>${escapeHtml(row.players?.role || row.players?.role_mantra || "-")}</td>
            <td>${escapeHtml(row.players?.serie_a_team || "-")}</td>
            <td>${escapeHtml(row.players?.quotation ?? "-")}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  await loadAdminConflicts(); // ✅ QUI
}

function isAdmin() {
  return String(currentProfile?.role || "").toLowerCase() === "admin";
}

function setStatus(message) {
  const el = document.getElementById("keeper-status");
  if (el) el.textContent = message;
}

function hideMainSections() {
  document.getElementById("keeper-team-box")?.classList.add("hidden");
  document.getElementById("keeper-selections")?.classList.add("hidden");
  document.getElementById("keeper-admin")?.classList.add("hidden");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
