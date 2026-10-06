import { supabase } from './supabase.js';

/* =========================================================
   HALL OF FAME LIVE
   - Fonte pubblica: hall_of_fame_honours
   - Admin: finalizzazione controllata delle competizioni
   ========================================================= */

const COMPETITIONS = [
  {
    key: 'playoff',
    name: 'Playoff',
    target: 'albo-playoff',
    trophy: 'img/Playoffcup.png',
    liveSource: null
  },
  {
    key: 'campionato',
    name: 'Campionato',
    target: 'albo-campionato',
    trophy: 'img/campionatocup.webp',
    liveSource: 'standings_total'
  },
  {
    key: 'crash_out_cup',
    name: 'Crash Out Cup',
    target: 'albo-crash-out-cup',
    trophy: 'img/Crashoutcup.png',
    liveSource: null
  },
  {
    key: 'highlander',
    name: 'Highlander',
    target: 'albo-highlander',
    trophy: 'img/maglie/Higlandercup.webp',
    liveSource: null
  },
  {
    key: 'conference_league',
    name: 'Conference League',
    target: 'albo-conference-league',
    trophy: 'img/ConferenceLeaguecup.png',
    liveSource: 'conf_a'
  },
  {
    key: 'conference_championship',
    name: 'Conference Championship',
    target: 'albo-conference-championship',
    trophy: 'img/ConferenceChampionshipcup.png',
    liveSource: 'conf_b'
  },
  {
    key: 'round_robin',
    name: 'Round Robin',
    target: 'albo-round-robin',
    trophy: 'img/Roundrobincup.png',
    liveSource: 'round_robin'
  },
  {
    key: 'supercoppa',
    name: 'Supercoppa degli Eroi',
    target: 'albo-supercoppa',
    trophy: 'img/Supercoppacup.webp',
    liveSource: null
  }
];

const COMPETITION_MAP = new Map(COMPETITIONS.map(item => [item.key, item]));

const TEAM_LOGOS = {
  '3 Amici al Var': 'img/3 Amici al Var.png',
  'Bayern Christiansen': 'img/Bayern Christiansen.webp',
  'Costantinobull': 'img/Costantinobull.png',
  'Desperados': 'img/Desperados.webp',
  'Fc Disoneste': 'img/FC Disoneste.webp',
  'FC Disoneste': 'img/FC Disoneste.webp',
  'Giody': 'img/Giody.png',
  'Golden Knights': 'img/Golden Knights.webp',
  'I Cugini di Zampagna': 'img/I Cugini di Zampagna.png',
  'Ibla': 'img/Ibla.webp',
  'MinneSota Snakes': 'img/MinneSota Snakes.webp',
  'Minnesode Timberland': 'img/Minnesode Timberland.webp',
  'POKERMANTRA': 'img/POKERMANTRA.webp',
  'PokerMantra': 'img/POKERMANTRA.webp',
  'Pandinicoccolosini': 'img/Pandinicoccolosini.webp',
  'Pollisti': 'img/Pollisti.png',
  'Real Mimmo': 'img/Real Mimmo.png',
  'Rubinkebab': 'img/Rubinkebab.png',
  'Team Bartowski': 'img/Team Bartowski.webp',
  'Union Librino': 'img/Union Librino.png',
  'riverfilo': 'img/riverfilo.webp'
};

