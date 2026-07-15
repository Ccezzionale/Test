// =========================================================
// ALL STAR GAME 2027 - SUPABASE EDITION
// Voti reali + Top 5 per Conference + 10 auto-pick + Draft dinamico
// Regola: chi vince fa iniziare il draft alla Conference opposta.
// =========================================================

import { supabase } from "./supabase.js";

const SEASON = 2027;
const TOTAL_PLAYERS = 44;
const PLAYERS_PER_TEAM = 22;
const AUTO_PICK_COUNT = 10;

const CONFERENCE_LEAGUE = "Conference League";
const CONFERENCE_CHAMPIONSHIP = "Conference Championship";

let currentUser = null;
let currentProfile = null;
let currentTeam = null;
let isAdmin = false;

let players = [];
let allPlayersById = new Map();
let playerIdAliasMap = new Map();
let teamsById = new Map();
let state = defaultState();
let picks = [];
let votes = [];

const els = {
  hamburger: document.getElementById("hamburger"),
  navMenu: document.getElementById("navMenu") || document.getElementById("mainMenu"),

  draftStatusLabel: document.getElementById("draftStatusLabel"),
  activeWeekInfo: document.getElementById("activeWeekInfo"),
  voteWeekPill: document.getElementById("voteWeekPill"),
  leagueVoteLeaderInfo: document.getElementById("leagueVoteLeaderInfo"),
  champVoteLeaderInfo: document.getElementById("champVoteLeaderInfo"),
  voterConference: document.getElementById("voterConference"),
  voteSearchInput: document.getElementById("voteSearchInput"),
  voteForm: document.getElementById("voteForm"),
  vote20: document.getElementById("vote20"),
  vote12: document.getElementById("vote12"),
  vote7: document.getElementById("vote7"),
  vote3: document.getElementById("vote3"),
  vote1: document.getElementById("vote1"),
  voteFeedback: document.getElementById("voteFeedback"),

  leagueWeekStarName: document.getElementById("leagueWeekStarName"),
  leagueWeekStarDetails: document.getElementById("leagueWeekStarDetails"),
  champWeekStarName: document.getElementById("champWeekStarName"),
  champWeekStarDetails: document.getElementById("champWeekStarDetails"),

  leagueVoteRankingList: document.getElementById("leagueVoteRankingList"),
  champVoteRankingList: document.getElementById("champVoteRankingList"),
  autoPickPreview: document.getElementById("autoPickPreview"),
  autoPickPreviewBroadcast: document.getElementById("autoPickPreviewBroadcast"),
  demoVotesBtn: document.getElementById("demoVotesBtn"),
  resetVotesBtn: document.getElementById("resetVotesBtn"),
  adminResetVotesBtn: document.getElementById("adminResetVotesBtn"),
  generateAutoPicksBtn: document.getElementById("generateAutoPicksBtn"),
  winnerConferenceSelect: document.getElementById("winnerConferenceSelect"),
  saveWinnerConferenceBtn: document.getElementById("saveWinnerConferenceBtn"),
  winnerConferenceInfo: document.getElementById("winnerConferenceInfo"),
  firstConferenceInfo: document.getElementById("firstConferenceInfo"),
  startVotingBtn: document.getElementById("startVotingBtn"),
  activeWeekAdminInfo: document.getElementById("activeWeekAdminInfo"),
  votingStatusInfo: document.getElementById("votingStatusInfo"),
  votingStartedInfo: document.getElementById("votingStartedInfo"),
  votingClosedInfo: document.getElementById("votingClosedInfo"),

  currentPickInfo: document.getElementById("currentPickInfo"),
  currentConferenceInfo: document.getElementById("currentConferenceInfo"),
  selectedCountInfo: document.getElementById("selectedCountInfo"),
  leagueCount: document.getElementById("leagueCount"),
  championshipCount: document.getElementById("championshipCount"),
  leagueRoster: document.getElementById("leagueRoster"),
  championshipRoster: document.getElementById("championshipRoster"),
  currentPickBig: document.getElementById("currentPickBig"),
  currentConferenceBig: document.getElementById("currentConferenceBig"),
  lastPicksList: document.getElementById("lastPicksList"),
  playersTbody: document.getElementById("playersTbody"),
  searchInput: document.getElementById("searchInput"),
  roleFilter: document.getElementById("roleFilter"),
  teamFilter: document.getElementById("teamFilter"),
  originFilter: document.getElementById("originFilter"),
  conferenceFilter: document.getElementById("conferenceFilter"),
  clearFiltersBtn: document.getElementById("clearFiltersBtn"),
  openPickModalBtn: document.getElementById("openPickModalBtn"),
  pickModal: document.getElementById("pickModal"),
  closePickModalBtn: document.getElementById("closePickModalBtn"),
  modalPickText: document.getElementById("modalPickText"),
  modalSearchInput: document.getElementById("modalSearchInput"),
  modalPlayersList: document.getElementById("modalPlayersList"),
  adminPanel: document.getElementById("adminPanel"),
  adminToggle: document.getElementById("adminToggle"),
  adminBody: document.getElementById("adminBody"),
  adminChevron: document.getElementById("adminChevron"),
  toggleDraftBtn: document.getElementById("toggleDraftBtn"),
  undoPickBtn: document.getElementById("undoPickBtn"),
  resetDraftBtn: document.getElementById("resetDraftBtn")
};

init();

async function init() {
  bindEvents();
  setLoadingUI();

  try {
    await loadSessionAndProfile();
    await loadAllData();
    setupUserControls();
    populateFilters();
    populateVoteSelects();
    renderAll();
    subscribeRealtime();
    startAutoWeekTicker();
  } catch (error) {
    console.error("Errore init All Star:", error);
    showVoteFeedback("Errore caricamento All Star. Controlla login, tabelle Supabase o console.", true);
  }
}

