/*
 * Lega degli Eroi | proiezione provvisoria seeding playoff.
 * Nessuna scrittura DB. Gli spareggi non ancora determinabili vengono evidenziati.
 * Utilizza esclusivamente le giornate complete della regular season.
 */
import { normalizeTeam } from './bookmaker-engine.js';

const isFiniteNumber = value => value !== null && value !== '' && Number.isFinite(Number(value));
const pointsForResult = value => ({ W:3, D:1, L:0 })[String(value || '').toUpperCase()];

function validRow(row) {
  const gw = Number(row.gw);
  return String(row.phase || '').toLowerCase() === 'regular' &&
    Number.isInteger(gw) && gw>=1 && gw<=29 &&
    isFiniteNumber(row.points_for) &&
    pointsForResult(row.result) !== undefined &&
    normalizeTeam(row.team) && normalizeTeam(row.opponent);
}
function isCompletedRound(rows, teams) {
  const canonical = new Set(teams.map(t => normalizeTeam(t.name)));
  const map = new Map(rows.map(r=>[normalizeTeam(r.team),r]));
  if(map.size !== canonical.size || rows.length !== canonical.size || canonical.size !== 16) return false;
  if([...map.keys()].some(k=>!canonical.has(k))) return false;
  return rows.every(r => {
    const back=map.get(normalizeTeam(r.opponent));
    const a=pointsForResult(r.result), b=pointsForResult(back?.result);
    return back && normalizeTeam(back.opponent) === normalizeTeam(r.team) &&
      Number(r.points_for)>=0 && a!==undefined && b!==undefined &&
      ((a===3 && b===0)||(a===0 && b===3)||(a===1 && b===1));
  });
}

function groupHeadToHead(a,b,rows){
  const headToHead=rows.filter(r => normalizeTeam(r.team)===a.key && normalizeTeam(r.opponent)===b.key);
  const back=rows.filter(r => normalizeTeam(r.team)===b.key && normalizeTeam(r.opponent)===a.key);
  if(!headToHead.length || headToHead.length!==back.length) return null;
  const pa=headToHead.reduce((n,r)=>n+pointsForResult(r.result),0);
  const pb=back.reduce((n,r)=>n+pointsForResult(r.result),0);
  return Math.sign(pb-pa);
}

export function calculateProjectedStandings(teams,results){
  if(teams.length!==16) throw new Error('Per il tabellone servono tutte le 16 franchigie.');
  const grouped=new Map();
  for(const r of results){
    if(!validRow(r)) continue;
    const gw=Number(r.gw);
    if(!grouped.has(gw)) grouped.set(gw,[]);
    grouped.get(gw).push(r);
  }
  let lastCompleted=0;
  for(let gw=1;gw<=29;gw++){
    if(!isCompletedRound(grouped.get(gw)||[],teams)) break;
    lastCompleted=gw;
  }
  const accepted=[...grouped.entries()].filter(([gw])=>gw<=lastCompleted).flatMap(([,rows])=>rows);
  const byTeam=new Map(teams.map(t=>[normalizeTeam(t.name),{
    key:normalizeTeam(t.name),name:t.name,conference:t.conference,played:0,won:0,drawn:0,lost:0,points:0,fp:0
  }]));
  for(const r of accepted){
    const t=byTeam.get(normalizeTeam(r.team));
    if(!t) continue;
    const v=pointsForResult(r.result);
    t.played++;
    t.points+=v;
    t.fp+=Number(r.points_for);
    if(v===3)t.won++;else if(v===1)t.drawn++;else t.lost++;
  }
  const all=[...byTeam.values()];
  // Ordine secondario con confronti diretti SOLO quando sono disponibili.
  // Quando lo spareggio non si può stabilire, si ordina provvisoriamente per fantapunti.
  const tiedGroups=new Map();
  all.forEach(t=>{if(!tiedGroups.has(t.points))tiedGroups.set(t.points,[]);tiedGroups.get(t.points).push(t);});
  let unresolvedTies=false;
  const standings=[...tiedGroups.entries()].sort((a,b)=>b[0]-a[0]).flatMap(([,tied])=>{
    if(tied.length===1)return tied;
    // Per gruppi a 3+ e per confronti non ancora disputati non inventiamo una mini-classifica.
    if(tied.length!==2){unresolvedTies=true;return tied.sort((a,b)=>b.fp-a.fp||a.name.localeCompare(b.name,'it'));}
    const direct=groupHeadToHead(tied[0],tied[1],accepted);
    if(direct===null || direct===0){unresolvedTies=true;return tied.sort((a,b)=>b.fp-a.fp||a.name.localeCompare(b.name,'it'));}
    return tied.sort((a,b)=>groupHeadToHead(a,b,accepted));
  });
  standings.forEach((row,index)=>{row.seed=index+1;row.fp=Math.round(row.fp*100)/100;});
  const fixtures=[[5,12],[6,11],[7,10],[8,9]].map(([a,b],index)=>({
    slot:index+1,home:standings[a-1],away:standings[b-1],seeds:[a,b],
    stage:'ottavi',virtual:true
  }));
  const pending=grouped.has(lastCompleted+1) && (grouped.get(lastCompleted+1)||[]).length>0;
  return {standings,fixtures,lastCompleted,pending,unresolvedTies,hasSufficientData:lastCompleted>0};
}
