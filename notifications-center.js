import { supabase } from './supabase.js';

const NOTIFICATION_TABLE = 'app_notifications';
const REFRESH_MS = 45000;
const CENTER_VERSION = '20261005-center4';

let currentUser = null;
let currentFilter = 'all';
let refreshTimer = null;
let panelOpen = false;
let currentProfile = null;
let adminTeams = [];
let adminComposerReady = false;
let adminSendBusy = false;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function notificationIcon(type) {
  const icons = {
    trade: '🤝',
    waiver: '🔁',
    competition: '🏆',
    news: '📰',
    lineup: '📋',
    injury: '🩹',
    admin: '📢',
    system: '🔔'
  };

  return icons[String(type || '').toLowerCase()] || '🔔';
}

function formatRelativeTime(value) {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const diff = Math.max(0, Date.now() - date.getTime());
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diff < minute) return 'adesso';
  if (diff < hour) {
    const n = Math.floor(diff / minute);
    return `${n} min fa`;
  }
  if (diff < day) {
    const n = Math.floor(diff / hour);
    return `${n} ${n === 1 ? 'ora' : 'ore'} fa`;
  }
  if (diff < 2 * day) return 'ieri';
  if (diff < 7 * day) {
    const n = Math.floor(diff / day);
    return `${n} giorni fa`;
  }

  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short'
  }).format(date);
}

function safeDestination(url) {
  if (!url) return null;

  try {
    const destination = new URL(url, window.location.href);
    if (destination.origin !== window.location.origin) return null;
    return destination.href;
  } catch {
    return null;
  }
}

function setNotificationButtonLabel(trigger, label = 'Notifiche') {
  if (!trigger) return;
  const span = trigger.querySelector('.btn-label');
  if (span) span.textContent = label;
  else trigger.textContent = label;
}

function injectCenter4Styles() {
  if (document.getElementById('notification-center4-styles')) return;

  const style = document.createElement('style');
  style.id = 'notification-center4-styles';
  style.textContent = `
    .notification-admin-entry{padding:0 18px 12px;display:none}
    .notification-admin-entry.is-visible{display:block}
    .notification-admin-open{width:100%;border:1px solid rgba(22,104,191,.24);border-radius:12px;padding:10px 12px;background:#eef6ff;color:#0b4f91;font-weight:900;cursor:pointer}
    .notification-admin-composer{margin:0 18px 14px;padding:14px;border:1px solid #d8e5f2;border-radius:14px;background:#f8fbff;display:none}
    .notification-admin-composer.is-open{display:block}
    .notification-admin-composer h3{margin:0 0 10px;font-size:.92rem;color:#082a54}
    .notification-admin-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .notification-admin-field{display:grid;gap:5px;font-size:.72rem;font-weight:850;color:#46617f}
    .notification-admin-field.full{grid-column:1/-1}
    .notification-admin-field input,.notification-admin-field select,.notification-admin-field textarea{width:100%;box-sizing:border-box;border:1px solid #c9d9e9;border-radius:10px;padding:9px 10px;background:#fff;color:#102b49;font:inherit;font-weight:700}
    .notification-admin-field textarea{min-height:82px;resize:vertical}
    .notification-admin-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px}
    .notification-admin-status{font-size:.72rem;color:#5b6f86;line-height:1.35}
    .notification-admin-send{border:0;border-radius:10px;padding:9px 13px;background:#0b5da8;color:#fff;font-weight:900;cursor:pointer;white-space:nowrap}
    .notification-admin-send:disabled{opacity:.55;cursor:wait}
    @media(max-width:640px){.notification-admin-grid{grid-template-columns:1fr}.notification-admin-field.full{grid-column:auto}.notification-admin-actions{align-items:stretch;flex-direction:column}.notification-admin-send{width:100%}}
  `;
  document.head.appendChild(style);
}

