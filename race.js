import { supabase } from './supabase.js';
import { loadResultsRows } from './results-source.js';

const PLAYOFF_CUTOFF = 8;
const NEXT_GAMES = 4;

const TEAM_ALIASES = {
  "wildboys 78": "Wildboys78",
  "wildboys78": "Wildboys78",
  "pokermantra": "PokerMantra",
  "minnesota snakes": "MinneSota Snakes"
};

function clean(value){ return String(value ?? '').trim().replace(/\s+/g,' '); }
function key(value){ return clean(value).toLowerCase(); }
function canonical(name){ return TEAM_ALIASES[key(name)] || clean(name); }
function num(value){
  if (value === null || value === undefined || value === '') return NaN;
  const n = Number(String(value).replace(',','.'));
  return Number.isFinite(n) ? n : NaN;
}
function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
}
function goal(points){
  const p = num(points);
  if (!Number.isFinite(p) || p < 66) return 0;
  return 1 + Math.floor((p - 66) / 6);
}
function resultCode(row){
  const explicit = clean(row.Result).toUpperCase();
  if (['W','D','L'].includes(explicit)) return explicit;
  const gf = goal(row.PointsFor), ga = goal(row.PointsAgainst);
  return gf > ga ? 'W' : gf < ga ? 'L' : 'D';
}
function played(row){
  return Number.isFinite(num(row.PointsFor)) &&
         Number.isFinite(num(row.PointsAgainst)) &&
         !(num(row.PointsFor) === 0 && num(row.PointsAgainst) === 0);
}
function logoFor(team){
  return `img/${canonical(team)}.webp`;
}
function logoTag(team, cls=''){
  const safe = escapeHtml(canonical(team));
  return `<img class="${cls}" src="${logoFor(team)}" alt="${safe}"
    onerror="if(!this.dataset.jpg){this.dataset.jpg=1;this.src='img/${safe}.jpg'}else{this.onerror=null;this.src='img/_placeholder.webp'}">`;
}

function buildStandings(rows){
  const table = new Map();
  rows.filter(played).forEach(row => {
    const team = canonical(row.Team);
    const k = key(team);
    if (!k) return;
    if (!table.has(k)){
      table.set(k,{team,g:0,w:0,d:0,l:0,pt:0,mp:0,gf:0,ga:0,rows:[]});
    }
    const rec = table.get(k);
    const r = resultCode(row);
    const gf = goal(row.PointsFor), ga = goal(row.PointsAgainst);
    rec.g++;
    rec.mp += num(row.PointsFor) || 0;
    rec.gf += gf; rec.ga += ga;
    rec.rows.push(row);
    if (r === 'W'){ rec.w++; rec.pt += 3; }
    else if (r === 'D'){ rec.d++; rec.pt += 1; }
    else rec.l++;
  });
  return [...table.values()].sort((a,b) =>
    b.pt-a.pt || b.mp-a.mp || b.gf-a.gf || a.ga-b.ga || a.team.localeCompare(b.team)
  );
}

function conferenceRows(rows, code){
  return rows.filter(r => clean(r.Conference) === code && played(r));
}
function maxPlayedGw(rows, code){
  const gws = conferenceRows(rows,code).map(r => Number(r.GW)||0);
  return gws.length ? Math.max(...gws) : 0;
}
function teamForm(rec, count=4){
  return [...rec.rows]
    .sort((a,b)=>(Number(a.GW_Stagionale)||Number(a.GW)||0)-(Number(b.GW_Stagionale)||Number(b.GW)||0))
    .slice(-count).map(resultCode);
}

