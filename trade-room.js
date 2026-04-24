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
  PROFILE_TEAM_COL: "team_id"
};

let currentUser = null;
let currentTeamId = null;
let currentTeamName = null;
let currentTeamConference = null;
let currentDraftName = CONFIG.DEFAULT_DRAFT_NAME;

let allPicks = [];
let allPickedPlayers = [];
let allTeams = [];
let usedPickNumbers = new Set();

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

const receivedTradesBox = document.getElementById("receivedTradesBox");
const sentTradesBox = document.getElementById("sentTradesBox");
const completedTradesBox = document.getElementById("completedTradesBox");

/* ========= INIT ========= */

document.addEventListener("DOMContentLoaded", initTradeRoom);

async function initTradeRoom() {
  setupNavbar();
  setupEvents();

  const ok = await checkUser();
  if (!ok) return;

  await loadTeams();
  await loadAssetsForTrade();

  renderTeamSelect();
  renderMyAssets();

  await loadTrades();

  tradeApp.style.display = "block";
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
      e.target.classList.contains("their-player-checkbox")
    ) {
      updateAssetSummaries();
    }
  });
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
    loadPickedPlayers()
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

/* ========= RENDER FORM ========= */

function renderTeamSelect() {
  toTeamSelect.innerHTML = `<option value="">Seleziona squadra...</option>`;

  allTeams
    .filter(team => team[CONFIG.TEAM_ID_COL] !== currentTeamId)
    .filter(team => team.conference === currentTeamConference)
    .forEach(team => {
      const option = document.createElement("option");
      option.value = team[CONFIG.TEAM_ID_COL];
      option.textContent = team[CONFIG.TEAM_NAME_COL];
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

  myPicksBox.innerHTML = renderAssetGroup({
    title: "Pick disponibili",
    emptyText: "Nessuna pick disponibile.",
    items: myPicks,
    inputClass: "my-pick-checkbox",
    getValue: pick => pick[CONFIG.PICK_NUMBER_COL],
    getLabel: formatPickLabel
  }) + renderAssetGroup({
    title: "Giocatori già chiamati",
    emptyText: "Nessun giocatore ancora chiamato.",
    items: myPlayers,
    inputClass: "my-player-checkbox",
    getValue: player => player[CONFIG.PICKS_ID_COL],
    getLabel: formatPlayerLabel
  });

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

  theirPicksBox.innerHTML = renderAssetGroup({
    title: `Pick disponibili di ${selectedTeamName}`,
    emptyText: `Nessuna pick disponibile per ${selectedTeamName}.`,
    items: theirPicks,
    inputClass: "their-pick-checkbox",
    getValue: pick => pick[CONFIG.PICK_NUMBER_COL],
    getLabel: formatPickLabel
  }) + renderAssetGroup({
    title: `Giocatori già chiamati di ${selectedTeamName}`,
    emptyText: `Nessun giocatore ancora chiamato da ${selectedTeamName}.`,
    items: theirPlayers,
    inputClass: "their-player-checkbox",
    getValue: player => player[CONFIG.PICKS_ID_COL],
    getLabel: formatPlayerLabel
  });

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

function getTeamName(teamId) {
  const team = allTeams.find(t => t[CONFIG.TEAM_ID_COL] === teamId);
  return team ? team[CONFIG.TEAM_NAME_COL] : teamId;
}

/* ========= INVIO PROPOSTA ========= */

async function sendTradeProposal() {
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

  const myAssetCount = mySelectedPickNumbers.length + mySelectedPlayerIds.length;
  const theirAssetCount = theirSelectedPickNumbers.length + theirSelectedPlayerIds.length;

  if (!myAssetCount || !theirAssetCount) {
    showMessage("La trade deve contenere almeno un asset per entrambe le squadre.", "error");
    return;
  }

  if (myAssetCount !== theirAssetCount) {
    showMessage("Trade non valida: il numero di asset deve essere uguale per entrambe le squadre.", "error");
    return;
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
      theirSelectedPlayerIds
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

    showMessage("Proposta inviata correttamente.", "success");

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
  theirSelectedPlayerIds
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
    .eq("draft_name", currentDraftName)
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
    .eq("draft_name", currentDraftName)
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
    .eq("draft_name", currentDraftName)
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
  const ok = confirm("Confermi di voler accettare questa trade?");
  if (!ok) return;

  try {
    const { data: proposal, error: proposalError } = await supabase
      .from("trade_proposals")
      .select("*")
      .eq("id", proposalId)
      .eq("status", "pending")
      .maybeSingle();

    if (proposalError) throw proposalError;

    if (!proposal) {
      alert("La proposta non è più disponibile.");
      await refreshAll();
      return;
    }

    if (proposal.to_team !== currentTeamId) {
      alert("Puoi accettare solo le trade ricevute dalla tua squadra.");
      return;
    }

    const { data: assets, error: assetsError } = await supabase
      .from("trade_assets")
      .select("*")
      .eq("proposal_id", proposalId);

    if (assetsError) throw assetsError;

    const fromAssets = (assets || []).filter(a => a.side === "from");
    const toAssets = (assets || []).filter(a => a.side === "to");

    if (!fromAssets.length || !toAssets.length || fromAssets.length !== toAssets.length) {
      alert("Trade bloccata: la proposta non è bilanciata.");
      await cancelProposalBySystem(proposalId);
      await refreshAll();
      return;
    }

    await loadAssetsForTrade();

    const allPickAssets = (assets || []).filter(a => a.asset_type === "pick");
    const hasUsedPick = allPickAssets.some(asset =>
      usedPickNumbers.has(Number(asset.asset_id))
    );

    if (hasUsedPick) {
      alert("Trade bloccata: una o più pick sono già state usate nel draft.");
      await cancelProposalBySystem(proposalId);
      await refreshAll();
      return;
    }

    const ownershipOk = checkOwnershipBeforeTrade(proposal, fromAssets, toAssets);

    if (!ownershipOk) {
      alert("Trade bloccata: uno o più asset non appartengono più alla squadra prevista.");
      await cancelProposalBySystem(proposalId);
      await refreshAll();
      return;
    }

    for (const asset of fromAssets) {
      await moveAssetToTeam(asset, proposal.to_team, proposal.draft_name || currentDraftName);
    }

    for (const asset of toAssets) {
      await moveAssetToTeam(asset, proposal.from_team, proposal.draft_name || currentDraftName);
    }

    const { error: updateError } = await supabase
      .from("trade_proposals")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString()
      })
      .eq("id", proposalId);

    if (updateError) throw updateError;

    alert("Trade accettata. Pick e giocatori sono stati aggiornati.");
    await refreshAll();
  } catch (err) {
    console.error(err);
    alert("Errore durante l’accettazione della trade.");
  }
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

  const myCount = myPickCount + myPlayerCount;
  const theirCount = theirPickCount + theirPlayerCount;

  if (myPicksSummary) {
    myPicksSummary.textContent = myCount
      ? `${myCount} asset selezionat${myCount > 1 ? "i" : "o"} (${myPickCount} pick, ${myPlayerCount} giocatori)`
      : "Seleziona i tuoi asset";
  }

  if (theirPicksSummary) {
    const selectedTeamId = toTeamSelect.value;
    const selectedTeamName = selectedTeamId ? getTeamName(selectedTeamId) : "";

    theirPicksSummary.textContent = theirCount
      ? `${theirCount} asset selezionat${theirCount > 1 ? "i" : "o"} (${theirPickCount} pick, ${theirPlayerCount} giocatori)`
      : selectedTeamId
        ? `Asset disponibili di ${selectedTeamName}`
        : "Seleziona prima una squadra";
  }
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
