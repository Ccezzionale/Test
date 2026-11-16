import { createClient } from 'jsr:@supabase/supabase-js@2'
import webpush from 'npm:web-push'

const headers = {
  'Content-Type': 'application/json',
}

const SITE_BASE = 'https://ccezzionale.github.io/Test/'
const BRUSSELS_TZ = 'Europe/Brussels'
// Stessa fonte dati usata da statistiche.js per il Power Ranking.
const STATS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vSG3HrTJsfZGhgfJJx8l63QYhooGsyiydLf1OTt2JldOPx5nSZyJz00IplWA5YHGwjymNL9EXIVX5XA/pub?gid=1118969717&single=true&output=csv'


webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') || 'mailto:tringali0511@gmail.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!
)

function brusselsParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BRUSSELS_TZ,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)

  const map = Object.fromEntries(
    parts
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  )

  return {
    weekday: map.weekday,
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
  }
}

function brusselsTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: BRUSSELS_TZ,
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

// Un parsing CSV minimale ma rispettoso di doppi apici e righe multilinea.
function parseCSVRows(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', quoted = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++ }
      else quoted = !quoted
    } else if (c === ',' && !quoted) { row.push(field); field = '' }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      if (row.some(x => x.trim())) rows.push(row)
      row = []; field = ''
    } else field += c
  }
  row.push(field)
  if (row.some(x => x.trim())) rows.push(row)
  return rows
}

// Restituisce la GW massima già presente nei dati del Power Ranking.
// Event key basato sulla GW: se non cambia, NON rispediamo ogni mercoledì.
async function latestPowerRankingGW(): Promise<number | null> {
  const response = await fetch(STATS_CSV_URL, { signal: AbortSignal.timeout(12000), cache: 'no-store' })
  if (!response.ok) throw new Error(`Statistiche CSV: HTTP ${response.status}`)
  const rows = parseCSVRows(await response.text())
  if (rows.length < 2) return null
  const header = rows[0].map(x => x.trim())
  const ix = header.indexOf('GW_Stagionale') >= 0 ? header.indexOf('GW_Stagionale') : header.indexOf('GW')
  const pointsIx = header.indexOf('PointsFor')
  if (ix < 0 || pointsIx < 0) return null
  let maxGw = 0
  for (const row of rows.slice(1)) {
    const gw = Number(row[ix])
    const points = String(row[pointsIx] || '').trim()
    if (Number.isInteger(gw) && gw > 0 && points) maxGw = Math.max(maxGw, gw)
  }
  return maxGw || null
}

function isNotificationHour(local: ReturnType<typeof brusselsParts>) {
  // Primo tentativo alle 12:05, recuperabile fino alle 12:59.
  return local.hour === 12 && local.minute >= 5
}

function nthWeekOfMonth(day: number) {
  return Math.floor((day - 1) / 7) + 1
}

