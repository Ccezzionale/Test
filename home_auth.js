import { supabase, supabaseUrl, supabaseKey } from './supabase.js';

const VAPID_PUBLIC_KEY = 'BLVVpSFZr0IUiuc4B-7eYQjFMnYvWlvHgxaaSyAo5LOvOD3wrypSJRDuVKMKucCpgMD8Sz9X7nTwFrYtCHsJWcc';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function setButtonLabel(button, label) {
  if (!button) return;

  const labelSpan = button.querySelector('.btn-label');

  if (labelSpan) {
    labelSpan.textContent = label;
  } else {
    button.textContent = label;
  }

  button.setAttribute('aria-label', label);
}

function setTradeBadgeLabel(button, label, count = 0) {
  if (!button) return;

  const labelSpan = button.querySelector('.btn-label');

  if (labelSpan) {
    labelSpan.textContent = label;
  } else {
    button.innerHTML = `
      <img src="icons/nav/trade-room.webp" class="action-icon" alt="">
      <span class="btn-label">${label}</span>
    `;
  }

  button.setAttribute('aria-label', count > 0 ? `${count} proposta trade` : 'Trade Room');
}

async function logoutUtente() {
  await supabase.auth.signOut();
  window.location.href = 'index.html';
}

async function getAccessToken() {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError || !sessionData?.session?.access_token) {
    throw new Error('Sessione non valida. Fai di nuovo login.');
  }

  return sessionData.session.access_token;
}

async function callPushSubscriptionApi(payload) {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `${supabaseUrl}/functions/v1/save-push-subscription`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'apikey': supabaseKey
      },
      body: JSON.stringify(payload)
    }
  );

  let result = null;

  try {
    result = await response.json();
  } catch (err) {
    result = {
      error: 'Risposta non valida dalla funzione notifiche.',
      details: String(err)
    };
  }

  if (!response.ok) {
    throw new Error(result?.error || 'Errore nella gestione delle notifiche.');
  }

  return result;
}

async function salvaPushSubscription(subscription) {
  return callPushSubscriptionApi({
    action: 'save',
    subscription
  });
}

async function leggiStatoPushSubscription(endpoint) {
  return callPushSubscriptionApi({
    action: 'status',
    endpoint
  });
}

async function disattivaPushSubscriptionServer(endpoint) {
  return callPushSubscriptionApi({
    action: 'disable',
    endpoint
  });
}

async function creaPushSubscription(registration) {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

async function rigeneraPushSubscription(registration, oldSubscription) {
  if (oldSubscription) {
    try {
      await oldSubscription.unsubscribe();
    } catch (err) {
      console.warn('Impossibile rimuovere la vecchia subscription:', err);
    }
  }

  const newSubscription = await creaPushSubscription(registration);
  await salvaPushSubscription(newSubscription);

  return newSubscription;
}

/**
 * Controlla lo stato reale delle push.
 *
 * Stati principali:
 * - active: subscription locale e server attivi
 * - repair-needed: subscription locale presente ma server inattivo
 * - local-missing: nessuna subscription nel browser
 * - permission-default / permission-denied
 *
 * Se autoRepair=true, una subscription locale marcata inattiva sul server
 * viene rigenerata automaticamente. Non viene invece creata una subscription
 * dal nulla: così una disattivazione volontaria dell'utente resta rispettata.
 */
async function controllaStatoNotifiche({ autoRepair = false } = {}) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { status: 'unsupported', subscription: null };
  }

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return { status: 'logged-out', subscription: null };
  }

  if (Notification.permission === 'denied') {
    return { status: 'permission-denied', subscription: null };
  }

  if (Notification.permission !== 'granted') {
    return { status: 'permission-default', subscription: null };
  }

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    return { status: 'local-missing', subscription: null };
  }

  try {
    const serverStatus = await leggiStatoPushSubscription(subscription.endpoint);

    // La subscription esiste nel browser ma non ancora sul server:
    // basta salvarla, senza rigenerarla.
    if (!serverStatus?.found) {
      await salvaPushSubscription(subscription);
      return {
        status: 'active',
        subscription,
        repaired: true,
        repairType: 'registered'
      };
    }

    if (serverStatus?.is_active === true) {
      return { status: 'active', subscription };
    }

    // Se il browser ha ancora la subscription ma il server l'ha disattivata
    // (tipicamente dopo un 404/410 del provider), proviamo a rigenerarla.
    if (autoRepair) {
      try {
        const newSubscription = await rigeneraPushSubscription(registration, subscription);

        return {
          status: 'active',
          subscription: newSubscription,
          repaired: true,
          repairType: 'regenerated'
        };
      } catch (repairError) {
        console.warn('Riparazione automatica push non riuscita:', repairError);
      }
    }

    return {
      status: 'repair-needed',
      subscription,
      serverStatus
    };
  } catch (err) {
    console.warn('Impossibile verificare lo stato server delle notifiche:', err);

    return {
      status: 'check-error',
      subscription,
      error: err
    };
  }
}

