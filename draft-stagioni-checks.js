/* Dry-run di stagione: SOLO letture. Nessun reset o switch via client. */
import {supabase} from "./supabase.js";
const SEASON=2027, $=id=>document.getElementById(id);
function status(label,detail,okay){
 const div=document.createElement("div");div.className="season-status-line";
 const left=document.createElement("strong");left.textContent=(okay?"✓ ":"⚠ ")+label;
 const right=document.createElement("span");right.className="status "+(okay?"okay":"blocked");
 right.textContent=detail;div.append(left,right);return div;
}
async function check(){
 const btn=$("season-switch-check"),report=$("season-switch-report");btn.disabled=true;
 report.replaceChildren();report.append(status("Controllo avviato","Lettura dati",true));
 try{
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)throw Error("Accedi come Commissioner.");
  const {data:profile,error:profileError}=await supabase.from("profiles").select("role").eq("id",user.id).single();
  if(profileError||profile?.role!=="admin")throw Error("Operazione riservata al Commissioner.");

  const req=[
   ["stagione",supabase.from("draft_seasons").select("season,status").eq("season",SEASON).maybeSingle()],
   ["archivio",supabase.from("draft_season_archives").select("draft_name,order_rows,pick_rows").eq("season",2026)],
   ["listoni",supabase.from("draft_season_listone_staging").select("pool,player_count").eq("season",SEASON)],
   ["proiezioni",supabase.from("draft_season_order_previews").select("draft_name,projected_picks,last_matchday,stage").eq("season",SEASON)],
   ["future",supabase.from("future_draft_picks").select("id,draft_name,owner_team_id,original_team_id,status").eq("season",SEASON)],
   ["keepers",supabase.from("keeper_settings").select("season,is_applied,applied_at").eq("id",1).maybeSingle()],
   ["selezioni",supabase.from("keeper_selections").select("id,status,selection_type").eq("season",SEASON)],
   ["diritti",supabase.from("conditional_trade_rights").select("id,status").eq("season",SEASON)],
   ["live",supabase.from("draft_state").select("draft_name,current_pick,is_open")]
  ];
  const results=await Promise.all(req.map(async ([name,q])=>[name,await q]));
  const data={};
  for(const [name,result] of results){
    if(result.error)throw Error("Lettura "+name+": "+result.error.message);
    data[name]=result.data;
  }

  const checkItems=[],add=(title,detail,pass)=>checkItems.push({title,detail,pass:!!pass});
  add("Stagione in preparazione",data.stagione?.status||"Non configurata",data.stagione?.status==="preparing");
  const drafts=["Draft Conference","Draft Championship"];
  const archives=Array.isArray(data.archivio)?data.archivio:[];
  const archived=drafts.every(name=>{
    const d=archives.find(x=>x.draft_name===name);
    return d?.pick_rows?.length===184&&d?.order_rows?.length===184;
  });
  add("Archivio 2026/27",archived?"368 chiamate archiviate":"Archivio incompleto",archived);
  const rows=Array.isArray(data.listoni)?data.listoni:[];
  const haveListones=["conference_league","conference_championship"].every(pool=>rows.some(r=>r.pool===pool&&r.player_count>=100));
  add("Due listoni Mantra",haveListones?"Entrambi caricati":"Caricare gli Excel per entrambe le Conference",haveListones);

  const staged=Array.isArray(data.proiezioni)?data.proiezioni:[];
  const futures=Array.isArray(data.future)?data.future:[];
  let ordersOK=true,fresh=true,pickTotal=0;
  for(const name of drafts){
   const draft=staged.find(x=>x.draft_name===name);
   const pickRows=draft?.projected_picks||[];
   const registered=futures.filter(x=>x.draft_name===name&&x.status==="active");
   const byId=new Map(registered.map(p=>[String(p.id),p]));
   const seen=new Set();
   if(draft?.stage!=="provisional"||!Array.isArray(pickRows)||pickRows.length!==registered.length||!registered.length)ordersOK=false;
   for(const p of pickRows){
     const id=String(p.future_pick_id||""),current=byId.get(id);
     if(!current||seen.has(id)||current.owner_team_id!==p.team_id||current.original_team_id!==p.original_team_id)ordersOK=false;
     seen.add(id);
   }
   if(seen.size!==registered.length)ordersOK=false;
   if(Number(draft?.last_matchday||0)<29)fresh=false;
   pickTotal+=pickRows.length;
  }
  add("Proiezioni collegate alle trade",ordersOK?pickTotal+" pick coerenti":"Ricalcolare e salvare il Draft Dinamico",ordersOK);
  add("Regular Season conclusa",fresh?"Proiezione da risultati finali":"Classifica ancora provvisoria o proiezione mancante",fresh);

  const keeperOK=data.keepers?.season===SEASON && data.keepers?.is_applied===true &&
    String(data.keepers?.applied_at||"").startsWith(String(SEASON)+"-");
  add("Pre-Draft 2027",keeperOK?"Conferme applicate nel 2027":"Conferme non applicate nel 2027, o data incoerente",keeperOK);
  const selections=Array.isArray(data.selezioni)?data.selezioni:[];
  const keepersPresent=selections.length>0;
  add("Conferme FP / U21 / RFA",keepersPresent?selections.length+" selezioni presenti":"Conferme Pre-Draft non ancora registrate",keepersPresent);

  const unresolved=(Array.isArray(data.diritti)?data.diritti:[]).filter(x=>!["resolved","cancelled","void"].includes(String(x.status||"").toLowerCase()));
  add("Diritti condizionati",unresolved.length?unresolved.length+" diritti da risolvere":"Nessun diritto pendente",unresolved.length===0);
  const liveClosed=drafts.every(name=>data.live?.find(d=>d.draft_name===name)?.is_open===false);
  add("Draft 2026/27 protetto",liveClosed?"Entrambe le Conference chiuse":"Controllare lo stato dei Draft 2026/27",liveClosed);

  report.replaceChildren();
  checkItems.forEach(x=>report.append(status(x.title,x.detail,x.pass)));
  const passed=checkItems.filter(x=>x.pass).length;
  report.prepend(status("Esito della simulazione",passed+"/"+checkItems.length+" verifiche superate",passed===checkItems.length));
  const final=document.createElement("p");final.className="season-help";
  final.textContent="Simulazione terminata. Nessun dato modificato. L'attivazione ufficiale resta disabilitata anche se tutti i controlli sono superati.";
  report.append(final);
 }catch(error){
   report.replaceChildren(status("Controllo non completato",error.message||String(error),false));
 }finally{btn.disabled=false}
}
$("season-switch-check")?.addEventListener("click",check);
