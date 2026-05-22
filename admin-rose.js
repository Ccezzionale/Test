import { supabase } from './supabase.js';

let teams = [];
let players = [];
let selectedPlayer = null;
let currentFilter = 'all';

const $ = (id) => document.getElementById(id);

const els = {
  guard: $('admin-guard'),
  app: $('admin-app'),
  loginBtn: $('login-btn'),
  logoutBtn: $('logout-btn'),
  search: $('player-search'),
  list: $('players-list'),
  refreshBtn: $('refresh-btn'),
  selectedHint: $('selected-hint'),
  selectedPill: $('selected-pill'),
  form: $('player-form'),
  playerId: $('player-id'),
  playerName: $('player-name'),
  playerRole: $('player-role'),
  playerRoleMantra: $('player-role-mantra'),
  playerSerieA: $('player-serie-a'),
  playerQuotation: $('player-quotation'),
  ownerTeam: $('owner-team'),
  isFp: $('is-fp'),
  isFpKeeper: $('is-fp-keeper'),
  fpKeeperYear: $('fp-keeper-year'),
  isU21Slot: $('is-u21-slot'),
  isU21Keeper: $('is-u21-keeper'),
  u21KeeperYear: $('u21-keeper-year'),
  isRfaMatched: $('is-rfa-matched'),
  isTop6Protected: $('is-top6-protected'),
  removeBtn: $('remove-player-btn'),
  createForm: $('create-player-form'),
  newOwnerTeam: $('new-owner-team'),
  toast: $('toast')
};

function showToast(message, type = 'ok') {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.className = `toast show ${type}`;
  window.setTimeout(() => {
    els.toast.className = 'toast';
  }, 3200);
}

function setGuard(message, detail = '') {
  if (!els.guard) return;
  els.guard.innerHTML = `<strong>${message}</strong>${detail ? `<span>${detail}</span>` : ''}`;
}

function teamNameById(teamId) {
  if (!teamId) return 'Svincolato';
  return teams.find(t => t.id === teamId)?.name || 'Squadra non trovata';
}

function hasBadge(p) {
  return !!(
    p.is_fp ||
    p.is_fp_keeper ||
    p.is_u21_slot ||
    p.is_u21_keeper ||
    p.is_rfa_matched ||
    p.is_top6_protected
  );
}

function roleLabel(p) {
  return p.role_mantra || p.role || 'N/D';
}

async function checkAdmin() {
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData?.user) {
    els.loginBtn && (els.loginBtn.style.display = 'inline-flex');
    els.logoutBtn && (els.logoutBtn.style.display = 'none');
    setGuard('Accesso richiesto', 'Effettua il login per usare il pannello admin.');
    return false;
  }

  els.loginBtn && (els.loginBtn.style.display = 'none');
  els.logoutBtn && (els.logoutBtn.style.display = 'inline-flex');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', authData.user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    setGuard('Accesso negato', 'Questo pannello è riservato agli admin.');
    return false;
  }

  return true;
}

async function loadTeams() {
  const { data, error } = await supabase
    .from('teams')
    .select('id, name, conference')
    .order('name', { ascending: true });

  if (error) throw error;
  teams = data || [];
  fillTeamSelects();
}

async function loadPlayers() {
  const { data, error } = await supabase
    .from('players')
    .select(`
      id,
      name,
      role,
      role_mantra,
      serie_a_team,
      quotation,
      status,
      owner_team_id,
      is_fp,
      is_fp_keeper,
      fp_keeper_year,
      is_u21,
      is_u21_slot,
      is_u21_keeper,
      u21_keeper_year,
      is_rfa_matched,
      is_top6_protected,
      top6_protected_team_id
    `)
    .eq('status', 'active')
    .order('name', { ascending: true });

  if (error) throw error;
  players = data || [];
  renderPlayers();
}

