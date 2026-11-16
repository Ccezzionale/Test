
import { supabase } from "./supabase.js";

/* Trade Room V2: anteprima volutamente READ ONLY. Nessuna write, nessuna RPC mutativa. */
const PREVIEW_OWNER_EMAIL = "tringali0511@gmail.com";
const state = {
  user:null,me:null,isAdmin:false,teams:[],players:[],extra:[],trades:[],assets:[],
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
// Use only the actual Mantra role field: never silently substitute Classic P/D/C/A.
const MANTRA_CODES = new Set(["POR","DD","DC","DS","E","M","C","W","T","A","PC"]);
const MANTRA_DISPLAY = {POR:"Por",DD:"Dd",DC:"Dc",DS:"Ds",E:"E",M:"M",C:"C",W:"W",T:"T",A:"A",PC:"Pc"};
const mantraTokens = p => [...new Set(
  str(p.role_mantra).toUpperCase().split(/[;,/|\s+-]+/)
    .map(code => code === "P" ? "POR" : code)
    .filter(code => MANTRA_CODES.has(code))
)];
const role = p => mantraTokens(p).map(code=>MANTRA_DISPLAY[code]).join("/") || "N/D";
const mantraFamily = p => {
  const first = mantraTokens(p)[0];
  if(first==="POR") return "keeper";
  if(["DD","DC","DS","E"].includes(first)) return "defence";
  if(["M","C","W","T"].includes(first)) return "midfield";
  if(["A","PC"].includes(first)) return "attack";
  return "unknown";
};

// Asset order in the trade selectors: Mantra role, then Draft round as a NUMBER.
// Keep each category together: footballers → current Draft → future Draft → waiver calls.
const MANTRA_SORT_ORDER = ["POR","DC","DD","DS","E","M","C","W","T","A","PC"];
const assetCategory = asset => asset.kind === "player" ? 0
  : str(asset.key).startsWith("draftpick:") ? 1
  : str(asset.key).startsWith("future:") ? 2
  : asset.kind === "pick" ? 2
  : asset.kind === "call" ? 3 : 4;
const assetNumericPosition = asset => {
  const raw = Number(asset.sortNumber);
  return Number.isFinite(raw) && raw > 0 ? raw : Number.MAX_SAFE_INTEGER;
};
function compareTradeAssets(a,b){
  const category = assetCategory(a) - assetCategory(b);
  if (category) return category;
  if (a.kind === "player") {
    const aRole = MANTRA_SORT_ORDER.indexOf(mantraTokens(a)[0]);
    const bRole = MANTRA_SORT_ORDER.indexOf(mantraTokens(b)[0]);
    const order = (aRole < 0 ? 99 : aRole) - (bRole < 0 ? 99 : bRole);
    if (order) return order;
  } else {
    const numeric = assetNumericPosition(a) - assetNumericPosition(b);
    if (numeric) return numeric;
  }
  return str(a.name).localeCompare(str(b.name),"it",{sensitivity:"base",numeric:true});
}


// I badge seguono le stesse regole della Trade Room ufficiale.
// P6 e' valido soltanto mentre appartiene alla squadra protetta.
const tradeV2PlayerFlags=(player,ownerId)=>({
  is_u21:player.is_u21===true,
  is_u21_slot:player.is_u21_slot===true,
  is_u21_keeper:player.is_u21_keeper===true,
  u21_keeper_year:player.u21_keeper_year,
  is_fp:player.is_fp===true,
  is_fp_keeper:player.is_fp_keeper===true,
  fp_keeper_year:player.fp_keeper_year,
  is_rfa_matched:player.is_rfa_matched===true,
  is_top6_protected:player.is_top6_protected===true && same(ownerId,player.top6_protected_team_id)
});
function tradeV2BadgeInfo(player){
  if(!player || player.kind!=="player")return [];
  const badges=[];
  if(player.is_fp_keeper===true){
    const second=Number(player.fp_keeper_year)===2;
    badges.push({code:"FP",src:second?"img/badges/fp-confermato.webp":"img/badges/fp.webp",title:second?"Franchise Player confermato 2° anno":"Franchise Player confermato 1° anno"});
  } else if(player.is_fp===true){
    badges.push({code:"FP",src:"img/badges/fp.webp",title:"Franchise Player"});
  }
  if(player.is_u21_keeper===true){
    const second=Number(player.u21_keeper_year)===2;
    badges.push({code:"U21",src:second?"img/badges/u21-confermato-secondo-anno.webp":"img/badges/u21-confermato.webp",title:second?"U21 confermato 2° anno":"U21 confermato 1° anno"});
  } else if(player.is_u21_slot===true){
    badges.push({code:"U21",src:"img/badges/u21.webp",title:"Under 21"});
  }
  if(player.is_rfa_matched===true){
    badges.push({code:"RFA",src:"img/badges/rfa.webp",title:"RFA pareggiato"});
  }
  if(player.is_top6_protected===true){
    badges.push({code:"P6",src:"img/badges/protetto-p6-lucchetto.webp",title:"Giocatore protetto mercato (P6)"});
  }
  return badges;
}
function tradeV2BadgesHtml(player){
  const badges=tradeV2BadgeInfo(player);
  if(!badges.length)return "";
  const description=badges.map(b=>b.title).join(", ");
  return '<span class="v2-badge-strip" role="img" aria-label="'+esc(description)+'">'+
    badges.map(b=>'<img class="v2-player-status-badge" src="'+b.src+'" alt="" title="'+esc(b.title)+'" loading="lazy">').join("")+
  '</span>';
}

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
      supabase.from("profiles").select("team_id,role").eq("email",data.user.email).maybeSingle(),
      supabase.from("teams").select("id,name,conference").order("name",{ascending:true}),
      supabase.from("trade_settings").select("*").eq("id",1).maybeSingle()
    ]);
    if(p.error || !p.data?.team_id)throw new Error("Profilo o squadra non disponibile.");
    if(t.error)throw t.error;
    state.teams=t.data||[];
    state.isAdmin=p.data.role==="admin";
    state.me=teamById(p.data.team_id);
    if(!state.me)throw new Error("La tua squadra non è stata trovata.");
    state.settings=s.data||state.settings;
    state.currentDraft=state.me.conference==="Conference League" ? "Draft Conference":"Draft Championship";
    await Promise.all([loadPlayers(),loadExtraAssets(),loadTrades()]);
    bind();
    drawHeader(); renderV2Admin(); drawCards(); drawProposals(); drawHistory(); drawNewForm();
    el("v2Auth").hidden=true; el("v2App").hidden=false;
  }catch(err){
    console.error("Trade Room V2:",err);
    setAuth("Impossibile caricare l’anteprima",err?.message||"Errore imprevisto durante il caricamento.");
  }
}
async function loadPlayers(){
  const players=await allRows(()=>supabase.from("players")
    .select("id,name,role,role_mantra,serie_a_team,owner_team_id,status,pool,is_u21,is_u21_slot,is_u21_keeper,u21_keeper_year,is_fp,is_fp_keeper,fp_keeper_year,is_rfa_matched,is_top6_protected,top6_protected_team_id")
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
        draftName:r.draft_name,kind:"player",...tradeV2PlayerFlags(info,r.team_id)};
    }).filter(p=>p.ownerId);
  }else{
    state.players=players.filter(p=>p.owner_team_id).map(p=>({
      key:"player:"+str(p.id),name:p.name,ownerId:p.owner_team_id,club:p.serie_a_team||"",
      role:p.role,role_mantra:p.role_mantra,pool:p.pool,kind:"player",...tradeV2PlayerFlags(p,p.owner_team_id)
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
        key:"draftpick:"+str(x.pick_number),name:"Pick n. "+x.pick_number,ownerId:x.team_id,kind:"pick",sortNumber:Number(x.pick_number)
      }));
    }
  }
  const future=await supabase.from("future_draft_picks")
    .select("id,season,round,owner_team_id,original_team_id,draft_name,pick_kind,status")
    .eq("season",state.settings.future_pick_season||2027).eq("pick_kind","normal").eq("status","active");
  if(!future.error)(future.data||[]).forEach(x=>items.push({
    key:"future:"+str(x.id),name:"Pick "+x.season+" · R"+x.round+" ("+teamName(x.original_team_id)+")",
    ownerId:x.owner_team_id,kind:"pick",sortNumber:Number(x.round)
  }));
  if(phase()!=="draft"){
    const calls=await supabase.rpc("get_waiver_call_trade_assets",{p_view_team_id:state.me.id,p_weeks_ahead:14});
    if(!calls.error && Array.isArray(calls.data)){
      calls.data.filter(x=>x.tradable).forEach(x=>items.push({
        key:"call:"+str(x.key||[x.phase,x.week,x.original_team_id].join(":")),
        name:"Chiamata sett. "+str(x.week)+" · "+str(x.original_team_name||"Waiver"),
        ownerId:x.owner_team_id,kind:"call",sortNumber:Number(x.week)
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
// Admin Mercato: stessi campi e stessa tabella ufficiale, protetti dalla policy RLS is_admin().
// Solo questo pannello effettua scritture: tutte le offerte della preview rimangono disattivate.
function v2ToDatetimeLocal(value){
  if(!value)return "";
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return "";
  const adjusted=new Date(date.getTime()-date.getTimezoneOffset()*60000);
  return adjusted.toISOString().slice(0,16);
}
function v2FromDatetimeLocal(value){
  const txt=str(value).trim();
  if(!txt)return null;
  const date=new Date(txt);
  if(!Number.isFinite(date.getTime()))throw new Error("Inserisci una data e ora valide.");
  return date.toISOString();
}
function v2AdminMessage(message,type=""){
  const field=el("v2AdminNotice");
  field.textContent=message;
  field.dataset.status=type;
}
function renderV2Admin(){
  const panel=el("v2AdminPanel");
  panel.hidden=!state.isAdmin;
  if(!state.isAdmin)return;
  const s=state.settings;
  el("v2AdminMarketOpen").checked=s.market_open!==false;
  el("v2AdminTradePhase").value=s.active_phase||"draft";
  el("v2AdminFutureSeason").value=s.future_pick_season||2027;
  el("v2AdminMarketOpenAt").value=v2ToDatetimeLocal(s.market_open_at);
  el("v2AdminMarketCloseAt").value=v2ToDatetimeLocal(s.market_close_at);
  el("v2AdminCurrentStatus").textContent=openMarket()
    ?"Stato corrente: aperto"
    :"Stato corrente: chiuso";
}
async function saveV2AdminSettings(){
  if(!state.isAdmin)return;
  const button=el("v2AdminSave");
  if(button.disabled)return;
  const phaseNew=el("v2AdminTradePhase").value||"draft";
  const seasonNew=Number(el("v2AdminFutureSeason").value);
  const marketNew=el("v2AdminMarketOpen").checked;
  let opensAt,closesAt;
  try{
    if(!["draft","conference_market","round_robin_market"].includes(phaseNew)){
      throw new Error("Fase mercato non valida.");
    }
    if(!Number.isInteger(seasonNew)||seasonNew<2026){
      throw new Error("Stagione pick future non valida.");
    }
    opensAt=v2FromDatetimeLocal(el("v2AdminMarketOpenAt").value);
    closesAt=v2FromDatetimeLocal(el("v2AdminMarketCloseAt").value);
    if(opensAt&&closesAt&&Date.parse(closesAt)<=Date.parse(opensAt)){
      throw new Error("La chiusura del mercato deve essere successiva all'apertura.");
    }
  }catch(error){
    v2AdminMessage(error.message,"error");
    return;
  }
  const current=state.settings;
  const next={
    active_phase:phaseNew,
    market_open:marketNew,
    future_pick_season:seasonNew,
    market_open_at:opensAt,
    market_close_at:closesAt
  };
  const changed=
    str(current.active_phase||"draft")!==phaseNew||
    (current.market_open!==false)!==marketNew||
    Number(current.future_pick_season||2027)!==seasonNew||
    str(current.market_open_at||"")!==str(opensAt||"")||
    str(current.market_close_at||"")!==str(closesAt||"");
  if(!changed){
    v2AdminMessage("Nessuna modifica da salvare.","info");
    return;
  }
  const opening=marketNew?"APRIRE":"CHIUDERE";
  const phaseChanged=phaseNew!==(current.active_phase||"draft");
  const datesChanged=str(current.market_open_at||"")!==str(opensAt||"")||
    str(current.market_close_at||"")!==str(closesAt||"");
  let prompt="Stai per salvare le impostazioni del mercato UFFICIALE della Lega degli Eroi."+
    "\n\nInterruttore: "+(marketNew?"APERTO":"CHIUSO")+
    (phaseChanged?"\nFase: "+phaseLabel()+" → "+({draft:"Draft",conference_market:"Mercato Conferences",round_robin_market:"Round Robin"})[phaseNew]:"")+
    (datesChanged?"\nCambiano anche le finestre temporali.":"")+
    "\n\nLe modifiche saranno reali e visibili a tutti. Confermi?";
  if(!window.confirm(prompt))return;
  button.disabled=true;
  button.textContent="Salvataggio in corso...";
  v2AdminMessage("Salvataggio delle impostazioni ufficiali...", "info");
  try{
    const {data,error}=await supabase.from("trade_settings").update({
      ...next,
      updated_at:new Date().toISOString()
    }).eq("id",1).select("*").maybeSingle();
    if(error)throw error;
    if(!data)throw new Error("Aggiornamento non autorizzato o non confermato dal database.");
    state.settings=data;
    if(phaseChanged){
      state.give=[];state.want=[];state.targetId="";
      state.players=[];state.extra=[];
      await Promise.all([loadPlayers(),loadExtraAssets()]);
    }
    renderV2Admin();
    drawHeader();
    drawCards();
    drawNewForm();
    v2AdminMessage(openMarket()
      ?"Mercato ufficiale APERTO. Impostazioni salvate."
      :"Mercato ufficiale CHIUSO. Impostazioni salvate."+(marketNew?" Verifica le finestre temporali se volevi aprirlo subito.":""),"success");
  }catch(error){
    console.error("Trade V2 admin save:",error);
    v2AdminMessage("Impossibile salvare il mercato: "+(error.message||"errore sconosciuto"),"error");
  }finally{
    button.disabled=false;
    button.textContent="Salva impostazioni mercato";
  }
}

function bind(){
  el("v2AdminSave").addEventListener("click",saveV2AdminSettings);
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
  return state.players.filter(p=>(!group||mantraTokens(p).includes(group))&&
    (!search||[p.name,p.club,teamName(p.ownerId)].join(" ").toLocaleLowerCase("it").includes(search)));
}
function drawCards(){
  const matches=playerCards(), view=matches.slice(0,state.allShown);
  el("v2ListCount").textContent=matches.length+" giocatori";
  el("v2Players").innerHTML=view.map(p=>{
    const mine=same(p.ownerId,state.me.id),can=isAvailable(p);
    return '<button type="button" class="v2-roster-row'+(mine?' is-own':'')+(can?'':' is-locked')+'" data-pick="'+esc(p.key)+'"'+(can?"":" disabled")+
      ' aria-label="'+esc(p.name+" · "+teamName(p.ownerId)+(tradeV2BadgeInfo(p).length?" · "+tradeV2BadgeInfo(p).map(b=>b.title).join(", "):""))+'">'+
      '<span class="v2-role-avatar v2-role--'+mantraFamily(p)+'">'+esc(role(p))+'</span>'+
      '<span class="v2-roster-copy"><span class="v2-player-name-line"><strong>'+esc(p.name)+'</strong>'+tradeV2BadgesHtml(p)+'</span><small>'+esc(p.club||"Serie A")+' · '+esc(teamName(p.ownerId))+'</small></span>'+
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
  const items=[...(side==="give"?state.give:state.want)].sort(compareTradeAssets);
  const dest=el(side==="give"?"v2GivenChips":"v2WantedChips");
  dest.innerHTML=items.length?items.map(a=>'<span class="v2-chip"><span class="v2-chip-identity"><span class="v2-chip-name">'+esc(chipLabel(a))+'</span>'+tradeV2BadgesHtml(a)+'</span> <button type="button" data-remove="'+esc(a.key)+'" aria-label="Rimuovi '+esc(a.name)+'">×</button></span>').join(""):'<small style="color:#7c8a9c">Nessun asset selezionato</small>';
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
  const filtered=[...playerOpts,...extraOpts]
    .filter(x=>!search||x.name.toLocaleLowerCase("it").includes(search))
    .sort(compareTradeAssets);
  const box=el(own?"v2GiveChoices":"v2WantChoices");
  box.innerHTML=!owner?'<div class="v2-empty">Scegli prima la squadra destinataria.</div>':
    filtered.length?filtered.slice(0,65).map(p=>{
      const player=p.kind==="player";
      const family=player?mantraFamily(p):"special";
      const badge=player?role(p):(p.kind==="call"?"W":"Pick");
      const meta=player?(p.club||"Serie A"):(p.kind==="call"?"Chiamata settimanale":"Pick draft");
      return '<button type="button" class="v2-small-option" data-asset="'+esc(p.key)+'">'+
        '<span class="v2-choice-badge v2-role--'+family+'">'+esc(badge)+'</span>'+
        '<span class="v2-choice-copy"><span class="v2-player-name-line"><strong>'+esc(p.name)+'</strong>'+tradeV2BadgesHtml(p)+'</span><small>'+esc(meta)+'</small></span>'+
        '<span class="v2-choice-plus" aria-hidden="true">＋</span></button>';
    }).join(""):
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

// Le proposte salvate contengono i tag [FP], [U21], [RFA], [P6].
// Visualizzali come fa la Trade Room ufficiale, lasciando escaped il testo.
function tradeV2StoredAssetHtml(label){
  let html=esc(label);
  const tokens={
    "[FP2]":["img/badges/fp-confermato.webp","Franchise Player confermato 2° anno"],
    "[FP]":["img/badges/fp.webp","Franchise Player"],
    "[U21K2]":["img/badges/u21-confermato-secondo-anno.webp","U21 confermato 2° anno"],
    "[U21K]":["img/badges/u21-confermato.webp","U21 confermato 1° anno"],
    "[U21]":["img/badges/u21.webp","Under 21"],
    "[RFA]":["img/badges/rfa.webp","RFA pareggiato"],
    "[P6]":["img/badges/protetto-p6-lucchetto.webp","Giocatore protetto mercato P6"]
  };
  for(const [token,[src,title]] of Object.entries(tokens)){
    const image='<img class="v2-player-status-badge" src="'+src+'" alt="'+esc(title)+'" title="'+esc(title)+'" loading="lazy">';
    html=html.replaceAll(token,image);
  }
  return html;
}

const statusName = x=>({
  pending:"In attesa",accepted:"Affare concluso",accepted_pending_cuts:"In attesa di svincoli",
  rejected:"Rifiutata",cancelled:"Annullata"
})[x]||str(x);
const niceDate=x=>{if(!x)return "";const d=new Date(x);return isNaN(d.getTime())?"":d.toLocaleDateString("it-IT",{day:"numeric",month:"short",year:"numeric"});};
function tradeHTML(t){
  const from=teamName(t.from_team),to=teamName(t.to_team);
  const parts=state.assets.filter(x=>same(x.proposal_id,t.id));
  const assets=side=>parts.filter(x=>x.side===side).map(x=>"<li>"+tradeV2StoredAssetHtml(x.asset_label)+"</li>").join("")||"<li>Nessun asset</li>";
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