let liveHonours = [];
let adminCache = {
  results: [],
  fixtures: [],
  fixtureError: null
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cleanTeamName(name) {
  return String(name || '')
    .replace(/[👑🎖️💀]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function teamKey(name) {
  return cleanTeamName(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function logoPath(teamName) {
  const clean = cleanTeamName(teamName);
  return TEAM_LOGOS[clean] || `img/${clean}.webp`;
}

function logoMarkup(teamName, className = '') {
  const clean = cleanTeamName(teamName);
  return `<img src="${escapeHtml(logoPath(clean))}" alt="${escapeHtml(clean)}" class="${escapeHtml(className)}" data-team-logo="${escapeHtml(clean)}">`;
}

function applyLogoFallback(root = document) {
  root.querySelectorAll('img[data-team-logo]').forEach(img => {
    if (img.dataset.fallbackBound === '1') return;
    img.dataset.fallbackBound = '1';
    img.dataset.fallbackStep = '0';

    img.addEventListener('error', () => {
      const team = img.dataset.teamLogo || img.alt || '';
      const step = Number(img.dataset.fallbackStep || 0);
      const candidates = [
        `img/${team}.png`,
        `img/${team}.jpg`,
        `img/${team}.jpeg`
      ];

      if (step < candidates.length) {
        img.dataset.fallbackStep = String(step + 1);
        img.src = candidates[step];
      } else {
        img.style.visibility = 'hidden';
      }
    });
  });
}

function seasonStart(season) {
  const match = String(season || '').match(/^(\d{4})/);
  return match ? Number(match[1]) : 0;
}

function sortSeasonDesc(a, b) {
  return seasonStart(b) - seasonStart(a) || String(b).localeCompare(String(a));
}

function medalClass(position) {
  if (Number(position) === 1) return 'oro';
  if (Number(position) === 2) return 'argento';
  return 'bronzo';
}

function medalTableFromHonours(rows) {
  const map = new Map();

  rows.forEach(row => {
    const team = cleanTeamName(row.team_name);
    if (!team) return;
    const key = teamKey(team);

    if (!map.has(key)) {
      map.set(key, { squadra: team, oro: 0, argento: 0, bronzo: 0, totale: 0 });
    }

    const record = map.get(key);
    if (Number(row.position) === 1) record.oro += 1;
    if (Number(row.position) === 2) record.argento += 1;
    if (Number(row.position) === 3) record.bronzo += 1;
    record.totale += 1;
  });

  return [...map.values()].sort((a, b) =>
    b.oro - a.oro ||
    b.argento - a.argento ||
    b.bronzo - a.bronzo ||
    b.totale - a.totale ||
    a.squadra.localeCompare(b.squadra)
  );
}

function latestWinnerFor(rows, competitionKey) {
  return rows
    .filter(row => row.competition_key === competitionKey && Number(row.position) === 1)
    .sort((a, b) => sortSeasonDesc(a.season, b.season))[0] || null;
}

function renderLiveOverview(rows, medals) {
  if (!medals.length) return;

  const topWinner = medals[0];
  const totalGold = rows.filter(row => Number(row.position) === 1).length;
  const totalMedals = rows.length;

  const metrics = document.getElementById('overview-metrics');
  if (metrics) {
    metrics.innerHTML = `
      <article class="metric-card">
        <div class="metric-icon-wrap">${logoMarkup(topWinner.squadra)}</div>
        <div>
          <span class="metric-label">Più vincente</span>
          <strong class="metric-value">${escapeHtml(topWinner.squadra)}</strong>
          <small>${topWinner.oro} titoli</small>
        </div>
      </article>
      <article class="metric-card">
        <div class="metric-emoji">🏆</div>
        <div>
          <span class="metric-label">Trofei assegnati</span>
          <strong class="metric-value">${totalGold}</strong>
          <small>ori nella storia della Lega</small>
        </div>
      </article>
      <article class="metric-card">
        <div class="metric-emoji">🥇</div>
        <div>
          <span class="metric-label">Medaglie totali</span>
          <strong class="metric-value">${totalMedals}</strong>
          <small>podi registrati finora</small>
        </div>
      </article>
      <article class="metric-card">
        <div class="metric-emoji">🛡️</div>
        <div>
          <span class="metric-label">Franchigie premiate</span>
          <strong class="metric-value">${medals.length}</strong>
          <small>squadre già entrate nella storia</small>
        </div>
      </article>
    `;
  }

  const latestKeys = [
    'campionato',
    'playoff',
    'conference_league',
    'conference_championship',
    'highlander',
    'supercoppa'
  ];

  const latest = latestKeys
    .map(key => {
      const winner = latestWinnerFor(rows, key);
      const cfg = COMPETITION_MAP.get(key);
      return winner && cfg ? { ...winner, cfg } : null;
    })
    .filter(Boolean);

  const championsGrid = document.getElementById('champions-grid');
  if (championsGrid && latest.length) {
    championsGrid.innerHTML = latest.map(item => `
      <article class="champion-card">
        <div class="champion-trophy"><img src="${escapeHtml(item.cfg.trophy)}" alt="${escapeHtml(item.cfg.name)}"></div>
        <div class="champion-copy">
          <span class="champion-competition">${escapeHtml(item.cfg.name)}</span>
          <span class="champion-season">${escapeHtml(item.season)}</span>
          <div class="champion-team-wrap">
            ${logoMarkup(item.team_name)}
            <strong>${escapeHtml(item.team_name)}</strong>
          </div>
        </div>
      </article>
    `).join('');
  }

  const miniPodium = document.getElementById('mini-podium');
  if (miniPodium) {
    miniPodium.innerHTML = medals.slice(0, 3).map((team, index) => `
      <article class="mini-podium-card position-${index + 1}">
        <span class="mini-rank">#${index + 1}</span>
        ${logoMarkup(team.squadra)}
        <strong>${escapeHtml(team.squadra)}</strong>
        <small>${team.oro} ori · ${team.totale} podi</small>
      </article>
    `).join('');
  }

  const mostTotal = [...medals].sort((a,b) => b.totale - a.totale || b.oro - a.oro)[0];
  const mostSilver = [...medals].sort((a,b) => b.argento - a.argento || b.oro - a.oro)[0];
  const mostBronze = [...medals].sort((a,b) => b.bronzo - a.bronzo || b.oro - a.oro)[0];

  const preview = document.getElementById('records-preview');
  if (preview) {
    const data = [
      { label: 'Più titoli', team: topWinner.squadra, value: topWinner.oro },
      { label: 'Più medaglie', team: mostTotal.squadra, value: mostTotal.totale },
      { label: 'Più argenti', team: mostSilver.squadra, value: mostSilver.argento },
      { label: 'Più bronzi', team: mostBronze.squadra, value: mostBronze.bronzo }
    ];

    preview.innerHTML = data.map(item => `
      <div class="preview-record-row">
        <div>
          <span>${escapeHtml(item.label)}</span>
          <strong>${escapeHtml(item.team)}</strong>
        </div>
        <em>${item.value}</em>
      </div>
    `).join('');
  }
}

function renderLiveMedalTable(medals) {
  const tbody = document.querySelector('#medagliere tbody');
  const accordion = document.getElementById('accordion');
  const podium = document.getElementById('podio');
  if (!tbody || !accordion || !podium) return;

  tbody.innerHTML = '';
  accordion.innerHTML = '';
  podium.innerHTML = '';

  [1, 0, 2].forEach(index => {
    const team = medals[index];
    if (!team) return;
    const rank = index + 1;
    const rankClass = rank === 1 ? 'first' : rank === 2 ? 'second' : 'third';
    const card = document.createElement('div');
    card.className = `podio-card ${rankClass}`;
    card.innerHTML = `
      <div class="podio-rank">${rank}°</div>
      <div class="podio-glow"></div>
      ${logoMarkup(team.squadra, 'podio-logo')}
      <div class="podio-team">${escapeHtml(team.squadra)}</div>
      <div class="podio-stats" aria-label="Medaglie vinte">
        <span class="stat-pill oro"><span>🥇</span><strong>${team.oro}</strong></span>
        <span class="stat-pill argento"><span>🥈</span><strong>${team.argento}</strong></span>
        <span class="stat-pill bronzo"><span>🥉</span><strong>${team.bronzo}</strong></span>
      </div>
      <div class="podio-total"><span>🏆</span> Totale podi: <strong>${team.totale}</strong></div>
    `;
    podium.appendChild(card);
  });

  medals.forEach((team, index) => {
    const rank = index + 1;
    const topClass = index === 0 ? 'top1' : index === 1 ? 'top2' : index === 2 ? 'top3' : '';

    const tr = document.createElement('tr');
    if (topClass) tr.classList.add(topClass);
    tr.innerHTML = `
      <td><span class="rank-badge ${topClass || 'rank-normal'}">${rank}</span></td>
      <td>
        <div class="squadra-wrapper">
          ${logoMarkup(team.squadra, 'logo-squadra')}
          <span class="nome-squadra">${escapeHtml(team.squadra)}</span>
        </div>
      </td>
      <td>${team.oro}</td>
      <td>${team.argento}</td>
      <td>${team.bronzo}</td>
      <td><span class="totale-pill">${team.totale}</span></td>
    `;
    tbody.appendChild(tr);

    const item = document.createElement('div');
    item.className = `accordion-item ${topClass}`.trim();
    item.innerHTML = `
      <button class="accordion-header" type="button" aria-expanded="false">
        <div class="accordion-left">
          <span class="rank-badge ${topClass || 'rank-normal'}">${rank}</span>
          ${logoMarkup(team.squadra)}
          <div>
            <div class="accordion-rank">Posizione #${rank}</div>
            <div class="accordion-team">${escapeHtml(team.squadra)}</div>
          </div>
        </div>
        <div class="accordion-total">🏆 ${team.totale}</div>
      </button>
      <div class="accordion-content">
        <div class="mobile-stat-row"><span>🥇 Oro</span><strong>${team.oro}</strong></div>
        <div class="mobile-stat-row"><span>🥈 Argento</span><strong>${team.argento}</strong></div>
        <div class="mobile-stat-row"><span>🥉 Bronzo</span><strong>${team.bronzo}</strong></div>
        <div class="mobile-stat-row total-row"><span>🏆 Totale</span><strong>${team.totale}</strong></div>
      </div>
    `;
    accordion.appendChild(item);
  });

  accordion.querySelectorAll('.accordion-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.parentElement;
      const open = item.classList.toggle('open');
      header.setAttribute('aria-expanded', String(open));
    });
  });
}

function renderLiveRecords(rows, medals) {
  const recordList = document.getElementById('record-list');
  const recordStatGrid = document.getElementById('record-stat-grid');
  const podiumPresence = document.getElementById('podium-presence');
  if (!recordList || !recordStatGrid || !podiumPresence || !medals.length) return;

  const topWinner = medals[0];
  const mostTotal = [...medals].sort((a,b) => b.totale - a.totale || b.oro - a.oro)[0];
  const mostSilver = [...medals].sort((a,b) => b.argento - a.argento || b.oro - a.oro)[0];
  const mostBronze = [...medals].sort((a,b) => b.bronzo - a.bronzo || b.oro - a.oro)[0];
  const bestWithoutGold = [...medals].filter(team => team.oro === 0).sort((a,b) => b.totale - a.totale)[0];

  const records = [
    { title: 'Più titoli', team: topWinner.squadra, value: `${topWinner.oro} ori`, icon: '👑' },
    { title: 'Più medaglie complessive', team: mostTotal.squadra, value: `${mostTotal.totale} podi`, icon: '🏅' },
    { title: 'Più argenti', team: mostSilver.squadra, value: `${mostSilver.argento} argenti`, icon: '🥈' },
    { title: 'Più bronzi', team: mostBronze.squadra, value: `${mostBronze.bronzo} bronzi`, icon: '🥉' }
  ];

  if (bestWithoutGold) {
    records.push({ title: 'Migliore senza ori', team: bestWithoutGold.squadra, value: `${bestWithoutGold.totale} podi senza titoli`, icon: '🔥' });
  }

  recordList.innerHTML = records.map(item => `
    <div class="record-row">
      <div class="record-icon">${item.icon}</div>
      <div class="record-copy">
        <span>${escapeHtml(item.title)}</span>
        <strong>${escapeHtml(item.team)}</strong>
      </div>
      <div class="record-value">${escapeHtml(item.value)}</div>
    </div>
  `).join('');

  const gold = rows.filter(row => Number(row.position) === 1).length;
  const silver = rows.filter(row => Number(row.position) === 2).length;
  const bronze = rows.filter(row => Number(row.position) === 3).length;

  recordStatGrid.innerHTML = `
    <div class="simple-stat-card"><span>Ori assegnati</span><strong>${gold}</strong></div>
    <div class="simple-stat-card"><span>Argenti assegnati</span><strong>${silver}</strong></div>
    <div class="simple-stat-card"><span>Bronzi assegnati</span><strong>${bronze}</strong></div>
    <div class="simple-stat-card"><span>Squadre a podio</span><strong>${medals.length}</strong></div>
  `;

  podiumPresence.innerHTML = [...medals]
    .sort((a,b) => b.totale - a.totale || b.oro - a.oro || b.argento - a.argento)
    .slice(0, 8)
    .map((team, index) => `
      <div class="presence-row">
        <span class="presence-rank">#${index + 1}</span>
        ${logoMarkup(team.squadra)}
        <strong>${escapeHtml(team.squadra)}</strong>
        <em>${team.totale}</em>
      </div>
    `).join('');
}

function renderLiveAlbo(rows) {
  COMPETITIONS.forEach(cfg => {
    const block = document.getElementById(cfg.target);
    if (!block) return;

    block.querySelectorAll('.anno').forEach(node => node.remove());

    const competitionRows = rows.filter(row => row.competition_key === cfg.key);
    const seasons = [...new Set(competitionRows.map(row => row.season))].sort(sortSeasonDesc);

    if (!seasons.length) {
      const empty = document.createElement('div');
      empty.className = 'anno';
      empty.innerHTML = '<div class="titolo-anno">Nessun verdetto registrato</div>';
      block.appendChild(empty);
      return;
    }

    seasons.forEach(season => {
      const seasonRows = competitionRows
        .filter(row => row.season === season)
        .sort((a,b) => Number(a.position) - Number(b.position) || String(a.team_name).localeCompare(String(b.team_name)));

      const year = document.createElement('div');
      year.className = 'anno';
      year.innerHTML = `
        <div class="titolo-anno" role="button" tabindex="0" aria-expanded="false">${escapeHtml(season)}</div>
        <div class="contenuto-anno">
          <ol>
            ${seasonRows.map(row => `
              <li class="${medalClass(row.position)}" data-pos="${Number(row.position)}">
                ${logoMarkup(row.team_name)}
                ${escapeHtml(row.team_name)}
              </li>
            `).join('')}
          </ol>
        </div>
      `;

      const title = year.querySelector('.titolo-anno');
      const toggle = () => {
        const open = year.classList.toggle('attivo');
        title.setAttribute('aria-expanded', String(open));
      };
      title.addEventListener('click', toggle);
      title.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          toggle();
        }
      });

      block.appendChild(year);
    });
  });
}

