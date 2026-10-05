import { supabase } from './supabase.js';

const NOTIFICATION_TABLE = 'app_notifications';
const REFRESH_MS = 45000;

let currentUser = null;
let currentFilter = 'all';
let refreshTimer = null;
let panelOpen = false;

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

function ensureUi() {
  const trigger = document.getElementById('attiva-notifiche-btn');
  if (!trigger) return null;

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

    await refreshUnreadCount();
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

  const pushApi = window.LegaPush;

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
    refreshPushCard()
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

  trigger.addEventListener('click', openPanel);

  document.getElementById('notification-center-close')?.addEventListener('click', closePanel);

  document.getElementById('notification-center-backdrop')?.addEventListener('click', (event) => {
    if (event.target?.id === 'notification-center-backdrop') {
      closePanel();
    }
  });

  document.getElementById('notification-mark-all')?.addEventListener('click', markAllRead);
  document.getElementById('notification-push-action')?.addEventListener('click', handlePushAction);

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
  bindUi();

  try {
    await refreshUnreadCount();
  } catch (error) {
    console.warn('Badge notifiche non disponibile:', error);
  }

  refreshTimer = window.setInterval(() => {
    refreshUnreadCount();
    if (panelOpen) loadNotifications();
  }, REFRESH_MS);
}

window.addEventListener('beforeunload', () => {
  if (refreshTimer) window.clearInterval(refreshTimer);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
