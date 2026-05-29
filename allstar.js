// =========================================================
// ALL STAR GAME 2027 - SUPABASE EDITION
// Voti reali + Top 5 per Conference + Draft dinamico
// Regola: chi vince fa iniziare il draft alla Conference opposta.
// =========================================================

import { supabase } from "./supabase.js";

const SEASON = 2027;
const TOTAL_PLAYERS = 44;
const PLAYERS_PER_TEAM = 22;
const AUTO_PICK_COUNT = 6;

const CONFERENCE_LEAGUE = "Conference League";
const CONFERENCE_CHAMPIONSHIP = "Conference Championship";

let currentUser = null;
let currentProfile = null;
let currentTeam = null;
let isAdmin = false;

let players = [];
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
  voteForm: document.getElementById("voteForm"),
  vote10: document.getElementById("vote10"),
  vote5: document.getElementById("vote5"),
  vote2: document.getElementById("vote2"),
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
  generateAutoPicksBtn: document.getElementById("generateAutoPicksBtn"),
  winnerConferenceSelect: document.getElementById("winnerConferenceSelect"),
  saveWinnerConferenceBtn: document.getElementById("saveWinnerConferenceBtn"),
  winnerConferenceInfo: document.getElementById("winnerConferenceInfo"),
  firstConferenceInfo: document.getElementById("firstConferenceInfo"),

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
  els.demoVotesBtn?.addEventListener("click", () => alert("I voti demo sono stati disattivati: ora la pagina usa Supabase."));
  els.resetVotesBtn?.addEventListener("click", resetVotes);
  els.generateAutoPicksBtn?.addEventListener("click", generateAutoPicksFromVotes);
  els.saveWinnerConferenceBtn?.addEventListener("click", saveWinnerConferenceFromAdmin);

  [els.searchInput, els.roleFilter, els.teamFilter, els.originFilter, els.conferenceFilter].forEach((el) => {
    el?.addEventListener("input", renderPool);
    el?.addEventListener("change", renderPool);
  });

  els.clearFiltersBtn?.addEventListener("click", () => {
    els.searchInput.value = "";
    els.roleFilter.value = "";
    els.teamFilter.value = "";
    els.originFilter.value = "";
    els.conferenceFilter.value = "";
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
  await Promise.all([loadState(), loadPlayers(), loadVotes(), loadPicks()]);
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
    .select("season, voting_open, draft_open, active_week, winner_conference, first_conference, current_pick")
    .eq("season", SEASON)
    .maybeSingle();

  if (error) throw error;
  state = normalizeState(data);
}

async function loadPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select("id, name, role, role_mantra, serie_a_team, quotation, owner_team_id, status, pool")
    .order("name", { ascending: true });

  if (error) throw error;

  players = (data || [])
    .filter((p) => !p.status || !["inactive", "archived"].includes(String(p.status).toLowerCase()))
    .map(normalizePlayer)
    .filter((p) => p.name);
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

function normalizeVote(raw) {
  const player = players.find((p) => p.id === raw.player_id) || null;
  return {
    id: raw.id,
    season: raw.season,
    week: raw.week,
    voterTeamId: raw.voter_team_id,
    voterConference: raw.voter_conference,
    playerId: raw.player_id,
    player,
    points: Number(raw.points || 0),
    slot: raw.slot,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at
  };
}

function normalizePick(raw) {
  const player = players.find((p) => p.id === raw.player_id) || null;
  return {
    id: raw.id,
    season: raw.season,
    pickNumber: Number(raw.pick_number),
    conference: raw.conference,
    playerId: raw.player_id,
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
    votingOpen: true,
    isOpen: false,
    activeWeek: 1,
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
    votingOpen: rawState?.voting_open ?? rawState?.votingOpen ?? true,
    isOpen: rawState?.draft_open ?? rawState?.isOpen ?? false,
    activeWeek: Number(rawState?.active_week ?? rawState?.activeWeek ?? 1),
    currentPick: Number(rawState?.current_pick ?? rawState?.currentPick ?? AUTO_PICK_COUNT + 1),
    winnerConference: rawState?.winner_conference ?? rawState?.winnerConference ?? null,
    firstConference: rawState?.first_conference ?? rawState?.firstConference ?? null
  };

  if (!isValidConference(next.winnerConference)) next.winnerConference = null;
  if (!isValidConference(next.firstConference)) next.firstConference = getOppositeConference(next.winnerConference);

  next.currentPick = Math.max(AUTO_PICK_COUNT + 1, Number(next.currentPick || AUTO_PICK_COUNT + 1));
  next.isOpen = Boolean(next.isOpen && next.firstConference);
  next.votingOpen = next.votingOpen !== false;
  next.activeWeek = Math.max(1, Number(next.activeWeek || 1));

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
}

function populateFilters() {
  const serieATeams = unique(players.map((p) => p.serieATeam)).filter((v) => v !== "-").sort();
  const originTeams = unique(players.map((p) => p.originTeam)).filter((v) => v !== "Svincolato").sort();

  if (els.teamFilter) {
    els.teamFilter.innerHTML = `<option value="">Squadra Serie A</option>` +
      serieATeams.map((team) => `<option value="${escapeAttr(team)}">${escapeHtml(team)}</option>`).join("");
  }

  if (els.originFilter) {
    els.originFilter.innerHTML = `<option value="">Team di origine</option>` +
      originTeams.map((team) => `<option value="${escapeAttr(team)}">${escapeHtml(team)}</option>`).join("");
  }
}

function populateVoteSelects() {
  const options = players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)} · ${escapeHtml(p.role)} · ${escapeHtml(p.serieATeam)} · ${escapeHtml(p.originTeam)}</option>`)
    .join("");

  [els.vote10, els.vote5, els.vote2].forEach((select) => {
    if (select) select.innerHTML = `<option value="">Seleziona giocatore</option>${options}`;
  });
}

async function handleVoteSubmit(event) {
  event.preventDefault();

  if (!state.votingOpen) {
    showVoteFeedback("Le votazioni sono chiuse.", true);
    return;
  }

  if (!currentTeam?.id || !currentTeam?.conference) {
    showVoteFeedback("Non riesco a trovare la tua squadra/profilo. Controlla il login.", true);
    return;
  }

  const selected = [
    { playerId: els.vote10.value, points: 10, slot: "first" },
    { playerId: els.vote5.value, points: 5, slot: "second" },
    { playerId: els.vote2.value, points: 2, slot: "third" }
  ];

  if (selected.some((v) => !v.playerId)) {
    showVoteFeedback("Seleziona tutti e tre i giocatori.", true);
    return;
  }

  const uniqueIds = new Set(selected.map((v) => v.playerId));
  if (uniqueIds.size !== 3) {
    showVoteFeedback("Devi scegliere tre giocatori diversi.", true);
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
  const ok = confirm("Vuoi davvero cancellare tutti i voti All Star della stagione?");
  if (!ok) return;

  const { error } = await supabase
    .from("allstar_votes")
    .delete()
    .eq("season", SEASON);

  if (error) {
    alert("Errore reset voti. Controlla RLS/permessi admin.");
    console.error(error);
    return;
  }

  votes = [];
  renderVotesArea();
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
  const indexesByConference = {
    [CONFERENCE_LEAGUE]: 0,
    [CONFERENCE_CHAMPIONSHIP]: 0
  };

  const totalsByConference = {
    [CONFERENCE_LEAGUE]: leagueTotals,
    [CONFERENCE_CHAMPIONSHIP]: champTotals
  };

  return Array.from({ length: AUTO_PICK_COUNT }, (_, index) => {
    const conference = index % 2 === 0 ? first : second;
    const rankingIndex = indexesByConference[conference]++;
    return {
      pickNumber: index + 1,
      conference,
      entry: totalsByConference[conference][rankingIndex]
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
    alert("Servono almeno 3 giocatori votati per ciascuna conference.");
    return;
  }

  const selectedIds = rows.map((row) => row.entry.playerId);
  if (new Set(selectedIds).size !== selectedIds.length) {
    alert("Ci sono doppioni nelle prime auto-pick. Sistemali manualmente prima di generare.");
    return;
  }

  const ok = confirm("Generare/sostituire le prime 6 auto-pick da Supabase?");
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

  await updateState({ current_pick: Math.max(AUTO_PICK_COUNT + 1, state.currentPick) });
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
  return players.filter((player) => !pickedIds.has(player.id));
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

  setText(els.draftStatusLabel, state.votingOpen ? "Votazioni aperte" : state.isOpen ? "Draft aperto" : "Draft chiuso");
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

  if (els.leagueRoster) els.leagueRoster.innerHTML = renderRosterByRole(leaguePicks);
  if (els.championshipRoster) els.championshipRoster.innerHTML = renderRosterByRole(championshipPicks);
}

function renderRosterByRole(teamPicks) {
  const roles = ["P", "D", "C", "A"];

  return roles.map((role) => {
    const rolePlayers = teamPicks
      .map((pick) => ({ ...pick.player, source: pick.source, pickNumber: pick.pickNumber }))
      .filter((player) => player.role === role || String(player.role).startsWith(role));

    const rows = rolePlayers.length
      ? rolePlayers.map((player) => `
          <div class="player-mini">
            <strong>${escapeHtml(player.name)}${player.source === "vote" ? " ⭐" : ""}</strong>
            <span>Pick ${player.pickNumber} · ${escapeHtml(player.serieATeam)}</span>
            <b>${escapeHtml(player.quotation ?? "-")}</b>
          </div>
        `).join("")
      : `<div class="player-mini"><strong>In attesa</strong><span>-</span><b>-</b></div>`;

    return `
      <div class="role-group">
        <div class="role-badge">${role}</div>
        <div class="player-mini-list">${rows}</div>
      </div>
    `;
  }).join("");
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
  const originTeam = els.originFilter?.value || "";
  const conference = els.conferenceFilter?.value || "";

  return getAvailablePlayers().filter((player) => {
    const matchesSearch =
      !q ||
      player.name.toLowerCase().includes(q) ||
      player.serieATeam.toLowerCase().includes(q) ||
      player.originTeam.toLowerCase().includes(q);

    return (
      matchesSearch &&
      (!role || player.role === role || String(player.role).startsWith(role)) &&
      (!serieATeam || player.serieATeam === serieATeam) &&
      (!originTeam || player.originTeam === originTeam) &&
      (!conference || player.conference === conference)
    );
  });
}

function renderPool() {
  if (!els.playersTbody) return;
  const filtered = getFilteredPlayers();

  if (!filtered.length) {
    els.playersTbody.innerHTML = `<tr><td colspan="7">Nessun giocatore disponibile.</td></tr>`;
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
      <td>${escapeHtml(player.originTeam)}</td>
      <td>${escapeHtml(player.conference)}</td>
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

  const alreadyPicked = picks.some((pick) => pick.playerId === playerId);
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
    alert("Le prime 6 auto-pick non si annullano da qui. Puoi resettare il draft o rigenerarle.");
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
