import { supabase } from './supabase.js';

/* Risultati 2026/27: sola lettura, nessun intervento sulle classifiche. */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = { results: [], fixtures: [], weeks: [], selected: null, ready: false };
  const conferenceNames = { 'Conf A': 'Conference League', 'Conf B': 'Conference Championship', 'Unificata': 'Round Robin' };
  const knownTeams = [
    'Athletic Pongao', 'Atlètico Leon', 'Bayern Christiansen', 'Desperados',
    'Eintracht Franco 126', 'Fantaugusta', 'Fc Disoneste', 'Golden Knights',
    'Ibla', 'Minnesode Timberland', 'MinneSota Snakes', 'Pandinicoccolosini',
    'PokerMantra', 'Riverfilo', 'Team Bartowski', 'wildboys78'
  ];
  const normalize = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const displayName = name => knownTeams.find(t => normalize(t) === normalize(name)) || String(name || '');
  const html = value => String(value == null ? '' : value).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = value => value === null || value === undefined || value === '' ? null : Number(value);
  const score = value => value === null || !Number.isFinite(value) ? '–' :
    value.toLocaleString('it-IT', { maximumFractionDigits: 2 });
  const goals = points => points === null || !Number.isFinite(points) ? null :
    points < 66 ? 0 : 1 + Math.floor((points - 66) / 6);
  const logo = name => 'img/' + encodeURIComponent(displayName(name)) + '.webp';

  function calendarWeek(row) {
    const gw = Number(row.gw) || 0;
    if (row.conference !== 'Unificata') return gw;
    const minRound = Math.min(...state.results.concat(state.fixtures)
      .filter(x => x.conference === 'Unificata' && Number(x.gw) > 0)
      .map(x => Number(x.gw)));
    return gw + (minRound < 15 ? 14 : 0);
  }

  function isPlayed(row) {
    const own = num(row.points_for), against = num(row.points_against);
    return own !== null && against !== null && Number.isFinite(own) &&
      Number.isFinite(against) && !(own === 0 && against === 0);
  }

  function buildMatchMap(week, conference) {
    const fixtures = state.fixtures.filter(r => r.conference === conference && calendarWeek(r) === week);
    const playedRows = state.results.filter(r => r.conference === conference &&
      calendarWeek(r) === week && isPlayed(r));
    const pairs = new Map();
    const pairKey = (a, b) => [normalize(a), normalize(b)].sort().join('|');

    fixtures.forEach(f => {
      const a = displayName(f.home_team), b = displayName(f.away_team);
      if (a && b && normalize(a) !== normalize(b))
        pairs.set(pairKey(a, b), { home: a, away: b });
    });

    playedRows.forEach(r => {
      const a = displayName(r.team), b = displayName(r.opponent);
      if (!a || !b || normalize(a) === normalize(b)) return;
      const key = pairKey(a, b);
      if (!pairs.has(key)) {
        const homeFirst = r.is_home === true || (r.is_home !== false && a.localeCompare(b, 'it') <= 0);
        pairs.set(key, { home: homeFirst ? a : b, away: homeFirst ? b : a });
      }
    });

    const lookup = new Map(playedRows.map(r =>
      [normalize(r.team) + '|' + normalize(r.opponent), r]));
    return Array.from(pairs.values()).map(pair => {
      const homeRow = lookup.get(normalize(pair.home) + '|' + normalize(pair.away));
      const awayRow = lookup.get(normalize(pair.away) + '|' + normalize(pair.home));
      const homePts = homeRow ? num(homeRow.points_for) : awayRow ? num(awayRow.points_against) : null;
      const awayPts = awayRow ? num(awayRow.points_for) : homeRow ? num(homeRow.points_against) : null;
      const finished = homePts !== null && awayPts !== null &&
        Number.isFinite(homePts) && Number.isFinite(awayPts);
      return { ...pair, homePts, awayPts, finished,
        homeGoals: finished ? goals(homePts) : null,
        awayGoals: finished ? goals(awayPts) : null };
    }).sort((a, b) => a.home.localeCompare(b.home, 'it'));
  }

  function teamMarkup(name, points, side, winner) {
    return '<div class="res-team res-' + side + (winner ? ' res-winner' : '') + '">' +
      '<img src="' + html(logo(name)) + '" alt="" loading="lazy">' +
      '<strong>' + html(displayName(name)) + '</strong>' +
      '<small>' + (points === null ? 'In attesa' : score(points) + ' fantapunti') + '</small>' +
      '</div>';
  }

  function matchMarkup(m) {
    const homeWins = m.finished && m.homeGoals > m.awayGoals;
    const awayWins = m.finished && m.awayGoals > m.homeGoals;
    return '<article class="res-match' + (m.finished ? ' res-played' : ' res-pending') + '">' +
      teamMarkup(m.home, m.homePts, 'home', homeWins) +
      '<div class="res-score">' +
      '<strong>' + (m.finished ? m.homeGoals + ' : ' + m.awayGoals : '– : –') + '</strong>' +
      '<span>' + (m.finished ? 'Finale' : 'Da giocare') + '</span>' +
      '</div>' +
      teamMarkup(m.away, m.awayPts, 'away', awayWins) +
      '</article>';
  }

  function conferenceMarkup(week, conference) {
    const matches = buildMatchMap(week, conference);
    const finished = matches.filter(m => m.finished).length;
    return '<section class="res-conference">' +
      '<header class="res-conference-heading">' +
        '<div><span>' + (conference === 'Conf A' ? 'CONF A' : conference === 'Conf B' ? 'CONF B' : 'FASE UNIFICATA') + '</span>' +
        '<h3>' + html(conferenceNames[conference] || conference) + '</h3></div>' +
        '<small>' + finished + '/' + matches.length + ' risultati</small>' +
      '</header>' +
      '<div class="res-matches">' +
        (matches.length ? matches.map(matchMarkup).join('') :
          '<div class="res-empty">Nessuna partita disponibile per questa giornata.</div>') +
      '</div></section>';
  }

  function render() {
    const host = $('risultati-sezioni');
    if (!host) return;
    if (!state.ready) {
      host.innerHTML = '<div class="res-empty">Caricamento risultati…</div>';
      return;
    }
    if (!state.weeks.length) {
      host.innerHTML = '<div class="res-empty">Nessun risultato ancora disponibile.</div>';
      return;
    }
    if (!state.weeks.includes(state.selected)) state.selected = state.weeks[state.weeks.length - 1];
    const select = $('risultati-giornata');
    select.innerHTML = state.weeks.map(week => '<option value="' + week + '"' +
      (week === state.selected ? ' selected' : '') + '>Giornata ' + week + '</option>').join('');
    const index = state.weeks.indexOf(state.selected);
    $('risultati-prev').disabled = index < 1;
    $('risultati-next').disabled = index === state.weeks.length - 1;
    $('risultati-current').textContent = 'Giornata ' + state.selected;
    const isRound = state.selected > 14;
    $('risultati-phase').textContent = isRound ? 'Round Robin' : 'Fase Conference';
    host.classList.toggle('res-roundrobin', isRound);
    host.innerHTML = (isRound ? ['Unificata'] : ['Conf A', 'Conf B'])
      .map(conference => conferenceMarkup(state.selected, conference)).join('');
  }

  async function load() {
    $('risultati-sezioni').innerHTML = '<div class="res-empty">Caricamento risultati da Supabase…</div>';
    const [r, f] = await Promise.all([
      supabase.from('fantacalcio_results')
        .select('conference,phase,gw,team,opponent,points_for,points_against,is_home')
        .in('conference', ['Conf A', 'Conf B', 'Unificata']).order('gw'),
      supabase.from('fantacalcio_fixtures')
        .select('conference,phase,gw,home_team,away_team')
        .in('conference', ['Conf A', 'Conf B', 'Unificata']).order('gw')
    ]);
    if (r.error) throw r.error;
    state.results = (r.data || []).filter(x => x.phase === 'Regular');
    // I risultati sono pubblici; il calendario può essere accessibile solo agli utenti loggati.
    state.fixtures = f.error ? [] : (f.data || []).filter(x => x.phase === 'Regular');
    const weeks = new Set(state.results.filter(isPlayed).map(calendarWeek));
    state.fixtures.forEach(row => weeks.add(calendarWeek(row)));
    state.weeks = [...weeks].filter(x => x >= 1 && x <= 40).sort((a, b) => a - b);
    if (state.selected === null) {
      const completed = state.results.filter(isPlayed).map(calendarWeek);
      state.selected = completed.length ? Math.max(...completed) : (state.weeks[0] || null);
    }
    state.ready = true;
    render();
  }

  function activate() {
    const button = document.querySelector('[data-classifica-view="results"]');
    const switcher = document.querySelector('.switcher');
    switcher.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === button));
    $('classifica-container').hidden = true;
    $('race-tab-panel').hidden = true;
    const heroBanner = $('heroBanner');
    if (heroBanner?.dataset.raceBanner === '1') {
      heroBanner.style.backgroundImage = '';
      delete heroBanner.dataset.raceBanner;
    }
    $('risultati-tab-panel').hidden = false;
    document.querySelector('.classifica-card')?.classList.remove('race-mode');
    const title = document.querySelector('.classifica-hero h1');
    const subtitle = document.querySelector('.classifica-subtitle');
    if (title) title.textContent = 'Risultati';
    if (subtitle) subtitle.textContent = 'Giornata per giornata. Nessun punteggio dimenticato.';
    if (location.hash !== '#risultati') history.replaceState(null, '', location.pathname + location.search + '#risultati');
    if (!state.ready) load().catch(showError);
  }

  function deactivate() {
    if ($('risultati-tab-panel').hidden) return;
    $('risultati-tab-panel').hidden = true;
    $('classifica-container').hidden = false;
    if (location.hash === '#risultati') history.replaceState(null, '', location.pathname + location.search);
  }

  function showError(error) {
    state.ready = false;
    console.error('Caricamento Risultati:', error);
    $('risultati-sezioni').innerHTML =
      '<div class="res-empty res-error">Impossibile caricare i risultati. Premi Aggiorna per riprovare.</div>';
  }

  function init() {
    const button = document.querySelector('[data-classifica-view="results"]');
    const panel = $('risultati-tab-panel');
    if (!button || !panel) return;

    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopImmediatePropagation();
      activate();
    }, true);

    document.querySelectorAll('.switcher button:not([data-classifica-view="results"])').forEach(b => {
      b.addEventListener('click', deactivate, true);
    });

    // La Race intercetta il click: questo listener sul contenitore evita che restino due pannelli visibili.
    const race = document.querySelector('[data-classifica-view="race"]');
    if (race) race.addEventListener('click', () => { panel.hidden = true; }, true);

    $('risultati-giornata').addEventListener('change', event => {
      state.selected = Number(event.target.value);
      render();
    });
    $('risultati-prev').addEventListener('click', () => {
      const i = state.weeks.indexOf(state.selected);
      if (i > 0) { state.selected = state.weeks[i - 1]; render(); }
    });
    $('risultati-next').addEventListener('click', () => {
      const i = state.weeks.indexOf(state.selected);
      if (i >= 0 && i < state.weeks.length - 1) {
        state.selected = state.weeks[i + 1]; render();
      }
    });
    $('risultati-refresh').addEventListener('click', () => load().catch(showError));

    window.addEventListener('hashchange', () => {
      if (location.hash === '#risultati') activate();
    });
    if (location.hash === '#risultati') activate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();