
import { supabase } from "./supabase.js";

/* Trade Room V2: anteprima volutamente READ ONLY. Nessuna write, nessuna RPC mutativa. */
const PREVIEW_OWNER_EMAIL = "tringali0511@gmail.com";
const state = {
  user:null,me:null,teams:[],players:[],extra:[],trades:[],assets:[],
  settings:{active_phase:"draft",market_open:true},
  allShown:16,tab:"market",subtab:"received",
  targetId:"",give:[],want:[],currentDraft:"Draft Conference"
};
const el = id => document.getElementById(id);
const str = v => String(v == null ? "" : v);
const same = (a,b) => str(a)===str(b);
const esc = v => str(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const teamById = id => state.teams.find(t=>same(t.id,id));
const teamName = id => teamById(id)?.name || "Squadra non trovata";
const logo = name => "img/" + encodeURIComponent(name) + ".webp";
const phase = () => state.settings.active_phase || "draft";
const allowedTeam = team => !!team && !same(team.id,state.me.id) && (phase()==="round_robin_market" || team.conference===state.me.conference);
const openMarket = () => {
  const s=state.settings;
  const now=Date.now();
  return s.market_open!==false && (!s.market_open_at || now>=Date.parse(s.market_open_at)) && (!s.market_close_at || now<=Date.parse(s.market_close_at));
};
const phaseLabel = () => ({draft:"Draft",conference_market:"Mercato Conferences",round_robin_market:"Round Robin"})[phase()] || "Mercato";
const pending = () => state.trades.filter(t=>t.status==="pending");
const received = () => pending().filter(t=>same(t.to_team,state.me.id));
const sent = () => state.trades.filter(t=>same(t.from_team,state.me.id)&&["pending","accepted_pending_cuts"].includes(t.status));
const official = () => state.trades.filter(t=>t.status==="accepted");
const role = p => str(p.role_mantra || p.role || "CAL").toUpperCase();
const roleGroup = p => {
  const r=role(p).split(/[^\p{L}]+/u);
  if(r.some(x=>["P","POR"].includes(x)))return "P";
  if(r.some(x=>["D","DD","DC","DS","B","E"].includes(x)))return "D";
  if(r.some(x=>["C","M","T","W"].includes(x)))return "C";
  if(r.some(x=>["A","PC"].includes(x)))return "A";
  return "?";
};
const isAvailable = p => same(p.ownerId,state.me.id) || allowedTeam(teamById(p.ownerId));
const chipLabel = a => a.name + (a.kind==="player"?"":"");
function setAuth(title, body) {
  el("v2Auth").hidden=false;
  el("v2App").hidden=true;
  el("v2AuthTitle").textContent=title;
  el("v2AuthMessage").textContent=body;
}
async function allRows(build, max=10000){
  let rows=[];
  for(let start=0;start<max;start+=800){
    const {data,error}=await build().range(start,start+799);
    if(error)throw error;
    rows.push(...(data||[]));
    if(!data || data.length<800)break;
  }
  return rows;
}
async function init(){
  try {
    const {data,error}=await supabase.auth.getUser();
    if(error || !data?.user){setAuth("Accesso richiesto","Accedi con il tuo account per visualizzare questa anteprima.");return;}
    if(str(data.user.email).trim().toLowerCase()!==PREVIEW_OWNER_EMAIL){
      setAuth("Anteprima riservata","Questa versione sperimentale della Trade Room non è disponibile per il tuo account.");return;
    }
    state.user=data.user;
    const [p,t,s]=await Promise.all([
      supabase.from("profiles").select("team_id").eq("email",data.user.email).maybeSingle(),
      supabase.from("teams").select("id,name,conference").order("name",{ascending:true}),
      supabase.from("trade_settings").select("*").eq("id",1).maybeSingle()
    ]);
    if(p.error || !p.data?.team_id)throw new Error("Profilo o squadra non disponibile.");
    if(t.error)throw t.error;
    state.teams=t.data||[];
    state.me=teamById(p.data.team_id);
    if(!state.me)throw new Error("La tua squadra non è stata trovata.");
    state.settings=s.data||state.settings;
    state.currentDraft=state.me.conference==="Conference League" ? "Draft Conference":"Draft Championship";
    await Promise.all([loadPlayers(),loadExtraAssets(),loadTrades()]);
    bind();
    drawHeader(); drawCards(); drawProposals(); drawHistory(); drawNewForm();
    el("v2Auth").hidden=true; el("v2App").hidden=false;
  }catch(err){
    console.error("Trade Room V2:",err);
    setAuth("Impossibile caricare l’anteprima",err?.message||"Errore imprevisto durante il caricamento.");
  }
}
async function loadPlayers(){
  const players=await allRows(()=>supabase.from("players")
    .select("id,name,role,role_mantra,serie_a_team,owner_team_id,status,pool")
    .eq("status","active")
    .order("name",{ascending:true}));
  const byId=new Map(players.map(p=>[str(p.id),p]));
  if(phase()==="draft"){
    const rows=await allRows(()=>supabase.from("draft_picks")
      .select("id,player_id,player_name,team_id,draft_name")
      .in("draft_name",["Draft Conference","Draft Championship"])
      .order("pick_number",{ascending:true}));
    state.players=rows.map(r=>{
      const info=byId.get(str(r.player_id))||{};
      return {key:"draft:"+str(r.id),name:r.player_name||info.name||"Giocatore",
        ownerId:r.team_id,club:info.serie_a_team||"",role:info.role||"",role_mantra:info.role_mantra||"",
        draftName:r.draft_name,kind:"player"};
    }).filter(p=>p.ownerId);
  }else{
    state.players=players.filter(p=>p.owner_team_id).map(p=>({
      key:"player:"+str(p.id),name:p.name,ownerId:p.owner_team_id,club:p.serie_a_team||"",
      role:p.role,role_mantra:p.role_mantra,pool:p.pool,kind:"player"
    }));
  }
  state.players.sort((a,b)=>str(a.name).localeCompare(str(b.name),"it",{sensitivity:"base"}));
}
async function loadExtraAssets(){
  const items=[];
  if(phase()==="draft"){
    const [all,used]=await Promise.all([
      supabase.from("draft_order").select("pick_number,team_id,draft_name").eq("draft_name",state.currentDraft),
      supabase.from("draft_picks").select("pick_number").eq("draft_name",state.currentDraft)
    ]);
    if(!all.error&&!used.error){
      const taken=new Set((used.data||[]).map(x=>str(x.pick_number)));
      (all.data||[]).filter(x=>!taken.has(str(x.pick_number))).forEach(x=>items.push({
        key:"draftpick:"+str(x.pick_number),name:"Pick n. "+x.pick_number,ownerId:x.team_id,kind:"pick"
      }));
    }
  }
  const future=await supabase.from("future_draft_picks")
    .select("id,season,round,owner_team_id,original_team_id,draft_name,pick_kind,status")
    .eq("season",state.settings.future_pick_season||2027).eq("pick_kind","normal").eq("status","active");
  if(!future.error)(future.data||[]).forEach(x=>items.push({
    key:"future:"+str(x.id),name:"Pick "+x.season+" · R"+x.round+" ("+teamName(x.original_team_id)+")",
    ownerId:x.owner_team_id,kind:"pick"
  }));
  if(phase()!=="draft"){
    const calls=await supabase.rpc("get_waiver_call_trade_assets",{p_view_team_id:state.me.id,p_weeks_ahead:14});
    if(!calls.error && Array.isArray(calls.data)){
      calls.data.filter(x=>x.tradable).forEach(x=>items.push({
        key:"call:"+str(x.key||[x.phase,x.week,x.original_team_id].join(":")),
        name:"Chiamata sett. "+str(x.week)+" · "+str(x.original_team_name||"Waiver"),
        ownerId:x.owner_team_id,kind:"call"
      }));
    }
  }
  state.extra=items;
}
async function loadTrades(){
  const [r,s,o]=await Promise.all([
    supabase.from("trade_proposals").select("*").eq("to_team",state.me.id).eq("status","pending").order("created_at",{ascending:false}).limit(80),
    supabase.from("trade_proposals").select("*").eq("from_team",state.me.id).in("status",["pending","accepted_pending_cuts"]).order("created_at",{ascending:false}).limit(80),
    supabase.from("trade_proposals").select("*").eq("status","accepted").order("accepted_at",{ascending:false}).limit(100)
  ]);
  state.trades=[...new Map([...(r.data||[]),...(s.data||[]),...(o.data||[])].map(x=>[str(x.id),x])).values()];
  const ids=state.trades.map(x=>x.id);
  if(ids.length){
    const asset=await supabase.from("trade_assets").select("proposal_id,side,asset_label").in("proposal_id",ids);
    if(!asset.error)state.assets=asset.data||[];
  }
}
function drawHeader(){
  el("v2TeamName").textContent=state.me.name;
  el("v2TeamConference").textContent=state.me.conference||"Conference";
  el("v2TeamLogo").src=logo(state.me.name);
  el("v2TeamLogo").onerror=()=>{el("v2TeamLogo").src="img/logo-lega-eroi.png";};
  el("v2MarketStatus").textContent=openMarket()?"● Mercato aperto":"● Mercato chiuso";
  el("v2MarketStatus").classList.toggle("closed",!openMarket());
  el("v2MarketPhase").textContent=phaseLabel();
  el("v2CountReceived").textContent=received().length ? received().length+" nuove" : "Nessuna nuova";
  el("v2OfficialCount").textContent=official().length+" ufficiali";
}
function bind(){
  el("v2Search").addEventListener("input",()=>{state.allShown=16;drawCards();});
  el("v2Role").addEventListener("change",()=>{state.allShown=16;drawCards();});
  el("v2More").addEventListener("click",()=>{state.allShown+=20;drawCards();});
  document.querySelectorAll("[data-v2-tab]").forEach(b=>b.addEventListener("click",()=>switchTab(b.dataset.v2Tab)));
  document.querySelectorAll("[data-v2-subtab]").forEach(b=>b.addEventListener("click",()=>{state.subtab=b.dataset.v2Subtab;drawProposals();}));
  document.querySelectorAll("[data-v2-new]").forEach(b=>b.addEventListener("click",()=>switchTab("new")));
  document.querySelectorAll("[data-v2-back]").forEach(b=>b.addEventListener("click",()=>switchTab("market")));
  el("v2TargetTeam").addEventListener("change",()=>{
    state.targetId=el("v2TargetTeam").value;
    state.want=[];drawNewForm();
  });
  el("v2GiveSearch").addEventListener("input",drawNewForm);
  el("v2WantSearch").addEventListener("input",drawNewForm);
  el("v2AddGive").addEventListener("click",()=>openPicker("give"));
  el("v2AddWant").addEventListener("click",()=>openPicker("want"));
  ["v2CloseGive","v2CloseWant","v2DoneGive","v2DoneWant"].forEach(id=>{
    el(id).addEventListener("click",closePicker);
  });
  el("v2DrawerBackdrop").addEventListener("click",closePicker);
  document.addEventListener("keydown",evt=>{
    if(evt.key==="Escape" && !el("v2DrawerBackdrop").hidden)closePicker();
  });
}
function switchTab(tab){
  closePicker();
  state.tab=tab;
  ["market","proposals","history","new"].forEach(t=>{
    el("v2"+t[0].toUpperCase()+t.slice(1)+"View").hidden=(tab!==t);
  });
  document.querySelectorAll("[data-v2-tab]").forEach(b=>{
    const yes=b.dataset.v2Tab===tab;
    b.classList.toggle("active",yes);
    b.setAttribute("aria-selected",yes?"true":"false");
  });
  el("v2Tabs").hidden=(tab==="new");
  el("v2PreviewCta").hidden=(tab==="new");
  if(tab==="new")drawNewForm();
  window.scrollTo({top:0,behavior:"smooth"});
}
function playerCards(){
  const search=el("v2Search").value.trim().toLocaleLowerCase("it");
  const group=el("v2Role").value;
  return state.players.filter(p=>(!group||roleGroup(p)===group)&&
    (!search||[p.name,p.club,teamName(p.ownerId)].join(" ").toLocaleLowerCase("it").includes(search)));
}
function drawCards(){
  const matches=playerCards(), view=matches.slice(0,state.allShown);
  el("v2ListCount").textContent=matches.length+" giocatori";
  el("v2Players").innerHTML=view.map(p=>{
    const mine=same(p.ownerId,state.me.id),can=isAvailable(p);
    return '<button type="button" class="v2-roster-row" data-pick="'+esc(p.key)+'"'+(can?"":" disabled")+
      ' aria-label="'+esc(p.name+" · "+teamName(p.ownerId))+'">'+
      '<span class="v2-role-avatar">'+esc(roleGroup(p))+'</span>'+
      '<span class="v2-roster-copy"><strong>'+esc(p.name)+'</strong><small>'+esc(p.club||"Serie A")+' · '+esc(teamName(p.ownerId))+'</small></span>'+
      '<span class="v2-row-add">'+(mine?"Offri +":can?"Chiedi +":"—")+'</span></button>';
  }).join("")||'<div class="v2-empty">Nessun giocatore trovato con questi filtri.</div>';
  el("v2More").hidden=matches.length<=state.allShown;
  el("v2Players").querySelectorAll("[data-pick]").forEach(b=>b.addEventListener("click",()=>chooseCard(b.dataset.pick)));
}
function chooseCard(key){
  const p=state.players.find(x=>x.key===key);
  if(!p||!isAvailable(p))return;
  if(same(p.ownerId,state.me.id)){addItem("give",p);switchTab("new");return;}
  if(state.targetId && !same(state.targetId,p.ownerId))state.want=[];
  state.targetId=str(p.ownerId);
  addItem("want",p);
  switchTab("new");
}
function addItem(side,item){
  const list=side==="give" ? state.give : state.want;
  if(!list.some(x=>x.key===item.key))list.push(item);
  drawNewForm();
}
function removeItem(side,key){
  const list=side==="give"?state.give:state.want;
  const index=list.findIndex(x=>x.key===key);
  if(index>=0)list.splice(index,1);
  drawNewForm();
}
function renderChips(side){
  const items=side==="give"?state.give:state.want;
  const dest=el(side==="give"?"v2GivenChips":"v2WantedChips");
  dest.innerHTML=items.length?items.map(a=>'<span class="v2-chip">'+esc(chipLabel(a))+' <button type="button" data-remove="'+esc(a.key)+'" aria-label="Rimuovi '+esc(a.name)+'">×</button></span>').join(""):'<small style="color:#7c8a9c">Nessun asset selezionato</small>';
  dest.querySelectorAll("[data-remove]").forEach(b=>b.addEventListener("click",()=>removeItem(side,b.dataset.remove)));
}
function renderChoices(side){
  const own=side==="give";
  const owner=own?state.me.id:state.targetId;
  const search=el(own?"v2GiveSearch":"v2WantSearch").value.trim().toLocaleLowerCase("it");
  const selected=own?state.give:state.want;
  const playerOpts=state.players.filter(p=>owner && same(p.ownerId,owner)&&
      (own || allowedTeam(teamById(p.ownerId))) && !selected.some(x=>x.key===p.key));
  const extraOpts=state.extra.filter(p=>owner && same(p.ownerId,owner) && !selected.some(x=>x.key===p.key));
  const filtered=[...playerOpts,...extraOpts].filter(x=>!search||x.name.toLocaleLowerCase("it").includes(search));
  const box=el(own?"v2GiveChoices":"v2WantChoices");
  box.innerHTML=!owner?'<div class="v2-empty">Scegli prima la squadra destinataria.</div>':
    filtered.length?filtered.slice(0,65).map(p=>'<button type="button" class="v2-small-option" data-asset="'+esc(p.key)+'"><span>'+
    esc(p.name)+'</span><small>'+esc(p.kind==="player"?(role(p)+" · "+(p.club||"")):(p.kind==="call"?"Chiamata":"Pick"))+'</small></button>').join(""):
    '<div class="v2-empty">Nessun asset disponibile con questa ricerca.</div>';
  box.querySelectorAll("[data-asset]").forEach(b=>b.addEventListener("click",()=>{
    const p=filtered.find(x=>x.key===b.dataset.asset);
    if(p)addItem(side,p);
  }));
}
function drawNewForm(){
  const select=el("v2TargetTeam");
  if(!select.options.length){
    select.innerHTML='<option value="">Seleziona una squadra</option>'+
    state.teams.filter(allowedTeam).map(t=>'<option value="'+esc(t.id)+'">'+esc(t.name)+'</option>').join("");
  }
  select.value=state.targetId;
  el("v2AddWant").disabled=!state.targetId;
  el("v2RivalInfo").textContent=state.targetId?teamName(state.targetId):"Prima scegli una squadra";
  renderChips("give");renderChips("want");
  renderChoices("give");renderChoices("want");
  el("v2DealSummary").textContent=state.give.length+" asset offerti · "+state.want.length+" asset richiesti";
  el("v2DraftReminder").textContent="Fase "+phaseLabel()+" · Nessuna proposta sarà inviata da questa anteprima.";
}
/* Il selettore mobile usa le scelte già caricate dalla Trade Room: nessuna logica trade duplicata. */
function openPicker(side){
  if(side==="want"&&!state.targetId){el("v2TargetTeam").focus();return;}
  closePicker();
  const block=el(side==="give"?"v2GiveBlock":"v2WantBlock");
  const query=el(side==="give"?"v2GiveSearch":"v2WantSearch");
  query.value="";
  drawNewForm();
  block.classList.add("is-open");
  el("v2DrawerBackdrop").hidden=false;
  document.body.classList.add("v2-picker-active");
  block.querySelector(".v2-picker-content").setAttribute("role","dialog");
  block.querySelector(".v2-picker-content").setAttribute("aria-modal","true");
  block.querySelector(".v2-picker-content").setAttribute("aria-label",side==="give"?"Asset da offrire":"Asset da chiedere");
  query.focus({preventScroll:true});
}
function closePicker(){
  const backdrop=el("v2DrawerBackdrop");
  if(!backdrop || backdrop.hidden)return;
  ["v2GiveBlock","v2WantBlock"].forEach(id=>{
    el(id).classList.remove("is-open");
    const sheet=el(id).querySelector(".v2-picker-content");
    sheet.removeAttribute("role");
    sheet.removeAttribute("aria-modal");
    sheet.removeAttribute("aria-label");
  });
  backdrop.hidden=true;
  document.body.classList.remove("v2-picker-active");
}
const statusName = x=>({
  pending:"In attesa",accepted:"Affare concluso",accepted_pending_cuts:"In attesa di svincoli",
  rejected:"Rifiutata",cancelled:"Annullata"
})[x]||str(x);
const niceDate=x=>{if(!x)return "";const d=new Date(x);return isNaN(d.getTime())?"":d.toLocaleDateString("it-IT",{day:"numeric",month:"short",year:"numeric"});};
function tradeHTML(t){
  const from=teamName(t.from_team),to=teamName(t.to_team);
  const parts=state.assets.filter(x=>same(x.proposal_id,t.id));
  const assets=side=>parts.filter(x=>x.side===side).map(x=>"<li>"+esc(x.asset_label)+"</li>").join("")||"<li>Nessun asset</li>";
  return '<article class="v2-trade-card"><div class="meta"><strong>'+esc(from)+' → '+esc(to)+'</strong><span>'+esc(niceDate(t.accepted_at||t.created_at))+'</span></div>'+
  '<div class="trade-duel"><div><b>'+esc(from)+' offre</b><ul>'+assets("from")+'</ul></div><div><b>'+esc(to)+' offre</b><ul>'+assets("to")+'</ul></div></div>'+
  '<span class="v2-status">'+esc(statusName(t.status))+'</span></article>';
}
function drawProposals(){
  const data=state.subtab==="received"?received():sent();
  document.querySelectorAll("[data-v2-subtab]").forEach(b=>b.classList.toggle("active",b.dataset.v2Subtab===state.subtab));
  el("v2ReceivedCount").textContent=received().length;
  el("v2SentCount").textContent=sent().length;
  el("v2ProposalItems").innerHTML=data.length?data.map(tradeHTML).join(""):
    '<div class="v2-empty">Nessuna proposta '+(state.subtab==="received"?"ricevuta":"inviata")+' da mostrare.</div>';
}
function drawHistory(){
  const data=official();
  el("v2HistoryCount").textContent=data.length+" movimenti ufficiali recenti";
  el("v2HistoryItems").innerHTML=data.length?data.map(tradeHTML).join(""):
    '<div class="v2-empty">Nessun movimento ufficiale da mostrare.</div>';
}
document.addEventListener("DOMContentLoaded",init);