function fillTeamSelects() {
  const options = [
    '<option value="">Svincolato / nessuna squadra</option>',
    ...teams.map(team => `<option value="${team.id}">${team.name} · ${team.conference || 'N/A'}</option>`)
  ].join('');

  if (els.ownerTeam) els.ownerTeam.innerHTML = options;
  if (els.newOwnerTeam) els.newOwnerTeam.innerHTML = options;
}

function getFilteredPlayers() {
  const term = (els.search?.value || '').trim().toLowerCase();

  return players.filter(p => {
    const haystack = [
      p.name,
      p.role,
      p.role_mantra,
      p.serie_a_team,
      teamNameById(p.owner_team_id)
    ].join(' ').toLowerCase();

    const matchesTerm = !term || haystack.includes(term);
    const matchesFilter =
      currentFilter === 'all' ||
      (currentFilter === 'owned' && !!p.owner_team_id) ||
      (currentFilter === 'free' && !p.owner_team_id) ||
      (currentFilter === 'badges' && hasBadge(p));

    return matchesTerm && matchesFilter;
  }).slice(0, 140);
}

function renderPlayers() {
  if (!els.list) return;

  const filtered = getFilteredPlayers();

  if (!filtered.length) {
    els.list.innerHTML = '<div class="empty-list">Nessun giocatore trovato.</div>';
    return;
  }

  els.list.innerHTML = filtered.map(p => {
    const selected = selectedPlayer?.id === p.id ? 'is-selected' : '';
    const owner = teamNameById(p.owner_team_id);
    const badgeCount = [p.is_fp, p.is_fp_keeper, p.is_u21_slot, p.is_u21_keeper, p.is_rfa_matched, p.is_top6_protected].filter(Boolean).length;

    return `
      <button type="button" class="player-row ${selected}" data-player-id="${p.id}">
        <span class="player-main">
          <strong>${p.name || 'Senza nome'}</strong>
          <small>${roleLabel(p)} · ${p.serie_a_team || 'N/D'} · ${owner}</small>
        </span>
        <span class="badge-count">${badgeCount ? `${badgeCount} badge` : 'no badge'}</span>
      </button>
    `;
  }).join('');

  els.list.querySelectorAll('.player-row').forEach(row => {
    row.addEventListener('click', () => {
      const player = players.find(p => p.id === row.dataset.playerId);
      if (player) selectPlayer(player);
    });
  });
}

function selectPlayer(player) {
  selectedPlayer = player;
  els.form?.classList.remove('is-disabled');

  els.selectedHint.textContent = `${player.name} · ${roleLabel(player)} · ${player.serie_a_team || 'N/D'}`;
  els.selectedPill.textContent = teamNameById(player.owner_team_id);

  els.playerId.value = player.id;
  els.playerName.value = player.name || '';
  els.playerRole.value = player.role || '';
  els.playerRoleMantra.value = player.role_mantra || '';
  els.playerSerieA.value = player.serie_a_team || '';
  els.playerQuotation.value = player.quotation ?? '';
  els.ownerTeam.value = player.owner_team_id || '';

  els.isFp.checked = !!player.is_fp;
  els.isFpKeeper.checked = !!player.is_fp_keeper;
  els.fpKeeperYear.value = player.fp_keeper_year ?? '';
  els.isU21Slot.checked = !!player.is_u21_slot;
  els.isU21Keeper.checked = !!player.is_u21_keeper;
  els.u21KeeperYear.value = player.u21_keeper_year ?? '';
  els.isRfaMatched.checked = !!player.is_rfa_matched;
  els.isTop6Protected.checked = !!player.is_top6_protected;

  renderPlayers();
}