async function loadLiveHallOfFame() {
  const { data, error } = await supabase
    .from('hall_of_fame_honours')
    .select('season, competition_key, competition_name, position, team_name, source, finalized_at')
    .order('season', { ascending: false })
    .order('competition_key', { ascending: true })
    .order('position', { ascending: true });

  if (error) throw error;
  if (!Array.isArray(data) || !data.length) return false;

  liveHonours = data;
  const medals = medalTableFromHonours(data);

  renderLiveOverview(data, medals);
  renderLiveMedalTable(medals);
  renderLiveRecords(data, medals);
  renderLiveAlbo(data);
  applyLogoFallback(document);
  return true;
}

/* =========================================================
   ADMIN · CLASSIFICHE AUTO
   Stesse regole della pagina Classifica:
   PT -> Magic Punti -> GF -> GS -> nome squadra
   ========================================================= */

const GOAL_BASE = 66;
const GOAL_STEP = 6;

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : 0;
}

function pointsToGoals(points) {
  const p = toNumber(points);
  if (p < GOAL_BASE) return 0;
  return 1 + Math.floor((p - GOAL_BASE) / GOAL_STEP);
}

function buildStandings(rows) {
  const table = new Map();

  rows.forEach(row => {
    const name = cleanTeamName(row.team);
    const key = teamKey(name);
    if (!key) return;

    const pf = toNumber(row.points_for);
    const pa = toNumber(row.points_against);
    const gf = pointsToGoals(pf);
    const ga = pointsToGoals(pa);

    if (!table.has(key)) {
      table.set(key, {
        squadra: name,
        g: 0,
        v: 0,
        n: 0,
        p: 0,
        gf: 0,
        gs: 0,
        pt: 0,
        mp: 0
      });
    }

    const rec = table.get(key);
    rec.g += 1;
    rec.gf += gf;
    rec.gs += ga;
    rec.mp += pf;

    if (gf > ga) {
      rec.v += 1;
      rec.pt += 3;
    } else if (gf === ga) {
      rec.n += 1;
      rec.pt += 1;
    } else {
      rec.p += 1;
    }
  });

  return [...table.values()].sort((a,b) =>
    b.pt - a.pt ||
    b.mp - a.mp ||
    b.gf - a.gf ||
    a.gs - b.gs ||
    a.squadra.localeCompare(b.squadra)
  );
}

