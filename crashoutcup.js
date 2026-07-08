import { supabase } from "./supabase.js";

// =========================================================
// CRASH OUT CUP - RIVALRY GAMES
// Prima fase: 3 rivalità storiche + 2 extra conference.
// Supabase salva conference, calendario sorteggiato e magic punteggi.
// =========================================================

const CRASHOUT_SEASON = "2026";
const MAX_MATCHDAY = 5;
const CONFERENCE_IDS = ["CHAMPIONSHIP", "LEAGUE"];
const CONFERENCE_SIZE = 8;

const CONFERENCE_LABELS = {
  CHAMPIONSHIP: "Championship",
  LEAGUE: "League"
};

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

// Default solo per fallback/admin: puoi cambiare tutto dal panel.
const DEFAULT_CONFERENCES = {
  CHAMPIONSHIP: [
    "Atlètico Leon",
    "Bayern Christiansen",
    "Team Bartowski",
    "Golden Knights",
    "Ibla",
    "Fantaugusta",
    "Riverfilo",
    "Desperados"
  ],
  LEAGUE: [
    "Wildboys 78",
    "Pandinicoccolosini",
    "Pokermantra",
    "Minnesode Timberland",
    "Minnesota Snakes",
    "Eintracht Franco 126",
    "FC Disoneste",
    "Athletic Pongao"
  ]
};

// Rivalità ufficiali lette dall'immagine. Sono coppie reciproche: ogni squadra ha 3 rivalità.
const RIVALRIES = {
  "Minnesota Snakes": ["Minnesode Timberland", "Desperados", "Bayern Christiansen"],
  "Golden Knights": ["Bayern Christiansen", "Team Bartowski", "FC Disoneste"],
  "Team Bartowski": ["Golden Knights", "Bayern Christiansen", "Fantaugusta"],
  "Bayern Christiansen": ["Golden Knights", "Team Bartowski", "Minnesota Snakes"],
  "Fantaugusta": ["Team Bartowski", "Pokermantra", "Riverfilo"],
  "Riverfilo": ["Atlètico Leon", "Wildboys 78", "Fantaugusta"],
  "Ibla": ["Wildboys 78", "Desperados", "Athletic Pongao"],
  "Athletic Pongao": ["Minnesode Timberland", "Ibla", "Pandinicoccolosini"],
  "Desperados": ["Minnesota Snakes", "Minnesode Timberland", "Ibla"],
  "FC Disoneste": ["Golden Knights", "Eintracht Franco 126", "Pandinicoccolosini"],
  "Pokermantra": ["Atlètico Leon", "Wildboys 78", "Fantaugusta"],
  "Wildboys 78": ["Pokermantra", "Ibla", "Riverfilo"],
  "Minnesode Timberland": ["Minnesota Snakes", "Desperados", "Athletic Pongao"],
  "Pandinicoccolosini": ["Eintracht Franco 126", "FC Disoneste", "Athletic Pongao"],
  "Atlètico Leon": ["Riverfilo", "Pokermantra", "Eintracht Franco 126"],
  "Eintracht Franco 126": ["FC Disoneste", "Pandinicoccolosini", "Atlètico Leon"]
};

