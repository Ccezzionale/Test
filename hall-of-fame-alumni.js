import { supabase } from './supabase.js';

(function () {
  'use strict';

  const TEAM_LOGOS = {
    'Costantinobull': 'img/Costantinobull.png',
    'Rubinkebab': 'img/Rubinkebab.png',
    'Pollisti': 'img/Pollisti.png',
    'Real Mimmo': 'img/Real Mimmo.png',
    'Giody': 'img/Giody.png',
    'Union Librino': 'img/Union Librino.png',
    'I Cugini di Zampagna': 'img/I Cugini di Zampagna.png',
    '3 Amici al Var': 'img/3 Amici al Var.png',
    'Desperados': 'img/Desperados.webp',
    'MinneSota Snakes': 'img/MinneSota Snakes.webp',
    'Team Bartowski': 'img/Team Bartowski.webp',
    'Golden Knights': 'img/Golden Knights.webp',
    'Bayern Christiansen': 'img/Bayern Christiansen.webp',
    'Pandinicoccolosini': 'img/Pandinicoccolosini.webp',
    'Athletic Pongao': 'img/Athletic Pongao.webp',
    'Ibla': 'img/Ibla.webp',
    'PokerMantra': 'img/POKERMANTRA.webp',
    'Minnesode Timberland': 'img/Minnesode Timberland.webp',
    'Fantaugusta': 'img/Fantaugusta.webp',
    'Wildboys 78': 'img/wildboys78.webp',
    'FC Disoneste': 'img/FC Disoneste.webp',
    'Atlético Leon': 'img/Atlético Leon.webp'
  };

  const state = { rows: [], isAdmin: false, active: 0, editingId: null };
  const byId = id => document.getElementById(id);
  const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, char => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));

  function validLogo(url) {
    if (!url || typeof url !== 'string') return '';
    const value = url.trim();
    if (!value) return '';
    try {
      const parsed = new URL(value, window.location.href);
      if (!['https:', 'http:'].includes(parsed.protocol)) return '';
      return parsed.href;
    } catch (_) { return ''; }
  }

  function logoFor(row) {
    return validLogo(row.logo_url || TEAM_LOGOS[row.name] || '');
  }

  function setNotice(text, type) {
    const el = byId('hof-alumni-notice');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'hof-alumni-notice' + (type ? ' is-' + type : '');
  }

  async function checkAdmin() {
    const response = await supabase.auth.getUser();
    const user = response.data?.user;
    if (!user) return false;
    const profile = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    return ['admin', 'commissioner'].includes(String(profile.data?.role || '').toLowerCase());
  }

  function publishedRows() { return state.rows.filter(row => row.published); }

  function cardHtml(row, index) {
    const logo = logoFor(row);
    const initials = (row.name || '?').split(/\s+/).map(s => s.slice(0,1)).join('').slice(0,3).toUpperCase();
    const meta = [];
    if (row.seasons) meta.push(['Stagioni', row.seasons]);
    meta.push(['Trofei', String(row.trophy_count ?? 0)]);
    const stats = meta.length ? '<div class="hof-alumni-stats">' +
      meta.map(pair => '<div class="hof-alumni-stat"><strong>' + escapeHtml(pair[0]) +
        '</strong><span>' + escapeHtml(pair[1]) + '</span></div>').join('') + '</div>' : '';
    const img = logo ? '<img src="' + escapeHtml(logo) + '" alt="Logo ' +
      escapeHtml(row.name) + '" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.style.display=\'block\'">' : '';
    return '<article class="hof-alumni-card" data-alumni-index="' + index + '">' +
      '<div class="hof-alumni-logo-shell">' + img +
      '<span class="hof-alumni-logo-fallback" style="display:' + (logo ? 'none' : 'block') + '">' + escapeHtml(initials) + '</span></div>' +
      '<h3 class="hof-alumni-team">' + escapeHtml(row.name) + '</h3>' +
      '<span class="hof-alumni-mark">ALUMNI</span>' + stats +
      (row.description ? '<p class="hof-alumni-description">' + escapeHtml(row.description) + '</p>' : '') +
      (row.epitaph ? '<p class="hof-alumni-epitaph">“' + escapeHtml(row.epitaph) + '”</p>' : '') +
      (row.story ? '<div class="hof-alumni-card-footer"><button type="button" class="hof-alumni-story-btn" data-alumni-story="' +
        escapeHtml(row.id) + '">📖 Scopri la storia</button></div>' : '') +
      '</article>';
  }

  function renderCarousel() {
    const carousel = byId('hof-alumni-carousel');
    const empty = byId('hof-alumni-empty');
    const nav = byId('hof-alumni-nav');
    if (!carousel) return;
    const rows = publishedRows();
    carousel.innerHTML = rows.map(cardHtml).join('');
    carousel.hidden = !rows.length;
    empty.hidden = Boolean(rows.length);
    nav.hidden = rows.length < 2;
    state.active = Math.min(state.active, Math.max(0, rows.length - 1));
    byId('hof-alumni-dots').innerHTML = rows.map((_, i) =>
      '<button class="hof-alumni-dot' + (i === state.active ? ' is-active' : '') +
      '" type="button" data-alumni-goto="' + i + '" aria-label="Vai alla scheda ' + (i+1) +
      '" aria-current="' + (i === state.active ? 'true' : 'false') + '"></button>').join('');
    updateNav();
    if (rows.length > 0) requestAnimationFrame(() => goTo(state.active, false));
  }

  function updateNav() {
    const count = publishedRows().length;
    byId('hof-alumni-prev').disabled = state.active <= 0;
    byId('hof-alumni-next').disabled = state.active >= count - 1;
    byId('hof-alumni-dots').querySelectorAll('button').forEach((button, i) => {
      const active = i === state.active;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', String(active));
    });
  }

  function goTo(index, smooth = true) {
    const carousel = byId('hof-alumni-carousel');
    const cards = Array.from(carousel.querySelectorAll('.hof-alumni-card'));
    if (!cards.length) return;
    state.active = Math.max(0, Math.min(index, cards.length - 1));
    const card = cards[state.active];
    const left = card.offsetLeft - carousel.offsetLeft - (carousel.clientWidth - card.clientWidth) / 2;
    carousel.scrollTo({ left, behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' });
    updateNav();
  }

  function renderAdminList() {
    const container = byId('hof-alumni-admin-list');
    if (!state.isAdmin || !container) return;
    if (!state.rows.length) {
      container.innerHTML = '<p>Non hai ancora inserito nessuna franchigia.</p>';
      return;
    }
    container.innerHTML = state.rows.map(row =>
      '<div class="hof-alumni-manage-row"><span><strong>' + escapeHtml(row.name) + '</strong> ' +
      (row.published ? '✓ Pubblicata' : '· Bozza') + '</span>' +
      '<button type="button" data-alumni-edit="' + escapeHtml(row.id) + '">Modifica</button>' +
      '<button type="button" data-alumni-delete="' + escapeHtml(row.id) + '">Elimina</button></div>'
    ).join('');
  }

  async function refresh() {
    const response = await supabase.from('hall_of_fame_alumni').select('*')
      .order('sort_order', { ascending: true }).order('created_at', { ascending: true });
    if (response.error) throw response.error;
    state.rows = response.data || [];
    renderCarousel();
    renderAdminList();
  }

  function resetForm() {
    const form = byId('hof-alumni-form');
    form.reset();
    form.elements.id.value = '';
    form.elements.sort_order.value = '0';
    form.elements.published.checked = true;
    byId('hof-alumni-form-heading').textContent = 'Aggiungi una franchigia';
    state.editingId = null;
  }

  function editRow(id) {
    const row = state.rows.find(item => item.id === id);
    if (!row) return;
    const form = byId('hof-alumni-form');
    for (const key of ['id','name','seasons','logo_url','description','epitaph','story','sort_order']) {
      form.elements[key].value = row[key] ?? '';
    }
    form.elements.trophy_count.value = row.trophy_count ?? 0;
    form.elements.published.checked = Boolean(row.published);
    form.elements.logo_file.value = '';
    state.editingId = id;
    byId('hof-alumni-form-heading').textContent = 'Modifica ' + row.name;
    byId('hof-alumni-admin-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function saveRow(event) {
    event.preventDefault();
    if (!state.isAdmin) return;
    const form = byId('hof-alumni-form');
    const submit = byId('hof-alumni-save');
    submit.disabled = true;
    setNotice('Salvataggio in corso…');
    try {
      const e = form.elements;
      const name = e.name.value.trim();
      if (!name) throw new Error('Inserisci il nome della franchigia.');
      let logo = e.logo_url.value.trim() || TEAM_LOGOS[name] || '';
      const file = e.logo_file.files?.[0];
      if (file) {
        if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('Logo: usa PNG, JPG o WebP.');
        if (file.size > 2 * 1024 * 1024) throw new Error('Il logo deve essere inferiore a 2 MB.');
        const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type];
        const key = 'logos/' + crypto.randomUUID() + '.' + ext;
        const upload = await supabase.storage.from('hof-alumni').upload(key, file, { contentType: file.type, upsert: false });
        if (upload.error) throw upload.error;
        logo = supabase.storage.from('hof-alumni').getPublicUrl(key).data.publicUrl;
      }
      if (logo && !validLogo(logo)) throw new Error('Il percorso del logo non è valido.');
      const trophyCount = Number(e.trophy_count.value || 0);
      if (!Number.isInteger(trophyCount) || trophyCount < 0) throw new Error('Inserisci un numero di trofei valido.');
      const data = {
        name, seasons:e.seasons.value.trim() || null,
        trophy_count: trophyCount,
        logo_url:logo || null,
        description:e.description.value.trim(),
        epitaph:e.epitaph.value.trim(),
        story:e.story.value.trim(),
        sort_order:Number(e.sort_order.value) || 0,
        published:e.published.checked,
        updated_at:new Date().toISOString()
      };
      const save = state.editingId ?
        await supabase.from('hall_of_fame_alumni').update(data).eq('id',state.editingId).select('id') :
        await supabase.from('hall_of_fame_alumni').insert(data).select('id');
      if (save.error) throw save.error;
      if (!save.data?.length) throw new Error('Salvataggio non confermato: controlla i permessi.');
      resetForm();
      await refresh();
      setNotice('Franchigia salvata correttamente.', 'ok');
    } catch (err) {
      setNotice(err.message || 'Impossibile salvare la franchigia.', 'error');
    } finally { submit.disabled = false; }
  }

  async function deleteRow(id) {
    if (!state.isAdmin) return;
    const row = state.rows.find(item => item.id === id);
    if (!row || !window.confirm('Eliminare la scheda Alumni di ' + row.name + '? Lo storico sportivo non sarà modificato.')) return;
    setNotice('Eliminazione in corso…');
    const response = await supabase.from('hall_of_fame_alumni').delete().eq('id',id).select('id');
    if (response.error || !response.data?.length) {
      setNotice(response.error?.message || 'Non è stato possibile eliminare la scheda.', 'error');
      return;
    }
    if (state.editingId === id) resetForm();
    await refresh();
    setNotice('Scheda eliminata. Lo storico sportivo rimane intatto.', 'ok');
  }

  function openStory(id) {
    const row = state.rows.find(item => item.id === id && item.published);
    if (!row?.story) return;
    byId('hof-alumni-story-title').textContent = row.name;
    byId('hof-alumni-story-content').textContent = row.story;
    const dialog = byId('hof-alumni-dialog');
    if (dialog.showModal) dialog.showModal();
  }

  async function init() {
    if (!byId('hof-alumni-carousel')) return;
    const carousel = byId('hof-alumni-carousel');
    byId('hof-alumni-prev').addEventListener('click', () => goTo(state.active-1));
    byId('hof-alumni-next').addEventListener('click', () => goTo(state.active+1));
    byId('hof-alumni-dots').addEventListener('click', event => {
      const button = event.target.closest('[data-alumni-goto]');
      if (button) goTo(Number(button.dataset.alumniGoto));
    });
    carousel.addEventListener('click', event => {
      const button = event.target.closest('[data-alumni-story]');
      if (button) openStory(button.dataset.alumniStory);
    });
    let ticking = false;
    carousel.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const center = carousel.scrollLeft + carousel.clientWidth / 2;
        const cards = Array.from(carousel.querySelectorAll('.hof-alumni-card'));
        if (cards.length) {
          let best = 0, distance = Infinity;
          cards.forEach((card, i) => {
            const x = card.offsetLeft - carousel.offsetLeft + card.clientWidth / 2;
            const d = Math.abs(x - center);
            if (d < distance) { best = i; distance = d; }
          });
          state.active = best;
          updateNav();
        }
        ticking = false;
      });
    }, { passive:true });
    byId('hof-alumni-story-close').addEventListener('click', () => byId('hof-alumni-dialog').close());
    byId('hof-alumni-dialog').addEventListener('click', event => {
      if (event.target === byId('hof-alumni-dialog')) event.target.close();
    });
    try {
      state.isAdmin = await checkAdmin();
    } catch (err) {
      console.warn('Alumni: controllo admin non disponibile',err);
    }
    if (state.isAdmin) {
      byId('hof-alumni-admin-toggle').hidden = false;
      byId('hof-alumni-admin-toggle').addEventListener('click', () => {
        const panel = byId('hof-alumni-admin-panel');
        panel.hidden = !panel.hidden;
        byId('hof-alumni-admin-toggle').setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) panel.scrollIntoView({ behavior:'smooth', block:'start' });
      });
      byId('hof-alumni-form').addEventListener('submit', saveRow);
      byId('hof-alumni-cancel').addEventListener('click', resetForm);
      byId('hof-alumni-admin-list').addEventListener('click', event => {
        const edit = event.target.closest('[data-alumni-edit]');
        const del = event.target.closest('[data-alumni-delete]');
        if (edit) editRow(edit.dataset.alumniEdit);
        else if (del) deleteRow(del.dataset.alumniDelete);
      });
    }
    try {
      await refresh();
    } catch (err) {
      byId('hof-alumni-empty').hidden = false;
      byId('hof-alumni-empty').textContent = 'Impossibile caricare gli Alumni. Riprova aggiornando la pagina.';
      setNotice(err.message || 'Errore caricamento', 'error');
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',init);
  else init();
})();