function mergeStandings(...lists) {
  const merged = new Map();

  lists.flat().forEach(row => {
    const key = teamKey(row.squadra);
    if (!merged.has(key)) {
      merged.set(key, {
        squadra: row.squadra,
        g: 0,
        v: 0,
        n: 0,
        p: 0,
        gf: 0,
        gs: 0,
        pt: 0,
        mp: 0
      });
    }
    const rec = merged.get(key);
    ['g','v','n','p','gf','gs','pt','mp'].forEach(field => {
      rec[field] += Number(row[field] || 0);
    });
  });

  return [...merged.values()].sort((a,b) =>
    b.pt - a.pt ||
    b.mp - a.mp ||
    b.gf - a.gf ||
    a.gs - b.gs ||
    a.squadra.localeCompare(b.squadra)
  );
}

function competitionFilter(source) {
  if (source === 'conf_a') return row => row.conference === 'Conf A' && row.phase === 'Regular';
  if (source === 'conf_b') return row => row.conference === 'Conf B' && row.phase === 'Regular';
  if (source === 'round_robin') return row => row.conference === 'Unificata' && row.phase === 'Regular';
  return () => false;
}

function uniquePlayedMatches(rows) {
  const set = new Set();
  rows.forEach(row => {
    const a = cleanTeamName(row.team);
    const b = cleanTeamName(row.opponent);
    if (!a || !b) return;
    const pair = [teamKey(a), teamKey(b)].sort().join('::');
    set.add(`${row.conference}|${row.phase}|${Number(row.gw) || 0}|${pair}`);
  });
  return set.size;
}