// Rivalità distribuite in 3 giornate: ogni squadra gioca una sola volta per giornata.
const RIVALRY_MATCHDAYS = {
  1: [
    ["FC Disoneste", "Golden Knights"],
    ["Bayern Christiansen", "Team Bartowski"],
    ["Desperados", "Minnesota Snakes"],
    ["Ibla", "Wildboys 78"],
    ["Eintracht Franco 126", "Pandinicoccolosini"],
    ["Fantaugusta", "Pokermantra"],
    ["Atlètico Leon", "Riverfilo"],
    ["Athletic Pongao", "Minnesode Timberland"]
  ],
  2: [
    ["Golden Knights", "Team Bartowski"],
    ["Bayern Christiansen", "Minnesota Snakes"],
    ["Pokermantra", "Wildboys 78"],
    ["Athletic Pongao", "Ibla"],
    ["Fantaugusta", "Riverfilo"],
    ["Desperados", "Minnesode Timberland"],
    ["FC Disoneste", "Pandinicoccolosini"],
    ["Atlètico Leon", "Eintracht Franco 126"]
  ],
  3: [
    ["Eintracht Franco 126", "FC Disoneste"],
    ["Athletic Pongao", "Pandinicoccolosini"],
    ["Fantaugusta", "Team Bartowski"],
    ["Bayern Christiansen", "Golden Knights"],
    ["Minnesode Timberland", "Minnesota Snakes"],
    ["Desperados", "Ibla"],
    ["Atlètico Leon", "Pokermantra"],
    ["Riverfilo", "Wildboys 78"]
  ]
};

const MATCHDAY_DATES = {
  1: { date: "Da definire", time: "--:--" },
  2: { date: "Da definire", time: "--:--" },
  3: { date: "Da definire", time: "--:--" },
  4: { date: "Da definire", time: "--:--" },
  5: { date: "Da definire", time: "--:--" }
};

let activeFilter = "all";
let activeMatchday = 1;
let currentConferences = cloneConferences(DEFAULT_CONFERENCES);
let fixtures = [];
let isAdminUser = false;

const $ = (sel, root = document) => root.querySelector(sel);

function cloneConferences(conferences) {
  return Object.fromEntries(
    CONFERENCE_IDS.map(conf => [conf, [...(conferences[conf] || [])]])
  );
}

function pairKey(a, b) {
  return [a, b].sort().join("||");
}

const RIVALRY_PAIR_KEYS = new Set(
  Object.entries(RIVALRIES).flatMap(([team, rivals]) =>
    rivals.map(rival => pairKey(team, rival))
  )
);

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

function getTeamConference(team) {
  return Object.entries(currentConferences).find(([, teams]) => teams.includes(team))?.[0] || "";
}

function conferenceLabel(conf) {
  return CONFERENCE_LABELS[conf] || conf || "-";
}

function initialRank(team) {
  const idx = TEAM_NAMES.indexOf(team);
  return idx === -1 ? 999 : idx;
}