/* -------- POWER RANKING: stessa formula di statistiche.js -------- */
function groupBy(arr, prop){
  const m = new Map();
  for (const item of arr){
    const k = item[prop];
    if (!m.has(k)) m.set(k,[]);
    m.get(k).push(item);
  }
  return m;
}
function lastN(a,n){ return a.slice(Math.max(0,a.length-n)); }
function mean(ns){ const v=ns.filter(Number.isFinite); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : 0; }
function stdDev(ns){ const v=ns.filter(Number.isFinite); if(v.length<=1) return 0; const m=mean(v); return Math.sqrt(mean(v.map(x=>(x-m)*(x-m)))); }
function normalize(vals){
  const f=vals.filter(Number.isFinite);
  if(!f.length) return vals.map(()=>0);
  const min=Math.min(...f), max=Math.max(...f);
  if(max===min) return vals.map(v=>Number.isFinite(v)?50:0);
  return vals.map(v=>Number.isFinite(v)?((v-min)/(max-min))*100:0);
}
function powerLeaguePoints(row){
  const gf=goal(row.PointsFor), ga=goal(row.PointsAgainst);
  return gf>ga?3:(gf===ga?1:0);
}
function computePower(rows){
  const cleanRows = rows.filter(played).map(r=>({
    GW:Number(r.GW_Stagionale||r.GW)||null,
    Team:canonical(r.Team),
    TeamKey:key(r.Team),
    PointsFor:num(r.PointsFor),
    PointsAgainst:num(r.PointsAgainst)
  })).filter(r=>r.GW && Number.isFinite(r.PointsFor) && Number.isFinite(r.PointsAgainst));

  const seen=new Set(), clean=[];
  for(const r of cleanRows){
    const k=`${r.TeamKey}|${r.GW}`;
    if(!seen.has(k)){ seen.add(k); clean.push(r); }
  }
  if(!clean.length) return {ranked:[],maxGW:0};

  const byTeam=groupBy(clean,'TeamKey');
  const teams=[...byTeam.keys()].filter(Boolean);
  const labelByKey=new Map();
  clean.forEach(r=>{ if(!labelByKey.has(r.TeamKey)) labelByKey.set(r.TeamKey,r.Team); });
  const maxGW=Math.max(...clean.map(r=>r.GW||0));

  function weightsForGW(gw){
    if(gw<=2) return {forma:.80,media:.20,momentum:0,cons:0};
    if(gw<=4) return {forma:.70,media:.20,momentum:.10,cons:0};
    return {forma:.65,media:.20,momentum:.10,cons:.05};
  }
  function weightedRecent(points){
    const recent=lastN(points,5);
    if(!recent.length) return 0;
    const weights=recent.map((_,i)=>i+1);
    const total=weights.reduce((a,b)=>a+b,0);
    return recent.reduce((sum,v,i)=>sum+v*weights[i],0)/total;
  }
  function momentumRaw(points){
    const n=points.length;
    if(n<3) return 0;
    if(n===3) return mean(points.slice(-2))-points[0];
    if(n===4) return mean(points.slice(-2))-mean(points.slice(0,2));
    const recent=points.slice(-3);
    const previous=points.slice(Math.max(0,n-6),n-3);
    return mean(recent)-mean(previous);
  }
  function reliabilityRaw(points){
    const recent=lastN(points,5);
    if(!recent.length) return 0;
    return weightedRecent(points)-(1.2*stdDev(recent));
  }

  const w=weightsForGW(maxGW);
  const items=[];
  for(const team of teams){
    const series=byTeam.get(team).filter(r=>r.GW<=maxGW).sort((a,b)=>a.GW-b.GW);
    const fp=series.map(s=>s.PointsFor);
    const lp=series.map(powerLeaguePoints);
    if(!fp.length) continue;
    items.push({
      team,games:fp.length,
      recentRaw:weightedRecent(lp),
      seasonRaw:mean(fp),
      momentumRaw:momentumRaw(fp),
      consRaw:reliabilityRaw(fp)
    });
  }
  const nF=normalize(items.map(x=>x.recentRaw));
  const nM=normalize(items.map(x=>x.seasonRaw));
  const nMo=normalize(items.map(x=>x.momentumRaw));
  const nC=normalize(items.map(x=>x.consRaw));
  const ranked=items.map((x,i)=>({
    teamKey:x.team,
    team:labelByKey.get(x.team)||x.team,
    score:w.forma*nF[i]+w.media*nM[i]+w.momentum*nMo[i]+w.cons*nC[i]
  })).sort((a,b)=>b.score-a.score).map((x,i)=>({...x,rank:i+1}));
  return {ranked,maxGW};
}
function powerMap(rows){
  return new Map(computePower(rows).ranked.map(r=>[key(r.team),r]));
}
function difficultyFromScore(score){
  const n=Number.isFinite(score)?score:50;
  return Math.max(1,Math.min(5,1+(n/100)*4));
}
function difficultyClass(value){
  if(value>=3.75) return 'hard';
  if(value<=2.55) return 'easy';
  return 'medium';
}