function fixtureCount(source) {
  const predicate = competitionFilter(source);
  return adminCache.fixtures.filter(row => predicate({
    conference: row.conference,
    phase: row.phase
  })).length;
}

function previewForSource(source) {
  if (source === 'standings_total') {
    const a = previewForSource('conf_a');
    const b = previewForSource('conf_b');
    const rr = previewForSource('round_robin');
    const standings = mergeStandings(a.standings, b.standings, rr.standings);
    return {
      standings,
      podium: standings.slice(0, 3),
      ready: a.ready && b.ready && rr.ready,
      played: a.played + b.played + rr.played,
      fixtures: a.fixtures + b.fixtures + rr.fixtures
    };
  }

  const predicate = competitionFilter(source);
  const rows = adminCache.results.filter(predicate);
  const standings = buildStandings(rows);
  const played = uniquePlayedMatches(rows);
  const fixtures = fixtureCount(source);
  const ready = fixtures > 0 && played >= fixtures;

  return {
    standings,
    podium: standings.slice(0, 3),
    ready,
    played,
    fixtures
  };
}

function currentSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const start = now.getMonth() >= 6 ? year : year - 1;
  return `${start}-${start + 1}`;
}

function adminMessage(text, type = '') {
  const el = document.getElementById('hof-admin-message');
  if (!el) return;
  el.textContent = text || '';
  el.className = `hof-admin-message ${type}`.trim();
}

