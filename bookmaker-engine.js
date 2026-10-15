/*
 * BOOKMAKER DEGLI EROI | Motore 1X2 v1.0
 * Sorgenti: fantacalcio_results (2026/27), match_history (2025/26),
 * fantacalcio_fixtures (per depurare il bonus casa nella prima fase).
 * Calcolo deterministico, nessuna quota/percentuale inventata a mano.
 * Non scrive su Supabase.
 */

const CURRENT_SEASON = '2026/27';
const HISTORIC_SEASON = '2025/26';
const GOAL_BASE = 66;
const GOAL_STEP = 6;
const MAX_GOAL_BUCKET = 12;

export function normalizeTeam(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function num(value) {
  if (value === null || value === undefined || value === '') return NaN;
  return Number(value);
}

function validNumber(n) { return Number.isFinite(n); }

export function goalsFromFantasyPoints(points) {
  const n = num(points);
  if (!validNumber(n)) return null;
  return n < GOAL_BASE ? 0 : 1 + Math.floor((n - GOAL_BASE + 1e-9) / GOAL_STEP);
}

export function roundTwo(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function oddFromProbability(probability) {
  return validNumber(probability) && probability > 0 ? roundTwo(1 / probability) : null;
}

function mean(items) {
  return items.length ? items.reduce((sum, x) => sum + x, 0) / items.length : NaN;
}

function sd(items, average) {
  if (items.length < 2) return NaN;
  return Math.sqrt(items.reduce((sum, x) => sum + (x - average) ** 2, 0) / (items.length - 1));
}

// Stabile e deterministica: approssimazione di Phi, errore < 1e-7.
function normalCdf(z) {
  if (z <= -10) return 0;
  if (z >= 10) return 1;
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp(-0.5 * z * z);
  const p = 1 - d * (0.319381530 * t - 0.356563782 * t ** 2 + 1.781477937 * t ** 3 - 1.821255978 * t ** 4 + 1.330274429 * t ** 5);
  return z >= 0 ? p : 1 - p;
}

function goalDistribution(expectedPoints, standardDeviation) {
  const sdValue = Math.max(3, standardDeviation);
  const cdfAt = (threshold) => normalCdf((threshold - expectedPoints) / sdValue);
  const buckets = Array(MAX_GOAL_BUCKET + 1).fill(0);
  buckets[0] = cdfAt(GOAL_BASE);
  for (let goals = 1; goals < MAX_GOAL_BUCKET; goals++) {
    const lower = GOAL_BASE + GOAL_STEP * (goals - 1);
    const upper = lower + GOAL_STEP;
    buckets[goals] = Math.max(0, cdfAt(upper) - cdfAt(lower));
  }
  buckets[MAX_GOAL_BUCKET] = Math.max(0, 1 - cdfAt(GOAL_BASE + GOAL_STEP * (MAX_GOAL_BUCKET - 1)));
  const sum = buckets.reduce((a, b) => a + b, 0);
  return buckets.map(p => p / sum);
}

function weightedSamples(rows, latestRound, decay) {
  const entries = rows.filter(r => validNumber(r.points)).map(r => ({
    points: r.points,
    weight: Math.pow(decay, Math.max(0, latestRound - r.gw))
  }));
  const weight = entries.reduce((total, row) => total + row.weight, 0);
  const total = entries.reduce((s, row) => s + row.points * row.weight, 0);
  return { count: entries.length, weight, average: weight ? total / weight : null };
}

/**
 * Costruisce un modello statistico dalla fotografia del DB, senza modificare nulla.
 * L'algoritmo usa fantapunti neutri: per le prime 14 GW 2026/27 sottrae il +2
 * ai valori delle franchigie in casa identificati nel calendario.
 */
// Modalita' alternativa, ESCLUSIVAMENTE per il simulatore admin.
// Pesi percentuali trasparenti. La chiamata buildModel() senza weights
// continua ad usare l'algoritmo originale senza modifiche.
export const SIMULATOR_DEFAULT_WEIGHTS = Object.freeze({ historic: 10, season: 60, recent5: 30 });

export function validateSimulatorWeights(weights) {
  const keys = ['historic', 'season', 'recent5'];
  if (!weights || keys.some(k => !Number.isInteger(Number(weights[k])) || Number(weights[k]) < 0 || Number(weights[k]) > 100)) {
    throw new Error('I tre pesi devono essere percentuali intere tra 0 e 100.');
  }
  const total = keys.reduce((sum, key) => sum + Number(weights[key]), 0);
  if (total !== 100) throw new Error('Le percentuali devono sommare esattamente il 100%.');
  return Object.fromEntries(keys.map(k => [k, Number(weights[k])]));
}

export function buildModel({ teams = [], results = [], fixtures = [], history = [], weights = null } = {}) {
  const tunedWeights = weights === null ? null : validateSimulatorWeights(weights);
  const fixturesAtHome = new Set();
  for (const fixture of fixtures) {
    const gw = num(fixture.gw);
    if (gw >= 1 && gw <= 14 && fixture.home_team) {
      fixturesAtHome.add(`${gw}:${normalizeTeam(fixture.home_team)}`);
    }
  }

  const current = new Map();
  const historic = new Map();
  const currentRaw = [];
  let maxRound = 0;

  function add(map, name, row) {
    const key = normalizeTeam(name);
    if (!key || !validNumber(row.points)) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  for (const row of results) {
    const gw = num(row.gw);
    const points = num(row.points_for);
    if (!validNumber(gw) || !validNumber(points) || gw < 1) continue;
    if (String(row.phase || '').toLowerCase() !== 'regular') continue;
    // In questa fase il fattore campo (+2) vale per le giornate 1-14.
    const isHome = row.is_home === true || (row.is_home == null && fixturesAtHome.has(`${gw}:${normalizeTeam(row.team)}`));
    const adjusted = points - (gw <= 14 && isHome ? 2 : 0);
    add(current, row.team, { gw, points: adjusted });
    currentRaw.push({ key: normalizeTeam(row.team), points: adjusted });
    maxRound = Math.max(maxRound, gw);
  }

  for (const row of history) {
    if (row.season !== HISTORIC_SEASON) continue;
    const gw = num(row.season_week);
    const scoreA = num(row.score_a);
    const scoreB = num(row.score_b);
    if (!validNumber(gw)) continue;
    if (validNumber(scoreA)) add(historic, row.team_a, { gw, points: scoreA });
    if (validNumber(scoreB)) add(historic, row.team_b, { gw, points: scoreB });
  }

  if (currentRaw.length < 32) throw new Error('Servono almeno 32 fantapunteggi validi del campionato in corso.');

  const currentMean = mean(currentRaw.map(r => r.points));
  const byTeamMeans = new Map();
  for (const [key, rows] of current) byTeamMeans.set(key, mean(rows.map(r => r.points)));
  const residuals = currentRaw.map(r => r.points - (byTeamMeans.get(r.key) ?? currentMean));
  const variance = residuals.reduce((s, x) => s + x * x, 0) / Math.max(1, residuals.length - byTeamMeans.size);
  // Limitazione della stima della volatilità se il dataset è piccolo.
  const baseSd = Math.max(4.5, Math.min(9, Math.sqrt(Math.max(1, variance))));

  const profiles = new Map();
  for (const team of teams) {
    const key = normalizeTeam(team.name);
    const curr = [...(current.get(key) || [])].sort((a, b) => a.gw - b.gw);
    const hist = [...(historic.get(key) || [])].sort((a, b) => a.gw - b.gw);
    const recent = weightedSamples(curr, maxRound, 0.94);
    const old = weightedSamples(hist, 34, 0.97);

    // Il Draft cambia le rose: lo storico 2025/26 conta al massimo come 2 partite,
    // mentre la media di Lega fornisce 2 partite di regolarizzazione.
    const oldWeight = old.count ? Math.min(2, old.weight * 0.12) : 0;
    const neutralWeight = 2;
    const originalExpected = (
      (recent.average ?? 0) * recent.weight +
      (old.average ?? 0) * oldWeight +
      currentMean * neutralWeight
    ) / Math.max(1e-8, recent.weight + oldWeight + neutralWeight);

    // Stagione intera e ultime 5 sono due viste degli stessi dati: dichiarato
    // in interfaccia, cosi' non si spacciano per campioni indipendenti.
    const seasonAverage = curr.length ? mean(curr.map(r => r.points)) : null;
    const recentFiveRows = curr.slice(-5);
    const recentFiveAverage = recentFiveRows.length ? mean(recentFiveRows.map(r => r.points)) : null;
    const sources = {
      historic: old.average,
      season: seasonAverage,
      recent5: recentFiveAverage
    };
    const missingSources = tunedWeights ? Object.keys(tunedWeights).filter(k => tunedWeights[k] > 0 && !Number.isFinite(sources[k])) : [];
    const usable = tunedWeights ? Object.keys(tunedWeights).filter(k => tunedWeights[k] > 0 && Number.isFinite(sources[k])) : [];
    const availableWeight = usable.reduce((sum,k) => sum + (tunedWeights?.[k]||0), 0);
    const expected = !tunedWeights ? originalExpected :
      availableWeight > 0 ? usable.reduce((sum,k) => sum + sources[k] * tunedWeights[k], 0) / availableWeight :
      (seasonAverage ?? recentFiveAverage ?? old.average ?? currentMean);

    // Varianza della franchigia regolarizzata sulla dispersione della Lega.
    const currPoints = curr.map(r => r.points);
    const teamMean = mean(currPoints);
    const teamSd = sd(currPoints, teamMean);
    const nVar = Math.max(0, currPoints.length - 1);
    const stabilizedVar = ((validNumber(teamSd) ? nVar * teamSd ** 2 : 0) + 8 * baseSd ** 2) / (nVar + 8);
    const volatility = Math.max(4.5, Math.min(10, Math.sqrt(stabilizedVar)));
    profiles.set(key, {
      name: team.name,
      conference: team.conference,
      currentGames: curr.length,
      historyGames: hist.length,
      recentAverage: recent.average,
      historicAverage: old.average,
      seasonAverage,
      recentFiveAverage,
      recentFiveGames: recentFiveRows.length,
      missingSources,
      availableWeight: tunedWeights ? availableWeight : null,
      expected,
      volatility,
      confidence: curr.length >= 12 ? 'alta' : curr.length >= 6 ? 'media' : 'bassa'
    });
  }

  return {
    metadata: {
      season: CURRENT_SEASON,
      currentRows: currentRaw.length,
      historicalRows: history.filter(x => x.season === HISTORIC_SEASON).length,
      latestRound: maxRound,
      leagueAverage: currentMean,
      leagueSd: baseSd,
      deBiasedHomeScores: true,
      simulatorWeights: tunedWeights,
      simulatorMode: Boolean(tunedWeights)
    },
    teams: teams.map(t => t.name),
    profiles
  };
}

/**
 * stage: ottavi | quarti | semi_andata | semi_ritorno | finali.
 * All'altro lato non viene attribuito automaticamente fattore campo.
 */
export function quoteMatch(model, homeName, awayName, stage = 'ottavi') {
  const home = model.profiles.get(normalizeTeam(homeName));
  const away = model.profiles.get(normalizeTeam(awayName));
  if (!home || !away) throw new Error('Franchigia non trovata nei dati della Lega.');
  if (normalizeTeam(homeName) === normalizeTeam(awayName)) throw new Error('Seleziona due franchigie diverse.');
  const homeBonus = (stage === 'semi_andata' || stage === 'semi_ritorno') ? 2 : 0;
  const homeGoals = goalDistribution(home.expected + homeBonus, home.volatility);
  const awayGoals = goalDistribution(away.expected, away.volatility);
  let p1 = 0, px = 0, p2 = 0;
  for (let h = 0; h < homeGoals.length; h++) {
    for (let a = 0; a < awayGoals.length; a++) {
      const p = homeGoals[h] * awayGoals[a];
      if (h > a) p1 += p;
      else if (h === a) px += p;
      else p2 += p;
    }
  }
  const sum = p1 + px + p2;
  p1 /= sum;
  px /= sum;
  p2 /= sum;
  return {
    home: home.name, away: away.name, stage,
    homeBonus,
    p1, px, p2,
    q1: oddFromProbability(p1), qx: oddFromProbability(px), q2: oddFromProbability(p2),
    homeProfile: home, awayProfile: away,
    method: 'Gauss (fantapunti) → soglie gol (66,+6) → probabilità 1X2',
    createdAt: new Date().toISOString()
  };
}

export function probsToOdds(p1, px, p2) {
  const n = [p1, px, p2].map(Number);
  if (!n.every(p => Number.isFinite(p) && p > 0 && p < 100)) throw new Error('Le probabilità devono essere tra 0 e 100%.');
  if (Math.abs(n.reduce((a, b) => a + b, 0) - 100) > 0.011) throw new Error('Le probabilità 1 + X + 2 devono sommare 100%.');
  return n.map(p => oddFromProbability(p / 100));
}