async function broadcast(
  supabaseAdmin: any,
  input: {
    eventKey: string
    type: string
    title: string
    body: string
    url: string
    teamIds?: string[]
  }
) {
  let profileQuery = supabaseAdmin.from('profiles').select('id, team_id').not('team_id', 'is', null)
  if (input.teamIds) {
    if (!input.teamIds.length) return { event_key: input.eventKey, recipients: 0, inserted: 0, duplicates: 0, failed: 0, sent: 0, push_failed: 0 }
    profileQuery = profileQuery.in('team_id', input.teamIds)
  }
  const { data: profiles, error: profilesError } = await profileQuery

  if (profilesError) throw profilesError

  // Non ritentare inutilmente INSERT già presenti ai controlli successivi.
  // L'indice UNIQUE (user_id, event_key) rimane la protezione finale.
  const { data: recorded, error: recordedError } = await supabaseAdmin
    .from('app_notifications')
    .select('user_id')
    .eq('event_key', input.eventKey)
  if (recordedError) throw recordedError
  const alreadyNotified = new Set((recorded || []).map((r: any) => String(r.user_id)))

  const insertedUserIds: string[] = []
  let duplicates = 0
  let failed = 0

  for (const profile of profiles || []) {
    if (alreadyNotified.has(String(profile.id))) {
      duplicates++
      continue
    }
    const { error } = await supabaseAdmin.from('app_notifications').insert({
      user_id: profile.id,
      team_id: profile.team_id,
      type: input.type,
      title: input.title,
      body: input.body,
      url: input.url,
      event_key: input.eventKey,
    })

    if (!error) insertedUserIds.push(profile.id)
    else if (error.code === '23505') duplicates++
    else {
      failed++
      console.log('Scheduled notification insert failed:', error.message)
    }
  }

  let sent = 0
  let pushFailed = 0

  if (insertedUserIds.length) {
    const { data: subscriptions, error: subscriptionsError } = await supabaseAdmin
      .from('push_subscriptions')
      .select('id, user_id, endpoint, p256dh, auth')
      .eq('is_active', true)
      .in('user_id', insertedUserIds)

    if (!subscriptionsError) {
      const payload = JSON.stringify({
        title: input.title,
        body: input.body,
        url: `${SITE_BASE}${input.url}`,
      })

      for (const sub of subscriptions || []) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth,
              },
            },
            payload
          )
          sent++
        } catch (error: any) {
          pushFailed++
          const statusCode = error?.statusCode || error?.status
          if (statusCode === 404 || statusCode === 410) {
            await supabaseAdmin
              .from('push_subscriptions')
              .update({
                is_active: false,
                updated_at: new Date().toISOString(),
              })
              .eq('id', sub.id)
          }
        }
      }
    }
  }

  return {
    event_key: input.eventKey,
    recipients: (profiles || []).length,
    inserted: insertedUserIds.length,
    duplicates,
    failed,
    sent,
    push_failed: pushFailed,
  }
}


/*
 * Rivalità pre-partita. La definizione di Bestia Nera e Agnello Sacrificale
 * replica la classifica dello storico completo di match.js (scope: tutte).
 * Non cambia risultati, classifiche, UI o service worker.
 */
type RivalryGame = { a: string; b: string; goalsA: number; goalsB: number }
type RivalryRecord = { name: string; w: number; d: number; l: number; n: number }

const RIVALRY_SEASON = '2026/27'