async function isCurrentUserAdmin() {
  const { data: sessionData } = await supabase.auth.getSession();
  const user = sessionData?.session?.user;
  if (!user) return false;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (error || !profile) return false;
  return ['admin', 'commissioner'].includes(String(profile.role || '').toLowerCase());
}

async function loadAdminCompetitionData() {
  const [resultsResponse, fixturesResponse] = await Promise.all([
    supabase
      .from('fantacalcio_results')
      .select('gw, team, opponent, points_for, points_against, result, phase, conference, team_key'),
    supabase
      .from('fantacalcio_fixtures')
      .select('gw, home_team, away_team, phase, conference')
  ]);

  if (resultsResponse.error) throw resultsResponse.error;

  adminCache.results = resultsResponse.data || [];
  adminCache.fixtures = fixturesResponse.error ? [] : (fixturesResponse.data || []);
  adminCache.fixtureError = fixturesResponse.error || null;
}

async function loadFinalizations(season) {
  const { data, error } = await supabase
    .from('hall_of_fame_finalizations')
    .select('season, competition_key, competition_name, source, podium, finalized_at')
    .eq('season', season);

  if (error) throw error;
  return new Map((data || []).map(row => [row.competition_key, row]));
}

function storedPodium(finalization) {
  if (!finalization || !Array.isArray(finalization.podium)) return [];
  return [...finalization.podium]
    .map(item => ({ position: Number(item.position), squadra: cleanTeamName(item.team_name) }))
    .filter(item => item.position >= 1 && item.position <= 3 && item.squadra)
    .sort((a,b) => a.position - b.position || a.squadra.localeCompare(b.squadra));
}

