/* ===============================
   TRADE ROOM - LEGA DEGLI EROI
   Versione 1: scambio pick tra squadre
================================ */

/*
  Se nella tua tabella draft_order i nomi sono diversi,
  cambia SOLO questi valori.
*/
const CONFIG = {
  DRAFT_TABLE: "draft_order",

  PICK_ID_COL: "id",
  PICK_NUMBER_COL: "pick_number",
  PICK_ROUND_COL: "round",
  PICK_OWNER_COL: "owner_team",

  PROFILE_TABLE: "profiles",
  PROFILE_EMAIL_COL: "email",
  PROFILE_TEAM_COL: "team_name",
  PROFILE_ROLE_COL: "role"
};

let currentUser = null;
let currentTeam = null;
let allPicks = [];
let allTeams = [];

/* ========= ELEMENTI ========= */

const userInfo = document.getElementById("userInfo");
const logoutBtn = document.getElementById("logoutBtn");
const tradeApp = document.getElementById("tradeApp");

const myTeamLabel = document.getElementById("myTeamLabel");
const toTeamSelect = document.getElementById("toTeamSelect");
const myPicksBox = document.getElementById("myPicksBox");
const theirPicksBox = document.getElementById("theirPicksBox");
const tradeMessageInput = document.getElementById("tradeMessageInput");
const sendTradeBtn = document.getElementById("sendTradeBtn");
const tradeMessage = document.getElementById("tradeMessage");

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

  await loadPicks();
  await loadTeams();
  renderTeamSelect();
  renderMyPicks();
  await loadTrades();

  tradeApp.style.display = "block";
}

/* ========= NAVBAR MOBILE ========= */

function setupNavbar() {
  const hamburger = document.getElementById("hamburger");
  const mainMenu = document.getElementById("mainMenu");

  if (!hamburger || !mainMenu) return;

  hamburger.addEventListener("click", () => {
    mainMenu.classList.toggle("open");
  });
}

/* ========= EVENTI ========= */

function setupEvents() {
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  if (toTeamSelect) {
    toTeamSelect.addEventListener("change", renderTheirPicks);
  }

  if (sendTradeBtn) {
    sendTradeBtn.addEventListener("click", sendTradeProposal);
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
    userInfo.textContent = "Profilo non trovato. Controlla la tabella profiles.";
    return false;
  }

  currentTeam = profile[CONFIG.PROFILE_TEAM_COL];

  if (!currentTeam) {
    userInfo.textContent = "Nessuna squadra collegata a questo utente.";
    return false;
  }

  userInfo.textContent = `Accesso effettuato come ${email}`;
  myTeamLabel.textContent = currentTeam;

  return true;
}

async function logout() {
  await supabase.auth.signOut();
  window.location.href = "draft.html";
}

/* ========= DATI PICK ========= */

async function loadPicks() {
  const { data, error } = await supabase
    .from(CONFIG.DRAFT_TABLE)
    .select("*")
    .order(CONFIG.PICK_NUMBER_COL, { ascending: true });

  if (error) {
    console.error(error);
    myPicksBox.textContent = "Errore nel caricamento delle pick.";
    return;
  }

  allPicks = data || [];
}

async function loadTeams() {
  const teamsFromPicks = allPicks
    .map(pick => pick[CONFIG.PICK_OWNER_COL])
    .filter(Boolean);

  allTeams = [...new Set(teamsFromPicks)].sort();
}

function renderTeamSelect() {
  toTeamSelect.innerHTML = `<option value="">Seleziona squadra...</option>`;

  allTeams
    .filter(team => team !== currentTeam)
    .forEach(team => {
      const option = document.createElement("option");
      option.value = team;
      option.textContent = team;
      toTeamSelect.appendChild(option);
    });
}

