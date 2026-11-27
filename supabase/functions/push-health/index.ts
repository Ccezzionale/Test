import { createClient } from 'jsr:@supabase/supabase-js@2'
import * as webpush from 'npm:web-push@3.6.7'

const headers = {
  'Access-Control-Allow-Origin': 'https://ccezzionale.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store'
}
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), {status, headers})
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const states = new Set(['active','repair-needed','check-error','permission-denied','permission-default','local-missing','unsupported','opted-out'])
const kinds = new Set(['iOS','Android','Desktop','Altro'])
const hosts = new Set(['fcm.googleapis.com','web.push.apple.com','updates.push.services.mozilla.com'])
function validEndpoint(endpoint: string) {
  try { const u = new URL(endpoint); return u.protocol === 'https:' && hosts.has(u.hostname) && !u.port && !u.username && !u.password }
  catch { return false }
}
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null,{status:204,headers})
  if (req.method !== 'POST') return reply({error:'Metodo non consentito'},405)
  try {
    const auth = req.headers.get('Authorization') || ''
    if (!auth.startsWith('Bearer ')) return reply({error:'Accesso richiesto'},401)
    const url = Deno.env.get('SUPABASE_URL')!
    const userClient = createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:auth}},auth:{persistSession:false}})
    const {data:{user},error:authError} = await userClient.auth.getUser()
    if (authError || !user) return reply({error:'Accesso richiesto'},401)
    const db = createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}})
    const {data:profile,error:profileError} = await db.from('profiles').select('id,role,team_id').eq('id',user.id).maybeSingle()
    if (profileError || !profile?.team_id) return reply({error:'Profilo non autorizzato'},403)
    const body = await req.json()
    if (body.action === 'report') {
      if (!uuid.test(String(body.device_id)) || !states.has(body.status) || !kinds.has(body.device_kind)) return reply({error:'Dati non validi'},400)
      const {data:known,error:kerr} = await db.from('push_health_devices').select('status,checked_at').eq('user_id',user.id).eq('device_id',body.device_id).maybeSingle()
      if (kerr) throw kerr
      if (known?.status === body.status && Date.now()-Date.parse(known.checked_at)<5*60*1000) return reply({ok:true,throttled:true})
      if (!known) {
        const {count,error} = await db.from('push_health_devices').select('device_id',{head:true,count:'exact'}).eq('user_id',user.id)
        if (error) throw error
        if ((count||0)>=30) return reply({error:'Limite dispositivi diagnostici'},429)
      }
      const {error} = await db.from('push_health_devices').upsert({user_id:user.id,device_id:body.device_id,device_kind:body.device_kind,status:body.status,checked_at:new Date().toISOString()},{onConflict:'user_id,device_id'})
      if (error) throw error
      return reply({ok:true})
    }
    // Authorization is server-side, based on the existing admin role.
    if (profile.role !== 'admin') return reply({error:'Riservato agli amministratori'},403)
    if (body.action === 'list') {
      const results = await Promise.all([
        db.from('profiles').select('id,email,team_id,role').not('team_id','is',null),
        db.from('teams').select('id,name'),
        db.from('push_subscriptions').select('user_id,is_active,updated_at,disabled_reason,disabled_source,disabled_at'),
        db.from('push_health_devices').select('user_id,device_id,device_kind,status,checked_at').order('checked_at',{ascending:false}),
        db.from('push_health_tests').select('target_user_id,requested_at,completed_at,accepted,failed,expired').order('requested_at',{ascending:false}).limit(500),
        db.from('push_subscription_events').select('user_id,occurred_at,reason,source').order('occurred_at',{ascending:false}).limit(1000)
      ])
      if (results.some(r=>r.error)) throw results.find(r=>r.error)?.error
      const [profiles,teams,subs,devices,tests,events] = results.map(r=>r.data||[])
      const accounts = profiles.map((p:any)=>{
        const own = subs.filter((s:any)=>s.user_id===p.id)
        const lastEvent = events.find((e:any)=>e.user_id===p.id)
        return {id:p.id,email:p.email,role:p.role,team:teams.find((t:any)=>t.id===p.team_id)?.name||'Senza squadra',
          active:own.filter((s:any)=>s.is_active===true).length,
          inactive:own.filter((s:any)=>s.is_active===false).length,
          last_disabled:lastEvent?{disabled_reason:lastEvent.reason,disabled_source:lastEvent.source,disabled_at:lastEvent.occurred_at}:null,
          devices:devices.filter((d:any)=>d.user_id===p.id).map(({device_kind,status,checked_at}:any)=>({device_kind,status,checked_at})),
          last_test:tests.find((t:any)=>t.target_user_id===p.id)||null}
      }).sort((a:any,b:any)=>a.team.localeCompare(b.team)||a.email.localeCompare(b.email))
      return reply({accounts})
    }
    if (body.action !== 'test' || !uuid.test(String(body.target_user_id))) return reply({error:'Azione non valida'},400)
    const target = body.target_user_id
    const {data:targetProfile,error:targetError} = await db.from('profiles').select('id,team_id').eq('id',target).maybeSingle()
    if (targetError || !targetProfile?.team_id) return reply({error:'Allenatore non trovato'},404)
    const {data:subs,error:subError} = await db.from('push_subscriptions').select('id,endpoint,p256dh,auth').eq('user_id',target).eq('is_active',true).limit(20)
    if (subError) throw subError
    if (!subs?.length) return reply({error:'Nessuna registrazione push attiva per questo account'},409)
    const bucket = Math.floor(Date.now()/(10*60*1000))
    const {error:lockError} = await db.from('push_health_tests').insert({target_user_id:target,bucket,requested_by:user.id})
    if (lockError?.code === '23505') return reply({error:'Test già richiesto in questa finestra di 10 minuti'},429)
    if (lockError) throw lockError
    webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT')||'https://ccezzionale.github.io/Test/',Deno.env.get('VAPID_PUBLIC_KEY')!,Deno.env.get('VAPID_PRIVATE_KEY')!)
    const payload = JSON.stringify({title:'Lega degli Eroi · Test push',body:'Notifica di prova inviata dal Commissioner. Nessuna azione richiesta.',url:'https://ccezzionale.github.io/Test/'})
    const outcomes = await Promise.all(subs.map(async sub=>{
      if (!validEndpoint(sub.endpoint)) return 'failed'
      try {
        await webpush.sendNotification({endpoint:sub.endpoint,keys:{p256dh:sub.p256dh,auth:sub.auth}},payload,{TTL:60,timeout:10000})
        return 'accepted'
      } catch(e:any) {
        if (e?.statusCode===404 || e?.statusCode===410) {
          // Same invalidation rule as the existing senders; no reactivation.
          await db.from('push_subscriptions').update({is_active:false, disabled_reason: `provider_${e.statusCode}`, disabled_source: 'push-health',updated_at:new Date().toISOString()}).eq('id',sub.id).eq('user_id',target).eq('endpoint',sub.endpoint)
          return 'expired'
        }
        return 'failed'
      }
    }))
    const accepted = outcomes.filter(o=>o==='accepted').length
    const expired = outcomes.filter(o=>o==='expired').length
    const failed = outcomes.length-accepted
    const {error:saveError} = await db.from('push_health_tests').update({accepted,failed,expired,completed_at:new Date().toISOString()}).eq('target_user_id',target).eq('bucket',bucket)
    if (saveError) console.error('Push health test result not recorded',saveError.code)
    return reply({accepted,failed,expired})
  } catch(e) {
    console.error('Push health error',e instanceof Error?e.name:'database error')
    return reply({error:'Controllo push non riuscito'},500)
  }
})
