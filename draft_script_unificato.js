import { supabase, supabaseUrl, supabaseKey } from './supabase.js';


// ========== Helper & Global ==========
const tabella = document.querySelector("#tabella-pick tbody");
const listaGiocatori = document.getElementById("lista-giocatori");
const giocatoriScelti = new Set();
const filtroRuolo = document.getElementById("filtroRuolo");
const filtroSerieA = document.getElementById("filtroSerieA");
const searchInput = document.getElementById("searchGiocatore");
const cercaRuolo = document.getElementById("cercaRuolo");

const mappaGiocatori = {};
const mappaGiocatoriDraft = {};
let ruoli = new Set();
let squadre = new Set();
let currentUser = null;
let currentProfile = null;
let currentTeamId = null;
let currentTeamName = null;
let currentDraftState = null;
let autoRefreshInterval = null;
let lastPickNotificata = null;
let pickInInvio = false;
let isAdmin = false;
let keeperSelections = [];
let pendingRfaClaim = null;

function normalize(nome) { return nome.trim().toLowerCase(); }

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function logoutUtente() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
}

async function caricaKeeperSelectionsDraft() {
  const { data: settings, error: settingsError } = await supabase
    .from("keeper_settings")
    .select("season")
    .eq("id", 1)
    .single();

  if (settingsError) throw settingsError;

  const { data, error } = await supabase
    .from("keeper_selections")
    .select(`
      id,
      season,
      team_id,
      player_id,
      selection_type,
      cost_round,
      actual_paid_round,
      status
    `)
    .eq("season", settings.season)
    .eq("status", "active");

  if (error) throw error;

  keeperSelections = data || [];
}

async function caricaUtenteLoggato() {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    window.location.href = 'login.html';
    return false;
  }

  currentUser = user;

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    console.error('Profilo non trovato:', profileError);
    alert('Profilo utente non trovato.');
    return false;
  }

  currentProfile = profile;
currentTeamId = profile.team_id;
isAdmin = profile.role === 'admin';

  const { data: teams, error: teamsError } = await supabase
    .from('teams')
    .select('*');

  if (teamsError || !teams) {
    console.error('Errore caricamento squadre:', teamsError);
    alert('Errore nel caricamento squadre.');
    return false;
  }

  const myTeam = teams.find(t => t.id === currentTeamId);

  if (!myTeam) {
    alert('Squadra associata non trovata.');
    return false;
  }

  currentTeamName = myTeam.name;

 const elUser = document.getElementById("utente-loggato");
if (elUser) {
  elUser.textContent = isAdmin
    ? `👤 Sei: ${currentTeamName} · Admin`
    : `👤 Sei: ${currentTeamName}`;
}

  return true;
}

function aggiornaAdminPanel() {
  const panel = document.getElementById("admin-panel");
  if (panel) {
    panel.style.display = isAdmin ? "block" : "none";
  }

  const tradePanel = document.getElementById("admin-trade-panel");
  if (tradePanel) {
    tradePanel.style.display = isAdmin ? "block" : "none";
  }
}

function ensureRfaPanel() {
  if (document.getElementById("rfa-panel")) return;

  const main = document.querySelector(".page-shell") || document.querySelector("main");
  if (!main) return;

  const panel = document.createElement("section");
  panel.id = "rfa-panel";
  panel.className = "panel";
  panel.style.display = "none";
  panel.style.margin = "20px 0";
  panel.innerHTML = `
    <div class="panel-header">
      <div class="panel-title-wrap">
        <h2 class="panel-title">🛡️ Decisione RFA</h2>
        <p class="panel-subtitle">Un Restricted Free Agent è stato chiamato. Serve una decisione.</p>
      </div>
      <div class="panel-count">RFA</div>
    </div>

    <div id="rfa-panel-content" style="padding:16px; display:grid; gap:12px;"></div>
  `;

  const container = document.querySelector(".container");

  if (container) {
    container.insertAdjacentElement("beforebegin", panel);
  } else {
    main.appendChild(panel);
  }
}

async function caricaPendingRfaClaim() {
  try {
    const { data, error } = await supabase
      .rpc("get_pending_rfa_claim", {
        p_draft_name: tab
      });

    if (error) throw error;

    const claim = data?.[0] || null;

    if (!claim) {
      pendingRfaClaim = null;
      renderRfaPanel();
      return;
    }

    pendingRfaClaim = {
      id: claim.id,
      season: claim.season,
      draft_name: claim.draft_name,
      pick_number: claim.pick_number,
      claiming_team_id: claim.claiming_team_id,
      original_team_id: claim.original_team_id,
      player_id: claim.player_id,
      status: claim.status,
      created_at: claim.created_at,
      claiming_team: {
        name: claim.claiming_team_name
      },
      original_team: {
        name: claim.original_team_name
      },
      players: {
        name: claim.player_name,
        role: claim.player_role,
        role_mantra: claim.player_role_mantra,
        serie_a_team: claim.player_serie_a_team
      }
    };

    renderRfaPanel();

  } catch (err) {
    console.error("Errore caricamento RFA pending:", err);
  }
}

function renderRfaPanel() {
  ensureRfaPanel();

  const panel = document.getElementById("rfa-panel");
  const content = document.getElementById("rfa-panel-content");
  if (!panel || !content) return;

  if (!pendingRfaClaim) {
    panel.style.display = "none";
    content.innerHTML = "";
    return;
  }

  const canResolve =
    isAdmin ||
    pendingRfaClaim.original_team_id === currentTeamId;

  const player = pendingRfaClaim.players || {};
  const playerName = player.name || "Giocatore RFA";
  const role = player.role || player.role_mantra || "-";
  const serieATeam = player.serie_a_team || "-";

  const claimingTeamName = pendingRfaClaim.claiming_team?.name || "Squadra chiamante";
  const originalTeamName = pendingRfaClaim.original_team?.name || "Squadra proprietaria";

  panel.style.display = "block";

  content.innerHTML = `
    <div style="
      display:grid;
      gap:8px;
      padding:14px;
      border-radius:14px;
      background:#fff7e6;
      border:1px solid #ffd591;
    ">
      <strong style="font-size:18px;">${escapeHtml(playerName)}</strong>
      <div>
        ${escapeHtml(role)} · ${escapeHtml(serieATeam)}
      </div>
      <div>
        <strong>${escapeHtml(claimingTeamName)}</strong> ha chiamato un RFA di
        <strong>${escapeHtml(originalTeamName)}</strong> alla pick
        <strong>${pendingRfaClaim.pick_number}</strong>.
      </div>
      <div>
        ${
          canResolve
            ? "Puoi pareggiare l’offerta oppure lasciare andare il giocatore."
            : "Decisione in attesa del proprietario RFA o dell’admin."
        }
      </div>
    </div>

    ${
      canResolve
        ? `
          <div style="display:flex; gap:10px; flex-wrap:wrap;">
            <button id="btn-rfa-matched" type="button">
              ✅ Pareggia offerta
            </button>
            <button id="btn-rfa-declined" type="button" class="danger-btn">
              ❌ Lascia andare
            </button>
          </div>
        `
        : ""
    }

    <p id="rfa-action-status" style="margin:0; font-weight:600;"></p>
  `;

  document.getElementById("btn-rfa-matched")?.addEventListener("click", () => {
    resolveRfaClaim("matched");
  });

  document.getElementById("btn-rfa-declined")?.addEventListener("click", () => {
    resolveRfaClaim("declined");
  });
}

