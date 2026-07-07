// =========================================================
const CRASHOUT_PHASE_VERSION = "20260707-seed-playoff-v3";
// CRASH OUT CUP - PRIMA FASE
// Stile e struttura pensati per convivere con crashoutplayoff.
// Per i risultati reali, sostituisci la funzione buildFixtures()
// con una lettura da Supabase/Google Sheet.
// =========================================================

const LOGO_BASE_PATH = "img/";
const LOGO_EXT = ".webp";
const MAX_MATCHDAY = 6;

const TEAM_DATA = [
  {
    nome: "Atlètico Leon",
    logo: "img/Atlético Leon.webp",
    coach: "Coach Rubinkebab"
  },
  {
    nome: "Bayern Christiansen",
    logo: "img/Bayern Christiansen.webp",
    coach: "Coach Christian"
  },
  {
    nome: "Team Bartowski",
    logo: "img/Team Bartowski.webp",
    coach: "Coach Marco"
  },
  {
    nome: "Golden Knights",
    logo: "img/Golden Knights.webp",
    coach: "Coach Mimmo&Francesco"
  },
  {
    nome: "Ibla",
    logo: "img/Ibla.webp",
    coach: "Coach Francesco"
  },
  {
    nome: "Fantaugusta",
    logo: "img/Fantaugusta.webp",
    coach: "Coach Giancarlo"
  },
  {
    nome: "Riverfilo",
    logo: "img/Riverfilo.webp",
    coach: "Coach Federico"
  },
  {
    nome: "Desperados",
    logo: "img/Desperados.webp",
    coach: "Coach Stefano"
  },
  {
    nome: "Wildboys 78",
    logo: "img/wildboys78.webp",
    coach: "Coach Francesco"
  },
  {
    nome: "Pandinicoccolosini",
    logo: "img/Pandinicoccolosini.webp",
    coach: "Coach Davide"
  },
  {
    nome: "Pokermantra",
    logo: "img/PokerMantra.webp",
    coach: "Coach Omar"
  },
  {
    nome: "Minnesode Timberland",
    logo: "img/Minnesode Timberland.webp",
    coach: "Coach Pierpaolo&Leandro"
  },
  {
    nome: "Minnesota Snakes",
    logo: "img/MinneSota Snakes.webp",
    coach: "Coach Alberto"
  },
  {
    nome: "Eintracht Franco 126",
    logo: "img/Eintracht Franco 126.webp",
    coach: "Coach Eintracht"
  },
  {
    nome: "FC Disoneste",
    logo: "img/FC Disoneste.webp",
    coach: "Coach FC Disoneste"
  },
  {
    nome: "Athletic Pongao",
    logo: "img/Athletic Pongao.webp",
    coach: "Coach Dario"
  }
];

const TEAM_LOGOS = Object.fromEntries(TEAM_DATA.map(team => [team.nome, team.logo]));

// Al momento divido i gironi usando l'ordine che mi hai dato: 4 squadre per gruppo.
// Se il sorteggio sarà diverso, basta spostare i nomi qui sotto. Sì, incredibilmente semplice.
const GROUPS = {
  A: ["Atlètico Leon", "Bayern Christiansen", "Team Bartowski", "Golden Knights"],
  B: ["Ibla", "Fantaugusta", "Riverfilo", "Desperados"],
  C: ["Wildboys 78", "Pandinicoccolosini", "Pokermantra", "Minnesode Timberland"],
  D: ["Minnesota Snakes", "Eintracht Franco 126", "FC Disoneste", "Athletic Pongao"]
};

// Serve solo a generare risultati demo credibili, così la pagina non sembra
// un foglio Excel abbandonato in un cassetto. Non decide nulla davvero.
const POWER_RANKING = Object.values(GROUPS).flat();

const MATCHDAY_DATES = {
  1: { date: "Sab 24/05", time: "15:00" },
  2: { date: "Dom 25/05", time: "18:00" },
  3: { date: "Sab 31/05", time: "15:00" },
  4: { date: "Dom 01/06", time: "18:00" },
  5: { date: "Sab 07/06", time: "15:00" },
  6: { date: "Dom 08/06", time: "18:00" }
};

