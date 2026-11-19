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
const state = {team:null,rows:[],phase:"",standings:{},slides:[],index:0,view:"league",cupStatus:{},demoAllActive:false};
function completed(code){
 const used=new Set();
 const isSeasonTotal=code==="Totale";
 return state.rows.filter(r=>{
  const conference=String(r.Conference||"");
  const regular=String(r.Phase||"Regular").trim().toLowerCase()==="regular";
  if(isSeasonTotal){
   // Mirror the official Total classification: both Conferences + Round Robin.
   return regular&&["Conf A","Conf B","Unificata"].includes(conference)
    &&(num(r.PointsFor)!==0||num(r.PointsAgainst)!==0);
  }
  if(conference==="Unificata"){
   // The Round Robin ranking includes this phase only.
   return code==="Unificata"&&regular&&(num(r.PointsFor)!==0||num(r.PointsAgainst)!==0);
  }
  return conference===code&&done(r);
 }).filter(r=>{
  const key=r.Conference+"|"+r.GW+"|"+norm(r.Team);
  if(used.has(key))return false;used.add(key);return true;
 });
}
function roundRobinStandingsActive(){
 const phase=String(state.phase||"").trim().toLowerCase().replace(/[\s-]+/g,"_");
 const isActivePhase=["round_robin","roundrobin"].includes(phase);
 // Keep the change automatic even when the first Round Robin scores
 // are imported before waiver_settings.active_phase gets updated.
 const hasOfficialRR=state.rows.some(r=>r.Conference==="Unificata"
  &&String(r.Phase||"Regular").trim().toLowerCase()==="regular"
  &&(num(r.PointsFor)!==0||num(r.PointsAgainst)!==0));
 // Visual testing is isolated to this standalone test page, never saves data.
 const preview=new URLSearchParams(window.location.search).get("standings")==="rr";
 return preview||isActivePhase||hasOfficialRR;
}
function configureStandingsTabs(isRR){
 const tabs=[...document.querySelectorAll("[data-conf]")];
 const data=isRR
  ?[["Totale","Totale"],["Unificata","Round Robin"]]
  :[["Conf A","League"],["Conf B","Championship"]];
 tabs.forEach((button,i)=>{
  const [code,label]=data[i];
  button.dataset.conf=code;
  button.textContent=label;
 });
 const switcher=document.querySelector(".standing-switch");
 if(switcher)switcher.setAttribute("aria-label",isRR?"Scegli tra Classifica Totale e Round Robin":"Scegli Conference");
}
function selectStandings(code){
 document.querySelectorAll("[data-conf]").forEach(button=>{
  const active=button.dataset.conf===code;
  button.classList.toggle("on",active);
  button.setAttribute("aria-pressed",String(active));
 });
 drawTable(code);
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
/**
 * TEST-ONLY all-four-active visual preview.
 * Never writes to Supabase. All hypothetical results are explicitly labelled.
 * Campionato remains linked to the real match carousel.
 */

/* ARENA TEST V17: graphics from the existing Playoff Real Legends
   and Crash Out Miami Vice asset registries. No Supabase writes. */
const ARENA_DUEL_ART = {
 "team bartowski":["team-bartowski","team-bartowski"],
 "golden knights":["golden-knights","golden-knights"],
 "atletico leon":["atletico-leon","atletico-leon"],
 "bayern christiansen":["bayern-christiansen","bayern-christiansen"],
 "ibla":["ibla-fc","ibla"],
 "fantaugusta":["fantaugusta","fantaugusta"],
 "riverfilo":["riverfilo","riverfilo"],
 "desperados":["desperados","desperados"],
 "wildboys 78":["wild-boys","wildboys"],
 "pandinicoccolosini":["pandini","pandini"],
 "pokermantra":["pokermantra","pokermantra"],
 "minnesode timberland":["minnesode-timberland","minnesode"],
 "minnesota snakes":["minnesota-snakes","minnesota-snakes"],
 "eintracht franco 126":["eintracht-franco-126","eintracht-franco"],
 "fc disoneste":["fc-disoneste","fc-disoneste"],
 "athletic pongao":["athletic-pongao","athletic-pongao"]
};
function getDuelArt(view,name){
 const item=Object.entries(ARENA_DUEL_ART).find(([key])=>norm(key)===norm(name))?.[1];
 const file=item?.[view==="playoff"?0:1];
 return file
  ? "img/"+(view==="playoff"?"playoff-real-legends/":"crashout-miami/")+file+".webp"
  : info(name)?.shirt||logo(name);
}
/* Direction metadata for original Real Legends portraits.
   An image looking right belongs on the LEFT, and vice versa.
   Frontal portraits remain untouched to avoid needless mirrored badges.
   These are the orientations of the existing source images, not team assignments. */
const PLAYOFF_ART_DIRECTION = {
 "atleticoleon":"right",
 "fantaugusta":"right",
 "riverfilo":"right",
 "eintrachtfranco126":"right",
 "ibla":"right",
 "goldenknights":"left",
 "bayernchristiansen":"left",
 "athleticpongao":"left",
 "desperados":"left"
};
function orientDuelArt(el,view,name){
 const natural=PLAYOFF_ART_DIRECTION[norm(name)]||"front";
 const onLeft=el.id==="stage-duel-left-art";
 const wanted=onLeft?"right":"left";
 // Keep Miami Vice portraits unchanged: their card is already approved.
 const flip=view==="playoff" && natural!=="front" && natural!==wanted;
 el.classList.toggle("faces-inward-flipped",flip);
 el.dataset.originalFacing=natural;
}

function showDuelArt(id,view,name){
 const el=$(id);
 if(!el)return;
 const fallback=info(name)?.shirt||logo(name);
 orientDuelArt(el,view,name);
 el.onerror=()=>{
  el.onerror=null;
  // If the art is unavailable, fall back to the standard mascot,
  // whose native viewing direction may differ from the Real Legends art.
  el.classList.remove("faces-inward-flipped");
  if(el.getAttribute("src")!==fallback)el.src=fallback;
 };
 el.alt="Personaggio "+name;
 // Optical adjustments are applied per character, never to other matchups.
 el.dataset.duelTeam=norm(name);
 el.src=getDuelArt(view,name);
}
function renderArenaDuel(view,home,away,{round="",note="",eliminatedTeam=null}={}){
 $("stage-personal").hidden=true;
 $("stage-special").hidden=true;
 $("stage-duel").hidden=false;
 document.body.classList.add("has-active-duel");
 document.body.classList.toggle("is-cup-eliminated",!!eliminatedTeam);
 showDuelArt("stage-duel-left-art",view,home);
 showDuelArt("stage-duel-right-art",view,away);
 $("stage-duel-left-art").classList.toggle("is-eliminated",!!eliminatedTeam&&norm(home)===norm(eliminatedTeam));
 $("stage-duel-right-art").classList.toggle("is-eliminated",!!eliminatedTeam&&norm(away)===norm(eliminatedTeam));
 set("stage-duel-home",home.toUpperCase());
 set("stage-duel-away",away.toUpperCase());
 set("stage-duel-round",round||(view==="playoff"?"PLAYOFF":"CRASH OUT"));
 set("stage-duel-note",note||(view==="playoff"?"APRI L'ARENA DELL'INCONTRO":"BEST OF 5 · ROAD TO THE CRASH"));
}

function renderDemoCup(view){
 if(view==="league"){
  set("matchday-mark","CAMPIONATO · ATTIVO");
  drawMatch();
  return;
 }
 const me=state.team?.name||"Team Bartowski";
 const isPlayoff=view==="playoff",isCrashout=view==="crashout";
 $("fixture-control").hidden=true;
 if(isPlayoff||isCrashout){
  const opponent=isPlayoff?"Atlético Leon":"FC Disoneste";
  const label=isPlayoff?"PLAYOFF":"CRASH OUT CUP";
  const roundLabel=isPlayoff?"WILD CARD · 3":"OTTAVI · G3";
  const context=isPlayoff
    ?"Sfida Wild Card · anteprima grafica (esempio)"
    :"Crash Out Fase Finale · serie sull'1–1 (esempio)";
  const target=isPlayoff?"playoff.html":"crashoutplayoff.html";
  set("matchday-mark",label+" · IN CORSA");
  set("stage-competition",label);
  set("stage-round",roundLabel);
  renderArenaDuel(view,me,opponent,{
   round:roundLabel,
   note:isPlayoff?"APRI L'ARENA DELL'INCONTRO":"BEST OF 5 · ROAD TO THE CRASH"
  });
  set("stage-match-title",me+" vs "+opponent);
  set("stage-context",context);
  $("stage-cta").href=target;
  $("stage-cta").innerHTML=(isPlayoff?"VEDI PLAYOFF REALI":"VEDI FASE FINALE REALE")+" <span>↗</span>";
  return;
 }
 if(view==="highlander"){
  set("matchday-mark","HIGHLANDER · IN CORSA");
  set("stage-competition","HIGHLANDER");
  set("stage-round","TURNO 10");
  $("stage-personal").hidden=true;
  $("stage-special").hidden=false;
  img("stage-cup-art",highlanderArt(me,false),"Mascotte "+me);
  set("stage-special-kicker","ANCORA IN GARA · DEMO");
  set("stage-special-title","Tra i superstiti");
  set("stage-special-desc",me+" è ancora in corsa · 6 franchigie rimaste (esempio)");
  set("stage-match-title","Highlander · sei ancora in gara");
  set("stage-context","Turno 10 · nessuna eliminazione (esempio)");
  $("stage-cta").href="arena.html";
  $("stage-cta").innerHTML="VEDI HIGHLANDER REALE <span>↗</span>";
 }
}
function setDemoMode(active,updateUrl=false){
 state.demoAllActive=!!active;
 document.body.classList.toggle("demo-all-active",state.demoAllActive);
 const button=$("arena-demo-toggle");
 if(button){
  button.setAttribute("aria-pressed",String(state.demoAllActive));
  button.textContent=state.demoAllActive?"Torna ai dati reali":"Simula 4 coppe";
 }
 if($("arena-demo-disclaimer")) $("arena-demo-disclaimer").hidden=!state.demoAllActive;
 if(updateUrl){
  const url=new URL(window.location.href);
  if(state.demoAllActive)url.searchParams.set("demo","all");
  else url.searchParams.delete("demo");
  window.history.replaceState(null,"",url.toString());
 }
 chooseView(state.view);
}

function chooseView(view){
 state.view=view;document.body.dataset.view=view;
 document.body.classList.remove("has-active-duel","is-cup-eliminated");
 $("stage-duel").hidden=true;
 // Four permanent navigation tabs: never hide on elimination or inactive phases.
 const hasRanking=view==="league";
 $("stage-ranking-link").hidden=!hasRanking;
 $("stage-actions").classList.toggle("has-ranking",hasRanking);
 document.querySelectorAll("[data-cup]").forEach(b=>{
  const on=b.dataset.cup===view;b.classList.toggle("on",on);b.setAttribute("aria-pressed",String(on));
 });
 if(state.demoAllActive){renderDemoCup(view);return;}
 if(view==="league"){set("matchday-mark","PARTITA ATTUALE");drawMatch();return;}
 const cup=cups[view], status=state.cupStatus[view]||{};
 set("matchday-mark",status.label||cup.label);
 set("stage-competition",cup.label);
 set("stage-round",status.round||"LA TUA LEGA");
 $("fixture-control").hidden=true;
 if(status.match){
  const f=status.match;
  if(view==="crashout"||view==="playoff"){
   renderArenaDuel(view,f.home,f.away,{
    round:status.round||cup.label,
    note:status.eliminated?"ELIMINATO · PERCORSO CONCLUSO":
     status.projection?"PROIEZIONE · ACCOPPIAMENTO PROVVISORIO":
     f.score?"SERIE · "+f.score.join(" - "):"APRI L'ARENA DELL'INCONTRO",
    eliminatedTeam:status.eliminatedTeam||null
   });
  }else{
   $("stage-personal").hidden=false;$("stage-special").hidden=true;
   showMatchdayImage("stage-left-logo",{src:logo(f.home),fallback:"icon-192.png",className:"is-logo",alt:"Logo "+f.home});
   showMatchdayImage("stage-right-logo",{src:logo(f.away),fallback:"icon-192.png",className:"is-logo",alt:"Logo "+f.away});
   set("stage-left-name",f.home);set("stage-right-name",f.away);
   set("stage-score-value",f.score?f.score.join(" : "):"VS");
   set("stage-score-label",f.score?"RISULTATO UFFICIALE":"RIVALRY GAME");
  }
  set("stage-match-title",f.home+" vs "+f.away);
  set("stage-context",status.description||"Crash Out Cup · Rivalry Games");
  $("stage-cta").href=status.url||cup.url;
  $("stage-cta").innerHTML=(status.eliminated?"VEDI IL TABELLONE":
   status.projection?"VEDI PROIEZIONE":
   f.code?"VEDI LA COPPA":f.score?"MATCH REPORT":"MATCH CENTER")+" <span>↗</span>";
  return;
 }
 $("stage-personal").hidden=true;$("stage-special").hidden=false;
 img("stage-cup-art",status.art||cup.art,view==="highlander"?"Mascotte "+(state.team?.name||""):"Trofeo "+cup.label);
 document.body.classList.toggle("is-cup-eliminated",!!status.eliminated);
 set("stage-special-kicker",status.label||"COMPETIZIONE UFFICIALE");
 set("stage-special-title",status.title||cup.title);
 set("stage-special-desc",status.description||cup.description);
 set("stage-match-title",status.headline||cup.label);
 set("stage-context",status.bottom||"Apri la pagina dedicata");
 $("stage-cta").href=status.url||cup.url;
 $("stage-cta").innerHTML="VEDI LA COPPA <span>↗</span>";
}

/* ARENA TEST V20: read-only season cards. The source of truth remains the
   official Playoff / Crash Out / Highlander tables. All projections are
   expressly marked as provisional, never as official outcomes. */
const CUP_SEASON="2026";
const HIGHLANDER_ELIMINATED_ART={
 "atleticoleon":"rubinkebab","bayernchristiansen":"bayern","teambartowski":"bartowski",
 "goldenknights":"golden","ibla":"ibla","fantaugusta":"fantaugusta",
 "riverfilo":"riverfilo","desperados":"desperados","wildboys78":"wildboys",
 "pandinicoccolosini":"pandini","pokermantra":"pokermantra",
 "minnesodetimberland":"minnesode","minnesotasnakes":"minnesota",
 "eintrachtfranco126":"franco","fcdisoneste":"disoneste","athleticpongao":"pongao"
};
function highlanderArt(name,eliminated=false){
 // Same source as the mobile Highlander survivors and eliminated lists
 // in arena.js: the dedicated Highlander portrait is ALWAYS used.
 // Elimination affects its CSS state (grayscale), not the asset path.
 const key=HIGHLANDER_ELIMINATED_ART[norm(name)];
 return key
  ?"img/maglie/"+key+"-higlander.webp"
  :info(name)?.shirt||cups.highlander.art;
}
function stageRank(code){
 if(/^WC\d/.test(code))return 0;
 if(/^Q\d/.test(code))return 1;
 if(/^S\d/.test(code))return 2;
 if(code==="P3")return 3;
 if(code==="F")return 4;
 return 0;
}
function playoffRoundName(code){
 return /^WC/.test(code)?"WILD CARD":/^Q/.test(code)?"QUARTI":/^S/.test(code)?"SEMIFINALE":code==="P3"?"3° POSTO":"FINALE";
}
function playoffRankingSnapshot(){
 const seen=new Set(),table=new Map();
 for(const r of state.rows){
  if(r.Phase!=="Regular"||!["Conf A","Conf B","Unificata"].includes(r.Conference))continue;
  const name=canon(r.Team),opponent=canon(r.Opponent),key=norm(name);
  if(!key||!norm(opponent)||!done(r))continue;
  const pf=num(r.PointsFor),pa=num(r.PointsAgainst);
  if(!pf&&!pa)continue;
  // Deduplication uses the same match fields as the official playoff.js.
  const dedup=[r.GW||"",r.GW_Stagionale||"",key,norm(opponent),pf,pa,r.Conference].join("|");
  if(seen.has(dedup))continue;
  seen.add(dedup);
  if(!table.has(key))table.set(key,{name,pt:0,mp:0,gf:0,gs:0});
  const row=table.get(key);
  const gf=goals(pf),ga=goals(pa);
  row.pt+=gf>ga?3:gf===ga?1:0;
  row.mp+=pf;row.gf+=gf;row.gs+=ga;
 }
 return [...table.values()].sort((a,b)=>b.pt-a.pt||b.mp-a.mp||b.gf-a.gf||a.gs-b.gs||a.name.localeCompare(b.name))
   .map((row,i)=>({...row,seed:i+1}));
}
function playoffWinner(match,code,scores){
 if(!match?.home?.name||!match?.away?.name)return null;
 const result=scores.get(code);
 if(!result||result.home==null||result.away==null)return null;
 if(result.home>result.away)return match.home;
 if(result.away>result.home)return match.away;
 if((code.startsWith("WC")||code.startsWith("Q"))&&Number.isFinite(match.home.seed)&&Number.isFinite(match.away.seed)){
  return match.home.seed<match.away.seed?match.home:match.away;
 }
 return null;
}
function playoffMatchStatus(name,scores){
 const seeds=playoffRankingSnapshot();
 if(seeds.length<12)return {round:"IN ATTESA",label:"PROIEZIONE PLAYOFF",title:"Road to Glory",description:"La classifica totale non è ancora disponibile.",url:"playoff.html"};
 const top=seeds.slice(0,12),me=top.find(x=>norm(x.name)===norm(name));
 if(!me)return {round:"CLASSIFICA",label:"PROIEZIONE ATTUALE",title:"Fuori dalla Top 12",description:"Al momento fuori dai posti playoff. Segui l'evoluzione della classifica totale.",url:"playoff.html"};
 const participants={};
 const wc={WC1:[8,9],WC2:[7,10],WC3:[5,12],WC4:[6,11]};
 for(const [code,[h,a]] of Object.entries(wc))participants[code]={home:top[h-1],away:top[a-1]};
 const winner=code=>playoffWinner(participants[code],code,scores);
 const loser=code=>{
  const win=winner(code),m=participants[code];
  if(!win||!m?.home?.name||!m?.away?.name)return null;
  return norm(win.name)===norm(m.home.name)?m.away:m.home;
 };
 participants.Q1={home:top[0],away:winner("WC1")};
 participants.Q4={home:top[3],away:winner("WC3")};
 participants.Q2={home:top[1],away:winner("WC2")};
 participants.Q3={home:top[2],away:winner("WC4")};
 participants.S1={home:winner("Q1"),away:winner("Q4")};
 participants.S2={home:winner("Q2"),away:winner("Q3")};
 participants.P3={home:loser("S1"),away:loser("S2")};
 participants.F={home:winner("S1"),away:winner("S2")};
 const codes=["WC1","WC2","WC3","WC4","Q1","Q2","Q3","Q4","S1","S2","P3","F"];
 const played=codes.filter(code=>[participants[code]?.home,participants[code]?.away].some(t=>t&&norm(t.name)===norm(name)));
 const ordered=played.sort((a,b)=>stageRank(a)-stageRank(b));
 const lost=ordered.find(code=>{const w=winner(code);return w&&norm(w.name)!==norm(name)});
 const last=lost||ordered.at(-1);
 const realPlayoffs=String(state.phase||"").toLowerCase()==="playoff"||[...scores.values()].some(v=>v.home!=null&&v.away!=null);
 const mapStage=code=>code.startsWith("WC")?"wildcard":code.startsWith("Q")?"quarti":code.startsWith("S")?"semifinali":"finale";
 if(last&&participants[last]?.home?.name&&participants[last]?.away?.name){
  const m=participants[last],finalWin=winner(last),eliminated=!!lost,completed=!!finalWin;
  const title=playoffRoundName(last),provisional=!realPlayoffs&&!completed;
  const label=eliminated?"ELIMINATO":completed?"RISULTATO UFFICIALE":provisional?"PROIEZIONE ATTUALE":"IN CORSA";
  const finalLabel=eliminated?"Percorso concluso":completed&&(last==="F")?"Campione Playoff":completed?"Turno concluso":provisional?"Accoppiamento provvisorio":"Sfida playoff";
  const score=scores.get(last);
  return {
   round:title+" · "+last.replace(/\D/g,""),
   label,
   match:{home:m.home.name,away:m.away.name,code:last,score:score?.home!=null&&score?.away!=null?[score.home,score.away]:null},
   eliminated,eliminatedTeam:eliminated?name:null,projection:provisional,
   description:finalLabel+(score?.home!=null&&score?.away!=null?" · "+score.home+"-"+score.away:"")+" · "+title,
   url:"playoff.html?fase="+mapStage(last),headline:"Playoff · "+title
  };
 }
 // The best four seeds await a Wild Card winner. Do not invent that opponent
 // once official playoffs are underway. For the pre-playoff snapshot only,
 // show the higher-ranked Wild Card seed as a clearly labelled projection.
 if(me.seed<=4){
  const qCode={1:"Q1",2:"Q2",3:"Q3",4:"Q4"}[me.seed];
  const wcCode={Q1:"WC1",Q2:"WC2",Q3:"WC4",Q4:"WC3"}[qCode];
  const candidates=participants[wcCode];
  const likely=[candidates.home,candidates.away].sort((a,b)=>a.seed-b.seed)[0];
  if(!realPlayoffs&&likely){
   return {
    round:"QUARTI · PROIEZIONE",label:"ACCOPPIAMENTO IPOTETICO",
    match:{home:me.name,away:likely.name,code:qCode},projection:true,
    description:"Possibile avversario ai Quarti · in attesa della Wild Card",
    url:"playoff.html?fase=quarti"
   };
  }
  return {round:"QUARTI",label:"TESTA DI SERIE",title:"Qualificato ai Quarti",description:"Attesa della vincente della Wild Card.",art:highlanderArt(name),url:"playoff.html?fase=quarti"};
 }
 return {round:"PLAYOFF",label:"IN ATTESA",title:"Road to Glory",description:"Accoppiamenti in aggiornamento.",url:"playoff.html"};
}
async function loadPlayoffCard(name){
 const {data,error}=await supabase.from("playoff_results").select("match_code,home_score,away_score");
 if(error){console.warn("Anteprima Playoff:",error);return {round:"IN AGGIORNAMENTO",label:"PLAYOFF",title:"Road to Glory",description:"Risultati momentaneamente non disponibili.",url:"playoff.html"};}
 const scores=new Map((data||[]).map(r=>[r.match_code,{
  home:r.home_score==null?null:Number(r.home_score),
  away:r.away_score==null?null:Number(r.away_score)
 }]));
 return playoffMatchStatus(name,scores);
}
/* Crash Out official bracket: 1-16/8-9/5-12/4-13 on the left,
   3-14/6-11/7-10/2-15 on the right. A series advances only at
   three victories, as in crashoutplayoff.js. */
const CRASH_PAIRS={L1:[1,16],L2:[8,9],L3:[5,12],L4:[4,13],
 R1:[3,14],R2:[6,11],R3:[7,10],R4:[2,15]};
const CRASH_CHAIN={LSF1:["L1","L2"],LSF2:["L3","L4"],
 RSF1:["R1","R2"],RSF2:["R3","R4"],LCF:["LSF1","LSF2"],RCF:["RSF1","RSF2"],F:["LCF","RCF"]};
const CRASH_ORDER=["L1","L2","L3","L4","R1","R2","R3","R4","LSF1","LSF2","RSF1","RSF2","LCF","RCF","F"];
function crashRound(code){
 return /^[LR][1-4]$/.test(code)?"OTTAVI":/SF/.test(code)?"QUARTI":/CF/.test(code)?"SEMIFINALI":"FINALE";
}
function crashStandingsFromRivalry(rows){
 const t=new Map(squadreBase.map((team,i)=>[norm(team.nome),{team:team.nome,order:i,points:0,magic:0,gd:0,gf:0}]));
 for(const r of rows){
  if(!r.is_played)continue;
  const h=t.get(norm(r.home_team)),a=t.get(norm(r.away_team));
  if(!h||!a)continue;
  const hg=Number(r.home_goals),ag=Number(r.away_goals);
  if(!Number.isFinite(hg)||!Number.isFinite(ag))continue;
  h.gf+=hg;a.gf+=ag;h.gd+=hg-ag;a.gd+=ag-hg;
  h.magic+=num(r.home_magic);a.magic+=num(r.away_magic);
  if(hg>ag)h.points+=3;
  else if(ag>hg)a.points+=3;
  else{h.points++;a.points++;}
 }
 return [...t.values()].sort((a,b)=>b.points-a.points||b.magic-a.magic||b.gd-a.gd||b.gf-a.gf||a.order-b.order)
  .map((row,i)=>({seed:i+1,team:row.team}));
}
function crashBracketStatus(name,seeds,scoreRows){
 if(seeds.length<16)return null;
 const positions=new Map(seeds.map(x=>[Number(x.seed),{seed:Number(x.seed),name:canon(x.team)}]));
 const scores=new Map(scoreRows.map(r=>[r.series_id,{home:Number(r.home_score)||0,away:Number(r.away_score)||0}]));
 const matches={};
 for(const [id,pair] of Object.entries(CRASH_PAIRS))matches[id]={home:positions.get(pair[0]),away:positions.get(pair[1])};
 const winner=id=>{
  const s=scores.get(id),m=matches[id];
  if(!s||!m?.home||!m?.away)return null;
  return s.home>=3&&s.home>s.away?m.home:s.away>=3&&s.away>s.home?m.away:null;
 };
 for(const [id,[a,b]] of Object.entries(CRASH_CHAIN))matches[id]={home:winner(a),away:winner(b)};
 // Don't show a future series until BOTH opponents are determined.
 // A qualified team otherwise keeps its most recent completed matchup.
 const mine=CRASH_ORDER.filter(code=>{
  const m=matches[code];
  return m?.home?.name&&m?.away?.name&&[m.home,m.away].some(t=>norm(t.name)===norm(name));
 });
 if(!mine.length)return null;
 const lost=mine.find(code=>{const win=winner(code);return win&&norm(win.name)!==norm(name)});
 const last=lost||mine.at(-1),m=matches[last],result=scores.get(last)||{home:0,away:0};
 const eliminated=!!lost,won=winner(last)&&norm(winner(last).name)===norm(name);
 const desc=eliminated?"Eliminato agli "+crashRound(last).toLowerCase()+" · serie "+result.home+"-"+result.away:
  won&&last==="F"?"Campione Crash Out Cup":
  won?"Turno superato · in attesa del prossimo avversario":
  "Best of 5 · serie "+result.home+"-"+result.away;
 return {round:crashRound(last)+" · "+last,label:eliminated?"ELIMINATO":won&&last==="F"?"CAMPIONE":won?"QUALIFICATO":"FASE FINALE",
  eliminated,eliminatedTeam:eliminated?name:null,
  match:{home:m.home.name,away:m.away.name,code:last,score:[result.home,result.away]},
  description:desc,url:"crashoutplayoff.html",headline:"Crash Out · "+crashRound(last)};
}
async function loadCrashoutCard(name){
 const {data:rr,error:err}=await supabase.from("crashout_rivalry_matches")
  .select("matchday,match_index,home_team,away_team,home_goals,away_goals,home_magic,away_magic,is_played")
  .eq("season",CUP_SEASON).order("matchday",{ascending:true}).order("match_index",{ascending:true});
 if(err){console.warn("Crash Out Rivalry:",err);return null;}
 const rows=rr||[];
 const allFinished=rows.length>0&&rows.every(r=>!!r.is_played);
 if(!allFinished){
  const my=rows.filter(r=>norm(r.home_team)===norm(name)||norm(r.away_team)===norm(name));
  if(!my.length)return null;
  const next=my.find(r=>!r.is_played)||my.at(-1);
  const home=canon(next.home_team),away=canon(next.away_team),gw=Number(next.matchday)||0;
  return {round:"RIVALRY · G"+gw,label:"RIVALRY GAMES",match:{
   home,away,gw,score:next.is_played?[Number(next.home_goals)||0,Number(next.away_goals)||0]:null},
   description:"Crash Out · Rivalry Games",url:"match.html?"+new URLSearchParams({home,away,gw:String(gw),competition:"Crash Out Cup"})};
 }
 const [locked,sr]=await Promise.all([
  supabase.from("crashout_playoff_seeds").select("seed_number,team_name").eq("season",CUP_SEASON).order("seed_number",{ascending:true}),
  supabase.from("crashout_playoff_scores").select("series_id,home_score,away_score")
 ]);
 const seeds=!locked.error&&locked.data?.length===16&&locked.data.every(r=>r.seed_number&&r.team_name)
  ?locked.data.map(r=>({seed:Number(r.seed_number),team:canon(r.team_name)}))
  :crashStandingsFromRivalry(rows);
 if(sr.error){console.warn("Crash Out Scores:",sr.error);return {round:"FASE FINALE",label:"CRASH OUT",title:"Crash Out Playoff",description:"Risultati non disponibili.",url:"crashoutplayoff.html"};}
 return crashBracketStatus(name,seeds,sr.data||[])||{round:"FASE FINALE",label:"CRASH OUT",title:"Crash Out Playoff",description:"Consulta il tabellone della fase finale.",url:"crashoutplayoff.html"};
}
async function loadHighlanderCard(name){
 const [a,b]=await Promise.all([
  supabase.from("highlander_state").select("season,is_active").eq("season",CUP_SEASON).maybeSingle(),
  supabase.from("highlander_eliminations").select("season,turno,team_name,magic_punti").eq("season",CUP_SEASON).order("turno",{ascending:true})
 ]);
 if(a.error||b.error){
  return {round:"HIGHLANDER",label:"THE LAST SURVIVOR",title:"Highlander",description:"Stato in aggiornamento.",art:highlanderArt(name),url:"arena.html"};
 }
 const eliminations=b.data||[],myOut=eliminations.find(r=>norm(r.team_name)===norm(name));
 const active=!!a.data?.is_active,lastTurn=eliminations.length?Math.max(...eliminations.map(r=>Number(r.turno)||0)):0;
 const eliminated=myOut!=null,survivors=Math.max(0,squadreBase.length-new Set(eliminations.map(r=>norm(r.team_name))).size);
 const winner=survivors===1&&!eliminated&&eliminations.length>0;
 return {
  round:"TURNO "+(eliminated?myOut.turno:Math.min(15,lastTurn+1)),
  label:eliminated?"ELIMINATO":winner?"ULTIMO SOPRAVVISSUTO":active?"ANCORA IN GARA":"IN ATTESA",
  title:eliminated?"Il tuo percorso è finito":winner?"Il campione Highlander":active?"Ancora in gara":"Highlander",
  description:eliminated?"Eliminato al turno "+myOut.turno+" · "+survivors+" squadre rimaste":
   winner?"L'ultimo sopravvissuto":active?survivors+" squadre ancora in gara":"Competizione non ancora attiva",
  headline:eliminated?"Highlander · eliminato":winner?"Highlander · campione":"Highlander · la tua situazione",
  art:highlanderArt(name,eliminated),eliminated,url:"arena.html"
 };
}
function updateCompetitionBadges(){
 document.querySelectorAll("[data-cup]").forEach(button=>{
  const cup=button.dataset.cup;
  const status=state.cupStatus[cup]||{};
  button.dataset.seasonState=cup==="league"?"in":
   status.eliminated?"out":
   status.projection?"projection":
   status.match||/IN CORSA|ANCORA IN GARA|QUALIFICATO|CAMPIONE|ULTIMO SOPRAVVISSUTO/i.test(status.label||"")?"in":"upcoming";
 });
}
async function loadCupStatuses(){
 if(!state.team)return;
 const name=state.team.name;
 const [p,c,h]=await Promise.allSettled([
  loadPlayoffCard(name),loadCrashoutCard(name),loadHighlanderCard(name)
 ]);
 if(p.status==="fulfilled"&&p.value)state.cupStatus.playoff=p.value;
 if(c.status==="fulfilled"&&c.value)state.cupStatus.crashout=c.value;
 if(h.status==="fulfilled"&&h.value)state.cupStatus.highlander=h.value;
 for(const x of [p,c,h])if(x.status==="rejected")console.warn("Anteprima coppa:",x.reason);
 updateCompetitionBadges();
 if(state.view!=="league"&&!state.demoAllActive)chooseView(state.view);
}

function drawTable(code){
 $("standings-label").innerHTML=esc((code==="Totale"?"Classifica Totale":confName(code)).toUpperCase())+" <span>FORMA · PT</span>";
 const rows=state.standings[code]||[];
 $("standings-list").innerHTML=rows.length?rows.slice(0,5).map((r,i)=>{
  const recent=completed(code).filter(x=>norm(x.Team)===norm(r.name))
   .sort((a,b)=>(Number(a.GW_Stagionale)||Number(a.GW)||0)-(Number(b.GW_Stagionale)||Number(b.GW)||0))
   .slice(-3).map(x=>result(x));
  const form=[...Array(Math.max(0,3-recent.length)).fill("-"),...recent];
  const badges=form.map(v=>'<span class="form-chip '+(v==="-"?"":v)+'" aria-label="'+({V:"Vittoria",N:"Pareggio",P:"Sconfitta","-":"Non disputata"}[v])+'">'+(v==="-"?"·":v)+'</span>').join("");
  return '<div class="standing-row '+(state.team&&norm(r.name)===norm(state.team.name)?"mine":"")+'"><span class="place">'+(i+1)+'.</span><img src="'+esc(logo(r.name))+'" alt=""><span class="name">'+esc(r.name)+'</span><span class="standing-form" aria-label="Ultime tre partite">'+badges+'</span><span class="points">'+r.pt+"</span></div>";
 }).join(""):'<div class="loading">'+(code==="Unificata"?"Nessun risultato del Round Robin":"Classifica non disponibile")+'</div>';
}
function drawTicker(){
 const a=state.standings["Conf A"]?.[0],b=state.standings["Conf B"]?.[0];
 set("ticker-text",a&&b?"League: "+a.name+" ("+a.pt+" pt) · Championship: "+b.name+" ("+b.pt+" pt)":"Classifiche e risultati in aggiornamento");
}
// Waiver settings still define the active season phase used by the Playoff card.
// The Insider-specific countdown and latest trade queries are no longer needed.
async function settings(){
 try{
  const {data,error}=await supabase.from("waiver_settings")
    .select("active_phase").order("id",{ascending:false}).limit(1);
  if(error)throw error;
  state.phase=data?.[0]?.active_phase||"";
 }catch(e){
  console.warn("Fase stagione Arena non disponibile:",e);
 }
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
 // Controlli dimostrativi disattivati nella Home ufficiale.
 document.querySelectorAll("[data-cup]").forEach(b=>b.addEventListener("click",()=>chooseView(b.dataset.cup)));
 document.querySelectorAll("[data-conf]").forEach(button=>button.addEventListener("click",()=>selectStandings(button.dataset.conf)));
 $("fixture-prev").addEventListener("click",()=>{state.index=Math.max(0,state.index-1);drawMatch();});
 $("fixture-next").addEventListener("click",()=>{state.index=Math.min(state.slides.length-1,state.index+1);drawMatch();});
}
async function init(){
 bind();
 const [t,r,s]=await Promise.allSettled([team(),loadResultsRows(),settings()]);
 if(r.status==="fulfilled"&&Array.isArray(r.value))state.rows=r.value;
 else console.warn("Risultati Arena non disponibili",r.reason);
 ["Conf A","Conf B","Unificata"].forEach(c=>state.standings[c]=table(c));
 const isRR=roundRobinStandingsActive();
 if(isRR)state.standings.Totale=table("Totale");
 configureStandingsTabs(isRR);
 buildSlides();identity();drawTicker();
 selectStandings(isRR?"Totale":state.team?.conf==="Conf B"?"Conf B":"Conf A");
 chooseView("league");
 setDemoMode(false); // Mai mostrare risultati inventati nella Home ufficiale.
 loadCupStatuses().catch(err=>console.warn("Anteprima coppe Arena:",err));
}
init();
