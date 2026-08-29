import { supabase } from './supabase.js';

const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
const TABLE = 'fantacalcio_results';

const panel = document.getElementById('results-admin-panel');
const adminBody = document.getElementById('results-admin-body');
const adminSummary = document.getElementById('results-admin-summary');
const confButton = document.getElementById('import-conference-btn');
const rrButton = document.getElementById('import-roundrobin-btn');
const confAInput = document.getElementById('file-conf-a');
const confBInput = document.getElementById('file-conf-b');
const rrInput = document.getElementById('file-round-robin');
const confAStatus = document.getElementById('status-conf-a');
const confBStatus = document.getElementById('status-conf-b');
const rrStatus = document.getElementById('status-round-robin');

let xlsxReady = null;
let parsedConfA = null;
let parsedConfB = null;
let parsedRR = null;

function setMessage(el, text, type = '') {
  if (!el) return;
  el.textContent = text;
  el.className = `results-file-status ${type}`.trim();
}

function setSummary(text, type = '') {
  if (!adminSummary) return;
  adminSummary.textContent = text;
  adminSummary.className = `results-admin-summary ${type}`.trim();
}

function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxReady) return xlsxReady;

  xlsxReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = XLSX_CDN;
    script.async = true;
    script.onload = () => window.XLSX ? resolve(window.XLSX) : reject(new Error('Libreria XLSX non caricata.'));
    script.onerror = () => reject(new Error('Impossibile caricare la libreria XLSX.'));
    document.head.appendChild(script);
  });

  return xlsxReady;
}

function normalizeText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(',', '.').trim());
  return Number.isFinite(n) ? n : null;
}

function fantasyGoals(points) {
  const p = Number(points);
  if (!Number.isFinite(p) || p < 66) return 0;
  return 1 + Math.floor((p - 66) / 6);
}

function resultFor(pointsFor, pointsAgainst) {
  const gf = fantasyGoals(pointsFor);
  const ga = fantasyGoals(pointsAgainst);
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
}

function isGWHeader(value) {
  const text = normalizeText(value).toLowerCase();
  const match = text.match(/^(\d+)\s*[ªºa]?\s*giornata\s+lega\b/i);
  return match ? Number(match[1]) : null;
}

function findCalendarSheet(workbook) {
  const preferred = workbook.SheetNames.find(name => /calendario/i.test(name));
  return workbook.Sheets[preferred || workbook.SheetNames[0]];
}

function rowsFromSheet(sheet, conference) {
  const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const results = [];
  const seen = new Set();

  for (let r = 0; r < matrix.length; r++) {
    const row = matrix[r] || [];

    for (let c = 0; c < row.length; c++) {
      const gw = isGWHeader(row[c]);
      if (!gw) continue;

      const startCol = c;

      for (let rr = r + 1; rr < matrix.length; rr++) {
        const current = matrix[rr] || [];

        if (isGWHeader(current[startCol])) break;

        const teamA = normalizeText(current[startCol]);
        const scoreA = toNumber(current[startCol + 1]);
        const scoreB = toNumber(current[startCol + 2]);
        const teamB = normalizeText(current[startCol + 3]);

        const looksLikeMatch = teamA && teamB && scoreA !== null && scoreB !== null;
        if (!looksLikeMatch) {
          const hasAnything = [current[startCol], current[startCol + 1], current[startCol + 2], current[startCol + 3]]
            .some(v => normalizeText(v) !== '');
          if (!hasAnything) break;
          continue;
        }

        // Nei file Fantacalcio 0-0 significa giornata non ancora disputata.
        if (scoreA === 0 && scoreB === 0) continue;

        const matchKey = `${gw}|${teamA}|${teamB}`;
        if (seen.has(matchKey)) continue;
        seen.add(matchKey);

        results.push(
          {
            gw,
            match_date: null,
            team: teamA,
            opponent: teamB,
            points_for: scoreA,
            points_against: scoreB,
            result: resultFor(scoreA, scoreB),
            phase: 'Regular',
            conference,
            team_key: `${conference}::${teamA}`,
            updated_at: new Date().toISOString()
          },
          {
            gw,
            match_date: null,
            team: teamB,
            opponent: teamA,
            points_for: scoreB,
            points_against: scoreA,
            result: resultFor(scoreB, scoreA),
            phase: 'Regular',
            conference,
            team_key: `${conference}::${teamB}`,
            updated_at: new Date().toISOString()
          }
        );
      }
    }
  }

  return results.sort((a, b) => a.gw - b.gw || a.team.localeCompare(b.team));
}

