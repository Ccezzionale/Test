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
const mappaGiocatoriDraftById = {};

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
let allTeams = [];
let adminFlagPlayers = [];
let lastDraftOrderRows = [];
let lastDraftPickRows = [];
let lastDraftTeams = [];
let lastDraftVisualRows = [];
let lastAcceptedTradeAssets = [];
const tradeColorByPickNumber = new Map();

const TRADE_COLOR_CLASSES = [
  "trade-color-1",
  "trade-color-2",
  "trade-color-3",
  "trade-color-4",
  "trade-color-5",
  "trade-color-6",
  "trade-color-7",
  "trade-color-8"
];

function getTradeColorClass(tradeId) {
  if (!tradeId) return "";

  let hash = 0;
  const text = String(tradeId);

  for (let i = 0; i < text.length; i++) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash);
  }

  return TRADE_COLOR_CLASSES[Math.abs(hash) % TRADE_COLOR_CLASSES.length];
}

function rebuildTradeColorMap(tradeAssets = [], draftPicks = []) {
  tradeColorByPickNumber.clear();

  const draftPickById = new Map(
    (draftPicks || []).map(pick => [String(pick.id), pick])
  );

  (tradeAssets || []).forEach(asset => {
    if (!asset.proposal_id) return;

    let pickNumber = null;

    if (asset.asset_type === "pick") {
      pickNumber = Number(asset.asset_id);
    }

    if (asset.asset_type === "player") {
      const draftPick = draftPickById.get(String(asset.asset_id));
      pickNumber = draftPick ? Number(draftPick.pick_number) : null;
    }

    if (!pickNumber) return;

    tradeColorByPickNumber.set(
      Number(pickNumber),
      getTradeColorClass(asset.proposal_id)
    );
  });
}

function renderTradeBadgeHtml(pickNumber, className = "desktop-pick-trade") {
  const colorClass = tradeColorByPickNumber.get(Number(pickNumber)) || "trade-color-1";

  return `
    <span class="${className} ${colorClass}" title="Pick acquisita via trade">
      ↔
    </span>
  `;
}


function normalize(nome) { return nome.trim().toLowerCase(); }

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getTeamNameFromDraftCell(cell) {
  if (!cell) return "";
  return cell.childNodes?.[0]?.textContent?.trim() || cell.textContent?.trim() || "";
}

