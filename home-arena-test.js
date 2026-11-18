/* Matchday Central V2 · isolated read-only prototype */
import { supabase } from "./supabase.js";
import { loadResultsRows } from "./results-source.js";
const squadreBase = [
  { nome: "Atlético Leon", logo: "img/Atlético Leon.webp", shirt: "img/maglie/leon-mascotte.webp", mascotWin: "img/maglie/leon-mascotte-win.webp", mascotDraw: "img/maglie/leon-mascotte-draw.webp", mascotLoss: "img/maglie/leon-mascotte-loss.webp", coach: "Coach Leo e Anthony" },
  { nome: "Bayern Christiansen", logo: "img/Bayern Christiansen.webp", shirt: "img/maglie/bayern-mascotte.webp", mascotWin: "img/maglie/bayern-mascotte-win.webp", mascotDraw: "img/maglie/bayern-mascotte-draw.webp", mascotLoss: "img/maglie/bayern-mascotte-loss.webp", coach: "Coach Christian" },
  { nome: "Team Bartowski", logo: "img/Team Bartowski.webp", shirt: "img/maglie/bartowski-mascotte.webp", mascotWin: "img/maglie/bartowski-mascotte-win.webp", mascotDraw: "img/maglie/bartowski-mascotte-draw.webp", mascotLoss: "img/maglie/bartowski-mascotte-loss.webp", coach: "Coach Marco" },
  { nome: "Golden Knights", logo: "img/Golden Knights.webp", shirt: "img/maglie/golden-mascotte.webp", mascotWin: "img/maglie/golden-mascotte-win.webp", mascotDraw: "img/maglie/golden-mascotte-draw.webp", mascotLoss: "img/maglie/golden-mascotte-loss.webp", coach: "Coach Mimmo&Francesco" },
  { nome: "Ibla", logo: "img/Ibla.webp", shirt: "img/maglie/ibla-mascotte.webp", mascotWin: "img/maglie/ibla-mascotte-win.webp", mascotDraw: "img/maglie/ibla-mascotte-draw.webp", mascotLoss: "img/maglie/ibla-mascotte-loss.webp", coach: "Coach Francesco" },
  { nome: "Fantaugusta", logo: "img/Fantaugusta.webp", shirt: "img/maglie/fantaugusta-mascotte.webp", mascotWin: "img/maglie/fantaugusta-mascotte-win.webp", mascotDraw: "img/maglie/fantaugusta-mascotte-draw.webp", mascotLoss: "img/maglie/fantaugusta-mascotte-loss.webp", coach: "Coach Giancarlo" },
  { nome: "Riverfilo", logo: "img/Riverfilo.webp", shirt: "img/maglie/riverfilo-mascotte.webp", mascotWin: "img/maglie/riverfilo-mascotte-win.webp", mascotDraw: "img/maglie/riverfilo-mascotte-draw.webp", mascotLoss: "img/maglie/riverfilo-mascotte-loss.webp", coach: "Coach Federico" },
  { nome: "Desperados", logo: "img/Desperados.webp", shirt: "img/maglie/desperados-mascotte.webp", mascotWin: "img/maglie/desperados-mascotte-win.webp", mascotDraw: "img/maglie/desperados-mascotte-draw.webp", mascotLoss: "img/maglie/desperados-mascotte-loss.webp", coach: "Coach Stefano" },
  { nome: "Wildboys 78", logo: "img/wildboys78.webp", shirt: "img/maglie/wildboys-mascotte.webp", mascotWin: "img/maglie/wildboys-mascotte-win.webp", mascotDraw: "img/maglie/wildboys-mascotte-draw.webp", mascotLoss: "img/maglie/wildboys-mascotte-loss.webp", coach: "Coach Francesco" },
  { nome: "Pandinicoccolosini", logo: "img/Pandinicoccolosini.webp", shirt: "img/maglie/pandini-mascotte.webp", mascotWin: "img/maglie/pandini-mascotte-win.webp", mascotDraw: "img/maglie/pandini-mascotte-draw.webp", mascotLoss: "img/maglie/pandini-mascotte-loss.webp", coach: "Coach Davide" },
  { nome: "Pokermantra", logo: "img/PokerMantra.webp", shirt: "img/maglie/pokermantra-mascotte.webp", mascotWin: "img/maglie/pokermantra-mascotte-win.webp", mascotDraw: "img/maglie/pokermantra-mascotte-draw.webp", mascotLoss: "img/maglie/pokermantra-mascotte-loss.webp", coach: "Coach Omar" },
  { nome: "Minnesode Timberland", logo: "img/Minnesode Timberland.webp", shirt: "img/maglie/minnesode-mascotte.webp", mascotWin: "img/maglie/minnesode-mascotte-win.webp", mascotDraw: "img/maglie/minnesode-mascotte-draw.webp", mascotLoss: "img/maglie/minnesode-mascotte-loss.webp", coach: "Coach Pierpaolo&Leandro" },
  { nome: "Minnesota Snakes", logo: "img/MinneSota Snakes.webp", shirt: "img/maglie/snakes-mascotte.webp", mascotWin: "img/maglie/snakes-mascotte-win.webp", mascotDraw: "img/maglie/snakes-mascotte-draw.webp", mascotLoss: "img/maglie/snakes-mascotte-loss.webp", coach: "Coach Alberto" },
  { nome: "Eintracht Franco 126", logo: "img/Eintracht Franco 126.webp", shirt: "img/maglie/franco-mascotte.webp", mascotWin: "img/maglie/franco-mascotte-win.webp", mascotDraw: "img/maglie/franco-mascotte-draw.webp", mascotLoss: "img/maglie/franco-mascotte-loss.webp", coach: "Coach Lorenzo" },
  { nome: "FC Disoneste", logo: "img/FC Disoneste.webp", shirt: "img/maglie/disoneste-mascotte.webp", mascotWin: "img/maglie/disoneste-mascotte-win.webp", mascotDraw: "img/maglie/disoneste-mascotte-draw.webp", mascotLoss: "img/maglie/disoneste-mascotte-loss.webp", coach: "Coach Basilio" },
  { nome: "Athletic Pongao", logo: "img/Athletic Pongao.webp", shirt: "img/maglie/pongao-mascotte.webp", mascotWin: "img/maglie/pongao-mascotte-win.webp", mascotDraw: "img/maglie/pongao-mascotte-draw.webp", mascotLoss: "img/maglie/pongao-mascotte-loss.webp", coach: "Coach Dario&Giorgio" }
];
const FALLBACK_FIXTURES = {
  "Conf A": {
    label: "Conference League",
    rounds: {
      1: [["Pandinicoccolosini", "Ibla"], ["Bayern Christiansen", "Team Bartowski"], ["Desperados", "Minnesota Snakes"], ["Minnesode Timberland", "Athletic Pongao"]],
      2: [["Ibla", "Minnesode Timberland"], ["Athletic Pongao", "Desperados"], ["Minnesota Snakes", "Bayern Christiansen"], ["Team Bartowski", "Pandinicoccolosini"]],
      3: [["Bayern Christiansen", "Athletic Pongao"], ["Desperados", "Ibla"], ["Minnesode Timberland", "Pandinicoccolosini"], ["Minnesota Snakes", "Team Bartowski"]],
      4: [["Pandinicoccolosini", "Desperados"], ["Ibla", "Bayern Christiansen"], ["Athletic Pongao", "Minnesota Snakes"], ["Team Bartowski", "Minnesode Timberland"]],
      5: [["Bayern Christiansen", "Pandinicoccolosini"], ["Desperados", "Minnesode Timberland"], ["Athletic Pongao", "Team Bartowski"], ["Minnesota Snakes", "Ibla"]],
      6: [["Pandinicoccolosini", "Minnesota Snakes"], ["Ibla", "Athletic Pongao"], ["Desperados", "Team Bartowski"], ["Minnesode Timberland", "Bayern Christiansen"]],
      7: [["Bayern Christiansen", "Desperados"], ["Athletic Pongao", "Pandinicoccolosini"], ["Minnesota Snakes", "Minnesode Timberland"], ["Team Bartowski", "Ibla"]],
      8: [["Desperados", "Pandinicoccolosini"], ["Athletic Pongao", "Bayern Christiansen"], ["Minnesode Timberland", "Ibla"], ["Team Bartowski", "Minnesota Snakes"]],
      9: [["Pandinicoccolosini", "Athletic Pongao"], ["Ibla", "Team Bartowski"], ["Bayern Christiansen", "Minnesode Timberland"], ["Minnesota Snakes", "Desperados"]],
      10: [["Desperados", "Bayern Christiansen"], ["Minnesode Timberland", "Minnesota Snakes"], ["Team Bartowski", "Athletic Pongao"], ["Ibla", "Pandinicoccolosini"]],
      11: [["Minnesode Timberland", "Desperados"], ["Bayern Christiansen", "Minnesota Snakes"], ["Athletic Pongao", "Ibla"], ["Pandinicoccolosini", "Team Bartowski"]],
      12: [["Ibla", "Desperados"], ["Pandinicoccolosini", "Minnesode Timberland"], ["Minnesota Snakes", "Athletic Pongao"], ["Team Bartowski", "Bayern Christiansen"]],
      13: [["Bayern Christiansen", "Ibla"], ["Desperados", "Athletic Pongao"], ["Minnesode Timberland", "Team Bartowski"], ["Minnesota Snakes", "Pandinicoccolosini"]],
      14: [["Pandinicoccolosini", "Bayern Christiansen"], ["Ibla", "Minnesota Snakes"], ["Athletic Pongao", "Minnesode Timberland"], ["Team Bartowski", "Desperados"]]
    }
  },
  "Conf B": {
    label: "Conference Championship",
    rounds: {
      1: [["FC Disoneste", "Fantaugusta"], ["Wildboys 78", "Pokermantra"], ["Riverfilo", "Golden Knights"], ["Atlético Leon", "Eintracht Franco 126"]],
      2: [["Fantaugusta", "Atlético Leon"], ["Eintracht Franco 126", "Riverfilo"], ["Golden Knights", "Wildboys 78"], ["Pokermantra", "FC Disoneste"]],
      3: [["Wildboys 78", "Eintracht Franco 126"], ["Riverfilo", "Fantaugusta"], ["Atlético Leon", "FC Disoneste"], ["Golden Knights", "Pokermantra"]],
      4: [["FC Disoneste", "Riverfilo"], ["Fantaugusta", "Wildboys 78"], ["Eintracht Franco 126", "Golden Knights"], ["Pokermantra", "Atlético Leon"]],
      5: [["Wildboys 78", "FC Disoneste"], ["Riverfilo", "Atlético Leon"], ["Eintracht Franco 126", "Pokermantra"], ["Golden Knights", "Fantaugusta"]],
      6: [["FC Disoneste", "Golden Knights"], ["Fantaugusta", "Eintracht Franco 126"], ["Riverfilo", "Pokermantra"], ["Atlético Leon", "Wildboys 78"]],
      7: [["Wildboys 78", "Riverfilo"], ["Eintracht Franco 126", "FC Disoneste"], ["Golden Knights", "Atlético Leon"], ["Pokermantra", "Fantaugusta"]],
      8: [["Riverfilo", "FC Disoneste"], ["Eintracht Franco 126", "Wildboys 78"], ["Atlético Leon", "Fantaugusta"], ["Pokermantra", "Golden Knights"]],
      9: [["FC Disoneste", "Eintracht Franco 126"], ["Fantaugusta", "Pokermantra"], ["Wildboys 78", "Atlético Leon"], ["Golden Knights", "Riverfilo"]],
      10: [["Riverfilo", "Wildboys 78"], ["Atlético Leon", "Golden Knights"], ["Pokermantra", "Eintracht Franco 126"], ["Fantaugusta", "FC Disoneste"]],
      11: [["Atlético Leon", "Riverfilo"], ["Wildboys 78", "Golden Knights"], ["Eintracht Franco 126", "Fantaugusta"], ["FC Disoneste", "Pokermantra"]],
      12: [["Fantaugusta", "Riverfilo"], ["FC Disoneste", "Atlético Leon"], ["Golden Knights", "Eintracht Franco 126"], ["Pokermantra", "Wildboys 78"]],
      13: [["Wildboys 78", "Fantaugusta"], ["Riverfilo", "Eintracht Franco 126"], ["Atlético Leon", "Pokermantra"], ["Golden Knights", "FC Disoneste"]],
      14: [["FC Disoneste", "Wildboys 78"], ["Fantaugusta", "Golden Knights"], ["Eintracht Franco 126", "Atlético Leon"], ["Pokermantra", "Riverfilo"]]
    }
  }
};
const $ = id => document.getElementById(id);
const norm = v => String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const num = v => { const n=Number(String(v??"").replace(",",".")); return Number.isFinite(n)?n:0; };
const esc = v => String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const info = name => squadreBase.find(x=>norm(x.nome)===norm(name));
const canon = name => info(name)?.nome||String(name||"");
const logo = name => info(name)?.logo||"icon-192.png";
const goals = pts => num(pts)<66?0:1+Math.floor((num(pts)-66)/6);
const done = row => ["V","N","P"].includes(String(row?.Result||"").toUpperCase())||num(row?.PointsFor)!==0||num(row?.PointsAgainst)!==0;
const result = row => ["V","N","P"].includes(String(row?.Result||"").toUpperCase())?String(row.Result).toUpperCase():goals(row.PointsFor)>goals(row.PointsAgainst)?"V":goals(row.PointsFor)<goals(row.PointsAgainst)?"P":"N";
const confOf = s => String(s||"").toLowerCase().includes("championship")?"Conf B":"Conf A";
const confName = code => code==="Conf B"?"Conference Championship":code==="Unificata"?"Round Robin":"Conference League";
const set = (id,v) => { if($(id)) $(id).textContent=v; };
const img = (id,src,alt="") => {if($(id)){$(id).src=src;$(id).alt=alt;}};
const href = (f,code) => "match.html?"+new URLSearchParams({home:f.home,away:f.away,gw:String(f.gw),competition:code});
const state = {team:null,rows:[],phase:"",standings:{},slides:[],index:0,view:"league",cupStatus:{}};
function completed(code){
 const used=new Set();
 return state.rows.filter(r=>r.Conference===code&&done(r)).filter(r=>{
  const key=code+"|"+r.GW+"|"+norm(r.Team);
  if(used.has(key))return false;used.add(key);return true;
 });
}
function table(code){
 const all=new Map();
 completed(code).forEach(r=>{
  const name=canon(r.Team),key=norm(name);if(!key)return;
  if(!all.has(key))all.set(key,{name,pt:0,mp:0,gf:0,gs:0});
  const t=all.get(key);t.mp+=num(r.PointsFor);t.gf+=goals(r.PointsFor);t.gs+=goals(r.PointsAgainst);
  const value=result(r);t.pt+=value==="V"?3:value==="N"?1:0;
 });
 return [...all.values()].sort((a,b)=>b.pt-a.pt||b.mp-a.mp||b.gf-a.gf||a.gs-b.gs||a.name.localeCompare(b.name));
}
function codeNow(){
 const phase=String(state.phase||"").toLowerCase();
 return ["round_robin","round robin"].includes(phase)||state.rows.some(r=>r.Conference==="Unificata"&&done(r))?"Unificata":state.team?.conf||"Conf A";
}
function standing(name,code){return (state.standings[code]||[]).findIndex(t=>norm(t.name)===norm(name))+1;}
function round(code){
 const completedGws=completed(code).map(r=>Number(r.GW)||0);
 const last=completedGws.length?Math.max(...completedGws):0;
 const upcoming=[...new Set(state.rows.filter(r=>r.Conference===code&&!done(r)&&Number(r.GW)>last).map(r=>Number(r.GW)))].sort((a,b)=>a-b);
 return upcoming[0]||Object.keys(FALLBACK_FIXTURES[code]?.rounds||{}).map(Number).filter(g=>g>last).sort((a,b)=>a-b)[0]||null;
}
function fixtures(code,gw){
 if(!gw)return[];
 const seen=new Set(),items=[];
 state.rows.filter(r=>r.Conference===code&&Number(r.GW)===Number(gw)).forEach(r=>{
  const home=canon(r.Team),away=canon(r.Opponent),key=[norm(home),norm(away)].sort().join("|");
  if(!home||!away||seen.has(key))return;seen.add(key);items.push({home,away,gw});
 });
 return items.length?items:(FALLBACK_FIXTURES[code]?.rounds?.[gw]||[]).map(([home,away])=>({home,away,gw}));
}
function fixture(code,gw,name){return fixtures(code,gw).find(f=>norm(f.home)===norm(name)||norm(f.away)===norm(name));}
function identity(){
 if(!state.team){set("my-coach","Ospite");set("my-team","La tua franchigia");set("my-details","Accedi dalla Home ufficiale per vedere la tua squadra");return;}
 const t=state.team,c=codeNow(),rank=standing(t.name,c);
 const me=(state.standings[c]||[]).find(r=>norm(r.name)===norm(t.name));
 img("my-mascot",info(t.name)?.shirt||"img/maglie/default-shirt.png","Mascotte "+t.name);
 img("my-logo",logo(t.name),"Logo "+t.name);
 set("my-coach",info(t.name)?.coach||"Coach");
 set("my-team",t.name);
 set("my-details",confName(c)+" · "+(rank?rank+"° posto · "+(me?.pt||0)+" pt":"Classifica in attesa"));
}
function buildSlides(){
 state.slides=[];if(!state.team)return;
 const code=codeNow(),name=state.team.name,gw=round(code);
 const past=completed(code).filter(r=>norm(r.Team)===norm(name))
  .sort((a,b)=>(Number(a.GW_Stagionale)||Number(a.GW)||0)-(Number(b.GW_Stagionale)||Number(b.GW)||0));
 const prev=past.at(-1);
 if(prev)state.slides.push({home:canon(prev.Team),away:canon(prev.Opponent),gw:Number(prev.GW),kind:"previous",score:[goals(prev.PointsFor),goals(prev.PointsAgainst)],result:result(prev)});
 const now=fixture(code,gw,name);if(now)state.slides.push({...now,kind:"current"});
 const next=fixture(code,gw?gw+1:null,name);if(next)state.slides.push({...next,kind:"next"});
 state.index=Math.max(0,state.slides.findIndex(x=>x.kind==="current"));
}
// Same selection used by the official Home: last result mascots,
// current fixture logos, and next fixture standard mascots.
function matchdayImage(item, side) {
 const name=side==="left"?item.home:item.away;
 const team=info(name);
 if(item.kind==="current"){
   return {src:logo(name),fallback:"icon-192.png",className:"is-logo",alt:"Logo "+name};
 }
 const standard=team?.shirt||"img/maglie/default-shirt.png";
 if(item.kind==="next"){
   return {src:standard,fallback:"img/maglie/default-shirt.png",className:"is-mascot is-standard-mascot",alt:"Mascotte "+name};
 }
 // The previous result is stored from the signed-in team's perspective,
 // as on the original Home. Its opponent must show the opposite result.
 const outcome=String(item.result||"").toUpperCase();
 const state=outcome==="N"?"draw":side==="left"?(outcome==="V"?"win":"loss"):(outcome==="V"?"loss":"win");
 const asset=state==="win"?team?.mascotWin:state==="loss"?team?.mascotLoss:team?.mascotDraw;
 return {src:asset||standard,fallback:standard,className:"is-mascot is-result-mascot is-"+state,alt:"Mascotte "+name+" · "+({win:"vittoria",draw:"pareggio",loss:"sconfitta"}[state])};
}
function showMatchdayImage(id,visual){
 const element=$(id);
 if(!element)return;
 element.className=visual.className;
 element.alt=visual.alt;
 element.onerror=()=>{
   element.onerror=null;
   if(element.getAttribute("src")!==visual.fallback)element.src=visual.fallback;
 };
 element.src=visual.src;
}
function drawMatch(){
 const c=codeNow(),item=state.slides[state.index];
 $("stage-special").hidden=true;$("stage-personal").hidden=false;$("fixture-control").hidden=false;
 set("stage-competition",confName(c).toUpperCase());
 set("stage-match-title",state.team?.name||"La tua squadra");
 if(!item){
  set("stage-round","IN ATTESA");showMatchdayImage("stage-left-logo",{src:logo(state.team?.name),fallback:"icon-192.png",className:"is-logo",alt:"Logo squadra"});showMatchdayImage("stage-right-logo",{src:"icon-192.png",fallback:"icon-192.png",className:"is-logo",alt:"Calendario in aggiornamento"});
  set("stage-left-name",state.team?.name||"La tua squadra");set("stage-right-name","Calendario in aggiornamento");
  set("stage-match-title","Prossima sfida in aggiornamento");
  set("stage-score-value","VS");set("stage-score-label","MATCHDAY");
  set("stage-context","Prossima partita non disponibile");
  $("stage-cta").href="classifica.html";$("stage-cta").innerHTML="VEDI CALENDARIO <span>↗</span>";
  set("fixture-caption","Calendario in aggiornamento");
 }else{
  set("stage-round","GIORNATA "+item.gw);
  showMatchdayImage("stage-left-logo",matchdayImage(item,"left"));showMatchdayImage("stage-right-logo",matchdayImage(item,"right"));
  set("stage-left-name",item.home);set("stage-right-name",item.away);
  set("stage-match-title",item.home+" vs "+item.away);
  set("stage-score-value",item.score?item.score.join(" : "):"VS");
  set("stage-score-label",item.score?"RISULTATO":item.kind==="next"?"PROSSIMA GIORNATA":"MATCH PREVIEW");
  const h=standing(item.home,c),a=standing(item.away,c);
  set("stage-context",item.score?({V:"Vittoria",P:"Sconfitta",N:"Pareggio"}[item.result]||"Risultato"):h&&a?h+"ª contro "+a+"ª in classifica":"Sfida di Conference");
  $("stage-cta").href=href(item,c);
  $("stage-cta").innerHTML=(item.score?"MATCH REPORT":"MATCH CENTER")+" <span>↗</span>";
  set("fixture-caption",(item.kind==="previous"?"Partita precedente":item.kind==="next"?"Prossima giornata":"Partita attuale")+" · G"+item.gw);
 }
 $("fixture-prev").disabled=state.index<=0;$("fixture-next").disabled=state.index>=state.slides.length-1;
}
const cups={
 playoff:{label:"PLAYOFF",title:"Road to Glory",description:"Il tabellone, le serie e il percorso verso il titolo.",url:"playoff.html",art:"img/cups/playoff-cup.webp"},
 crashout:{label:"CRASH OUT CUP",title:"Rivalry & fase finale",description:"Risultati, rivalità e fase finale della Crash Out Cup.",url:"crashoutcup.html",art:"img/cups/crashout-cup.webp"},
 highlander:{label:"HIGHLANDER",title:"The Last Survivor",description:"Sopravvissute ed eliminazioni della Highlander.",url:"arena.html",art:"img/cups/highlander-cup.webp"}
};
function chooseView(view){
 state.view=view;document.body.dataset.view=view;
 document.querySelectorAll("[data-cup]").forEach(b=>{
  const on=b.dataset.cup===view;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on));
 });
 if(view==="league"){set("matchday-mark","PARTITA ATTUALE");drawMatch();return;}
 const cup=cups[view], status=state.cupStatus[view]||{};
 set("matchday-mark",cup.label);
 set("stage-competition",cup.label);
 set("stage-round",status.round||"LA TUA LEGA");
 $("fixture-control").hidden=true;
 if(status.match){
  const f=status.match;
  $("stage-personal").hidden=false;$("stage-special").hidden=true;
  showMatchdayImage("stage-left-logo",{src:logo(f.home),fallback:"icon-192.png",className:"is-logo",alt:"Logo "+f.home});
  showMatchdayImage("stage-right-logo",{src:logo(f.away),fallback:"icon-192.png",className:"is-logo",alt:"Logo "+f.away});
  set("stage-left-name",f.home);set("stage-right-name",f.away);
  set("stage-score-value",f.score?f.score.join(" : "):"VS");
  set("stage-score-label",f.score?"RISULTATO UFFICIALE":"RIVALRY GAME");
  set("stage-match-title",f.home+" vs "+f.away);
  set("stage-context",status.description||"Crash Out Cup · Rivalry Games");
  $("stage-cta").href=status.url||cup.url;
  $("stage-cta").innerHTML=(f.score?"MATCH REPORT":"MATCH CENTER")+" <span>↗</span>";
  return;
 }
 $("stage-personal").hidden=true;$("stage-special").hidden=false;
 img("stage-cup-art",status.art||cup.art,"Trofeo "+cup.label);
 set("stage-special-kicker",status.label||"COMPETIZIONE UFFICIALE");
 set("stage-special-title",status.title||cup.title);
 set("stage-special-desc",status.description||cup.description);
 set("stage-match-title",status.headline||cup.label);
 set("stage-context",status.bottom||"Apri la pagina dedicata");
 $("stage-cta").href=status.url||cup.url;
 $("stage-cta").innerHTML="VEDI LA COPPA <span>↗</span>";
}
async function loadCupStatuses(){
 if(!state.team)return;
 // Rely on the same read-only tables and season ids already used by the
 // official Home, without altering data, phases or competition settings.
 const name=state.team.name;
 const [crash,highState,highElims]=await Promise.allSettled([
  supabase.from("crashout_rivalry_matches")
   .select("matchday,match_index,home_team,away_team,home_goals,away_goals,is_played")
   .eq("season","2026").order("matchday",{ascending:true}).order("match_index",{ascending:true}),
  supabase.from("highlander_state").select("season,is_active").eq("season","2026").maybeSingle(),
  supabase.from("highlander_eliminations").select("season,turno,team_name,magic_punti").eq("season","2026").order("turno",{ascending:true})
 ]);
 if(crash.status==="fulfilled"&&!crash.value?.error){
  const rows=crash.value.data||[];
  const teamRows=rows.filter(r=>norm(r.home_team)===norm(name)||norm(r.away_team)===norm(name));
  const allFinished=rows.length>0&&rows.every(r=>!!r.is_played);
  if(allFinished){
   state.cupStatus.crashout={
    round:"FASE FINALE",
    label:"RIVALRY GAMES CONCLUSE",
    title:"Crash Out Playoff",
    description:"La prima fase è conclusa. Segui le serie del tabellone ufficiale.",
    headline:"Crash Out · fase finale",url:"crashoutplayoff.html"
   };
  }else if(teamRows.length){
   const next=teamRows.find(r=>!r.is_played)||teamRows.at(-1);
   const home=canon(next.home_team),away=canon(next.away_team),gw=Number(next.matchday)||0;
   state.cupStatus.crashout={
    round:"GIORNATA "+gw,description:"Crash Out Cup · Rivalry Games",
    match:{home,away,gw,score:next.is_played?[Number(next.home_goals)||0,Number(next.away_goals)||0]:null},
    url:"match.html?"+new URLSearchParams({home,away,gw:String(gw),competition:"Crash Out Cup"})
   };
  }
 }
 if(highState.status==="fulfilled"&&highElims.status==="fulfilled"
   &&!highState.value?.error&&!highElims.value?.error){
  const active=!!highState.value.data?.is_active;
  const eliminated=highElims.value.data||[];
  if(active){
   const isOut=eliminated.some(r=>norm(r.team_name)===norm(name));
   const survivors=Math.max(0,squadreBase.length-eliminated.length);
   const last=eliminated.length?Math.max(...eliminated.map(x=>Number(x.turno)||0)):0;
   const title=isOut?"Sei stato eliminato":survivors===1?"Ultimo sopravvissuto":"Ancora in gara";
   state.cupStatus.highlander={
    round:"TURNO "+Math.min(15,last+1),
    label:"LA TUA SITUAZIONE",
    title,
    description:survivors+" squadre ancora in corsa · "+eliminated.length+" eliminate",
    headline:"Highlander · situazione aggiornata",
    art:info(name)?.shirt||cups.highlander.art,
    url:"arena.html"
   };
  }else{
   state.cupStatus.highlander={label:"STATO COMPETIZIONE",title:"Highlander",description:"Competizione non attiva. Consulta la pagina ufficiale per le prossime informazioni."};
  }
 }
 if(String(state.phase||"").toLowerCase()==="playoff"){
  state.cupStatus.playoff={
   label:"FASE PLAYOFF",title:"Road to Glory",description:"I playoff del campionato sono attivi: segui il tabellone e le serie ufficiali.",
   round:"PLAYOFF",headline:"Campionato · Playoff"
  };
 }
 if(state.view!=="league")chooseView(state.view);
}
function drawTable(code){
 $("standings-label").innerHTML=esc(confName(code).toUpperCase())+" <span>FORMA · PT</span>";
 const rows=state.standings[code]||[];
 $("standings-list").innerHTML=rows.length?rows.slice(0,5).map((r,i)=>{
  const recent=completed(code).filter(x=>norm(x.Team)===norm(r.name))
   .sort((a,b)=>(Number(a.GW_Stagionale)||Number(a.GW)||0)-(Number(b.GW_Stagionale)||Number(b.GW)||0))
   .slice(-3).map(x=>result(x));
  const form=[...Array(Math.max(0,3-recent.length)).fill("-"),...recent];
  const badges=form.map(v=>'<span class="form-chip '+(v==="-"?"":v)+'" aria-label="'+({V:"Vittoria",N:"Pareggio",P:"Sconfitta","-":"Non disputata"}[v])+'">'+(v==="-"?"·":v)+'</span>').join("");
  return '<div class="standing-row '+(state.team&&norm(r.name)===norm(state.team.name)?"mine":"")+'"><span class="place">'+(i+1)+'.</span><img src="'+esc(logo(r.name))+'" alt=""><span class="name">'+esc(r.name)+'</span><span class="standing-form" aria-label="Ultime tre partite">'+badges+'</span><span class="points">'+r.pt+"</span></div>";
 }).join(""):'<div class="loading">Classifica non disponibile</div>';
}
function drawTicker(){
 const a=state.standings["Conf A"]?.[0],b=state.standings["Conf B"]?.[0];
 set("ticker-text",a&&b?"League: "+a.name+" ("+a.pt+" pt) · Championship: "+b.name+" ("+b.pt+" pt)":"Classifiche e risultati in aggiornamento");
}
function drawWeeklyNews(){
 // Exclude current personal fixture: never show the same matchup twice.
 const current=state.slides[state.slides.findIndex(x=>x.kind==="current")]||state.slides[state.index];
 const pair=f=>[norm(f.home),norm(f.away)].sort().join("|");
 const candidates=["Conf A","Conf B"].flatMap(code=>{
   const gw=round(code);
   return fixtures(code,gw).filter(f=>!current||pair(f)!==pair(current))
    .map(f=>({...f,code,rank:(standing(f.home,code)||99)+(standing(f.away,code)||99)}));
 }).sort((a,b)=>a.rank-b.rank);
 const f=candidates[0];
 if(!f){
  $("weekly-story").href="statistiche.html";
  set("weekly-tag","NUMERI E TENDENZE");
  set("weekly-title","Power Ranking");
  set("weekly-sub","Le statistiche della stagione");
  img("weekly-left-logo","icons/nav/statistiche.webp");
  img("weekly-right-logo","icons/nav/classifiche.webp");
  return;
 }
 img("weekly-left-logo",logo(f.home),"Logo "+f.home);
 img("weekly-right-logo",logo(f.away),"Logo "+f.away);
 set("weekly-tag",confName(f.code).toUpperCase()+" · G"+f.gw);
 set("weekly-title",f.home+" vs "+f.away);
 const h=standing(f.home,f.code),a=standing(f.away,f.code);
 set("weekly-sub",h&&a?h+"ª contro "+a+"ª in classifica":"Un'altra sfida da seguire");
 $("weekly-story").href=href(f,f.code);
}
function countdown(date){
 const minutes=Math.max(0,Math.ceil((date.getTime()-Date.now())/60000));
 return minutes>=1440?Math.floor(minutes/1440)+"g "+Math.floor(minutes%1440/60)+"h":minutes>=60?Math.floor(minutes/60)+"h "+minutes%60+"m":minutes+"m";
}
async function settings(){
 try{
 const {data,error}=await supabase.from("waiver_settings").select("active_phase,slot1_close_at,slot1s_close_at,slot2_close_at,slot2s_close_at,compensatory_close_at").order("id",{ascending:false}).limit(1);
 if(error)throw error;const s=data?.[0];state.phase=s?.active_phase||"";
 const values=[["Slot 1",s?.slot1_close_at],["Slot 1S",s?.slot1s_close_at],["Slot 2",s?.slot2_close_at],["Slot 2S",s?.slot2s_close_at],["Compensative",s?.compensatory_close_at]]
 .map(([label,x])=>({label,date:x?new Date(x):null})).filter(x=>x.date&&!Number.isNaN(x.date.getTime())&&x.date.getTime()>Date.now()).sort((a,b)=>a.date-b.date);
 set("waiver-value",values[0]?countdown(values[0].date):"Nessuna scadenza");
 set("waiver-detail",values[0]?values[0].label+" · alla chiusura":"Controlla le prossime finestre");
 }catch(e){console.warn("Waiver Arena:",e);set("waiver-value","Apri Waiver");set("waiver-detail","Orari non disponibili");}
}
async function trades(){
 try{
 const {data,error}=await supabase.from("trade_proposals").select("id,from_team,to_team,accepted_at,created_at").eq("status","accepted").order("accepted_at",{ascending:false}).limit(1);
 if(error)throw error;if(!data?.length){set("trade-value","Nessuna trade");set("trade-detail","Storico in attesa");return;}
 const {data:teams,error:e}=await supabase.from("teams").select("id,name");if(e)throw e;
 const labels=new Map((teams||[]).map(t=>[String(t.id),canon(t.name)]));const t=data[0];
 set("trade-value","Scambio concluso");
 set("trade-detail",(labels.get(String(t.from_team))||"Squadra A")+" ↔ "+(labels.get(String(t.to_team))||"Squadra B"));
 }catch(e){console.warn("Trade Arena:",e);set("trade-value","Apri il mercato");set("trade-detail","Storico non disponibile");}
}
async function team(){
 try{
 const {data}=await supabase.auth.getUser();if(!data?.user)return;
 const {data:p,error:e}=await supabase.from("profiles").select("team_id,role").eq("id",data.user.id).single();
 if(e||!p?.team_id)return;
 const {data:t,error:err}=await supabase.from("teams").select("id,name,conference").eq("id",p.team_id).single();
 if(err||!t)return;
 state.team={id:t.id,name:canon(t.name),conf:confOf(t.conference)};
 }catch(e){console.warn("Profilo Arena:",e);}
}
function bind(){
 document.querySelectorAll("[data-cup]").forEach(b=>b.addEventListener("click",()=>chooseView(b.dataset.cup)));
 document.querySelectorAll("[data-conf]").forEach(b=>b.addEventListener("click",()=>{
  document.querySelectorAll("[data-conf]").forEach(el=>{const yes=b===el;el.classList.toggle("on",yes);el.setAttribute("aria-pressed",String(yes));});
  drawTable(b.dataset.conf);
 }));
 $("fixture-prev").addEventListener("click",()=>{state.index=Math.max(0,state.index-1);drawMatch();});
 $("fixture-next").addEventListener("click",()=>{state.index=Math.min(state.slides.length-1,state.index+1);drawMatch();});
}
async function init(){
 bind();
 const [t,r,s]=await Promise.allSettled([team(),loadResultsRows(),settings(),trades()]);
 if(r.status==="fulfilled"&&Array.isArray(r.value))state.rows=r.value;
 else console.warn("Risultati Arena non disponibili",r.reason);
 ["Conf A","Conf B","Unificata"].forEach(c=>state.standings[c]=table(c));
 buildSlides();identity();drawTicker();drawWeeklyNews();drawTable("Conf A");chooseView("league");
 if(state.team?.conf==="Conf B")document.querySelector('[data-conf="Conf B"]')?.click();
 loadCupStatuses().catch(err=>console.warn("Anteprima coppe Arena:",err));
}
init();
