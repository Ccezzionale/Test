import {supabase} from "./supabase.js";
import {
 createQaState,qaTeam,qaPick,qaPlayer,qaLockedIds,qaOwnedPicks,qaOwnedPlayers,
 qaSendOffer,qaRespondOffer,qaCancelOffer,qaPreviewRight,qaResolveRight,QA_TROPHIES
} from "./conditional-trade-qa-core.js";

/* Solo letture Supabase, solo modifiche in memoria.
 * NON chiamare le RPC reali della Trade Room, NON inviare push.
 */
const TEST_OWNER="tringali0511@gmail.com";
const PLAYABLE=["Team Bartowski","Bayern Christiansen","Desperados"];
const el=id=>document.getElementById(id);
const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({
 "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
}[c]));
const same=(a,b)=>String(a)===String(b);
let model=null;
let snapshot=null;
let viewer=null;
let tab="compose";
let formOwner=null;
let previews={};
const teams=()=>model?.teams||[];
const getTeam=id=>model&&qaTeam(model,id);
const teamName=id=>getTeam(id)?.name||"Franchigia";
const pickName=p=>p?"R"+p.round+" "+p.season+" · da "+teamName(p.original_team_id):"Pick non trovata";
const playerName=p=>p?.name||"Giocatore non trovato";
const displayedTeams=()=>PLAYABLE.map(name=>teams().find(t=>t.name===name)).filter(Boolean);
const availablePicks=id=>qaOwnedPicks(model,id).filter(p=>!qaLockedIds(model).has(String(p.id)));
const dateLabel=t=>t?new Date(t).toLocaleDateString("it-BE",{day:"2-digit",month:"short",year:"numeric"}):"";
const findRight=id=>model.rights.find(r=>same(r.id,id));
const kindLabel=k=>({standing:"Classifica",ranked:"Migliore / peggiore",trophy:"Premi / trofei",right_transfer:"Rivendita diritto"})[k]||k;
const fill=(id,options,defaultValue)=>{
 const node=el(id);if(!node)return "";
 const prefer=defaultValue??node.value;
 node.innerHTML=options.join("");
 if([...node.options].some(o=>o.value===String(prefer)))node.value=String(prefer);
 return node.value;
};
const option=(id,label)=>'<option value="'+esc(id)+'">'+esc(label)+'</option>';
const teamOptions=()=>displayedTeams().map(t=>option(t.id,t.name));
const pickOptions=(owner,{empty=false,exclude=[]}={})=>{
 const skip=new Set(exclude.map(String));
 return [...(empty?[option("","Seleziona una pick…")]:[]),
  ...availablePicks(owner).filter(p=>!skip.has(String(p.id))).map(p=>option(p.id,pickName(p)))];
};
const fallback=(choices,pred)=>choices.find(pred)?.id||choices[0]?.id||"";
function flash(message,isError=false){
 const n=el("qaToast");n.hidden=false;n.textContent=(isError?"⚠️ ":"✅ ")+message;
 n.classList.toggle("is-error",isError);
}
function chooseTab(next){
 tab=next;
 // Dopo un'accettazione aggiorna sempre pick e giocatori selezionabili.
 if(next==="compose"&&model)refreshForm(false);
 document.querySelectorAll("[data-qa-tab]").forEach(node=>{
  const active=node.dataset.qaTab===next;
  node.classList.toggle("active",active);
  node.setAttribute("aria-selected",String(active));
 });
 for(const id of ["compose","offers","rights","notices"]){
  el("qaScreen"+id[0].toUpperCase()+id.slice(1)).hidden=id!==next;
 }
 render();
}
function chooseViewer(id){
 if(!getTeam(id))return;
 viewer=id;
 formOwner=null;
 el("qaViewTeamName").textContent=teamName(id);
 const current=el("qaToTeam").value;
 fill("qaToTeam",displayedTeams().filter(t=>!same(t.id,id)).map(t=>option(t.id,t.name)),
  !same(current,id)?current:null);
 el("qaGrantorSide").value="mine";
 el("qaKind").value="standing";
 el("qaToast").hidden=true;
 refreshForm(true);
 render();
}
function readOwner(){
 return el("qaGrantorSide").value==="mine"?viewer:el("qaToTeam").value;
}
function readHolder(){
 return el("qaGrantorSide").value==="mine"?el("qaToTeam").value:viewer;
}
function trophyOptions(){
 const subject=getTeam(el("qaTrophySubject").value);
 return QA_TROPHIES.filter(t=>t.id!=="conference_league"&&t.id!=="conference_championship"||
   (t.id==="conference_league"&&subject?.conference==="Conference League")||
   (t.id==="conference_championship"&&subject?.conference==="Conference Championship"));
}
function updateTrophy(){
 fill("qaTrophySpecific",trophyOptions().map(x=>option(x.id,x.name)));
 el("qaSpecificField").hidden=el("qaTrophyMode").value!=="specific_trophy";
 updatePreview();
}
function updateStanding(){
 const scope=el("qaScope").value,subject=getTeam(el("qaStandingSubject").value);
 const total=scope==="round_robin"?teams().length:teams().filter(t=>t.conference===subject?.conference).length;
 const a=Number(el("qaTopCount").value),b=Number(el("qaBottomCount").value);
 el("qaStandingCount").textContent=scope==="round_robin"?"Round Robin · "+total+" squadre":
  (subject?.conference||"Conference")+" · "+total+" squadre";
 el("qaTopCount").max=total-1;
 el("qaBottomCount").max=total-1;
 el("qaMiddleField").hidden=!(a>0&&b>0&&a+b<total);
 updatePreview();
}
function eligibleRankedRounds(owner){
 const groups=new Map();
 for(const p of availablePicks(owner)){
  const round=Number(p.round);
  groups.set(round,(groups.get(round)||0)+1);
 }
 return [...groups].filter(([,count])=>count>=2).sort((a,b)=>a[0]-b[0]);
}
function refreshRanked(autoSelect=false){
 const owner=readOwner(),round=Number(el("qaRankedRound").value);
 const all=availablePicks(owner).filter(p=>Number(p.round)===round);
 const checked=new Set([...el("qaRankedPicks").querySelectorAll("input:checked")].map(x=>x.value));
 const valid=all.length>=2;
 el("qaRankedPicks").innerHTML=valid?all.map((p,i)=>
  '<label><input type="checkbox" value="'+esc(p.id)+'"'+
    ((checked.has(String(p.id))||(autoSelect&&i<2))?" checked":"")+'>'+
    '<span>'+esc(pickName(p))+'</span></label>').join(""):
  '<div class="qa-empty">Questa franchigia non ha almeno due pick libere nello stesso round. Prova con una condizione su classifica o trofeo.</div>';
 el("qaRankedPicks").querySelectorAll("input").forEach(input=>
  input.addEventListener("change",updatePreview));
 updatePreview();
}
function refreshPlayers(){
 fill("qaPlayerFrom",[option("","Nessuno"),...qaOwnedPlayers(model,viewer)
   .filter(p=>p.role!=="P").map(p=>option(p.id,playerName(p)+(p.is_u21_slot?" · U21":"")))]);
 fill("qaPlayerTo",[option("","Nessuno"),...qaOwnedPlayers(model,el("qaToTeam").value)
   .filter(p=>p.role!=="P").map(p=>option(p.id,playerName(p)+(p.is_u21_slot?" · U21":"")))]);
}
function refreshForm(reset=false){
 const kind=el("qaKind").value;
 if(kind==="right_transfer"){
   el("qaGrantorSide").value="mine";
   el("qaGrantorSide").disabled=true;
   const owned=model.rights.find(r=>r.status==="active"&&same(r.holder_team_id,viewer));
   if(owned&&(same(el("qaToTeam").value,owned.grantor_team_id)||
     same(el("qaToTeam").value,viewer))){
     const buyer=displayedTeams().find(t=>!same(t.id,viewer)&&
       !same(t.id,owned.grantor_team_id)&&t.conference===getTeam(viewer)?.conference);
     if(buyer)el("qaToTeam").value=buyer.id;
   }
 }else el("qaGrantorSide").disabled=false;
 const owner=readOwner(),holder=readHolder();
 const ownerChanged=String(formOwner)!==String(owner);
 formOwner=owner;
 for(const [name,id] of [["standing","qaStandingFields"],["ranked","qaRankedFields"],
  ["trophy","qaTrophyFields"],["right_transfer","qaResaleFields"]])
  el(id).hidden=kind!==name;
 if(reset||ownerChanged){
  fill("qaStandingSubject",teamOptions(),owner);
  fill("qaTrophySubject",teamOptions(),owner);
 }
 const picks=availablePicks(owner);
 const own4=fallback(picks,p=>p.round===4&&same(p.original_team_id,owner));
 const own5=fallback(picks,p=>p.round===5&&same(p.original_team_id,owner));
 fill("qaTopPick",pickOptions(owner),reset||ownerChanged?own4:null);
 fill("qaBottomPick",pickOptions(owner),reset||ownerChanged?own5:null);
 fill("qaMiddlePick",pickOptions(owner,{empty:true}),reset||ownerChanged?"":null);
 fill("qaWonPick",pickOptions(owner),reset||ownerChanged?own4:null);
 fill("qaNotWonPick",pickOptions(owner),reset||ownerChanged?own5:null);
 fill("qaCounterPick",pickOptions(holder,{empty:true}),reset||ownerChanged?"":null);
 if((reset||ownerChanged)&&availablePicks(holder).length){
  const other=availablePicks(holder);
  const pref=fallback(other,p=>p.round===1&&same(p.original_team_id,holder));
  fill("qaCounterPick",pickOptions(holder,{empty:true}),pref);
 }
 const validRounds=eligibleRankedRounds(owner);
 fill("qaRankedRound",validRounds.length
   ?validRounds.map(([round,count])=>option(round,"Round "+round+" · "+count+" pick disponibili"))
   :[option("","Nessun round con almeno 2 pick")],
   reset||ownerChanged?(validRounds[0]?.[0]??""):null);
 el("qaRankedRound").disabled=!validRounds.length;
 if(reset||ownerChanged)el("qaRankedPicks").innerHTML="";
 refreshRanked(reset||ownerChanged);
 const rights=model.rights.filter(r=>r.status==="active"&&same(r.holder_team_id,owner));
 fill("qaExistingRight",[option("","Scegli un diritto…"),
  ...rights.map(r=>option(r.id,"Diritto da "+teamName(r.grantor_team_id)+" → "+
    teamName(r.holder_team_id)+" · "+kindLabel(r.rule_kind)))],
   rights.length===1?rights[0].id:null);
 el("qaCounterInfo").textContent=teamName(holder)+" offre una pick per il diritto di "+teamName(owner)+".";
 refreshPlayers();
 updateStanding();
 updateTrophy();
 updatePreview();
}
function getFormOffer(){
 const grantor=readOwner(),holder=readHolder(),kind=el("qaKind").value;
 const data={from_team_id:viewer,to_team_id:el("qaToTeam").value,grantor_team_id:grantor,
  rule_kind:kind,rule_spec:{},candidate_pick_ids:[],counter_pick_id:el("qaCounterPick").value,
  existing_right_id:null,mixed_assets:[]};
 if(kind==="standing"){
  const t=el("qaTopPick").value,b=el("qaBottomPick").value,m=el("qaMiddlePick").value;
  const scope=el("qaScope").value,subject=getTeam(el("qaStandingSubject").value);
  const count=scope==="round_robin"?teams().length:teams().filter(x=>x.conference===subject?.conference).length;
  const top=Number(el("qaTopCount").value),bottom=Number(el("qaBottomCount").value);
  data.rule_spec={scope,subject_team_id:subject?.id,top_count:top,bottom_count:bottom,
    top_pick_id:t,bottom_pick_id:b,middle_pick_id:top+bottom<count?m:null};
  data.candidate_pick_ids=[...new Set([t,b,...(top+bottom<count?[m]:[])].filter(Boolean))];
 }else if(kind==="ranked"){
  data.rule_spec={which:el("qaRankedWhich").value};
  data.candidate_pick_ids=[...el("qaRankedPicks").querySelectorAll("input:checked")].map(x=>x.value);
 }else if(kind==="trophy"){
  const a=el("qaWonPick").value,b=el("qaNotWonPick").value;
  data.rule_spec={mode:el("qaTrophyMode").value,subject_team_id:el("qaTrophySubject").value,
   competition_id:el("qaTrophyMode").value==="specific_trophy"?el("qaTrophySpecific").value:null,
   won_pick_id:a,not_won_pick_id:b};
  data.candidate_pick_ids=[...new Set([a,b].filter(Boolean))];
 }else{
  data.existing_right_id=el("qaExistingRight").value;
 }
 const playerFrom=el("qaPlayerFrom").value,playerTo=el("qaPlayerTo").value;
 if(playerFrom)data.mixed_assets.push({side:"from",asset_type:"player",asset_id:playerFrom});
 if(playerTo)data.mixed_assets.push({side:"to",asset_type:"player",asset_id:playerTo});
 return data;
}
function branchLabels(kind,r,ids){
 if(kind==="standing"){
  const rows=["Primi "+r.top_count+" → "+pickName(qaPick(model,r.top_pick_id)),
   "Ultimi "+r.bottom_count+" → "+pickName(qaPick(model,r.bottom_pick_id))];
  if(r.middle_pick_id)rows.push("Posizioni intermedie → "+pickName(qaPick(model,r.middle_pick_id)));
  return rows;
 }
 if(kind==="ranked")return [(r.which==="best"?"Migliore":"Peggiore")+" di: "+ids.map(id=>pickName(qaPick(model,id))).join(" / ")];
 if(kind==="trophy"){
  const title=r.mode==="any_trophy"?"un trofeo qualsiasi":
   QA_TROPHIES.find(t=>t.id===r.competition_id)?.name||"il trofeo";
  return ["Se "+teamName(r.subject_team_id)+" vince "+title+" → "+pickName(qaPick(model,r.won_pick_id)),
   "Se non lo vince → "+pickName(qaPick(model,r.not_won_pick_id))];
 }
 return ["Il nuovo titolare riceve il diritto originale, senza cambiare la clausola."];
}
function resaleUnderlying(offer){
 const right=findRight(offer?.existing_right_id);
 return right&&["active","resolved"].includes(right.status)?right:null;
}
function resaleFlow(offer,right){
 const seller=offer.grantor_team_id;
 const buyer=same(seller,offer.from_team_id)?offer.to_team_id:offer.from_team_id;
 const price=qaPick(model,offer.counter_pick_id);
 const error=right&&right.status!=="active"
   ?"Diritto già finalizzato: la pick è stata assegnata e non può essere rivenduta.":
   right&&!same(right.holder_team_id,seller)
   ?"Attenzione: questa franchigia non è più titolare del diritto.":
   right&&same(buyer,right.grantor_team_id)
   ?"Attenzione: non puoi rivendere il diritto a chi deve già consegnare la pick.":
   !price?"Seleziona la pick con cui il compratore pagherà il diritto.":"";
 return {
  seller,buyer,price,error,
  summary:'<strong>Il venditore è '+esc(teamName(seller))+'; il compratore è '+esc(teamName(buyer))+'.</strong>'+
   (right?'<p><b>Obbligato originario:</b> '+esc(teamName(right.grantor_team_id))+
     '. Le sue pick candidate restano vincolate fino al risultato finale.</p>':'')+
   '<p><b>Prezzo immediato:</b> '+esc(teamName(buyer))+' consegna '+esc(pickName(price))+
   ' a '+esc(teamName(seller))+' quando accetta.</p>'+
   '<p><b>Nuovo titolare:</b> '+esc(teamName(buyer))+
   ' riceverà la pick prevista dalla clausola, una volta conclusa la competizione.</p>'+
   (error?'<p class="qa-resale-warning">'+esc(error)+'</p>':'')+
   '<ol><li>Invia la proposta di rivendita simulata.</li>'+
   '<li>Passa alla vista <b>'+esc(teamName(buyer))+'</b> e apri Proposte.</li>'+
   '<li>Premi <b>Accetta</b>. Solo allora il diritto cambia proprietario.</li>'+
   '<li>Torna a Diritti & Draft per vedere il nuovo titolare e lo storico.</li></ol>'
 };
}
function updatePreview(){
 if(!model)return;
 const d=getFormOffer();
 const resale=d.rule_kind==="right_transfer";
 const underlying=resale?resaleUnderlying(d):null;
 const resaleInfo=resale?resaleFlow(d,underlying):null;
 const lines=underlying?
   branchLabels(underlying.rule_kind,underlying.rule_spec,underlying.candidate_pick_ids):
   branchLabels(d.rule_kind,d.rule_spec,d.candidate_pick_ids);
 if(resale){
   el("qaResaleGuide").innerHTML=underlying?resaleInfo.summary:
     '<p class="qa-resale-warning">Nessun diritto attivo rivendibile da '+esc(teamName(viewer))+
     '. Una pick già assegnata non può essere rivenduta. Usa la prova guidata qui sotto.</p>';
 }
 el("qaSend").textContent=resale?"⇄ Invia proposta di rivendita simulata":"✉️ Invia proposta simulata";
 const ranked=d.rule_kind==="ranked",chosen=d.candidate_pick_ids.length;
 const eligible=ranked?eligibleRankedRounds(readOwner()):[];
 const rankedIssue=ranked&&(eligible.length===0||chosen<2);
 const activeOwn=model.rights.filter(r=>r.status==="active"&&same(r.holder_team_id,viewer));
 const resaleIssue=resale&&(!underlying||underlying.status!=="active"||
   !same(underlying.holder_team_id,viewer)||!!resaleInfo.error);
 el("qaSend").disabled=Boolean(rankedIssue||resaleIssue);
 el("qaResaleDemo").hidden=!resale||activeOwn.length>0;
 if(resale&&!activeOwn.length){
   const solved=model.rights.find(r=>r.status==="resolved"&&
     (same(r.grantor_team_id,viewer)||same(r.holder_team_id,viewer)||
      (r.history||[]).some(h=>same(h.from,viewer))));
   const other=model.rights.find(r=>r.status==="active"&&!same(r.holder_team_id,viewer));
   el("qaResaleNoRightsText").textContent=solved?
     "Il diritto che stai guardando è già FINALIZZATO: la pick è stata assegnata e non è più rivendibile. Usa la prova guidata per ricominciare prima della finalizzazione.":
     other?"Il diritto attivo appartiene a "+teamName(other.holder_team_id)+
     ". Devi usare la vista del titolare per rivenderlo, oppure avviare la prova guidata.":
     "Non hai diritti attivi. La prova guidata crea la trade Bartowski–Bayern accettata ma non ancora finalizzata.";
 }
 el("qaRankedHint").textContent=!ranked?"":eligible.length===0?
  teamName(readOwner())+" non possiede due pick disponibili nello stesso round. "+
  "Prova a cedere un diritto da Bayern o Desperados, oppure scegli una clausola diversa.":
  chosen<2?"Seleziona almeno due pick del Round "+el("qaRankedRound").value+" per confrontarle.":
  "✓ "+chosen+" pick dello stesso round selezionate: puoi inviare la proposta.";
 el("qaRankedHint").classList.toggle("is-error",Boolean(rankedIssue));
 const extra=(d.mixed_assets||[]).map(x=>(x.side==="from"?teamName(d.from_team_id):teamName(d.to_team_id))+
  " offre "+playerName(qaPlayer(model,x.asset_id)));
 el("qaOfferPreview").innerHTML="<strong>"+(resale?"RIVENDITA DI PROVA":"CONTRATTO DI PROVA")+
  " · "+esc(teamName(d.from_team_id))+" → "+esc(teamName(d.to_team_id))+"</strong><br>"+
  "<small>"+esc(teamName(d.grantor_team_id))+" cede il diritto a "+esc(teamName(
   same(d.grantor_team_id,d.from_team_id)?d.to_team_id:d.from_team_id))+"</small>"+
  (underlying?'<p><b>Clausola originale:</b> '+esc(kindLabel(underlying.rule_kind))+
   '. Il debitore resta '+esc(teamName(underlying.grantor_team_id))+'.</p>':'')+
  "<ul>"+lines.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>"+
  "<strong>"+(resale?"Prezzo che paga il compratore":"Contropartita")+":</strong> "+
  esc(pickName(qaPick(model,d.counter_pick_id)))+
  (extra.length?"<ul>"+extra.map(x=>"<li>"+esc(x)+"</li>").join("")+"</ul>":"")+
  (resale?"<p class='qa-hint'>Attenzione: il diritto passerà al compratore solo dopo la sua accettazione.</p>":"")+
  "<p class='qa-hint'>Non verrà inviata nessuna proposta reale.</p>";
}
function offerHtml(offer,type){
 const isIncoming=type==="incoming",r=offer.rule_spec||{};
 const underlying=offer.rule_kind==="right_transfer"?resaleUnderlying(offer):null;
 const lines=underlying?branchLabels(underlying.rule_kind,underlying.rule_spec,underlying.candidate_pick_ids):
  branchLabels(offer.rule_kind,r,offer.candidate_pick_ids);
 const extra=(offer.mixed_assets||[]).map(asset=>
  teamName(asset.side==="from"?offer.from_team_id:offer.to_team_id)+
  " offre "+playerName(qaPlayer(model,asset.asset_id)));
 const status={pending:"In attesa",accepted:"Accettata",rejected:"Rifiutata",cancelled:"Annullata"}[offer.status]||offer.status;
 const actions=offer.status==="pending"?
  (isIncoming?'<div class="qa-btn-row"><button type="button" class="qa-accept" data-action="accept" data-id="'+esc(offer.id)+'">✓ Accetta come '+esc(teamName(viewer))+'</button>'+
   '<button type="button" class="qa-decline" data-action="reject" data-id="'+esc(offer.id)+'">✕ Rifiuta</button></div>':
   '<div class="qa-btn-row"><button type="button" class="qa-decline" data-action="cancel" data-id="'+esc(offer.id)+'">Annulla proposta</button></div>'):"";
 return '<article class="qa-card"><div class="qa-card-head"><strong>'+
  esc(teamName(offer.from_team_id))+' ⇄ '+esc(teamName(offer.to_team_id))+'</strong><span class="qa-pill">'+
  esc(status)+'</span></div><p>🔐 '+esc(kindLabel(offer.rule_kind))+'</p>'+
  (underlying?'<p>📜 Diritto originale di <b>'+esc(teamName(underlying.grantor_team_id))+
    '</b>. '+esc(teamName(offer.grantor_team_id))+' vende a '+esc(teamName(
      same(offer.from_team_id,offer.grantor_team_id)?offer.to_team_id:offer.from_team_id))+
    '. Le condizioni e le pick candidate non cambiano.</p>':'')+
  '<ul>'+lines.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+
  '<p>'+(offer.rule_kind==="right_transfer"?"Prezzo pagato dal compratore":"Contropartita")+
  ': <b>'+esc(pickName(qaPick(model,offer.counter_pick_id)))+'</b></p>'+
  (extra.length?'<p>Giocatori inclusi:</p><ul>'+extra.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>':'')+
  actions+'</article>';
}
function renderOffers(){
 const incoming=model.offers.filter(o=>same(o.to_team_id,viewer));
 const outgoing=model.offers.filter(o=>same(o.from_team_id,viewer));
 el("qaReceived").innerHTML=incoming.length?incoming.map(o=>offerHtml(o,"incoming")).join(""):
  '<div class="qa-empty">Nessuna proposta ricevuta. Crea una trade come Bartowski e passa a Bayern.</div>';
 el("qaSent").innerHTML=outgoing.length?outgoing.map(o=>offerHtml(o,"outgoing")).join(""):
  '<div class="qa-empty">Nessuna proposta inviata da questa franchigia.</div>';
}
function evidenceForm(right){
 const spec=right.rule_spec;
 if(right.rule_kind==="standing"){
  const total=spec.scope==="conference"?model.teams.filter(t=>
   t.conference===getTeam(spec.subject_team_id)?.conference).length:model.teams.length;
  return '<label>Piazzamento ipotetico di '+esc(teamName(spec.subject_team_id))+
   ' (1–'+total+')<input data-evidence="position" type="number" min="1" max="'+total+
   '" value="'+Math.min(3,total)+'"></label>';
 }
 if(right.rule_kind==="ranked"){
  return '<p class="qa-hint">Simula l\'ordine Draft (numero più alto = pick peggiore).</p>'+
   '<div class="qa-rank-fields">'+right.candidate_pick_ids.map((id,i)=>
     '<label>'+esc(pickName(qaPick(model,id)))+
     '<input data-rank-id="'+esc(id)+'" type="number" min="1" value="'+(1+i*3)+'"></label>').join("")+'</div>';
 }
 return '<label>Risultato della competizione'+
  '<select data-evidence="trophy">'+
    '<option value="pending">Ancora in corso</option>'+
    '<option value="won">Trofeo conquistato</option>'+
    '<option value="lost">Trofeo non conquistato (competizioni concluse)</option>'+
  '</select></label>';
}
function collectEvidence(card,right){
 if(right.rule_kind==="standing"){
  return {position:Number(card.querySelector('[data-evidence="position"]')?.value)};
 }
 if(right.rule_kind==="ranked"){
  const positions={};
  card.querySelectorAll("[data-rank-id]").forEach(input=>positions[input.dataset.rankId]=Number(input.value));
  return {positions};
 }
 const mode=card.querySelector('[data-evidence="trophy"]')?.value;
 if(mode==="pending")return {outcomes:[]};
 const rule=right.rule_spec;
 const elig=rule.mode==="specific_trophy"?[rule.competition_id]:rule.eligible_competition_ids||[];
 const other=model.teams.find(x=>!same(x.id,rule.subject_team_id));
 return {outcomes:(mode==="won"?
  [{competition_id:elig[0],status:"final",winner_team_id:rule.subject_team_id}]:
  elig.map(id=>({competition_id:id,status:"final",winner_team_id:other.id})))};
}
function rightHtml(right){
 const former=(right.history||[]).some(h=>same(h.from,viewer)&&!same(right.holder_team_id,viewer));
 const member=same(right.grantor_team_id,viewer)||same(right.holder_team_id,viewer)||former;
 if(!member)return "";
 const active=right.status==="active";
 const historical=former&&!same(right.grantor_team_id,viewer);
 const rights=right.candidate_pick_ids.map(id=>qaPick(model,id)).filter(Boolean);
 const result=previews[right.id];
 const resell=active&&same(viewer,right.holder_team_id)?
  '<button class="qa-secondary" data-action="resell" data-id="'+esc(right.id)+'">⇄ Rivendi il diritto</button>':"";
 return '<article class="qa-card qa-right-card" data-right="'+esc(right.id)+'">'+
  '<div class="qa-card-head"><strong>🔐 '+esc(kindLabel(right.rule_kind))+'</strong>'+
  '<span class="qa-pill">'+(historical?"Venduto · ex titolare":
   active?"Vincolato · attivo":"Condizione risolta")+'</span></div>'+
  '<p><b>'+esc(teamName(right.grantor_team_id))+'</b> promette una pick a <b>'+
  esc(teamName(right.holder_team_id))+'</b></p>'+
  (historical?'<p class="qa-history-note">Hai venduto questo diritto. Adesso appartiene a <b>'+
    esc(teamName(right.holder_team_id))+'</b>; puoi consultarne lo storico, ma non rivenderlo di nuovo.</p>':'')+
  '<ul>'+branchLabels(right.rule_kind,right.rule_spec,right.candidate_pick_ids).map(x=>'<li>'+
  esc(x)+'</li>').join("")+'</ul>'+
  '<p>Pick candidate: '+rights.map(x=>(active?"🔐 ":"🔓 ")+esc(pickName(x))).join(" · ")+'</p>'+
  (right.history.length?'<p>Rivendite: '+right.history.map(h=>
   esc(teamName(h.from))+" → "+esc(teamName(h.to))).join(" · ")+'</p>':'')+
  (active&&!historical?'<div class="qa-resolution"><h4>📊 Esito ipotetico del contratto</h4>'+
   evidenceForm(right)+
   '<p class="qa-result">'+(result?esc(result):"Inserisci un risultato di prova per vedere quale pick toccherebbe al titolare.")+'</p>'+
   '<div class="qa-btn-row"><button class="qa-secondary" data-action="preview" data-id="'+esc(right.id)+'">👁 Anteprima</button>'+
   '<button class="qa-accept" data-action="resolve" data-id="'+esc(right.id)+'">✓ Finalizza solo nel test</button>'+
   resell+'</div></div>':
   active?'<p class="qa-history-note">La clausola è ancora aperta. La pick finale sarà assegnata a '+
    esc(teamName(right.holder_team_id))+' quando si conoscerà il risultato.</p>':
   '<p><b>Pick assegnata:</b> '+esc(pickName(qaPick(model,right.resolved_pick_id)))+
   ' a '+esc(teamName(right.holder_team_id))+'</p>')+
  '</article>';
}
function renderRights(){
 const current=model.rights.filter(r=>
  same(r.grantor_team_id,viewer)||same(r.holder_team_id,viewer)||
  (r.history||[]).some(h=>same(h.from,viewer)));
 el("qaRightsList").innerHTML=current.length?current.map(rightHtml).join(""):
  '<div class="qa-empty">Nessun diritto per '+esc(teamName(viewer))+
  '. Accetta una proposta finta come Bayern per crearne uno.</div>';
 const locked=qaLockedIds(model);
 const picks=qaOwnedPicks(model,viewer);
 el("qaPicksInventory").innerHTML=picks.map(p=>
  '<div class="qa-inventory-item'+(locked.has(String(p.id))?" is-locked":"")+'"><b>'+
  (locked.has(String(p.id))?"🔐 ":"")+esc(pickName(p))+'</b><small>'+
  (locked.has(String(p.id))?"Vincolata nel test":"Disponibile nel test")+'</small></div>').join("")||
  '<div class="qa-empty">Nessuna pick disponibile.</div>';
 const originalIds=new Set(snapshot?.players.filter(p=>same(p.owner_team_id,viewer)).map(p=>String(p.id))||[]);
 const moved=model.players.filter(p=>!same(p.owner_team_id,snapshot?.players.find(x=>same(x.id,p.id))?.owner_team_id));
 el("qaPlayersInventory").innerHTML=moved.filter(p=>same(p.owner_team_id,viewer)||originalIds.has(String(p.id))).map(p=>
  '<div class="qa-inventory-item"><b>'+esc(p.name)+'</b><small>'+
  esc(teamName(p.owner_team_id))+' · posizione simulata</small></div>').join("")||
  '<div class="qa-empty">Nessun giocatore coinvolto in una trade mista simulata.</div>';
}
function renderNotices(){
 const messages=model.messages.filter(n=>same(n.to_team_id,viewer));
 el("qaNotifications").innerHTML=messages.length?messages.map(n=>
  '<article class="qa-notification'+(n.read?" is-read":"")+'"><span>🔔</span><div>'+
  '<strong>'+esc(n.title)+'</strong><p>'+esc(n.body)+'</p>'+
  '<small>Notifica fittizia · destinatario '+esc(teamName(n.to_team_id))+'</small></div></article>').join(""):
  '<div class="qa-empty">Nessun avviso simulato per '+esc(teamName(viewer))+
  '. Invia una proposta e cambia squadra per verificare la posta.</div>';
 model.messages.filter(n=>same(n.to_team_id,viewer)).forEach(n=>n.read=true);
 renderMetrics();
}
function renderMetrics(){
 el("qaMetricOffers").textContent=model.offers.filter(o=>o.status==="pending").length;
 el("qaMetricRights").textContent=model.rights.filter(r=>r.status==="active").length;
 el("qaMetricLocks").textContent=qaLockedIds(model).size;
 el("qaMetricNotices").textContent=model.messages.filter(n=>same(n.to_team_id,viewer)&&!n.read).length;
 const pending=model.offers.filter(o=>o.status==="pending"&&same(o.to_team_id,viewer)).length;
 el("qaPendingBadge").hidden=!pending;
 el("qaPendingBadge").textContent=pending;
}
function render(){
 if(!model)return;
 el("qaTeamSwitcher").innerHTML=displayedTeams().map(t=>
  '<button type="button" data-viewer="'+esc(t.id)+'" class="'+(same(t.id,viewer)?"is-active":"")+'">'+
  esc(t.name)+(same(t.id,viewer)?" · attiva":"")+'</button>').join("");
 renderMetrics();
 if(tab==="compose")updatePreview();
 if(tab==="offers")renderOffers();
 if(tab==="rights")renderRights();
 if(tab==="notices")renderNotices();
}
function resetAll(){
 if(!window.confirm("Azzerare tutte le trade simulate, i lucchetti e le notifiche fittizie? I dati ufficiali non vengono toccati."))return;
 model=createQaState(snapshot);
 previews={};
 viewer=displayedTeams().find(t=>t.name==="Team Bartowski")?.id||displayedTeams()[0].id;
 tab="compose";
 el("qaToTeam").innerHTML="";
 el("qaKind").value="standing";
 chooseViewer(viewer);
 chooseTab("compose");
 flash("Simulazione ripristinata. Le pick ufficiali non sono mai cambiate.");
}
function send(){
 try{
  const offer=getFormOffer();
  const created=qaSendOffer(model,viewer,offer);
  render();
  flash(created.rule_kind==="right_transfer"?
    "Rivendita PROPOSTA, non ancora conclusa. Passa a "+teamName(created.to_team_id)+
    ", apri Proposte e premi Accetta per trasferire il diritto.":
    "Proposta "+created.id+" creata soltanto nel test. Passa a "+
    teamName(created.to_team_id)+" per rispondere.");
  chooseTab("offers");
 }catch(e){flash(e.message||"Proposta non valida",true);}
}
function handleAction(event){
 const button=event.target.closest("[data-action]");
 if(!button)return;
 const kind=button.dataset.action,id=button.dataset.id;
 try{
  if(kind==="accept"){
   const accepted=model.offers.find(o=>same(o.id,id));
   const right=qaRespondOffer(model,viewer,id,true);
   chooseTab("rights");
   flash(accepted?.rule_kind==="right_transfer"?
    "Rivendita conclusa nel test: il diritto appartiene ora a "+teamName(right.holder_team_id)+
    ". "+teamName(accepted.grantor_team_id)+" ha ricevuto la pick di contropartita. Le candidate restano vincolate.":
    "Trade accettata nella simulazione: diritto creato e pick candidate vincolate.");
  }else if(kind==="reject"){
   qaRespondOffer(model,viewer,id,false);
   render();flash("Proposta rifiutata soltanto nel test.");
  }else if(kind==="cancel"){
   qaCancelOffer(model,viewer,id);
   render();flash("Proposta annullata soltanto nel test.");
  }else if(kind==="preview"||kind==="resolve"){
   const card=button.closest("[data-right]");
   const right=findRight(id);
   const evidence=collectEvidence(card,right);
   const result=kind==="preview"?qaPreviewRight(model,id,evidence):qaResolveRight(model,id,evidence);
   const explanation=result.status==="pending"?"Condizione ancora in corso: nessuna pick assegnata.":
     (kind==="preview"?"Se finisse oggi: ":"Assegnata solo nel test: ")+
     pickName(qaPick(model,result.pickId))+" → "+teamName(right.holder_team_id)+".";
   previews[id]=explanation;
   render();
   flash(kind==="preview"?"Anteprima calcolata, nessuna pick trasferita.":
    result.status==="pending"?"La condizione resta aperta.":explanation);
  }else if(kind==="resell"){
   const right=findRight(id);
   if(!right||right.status!=="active"||!same(right.holder_team_id,viewer))
    throw new Error("Può rivendere il diritto solo il titolare attuale.");
   const buyer=displayedTeams().find(t=>!same(t.id,viewer)&&!same(t.id,right.grantor_team_id));
   if(!buyer)throw new Error("Nessun compratore disponibile per questa rivendita.");
   chooseTab("compose");
   el("qaToTeam").value=buyer.id;
   el("qaGrantorSide").value="mine";
   el("qaKind").value="right_transfer";
   refreshForm(true);
   el("qaExistingRight").value=right.id;
   // Le selezioni dei giocatori da una precedente proposta non devono mai
   // entrare automaticamente nella rivendita di un diritto.
   el("qaPlayerFrom").value="";
   el("qaPlayerTo").value="";
   el("qaMixedDetails").open=false;
   updatePreview();
   flash("Rivendita preparata, NON conclusa. 1. Verifica il prezzo pagato da "+
    buyer.name+". 2. Invia. 3. Passa a "+buyer.name+" e accetta la proposta.");
   el("qaScreenCompose").scrollIntoView({behavior:"smooth",block:"start"});
  }
 }catch(e){flash(e.message||"Operazione non consentita",true);}
}
function wire(){
 el("qaTeamSwitcher").addEventListener("click",event=>{
  const button=event.target.closest("[data-viewer]");
  if(button)chooseViewer(button.dataset.viewer);
 });
 document.querySelectorAll("[data-qa-tab]").forEach(b=>
  b.addEventListener("click",()=>chooseTab(b.dataset.qaTab)));
 el("qaSend").addEventListener("click",send);
 el("qaReset").addEventListener("click",resetAll);
 document.body.addEventListener("click",event=>{
  if(event.target.closest("[data-action]"))handleAction(event);
 });
 for(const id of ["qaToTeam","qaGrantorSide","qaKind"])
  el(id).addEventListener("change",()=>{
   if(id==="qaKind"&&el("qaKind").value==="right_transfer"){
     // Evita di portarsi dietro giocatori selezionati per un'altra proposta.
     el("qaPlayerFrom").value="";
     el("qaPlayerTo").value="";
     el("qaMixedDetails").open=false;
     const seller=readOwner();
     const right=model?.rights.find(r=>r.status==="active"&&same(r.holder_team_id,seller));
     if(right&&same(readHolder(),right.grantor_team_id)&&same(seller,viewer)){
       const alternative=displayedTeams().find(t=>!same(t.id,seller)&&
         !same(t.id,right.grantor_team_id));
       if(alternative)el("qaToTeam").value=alternative.id;
     }
   }
   refreshForm(true);
  });
 for(const id of ["qaStandingSubject","qaScope","qaTopCount","qaBottomCount"])
  el(id).addEventListener("change",updateStanding);
 for(const id of ["qaTopPick","qaBottomPick","qaMiddlePick","qaCounterPick",
   "qaRankedWhich","qaWonPick","qaNotWonPick","qaExistingRight","qaPlayerFrom","qaPlayerTo"])
  el(id).addEventListener("change",updatePreview);
 el("qaRankedRound").addEventListener("change",()=>{
  el("qaRankedPicks").innerHTML="";refreshRanked(true);
 });
 el("qaTrophyMode").addEventListener("change",updateTrophy);
 el("qaTrophySubject").addEventListener("change",updateTrophy);
 el("qaTrophySpecific").addEventListener("change",updatePreview);
}
async function init(){
 try{
  const {data:auth,error}=await supabase.auth.getUser();
  if(error||!auth?.user)throw new Error("Devi accedere alla Lega degli Eroi. <a href='login.html'>Vai al login</a>.");
  if(String(auth.user.email).toLowerCase()!==TEST_OWNER)
   throw new Error("Questa modalità è riservata all'account autorizzato. Non è possibile impersonare franchigie nel mercato reale.");
  const {data:cfg,error:cfgError}=await supabase.from("trade_settings")
   .select("future_pick_season").eq("id",1).maybeSingle();
  if(cfgError)throw cfgError;
  const season=Number(cfg?.future_pick_season||2027);
  const [t,p,pl]=await Promise.all([
   supabase.from("teams").select("id,name,conference"),
   supabase.from("future_draft_picks")
    .select("id,season,draft_name,round,original_team_id,owner_team_id,pick_kind,status")
    .eq("season",season).eq("status","active"),
   supabase.from("players")
    .select("id,name,owner_team_id,status,role,role_mantra,is_u21_slot")
    .eq("status","active")
  ]);
  for(const result of [t,p,pl])if(result.error)throw result.error;
  if(!t.data?.length||!p.data?.length)throw new Error("Impossibile leggere le squadre e le pick ufficiali.");
  snapshot={teams:t.data,picks:p.data,players:pl.data||[],season};
  model=createQaState(snapshot);
  viewer=displayedTeams().find(x=>x.name==="Team Bartowski")?.id;
  if(!viewer||displayedTeams().length<3)throw new Error("Manca almeno una delle tre franchigie necessarie al collaudo.");
  wire();
  el("qaGate").hidden=true;
  el("qaApp").hidden=false;
  chooseViewer(viewer);
  chooseTab("compose");
 }catch(e){
  console.warn("Modalità Test non disponibile:",e);
  el("qaGate").innerHTML='<div class="qa-spinner">🔒</div><h2>Modalità Test non disponibile</h2><p>'+
   esc((e.message||String(e)).replace(/<[^>]*>/g,""))+'</p>'+
   '<p><a href="login.html">Vai al login</a> · <a href="trade-room.html">Torna alla Trade Room</a></p>';
 }
}
document.addEventListener("DOMContentLoaded",init);
