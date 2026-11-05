/* PLAYOFF REAL LEGENDS • V11
   Navigazione istantanea tra le sfide: i dati ufficiali si caricano una volta
   con playoff.js. I cambi di duello aggiornano soltanto il DOM e l'URL.
   Nessuna modifica a calcoli, punteggi, seed o proporzioni V9 delle mascotte. */
(() => {
  'use strict';

  const stages = ['wildcard', 'quarti', 'semifinali', 'finale'];
  const labels = { wildcard:'WILD CARD', quarti:'QUARTI', semifinali:'SEMIFINALI', finale:'FINALI' };
  const stageCode = {
    WC1:'WILD CARD 1', WC2:'WILD CARD 2', WC3:'WILD CARD 3', WC4:'WILD CARD 4',
    Q1:'QUARTO 1', Q2:'QUARTO 2', Q3:'QUARTO 3', Q4:'QUARTO 4',
    S1:'SEMIFINALE 1', S2:'SEMIFINALE 2', F:'GRAN FINALE', P3:'FINALE 3° POSTO'
  };

  const $ = id => document.getElementById(id);
  const clean = name => typeof stripSeed === 'function'
    ? stripSeed(name)
    : String(name || '').replace(/^\s*\d+\s*°\s*/, '').trim();
  const hasNum = v => v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v));
  const put = (id, value) => { const node = $(id); if (node) node.textContent = value; };
  const href = (stage, code) => 'playoff-sfida.html?fase=' + encodeURIComponent(stage) + '&match=' + encodeURIComponent(code);

  // Si mantiene l'ultimo snapshot ufficiale; il cambio pagina NON rifà il fetch.
  let participants = null;
  const prefetchedImages = new Set();

  function getRoute() {
    const q = new URLSearchParams(window.location.search);
    const stage = stages.includes(q.get('fase')) ? q.get('fase') : 'wildcard';
    return { stage, match: q.get('match') };
  }

  function getMatches(stage) {
    const meta = typeof MOBILE_STAGE_META !== 'undefined' ? MOBILE_STAGE_META[stage] : null;
    return meta && participants ? meta.matches.filter(m => participants[m.code]) : [];
  }

  function prefetchNextMascots(stage, index, matches) {
    // Solo vicine, per evitare di scaricare l'intero parco mascotte inutilmente.
    for (const offset of [-1, 1]) {
      const match = matches[index + offset];
      const info = match && participants?.[match.code];
      if (!info) continue;
      for (const team of [info.home, info.away]) {
        if (!team?.name || !team.seed) continue;
        const src = window.PlayoffRealLegends?.image(clean(team.name));
        if (!src || prefetchedImages.has(src)) continue;
        prefetchedImages.add(src);
        const img = new Image();
        img.src = src;
      }
    }
  }

  function update() {
    if (!participants) return;
    const { stage, match: requested } = getRoute();
    const meta = typeof MOBILE_STAGE_META !== 'undefined' ? MOBILE_STAGE_META[stage] : null;
    if (!meta) { put('rl-loading', 'Errore: fasi Playoff non disponibili.'); return; }
    const matches = getMatches(stage);
    if (!matches.length) { put('rl-loading', 'Gli incontri non sono ancora disponibili.'); return; }

    const index = Math.max(0, matches.findIndex(m => m.code === requested));
    const code = matches[index].code;
    const data = participants[code] || {};
    const teams = [data.home || {name:'In attesa'}, data.away || {name:'In attesa'}];
    const winner = typeof getWinnerSide === 'function' ? getWinnerSide(code, data) : null;
    const pick = typeof PICKS !== 'undefined' ? PICKS[code] : null;
    const scored = pick && hasNum(pick.home) && hasNum(pick.away);

    put('rl-stage-kicker', 'REAL LEGENDS · ' + labels[stage]);
    put('rl-event-stage', labels[stage]);
    document.querySelectorAll('[data-rl-stage]').forEach(tab => {
      const active = tab.dataset.rlStage === stage;
      tab.classList.toggle('active', active);
      if (active) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });
    put('rl-duel-title', stage === 'finale'
      ? (code === 'F' ? 'GRAN FINALE' : 'FINALE 3° POSTO')
      : 'DUELLO ' + (index + 1));
    put('rl-duel-counter', (index + 1) + ' / ' + matches.length);
    put('rl-arena-code', stageCode[code] || code);
    put('rl-score-kicker', scored ? 'RISULTATO UFFICIALE' : 'UNA SFIDA. DUE LEGGENDE.');
    put('rl-score-left', scored ? String(pick.home) : '–');
    put('rl-score-right', scored ? String(pick.away) : '–');
    put('rl-score-middle', scored ? '' : 'VS');
    put('rl-score-note', scored
      ? (winner ? 'Il verdetto è arrivato. La leggenda continua.' : 'Risultato registrato')
      : 'Una sola franchigia passerà al turno successivo.');

    ['left', 'right'].forEach((pos, i) => {
      const team = teams[i];
      const name = clean(team.name) || 'In attesa';
      const placeholder = !team.seed && (/vincente|perdente|classificata|in attesa/i.test(name) || !team.name);
      put('rl-' + pos + '-name', name);
      put('rl-' + pos + '-seed', team.seed ? '#' + team.seed + ' SEED' : 'DA DEFINIRE');

      const side = $('rl-' + pos + '-side');
      const slug = window.PlayoffRealLegends?.slug(name) || '';
      const optical = (slug && window.PlayoffRealLegends?.optical?.[slug]) || {};
      side.dataset.rlMascot = slug;
      side.style.setProperty('--rl-color', window.PlayoffRealLegends?.color(name) || '#23aaff');
      side.style.setProperty('--rl-optical-scale', optical.scale ?? 1);
      side.style.setProperty('--rl-optical-x', (optical.x ?? 0) + 'px');
      side.style.setProperty('--rl-optical-y', (optical.y ?? 0) + 'px');
      $('rl-arena').style.setProperty(i === 0 ? '--rl-left-color' : '--rl-right-color',
        window.PlayoffRealLegends?.color(name) || '#23aaff');
      side.classList.toggle('rl-placeholder', placeholder);
      side.classList.toggle('rl-qualificata', winner === (i === 0 ? 'home' : 'away'));
      side.classList.toggle('rl-eliminata', Boolean(winner) && winner !== (i === 0 ? 'home' : 'away'));

      const image = $('rl-' + pos + '-image');
      const src = !placeholder ? window.PlayoffRealLegends?.image(name) : null;
      if (src) {
        image.style.display = 'block';
        // Evita di riavviare il caricamento anche quando l'immagine resta la stessa.
        if (image.getAttribute('src') !== src) image.src = src;
        image.alt = 'REAL LEGEND ' + name;
        image.onerror = () => {
          if (image.getAttribute('src') !== src) return;
          image.style.display = 'none';
          side.classList.add('rl-placeholder');
        };
      } else {
        image.removeAttribute('src');
        image.style.display = 'none';
      }
      put('rl-' + pos + '-outcome', winner === (i === 0 ? 'home' : 'away')
        ? (code === 'F' ? '🏆 CAMPIONE' : '✓ QUALIFICATA')
        : (winner ? 'ELIMINATA' : ''));
    });

    // L'arena rimane visibile in ogni cambio duello.
    $('rl-duel-content').hidden = false;
    $('rl-loading').hidden = true;
    $('rl-back').href = 'playoff.html?fase=' + encodeURIComponent(stage);

    const prev = $('rl-prev'), next = $('rl-next');
    function setNav(anchor, targetIndex) {
      const enabled = targetIndex >= 0 && targetIndex < matches.length;
      anchor.classList.toggle('rl-disabled', !enabled);
      anchor.setAttribute('aria-disabled', String(!enabled));
      if (enabled) anchor.href = href(stage, matches[targetIndex].code);
      else anchor.removeAttribute('href');
    }
    setNav(prev, index - 1);
    setNav(next, index + 1);

    const dots = $('rl-dots');
    dots.replaceChildren();
    matches.forEach((m, i) => {
      const a = document.createElement('a');
      a.href = href(stage, m.code);
      a.className = 'rl-dot' + (i === index ? ' active' : '');
      a.setAttribute('aria-label', 'Vai alla sfida ' + (i + 1));
      if (i === index) a.setAttribute('aria-current', 'page');
      dots.appendChild(a);
    });

    document.title = clean(teams[0].name) + ' vs ' + clean(teams[1].name) + ' | Playoff Lega degli Eroi';
    prefetchNextMascots(stage, index, matches);
  }

  // Navigazione locale senza ricaricare HTML/CSS/JS o interrogare di nuovo Supabase.
  function navigate(url) {
    if (!participants) { window.location.assign(url); return; }
    const target = new URL(url, window.location.href);
    if (target.href === window.location.href) return;
    window.history.pushState({playoffDuel: true}, '', target.pathname + target.search + target.hash);
    update();
  }

  const shell = $('rl-duel-content');
  shell?.addEventListener('click', event => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || !shell.contains(anchor) || anchor.classList.contains('rl-disabled')) return;
    const target = new URL(anchor.href, window.location.href);
    if (target.origin !== window.location.origin || !target.pathname.endsWith('/playoff-sfida.html')) return;
    const q = target.searchParams;
    if (!stages.includes(q.get('fase')) || !q.get('match')) return;
    event.preventDefault();
    navigate(target.href);
  });

  window.addEventListener('popstate', () => {
    // Android/browser Back e Forward ripristinano la sfida corretta senza splash.
    if (participants) update();
  });

  // Swipe sulle mascotte, senza pagina bianca intermedia.
  let start = null;
  const area = $('rl-arena');
  area?.addEventListener('touchstart', event => {
    start = event.changedTouches[0].screenX;
  }, {passive:true});
  area?.addEventListener('touchend', event => {
    if (start === null || !participants) return;
    const distance = event.changedTouches[0].screenX - start;
    start = null;
    if (Math.abs(distance) < 65) return;
    const {stage, match} = getRoute();
    const matches = getMatches(stage);
    const index = Math.max(0, matches.findIndex(m => m.code === match));
    const next = index + (distance < 0 ? 1 : -1);
    if (next >= 0 && next < matches.length) navigate(href(stage, matches[next].code));
  }, {passive:true});
  area?.addEventListener('touchcancel', () => {start = null}, {passive:true});

  // Il primo caricamento usa esclusivamente i dati ufficiali ricevuti da playoff.js.
  document.addEventListener('lega:playoff-rendered', event => {
    participants = event.detail?.participants || null;
    update();
  });
  // Fallback per ripristino pagina da bfcache o evento già emesso.
  window.addEventListener('pageshow', () => {
    if (typeof computeParticipants === 'function' && Array.isArray(window.squadre) && window.squadre.length >= 12) {
      const current = computeParticipants();
      if (Object.keys(current).length) {participants = current; update();}
    }
  });
})();
