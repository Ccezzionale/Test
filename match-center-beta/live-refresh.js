/* Lega degli Eroi · bridge per la beta G12.
 * Solo lettura da ./live-feed.json (stesso dominio), non chiama il provider
 * e non accede né scrive a Supabase. Il feed viene sostituito manualmente
 * o da un processo autorizzato; questa pagina controlla soltanto le novità.
 */
(() => {
  'use strict';
  const shell = document.querySelector('.snapshot-strip');
  if (!shell || typeof DATA === 'undefined' || typeof render !== 'function') return;

  const styles = document.createElement('style');
  styles.textContent = '.beta-feed-controls{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 2px 20px;flex-wrap:wrap}.beta-feed-state{font-size:10px;color:#a9c6d5;line-height:1.5;flex:1;min-width:190px}.beta-feed-controls button{background:#14354a;border:1px solid #43839a;color:#9de9ea;border-radius:9px;padding:9px 12px;font:800 10px system-ui,sans-serif;white-space:nowrap}.beta-feed-controls button:disabled{opacity:.45;cursor:default}.beta-feed-controls button:focus-visible{outline:2px solid #74e4eb;outline-offset:2px}';
  document.head.appendChild(styles);

  const bar = document.createElement('div');
  bar.className = 'beta-feed-controls';
  const state = document.createElement('span');
  state.className = 'beta-feed-state';
  state.setAttribute('role','status');
  state.setAttribute('aria-live','polite');
  state.textContent = 'Dati di prova salvati, nessuna connessione LIVE al fornitore.';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = '↻ Controlla aggiornamenti';
  bar.append(state,button);
  shell.insertAdjacentElement('afterend',bar);

  const permitted = new Set();
  for (const match of DATA.matches) {
    for (const side of [match.home,match.away]) {
      for (const player of side.players) permitted.add(player.name + '|' + player.club);
    }
  }
  const baseline = Date.parse(shell.dataset.snapshotAsOf || '');
  let newest = Number.isFinite(baseline) ? baseline : 0;
  let checking = false;

  function validate(feed) {
    if (!feed || feed.schema !== 1 || feed.season !== DATA.season || feed.gw !== DATA.gw) {
      throw new Error('Il feed non corrisponde alla giornata di questa beta');
    }
    if (feed.source !== 'highlightly-sandbox' || !feed.votes ||
        Array.isArray(feed.votes) || typeof feed.votes !== 'object') {
      throw new Error('Formato del feed non riconosciuto');
    }
    const ms = Date.parse(feed.as_of);
    if (!Number.isFinite(ms) || ms > Date.now() + 5 * 60 * 1000) {
      throw new Error('Data di rilevamento non valida');
    }
    return ms;
  }

  function checkedVote(v) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const base=Number(v.base), bonus=Number(v.bonus), fantasy=Number(v.fantavote);
    if (![base,bonus,fantasy].every(Number.isFinite) || base < 0 || base > 10 ||
        bonus < -12 || bonus > 30 || fantasy < -12 || fantasy > 40 ||
        Math.abs(base + bonus - fantasy) > 0.011) return null;
    return {
      base, bonus, fantavote:fantasy,
      goal: Number.isInteger(v.goal) && v.goal >= 0 ? v.goal : 0,
      assists: Number.isInteger(v.assists) && v.assists >= 0 ? v.assists : 0,
      yellow: Number.isInteger(v.yellow) && v.yellow >= 0 ? v.yellow : 0,
      red: Number.isInteger(v.red) && v.red >= 0 ? v.red : 0,
      penalties_missed: Number.isInteger(v.penalties_missed) && v.penalties_missed >= 0 ? v.penalties_missed : 0,
      source:'Highlightly · solo stima, non voto Fantacalcio'
    };
  }

  async function check(silent = false) {
    if (checking || document.visibilityState === 'hidden') return;
    checking = true;
    button.disabled = true;
    if (!silent) state.textContent = 'Controllo del file di prova…';
    try {
      const response = await fetch('./live-feed.json?v=' + Date.now(), {
        method:'GET', mode:'same-origin', credentials:'omit', cache:'no-store'
      });
      if (!response.ok) throw new Error('File aggiornamenti non raggiungibile');
      const feed = await response.json();
      const date = validate(feed);
      const label = new Date(date).toLocaleString('it-IT', {
        timeZone:'Europe/Brussels',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'
      });
      const old = date <= newest;
      let updated = 0;
      if (!old) {
        for (const [key, raw] of Object.entries(feed.votes)) {
          if (!permitted.has(key)) continue;
          const vote = checkedVote(raw);
          if (!vote) continue;
          DATA.voti_certi[key] = vote;
          updated++;
        }
        newest = date;
        if (updated) render();
      }
      const age = Date.now() - date;
      const isStale = age > 20 * 60 * 1000;
      const stamp = shell.querySelector('.update-time');
      if (stamp) stamp.textContent = label;
      state.textContent = isStale
        ? 'ARCHIVIO ' + label + ' · Fonte non aggiornata in tempo reale. ' + (old ? 'Nessun nuovo dato.' : updated + ' valutazioni verificate.')
        : 'SNAPSHOT ' + label + ' · ' + (old ? 'Nessun nuovo dato.' : updated + ' valutazioni aggiornate.');
    } catch (err) {
      state.textContent = 'Restano visibili i dati salvati. ' + (err.message || 'Aggiornamenti non disponibili.');
    } finally {
      checking = false;
      button.disabled = false;
    }
  }
  button.addEventListener('click', () => check(false));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check(true);
  });
  window.setInterval(() => check(true), 120000);
  check(false);
})();