function isGoalkeeperRole(ruolo) {
  const parts = String(ruolo || "")
    .toLowerCase()
    .split(/[,;\s/]+/)
    .map(x => x.trim())
    .filter(Boolean);

  return (
    parts.includes("p") ||
    parts.includes("por") ||
    parts.includes("portiere")
  );
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

  allTeams = teams || [];

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

const tab = urlParams.get("tab") || (
  window.location.href.includes("conference")
    ? "Draft Conference"
    : "Draft Championship"
);

const draftDisplayName =
  tab === "Draft Conference"
    ? "Draft Conference League"
    : tab === "Draft Championship"
      ? "Draft Conference Championship"
      : tab;

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
const visualTeamName = getCurrentPickVisualTeamName(pick) || riga["Fanta Team"];

prossima = {
  fantaTeam: visualTeamName,
  pick: riga["Pick"]
};
    }
  });

  dati.forEach((riga, i) => {
    const tr = document.createElement("tr");
const nome = riga["Giocatore"]?.trim() || "";
const fantaTeam = riga["Fanta Team"];
const pick = riga["Pick"];
const isTradedPick = riga["IsTradedPick"] === true;

if (isTradedPick) {
  tr.classList.add("traded-pick-row");
  tr.dataset.tradedPick = "true";
}

tr.innerHTML = `
  <td>${pick}</td>
  <td>
    ${escapeHtml(fantaTeam)}
    ${isTradedPick ? '<span class="trade-pick-badge" title="Pick acquisita via trade">🔁</span>' : ''}
  </td>
  <td>${escapeHtml(nome)}</td>
`;

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

    const tableScroll = document.querySelector("#draft-board-panel .table-scroll");

    if (tableScroll) {
      setTimeout(() => {
        const rowTop = rigaCorrente.offsetTop;
        const containerHeight = tableScroll.clientHeight;
        const rowHeight = rigaCorrente.offsetHeight;

        tableScroll.scrollTo({
          top: Math.max(0, rowTop - containerHeight / 2 + rowHeight / 2),
          behavior: "smooth"
        });
      }, 120);
    }
  }
}

  if (window.innerWidth <= 768 && prossimaIndex >= 0) {
    const start = Math.max(0, prossimaIndex - 2);
    const end = prossimaIndex + 3;

    document.querySelectorAll("#tabella-pick tbody tr").forEach((riga, i) => {
      if (i >= start && i < end) {
        riga.classList.add("show-mobile");
      }
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

  /* Mobile Draft Companion hero */
  const mobileLivePick = document.getElementById("mobile-live-pick");
  const mobileLiveTeam = document.getElementById("mobile-live-team");
  const mobileLiveSub = document.getElementById("mobile-live-sub");
  const mobileLiveLogo = document.getElementById("mobile-live-logo");
  const mobileCompanionProgress = document.getElementById("mobile-companion-progress");
  const mobileCompanionNext = document.getElementById("mobile-companion-next");

  const mobilePickedCount = dati.filter(r => (r["Giocatore"] || "").trim()).length;
  const mobileTotalCount = dati.length;
  const mobileNextRows = dati
    .filter(r => Number(r["Pick"]) > Number(currentPick || 0) && !(r["Giocatore"] || "").trim())
    .slice(0, 1);

  if (mobileCompanionProgress) {
    mobileCompanionProgress.textContent = `${mobilePickedCount}/${mobileTotalCount}`;
  }

  if (mobileCompanionNext) {
    mobileCompanionNext.textContent = mobileNextRows[0]?.["Fanta Team"] || "--";
  }

  if (mobileLivePick && mobileLiveTeam && mobileLiveSub) {
    if (currentDraftState?.is_open === false) {
      mobileLivePick.textContent = "RFA";
      mobileLiveTeam.textContent = "Draft fermo";
      mobileLiveSub.textContent = "Decisione RFA in attesa";
      if (mobileLiveLogo) mobileLiveLogo.style.display = "none";
    } else if (prossima) {
      mobileLivePick.textContent = `Pick #${prossima.pick}`;
      mobileLiveTeam.textContent = prossima.fantaTeam;
      mobileLiveSub.textContent = "Tutto ciò che serve, nel momento giusto.";

      if (mobileLiveLogo) {
        mobileLiveLogo.src = getDraftTeamLogoPath(prossima.fantaTeam);
        mobileLiveLogo.alt = prossima.fantaTeam;
        mobileLiveLogo.style.display = "block";
      }
    } else {
      mobileLivePick.textContent = "Fine";
      mobileLiveTeam.textContent = "Draft completato";
      mobileLiveSub.textContent = "Tutte le pick sono state effettuate";
      if (mobileLiveLogo) mobileLiveLogo.style.display = "none";
    }
  }

  aggiornaDesktopDraftRoom(dati, prossima);
}


// ========== Desktop Draft Room visuale ==========
let desktopDraftRoomReady = false;
let desktopResizeTimer = null;

function getDraftTeamLogoPath(team) {
  return `img/${team}.webp`;
}



function getDraftPlayerInfoByName(nome) {
  const key = normalize(nome || "");
  return mappaGiocatoriDraft[key] || mappaGiocatori[key] || {};
}

function getDraftPlayerInfoByPick(pick) {
  if (pick?.player_id) {
    const byId = mappaGiocatoriDraftById[String(pick.player_id)];
    if (byId) return byId;
  }

  return getDraftPlayerInfoByName(pick?.player_name || "");
}

function ensureDesktopDraftRoomShell() {
  const page = document.querySelector(".page-shell") || document.querySelector("main") || document.body;
  const container = document.querySelector(".container");
  if (!page || !container) return null;

  let shell = document.getElementById("desktop-draft-room");

  if (!shell) {
    shell = document.createElement("section");
    shell.id = "desktop-draft-room";
    shell.className = "desktop-draft-room";
    shell.innerHTML = `
      <div class="desktop-live-bar">
        <div class="desktop-live-main">
          <div class="desktop-live-icon">⏱️</div>
          <div>
            <span class="desktop-live-kicker">ON THE CLOCK</span>
            <strong id="desktop-live-team">-</strong>
          </div>
        </div>
        <div class="desktop-live-stat">
          <span>Pick attuale</span>
          <strong id="desktop-live-pick">-</strong>
        </div>
        <div class="desktop-live-queue">
          <span>Prossimi in ordine</span>
          <div id="desktop-next-queue" class="desktop-next-queue"></div>
        </div>
        <div class="desktop-live-stat desktop-live-stat-small">
          <span>Round</span>
          <strong id="desktop-live-round">-</strong>
        </div>
        <div class="desktop-live-stat desktop-live-stat-small">
          <span>Chiamate</span>
          <strong id="desktop-live-progress">-</strong>
        </div>
      </div>

      <div class="desktop-draft-grid">
        <aside class="desktop-recent-panel panel">
          <div class="desktop-mini-header">
            <strong>Ultime chiamate</strong>
            <span id="desktop-recent-count">Live</span>
          </div>
          <div id="desktop-recent-list" class="desktop-recent-list"></div>
        </aside>

        <section class="desktop-board-panel panel">
          <div class="desktop-board-header">
            <div>
              <h2 id="desktop-board-title">Draft Room</h2>
              <p>Tabellone dinamico completo delle chiamate</p>
            </div>
            <button type="button" class="desktop-board-refresh" onclick="caricaPick(); aggiornaChiamatePerSquadra();">↻ Ricarica</button>
          </div>
          <div id="desktop-draft-board-grid" class="desktop-draft-board-grid"></div>
        </section>

        <aside id="desktop-player-pool-slot" class="desktop-player-pool-slot"></aside>
      </div>
    `;

    const hero = document.querySelector(".hero");
    if (hero && hero.parentNode) {
      hero.insertAdjacentElement("afterend", shell);
    } else {
      page.insertBefore(shell, container);
    }
  }

  document.body.classList.add("desktop-draft-v2");
  placePlayerPoolForViewport();

  if (!desktopDraftRoomReady) {
    desktopDraftRoomReady = true;
    window.addEventListener("resize", () => {
      clearTimeout(desktopResizeTimer);
      desktopResizeTimer = setTimeout(placePlayerPoolForViewport, 120);
    });
  }

  return shell;
}

function placePlayerPoolForViewport() {
  const pool = document.querySelector(".lista-container");
  const desktopSlot = document.getElementById("desktop-player-pool-slot");
  const container = document.querySelector(".container");
  if (!pool || !desktopSlot || !container) return;

  if (window.innerWidth >= 1101) {
    if (pool.parentElement !== desktopSlot) desktopSlot.appendChild(pool);
  } else {
    if (pool.parentElement !== container) container.appendChild(pool);
  }
}

function renderDesktopBadgesForPlayer(playerInfo) {
  return renderDraftBadgeImages({
    is_fp: playerInfo.is_fp,
    is_fp_keeper: playerInfo.is_fp_keeper,
    fp_keeper_year: playerInfo.fp_keeper_year,
    is_u21: playerInfo.is_u21,
    is_u21_slot: playerInfo.is_u21_slot,
    is_u21_keeper: playerInfo.is_u21_keeper,
    u21_keeper_year: playerInfo.u21_keeper_year,
    is_top6_protected: playerInfo.is_top6_protected,
    is_rfa_matched: playerInfo.is_rfa_matched
  }, { showEligibleU21: false });
}

const DESKTOP_FIXED_ROUNDS = 23;

function getTeamIdByNameDesktop(teamName) {
  const team = (lastDraftTeams || []).find(t => String(t.name || "") === String(teamName || ""));
  return team?.id || null;
}

function getTeamByIdDesktop(teamId) {
  return (lastDraftTeams || []).find(t => String(t.id) === String(teamId)) || null;
}

function buildDesktopFixedBoardColumns() {
  const visualRows = lastDraftVisualRows || [];
  const orderRows = lastDraftOrderRows || [];
  const pickRows = lastDraftPickRows || [];

  const picksMap = {};
  pickRows.forEach(pick => {
    picksMap[Number(pick.pick_number)] = pick;
  });

  const orderMap = {};
  orderRows.forEach(row => {
    orderMap[Number(row.pick_number)] = row;
  });

// Se esiste draft_visual_order, usiamo quello per posizionare le card.
// Ma l'ordine delle colonne deve restare quello originale del draft,
// altrimenti una trade visuale sposta anche le squadre/header.
if (visualRows.length) {
  const originalTeamsOrder = [];

  orderRows.forEach(row => {
    const originalTeamId = row.original_team_id || row.team_id;
    if (!originalTeamId) return;

    if (!originalTeamsOrder.some(t => String(t.id) === String(originalTeamId))) {
      const team = getTeamByIdDesktop(originalTeamId);
      if (team) originalTeamsOrder.push(team);
    }
  });

  const teamsOrder = originalTeamsOrder;

  return teamsOrder.map(team => {
      const teamVisualRows = visualRows
        .filter(row => String(row.team_id) === String(team.id))
        .sort((a, b) => Number(a.visual_round) - Number(b.visual_round))
        .slice(0, DESKTOP_FIXED_ROUNDS);

      const rounds = Array.from({ length: DESKTOP_FIXED_ROUNDS }, (_, index) => {
        const visualRound = index + 1;
        const visualRow = teamVisualRows.find(
          row => Number(row.visual_round) === visualRound
        );

        if (!visualRow) {
          return {
            round: visualRound,
            pick_number: null,
            pickData: null,
            isTradedPick: false
          };
        }

        const pickNumber = Number(visualRow.pick_number);
        const orderRow = orderMap[pickNumber];

        const isTradedPick =
          orderRow?.original_team_id &&
          String(orderRow.original_team_id) !== String(orderRow.team_id);

        return {
          round: visualRound,
          pick_number: pickNumber,
          pickData: picksMap[pickNumber] || null,
          isTradedPick
        };
      });

      return {
        team,
        rounds
      };
    });
  }

  // Fallback vecchio: se manca draft_visual_order, usa draft_order.
  const teamsOrder = [];

  orderRows.forEach(row => {
    const originalTeamId = row.original_team_id || row.team_id;
    if (!originalTeamId) return;

    if (!teamsOrder.some(t => String(t.id) === String(originalTeamId))) {
      const team = getTeamByIdDesktop(originalTeamId);
      if (team) teamsOrder.push(team);
    }
  });

  return teamsOrder.map(team => {
    const baseSlots = orderRows
      .filter(row => String(row.original_team_id || row.team_id) === String(team.id))
      .sort((a, b) => Number(a.pick_number) - Number(b.pick_number))
      .slice(0, DESKTOP_FIXED_ROUNDS);

    const ownedPicks = orderRows
      .filter(row => String(row.team_id) === String(team.id))
      .sort((a, b) => Number(a.pick_number) - Number(b.pick_number));

    const rounds = baseSlots.map((slot, index) => {
      const ownedPick = ownedPicks[index] || null;

      if (!ownedPick) {
        return {
          round: index + 1,
          pick_number: null,
          pickData: null,
          isTradedPick: false
        };
      }

      const isTradedPick =
        ownedPick.original_team_id &&
        String(ownedPick.original_team_id) !== String(ownedPick.team_id);

      return {
        round: index + 1,
        pick_number: Number(ownedPick.pick_number),
        pickData: picksMap[Number(ownedPick.pick_number)] || null,
        isTradedPick
      };
    });

    return {
      team,
      rounds
    };
  });
}

function getCurrentPickVisualTeamName(pickNumber) {
  const visualRow = (lastDraftVisualRows || []).find(
    row => Number(row.pick_number) === Number(pickNumber)
  );

  if (!visualRow) return "";

  const team = (lastDraftTeams || []).find(
    t => String(t.id) === String(visualRow.team_id)
  );

  return team?.name || "";
}

function getDesktopCurrentPickOwnerTeamName(currentPick) {
  const visualTeamName = getCurrentPickVisualTeamName(currentPick);

  if (visualTeamName) return visualTeamName;

  const orderRow = (lastDraftOrderRows || []).find(
    row => Number(row.pick_number) === Number(currentPick)
  );

  if (!orderRow) return "";

  const team = getTeamByIdDesktop(orderRow.team_id);
  return team?.name || "";
}


function applyDesktopLiveTeamSize() {
  const liveTeam = document.getElementById("desktop-live-team");
  if (!liveTeam) return;

  const name = String(liveTeam.textContent || "").trim();
  const len = name.length;

  let fontSize = "3.25rem";
  let lineHeight = "1.06";
  let whiteSpace = "nowrap";

  // Nomi medio-lunghi tipo MinneSota Snakes / Team Bartowski
  // restano grandi.
  if (len >= 22) {
    fontSize = "2.25rem";
    lineHeight = "1.04";
    whiteSpace = "normal";
  } else if (len >= 18) {
    fontSize = "2.75rem";
    lineHeight = "1.05";
    whiteSpace = "nowrap";
  }

  liveTeam.style.setProperty("font-size", fontSize, "important");
  liveTeam.style.setProperty("line-height", lineHeight, "important");
  liveTeam.style.setProperty("white-space", whiteSpace, "important");
  liveTeam.style.setProperty("overflow", "visible", "important");
  liveTeam.style.setProperty("text-overflow", "clip", "important");
  liveTeam.style.setProperty("letter-spacing", "-0.055em", "important");
  liveTeam.style.setProperty("padding-bottom", "8px", "important");
}

function aggiornaDesktopDraftRoom(dati = [], prossima = null) {
  const shell = ensureDesktopDraftRoomShell();
  if (!shell || !Array.isArray(dati)) return;

  const totalPicks = dati.length;
  const picked = dati.filter(r => (r["Giocatore"] || "").trim()).length;
  const currentPick = Number(currentDraftState?.current_pick || 0);

const title = document.getElementById("desktop-board-title");
if (title) title.textContent = draftDisplayName || "Draft Room";

  const liveTeam = document.getElementById("desktop-live-team");
  const livePick = document.getElementById("desktop-live-pick");
  const liveRound = document.getElementById("desktop-live-round");
  const liveProgress = document.getElementById("desktop-live-progress");

  const fixedColumns = buildDesktopFixedBoardColumns();
  const maxRounds = DESKTOP_FIXED_ROUNDS;

  const currentRound = currentPick && fixedColumns.length
    ? Math.ceil(currentPick / fixedColumns.length)
    : "-";
  if (currentDraftState?.is_open === false) {
    if (liveTeam) liveTeam.textContent = "Draft fermo";
    if (livePick) livePick.textContent = "RFA";
  } else if (prossima) {
    if (liveTeam) liveTeam.textContent = prossima.fantaTeam || getDesktopCurrentPickOwnerTeamName(currentPick) || "-";
    if (livePick) livePick.textContent = `Pick #${prossima.pick}`;
  } else {
    if (liveTeam) liveTeam.textContent = "Draft completato";
    if (livePick) livePick.textContent = "Fine";
  }
  
applyDesktopLiveTeamSize();

  if (liveRound) liveRound.textContent = `${currentRound}/${maxRounds}`;
  if (liveProgress) liveProgress.textContent = `${picked}/${totalPicks}`;

  const queueEl = document.getElementById("desktop-next-queue");
  if (queueEl) {
    const queueRows = dati
      .filter(r => Number(r["Pick"]) >= currentPick && !(r["Giocatore"] || "").trim())
      .slice(0, 6);

    queueEl.innerHTML = queueRows.map((r, index) => {
      const team = r["Fanta Team"] || "";
      const arrow = index === 0 ? "" : `<span class="desktop-queue-arrow">›</span>`;

      return `
        ${arrow}
        <span class="desktop-queue-logo" title="${escapeHtml(team)}">
          <img src="${getDraftTeamLogoPath(team)}" alt="${escapeHtml(team)}" onerror="this.style.display='none'">
        </span>
      `;
    }).join("") || `<span class="desktop-empty-muted">Completato</span>`;
  }

const recentEl = document.getElementById("desktop-recent-list");
const recentCount = document.getElementById("desktop-recent-count");

if (recentEl) {
  const teamsById = new Map(
    (lastDraftTeams || []).map(team => [String(team.id), team.name])
  );

  const recent = (lastDraftPickRows || [])
    .filter(pick => {
      const playerName = String(pick.player_name || "").trim();
      const source = String(pick.source || "draft").toUpperCase();

      if (!playerName) return false;

      // Escludiamo le scelte automatiche/pre-draft
      if (source === "FP") return false;
      if (source === "U21_KEEPER") return false;

      return true;
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at || 0).getTime();
      const dateB = new Date(b.created_at || 0).getTime();

      if (dateB !== dateA) return dateB - dateA;

      return Number(b.pick_number || 0) - Number(a.pick_number || 0);
    })
    .slice(0, 8);

  if (recentCount) recentCount.textContent = `${recent.length}`;

  recentEl.innerHTML = recent.length
    ? recent.map(pick => {
        const nome = pick.player_name || "";
        const team = teamsById.get(String(pick.team_id)) || "";
        const info = getDraftPlayerInfoByName(nome);

        return `
          <div class="desktop-recent-row">
            <span class="desktop-recent-pick">#${escapeHtml(pick.pick_number)}</span>
            <img src="${getDraftTeamLogoPath(team)}" alt="${escapeHtml(team)}" onerror="this.style.display='none'">
            <span class="desktop-recent-info">
              <strong>${escapeHtml(nome)}</strong>
              <small>${escapeHtml(team)} · ${escapeHtml(info.ruolo || "-")}${info.squadra ? ` · ${escapeHtml(info.squadra)}` : ""}</small>
            </span>
            <span class="desktop-recent-badges">${renderDesktopBadgesForPlayer(info)}</span>
          </div>
        `;
      }).join("")
    : `<div class="desktop-empty-state">Nessuna chiamata ancora.</div>`;
}

  const boardEl = document.getElementById("desktop-draft-board-grid");
  if (!boardEl) return;

  boardEl.style.setProperty("--desktop-rounds", String(maxRounds));

  const roundLabels = Array.from(
    { length: maxRounds },
    (_, i) => `<div class="desktop-round-label">R${i + 1}</div>`
  ).join("");

const teamColumns = fixedColumns.map(column => {
  const team = column.team;
  const teamName = team.name || "";
  const logo = getDraftTeamLogoPath(teamName);

  const draftedPlayersForTeam = column.rounds
    .map(cell => cell.pickData)
    .filter(Boolean)
    .map(pick => getDraftPlayerInfoByPick(pick));

  const u21Count = draftedPlayersForTeam.filter(info =>
    info?.is_u21_slot === true
  ).length;

  const goalkeeperCount = draftedPlayersForTeam.filter(info =>
    isGoalkeeperRole(info?.ruolo || "")
  ).length;

  const u21Ok = u21Count >= 4;
  const porOk = goalkeeperCount >= 2;

  const slots = column.rounds.map(cell => {
      const pickNum = cell.pick_number;
      const pick = cell.pickData;
      const nome = (pick?.player_name || "").trim();
      const isCurrent = Number(pickNum) === currentPick && currentDraftState?.is_open !== false;
     const info = nome ? getDraftPlayerInfoByPick(pick) : {};

      const filledClass = nome ? "is-filled" : "is-empty";
      const currentClass = isCurrent ? "is-current" : "";
      const tradedClass = cell.isTradedPick ? "is-traded" : "";

      return `
        <div class="desktop-pick-slot ${filledClass} ${currentClass} ${tradedClass}" title="${pickNum ? `Pick #${escapeHtml(pickNum)}` : `Round ${cell.round}`}">
          <div class="desktop-pick-topline">
            <span class="desktop-pick-number">
              ${pickNum ? escapeHtml(pickNum) : "—"}
            </span>
            ${cell.isTradedPick ? renderTradeBadgeHtml(pickNum, "desktop-pick-trade") : ""}
          </div>

          ${pickNum ? (
            nome ? `
              <strong>${escapeHtml(nome)}</strong>
              <small>
                ${escapeHtml(info.ruolo || "-")}
                ${info.squadra ? ` · ${escapeHtml(info.squadra)}` : ""}
                ${info.quotazione !== undefined && info.quotazione !== "" ? ` · Q${escapeHtml(info.quotazione)}` : ""}
              </small>
              <span class="desktop-pick-badges">${renderDesktopBadgesForPlayer(info)}</span>
            ` : `
              <strong>Pick #${escapeHtml(pickNum)}</strong>
              <small>In attesa</small>
            `
          ) : `
            <strong>Pick ceduta</strong>
            <small>Nessuna pick in questo slot</small>
          `}
        </div>
      `;
    }).join("");

    return `
      <article class="desktop-team-column">
<div class="desktop-team-head">
  <img src="${logo}" alt="${escapeHtml(teamName)}" onerror="this.style.visibility='hidden'">
  <strong>${escapeHtml(teamName)}</strong>
</div>

<div class="desktop-team-rules">
  <span class="desktop-team-rule-chip ${u21Ok ? "ok" : "warn"}">
    U21 ${Math.min(u21Count, 4)}/4
  </span>
  <span class="desktop-team-rule-chip ${porOk ? "ok" : "warn"}">
    POR ${goalkeeperCount}/2
  </span>
</div>
        <div class="desktop-team-slots">${slots}</div>
      </article>
    `;
  }).join("");

  boardEl.innerHTML = `
    <div class="desktop-round-rail">
      <div class="desktop-round-spacer"></div>
      ${roundLabels}
    </div>
    <div class="desktop-teams-track">${teamColumns}</div>
  `;
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

const { data: visualRows, error: visualError } = await supabase
  .from("draft_visual_order")
  .select("*")
  .eq("draft_name", tab)
  .order("visual_round", { ascending: true });

if (visualError) throw visualError;

    const { data: acceptedTrades, error: acceptedTradesError } = await supabase
  .from("trade_proposals")
  .select("id")
  .eq("draft_name", tab)
  .eq("status", "accepted");

if (acceptedTradesError) throw acceptedTradesError;

const acceptedTradeIds = (acceptedTrades || []).map(trade => trade.id);

let acceptedTradeAssets = [];

if (acceptedTradeIds.length) {
  const { data: tradeAssetsData, error: tradeAssetsError } = await supabase
    .from("trade_assets")
    .select("proposal_id, asset_type, asset_id")
    .in("proposal_id", acceptedTradeIds);

  if (tradeAssetsError) throw tradeAssetsError;

  acceptedTradeAssets = tradeAssetsData || [];
}

lastAcceptedTradeAssets = acceptedTradeAssets;
rebuildTradeColorMap(lastAcceptedTradeAssets, pickRows || []);

lastDraftTeams = teams || [];
lastDraftOrderRows = orderRows || [];
lastDraftPickRows = pickRows || [];
lastDraftVisualRows = visualRows || [];

Object.keys(mappaGiocatoriDraft).forEach(k => delete mappaGiocatoriDraft[k]);
    Object.keys(mappaGiocatoriDraftById).forEach(k => delete mappaGiocatoriDraftById[k]);

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
is_rfa_matched,
serie_a_team,
quotation
    `)
    .in("id", draftPlayerIds);

  if (draftPlayersError) throw draftPlayersError;

(draftPlayers || []).forEach(p => {
  const key = normalize(p.name || "");

  const info = {
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
    is_rfa_matched: !!p.is_rfa_matched,
    squadra: p.serie_a_team || "",
    quotazione: p.quotation ?? ""
  };

  mappaGiocatoriDraft[key] = info;
  mappaGiocatoriDraftById[String(p.id)] = info;
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

  const isTradedPick =
    r.original_team_id &&
    r.team_id &&
    String(r.original_team_id) !== String(r.team_id);

  return {
    "Pick": r.pick_number,
    "Fanta Team": team ? team.name : "",
    "Giocatore": pick ? pick.player_name : "",
    "IsTradedPick": isTradedPick
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

  const pickCorrente = Number(currentDraftState.current_pick || 0);
  if (!pickCorrente) return false;

  const visualTeamName = getCurrentPickVisualTeamName(pickCorrente);

  if (visualTeamName) {
    return String(visualTeamName) === String(currentTeamName);
  }

  const righe = document.querySelectorAll("#tabella-pick tbody tr");

  for (let r of righe) {
    const celle = r.querySelectorAll("td");
    const pick = parseInt(celle[0]?.textContent || "0");
    const squadra = getTeamNameFromDraftCell(celle[1]);

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
    alert(result?.message || result?.error || "Errore nell'invio della pick.");
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

function getAdminFlagPlayerSelected() {
  const playerSelect = document.getElementById("admin-flags-player");
  const playerId = playerSelect?.value;
  if (!playerId) return null;

  return adminFlagPlayers.find(p => String(p.id) === String(playerId)) || null;
}

function setAdminCheckbox(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = value === true;
}

function getAdminCheckbox(id) {
  const el = document.getElementById(id);
  return el ? el.checked === true : false;
}

function setAdminSelectValue(id, value, fallback = "") {
  const el = document.getElementById(id);
  if (el) el.value = value ?? fallback;
}

function populateAdminTeamSelect() {
  const teamSelect = document.getElementById("admin-flags-team");
  if (!teamSelect) return;

  teamSelect.innerHTML = `<option value="">-- Seleziona squadra --</option>`;

  allTeams
    .slice()
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
    .forEach(team => {
      const opt = document.createElement("option");
      opt.value = team.id;
      opt.textContent = team.name;
      teamSelect.appendChild(opt);
    });
}

function getStatusFromPlayerFlags(player) {
  if (!player) return "normal";

  if (player.is_fp_keeper === true) {
    return Number(player.fp_keeper_year) === 2 ? "fp_2" : "fp_1";
  }

  if (player.is_u21_keeper === true) {
    return Number(player.u21_keeper_year) === 2 ? "u21_keeper_2" : "u21_keeper_1";
  }

  if (player.is_top6_protected === true) {
    return "p6";
  }

  if (player.is_rfa_matched === true) {
    return "rfa_matched";
  }

  if (player.is_u21 === true) {
    return "u21_classic";
  }

  return "normal";
}

function updateAdminStatusNote() {
  const statusSelect = document.getElementById("admin-player-status");
  const noteEl = document.getElementById("admin-player-status-note");
  if (!statusSelect || !noteEl) return;

  const status = statusSelect.value;

  const notes = {
    normal: "Rimuove tutti i badge/status speciali dal giocatore.",
    fp_1: "Franchise Player primo anno.",
    fp_2: "Franchise Player secondo anno. Verrà impostato automaticamente anche come Protetto P6 🔒.",
    u21_classic: "Giocatore eleggibile U21 nel listone, senza essere keeper o slot draft.",
    u21_keeper_1: "U21 confermato primo anno.",
    u21_keeper_2: "U21 confermato secondo anno.",
    p6: "Giocatore protetto P6.",
    rfa_matched: "RFA pareggiato."
  };

  noteEl.textContent = notes[status] || "Seleziona uno status.";
}

function syncAdminPlayerFlagsForm() {
  const player = getAdminFlagPlayerSelected();
  const statusEl = document.getElementById("admin-player-flags-status");
  const statusSelect = document.getElementById("admin-player-status");

  if (!player) {
    setAdminSelectValue("admin-flags-team", "");
    if (statusSelect) statusSelect.value = "normal";
    if (statusEl) statusEl.textContent = "";
    updateAdminStatusNote();
    return;
  }

  const suggestedTeamId =
    player.top6_protected_team_id ||
    player.owner_team_id ||
    "";

  setAdminSelectValue("admin-flags-team", suggestedTeamId);

  if (statusSelect) {
    statusSelect.value = getStatusFromPlayerFlags(player);
  }

  if (statusEl) {
    statusEl.textContent = `Selezionato: ${player.name}`;
  }

  updateAdminStatusNote();
}

async function caricaAdminPlayerFlagsPanel() {
  if (!isAdmin) return;

  const playerSelect = document.getElementById("admin-flags-player");
  if (!playerSelect) return;

  populateAdminTeamSelect();

  const { data, error } = await supabase
    .from("players")
    .select(`
      id,
      name,
      role,
      role_mantra,
      serie_a_team,
      pool,
      owner_team_id,
      is_fp,
      is_fp_keeper,
      fp_keeper_year,
      is_u21,
      is_u21_slot,
      is_u21_keeper,
      u21_keeper_year,
      is_top6_protected,
      top6_protected_team_id,
      is_rfa_matched
    `)
    .eq("pool", draftPool)
    .order("name", { ascending: true });

  if (error) {
    console.error("Errore caricamento admin player flags:", error);
    const statusEl = document.getElementById("admin-player-flags-status");
    if (statusEl) statusEl.textContent = "❌ Errore caricamento giocatori.";
    return;
  }

  adminFlagPlayers = data || [];

  playerSelect.innerHTML = `<option value="">-- Seleziona giocatore --</option>`;

  adminFlagPlayers.forEach(player => {
    const opt = document.createElement("option");
    opt.value = player.id;

    const role = player.role || player.role_mantra || "-";
    const serieA = player.serie_a_team || "-";

    opt.textContent = `${player.name} · ${role} · ${serieA}`;
    playerSelect.appendChild(opt);
  });

  playerSelect.onchange = syncAdminPlayerFlagsForm;

const statusSelect = document.getElementById("admin-player-status");
if (statusSelect && !statusSelect.dataset.bound) {
  statusSelect.addEventListener("change", updateAdminStatusNote);
  statusSelect.dataset.bound = "1";
}

  const saveBtn = document.getElementById("admin-save-player-flags-btn");
  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.addEventListener("click", adminSavePlayerFlags);
    saveBtn.dataset.bound = "1";
  }
}

async function adminSavePlayerFlags() {
  if (!isAdmin) {
    alert("Solo admin.");
    return;
  }

  const statusEl = document.getElementById("admin-player-flags-status");
  const player = getAdminFlagPlayerSelected();

  if (!player) {
    if (statusEl) statusEl.textContent = "Seleziona un giocatore.";
    return;
  }

  const teamId = document.getElementById("admin-flags-team")?.value || null;
  const status = document.getElementById("admin-player-status")?.value || "normal";

  const statusesThatNeedTeam = [
    "fp_1",
    "fp_2",
    "u21_keeper_1",
    "u21_keeper_2",
    "p6"
  ];

  if (statusesThatNeedTeam.includes(status) && !teamId) {
    if (statusEl) {
      statusEl.textContent = "❌ Seleziona una squadra per questo status.";
    }
    return;
  }

  const payload = {
    player_id: player.id,
    keeper_team_id: teamId,

    is_fp: false,
    is_fp_keeper: false,
    fp_keeper_year: null,

    is_u21: false,
    is_u21_slot: false,
    is_u21_keeper: false,
    u21_keeper_year: null,

    is_top6_protected: false,
    is_rfa_matched: false
  };

  if (status === "fp_1") {
    payload.is_fp = true;
    payload.is_fp_keeper = true;
    payload.fp_keeper_year = 1;
  }

  if (status === "fp_2") {
    payload.is_fp = true;
    payload.is_fp_keeper = true;
    payload.fp_keeper_year = 2;
    payload.is_top6_protected = true;
  }

  if (status === "u21_classic") {
    payload.is_u21 = true;
  }

  if (status === "u21_keeper_1") {
    payload.is_u21 = true;
    payload.is_u21_keeper = true;
    payload.u21_keeper_year = 1;
  }

  if (status === "u21_keeper_2") {
    payload.is_u21 = true;
    payload.is_u21_keeper = true;
    payload.u21_keeper_year = 2;
  }

  if (status === "p6") {
    payload.is_top6_protected = true;
  }

  if (status === "rfa_matched") {
    payload.is_rfa_matched = true;
  }

  const statusLabel = document
    .querySelector(`#admin-player-status option[value="${status}"]`)
    ?.textContent || status;

  const confirmMessage =
    `Vuoi aggiornare ${player.name}?\n\n` +
    `Nuovo status: ${statusLabel}`;

  if (!confirm(confirmMessage)) return;

  if (statusEl) statusEl.textContent = "⏳ Salvataggio status giocatore...";

  try {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      if (statusEl) statusEl.textContent = "❌ Sessione non valida.";
      return;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/admin-update-player-flags`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${sessionData.session.access_token}`,
          "apikey": supabaseKey
        },
        body: JSON.stringify(payload)
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Errore admin-update-player-flags:", result);
      if (statusEl) statusEl.textContent = `❌ ${result?.error || "Errore salvataggio"}`;
      return;
    }

    if (statusEl) {
      statusEl.textContent =
        status === "fp_2"
          ? `✅ Status aggiornato. FP 2° anno protetto automaticamente 🔒`
          : `✅ Status aggiornato: ${statusLabel}`;
    }

    await caricaKeeperSelectionsDraft();
    await caricaGiocatori();
    await caricaPick();
    popolaListaDisponibili();
    aggiornaChiamatePerSquadra();
    aggiornaStatoInterattivoLista();
    await caricaAdminPlayerFlagsPanel();

  } catch (err) {
    console.error("Errore salvataggio player status:", err);
    if (statusEl) statusEl.textContent = "❌ Errore durante il salvataggio.";
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

const giocatoriOrdinati = Object.values(mappaGiocatori).sort((a, b) => {
  const qA = Number(a.quotazione) || 0;
  const qB = Number(b.quotazione) || 0;

  if (qB !== qA) return qB - qA;

  return String(a.nome || "").localeCompare(String(b.nome || ""));
});

giocatoriOrdinati.forEach((player) => {
  const { id, nome, ruolo, squadra, quotazione } = player;

  const key = normalize(nome);
  if (giocatoriScelti.has(key)) return;

    const badges = renderDraftBadgeImages(player, { showEligibleU21: true });

  if (ruolo) ruoliTrovati.add(ruolo);
  if (squadra) squadreTrovate.add(squadra);

const tr = document.createElement("tr");
tr.dataset.playerId = id;
tr.dataset.isU21 = player.is_u21 === true ? "true" : "false";

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
  fantaTeam = getTeamNameFromDraftCell(celle[1]);
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
const hasU21 = row.dataset.isU21 === "true";
    const ruoliGiocatore = r
      .split(/[,;\s]+/)
      .map(part => part.trim())
      .filter(Boolean);

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

const shouldShow =
  matchInput &&
  matchSelect &&
  matchSquadra &&
  matchNome &&
  matchU21;

if (shouldShow) {
  row.style.removeProperty("display");
} else {
  row.style.setProperty("display", "none", "important");
}
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



// ========== Mobile Draft Companion navigation ==========
function setMobileDraftView(view = "home") {
  if (window.innerWidth > 768) return;

  const allowedViews = new Set(["home", "draft", "pool", "rose", "admin"]);
  const nextView = allowedViews.has(view) ? view : "home";

  document.body.classList.remove(
    "mobile-view-home",
    "mobile-view-draft",
    "mobile-view-pool",
    "mobile-view-rose",
    "mobile-view-admin"
  );

  document.body.classList.add(`mobile-view-${nextView}`);
  document.body.dataset.mobileDraftView = nextView;

  document.querySelectorAll("[data-mobile-view]").forEach(el => {
    el.classList.toggle("active", el.dataset.mobileView === nextView);
  });

  if (nextView === "draft") {
    setTimeout(() => {
      const draftScroll = document.querySelector("#draft-board-panel .table-scroll");
      const currentRow = document.querySelector("#tabella-pick tbody tr.next-pick");

      if (draftScroll && currentRow) {
        const rowTop = currentRow.offsetTop;
        const containerHeight = draftScroll.clientHeight;
        const rowHeight = currentRow.offsetHeight;

        draftScroll.scrollTo({
          top: Math.max(0, rowTop - containerHeight / 2 + rowHeight / 2),
          behavior: "smooth"
        });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 120);

    return;
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function initMobileDraftCompanionNavigation() {
  const bindNavigation = () => {
    document.querySelectorAll("[data-mobile-view]").forEach(el => {
      if (el.dataset.mobileDraftBound === "1") return;

      el.addEventListener("click", event => {
        if (window.innerWidth > 768) return;
        event.preventDefault();
        setMobileDraftView(el.dataset.mobileView || "home");
      });

      el.dataset.mobileDraftBound = "1";
    });
  };

  bindNavigation();

  if (window.innerWidth <= 768) {
    setMobileDraftView(document.body.dataset.mobileDraftView || "home");
  }

  let mobileViewResizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(mobileViewResizeTimer);
    mobileViewResizeTimer = setTimeout(() => {
      if (window.innerWidth <= 768) {
        bindNavigation();
        setMobileDraftView(document.body.dataset.mobileDraftView || "home");
      } else {
        document.body.classList.remove(
          "mobile-view-home",
          "mobile-view-draft",
          "mobile-view-pool",
          "mobile-view-rose",
          "mobile-view-admin"
        );
        document.querySelectorAll("[data-mobile-view]").forEach(el => el.classList.remove("active"));
      }
    }, 160);
  });
}

window.addEventListener("DOMContentLoaded", async function () {
  initMobileDraftCompanionNavigation();

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
    await caricaAdminPlayerFlagsPanel();
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
    const team = getTeamNameFromDraftCell(celle[1]);
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
  const indexMap = mappaIndiceAssolutoPerTeam();

  righe.forEach(r => {
    const celle = r.querySelectorAll("td");
const pickNum = parseInt(celle[0]?.textContent);
const team = getTeamNameFromDraftCell(celle[1]);
const nome = celle[2]?.textContent?.trim();
const isTradedPick = r.dataset.tradedPick === "true";

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
      pickNum,
isTradedPick
    });
  });

const container = document.getElementById("riepilogo-squadre");
if (!container) return;

/* Salva le squadre aperte prima del refresh */
const openTeams = new Set(
  Array.from(container.querySelectorAll(".team-accordion.is-open"))
    .map(card => card.dataset.teamName)
    .filter(Boolean)
);

container.innerHTML = "";

  Object.entries(riepilogo).forEach(([team, picks], index) => {
    picks.sort((a, b) => a.n - b.n);

    const u21Count = picks.filter(p => p.isU21).length;
const goalkeeperCount = picks.filter(p => isGoalkeeperRole(p.ruolo)).length;

const u21Missing = Math.max(0, 4 - u21Count);
const goalkeeperMissing = Math.max(0, 2 - goalkeeperCount);

const div = document.createElement("div");
div.className = "card-pick team-accordion";
div.dataset.teamName = team;

if (openTeams.has(team)) {
  div.classList.add("is-open");
}

    const logoPath = `img/${team}.webp`;

    const header = document.createElement("button");
    header.type = "button";
    header.className = "team-accordion-header";
    header.innerHTML = `
      <span class="team-accordion-left">
       <img
  src="${logoPath}"
  alt="${escapeHtml(team)}"
  loading="lazy"
  onerror="this.style.display='none'"
>
        <span>
          <strong>${escapeHtml(team)}</strong>
          <small>${picks.length} giocatori draftati</small>
        </span>
      </span>
      <span class="team-accordion-chevron">⌄</span>
    `;

    const body = document.createElement("div");
    body.className = "team-accordion-body";

    const rulesStatus = document.createElement("div");
rulesStatus.className = "team-rules-status";

rulesStatus.innerHTML = `
  <span class="team-rule-chip ${u21Missing === 0 ? "ok" : "warn"}">
    U21 ${Math.min(u21Count, 4)}/4
  </span>
  <span class="team-rule-chip ${goalkeeperMissing === 0 ? "ok" : "warn"}">
    POR ${goalkeeperCount}/2
  </span>
`;

    picks.forEach(p => {
     const riga = document.createElement("div");
riga.className = "team-player-row";

if (p.nome.length >= 14) {
  riga.classList.add("long-player-name");
}

if (p.nome.length >= 18) {
  riga.classList.add("very-long-player-name");
}

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

const tradeBadgeHtml = p.isTradedPick
  ? renderTradeBadgeHtml(p.pickNum, "summary-trade-badge")
  : "";

riga.innerHTML = `
  <span class="team-player-left">
    <span class="team-player-number">${p.n}</span>
    <span class="team-player-pick">Pick #${p.pickNum}</span>
  </span>

  <span class="team-player-info">
    <strong>${escapeHtml(p.nome)}</strong>
    <small>${escapeHtml(p.ruolo || "-")}</small>
  </span>

 <span class="team-player-badges">${tradeBadgeHtml}${badgeHtml}</span>
`;

      body.appendChild(riga);
    });

    header.addEventListener("click", () => {
      div.classList.toggle("is-open");
    });

div.appendChild(header);
div.appendChild(rulesStatus);
div.appendChild(body);
container.appendChild(div);
  });
}

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
