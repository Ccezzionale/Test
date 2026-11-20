/* Hall of Fame · Medagliere compatto.
   Riordina le RIGHE già rese dai dati ufficiali (statici/Supabase):
   nessun numero inventato e nessuna modifica al database. */
(() => {
  'use strict';

  const table = document.getElementById('medagliere');
  const body = table?.querySelector('tbody');
  const controls = [...document.querySelectorAll('[data-hof-medal-sort]')];
  if (!table || !body || !controls.length) return;

  let active = 'ori';

  function score(row) {
    const cells = row.cells;
    const n = i => Number(cells[i]?.textContent?.trim()) || 0;
    return { oro:n(2), argento:n(3), bronzo:n(4), totale:n(5),
      name:cells[1]?.textContent?.trim() || '' };
  }

  function compare(a,b) {
    const x = score(a), y = score(b);
    if (active === 'totale') {
      return y.totale-x.totale || y.oro-x.oro || y.argento-x.argento ||
        y.bronzo-x.bronzo || x.name.localeCompare(y.name,'it');
    }
    return y.oro-x.oro || y.argento-x.argento || y.bronzo-x.bronzo ||
      y.totale-x.totale || x.name.localeCompare(y.name,'it');
  }

  function refresh() {
    const rows = [...body.querySelectorAll(':scope > tr')];
    if (!rows.length) return;
    const ordered = [...rows].sort(compare);
    // Se l'ordine è già quello giusto non riscriviamo il DOM:
    // evita loop con il MutationObserver e cambi di focus.
    if (ordered.some((row,i) => rows[i] !== row)) body.append(...ordered);

    ordered.forEach((row,i) => {
      const position = i + 1;
      const rank = row.querySelector('.rank-badge');
      const cls = position <= 3 ? 'top'+position : '';
      for (const label of ['top1','top2','top3']) row.classList.remove(label);
      if (cls) row.classList.add(cls);
      if (rank) {
        if (rank.textContent !== String(position)) rank.textContent = String(position);
        rank.classList.remove('top1','top2','top3','rank-normal');
        rank.classList.add(cls || 'rank-normal');
      }
    });

    controls.forEach(button => {
      const selected = button.dataset.hofMedalSort === active;
      button.classList.toggle('is-active',selected);
      button.setAttribute('aria-pressed',String(selected));
    });
    [...table.tHead?.rows[0]?.cells || []].forEach((th,i) =>
      th.setAttribute('aria-sort',(active === 'ori' && i === 2) ||
        (active === 'totale' && i === 5) ? 'descending' : 'none'));
  }

  controls.forEach(button => button.addEventListener('click', () => {
    if (!['ori','totale'].includes(button.dataset.hofMedalSort)) return;
    active = button.dataset.hofMedalSort;
    refresh();
  }));

  // I dati live possono arrivare dopo il fallback statico o essere
  // ricaricati dal Commissioner: manteniamo il criterio scelto.
  const observer = new MutationObserver(refresh);
  observer.observe(body,{childList:true});
  refresh();
})();