let activeGroup = "all";
let activeMatchday = 1;
let fixtures = [];

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function logoSrc(team) {
  return encodeURI(TEAM_LOGOS[team] || `${LOGO_BASE_PATH}${team}${LOGO_EXT}`);
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

function getTeamGroup(team) {
  return Object.entries(GROUPS).find(([, teams]) => teams.includes(team))?.[0] || "";
}

function power(team) {
  const idx = POWER_RANKING.indexOf(team);
  return idx === -1 ? 0 : POWER_RANKING.length - idx;
}

function demoScore(home, away, matchday, matchIndex) {
  const diff = power(home) - power(away) + 0.8;
  const swing = ((matchday + matchIndex) % 3) - 1;
  const adjusted = diff + swing;

  if (adjusted >= 7) return { homeGoals: 3, awayGoals: 0 };
  if (adjusted >= 4) return { homeGoals: 2, awayGoals: 0 };
  if (adjusted >= 1.25) return { homeGoals: 2, awayGoals: 1 };
  if (adjusted > -1.25) return { homeGoals: 1, awayGoals: 1 };
  if (adjusted > -4) return { homeGoals: 1, awayGoals: 2 };
  if (adjusted > -7) return { homeGoals: 0, awayGoals: 2 };
  return { homeGoals: 0, awayGoals: 3 };
}

function buildFixtures() {
  const pairings = [
    [[0, 2], [1, 3]],
    [[0, 3], [2, 1]],
    [[0, 1], [3, 2]],
    [[2, 0], [3, 1]],
    [[3, 0], [1, 2]],
    [[1, 0], [2, 3]]
  ];

  const rows = [];

  Object.entries(GROUPS).forEach(([group, teams]) => {
    pairings.forEach((matchdayPairs, matchdayIndex) => {
      const matchday = matchdayIndex + 1;
      const meta = MATCHDAY_DATES[matchday];

      matchdayPairs.forEach(([homeIndex, awayIndex], pairIndex) => {
        const home = teams[homeIndex];
        const away = teams[awayIndex];
        const score = demoScore(home, away, matchday, pairIndex);

        rows.push({
          id: `${group}-G${matchday}-M${pairIndex + 1}`,
          group,
          matchday,
          home,
          away,
          date: meta.date,
          time: meta.time,
          ...score
        });
      });
    });
  });

  return rows;
}

function calculateStandings(matches) {
  const table = new Map();

  Object.values(GROUPS).flat().forEach(team => {
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
      fantasyPoints: power(team) * 10
    });
  });

  matches.forEach(match => {
    if (!Number.isFinite(match.homeGoals) || !Number.isFinite(match.awayGoals)) return;

    const home = table.get(match.home);
    const away = table.get(match.away);
    if (!home || !away) return;

    home.played += 1;
    away.played += 1;

    home.gf += match.homeGoals;
    home.ga += match.awayGoals;
    away.gf += match.awayGoals;
    away.ga += match.homeGoals;

    if (match.homeGoals > match.awayGoals) {
      home.wins += 1;
      away.losses += 1;
      home.points += 3;
    } else if (match.homeGoals < match.awayGoals) {
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
    POWER_RANKING.indexOf(a.team) - POWER_RANKING.indexOf(b.team)
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
    const className = `is-seeded seed-tier-${seedTier}`;
    const status = `Seed #${pos} playoff`;
    const diffClass = row.gd > 0 ? "diff-positive" : row.gd < 0 ? "diff-negative" : "";

    return `
      <tr class="${className}">
        <td class="pos-cell">${pos}</td>
        <td>
          <div class="team-cell" data-team="${row.team}">
            <span class="logo-mount" data-logo-team="${row.team}" data-logo-class="team"></span>
            <span class="team-main">
              <span class="team-name">${row.team}</span>
              <span class="team-status">${status}</span>
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

  grid.innerHTML = Object.entries(GROUPS).map(([group, teams]) => `
    <article class="group-card" data-group="${group}">
      <h3>Girone ${group}</h3>
      ${teams.map(team => `
        <div class="group-team">
          <span class="logo-mount" data-logo-team="${team}" data-logo-class="group"></span>
          <span>${team}</span>
        </div>
      `).join("")}
    </article>
  `).join("");

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

  list.innerHTML = visible.map(match => `
    <article class="fixture-card" data-group="${match.group}">
      <div class="fixture-team home">
        <span class="logo-mount" data-logo-team="${match.home}" data-logo-class="fixture"></span>
        <span>
          <span class="fixture-team-name">${match.home}</span>
          <span class="fixture-score">${match.homeGoals}</span>
        </span>
      </div>

      <div class="fixture-vs"><span>VS</span></div>

      <div class="fixture-team away">
        <span>
          <span class="fixture-team-name">${match.away}</span>
          <span class="fixture-score">${match.awayGoals}</span>
        </span>
        <span class="logo-mount" data-logo-team="${match.away}" data-logo-class="fixture"></span>
      </div>

      <div class="fixture-meta">
        <span>${match.date}<br>${match.time}</span>
        <span class="group-badge group-${match.group}">${match.group}</span>
      </div>
    </article>
  `).join("");

  mountLogos(list);
}

function mountLogos(root = document) {
  root.querySelectorAll(".logo-mount").forEach(mount => {
    const team = mount.dataset.logoTeam;
    const logoClass = mount.dataset.logoClass || "team";
    mount.replaceWith(createLogo(team, logoClass));
  });
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

function initCrashOutCup() {
  console.info(`Crash Out Cup prima fase loaded: ${CRASHOUT_PHASE_VERSION}`);
  fixtures = buildFixtures();
  renderStandings();
  renderGroups();
  renderSchedule();
  bindScheduleControls();
  initMobileMenuFallback();
}

document.addEventListener("DOMContentLoaded", initCrashOutCup);
