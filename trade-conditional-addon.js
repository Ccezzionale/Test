import {supabase} from "./supabase.js";
import {TROPHY_COMPETITIONS} from "./conditional-trades-core.js";

/*
 * Conditional Trade Room extension. Independent from trade-room.js.
 * A database feature gate prevents real writes until outcomes and E2E tests
 * are complete. No ordinary trade logic is replaced or monkey-patched.
 */
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const state={me:null,teams:[],picks:[],players:[],waiverCalls:[],extraFrom:new Set(),extraTo:new Set(),rights:[],offers:[],locks:new Set(),settings:null,enabled:false,mode:"classic"};
const team=id=>state.teams.find(t=>String(t.id)===String(id));
const name=id=>team(id)?.name||"Franchigia";
const myId=()=>state.me?.team_id;
const targetId=()=>$("v2TargetTeam")?.value||"";
const grantorId=()=>$("ctGrantorSide")?.value==="theirs"?targetId():myId();
const holderId=()=>$("ctGrantorSide")?.value==="theirs"?myId():targetId();
const mySide= id=>String(id)===String(myId());
const same=(a,b)=>String(a)===String(b);
const locked=id=>state.locks.has(String(id));
const pickTitle=p=>p?"R"+p.round+" "+p.season+" · "+name(p.original_team_id):"Pick futura";
const kindLabel=k=>({standing:"Classifica",ranked:"Migliore / peggiore",trophy:"Premi / Trofei",right_transfer:"Rivendita diritto"})[k]||k;
const formatDate=s=>s?new Date(s).toLocaleDateString("it-BE",{day:"2-digit",month:"short",year:"numeric"}):"";
const failure=(id,text)=>{const box=$(id);if(!box)return;box.textContent=text||"";box.classList.toggle("is-error",!!text)};
const sorted=rows=>[...rows].sort((a,b)=>
  Number(a.round)-Number(b.round)||
  name(a.original_team_id).localeCompare(name(b.original_team_id),"it")||
  String(a.id).localeCompare(String(b.id)));
