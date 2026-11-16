import {supabase} from "./supabase.js";
import {
  validateCandidates,resolveStandings,resolveRanked,transferConditionalRight,
  isPickLocked,validateOneForOne,resolveTrophyCondition,TROPHY_COMPETITIONS
} from "./conditional-trades-core.js";

/* Laboratorio di simulazione: letture SELECT soltanto.
   NON creare offerte, NON toccare trade_assets, NON trasferire pick. */
const LAB_OWNER="tringali0511@gmail.com";
const el=id=>document.getElementById(id);
const str=v=>String(v??"");
const esc=v=>str(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const state={teams:[],picks:[],tab:"standing",right:null,selectedRanked:new Set(),positions:{},phase:"conference_market",season:2027};
const team=id=>state.teams.find(t=>str(t.id)===str(id));
const byName=name=>state.teams.find(t=>t.name===name);
const teamLabel=id=>team(id)?.name||"Franchigia sconosciuta";
const pickName=p=>p?("R"+p.round+" "+p.season+" · da "+teamLabel(p.original_team_id)):"Pick sconosciuta";
const pickById=id=>state.picks.find(p=>str(p.id)===str(id));
// Unico ordinamento per tutti i selettori: stagione, round numerico, Conference e squadra di origine.
const compareFuturePicks=(a,b)=>
  Number(a.season)-Number(b.season)||
  Number(a.round)-Number(b.round)||
  str(a.draft_name).localeCompare(str(b.draft_name),"it",{sensitivity:"base",numeric:true})||
  teamLabel(a.original_team_id).localeCompare(teamLabel(b.original_team_id),"it",{sensitivity:"base",numeric:true})||
  str(a.id).localeCompare(str(b.id));
const byOwner=id=>state.picks
  .filter(p=>str(p.owner_team_id)===str(id)&&p.pick_kind==="normal"&&p.status==="active")
  .sort(compareFuturePicks);
const same=x=>(a,b)=>str(a)===str(b);
const differentConf=(from,to)=>state.phase!=="round_robin_market"&&team(from)?.conference!==team(to)?.conference;
const errorMessage=(box,msg)=>{box.classList.add("is-error");box.innerHTML='<h3>Condizione non valida</h3><p>'+esc(msg)+'</p>';};
const fillSelect=(id,values,preferred)=>{const element=el(id);const last=preferred??element.value;element.innerHTML=values.join("");if([...element.options].some(opt=>opt.value===str(last)))element.value=str(last);return element.value;};
const teamOptions=(exclude=null)=>state.teams.filter(t=>t.id!==exclude).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>');
const pickOptions=(picks,allowEmpty=false)=>[
  ...(allowEmpty?['<option value="">Non necessaria / seleziona...</option>']:[]),
  ...picks.map(p=>'<option value="'+esc(p.id)+'">'+esc(pickName(p))+'</option>')
];
function showPanel(name){
  state.tab=name;
  document.querySelectorAll("[data-tab]").forEach(b=>{
    const active=b.dataset.tab===name;
    b.classList.toggle("is-active",active);
    b.setAttribute("aria-selected",active?"true":"false");
  });
  document.querySelectorAll("[data-panel]").forEach(p=>{p.hidden=p.dataset.panel!==name;});
  state.right=null;el("rightsPanel").hidden=true;
}
function defaultTeam(name,fallback){
  return byName(name)?.id||fallback;
}
async function init(){
  try{
    const {data:auth,error:authError}=await supabase.auth.getUser();
    if(authError||!auth?.user)throw new Error("Accedi alla Lega degli Eroi prima di aprire il laboratorio.");
    if(str(auth.user.email).toLowerCase()!==LAB_OWNER){
      throw new Error("Questo laboratorio è ancora riservato all'account di prova; il mercato ufficiale è aperto a tutti.");
    }
    const [t,p,settings]=await Promise.all([
      supabase.from("teams").select("id,name,conference").order("name",{ascending:true}),
      supabase.from("future_draft_picks").select("id,season,draft_name,round,original_team_id,owner_team_id,pick_kind,status")
        .eq("season",state.season).eq("status","active").eq("pick_kind","normal"),
      supabase.from("trade_settings").select("active_phase,future_pick_season").eq("id",1).maybeSingle()
    ]);
    if(t.error)throw t.error;
    if(p.error)throw p.error;
    state.teams=t.data||[];
    state.picks=(p.data||[]).sort(compareFuturePicks);
    state.phase=settings.data?.active_phase||state.phase;
    state.season=settings.data?.future_pick_season||state.season;
    if(!state.teams.length||!state.picks.length)throw new Error("Dati squadre o pick non disponibili.");
    const all=teamOptions(),bart=defaultTeam("Team Bartowski",state.teams[0]?.id),
      bayern=defaultTeam("Bayern Christiansen",state.teams[1]?.id),
      golden=defaultTeam("Golden Knights",state.teams[0]?.id);
    const sameAsGolden=state.teams.find(t=>t.id!==golden&&t.conference===team(golden)?.conference)?.id;
    fillSelect("standingGrantor",all,bart);
    fillSelect("standingHolder",all,bayern);
    fillSelect("standingSubject",all,bart);
    fillSelect("rankedGrantor",all,golden);
    fillSelect("rankedHolder",all,sameAsGolden);
    fillSelect("newRightHolder",all,"");
    el("loading").hidden=true;
    el("labApp").hidden=false;
    refreshStandingPicks(true);
    refreshStandingScope();
    refreshRankedPicks(true);
    initTrophyScenario(bart,bayern);
    bindEvents();
  }catch(e){
    el("loading").innerHTML='<strong>Laboratorio non disponibile</strong><span>'+esc(e.message||"Impossibile caricare i dati.")+'</span>';
  }
}

function standingScope(){
  const subject=team(el("standingSubject").value);
  const competition=el("standingCompetition").value;
  const teams=competition==="round_robin"?state.teams:state.teams.filter(t=>subject&&t.conference===subject.conference);
  return {count:teams.length,name:competition==="round_robin"?"Round Robin":subject?.conference||"Conference"};
}
function syncStandingMiddleVisibility(){
  const count=standingScope().count,top=Number(el("standingTopN").value),bottom=Number(el("standingBottomN").value);
  el("standingMiddleRow").hidden=!(Number.isInteger(top)&&Number.isInteger(bottom)&&top>=1&&bottom>=1&&top+bottom<count);
}
function refreshStandingScope(){
  const scope=standingScope(),existing=el("standingPosition").value||"3";
  el("standingScopeInfo").textContent=scope.name+" · "+scope.count+" squadre (automatico)";
  const opts=Array.from({length:scope.count},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'° posto</option>');
  fillSelect("standingPosition",opts,Math.min(Math.max(1,Number(existing)||3),scope.count));
  syncStandingMiddleVisibility();
  clearResult("standingResult");
}

function refreshStandingPicks(reset=false){
  const grantor=el("standingGrantor").value,holder=el("standingHolder").value;
  const picks=byOwner(grantor).sort((a,b)=>a.round-b.round||pickName(a).localeCompare(pickName(b),"it"));
  const bart=team(grantor)?.name==="Team Bartowski";
  const ownOriginal=picks.find(p=>str(p.original_team_id)===str(grantor)&&p.round===4);
  const ownOriginal5=picks.find(p=>str(p.original_team_id)===str(grantor)&&p.round===5);
  fillSelect("standingTopPick",pickOptions(picks),reset&&bart?ownOriginal?.id:null);
  fillSelect("standingBottomPick",pickOptions(picks),reset&&bart?ownOriginal5?.id:null);
  fillSelect("standingMiddlePick",pickOptions(picks,true),reset?"":undefined);
  fillSelect("standingCounter",pickOptions(byOwner(holder).filter(p=>p.draft_name===team(grantor)?.conference?.replace("Conference League","Draft Conference").replace("Conference Championship","Draft Championship")),true),reset?"":undefined);
  // Una contropartita può essere dello stesso anno ma di round differente.
  const counter=el("standingCounter");
  if(!counter.options.length||counter.options.length===1){
    fillSelect("standingCounter",pickOptions(byOwner(holder),true),"");
  }
  clearResult("standingResult");
}

function trophyEligibleCompetitions(){
  const subject=team(el("trophySubject").value);
  return TROPHY_COMPETITIONS.filter(c=>{
    if(c.id==="conference_league")return subject?.conference==="Conference League";
    if(c.id==="conference_championship")return subject?.conference==="Conference Championship";
    return true;
  });
}
function trophySelectOptions(){
  return trophyEligibleCompetitions().map(c=>
    '<option value="'+esc(c.id)+'">'+esc(c.name)+'</option>');
}
function initTrophyScenario(grantor,holder){
  const teams=teamOptions();
  fillSelect("trophyGrantor",teams,grantor);
  fillSelect("trophyHolder",teams,holder);
  fillSelect("trophySubject",teams,grantor);
  el("trophyMode").value="any_trophy";
  refreshTrophyPicks(true);
  refreshTrophyMode();
}
function refreshTrophyPicks(reset=false){
  const grantor=el("trophyGrantor").value;
  const holder=el("trophyHolder").value;
  const picks=byOwner(grantor);
  const isBart=team(grantor)?.name==="Team Bartowski";
  const own4=picks.find(p=>p.round===4&&str(p.original_team_id)===str(grantor));
  const own5=picks.find(p=>p.round===5&&str(p.original_team_id)===str(grantor));
  fillSelect("trophyWonPick",pickOptions(picks),reset&&isBart?own4?.id:undefined);
  fillSelect("trophyNotWonPick",pickOptions(picks),reset&&isBart?own5?.id:undefined);
  fillSelect("trophyCounter",pickOptions(byOwner(holder),true),reset?"":undefined);
  clearResult("trophyResult");
}
function refreshTrophyMode(){
  const specific=el("trophyMode").value==="specific_trophy";
  el("trophySpecificRow").hidden=!specific;
  const available=trophySelectOptions();
  fillSelect("trophySpecific",available);
  fillSelect("trophyMockWinner",available);
  const test=el("trophyTestResult").value;
  el("trophyMockWinnerRow").hidden=specific||test!=="won";
  clearResult("trophyResult");
}
function simulateTrophy(){
  const box=el("trophyResult");
  try{
    const grantor=el("trophyGrantor").value;
    const holder=el("trophyHolder").value;
    const subject=el("trophySubject").value;
    const mode=el("trophyMode").value;
    const specificId=el("trophySpecific").value;
    const test=el("trophyTestResult").value;
    const wonPick=pickById(el("trophyWonPick").value);
    const notWonPick=pickById(el("trophyNotWonPick").value);
    const counter=pickById(el("trophyCounter").value);
    checkParties(grantor,holder,counter);
    if(!wonPick||!notWonPick||wonPick.id===notWonPick.id){
      throw new Error("Seleziona due pick differenti, una per ciascun esito.");
    }
    const candidates=[wonPick,notWonPick];
    validateCandidates(candidates,{ownerId:grantor,season:state.season});
    const eligible=trophyEligibleCompetitions();
    const eligibleIds=eligible.map(c=>c.id);
    const otherTeam=state.teams.find(t=>str(t.id)!==str(subject));
    if(!otherTeam)throw new Error("Non è disponibile una squadra avversaria per il test.");
    if(mode==="specific_trophy"&&!eligibleIds.includes(specificId)){
      throw new Error("La competizione scelta non è ammissibile per la franchigia indicata.");
    }
    const targetId=mode==="specific_trophy"?specificId:null;
    let outcomes=[];
    if(test==="won"){
      const wonId=mode==="specific_trophy"?specificId:el("trophyMockWinner").value;
      if(!eligibleIds.includes(wonId))throw new Error("Seleziona un trofeo ammissibile per il test.");
      outcomes=[{competition_id:wonId,status:"final",winner_team_id:subject}];
    }else if(test==="not_won"){
      // Per "qualsiasi trofeo" il NO è dimostrabile solo se TUTTI
      // i tornei ammissibili sono terminati senza una vittoria.
      const targets=mode==="specific_trophy"?[specificId]:eligibleIds;
      outcomes=targets.map(id=>({competition_id:id,status:"final",winner_team_id:otherTeam.id}));
    }else if(test!=="pending"){
      throw new Error("Risultato simulato non valido.");
    }
    const resolution=resolveTrophyCondition({
      mode,subjectTeamId:subject,competitionId:targetId,
      eligibleCompetitionIds:eligibleIds,outcomes
    });
    const specificLabel=eligible.find(c=>c.id===specificId)?.name||"Trofeo";
    const rule=mode==="specific_trophy"
      ?"Vittoria "+specificLabel+" di "+teamLabel(subject)
      :"Vittoria di un qualsiasi trofeo ammissibile da parte di "+teamLabel(subject);
    const chosen=resolution.status==="pending"?null:
      resolution.triggered?wonPick:notWonPick;
    box.classList.remove("is-error");
    if(resolution.status==="pending"){
      box.innerHTML='<h3>⏳ Condizione ancora aperta</h3>'+
        '<p>'+esc(rule)+'</p>'+
        '<p>Il torneo (o almeno un torneo rilevante) non è concluso: <strong>non viene assegnata alcuna pick</strong>.</p>'+
        '<p>Entrambe le pick rimangono candidate e non possono essere cedute separatamente una volta creato il diritto reale.</p>'+
        '<p style="color:#ffd664">Test ipotetico. Nel mercato reale servirà il risultato ufficiale definitivo.</p>';
    }else{
      const outcomeLabel=resolution.triggered?"Condizione avverata":"Condizione non avverata";
      showResult(box,chosen,resolution.triggered?"won":"not_won",
        outcomeLabel+" · "+rule,candidates.map(p=>p.id));
    }
    prepareRight({holderId:holder,grantorId:grantor,candidates,rule,selected:chosen});
  }catch(e){
    state.right=null;
    el("rightsPanel").hidden=true;
    errorMessage(box,e.message);
  }
}

function clearResult(id){el(id).textContent="";el(id).classList.remove("is-error");el("rightsPanel").hidden=true;state.right=null;}
function refreshRankedPicks(reset=false){
  const owner=el("rankedGrantor").value,holder=el("rankedHolder").value;
  const picks=byOwner(owner).filter(p=>p.pick_kind==="normal");
  const rounds=[...new Set(picks.map(p=>p.round))].sort((a,b)=>a-b);
  const current=el("rankedRound").value;
  const preferredRound=rounds.some(r=>String(r)===current)?current:String(rounds[0]??"");
  fillSelect("rankedRound",rounds.map(r=>'<option value="'+r+'">Round '+r+'</option>'),preferredRound);
  const round=Number(el("rankedRound").value);
  const candidates=picks.filter(p=>p.round===round).sort((a,b)=>pickName(a).localeCompare(pickName(b),"it"));
  const keep=reset?new Set(candidates.map(p=>str(p.id))):state.selectedRanked;
  state.selectedRanked=new Set(candidates.filter(p=>keep.has(str(p.id))).map(p=>str(p.id)));
  if(!state.selectedRanked.size&&reset)state.selectedRanked=new Set(candidates.map(p=>str(p.id)));
  const locked=new Set(state.selectedRanked);
  el("rankedCount").textContent=state.selectedRanked.size+" selezionate";
  el("rankedPicks").innerHTML=candidates.length?candidates.map(p=>
    '<label class="candidate-item"><input type="checkbox" data-pick="'+esc(p.id)+'"'+(locked.has(str(p.id))?" checked":"")+'>'+
    '<span><strong>R'+p.round+' '+p.season+'</strong><small>'+esc(teamLabel(p.original_team_id))+'</small></span></label>'
  ).join(""):'<p class="help-text">Nessuna pick di questo round posseduta dalla squadra.</p>';
  for(const cb of el("rankedPicks").querySelectorAll("[data-pick]")){
    cb.addEventListener("change",()=>{
      if(cb.checked)state.selectedRanked.add(cb.dataset.pick);
      else state.selectedRanked.delete(cb.dataset.pick);
      redrawRankedPositions();
    });
  }
  fillSelect("rankedCounter",pickOptions(byOwner(holder),true),reset?"":undefined);
  redrawRankedPositions();
}
function redrawRankedPositions(){
  const owner=el("rankedGrantor").value;
  const selected=byOwner(owner).filter(p=>state.selectedRanked.has(str(p.id)));
  el("rankedCount").textContent=selected.length+" selezionate";
  const size=state.picks.filter(p=>p.draft_name===selected[0]?.draft_name&&p.round===selected[0]?.round).length;
  el("rankedPositions").innerHTML=selected.map((p,index)=>{
    const current=state.positions[str(p.id)]??Math.min(index+1,size||1);
    return '<label class="position-item"><span>'+esc(teamLabel(p.original_team_id))+'</span>'+
      '<input type="number" min="1" max="'+Math.max(1,size)+'" value="'+esc(current)+'" data-position="'+esc(p.id)+'" aria-label="Posizione di '+esc(teamLabel(p.original_team_id))+'"></label>';
  }).join("");
  for(const input of el("rankedPositions").querySelectorAll("[data-position]")){
    input.addEventListener("input",()=>{state.positions[input.dataset.position]=Number(input.value);});
  }
  clearResult("rankedResult");
}
function prepareRight(spec){
  state.right={status:"active",holder_team_id:spec.holderId,grantor_team_id:spec.grantorId,
    candidate_pick_ids:spec.candidates.map(p=>str(p.id)),history:[],rule:spec.rule,
    resultPick:spec.selected?.id||null,season:spec.candidates[0].season};
  el("rightsPanel").hidden=false;
  renderRight();
}
function renderRight(){
  const r=state.right;
  if(!r)return;
  const selected=pickById(r.resultPick);
  el("rightsSummary").innerHTML=
    'Titolare attuale: <strong>'+esc(teamLabel(r.holder_team_id))+'</strong><br>'+
    'Squadra obbligata: <strong>'+esc(teamLabel(r.grantor_team_id))+'</strong><br>'+
    'Condizione: '+esc(r.rule)+'<br>'+
    'Pick candidata individuata: <strong>'+esc(selected?pickName(selected):'In attesa del risultato ufficiale')+'</strong><br>'+
    '<span class="mini-tag">1 solo diritto = 1 pick</span><span class="mini-tag">'+r.candidate_pick_ids.length+' candidate vincolate</span>'+
    '<p>'+esc(r.candidate_pick_ids.filter(id=>isPickLocked(id,[r])).map(id=>pickName(pickById(id))).join(" · "))+'</p>'+
    '<p>Le pick sottostanti restano intestate ai loro attuali proprietari nella simulazione.</p>';
  fillSelect("newRightHolder",teamOptions(r.holder_team_id),"");
  fillSelect("newRightCounter",pickOptions(byOwner(el("newRightHolder").value),true),"");
  el("rightsHistory").innerHTML=r.history.length?
    '<strong>Catena dei trasferimenti simulati</strong><div>'+r.history.map(h=>esc(teamLabel(h.from))+' → '+esc(teamLabel(h.to))+(h.counterPick?' (in cambio: '+esc(h.counterPick)+')':'')).join('<br>')+'</div>':
    '<strong>Nessuna cessione successiva:</strong> il titolare è quello dell’accordo iniziale.';
}
function showResult(box,pick,branch,names,lockedIds){
  box.classList.remove("is-error");
  box.innerHTML='<h3>✓ Condizione risolvibile</h3>'+
    '<p>'+esc(names)+'</p>'+
    '<p><strong>Scelta individuata:</strong> '+esc(pickName(pick))+'</p>'+
    '<p><strong>Vincolo:</strong> '+lockedIds.length+' pick coinvolte, di cui una da assegnare e '+(lockedIds.length-1)+' da liberare dopo la risoluzione.</p>'+
    '<p><strong>Contropartita:</strong> un diritto vale una pick futura ai fini del rapporto 1:1.</p>'+
    '<p style="color:#ffd664">Esito calcolato solo nella simulazione. Nessun trasferimento è stato eseguito.</p>';
}
function checkParties(grantor,holder,counterPick){
  if(str(grantor)===str(holder))throw new Error("Il titolare iniziale deve essere una franchigia diversa da quella che promette la pick.");
  if(differentConf(grantor,holder))throw new Error("Le due franchigie appartengono a Conference diverse: nella fase attuale il mercato non consente questo scambio.");
  if(!counterPick)throw new Error("Seleziona una pick della squadra che acquisisce il diritto per rispettare la regola 1:1.");
  if(str(counterPick.owner_team_id)!==str(holder))throw new Error("La contropartita non è più posseduta dalla squadra che acquisisce il diritto.");
  validateOneForOne([{kind:"conditional_right"}],[{kind:"future_pick"}]);
}
function simulateStanding(){
  const box=el("standingResult");
  try{
    const grantor=el("standingGrantor").value,holder=el("standingHolder").value;
    const top=pickById(el("standingTopPick").value),bottom=pickById(el("standingBottomPick").value);
    const counter=pickById(el("standingCounter").value);
    const scope=standingScope(),size=scope.count,topN=Number(el("standingTopN").value),bottomN=Number(el("standingBottomN").value);
    const position=Number(el("standingPosition").value),hasMiddle=topN+bottomN<size;
    const middle=hasMiddle?pickById(el("standingMiddlePick").value):null;
    checkParties(grantor,holder,counter);
    if(!top||!bottom||top.id===bottom.id)throw new Error("Seleziona due pick diverse per le due fasce.");
    if(hasMiddle&&!middle)throw new Error("Manca il caso delle posizioni intermedie: scegli quale pick spetta al titolare.");
    const candidates=[...new Map([top,bottom,...(middle?[middle]:[])].map(p=>[str(p.id),p])).values()];
    validateCandidates(candidates,{ownerId:grantor,season:state.season});
    const resolved=resolveStandings({
      position,teamCount:size,topCount:topN,bottomCount:bottomN,
      topPickId:top.id,bottomPickId:bottom.id,middlePickId:middle?.id
    });
    // Questo laboratorio simula un solo diritto alla volta: non bloccare i nuovi calcoli dello stesso accordo.
    const selected=pickById(resolved.pickId);
    const labels={top:"fascia alta",bottom:"fascia bassa",middle:"fascia intermedia"};
    const rule=scope.name+" · posizione di "+teamLabel(el("standingSubject").value)+": "+labels[resolved.branch]+" (n. "+position+" su "+size+")";
    showResult(box,selected,resolved.branch,rule,candidates.map(p=>p.id));
    prepareRight({holderId:holder,grantorId:grantor,candidates,rule,selected});
  }catch(e){state.right=null;el("rightsPanel").hidden=true;errorMessage(box,e.message);}
}
function simulateRanked(){
  const box=el("rankedResult");
  try{
    const grantor=el("rankedGrantor").value,holder=el("rankedHolder").value,round=Number(el("rankedRound").value);
    const selected=byOwner(grantor).filter(p=>state.selectedRanked.has(str(p.id)));
    const counter=pickById(el("rankedCounter").value);
    checkParties(grantor,holder,counter);
    validateCandidates(selected,{ownerId:grantor,season:state.season,round});
    const size=state.picks.filter(p=>p.draft_name===selected[0].draft_name&&p.round===round).length;
    const order={};
    for(const input of el("rankedPositions").querySelectorAll("[data-position]")){
      const pos=Number(input.value);
      if(!Number.isInteger(pos)||pos<1||pos>size)throw new Error("La posizione Draft deve essere compresa tra 1 e "+size+" per questo round.");
      order[input.dataset.position]=pos;
    }
    const resolved=resolveRanked({candidates:selected,orderByPickId:order,which:el("rankedType").value});
    const found=pickById(resolved.pickId);
    const which=resolved.which==="worst"?"peggiore":"migliore";
    const rule="Assegnare la "+which+" tra "+selected.length+" pick (posizione Draft "+resolved.overallPick+")";
    showResult(box,found,which,rule,selected.map(p=>p.id));
    prepareRight({holderId:holder,grantorId:grantor,candidates:selected,rule,selected:found});
  }catch(e){state.right=null;el("rightsPanel").hidden=true;errorMessage(box,e.message);}
}
function transfer(){
  try{
    if(!state.right)throw new Error("Simula prima una condizione valida.");
    const next=el("newRightHolder").value;
    if(!next)throw new Error("Seleziona la franchigia che riceve il diritto.");
    if(differentConf(state.right.holder_team_id,next)){
      throw new Error("Cessione tra Conferences non consentita nella fase attuale.");
    }
    const counter=pickById(el("newRightCounter").value);
    if(!counter||str(counter.owner_team_id)!==str(next)){
      throw new Error("Il nuovo titolare deve offrire una sua pick futura come contropartita 1:1.");
    }
    validateOneForOne([{kind:"conditional_right"}],[{kind:"future_pick"}]);
    // Simulazione di vendita: nessuna modifica alle pick o a Supabase.
    const right=transferConditionalRight(state.right,next);
    right.history[right.history.length-1].counterPick=pickName(counter);
    state.right=right;
    renderRight();
  }catch(e){window.alert(e.message);}
}
function bindEvents(){
  document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>showPanel(b.dataset.tab)));
  el("standingGrantor").addEventListener("change",()=>refreshStandingPicks(true));
  el("standingHolder").addEventListener("change",()=>refreshStandingPicks(false));
  el("standingSubject").addEventListener("change",refreshStandingScope);
  el("standingCompetition").addEventListener("change",refreshStandingScope);
  for(const id of ["standingTopN","standingBottomN"]){
    el(id).addEventListener("change",()=>{
      syncStandingMiddleVisibility();
      clearResult("standingResult");
    });
  }
  for(const id of ["standingTopPick","standingBottomPick","standingMiddlePick","standingPosition","standingCounter"]){
    el(id).addEventListener("change",()=>clearResult("standingResult"));
  }
  el("rankedGrantor").addEventListener("change",()=>refreshRankedPicks(true));
  el("rankedHolder").addEventListener("change",()=>refreshRankedPicks(false));
  el("rankedRound").addEventListener("change",()=>{state.selectedRanked=new Set();refreshRankedPicks(true);});
  el("rankedType").addEventListener("change",()=>clearResult("rankedResult"));
  el("rankedCounter").addEventListener("change",()=>clearResult("rankedResult"));
  el("simulateStanding").addEventListener("click",simulateStanding);
  el("simulateRanked").addEventListener("click",simulateRanked);
  el("trophyGrantor").addEventListener("change",()=>refreshTrophyPicks(true));
  el("trophyHolder").addEventListener("change",()=>refreshTrophyPicks(false));
  el("trophySubject").addEventListener("change",refreshTrophyMode);
  el("trophyMode").addEventListener("change",refreshTrophyMode);
  el("trophyTestResult").addEventListener("change",refreshTrophyMode);
  for(const id of ["trophySpecific","trophyMockWinner","trophyWonPick","trophyNotWonPick","trophyCounter"]){
    el(id).addEventListener("change",()=>clearResult("trophyResult"));
  }
  el("simulateTrophy").addEventListener("click",simulateTrophy);
  el("newRightHolder").addEventListener("change",()=>{
    fillSelect("newRightCounter",pickOptions(byOwner(el("newRightHolder").value),true),"");
  });
  el("simulateTransfer").addEventListener("click",transfer);
}
document.addEventListener("DOMContentLoaded",init);