/* -------- FIXTURES -------- */
async function loadFixtures(){
  const {data,error}=await supabase
    .from('fantacalcio_fixtures')
    .select('conference, phase, gw, home_team, away_team, match_date')
    .order('conference',{ascending:true})
    .order('gw',{ascending:true});
  if(error) throw error;
  return Array.isArray(data)?data:[];
}
function teamFixtures(fixtures,conference,team,afterGw,limit=NEXT_GAMES){
  const tk=key(team);
  return fixtures
    .filter(f=>clean(f.conference)===conference && Number(f.gw)>afterGw &&
      (key(f.home_team)===tk || key(f.away_team)===tk))
    .sort((a,b)=>Number(a.gw)-Number(b.gw))
    .slice(0,limit)
    .map(f=>({
      ...f,
      opponent:key(f.home_team)===tk?canonical(f.away_team):canonical(f.home_team)
    }));
}
function scheduleData(fixtures,conference,team,afterGw,powers,limit=NEXT_GAMES){
  const items=teamFixtures(fixtures,conference,team,afterGw,limit).map(f=>{
    const pr=powers.get(key(f.opponent));
    const diff=difficultyFromScore(pr?.score);
    return {...f,diff,prRank:pr?.rank||null,prScore:pr?.score??50};
  });
  const avg=items.length?items.reduce((s,x)=>s+x.diff,0)/items.length:null;
  return {items,avg};
}
function fixtureChip(f){
  const cls=difficultyClass(f.diff);
  return `<div class="fixture-chip ${cls}" title="GW${f.gw} · ${escapeHtml(f.opponent)} · difficoltà ${f.diff.toFixed(1)}/5">
    ${logoTag(f.opponent)}
    <small>G${Number(f.gw)}</small>
  </div>`;
}
function emptyChip(){
  return `<div class="fixture-chip none"><span>—</span><small>TBD</small></div>`;
}

function contenderMarkup(rec,index,leaderPts,fixtures,conference,lastGw,powers){
  const gap=leaderPts-rec.pt;
  const form=teamForm(rec);
  const schedule=scheduleData(fixtures,conference,rec.team,lastGw,powers);
  const chips=[...schedule.items.map(fixtureChip)];
  while(chips.length<NEXT_GAMES) chips.push(emptyChip());
  const road=schedule.avg;
  const roadCls=road==null?'':difficultyClass(road);
  return `<div class="contender-card ${index===0?'is-leader':''}">
    <div class="contender-rank">${index+1}</div>
    ${logoTag(rec.team,'team-logo')}
    <div class="contender-main">
      <strong>${escapeHtml(rec.team)}</strong>
      <div class="contender-meta">
        <span>${rec.pt} PT</span>
        <span class="gap-pill ${gap===0?'leader':''}">${gap===0?'LEADER':`-${gap} PT`}</span>
        <span class="form-dots">${form.map(r=>`<i class="form-dot ${r}">${r}</i>`).join('')}</span>
      </div>
    </div>
    <div class="schedule-strip">${chips.join('')}</div>
    <div class="road-score ${roadCls}">
      <strong>${road==null?'—':road.toFixed(1)}</strong>
      <span>Road / 5</span>
    </div>
  </div>`;
}

function renderConference(code,hostId,leaderId,rows,fixtures,powers){
  const standings=buildStandings(conferenceRows(rows,code));
  const top=standings.slice(0,4);
  const host=document.getElementById(hostId);
  const leaderEl=document.getElementById(leaderId);
  if(!host) return {standings,top,lastGw:maxPlayedGw(rows,code),road:[]};
  if(!top.length){
    host.innerHTML='<div class="race-state-card">Classifica in attesa dei primi risultati.</div>';
    return {standings,top,lastGw:0,road:[]};
  }
  const lastGw=maxPlayedGw(rows,code);
  const leaderPts=top[0].pt;
  host.innerHTML=top.map((r,i)=>contenderMarkup(r,i,leaderPts,fixtures,code,lastGw,powers)).join('');
  if(leaderEl) leaderEl.textContent=`Leader: ${top[0].team} · ${top[0].pt} pt`;
  const road=top.map((r,i)=>{
    const s=scheduleData(fixtures,code,r.team,lastGw,powers);
    return {team:r.team,position:i+1,avg:s.avg,items:s.items};
  });
  return {standings,top,lastGw,road};
}
function roadCard(item,conferenceLabel){
  const value=item.avg;
  const width=value==null?0:((value-1)/4)*100;
  return `<article class="road-card">
    <div class="road-card-head">
      ${logoTag(item.team)}
      <div><strong>${escapeHtml(item.team)}</strong><div class="gap-pill">${conferenceLabel}</div></div>
    </div>
    <div class="road-card-score">
      <strong>${value==null?'—':value.toFixed(1)}</strong>
      <span>${value==null?'Calendario incompleto':'difficoltà / 5'}</span>
    </div>
    <div class="road-meter"><i style="width:${Math.max(0,Math.min(100,width))}%"></i></div>
  </article>`;
}
function renderRoadSummary(a,b){
  const all=[
    ...a.road.map(x=>({...x,conference:'Conf. League'})),
    ...b.road.map(x=>({...x,conference:'Championship'}))
  ].sort((x,y)=>(y.avg??-1)-(x.avg??-1));
  const host=document.getElementById('road-ranking');
  if(host) host.innerHTML=all.map(x=>roadCard(x,x.conference)).join('');
}