function picksOf(owner){return sorted(state.picks.filter(p=>same(p.owner_team_id,owner)&&!locked(p.id)&&p.status==="active"&&p.pick_kind==="normal"));}
function options(rows,empty=false){
  return (empty?'<option value="">Seleziona una pick...</option>':"")+
    rows.map(p=>'<option value="'+esc(p.id)+'">'+esc(pickTitle(p))+'</option>').join("");
}
function fill(id,html,prefer=null){
  const sel=$(id);if(!sel)return;
  const old=prefer??sel.value;
  sel.innerHTML=html;
  if([...sel.options].some(o=>o.value===String(old)))sel.value=String(old);
}
function marketOpen(){
  const s=state.settings;
  if(!s?.market_open)return false;
  const n=Date.now();
  return (!s.market_open_at||n>=Date.parse(s.market_open_at))&&
    (!s.market_close_at||n<=Date.parse(s.market_close_at));
}
function eligibleTrophies(){
  const t=team($("ctTrophySubject").value);
  return TROPHY_COMPETITIONS.filter(c=>c.id!=="conference_league"&&c.id!=="conference_championship"||
    (c.id==="conference_league"&&t?.conference==="Conference League")||
    (c.id==="conference_championship"&&t?.conference==="Conference Championship"));
}
function selectedCandidates(){
  return [...document.querySelectorAll("#ctRankedCandidates input[type=checkbox]:checked")].map(e=>e.value);
}
function refreshScope(){
  const subject=team($("ctStandingSubject").value);
  const scope=$("ctStandingScope").value;
  const count=scope==="round_robin"?state.teams.length:state.teams.filter(t=>t.conference===subject?.conference).length;
  const top=Number($("ctTopCount").value),bottom=Number($("ctBottomCount").value);
  $("ctStandingSize").textContent=scope==="round_robin"?"Round Robin · "+count+" squadre":(subject?.conference||"Conference")+" · "+count+" squadre";
  $("ctTopCount").max=count-1;$("ctBottomCount").max=count-1;
  $("ctMiddleField").hidden=!(top>=1&&bottom>=1&&top+bottom<count);
  redrawSummary();
}
function refreshSpecificTrophy(){
  const catalog=eligibleTrophies();
  fill("ctTrophySpecific",catalog.map(x=>'<option value="'+x.id+'">'+esc(x.name)+'</option>').join(""));
  $("ctTrophySpecificField").hidden=$("ctTrophyMode").value!=="specific_trophy";
  redrawSummary();
}
function refreshCandidates(){
  const owner=grantorId();
  const available=picksOf(owner);
  const pref4=available.find(p=>p.round===4&&same(p.original_team_id,owner));
  const pref5=available.find(p=>p.round===5&&same(p.original_team_id,owner));
  fill("ctTopPick",options(available),pref4?.id);
  fill("ctBottomPick",options(available),pref5?.id);
  fill("ctMiddlePick",options(available,true));
  fill("ctWonPick",options(available),pref4?.id);
  fill("ctNotWonPick",options(available),pref5?.id);
  const rounds=[...new Set(available.map(p=>p.round))].sort((a,b)=>a-b);
  fill("ctRankedRound",rounds.map(r=>'<option value="'+r+'">Round '+r+'</option>').join(""),$("ctRankedRound").value||"1");
  drawRanked();
  const counter=picksOf(holderId());
  fill("ctCounterPick",options(counter,true));
  $("ctCounterDescription").textContent=name(holderId())+
    " offre una pick futura in cambio del diritto di "+name(grantorId())+".";
  const resell=state.rights.filter(r=>r.status==="active"&&same(r.holder_team_id,grantorId()));
  fill("ctExistingRight",'<option value="">Seleziona il diritto...</option>'+
    resell.map(r=>'<option value="'+esc(r.id)+'">'+esc(kindLabel(r.rule_kind)+" · "+name(r.grantor_team_id)+" · "+r.season)+'</option>').join(""));
  redrawSummary();
}
function drawRanked(){
  const p=picksOf(grantorId()).filter(p=>Number(p.round)===Number($("ctRankedRound").value));
  const existing=new Set(selectedCandidates());
  const selected=existing.size?existing:new Set(p.map(x=>String(x.id)));
  $("ctRankedCandidates").innerHTML=p.length?p.map(x=>
    '<label><input type="checkbox" value="'+esc(x.id)+'"'+(selected.has(String(x.id))?' checked':'')+'>'+
    '<span>'+esc(pickTitle(x))+'</span></label>').join(""):
    '<p class="ct-field-help">Nessuna scelta disponibile per questo round.</p>';
  $("ctRankedCandidates").querySelectorAll("input").forEach(e=>e.addEventListener("change",redrawSummary));
}
function refreshKind(){
  const kind=$("ctKind").value;
  for(const k of ["standing","ranked","trophy","transfer"]){
    const id=k==="transfer"?"ctTransferFields":"ct"+k.charAt(0).toUpperCase()+k.slice(1)+"Fields";
    $(id).hidden=(k!==(kind==="right_transfer"?"transfer":kind));
  }
  $("ctGrantorSide").disabled=kind==="right_transfer"&&false;
  refreshCandidates();
}
function pickText(id){
  if(!id)return "Da selezionare";
  const p=state.picks.find(x=>same(x.id,id));
  return p?pickTitle(p):"Scelta "+String(id).slice(0,8)+"…";
}
function ruleDetails(kind,rule,ids=[]){
  const r=rule||{};
  if(kind==="standing"){
    const out=[
      "Se arriva nei primi "+r.top_count+" → "+pickText(r.top_pick_id),
      "Se arriva negli ultimi "+r.bottom_count+" → "+pickText(r.bottom_pick_id)
    ];
    if(r.middle_pick_id)out.push("Posizioni intermedie → "+pickText(r.middle_pick_id));
    return out;
  }
  if(kind==="ranked"){
    return [(r.which==="best"?"Migliore":"Peggiore")+" tra: "+(ids||[]).map(pickText).join(" · ")];
  }
  if(kind==="trophy"){
    const title=r.mode==="any_trophy"?"almeno un trofeo":
      TROPHY_COMPETITIONS.find(c=>c.id===r.competition_id)?.name||"il trofeo indicato";
    return ["Se "+name(r.subject_team_id)+" conquista "+title+" → "+pickText(r.won_pick_id),
      "Se NON lo conquista → "+pickText(r.not_won_pick_id)];
  }
  if(kind==="right_transfer")return ["Il diritto e la clausola originale restano invariati."];
  return [];
}
function editingRule(){
  const kind=$("ctKind").value;
  if(kind==="standing"){
    const t=Number($("ctTopCount").value),b=Number($("ctBottomCount").value);
    const subject=$("ctStandingSubject").value;
    const count=$("ctStandingScope").value==="round_robin"?state.teams.length:
      state.teams.filter(x=>x.conference===team(subject)?.conference).length;
    return {rule:{top_count:t,bottom_count:b,top_pick_id:$("ctTopPick").value,
      bottom_pick_id:$("ctBottomPick").value,
      middle_pick_id:t+b<count?$("ctMiddlePick").value:null},ids:[]};
  }
  if(kind==="ranked")return {rule:{which:$("ctRankedWhich").value},ids:selectedCandidates()};
  if(kind==="trophy")return {rule:{mode:$("ctTrophyMode").value,
    subject_team_id:$("ctTrophySubject").value,
    competition_id:$("ctTrophySpecific").value,
    won_pick_id:$("ctWonPick").value,not_won_pick_id:$("ctNotWonPick").value},ids:[]};
  return {rule:{},ids:[]};
}
function redrawSummary(){
  const kind=$("ctKind").value,owner=grantorId(),holder=holderId();
  const winner=kind==="trophy"?$("ctTrophyMode").value:null;
  let clause=kindLabel(kind);
  if(kind==="standing")clause+=" · "+($("ctStandingScope").value==="conference"?"Conference":"Round Robin")+
    " · "+name($("ctStandingSubject").value);
  if(kind==="ranked")clause+=" · "+($("ctRankedWhich").value==="best"?"migliore":"peggiore")+
    " · R"+$("ctRankedRound").value;
  if(kind==="trophy")clause+=" · "+(winner==="any_trophy"?"Qualsiasi trofeo":
    $("ctTrophySpecific").selectedOptions?.[0]?.textContent||"")+
    " · "+name($("ctTrophySubject").value);
  if(kind==="right_transfer")clause+=" · "+$("ctExistingRight").selectedOptions?.[0]?.textContent;
  const details=editingRule();
  $("ctTradeSummary").innerHTML="<strong>"+esc(name(owner))+" → "+esc(name(holder))+"</strong><br>"+
    esc(clause)+"<ul class=\"ct-clause-list\">"+
    ruleDetails(kind,details.rule,details.ids).map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>"+
    "<strong>Contropartita 1:1:</strong> "+esc(pickText($("ctCounterPick").value))+
    "<br><small>Una clausola vale una sola pick. Le candidate restano vincolate fino al verdetto ufficiale.</small>";
  const reason=!state.enabled
    ?"Le trade condizionate sono in collaudo. L'invio reale sarà sbloccato solo dopo i test completi."
    :!marketOpen()?"Il mercato è chiuso."
    :!targetId()?"Scegli prima una franchigia con cui trattare."
    :team(owner)?.conference!==team(holder)?.conference?"Condizioni fra Conferences diverse non ancora supportate.":"";
  $("ctSendOffer").disabled=!!reason;
  failure("ctFormNotice",reason);
}
function conditionPayload(){
  const owner=grantorId(),holder=holderId(),kind=$("ctKind").value;
  const to=targetId();
  if(!to)throw new Error("Seleziona la franchigia destinataria.");
  if(same(owner,holder))throw new Error("La squadra che cede e quella che riceve devono essere diverse.");
  if(team(owner)?.conference!==team(holder)?.conference)throw new Error("Trade condizionata inter-Conference non ancora supportata.");
  const counter=$("ctCounterPick").value;
  if(!counter)throw new Error("Seleziona la pick di contropartita, necessaria per il rapporto 1:1.");
  const payload={p_to_team_id:to,p_grantor_team_id:owner,
    p_rule_kind:kind,p_rule_spec:{},p_candidate_pick_ids:[],p_counter_pick_id:counter,
    p_existing_right_id:null};
  if(kind==="right_transfer"){
    const id=$("ctExistingRight").value;
    if(!id)throw new Error("Seleziona il diritto da rivendere.");
    payload.p_existing_right_id=id;
    return payload;
  }
  if(kind==="standing"){
    const top=Number($("ctTopCount").value),bottom=Number($("ctBottomCount").value);
    const subject=$("ctStandingSubject").value,scope=$("ctStandingScope").value;
    const count=scope==="round_robin"?state.teams.length:state.teams.filter(t=>t.conference===team(subject)?.conference).length;
    if(!Number.isInteger(top)||!Number.isInteger(bottom)||top<1||bottom<1||top+bottom>count){
      throw new Error("Le fasce di classifica non sono valide.");
    }
    const t=$("ctTopPick").value,b=$("ctBottomPick").value,m=$("ctMiddlePick").value;
    if(!t||!b||t===b)throw new Error("Scegli pick differenti per le fasce alta e bassa.");
    if(top+bottom<count&&!m)throw new Error("Indica la pick anche per le posizioni intermedie.");
    payload.p_candidate_pick_ids=[...new Set([t,b,...(top+bottom<count?[m]:[])])];
    payload.p_rule_spec={scope,subject_team_id:subject,top_count:top,bottom_count:bottom,
      top_pick_id:t,bottom_pick_id:b,middle_pick_id:top+bottom<count?m:null};
  }else if(kind==="ranked"){
    const ids=selectedCandidates();
    if(ids.length<2)throw new Error("Seleziona almeno due pick candidate dello stesso round.");
    payload.p_candidate_pick_ids=ids;
    payload.p_rule_spec={which:$("ctRankedWhich").value};
  }else if(kind==="trophy"){
    const won=$("ctWonPick").value,notWon=$("ctNotWonPick").value;
    if(!won||!notWon||won===notWon)throw new Error("Scegli due pick diverse per vittoria e mancata vittoria.");
    payload.p_candidate_pick_ids=[won,notWon];
    payload.p_rule_spec={mode:$("ctTrophyMode").value,
      subject_team_id:$("ctTrophySubject").value,won_pick_id:won,not_won_pick_id:notWon,
      competition_id:$("ctTrophyMode").value==="specific_trophy"?$("ctTrophySpecific").value:null};
  }else throw new Error("Tipo di condizione sconosciuto.");
  if(payload.p_candidate_pick_ids.includes(counter))throw new Error("La contropartita non può essere una delle pick candidate.");
  return payload;
}
function setMode(next){
  state.mode=next;
  const isCond=next==="conditional";
  $("ctModeClassic").classList.toggle("is-active",!isCond);
  $("ctModeConditional").classList.toggle("is-active",isCond);
  $("ctModeClassic").setAttribute("aria-selected",String(!isCond));
  $("ctModeConditional").setAttribute("aria-selected",String(isCond));
  $("ctClassicComposer").hidden=isCond;
  $("ctConditionalComposer").hidden=!isCond;
  if(isCond)refreshCandidates();
}
function offerDescription(o){
  const r=o.rule_spec||{};
  if(o.rule_kind==="standing"){
    return "Classifica "+(r.scope==="conference"?"Conference":"Round Robin")+" · "+name(r.subject_team_id)+
      " · primi "+r.top_count+" / ultimi "+r.bottom_count;
  }
  if(o.rule_kind==="ranked")return "Pick "+(r.which==="best"?"migliore":"peggiore")+" tra "+o.candidate_pick_ids.length+" candidate";
  if(o.rule_kind==="trophy"){
    const trophy=TROPHY_COMPETITIONS.find(c=>c.id===r.competition_id);
    return name(r.subject_team_id)+(r.mode==="any_trophy"?" conquista un trofeo":" vince "+(trophy?.name||"un trofeo"));
  }
  return "Rivendita del diritto condizionato";
}
function paintOffers(){
  const panel=$("ctOffersPanel"),items=$("ctOfferItems");if(!panel||!items)return;
  const sub=document.querySelector(".v2-subtabs button.active")?.dataset.v2Subtab||"received";
  const list=state.offers.filter(o=>sub==="sent"?same(o.from_team_id,myId()):same(o.to_team_id,myId()));
  panel.hidden=list.length===0;
  items.innerHTML=list.length?list.map(o=>{
    const incoming=same(o.to_team_id,myId()),awaiting=o.status==="pending";
    const owner=name(o.grantor_team_id),holder=name(o.holder_team_id);
    return '<article class="ct-offer-card"><header><strong>'+esc(owner)+' → '+esc(holder)+'</strong>'+
      '<span class="ct-status">'+esc(({pending:"In attesa",accepted:"Accettata",rejected:"Rifiutata",cancelled:"Annullata"})[o.status]||o.status)+'</span></header>'+
      '<p>'+esc(offerDescription(o))+'</p>'+
      '<ul class="ct-clause-list">'+ruleDetails(o.rule_kind,o.rule_spec,o.candidate_pick_ids).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+
      '<p>Contropartita: '+esc(pickText(o.counter_pick_id))+'</p>'+
      '<p>Proposta: '+esc(formatDate(o.created_at))+'</p>'+
      (awaiting?'<div class="ct-action-row">'+(incoming?
        '<button class="ct-action-primary" data-ct-accept="'+esc(o.id)+'"'+(!state.enabled?" disabled":"")+'>Accetta</button>'+
        '<button class="ct-action-red" data-ct-reject="'+esc(o.id)+'"'+(!state.enabled?" disabled":"")+'>Rifiuta</button>':
        '<button class="ct-action-red" data-ct-cancel="'+esc(o.id)+'"'+(!state.enabled?" disabled":"")+'>Annulla</button>')+
      '</div>':'')+'</article>';
  }).join(""):'';
}
function paintRights(){
  const panel=$("ctRightsPanel"),items=$("ctRightItems");if(!panel||!items)return;
  const list=state.rights.filter(r=>r.status==="active"&&(
    same(r.grantor_team_id,myId())||same(r.holder_team_id,myId())));
  panel.hidden=!list.length;
  items.innerHTML=list.map(r=>
    '<article class="ct-right-card"><header><strong>'+esc(kindLabel(r.rule_kind))+'</strong><span class="ct-status">In attesa</span></header>'+
    '<p>Diritto: '+esc(name(r.holder_team_id))+' · promesso da '+esc(name(r.grantor_team_id))+'</p>'+
    '<p>Draft '+esc(r.season)+' · '+esc(r.draft_name)+'</p>'+
    (same(r.holder_team_id,myId())?'<div class="ct-action-row"><button type="button" data-ct-resell="'+esc(r.id)+'">⇄ Rivendi il diritto</button></div>':'')+'</article>'
  ).join("");
}
async function reload(){
  const [p,o,r,c,s,pl]=await Promise.all([
    supabase.from("future_draft_picks").select("id,season,draft_name,round,original_team_id,owner_team_id,pick_kind,status").eq("season",state.settings?.future_pick_season||2027).eq("status","active"),
    supabase.from("conditional_trade_offers").select("*").order("created_at",{ascending:false}).limit(150),
    supabase.from("conditional_trade_rights").select("*").order("created_at",{ascending:false}).limit(150),
    supabase.from("conditional_trade_candidates").select("pick_id,is_locked").eq("is_locked",true),
    supabase.from("conditional_feature_settings").select("enabled").eq("id",1).maybeSingle(),
    supabase.from("players").select("id,name,owner_team_id,status,role_mantra,role,is_u21_slot").eq("status","active")
  ]);
  for(const x of [p,o,r,c,s,pl])if(x.error)throw x.error;
  state.picks=p.data||[];state.players=pl.data||[];state.offers=o.data||[];state.rights=r.data||[];
  state.locks=new Set((c.data||[]).map(x=>String(x.pick_id)));
  state.enabled=s.data?.enabled===true;
  refreshCandidates();paintOffers();paintRights();
}
function bind(){
  $("ctModeClassic").addEventListener("click",()=>setMode("classic"));
  for(const [buttonId,side,doneId] of [
    ["ctQuickGive","mine","v2DoneGive"],
    ["ctQuickWant","theirs","v2DoneWant"]
  ]){
    $(buttonId).addEventListener("click",()=>{
      // Chiude il selettore standard prima di aprire il contratto condizionato.
      $(doneId)?.click();
      $("ctGrantorSide").value=side;
      $("ctKind").value="standing";
      setMode("conditional");
      refreshKind();
      $("ctConditionalComposer").scrollIntoView({behavior:"smooth",block:"start"});
    });
  }
  $("ctModeConditional").addEventListener("click",()=>setMode("conditional"));
  $("ctKind").addEventListener("change",refreshKind);
  $("ctGrantorSide").addEventListener("change",()=>{$("ctRankedCandidates").innerHTML="";refreshCandidates();});
  $("v2TargetTeam").addEventListener("change",()=>{$("ctRankedCandidates").innerHTML="";refreshCandidates();});
  $("ctStandingSubject").addEventListener("change",refreshScope);
  $("ctStandingScope").addEventListener("change",refreshScope);
  $("ctTopCount").addEventListener("change",refreshScope);
  $("ctBottomCount").addEventListener("change",refreshScope);
  $("ctRankedRound").addEventListener("change",()=>{$("ctRankedCandidates").innerHTML="";drawRanked();redrawSummary();});
  $("ctTrophySubject").addEventListener("change",refreshSpecificTrophy);
  $("ctTrophyMode").addEventListener("change",refreshSpecificTrophy);
  for(const id of ["ctTopPick","ctBottomPick","ctMiddlePick","ctWonPick","ctNotWonPick","ctTrophySpecific",
    "ctCounterPick","ctRankedWhich","ctExistingRight"]){
    $(id).addEventListener("change",redrawSummary);
  }
  $("ctSendOffer").addEventListener("click",sendOffer);
  $("ctOfferItems").addEventListener("click",offerAction);
  $("ctRightItems").addEventListener("click",event=>{
    const sell=event.target.closest("[data-ct-resell]");
    if(!sell)return;
    document.querySelector("[data-v2-new]")?.click();
    setMode("conditional");
    $("ctGrantorSide").value="mine";
    $("ctKind").value="right_transfer";
    refreshKind();
    $("ctExistingRight").value=sell.dataset.ctResell;
    redrawSummary();
  });
  document.querySelectorAll("[data-v2-subtab]").forEach(b=>b.addEventListener("click",()=>queueMicrotask(paintOffers)));
}
async function notifyConditionalTrade(eventType,proposalId){
  // Reuses the current app_notifications + push_subscriptions infrastructure.
  // The Edge Function verifies the signed-in actor against the stored contract.
  try{
    if(!proposalId)return false;
    const {data,error}=await supabase.functions.invoke("send-conditional-trade-notification",{
      body:{proposal_id:proposalId,event_type:eventType}
    });
    if(error||data?.success!==true){
      console.warn("Notifica trade condizionata non inviata:",error||data);
      return false;
    }
    return data.failed===0;
  }catch(error){
    console.warn("Errore invio notifica trade condizionata:",error);
    return false;
  }
}