async function ensurePushApi() {
  if (window.LegaPush?.check) return window.LegaPush;
  try {
    await import(`./push-manager.js?v=${CENTER_VERSION}`);
  } catch (error) {
    console.warn('Push manager globale non disponibile:', error);
  }
  return window.LegaPush || null;
}

async function resolveProfile() {
  if (currentProfile) return currentProfile;
  const user = await resolveUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('id, team_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  currentProfile = data || null;
  return currentProfile;
}

async function refreshTriggerPushState() {
  const trigger = document.getElementById('attiva-notifiche-btn');
  if (!trigger) return;
  setNotificationButtonLabel(trigger, 'Notifiche');

  const api = await ensurePushApi();
  if (!api?.check) return;

  let badge = trigger.querySelector('.push-state-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'push-state-badge';
    badge.setAttribute('aria-hidden', 'true');
    trigger.appendChild(badge);
  }

  try {
    const state = await api.check({ autoRepair: false });
    const active = state.status === 'active';
    const repair = ['repair-needed', 'check-error'].includes(state.status);
    badge.textContent = active ? '✓' : '!';
    badge.style.cssText = `position:absolute;left:-5px;bottom:-5px;width:17px;height:17px;border-radius:999px;display:flex;align-items:center;justify-content:center;background:${active ? '#22c55e' : repair ? '#f59e0b' : '#ef4444'};color:#fff;border:2px solid #00264d;font-size:10px;font-weight:1000;line-height:1;z-index:3;pointer-events:none;`;
    trigger.style.setProperty('position', 'relative', 'important');
    trigger.style.setProperty('overflow', 'visible', 'important');
    trigger.dataset.pushStatus = state.status;
  } catch (error) {
    console.warn('Stato push pulsante non disponibile:', error);
  }
}

function adminScopeLabel(value) {
  if (value === 'conference') return 'Conference';
  if (value === 'team') return 'Squadra';
  return 'Tutta la lega';
}

async function loadAdminTeams() {
  if (adminTeams.length) return adminTeams;
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, conference')
    .order('name', { ascending: true });
  if (error) throw error;
  adminTeams = data || [];
  return adminTeams;
}

function fillAdminTargetSelect() {
  const scope = document.getElementById('notification-admin-scope')?.value || 'league';
  const wrap = document.getElementById('notification-admin-target-wrap');
  const select = document.getElementById('notification-admin-target');
  if (!wrap || !select) return;

  if (scope === 'league') {
    wrap.hidden = true;
    select.innerHTML = '';
    return;
  }

  wrap.hidden = false;
  const values = scope === 'conference'
    ? [...new Set(adminTeams.map(team => team.conference).filter(Boolean))].sort()
    : adminTeams;

  if (scope === 'conference') {
    select.innerHTML = values.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  } else {
    select.innerHTML = values.map(team => `<option value="${escapeHtml(team.id)}">${escapeHtml(team.name)}</option>`).join('');
  }
}

async function setupAdminComposer() {
  const entry = document.getElementById('notification-admin-entry');
  if (!entry || adminComposerReady) return;

  try {
    const profile = await resolveProfile();
    if (profile?.role !== 'admin') return;

    await loadAdminTeams();
    entry.classList.add('is-visible');
    adminComposerReady = true;
    fillAdminTargetSelect();
  } catch (error) {
    console.warn('Composer admin non disponibile:', error);
  }
}

async function sendAdminCommunication() {
  if (adminSendBusy) return;

  const scope = document.getElementById('notification-admin-scope')?.value || 'league';
  const target = document.getElementById('notification-admin-target')?.value || '';
  const title = document.getElementById('notification-admin-title')?.value.trim() || '';
  const message = document.getElementById('notification-admin-message')?.value.trim() || '';
  const url = document.getElementById('notification-admin-url')?.value || '';
  const status = document.getElementById('notification-admin-status');
  const sendButton = document.getElementById('notification-admin-send');

  if (!title || !message) {
    if (status) status.textContent = 'Titolo e messaggio sono obbligatori.';
    return;
  }

  adminSendBusy = true;
  if (sendButton) sendButton.disabled = true;
  if (status) status.textContent = 'Invio in corso…';

  try {
    const payload = {
      request_id: crypto.randomUUID(),
      scope,
      title,
      message,
      url: url || null,
      ...(scope === 'conference' ? { conference: target } : {}),
      ...(scope === 'team' ? { team_id: target } : {})
    };

    const { data, error } = await supabase.functions.invoke('send-admin-notification', { body: payload });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);

    if (status) status.textContent = `Inviata a ${data?.recipients ?? 0} account · push consegnate: ${data?.sent ?? 0}.`;
    const messageInput = document.getElementById('notification-admin-message');
    if (messageInput) messageInput.value = '';
    await loadNotifications();
  } catch (error) {
    console.error('Invio comunicazione admin fallito:', error);
    if (status) status.textContent = error?.message || 'Invio non riuscito.';
  } finally {
    adminSendBusy = false;
    if (sendButton) sendButton.disabled = false;
  }
}

