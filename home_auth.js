import { supabase, supabaseUrl, supabaseKey } from './supabase.js';

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

async function attivaNotifichePush() {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
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
      alert('Permesso notifiche negato.');
      return;
    }

    const registration = await navigator.serviceWorker.ready;
    const VAPID_PUBLIC_KEY = 'BLVVpSFZr0IUiuc4B-7eYQjFMnYvWlvHgxaaSyAo5LOvOD3wrypSJRDuVKMKucCpgMD8Sz9X7nTwFrYtCHsJWcc';

    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !sessionData?.session?.access_token) {
      alert('Sessione non valida. Fai di nuovo login.');
      return;
    }

    const response = await fetch(
      `${supabaseUrl}/functions/v1/save-push-subscription`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session.access_token}`,
          'apikey': supabaseKey
        },
        body: JSON.stringify({ subscription })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      alert(result?.error || 'Errore nel salvataggio notifiche.');
      return;
    }

    alert('Notifiche attivate con successo.');
    await aggiornaBottoneNotifiche();
  } catch (err) {
    console.error(err);
    alert('Errore durante l’attivazione delle notifiche.');
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

    await subscription.unsubscribe();
    alert('Notifiche disattivate.');
    await aggiornaBottoneNotifiche();
  } catch (err) {
    console.error(err);
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

async function aggiornaBottoneNotifiche() {
  const notifBtn = document.getElementById('attiva-notifiche-btn');
  if (!notifBtn) return;

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    notifBtn.style.display = 'none';
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      setButtonLabel(notifBtn, 'Disattiva notifiche');
      notifBtn.dataset.attive = 'true';
    } else {
      setButtonLabel(notifBtn, 'Attiva notifiche');
      notifBtn.dataset.attive = 'false';
    }
  } catch (err) {
    console.error(err);
    setButtonLabel(notifBtn, 'Attiva notifiche');
    notifBtn.dataset.attive = 'false';
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

  await aggiornaBottoneNotifiche();
  await aggiornaBadgeTrade();
});
