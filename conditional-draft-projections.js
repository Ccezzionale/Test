import {supabase} from "./supabase.js";
import {loadResultsRows} from "./results-source.js";
import {buildTotalRankingFromStats,generaDraftDaCSV,loadFutureDraftPicks} from "./dinamico-draft.js?v=20261117-season-link";
import {TROPHY_COMPETITIONS} from "./conditional-trades-core.js";

/* Read-only overlay. Never updates the official Draft, rights or any future pick. */
const $=id=>document.getElementById(id);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const norm=x=>String(x||"").replace(/[👑🎖️💀]/g,"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase("it").replace(/\s+/g," ");
const state={teams:[],picks:[],rights:[],locks:[],trophies:[],finalStandings:[],rows:[],draft:null};
const team=id=>state.teams.find(t=>String(t.id)===String(id));
const name=id=>team(id)?.name||"Franchigia";
const pick=id=>state.picks.find(p=>String(p.id)===String(id));
const pickLabel=p=>p?"R"+p.round+" "+p.season+" · "+(p.original?.name||name(p.original_team_id)):"pick futura";
const pool=right=>state.locks.filter(x=>String(x.right_id)===String(right.id)&&x.is_locked).map(x=>pick(x.pick_id)).filter(Boolean);
function rankForTeam(scope,teamId){
  const t=team(teamId);if(!t)return null;
  const rows=state.rows.filter(r=>
    String(r.Phase||"")==="Regular"&&(
      scope==="round_robin"
        ?String(r.Conference)==="Unificata"
        :String(r.Conference)!=="Unificata"&&state.teams.some(x=>
          x.conference===t.conference&&norm(x.name)===norm(r.Team))
    ));
  if(!rows.length)return null;
  const ranking=buildTotalRankingFromStats(rows);
  const index=ranking.findIndex(r=>norm(r.squadra)===norm(t.name));
  return index>=0?{place:index+1,count:ranking.length}:null;
}
function draftPositionForPick(item){
  if(!item||!state.draft)return null;
  const draft=item.draft_name==="Draft Conference"?state.draft.league:state.draft.championship;
  const round=draft.find(x=>Number(x.Round)===Number(item.round));
  const cell=round?.Picks.find(x=>!x.bonus&&norm(x.originalTeam)===norm(item.original?.name||""));
  return cell?.pickNumber||null;
}
function chooseDraftCandidate(right,candidates){
  const ranked=candidates.map(p=>({p,n:draftPositionForPick(p)}));
  if(!ranked.length||ranked.some(row=>!Number.isInteger(row.n)))return {pick:null,status:"pending",reason:"Ordine Draft provvisorio non disponibile."};
  ranked.sort((a,b)=>a.n-b.n);
  const chosen=right.rule_spec?.which==="best"?ranked[0]:ranked[ranked.length-1];
  return {pick:chosen.p,status:"provisional",reason:"Pick #"+chosen.n+" se il Draft finisse oggi"};
}
function chooseStandingCandidate(right,candidates){
  const rule=right.rule_spec||{},scope=rule.scope;
  const official=state.finalStandings.find(x=>x.season===right.season&&x.scope===scope&&String(x.team_id)===String(rule.subject_team_id)&&x.is_final);
  const data=official?{place:official.position,count:scope==="round_robin"?state.teams.length:state.teams.filter(t=>t.conference===team(rule.subject_team_id)?.conference).length}:rankForTeam(scope,rule.subject_team_id);
  if(!data)return {pick:null,status:"pending",reason:"Classifica non ancora disponibile"};
  const pos=Number(data.place),count=Number(data.count),top=Number(rule.top_count),bottom=Number(rule.bottom_count);
  const pickId=pos<=top?rule.top_pick_id:pos>count-bottom?rule.bottom_pick_id:rule.middle_pick_id;
  return {pick:candidates.find(p=>String(p.id)===String(pickId))||null,
    status:official?"final":"provisional",
    reason:name(rule.subject_team_id)+" "+pos+"° su "+count+" ("+(scope==="conference"?"Conference":"Round Robin")+")"};
}
function chooseTrophyCandidate(right,candidates){
  const rule=right.rule_spec||{};
  const results=state.trophies.filter(x=>x.season===right.season);
  let won=null;
  if(rule.mode==="specific_trophy"){
    const result=results.find(x=>x.competition_id===rule.competition_id);
    if(result?.status==="final")won=String(result.winner_team_id)===String(rule.subject_team_id);
  }else{
    const choices=rule.eligible_competition_ids||[];
    const winners=results.filter(x=>choices.includes(x.competition_id)&&x.status==="final");
    if(winners.some(x=>String(x.winner_team_id)===String(rule.subject_team_id)))won=true;
    else if(choices.length&&winners.length===choices.length)won=false;
  }
  if(won===null)return {pick:null,status:"pending",reason:"In attesa dell'esito ufficiale dei trofei"};
  const target=won?rule.won_pick_id:rule.not_won_pick_id;
  return {pick:candidates.find(p=>String(p.id)===String(target))||null,
    status:"final",reason:won?"Trofeo conquistato":"Nessun trofeo conquistato per la clausola"};
}
function projection(right){
  const candidates=pool(right);
  if(!candidates.length)return {pick:null,status:"pending",reason:"Pick candidate non disponibili"};
  if(right.rule_kind==="ranked")return chooseDraftCandidate(right,candidates);
  if(right.rule_kind==="standing")return chooseStandingCandidate(right,candidates);
  if(right.rule_kind==="trophy")return chooseTrophyCandidate(right,candidates);
  return {pick:null,status:"pending",reason:"Tipo di clausola sconosciuto"};
}
function title(right){
  const r=right.rule_spec||{};
  if(right.rule_kind==="ranked")return (r.which==="best"?"Migliore":"Peggiore")+" tra più pick";
  if(right.rule_kind==="standing")return "Classifica "+(r.scope==="conference"?"Conference":"Round Robin");
  if(right.rule_kind==="trophy"){
    const comp=TROPHY_COMPETITIONS.find(c=>c.id===r.competition_id);
    return r.mode==="specific_trophy"?"Vittoria "+(comp?.name||"trofeo"):"Vittoria di un trofeo qualsiasi";
  }
  return "Diritto condizionato";
}
function placeCards(rights){
  for(const conference of ["Draft Conference","Draft Championship"]){
    const container=$(conference==="Draft Conference"?"ctProjectionLeague":"ctProjectionChampionship");
    if(!container)continue;
    const entries=rights.filter(r=>r.draft_name===conference).map(r=>({...r,projection:projection(r),candidates:pool(r)}));
    container.hidden=!entries.length;
    if(!entries.length)continue;
    container.innerHTML='<div class="ct-draft-title"><strong>🔐 Trade condizionate · Proiezione</strong><small>I diritti NON sono ancora assegnazioni definitive</small></div>'+
      entries.map(({projection:p,...r})=>{
        const badge=p.status==="final"?"Esito definitivo":p.status==="provisional"?"Provvisoria":"In attesa";
        return '<article class="ct-draft-projection"><div class="ct-draft-projection-head"><strong>'+esc(title(r))+'</strong><span>'+esc(badge)+'</span></div>'+
          '<p>'+esc(name(r.grantor_team_id))+' → '+esc(name(r.holder_team_id))+'</p>'+
          '<p>'+esc(p.reason)+'</p>'+
          (p.pick?'<div class="ct-draft-pick-result">Se finisse oggi: <strong>'+esc(pickLabel(p.pick))+'</strong> a '+esc(name(r.holder_team_id))+'</div>':
            '<div class="ct-draft-pick-result">Le '+r.candidates.length+' pick candidate restano vincolate.</div>')+
          '<details><summary>Mostra pick candidate</summary><p>'+r.candidates.map(p=>esc(pickLabel(p))).join(" · ")+'</p></details>'+
          '</article>';
      }).join("");
    markProjectedPicks(conference,entries);
  }
}
function markProjectedPicks(conference,entries){
  const short=conference==="Draft Conference"?"league":"championship";
  const chosen=new Map(),lockedPicks=new Set();
  for(const r of entries){
    for(const p of r.candidates){
      const n=draftPositionForPick(p);if(n)lockedPicks.add(Number(n));
    }
    const projection=r.projection;
    const n=draftPositionForPick(projection.pick);
    if(n)chosen.set(Number(n),name(r.holder_team_id));
  }
  const selectors=[
    "#draft-"+short+" .pick",
    "#draft-pick-sequence-"+short+" .draft-pick-board-cell"
  ];
  const apply=()=>{
    for(const node of document.querySelectorAll(selectors.join(","))){
      const raw=node.querySelector(".pick-bubble,.draft-pick-board-number")?.textContent||"";
      const n=Number(raw.replace(/[^0-9]/g,""));if(!n)continue;
      node.classList.toggle("ct-draft-locked",lockedPicks.has(n));
      node.classList.toggle("ct-draft-projected",chosen.has(n));
      if(chosen.has(n))node.title="🔐 Proiezione condizionata: "+chosen.get(n)+" (NON definitiva)";
      else if(lockedPicks.has(n))node.title="🔐 Pick candidata vincolata a un diritto condizionato";
    }
  };
  apply();
  const parent=$(short==="league"?"league-panel":"championship-panel");
  if(parent){
    const observer=new MutationObserver(apply);
    observer.observe(parent,{subtree:true,childList:true});
  }
}
async function init(){
  try{
    const [stats,future,rightRes,lockRes,teamRes,trophyRes,standRes]=await Promise.all([
      loadResultsRows(),loadFutureDraftPicks(),
      supabase.from("conditional_trade_rights").select("*").eq("status","active").order("created_at"),
      supabase.from("conditional_trade_candidates").select("right_id,pick_id,is_locked").eq("is_locked",true),
      supabase.from("teams").select("id,name,conference"),
      supabase.from("conditional_official_trophies").select("*"),
      supabase.from("conditional_official_standings").select("*").eq("is_final",true)
    ]);
    for(const x of [rightRes,lockRes,teamRes,trophyRes,standRes])if(x.error)throw x.error;
    if(!rightRes.data?.length)return;
    Object.assign(state,{rows:stats,picks:future,rights:rightRes.data,locks:lockRes.data||[],
      teams:teamRes.data||[],trophies:trophyRes.data||[],finalStandings:standRes.data||[]});
    state.draft=generaDraftDaCSV(stats,future);
    placeCards(state.rights);
  }catch(error){console.warn("Proiezione trade condizionate non disponibile:",error?.message||error);}
}
document.addEventListener("DOMContentLoaded",init);