function ensureUi() {
  const trigger = document.getElementById('attiva-notifiche-btn');
  if (!trigger) return null;

  setNotificationButtonLabel(trigger, 'Notifiche');
  trigger.classList.add('notification-center-trigger');
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-controls', 'notification-center-panel');
  trigger.setAttribute('aria-expanded', 'false');

  let countBadge = trigger.querySelector('.notification-count-badge');
  if (!countBadge) {
    countBadge = document.createElement('span');
    countBadge.className = 'notification-count-badge';
    countBadge.hidden = true;
    countBadge.setAttribute('aria-hidden', 'true');
    trigger.appendChild(countBadge);
  }

  if (!document.getElementById('notification-center-backdrop')) {
    document.body.insertAdjacentHTML('beforeend', `
      <div class="notification-center-backdrop" id="notification-center-backdrop" aria-hidden="true">
        <aside class="notification-center-panel" id="notification-center-panel" role="dialog" aria-modal="true" aria-labelledby="notification-center-title">
          <header class="notification-center-head">
            <div>
              <span class="notification-center-kicker">LEGA DEGLI EROI</span>
              <h2 id="notification-center-title">Notifiche</h2>
            </div>
            <button type="button" class="notification-center-close" id="notification-center-close" aria-label="Chiudi notifiche">×</button>
          </header>

          <div class="notification-center-toolbar">
            <div class="notification-center-filters" role="tablist" aria-label="Filtra notifiche">
              <button type="button" class="is-active" data-notification-filter="all" role="tab" aria-selected="true">Tutte</button>
              <button type="button" data-notification-filter="unread" role="tab" aria-selected="false">Non lette</button>
            </div>
            <button type="button" class="notification-mark-all" id="notification-mark-all">Segna tutte lette</button>
          </div>

          <div class="notification-admin-entry" id="notification-admin-entry">
            <button type="button" class="notification-admin-open" id="notification-admin-open">📢 Nuova comunicazione</button>
          </div>

          <section class="notification-admin-composer" id="notification-admin-composer" aria-label="Nuova comunicazione admin">
            <h3>Invia comunicazione</h3>
            <div class="notification-admin-grid">
              <label class="notification-admin-field">
                Destinatari
                <select id="notification-admin-scope">
                  <option value="league">Tutta la lega</option>
                  <option value="conference">Conference</option>
                  <option value="team">Singola squadra</option>
                </select>
              </label>
              <label class="notification-admin-field" id="notification-admin-target-wrap" hidden>
                Seleziona
                <select id="notification-admin-target"></select>
              </label>
              <label class="notification-admin-field full">
                Titolo
                <input id="notification-admin-title" maxlength="100" placeholder="Es. Orari waiver modificati">
              </label>
              <label class="notification-admin-field full">
                Messaggio
                <textarea id="notification-admin-message" maxlength="600" placeholder="Scrivi la comunicazione…"></textarea>
              </label>
              <label class="notification-admin-field full">
                Apri pagina al click
                <select id="notification-admin-url">
                  <option value="">Nessuna pagina specifica</option>
                  <option value="index.html">Home</option>
                  <option value="waiver.html">Waiver Wire</option>
                  <option value="trade-room.html">Trade Room</option>
                  <option value="classifica.html">Classifiche</option>
                  <option value="giornale.html">Giornale</option>
                  <option value="regolamento.html">Regolamento</option>
                  <option value="allstar.html">All Star</option>
                  <option value="crashoutcup.html">Crash Out Cup</option>
                </select>
              </label>
            </div>
            <div class="notification-admin-actions">
              <span class="notification-admin-status" id="notification-admin-status">La comunicazione arriverà nel Centro Notifiche e, se attive, anche via push.</span>
              <button type="button" class="notification-admin-send" id="notification-admin-send">Invia</button>
            </div>
          </section>

          <div class="notification-center-content">
            <div class="notification-center-loading" id="notification-center-loading">Caricamento notifiche…</div>
            <div class="notification-center-list" id="notification-center-list"></div>
            <div class="notification-center-empty" id="notification-center-empty" hidden>
              <span>🔔</span>
              <strong>Niente di nuovo</strong>
              <small>Per una volta la lega ha deciso di lasciarti in pace.</small>
            </div>
          </div>

          <footer class="notification-push-card" id="notification-push-card">
            <div class="notification-push-copy">
              <span class="notification-push-dot" id="notification-push-dot"></span>
              <div>
                <strong id="notification-push-title">Push</strong>
                <small id="notification-push-note">Controllo stato…</small>
              </div>
            </div>
            <button type="button" id="notification-push-action" hidden></button>
          </footer>
        </aside>
      </div>
    `);
  }

  const existingPanel = document.getElementById('notification-center-panel');
  if (existingPanel && !document.getElementById('notification-admin-entry')) {
    const content = existingPanel.querySelector('.notification-center-content');
    content?.insertAdjacentHTML('beforebegin', `
      <div class="notification-admin-entry" id="notification-admin-entry">
        <button type="button" class="notification-admin-open" id="notification-admin-open">📢 Nuova comunicazione</button>
      </div>
      <section class="notification-admin-composer" id="notification-admin-composer" aria-label="Nuova comunicazione admin">
        <h3>Invia comunicazione</h3>
        <div class="notification-admin-grid">
          <label class="notification-admin-field">Destinatari
            <select id="notification-admin-scope"><option value="league">Tutta la lega</option><option value="conference">Conference</option><option value="team">Singola squadra</option></select>
          </label>
          <label class="notification-admin-field" id="notification-admin-target-wrap" hidden>Seleziona<select id="notification-admin-target"></select></label>
          <label class="notification-admin-field full">Titolo<input id="notification-admin-title" maxlength="100" placeholder="Es. Orari waiver modificati"></label>
          <label class="notification-admin-field full">Messaggio<textarea id="notification-admin-message" maxlength="600" placeholder="Scrivi la comunicazione…"></textarea></label>
          <label class="notification-admin-field full">Apri pagina al click
            <select id="notification-admin-url">
              <option value="">Nessuna pagina specifica</option><option value="index.html">Home</option><option value="waiver.html">Waiver Wire</option><option value="trade-room.html">Trade Room</option><option value="classifica.html">Classifiche</option><option value="giornale.html">Giornale</option><option value="regolamento.html">Regolamento</option><option value="allstar.html">All Star</option><option value="crashoutcup.html">Crash Out Cup</option>
            </select>
          </label>
        </div>
        <div class="notification-admin-actions">
          <span class="notification-admin-status" id="notification-admin-status">La comunicazione arriverà nel Centro Notifiche e, se attive, anche via push.</span>
          <button type="button" class="notification-admin-send" id="notification-admin-send">Invia</button>
        </div>
      </section>
    `);
  }

  return trigger;
}