function matchId(type, matchday, matchIndex, suffix = "") {
  const label = type === "rivalry" ? "RIV" : "CONF";
  return `${CRASHOUT_SEASON}-${label}-G${matchday}-M${matchIndex}${suffix ? `-${suffix}` : ""}`;
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

function buildRivalryFixtures() {
  const rows = [];

  Object.entries(RIVALRY_MATCHDAYS).forEach(([day, pairs]) => {
    const matchday = Number(day);
    const meta = MATCHDAY_DATES[matchday];

    pairs.forEach(([home, away], index) => {
      rows.push({
        id: matchId("rivalry", matchday, index + 1),
        season: CRASHOUT_SEASON,
        type: "rivalry",
        bucket: "RIV",
        matchday,
        matchIndex: index + 1,
        home,
        away,
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

  return rows;
}

function shuffleCopy(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function findPerfectMatching(teams, forbidden) {
  const sorted = shuffleCopy(teams);

  function backtrack(remaining, pairs) {
    if (!remaining.length) return pairs;

    const [first, ...rest] = remaining;
    const candidates = shuffleCopy(rest).filter(second => !forbidden.has(pairKey(first, second)));

    for (const second of candidates) {
      const nextRemaining = rest.filter(team => team !== second);
      const result = backtrack(nextRemaining, [...pairs, [first, second]]);
      if (result) return result;
    }

    return null;
  }

  return backtrack(sorted, []);
}

function buildConferenceExtraFixtures(conferences) {
  const rows = [];
  let globalIndexG4 = 1;
  let globalIndexG5 = 1;

  CONFERENCE_IDS.forEach(conf => {
    const teams = conferences[conf] || [];
    if (teams.length !== CONFERENCE_SIZE) {
      throw new Error(`${conferenceLabel(conf)} deve avere ${CONFERENCE_SIZE} squadre.`);
    }

    let matching4 = null;
    let matching5 = null;

    for (let attempt = 0; attempt < 300; attempt += 1) {
      const forbidden4 = new Set(RIVALRY_PAIR_KEYS);
      const candidate4 = findPerfectMatching(teams, forbidden4);
      if (!candidate4) continue;

      const forbidden5 = new Set([...RIVALRY_PAIR_KEYS, ...candidate4.map(([a, b]) => pairKey(a, b))]);
      const candidate5 = findPerfectMatching(teams, forbidden5);
      if (!candidate5) continue;

      matching4 = candidate4;
      matching5 = candidate5;
      break;
    }

    if (!matching4 || !matching5) {
      throw new Error(`Non riesco a sorteggiare le extra per ${conferenceLabel(conf)} senza duplicare rivalità. Colpa del destino, non mia.`);
    }

    matching4.forEach(([home, away]) => {
      const meta = MATCHDAY_DATES[4];
      rows.push({
        id: matchId("conference", 4, globalIndexG4, conf),
        season: CRASHOUT_SEASON,
        type: "conference",
        bucket: conf,
        matchday: 4,
        matchIndex: globalIndexG4,
        home,
        away,
        date: meta.date,
        time: meta.time,
        homeMagic: null,
        awayMagic: null,
        homeGoals: null,
        awayGoals: null,
        isPlayed: false
      });
      globalIndexG4 += 1;
    });

    matching5.forEach(([home, away]) => {
      const meta = MATCHDAY_DATES[5];
      rows.push({
        id: matchId("conference", 5, globalIndexG5, conf),
        season: CRASHOUT_SEASON,
        type: "conference",
        bucket: conf,
        matchday: 5,
        matchIndex: globalIndexG5,
        home,
        away,
        date: meta.date,
        time: meta.time,
        homeMagic: null,
        awayMagic: null,
        homeGoals: null,
        awayGoals: null,
        isPlayed: false
      });
      globalIndexG5 += 1;
    });
  });

  return rows;
}

function buildFixturesFromConferences(conferences) {
  return [
    ...buildRivalryFixtures(),
    ...buildConferenceExtraFixtures(conferences)
  ].sort((a, b) => a.matchday - b.matchday || a.matchIndex - b.matchIndex);
}

function rowToFixture(row) {
  const matchday = Number(row.matchday);
  return {
    id: row.id,
    season: row.season || CRASHOUT_SEASON,
    type: row.match_type,
    bucket: row.bucket_id,
    matchday,
    matchIndex: Number(row.match_index),
    home: row.home_team,
    away: row.away_team,
    date: MATCHDAY_DATES[matchday]?.date || "Da definire",
    time: MATCHDAY_DATES[matchday]?.time || "--:--",
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
    match_type: match.type,
    bucket_id: match.bucket,
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

async function loadConferencesFromSupabase() {
  const { data, error } = await supabase
    .from("crashout_rivalry_team_conferences")
    .select("conference_id, slot, team_name")
    .eq("season", CRASHOUT_SEASON)
    .order("conference_id", { ascending: true })
    .order("slot", { ascending: true });

  if (error) throw error;
  if (!data || data.length !== TEAM_NAMES.length) return null;

  const conferences = Object.fromEntries(CONFERENCE_IDS.map(conf => [conf, []]));
  data.forEach(row => {
    if (!CONFERENCE_IDS.includes(row.conference_id)) return;
    conferences[row.conference_id][Number(row.slot)] = row.team_name;
  });

  const complete = CONFERENCE_IDS.every(conf =>
    conferences[conf].length === CONFERENCE_SIZE && conferences[conf].every(Boolean)
  );

  return complete ? conferences : null;
}

async function loadMatchesFromSupabase() {
  const { data, error } = await supabase
    .from("crashout_rivalry_matches")
    .select("*")
    .eq("season", CRASHOUT_SEASON)
    .order("matchday", { ascending: true })
    .order("match_index", { ascending: true });

  if (error) throw error;
  if (!data || !data.length) return null;

  return data.map(rowToFixture);
}

async function loadInitialData() {
  try {
    const savedConferences = await loadConferencesFromSupabase();
    currentConferences = savedConferences ? cloneConferences(savedConferences) : cloneConferences(DEFAULT_CONFERENCES);
  } catch (error) {
    console.warn("Crash Out Cup: impossibile caricare le conference da Supabase, uso il fallback JS.", error);
    currentConferences = cloneConferences(DEFAULT_CONFERENCES);
  }

  try {
    const savedMatches = await loadMatchesFromSupabase();
    fixtures = savedMatches || buildFixturesFromConferences(currentConferences);
  } catch (error) {
    console.warn("Crash Out Cup: impossibile caricare il calendario da Supabase, mostro un calendario generato senza risultati.", error);
    fixtures = buildFixturesFromConferences(currentConferences);
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

  TEAM_NAMES.forEach(team => {
    table.set(team, {
      team,
      conference: getTeamConference(team),
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
        <td><span class="conference-badge conference-${row.conference}">${conferenceLabel(row.conference)}</span></td>
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
  renderMobileStandings(standings);
}

function renderMobileStandings(standings) {
  const panel = document.querySelector('[data-mobile-panel="standings"]');
  if (!panel) return;

  let list = document.getElementById("mobile-standings-list");
  if (!list) {
    list = document.createElement("div");
    list.id = "mobile-standings-list";
    list.className = "mobile-standings-list";
    panel.appendChild(list);
  }

  list.innerHTML = standings.map((row, index) => {
    const pos = index + 1;
    const diffClass = row.gd > 0 ? "diff-positive" : row.gd < 0 ? "diff-negative" : "";
    const seedTier = Math.ceil(pos / 4);

    return `
      <article class="mobile-standing-card seed-tier-${seedTier}">
        <div class="mobile-standing-pos">${pos}</div>
        <div class="mobile-standing-logo">
          <span class="logo-mount" data-logo-team="${row.team}" data-logo-class="team"></span>
        </div>
        <div class="mobile-standing-main">
          <strong>${row.team}</strong>
          <span>Seed #${pos} playoff · ${conferenceLabel(row.conference)}</span>
        </div>
        <div class="mobile-standing-points">
          <strong>${row.points}</strong>
          <span>PT</span>
        </div>
        <div class="mobile-standing-meta">
          <span>G ${row.played}</span>
          <span>V ${row.wins}</span>
          <span>N ${row.draws}</span>
          <span>P ${row.losses}</span>
          <span>GF ${row.gf}</span>
          <span>GS ${row.ga}</span>
          <span class="${diffClass}">DR ${formatDiff(row.gd)}</span>
        </div>
      </article>
    `;
  }).join("");

  mountLogos(list);
}

function renderRivalries() {
  const grid = $("#groups-grid");
  if (!grid) return;

  grid.innerHTML = TEAM_NAMES.map(team => `
    <article class="group-card rivalry-card" data-group="RIV">
      <h3>${team}</h3>
      ${(RIVALRIES[team] || []).map(rival => `
        <div class="group-team">
          <span class="logo-mount" data-logo-team="${rival}" data-logo-class="group"></span>
          <span>${rival}</span>
        </div>
      `).join("")}
    </article>
  `).join("");

  mountLogos(grid);
}

function fixtureTypeLabel(match) {
  if (match.type === "rivalry") return "Rivalry";
  return conferenceLabel(match.bucket);
}

function getVisibleFixtures() {
  return fixtures.filter(match => {
    if (match.matchday !== activeMatchday) return false;
    if (activeFilter === "all") return true;
    if (activeFilter === "rivalry") return match.type === "rivalry";
    if (activeFilter === "conference") return match.type === "conference";
    return match.bucket === activeFilter;
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
    const badgeClass = match.type === "rivalry" ? "group-RIV" : `conference-${match.bucket}`;

    return `
      <article class="fixture-card ${match.isPlayed ? "is-played" : "is-unplayed"}" data-type="${match.type}" data-bucket="${match.bucket}">
        <div class="fixture-team home" data-team="${match.home}">
          <span class="logo-mount" data-logo-team="${match.home}" data-logo-class="fixture"></span>
          <span>
            <span class="fixture-team-name">${match.home}</span>
            <span class="fixture-score">${homeScore}</span>
          </span>
        </div>

        <div class="fixture-vs"><span>${match.isPlayed ? scoreText : "VS"}</span></div>

      <div class="fixture-team away" data-team="${match.away}">
          <span>
            <span class="fixture-team-name">${match.away}</span>
            <span class="fixture-score">${awayScore}</span>
          </span>
          <span class="logo-mount" data-logo-team="${match.away}" data-logo-class="fixture"></span>
        </div>

        <div class="fixture-meta">
          <span>${match.date}<br>${match.time}</span>
          <span class="group-badge ${badgeClass}">${fixtureTypeLabel(match)}</span>
        </div>
      </article>
    `;
  }).join("");

  mountLogos(list);
}

function renderAllPublic() {
  renderStandings();
  renderRivalries();
  renderSchedule();
}

function bindScheduleControls() {
  const tabs = $("#schedule-tabs");
  const prev = $("#prev-matchday");
  const next = $("#next-matchday");

  tabs?.addEventListener("click", event => {
    const btn = event.target.closest(".schedule-tab");
    if (!btn) return;

    activeFilter = btn.dataset.filter || "all";

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

function renderAdminConferences() {
  const grid = document.getElementById("admin-groups-grid");
  if (!grid) return;

  const options = TEAM_NAMES.map(team => `<option value="${team}">${team}</option>`).join("");

  grid.innerHTML = CONFERENCE_IDS.map(conf => `
    <article class="admin-group-card" data-admin-conference="${conf}">
      <h3>${conferenceLabel(conf)}</h3>
      ${Array.from({ length: CONFERENCE_SIZE }).map((_, slot) => {
        const selectedTeam = currentConferences[conf]?.[slot] || "";
        return `
          <div class="admin-slot-row">
            <label>
              Slot ${slot + 1}
              <select data-conference="${conf}" data-slot="${slot}">
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
    const conf = select.dataset.conference;
    const slot = Number(select.dataset.slot);
    select.value = currentConferences[conf]?.[slot] || "";
  });
}

function renderAdminMatchdaySelect() {
  const select = document.getElementById("admin-matchday-select");
  if (!select) return;

  select.innerHTML = Array.from({ length: MAX_MATCHDAY }).map((_, index) => {
    const day = index + 1;
    const label = day <= 3 ? `Giornata ${day} · Rivalry` : `Giornata ${day} · Extra conf.`;
    return `<option value="${day}">${label}</option>`;
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
          <span class="group-badge ${match.type === "rivalry" ? "group-RIV" : `conference-${match.bucket}`}">${fixtureTypeLabel(match)}</span>
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

function readConferencesFromAdmin() {
  const conferences = Object.fromEntries(CONFERENCE_IDS.map(conf => [conf, []]));

  document.querySelectorAll("#admin-groups-grid select[data-conference]").forEach(select => {
    const conf = select.dataset.conference;
    const slot = Number(select.dataset.slot);
    conferences[conf][slot] = select.value;
  });

  return conferences;
}

function validateConferences(conferences) {
  const teams = CONFERENCE_IDS.flatMap(conf => conferences[conf] || []);

  if (CONFERENCE_IDS.some(conf => (conferences[conf] || []).length !== CONFERENCE_SIZE || conferences[conf].some(team => !team))) {
    return `Ogni conference deve avere ${CONFERENCE_SIZE} squadre.`;
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

async function saveConferencesAndGenerateCalendar() {
  const conferences = readConferencesFromAdmin();
  const validationError = validateConferences(conferences);

  if (validationError) {
    setStatus("admin-groups-status", validationError, "error");
    return;
  }

  let generated;
  try {
    generated = buildFixturesFromConferences(conferences);
  } catch (error) {
    console.error("Errore sorteggio extra conference:", error);
    setStatus("admin-groups-status", error.message || "Errore nel sorteggio extra conference.", "error");
    return;
  }

  setStatus("admin-groups-status", "Salvataggio conference e calendario rivalry...", "");

  const conferencePayload = CONFERENCE_IDS.flatMap(conf =>
    conferences[conf].map((team, slot) => ({
      season: CRASHOUT_SEASON,
      conference_id: conf,
      slot,
      team_name: team,
      updated_at: new Date().toISOString()
    }))
  );

  const { error: conferenceError } = await supabase
    .from("crashout_rivalry_team_conferences")
    .upsert(conferencePayload, { onConflict: "season,conference_id,slot" });

  if (conferenceError) {
    console.error("Errore salvataggio conference Crash Out Cup:", conferenceError);
    setStatus("admin-groups-status", "Errore salvataggio conference. Controlla tabella Supabase e policy.", "error");
    return;
  }

  const matchPayload = generated.map(match => fixtureToRow(match, true));

  const { error: matchError } = await supabase
    .from("crashout_rivalry_matches")
    .upsert(matchPayload, { onConflict: "id" });

  if (matchError) {
    console.error("Errore generazione calendario Crash Out Cup:", matchError);
    setStatus("admin-groups-status", "Conference salvate, ma errore nel calendario. Controlla la tabella match.", "error");
    return;
  }

  currentConferences = cloneConferences(conferences);
  fixtures = generated;
  activeMatchday = 1;
  const select = document.getElementById("admin-matchday-select");
  if (select) select.value = "1";

  renderAllPublic();
  renderAdminConferences();
  renderAdminResults();

  setStatus("admin-groups-status", "Conference salvate, rivalità fisse e due extra sorteggiate. Risultati resettati, come è giusto che sia.", "ok");
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
    .from("crashout_rivalry_matches")
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
  const saveConferencesBtn = document.getElementById("admin-save-groups-generate");
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
  renderAdminConferences();
  renderAdminMatchdaySelect();
  renderAdminResults();

  toggle?.addEventListener("click", () => {
    const isOpen = panel.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  saveConferencesBtn?.addEventListener("click", saveConferencesAndGenerateCalendar);
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

function bindMobileSectionTabs() {
  const tabs = Array.from(document.querySelectorAll(".mobile-section-tab[data-mobile-tab]"));
  const panels = Array.from(document.querySelectorAll("[data-mobile-panel]"));

  if (!tabs.length || !panels.length) return;

  function activate(panelId) {
    tabs.forEach(tab => {
      const isActive = tab.dataset.mobileTab === panelId;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", isActive ? "true" : "false");
    });

    panels.forEach(panel => {
      panel.classList.toggle("is-mobile-active", panel.dataset.mobilePanel === panelId);
    });
  }

  tabs.forEach(tab => {
    tab.setAttribute("aria-selected", tab.classList.contains("is-active") ? "true" : "false");

    tab.addEventListener("click", () => {
      const target = tab.dataset.mobileTab || "standings";
      activate(target);
      window.requestAnimationFrame(() => {
        tab.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      });
    });
  });

  activate(document.querySelector(".mobile-section-tab.is-active")?.dataset.mobileTab || "standings");
}

async function initCrashOutCup() {
  initMobileMenuFallback();
  bindMobileSectionTabs();
  await loadInitialData();
  renderAllPublic();
  bindScheduleControls();
  await initAdminPanel();
}

document.addEventListener("DOMContentLoaded", initCrashOutCup);
