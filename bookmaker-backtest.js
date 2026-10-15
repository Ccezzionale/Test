/* Playoffs Challenge V7 — Laboratorio statistico 1X2
 * In sola lettura: usa lo snapshot gia' caricato da playoffs-challenge-live.js.
 * Test walk-forward: giornata t prevista esclusivamente usando GW < t.
 * Tutte le valutazioni sono out-of-sample sul 2026/27, non una promessa
 * di previsione futura. Sulle prime 14 GW rimuove +2 per simulare ottavi neutrali.
 */
import {buildModel, quoteMatch, normalizeTeam, goalsFromFantasyPoints,
  SIMULATOR_DEFAULT_WEIGHTS, validateSimulatorWeights} from './bookmaker-engine.js';

export const TEST_PRESETS = Object.freeze([
  {id:'original',label:'Motore originale V4',weights:null},
  {id:'default',label:'10 / 60 / 30 · Predefinito',weights:{historic:10,season:60,recent5:30}},
  {id:'season',label:'0 / 100 / 0 · Solo stagione',weights:{historic:0,season:100,recent5:0}},
  {id:'recent',label:'0 / 50 / 50 · Più forma',weights:{historic:0,season:50,recent5:50}},
  {id:'history',label:'20 / 60 / 20 · Più storico',weights:{historic:20,season:60,recent5:20}}
]);
const MIN_TRAIN_ROWS=32; // stesso limite buildModel()
const safeNumber=v=>v==null||v===''?NaN:Number(v);

function actualOutcome(fixture, home, away, mode){
  let hg,ag;
  if(mode==='actual'){
    // Controllo: i risultati W/D/L reali derivano dagli FP che includono +2.
    hg=goalsFromFantasyPoints(home.points_for);
    ag=goalsFromFantasyPoints(away.points_for);
  } else {
    // Confronto ottavi: campo neutro, rimuovendo +2 alla squadra di casa
    // della regular season GW1-14. Non e' lo stesso esito ufficiale della gara.
    const bonus=Number(fixture.gw)<=14?2:0;
    hg=goalsFromFantasyPoints(safeNumber(home.points_for)-bonus);
    ag=goalsFromFantasyPoints(away.points_for);
  }
  if(hg==null||ag==null)return null;
  return hg>ag?'1':hg===ag?'X':'2';
}

export function buildEvaluationFixtures({teams=[],results=[],fixtures=[]},mode='neutral'){
  if(!['neutral','actual'].includes(mode))throw new Error('Modalità confronto sconosciuta');
  const byTeam=new Map(teams.map(t=>[normalizeTeam(t.name),t]));
  const resultsMap=new Map();
  for(const r of results){
    if(String(r.phase||'').toLowerCase()!=='regular'||!Number.isFinite(Number(r.gw)))continue;
    resultsMap.set(`${Number(r.gw)}:${normalizeTeam(r.team)}`,r);
  }
  const seen=new Set();
  return fixtures.map(f=>{
    const gw=Number(f.gw);const h=normalizeTeam(f.home_team),a=normalizeTeam(f.away_team);
    const key=`${gw}:${h}:${a}`;
    if(!gw||!h||!a||seen.has(key)||!byTeam.has(h)||!byTeam.has(a))return null;
    seen.add(key);
    const home=resultsMap.get(`${gw}:${h}`),away=resultsMap.get(`${gw}:${a}`);
    if(!home||!away||!Number.isFinite(safeNumber(home.points_for))||!Number.isFinite(safeNumber(away.points_for)))return null;
    const actual=actualOutcome(f,home,away,mode);
    if(!actual)return null;
    return {gw,home:byTeam.get(h).name,away:byTeam.get(a).name,actual};
  }).filter(Boolean).sort((a,b)=>a.gw-b.gw||a.home.localeCompare(b.home));
}

function probabilityOf(quotes,actual){return actual==='1'?quotes.p1:actual==='X'?quotes.px:quotes.p2;}

/**
 * Restituisce le previsioni solo per GW con almeno 32 risultati precedenti.
 * Ogni test su GW t viene allenato su risultati fino a GW t-1.
 * «actual» usa il +2 che era reale in regular season 2026/27,
 * «neutral» lo rimuove tanto dal target quanto dalla previsione.
 */
