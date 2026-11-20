import { createClient } from 'jsr:@supabase/supabase-js@2';
import * as webpush from 'npm:web-push@3.6.7';

// Isolated adapter: sends to the EXISTING app_notifications & push_subscriptions.
// Never accepts arbitrary recipient/team IDs or client-authored text.
const corsHeaders: Record<string,string> = {
  'Access-Control-Allow-Origin': 'https://ccezzionale.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:corsHeaders});
const clean=(v:unknown,max=450)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,max);
const key=(a:unknown)=>String(a??'');
const siteUrl='https://ccezzionale.github.io/Test/trade-room.html';
const appUrl='trade-room.html';
const vapidSubject=Deno.env.get('VAPID_SUBJECT') || 'mailto:notifications@example.org';
const publicKey=Deno.env.get('VAPID_PUBLIC_KEY');
const privateKey=Deno.env.get('VAPID_PRIVATE_KEY');
if(publicKey&&privateKey) webpush.setVapidDetails(vapidSubject,publicKey,privateKey);

type Message={
  eventKey:string; recipients:string[]; title:string; body:string;
};
type Counts={inserted:number;duplicates:number;failed:number;sent:number;pushFailed:number};

Deno.serve(async (req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return json({error:'Method not allowed'},405);
  try{
    const authHeader=req.headers.get('authorization');
    if(!authHeader)return json({error:'Authentication required'},401);
    const supabaseUser=createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {global:{headers:{Authorization:authHeader}}}
    );
    const {data:{user},error:authError}=await supabaseUser.auth.getUser();
    if(authError||!user)return json({error:'Unauthorized'},401);
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data:caller,error:callerErr}=await db.from('profiles')
      .select('id,team_id,role').eq('id',user.id).maybeSingle();
    if(callerErr||!caller?.team_id)return json({error:'Franchigia non associata al profilo'},403);
    const {data:flag,error:flagError}=await db.from('conditional_feature_settings').select('enabled').eq('id',1).maybeSingle();
    if(flagError||flag?.enabled!==true)return json({error:'Trade condizionate ancora in collaudo'},409);
    const body=await req.json();
    const type=clean(body?.event_type,24);
    const [teams,profiles]=await Promise.all([
      db.from('teams').select('id,name'),
      db.from('profiles').select('id,team_id').not('team_id','is',null)
    ]);
    if(teams.error||profiles.error)throw teams.error||profiles.error;
    const teamNames=new Map((teams.data||[]).map((x:any)=>[key(x.id),String(x.name)]));
    const teamName=(id:unknown)=>clean(teamNames.get(key(id))||'una franchigia',80);
    const usersByTeam=new Map<string,string[]>();
    for(const p of profiles.data||[]){
      const list=usersByTeam.get(key(p.team_id))||[];
      list.push(key(p.id));usersByTeam.set(key(p.team_id),list);
    }
    const allTeams=[...usersByTeam.keys()];
    const msgs:Message[]=[];
    if(type==='proposal'||type==='accepted'||type==='rejected'||type==='cancelled'){
      const offerId=clean(body?.proposal_id,80);
      if(!/^[a-f0-9-]{36}$/i.test(offerId))return json({error:'proposal_id non valido'},400);
      const {data:offer,error:offerError}=await db.from('conditional_trade_offers')
        .select('id,from_team_id,to_team_id,grantor_team_id,holder_team_id,rule_kind,rule_spec,status')
        .eq('id',offerId).maybeSingle();
      if(offerError||!offer)return json({error:'Proposta non trovata'},404);
      if(offer.status!==(type==='proposal'?'pending':type==='accepted'?'accepted':type==='rejected'?'rejected':'cancelled'))
        return json({error:'Stato della trade incompatibile con la notifica'},409);
      const expected=(type==='proposal'||type==='cancelled')?offer.from_team_id:offer.to_team_id;
      if(key(caller.team_id)!==key(expected))return json({error:'Non puoi inviare questa notifica'},403);
      const grantor=teamName(offer.grantor_team_id),holder=teamName(offer.holder_team_id);
      const typeName=offer.rule_kind==='standing'?'classifica':
        offer.rule_kind==='ranked'?'migliore/peggiore pick':
        offer.rule_kind==='trophy'?'trofeo':'diritto già acquisito';
      if(type==='proposal'){
        msgs.push({eventKey:'trade:conditional:'+offerId+':proposal',
          recipients:[key(offer.to_team_id)],
          title:'🔐 Una trade con clausola!',
          body:teamName(offer.from_team_id)+' ti ha proposto una trade condizionata ('+typeName+'). Il futuro si negozia già oggi.'});
      }else if(type==='rejected'){
        msgs.push({eventKey:'trade:conditional:'+offerId+':rejected',
          recipients:[key(offer.from_team_id)],
          title:'❌ Clausola respinta',
          body:teamName(offer.to_team_id)+' ha rifiutato la proposta condizionata. I tuoi capolavori finanziari aspettano.'});
      }else if(type==='cancelled'){
        msgs.push({eventKey:'trade:conditional:'+offerId+':cancelled',
          recipients:[key(offer.to_team_id)],
          title:'↩️ Proposta ritirata',
          body:teamName(offer.from_team_id)+' ha annullato una proposta condizionata.'});
      }else{
        msgs.push({eventKey:'trade:conditional:'+offerId+':accepted',
          recipients:allTeams,title:'🚨 HERE WE GO! Con clausola',
          body:grantor+' e '+holder+' hanno concluso una trade condizionata ('+typeName+'). Il diritto è attivo: la pick sarà assegnata dopo il verdetto.'});
      }
    }else if(type==='resolved_since'){
      const role=key(caller.role).toLowerCase();
      if(role!=='admin'&&role!=='commissioner')return json({error:'Solo Admin e Commissioner possono inviare avvisi di finalizzazione'},403);
      const season=Number(body?.season);
      const since=Date.parse(key(body?.since));
      const now=Date.now();
      if(!Number.isInteger(season)||season<2020||season>2200||
          !Number.isFinite(since)||since>now+60_000||since<now-600_000)
        return json({error:'Stagione o intervallo di finalizzazione non validi'},400);
      const {data:rights,error:rightsErr}=await db.from('conditional_trade_rights')
        .select('id,season,grantor_team_id,holder_team_id,resolved_pick_id,rule_kind,resolved_at')
        .eq('season',season).eq('status','resolved')
        .gte('resolved_at',new Date(since).toISOString()).limit(100);
      if(rightsErr)throw rightsErr;
      for(const r of rights||[]){
        if(!r.resolved_pick_id)continue;
        const {data:pick,error:pickErr}=await db.from('future_draft_picks')
          .select('round,season').eq('id',r.resolved_pick_id).maybeSingle();
        if(pickErr||!pick)continue;
        msgs.push({eventKey:'trade:conditional:right:'+r.id+':resolved',
          recipients:[key(r.grantor_team_id),key(r.holder_team_id)],
          title:'🔓 Condizione risolta!',
          body:'Verdetto ufficiale: la pick R'+pick.round+' '+pick.season+
            ' di '+teamName(r.grantor_team_id)+' è stata assegnata a '+teamName(r.holder_team_id)+'.'});
      }
    }else return json({error:'Tipo di notifica non supportato'},400);

    const totals:Counts={inserted:0,duplicates:0,failed:0,sent:0,pushFailed:0};
    for(const msg of msgs){
      const insertedUsers:string[]=[];
      const recipientUsers=[...new Set(msg.recipients.flatMap(t=>usersByTeam.get(t)||[]))];
      for(const userId of recipientUsers){
        const row={user_id:userId,team_id:(profiles.data||[]).find((p:any)=>key(p.id)===userId)?.team_id||null,
          type:'trade',title:msg.title,body:clean(msg.body,500),url:appUrl,event_key:msg.eventKey};
        const {error}=await db.from('app_notifications').insert(row);
        if(!error){totals.inserted++;insertedUsers.push(userId);}
        else if(error.code==='23505')totals.duplicates++;
        else{totals.failed++;console.warn('Conditional notification write failed:',error.message);}
      }
      if(!insertedUsers.length||!publicKey||!privateKey)continue;
      const {data:subs,error:subsError}=await db.from('push_subscriptions')
        .select('id,user_id,endpoint,p256dh,auth').eq('is_active',true).in('user_id',insertedUsers);
      if(subsError){totals.pushFailed++;console.warn('Conditional push subscriptions error',subsError.message);continue;}
      for(const sub of subs||[]){
        try{
          await webpush.sendNotification({endpoint:sub.endpoint,
            keys:{p256dh:sub.p256dh,auth:sub.auth}},
            JSON.stringify({title:msg.title,body:msg.body,url:siteUrl}));
          totals.sent++;
        }catch(err:any){
          totals.pushFailed++;
          if(err?.statusCode===404||err?.statusCode===410)
            await db.from('push_subscriptions').update({is_active:false,updated_at:new Date().toISOString()}).eq('id',sub.id);
        }
      }
    }
    return json({success:true,events:msgs.length,...totals});
  }catch(error){
    console.warn('Conditional trade notification error',String(error));
    return json({error:'Impossibile inviare la notifica'},500);
  }
});