/* -------- ROUND ROBIN -------- */
function buildTotalStandings(rows){ return buildStandings(rows.filter(played)); }
function renderOverallRace(rows){
  const standings=buildTotalStandings(rows);
  const host=document.getElementById('overall-race');
  if(!host) return standings;
  const cutoffPts=standings[PLAYOFF_CUTOFF-1]?.pt ?? 0;
  host.innerHTML=standings.map((r,i)=>{
    const diff=r.pt-cutoffPts;
    const gap=i<PLAYOFF_CUTOFF ? `${diff>=0?'+':''}${diff} vs cut` : `${diff} vs cut`;
    return `<div class="overall-row ${i===PLAYOFF_CUTOFF-1?'cutoff':''}">
      <b>${i+1}</b>${logoTag(r.team)}<strong>${escapeHtml(r.team)}</strong>
      <span class="pts">${r.pt} PT</span><span class="gap">${gap}</span>
    </div>`;
  }).join('');
  return standings;
}
function renderBubble(standings){
  const host=document.getElementById('bubble-watch');
  if(!host) return;
  const start=Math.max(0,PLAYOFF_CUTOFF-3);
  const end=Math.min(standings.length,PLAYOFF_CUTOFF+2);
  const cutoffPts=standings[PLAYOFF_CUTOFF-1]?.pt??0;
  host.innerHTML=standings.slice(start,end).map((r,offset)=>{
    const pos=start+offset+1;
    const inside=pos<=PLAYOFF_CUTOFF;
    const delta=r.pt-cutoffPts;
    return `<div class="bubble-item ${inside?'in':'out'}">
      ${logoTag(r.team)}
      <div><strong>${pos}° · ${escapeHtml(r.team)}</strong>
      <span>${r.pt} pt · ${inside?'dentro':'fuori'} · ${delta>=0?'+':''}${delta} dalla linea</span></div>
    </div>`;
  }).join('');
}
function renderRoundRobinRoad(standings,fixtures,rows,powers){
  const rrLast=maxPlayedGw(rows,'Unificata');
  const rrFixtures=fixtures.filter(f=>clean(f.conference)==='Unificata');
  const remainingGws=[...new Set(rrFixtures.map(f=>Number(f.gw)).filter(g=>g>rrLast))].sort((a,b)=>a-b);
  const limit=remainingGws.length<=4?Math.max(remainingGws.length,1):4;
  const title=document.getElementById('rr-schedule-title');
  if(title) title.textContent=remainingGws.length<=4?'Remaining Schedule':'Next 4';

  const bubble=standings.slice(Math.max(0,PLAYOFF_CUTOFF-4),Math.min(standings.length,PLAYOFF_CUTOFF+4));
  const data=bubble.map(r=>{
    const s=scheduleData(fixtures,'Unificata',r.team,rrLast,powers,limit);
    return {team:r.team,avg:s.avg,items:s.items};
  }).sort((a,b)=>(b.avg??-1)-(a.avg??-1));
  const host=document.getElementById('rr-road-ranking');
  if(host) host.innerHTML=data.map(x=>roadCard(x,'Playoff race')).join('');
  return remainingGws.length;
}