function podiumMarkup(podium) {
  if (!podium?.length) {
    return '<p class="hof-admin-empty">Nessun podio calcolabile al momento.</p>';
  }

  return `<div class="hof-admin-podium">${podium.map((team, index) => {
    const position = Number(team.position || index + 1);
    const name = team.squadra || team.team_name || '';
    const details = team.pt !== undefined
      ? `${team.pt} pt · ${Number(team.mp || 0).toFixed(1).replace('.', ',')} MP`
      : '';
    return `
      <div class="hof-admin-podium-row">
        <span class="pos">${position}°</span>
        ${logoMarkup(name)}
        <strong>${escapeHtml(name)}</strong>
        <small>${escapeHtml(details)}</small>
      </div>
    `;
  }).join('')}</div>`;
}

function statusLabel(type) {
  if (type === 'finalized') return 'Finalizzata';
  if (type === 'ready') return 'Pronta';
  if (type === 'pending') return 'Da collegare';
  return 'In corso';
}

async function renderAdminPanel() {
  const panel = document.getElementById('hof-admin-panel');
  const grid = document.getElementById('hof-admin-grid');
  const seasonInput = document.getElementById('hof-admin-season');
  if (!panel || !grid || !seasonInput) return;

  const isAdmin = await isCurrentUserAdmin();
  if (!isAdmin) return;

  panel.hidden = false;
  if (!seasonInput.value) seasonInput.value = currentSeason();

  const season = seasonInput.value.trim();
  if (!/^\d{4}-\d{4}$/.test(season)) {
    adminMessage('Formato stagione non valido. Usa per esempio 2026-2027.', 'error');
    return;
  }

  adminMessage('Carico risultati e stati delle competizioni…', 'loading');

  try {
    await loadAdminCompetitionData();
    const finalizations = await loadFinalizations(season);

    grid.innerHTML = COMPETITIONS.map(cfg => {
      const finalized = finalizations.get(cfg.key);
      let status = 'pending';
      let podium = [];
      let meta = 'Il collegamento automatico a questa coppa verrà aggiunto nella fase successiva.';
      let ready = false;

      if (finalized) {
        status = 'finalized';
        podium = storedPodium(finalized);
        meta = `Verdetto registrato il ${new Date(finalized.finalized_at).toLocaleString('it-IT')}.`;
      } else if (cfg.liveSource) {
        const preview = previewForSource(cfg.liveSource);
        podium = preview.podium.map((team, index) => ({ ...team, position: index + 1 }));
        ready = preview.ready && podium.length >= 3;
        status = ready ? 'ready' : 'running';
        meta = preview.fixtures > 0
          ? `${preview.played} / ${preview.fixtures} partite completate`
          : `${preview.played} partite registrate · calendario completo non disponibile`;
      }

      const finalizeDisabled = !cfg.liveSource || !ready || finalized;
      const sourceNote = cfg.liveSource
        ? 'Verdetto calcolato automaticamente dalla classifica ufficiale.'
        : 'Il verdetto sarà collegato direttamente alla pagina della coppa.';

      return `
        <article class="hof-admin-card" data-admin-competition="${escapeHtml(cfg.key)}">
          <div class="hof-admin-card-head">
            <div>
              <h3>${escapeHtml(cfg.name)}</h3>
              <div class="hof-admin-card-meta">${escapeHtml(meta)}</div>
            </div>
            <span class="hof-status-pill ${status}">${statusLabel(status)}</span>
          </div>
          ${podiumMarkup(podium)}
          <div class="hof-admin-card-meta" style="margin-bottom:12px">${escapeHtml(sourceNote)}</div>
          <div class="hof-admin-actions">
            <button type="button" class="hof-admin-btn primary" data-finalize="${escapeHtml(cfg.key)}" ${finalizeDisabled ? 'disabled' : ''}>
              Finalizza competizione
            </button>
            ${finalized ? `<button type="button" class="hof-admin-btn secondary" data-reopen="${escapeHtml(cfg.key)}">Riapri</button>` : ''}
          </div>
        </article>
      `;
    }).join('');

    applyLogoFallback(grid);

    grid.querySelectorAll('[data-finalize]').forEach(button => {
      button.addEventListener('click', async () => {
        const key = button.dataset.finalize;
        const cfg = COMPETITION_MAP.get(key);
        if (!cfg?.liveSource) return;
        const preview = previewForSource(cfg.liveSource);
        const podium = preview.podium.slice(0,3).map((team,index) => ({
          position: index + 1,
          team_name: team.squadra
        }));

        if (!preview.ready || podium.length < 3) {
          adminMessage(`${cfg.name}: competizione non ancora pronta da finalizzare.`, 'error');
          return;
        }

        const recap = podium.map(item => `${item.position}° ${item.team_name}`).join('\n');
        const confirmed = window.confirm(
          `Finalizzare ${cfg.name} ${season}?\n\n${recap}\n\nIl verdetto entrerà subito nella Hall of Fame.`
        );
        if (!confirmed) return;

        button.disabled = true;
        adminMessage(`Finalizzo ${cfg.name}…`, 'loading');

        const { error } = await supabase.rpc('hof_finalize_competition', {
          p_season: season,
          p_competition_key: cfg.key,
          p_competition_name: cfg.name,
          p_podium: podium,
          p_source: 'fantacalcio_results'
        });

        if (error) {
          console.error(error);
          adminMessage(`Errore finalizzazione ${cfg.name}: ${error.message}`, 'error');
          button.disabled = false;
          return;
        }

        adminMessage(`✓ ${cfg.name} finalizzata. Hall of Fame aggiornata automaticamente.`, 'ok');
        await loadLiveHallOfFame();
        await renderAdminPanel();
      });
    });

    grid.querySelectorAll('[data-reopen]').forEach(button => {
      button.addEventListener('click', async () => {
        const key = button.dataset.reopen;
        const cfg = COMPETITION_MAP.get(key);
        if (!cfg) return;

        const confirmed = window.confirm(
          `Riaprire ${cfg.name} ${season}?\n\nIl verdetto verrà temporaneamente rimosso dalla Hall of Fame finché non lo finalizzi di nuovo.`
        );
        if (!confirmed) return;

        button.disabled = true;
        adminMessage(`Riapro ${cfg.name}…`, 'loading');

        const { error } = await supabase.rpc('hof_reopen_competition', {
          p_season: season,
          p_competition_key: cfg.key
        });

        if (error) {
          console.error(error);
          adminMessage(`Errore riapertura ${cfg.name}: ${error.message}`, 'error');
          button.disabled = false;
          return;
        }

        adminMessage(`✓ ${cfg.name} riaperta. Puoi correggere i risultati e finalizzarla di nuovo.`, 'ok');
        await loadLiveHallOfFame();
        await renderAdminPanel();
      });
    });

    if (adminCache.fixtureError) {
      adminMessage('Hall of Fame attiva. Nota: non riesco a leggere fantacalcio_fixtures, quindi le competizioni di classifica non possono ancora passare automaticamente a “Pronta”.', 'error');
    } else {
      adminMessage('Hall of Fame collegata. Le competizioni pronte possono essere finalizzate.', 'ok');
    }
  } catch (error) {
    console.error('Errore Admin Hall of Fame:', error);
    adminMessage(`Errore caricamento Admin Hall of Fame: ${error.message}`, 'error');
  }
}

async function init() {
  try {
    await loadLiveHallOfFame();
  } catch (error) {
    // Se la migrazione non è ancora stata eseguita, resta visibile il fallback statico.
    console.warn('Hall of Fame live non disponibile: mantengo i dati statici di fallback.', error);
  }

  try {
    await renderAdminPanel();
    const seasonInput = document.getElementById('hof-admin-season');
    seasonInput?.addEventListener('change', renderAdminPanel);
  } catch (error) {
    console.warn('Admin Hall of Fame non disponibile:', error);
  }
}

document.addEventListener('DOMContentLoaded', init);