function bindEvents() {
  els.hamburger?.addEventListener("click", () => {
    els.navMenu?.classList.toggle("open");
  });

  els.voteForm?.addEventListener("submit", handleVoteSubmit);
  els.voteSearchInput?.addEventListener("input", populateVoteSelects);
  els.demoVotesBtn?.addEventListener("click", () => alert("I voti demo sono stati disattivati: ora la pagina usa Supabase."));
  els.resetVotesBtn?.addEventListener("click", resetVotes);
  els.adminResetVotesBtn?.addEventListener("click", resetVotes);
  els.generateAutoPicksBtn?.addEventListener("click", generateAutoPicksFromVotes);
  els.saveWinnerConferenceBtn?.addEventListener("click", saveWinnerConferenceFromAdmin);
  els.startVotingBtn?.addEventListener("click", startAllStarVoting);

[els.searchInput, els.roleFilter, els.teamFilter].forEach((el) => {
  el?.addEventListener("input", renderPool);
  el?.addEventListener("change", renderPool);
});

els.clearFiltersBtn?.addEventListener("click", () => {
  els.searchInput.value = "";
  els.roleFilter.value = "";
  els.teamFilter.value = "";
  renderPool();
});

  els.openPickModalBtn?.addEventListener("click", openPickModal);
  els.closePickModalBtn?.addEventListener("click", () => els.pickModal?.close());
  els.modalSearchInput?.addEventListener("input", renderModalPlayers);

  els.adminToggle?.addEventListener("click", () => {
    els.adminBody.classList.toggle("open");
    els.adminChevron.textContent = els.adminBody.classList.contains("open") ? "⌃" : "⌄";
  });

  els.toggleDraftBtn?.addEventListener("click", toggleDraftOpen);
  els.undoPickBtn?.addEventListener("click", undoLastPick);
  els.resetDraftBtn?.addEventListener("click", resetDraft);
}

function setLoadingUI() {
  if (els.playersTbody) els.playersTbody.innerHTML = `<tr><td colspan="7">Caricamento dati All Star...</td></tr>`;
  if (els.draftStatusLabel) els.draftStatusLabel.textContent = "Caricamento";
  if (els.openPickModalBtn) els.openPickModalBtn.disabled = true;
}

async function loadSessionAndProfile() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;

  currentUser = userData?.user || null;
  if (!currentUser) {
    throw new Error("Utente non autenticato");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, email, team_id, role")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (profileError) throw profileError;
  currentProfile = profile;
  isAdmin = ["admin", "commissioner"].includes(String(profile?.role || "").toLowerCase());
}

async function loadAllData() {
  await loadTeams();

  // IMPORTANT:
  // players must be loaded before votes and picks.
  // Votes/picks need playerIdAliasMap and allPlayersById to rebuild old saved picks
  // after the deduplication of the All Star player pool.
  await loadPlayers();

  await Promise.all([loadState(), loadVotes(), loadPicks()]);
}

async function loadTeams() {
  const { data, error } = await supabase
    .from("teams")
    .select("id, name, conference")
    .order("name", { ascending: true });

  if (error) throw error;

  teamsById = new Map((data || []).map((team) => [team.id, team]));
  currentTeam = currentProfile?.team_id ? teamsById.get(currentProfile.team_id) : null;
}

async function loadState() {
  const { data, error } = await supabase
    .from("allstar_state")
    .select("season, voting_open, draft_open, active_week, winner_conference, first_conference, current_pick, voting_started_at, voting_closed_at")
    .eq("season", SEASON)
    .maybeSingle();

  if (error) throw error;
  state = normalizeState(data);
}

async function loadPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("id, name, role, role_mantra, serie_a_team, quotation, status, pool")
    .eq("status", "active")
    .eq("pool", "conference_championship")
    .order("name", { ascending: true });

  if (error) throw error;

  players = (data || [])
    .map((raw) => ({
      id: raw.id,
      name: raw.name || "",
      role: raw.role || raw.role_mantra || "-",
      roleMantra: raw.role_mantra || "",
      serieATeam: raw.serie_a_team || "-",
      quotation: raw.quotation ?? "-",
      ownerTeamId: null,
      originTeam: "Listone",
      conference: "Listone",
      status: raw.status || "active",
      pool: raw.pool || "quotazioni"
    }))
    .filter((p) => p.name);

  allPlayersById = new Map(players.map((player) => [player.id, player]));
  playerIdAliasMap = new Map(players.map((player) => [player.id, player.id]));
}

async function loadVotes() {
  const { data, error } = await supabase
    .from("allstar_votes")
    .select("id, season, week, voter_team_id, voter_conference, player_id, points, slot, created_at, updated_at")
    .eq("season", SEASON);

  if (error) throw error;
  votes = (data || []).map(normalizeVote);
}

async function loadPicks() {
  const { data, error } = await supabase
    .from("allstar_picks")
    .select("id, season, pick_number, conference, player_id, source, points_total, created_by, created_at")
    .eq("season", SEASON)
    .order("pick_number", { ascending: true });

  if (error) throw error;
  picks = (data || []).map(normalizePick).filter((pick) => pick.player);
}

function normalizePlayer(raw) {
  const ownerTeam = raw.owner_team_id ? teamsById.get(raw.owner_team_id) : null;

  return {
    id: raw.id,
    name: raw.name || "",
    role: raw.role || raw.role_mantra || "-",
    roleMantra: raw.role_mantra || "",
    serieATeam: raw.serie_a_team || "-",
    quotation: raw.quotation ?? "-",
    ownerTeamId: raw.owner_team_id || null,
    originTeam: ownerTeam?.name || "Svincolato",
    conference: ownerTeam?.conference || "Senza Conference",
    status: raw.status || "active",
    pool: raw.pool || null
  };
}

function getPlayerDedupeKey(player) {
  return normalizeTextKey(player.name);
}

function normalizeTextKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function getPlayerQualityScore(player) {
  const quotation = Number(player.quotation);
  let score = Number.isFinite(quotation) ? quotation : 0;

  // Prefer the cleaner “quotazioni/listone” row when duplicates come from conference pools.
  if (!player.pool) score += 1000;
  if (String(player.pool || "").toLowerCase() === "quotazioni") score += 900;
  if (String(player.pool || "").toLowerCase() === "allstar") score += 800;
  
// Prefer the owned row, so the player keeps team origine and conference.
if (player.ownerTeamId) score += 100;
  if (player.serieATeam && player.serieATeam !== "-") score += 10;
  if (player.role && player.role !== "-") score += 5;

  return score;
}