function rivalryKey(value: unknown): string {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function rivalryDisplayName(value: string): string {
  const names: Record<string, string> = {
    atleticoleon: 'Atlético Leon',
    fcdisoneste: 'FC Disoneste',
    minnesotasnakes: 'Minnesota Snakes',
    pokermantra: 'Pokermantra',
    wildboys78: 'Wildboys 78',
  }
  return names[rivalryKey(value)] || String(value || '').trim()
}

function rivalryGoals(value: unknown): number {
  const points = Number(String(value ?? '').replace(',', '.'))
  return points < 66 ? 0 : 1 + Math.floor((points - 66) / 6)
}

function rivalryPhase(value: unknown): string {
  const phase = rivalryKey(value || 'regular')
  if (phase.includes('rivalry')) return 'rivalry'
  if (phase.includes('ottav')) return 'ottavi'
  if (phase.includes('quart')) return 'quarti'
  if (phase.includes('semifinal')) return 'semifinali'
  if (phase.includes('final')) return 'finale'
  return phase
}

function rivalryHistoricalGames(history: any[], current: any[]): RivalryGame[] {
  const games = new Map<string, RivalryGame>()
  const add = (id: string, a: unknown, b: unknown, pA: unknown, pB: unknown) => {
    const nameA = String(a || '').trim()
    const nameB = String(b || '').trim()
    if (!nameA || !nameB || rivalryKey(nameA) === rivalryKey(nameB)) return
    if (pA === null || pA === undefined || pB === null || pB === undefined) return
    const pointsA = Number(String(pA).replace(',', '.'))
    const pointsB = Number(String(pB).replace(',', '.'))
    if (!Number.isFinite(pointsA) || !Number.isFinite(pointsB)) return
    const pair = [rivalryKey(nameA), rivalryKey(nameB)].sort().join('|')
    games.set(id + ':' + pair, {
      a: rivalryDisplayName(nameA),
      b: rivalryDisplayName(nameB),
      goalsA: rivalryGoals(pointsA),
      goalsB: rivalryGoals(pointsB),
    })
  }

  for (const row of history) {
    const kind = /crash\s*out|\bcoc\b/i.test(String(row.competition || ''))
      ? 'Crash Out Cup'
      : row.conference || row.competition || 'Campionato'
    const id = [row.season, row.season_week, rivalryKey(kind), rivalryPhase(row.phase)].join(':')
    add(id, row.team_a, row.team_b, row.score_a, row.score_b)
  }

  // Come il Match Center, i risultati omologati dell'anno corrente prevalgono
  // sulle eventuali righe duplicate dell'archivio.
  for (const row of current) {
    if (row.points_for === null || row.points_against === null) continue
    const id = [RIVALRY_SEASON, row.gw, rivalryKey(row.conference), rivalryPhase(row.phase)].join(':')
    add(id, row.team, row.opponent, row.points_for, row.points_against)
  }

  return [...games.values()]
}

function rivalryLeaders(team: string, games: RivalryGame[]) {
  const byOpponent = new Map<string, RivalryRecord>()
  const target = rivalryKey(team)
  for (const game of games) {
    const isA = rivalryKey(game.a) === target
    const isB = rivalryKey(game.b) === target
    if (!isA && !isB) continue
    const opponent = isA ? game.b : game.a
    const key = rivalryKey(opponent)
    if (!byOpponent.has(key)) byOpponent.set(key, { name: opponent, w: 0, d: 0, l: 0, n: 0 })
    const rec = byOpponent.get(key)!
    const gf = isA ? game.goalsA : game.goalsB
    const ga = isA ? game.goalsB : game.goalsA
    rec.n++
    if (gf > ga) rec.w++
    else if (gf < ga) rec.l++
    else rec.d++
  }
  const values = [...byOpponent.values()]
  const losses = values.filter(r => r.l > 0)
    .sort((a, b) => b.l - a.l || (b.l / b.n) - (a.l / a.n) || b.n - a.n || a.name.localeCompare(b.name, 'it'))
  const wins = values.filter(r => r.w > 0)
    .sort((a, b) => b.w - a.w || (b.w / b.n) - (a.w / a.n) || b.n - a.n || a.name.localeCompare(b.name, 'it'))
  return { nemesis: losses[0] || null, victim: wins[0] || null }
}

async function rivalryReadRows(admin: any, table: string, columns: string): Promise<any[]> {
  const all: any[] = []
  const pageSize = 1000
  for (let offset = 0; offset < 10000; offset += pageSize) {
    let query = admin.from(table).select(columns)
    if (table === 'fantacalcio_results') query = query.order('conference').order('gw').order('team')
    else if (table === 'teams') query = query.order('name')
    else query = query.order('id')
    const { data, error } = await query.range(offset, offset + pageSize - 1)
    if (error) throw new Error('Rivalry query ' + table + ': ' + error.message)
    all.push(...(data || []))
    if (!data || data.length < pageSize) return all
  }
  throw new Error('Rivalry query ' + table + ': oltre 10000 righe, controllo sospeso')
}

function rivalryChoice(type: 'nemesis' | 'victim', team: string, opponent: string, gw: number) {
  const nemesis = [
    ['☠️ MA ANCORA LORO?!', team + ' ritrova la sua Bestia Nera, ' + opponent + '. Alcuni hanno un rivale, altri una condanna a vita.'],
    ['💀 IL TRAUMA SI RINNOVA!', opponent + ' torna a tormentare ' + team + '. La terapia costa, perdere ancora è gratis.'],
    ['⚰️ CERTI INCUBI NON FINISCONO MAI', team + ' affronta di nuovo ' + opponent + '. Il calendario non ha pietà. E nemmeno le statistiche.'],
  ]
  const victim = [
    ['🐑 È PRONTO IL SACRIFICIO!', team + ' ritrova ' + opponent + ', il suo Agnello Sacrificale. La tradizione va rispettata. Soprattutto quando soffrono gli altri.'],
    ['🍽️ IL SOLITO CLIENTE!', opponent + ' torna a fare visita a ' + team + '. Il tavolo è prenotato, il conto lo paga sempre lo stesso.'],
    ['🐑 QUALCUNO CHIAMI LA PROTEZIONE ANIMALI!', team + ' affronta il suo Agnello Sacrificale, ' + opponent + '. A un certo punto non è più rivalità, è accanimento.'],
  ]
  const messages = type === 'nemesis' ? nemesis : victim
  // Varia tra giornate e avversari, ma resta stabile durante i retry del cron.
  const seed = rivalryKey(team) + ':' + rivalryKey(opponent) + ':' + String(gw)
  const hash = [...seed].reduce((n, letter) => ((n * 31 + letter.charCodeAt(0)) >>> 0), 0)
  const selected = messages[hash % messages.length]
  return { title: selected[0], body: selected[1] }
}

async function sendRivalryMatchNotifications(admin: any) {
  const [fixtures, resultsRows, historyRows, teams] = await Promise.all([
    rivalryReadRows(admin, 'fantacalcio_fixtures', 'id,conference,phase,gw,home_team,away_team'),
    rivalryReadRows(admin, 'fantacalcio_results', 'conference,phase,gw,team,opponent,points_for,points_against'),
    rivalryReadRows(admin, 'match_history', 'id,season,season_week,competition,phase,conference,team_a,team_b,score_a,score_b'),
    rivalryReadRows(admin, 'teams', 'id,name'),
  ])
  const teamIds = new Map(teams.map(t => [rivalryKey(t.name), String(t.id)]))
  const groups = new Map<string, any[]>()
  for (const fixture of fixtures) {
    if (!Number.isInteger(Number(fixture.gw)) || Number(fixture.gw) < 1) continue
    if (!fixture.home_team || !fixture.away_team) continue
    const key = rivalryKey(fixture.conference) + ':' + rivalryPhase(fixture.phase)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(fixture)
  }

  const games = rivalryHistoricalGames(historyRows, resultsRows)
  const reports: any[] = []
  for (const [group, groupFixtures] of groups) {
    const recentGws = resultsRows.filter(r =>
      rivalryKey(r.conference) + ':' + rivalryPhase(r.phase) === group &&
      r.points_for !== null && r.points_against !== null
    ).map(r => Number(r.gw)).filter(Number.isFinite)
    const lastPlayed = recentGws.length ? Math.max(...recentGws) : 0
    const nextGw = Math.min(...groupFixtures.map(f => Number(f.gw)).filter(gw => gw > lastPlayed))
    if (!Number.isFinite(nextGw)) continue

    for (const fixture of groupFixtures.filter(f => Number(f.gw) === nextGw)) {
      const home = rivalryDisplayName(fixture.home_team)
      const away = rivalryDisplayName(fixture.away_team)
      const previewUrl = 'match.html?' + new URLSearchParams({
        home, away, gw: String(nextGw), competition: String(fixture.conference),
      }).toString()
      for (const [team, opponent] of [[home, away], [away, home]]) {
        const teamId = teamIds.get(rivalryKey(team))
        if (!teamId) continue
        const leaders = rivalryLeaders(team, games)
        const type = rivalryKey(opponent) === rivalryKey(leaders.nemesis?.name)
          ? 'nemesis'
          : rivalryKey(opponent) === rivalryKey(leaders.victim?.name)
          ? 'victim'
          : null
        if (!type) continue
        const message = rivalryChoice(type, team, opponent, nextGw)
        const eventKey = [
          'rivalry', '2026-27', group.replace(/[^a-z0-9:]/g, ''), 'gw' + nextGw, rivalryKey(team)
        ].join(':')
        reports.push(await broadcast(admin, {
          eventKey,
          teamIds: [teamId],
          type: 'competition',
          title: message.title,
          body: message.body,
          url: previewUrl,
        }))
      }
    }
  }
  return reports
}

Deno.serve(async (req) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers,
      })
    }

    const expectedSecret = Deno.env.get('LEAGUE_NOTIFICATIONS_CRON_SECRET') || ''
    const providedSecret = req.headers.get('x-cron-secret') || ''

    if (!expectedSecret || providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Unauthorized cron call' }), {
        status: 401,
        headers,
      })
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const now = new Date()
    const results: any[] = []

    // ==========================================
    // 1) MERCATO: primo controllo dentro le 24h + conferma della chiusura.
    // ==========================================
    const { data: tradeSettings, error: tradeSettingsError } = await supabaseAdmin
      .from('trade_settings')
      .select('market_open, market_close_at')
      .eq('id', 1)
      .maybeSingle()

    if (!tradeSettingsError && tradeSettings?.market_open && tradeSettings?.market_close_at) {
      const closesAt = new Date(tradeSettings.market_close_at)
      const remainingMs = closesAt.getTime() - now.getTime()

      if (
        Number.isFinite(remainingMs) &&
        remainingMs > 0 &&
        remainingMs <= 24 * 60 * 60 * 1000
      ) {
        const closeIso = closesAt.toISOString()
        results.push(await broadcast(supabaseAdmin, {
          eventKey: `market-24h:${closeIso}`,
          type: 'trade',
          title: '⏳ Ultime 24 ore, svegliatevi',
          body: `Il mercato chiude tra meno di 24 ore, alle ${brusselsTime(closeIso)}. Se devi fare danni, questo è il momento.`,
          url: 'trade-room.html',
        }))
      }
    }

    // Quando scatta la scadenza programmata, notifica che il mercato è chiuso.
    // La finestra di recupero di 24h assorbe eventuali ritardi del cron.
    // Non dipende dal flag market_open: la finestra oraria termina comunque.
    if (!tradeSettingsError && tradeSettings?.market_close_at) {
      const closesAt = new Date(tradeSettings.market_close_at)
      const elapsedMs = now.getTime() - closesAt.getTime()
      if (Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= 24 * 60 * 60 * 1000) {
        const closeIso = closesAt.toISOString()
        results.push(await broadcast(supabaseAdmin, {
          eventKey: `market-closed:${closeIso}`,
          type: 'trade',
          title: '🔒 MERCATO CHIUSO!',
          body: 'Il mercato è ufficialmente chiuso! Basta trattative, capre. Adesso arrangiatevi con le rose che avete costruito.',
          url: 'trade-room.html',
        }))
      }
    }

    // ==========================================
    // 2) ALL STAR: lunedì dalle 12:00 alle 12:59 Bruxelles.
    // Recupero straordinario per il promemoria mancato del 19/10/2026.
    // L'event_key include il lunedì di calendario, non la settimana di voto.
    // ==========================================
    const local = brusselsParts(now)
    const mondayDateKey = `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`
    const catchupToday = mondayDateKey === '2026-10-19' && local.hour >= 12
    const isMondayAfterNoon =
      local.weekday === 'Mon' &&
      (local.hour === 12 || catchupToday)

    if (isMondayAfterNoon) {
      const { data: allStarState, error: allStarError } = await supabaseAdmin
        .from('allstar_state')
        .select('season, voting_open, active_week, voting_started_at, voting_closed_at')
        .order('season', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (
        !allStarError &&
        allStarState?.voting_open === true &&
        allStarState?.voting_started_at &&
        !allStarState?.voting_closed_at
      ) {
        results.push(await broadcast(supabaseAdmin, {
          eventKey: `allstar-vote-reminder:${allStarState.season}:${mondayDateKey}`,
          type: 'competition',
          title: '⭐ Capra, vota o perdi 5 euro',
          body: 'L’All-Star Game è aperto. Vota adesso: chi vince paga 5€ in meno, chi perde 5€ in più. Poi non venire a piangere.',
          url: 'allstar.html',
        }))
      }
    }

    // TotoEroi: gli avvisi sono destinati esclusivamente alle 14 franchigie aderenti.
    // In mancanza della configurazione completa, si evita l'invio a tutta la Lega.
    let totoeroiEligibleTeamIds: string[] | null = null
    const { data: totoExclusions, error: totoExclusionsError } = await supabaseAdmin
      .from('totoeroi_jackpot_exclusions')
      .select('team_id')
      .eq('season', '2026/27')
    if (totoExclusionsError) {
      console.warn('TotoEroi esclusioni non disponibili:', totoExclusionsError.message)
    } else if ((totoExclusions || []).length !== 2) {
      console.warn('TotoEroi notifiche sospese: attese 2 franchigie escluse')
    } else {
      const excluded = new Set((totoExclusions || []).map((entry: any) => String(entry.team_id)))
      const { data: totoTeams, error: totoTeamsError } = await supabaseAdmin.from('teams').select('id')
      if (totoTeamsError) console.warn('TotoEroi elenco squadre non disponibile:', totoTeamsError.message)
      else {
        const eligible = (totoTeams || []).map((t: any) => String(t.id)).filter((id: string) => !excluded.has(id))
        if (eligible.length === 14) totoeroiEligibleTeamIds = eligible
        else console.warn('TotoEroi notifiche sospese: numero partecipanti inatteso', eligible.length)
      }
    }

    // 3) TOTOEROI: una notifica a tutte le franchigie nella prima
    // esecuzione entro l'ultima ora prima della scadenza della schedina.
    // Si legge la scadenza impostata dall'Admin, non si presume il calendario.
    // Funziona solo per giornate pubblicate con pronostici aperti.
    const { data: totoRounds, error: totoError } = await supabaseAdmin
      .from('totoeroi_rounds')
      .select('id, season, gw, status, closes_at')
      .eq('season', '2026/27')
      .eq('status', 'open')
      .gt('closes_at', now.toISOString())
      .lte('closes_at', new Date(now.getTime() + 60 * 60 * 1000).toISOString())

    // TotoEroi potrebbe non essere ancora stato pubblicato sul database:
    // un suo errore non deve bloccare le notifiche di mercato e All-Star.
    if (totoError) {
      console.warn('TotoEroi reminder check failed:', totoError.message)
    } else if (totoeroiEligibleTeamIds) {
      for (const round of totoRounds || []) {
        const deadline = new Date(round.closes_at)
        if (Number.isNaN(deadline.getTime())) continue
        results.push(await broadcast(supabaseAdmin, {
          // Identità per giornata, così un rinvio della scadenza non crea spam.
          eventKey: `totoeroi-1h:${round.id}`,
          teamIds: totoeroiEligibleTeamIds,
          type: 'competition',
          title: '🎯 TOTOEROI: CAPRA, PRONOSTICA!',
          body: `Giornata ${round.gw}: manca meno di un’ora alla chiusura delle schedine (${brusselsTime(round.closes_at)}). Completa i tuoi 8 pronostici!`,
          url: 'totoeroi.html',
        }))
      }
    }

    // ==========================================
    // 3B) TOTOEROI: giornata omologata (notifica e push).
    // Il rollout include la GW 8 appena omologata il 26/10/2026.
    // Non inviare giornate vecchie, e mai duplicare una giornata.
    // ==========================================
    const { data: homologatedRounds, error: homologatedError } = await supabaseAdmin
      .from('totoeroi_rounds')
      .select('id, season, gw, status, updated_at')
      .eq('status', 'homologated')
      .gte('updated_at', '2026-10-26T09:00:00.000Z')
      .order('updated_at', { ascending: false })
      .limit(40)

    if (homologatedError) {
      console.warn('TotoEroi homologation check failed:', homologatedError.message)
    } else if (totoeroiEligibleTeamIds) {
      for (const round of homologatedRounds || []) {
        try {
          results.push(await broadcast(supabaseAdmin, {
            eventKey: `totoeroi-homologated:${round.season}:${round.id}`,
            teamIds: totoeroiEligibleTeamIds,
            type: 'competition',
            title: '🏁 TOTOEROI: RISULTATI UFFICIALI!',
            body: `Giornata ${round.gw} omologata! Controlla i tuoi 8 pronostici, la classifica aggiornata e il jackpot della Caccia all’8!`,
            url: 'totoeroi.html',
          }))
        } catch (error) {
          console.warn('TotoEroi omologazione: invio fallito per giornata', round.id, String(error))
        }
      }
    }

    // 3C) RIVALITÀ: giovedì 12:05-12:59, una sola push per
    // franchigia/giornata quando affronta Bestia Nera o Agnello Sacrificale.
    // Le fixtures non hanno una data partita: si usa la prossima GW non giocata.
    if (local.weekday === 'Thu' && isNotificationHour(local)) {
      try {
        results.push(...await sendRivalryMatchNotifications(supabaseAdmin))
      } catch (error) {
        console.warn('Rivalry pre-match notifications non disponibili:', String(error))
      }
    }

    // ==========================================
    // 4) POWER RANKING: mercoledì dalle 12:05 (Bruxelles).
    // SOLO se il CSV presenta una GW non ancora notificata.
    // ==========================================
    if (local.weekday === 'Wed' && isNotificationHour(local)) {
      try {
        const gw = await latestPowerRankingGW()
        if (gw !== null) {
          results.push(await broadcast(supabaseAdmin, {
            eventKey: `power-ranking:2026-27:gw-${gw}`,
            type: 'competition',
            title: '⚡ CHI SALE E CHI PRECIPITA?',
            body: `Il weekend si avvicina! Scopri chi domina il Power Ranking (GW ${gw}), chi sta crollando e dove si trova la tua franchigia.`,
            url: 'statistiche.html',
          }))
        }
      } catch (error) { console.warn('Power Ranking reminder non disponibile:', String(error)) }
    }

    // ==========================================
    // 5) GIOVEDÌ EDITORIALI: 1° franchigie, 2° timeline, 3° draft.
    // Tutti alle 12:05 Bruxelles, una sola notifica/mese.
    // ==========================================
    if (local.weekday === 'Thu' && isNotificationHour(local)) {
      const monthKey = `${local.year}-${String(local.month).padStart(2, '0')}`
      const weekOfMonth = nthWeekOfMonth(local.day)

      if (weekOfMonth === 1) {
        // Profilo completato = pubblicato + campi fondamentali compilati.
        // Mai notificare tutti in caso di errore lettura della tabella.
        const { data: teamProfiles, error: teamProfilesError } = await supabaseAdmin
          .from('team_profiles')
          .select('team_id, is_published, coach_name, city, motto, description, stadium_name')
        if (teamProfilesError) console.warn('Franchigie: lettura profili fallita:', teamProfilesError.message)
        else {
          const { data: teams, error: teamsError } = await supabaseAdmin.from('teams').select('id')
          if (teamsError) console.warn('Franchigie: lettura squadre fallita:', teamsError.message)
          else {
            const profilesMap = new Map((teamProfiles || []).map((p: any) => [String(p.team_id), p]))
            const incompleteIds = (teams || []).filter((t: any) => {
              const profile: any = profilesMap.get(String(t.id))
              if (!profile || profile.is_published !== true) return true
              return ['coach_name', 'city', 'motto', 'description', 'stadium_name']
                .some(field => !String(profile[field] ?? '').trim())
            }).map((t: any) => String(t.id))
            if (incompleteIds.length) {
              results.push(await broadcast(supabaseAdmin, {
                eventKey: `franchigia-profile-monthly:${monthKey}`,
                type: 'system',
                title: '🛡️ DAI UN’IDENTITÀ ALLA TUA FRANCHIGIA!',
                body: 'Hai già completato tutte le informazioni della tua franchigia? Aggiorna la pagina e falla conoscere alla Lega!',
                url: 'franchigie.html',
                teamIds: incompleteIds,
              }))
            }
          }
        }
      } else if (weekOfMonth === 2) {
        results.push(await broadcast(supabaseAdmin, {
          eventKey: `timeline-monthly:${monthKey}`,
          type: 'system',
          title: '📜 UN VIAGGIO NELLA STORIA!',
          body: 'Quante ne sono successe nella Lega degli Eroi? Rivivi i momenti memorabili nella Timeline. Anche le figuracce meritano di essere ricordate!',
          url: 'timeline.html',
        }))
      } else if (weekOfMonth === 3) {
        results.push(await broadcast(supabaseAdmin, {
          eventKey: `draft-dinamico-monthly:${monthKey}`,
          type: 'system',
          title: '🔮 IL FUTURO È GIÀ CAMBIATO!',
          body: 'Le trade stanno rivoluzionando il Draft Dinamico 2027/28! Controlla come sono cambiate le scelte della tua franchigia.',
          url: 'dinamico-draft.html',
        }))
      }
    }

    return new Response(JSON.stringify({
      success: true,
      checked_at: now.toISOString(),
      brussels: local,
      results,
    }), {
      status: 200,
      headers,
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers,
    })
  }
})
