import {supabase} from "./supabase.js";
import {TROPHY_COMPETITIONS} from "./conditional-trades-core.js";

/*
 * Conditional Trade Room extension. Independent from trade-room.js.
 * Real trades are protected by database feature gate, atomic ownership
 * validation, and a post-acceptance admin review log.
 * No ordinary trade logic is replaced or monkey-patched.
 */
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
const state={me:null,teams:[],picks:[],players:[],waiverCalls:[],extraFrom:new Set(),extraTo:new Set(),rights:[],offers:[],locks:new Set(),settings:null,enabled:false,mode:"classic",resaleIntent:"sell",isAdmin:false,reviews:[],sending:false};
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
function resaleRights(seller,buyer){
 if(!seller||!buyer)return [];
 const a=team(seller),b=team(buyer);
 if(!a||!b||a.conference!==b.conference)return [];
 return state.rights.filter(r=>r.status==="active"&&same(r.holder_team_id,seller)&&
  !same(r.grantor_team_id,buyer)&&picksOf(buyer).some(p=>p.draft_name===r.draft_name));
}
function chooseResaleIntent(intent,autoTarget=true){
 state.resaleIntent=intent==="buy"?"buy":"sell";
 state.extraFrom.clear();state.extraTo.clear();
 if($("ctKind").value!=="right_transfer")$("ctKind").value="right_transfer";
 if(autoTarget){
  const choices=state.teams.filter(t=>!same(t.id,myId())&&
    (state.resaleIntent==="sell"?
      resaleRights(myId(),t.id).length:resaleRights(t.id,myId()).length));
  if(choices.length&&!choices.some(t=>same(t.id,targetId())))$("v2TargetTeam").value=choices[0].id;
 }
 $("ctGrantorSide").value=state.resaleIntent==="sell"?"mine":"theirs";
 refreshKind();
}
function paintResaleMode(){
 const transfer=$("ctKind").value==="right_transfer";
 $("ctGrantorSide").disabled=transfer;
 if(!transfer)return;
 const sell=state.resaleIntent==="sell";
 $("ctGrantorSide").value=sell?"mine":"theirs";
 for(const [id,isActive] of [["ctResaleSell",sell],["ctResaleBuy",!sell]]){
  $(id).classList.toggle("is-active",isActive);
  $(id).setAttribute("aria-pressed",String(isActive));
 }
 $("ctResalePickLabel").textContent=sell?"Quale tuo diritto vuoi vendere?":"Quale diritto dell'avversario vuoi acquistare?";
 $("ctResaleContext").textContent=sell?
  "Sei il venditore: "+name(targetId())+" offre una pick per acquistare il tuo diritto.":
  "Sei il compratore: proponi di acquistare da "+name(targetId())+
  " pagando una tua pick. Sarà "+name(targetId())+" ad accettare o rifiutare.";
}
function syncResaleCounter(){
 if($("ctKind").value!=="right_transfer")return;
 const right=state.rights.find(r=>same(r.id,$("ctExistingRight").value));
 const buyer=holderId();
 const owned=right?picksOf(buyer).filter(p=>p.draft_name===right.draft_name):[];
 fill("ctCounterPick",options(owned,true),owned.some(p=>same(p.id,$("ctCounterPick").value))?
   $("ctCounterPick").value:owned[0]?.id||"");
 $("ctCounterDescription").textContent=name(buyer)+" paga una sua pick a "+name(grantorId())+
  " per acquistare il diritto. Il titolare cambierà solo dopo l'accettazione.";
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

function extrasFor(side,type){
  const owner=side==="from"?myId():targetId();
  if(type==="player")return state.players.filter(x=>same(x.owner_team_id,owner)&&x.role!=="P"&&!/(^|[;, ])Por($|[;, ])/i.test(x.role_mantra||""))
    .sort((a,b)=>a.name.localeCompare(b.name,"it"))
    .map(x=>({id:x.id,key:"player:"+x.id,label:x.name+(x.is_u21_slot?" · U21 slot":"")}));
  if(type==="future_pick")return picksOf(owner).map(x=>({
    id:x.id,key:"future_pick:"+x.id,label:pickTitle(x)
  }));
  return state.waiverCalls.filter(x=>same(x.owner_team_id,owner)).map(x=>({
    id:x.asset_id,key:"waiver_call:"+x.asset_id,label:"Sett. "+x.week+" · "+x.origin_team_name
  }));
}
function paintMixedChoices(){
  const allowed=["conference_market","round_robin_market"].includes(state.settings?.active_phase);
  $("ctMixedFields").hidden=!allowed;
  if(!allowed)return;
  for(const side of ["from","to"]){
    const n=side==="from"?"From":"To",selected=side==="from"?state.extraFrom:state.extraTo;
    $("ctMixed"+n+"Label").textContent=name(side==="from"?myId():targetId())+" aggiunge";
    const term=$("ctMixed"+n+"Search").value.trim().toLocaleLowerCase("it");
    const rows=extrasFor(side,$("ctMixed"+n+"Type").value)
      .filter(x=>x.label.toLocaleLowerCase("it").includes(term));
    const box=$("ctMixed"+n+"Items");
    box.innerHTML=rows.length?rows.map(x=>
      '<label><input type="checkbox" data-mix="'+esc(x.key)+'"'+
      (selected.has(x.key)?" checked":"")+'><span>'+esc(x.label)+'</span></label>'
    ).join(""):'<p class="ct-field-help">Nessun asset disponibile.</p>';
    box.querySelectorAll('input[data-mix]').forEach(input=>input.addEventListener("change",()=>{
      if(input.checked)selected.add(input.dataset.mix);else selected.delete(input.dataset.mix);
      $("ctMixed"+n+"Count").textContent=selected.size+" asset selezionati";
      redrawSummary();
    }));
    $("ctMixed"+n+"Count").textContent=selected.size+" asset selezionati";
  }
}
function extraAssets(){
  const result=[];
  for(const [side,selected] of [["from",state.extraFrom],["to",state.extraTo]]){
    for(const key of selected){
      const i=key.indexOf(":"),type=key.slice(0,i),id=key.slice(i+1);
      if(!["player","future_pick","waiver_call"].includes(type)||!id)continue;
      result.push({side,asset_type:type,asset_id:id});
    }
  }
  return result;
}

function mixedPlayerBalance(extras){
  const from=extras.filter(x=>x.asset_type==="player"&&x.side==="from").length;
  const to=extras.filter(x=>x.asset_type==="player"&&x.side==="to").length;
  return {from,to,difference:Math.abs(from-to)};
}
function mixedPlayerBalanceMessage(from,to){
  if(from===to)return "";
  const giver=from>to?name(myId()):name(targetId());
  const cutter=from>to?name(targetId()):name(myId());
  const extra=Math.abs(from-to);
  return name(myId())+" offre "+from+" giocator"+(from===1?"e":"i")+
    ", "+name(targetId())+" ne offre "+to+". "+
    "Come nelle trade classiche, dopo l'accettazione "+cutter+
    " dovrà svincolare "+extra+" giocator"+(extra===1?"e":"i")+
    " e "+giver+" riceverà "+extra+" chiamat"+(extra===1?"a":"e")+
    " compensativ"+(extra===1?"a":"e")+". "+
    "Al completamento dello svincolo i giocatori si trasferiranno subito; "+
    "solo la scelta futura resterà subordinata alla condizione concordata. "+
    "Fino allo svincolo, tutte le pick coinvolte rimangono riservate.";
}
function validateMixedExtras(extras,payload){
  if(!extras.length)return;
  if(!["conference_market","round_robin_market"].includes(state.settings?.active_phase))
    throw new Error("Gli asset misti sono disponibili solo nel mercato successivo al Draft.");
  if(extras.length>24)throw new Error("Puoi aggiungere al massimo 24 asset allo stesso accordo.");
  const counts={from:{player:0,future_pick:0,u21:0},to:{player:0,future_pick:0,u21:0}};
  const used=new Set([...payload.p_candidate_pick_ids.map(id=>"future_pick:"+id),
    "future_pick:"+payload.p_counter_pick_id]);
  for(const asset of extras){
    const mark=asset.asset_type+":"+asset.asset_id;
    if(used.has(mark))throw new Error("Lo stesso asset è stato selezionato sia nella condizione sia negli extra.");
    used.add(mark);
    if(asset.asset_type==="player"){
      counts[asset.side].player++;
      if(state.players.find(p=>same(p.id,asset.asset_id))?.is_u21_slot)counts[asset.side].u21++;
    }
    if(asset.asset_type==="future_pick")counts[asset.side].future_pick++;
  }
  if(counts.from.u21!==counts.to.u21)
    throw new Error("Gli U21 slot devono essere bilanciati 1:1.");
  if(counts.from.future_pick!==counts.to.future_pick)
    throw new Error("Le pick future aggiuntive devono essere scambiate 1:1.");
}

function extraLabel(x){
  if(x.asset_type==="player")return state.players.find(p=>same(p.id,x.asset_id))?.name||"Giocatore";
  if(x.asset_type==="future_pick")return pickTitle(state.picks.find(p=>same(p.id,x.asset_id)));
  const call=state.waiverCalls.find(p=>p.asset_id===x.asset_id);
  return call?"Chiamata sett. "+call.week+" · "+call.origin_team_name:"Chiamata "+x.asset_id;
}


async function loadExtraWaiverCalls(){
  const owners=[...new Set([myId(),targetId()].filter(Boolean))];
  const rows=await Promise.all(owners.map(owner=>
    supabase.rpc("conditional_available_waiver_calls",
      {p_owner_team_id:owner,p_weeks_ahead:14})
      .then(result=>({owner,...result}))
      .catch(error=>({owner,error}))
  ));
  state.waiverCalls=rows.flatMap(row=>row.error?[]:(row.data||[]).map(x=>({...x,owner_team_id:row.owner})));
  paintMixedChoices();
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
  const counts=new Map();
  for(const pick of available){
    const round=Number(pick.round);
    counts.set(round,(counts.get(round)||0)+1);
  }
  const rounds=[...counts].filter(([,n])=>n>=2).sort((a,b)=>a[0]-b[0]);
  fill("ctRankedRound",rounds.length?
    rounds.map(([round,count])=>'<option value="'+round+'">Round '+round+' · '+count+' pick disponibili</option>').join(""):
    '<option value="">Nessun round con almeno due pick</option>',
    $("ctRankedRound").value||String(rounds[0]?.[0]??""));
  $("ctRankedRound").disabled=rounds.length===0;
  drawRanked(true);
  const counter=picksOf(holderId());
  fill("ctCounterPick",options(counter,true));
  $("ctCounterDescription").textContent=name(holderId())+
    " offre una pick futura in cambio del diritto di "+name(grantorId())+".";
  const resell=resaleRights(grantorId(),holderId());
  fill("ctExistingRight",'<option value="">Seleziona un diritto attivo...</option>'+
    resell.map(r=>'<option value="'+esc(r.id)+'">'+esc(kindLabel(r.rule_kind)+
     " · obbligato "+name(r.grantor_team_id)+" · titolare "+name(r.holder_team_id))+'</option>').join(""),
    resell.length===1?resell[0].id:null);
  if($("ctKind").value==="right_transfer")syncResaleCounter();
  paintMixedChoices();
  redrawSummary();
}
function drawRanked(selectDefaults=false){
  const p=picksOf(grantorId()).filter(p=>Number(p.round)===Number($("ctRankedRound").value));
  const existing=new Set(selectedCandidates());
  $("ctRankedCandidates").innerHTML=p.length>=2?p.map((x,i)=>
    '<label><input type="checkbox" value="'+esc(x.id)+'"'+
    ((existing.has(String(x.id))||(selectDefaults&&i<2))?' checked':'')+'>'+
    '<span>'+esc(pickTitle(x))+'</span></label>').join(""):
    '<p class="ct-field-help">Questa franchigia non ha almeno due pick libere nello stesso round. Prova con classifica o trofeo.</p>';
  $("ctRankedCandidates").querySelectorAll("input").forEach(e=>e.addEventListener("change",redrawSummary));
}
function refreshKind(){
  const kind=$("ctKind").value;
  for(const k of ["standing","ranked","trophy","transfer"]){
    const id=k==="transfer"?"ctTransferFields":"ct"+k.charAt(0).toUpperCase()+k.slice(1)+"Fields";
    $(id).hidden=(k!==(kind==="right_transfer"?"transfer":kind));
  }
  if(kind==="right_transfer"){
    const own=state.rights.some(r=>r.status==="active"&&same(r.holder_team_id,myId()));
    if(!own&&state.resaleIntent==="sell")state.resaleIntent="buy";
  }
  paintResaleMode();
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
  if(kind==="right_transfer")clause+=" · "+
    (state.resaleIntent==="buy"?"acquisto":"vendita")+" · "+$("ctExistingRight").selectedOptions?.[0]?.textContent;
  const details=editingRule();
  const originalRight=kind==="right_transfer"?
    state.rights.find(r=>same(r.id,$("ctExistingRight").value)):null;
  if(originalRight){
    details.rule=originalRight.rule_spec;
    details.ids=state.offers.find(o=>same(o.id,originalRight.source_offer_id))?.candidate_pick_ids||[];
  }
  const extras=extraAssets();
  const balance=mixedPlayerBalance(extras);
  const balanceHint=$("ctMixedPlayerBalance");
  if(balanceHint){
    const mismatch=balance.difference>0;
    balanceHint.hidden=!mismatch;
    balanceHint.textContent=mismatch?
      "⚠️ "+mixedPlayerBalanceMessage(balance.from,balance.to):"";
  }
  const extraHtml=extras.length?
    '<p><strong>Altri asset nello stesso contratto:</strong></p><ul class="ct-clause-list">'+
    extras.map(x=>'<li>'+esc((x.side==="from"?name(myId()):name(targetId()))+
      " offre "+extraLabel(x))+'</li>').join("")+'</ul>':
    '<p class="ct-field-help">Nessun altro asset aggiunto. Solo diritto condizionato e pick 1:1.</p>';
  $("ctTradeSummary").innerHTML="<strong>"+esc(name(owner))+" → "+esc(name(holder))+"</strong><br>"+
    esc(clause)+"<ul class=\"ct-clause-list\">"+
    ruleDetails(kind,details.rule,details.ids).map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>"+
    "<strong>Contropartita 1:1:</strong> "+esc(pickText($("ctCounterPick").value))+
    extraHtml+
    "<br><small>Un solo accordo: se gli asset aggiuntivi falliscono, anche il diritto condizionato viene annullato.</small>";
  const rankedIssue=kind==="ranked"&&selectedCandidates().length<2;
  if($("ctRankedHint")){
    $("ctRankedHint").textContent=kind!=="ranked"?"":$("ctRankedRound").disabled?
      name(owner)+" non ha almeno due pick disponibili nello stesso round. "+
      "Usa una condizione sulla classifica o sui trofei, oppure chiedi il diritto a un'altra squadra.":
      rankedIssue?"Seleziona almeno due pick del Round "+$("ctRankedRound").value+".":
      "✓ "+selectedCandidates().length+" pick candidate dello stesso round selezionate.";
  }
  const resaleIssue=kind==="right_transfer"&&(!originalRight||originalRight.status!=="active"||
    !same(originalRight.holder_team_id,owner)||
    !same(state.picks.find(p=>same(p.id,$("ctCounterPick").value))?.owner_team_id,holder)||
    state.picks.find(p=>same(p.id,$("ctCounterPick").value))?.draft_name!==originalRight?.draft_name);
  let reason=!state.enabled
    ?"Le trade condizionate sono temporaneamente sospese dall'amministrazione."
    :!marketOpen()?"Il mercato è chiuso."
    :!targetId()?"Scegli prima una franchigia con cui trattare."
    :team(owner)?.conference!==team(holder)?.conference?"Condizioni fra Conferences diverse non ancora supportate."
    :rankedIssue?"Seleziona almeno due pick candidate dello stesso round."
    :resaleIssue?"Nessun diritto attivo acquistabile da questa franchigia oppure manca una pick di pagamento dello stesso Draft. Usa «Vendi» o «Proponi acquisto».":"";
  if(!reason){
    try{
      const payload=conditionPayload();
      validateMixedExtras(extras,payload);
    }catch(err){reason=err?.message||"Completa la clausola e la pick di contropartita.";}
  }
  // Lascia il pulsante cliccabile anche se manca un campo: al clic
  // apparirà la spiegazione precisa, invece di un pulsante morto.
  $("ctSendOffer").disabled=state.sending;
  $("ctSendOffer").textContent=state.sending?"Invio in corso…":"🔐 Invia proposta condizionata";
  if(!state.sending)failure("ctFormNotice",reason);
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
    const right=state.rights.find(r=>same(r.id,id));
    if(!right||right.status!=="active"||!same(right.holder_team_id,owner))
      throw new Error("Seleziona un diritto attivo effettivamente posseduto dal venditore.");
    if(same(right.grantor_team_id,holder))
      throw new Error("Il diritto non può essere venduto alla squadra obbligata a consegnare la pick.");
    if(!same(state.picks.find(p=>same(p.id,counter))?.owner_team_id,holder)||
       state.picks.find(p=>same(p.id,counter))?.draft_name!==right.draft_name)
      throw new Error("Chi compra deve pagare con una sua pick libera dello stesso Draft.");
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
  return "Cessione di un diritto già acquisito: "+name(o.grantor_team_id)+
    " lo vende a "+name(o.holder_team_id);
}
function paintOffers(){
  const panel=$("ctOffersPanel"),items=$("ctOfferItems");if(!panel||!items)return;
  const sub=document.querySelector(".v2-subtabs button.active")?.dataset.v2Subtab||"received";
  const list=state.offers.filter(o=>sub==="sent"?same(o.from_team_id,myId()):same(o.to_team_id,myId()));
  panel.hidden=list.length===0;
  items.innerHTML=list.length?list.map(o=>{
    const incoming=same(o.to_team_id,myId()),awaiting=o.status==="pending";
    const awaitingCuts=o.status==="accepted_pending_cuts";
    const playerBalance=mixedPlayerBalance(Array.isArray(o.mixed_assets)?o.mixed_assets:[]);
    const cutTeam=playerBalance.from>playerBalance.to?o.to_team_id:o.from_team_id;
    const owner=name(o.grantor_team_id),holder=name(o.holder_team_id);
    return '<article class="ct-offer-card"><header><strong>'+esc(owner)+' → '+esc(holder)+'</strong>'+
      '<span class="ct-status">'+esc(({pending:"In attesa",accepted_pending_cuts:"Accettata · svincolo richiesto",accepted:"Accettata",rejected:"Rifiutata",cancelled:"Annullata"})[o.status]||o.status)+'</span></header>'+
      '<p>'+esc(offerDescription(o))+'</p>'+
      '<ul class="ct-clause-list">'+(()=>{
        const orig=o.rule_kind==="right_transfer"?state.rights.find(r=>same(r.id,o.existing_right_id)):null;
        const origOffer=orig?state.offers.find(x=>same(x.id,orig.source_offer_id)):null;
        return orig?ruleDetails(orig.rule_kind,orig.rule_spec,origOffer?.candidate_pick_ids||[]):
          ruleDetails(o.rule_kind,o.rule_spec,o.candidate_pick_ids);
      })().map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+
      '<p>Contropartita: '+esc(pickText(o.counter_pick_id))+'</p>'+
      (Array.isArray(o.mixed_assets)&&o.mixed_assets.length?'<p><strong>Insieme al diritto:</strong></p><ul class="ct-clause-list">'+
        o.mixed_assets.map(x=>'<li>'+esc((x.side==="from"?name(o.from_team_id):name(o.to_team_id))+
          " offre "+extraLabel(x))+'</li>').join("")+'</ul>':'')+
      '<p>Proposta: '+esc(formatDate(o.created_at))+'</p>'+
      (awaitingCuts?'<p class="ct-cuts-pending">✂️ <b>In attesa dello svincolo di '+
        esc(name(cutTeam))+'</b> ('+playerBalance.difference+' giocator'+
        (playerBalance.difference===1?'e':'i')+'). I giocatori verranno trasferiti e la chiamata compensativa assegnata appena si completa lo svincolo. '+
        'Le pick restano riservate; solo la scelta finale dipenderà dalla condizione.'+
        (same(cutTeam,myId())?' Puoi completare lo svincolo qui sotto, come nelle trade normali.':'')+'</p>': '')+
      (awaitingCuts&&same(cutTeam,myId())&&o.mixed_legacy_trade_id?
        '<div class="ct-action-row"><button type="button" class="ct-action-primary" data-ct-complete-cuts="'+
        esc(o.id)+'">✂️ Svincola '+playerBalance.difference+' e completa</button></div>':'')+
      (awaiting?'<div class="ct-action-row">'+(incoming?
        '<button class="ct-action-primary" data-ct-accept="'+esc(o.id)+'"'+(!state.enabled?" disabled":"")+'>Accetta</button>'+
        '<button class="ct-action-red" data-ct-reject="'+esc(o.id)+'"'+(!state.enabled?" disabled":"")+'>Rifiuta</button>':
        '<button class="ct-action-red" data-ct-cancel="'+esc(o.id)+'"'+(!state.enabled?" disabled":"")+'>Annulla</button>')+
      '</div>':'')+'</article>';
  }).join(""):'';
}
function paintRights(){
  const panel=$("ctRightsPanel"),items=$("ctRightItems"),buyPanel=$("ctBuyRightsPanel"),buyItems=$("ctBuyRightsItems");
  if(!panel||!items||!buyPanel||!buyItems)return;
  const list=state.rights.filter(r=>["active","pending_cuts"].includes(r.status)&&(
    same(r.grantor_team_id,myId())||same(r.holder_team_id,myId())));
  const available=state.rights.filter(r=>r.status==="active"&&
    !same(r.grantor_team_id,myId())&&!same(r.holder_team_id,myId())&&
    team(r.holder_team_id)?.conference===team(myId())?.conference&&
    picksOf(myId()).some(p=>p.draft_name===r.draft_name));
  panel.hidden=!list.length&&!available.length;
  items.innerHTML=list.map(r=>
    '<article class="ct-right-card"><header><strong>'+esc(kindLabel(r.rule_kind))+
    '</strong><span class="ct-status">'+esc(r.status==="pending_cuts"?
       "In attesa di svincolo · pick riservate":"Attivo · pick vincolate")+'</span></header>'+
    '<p>Titolare: <b>'+esc(name(r.holder_team_id))+'</b> · Promesse da '+esc(name(r.grantor_team_id))+'</p>'+
    '<p>Draft '+esc(r.season)+' · '+esc(r.draft_name)+'</p>'+
    (r.status==="active"&&same(r.holder_team_id,myId())?'<div class="ct-action-row"><button type="button" data-ct-resell="'+esc(r.id)+'">📤 Vendi il diritto</button></div>':'')+'</article>'
  ).join("");
  buyPanel.hidden=!available.length;
  buyItems.innerHTML=available.map(r=>{
    const original=state.offers.find(o=>same(o.id,r.source_offer_id));
    const clause=ruleDetails(r.rule_kind,r.rule_spec,original?.candidate_pick_ids||[]);
    return '<article class="ct-right-card"><header><strong>🔐 '+esc(kindLabel(r.rule_kind))+
      '</strong><span class="ct-status">Acquistabile</span></header>'+
      '<p>Appartiene a <b>'+esc(name(r.holder_team_id))+'</b> · Pick promessa da '+
       esc(name(r.grantor_team_id))+'</p>'+
      '<ul class="ct-clause-list">'+clause.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+
      '<div class="ct-action-row"><button type="button" data-ct-buy="'+esc(r.id)+
      '">📥 Proponi acquisto a '+esc(name(r.holder_team_id))+'</button></div></article>';
  }).join("");
}
function paintReviews(){
  const panel=$("ctReviewPanel"),items=$("ctReviewItems");
  if(!panel||!items)return;
  panel.hidden=!state.isAdmin;
  if(!state.isAdmin)return;
  const sorted=[...state.reviews].sort((a,b)=>
    (a.status==="pending"?0:1)-(b.status==="pending"?0:1)||
    new Date(b.created_at)-new Date(a.created_at));
  items.innerHTML=sorted.length?sorted.map(r=>{
    const snap=r.snapshot||{};
    const offer=state.offers.find(o=>same(o.id,r.offer_id));
    const right=state.rights.find(x=>same(x.id,r.right_id));
    const kind=snap.rule_kind||offer?.rule_kind;
    const desc=kind==="right_transfer"?
       (right?ruleDetails(right.rule_kind,right.rule_spec,
         state.offers.find(o=>same(o.id,right.source_offer_id))?.candidate_pick_ids||[]):[]):
       ruleDetails(kind,snap.rule_spec||offer?.rule_spec,snap.candidate_pick_ids||[]);
    const canReview=r.status==="pending"&&r.automatic_check==="ok";
    const checks=[snap.counter_owner_verified?"✓ Contropartita controllata":"",
      snap.right_holder_verified?"✓ Titolare verificato":"",
      snap.candidate_locks_verified?"✓ Vincoli candidati controllati":""].filter(Boolean);
    return '<article class="ct-offer-card ct-review-card"><header><strong>'+
      esc(name(snap.from_team_id)+" ⇄ "+name(snap.to_team_id))+'</strong>'+
      '<span class="ct-status">'+esc(r.status==="pending"?"Da verificare":"Verificata")+'</span></header>'+
      '<p><b>'+esc(kindLabel(kind))+'</b> · '+esc(formatDate(r.created_at))+'</p>'+
      '<ul class="ct-clause-list">'+desc.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+
      '<p>Contropartita trasferita: <b>'+esc(pickText(snap.counter_pick_id))+'</b></p>'+
      '<p>Venditore: '+esc(name(snap.grantor_team_id))+
        ' · Acquirente: '+esc(name(snap.holder_team_id))+'</p>'+
      (Array.isArray(snap.mixed_assets)&&snap.mixed_assets.length?
        '<p>Asset aggiuntivi: '+snap.mixed_assets.map(x=>esc(extraLabel(x))).join(" · ")+'</p>':'')+
      '<p class="ct-review-auto">'+esc(checks.join(" · "))+'</p>'+
      (right?'<p>Stato attuale diritto: <b>'+esc(right.status==="resolved"?"Risolto":"Attivo")+
       '</b>'+(right.resolved_pick_id?' · Pick finale '+esc(pickText(right.resolved_pick_id)):'')+'</p>':'')+
      (r.status==="reviewed"?
        '<p>Controllata il '+esc(formatDate(r.reviewed_at))+
         (r.review_note?' · '+esc(r.review_note):'')+'</p>':
       (canReview?'<div class="ct-action-row"><button type="button" data-ct-review="'+
         esc(r.offer_id)+'">✓ Ho verificato il contratto</button></div>':''))+
      '</article>';
  }).join(""):'<p class="ct-field-help">Nessuna trade condizionata reale da controllare.</p>';
}

function paintConditionalHistory(){
  const panel=$("ctHistoryPanel"),items=$("ctHistoryItems");
  if(!panel||!items)return;
  const accepted=state.offers.filter(o=>["accepted","accepted_pending_cuts"].includes(o.status));
  panel.hidden=accepted.length===0;
  items.innerHTML=accepted.map(o=>{
    const right=state.rights.find(r=>same(r.source_offer_id,o.id))||
      (o.rule_kind==="right_transfer"?state.rights.find(r=>same(r.id,o.existing_right_id)):null);
    const original=right&&o.rule_kind==="right_transfer"?
      state.offers.find(x=>same(x.id,right.source_offer_id)):null;
    const details=original?ruleDetails(right.rule_kind,right.rule_spec,original.candidate_pick_ids):
      ruleDetails(o.rule_kind,o.rule_spec,o.candidate_pick_ids);
    const status=o.status==="accepted_pending_cuts"?"Accettata · svincoli da completare":
      right?.status==="resolved"?"Condizione risolta":
      o.rule_kind==="right_transfer"?"Diritto rivenduto":"Diritto attivo";
    const extras=Array.isArray(o.mixed_assets)?o.mixed_assets:[];
    return '<article class="ct-offer-card"><header><strong>'+
      esc(name(o.from_team_id)+" ⇄ "+name(o.to_team_id))+'</strong>'+
      '<span class="ct-status">'+esc(status)+'</span></header>'+
      '<p>'+esc(offerDescription(o))+'</p>'+
      '<ul class="ct-clause-list">'+details.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+
      '<p>Contropartita: '+esc(pickText(o.counter_pick_id))+'</p>'+
      (extras.length?'<p><strong>Altri asset scambiati:</strong></p><ul class="ct-clause-list">'+
        extras.map(x=>'<li>'+esc(name(x.side==="from"?o.from_team_id:o.to_team_id)+" offre "+extraLabel(x))+
          '</li>').join("")+'</ul>':'')+
      (right?.status==="resolved"?'<p>Pick assegnata: <strong>'+
        esc(pickText(right.resolved_pick_id))+'</strong> a '+esc(name(right.holder_team_id))+'</p>':'')+
      '<p>'+(o.status==="accepted_pending_cuts"?
        "Attesa svincolo per completare lo scambio normale di giocatori e la pick di contropartita.":
        "Confermata il "+esc(formatDate(o.accepted_at)))+'</p></article>';
  }).join("");
}

async function reload(){
  const [p,o,r,c,s,pl,reviews]=await Promise.all([
    supabase.from("future_draft_picks").select("id,season,draft_name,round,original_team_id,owner_team_id,pick_kind,status").eq("season",state.settings?.future_pick_season||2027).eq("status","active"),
    supabase.from("conditional_trade_offers").select("*").order("created_at",{ascending:false}).limit(150),
    supabase.from("conditional_trade_rights").select("*").order("created_at",{ascending:false}).limit(150),
    supabase.from("conditional_trade_candidates").select("pick_id,is_locked").eq("is_locked",true),
    supabase.from("conditional_feature_settings").select("enabled").eq("id",1).maybeSingle(),
    supabase.from("players").select("id,name,owner_team_id,status,role_mantra,role,is_u21_slot").eq("status","active"),
    state.isAdmin?supabase.from("conditional_trade_reviews").select("*").order("created_at",{ascending:false}).limit(150):
      Promise.resolve({data:[],error:null})
  ]);
  for(const x of [p,o,r,c,s,pl,reviews])if(x.error)throw x.error;
  state.picks=p.data||[];state.players=pl.data||[];state.offers=o.data||[];state.rights=r.data||[];
  state.reviews=reviews.data||[];
  // Durante gli svincoli, anche la pick di contropartita è riservata
  // (le candidate sono già protette dalla tabella conditional_trade_candidates).
  state.locks=new Set([
    ...(c.data||[]).map(x=>String(x.pick_id)),
    ...state.offers.filter(o=>o.status==="accepted_pending_cuts").map(o=>String(o.counter_pick_id))
  ]);
  state.enabled=s.data?.enabled===true;
  refreshCandidates();paintOffers();paintRights();paintConditionalHistory();paintReviews();
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
  $("ctKind").addEventListener("change",()=>{
    if($("ctKind").value==="right_transfer"){
      const own=state.rights.some(r=>r.status==="active"&&same(r.holder_team_id,myId()));
      chooseResaleIntent(own?"sell":"buy",true);
    }else refreshKind();
  });
  $("ctResaleSell").addEventListener("click",()=>chooseResaleIntent("sell",true));
  $("ctResaleBuy").addEventListener("click",()=>chooseResaleIntent("buy",true));
  $("ctGrantorSide").addEventListener("change",()=>{$("ctRankedCandidates").innerHTML="";refreshCandidates();});
  $("v2TargetTeam").addEventListener("change",()=>{$("ctRankedCandidates").innerHTML="";state.extraTo.clear();refreshCandidates();loadExtraWaiverCalls();});
  $("ctStandingSubject").addEventListener("change",refreshScope);
  $("ctStandingScope").addEventListener("change",refreshScope);
  $("ctTopCount").addEventListener("change",refreshScope);
  $("ctBottomCount").addEventListener("change",refreshScope);
  $("ctRankedRound").addEventListener("change",()=>{$("ctRankedCandidates").innerHTML="";drawRanked(true);redrawSummary();});
  $("ctTrophySubject").addEventListener("change",refreshSpecificTrophy);
  $("ctTrophyMode").addEventListener("change",refreshSpecificTrophy);
  for(const id of ["ctTopPick","ctBottomPick","ctMiddlePick","ctWonPick","ctNotWonPick","ctTrophySpecific",
    "ctCounterPick","ctRankedWhich"]){
    $(id).addEventListener("change",redrawSummary);
  }
  $("ctExistingRight").addEventListener("change",()=>{
    syncResaleCounter();redrawSummary();
  });
  for(const n of ["From","To"]){
    $("ctMixed"+n+"Type").addEventListener("change",paintMixedChoices);
    $("ctMixed"+n+"Search").addEventListener("input",paintMixedChoices);
  }
  $("ctSendOffer").addEventListener("click",sendOffer);
  $("ctConfirmSubmit").addEventListener("click",confirmSendOffer);
  $("ctCancelSubmit").addEventListener("click",cancelSendOffer);
  $("ctOfferItems").addEventListener("click",offerAction);
  $("ctRightItems").addEventListener("click",event=>{
    const sell=event.target.closest("[data-ct-resell]");
    if(!sell)return;
    document.querySelector("[data-v2-new]")?.click();
    state.extraFrom.clear();state.extraTo.clear();
    setMode("conditional");
    chooseResaleIntent("sell",true);
    $("ctExistingRight").value=sell.dataset.ctResell;
    syncResaleCounter();redrawSummary();
  });
  $("ctBuyRightsItems").addEventListener("click",event=>{
    const buy=event.target.closest("[data-ct-buy]");
    if(!buy)return;
    const right=state.rights.find(r=>same(r.id,buy.dataset.ctBuy));
    if(!right||right.status!=="active"||same(right.grantor_team_id,myId()))return;
    document.querySelector("[data-v2-new]")?.click();
    $("v2TargetTeam").value=right.holder_team_id;
    $("v2TargetTeam").dispatchEvent(new Event("change",{bubbles:true}));
    state.extraFrom.clear();state.extraTo.clear();
    setMode("conditional");
    chooseResaleIntent("buy",false);
    $("ctExistingRight").value=right.id;
    syncResaleCounter();redrawSummary();
    $("ctConditionalComposer").scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("ctReviewItems").addEventListener("click",reviewAction);
  document.querySelectorAll("[data-v2-subtab]").forEach(b=>b.addEventListener("click",()=>queueMicrotask(paintOffers)));
}
async function reviewAction(event){
  const btn=event.target.closest("[data-ct-review]");
  if(!btn||!state.isAdmin)return;
  const id=btn.dataset.ctReview;
  if(!window.confirm("Confermi di aver controllato la clausola, la contropartita e le pick vincolate di questa trade REALE?"))return;
  btn.disabled=true;
  try{
    const {error}=await supabase.rpc("conditional_mark_offer_reviewed",
      {p_offer_id:id,p_note:"Controllo iniziale effettuato dalla Trade Room"});
    if(error)throw error;
    await reload();
    failure("ctReviewNotice","");
    $("ctReviewNotice").textContent="✅ Contratto verificato e archiviato nel registro.";
  }catch(err){
    failure("ctReviewNotice",err.message||"Impossibile registrare la verifica.");
    btn.disabled=false;
  }
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

function validatedOfferDraft(){
  if(!state.enabled)throw new Error("Le trade condizionate sono temporaneamente sospese.");
  if(!marketOpen())throw new Error("Il mercato è chiuso.");
  const payload=conditionPayload();
  const extras=extraAssets();
  validateMixedExtras(extras,payload);
  return {payload,extras};
}
function displaySendNotice(message,error=false){
  failure("ctFormNotice",message);
  $("ctFormNotice").classList.toggle("is-error",error);
  if(message)$("ctFormNotice").scrollIntoView({behavior:"smooth",block:"nearest"});
}
function hideSendConfirmation(){
  $("ctSendConfirmPanel").hidden=true;
  state.confirmOfferSnapshot=null;
}
function sendOffer(){
  if(state.sending)return;
  try{
    const draft=validatedOfferDraft();
    state.confirmOfferSnapshot=JSON.stringify(draft);
    $("ctSendConfirmText").textContent="Inviare davvero a "+name(targetId())+" "+
      (draft.extras.length?"una trade MISTA con "+draft.extras.length+" asset aggiuntivi":
        "una trade condizionata")+"? La proposta sarà vincolante dopo l'accettazione. "+
      "Verifica la clausola e la pick di contropartita nel riepilogo.";
    $("ctSendConfirmPanel").hidden=false;
    displaySendNotice("Controlla il riepilogo e premi «Conferma e invia». Nessuna proposta è ancora stata inviata.");
    $("ctConfirmSubmit").focus();
    $("ctSendConfirmPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
  }catch(err){
    hideSendConfirmation();
    displaySendNotice("⚠️ "+(err?.message||"Completa i dati mancanti nella proposta."),true);
  }
}
function cancelSendOffer(){
  if(state.sending)return;
  hideSendConfirmation();
  displaySendNotice("Invio annullato: nessuna proposta è stata registrata.");
}
async function confirmSendOffer(){
  if(state.sending)return;
  let resultMessage="",isError=false,savedOfferId=null;
  try{
    if($("ctSendConfirmPanel").hidden||!state.confirmOfferSnapshot)
      throw new Error("Apri prima la conferma con «Invia proposta condizionata».");
    const draft=validatedOfferDraft();
    if(JSON.stringify(draft)!==state.confirmOfferSnapshot)
      throw new Error("La proposta è stata modificata. Premi di nuovo «Invia proposta» per confermare i dati aggiornati.");
    hideSendConfirmation();
    state.sending=true;
    $("ctSendOffer").disabled=true;
    $("ctConfirmSubmit").disabled=true;
    $("ctCancelSubmit").disabled=true;
    $("ctSendOffer").textContent="Invio in corso…";
    displaySendNotice("Sto registrando la proposta nel mercato ufficiale…");
    const method=draft.extras.length?"conditional_create_mixed_offer":"conditional_create_offer";
    const params=draft.extras.length?{...draft.payload,p_extra_assets:draft.extras}:draft.payload;
    const {data:offerId,error}=await supabase.rpc(method,params);
    if(error)throw error;
    savedOfferId=offerId;
    displaySendNotice("Proposta registrata! Aggiorno le proposte e invio la notifica…");
    const noticeSent=await notifyConditionalTrade("proposal",offerId);
    try{
      await reload();
      resultMessage="✅ Proposta condizionata inviata. "+(noticeSent
        ?"Il destinatario è stato avvisato.":"Il destinatario la vede in Proposte; la notifica non è stata confermata.");
    }catch(refreshError){
      console.warn("Trade inviata, ma aggiornamento Trade Room fallito:",refreshError);
      resultMessage="✅ Proposta registrata sul mercato. Non sono riuscito ad aggiornare l'elenco: ricarica la Trade Room per vederla.";
    }
  }catch(err){
    // Una modifica o una validazione fallita invalida la conferma precedente.
    hideSendConfirmation();
    console.error("Invio trade condizionata:",err);
    isError=true;
    resultMessage="⚠️ "+(err?.message||"Invio non riuscito.");
    if(savedOfferId){
      // La RPC ha già salvato la proposta: non suggerire di riprovare e duplicarla.
      isError=false;
      resultMessage="✅ Proposta registrata nel database, ma un passaggio successivo non è riuscito. Ricarica l'elenco prima di inviarne altre.";
    }
  }finally{
    state.sending=false;
    $("ctConfirmSubmit").disabled=false;
    $("ctCancelSubmit").disabled=false;
    // redrawSummary può ricalcolare i campi, ma non deve cancellare
    // errori o conferme di salvataggio appena mostrate.
    redrawSummary();
    if(resultMessage)displaySendNotice(resultMessage,isError);
  }
}
async function offerAction(event){
  const cutBtn=event.target.closest("[data-ct-complete-cuts]");
  if(cutBtn){
    const offer=state.offers.find(o=>same(o.id,cutBtn.dataset.ctCompleteCuts));
    const balance=offer?mixedPlayerBalance(Array.isArray(offer.mixed_assets)?offer.mixed_assets:[]):null;
    const cutter=offer&&balance?.from>balance?.to?offer.to_team_id:offer?.from_team_id;
    if(!offer||offer.status!=="accepted_pending_cuts"||!same(cutter,myId())||
      !offer.mixed_legacy_trade_id||!balance?.difference)return;
    cutBtn.disabled=true;
    try{
      if(typeof window.refreshTradeRoomV2==="function")await window.refreshTradeRoomV2();
      const legacy=[...document.querySelectorAll("#v2ProposalItems [data-trade-action='cuts']")]
        .find(b=>same(b.dataset.tradeId,offer.mixed_legacy_trade_id));
      if(legacy)legacy.click();
      else if(typeof window.openPendingCutModal==="function")
        await window.openPendingCutModal(offer.mixed_legacy_trade_id,balance.difference);
      else throw new Error("La finestra di svincolo non è ancora disponibile: riapri la Trade Room.");
    }catch(err){
      failure("ctOfferNotice",err?.message||"Impossibile aprire la selezione dello svincolo.");
    }finally{cutBtn.disabled=false;}
    return;
  }
  const btn=event.target.closest("[data-ct-accept],[data-ct-reject],[data-ct-cancel]");
  if(!btn)return;
  const action=btn.dataset.ctAccept?"accept":btn.dataset.ctReject?"reject":"cancel";
  const id=btn.dataset.ctAccept||btn.dataset.ctReject||btn.dataset.ctCancel;
  if(!window.confirm(action==="accept"?
    "Accettare questa trade condizionata REALE? I giocatori seguono le regole normali del mercato, compresi eventuali svincoli e chiamate compensative. Solo la pick finale rimane condizionata.":
    action==="reject"?"Rifiutare questa proposta?":"Annullare questa proposta?"))return;
  btn.disabled=true;
  try{
    const response=action==="cancel"?
      await supabase.rpc("conditional_cancel_offer",{p_offer_id:id}):
      await supabase.rpc("conditional_respond_offer",{p_offer_id:id,p_accept:action==="accept"});
    if(response.error)throw response.error;
    const pendingCuts=action==="accept"&&response.data?.status==="accepted_pending_cuts";
    // Una trade 3v2 è ACCETTATA ma attende lo svincolo della squadra
    // che riceve il giocatore extra, come il mercato classico.
    // Il diritto condizionato rimane riservato ma non ancora trasferibile.
    const eventType=action==="accept"?"accepted":action==="reject"?"rejected":"cancelled";
    const noticeSent=pendingCuts?false:await notifyConditionalTrade(eventType,id);
    await reload();
    if(typeof window.refreshTradeRoomV2==="function"){
      try{await window.refreshTradeRoomV2();}catch(refreshErr){
        console.warn("Impossibile aggiornare gli svincoli classici:",refreshErr);
      }
    }
    failure("ctOfferNotice","");
    if(pendingCuts){
      const num=Number(response.data?.cuts_required)||1;
      const cutTeam=response.data?.cut_team_id;
      $("ctOfferNotice").textContent="✅ Proposta accettata, in attesa di svincolo. "+
        name(cutTeam)+" deve svincolare "+num+" giocator"+(num===1?"e":"i")+
        " nella sezione Proposte delle trade classiche. "+
        "I giocatori verranno scambiati come nel mercato normale al completamento; "+
        "le pick restano riservate e soltanto la scelta finale è condizionata.";
    }else{
      $("ctOfferNotice").textContent="Proposta "+(action==="accept"?"accettata":action==="reject"?"rifiutata":"annullata")+
        " correttamente."+(noticeSent?" Notifica inviata.":" Notifica non confermata.");
    }
  }catch(err){failure("ctOfferNotice",err.message||"Impossibile completare l'operazione.");btn.disabled=false;}
}
async function init(){
  try{
    const user=await supabase.auth.getUser();
    if(user.error||!user.data?.user)return;
    const qaLink=$("ctQaOnlyLink");
    if(qaLink)qaLink.hidden=String(user.data.user.email||"").toLowerCase()!=="tringali0511@gmail.com";
    const [p,t,s]=await Promise.all([
      supabase.from("profiles").select("id,team_id,role").eq("id",user.data.user.id).maybeSingle(),
      supabase.from("teams").select("id,name,conference").order("name"),
      supabase.from("trade_settings").select("*").eq("id",1).maybeSingle()
    ]);
    for(const x of [p,t,s])if(x.error)throw x.error;
    if(!p.data?.team_id)return;
    state.me=p.data;state.teams=t.data||[];state.settings=s.data||{};
    state.isAdmin=["admin","commissioner"].includes(String(p.data.role||"").toLowerCase());
    const teams=state.teams.map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join("");
    fill("ctStandingSubject",teams,myId());
    fill("ctTrophySubject",teams,myId());
    bind();
    await reload();
    refreshScope();refreshSpecificTrophy();refreshKind();setMode("classic");
    await loadExtraWaiverCalls();
  }catch(err){console.error("Trade condizionate:",err);failure("ctFormNotice","Errore caricamento condizioni: "+(err.message||"errore sconosciuto"));}
}
// Il modal degli svincoli classici richiama questo aggiornamento dopo la
// conclusione della parte giocatori. Nessuna scrittura, solo una nuova lettura.
window.refreshConditionalTradeRoom=reload;
document.addEventListener("DOMContentLoaded",init);