async function resolveUser() {
  if (currentUser) return currentUser;

  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;

  currentUser = data?.user || null;
  return currentUser;
}

function setBadgeCount(count) {
  const trigger = document.getElementById('attiva-notifiche-btn');
  const badge = trigger?.querySelector('.notification-count-badge');
  if (!badge) return;

  const safeCount = Number(count || 0);
  badge.hidden = safeCount <= 0;
  badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
  trigger?.classList.toggle('has-unread-notifications', safeCount > 0);

  const baseLabel = safeCount > 0
    ? `Centro notifiche, ${safeCount} non ${safeCount === 1 ? 'letta' : 'lette'}`
    : 'Centro notifiche';

  trigger?.setAttribute('aria-label', baseLabel);
}

async function refreshUnreadCount() {
  const user = await resolveUser();

  if (!user) {
    setBadgeCount(0);
    return 0;
  }

  const { count, error } = await supabase
    .from(NOTIFICATION_TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) {
    console.warn('Impossibile leggere il badge notifiche:', error);
    return 0;
  }

  setBadgeCount(count || 0);
  return count || 0;
}

function notificationRowHtml(row) {
  const unread = !row.read_at;
  const icon = notificationIcon(row.type);
  const time = formatRelativeTime(row.created_at);

  return `
    <button
      type="button"
      class="notification-row${unread ? ' is-unread' : ''}"
      data-notification-id="${escapeHtml(row.id)}"
      data-notification-url="${escapeHtml(row.url || '')}"
    >
      <span class="notification-row-icon">${icon}</span>
      <span class="notification-row-copy">
        <span class="notification-row-top">
          <strong>${escapeHtml(row.title)}</strong>
          <small>${escapeHtml(time)}</small>
        </span>
        <span class="notification-row-body">${escapeHtml(row.body || '')}</span>
      </span>
      ${unread ? '<span class="notification-unread-dot" aria-label="Non letta"></span>' : ''}
    </button>
  `;
}

