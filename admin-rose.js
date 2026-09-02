import { supabase } from './supabase.js';

let teams = [];
let players = [];
let injuryReserveRows = [];
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
  irSlotPill: $('ir-admin-slot-pill'),
  irStatus: $('ir-admin-status'),
  activateIrBtn: $('activate-ir-btn'),
  revokeIrBtn: $('revoke-ir-btn'),
  reinstateIrBtn: $('reinstate-ir-btn'),
  cutIrBtn: $('cut-ir-btn'),
  activateIrDialog: $('ir-activate-dialog'),
  activateIrForm: $('ir-activate-form'),
  activateIrPlayer: $('ir-activate-player'),
  irActivatedOn: $('ir-activated-on'),
  irMedicalSource: $('ir-medical-source'),
  irMedicalNote: $('ir-medical-note'),
  irPrognosisConfirm: $('ir-prognosis-confirm'),
  reinstateIrDialog: $('ir-reinstate-dialog'),
  reinstateIrForm: $('ir-reinstate-form'),
  reinstateIrPlayer: $('ir-reinstate-player'),
  irCutPlayerSelect: $('ir-cut-player-select'),
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

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function localDateValue(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function seasonKeyForDate(value = localDateValue()) {
  const date = new Date(`${value}T00:00:00`);
  const year = date.getFullYear();
  return date.getMonth() >= 6
    ? `${year}-${String(year + 1).slice(-2)}`
    : `${year - 1}-${String(year).slice(-2)}`;
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`));
}

function getIrDay(record) {
  if (!record?.activated_on) return 0;
  const start = new Date(`${record.activated_on}T00:00:00`);
  const today = new Date(`${localDateValue()}T00:00:00`);
  return Math.max(1, Math.floor((today - start) / 86400000) + 1);
}

function getIrPhase(record) {
  if (!record || record.status !== 'active') {
    const labels = {
      offered: 'In attesa della squadra',
      reinstated: 'Reintegrato',
      cut: 'Tagliato',
      auto_cut: 'Taglio automatico'
    };
    return { label: labels[record?.status] || 'Conclusa', className: 'ir-phase-closed' };
  }

  const day = getIrDay(record);
  if (day <= 60) return { label: 'Protetto', className: 'ir-phase-protected' };
  if (day <= 90) return { label: 'Scelta disponibile', className: 'ir-phase-flexible' };
  return { label: 'Decisione obbligatoria', className: 'ir-phase-final' };
}

function getCurrentSeasonIrForTeam(teamId) {
  if (!teamId) return null;
  const season = seasonKeyForDate();
  return injuryReserveRows.find(row =>
    String(row.team_id) === String(teamId) && row.season_key === season
  ) || null;
}

function getActiveIrByPlayerId(playerId) {
  return injuryReserveRows.find(row =>
    ['offered', 'active'].includes(row.status) && String(row.player_id) === String(playerId)
  ) || null;
}

function renderIrPanel() {
  if (!els.irStatus || !els.irSlotPill) return;

  const ownerTeamId = selectedPlayer?.owner_team_id || null;
  const record = getCurrentSeasonIrForTeam(ownerTeamId);
  const activePlayerIr = selectedPlayer ? getActiveIrByPlayerId(selectedPlayer.id) : null;

  els.activateIrBtn.disabled = true;
  els.revokeIrBtn.hidden = true;
  els.reinstateIrBtn.hidden = true;
  els.cutIrBtn.hidden = true;
  els.irSlotPill.className = 'ir-admin-slot-pill';
  if (els.ownerTeam) els.ownerTeam.disabled = !!activePlayerIr;
  if (els.removeBtn) els.removeBtn.disabled = !!activePlayerIr;

  if (!selectedPlayer || !ownerTeamId) {
    els.irSlotPill.textContent = 'Non disponibile';
    els.irStatus.textContent = 'Seleziona un calciatore appartenente a una squadra.';
    return;
  }

  if (!record) {
    els.irSlotPill.textContent = '0/1 disponibile';
    els.irSlotPill.classList.add('available');
    els.irStatus.innerHTML = `
      <strong>Slot disponibile per ${escapeHtml(teamNameById(ownerTeamId))}</strong><br>
      Puoi concedere l’Injury Reserve per <strong>${escapeHtml(selectedPlayer.name)}</strong> dopo aver verificato la prognosi minima di 3 mesi.
      Lo slot verrà consumato soltanto se la squadra salverà la relativa chiamata nel waiver.
    `;
    els.activateIrBtn.disabled = false;
    return;
  }

  if (record.status === 'offered') {
    els.irSlotPill.textContent = '0/1 da confermare';
    els.irSlotPill.classList.add('available');
    els.irStatus.innerHTML = `
      <div class="ir-admin-status-card">
        <div>
          <strong>${escapeHtml(record.player_name)}</strong>
          <span>${escapeHtml(teamNameById(record.team_id))} · stagione ${escapeHtml(record.season_key)}</span>
          <small>Disponibilità concessa il ${formatDate(record.offered_on || record.created_at)}</small>
          <small>Lo slot non è ancora consumato e il conteggio dei 104 giorni non è iniziato.</small>
        </div>
        <span class="ir-phase-badge ir-phase-flexible">In attesa della squadra</span>
      </div>
    `;
    els.revokeIrBtn.hidden = false;
    return;
  }

  const phase = getIrPhase(record);
  const day = getIrDay(record);
  const progress = Math.min(100, Math.max(2, (day / 104) * 100));
  const replacement = record.replacement_player_id
    ? players.find(player => String(player.id) === String(record.replacement_player_id))?.name
    : null;

  els.irSlotPill.textContent = record.status === 'active' ? '1/1 attiva' : '1/1 utilizzata';
  els.irSlotPill.classList.add('used');
  els.irStatus.innerHTML = `
    <div class="ir-admin-status-card">
      <div>
        <strong>${escapeHtml(record.player_name)}</strong>
        <span>${escapeHtml(teamNameById(record.team_id))} · stagione ${escapeHtml(record.season_key)}</span>
        <small>
          ${record.status === 'active' ? `Giorno ${day} di 104` : `Conclusa il ${formatDate(record.resolved_at)}`}
          · attivata il ${formatDate(record.activated_on)}
        </small>
        ${replacement ? `<small>Sostituto acquisito: ${escapeHtml(replacement)}</small>` : ''}
      </div>
      <span class="ir-phase-badge ${phase.className}">${phase.label}</span>
      ${record.status === 'active' ? `<div class="ir-progress"><span style="width:${progress}%"></span></div>` : ''}
    </div>
  `;

  if (record.status === 'active') {
    els.cutIrBtn.hidden = false;
    els.reinstateIrBtn.hidden = day < 61;
  }
}

async function loadInjuryReserve() {
  const { data, error } = await supabase
    .from('injury_reserve')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  injuryReserveRows = data || [];
  renderPlayers();
  renderIrPanel();
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
    const activeIr = getActiveIrByPlayerId(p.id);
    const owner = teamNameById(p.owner_team_id);
    const badgeCount = [p.is_fp, p.is_fp_keeper, p.is_u21_slot, p.is_u21_keeper, p.is_rfa_matched, p.is_top6_protected].filter(Boolean).length;

    return `
      <button type="button" class="player-row ${selected} ${activeIr ? 'is-ir-player' : ''}" data-player-id="${p.id}">
        <span class="player-main">
          <strong>${p.name || 'Senza nome'}</strong>
          <small>${roleLabel(p)} · ${p.serie_a_team || 'N/D'} · ${owner}</small>
        </span>
        <span class="badge-count">${activeIr ? 'IR' : badgeCount ? `${badgeCount} badge` : 'no badge'}</span>
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

  renderIrPanel();
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

  if (
    getActiveIrByPlayerId(selectedPlayer.id) &&
    String(ownerTeamId) !== String(selectedPlayer.owner_team_id)
  ) {
    showToast('Per cambiare squadra o tagliare questo giocatore devi prima chiudere la sua IR.', 'warn');
    return;
  }

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

  const blockingIr = getActiveIrByPlayerId(selectedPlayer.id);
  if (blockingIr) {
    showToast(
      blockingIr.status === 'offered'
        ? 'Prima revoca la disponibilità IR concessa a questo giocatore.'
        : 'Questo giocatore è in IR: usa “Taglia definitivamente”.',
      'warn'
    );
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

function closeIrDialog(dialog) {
  if (dialog?.open) dialog.close();
}

function openActivateIrDialog() {
  if (!selectedPlayer?.owner_team_id || getCurrentSeasonIrForTeam(selectedPlayer.owner_team_id)) {
    showToast('Lo slot IR non è disponibile per questa squadra.', 'warn');
    return;
  }

  els.activateIrPlayer.textContent = `${selectedPlayer.name} · ${teamNameById(selectedPlayer.owner_team_id)}`;
  els.irActivatedOn.value = localDateValue();
  els.irActivatedOn.max = localDateValue();
  els.irMedicalSource.value = '';
  els.irMedicalNote.value = '';
  els.irPrognosisConfirm.checked = false;
  els.activateIrDialog?.showModal();
}

async function activateInjuryReserve(event) {
  event.preventDefault();

  if (!selectedPlayer?.owner_team_id || !els.irPrognosisConfirm.checked) {
    showToast('Conferma la prognosi minima di 3 mesi.', 'warn');
    return;
  }

  const { error } = await supabase.rpc('admin_activate_injury_reserve', {
    p_player_id: selectedPlayer.id,
    p_activated_on: els.irActivatedOn.value,
    p_medical_note: els.irMedicalNote.value.trim() || null,
    p_medical_source_url: els.irMedicalSource.value.trim() || null
  });

  if (error) {
    console.error(error);
    showToast(`Errore attivazione IR: ${error.message}`, 'error');
    return;
  }

  closeIrDialog(els.activateIrDialog);
  showToast('Injury Reserve concessa. Sarà attivata solo se la squadra salverà la chiamata.', 'ok');
  await loadPlayers();
  await loadInjuryReserve();
  const fresh = players.find(player => player.id === selectedPlayer?.id);
  if (fresh) selectPlayer(fresh);
}

async function revokeInjuryReserveOffer() {
  const record = getCurrentSeasonIrForTeam(selectedPlayer?.owner_team_id);
  if (!record || record.status !== 'offered') return;

  const confirmed = window.confirm(
    `Revocare la disponibilità Injury Reserve concessa per ${record.player_name}? Lo slot tornerà completamente libero.`
  );
  if (!confirmed) return;

  const { error } = await supabase.rpc('admin_revoke_injury_reserve_offer', {
    p_ir_id: record.id
  });

  if (error) {
    console.error(error);
    showToast(`Errore revoca IR: ${error.message}`, 'error');
    return;
  }

  showToast(`Disponibilità IR revocata per ${record.player_name}.`, 'ok');
  await loadPlayers();
  await loadInjuryReserve();
  const fresh = players.find(player => player.id === record.player_id);
  if (fresh) selectPlayer(fresh);
}

function openReinstateIrDialog() {
  const record = getCurrentSeasonIrForTeam(selectedPlayer?.owner_team_id);
  if (!record || record.status !== 'active' || getIrDay(record) < 61) {
    showToast('Il reintegro è disponibile dal giorno 61.', 'warn');
    return;
  }

  const candidates = players
    .filter(player =>
      String(player.owner_team_id) === String(record.team_id) &&
      String(player.id) !== String(record.player_id) &&
      !getActiveIrByPlayerId(player.id)
    )
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'it'));

  els.irCutPlayerSelect.innerHTML = [
    '<option value="">Seleziona giocatore</option>',
    ...candidates.map(player =>
      `<option value="${player.id}">${escapeHtml(player.name)} · ${escapeHtml(roleLabel(player))}</option>`
    )
  ].join('');

  els.reinstateIrPlayer.textContent = `Per reintegrare ${record.player_name} devi tagliare un altro giocatore di ${teamNameById(record.team_id)}.`;
  els.reinstateIrDialog?.showModal();
}

async function reinstateInjuryReserve(event) {
  event.preventDefault();
  const record = getCurrentSeasonIrForTeam(selectedPlayer?.owner_team_id);
  const cutPlayerId = els.irCutPlayerSelect.value;

  if (!record || !cutPlayerId) {
    showToast('Seleziona il giocatore da tagliare.', 'warn');
    return;
  }

  const cutPlayer = players.find(player => String(player.id) === String(cutPlayerId));
  const confirmed = window.confirm(
    `Reintegrare ${record.player_name} e tagliare definitivamente ${cutPlayer?.name || 'il giocatore selezionato'}?`
  );
  if (!confirmed) return;

  const { error } = await supabase.rpc('admin_reinstate_injury_reserve', {
    p_ir_id: record.id,
    p_cut_player_id: cutPlayerId
  });

  if (error) {
    console.error(error);
    showToast(`Errore reintegro IR: ${error.message}`, 'error');
    return;
  }

  closeIrDialog(els.reinstateIrDialog);
  showToast(`${record.player_name} reintegrato.`, 'ok');
  await loadPlayers();
  await loadInjuryReserve();
  const fresh = players.find(player => player.id === record.player_id);
  if (fresh) selectPlayer(fresh);
}

async function cutInjuryReserve() {
  const record = getCurrentSeasonIrForTeam(selectedPlayer?.owner_team_id);
  if (!record || record.status !== 'active') return;

  const confirmed = window.confirm(
    `Tagliare definitivamente ${record.player_name}? Lo slot IR resterà consumato per tutta la stagione.`
  );
  if (!confirmed) return;

  const { error } = await supabase.rpc('admin_cut_injury_reserve', {
    p_ir_id: record.id
  });

  if (error) {
    console.error(error);
    showToast(`Errore taglio IR: ${error.message}`, 'error');
    return;
  }

  showToast(`${record.player_name} tagliato definitivamente.`, 'ok');
  await loadPlayers();
  await loadInjuryReserve();
  const fresh = players.find(player => player.id === record.player_id);
  if (fresh) selectPlayer(fresh);
}

async function refreshAll() {
  try {
    setGuard('Aggiornamento dati...', 'Sto caricando squadre e giocatori.');
    const { error: irSyncError } = await supabase.rpc('admin_sync_ir_compensatory_calls');
    if (irSyncError) throw irSyncError;
    await loadTeams();
    await loadPlayers();
    await loadInjuryReserve();
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
  els.activateIrBtn?.addEventListener('click', openActivateIrDialog);
  els.activateIrForm?.addEventListener('submit', activateInjuryReserve);
  els.revokeIrBtn?.addEventListener('click', revokeInjuryReserveOffer);
  els.reinstateIrBtn?.addEventListener('click', openReinstateIrDialog);
  els.reinstateIrForm?.addEventListener('submit', reinstateInjuryReserve);
  els.cutIrBtn?.addEventListener('click', cutInjuryReserve);

  document.querySelectorAll('[data-close-dialog]').forEach(button => {
    button.addEventListener('click', () => {
      closeIrDialog($(button.dataset.closeDialog));
    });
  });

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
