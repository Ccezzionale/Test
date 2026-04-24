import { supabase, supabaseUrl, supabaseKey } from './supabase.js';

/* ===============================
   TRADE ROOM - LEGA DEGLI EROI
   Versione 1: scambio pick tra squadre
   Struttura Supabase:
   - draft_order: draft_name, pick_number, team_id
   - teams: id, name
   - profiles: email, team_id
================================ */

const CONFIG = {
  DRAFT_TABLE: "draft_order",
  DRAFT_NAME: "Draft Championship",

  PICK_NUMBER_COL: "pick_number",
  PICK_OWNER_COL: "team_id",
  DRAFT_NAME_COL: "draft_name",

  PICKS_TABLE: "draft_picks",
  PICKS_DRAFT_NAME_COL: "draft_name",
  PICKS_PICK_NUMBER_COL: "pick_number",

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

let allPicks = [];
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
  await loadPicks();

  renderTeamSelect();
  renderMyPicks();

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
      renderTheirPicks();
      updatePickSummaries();
    });
  }

  if (sendTradeBtn) {
    sendTradeBtn.addEventListener("click", sendTradeProposal);
  }

  document.addEventListener("change", (e) => {
    if (
      e.target.classList.contains("my-pick-checkbox") ||
      e.target.classList.contains("their-pick-checkbox")
    ) {
      updatePickSummaries();
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

  userInfo.textContent = `Accesso effettuato come ${email}`;
  myTeamLabel.textContent = currentTeamName;

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

async function loadPicks() {
  const { data: orderData, error: orderError } = await supabase
    .from(CONFIG.DRAFT_TABLE)
    .select("*")
    .eq(CONFIG.DRAFT_NAME_COL, CONFIG.DRAFT_NAME)
    .order(CONFIG.PICK_NUMBER_COL, { ascending: true });

  if (orderError) {
    console.error(orderError);
    myPicksBox.textContent = "Errore nel caricamento delle pick.";
    return;
  }

  const { data: usedData, error: usedError } = await supabase
    .from(CONFIG.PICKS_TABLE)
    .select(CONFIG.PICKS_PICK_NUMBER_COL)
    .eq(CONFIG.PICKS_DRAFT_NAME_COL, CONFIG.DRAFT_NAME);

  if (usedError) {
    console.error(usedError);
    myPicksBox.textContent = "Errore nel controllo delle pick già usate.";
    return;
  }

  usedPickNumbers = new Set(
    (usedData || []).map(row => Number(row[CONFIG.PICKS_PICK_NUMBER_COL]))
  );

  allPicks = (orderData || []).filter(pick => {
    const pickNumber = Number(pick[CONFIG.PICK_NUMBER_COL]);
    return !usedPickNumbers.has(pickNumber);
  });
}

/* ========= RENDER FORM ========= */

function renderTeamSelect() {
  toTeamSelect.innerHTML = `<option value="">Seleziona squadra...</option>`;

  allTeams
    .filter(team => team[CONFIG.TEAM_ID_COL] !== currentTeamId)
    .forEach(team => {
      const option = document.createElement("option");
      option.value = team[CONFIG.TEAM_ID_COL];
      option.textContent = team[CONFIG.TEAM_NAME_COL];
      toTeamSelect.appendChild(option);
    });
}

function renderMyPicks() {
  const myPicks = allPicks.filter(
    pick => pick[CONFIG.PICK_OWNER_COL] === currentTeamId
  );

  if (!myPicks.length) {
    myPicksBox.innerHTML = `<p>Nessuna pick disponibile.</p>`;
    return;
  }

  myPicksBox.innerHTML = myPicks.map(pick => {
    return `
      <label class="pick-choice">
        <input
          type="checkbox"
          class="my-pick-checkbox"
          value="${pick[CONFIG.PICK_NUMBER_COL]}"
        />
        ${formatPickLabel(pick)}
      </label>
    `;
  }).join("");
   
  updatePickSummaries();
}

function renderTheirPicks() {
  const selectedTeamId = toTeamSelect.value;

  if (!selectedTeamId) {
    theirPicksBox.innerHTML = "Seleziona prima una squadra...";
    return;
  }

  const theirPicks = allPicks.filter(
    pick => pick[CONFIG.PICK_OWNER_COL] === selectedTeamId
  );

  const selectedTeamName = getTeamName(selectedTeamId);

  if (!theirPicks.length) {
    theirPicksBox.innerHTML = `<p>Nessuna pick disponibile per ${selectedTeamName}.</p>`;
    return;
  }

  theirPicksBox.innerHTML = theirPicks.map(pick => {
    return `
      <label class="pick-choice">
        <input
          type="checkbox"
          class="their-pick-checkbox"
          value="${pick[CONFIG.PICK_NUMBER_COL]}"
        />
        ${formatPickLabel(pick)}
      </label>
    `;
  }).join("");
}

function formatPickLabel(pick) {
  return `Pick ${pick[CONFIG.PICK_NUMBER_COL]}`;
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

  if (!mySelectedPickNumbers.length && !theirSelectedPickNumbers.length) {
    showMessage("Seleziona almeno una pick da offrire o da chiedere.", "error");
    return;
  }

  const message = tradeMessageInput.value.trim();

  sendTradeBtn.disabled = true;
  sendTradeBtn.textContent = "Invio in corso...";

  try {
    const { data: proposal, error: proposalError } = await supabase
      .from("trade_proposals")
      .insert({
        from_team: currentTeamId,
        to_team: toTeamId,
        status: "pending",
        message
      })
      .select()
      .single();

    if (proposalError) throw proposalError;

    const assets = [];

    mySelectedPickNumbers.forEach(pickNumber => {
      const pick = allPicks.find(p =>
        String(p[CONFIG.PICK_NUMBER_COL]) === String(pickNumber) &&
        p[CONFIG.PICK_OWNER_COL] === currentTeamId
      );

      if (pick) {
        assets.push({
          proposal_id: proposal.id,
          side: "from",
          asset_type: "pick",
          asset_id: String(pick[CONFIG.PICK_NUMBER_COL]),
          asset_label: formatPickLabel(pick)
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
          proposal_id: proposal.id,
          side: "to",
          asset_type: "pick",
          asset_id: String(pick[CONFIG.PICK_NUMBER_COL]),
          asset_label: formatPickLabel(pick)
        });
      }
    });

    if (!assets.length) {
      throw new Error("Nessun asset valido trovato.");
    }

    const { error: assetsError } = await supabase
      .from("trade_assets")
      .insert(assets);

    if (assetsError) throw assetsError;

     await sendTradeNotification(toTeamId);

    showMessage("Proposta inviata correttamente.", "success");

    tradeMessageInput.value = "";
    toTeamSelect.value = "";
    renderMyPicks();
    renderTheirPicks();

    await loadTrades();

  } catch (err) {
    console.error(err);
    showMessage("Errore durante l’invio della proposta.", "error");
  } finally {
    sendTradeBtn.disabled = false;
    sendTradeBtn.textContent = "Invia proposta";
  }
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
          <ul>${fromAssets || "<li>Nessuna pick</li>"}</ul>
        </div>

        <div>
          <strong>${escapeHtml(toName)} offre:</strong>
          <ul>${toAssets || "<li>Nessuna pick</li>"}</ul>
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

await loadPicks();

const allTradeAssets = assets.filter(a => a.asset_type === "pick");

const hasUsedPick = allTradeAssets.some(asset =>
  usedPickNumbers.has(Number(asset.asset_id))
);

if (hasUsedPick) {
  alert("Trade bloccata: una o più pick sono già state usate nel draft.");

  await supabase
    .from("trade_proposals")
    .update({ status: "cancelled" })
    .eq("id", proposalId);

  await refreshAll();
  return;
}

const fromAssets = assets.filter(a => a.side === "from" && a.asset_type === "pick");
const toAssets = assets.filter(a => a.side === "to" && a.asset_type === "pick");

const ownershipOk = checkOwnershipBeforeTrade(proposal, fromAssets, toAssets);

    if (!ownershipOk) {
      alert("Trade bloccata: una o più pick non appartengono più alla squadra prevista.");

      await supabase
        .from("trade_proposals")
        .update({ status: "cancelled" })
        .eq("id", proposalId);

      await refreshAll();
      return;
    }

    for (const asset of fromAssets) {
      const { error } = await supabase
        .from(CONFIG.DRAFT_TABLE)
        .update({ [CONFIG.PICK_OWNER_COL]: proposal.to_team })
        .eq(CONFIG.DRAFT_NAME_COL, CONFIG.DRAFT_NAME)
        .eq(CONFIG.PICK_NUMBER_COL, Number(asset.asset_id));

      if (error) throw error;
    }

    for (const asset of toAssets) {
      const { error } = await supabase
        .from(CONFIG.DRAFT_TABLE)
        .update({ [CONFIG.PICK_OWNER_COL]: proposal.from_team })
        .eq(CONFIG.DRAFT_NAME_COL, CONFIG.DRAFT_NAME)
        .eq(CONFIG.PICK_NUMBER_COL, Number(asset.asset_id));

      if (error) throw error;
    }

    const { error: updateError } = await supabase
      .from("trade_proposals")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString()
      })
      .eq("id", proposalId);

    if (updateError) throw updateError;

    alert("Trade accettata. Le pick sono state aggiornate.");
    await refreshAll();

  } catch (err) {
    console.error(err);
    alert("Errore durante l’accettazione della trade.");
  }
}

