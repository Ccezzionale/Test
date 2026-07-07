import { supabase } from "./supabase.js";

// =========================================================
// CRASH OUT CUP - PRIMA FASE SERIA
// Supabase salva gironi, calendario e magic punteggi.
// La classifica pubblica si calcola automaticamente dai risultati.
// =========================================================

const CRASHOUT_SEASON = "2026";
const MAX_MATCHDAY = 6;
const GROUP_IDS = ["A", "B", "C", "D"];
const GROUP_SIZE = 4;

const TEAM_DATA = [
  { nome: "Atlètico Leon", logo: "img/Atlético Leon.webp", coach: "Coach Rubinkebab" },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.webp", coach: "Coach Christian" },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.webp", coach: "Coach Marco" },
  { nome: "Golden Knights", logo: "img/Golden Knights.webp", coach: "Coach Mimmo&Francesco" },
  { nome: "Ibla", logo: "img/Ibla.webp", coach: "Coach Francesco" },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.webp", coach: "Coach Giancarlo" },
  { nome: "Riverfilo", logo: "img/Riverfilo.webp", coach: "Coach Federico" },
  { nome: "Desperados", logo: "img/Desperados.webp", coach: "Coach Stefano" },
  { nome: "Wildboys 78", logo: "img/wildboys78.webp", coach: "Coach Francesco" },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.webp", coach: "Coach Davide" },
  { nome: "Pokermantra", logo: "img/PokerMantra.webp", coach: "Coach Omar" },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.webp", coach: "Coach Pierpaolo&Leandro" },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.webp", coach: "Coach Alberto" },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.webp", coach: "Coach Eintracht" },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.webp", coach: "Coach FC Disoneste" },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.webp", coach: "Coach Dario" }
];

const TEAM_NAMES = TEAM_DATA.map(team => team.nome);
const TEAM_LOGOS = Object.fromEntries(TEAM_DATA.map(team => [team.nome, team.logo]));

const DEFAULT_GROUPS = {
  A: ["Atlètico Leon", "Bayern Christiansen", "Team Bartowski", "Golden Knights"],
  B: ["Ibla", "Fantaugusta", "Riverfilo", "Desperados"],
  C: ["Wildboys 78", "Pandinicoccolosini", "Pokermantra", "Minnesode Timberland"],
  D: ["Minnesota Snakes", "Eintracht Franco 126", "FC Disoneste", "Athletic Pongao"]
};

// 4 squadre, 6 giornate, andata/ritorno.
// Gli indici si riferiscono agli slot del girone: 0, 1, 2, 3.
const PAIRINGS = [
  [[0, 2], [1, 3]],
  [[0, 3], [2, 1]],
  [[0, 1], [3, 2]],
  [[2, 0], [3, 1]],
  [[3, 0], [1, 2]],
  [[1, 0], [2, 3]]
];

const MATCHDAY_DATES = {
  1: { date: "Da definire", time: "--:--" },
  2: { date: "Da definire", time: "--:--" },
  3: { date: "Da definire", time: "--:--" },
  4: { date: "Da definire", time: "--:--" },
  5: { date: "Da definire", time: "--:--" },
  6: { date: "Da definire", time: "--:--" }
};

let activeGroup = "all";
let activeMatchday = 1;
let currentGroups = cloneGroups(DEFAULT_GROUPS);
let fixtures = [];
let isAdminUser = false;

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function cloneGroups(groups) {
  return Object.fromEntries(
    GROUP_IDS.map(group => [group, [...(groups[group] || [])]])
  );
}

function logoSrc(team) {
  return encodeURI(TEAM_LOGOS[team] || `img/${team}.webp`);
}

