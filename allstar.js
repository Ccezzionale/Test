// =========================================================
// ALL STAR GAME 2027 - TOP 5 PER CONFERENCE + DRAFT
// Versione front-end con dati demo + localStorage.
// =========================================================

// import { supabase } from "./supabase.js";

const TOTAL_PLAYERS = 44;
const PLAYERS_PER_TEAM = 22;
const AUTO_PICK_COUNT = 6;

const CONFERENCE_LEAGUE = "Conference League";
const CONFERENCE_CHAMPIONSHIP = "Conference Championship";

const STORAGE_KEY = "lega_eroi_allstar_2027_picks_v3";
const STATE_KEY = "lega_eroi_allstar_2027_state_v3";
const VOTES_KEY = "lega_eroi_allstar_2027_votes_v3";
const ACTIVE_WEEK_KEY = "lega_eroi_allstar_2027_active_week_v1";

const demoPlayers = [
  { id: "p1", name: "Maignan M.", role: "P", serieATeam: "Milan", quotation: 94, originTeam: "Rubinkebab", conference: CONFERENCE_LEAGUE },
  { id: "p2", name: "Donnarumma G.", role: "P", serieATeam: "PSG", quotation: 91, originTeam: "Bayern Christiansen", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p3", name: "Sommer Y.", role: "P", serieATeam: "Inter", quotation: 88, originTeam: "Team Bartowski", conference: CONFERENCE_LEAGUE },
  { id: "p4", name: "Bastoni A.", role: "D", serieATeam: "Inter", quotation: 92, originTeam: "Golden Knights", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p5", name: "Theo Hernández", role: "D", serieATeam: "Milan", quotation: 89, originTeam: "Ibla", conference: CONFERENCE_LEAGUE },
  { id: "p6", name: "Di Lorenzo G.", role: "D", serieATeam: "Napoli", quotation: 88, originTeam: "PokerMantra", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p7", name: "Bremer", role: "D", serieATeam: "Juventus", quotation: 89, originTeam: "Riverfilo", conference: CONFERENCE_LEAGUE },
  { id: "p8", name: "Barella N.", role: "C", serieATeam: "Inter", quotation: 93, originTeam: "FC Disoneste", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p9", name: "Calhanoglu H.", role: "C", serieATeam: "Inter", quotation: 87, originTeam: "I Predestinati", conference: CONFERENCE_LEAGUE },
  { id: "p10", name: "Bellingham J.", role: "C", serieATeam: "Real Madrid", quotation: 95, originTeam: "Minnesota Snakes", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p11", name: "Rice D.", role: "C", serieATeam: "Arsenal", quotation: 90, originTeam: "Minnesode Timberland", conference: CONFERENCE_LEAGUE },
  { id: "p12", name: "Mbappé K.", role: "A", serieATeam: "Real Madrid", quotation: 96, originTeam: "Athletic Pongao", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p13", name: "Osimhen V.", role: "A", serieATeam: "Napoli", quotation: 90, originTeam: "Pandinicoccolosini", conference: CONFERENCE_LEAGUE },
  { id: "p14", name: "Lautaro Martinez", role: "A", serieATeam: "Inter", quotation: 92, originTeam: "Eintracht Franco 126", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p15", name: "Kane H.", role: "A", serieATeam: "Bayern", quotation: 93, originTeam: "Wildboys 78", conference: CONFERENCE_LEAGUE },
  { id: "p16", name: "Leao R.", role: "A", serieATeam: "Milan", quotation: 89, originTeam: "Rubinkebab", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p17", name: "Lookman A.", role: "A", serieATeam: "Atalanta", quotation: 86, originTeam: "Ibla", conference: CONFERENCE_LEAGUE },
  { id: "p18", name: "Vlahovic D.", role: "A", serieATeam: "Juventus", quotation: 88, originTeam: "I Gladiatori", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p19", name: "Zapata D.", role: "A", serieATeam: "Torino", quotation: 82, originTeam: "Nemesi", conference: CONFERENCE_LEAGUE },
  { id: "p20", name: "Kvaratskhelia K.", role: "A", serieATeam: "Napoli", quotation: 90, originTeam: "Gli Immortali", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p21", name: "Rabiot A.", role: "C", serieATeam: "Juventus", quotation: 80, originTeam: "Titani", conference: CONFERENCE_LEAGUE },
  { id: "p22", name: "Dimarco F.", role: "D", serieATeam: "Inter", quotation: 85, originTeam: "Team Bartowski", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p23", name: "Yildiz K.", role: "A", serieATeam: "Juventus", quotation: 83, originTeam: "PokerMantra", conference: CONFERENCE_LEAGUE },
  { id: "p24", name: "Soulé M.", role: "A", serieATeam: "Roma", quotation: 81, originTeam: "Ibla", conference: CONFERENCE_CHAMPIONSHIP },
  { id: "p25", name: "De Ketelaere C.", role: "A", serieATeam: "Atalanta", quotation: 84, originTeam: "Rubinkebab", conference: CONFERENCE_LEAGUE },
  { id: "p26", name: "Orsolini R.", role: "A", serieATeam: "Bologna", quotation: 82, originTeam: "Bayern Christiansen", conference: CONFERENCE_CHAMPIONSHIP }
];

let players = [...demoPlayers];
let state = loadState();
let picks = loadPicks();
let votes = loadVotes();
let activeWeek = loadActiveWeek();

const els = {
  hamburger: document.getElementById("hamburger"),
  navMenu: document.getElementById("navMenu"),

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
  demoVotesBtn: document.getElementById("demoVotesBtn"),
  resetVotesBtn: document.getElementById("resetVotesBtn"),
  generateAutoPicksBtn: document.getElementById("generateAutoPicksBtn"),

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
  adminToggle: document.getElementById("adminToggle"),
  adminBody: document.getElementById("adminBody"),
  adminChevron: document.getElementById("adminChevron"),
  toggleDraftBtn: document.getElementById("toggleDraftBtn"),
  undoPickBtn: document.getElementById("undoPickBtn"),
  resetDraftBtn: document.getElementById("resetDraftBtn")
};

init();

function init() {
  populateFilters();
  populateVoteSelects();
  bindEvents();
  renderAll();
}

function bindEvents() {
  els.hamburger?.addEventListener("click", () => {
    els.navMenu.classList.toggle("open");
  });

  els.voteForm.addEventListener("submit", handleVoteSubmit);
  els.demoVotesBtn.addEventListener("click", addDemoVotes);
  els.resetVotesBtn.addEventListener("click", resetVotes);
  els.generateAutoPicksBtn.addEventListener("click", generateAutoPicksFromVotes);

  [els.searchInput, els.roleFilter, els.teamFilter, els.originFilter, els.conferenceFilter].forEach((el) => {
    el?.addEventListener("input", renderPool);
    el?.addEventListener("change", renderPool);
  });

  els.clearFiltersBtn.addEventListener("click", () => {
    els.searchInput.value = "";
    els.roleFilter.value = "";
    els.teamFilter.value = "";
    els.originFilter.value = "";
    els.conferenceFilter.value = "";
    renderPool();
  });

  els.openPickModalBtn.addEventListener("click", openPickModal);
  els.closePickModalBtn.addEventListener("click", () => els.pickModal.close());
  els.modalSearchInput.addEventListener("input", renderModalPlayers);

  els.adminToggle.addEventListener("click", () => {
    els.adminBody.classList.toggle("open");
    els.adminChevron.textContent = els.adminBody.classList.contains("open") ? "⌃" : "⌄";
  });

  els.toggleDraftBtn.addEventListener("click", () => {
    state.isOpen = !state.isOpen;
    saveState();
    renderAll();
  });

  els.undoPickBtn.addEventListener("click", undoLastPick);

  els.resetDraftBtn.addEventListener("click", () => {
    const ok = confirm("Vuoi davvero resettare il draft All Star?");
    if (!ok) return;

    picks = [];
    state = defaultState();
    savePicks();
    saveState();
    renderAll();
  });
}

function defaultState() {
  return {
    year: 2027,
    isOpen: true,
    currentPick: 7,
    firstConference: CONFERENCE_LEAGUE
  };
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY)) || defaultState();
  } catch {
    return defaultState();
  }
}

function saveState() {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function loadPicks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function savePicks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(picks));
}

function loadVotes() {
  try {
    return JSON.parse(localStorage.getItem(VOTES_KEY)) || [];
  } catch {
    return [];
  }
}

function saveVotes() {
  localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
}

function loadActiveWeek() {
  return Number(localStorage.getItem(ACTIVE_WEEK_KEY) || 1);
}

function populateVoteSelects() {
  const options = players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => `<option value="${escapeAttr(p.id)}">${escapeHtml(p.name)} · ${escapeHtml(p.role)} · ${escapeHtml(p.serieATeam)}</option>`)
    .join("");

  [els.vote10, els.vote5, els.vote2].forEach((select) => {
    select.innerHTML = `<option value="">Seleziona giocatore</option>${options}`;
  });
}

function handleVoteSubmit(event) {
  event.preventDefault();

  const voterConference = els.voterConference.value;

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

  // Demo voter locale. Con Supabase sarà profiles.team_id e teams.conference.
  const demoVoterTeamId = `demo-team-${voterConference}`;

  votes = votes.filter((vote) => !(vote.week === activeWeek && vote.voterTeamId === demoVoterTeamId));

  selected.forEach((vote) => {
    const player = players.find((p) => p.id === vote.playerId);
    votes.push({
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      season: 2027,
      week: activeWeek,
      voterTeamId: demoVoterTeamId,
      voterConference,
      playerId: vote.playerId,
      player,
      points: vote.points,
      slot: vote.slot,
      createdAt: new Date().toISOString()
    });
  });

  saveVotes();
  showVoteFeedback(`Voti salvati per ${voterConference}.`);
  renderVotesArea();
}

function showVoteFeedback(message, isError = false) {
  els.voteFeedback.textContent = message;
  els.voteFeedback.style.color = isError ? "#b72e2e" : "#198749";
}

function addDemoVotes() {
  const sampleLeague = ["p14", "p23", "p25", "p17", "p22", "p8", "p13", "p16"];
  const sampleChamp = ["p20", "p14", "p24", "p10", "p18", "p5", "p25", "p23"];

  addDemoVotesForConference(CONFERENCE_LEAGUE, sampleLeague, ["Rubinkebab", "Bartowski", "Ibla", "Wildboys", "Pandinicoccolosini"]);
  addDemoVotesForConference(CONFERENCE_CHAMPIONSHIP, sampleChamp, ["Bayern", "PokerMantra", "Golden Knights", "Disoneste", "Riverfilo"]);

  saveVotes();
  renderVotesArea();
}

function addDemoVotesForConference(conference, sampleIds, teams) {
  teams.forEach((teamName, idx) => {
    const shuffled = sampleIds.slice().sort(() => Math.random() - 0.5);

    [
      { playerId: shuffled[0], points: 10, slot: "first" },
      { playerId: shuffled[1], points: 5, slot: "second" },
      { playerId: shuffled[2], points: 2, slot: "third" }
    ].forEach((vote) => {
      const player = players.find((p) => p.id === vote.playerId);
      votes.push({
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        season: 2027,
        week: activeWeek,
        voterTeamId: `demo-${conference}-${teamName}-${idx}-${Date.now()}`,
        voterConference: conference,
        playerId: vote.playerId,
        player,
        points: vote.points,
        slot: vote.slot,
        createdAt: new Date().toISOString()
      });
    });
  });
}

function resetVotes() {
  const ok = confirm("Vuoi davvero cancellare tutti i voti demo/locali?");
  if (!ok) return;

  votes = [];
  saveVotes();
  renderVotesArea();
}

function getVoteTotalsByConference(conference) {
  const map = new Map();

  votes
    .filter((vote) => vote.voterConference === conference)
    .forEach((vote) => {
      if (!map.has(vote.playerId)) {
        const player = players.find((p) => p.id === vote.playerId) || vote.player;
        map.set(vote.playerId, {
          playerId: vote.playerId,
          player,
          total: 0,
          weekTotal: 0
        });
      }

      const entry = map.get(vote.playerId);
      entry.total += Number(vote.points || 0);

      if (vote.week === activeWeek) {
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

  els.activeWeekInfo.textContent = `Week ${activeWeek}`;
  els.voteWeekPill.textContent = `Week ${activeWeek}`;
  els.leagueVoteLeaderInfo.textContent = leagueLeader ? `${leagueLeader.player.name} (${leagueLeader.total} pt)` : "-";
  els.champVoteLeaderInfo.textContent = champLeader ? `${champLeader.player.name} (${champLeader.total} pt)` : "-";

  renderWeekStars(leagueTotals, champTotals);
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
    nameEl.textContent = "-";
    detailsEl.textContent = "Nessun voto registrato.";
    return;
  }

  nameEl.textContent = star.player.name;
  detailsEl.textContent = `${star.weekTotal} pt questa week · Totale ${star.total} · ${star.player.role} · ${star.player.serieATeam}`;
}

function renderConferenceRanking(container, totals, conference) {
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
          <small>${escapeHtml(entry.player.role)} · ${escapeHtml(entry.player.serieATeam)} · Q. ${entry.player.quotation}</small>
        </span>
        <span class="ranking-points">${entry.total} pt</span>
        <span class="auto-badge">Top 5</span>
      </div>
    `;
  }).join("");
}

function getAutoPickPreviewRows(leagueTotals, champTotals) {
  return [
    { pickNumber: 1, conference: CONFERENCE_LEAGUE, entry: leagueTotals[0] },
    { pickNumber: 2, conference: CONFERENCE_CHAMPIONSHIP, entry: champTotals[0] },
    { pickNumber: 3, conference: CONFERENCE_LEAGUE, entry: leagueTotals[1] },
    { pickNumber: 4, conference: CONFERENCE_CHAMPIONSHIP, entry: champTotals[1] },
    { pickNumber: 5, conference: CONFERENCE_LEAGUE, entry: leagueTotals[2] },
    { pickNumber: 6, conference: CONFERENCE_CHAMPIONSHIP, entry: champTotals[2] }
  ];
}

function renderAutoPickPreview(leagueTotals, champTotals) {
  const rows = getAutoPickPreviewRows(leagueTotals, champTotals);
  const selectedIds = rows.filter((row) => row.entry).map((row) => row.entry.playerId);
  const duplicateIds = selectedIds.filter((id, index) => selectedIds.indexOf(id) !== index);

  els.autoPickPreview.innerHTML = rows.map((row) => {
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
}

function generateAutoPicksFromVotes() {
  const leagueTotals = getVoteTotalsByConference(CONFERENCE_LEAGUE);
  const champTotals = getVoteTotalsByConference(CONFERENCE_CHAMPIONSHIP);
  const rows = getAutoPickPreviewRows(leagueTotals, champTotals);

  if (rows.some((row) => !row.entry)) {
    alert("Servono almeno 3 giocatori votati per ciascuna conference.");
    return;
  }

  const ok = confirm("Generare le prime 6 auto-pick dalle due Top 5 di conference?");
  if (!ok) return;

  picks = picks.filter((pick) => pick.pickNumber > AUTO_PICK_COUNT);

  rows.forEach((row) => {
    picks.push({
      pickNumber: row.pickNumber,
      conference: row.conference,
      playerId: row.entry.playerId,
      player: row.entry.player,
      source: "vote",
      pointsTotal: row.entry.total,
      createdAt: new Date().toISOString()
    });
  });

  picks.sort((a, b) => a.pickNumber - b.pickNumber);
  state.currentPick = Math.max(7, state.currentPick);
  savePicks();
  saveState();
  renderAll();
}

/* DRAFT */

function getCurrentConference() {
  return state.currentPick % 2 === 1 ? CONFERENCE_LEAGUE : CONFERENCE_CHAMPIONSHIP;
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

  els.currentPickInfo.textContent = String(state.currentPick);
  els.currentConferenceInfo.textContent = currentConference;
  els.selectedCountInfo.textContent = `${selected} / ${TOTAL_PLAYERS}`;
  els.currentPickBig.textContent = String(state.currentPick);
  els.currentConferenceBig.textContent = currentConference;
  els.currentConferenceBig.dataset.conf = currentConference;

  els.openPickModalBtn.disabled = !state.isOpen || selected >= TOTAL_PLAYERS;
  els.openPickModalBtn.textContent = selected >= TOTAL_PLAYERS ? "Draft completato" : "Effettua chiamata";
}

function renderRosters() {
  const leaguePicks = picks.filter((pick) => pick.conference === CONFERENCE_LEAGUE);
  const championshipPicks = picks.filter((pick) => pick.conference === CONFERENCE_CHAMPIONSHIP);

  els.leagueCount.textContent = `${leaguePicks.length} / ${PLAYERS_PER_TEAM} giocatori selezionati`;
  els.championshipCount.textContent = `${championshipPicks.length} / ${PLAYERS_PER_TEAM} giocatori selezionati`;

  els.leagueRoster.innerHTML = renderRosterByRole(leaguePicks);
  els.championshipRoster.innerHTML = renderRosterByRole(championshipPicks);
}

function renderRosterByRole(teamPicks) {
  const roles = ["P", "D", "C", "A"];

  return roles.map((role) => {
    const rolePlayers = teamPicks
      .map((pick) => ({ ...pick.player, source: pick.source, pickNumber: pick.pickNumber }))
      .filter((player) => player.role === role);

    const rows = rolePlayers.length
      ? rolePlayers.map((player) => `
          <div class="player-mini">
            <strong>${escapeHtml(player.name)}${player.source === "vote" ? " ⭐" : ""}</strong>
            <span>Pick ${player.pickNumber} · ${escapeHtml(player.serieATeam)}</span>
            <b>${player.quotation ?? "-"}</b>
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

function populateFilters() {
  const serieATeams = unique(players.map((p) => p.serieATeam)).sort();
  const originTeams = unique(players.map((p) => p.originTeam)).sort();

  els.teamFilter.innerHTML += serieATeams.map((team) => `<option value="${escapeAttr(team)}">${escapeHtml(team)}</option>`).join("");
  els.originFilter.innerHTML += originTeams.map((team) => `<option value="${escapeAttr(team)}">${escapeHtml(team)}</option>`).join("");
}

function getFilteredPlayers() {
  const q = els.searchInput.value.trim().toLowerCase();
  const role = els.roleFilter.value;
  const serieATeam = els.teamFilter.value;
  const originTeam = els.originFilter.value;
  const conference = els.conferenceFilter.value;

  return getAvailablePlayers().filter((player) => {
    const matchesSearch =
      !q ||
      player.name.toLowerCase().includes(q) ||
      player.serieATeam.toLowerCase().includes(q) ||
      player.originTeam.toLowerCase().includes(q);

    return (
      matchesSearch &&
      (!role || player.role === role) &&
      (!serieATeam || player.serieATeam === serieATeam) &&
      (!originTeam || player.originTeam === originTeam) &&
      (!conference || player.conference === conference)
    );
  });
}

function renderPool() {
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
      <td><span class="role-pill role-${escapeAttr(player.role)}">${escapeHtml(player.role)}</span></td>
      <td>${escapeHtml(player.serieATeam)}</td>
      <td>${player.quotation ?? "-"}</td>
      <td>${escapeHtml(player.originTeam)}</td>
      <td>${escapeHtml(player.conference)}</td>
      <td>
        <button class="pick-btn" data-player-id="${escapeAttr(player.id)}">Scegli</button>
      </td>
    </tr>
  `).join("");

  document.querySelectorAll(".pick-btn").forEach((btn) => {
    btn.addEventListener("click", () => makePick(btn.dataset.playerId));
  });
}

function openPickModal() {
  if (!state.isOpen) {
    alert("Il draft è chiuso.");
    return;
  }

  els.modalPickText.textContent = `Pick ${state.currentPick} - ${getCurrentConference()}`;
  els.modalSearchInput.value = "";
  renderModalPlayers();
  els.pickModal.showModal();
}

function renderModalPlayers() {
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
    .slice(0, 80);

  if (!els.modalPlayersList) return;

  if (!available.length) {
    els.modalPlayersList.innerHTML = `<div class="modal-player-row"><strong>Nessun giocatore disponibile</strong></div>`;
    return;
  }

  els.modalPlayersList.innerHTML = available.map((player) => `
    <div class="modal-player-row">
      <div>
        <strong>${escapeHtml(player.name)}</strong>
        <small>${escapeHtml(player.role)} · ${escapeHtml(player.serieATeam)} · Q. ${player.quotation ?? "-"} · ${escapeHtml(player.originTeam)}</small>
      </div>
      <button class="pick-btn" data-modal-player-id="${escapeAttr(player.id)}">Scegli</button>
    </div>
  `).join("");

  document.querySelectorAll("[data-modal-player-id]").forEach((btn) => {
    btn.addEventListener("click", () => {
      makePick(btn.dataset.modalPlayerId);
      els.pickModal.close();
    });
  });
}

function makePick(playerId) {
  if (!state.isOpen) {
    alert("Il draft è chiuso.");
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

  picks.push({
    pickNumber: state.currentPick,
    conference,
    playerId: player.id,
    player,
    source: "manual",
    createdAt: new Date().toISOString()
  });

  state.currentPick += 1;

  savePicks();
  saveState();
  renderAll();
}

function undoLastPick() {
  if (!picks.length) return;

  const manualPicks = picks.filter((pick) => pick.pickNumber >= 7);
  const lastManual = manualPicks.sort((a, b) => b.pickNumber - a.pickNumber)[0];

  if (!lastManual) {
    alert("Le prime 6 auto-pick non si annullano da qui. Puoi resettare il draft o rigenerarle.");
    return;
  }

  picks = picks.filter((pick) => pick.pickNumber !== lastManual.pickNumber);
  state.currentPick = Math.max(7, lastManual.pickNumber);

  savePicks();
  saveState();
  renderAll();
}

function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
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
      if (tabs) {
        tabs.scrollIntoView({ behavior: "smooth", block: "start" });
      }
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