async function resolveRfaClaim(decision) {
  if (!pendingRfaClaim) return;

  const statusEl = document.getElementById("rfa-action-status");

  const playerName = pendingRfaClaim.players?.name || "questo giocatore";

  const confirmMessage =
    decision === "matched"
      ? `Vuoi pareggiare l’offerta per ${playerName}? Il giocatore verrà assegnato alla tua prossima pick valida e la squadra chiamante richiamerà subito.`
      : `Vuoi lasciare andare ${playerName}? Il giocatore verrà assegnato alla squadra chiamante.`;

  if (!confirm(confirmMessage)) return;

  if (statusEl) {
    statusEl.textContent =
      decision === "matched"
        ? "⏳ Pareggio offerta in corso..."
        : "⏳ Conferma cessione RFA in corso...";
  }

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      if (statusEl) statusEl.textContent = "❌ Sessione non valida.";
      alert("Sessione non valida. Fai di nuovo login.");
      return;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/resolve-rfa-claim`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionData.session.access_token}`,
          "apikey": supabaseKey
        },
        body: JSON.stringify({
          claim_id: pendingRfaClaim.id,
          decision
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Errore resolve-rfa-claim:", result);
      if (statusEl) statusEl.textContent = `❌ ${result?.error || "Errore decisione RFA"}`;
      alert(result?.error || "Errore decisione RFA.");
      return;
    }

    if (statusEl) {
      statusEl.textContent =
        decision === "matched"
          ? "✅ Offerta pareggiata. Il draft riparte dalla squadra chiamante."
          : "✅ RFA lasciato andare. Il draft avanza.";
    }

    pendingRfaClaim = null;

    await caricaKeeperSelectionsDraft();
    await caricaGiocatori();
    await caricaPick();
    popolaListaDisponibili();
    aggiornaChiamatePerSquadra();
    aggiornaStatoInterattivoLista();
    await caricaPendingRfaClaim();

  } catch (err) {
    console.error("Errore resolve RFA:", err);
    if (statusEl) statusEl.textContent = "❌ Errore durante la decisione RFA.";
    alert("Errore durante la decisione RFA.");
  }
}



// Spinner
function showSpinner(show = true) {
  const s = document.getElementById("spinner");
  if (s) s.style.display = show ? "inline-block" : "none";
}

// Abort
const _controllers = { pick: null, csv: null };