async function attivaNotifichePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      alert('Questo dispositivo non supporta le notifiche push.');
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      alert('Utente non loggato.');
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== 'granted') {
      alert(
        permission === 'denied'
          ? 'Le notifiche sono bloccate nelle impostazioni del browser/dispositivo.'
          : 'Permesso notifiche non concesso.'
      );
      await aggiornaBottoneNotifiche();
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await creaPushSubscription(registration);
      await salvaPushSubscription(subscription);
    } else {
      // Se esiste già localmente, controlliamo se il server la considera valida.
      let serverStatus = null;

      try {
        serverStatus = await leggiStatoPushSubscription(subscription.endpoint);
      } catch (err) {
        console.warn('Controllo stato server non riuscito, provo comunque a sincronizzare:', err);
      }

      if (serverStatus?.found && serverStatus?.is_active === false) {
        subscription = await rigeneraPushSubscription(registration, subscription);
      } else {
        // Se è attiva o non risulta ancora registrata, la sincronizziamo.
        await salvaPushSubscription(subscription);
      }
    }

    alert('Notifiche attivate con successo.');
    await aggiornaBottoneNotifiche();
  } catch (err) {
    console.error('Errore attivazione notifiche:', err);
    alert(err?.message || 'Errore durante l’attivazione delle notifiche.');
    await aggiornaBottoneNotifiche();
  }
}

async function disattivaNotifichePush() {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      await aggiornaBottoneNotifiche();
      return;
    }

    // Prima segniamo l'endpoint come inattivo sul server.
    // Se questa chiamata fallisce, procediamo comunque con l'unsubscribe locale:
    // al prossimo tentativo di invio il server eliminerà comunque l'endpoint morto.
    try {
      await disattivaPushSubscriptionServer(subscription.endpoint);
    } catch (serverError) {
      console.warn('Disattivazione server non riuscita:', serverError);
    }

    await subscription.unsubscribe();

    alert('Notifiche disattivate.');
    await aggiornaBottoneNotifiche();
  } catch (err) {
    console.error('Errore disattivazione notifiche:', err);
    alert('Errore durante la disattivazione delle notifiche.');
  }
}

async function aggiornaBadgeTrade() {
  const badge = document.getElementById('trade-badge');
  if (!badge) return;

  try {
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      badge.style.display = 'none';
      return;
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('team_id')
      .eq('email', user.email)
      .maybeSingle();

    if (profileError || !profile?.team_id) {
      console.error(profileError);
      badge.style.display = 'none';
      return;
    }

    const { count, error: countError } = await supabase
      .from('trade_proposals')
      .select('*', { count: 'exact', head: true })
      .eq('to_team', profile.team_id)
      .eq('status', 'pending');

    if (countError) {
      console.error(countError);
      badge.style.display = 'none';
      return;
    }

    badge.style.display = 'inline-flex';

    if (count && count > 0) {
      setTradeBadgeLabel(
        badge,
        `${count} proposta${count > 1 ? 'e' : ''} trade`,
        count
      );
      badge.classList.add('has-trades');
    } else {
      setTradeBadgeLabel(badge, 'Trade Room', 0);
      badge.classList.remove('has-trades');
    }

  } catch (err) {
    console.error(err);
    badge.style.display = 'none';
  }
}

function getNotificationStateBadge(notifBtn) {
  let badge = notifBtn.querySelector('.push-state-badge');

  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'push-state-badge';
    badge.setAttribute('aria-hidden', 'true');
    notifBtn.appendChild(badge);
  }

  return badge;
}

function applicaAspettoBottoneNotifiche(notifBtn, {
  background,
  borderColor,
  badgeBackground,
  badgeText,
  title
}) {
  const badge = getNotificationStateBadge(notifBtn);

  // Il navbar.css usa !important sul bottone notifiche.
  // Usiamo inline !important per far vedere davvero lo stato corrente.
  notifBtn.style.setProperty('position', 'relative', 'important');
  notifBtn.style.setProperty('overflow', 'visible', 'important');
  notifBtn.style.setProperty('background', background, 'important');
  notifBtn.style.setProperty('border-color', borderColor, 'important');
  notifBtn.style.setProperty(
    'box-shadow',
    `inset 0 1px 0 rgba(255,255,255,.10), 0 0 0 2px ${badgeBackground}22`,
    'important'
  );

  badge.textContent = badgeText;
  badge.style.cssText = `
    position:absolute;
    top:-5px;
    right:-5px;
    width:17px;
    height:17px;
    border-radius:999px;
    display:flex;
    align-items:center;
    justify-content:center;
    background:${badgeBackground};
    color:#fff;
    border:2px solid #00264d;
    box-shadow:0 2px 7px rgba(0,0,0,.28);
    font-size:10px;
    font-weight:1000;
    line-height:1;
    z-index:3;
    pointer-events:none;
  `;

  notifBtn.title = title;
}