async function loadNotifications() {
  const loading = document.getElementById('notification-center-loading');
  const list = document.getElementById('notification-center-list');
  const empty = document.getElementById('notification-center-empty');

  if (!list || !empty || !loading) return;

  loading.hidden = false;
  empty.hidden = true;
  list.innerHTML = '';

  try {
    const user = await resolveUser();

    if (!user) {
      loading.hidden = true;
      empty.hidden = false;
      empty.querySelector('strong').textContent = 'Accedi per vedere le notifiche';
      empty.querySelector('small').textContent = 'Il centro notifiche è legato al tuo account.';
      setBadgeCount(0);
      return;
    }

    let query = supabase
      .from(NOTIFICATION_TABLE)
      .select('id, user_id, team_id, type, title, body, url, read_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(60);

    if (currentFilter === 'unread') {
      query = query.is('read_at', null);
    }

    const { data, error } = await query;

    if (error) throw error;

    loading.hidden = true;
    const rows = data || [];

    if (!rows.length) {
      empty.hidden = false;
      empty.querySelector('strong').textContent = currentFilter === 'unread'
        ? 'Tutto letto'
        : 'Niente di nuovo';
      empty.querySelector('small').textContent = currentFilter === 'unread'
        ? 'Non ci sono notifiche da recuperare.'
        : 'Per una volta la lega ha deciso di lasciarti in pace.';
    } else {
      list.innerHTML = rows.map(notificationRowHtml).join('');
    }

    await Promise.all([refreshUnreadCount(), refreshTriggerPushState(), setupAdminComposer()]);
  } catch (error) {
    console.error('Errore centro notifiche:', error);
    loading.hidden = true;
    empty.hidden = false;

    if (String(error?.code || '') === '42P01') {
      empty.querySelector('strong').textContent = 'Centro notifiche da configurare';
      empty.querySelector('small').textContent = 'Esegui prima lo script SQL fornito su Supabase.';
    } else {
      empty.querySelector('strong').textContent = 'Impossibile caricare';
      empty.querySelector('small').textContent = 'Riprova tra poco.';
    }
  }
}

async function markNotificationRead(id) {
  if (!id) return;

  const user = await resolveUser();
  if (!user) return;

  const { error } = await supabase
    .from(NOTIFICATION_TABLE)
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('read_at', null);

  if (error) throw error;
}

async function markAllRead() {
  const user = await resolveUser();
  if (!user) return;

  const button = document.getElementById('notification-mark-all');
  if (button) button.disabled = true;

  try {
    const { error } = await supabase
      .from(NOTIFICATION_TABLE)
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null);

    if (error) throw error;

    await loadNotifications();
  } catch (error) {
    console.error('Errore segna tutte lette:', error);
  } finally {
    if (button) button.disabled = false;
  }
}

