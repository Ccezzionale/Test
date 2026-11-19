/* Classifiche Arena · preview-only presentation layer.
   Real standings/results and Race controllers are not modified.
   The legacy results button remains in .switcher for the official JS,
   but is activated through a separate, visible two-way mode selector.
*/
(() => {
  'use strict';
  function init() {
    const switcher = document.querySelector('.arena-rank-panel .switcher');
    const resultsTrigger = switcher?.querySelector('[data-classifica-view="results"]');
    const normal = switcher ? [...switcher.querySelectorAll('button')].filter(b => b !== resultsTrigger) : [];
    const standingsBtn = document.getElementById('arena-show-standings');
    const resultsBtn = document.getElementById('arena-show-results');
    const standingsPanel = document.getElementById('classifica-container');
    const resultsPanel = document.getElementById('risultati-tab-panel');
    const racePanel = document.getElementById('race-tab-panel');
    const raceButton = document.querySelector('[data-classifica-view="race"]');
    const indicator = document.getElementById('arena-rank-current');
    const title = document.getElementById('arena-rank-list-title');
    if (!switcher || !resultsTrigger || !standingsBtn || !resultsBtn ||
        !standingsPanel || !resultsPanel || !racePanel || !normal.length) return;

    let chosen = normal.find(b => b.classList.contains('active')) || normal[0];
    let pendingSync = false;
    function labelFor(button) {
      const raw = button?.textContent?.replace(/\s+/g, ' ').trim() || '';
      return ({
        'Conf.League':'Conference League',
        'Conf. Championship':'Conference Championship',
        'Round Robin':'Round Robin',
        'Totale':'Classifica Totale'
      })[raw] || raw || 'Conference League';
    }
    function sync() {
      pendingSync = false;
      // Retain the last real standings choice even while a separate panel is open.
      const current = normal.find(b => b.classList.contains('active'));
      if (current) chosen = current;

      const showingRace = !racePanel.hidden;
      const showingResults = !resultsPanel.hidden && !showingRace;
      const showingStandings = !showingResults && !showingRace;

      standingsBtn.classList.toggle('is-active', showingStandings);
      standingsBtn.setAttribute('aria-pressed', String(showingStandings));
      resultsBtn.classList.toggle('is-active', showingResults);
      resultsBtn.setAttribute('aria-pressed', String(showingResults));

      if (indicator) indicator.textContent =
        showingRace ? 'RACE TO #1' : showingResults ? 'RISULTATI' : labelFor(chosen).toUpperCase();
      if (title) title.textContent = labelFor(chosen);
      if (raceButton) raceButton.setAttribute('aria-pressed', String(showingRace));
    }
    function scheduleSync() {
      if (pendingSync) return;
      pendingSync = true;
      requestAnimationFrame(sync);
    }

    normal.forEach(button => button.addEventListener('click', () => {
      chosen = button;
      scheduleSync();
    }, true));
    standingsBtn.addEventListener('click', () => {
      // Uses the original button and original loader without duplicating calculations.
      (chosen || normal[0]).click();
      scheduleSync();
    });
    resultsBtn.addEventListener('click', () => {
      resultsTrigger.click();
      scheduleSync();
    });

    if (raceButton) raceButton.addEventListener('click', scheduleSync, true);

    const watchVisibility = { attributes: true, attributeFilter: ['hidden'] };
    new MutationObserver(scheduleSync).observe(resultsPanel, watchVisibility);
    new MutationObserver(scheduleSync).observe(racePanel, watchVisibility);
    new MutationObserver(scheduleSync).observe(standingsPanel, watchVisibility);
    new MutationObserver(scheduleSync).observe(switcher, {
      attributes: true, subtree: true, attributeFilter: ['class']
    });
    if (raceButton) new MutationObserver(scheduleSync).observe(raceButton, {
      attributes: true, attributeFilter: ['class']
    });
    window.addEventListener('hashchange', scheduleSync);

    // Restore focus without scroll jumps when an external link opens #risultati.
    sync();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