async function sendOffer(){
  try{
    if(!state.enabled)throw new Error("Le trade condizionate sono ancora in collaudo.");
    if(!marketOpen())throw new Error("Il mercato è chiuso.");
    const payload=conditionPayload();
    if(!window.confirm("Inviare una proposta condizionata REALE a "+name(targetId())+"? La contropartita è una pick futura e il diritto sarà vincolante dopo l'accettazione."))return;
    $("ctSendOffer").disabled=true;failure("ctFormNotice","Invio della proposta...");
    const {data:offerId,error}=await supabase.rpc("conditional_create_offer",payload);
    if(error)throw error;
    const noticeSent=await notifyConditionalTrade("proposal",offerId);
    failure("ctFormNotice","");
    await reload();
    $("ctFormNotice").textContent="Proposta condizionata inviata. "+(noticeSent
      ?"Il destinatario è stato avvisato.":"Il destinatario può vederla in Proposte; la notifica non è stata confermata.");
    $("ctFormNotice").classList.remove("is-error");
  }catch(err){failure("ctFormNotice",err.message||"Impossibile inviare la proposta.");}
  finally{redrawSummary();}
}
async function offerAction(event){
  const btn=event.target.closest("[data-ct-accept],[data-ct-reject],[data-ct-cancel]");
  if(!btn)return;
  const action=btn.dataset.ctAccept?"accept":btn.dataset.ctReject?"reject":"cancel";
  const id=btn.dataset.ctAccept||btn.dataset.ctReject||btn.dataset.ctCancel;
  if(!window.confirm(action==="accept"?"Accettare questa trade condizionata REALE? La contropartita sarà ceduta subito e le pick candidate verranno vincolate.":action==="reject"?"Rifiutare questa proposta?":"Annullare questa proposta?"))return;
  btn.disabled=true;
  try{
    const response=action==="cancel"?
      await supabase.rpc("conditional_cancel_offer",{p_offer_id:id}):
      await supabase.rpc("conditional_respond_offer",{p_offer_id:id,p_accept:action==="accept"});
    if(response.error)throw response.error;
    const eventType=action==="accept"?"accepted":action==="reject"?"rejected":"cancelled";
    const noticeSent=await notifyConditionalTrade(eventType,id);
    failure("ctOfferNotice","");
    await reload();
    $("ctOfferNotice").textContent="Proposta "+(action==="accept"?"accettata":action==="reject"?"rifiutata":"annullata")+
      " correttamente."+(noticeSent?" Notifica inviata.":" Notifica non confermata.");
  }catch(err){failure("ctOfferNotice",err.message||"Impossibile completare l'operazione.");btn.disabled=false;}
}
async function init(){
  try{
    const user=await supabase.auth.getUser();
    if(user.error||!user.data?.user)return;
    const [p,t,s]=await Promise.all([
      supabase.from("profiles").select("id,team_id").eq("id",user.data.user.id).maybeSingle(),
      supabase.from("teams").select("id,name,conference").order("name"),
      supabase.from("trade_settings").select("*").eq("id",1).maybeSingle()
    ]);
    for(const x of [p,t,s])if(x.error)throw x.error;
    if(!p.data?.team_id)return;
    state.me=p.data;state.teams=t.data||[];state.settings=s.data||{};
    const teams=state.teams.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join("");
    fill("ctStandingSubject",teams,myId());
    fill("ctTrophySubject",teams,myId());
    bind();
    await reload();
    refreshScope();refreshSpecificTrophy();refreshKind();setMode("classic");
  }catch(err){console.error("Trade condizionate:",err);failure("ctFormNotice","Errore caricamento condizioni: "+(err.message||"errore sconosciuto"));}
}
document.addEventListener("DOMContentLoaded",init);