function summarize(rows) {
  const teams = new Set(rows.map(r => r.team));
  const gws = [...new Set(rows.map(r => r.gw))].sort((a, b) => a - b);
  return {
    teams: teams.size,
    matches: rows.length / 2,
    gws,
    maxGW: gws.length ? gws[gws.length - 1] : 0
  };
}

function validateRows(rows, conference) {
  if (!rows.length) throw new Error('Non trovo nessuna partita disputata nel file.');

  const summary = summarize(rows);
  const expectedTeams = conference === 'Unificata' ? 16 : 8;

  if (summary.teams > expectedTeams) {
    throw new Error(`Trovate ${summary.teams} squadre: per ${conference} me ne aspettavo al massimo ${expectedTeams}.`);
  }

  if (summary.matches % 1 !== 0) {
    throw new Error('Numero di partite non valido.');
  }

  return summary;
}

async function parseFile(file, conference) {
  if (!file) throw new Error('Seleziona prima il file Excel.');
  await loadXLSX();

  const buffer = await file.arrayBuffer();
  const workbook = window.XLSX.read(buffer, { type: 'array', cellDates: true });
  const sheet = findCalendarSheet(workbook);
  if (!sheet) throw new Error('Non trovo il foglio Calendario nel file.');

  const rows = rowsFromSheet(sheet, conference);
  const summary = validateRows(rows, conference);
  return { rows, summary, fileName: file.name };
}

function summaryText(parsed) {
  const { summary } = parsed;
  const gwText = summary.gws.length === 1
    ? `GW ${summary.gws[0]}`
    : `GW 1-${summary.maxGW}`;
  return `${gwText} · ${summary.teams} squadre · ${summary.matches} partite giocate`;
}

async function handlePreview(input, conference, statusEl, setter) {
  const file = input?.files?.[0];
  if (!file) {
    setter(null);
    setMessage(statusEl, 'Nessun file selezionato.');
    return;
  }

  setMessage(statusEl, 'Controllo il file…', 'loading');
  try {
    const parsed = await parseFile(file, conference);
    setter(parsed);
    setMessage(statusEl, `✓ ${summaryText(parsed)}`, 'ok');
  } catch (error) {
    setter(null);
    setMessage(statusEl, `✕ ${error.message}`, 'error');
  }
}

async function upsertRows(rows) {
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from(TABLE)
      .upsert(chunk, { onConflict: 'conference,phase,gw,team_key' });
    if (error) throw error;
  }
}

async function importConference() {
  if (!parsedConfA || !parsedConfB) {
    setSummary('Carica e valida entrambi i file Conference prima di aggiornare.', 'error');
    return;
  }

  confButton.disabled = true;
  setSummary('Aggiornamento Conference in corso…', 'loading');

  try {
    await upsertRows([...parsedConfA.rows, ...parsedConfB.rows]);
    setSummary(
      `✓ Conference aggiornate: ${parsedConfA.summary.matches + parsedConfB.summary.matches} partite totali. Ricarico la classifica…`,
      'ok'
    );
    window.setTimeout(() => window.location.reload(), 900);
  } catch (error) {
    console.error(error);
    setSummary(`Errore Supabase: ${error.message}`, 'error');
    confButton.disabled = false;
  }
}

async function importRoundRobin() {
  if (!parsedRR) {
    setSummary('Carica e valida il file Round Robin prima di aggiornare.', 'error');
    return;
  }

  rrButton.disabled = true;
  setSummary('Aggiornamento Round Robin in corso…', 'loading');

  try {
    await upsertRows(parsedRR.rows);
    setSummary(`✓ Round Robin aggiornato: ${parsedRR.summary.matches} partite. Ricarico la classifica…`, 'ok');
    window.setTimeout(() => window.location.reload(), 900);
  } catch (error) {
    console.error(error);
    setSummary(`Errore Supabase: ${error.message}`, 'error');
    rrButton.disabled = false;
  }
}

async function showForAdminOnly() {
  if (!panel) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if (!user) return;

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (error || profile?.role !== 'admin') return;

    panel.hidden = false;
    if (adminBody) adminBody.hidden = false;
    await loadXLSX();
  } catch (error) {
    console.error('Errore inizializzazione pannello risultati:', error);
  }
}

confAInput?.addEventListener('change', () => handlePreview(confAInput, 'Conf A', confAStatus, value => { parsedConfA = value; }));
confBInput?.addEventListener('change', () => handlePreview(confBInput, 'Conf B', confBStatus, value => { parsedConfB = value; }));
rrInput?.addEventListener('change', () => handlePreview(rrInput, 'Unificata', rrStatus, value => { parsedRR = value; }));
confButton?.addEventListener('click', importConference);
rrButton?.addEventListener('click', importRoundRobin);

document.addEventListener('DOMContentLoaded', showForAdminOnly);
