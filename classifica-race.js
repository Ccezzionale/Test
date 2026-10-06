import { supabase } from './supabase.js';
import { loadResultsRows } from './results-source.js';

const PLAYOFF_CUTOFF = 8;
const NEXT_GAMES = 4;

const TEAM_ALIASES = {
  "wildboys 78": "Wildboys78",
  "wildboys78": "Wildboys78",
  "pokermantra": "PokerMantra",
  "riverfilo": "Riverfilo",
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
function shortTeamName(team){
  const parts=canonical(team).split(/\s+/).filter(Boolean);
  if(parts.length===1) return parts[0].slice(0,4).toUpperCase();
  return parts.map(p=>p[0]).join('').slice(0,4).toUpperCase();
}
function fixtureChip(f){
  const cls=difficultyClass(f.diff);
  return `<div class="fixture-chip ${cls}" title="GW${f.gw} · ${escapeHtml(f.opponent)} · difficoltà ${f.diff.toFixed(1)}/5">
    <b>G${Number(f.gw)}</b>
    ${logoTag(f.opponent)}
    <small>${escapeHtml(shortTeamName(f.opponent))}</small>
  </div>`;
}
function emptyChip(){
  return `<div class="fixture-chip none"><b>—</b><span>?</span><small>TBD</small></div>`;
}


/* -------- CONFERENCE WIN % --------
   Stima Monte Carlo deterministica:
   - punti attuali
   - calendario residuo
   - forza futura = 80% rendimento Conference + 20% Power Ranking
   - alta varianza tipica del fantacalcio
   Nessun vantaggio casa/trasferta.
   In caso di parità finale il credito titolo viene diviso tra le squadre a pari punti.
*/
function hashSeed(text){
  let h=2166136261 >>> 0;
  for(let i=0;i<text.length;i++){
    h ^= text.charCodeAt(i);
    h = Math.imul(h,16777619);
  }
  return h >>> 0;
}
function seededRandom(seed){
  let a=seed>>>0;
  return function(){
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function matchProbabilities(scoreA,scoreB){
  const a=Number.isFinite(scoreA)?scoreA:50;
  const b=Number.isFinite(scoreB)?scoreB:50;
  const delta=Math.max(-50,Math.min(50,a-b));

  /*
    Alta varianza: il rating composito (80% Conference, 20% PR)
    deve creare un vantaggio, non una sentenza.
  */
  const pDraw=Math.max(.23,Math.min(.27,.25-Math.abs(delta)*.00025));
  const decisive=1-pDraw;

  // Massimo spostamento circa +/- 9 punti percentuali sulla vittoria.
  const shift=Math.max(-.09,Math.min(.09,delta*.0018));
  const pA=Math.max(.285,Math.min(.465,decisive/2+shift));
  const pB=1-pDraw-pA;

  return {pA,pDraw,pB};
}

function conferenceStrengthMap(rows,code,powers){
  const standings=buildStandings(conferenceRows(rows,code));
  const map=new Map();

  standings.forEach(rec=>{
    const games=Math.max(1,Number(rec.g)||0);
    const maxPoints=games*3;

    // Rendimento reale in Conference: 0-100 sulla percentuale dei punti conquistati.
    const tableScore=maxPoints>0 ? (rec.pt/maxPoints)*100 : 50;

    // Power Ranking corrente: 0-100.
    const powerScore=powers.get(key(rec.team))?.score ?? 50;

    // Peso deciso per la Race: classifica molto più importante del PR.
    const strength=tableScore*.80 + powerScore*.20;

    map.set(key(rec.team),{
      tableScore,
      powerScore,
      strength
    });
  });

  return map;
}

function conferenceTitleOdds(rows,fixtures,code,powers,iterations=12000){
  const standings=buildStandings(conferenceRows(rows,code));
  const strengthMap=conferenceStrengthMap(rows,code,powers);
  const lastGw=maxPlayedGw(rows,code);
  const remaining=fixtures
    .filter(f=>clean(f.conference)===code && Number(f.gw)>lastGw)
    .sort((a,b)=>Number(a.gw)-Number(b.gw));

  const teams=new Map();
  standings.forEach(r=>teams.set(key(r.team),{team:r.team,pt:r.pt}));

  remaining.forEach(f=>{
    [canonical(f.home_team),canonical(f.away_team)].forEach(team=>{
      const k=key(team);
      if(!teams.has(k)) teams.set(k,{team,pt:0});
    });
  });

  const teamList=[...teams.values()];
  if(!teamList.length) return new Map();

  const wins=new Map(teamList.map(t=>[key(t.team),0]));

  const seedText=[
    code,lastGw,remaining.length,
    ...teamList.map(t=>`${key(t.team)}:${t.pt}`),
    ...teamList.map(t=>`${key(t.team)}:${(strengthMap.get(key(t.team))?.strength??50).toFixed(3)}`)
  ].join('|');

  const rand=seededRandom(hashSeed(seedText));

  for(let sim=0;sim<iterations;sim++){
    const pts=new Map(teamList.map(t=>[key(t.team),t.pt]));

    for(const f of remaining){
      const home=canonical(f.home_team);
      const away=canonical(f.away_team);
      const hk=key(home), ak=key(away);
      const hp=strengthMap.get(hk)?.strength ?? 50;
      const ap=strengthMap.get(ak)?.strength ?? 50;
      const {pA,pDraw}=matchProbabilities(hp,ap);
      const r=rand();

      if(r<pA){
        pts.set(hk,(pts.get(hk)||0)+3);
      }else if(r<pA+pDraw){
        pts.set(hk,(pts.get(hk)||0)+1);
        pts.set(ak,(pts.get(ak)||0)+1);
      }else{
        pts.set(ak,(pts.get(ak)||0)+3);
      }
    }

    const maxPts=Math.max(...pts.values());
    const tied=[...pts.entries()].filter(([,pt])=>pt===maxPts).map(([k])=>k);
    const credit=1/tied.length;
    tied.forEach(k=>wins.set(k,(wins.get(k)||0)+credit));
  }

  return new Map(
    [...wins.entries()].map(([k,w])=>[k,(w/iterations)*100])
  );
}

function winChanceMarkup(value){
  const pct=Math.max(0,Math.min(100,Number(value)||0));
  let cls='mid';
  if(pct>=45) cls='high';
  else if(pct<15) cls='low';
  return `<span class="win-chance ${cls}" title="Probabilità stimata di vincere la Conference: 80% rendimento in Conference, 20% Power Ranking, più punti attuali e calendario residuo">
    <b>${pct.toFixed(0)}%</b><small>WIN</small>
  </span>`;
}

function raceMomentumMarkup(delta,lastGw){
  if(lastGw<=1) return `<span class="race-momentum flat" title="Race Momentum">RACE =</span>`;
  if(delta>0) return `<span class="race-momentum up" title="Posizioni guadagnate rispetto alla GW precedente">RACE ↑${delta}</span>`;
  if(delta<0) return `<span class="race-momentum down" title="Posizioni perse rispetto alla GW precedente">RACE ↓${Math.abs(delta)}</span>`;
  return `<span class="race-momentum flat" title="Posizione invariata rispetto alla GW precedente">RACE =</span>`;
}

function contenderMarkup(rec,index,fixtures,conference,lastGw,powers,momentumDelta=0,winChance=0){
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
        <span class="standing-points">${rec.pt} PT</span>
        ${winChanceMarkup(winChance)}
        ${raceMomentumMarkup(momentumDelta,lastGw)}
        <span class="form-dots">${form.map(r=>`<i class="form-dot ${r}">${r}</i>`).join('')}</span>
      </div>
    </div>
    <div class="next-block">
      <span class="next-label">NEXT 4</span>
      <div class="schedule-strip">${chips.join('')}</div>
    </div>
    <div class="road-score ${roadCls}">
      <strong>${road==null?'—':road.toFixed(1)}</strong>
      <span>Road / 5</span>
    </div>
  </div>`;
}

function standingsThroughGw(rows,code,upToGw){
  return buildStandings(
    conferenceRows(rows,code).filter(r => Number(r.GW||0) <= upToGw)
  );
}

function nextConferenceGws(fixtures,code,lastGw,count=NEXT_GAMES){
  return [...new Set(
    fixtures
      .filter(f=>clean(f.conference)===code && Number(f.gw)>lastGw)
      .map(f=>Number(f.gw))
      .filter(Boolean)
  )].sort((a,b)=>a-b).slice(0,count);
}

function directClashes(fixtures,code,top,lastGw){
  const topKeys=new Set(top.map(r=>key(r.team)));
  const gws=new Set(nextConferenceGws(fixtures,code,lastGw,NEXT_GAMES));
  const seen=new Set();
  return fixtures
    .filter(f=>
      clean(f.conference)===code &&
      gws.has(Number(f.gw)) &&
      topKeys.has(key(f.home_team)) &&
      topKeys.has(key(f.away_team))
    )
    .filter(f=>{
      const a=key(f.home_team), b=key(f.away_team);
      const k=`${Number(f.gw)}|${[a,b].sort().join('|')}`;
      if(seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a,b)=>Number(a.gw)-Number(b.gw));
}

function raceStatusText(top){
  if(top.length<2) return 'La corsa aspetta abbastanza dati per accendersi.';
  const gap=top[0].pt-top[1].pt;
  const spread=top[0].pt-(top[Math.min(3,top.length-1)]?.pt ?? top[0].pt);
  if(gap===0) return 'Vetta condivisa: qui nessuno ha ancora il diritto di rilassarsi.';
  if(spread<=3) return `Top 4 in ${spread} punti: Conference completamente aperta.`;
  if(gap>=6) return `${top[0].team} prova la fuga: +${gap} sulla prima inseguitrice.`;
  if(gap<=2) return `${top[1].team} è a ${gap} ${gap===1?'punto':'punti'}: leader sotto pressione.`;
  return `La vetta è a +${gap}, ma la corsa resta ancora viva.`;
}

function renderConferencePulse(code,pulseId,top,road,fixtures,lastGw){
  const host=document.getElementById(pulseId);
  if(!host || !top.length) return;

  const validRoad=road.filter(x=>x.avg!=null).sort((a,b)=>b.avg-a.avg);
  const hardest=validRoad[0];
  const easiest=validRoad[validRoad.length-1];
  const closest=top[1];
  const gap=closest ? top[0].pt-closest.pt : null;
  const clashes=directClashes(fixtures,code,top,lastGw);

  const clashesMarkup=clashes.length
    ? clashes.map(f=>`
      <div class="direct-clash-row">
        <span class="direct-clash-gw">G${Number(f.gw)}</span>
        <div class="direct-clash-team">${logoTag(f.home_team)}<strong>${escapeHtml(canonical(f.home_team))}</strong></div>
        <b>VS</b>
        <div class="direct-clash-team away">${logoTag(f.away_team)}<strong>${escapeHtml(canonical(f.away_team))}</strong></div>
      </div>`).join('')
    : `<div class="direct-clash-empty">Nessuno scontro diretto tra le Top 4 nelle prossime quattro giornate.</div>`;

  host.innerHTML=`
    <div class="pulse-head">
      <div>
        <span>CONFERENCE PULSE</span>
        <strong>${escapeHtml(raceStatusText(top))}</strong>
      </div>
    </div>
    <div class="pulse-stats">
      <div class="pulse-stat">
        <span>CLOSEST CHASE</span>
        <strong>${closest?escapeHtml(closest.team):'—'}</strong>
        <small>${closest?(gap===0?'a pari punti':`-${gap} PT`):'—'}</small>
      </div>
      <div class="pulse-stat hard">
        <span>HARDEST ROAD</span>
        <strong>${hardest?escapeHtml(hardest.team):'—'}</strong>
        <small>${hardest?`${hardest.avg.toFixed(1)} / 5`:'—'}</small>
      </div>
      <div class="pulse-stat easy">
        <span>EASIEST ROAD</span>
        <strong>${easiest?escapeHtml(easiest.team):'—'}</strong>
        <small>${easiest?`${easiest.avg.toFixed(1)} / 5`:'—'}</small>
      </div>
    </div>
    <div class="direct-clashes">
      <div class="direct-clashes-title">
        <span>DIRECT CLASHES</span>
        <small>Top 4 · prossime ${NEXT_GAMES}</small>
      </div>
      ${clashesMarkup}
    </div>`;
}

function renderConference(code,hostId,leaderId,pulseId,rows,fixtures,powers){
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
  const prevStandings=lastGw>1 ? standingsThroughGw(rows,code,lastGw-1) : [];
  const prevPos=new Map(prevStandings.map((r,i)=>[key(r.team),i+1]));
  const titleOdds=conferenceTitleOdds(rows,fixtures,code,powers);

  host.innerHTML=top.map((r,i)=>{
    const currentPos=i+1;
    const previous=prevPos.get(key(r.team)) ?? currentPos;
    const delta=previous-currentPos;
    const winChance=titleOdds.get(key(r.team)) ?? 0;
    return contenderMarkup(r,i,fixtures,code,lastGw,powers,delta,winChance);
  }).join('');

  if(leaderEl) leaderEl.textContent=`Leader: ${top[0].team} · ${top[0].pt} pt`;

  const road=top.map((r,i)=>{
    const s=scheduleData(fixtures,code,r.team,lastGw,powers);
    return {team:r.team,position:i+1,avg:s.avg,items:s.items};
  });

  renderConferencePulse(code,pulseId,top,road,fixtures,lastGw);
  return {standings,top,lastGw,road};
}
function conferenceRoadRow(item,index,total){
  const value=item.avg;
  const cls=difficultyClass(value);
  const isHard=index===0;
  const isEasy=index===total-1 && total>1;
  const badge=isHard
    ? '<span class="road-edge-badge hard">HARDEST</span>'
    : isEasy
      ? '<span class="road-edge-badge easy">EASIEST</span>'
      : '';
  const width=value==null?0:((value-1)/4)*100;

  return `<div class="conference-road-row ${cls}">
    <span class="conference-road-rank">${index+1}</span>
    ${logoTag(item.team)}
    <div class="conference-road-main">
      <strong>${escapeHtml(item.team)}</strong>
      ${badge}
      <div class="conference-road-meter"><i style="width:${Math.max(0,Math.min(100,width))}%"></i></div>
    </div>
    <div class="conference-road-score">
      <strong>${value==null?'—':value.toFixed(1)}</strong>
      <span>/ 5</span>
    </div>
  </div>`;
}

function conferenceRoadBlock(title,code,items){
  const valid=items.filter(x=>x.avg!=null).sort((a,b)=>b.avg-a.avg);
  if(!valid.length){
    return `<article class="conference-road-panel ${code==='Conf B'?'is-championship':''}">
      <header><span>${code}</span><h3>${title}</h3></header>
      <div class="conference-road-empty">Calendario non disponibile.</div>
    </article>`;
  }

  return `<article class="conference-road-panel ${code==='Conf B'?'is-championship':''}">
    <header>
      <div><span>${code}</span><h3>${title}</h3></div>
      <small>dal più duro al più favorevole</small>
    </header>
    <div class="conference-road-list">
      ${valid.map((item,i)=>conferenceRoadRow(item,i,valid.length)).join('')}
    </div>
  </article>`;
}

function renderRoadSummary(a,b){
  const host=document.getElementById('road-ranking');
  if(!host) return;
  host.innerHTML=`
    <div class="conference-road-grid">
      ${conferenceRoadBlock('Conference League','Conf A',a.road)}
      ${conferenceRoadBlock('Conference Championship','Conf B',b.road)}
    </div>`;
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


/* -------- MOBILE CONFERENCE SWITCHER -------- */
function setMobileConference(which){
  const selected=which==='championship'?'championship':'league';

  document.querySelectorAll('[data-mobile-conference]').forEach(btn=>{
    const active=btn.dataset.mobileConference===selected;
    btn.classList.toggle('active',active);
    btn.setAttribute('aria-selected',active?'true':'false');
  });

  document.querySelectorAll('[data-conference-panel]').forEach(panel=>{
    panel.classList.toggle('mobile-active',panel.dataset.conferencePanel===selected);
  });

  document.querySelectorAll('.conference-road-panel').forEach(panel=>{
    const isChamp=panel.classList.contains('is-championship');
    const panelKey=isChamp?'championship':'league';
    panel.classList.toggle('mobile-active',panelKey===selected);
  });
}

function initMobileConferenceTabs(){
  const tabs=[...document.querySelectorAll('[data-mobile-conference]')];
  if(!tabs.length) return;

  tabs.forEach(btn=>{
    btn.addEventListener('click',()=>{
      setMobileConference(btn.dataset.mobileConference);
    });
  });

  setMobileConference('league');
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
    if(title) title.textContent='RACE TO #1';
    if(subtitle) subtitle.textContent='Prima la vetta della Conference. Poi il resto del mondo.';
    if(phase) phase.textContent='Conference Stage';
  } else if(state==='transition'){
    if(title) title.textContent='NEXT: ROUND ROBIN';
    if(subtitle) subtitle.textContent='Le Conference sono chiuse. Il prossimo calendario decide la nuova corsa.';
    if(phase) phase.textContent='Transition';
  } else if(state==='round_robin'){
    if(title) title.textContent='RACE TO PLAYOFFS';
    if(subtitle) subtitle.textContent='Una sola classifica. Una sola linea. Nessun alibi.';
    if(phase) phase.textContent='Round Robin';
  } else {
    if(title) title.textContent='PLAYOFF TIME';
    if(subtitle) subtitle.textContent='La stagione regolare ha finito di fare calcoli.';
    if(phase) phase.textContent='Playoff';
  }
  if(week) week.textContent=maxSeason?`GW ${maxSeason}`:'GW --';
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
      const a=renderConference('Conf A','race-conf-a','leader-a','conference-pulse-a',rows,fixtures,powers);
      const b=renderConference('Conf B','race-conf-b','leader-b','conference-pulse-b',rows,fixtures,powers);
      renderRoadSummary(a,b);
      initMobileConferenceTabs();
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


/* =========================================================
   INTEGRAZIONE RACE NELLA PAGINA CLASSIFICHE
   Non modifica classifiche-auto.js: la nuova tab viene gestita qui.
   ========================================================= */
function setupClassificaRaceTab(){
  const switcher=document.querySelector('.switcher');
  const raceButton=switcher?.querySelector('[data-classifica-view="race"]');
  const normalContainer=document.getElementById('classifica-container');
  const racePanel=document.getElementById('race-tab-panel');
  const heroBanner=document.getElementById('heroBanner');

  if(!switcher || !raceButton || !normalContainer || !racePanel) return;

  const normalButtons=[...switcher.querySelectorAll('button')].filter(btn=>btn!==raceButton);

  const setRaceBanner=()=>{
    if(heroBanner){
      heroBanner.style.backgroundImage='url("img/banner-race.webp")';
      heroBanner.dataset.raceBanner='1';
    }
  };

  const clearRaceBanner=()=>{
    if(heroBanner?.dataset.raceBanner==='1'){
      heroBanner.style.backgroundImage='';
      delete heroBanner.dataset.raceBanner;
    }
  };

  const activateRace=({updateHash=true}={})=>{
    normalButtons.forEach(btn=>btn.classList.remove('active'));
    raceButton.classList.add('active');

    normalContainer.hidden=true;
    racePanel.hidden=false;
    document.querySelector('.classifica-card')?.classList.add('race-mode');

    setRaceBanner();

    if(updateHash && location.hash!=='#race'){
      history.replaceState(null,'',`${location.pathname}${location.search}#race`);
    }

    window.requestAnimationFrame(()=>{
      racePanel.scrollLeft=0;
    });
  };

  const deactivateRace=()=>{
    if(racePanel.hidden) return;
    racePanel.hidden=true;
    normalContainer.hidden=false;
    raceButton.classList.remove('active');
    document.querySelector('.classifica-card')?.classList.remove('race-mode');
    clearRaceBanner();

    if(location.hash==='#race'){
      history.replaceState(null,'',`${location.pathname}${location.search}`);
    }
  };

  // Capture phase: impedisce a classifiche-auto.js di interpretare "Race"
  // come una quinta classifica inesistente.
  raceButton.addEventListener('click',(event)=>{
    event.preventDefault();
    event.stopImmediatePropagation();
    activateRace();
  },true);

  normalButtons.forEach(btn=>{
    btn.addEventListener('click',()=>{
      deactivateRace();
    },true);
  });

  window.addEventListener('hashchange',()=>{
    if(location.hash==='#race') activateRace({updateHash:false});
  });

  if(location.hash==='#race'){
    activateRace({updateHash:false});
  }
}

document.addEventListener('DOMContentLoaded',setupClassificaRaceTab);