function renderMyPicks() {
  const myPicks = allPicks.filter(
    pick => pick[CONFIG.PICK_OWNER_COL] === currentTeam
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
          value="${pick[CONFIG.PICK_ID_COL]}"
        />
        ${formatPickLabel(pick)}
      </label>
    `;
  }).join("");
}

function renderTheirPicks() {
  const selectedTeam = toTeamSelect.value;

  if (!selectedTeam) {
    theirPicksBox.innerHTML = "Seleziona prima una squadra...";
    return;
  }

  const theirPicks = allPicks.filter(
    pick => pick[CONFIG.PICK_OWNER_COL] === selectedTeam
  );

  if (!theirPicks.length) {
    theirPicksBox.innerHTML = `<p>Nessuna pick disponibile per ${selectedTeam}.</p>`;
    return;
  }

  theirPicksBox.innerHTML = theirPicks.map(pick => {
    return `
      <label class="pick-choice">
        <input 
          type="checkbox" 
          class="their-pick-checkbox"
          value="${pick[CONFIG.PICK_ID_COL]}"
        />
        ${formatPickLabel(pick)}
      </label>
    `;
  }).join("");
}

function formatPickLabel(pick) {
  const pickNumber = pick[CONFIG.PICK_NUMBER_COL];
  const round = pick[CONFIG.PICK_ROUND_COL];

  if (round) {
    return `Pick ${pickNumber} - Round ${round}`;
  }

  return `Pick ${pickNumber}`;
}

/* ========= INVIO PROPOSTA ========= */

async function sendTradeProposal() {
  clearMessage();

  const toTeam = toTeamSelect.value;

  if (!toTeam) {
    showMessage("Seleziona una squadra a cui proporre la trade.", "error");
    return;
  }

  const mySelectedPickIds = getCheckedValues(".my-pick-checkbox");
  const theirSelectedPickIds = getCheckedValues(".their-pick-checkbox");

  if (!mySelectedPickIds.length && !theirSelectedPickIds.length) {
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
        from_team: currentTeam,
        to_team: toTeam,
        status: "pending",
        message
      })
      .select()
      .single();

    if (proposalError) throw proposalError;

    const assets = [];

    mySelectedPickIds.forEach(pickId => {
      const pick = allPicks.find(p => String(p[CONFIG.PICK_ID_COL]) === String(pickId));

      if (pick) {
        assets.push({
          proposal_id: proposal.id,
          side: "from",
          asset_type: "pick",
          asset_id: String(pick[CONFIG.PICK_ID_COL]),
          asset_label: formatPickLabel(pick)
        });
      }
    });

    theirSelectedPickIds.forEach(pickId => {
      const pick = allPicks.find(p => String(p[CONFIG.PICK_ID_COL]) === String(pickId));

      if (pick) {
        assets.push({
          proposal_id: proposal.id,
          side: "to",
          asset_type: "pick",
          asset_id: String(pick[CONFIG.PICK_ID_COL]),
          asset_label: formatPickLabel(pick)
        });
      }
    });

    const { error: assetsError } = await supabase
      .from("trade_assets")
      .insert(assets);

    if (assetsError) throw assetsError;

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
    .eq("to_team", currentTeam)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    receivedTradesBox.textContent = "Errore nel caricamento delle proposte ricevute.";
    return;
  }

  renderTrades(receivedTradesBox, data || [], "received");
}

async function loadSentTrades() {
  const { data, error } = await supabase
    .from("trade_proposals")
    .select("*")
    .eq("from_team", currentTeam)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    sentTradesBox.textContent = "Errore nel caricamento delle proposte inviate.";
    return;
  }

  renderTrades(sentTradesBox, data || [], "sent");
}

async function loadCompletedTrades() {
  const { data, error } = await supabase
    .from("trade_proposals")
    .select("*")
    .in("status", ["accepted", "rejected", "cancelled"])
    .or(`from_team.eq.${currentTeam},to_team.eq.${currentTeam}`)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error(error);
    completedTradesBox.textContent = "Errore nel caricamento dello storico.";
    return;
  }

  renderTrades(completedTradesBox, data || [], "completed");
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
      .map(a => `<li>${a.asset_label}</li>`)
      .join("");

    const toAssets = tradeAssets
      .filter(a => a.side === "to")
      .map(a => `<li>${a.asset_label}</li>`)
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

    return `
      <div class="trade-card">
        <h3>${trade.from_team} → ${trade.to_team}</h3>

        <div>
          <strong>${trade.from_team} offre:</strong>
          <ul>${fromAssets || "<li>Nessuna pick</li>"}</ul>
        </div>

        <div>
          <strong>${trade.to_team} offre:</strong>
          <ul>${toAssets || "<li>Nessuna pick</li>"}</ul>
        </div>

        ${trade.message ? `<p><em>${escapeHtml(trade.message)}</em></p>` : ""}

        <p>Stato: <strong>${trade.status}</strong></p>

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

    if (proposal.to_team !== currentTeam) {
      alert("Puoi accettare solo le trade ricevute dalla tua squadra.");
      return;
    }

    const { data: assets, error: assetsError } = await supabase
      .from("trade_assets")
      .select("*")
      .eq("proposal_id", proposalId);

    if (assetsError) throw assetsError;

    await loadPicks();

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
        .eq(CONFIG.PICK_ID_COL, asset.asset_id);

      if (error) throw error;
    }

    for (const asset of toAssets) {
      const { error } = await supabase
        .from(CONFIG.DRAFT_TABLE)
        .update({ [CONFIG.PICK_OWNER_COL]: proposal.from_team })
        .eq(CONFIG.PICK_ID_COL, asset.asset_id);

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
    const pick = allPicks.find(p => String(p[CONFIG.PICK_ID_COL]) === String(asset.asset_id));

    if (!pick || pick[CONFIG.PICK_OWNER_COL] !== proposal.from_team) {
      return false;
    }
  }

  for (const asset of toAssets) {
    const pick = allPicks.find(p => String(p[CONFIG.PICK_ID_COL]) === String(asset.asset_id));

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
    .eq("to_team", currentTeam)
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
    .eq("from_team", currentTeam)
    .eq("status", "pending");

  if (error) {
    console.error(error);
    alert("Errore durante l’annullamento della proposta.");
    return;
  }

  await refreshAll();
}

/* ========= UTILS ========= */

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

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