export function evaluateWalkForward(snapshot,weights=null,mode='neutral'){
  if(!snapshot||!Array.isArray(snapshot.results))throw new Error('Snapshot risultati mancante');
  if(weights!==null)weights=validateSimulatorWeights(weights);
  const base=buildEvaluationFixtures(snapshot,mode);
  const byGw=new Map();for(const f of base){if(!byGw.has(f.gw))byGw.set(f.gw,[]);byGw.get(f.gw).push(f);}
  const rows=[];const gaps=[];
  for(const gw of [...byGw.keys()].sort((a,b)=>a-b)){
    const targets=byGw.get(gw);
    // Niente test di una giornata parzialmente importata.
    if(targets.length!==8){gaps.push(`G${gw}: ${targets.length}/8 incontri`);continue;}
    const train=snapshot.results.filter(r=>String(r.phase||'').toLowerCase()==='regular' && Number(r.gw)<gw);
    if(train.length<MIN_TRAIN_ROWS){gaps.push(`G${gw}: ${train.length}/32 fantapunti di allenamento`);continue;}
    let model;
    try{model=buildModel({teams:snapshot.teams,results:train,fixtures:snapshot.fixtures,history:snapshot.history,weights});}
    catch(err){gaps.push(`G${gw}: ${err.message}`);continue;}
    for(const target of targets){
      try{
        const odds=quoteMatch(model,target.home,target.away,mode==='actual'&&gw<=14?'semi_andata':'ottavi');
        const probability=probabilityOf(odds,target.actual);
        const probs=[odds.p1,odds.px,odds.p2];
        const expected=['1','X','2'].map(x=>x===target.actual?1:0);
        const brier=probs.reduce((s,p,i)=>s+(p-expected[i])**2,0);
        const logLoss=-Math.log(Math.max(1e-12,probability));
        const predicted=['1','X','2'][probs.indexOf(Math.max(...probs))];
        rows.push({...target,p1:odds.p1,px:odds.px,p2:odds.p2,
          q1:odds.q1,qx:odds.qx,q2:odds.q2,probability,
          predicted,brier,logLoss,hit:predicted===target.actual});
      } catch(e){gaps.push(`G${gw} ${target.home}-${target.away}: ${e.message}`);}
    }
  }
  const avg=(k)=>rows.length?rows.reduce((sum,row)=>sum+row[k],0)/rows.length:null;
  const testedWeeks=[...new Set(rows.map(r=>r.gw))];
  return {rows,testedWeeks,gaps,
    matches:rows.length,
    brier:avg('brier'), logLoss:avg('logLoss'), accuracy:avg('hit'),
    mode,weights,
    predictions:rows.length?{
      one:rows.reduce((s,r)=>s+r.p1,0)/rows.length,
      x:rows.reduce((s,r)=>s+r.px,0)/rows.length,
      two:rows.reduce((s,r)=>s+r.p2,0)/rows.length,
      realizedOne:rows.filter(r=>r.actual==='1').length/rows.length,
      realizedX:rows.filter(r=>r.actual==='X').length/rows.length,
      realizedTwo:rows.filter(r=>r.actual==='2').length/rows.length
    }:null};
}

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(n,d=3)=>Number(n).toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d});
const weightId=w=>w===null?'original':`${w.historic}/${w.season}/${w.recent5}`;
function labelWeights(w){return w===null?'Originale V4':`${w.historic}% / ${w.season}% / ${w.recent5}%`;}

