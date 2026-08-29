import { supabase } from './supabase.js';

const FALLBACK_CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSG3HrTJsfZGhgfJJx8l63QYhooGsyiydLf1OTt2JldOPx5nSZyJz00IplWA5YHGwjymNL9EXIVX5XA/pub?gid=1118969717&single=true&output=csv';

function parseCSV(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      row.push(field);
      field = '';
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      field = '';
      row = [];
    } else {
      field += c;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  if (!rows.length) return [];

  const headers = rows.shift().map(h => String(h || '').trim());

  return rows
    .filter(r => r.some(cell => String(cell ?? '').trim() !== ''))
    .map(r => {
      const obj = {};
      headers.forEach((h, i) => {
        if (h) obj[h] = String(r[i] ?? '').trim();
      });
      return obj;
    });
}

async function loadFallbackCSV() {
  const bust = FALLBACK_CSV_URL.includes('?') ? '&nocache=' : '?nocache=';
  const res = await fetch(FALLBACK_CSV_URL + bust + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Errore caricamento CSV di riserva: ${res.status}`);
  return parseCSV(await res.text());
}

function mapSupabaseRows(rows) {
  const conferenceMaxGW = rows
    .filter(r => r.conference === 'Conf A' || r.conference === 'Conf B')
    .reduce((max, r) => Math.max(max, Number(r.gw) || 0), 0);

  return rows.map(r => {
    const rawGW = Number(r.gw) || 0;
    const seasonalGW = r.conference === 'Unificata'
      ? rawGW + conferenceMaxGW
      : rawGW;

    return {
      GW: rawGW,
      GW_Stagionale: seasonalGW,
      Date: r.match_date || '',
      Team: r.team || '',
      Opponent: r.opponent || '',
      PointsFor: r.points_for,
      PointsAgainst: r.points_against,
      Result: r.result || '',
      Phase: r.phase || 'Regular',
      Conference: r.conference || '',
      TeamKey: r.team_key || ''
    };
  });
}

export async function loadResultsRows() {
  try {
    const { data, error } = await supabase
      .from('fantacalcio_results')
      .select('gw, match_date, team, opponent, points_for, points_against, result, phase, conference, team_key')
      .order('conference', { ascending: true })
      .order('gw', { ascending: true })
      .order('team', { ascending: true });

    if (error) throw error;
    if (Array.isArray(data) && data.length) return mapSupabaseRows(data);
  } catch (error) {
    console.warn('Supabase risultati non disponibile, uso il CSV attuale come fallback.', error);
  }

  return loadFallbackCSV();
}