// No-cache
function urlNoCache(url) {
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}_cb=${Date.now()}`;
}

// Timeout
function withTimeout(promise, ms = 12000) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))
  ]);
}

// Retry GET con backoff + jitter
async function fetchRetry(url, opt = {}, tries = 3, baseDelay = 800, timeoutMs = 12000) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await withTimeout(
        fetch(urlNoCache(url), { cache: "no-store", method: "GET", ...opt }),
        timeoutMs
      );
      if (res.ok) return res;
      console.warn(`[retry] tentativo ${i+1}/${tries}: HTTP ${res.status} su`, url);
      if (![429, 500, 502, 503, 504].includes(res.status)) throw new Error(`HTTP ${res.status}`);
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (e) {
      if (e.name === "AbortError") throw e;
      lastErr = e;
      console.warn(`[retry] tentativo ${i+1}/${tries} errore:`, e?.message || e, 'URL:', url);
    }
    const delay = baseDelay * Math.pow(2, i) + Math.random() * 250;
    await new Promise(r => setTimeout(r, delay));
  }
  throw lastErr;
}

// Abort + Retry
function abortAndFetch(key, url, tries = 4, baseDelay = 1200, timeoutMs = 25000) {
  if (_controllers[key]) _controllers[key].abort();
  const controller = new AbortController();
  _controllers[key] = controller;
  return fetchRetry(url, { signal: controller.signal }, tries, baseDelay, timeoutMs)
    .finally(() => { if (_controllers[key] === controller) _controllers[key] = null; });
}

// Tab/endpoint
const urlParams = new URLSearchParams(window.location.search);
const tab = urlParams.get("tab") || (window.location.href.includes("conference") ? "Draft Conference" : "Draft Championship");
const draftPool = tab === "Draft Championship"
  ? "conference_championship"
  : "conference_league";

// ========== Render Picks ==========
function renderPicks(dati) {
  const corpoTabella = document.querySelector("#tabella-pick tbody");
  corpoTabella.innerHTML = "";
  giocatoriScelti.clear();

  let prossima = null;
  let prossimaIndex = -1;

  const currentPick = currentDraftState?.current_pick || null;

  dati.forEach((riga, index) => {
    const nome = riga["Giocatore"]?.trim() || "";
    const pick = parseInt(riga["Pick"]);

    if (nome) giocatoriScelti.add(normalize(nome));

    if (currentPick !== null && pick === currentPick) {
      prossimaIndex = index;
      prossima = { fantaTeam: riga["Fanta Team"], pick: riga["Pick"] };
    }
  });

  dati.forEach((riga, i) => {
    const tr = document.createElement("tr");
    const nome = riga["Giocatore"]?.trim() || "";
    const fantaTeam = riga["Fanta Team"];
    const pick = riga["Pick"];

    tr.innerHTML = `<td>${pick}</td><td>${fantaTeam}</td><td>${nome}</td>`;

    if (i === prossimaIndex) {
      tr.classList.add("next-pick");
      tr.style.backgroundColor = "#ffcc00";
    } else if (nome) {
      tr.style.backgroundColor = "white";
      tr.style.fontWeight = "bold";
    }

    corpoTabella.appendChild(tr);
  });


  if (prossimaIndex >= 0) {
    const rigaCorrente = document.querySelectorAll("#tabella-pick tbody tr")[prossimaIndex];
    if (rigaCorrente) {
      rigaCorrente.style.backgroundColor = "#ffcc00";
      rigaCorrente.classList.add("next-pick");
    }
  }

  if (window.innerWidth <= 768 && prossimaIndex >= 0) {
    const start = Math.max(0, prossimaIndex - 2);
    const end = prossimaIndex + 3;
    document.querySelectorAll("#tabella-pick tbody tr").forEach((riga, i) => {
      if (i >= start && i < end) riga.classList.add("show-mobile");
    });
  }

const turnoEl = document.getElementById("turno-attuale");

if (currentDraftState?.is_open === false) {
  if (turnoEl) {
    turnoEl.textContent = "🛑 Draft fermo: decisione RFA in attesa.";
  }
} else {
  if (turnoEl) {
    turnoEl.textContent = prossima
      ? `🎯 È il turno di: ${prossima.fantaTeam} (Pick ${prossima.pick})`
      : "✅ Draft completato!";
  }
}

/* Mobile live hero */
const mobileLivePick = document.getElementById("mobile-live-pick");
const mobileLiveTeam = document.getElementById("mobile-live-team");
const mobileLiveSub = document.getElementById("mobile-live-sub");

if (mobileLivePick && mobileLiveTeam && mobileLiveSub) {
  if (currentDraftState?.is_open === false) {
    mobileLivePick.textContent = "RFA";
    mobileLiveTeam.textContent = "Draft fermo";
    mobileLiveSub.textContent = "Decisione RFA in attesa";
  } else if (prossima) {
    mobileLivePick.textContent = `Pick #${prossima.pick}`;
    mobileLiveTeam.textContent = prossima.fantaTeam;
    mobileLiveSub.textContent = "È il turno di questa squadra";
  } else {
    mobileLivePick.textContent = "Fine";
    mobileLiveTeam.textContent = "Draft completato";
    mobileLiveSub.textContent = "Tutte le pick sono state effettuate";
  }
}
// ========== caricaPick con Retry + Abort + Spinner + Fallback ==========
async function caricaPick() {
  showSpinner(true);

  try {
    const { data: teams, error: teamsError } = await supabase
      .from('teams')
      .select('*');

    if (teamsError) throw teamsError;

    const { data: orderRows, error: orderError } = await supabase
      .from('draft_order')
      .select('*')
      .eq('draft_name', tab)
      .order('pick_number', { ascending: true });

    if (orderError) throw orderError;

    const { data: pickRows, error: picksError } = await supabase
      .from('draft_picks')
      .select('*')
      .eq('draft_name', tab)
      .order('pick_number', { ascending: true });
if (picksError) throw picksError;
    Object.keys(mappaGiocatoriDraft).forEach(k => delete mappaGiocatoriDraft[k]);

const draftPlayerIds = [...new Set(
  (pickRows || [])
    .map(p => p.player_id)
    .filter(Boolean)
)];

if (draftPlayerIds.length) {
  const { data: draftPlayers, error: draftPlayersError } = await supabase
    .from("players")
.select(`
id,
name,
role,
role_mantra,
is_u21,
is_u21_slot,
is_u21_keeper,
u21_keeper_year,
is_fp,
is_fp_keeper,
fp_keeper_year,
is_top6_protected,
is_rfa_matched
    `)
    .in("id", draftPlayerIds);

  if (draftPlayersError) throw draftPlayersError;

  (draftPlayers || []).forEach(p => {
    const key = normalize(p.name || "");

    mappaGiocatoriDraft[key] = {
      id: p.id,
      nome: p.name || "",
      ruolo: p.role || p.role_mantra || "",
      is_u21: !!p.is_u21,
      is_u21_slot: !!p.is_u21_slot,
      is_u21_keeper: !!p.is_u21_keeper,
      is_fp: !!p.is_fp,
is_fp_keeper: !!p.is_fp_keeper,
fp_keeper_year: p.fp_keeper_year,
      is_top6_protected: !!p.is_top6_protected,
      u21_keeper_year: p.u21_keeper_year,
      is_rfa_matched: !!p.is_rfa_matched
    };
  });
}

    const { data: stateRows, error: stateError } = await supabase
      .from('draft_state')
      .select('*')
      .eq('draft_name', tab);

    if (stateError) throw stateError;

    currentDraftState = stateRows?.[0] || null;

    const picksMap = {};
    pickRows.forEach(p => {
      picksMap[p.pick_number] = p;
    });

const dati = orderRows.map(r => {
  const pick = picksMap[r.pick_number];

  const teamIdToShow = pick?.team_id || r.team_id;
  const team = teams.find(t => t.id === teamIdToShow);

  return {
    "Pick": r.pick_number,
    "Fanta Team": team ? team.name : "",
    "Giocatore": pick ? pick.player_name : ""
  };
});

    renderPicks(dati);
    aggiornaStatoInterattivoLista();
    controllaNotificaTurno();

  } catch (err) {
    console.error("❌ Errore caricaPick da Supabase:", err);
    const el = document.getElementById("turno-attuale");
    if (el) el.textContent = "⚠️ Problema nel caricamento del draft.";
  } finally {
    showSpinner(false);
  }
}

function avviaAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);

  autoRefreshInterval = setInterval(async () => {
    try {
      await caricaPick();
aggiornaChiamatePerSquadra();
await caricaPendingRfaClaim();
    } catch (err) {
      console.warn("Auto refresh fallito:", err);
    }
  }, 30000);
}

