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

function normalize(nome) { return nome.trim().toLowerCase(); }

async function logoutUtente() {
  await supabase.auth.signOut();
  window.location.href = 'login.html';
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
const endpoint = "https://script.google.com/macros/s/AKfycbyFSp-hdD7_r2pNoCJ_X1vjxAzVKXG4py42RUT5cFloUA9PG5zFGWh3sp-qg2MEg7H5OQ/exec";

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

  applicaColoriPickSpeciali();

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

  document.getElementById("turno-attuale").textContent = prossima
    ? `🎯 È il turno di: ${prossima.fantaTeam} (Pick ${prossima.pick})`
    : "✅ Draft completato!";
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
      const team = teams.find(t => t.id === r.team_id);
      const pick = picksMap[r.pick_number];

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
      popolaListaDisponibili();
      aggiornaChiamatePerSquadra();
    } catch (err) {
      console.warn("Auto refresh fallito:", err);
    }
  }, 5000);
}

function isMioTurno() {
  if (!currentDraftState) return false;

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
  const mioTurno = isMioTurno();

  if (mioTurno) {
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

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    notifBtn.style.display = "none";
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      notifBtn.textContent = "Disattiva notifiche";
      notifBtn.dataset.attive = "true";
    } else {
      notifBtn.textContent = "Attiva notifiche";
      notifBtn.dataset.attive = "false";
    }
  } catch (err) {
    console.error("Errore controllo stato notifiche:", err);
    notifBtn.textContent = "Attiva notifiche";
    notifBtn.dataset.attive = "false";
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

// CSV con cache locale (TTL 24h) + delega al fetch
function caricaGiocatori() {
  const KEY = "giocatori_championship_cache";
  const TTL = 24 * 60 * 60 * 1000;
  const now = Date.now();

  try {
    const cache = JSON.parse(localStorage.getItem(KEY) || "null");
    if (cache && (now - cache.time) < TTL && cache.csv) {
      parseGiocatoriCSV(cache.csv);
      return Promise.resolve();
    }
  } catch (err) {
    console.warn("Cache CSV non disponibile, vado di fetch:", err);
  }

  return fetchAndParseGiocatoriGeneric(KEY, now, "giocatori_completo_finale.csv");
}

// ========== CSV Giocatori con Abort + Spinner ==========
async function fetchAndParseGiocatoriGeneric(KEY, now, fileName) {
  showSpinner(true);
  try {
    const res = await abortAndFetch("csv", fileName, 3, 800, 12000);
    const csv = await res.text();
    localStorage.setItem(KEY, JSON.stringify({ time: now, csv }));
    parseGiocatoriCSV(csv);
  } catch (err) {
    console.error(`❌ Errore nel caricamento ${fileName}:`, err);
    const el = document.getElementById("turno-attuale");
    if (el) el.textContent = "⚠️ Problema di rete nel caricare i giocatori.";
    const cache = JSON.parse(localStorage.getItem(KEY) || "null");
    if (cache?.csv) {
      console.warn("↩️ Uso cache locale fallback");
      parseGiocatoriCSV(cache.csv);
    }
  } finally {
    showSpinner(false);
  }
}

// Parser CSV semplice (ok se non hai virgole nei campi)
function parseGiocatoriCSV(csv) {
  ruoli = new Set();
  squadre = new Set();
  Object.keys(mappaGiocatori).forEach(k => delete mappaGiocatori[k]);

  const righe = csv.trim().split(/\r?\n/).slice(1);
  righe.forEach(r => {
    const [nome, ruolo, squadra, quotazione, u21] = r.split(",");
    if (!nome) return;
    const key = normalize(nome);
    mappaGiocatori[key] = { nome, ruolo, squadra, quotazione, u21 };
    if (ruolo) ruoli.add(ruolo);
    if (squadra) squadre.add(squadra);
  });
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

    if (!isMioTurno()) {
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
      'https://vfzadnfpwsbzfiyzbpvx.supabase.co/functions/v1/submit-pick',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': supabaseKey
        },
        body: JSON.stringify({
          draft_name: tab,
          player_name: nome
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("❌ ERRORE submit-pick:", result);
      alert(result?.error || "Errore nell'invio della pick.");
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

function popolaListaDisponibili() {
  // svuota tabella una volta sola
  listaGiocatori.innerHTML = "";

  // ricostruisci i filtri da zero
  const ruoliTrovati = new Set();
  const squadreTrovate = new Set();

  // crea un buffer in memoria per evitare reflow continui
  const frag = document.createDocumentFragment();

  Object.values(mappaGiocatori).forEach(({ nome, ruolo, squadra, quotazione }) => {
    const key = normalize(nome);
    if (giocatoriScelti.has(key)) return;

    const u21 = mappaGiocatori[key]?.u21?.toLowerCase() === "u21" ? "U21" : "";

    if (ruolo) ruoliTrovati.add(ruolo);
    if (squadra) squadreTrovate.add(squadra);

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${nome}</td>
      <td>${ruolo || ""}</td>
      <td>${squadra || ""}</td>
      <td>${parseInt(quotazione) || 0}</td>
      <td>${u21}</td>
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
      if (!isMioTurno()) {
  alert("Non è il tuo turno.");
  return;
}

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

inviaPickAlFoglio(pick, fantaTeam, nome, ruolo, squadra, quotazione);
    });
    listaGiocatori.dataset.bound = "1"; // evita di aggiungere più volte il listener
  }

  // ricostruisci le <option> una volta sola
  filtroRuolo.innerHTML = '<option value="">-- Tutti i Ruoli --</option>' +
    Array.from(ruoliTrovati).map(r => `<option value="${r}">${r}</option>`).join("");

  filtroSerieA.innerHTML = '<option value="">-- Tutte --</option>' +
    Array.from(squadreTrovate).sort((a, b) => a.localeCompare(b))
      .map(s => `<option value="${s}">${s}</option>`).join("");

  // applica i filtri esistenti (se l'utente aveva già scritto qualcosa)
  filtraLista();
}
function rangeToSet(a, b) {
  const s = new Set();
  for (let i = a; i <= b; i++) s.add(i);
  return s;
}

function getSpecialPickSets(tab) {
  if (tab === "Draft Championship") {
    return {
      fp: new Set([56, 59, 60]),
      u21: new Set([114, 115])
    };
  }
  // Default: Conference
  return {
    fp: new Set([61, 64]),
    u21: new Set([114, 115, 117, 118, 119])
  };
}

function applicaColoriPickSpeciali() {
  const righe = document.querySelectorAll("#tabella-pick tbody tr");
  const sets = getSpecialPickSets(tab);

  righe.forEach(r => {
    const celle = r.querySelectorAll("td");
    const pickNum = parseInt(celle[0]?.textContent);
    if (isNaN(pickNum)) return;

    // reset
    r.style.backgroundColor = "";
    r.style.borderLeft = "";

    // FP
    if (sets.fp.has(pickNum)) {
      r.style.backgroundColor = "#cce5ff";
      r.style.borderLeft = "4px solid #004085";
    }

    // U21
    if (sets.u21.has(pickNum)) {
      r.style.backgroundColor = "#d4edda";
      r.style.borderLeft = "4px solid #155724";
    }
  });
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

  Array.from(listaGiocatori.children).forEach(row => {
    const nome = row.children[0].textContent.toLowerCase();
    const r = row.children[1].textContent.toLowerCase();
    const s = row.children[2].textContent.toLowerCase();
    const ruoliGiocatore = r.split(/[,;\s]+/).map(part => part.trim());
    const key = normalize(nome);


    const matchInput = !ruoloTesto || ruoliGiocatore.some(part => part.includes(ruoloTesto));
    const matchSelect = !ruoloSelect.length || ruoloSelect.some(rs => ruoliGiocatore.includes(rs));
    const matchSquadra = !squadra || s === squadra;
    const matchNome = !cerca || nome.includes(cerca);

   row.style.display = (matchInput && matchSelect && matchSquadra && matchNome) ? "" : "none";
  });
}

[filtroRuolo, filtroSerieA, searchInput, cercaRuolo].forEach(el => {
  if (el) el.addEventListener("input", debounce(filtraLista, 150));
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

  await caricaGiocatori();
  await caricaPick();
  popolaListaDisponibili();
  aggiornaChiamatePerSquadra();
  aggiornaStatoInterattivoLista();
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
  const sets = getSpecialPickSets(tab);

  righe.forEach(r => {
    const celle = r.querySelectorAll("td");
    const pickNum = parseInt(celle[0]?.textContent);
    const team = celle[1]?.textContent?.trim();
    const nome = celle[2]?.textContent?.trim();
    if (!team || !nome || isNaN(pickNum)) return;

    const key = normalize(nome);
    const ruolo = mappaGiocatori[key]?.ruolo || "";
    const isU21 = mappaGiocatori[key]?.u21?.toLowerCase() === "u21";
    const nAssoluto = indexMap[`${team}|${pickNum}`] || 1;

    if (!riepilogo[team]) riepilogo[team] = [];
    riepilogo[team].push({ n: nAssoluto, nome, ruolo, isU21, pickNum });
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

  // Badge FP se la pick è in uno slot FP
if (sets.fp.has(p.pickNum || 0)) {
  parts.push('<span class="badge fp">⭐</span>');
}

// Badge U21 se la pick è in uno slot U21
if (sets.u21.has(p.pickNum || 0)) {
  parts.push('<span class="badge u21">🐣</span>');
}

  // (opzionale) badge u21 anagrafico dal CSV
  if (p.isU21) {
    parts.push('<span class="badge u21-flag">u21</span>');
  }

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
window.ordinaLista = ordinaLista;