function pushStateCopy(status) {
  switch (status) {
    case 'active':
      return {
        className: 'is-active',
        title: 'Push attive',
        note: 'Questo dispositivo può ricevere notifiche.',
        action: 'Disattiva push'
      };
    case 'repair-needed':
    case 'check-error':
      return {
        className: 'needs-repair',
        title: 'Push da riparare',
        note: 'La registrazione del dispositivo non è sincronizzata.',
        action: 'Ripara'
      };
    case 'permission-denied':
      return {
        className: 'is-blocked',
        title: 'Push bloccate',
        note: 'Riabilitale dalle impostazioni del browser o del dispositivo.',
        action: ''
      };
    case 'unsupported':
      return {
        className: 'is-blocked',
        title: 'Push non supportate',
        note: 'Questo browser non supporta le notifiche push.',
        action: ''
      };
    case 'logged-out':
      return {
        className: 'is-off',
        title: 'Push non disponibili',
        note: 'Accedi per gestire le notifiche push.',
        action: ''
      };
    case 'permission-default':
    case 'local-missing':
    default:
      return {
        className: 'is-off',
        title: 'Push non attive',
        note: 'Attivale su questo dispositivo.',
        action: 'Attiva push'
      };
  }
}

async function refreshPushCard() {
  const card = document.getElementById('notification-push-card');
  const title = document.getElementById('notification-push-title');
  const note = document.getElementById('notification-push-note');
  const action = document.getElementById('notification-push-action');

  if (!card || !title || !note || !action) return;

  const pushApi = await ensurePushApi();

  if (!pushApi?.check) {
    card.className = 'notification-push-card is-off';
    title.textContent = 'Push';
    note.textContent = 'Stato push non disponibile.';
    action.hidden = true;
    return;
  }

  try {
    const state = await pushApi.check({ autoRepair: false });
    const copy = pushStateCopy(state.status);

    card.className = `notification-push-card ${copy.className}`;
    card.dataset.pushStatus = state.status;
    title.textContent = copy.title;
    note.textContent = copy.note;

    if (copy.action) {
      action.hidden = false;
      action.textContent = copy.action;
    } else {
      action.hidden = true;
      action.textContent = '';
    }
  } catch (error) {
    console.warn('Errore stato push nel centro notifiche:', error);
    card.className = 'notification-push-card needs-repair';
    card.dataset.pushStatus = 'check-error';
    title.textContent = 'Push da controllare';
    note.textContent = 'Non riesco a verificare lo stato in questo momento.';
    action.hidden = false;
    action.textContent = 'Riprova';
  }
}

async function handlePushAction() {
  const action = document.getElementById('notification-push-action');
  const card = document.getElementById('notification-push-card');
  const pushApi = window.LegaPush;

  if (!action || !card || !pushApi) return;

  action.disabled = true;

  try {
    const status = card.dataset.pushStatus;

    if (status === 'active') {
      await pushApi.disable?.();
    } else {
      await pushApi.enable?.();
    }

    await pushApi.refreshButton?.();
    await refreshPushCard();
  } catch (error) {
    console.error('Errore gestione push:', error);
  } finally {
    action.disabled = false;
  }
}