function isMioTurno() {
  if (!currentDraftState) return false;
  if (currentDraftState.is_open === false) return false;

  const pickCorrente = currentDraftState.current_pick;
  const righe = document.querySelectorAll("#tabella-pick tbody tr");

  for (let r of righe) {
    const celle = r.querySelectorAll("td");
    const pick = parseInt(celle[0]?.textContent || "0");
    const squadra = (celle[1]?.textContent || "").trim();

    if (pick === pickCorrente) {
      return squadra === currentTeamName;
    }
  }

  return false;
}
function aggiornaStatoInterattivoLista() {
  const puoScegliere = isAdmin || isMioTurno();

  if (puoScegliere) {
    listaGiocatori.style.opacity = "1";
    listaGiocatori.style.pointerEvents = "auto";
  } else {
    listaGiocatori.style.opacity = "0.6";
    listaGiocatori.style.pointerEvents = "none";
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function attivaNotifichePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('Questo dispositivo non supporta le notifiche push.');
      return;
    }

    if (!currentUser) {
      alert('Utente non loggato.');
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      alert('Permesso notifiche negato.');
      return;
    }

    const registration = await navigator.serviceWorker.ready;

    const VAPID_PUBLIC_KEY = 'BLVVpSFZr0IUiuc4B-7eYQjFMnYvWlvHgxaaSyAo5LOvOD3wrypSJRDuVKMKucCpgMD8Sz9X7nTwFrYtCHsJWcc';

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      alert('Sessione non valida. Fai di nuovo login.');
      return;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/save-push-subscription`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
          'apikey': supabaseKey
        },
        body: JSON.stringify({ subscription })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Errore save-push-subscription:', result);
      alert(result?.error || 'Errore nel salvataggio notifiche.');
      return;
    }

    console.log('✅ Notifiche attivate:', result);
alert('Notifiche attivate con successo.');
await aggiornaBottoneNotifiche();
  } catch (err) {
    console.error('❌ Errore attivazione notifiche:', err);
    alert('Errore durante l’attivazione delle notifiche.');
  }
}

async function aggiornaBottoneNotifiche() {
  const notifBtn = document.getElementById("attiva-notifiche-btn");
  if (!notifBtn) return;

  function setNotificationButtonLabel(text, attive) {
    notifBtn.dataset.attive = attive ? "true" : "false";

    let icon = notifBtn.querySelector(".action-icon");
    let label = notifBtn.querySelector(".btn-label");

    if (!icon) {
      icon = document.createElement("img");
      icon.src = "icons/nav/notifications.webp";
      icon.alt = "";
      icon.className = "action-icon";
      notifBtn.prepend(icon);
    }

    if (!label) {
      label = document.createElement("span");
      label.className = "btn-label";
      notifBtn.appendChild(label);
    }

    label.textContent = text;
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    notifBtn.style.display = "none";
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      setNotificationButtonLabel("Disattiva notifiche", true);
    } else {
      setNotificationButtonLabel("Attiva notifiche", false);
    }
  } catch (err) {
    console.error("Errore controllo stato notifiche:", err);
    setNotificationButtonLabel("Attiva notifiche", false);
  }
}

async function disattivaNotifichePush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      await aggiornaBottoneNotifiche();
      return;
    }

    await subscription.unsubscribe();

    alert("Notifiche disattivate.");
    await aggiornaBottoneNotifiche();
  } catch (err) {
    console.error("Errore disattivazione notifiche:", err);
    alert("Errore durante la disattivazione delle notifiche.");
  }
}

async function adminSwapPicks() {
  const statusEl = document.getElementById("admin-trade-status");
  const pickAInput = document.getElementById("trade-pick-a");
  const pickBInput = document.getElementById("trade-pick-b");

  if (!isAdmin) {
    alert("Solo admin.");
    return;
  }

  const pickA = parseInt(pickAInput?.value || "0");
  const pickB = parseInt(pickBInput?.value || "0");

  if (!pickA || !pickB) {
    statusEl.textContent = "Inserisci due pick valide.";
    return;
  }

  if (pickA === pickB) {
    statusEl.textContent = "Le due pick devono essere diverse.";
    return;
  }

  const conferma = confirm(`Vuoi scambiare la pick #${pickA} con la pick #${pickB}?`);
  if (!conferma) return;

  statusEl.textContent = "⏳ Scambio pick in corso...";

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      statusEl.textContent = "Sessione non valida.";
      return;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/admin-swap-picks`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
          'apikey': supabaseKey
        },
        body: JSON.stringify({
          draft_name: tab,
          pick_a: pickA,
          pick_b: pickB
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      statusEl.textContent = `❌ ${result?.error || 'Errore scambio picks'}`;
      return;
    }

    statusEl.textContent = `✅ ${result.message}`;
    await caricaPick();
    popolaListaDisponibili();
    aggiornaChiamatePerSquadra();
    aggiornaStatoInterattivoLista();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "❌ Errore durante lo scambio picks.";
  }
}

async function adminResetDraft() {
  const statusEl = document.getElementById("admin-status");

  if (!isAdmin) {
    alert("Solo admin.");
    return;
  }

  const conferma = confirm(`Vuoi davvero resettare ${tab}?`);
  if (!conferma) return;

  if (statusEl) statusEl.textContent = "⏳ Reset draft in corso...";

  try {
    const { data, error } = await supabase.rpc("admin_reset_draft", {
      p_draft_name: tab
    });

    if (error) throw error;

    console.log("RESET OK:", data);

    lastPickNotificata = null;
    giocatoriScelti.clear();

    await caricaGiocatori();
    await caricaPick();
    popolaListaDisponibili();
    aggiornaChiamatePerSquadra();
    aggiornaStatoInterattivoLista();

    if (statusEl) {
      statusEl.textContent = `✅ Reset completato. Pick cancellate: ${data.deleted_picks}`;
    }

    alert("Draft resettato correttamente.");

  } catch (err) {
    console.error("Errore reset draft:", err);
    if (statusEl) statusEl.textContent = "❌ Errore durante il reset draft.";
    alert(err.message || "Errore durante il reset draft.");
  }
}

function controllaNotificaTurno() {
  if (!currentDraftState) return;

  const pickCorrente = currentDraftState.current_pick;

  if (lastPickNotificata === pickCorrente) return;

  const mioTurno = isMioTurno();

  if (mioTurno) {
    lastPickNotificata = pickCorrente;

    const turnoEl = document.getElementById("turno-attuale");
    if (turnoEl) {
      turnoEl.style.background = "#ffcc00";
      turnoEl.style.transform = "scale(1.05)";
      turnoEl.style.transition = "all 0.3s ease";
      turnoEl.textContent = `🔥 È il tuo turno! (${currentTeamName})`;

      setTimeout(() => {
        turnoEl.style.transform = "scale(1)";
      }, 800);
    }
  }
}

// ========== Giocatori da Supabase ==========
async function caricaGiocatori() {
  showSpinner(true);

  try {
    ruoli = new Set();
    squadre = new Set();
    Object.keys(mappaGiocatori).forEach(k => delete mappaGiocatori[k]);

    const lockedKeeperPlayerIds = new Set(
      keeperSelections
        .filter(s => ["FP", "U21_KEEPER"].includes(s.selection_type))
        .map(s => s.player_id)
    );

const { data: players, error } = await supabase
  .from("players")
  .select(`
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
u21_keeper_year,
is_fp,
is_fp_keeper,
fp_keeper_year,
is_rfa_matched,
is_top6_protected,
owner_team_id,
    status,
    pool
  `)
  .eq("status", "active")
  .eq("pool", draftPool)
  .is("owner_team_id", null)
  .order("name", { ascending: true });

    console.log("PLAYERS DA SUPABASE:", players, error);

    if (error) throw error;

    if (!players || players.length === 0) {
      console.warn("⚠️ Nessun giocatore trovato da Supabase.");
      return;
    }

    players.forEach(p => {
      // ✅ QUI: FP e U21_KEEPER scelti nel Pre-Draft non entrano nel listone
      if (lockedKeeperPlayerIds.has(p.id)) return;

      const nome = p.name || "";
      if (!nome) return;

      const ruolo = p.role || p.role_mantra || "";
      const squadra = p.serie_a_team || "";
      const quotazione = p.quotation ?? 0;

      const key = normalize(nome);

mappaGiocatori[key] = {
  id: p.id,
  external_id: p.external_id,
  nome,
  ruolo,
  squadra,
  quotazione,
  is_fp_keeper: !!p.is_fp_keeper,
fp_keeper_year: p.fp_keeper_year,
   is_u21: !!p.is_u21,
  is_u21_slot: !!p.is_u21_slot,
  is_u21_keeper: !!p.is_u21_keeper,
  u21_keeper_year: p.u21_keeper_year,
  is_top6_protected: !!p.is_top6_protected,
  is_fp: !!p.is_fp,
  is_rfa_matched: !!p.is_rfa_matched
};

      if (ruolo) ruoli.add(ruolo);
      if (squadra) squadre.add(squadra);
    });

    console.log("MAPPA GIOCATORI:", Object.keys(mappaGiocatori).length);

  } catch (err) {
    console.error("❌ Errore caricamento players da Supabase:", err);

    const el = document.getElementById("turno-attuale");
    if (el) {
      el.textContent = "⚠️ Problema nel caricare i giocatori da Supabase.";
    }
  } finally {
    showSpinner(false);
  }
}

async function inviaPickAlFoglio(pick, fantaTeam, nome, ruolo, squadra, quotazione, options = {}) {
  if (pickInInvio) return;

  const bottoneNotifiche = document.getElementById("attiva-notifiche-btn");
  const turnoEl = document.getElementById("turno-attuale");

  try {
    if (!currentDraftState) {
      alert("Stato draft non disponibile.");
      return;
    }

 if (!isAdmin && !isMioTurno()) {
  alert("Non è il tuo turno.");
  return;
}

    pickInInvio = true;

    if (listaGiocatori) {
      listaGiocatori.style.pointerEvents = "none";
      listaGiocatori.style.opacity = "0.6";
    }

    if (turnoEl) {
      turnoEl.textContent = `⏳ Invio pick in corso: ${nome}...`;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      console.error("❌ Sessione non trovata:", sessionError);
      alert("Sessione utente non valida. Fai di nuovo login.");
      pickInInvio = false;
      aggiornaStatoInterattivoLista();
      return;
    }

    const accessToken = sessionData.session.access_token;

    const response = await fetch(
      "https://vfzadnfpwsbzfiyzbpvx.supabase.co/functions/v1/submit-pick",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "apikey": supabaseKey
        },
        body: JSON.stringify({
          draft_name: tab,
          player_name: nome,
          player_id: options.player_id || null,
          pool: draftPool
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ ERRORE submit-pick:", result);

      if (result?.error === "RFA_PENDING") {
        alert(result.message || "Questo giocatore è un RFA. Il draft è stato fermato in attesa della decisione.");
      } else {
        alert(result?.error || "Errore nell'invio della pick.");
      }

      pickInInvio = false;
      await caricaPick();
      aggiornaStatoInterattivoLista();
      return;
    }

    console.log("✅ submit-pick OK:", result);

    await caricaPick();
    popolaListaDisponibili();
    aggiornaChiamatePerSquadra();

    pickInInvio = false;
    aggiornaStatoInterattivoLista();

  } catch (err) {
    console.error("❌ ERRORE invio pick:", err);
    alert("❌ Errore nell'invio della pick. Riprova.");
    pickInInvio = false;
    aggiornaStatoInterattivoLista();
  }
}

async function adminCancelPick() {
  const statusEl = document.getElementById("admin-status");
  const pickInput = document.getElementById("admin-pick-number");

  if (!isAdmin) {
    alert("Solo admin.");
    return;
  }

  const pickNumber = parseInt(pickInput?.value || "0");
  if (!pickNumber) {
    statusEl.textContent = "Inserisci un numero pick valido.";
    return;
  }

  const conferma = confirm(`Vuoi annullare la pick #${pickNumber}?`);
  if (!conferma) return;

  statusEl.textContent = "⏳ Annullamento in corso...";

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      statusEl.textContent = "Sessione non valida.";
      return;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/admin-cancel-pick`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
          'apikey': supabaseKey
        },
        body: JSON.stringify({
          draft_name: tab,
          pick_number: pickNumber
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      statusEl.textContent = `❌ ${result?.error || 'Errore annullamento pick'}`;
      return;
    }

    statusEl.textContent = `✅ ${result.message}`;
    await caricaPick();
    popolaListaDisponibili();
    aggiornaChiamatePerSquadra();
    aggiornaStatoInterattivoLista();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "❌ Errore durante l'annullamento.";
  }
}

async function adminSetCurrentPick() {
  const statusEl = document.getElementById("admin-status");
  const pickInput = document.getElementById("admin-pick-number");

  if (!isAdmin) {
    alert("Solo admin.");
    return;
  }

  const pickNumber = parseInt(pickInput?.value || "0");
  if (!pickNumber) {
    statusEl.textContent = "Inserisci un numero pick valido.";
    return;
  }

  const conferma = confirm(`Vuoi spostare il turno alla pick #${pickNumber}?`);
  if (!conferma) return;

  statusEl.textContent = "⏳ Aggiornamento turno in corso...";

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      statusEl.textContent = "Sessione non valida.";
      return;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/admin-set-current-pick`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
          'apikey': supabaseKey
        },
        body: JSON.stringify({
          draft_name: tab,
          pick_number: pickNumber
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      statusEl.textContent = `❌ ${result?.error || 'Errore aggiornamento turno'}`;
      return;
    }

    statusEl.textContent = `✅ ${result.message}`;
    await caricaPick();
    popolaListaDisponibili();
    aggiornaChiamatePerSquadra();
    aggiornaStatoInterattivoLista();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "❌ Errore durante l'aggiornamento del turno.";
  }
}

async function adminForcePick() {
  const statusEl = document.getElementById("admin-status");
  const pickInput = document.getElementById("admin-pick-number");
  const newPlayerInput = document.getElementById("admin-new-player");

  if (!isAdmin) {
    alert("Solo admin.");
    return;
  }

  const pickNumber = parseInt(pickInput?.value || "0");
  const playerName = (newPlayerInput?.value || "").trim();

  if (!pickNumber) {
    statusEl.textContent = "Inserisci un numero pick valido.";
    return;
  }

  if (!playerName) {
    statusEl.textContent = "Inserisci il nome del giocatore.";
    return;
  }

  const conferma = confirm(`Vuoi forzare la pick #${pickNumber} con "${playerName}"?`);
  if (!conferma) return;

  statusEl.textContent = "⏳ Forzatura pick in corso...";

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      statusEl.textContent = "Sessione non valida.";
      return;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/admin-force-pick`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
          'apikey': supabaseKey
        },
        body: JSON.stringify({
          draft_name: tab,
          pick_number: pickNumber,
          player_name: playerName
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      statusEl.textContent = `❌ ${result?.error || 'Errore forza pick'}`;
      return;
    }

    statusEl.textContent = `✅ ${result.message}`;
    await caricaPick();
    popolaListaDisponibili();
    aggiornaChiamatePerSquadra();
    aggiornaStatoInterattivoLista();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "❌ Errore durante la forza pick.";
  }
}

async function adminEditPick() {
  const statusEl = document.getElementById("admin-status");
  const pickInput = document.getElementById("admin-pick-number");
  const newPlayerInput = document.getElementById("admin-new-player");

  if (!isAdmin) {
    alert("Solo admin.");
    return;
  }

  const pickNumber = parseInt(pickInput?.value || "0");
  const newPlayerName = (newPlayerInput?.value || "").trim();

  if (!pickNumber) {
    statusEl.textContent = "Inserisci un numero pick valido.";
    return;
  }

  if (!newPlayerName) {
    statusEl.textContent = "Inserisci il nuovo nome del giocatore.";
    return;
  }

  const conferma = confirm(`Vuoi modificare la pick #${pickNumber} con "${newPlayerName}"?`);
  if (!conferma) return;

  statusEl.textContent = "⏳ Modifica pick in corso...";

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      statusEl.textContent = "Sessione non valida.";
      return;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/admin-edit-pick`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
          'apikey': supabaseKey
        },
        body: JSON.stringify({
          draft_name: tab,
          pick_number: pickNumber,
          new_player_name: newPlayerName
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      statusEl.textContent = `❌ ${result?.error || 'Errore modifica pick'}`;
      return;
    }

    statusEl.textContent = `✅ ${result.message}`;
    await caricaPick();
    popolaListaDisponibili();
    aggiornaChiamatePerSquadra();
    aggiornaStatoInterattivoLista();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "❌ Errore durante la modifica.";
  }
}


function renderDraftBadgeImages(player, options = {}) {
  const badges = [];

  if (player.is_fp_keeper) {
    const isSecondYear = Number(player.fp_keeper_year) === 2;
    const src = isSecondYear
      ? "img/badges/fp-confermato.webp"
      : "img/badges/fp.webp";

    badges.push(`
      <img
        class="badge-img badge-img-star"
        src="${src}"
        alt="FP"
        title="${isSecondYear ? "Franchise Player confermato 2° anno" : "Franchise Player confermato 1° anno"}"
      >
    `);
  } else if (player.is_fp) {
    badges.push(`
      <img
        class="badge-img badge-img-star"
        src="img/badges/fp.webp"
        alt="FP"
        title="Franchise Player"
      >
    `);
  }

  if (player.is_u21_keeper) {
    const isSecondYear = Number(player.u21_keeper_year) === 2;
    const src = isSecondYear
      ? "img/badges/u21-confermato-secondo-anno.webp"
      : "img/badges/u21-confermato.webp";

    badges.push(`
      <img
        class="badge-img badge-img-star"
        src="${src}"
        alt="U21"
        title="${isSecondYear ? "U21 confermato 2° anno" : "U21 confermato 1° anno"}"
      >
    `);
  } else if (
    player.is_u21_slot ||
    (options.showEligibleU21 === true && player.is_u21 === true)
  ) {
    badges.push(`
      <img
        class="badge-img badge-img-pill"
        src="img/badges/u21.webp"
        alt="U21"
        title="Under 21"
      >
    `);
  }

  if (player.is_rfa_matched) {
    badges.push(`
      <img
        class="badge-img badge-img-pill"
        src="img/badges/rfa.webp"
        alt="RFA"
        title="RFA pareggiato"
      >
    `);
  }

  if (player.is_top6_protected) {
    badges.push(`
      <img
        class="badge-img badge-img-protected"
        src="img/badges/protetto-p6-lucchetto.webp"
        alt="P6"
        title="Giocatore protetto mercato: può generare priorità waiver speciale"
      >
    `);
  }

  return badges.join("");
}

function popolaListaDisponibili() {
  // svuota tabella una volta sola
  listaGiocatori.innerHTML = "";

  // ricostruisci i filtri da zero
  const ruoliTrovati = new Set();
  const squadreTrovate = new Set();

  // crea un buffer in memoria per evitare reflow continui
  const frag = document.createDocumentFragment();

Object.values(mappaGiocatori).forEach((player) => {
  const { id, nome, ruolo, squadra, quotazione } = player;

  const key = normalize(nome);
  if (giocatoriScelti.has(key)) return;

    const badges = renderDraftBadgeImages(player, { showEligibleU21: true });

  if (ruolo) ruoliTrovati.add(ruolo);
  if (squadra) squadreTrovate.add(squadra);

const tr = document.createElement("tr");
tr.dataset.playerId = id;

/* Valori nascosti per ordinare correttamente la colonna badge */
if (player.is_fp_keeper) {
  tr.dataset.badgeSort = Number(player.fp_keeper_year) === 2 ? "1-fp2" : "2-fp1";
} else if (player.is_fp) {
  tr.dataset.badgeSort = "3-fp";
} else if (player.is_u21_keeper) {
  tr.dataset.badgeSort = Number(player.u21_keeper_year) === 2 ? "4-u21-2" : "5-u21-1";
} else if (player.is_u21 === true) {
  tr.dataset.badgeSort = "6-u21";
} else if (player.is_rfa_matched) {
  tr.dataset.badgeSort = "7-rfa";
} else {
  tr.dataset.badgeSort = "9-none";
}

tr.innerHTML = `
  <td>${escapeHtml(nome)}</td>
  <td>${escapeHtml(ruolo || "")}</td>
  <td>${escapeHtml(squadra || "")}</td>
  <td>${parseInt(quotazione) || 0}</td>
  <td>${badges}</td>
`;

  frag.appendChild(tr);
});

  // inserisci tutte le righe in un colpo solo
  listaGiocatori.appendChild(frag);

  // delega click sulla tabella (un solo listener, non per riga)
  if (!listaGiocatori.dataset.bound) {
    listaGiocatori.addEventListener("click", (e) => {
      const tr = e.target.closest("tr");
      if (!tr) return;
if (!isAdmin && !isMioTurno()) {
  alert("Non è il tuo turno.");
  return;
}

const playerId = tr.dataset.playerId;
const nome = tr.children[0].textContent;
const ruolo = tr.children[1].textContent;
const squadra = tr.children[2].textContent;
const quotazione = tr.children[3].textContent;

const conferma = confirm(`Vuoi selezionare ${nome} per la squadra al turno?`);
if (!conferma) return;

if (!currentDraftState) {
  alert("Stato draft non disponibile.");
  return;
}

const pick = currentDraftState.current_pick;

const righe = document.querySelectorAll("#tabella-pick tbody tr");
let fantaTeam = "";

for (let r of righe) {
  const celle = r.querySelectorAll("td");
  const pickCella = parseInt(celle[0]?.textContent || "0");
  if (pickCella === pick) {
    fantaTeam = celle[1]?.textContent || "";
    break;
  }
}

if (!fantaTeam) {
  alert("Squadra del turno non trovata.");
  return;
}

inviaPickAlFoglio(pick, fantaTeam, nome, ruolo, squadra, quotazione, {
  player_id: playerId
});

    }); // 👈 questa mancava
    listaGiocatori.dataset.bound = "1"; // evita di aggiungere più volte il listener
  }

  // ricostruisci le <option> una volta sola
  filtroRuolo.innerHTML = '<option value="">-- Tutti i Ruoli --</option>' +
    Array.from(ruoliTrovati).map(r => `<option value="${r}">${r}</option>`).join("");

  filtroSerieA.innerHTML = '<option value="">-- Tutte --</option>' +
    Array.from(squadreTrovate).sort((a, b) => a.localeCompare(b))
      .map(s => `<option value="${s}">${s}</option>`).join("");

  // applica i filtri esistenti
  filtraLista();
}


function debounce(fn, delay = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

function filtraLista() {
  const ruoloTesto = cercaRuolo.value.toLowerCase();
  const ruoloSelect = filtroRuolo.value.toLowerCase().split(/[,;\s]+/).filter(Boolean);
  const squadra = filtroSerieA.value.toLowerCase();
  const cerca = searchInput.value.toLowerCase();

  const filtroU21 = document.getElementById("filtroU21");
  const u21Value = filtroU21 ? filtroU21.value : "";

  Array.from(listaGiocatori.children).forEach(row => {
    const nome = row.children[0]?.textContent.toLowerCase() || "";
    const r = row.children[1]?.textContent.toLowerCase() || "";
    const s = row.children[2]?.textContent.toLowerCase() || "";
    const badgeCell = row.children[4];

    const ruoliGiocatore = r
      .split(/[,;\s]+/)
      .map(part => part.trim())
      .filter(Boolean);

    const hasU21 = Boolean(
      badgeCell?.querySelector('img[src*="u21"]') ||
      badgeCell?.textContent.toLowerCase().includes("u21")
    );

    const matchInput =
      !ruoloTesto ||
      ruoliGiocatore.some(part => part.includes(ruoloTesto));

    const matchSelect =
      !ruoloSelect.length ||
      ruoloSelect.some(rs => ruoliGiocatore.includes(rs));

    const matchSquadra = !squadra || s === squadra;
    const matchNome = !cerca || nome.includes(cerca);

    let matchU21 = true;

    if (u21Value === "u21") {
      matchU21 = hasU21;
    }

    if (u21Value === "non-u21") {
      matchU21 = !hasU21;
    }

    row.style.display =
      matchInput &&
      matchSelect &&
      matchSquadra &&
      matchNome &&
      matchU21
        ? ""
        : "none";
  });
}

[
  filtroRuolo,
  filtroSerieA,
  searchInput,
  cercaRuolo,
  document.getElementById("filtroU21")
].forEach(el => {
  if (el) {
    el.addEventListener("input", debounce(filtraLista, 150));
    el.addEventListener("change", debounce(filtraLista, 150));
  }
});

window.addEventListener("DOMContentLoaded", async function () {
  const ok = await caricaUtenteLoggato();
  if (!ok) return;
  aggiornaAdminPanel();

  const adminCancelBtn = document.getElementById("admin-cancel-pick-btn");
if (adminCancelBtn) {
  adminCancelBtn.addEventListener("click", adminCancelPick);
}

  const adminSwapBtn = document.getElementById("admin-swap-picks-btn");
if (adminSwapBtn) {
  adminSwapBtn.addEventListener("click", adminSwapPicks);
}

  const adminEditBtn = document.getElementById("admin-edit-pick-btn");
if (adminEditBtn) {
  adminEditBtn.addEventListener("click", adminEditPick);
}

  const adminForceBtn = document.getElementById("admin-force-pick-btn");
if (adminForceBtn) {
  adminForceBtn.addEventListener("click", adminForcePick);
}

  const adminSetPickBtn = document.getElementById("admin-set-pick-btn");
if (adminSetPickBtn) {
  adminSetPickBtn.addEventListener("click", adminSetCurrentPick);
}

  const adminResetDraftBtn = document.getElementById("admin-reset-draft-btn");
if (adminResetDraftBtn) {
  adminResetDraftBtn.addEventListener("click", adminResetDraft);
}

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", logoutUtente);
  }

  const notifBtn = document.getElementById("attiva-notifiche-btn");
  if (notifBtn) {
    notifBtn.addEventListener("click", async () => {
      if (notifBtn.dataset.attive === "true") {
        await disattivaNotifichePush();
      } else {
        await attivaNotifichePush();
      }
    });
  }

await aggiornaBottoneNotifiche();

ensureRfaPanel();

await caricaKeeperSelectionsDraft();
await caricaGiocatori();
await caricaPick();
popolaListaDisponibili();
aggiornaChiamatePerSquadra();
aggiornaStatoInterattivoLista();
await caricaPendingRfaClaim();
avviaAutoRefresh();
});


function mappaIndiceAssolutoPerTeam() {
  const righe = document.querySelectorAll("#tabella-pick tbody tr");
  const picksPerTeam = {};           // { team: [pick,...] }
  const indexMap = {};               // { "team|pick": posizioneAssoluta }

  righe.forEach(r => {
    const celle = r.querySelectorAll("td");
    const pick = parseInt(celle[0]?.textContent);
    const team = (celle[1]?.textContent || "").trim();
    if (!team || isNaN(pick)) return;
    if (!picksPerTeam[team]) picksPerTeam[team] = [];
    picksPerTeam[team].push(pick);
  });

  Object.keys(picksPerTeam).forEach(team => {
    picksPerTeam[team].sort((a, b) => a - b);
    picksPerTeam[team].forEach((p, i) => {
      indexMap[`${team}|${p}`] = i + 1; // 1-based
    });
  });

  return indexMap;
}

function aggiornaChiamatePerSquadra() {
  const righe = document.querySelectorAll("#tabella-pick tbody tr");
  const riepilogo = {};
  const indexMap = mappaIndiceAssolutoPerTeam(); // team|pick -> posizione assoluta
  righe.forEach(r => {
    const celle = r.querySelectorAll("td");
    const pickNum = parseInt(celle[0]?.textContent);
    const team = celle[1]?.textContent?.trim();
    const nome = celle[2]?.textContent?.trim();
    if (!team || !nome || isNaN(pickNum)) return;

const key = normalize(nome);

const playerInfo =
  mappaGiocatoriDraft[key] ||
  mappaGiocatori[key] ||
  {};

const ruolo = playerInfo.ruolo || "";
const isTop6Protected = playerInfo.is_top6_protected === true;
const isU21 = playerInfo.is_u21_slot === true;
const isU21Keeper = playerInfo.is_u21_keeper === true;
const u21KeeperYear = Number(playerInfo.u21_keeper_year || 1);
const isFp = playerInfo.is_fp === true;
const isFpKeeper = playerInfo.is_fp_keeper === true;
const fpKeeperYear = Number(playerInfo.fp_keeper_year || 1);
const isRfaMatched = playerInfo.is_rfa_matched === true;
const nAssoluto = indexMap[`${team}|${pickNum}`] || 1;
    

    if (!riepilogo[team]) riepilogo[team] = [];
    riepilogo[team].push({
  n: nAssoluto,
  nome,
  ruolo,
  isU21,
  isU21Keeper,
  u21KeeperYear,
  isFp,
  isFpKeeper,
  fpKeeperYear,
      isTop6Protected,
  isRfaMatched,
  pickNum
});
  });

  const container = document.getElementById("riepilogo-squadre");
  container.innerHTML = "";

  for (const [team, picks] of Object.entries(riepilogo)) {
    // Ordina per numero assoluto della chiamata
    picks.sort((a, b) => a.n - b.n);

    const div = document.createElement("div");
    div.className = "card-pick";

    const logoPath = `img/${team}.png`;
 const img = document.createElement("img");
img.src = logoPath;
img.alt = team;
img.loading = "lazy";     // 👈 lazy-load
img.width = 60;           // 👈 dimensioni fisse utili al layout
img.height = 60;
img.style.margin = "0 auto 8px";
img.style.display = "block";
div.appendChild(img);

    const h4 = document.createElement("h4");
    h4.textContent = team;
    h4.style.textAlign = "center";
    div.appendChild(h4);

 picks.forEach(p => {
  const riga = document.createElement("div");
  riga.style.textAlign = "center";

  const parts = [];
  parts.push(`${p.n}. ${p.nome} (${p.ruolo})`);

const badgeHtml = renderDraftBadgeImages({
  is_fp: p.isFp,
  is_fp_keeper: p.isFpKeeper,
  fp_keeper_year: p.fpKeeperYear,
  is_u21: p.isU21,
  is_u21_slot: p.isU21,
  is_top6_protected: p.isTop6Protected,
  is_u21_keeper: p.isU21Keeper,
  u21_keeper_year: p.u21KeeperYear,
  is_rfa_matched: p.isRfaMatched
});

if (badgeHtml) parts.push(badgeHtml);

  riga.innerHTML = parts.join(" ");

  // giallo per prime 6 chiamate assolute del team
  if (p.n <= 6) riga.classList.add("highlight-pick");

  div.appendChild(riga);
});

    container.appendChild(div);
  }
}

window.aggiornaChiamatePerSquadra = aggiornaChiamatePerSquadra;

let ordineAscendente = {};

function ordinaPick(colonnaIndex, numerico = false) {
  const tbody = document.querySelector("#tabella-pick tbody");
  const righe = Array.from(tbody.querySelectorAll("tr"));

  const asc = !ordineAscendente[colonnaIndex];
  ordineAscendente[colonnaIndex] = asc;

  document.querySelectorAll("#tabella-pick thead th").forEach((th, idx) => {
    th.textContent = th.textContent.replace(/[\u2191\u2193]/g, "");
    if (idx === colonnaIndex) {
      th.textContent += asc ? " \u2191" : " \u2193";
    }
  });

  righe.sort((a, b) => {
    const aText = a.children[colonnaIndex]?.textContent.trim();
    const bText = b.children[colonnaIndex]?.textContent.trim();

    if (numerico) {
      const aNum = parseFloat(aText) || 0;
      const bNum = parseFloat(bText) || 0;
      return asc ? aNum - bNum : bNum - aNum;
    } else {
      return asc ? aText.localeCompare(bText) : bText.localeCompare(aText);
    }
  });

  tbody.innerHTML = "";
  righe.forEach(r => tbody.appendChild(r));
}
window.ordinaPick = ordinaPick;

let ordineListaAscendente = {};

function ordinaLista(colonnaIndex, numerico = false) {
  const tbody = document.getElementById("lista-giocatori");
  const righe = Array.from(tbody.querySelectorAll("tr"));

  const asc = !ordineListaAscendente[colonnaIndex];
  ordineListaAscendente[colonnaIndex] = asc;

  document.querySelectorAll("#lista-giocatori-table thead th").forEach((th, idx) => {
    th.textContent = th.textContent.replace(/[\u2191\u2193]/g, "");
    if (idx === colonnaIndex) {
      th.textContent += asc ? " \u2191" : " \u2193";
    }
  });

  righe.sort((a, b) => {
   const aText = colonnaIndex === 4
  ? (a.dataset.badgeSort || "9-none")
  : (a.children[colonnaIndex]?.textContent.trim() || "");

const bText = colonnaIndex === 4
  ? (b.dataset.badgeSort || "9-none")
  : (b.children[colonnaIndex]?.textContent.trim() || "");

    if (numerico) {
      const aNum = parseFloat(aText) || 0;
      const bNum = parseFloat(bText) || 0;
      return asc ? aNum - bNum : bNum - aNum;
    } else {
      return asc ? aText.localeCompare(bText) : bText.localeCompare(aText);
    }
  });

  
  tbody.innerHTML = "";
  righe.forEach(r => tbody.appendChild(r));
}
window.ordinaLista = ordinaLista;