function normalizeYear(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function saveSelectedPlayer(event) {
  event.preventDefault();

  if (!selectedPlayer) {
    showToast('Seleziona prima un giocatore.', 'warn');
    return;
  }

  const ownerTeamId = els.ownerTeam.value || null;

  const { error } = await supabase.rpc('admin_update_player_roster', {
    p_player_id: selectedPlayer.id,
    p_owner_team_id: ownerTeamId,
    p_is_fp: els.isFp.checked,
    p_is_fp_keeper: els.isFpKeeper.checked,
    p_fp_keeper_year: normalizeYear(els.fpKeeperYear.value),
    p_is_u21_slot: els.isU21Slot.checked,
    p_is_u21_keeper: els.isU21Keeper.checked,
    p_u21_keeper_year: normalizeYear(els.u21KeeperYear.value),
    p_is_rfa_matched: els.isRfaMatched.checked,
    p_is_top6_protected: els.isTop6Protected.checked
  });

  if (error) {
    console.error(error);
    showToast(`Errore salvataggio: ${error.message}`, 'error');
    return;
  }

  showToast('Modifiche salvate. Rosa aggiornata.', 'ok');
  await loadPlayers();
  const fresh = players.find(p => p.id === selectedPlayer.id);
  if (fresh) selectPlayer(fresh);
}

async function removeSelectedPlayer() {
  if (!selectedPlayer) {
    showToast('Seleziona prima un giocatore.', 'warn');
    return;
  }

  const ok = window.confirm(`Rimuovere ${selectedPlayer.name} dalla rosa? Rimarrà attivo ma svincolato.`);
  if (!ok) return;

  const { error } = await supabase.rpc('admin_remove_player_from_roster', {
    p_player_id: selectedPlayer.id
  });

  if (error) {
    console.error(error);
    showToast(`Errore rimozione: ${error.message}`, 'error');
    return;
  }

  showToast('Giocatore rimosso dalla rosa.', 'ok');
  await loadPlayers();
  const fresh = players.find(p => p.id === selectedPlayer.id);
  if (fresh) selectPlayer(fresh);
}

async function createPlayer(event) {
  event.preventDefault();

  const name = $('new-name')?.value?.trim();
  if (!name) {
    showToast('Inserisci il nome del giocatore.', 'warn');
    return;
  }

  const quotationRaw = $('new-quotation')?.value;
  const quotation = quotationRaw === '' ? null : Number(quotationRaw);

  const { data, error } = await supabase.rpc('admin_create_player', {
    p_name: name,
    p_role: $('new-role')?.value?.trim() || null,
    p_role_mantra: $('new-role-mantra')?.value?.trim() || null,
    p_serie_a_team: $('new-serie-a')?.value?.trim() || null,
    p_quotation: Number.isFinite(quotation) ? quotation : null,
    p_owner_team_id: els.newOwnerTeam?.value || null
  });

  if (error) {
    console.error(error);
    showToast(`Errore creazione: ${error.message}`, 'error');
    return;
  }

  showToast('Giocatore creato.', 'ok');
  els.createForm.reset();
  await loadPlayers();

  const createdId = Array.isArray(data) ? data[0]?.id : data;
  const fresh = players.find(p => p.id === createdId || p.name === name);
  if (fresh) selectPlayer(fresh);
}

async function refreshAll() {
  try {
    setGuard('Aggiornamento dati...', 'Sto caricando squadre e giocatori.');
    await loadTeams();
    await loadPlayers();
    els.guard.style.display = 'none';
    els.app.style.display = 'grid';
  } catch (error) {
    console.error(error);
    setGuard('Errore caricamento dati', error.message || 'Controlla console e permessi Supabase.');
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  els.form?.addEventListener('submit', saveSelectedPlayer);
  els.removeBtn?.addEventListener('click', removeSelectedPlayer);
  els.createForm?.addEventListener('submit', createPlayer);
  els.refreshBtn?.addEventListener('click', refreshAll);
  els.search?.addEventListener('input', renderPlayers);

  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter || 'all';
      renderPlayers();
    });
  });

  els.logoutBtn?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = 'login.html';
  });

  const ok = await checkAdmin();
  if (ok) await refreshAll();
});