/* -------- PAGE STATE -------- */
function detectState(rows,fixtures){
  const hasRRFixtures=fixtures.some(f=>clean(f.conference)==='Unificata');
  const confA=maxPlayedGw(rows,'Conf A');
  const confB=maxPlayedGw(rows,'Conf B');
  const confComplete=confA>=14 && confB>=14;
  if(!confComplete) return 'conference';
  if(!hasRRFixtures) return 'transition';

  const rrFixtures=fixtures.filter(f=>clean(f.conference)==='Unificata');
  const rrMax=rrFixtures.length?Math.max(...rrFixtures.map(f=>Number(f.gw)||0)):0;
  const rrPlayed=maxPlayedGw(rows,'Unificata');
  if(rrMax>0 && rrPlayed>=rrMax) return 'finished';
  return 'round_robin';
}
function hideAll(){
  ['conference-view','transition-view','roundrobin-view','finished-view'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.hidden=true;
  });
}
function setHero(state,rows){
  const title=document.getElementById('race-title');
  const subtitle=document.getElementById('race-subtitle');
  const phase=document.getElementById('race-phase-pill');
  const week=document.getElementById('race-week-pill');
  const maxSeason=Math.max(0,...rows.filter(played).map(r=>Number(r.GW_Stagionale||r.GW)||0));

  if(state==='conference'){
    title.textContent='RACE TO #1';
    subtitle.textContent='Prima la vetta della Conference. Poi il resto del mondo.';
    phase.textContent='Conference Stage';
  } else if(state==='transition'){
    title.textContent='NEXT: ROUND ROBIN';
    subtitle.textContent='Le Conference sono chiuse. Il prossimo calendario decide la nuova corsa.';
    phase.textContent='Transition';
  } else if(state==='round_robin'){
    title.textContent='RACE TO PLAYOFFS';
    subtitle.textContent='Una sola classifica. Una sola linea. Nessun alibi.';
    phase.textContent='Round Robin';
  } else {
    title.textContent='PLAYOFF TIME';
    subtitle.textContent='La stagione regolare ha finito di fare calcoli.';
    phase.textContent='Playoff';
  }
  week.textContent=maxSeason?`GW ${maxSeason}`:'GW --';
}
function renderTransition(rows){
  const a=buildStandings(conferenceRows(rows,'Conf A'))[0];
  const b=buildStandings(conferenceRows(rows,'Conf B'))[0];
  const host=document.getElementById('conference-winners');
  if(!host) return;
  host.innerHTML=[
    ['Conference League',a],['Conference Championship',b]
  ].map(([label,r])=>r?`<div class="winner-card">${logoTag(r.team)}<span>${label}</span><strong>${escapeHtml(r.team)} · ${r.pt} PT</strong></div>`:'').join('');
}
function setVisible(id){
  hideAll();
  const el=document.getElementById(id); if(el) el.hidden=false;
}
async function initRace(){
  const loading=document.getElementById('race-loading');
  const errorBox=document.getElementById('race-error');
  try{
    const [rows,fixtures]=await Promise.all([loadResultsRows(),loadFixtures()]);
    const powers=powerMap(rows);
    const state=detectState(rows,fixtures);
    setHero(state,rows);

    if(state==='conference'){
      setVisible('conference-view');
      const a=renderConference('Conf A','race-conf-a','leader-a',rows,fixtures,powers);
      const b=renderConference('Conf B','race-conf-b','leader-b',rows,fixtures,powers);
      renderRoadSummary(a,b);
    }else if(state==='transition'){
      setVisible('transition-view');
      renderTransition(rows);
    }else if(state==='round_robin'){
      setVisible('roundrobin-view');
      const standings=renderOverallRace(rows);
      renderBubble(standings);
      const remaining=renderRoundRobinRoad(standings,fixtures,rows,powers);
      if(remaining<=4){
        const h=document.getElementById('rr-heading');
        const p=document.getElementById('rr-copy');
        if(h) h.textContent='Final Playoff Push';
        if(p) p.textContent='Ogni punto pesa doppio. Il calendario rimasto è tutto qui.';
      }
    }else{
      setVisible('finished-view');
    }

    if(loading) loading.hidden=true;
    if(errorBox) errorBox.hidden=true;
  }catch(error){
    console.error('Errore Race to Playoffs:',error);
    if(loading) loading.hidden=true;
    if(errorBox){
      errorBox.hidden=false;
      errorBox.innerHTML=`<div><strong>Race non disponibile</strong><span>${escapeHtml(error.message||String(error))}</span></div>`;
    }
  }
}
document.addEventListener('DOMContentLoaded',initRace);