function checkOwnershipBeforeTrade(proposal, fromAssets, toAssets) {
  for (const asset of fromAssets) {
    const pick = allPicks.find(p =>
      String(p[CONFIG.PICK_NUMBER_COL]) === String(asset.asset_id)
    );

    if (!pick || pick[CONFIG.PICK_OWNER_COL] !== proposal.from_team) {
      return false;
    }
  }

  for (const asset of toAssets) {
    const pick = allPicks.find(p =>
      String(p[CONFIG.PICK_NUMBER_COL]) === String(asset.asset_id)
    );

    if (!pick || pick[CONFIG.PICK_OWNER_COL] !== proposal.to_team) {
      return false;
    }
  }

  return true;
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
function updatePickSummaries() {
  const myCount = getCheckedValues(".my-pick-checkbox").length;
  const theirCount = getCheckedValues(".their-pick-checkbox").length;

  if (myPicksSummary) {
    myPicksSummary.textContent = myCount
      ? `${myCount} pick selezionata${myCount > 1 ? "e" : ""}`
      : "Seleziona le tue pick";
  }

  if (theirPicksSummary) {
    const selectedTeamId = toTeamSelect.value;
    const selectedTeamName = selectedTeamId ? getTeamName(selectedTeamId) : "";

    theirPicksSummary.textContent = theirCount
      ? `${theirCount} pick selezionata${theirCount > 1 ? "e" : ""}`
      : selectedTeamId
        ? `Pick disponibili di ${selectedTeamName}`
        : "Seleziona prima una squadra";
  }
}

async function refreshAll() {
  await loadPicks();
  renderMyPicks();
  renderTheirPicks();
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
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      console.warn("Sessione non valida per inviare la notifica trade.");
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

    const result = await response.json();

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