function initials(team) {
  return String(team || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join("")
    .toUpperCase();
}

function createLogo(team, classPrefix = "team") {
  const wrap = document.createElement("span");
  wrap.className = `${classPrefix}-logo-wrap`;

  const img = document.createElement("img");
  img.className = `${classPrefix}-logo`;
  img.alt = team;
  img.src = logoSrc(team);

  img.onerror = () => {
    wrap.classList.add("logo-fallback");
    wrap.textContent = initials(team);
    img.remove();
  };

  wrap.appendChild(img);
  return wrap;
}

function mountLogos(root = document) {
  root.querySelectorAll(".logo-mount").forEach(mount => {
    const team = mount.dataset.logoTeam;
    const logoClass = mount.dataset.logoClass || "team";
    mount.replaceWith(createLogo(team, logoClass));
  });
}

function getTeamGroup(team) {
  return Object.entries(currentGroups).find(([, teams]) => teams.includes(team))?.[0] || "";
}

function initialRank(team) {
  const flat = GROUP_IDS.flatMap(group => currentGroups[group] || []);
  const idx = flat.indexOf(team);
  return idx === -1 ? 999 : idx;
}

function matchId(group, matchday, matchIndex) {
  return `${CRASHOUT_SEASON}-${group}-G${matchday}-M${matchIndex}`;
}

function goalsFromMagic(score) {
  if (score === null || score === undefined || score === "") return null;
  const value = Number(score);
  if (!Number.isFinite(value)) return null;
  if (value < 66) return 0;
  return Math.floor((value - 66) / 6) + 1;
}

function formatMagic(value) {
  if (value === null || value === undefined || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? String(n).replace(".", ",") : "";
}

function parseMagic(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function buildFixturesFromGroups(groups) {
  const rows = [];

  GROUP_IDS.forEach(group => {
    const teams = groups[group] || [];
    if (teams.length !== GROUP_SIZE || teams.some(team => !team)) return;

    PAIRINGS.forEach((matchdayPairs, matchdayIndex) => {
      const matchday = matchdayIndex + 1;
      const meta = MATCHDAY_DATES[matchday];

      matchdayPairs.forEach(([homeIndex, awayIndex], pairIndex) => {
        const matchIndex = pairIndex + 1;
        rows.push({
          id: matchId(group, matchday, matchIndex),
          season: CRASHOUT_SEASON,
          group,
          matchday,
          matchIndex,
          home: teams[homeIndex],
          away: teams[awayIndex],
          date: meta.date,
          time: meta.time,
          homeMagic: null,
          awayMagic: null,
          homeGoals: null,
          awayGoals: null,
          isPlayed: false
        });
      });
    });
  });

  return rows;
}

function rowToFixture(row) {
  return {
    id: row.id,
    season: row.season || CRASHOUT_SEASON,
    group: row.group_id,
    matchday: Number(row.matchday),
    matchIndex: Number(row.match_index),
    home: row.home_team,
    away: row.away_team,
    date: MATCHDAY_DATES[Number(row.matchday)]?.date || "Da definire",
    time: MATCHDAY_DATES[Number(row.matchday)]?.time || "--:--",
    homeMagic: row.home_magic,
    awayMagic: row.away_magic,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    isPlayed: !!row.is_played
  };
}

function fixtureToRow(match, resetScores = false) {
  const homeMagic = resetScores ? null : match.homeMagic;
  const awayMagic = resetScores ? null : match.awayMagic;
  const homeGoals = resetScores ? null : match.homeGoals;
  const awayGoals = resetScores ? null : match.awayGoals;

  return {
    id: match.id,
    season: CRASHOUT_SEASON,
    group_id: match.group,
    matchday: match.matchday,
    match_index: match.matchIndex,
    home_team: match.home,
    away_team: match.away,
    home_magic: homeMagic,
    away_magic: awayMagic,
    home_goals: homeGoals,
    away_goals: awayGoals,
    is_played: resetScores ? false : !!match.isPlayed,
    updated_at: new Date().toISOString()
  };
}

async function loadGroupsFromSupabase() {
  const { data, error } = await supabase
    .from("crashout_group_slots")
    .select("group_id, slot, team_name")
    .eq("season", CRASHOUT_SEASON)
    .order("group_id", { ascending: true })
    .order("slot", { ascending: true });

  if (error) throw error;
  if (!data || data.length !== GROUP_IDS.length * GROUP_SIZE) return null;

  const groups = Object.fromEntries(GROUP_IDS.map(group => [group, []]));
  data.forEach(row => {
    if (!GROUP_IDS.includes(row.group_id)) return;
    groups[row.group_id][Number(row.slot)] = row.team_name;
  });

  const isComplete = GROUP_IDS.every(group =>
    groups[group].length === GROUP_SIZE && groups[group].every(Boolean)
  );

  return isComplete ? groups : null;
}

async function loadMatchesFromSupabase(generatedFixtures) {
  const { data, error } = await supabase
    .from("crashout_group_matches")
    .select("*")
    .eq("season", CRASHOUT_SEASON)
    .order("group_id", { ascending: true })
    .order("matchday", { ascending: true })
    .order("match_index", { ascending: true });

  if (error) throw error;

  const savedById = new Map((data || []).map(row => [row.id, rowToFixture(row)]));

  return generatedFixtures.map(match => {
    const saved = savedById.get(match.id);

    // Se i gironi sono cambiati, non ricicliamo risultati di una vecchia partita con lo stesso id.
    if (!saved || saved.home !== match.home || saved.away !== match.away) {
      return match;
    }

    return {
      ...match,
      homeMagic: saved.homeMagic,
      awayMagic: saved.awayMagic,
      homeGoals: saved.homeGoals,
      awayGoals: saved.awayGoals,
      isPlayed: saved.isPlayed
    };
  });
}

async function loadInitialData() {
  try {
    const savedGroups = await loadGroupsFromSupabase();
    currentGroups = savedGroups ? cloneGroups(savedGroups) : cloneGroups(DEFAULT_GROUPS);
  } catch (error) {
    console.warn("Crash Out Cup: impossibile caricare i gironi da Supabase, uso il fallback JS.", error);
    currentGroups = cloneGroups(DEFAULT_GROUPS);
  }

  const generated = buildFixturesFromGroups(currentGroups);

  try {
    fixtures = await loadMatchesFromSupabase(generated);
  } catch (error) {
    console.warn("Crash Out Cup: impossibile caricare il calendario da Supabase, mostro calendario generato senza risultati.", error);
    fixtures = generated;
  }
}

async function isCurrentUserAdmin() {
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user) return false;

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .single();

  if (profileError) {
    console.error("Errore profilo admin Crash Out Cup:", profileError);
    return false;
  }

  return String(profile?.role || "").toLowerCase() === "admin";
}

function calculateStandings(matches) {
  const table = new Map();

  GROUP_IDS.flatMap(group => currentGroups[group] || []).forEach(team => {
    table.set(team, {
      team,
      group: getTeamGroup(team),
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      gf: 0,
      ga: 0,
      gd: 0,
      points: 0,
      fantasyPoints: 0
    });
  });

  matches.forEach(match => {
    if (!match.isPlayed) return;
    if (!Number.isFinite(Number(match.homeGoals)) || !Number.isFinite(Number(match.awayGoals))) return;

    const home = table.get(match.home);
    const away = table.get(match.away);
    if (!home || !away) return;

    const homeGoals = Number(match.homeGoals);
    const awayGoals = Number(match.awayGoals);

    home.played += 1;
    away.played += 1;

    home.gf += homeGoals;
    home.ga += awayGoals;
    away.gf += awayGoals;
    away.ga += homeGoals;

    home.fantasyPoints += Number(match.homeMagic || 0);
    away.fantasyPoints += Number(match.awayMagic || 0);

    if (homeGoals > awayGoals) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (homeGoals < awayGoals) {
      away.wins += 1;
      home.losses += 1;
      away.points += 3;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.points += 1;
      away.points += 1;
    }
  });

  const rows = Array.from(table.values()).map(row => ({
    ...row,
    gd: row.gf - row.ga
  }));

  rows.sort((a, b) =>
    b.points - a.points ||
    b.gd - a.gd ||
    b.gf - a.gf ||
    b.fantasyPoints - a.fantasyPoints ||
    initialRank(a.team) - initialRank(b.team)
  );

  return rows;
}

function formatDiff(n) {
  return n > 0 ? `+${n}` : String(n);
}

function renderStandings() {
  const body = $("#standings-body");
  if (!body) return;

  const standings = calculateStandings(fixtures);

  body.innerHTML = standings.map((row, index) => {
    const pos = index + 1;
    const seedTier = Math.ceil(pos / 4);
    const diffClass = row.gd > 0 ? "diff-positive" : row.gd < 0 ? "diff-negative" : "";

    return `
      <tr class="is-seeded seed-tier-${seedTier}">
        <td class="pos-cell">${pos}</td>
        <td>
          <div class="team-cell" data-team="${row.team}">
            <span class="logo-mount" data-logo-team="${row.team}" data-logo-class="team"></span>
            <span class="team-main">
              <span class="team-name">${row.team}</span>
              <span class="team-status">Seed #${pos} playoff</span>
            </span>
          </div>
        </td>
        <td><span class="group-badge group-${row.group}">${row.group}</span></td>
        <td>${row.played}</td>
        <td>${row.wins}</td>
        <td>${row.draws}</td>
        <td>${row.losses}</td>
        <td>${row.gf}</td>
        <td>${row.ga}</td>
        <td class="${diffClass}">${formatDiff(row.gd)}</td>
        <td class="points-cell">${row.points}</td>
      </tr>
    `;
  }).join("");

  mountLogos(body);
}

function renderGroups() {
  const grid = $("#groups-grid");
  if (!grid) return;

  grid.innerHTML = GROUP_IDS.map(group => {
    const teams = currentGroups[group] || [];
    return `
      <article class="group-card" data-group="${group}">
        <h3>Girone ${group}</h3>
        ${teams.map(team => `
          <div class="group-team">
            <span class="logo-mount" data-logo-team="${team}" data-logo-class="group"></span>
            <span>${team}</span>
          </div>
        `).join("")}
      </article>
    `;
  }).join("");

  mountLogos(grid);
}

function getVisibleFixtures() {
  return fixtures.filter(match => {
    const groupMatch = activeGroup === "all" || match.group === activeGroup;
    return groupMatch && match.matchday === activeMatchday;
  });
}

function renderSchedule() {
  const list = $("#schedule-list");
  const label = $("#matchday-label");
  if (!list || !label) return;

  label.textContent = `Giornata ${activeMatchday}`;

  const visible = getVisibleFixtures();

  if (!visible.length) {
    list.innerHTML = `<div class="empty-state">Nessuna partita per questo filtro.</div>`;
    return;
  }

  list.innerHTML = visible.map(match => {
    const scoreText = match.isPlayed ? `${match.homeGoals} - ${match.awayGoals}` : "Da giocare";
    const homeScore = match.isPlayed ? `${formatMagic(match.homeMagic)} → ${match.homeGoals}` : "-";
    const awayScore = match.isPlayed ? `${formatMagic(match.awayMagic)} → ${match.awayGoals}` : "-";

    return `
      <article class="fixture-card ${match.isPlayed ? "is-played" : "is-unplayed"}" data-group="${match.group}">
        <div class="fixture-team home">
          <span class="logo-mount" data-logo-team="${match.home}" data-logo-class="fixture"></span>
          <span>
            <span class="fixture-team-name">${match.home}</span>
            <span class="fixture-score">${homeScore}</span>
          </span>
        </div>

        <div class="fixture-vs"><span>${match.isPlayed ? scoreText : "VS"}</span></div>

        <div class="fixture-team away">
          <span>
            <span class="fixture-team-name">${match.away}</span>
            <span class="fixture-score">${awayScore}</span>
          </span>
          <span class="logo-mount" data-logo-team="${match.away}" data-logo-class="fixture"></span>
        </div>

        <div class="fixture-meta">
          <span>${match.date}<br>${match.time}</span>
          <span class="group-badge group-${match.group}">${match.group}</span>
        </div>
      </article>
    `;
  }).join("");

  mountLogos(list);
}

function renderAllPublic() {
  renderStandings();
  renderGroups();
  renderSchedule();
}

function bindScheduleControls() {
  const tabs = $("#schedule-tabs");
  const prev = $("#prev-matchday");
  const next = $("#next-matchday");

  tabs?.addEventListener("click", event => {
    const btn = event.target.closest(".schedule-tab");
    if (!btn) return;

    activeGroup = btn.dataset.group || "all";

    tabs.querySelectorAll(".schedule-tab").forEach(tab => {
      tab.classList.toggle("is-active", tab === btn);
    });

    renderSchedule();
  });

  prev?.addEventListener("click", () => {
    activeMatchday = activeMatchday <= 1 ? MAX_MATCHDAY : activeMatchday - 1;
    renderSchedule();
  });

  next?.addEventListener("click", () => {
    activeMatchday = activeMatchday >= MAX_MATCHDAY ? 1 : activeMatchday + 1;
    renderSchedule();
  });
}

function setStatus(id, message, type = "") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = message;
  el.classList.toggle("is-error", type === "error");
  el.classList.toggle("is-ok", type === "ok");
}

function renderAdminGroups() {
  const grid = document.getElementById("admin-groups-grid");
  if (!grid) return;

  const options = TEAM_NAMES.map(team => `<option value="${team}">${team}</option>`).join("");

  grid.innerHTML = GROUP_IDS.map(group => `
    <article class="admin-group-card" data-admin-group="${group}">
      <h3>Girone ${group}</h3>
      ${Array.from({ length: GROUP_SIZE }).map((_, slot) => {
        const selectedTeam = currentGroups[group]?.[slot] || "";
        return `
          <div class="admin-slot-row">
            <label>
              Slot ${slot + 1}
              <select data-group="${group}" data-slot="${slot}">
                <option value="">Seleziona squadra</option>
                ${options}
              </select>
            </label>
          </div>
        `.replace(`value="${selectedTeam}"`, `value="${selectedTeam}" selected`);
      }).join("")}
    </article>
  `).join("");

  grid.querySelectorAll("select").forEach(select => {
    const group = select.dataset.group;
    const slot = Number(select.dataset.slot);
    select.value = currentGroups[group]?.[slot] || "";
  });
}

function renderAdminMatchdaySelect() {
  const select = document.getElementById("admin-matchday-select");
  if (!select) return;

  select.innerHTML = Array.from({ length: MAX_MATCHDAY }).map((_, index) => {
    const day = index + 1;
    return `<option value="${day}">Giornata ${day}</option>`;
  }).join("");

  select.value = String(activeMatchday);
  select.addEventListener("change", () => {
    activeMatchday = Number(select.value) || 1;
    renderSchedule();
    renderAdminResults();
  });
}

function renderAdminResults() {
  const grid = document.getElementById("admin-results-grid");
  if (!grid) return;

  const matches = fixtures.filter(match => match.matchday === activeMatchday);

  if (!matches.length) {
    grid.innerHTML = `<div class="empty-state">Genera prima il calendario. Sì, anche il nulla ha bisogno di essere creato.</div>`;
    return;
  }

  grid.innerHTML = matches.map(match => `
    <article class="admin-result-card" data-match-id="${match.id}">
      <div class="admin-result-match">
        <div class="admin-result-kicker">
          <span class="group-badge group-${match.group}">${match.group}</span>
          <span>Giornata ${match.matchday}</span>
        </div>
        <div class="admin-result-teams">${match.home}<br>vs ${match.away}</div>
        <div class="admin-result-score">
          ${match.isPlayed ? `Risultato: ${match.homeGoals} - ${match.awayGoals}` : "Da giocare"}
        </div>
      </div>

      <label class="admin-magic-field">
        Casa
        <input class="admin-magic-input" type="number" step="0.5" min="0" inputmode="decimal" data-side="home" value="${match.homeMagic ?? ""}">
      </label>

      <label class="admin-magic-field">
        Trasferta
        <input class="admin-magic-input" type="number" step="0.5" min="0" inputmode="decimal" data-side="away" value="${match.awayMagic ?? ""}">
      </label>
    </article>
  `).join("");
}

function readGroupsFromAdmin() {
  const groups = Object.fromEntries(GROUP_IDS.map(group => [group, []]));

  document.querySelectorAll("#admin-groups-grid select[data-group]").forEach(select => {
    const group = select.dataset.group;
    const slot = Number(select.dataset.slot);
    groups[group][slot] = select.value;
  });

  return groups;
}

function validateGroups(groups) {
  const teams = GROUP_IDS.flatMap(group => groups[group] || []);

  if (GROUP_IDS.some(group => (groups[group] || []).length !== GROUP_SIZE || groups[group].some(team => !team))) {
    return "Ogni girone deve avere 4 squadre.";
  }

  const unique = new Set(teams);
  if (unique.size !== teams.length) {
    return "Una squadra è stata inserita più di una volta. Il multiverso può aspettare.";
  }

  const unknown = teams.find(team => !TEAM_NAMES.includes(team));
  if (unknown) {
    return `Squadra non valida: ${unknown}`;
  }

  if (teams.length !== TEAM_NAMES.length) {
    return "Devono essere usate tutte le 16 squadre.";
  }

  return "";
}

async function saveGroupsAndGenerateCalendar() {
  const groups = readGroupsFromAdmin();
  const validationError = validateGroups(groups);

  if (validationError) {
    setStatus("admin-groups-status", validationError, "error");
    return;
  }

  setStatus("admin-groups-status", "Salvataggio gironi e generazione calendario...", "");

  const groupPayload = GROUP_IDS.flatMap(group =>
    groups[group].map((team, slot) => ({
      season: CRASHOUT_SEASON,
      group_id: group,
      slot,
      team_name: team,
      updated_at: new Date().toISOString()
    }))
  );

  const { error: groupError } = await supabase
    .from("crashout_group_slots")
    .upsert(groupPayload, { onConflict: "season,group_id,slot" });

  if (groupError) {
    console.error("Errore salvataggio gironi Crash Out Cup:", groupError);
    setStatus("admin-groups-status", "Errore salvataggio gironi. Controlla tabella Supabase e policy.", "error");
    return;
  }

  currentGroups = cloneGroups(groups);
  const generated = buildFixturesFromGroups(currentGroups);
  const matchPayload = generated.map(match => fixtureToRow(match, true));

  const { error: matchError } = await supabase
    .from("crashout_group_matches")
    .upsert(matchPayload, { onConflict: "id" });

  if (matchError) {
    console.error("Errore generazione calendario Crash Out Cup:", matchError);
    setStatus("admin-groups-status", "Gironi salvati, ma errore nel calendario. Controlla la tabella match.", "error");
    return;
  }

  fixtures = generated;
  activeMatchday = 1;
  document.getElementById("admin-matchday-select").value = "1";

  renderAllPublic();
  renderAdminGroups();
  renderAdminResults();

  setStatus("admin-groups-status", "Gironi salvati e calendario generato. Risultati resettati, come è giusto che sia.", "ok");
}

async function saveAdminResults() {
  const cards = Array.from(document.querySelectorAll("#admin-results-grid .admin-result-card[data-match-id]"));
  if (!cards.length) {
    setStatus("admin-results-status", "Nessuna partita da salvare per questa giornata.", "error");
    return;
  }

  setStatus("admin-results-status", "Salvataggio risultati...", "");

  const updates = [];

  cards.forEach(card => {
    const id = card.dataset.matchId;
    const match = fixtures.find(item => item.id === id);
    if (!match) return;

    const homeMagic = parseMagic(card.querySelector('input[data-side="home"]')?.value);
    const awayMagic = parseMagic(card.querySelector('input[data-side="away"]')?.value);
    const homeGoals = goalsFromMagic(homeMagic);
    const awayGoals = goalsFromMagic(awayMagic);
    const isPlayed = homeMagic !== null && awayMagic !== null && homeGoals !== null && awayGoals !== null;

    match.homeMagic = homeMagic;
    match.awayMagic = awayMagic;
    match.homeGoals = homeGoals;
    match.awayGoals = awayGoals;
    match.isPlayed = isPlayed;

    updates.push(fixtureToRow(match, false));
  });

  const { error } = await supabase
    .from("crashout_group_matches")
    .upsert(updates, { onConflict: "id" });

  if (error) {
    console.error("Errore salvataggio risultati Crash Out Cup:", error);
    setStatus("admin-results-status", "Errore salvataggio risultati. Supabase oggi ha scelto il melodramma.", "error");
    return;
  }

  renderAllPublic();
  renderAdminResults();
  setStatus("admin-results-status", "Risultati salvati. Classifica aggiornata automaticamente.", "ok");
}

async function initAdminPanel() {
  const panel = document.getElementById("crash-admin-panel");
  const toggle = document.getElementById("crash-admin-toggle");
  const saveGroupsBtn = document.getElementById("admin-save-groups-generate");
  const saveResultsBtn = document.getElementById("admin-save-results");

  if (!panel) return;

  try {
    isAdminUser = await isCurrentUserAdmin();
  } catch (error) {
    console.error("Errore controllo admin Crash Out Cup:", error);
    isAdminUser = false;
  }

  if (!isAdminUser) {
    panel.classList.add("hidden");
    return;
  }

  panel.classList.remove("hidden");
  renderAdminGroups();
  renderAdminMatchdaySelect();
  renderAdminResults();

  toggle?.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  saveGroupsBtn?.addEventListener("click", saveGroupsAndGenerateCalendar);
  saveResultsBtn?.addEventListener("click", saveAdminResults);
}

function initMobileMenuFallback() {
  const hamburger = document.getElementById("hamburger");
  const mainMenu = document.getElementById("mainMenu");

  if (!hamburger || !mainMenu) return;

  hamburger.addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    mainMenu.classList.toggle("show");
  });

  document.querySelectorAll("#mainMenu .toggle-submenu").forEach(toggle => {
    toggle.addEventListener("click", event => {
      if (window.innerWidth > 900) return;

      event.preventDefault();
      event.stopPropagation();
      toggle.closest(".dropdown")?.classList.toggle("show");
    });
  });

  document.addEventListener("click", event => {
    if (window.innerWidth > 900) return;

    const clickedInsideNav = event.target.closest(".site-nav");
    if (clickedInsideNav) return;

    mainMenu.classList.remove("show");
    document.querySelectorAll("#mainMenu .dropdown.show").forEach(dropdown => {
      dropdown.classList.remove("show");
    });
  });
}

async function initCrashOutCup() {
  initMobileMenuFallback();
  await loadInitialData();
  renderAllPublic();
  bindScheduleControls();
  await initAdminPanel();
}

document.addEventListener("DOMContentLoaded", initCrashOutCup);