function applicaStatoBottoneNotifiche(notifBtn, state) {
  notifBtn.dataset.attive = 'false';
  notifBtn.dataset.pushStatus = state.status;

  switch (state.status) {
    case 'active':
      setButtonLabel(notifBtn, 'Disattiva notifiche');
      notifBtn.dataset.attive = 'true';
      notifBtn.classList.remove('warning');

      applicaAspettoBottoneNotifiche(notifBtn, {
        background: 'rgba(34,197,94,.22)',
        borderColor: 'rgba(74,222,128,.58)',
        badgeBackground: '#22c55e',
        badgeText: '✓',
        title: 'Notifiche push attive'
      });
      break;

    case 'repair-needed':
    case 'check-error':
      setButtonLabel(notifBtn, 'Ripara notifiche');
      notifBtn.classList.add('warning');

      applicaAspettoBottoneNotifiche(notifBtn, {
        background: 'rgba(245,158,11,.24)',
        borderColor: 'rgba(251,191,36,.62)',
        badgeBackground: '#f59e0b',
        badgeText: '!',
        title: 'Le notifiche richiedono una riparazione'
      });
      break;

    case 'permission-denied':
      setButtonLabel(notifBtn, 'Notifiche bloccate');
      notifBtn.classList.add('warning');

      applicaAspettoBottoneNotifiche(notifBtn, {
        background: 'rgba(239,68,68,.24)',
        borderColor: 'rgba(248,113,113,.62)',
        badgeBackground: '#ef4444',
        badgeText: '!',
        title: 'Notifiche bloccate dal browser o dal dispositivo'
      });
      break;

    case 'permission-default':
    case 'local-missing':
    case 'logged-out':
    default:
      setButtonLabel(notifBtn, 'Attiva notifiche');
      notifBtn.classList.add('warning');

      applicaAspettoBottoneNotifiche(notifBtn, {
        background: 'rgba(239,68,68,.20)',
        borderColor: 'rgba(248,113,113,.55)',
        badgeBackground: '#ef4444',
        badgeText: '!',
        title: 'Notifiche push non attive'
      });
      break;
  }
}

async function aggiornaBottoneNotifiche() {
  const notifBtn = document.getElementById('attiva-notifiche-btn');
  if (!notifBtn) return;

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    notifBtn.style.display = 'none';
    return;
  }

  try {
    const state = await controllaStatoNotifiche({ autoRepair: false });
    applicaStatoBottoneNotifiche(notifBtn, state);
  } catch (err) {
    console.error('Errore controllo stato notifiche:', err);

    setButtonLabel(notifBtn, 'Ripara notifiche');
    notifBtn.dataset.attive = 'false';
    notifBtn.dataset.pushStatus = 'check-error';
    notifBtn.classList.add('warning');

    applicaAspettoBottoneNotifiche(notifBtn, {
      background: 'rgba(245,158,11,.24)',
      borderColor: 'rgba(251,191,36,.62)',
      badgeBackground: '#f59e0b',
      badgeText: '!',
      title: 'Le notifiche richiedono una riparazione'
    });
  }
}

async function sincronizzaNotifichePush() {
  try {
    // Non chiediamo mai il permesso automaticamente.
    // Se è già concesso e c'è ancora una subscription locale, controlliamo
    // che il server la consideri attiva e la ripariamo quando possibile.
    if (!('Notification' in window) || Notification.permission !== 'granted') {
      return;
    }

    const state = await controllaStatoNotifiche({ autoRepair: true });

    if (state.repaired) {
      console.log('✅ Push sincronizzate automaticamente:', state.repairType);
    }
  } catch (err) {
    // Una mancata sincronizzazione push non deve mai bloccare la home.
    console.warn('Sincronizzazione automatica notifiche non riuscita:', err);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  const logoutBtn = document.getElementById('logout-btn');

  if (logoutBtn) {
    logoutBtn.addEventListener('click', logoutUtente);
  }

  const notifBtn = document.getElementById('attiva-notifiche-btn');

  if (notifBtn) {
    notifBtn.addEventListener('click', async () => {
      if (notifBtn.dataset.attive === 'true') {
        await disattivaNotifichePush();
      } else {
        await attivaNotifichePush();
      }
    });
  }

  await sincronizzaNotifichePush();
  await aggiornaBottoneNotifiche();
  await aggiornaBadgeTrade();
});