async function openPanel() {
  const backdrop = document.getElementById('notification-center-backdrop');
  const trigger = document.getElementById('attiva-notifiche-btn');
  if (!backdrop) return;

  panelOpen = true;
  backdrop.classList.add('is-open');
  backdrop.setAttribute('aria-hidden', 'false');
  trigger?.setAttribute('aria-expanded', 'true');
  document.body.classList.add('notification-center-open');

  await Promise.all([
    loadNotifications(),
    refreshPushCard(),
    setupAdminComposer(),
    refreshTriggerPushState()
  ]);

  document.getElementById('notification-center-close')?.focus();
}

function closePanel() {
  const backdrop = document.getElementById('notification-center-backdrop');
  const trigger = document.getElementById('attiva-notifiche-btn');
  if (!backdrop) return;

  panelOpen = false;
  backdrop.classList.remove('is-open');
  backdrop.setAttribute('aria-hidden', 'true');
  trigger?.setAttribute('aria-expanded', 'false');
  document.body.classList.remove('notification-center-open');
  trigger?.focus();
}

function bindUi() {
  const trigger = ensureUi();
  if (!trigger) return;

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    openPanel();
  }, { capture: true });

  document.getElementById('notification-center-close')?.addEventListener('click', closePanel);

  document.getElementById('notification-center-backdrop')?.addEventListener('click', (event) => {
    if (event.target?.id === 'notification-center-backdrop') {
      closePanel();
    }
  });

  document.getElementById('notification-mark-all')?.addEventListener('click', markAllRead);
  document.getElementById('notification-push-action')?.addEventListener('click', handlePushAction);

  document.getElementById('notification-admin-open')?.addEventListener('click', () => {
    document.getElementById('notification-admin-composer')?.classList.toggle('is-open');
  });

  document.getElementById('notification-admin-scope')?.addEventListener('change', fillAdminTargetSelect);
  document.getElementById('notification-admin-send')?.addEventListener('click', sendAdminCommunication);

  document.querySelectorAll('[data-notification-filter]').forEach((button) => {
    button.addEventListener('click', async () => {
      currentFilter = button.dataset.notificationFilter || 'all';

      document.querySelectorAll('[data-notification-filter]').forEach((item) => {
        const active = item === button;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-selected', active ? 'true' : 'false');
      });

      await loadNotifications();
    });
  });

  document.getElementById('notification-center-list')?.addEventListener('click', async (event) => {
    const row = event.target.closest('.notification-row');
    if (!row) return;

    const id = row.dataset.notificationId;
    const destination = safeDestination(row.dataset.notificationUrl);

    try {
      await markNotificationRead(id);
      row.classList.remove('is-unread');
      row.querySelector('.notification-unread-dot')?.remove();
      await refreshUnreadCount();
    } catch (error) {
      console.error('Errore lettura notifica:', error);
    }

    if (destination) {
      window.location.href = destination;
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panelOpen) {
      closePanel();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      refreshUnreadCount();
      if (panelOpen) loadNotifications();
    }
  });

  window.addEventListener('focus', () => {
    refreshUnreadCount();
  });
}

async function init() {
  injectCenter4Styles();
  bindUi();

  try {
    await Promise.all([
      refreshUnreadCount(),
      refreshTriggerPushState(),
      setupAdminComposer()
    ]);
  } catch (error) {
    console.warn('Centro notifiche iniziale non disponibile:', error);
  }

  refreshTimer = window.setInterval(() => {
    refreshUnreadCount();
    if (panelOpen) loadNotifications();
  }, REFRESH_MS);
}

window.addEventListener('beforeunload', () => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});

window.__LEGA_NOTIFICATION_CENTER_VERSION = CENTER_VERSION;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