function dedupePlayers(rawPlayers, aliasSourcePlayers = rawPlayers) {
  const byKey = new Map();
  playerIdAliasMap = new Map();

  rawPlayers.forEach((player) => {
    const key = getPlayerDedupeKey(player);
    const current = byKey.get(key);

    if (!current || getPlayerQualityScore(player) > getPlayerQualityScore(current)) {
      byKey.set(key, player);
    }
  });

  aliasSourcePlayers.forEach((player) => {
    const canonical = byKey.get(getPlayerDedupeKey(player));
    if (canonical) playerIdAliasMap.set(player.id, canonical.id);
  });

  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function getCanonicalPlayerId(playerId) {
  return playerIdAliasMap.get(playerId) || playerId;
}

function getPlayerForStoredId(originalPlayerId, canonicalPlayerId = getCanonicalPlayerId(originalPlayerId)) {
  return (
    players.find((p) => p.id === canonicalPlayerId) ||
    players.find((p) => p.id === originalPlayerId) ||
    allPlayersById.get(originalPlayerId) ||
    allPlayersById.get(canonicalPlayerId) ||
    null
  );
}

function normalizeVote(raw) {
  const canonicalPlayerId = getCanonicalPlayerId(raw.player_id);
  const player = getPlayerForStoredId(raw.player_id, canonicalPlayerId);
  return {
    id: raw.id,
    season: raw.season,
    week: raw.week,
    voterTeamId: raw.voter_team_id,
    voterConference: raw.voter_conference,
    playerId: canonicalPlayerId,
    player,
    points: Number(raw.points || 0),
    slot: raw.slot,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at
  };
}

function normalizePick(raw) {
  const canonicalPlayerId = getCanonicalPlayerId(raw.player_id);
  const player = getPlayerForStoredId(raw.player_id, canonicalPlayerId);
  return {
    id: raw.id,
    season: raw.season,
    pickNumber: Number(raw.pick_number),
    conference: raw.conference,
    playerId: canonicalPlayerId,
    player,
    source: raw.source,
    pointsTotal: raw.points_total,
    createdBy: raw.created_by,
    createdAt: raw.created_at
  };
}

function defaultState() {
  return {
    season: SEASON,
    votingOpen: false,
    isOpen: false,
    activeWeek: 1,
    votingStartedAt: null,
    votingClosedAt: null,
    currentPick: AUTO_PICK_COUNT + 1,
    winnerConference: null,
    firstConference: null
  };
}

function normalizeState(rawState) {
  const base = defaultState();
  const next = {
    ...base,
    season: rawState?.season ?? SEASON,
    votingOpen: rawState?.voting_open ?? rawState?.votingOpen ?? false,
    isOpen: rawState?.draft_open ?? rawState?.isOpen ?? false,
    activeWeek: Number(rawState?.active_week ?? rawState?.activeWeek ?? 1),
    votingStartedAt: rawState?.voting_started_at ?? rawState?.votingStartedAt ?? null,
    votingClosedAt: rawState?.voting_closed_at ?? rawState?.votingClosedAt ?? null,
    currentPick: Number(rawState?.current_pick ?? rawState?.currentPick ?? AUTO_PICK_COUNT + 1),
    winnerConference: rawState?.winner_conference ?? rawState?.winnerConference ?? null,
    firstConference: rawState?.first_conference ?? rawState?.firstConference ?? null
  };

  if (!isValidConference(next.winnerConference)) next.winnerConference = null;
  if (!isValidConference(next.firstConference)) next.firstConference = getOppositeConference(next.winnerConference);

  next.currentPick = Math.max(AUTO_PICK_COUNT + 1, Number(next.currentPick || AUTO_PICK_COUNT + 1));
  next.isOpen = Boolean(next.isOpen && next.firstConference);
  next.votingOpen = next.votingOpen !== false;
  next.activeWeek = getComputedActiveWeek(next);

  return next;
}

function setupUserControls() {
  if (els.voterConference && currentTeam?.conference) {
    els.voterConference.value = currentTeam.conference;
    els.voterConference.disabled = true;
  }

  if (els.adminPanel) {
    els.adminPanel.style.display = isAdmin ? "" : "none";
  }

  if (els.demoVotesBtn) {
    els.demoVotesBtn.style.display = isAdmin ? "" : "none";
    els.demoVotesBtn.textContent = "Demo disattivata";
  }

  if (els.resetVotesBtn) els.resetVotesBtn.style.display = isAdmin ? "" : "none";
  if (els.adminResetVotesBtn) els.adminResetVotesBtn.style.display = isAdmin ? "" : "none";
}

async function startAllStarVoting() {
  if (!isAdmin) return;

  if (state.votingStartedAt) {
    alert("Il conteggio delle votazioni è già stato avviato. Per ripartire dalla Week 1 usa prima ‘Reset votazioni e timer’.");
    return;
  }

  const ok = confirm("Vuoi iniziare le votazioni All Star? Da questo momento la Week 1 parte e le settimane avanzeranno automaticamente ogni 7 giorni.");
  if (!ok) return;

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("allstar_state")
    .update({
      voting_started_at: now,
      voting_closed_at: null,
      voting_open: true,
      active_week: 1
    })
    .eq("season", SEASON);

  if (error) {
    alert("Errore avvio votazioni All Star. Controlla colonne SQL/RLS.");
    console.error(error);
    return;
  }

  await refreshAndRender();
}

function populateFilters() {
  const serieATeams = unique(players.map((p) => p.serieATeam)).filter((v) => v !== "-").sort();

  if (els.teamFilter) {
    els.teamFilter.innerHTML = `<option value="">Squadra Serie A</option>` +
      serieATeams.map((team) => `<option value="${escapeAttr(team)}">${escapeHtml(team)}</option>`).join("");
  }
}

function populateVoteSelects() {
  const search = normalizeTextKey(els.voteSearchInput?.value || "");

  [els.vote20, els.vote12, els.vote7, els.vote3, els.vote1].forEach((select) => {
    if (!select) return;

    const previousValue = select.value;
    const filteredPlayers = players
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((p) => {
        if (!search) return true;
        if (p.id === previousValue) return true;

        const haystack = normalizeTextKey(`${p.name} ${p.role} ${p.serieATeam} ${p.originTeam}`);
        return haystack.includes(search);
      });

    const options = filteredPlayers
      .map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)} · ${escapeHtml(p.role)} · ${escapeHtml(p.serieATeam)} · ${escapeHtml(p.originTeam)}</option>`)
      .join("");

    select.innerHTML = `<option value="">Seleziona giocatore</option>${options}`;
    if (previousValue && filteredPlayers.some((p) => p.id === previousValue)) {
      select.value = previousValue;
    }
  });
}

async function handleVoteSubmit(event) {
  event.preventDefault();

  if (!canVoteNow()) {
    showVoteFeedback(getVotingClosedMessage(), true);
    return;
  }

  if (!currentTeam?.id || !currentTeam?.conference) {
    showVoteFeedback("Non riesco a trovare la tua squadra/profilo. Controlla il login.", true);
    return;
  }

  const selected = [
    { playerId: els.vote20.value, points: 20, slot: "first" },
    { playerId: els.vote12.value, points: 12, slot: "second" },
    { playerId: els.vote7.value, points: 7, slot: "third" },
    { playerId: els.vote3.value, points: 3, slot: "fourth" },
    { playerId: els.vote1.value, points: 1, slot: "fifth" }
  ];

  if (selected.some((v) => !v.playerId)) {
    showVoteFeedback("Seleziona tutti e cinque i giocatori.", true);
    return;
  }

  const uniqueIds = new Set(selected.map((v) => v.playerId));
  if (uniqueIds.size !== 5) {
    showVoteFeedback("Devi scegliere cinque giocatori diversi.", true);
    return;
  }

  const rows = selected.map((vote) => ({
    season: SEASON,
    week: state.activeWeek,
    voter_team_id: currentTeam.id,
    voter_conference: currentTeam.conference,
    player_id: vote.playerId,
    points: vote.points,
    slot: vote.slot
  }));

  const { error } = await supabase
    .from("allstar_votes")
    .upsert(rows, { onConflict: "season,week,voter_team_id,slot" });

  if (error) {
    console.error("Errore salvataggio voti:", error);
    showVoteFeedback("Errore salvataggio voti. Controlla RLS/permessi.", true);
    return;
  }

  await loadVotes();
  showVoteFeedback(`Voti salvati per ${currentTeam.name}.`);
  renderVotesArea();
}

function showVoteFeedback(message, isError = false) {
  if (!els.voteFeedback) return;
  els.voteFeedback.textContent = message;
  els.voteFeedback.style.color = isError ? "#ff8e9d" : "#35d07f";
}

async function resetVotes() {
  if (!isAdmin) return;

  const ok = confirm(
    "Vuoi cancellare tutti i voti e azzerare il conteggio delle settimane? Dopo il reset dovrai premere ‘Inizia votazioni All Star’ per far partire la Week 1."
  );
  if (!ok) return;

  const { error: votesError } = await supabase
    .from("allstar_votes")
    .delete()
    .eq("season", SEASON);

  if (votesError) {
    alert("Errore reset voti. Controlla RLS/permessi admin.");
    console.error(votesError);
    return;
  }

  const { error: stateError } = await supabase
    .from("allstar_state")
    .update({
      voting_started_at: null,
      voting_closed_at: null,
      voting_open: false,
      active_week: 1
    })
    .eq("season", SEASON);

  if (stateError) {
    alert("I voti sono stati cancellati, ma non sono riuscito ad azzerare il timer delle votazioni. Controlla RLS/permessi admin.");
    console.error(stateError);
    return;
  }

  votes = [];
  await refreshAndRender();
  showVoteFeedback("Votazioni e timer azzerati. La Week 1 partirà quando l’admin darà il via.");
}

function getVoteTotalsByConference(conference) {
  const map = new Map();

  votes
    .filter((vote) => vote.voterConference === conference)
    .forEach((vote) => {
      const player = vote.player || players.find((p) => p.id === vote.playerId);
      if (!player) return;

      if (!map.has(vote.playerId)) {
        map.set(vote.playerId, {
          playerId: vote.playerId,
          player,
          total: 0,
          weekTotal: 0
        });
      }

      const entry = map.get(vote.playerId);
      entry.total += Number(vote.points || 0);

      if (vote.week === state.activeWeek) {
        entry.weekTotal += Number(vote.points || 0);
      }
    });

  return [...map.values()]
    .filter((entry) => entry.player)
    .sort((a, b) => b.total - a.total || a.player.name.localeCompare(b.player.name));
}

function getWeekRankingByConference(conference) {
  return getVoteTotalsByConference(conference)
    .filter((entry) => entry.weekTotal > 0)
    .sort((a, b) => b.weekTotal - a.weekTotal || a.player.name.localeCompare(b.player.name));
}

function renderVotesArea() {
  const leagueTotals = getVoteTotalsByConference(CONFERENCE_LEAGUE);
  const champTotals = getVoteTotalsByConference(CONFERENCE_CHAMPIONSHIP);

  const leagueLeader = leagueTotals[0];
  const champLeader = champTotals[0];

  setText(els.activeWeekInfo, `Week ${state.activeWeek}`);
  setText(els.voteWeekPill, `Week ${state.activeWeek}`);
  setText(els.leagueVoteLeaderInfo, leagueLeader ? `${leagueLeader.player.name} (${leagueLeader.total} pt)` : "-");
  setText(els.champVoteLeaderInfo, champLeader ? `${champLeader.player.name} (${champLeader.total} pt)` : "-");

  renderWeekStars();
  renderConferenceRanking(els.leagueVoteRankingList, leagueTotals, CONFERENCE_LEAGUE);
  renderConferenceRanking(els.champVoteRankingList, champTotals, CONFERENCE_CHAMPIONSHIP);
  renderAutoPickPreview(leagueTotals, champTotals);
}

function renderWeekStars() {
  const leagueStar = getWeekRankingByConference(CONFERENCE_LEAGUE)[0];
  const champStar = getWeekRankingByConference(CONFERENCE_CHAMPIONSHIP)[0];

  renderSingleWeekStar(leagueStar, els.leagueWeekStarName, els.leagueWeekStarDetails);
  renderSingleWeekStar(champStar, els.champWeekStarName, els.champWeekStarDetails);
}

function renderSingleWeekStar(star, nameEl, detailsEl) {
  if (!star) {
    setText(nameEl, "-");
    setText(detailsEl, "Nessun voto registrato.");
    return;
  }

  setText(nameEl, star.player.name);
  setText(detailsEl, `${star.weekTotal} pt questa week · Totale ${star.total} · ${star.player.role} · ${star.player.serieATeam}`);
}

function renderConferenceRanking(container, totals, conference) {
  if (!container) return;
  const top = totals.slice(0, 5);

  if (!top.length) {
    container.innerHTML = `
      <div class="ranking-empty">
        <div>
          <strong>Nessun voto registrato</strong>
          <small>La Top 5 ${escapeHtml(conference)} apparirà appena arrivano i primi voti.</small>
        </div>
      </div>
    `;
    return;
  }

  container.innerHTML = top.map((entry, index) => {
    const pos = index + 1;
    return `
      <div class="ranking-row auto-zone">
        <span class="ranking-pos">${pos}</span>
        <span class="ranking-player">
          <strong>${escapeHtml(entry.player.name)}</strong>
          <small>${escapeHtml(entry.player.role)} · ${escapeHtml(entry.player.serieATeam)} · ${escapeHtml(entry.player.originTeam)} · Q. ${escapeHtml(entry.player.quotation)}</small>
        </span>
        <span class="ranking-points">${entry.total} pt</span>
        <span class="auto-badge">Top 5</span>
      </div>
    `;
  }).join("");
}

function getAutoPickPreviewRows(leagueTotals, champTotals) {
  if (!state.firstConference) {
    return Array.from({ length: AUTO_PICK_COUNT }, (_, index) => ({
      pickNumber: index + 1,
      conference: null,
      entry: null
    }));
  }

  const first = state.firstConference;
  const second = getOppositeConference(first);
  const usedPlayerIds = new Set();

  const totalsByConference = {
    [CONFERENCE_LEAGUE]: leagueTotals,
    [CONFERENCE_CHAMPIONSHIP]: champTotals
  };

  return Array.from({ length: AUTO_PICK_COUNT }, (_, index) => {
    const conference = index % 2 === 0 ? first : second;
    const ranking = totalsByConference[conference] || [];
    const entry = ranking.find((candidate) => !usedPlayerIds.has(candidate.playerId)) || null;

    if (entry) usedPlayerIds.add(entry.playerId);

    return {
      pickNumber: index + 1,
      conference,
      entry
    };
  });
}

function renderAutoPickPreview(leagueTotals, champTotals) {
  const rows = getAutoPickPreviewRows(leagueTotals, champTotals);
  const selectedIds = rows.filter((row) => row.entry).map((row) => row.entry.playerId);
  const duplicateIds = selectedIds.filter((id, index) => selectedIds.indexOf(id) !== index);

  const html = rows.map((row) => {
    if (!row.conference) {
      return `
        <div class="auto-pick-row">
          <span class="pick-number-pill">Pick ${row.pickNumber}</span>
          <div>
            <strong>In attesa</strong>
            <small>Prima imposta la Conference vincitrice</small>
          </div>
        </div>
      `;
    }

    const className = row.conference === CONFERENCE_CHAMPIONSHIP ? "championship" : "league";

    if (!row.entry) {
      return `
        <div class="auto-pick-row ${className}">
          <span class="pick-number-pill">Pick ${row.pickNumber}</span>
          <div>
            <strong>In attesa</strong>
            <small>${escapeHtml(row.conference)} · servono voti</small>
          </div>
        </div>
      `;
    }

    const isDuplicate = duplicateIds.includes(row.entry.playerId);

    return `
      <div class="auto-pick-row ${className}">
        <span class="pick-number-pill">Pick ${row.pickNumber}</span>
        <div>
          <strong>${escapeHtml(row.entry.player.name)}</strong>
          <small>${escapeHtml(row.conference)} · ${row.entry.total} pt</small>
          ${isDuplicate ? `<span class="duplicate-badge">Doppione manuale</span>` : ""}
        </div>
      </div>
    `;
  }).join("");

  if (els.autoPickPreview) els.autoPickPreview.innerHTML = html;
  if (els.autoPickPreviewBroadcast) els.autoPickPreviewBroadcast.innerHTML = html;
}

async function generateAutoPicksFromVotes() {
  if (!isAdmin) return;

  if (!state.firstConference) {
    alert("Prima scegli la Conference vincitrice: il draft partirà dalla Conference opposta.");
    return;
  }

  const leagueTotals = getVoteTotalsByConference(CONFERENCE_LEAGUE);
  const champTotals = getVoteTotalsByConference(CONFERENCE_CHAMPIONSHIP);
  const rows = getAutoPickPreviewRows(leagueTotals, champTotals);

  if (rows.some((row) => !row.entry)) {
    alert("Servono almeno 5 giocatori votati per ciascuna conference.");
    return;
  }

  const ok = confirm("Generare/sostituire le prime 10 auto-pick da Supabase?");
  if (!ok) return;

  const { error: deleteError } = await supabase
    .from("allstar_picks")
    .delete()
    .eq("season", SEASON)
    .lte("pick_number", AUTO_PICK_COUNT);

  if (deleteError) {
    alert("Errore eliminazione auto-pick esistenti.");
    console.error(deleteError);
    return;
  }

  const insertRows = rows.map((row) => ({
    season: SEASON,
    pick_number: row.pickNumber,
    conference: row.conference,
    player_id: row.entry.playerId,
    source: "vote",
    points_total: row.entry.total,
    created_by: currentUser.id
  }));

  const { error: insertError } = await supabase.from("allstar_picks").insert(insertRows);

  if (insertError) {
    alert("Errore generazione auto-pick. Controlla duplicati/RLS.");
    console.error(insertError);
    return;
  }

  await updateState({
    current_pick: Math.max(AUTO_PICK_COUNT + 1, state.currentPick),
    voting_open: false,
    voting_closed_at: new Date().toISOString(),
    active_week: state.activeWeek
  });
  await refreshAndRender();
}

async function saveWinnerConferenceFromAdmin() {
  if (!isAdmin) return;

  const winner = els.winnerConferenceSelect?.value || "";
  if (!isValidConference(winner)) {
    alert("Scegli una Conference vincitrice valida.");
    return;
  }

  const first = getOppositeConference(winner);

  const { error } = await supabase
    .from("allstar_state")
    .update({
      winner_conference: winner,
      first_conference: first,
      draft_open: false,
      current_pick: Math.max(AUTO_PICK_COUNT + 1, state.currentPick || AUTO_PICK_COUNT + 1)
    })
    .eq("season", SEASON);

  if (error) {
    alert("Errore salvataggio Conference vincitrice.");
    console.error(error);
    return;
  }

  await refreshAndRender();
}

function getCurrentConference() {
  if (!state.firstConference) return null;

  const first = state.firstConference;
  const second = getOppositeConference(first);
  return state.currentPick % 2 === 1 ? first : second;
}

function getAvailablePlayers() {
  const pickedIds = new Set(picks.map((pick) => pick.playerId));
  const pickedNames = new Set(picks.map((pick) => getPlayerDedupeKey(pick.player)).filter(Boolean));

  return players.filter((player) => {
    const canonicalId = getCanonicalPlayerId(player.id);
    const key = getPlayerDedupeKey(player);
    return !pickedIds.has(player.id) && !pickedIds.has(canonicalId) && !pickedNames.has(key);
  });
}

function renderAll() {
  renderVotesArea();
  renderHeader();
  renderRosters();
  renderLastPicks();
  renderPool();
  renderModalPlayers();
}

function renderHeader() {
  const currentConference = getCurrentConference();
  const selected = picks.length;
  const completed = selected >= TOTAL_PLAYERS;

  setText(els.draftStatusLabel, getAllStarStatusLabel());
  setText(els.currentPickInfo, String(state.currentPick));
  setText(els.currentConferenceInfo, currentConference || "Da decidere");
  setText(els.selectedCountInfo, `${selected} / ${TOTAL_PLAYERS}`);
  setText(els.currentPickBig, String(state.currentPick));
  setText(els.currentConferenceBig, currentConference || "Da decidere");

  if (els.currentConferenceBig) {
    els.currentConferenceBig.dataset.conf = currentConference || "";
  }

  if (els.winnerConferenceSelect) {
    els.winnerConferenceSelect.value = state.winnerConference || "";
  }

  setText(els.winnerConferenceInfo, state.winnerConference || "Non ancora decisa");
  setText(els.firstConferenceInfo, state.firstConference || "In attesa");
  setText(els.activeWeekAdminInfo, state.votingStartedAt ? `Week ${state.activeWeek}` : "Non iniziata");
  setText(els.votingStatusInfo, getAllStarStatusLabel());
  setText(els.votingStartedInfo, formatDateTime(state.votingStartedAt));
  setText(els.votingClosedInfo, formatDateTime(state.votingClosedAt));

  if (els.startVotingBtn) {
    if (state.votingStartedAt && state.votingClosedAt) {
      els.startVotingBtn.textContent = "Resetta prima le votazioni";
    } else if (state.votingStartedAt) {
      els.startVotingBtn.textContent = "Votazioni già iniziate";
    } else {
      els.startVotingBtn.textContent = "Inizia votazioni All Star";
    }

    els.startVotingBtn.disabled = !isAdmin || Boolean(state.votingStartedAt);
  }

  if (els.openPickModalBtn) {
    const canPick = isAdmin && state.isOpen && state.firstConference && !completed;
    els.openPickModalBtn.disabled = !canPick;
    if (completed) {
      els.openPickModalBtn.textContent = "Draft completato";
    } else if (!state.firstConference) {
      els.openPickModalBtn.textContent = "Scegli vincitrice";
    } else if (!state.isOpen) {
      els.openPickModalBtn.textContent = "Draft chiuso";
    } else {
      els.openPickModalBtn.textContent = "Effettua chiamata";
    }
  }

  if (els.toggleDraftBtn) {
    els.toggleDraftBtn.textContent = state.isOpen ? "Chiudi Draft" : "Apri Draft";
  }
}

function renderRosters() {
  const leaguePicks = picks.filter((pick) => pick.conference === CONFERENCE_LEAGUE);
  const championshipPicks = picks.filter((pick) => pick.conference === CONFERENCE_CHAMPIONSHIP);

  setText(els.leagueCount, `${leaguePicks.length} / ${PLAYERS_PER_TEAM} giocatori selezionati`);
  setText(els.championshipCount, `${championshipPicks.length} / ${PLAYERS_PER_TEAM} giocatori selezionati`);

  if (els.leagueRoster) els.leagueRoster.innerHTML = renderDraftPickTable(leaguePicks);
  if (els.championshipRoster) els.championshipRoster.innerHTML = renderDraftPickTable(championshipPicks);
}

function renderDraftPickTable(teamPicks) {
  const rows = teamPicks
    .filter((pick) => pick.pickNumber >= AUTO_PICK_COUNT + 1)
    .slice()
    .sort((a, b) => a.pickNumber - b.pickNumber);

  if (!rows.length) {
    return `
      <div class="allstar-draft-table-wrap empty">
        <div class="empty-draft-table">
          <strong>Nessuna chiamata manuale</strong>
          <span>La tabella partirà dalla pick ${AUTO_PICK_COUNT + 1}.</span>
        </div>
      </div>
    `;
  }

  return `
    <div class="allstar-draft-table-wrap">
      <table class="allstar-draft-table">
        <thead>
          <tr>
            <th>Pick</th>
            <th>Giocatore</th>
            <th>Ruolo</th>
            <th>Squadra</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((pick) => `
            <tr>
              <td class="pick-col">${pick.pickNumber}</td>
              <td>
                <strong>${escapeHtml(pick.player.name)}${pick.source === "vote" ? " ⭐" : ""}</strong>
              </td>
              <td><span class="role-pill role-${escapeAttr(String(pick.player.role).charAt(0))}">${escapeHtml(pick.player.role)}</span></td>
              <td>${escapeHtml(pick.player.serieATeam)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderLastPicks() {
  if (!els.lastPicksList) return;
  const recent = picks.slice().sort((a, b) => b.pickNumber - a.pickNumber).slice(0, 5);

  if (!recent.length) {
    els.lastPicksList.innerHTML = `<div class="last-pick-row"><span>-</span><strong>Nessuna chiamata</strong><em>-</em></div>`;
    return;
  }

  els.lastPicksList.innerHTML = recent.map((pick) => `
    <div class="last-pick-row">
      <span>${pick.pickNumber}</span>
      <strong>${escapeHtml(pick.conference)}</strong>
      <em>${escapeHtml(pick.player.name)}${pick.source === "vote" ? " ⭐" : ""}</em>
    </div>
  `).join("");
}

function getFilteredPlayers() {
  const q = (els.searchInput?.value || "").trim().toLowerCase();
  const role = els.roleFilter?.value || "";
  const serieATeam = els.teamFilter?.value || "";

  return getAvailablePlayers().filter((player) => {
    const matchesSearch =
      !q ||
      player.name.toLowerCase().includes(q) ||
      player.serieATeam.toLowerCase().includes(q);

    return (
      matchesSearch &&
      (!role || player.role === role || String(player.role).startsWith(role)) &&
      (!serieATeam || player.serieATeam === serieATeam)
    );
  });
}

function renderPool() {
  if (!els.playersTbody) return;
  const filtered = getFilteredPlayers();

  if (!filtered.length) {
   els.playersTbody.innerHTML = `<tr><td colspan="5">Nessun giocatore disponibile.</td></tr>`;
    return;
  }

 els.playersTbody.innerHTML = filtered.map((player) => `
  <tr>
    <td>
      <div class="player-name-cell">
        <span class="player-dot"></span>
        <span>${escapeHtml(player.name)}</span>
      </div>
    </td>
    <td><span class="role-pill role-${escapeAttr(String(player.role).charAt(0))}">${escapeHtml(player.role)}</span></td>
    <td>${escapeHtml(player.serieATeam)}</td>
    <td>${escapeHtml(player.quotation ?? "-")}</td>
    <td>
      <button class="pick-btn" data-player-id="${escapeAttr(player.id)}" ${!isAdmin || !state.isOpen ? "disabled" : ""}>Scegli</button>
    </td>
  </tr>
`).join("");
  document.querySelectorAll(".pick-btn[data-player-id]").forEach((btn) => {
    btn.addEventListener("click", () => makePick(btn.dataset.playerId));
  });
}

function openPickModal() {
  if (!isAdmin) return;

  if (!state.firstConference) {
    alert("Prima scegli la Conference vincitrice.");
    return;
  }

  if (!state.isOpen) {
    alert("Il draft è chiuso.");
    return;
  }

  if (els.modalPickText) els.modalPickText.textContent = `Pick ${state.currentPick} - ${getCurrentConference()}`;
  if (els.modalSearchInput) els.modalSearchInput.value = "";
  renderModalPlayers();
  els.pickModal?.showModal();
}

function renderModalPlayers() {
  if (!els.modalPlayersList) return;

  const query = (els.modalSearchInput?.value || "").trim().toLowerCase();
  const available = getAvailablePlayers()
    .filter((player) => {
      if (!query) return true;
      return (
        player.name.toLowerCase().includes(query) ||
        player.serieATeam.toLowerCase().includes(query) ||
        player.originTeam.toLowerCase().includes(query)
      );
    })
    .slice(0, 100);

  if (!available.length) {
    els.modalPlayersList.innerHTML = `<div class="modal-player-row"><strong>Nessun giocatore disponibile</strong></div>`;
    return;
  }

  els.modalPlayersList.innerHTML = available.map((player) => `
    <div class="modal-player-row">
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        <small>${escapeHtml(player.role)} · ${escapeHtml(player.serieATeam)} · Q. ${escapeHtml(player.quotation ?? "-")} · ${escapeHtml(player.originTeam)}</small>
      </div>
      <button class="pick-btn" data-modal-player-id="${escapeAttr(player.id)}" ${!isAdmin || !state.isOpen ? "disabled" : ""}>Scegli</button>
    </div>
  `).join("");

  document.querySelectorAll("[data-modal-player-id]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await makePick(btn.dataset.modalPlayerId);
      els.pickModal?.close();
    });
  });
}

async function makePick(playerId) {
  if (!isAdmin) return;

  if (!state.isOpen) {
    alert("Il draft è chiuso.");
    return;
  }

  if (!state.firstConference) {
    alert("Prima scegli la Conference vincitrice.");
    return;
  }

  if (picks.length >= TOTAL_PLAYERS) {
    alert("Draft già completato.");
    return;
  }

  const player = players.find((p) => p.id === playerId);
  if (!player) return;

  const playerKey = getPlayerDedupeKey(player);
  const alreadyPicked = picks.some((pick) => pick.playerId === playerId || getPlayerDedupeKey(pick.player) === playerKey);
  if (alreadyPicked) {
    alert("Giocatore già selezionato.");
    return;
  }

  const conference = getCurrentConference();
  const conferencePickCount = picks.filter((pick) => pick.conference === conference).length;

  if (conferencePickCount >= PLAYERS_PER_TEAM) {
    alert(`${conference} ha già completato la rosa.`);
    return;
  }

  const { error: insertError } = await supabase.from("allstar_picks").insert({
    season: SEASON,
    pick_number: state.currentPick,
    conference,
    player_id: player.id,
    source: "manual",
    created_by: currentUser.id
  });

  if (insertError) {
    alert("Errore salvataggio pick. Controlla duplicati/RLS.");
    console.error(insertError);
    return;
  }

  await updateState({ current_pick: state.currentPick + 1 });
  await refreshAndRender();
}

async function undoLastPick() {
  if (!isAdmin) return;
  const manualPicks = picks.filter((pick) => pick.pickNumber >= AUTO_PICK_COUNT + 1 && pick.source === "manual");
  const lastManual = manualPicks.sort((a, b) => b.pickNumber - a.pickNumber)[0];

  if (!lastManual) {
    alert("Le prime 10 auto-pick non si annullano da qui. Puoi resettare il draft o rigenerarle.");
    return;
  }

  const { error } = await supabase
    .from("allstar_picks")
    .delete()
    .eq("id", lastManual.id);

  if (error) {
    alert("Errore annullamento pick.");
    console.error(error);
    return;
  }

  await updateState({ current_pick: Math.max(AUTO_PICK_COUNT + 1, lastManual.pickNumber) });
  await refreshAndRender();
}

async function resetDraft() {
  if (!isAdmin) return;

  const ok = confirm("Vuoi davvero resettare tutto il draft All Star? I voti resteranno salvati.");
  if (!ok) return;

  const { error: deleteError } = await supabase
    .from("allstar_picks")
    .delete()
    .eq("season", SEASON);

  if (deleteError) {
    alert("Errore reset pick.");
    console.error(deleteError);
    return;
  }

  const { error: stateError } = await supabase
    .from("allstar_state")
    .update({
      draft_open: false,
      current_pick: AUTO_PICK_COUNT + 1,
      winner_conference: null,
      first_conference: null
    })
    .eq("season", SEASON);

  if (stateError) {
    alert("Errore reset stato draft.");
    console.error(stateError);
    return;
  }

  await refreshAndRender();
}

async function toggleDraftOpen() {
  if (!isAdmin) return;

  if (!state.firstConference) {
    alert("Prima scegli la Conference vincitrice.");
    return;
  }

  await updateState({ draft_open: !state.isOpen });
  await refreshAndRender();
}

async function updateState(patch) {
  const { error } = await supabase
    .from("allstar_state")
    .update(patch)
    .eq("season", SEASON);

  if (error) {
    console.error("Errore update state:", error);
    throw error;
  }
}

async function refreshAndRender() {
  await Promise.all([loadState(), loadVotes(), loadPicks()]);
  renderAll();
}

function startAutoWeekTicker() {
  // If the page stays open over the weekly boundary, update the active week without requiring a refresh.
  setInterval(() => {
    const nextWeek = getComputedActiveWeek(state);
    if (nextWeek !== state.activeWeek) {
      state.activeWeek = nextWeek;
      renderAll();
    }
  }, 60 * 1000);
}

function subscribeRealtime() {
  supabase
    .channel(`allstar-${SEASON}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "allstar_state" }, refreshAndRender)
    .on("postgres_changes", { event: "*", schema: "public", table: "allstar_votes" }, refreshVotesAndRender)
    .on("postgres_changes", { event: "*", schema: "public", table: "allstar_picks" }, refreshPicksAndRender)
    .subscribe();
}