export function mountBacktestLab({getSnapshot,getWeights,adminOnly=true}={}){
  const root=document.getElementById('pc-backtest-lab');
  if(!root)return {refresh(){}};
  const button=root.querySelector('#pc-bt-run');
  const modeInput=root.querySelector('#pc-bt-mode');
  const summary=root.querySelector('#pc-bt-summary');
  const table=root.querySelector('#pc-bt-models');
  const calibration=root.querySelector('#pc-bt-calibration');
  const details=root.querySelector('#pc-bt-details');
  const feedback=root.querySelector('#pc-bt-feedback');
  let latest=null;
  function run(){
    const snapshot=getSnapshot?.();
    if(!snapshot){feedback.textContent='I dati non sono ancora caricati. Attendi o aggiorna la pagina.';return;}
    button.disabled=true;button.textContent='Analisi in corso…';
    try{
      const mode=modeInput.value;
      const personal=getWeights?.()||SIMULATOR_DEFAULT_WEIGHTS;
      const candidates=[...TEST_PRESETS,{id:'personal',label:'Pesi scelti nel simulatore',weights:personal}];
      const memo=new Map();
      const results=candidates.map(p=>{
        const key=weightId(p.weights);
        if(!memo.has(key))memo.set(key,evaluateWalkForward(snapshot,p.weights,mode));
        return {...p,report:memo.get(key)};
      });
      latest=results;
      const valid=results.filter(m=>m.report.matches>0);
      if(!valid.length){
        feedback.textContent='Non ci sono ancora abbastanza giornate complete per un test senza fuga di dati. Servono almeno due giornate precedenti e una successiva completa.';
        summary.innerHTML='';calibration.innerHTML='';table.innerHTML='';details.innerHTML='';return;
      }
      const sharedWeeks=valid[0].report.testedWeeks;
      const sharedMatches=valid[0].report.matches;
      summary.innerHTML=`<div class="pc-bt-metric"><small>Partite fuori campione</small><strong>${sharedMatches}</strong></div>`+
        `<div class="pc-bt-metric"><small>Giornate testate</small><strong>${sharedWeeks.map(gw=>'G'+gw).join(', ')}</strong></div>`+
        `<div class="pc-bt-metric"><small>Benchmark casuale · Brier</small><strong>${fmt(2/3)}</strong></div>`;
      const sorted=[...results].sort((a,b)=>(a.report.brier??Infinity)-(b.report.brier??Infinity));
      table.innerHTML=`<div class="pc-bt-table-scroll"><table class="pc-bt-table"><thead><tr><th>Modello</th><th>Storico / stagione / 5 GW</th><th>Brier ↓</th><th>Log loss ↓</th><th>Segno favorito corretto</th><th>Partite</th></tr></thead><tbody>`+
        sorted.map(item=>`<tr class="${item.id==='personal'?'pc-bt-personal':''}"><td><b>${escapeHtml(item.label)}</b></td><td>${escapeHtml(labelWeights(item.weights))}</td>`+
          `<td>${item.report.brier==null?'—':fmt(item.report.brier)}</td><td>${item.report.logLoss==null?'—':fmt(item.report.logLoss)}</td>`+
          `<td>${item.report.accuracy==null?'—':fmt(item.report.accuracy*100,1)+'%'}</td><td>${item.report.matches}</td></tr>`).join('')+`</tbody></table></div>`;
      const chosen=results.find(x=>x.id==='personal').report;
      const breakdown=chosen.predictions;
      calibration.innerHTML=breakdown?`<div class="pc-bt-cal-head">📏 <strong>Calibrazione 1X2 con i pesi attuali</strong><small>Probabilità media annunciata vs frequenza osservata</small></div><div class="pc-bt-cal-grid">`+
        [['1',breakdown.one,breakdown.realizedOne],['X',breakdown.x,breakdown.realizedX],['2',breakdown.two,breakdown.realizedTwo]]
        .map(([sign,expected,observed])=>`<div class="pc-bt-cal-card"><b>Segno ${sign}</b><span>Previsto <strong>${fmt(expected*100,1)}%</strong></span><span>Reale <strong>${fmt(observed*100,1)}%</strong></span><small>Scarto ${fmt((expected-observed)*100,1)} punti percentuali</small></div>`).join('')+`</div>`:'';

      const comparison=chosen.rows.map(row=>`<tr><td>G${row.gw}</td><td>${escapeHtml(row.home)} – ${escapeHtml(row.away)}</td>`+
        `<td>${row.actual}</td><td>${fmt(row.p1*100,1)} / ${fmt(row.px*100,1)} / ${fmt(row.p2*100,1)}</td><td>${row.predicted}</td><td>${fmt(row.brier)}</td></tr>`).join('');
      details.innerHTML=`<details><summary>🔍 Controlla le ${chosen.rows.length} previsioni del modello personalizzato</summary>`+
        `<div class="pc-bt-table-scroll"><table class="pc-bt-table"><thead><tr><th>GW</th><th>Partita</th><th>Esito</th><th>Probabilità 1 / X / 2</th><th>Favorito</th><th>Brier</th></tr></thead><tbody>${comparison}</tbody></table></div></details>`;
      const best=sorted.find(x=>x.report.matches>0);
      feedback.innerHTML=`<strong>Confronto completato.</strong> Il Brier più basso nei dati testati è ${fmt(best.report.brier)} (${escapeHtml(best.label)}). `+
        `Non significa che questo modello sia il migliore per i playoff: campione ridotto, stessi dati usati per confrontare i pesi e differenza tra regular season e playoff. `+
        `Le squadre con storico mancante usano automaticamente i dati disponibili. ${chosen.gaps.length?`Esclusioni: ${escapeHtml(chosen.gaps.slice(0,3).join('; '))}.`:''}`;
    }catch(e){feedback.textContent=`Non posso completare l'analisi: ${e.message}`;}
    finally{button.disabled=false;button.textContent='🔬 Esegui confronto sui risultati';}
  }
  button.addEventListener('click',run);
  return {refresh(){/* Analisi solo su richiesta, per evitare ricalcoli inutili in background */},run};
}
