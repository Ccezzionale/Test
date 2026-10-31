/* LEGA DEGLI EROI — Playoff Arena add-on (mobile)
   Integra le immagini nei match creati da renderMobilePlayoff(P).
   Non riscrive calcolo seed, punteggi, vincitori, Supabase o tabellone desktop.
   Caricare con `defer` DOPO playoff.js.
*/
(() => {
  'use strict';
  const BASE = 'img/playoff-arena/';
  const aliases = {
    'team bartowski':'team-bartowski', 'bartowski':'team-bartowski',
    'atletico leon':'atletico-leon', 'atletico leon fc':'atletico-leon',
    'bayern christiansen':'bayern-christiansen',
    'desperados':'desperados',
    'fc disoneste':'fc-disoneste', 'disoneste':'fc-disoneste',
    'fantaugusta':'fantaugusta', 'fantaaugusta':'fantaugusta', 'fanta augusta':'fantaugusta',
    'eintracht franco 126':'eintracht-franco-126', 'eintracht franco':'eintracht-franco-126',
    'golden knights':'golden-knights',
    'ibla':'ibla-fc', 'ibla fc':'ibla-fc',
    'minnesode timberland':'minnesode-timberland', 'minnesode':'minnesode-timberland',
    'pandinicoccolosini':'pandini', 'pandinicoccolosini fc':'pandini', 'pandini':'pandini',
    'pokermantra':'pokermantra',
    'athletic pongao':'athletic-pongao', 'athletic pongao fc':'athletic-pongao',
    'riverfilo':'riverfilo',
    'minnesota snakes':'minnesota-snakes', 'minnesota snake':'minnesota-snakes', 'snakes':'minnesota-snakes',
    'wildboys':'wild-boys', 'wild boys':'wild-boys', 'wildboys fc':'wild-boys', 'wild boys fc':'wild-boys'
  };
  const codeNames = {
    WC1:'WILD CARD 1', WC2:'WILD CARD 2', WC3:'WILD CARD 3', WC4:'WILD CARD 4',
    Q1:'QUARTO 1',Q2:'QUARTO 2',Q3:'QUARTO 3',Q4:'QUARTO 4',
    S1:'SEMIFINALE 1',S2:'SEMIFINALE 2',P3:'FINALE 3° POSTO',F:'GRAN FINALE'
  };
  const normalize = value => (value || '')
    .toString().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/^\s*#?\d+\s*[°º]?\s*/, '')
    .replace(/[^a-zA-Z0-9 ]/g,' ')
    .replace(/\s+/g,' ').trim().toLowerCase();
  const getFile = name => {
    const key = normalize(name);
    // Le classifiche possono usare Wildboys, Wild Boys, Wildboys FC o WildBoyz.
    // Riconosciamo tutte queste varianti senza cambiare le altre squadre.
    if (/wild\s*boy(?:s|z)?/.test(key)) return 'wild-boys';
    return aliases[key] || null;
  };

  function enhance() {
    const root = document.getElementById('mobile-stage-content');
    if (!root) return;
    root.querySelectorAll('.mobile-match-card').forEach(card => {
      if (card.classList.contains('arena-ready')) return;
      const sides = card.querySelectorAll('.mobile-team-side');
      if (sides.length !== 2) return;

      sides.forEach(side => {
        const name = side.querySelector('.mobile-team-name')?.textContent?.trim() || '';
        const file = getFile(name);
        const holder = document.createElement('span');
        holder.className = 'arena-visual';
        holder.setAttribute('aria-hidden','true');
        if (file) {
          const pic = document.createElement('img');
          // Fallback per Wild Boys: su alcuni siti l'immagine potrebbe
          // essere stata caricata con il vecchio nome del file.
          const candidates = file === 'wild-boys'
            ? ['wild-boys.webp', 'wildboys.webp', 'wild-boys-arena.webp']
            : [file + '.webp'];
          let candidateIndex = 0;
          pic.src = BASE + candidates[candidateIndex];
          pic.alt = '';
          pic.loading = 'lazy';
          pic.decoding = 'async';
          pic.addEventListener('error', () => {
            candidateIndex += 1;
            if (candidateIndex < candidates.length) {
              pic.src = BASE + candidates[candidateIndex];
            } else {
              console.warn('[Playoff Arena] Immagine non trovata:', name, candidates);
              pic.remove();
              side.classList.add('arena-image-missing');
            }
          });
          holder.appendChild(pic);
        }
        side.insertBefore(holder,side.firstChild);
      });

      const code = card.getAttribute('data-mobile-match') || '';
      const label = card.querySelector('.mobile-match-code');
      if (label && codeNames[code]) label.textContent = codeNames[code];
      if (card.querySelector('.mobile-vs-pill.has-score')) card.classList.add('arena-has-score');
      card.classList.add('arena-ready');
    });

    document.querySelectorAll('.stage-tab').forEach(tab =>
      tab.setAttribute('aria-selected',tab.classList.contains('active')?'true':'false')
    );
  }

  const init = () => {
    const root = document.getElementById('mobile-stage-content');
    if (!root) return;
    enhance();
    // Le card vengono ricreate anche cliccando un'altra fase o dopo i risultati.
    const observer = new MutationObserver(enhance);
    observer.observe(root,{childList:true,subtree:false});
  };
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