async function refreshVotesAndRender() {
  await loadVotes();
  renderVotesArea();
}

async function refreshPicksAndRender() {
  await loadPicks();
  renderHeader();
  renderRosters();
  renderLastPicks();
  renderPool();
  renderModalPlayers();
}

function getComputedActiveWeek(stateLike = state) {
  const startedAt = stateLike?.votingStartedAt;
  if (!startedAt) return Math.max(1, Number(stateLike?.activeWeek || 1));

  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) return Math.max(1, Number(stateLike?.activeWeek || 1));

  const endSource = stateLike?.votingClosedAt || new Date().toISOString();
  const endMs = Date.parse(endSource);
  if (!Number.isFinite(endMs)) return Math.max(1, Number(stateLike?.activeWeek || 1));

  const diffMs = Math.max(0, endMs - startMs);
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return Math.floor(diffMs / weekMs) + 1;
}

function canVoteNow() {
  return Boolean(state.votingOpen && state.votingStartedAt && !state.votingClosedAt);
}

function getVotingClosedMessage() {
  if (!state.votingStartedAt) return "Le votazioni All Star non sono ancora iniziate.";
  if (state.votingClosedAt) return "Le votazioni All Star sono chiuse.";
  return "Le votazioni sono chiuse.";
}

function getAllStarStatusLabel() {
  if (!state.votingStartedAt) return "Votazioni non iniziate";
  if (state.votingClosedAt || !state.votingOpen) return state.isOpen ? "Draft aperto" : "Votazioni chiuse";
  return `Votazioni aperte · Week ${state.activeWeek}`;
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isValidConference(conference) {
  return conference === CONFERENCE_LEAGUE || conference === CONFERENCE_CHAMPIONSHIP;
}

function getOppositeConference(conference) {
  if (conference === CONFERENCE_LEAGUE) return CONFERENCE_CHAMPIONSHIP;
  if (conference === CONFERENCE_CHAMPIONSHIP) return CONFERENCE_LEAGUE;
  return null;
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

function setText(el, value) {
  if (el) el.textContent = value;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

// =========================================================
// MOBILE ALL STAR TABS
// Desktop: tutto visibile. Mobile: una sezione alla volta.
// =========================================================

function initMobileAllStarTabs() {
  const tabButtons = [...document.querySelectorAll("[data-allstar-tab]")];
  const sections = [...document.querySelectorAll("[data-mobile-section]")];

  if (!tabButtons.length || !sections.length) return;

  const mq = window.matchMedia("(max-width: 768px)");

  function activateTab(tabName) {
    tabButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.allstarTab === tabName);
    });

    sections.forEach((section) => {
      section.classList.toggle("is-mobile-active", section.dataset.mobileSection === tabName);
    });
  }

  function syncMode() {
    if (mq.matches) {
      const active = document.querySelector(".mobile-tab-btn.is-active")?.dataset.allstarTab || "vote";
      activateTab(active);
    } else {
      sections.forEach((section) => section.classList.remove("is-mobile-active"));
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.allstarTab);
      const tabs = document.querySelector(".mobile-allstar-tabs");
      if (tabs) tabs.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  if (mq.addEventListener) {
    mq.addEventListener("change", syncMode);
  } else if (mq.addListener) {
    mq.addListener(syncMode);
  }

  syncMode();
}

document.addEventListener("DOMContentLoaded", initMobileAllStarTabs);
