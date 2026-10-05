import { supabase, supabaseUrl, supabaseKey } from './supabase.js';

const VAPID_PUBLIC_KEY = 'BLVVpSFZr0IUiuc4B-7eYQjFMnYvWlvHgxaaSyAo5LOvOD3wrypSJRDuVKMKucCpgMD8Sz9X7nTwFrYtCHsJWcc';

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data?.session?.access_token) throw new Error('Sessione non valida. Fai di nuovo login.');
  return data.session.access_token;
}

async function callApi(payload) {
  const accessToken = await getAccessToken();
  const response = await fetch(`${supabaseUrl}/functions/v1/save-push-subscription`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'apikey': supabaseKey
    },
    body: JSON.stringify(payload)
  });

  let result = null;
  try { result = await response.json(); } catch { result = null; }
  if (!response.ok) throw new Error(result?.error || 'Errore nella gestione delle notifiche.');
  return result;
}

async function createSubscription(registration) {
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  });
}

async function regenerateSubscription(registration, oldSubscription) {
  if (oldSubscription) {
    try { await oldSubscription.unsubscribe(); } catch (error) { console.warn('Unsubscribe precedente non riuscito:', error); }
  }
  const subscription = await createSubscription(registration);
  await callApi({ action: 'save', subscription });
  return subscription;
}

async function check({ autoRepair = false } = {}) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return { status: 'unsupported', subscription: null };
  }

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { status: 'logged-out', subscription: null };
  if (Notification.permission === 'denied') return { status: 'permission-denied', subscription: null };
  if (Notification.permission !== 'granted') return { status: 'permission-default', subscription: null };

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return { status: 'local-missing', subscription: null };

  try {
    const serverStatus = await callApi({ action: 'status', endpoint: subscription.endpoint });
    if (!serverStatus?.found) {
      await callApi({ action: 'save', subscription });
      return { status: 'active', subscription, repaired: true, repairType: 'registered' };
    }
    if (serverStatus?.is_active === true) return { status: 'active', subscription };
    if (autoRepair) {
      try {
        const newSubscription = await regenerateSubscription(registration, subscription);
        return { status: 'active', subscription: newSubscription, repaired: true, repairType: 'regenerated' };
      } catch (repairError) {
        console.warn('Riparazione push non riuscita:', repairError);
      }
    }
    return { status: 'repair-needed', subscription, serverStatus };
  } catch (error) {
    return { status: 'check-error', subscription, error };
  }
}

async function enable() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    alert('Questo dispositivo non supporta le notifiche push.');
    return;
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) { alert('Utente non loggato.'); return; }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    alert(permission === 'denied'
      ? 'Le notifiche sono bloccate nelle impostazioni del browser/dispositivo.'
      : 'Permesso notifiche non concesso.');
    return;
  }

  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await createSubscription(registration);
    await callApi({ action: 'save', subscription });
  } else {
    let serverStatus = null;
    try { serverStatus = await callApi({ action: 'status', endpoint: subscription.endpoint }); } catch {}
    if (serverStatus?.found && serverStatus?.is_active === false) {
      subscription = await regenerateSubscription(registration, subscription);
    } else {
      await callApi({ action: 'save', subscription });
    }
  }

  alert('Notifiche attivate con successo.');
}

async function disable() {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  try { await callApi({ action: 'disable', endpoint: subscription.endpoint }); } catch (error) {
    console.warn('Disattivazione server non riuscita:', error);
  }
  await subscription.unsubscribe();
  alert('Notifiche disattivate.');
}

async function sync() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  try { await check({ autoRepair: true }); } catch (error) { console.warn('Sync push non riuscita:', error); }
}

const api = { enable, disable, check, sync, refreshButton: async () => {} };
if (!window.LegaPush) window.LegaPush = api;

export { enable, disable, check, sync };
