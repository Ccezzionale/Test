/* Lega degli Eroi · V5: simulatore di quote LOCAL-ONLY.
   Non scrive in Supabase, non altera le proiezioni pubbliche e non pubblica quote.
   Solo il bottone esplicito 'Applica alla bozza' modifica i campi dell'admin. */
import {buildModel,quoteMatch,normalizeTeam,SIMULATOR_DEFAULT_WEIGHTS,validateSimulatorWeights} from './bookmaker-engine.js';

const KEYS=['historic','season','recent5'];
const STORAGE_KEY='lega_pc_commissioner_weights_v5';
const fmt=(n,d=2)=>Number(n).toLocaleString('it-IT',{minimumFractionDigits:d,maximumFractionDigits:d});
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* Ridistribuisce la quota residua fra gli altri due componenti.
   Non lascia mai percentuali che sommano 99 o 101. */
export function rebalanceWeights(previous,changed,target){
  const old=validateSimulatorWeights(previous);
  if(!KEYS.includes(changed))throw new Error('Peso sconosciuto');
  const value=Math.max(0,Math.min(100,Math.round(Number(target))));
  const [a,b]=KEYS.filter(k=>k!==changed);
  const remainder=100-value;
  const oldSum=old[a]+old[b];
  let aValue=oldSum>0 ? Math.round(remainder*old[a]/oldSum) : Math.round(remainder/2);
  aValue=Math.max(0,Math.min(remainder,aValue));
  return validateSimulatorWeights({[changed]:value,[a]:aValue,[b]:remainder-aValue});
}

export function mountCommissionerSimulator({getSnapshot,getRound,getDraftMatches,getProjectedMatches,onApply}){
  const el=id=>document.getElementById(id);
  const shell=el('pc-weight-simulator');
  if(!shell)return {refresh(){},setSnapshot(){}};
  let weights={...SIMULATOR_DEFAULT_WEIGHTS};
  let rows=[];
  let mountedSnapshot=null;
  try{const raw=window.localStorage.getItem(STORAGE_KEY);if(raw)weights=validateSimulatorWeights(JSON.parse(raw));}catch(_){/* private browsing: still works */}

  function drawControls(){
    for(const k of KEYS){
      el(`pc-weight-${k}`).value=String(weights[k]);
      el(`pc-weight-${k}-value`).textContent=`${weights[k]}%`;
    }
    el('pc-sim-total').textContent=`${KEYS.reduce((s,k)=>s+weights[k],0)}%`;
  }

  function clear(message){rows=[];el('pc-sim-games').innerHTML=`<p class="pc-sim-empty">${esc(message)}</p>`;el('pc-sim-apply').disabled=true;}

  function refresh(){
    drawControls();
    const round=getRound();
    if(!round||round.status!=='draft'){
      shell.hidden=true;return;
    }
    shell.hidden=false;
    const source=mountedSnapshot||getSnapshot();
    if(!source){clear('Aspetto i risultati della Lega per calcolare le quote.');return;}
    const selected=getDraftMatches().map(m=>({...m}));
    const projection=getProjectedMatches();
    const fixtures=selected.some(m=>m.home_name&&m.away_name) ? selected :
      round.stage==='ottavi' ? projection : selected;
    if(!fixtures?.length){clear('Seleziona le due franchigie per ogni partita oppure carica gli ottavi provvisori.');return;}
    let original,tuned;
    try{
      original=source.originalModel;
      tuned=buildModel({...source.data,weights});
    }catch(e){clear(`Impossibile elaborare il modello: ${e.message}`);return;}
    const fallback=new Set();
    rows=fixtures.map(m=>{
      const home=m.home_name,away=m.away_name;
      if(!home||!away||normalizeTeam(home)===normalizeTeam(away))return {slot:m.slot,home,away,error:'Seleziona entrambe le squadre'};
      try{
        const previous=quoteMatch(original,home,away,round.stage);
        const current=quoteMatch(tuned,home,away,round.stage);
        for(const team of [current.homeProfile,current.awayProfile]){
          if(team.missingSources.length)fallback.add(`${team.name} (${team.missingSources.map(k=>({historic:'storico',season:'stagione',recent5:'ultime 5'}[k])).join(', ')})`);
        }
        return {slot:m.slot,home,away,previous,current};
      }catch(e){return {slot:m.slot,home,away,error:e.message};}
    });
    el('pc-sim-games').innerHTML=rows.map(m=>{
      if(m.error)return `<article class="pc-sim-fixture"><div class="pc-sim-fixture-title"><strong>Partita ${m.slot} · ${esc(m.home||'Da scegliere')} vs ${esc(m.away||'Da scegliere')}</strong></div><p class="pc-sim-empty">${esc(m.error)}</p></article>`;
      const qold=[m.previous.q1,m.previous.qx,m.previous.q2];
      const qnew=[m.current.q1,m.current.qx,m.current.q2];
      const probs=[m.current.p1,m.current.px,m.current.p2];
      const cells=['1','X','2'].map((name,i)=>{
        const delta=qnew[i]-qold[i],word=delta>0.005?'increase':delta< -0.005?'decrease':'';
        return `<div class="pc-sim-odd"><span>${name}</span><strong>${fmt(qold[i])} → ${fmt(qnew[i])}</strong><small>${fmt(probs[i]*100,1)}% di probabilità</small><em class="${word}">${Math.abs(delta)<0.005?'Quota invariata':`${delta>0?'+':''}${fmt(delta)} sulla quota`}</em></div>`;
      }).join('');
      return `<article class="pc-sim-fixture"><div class="pc-sim-fixture-title"><strong>${esc(m.home)} vs ${esc(m.away)}</strong><small>Partita ${m.slot} · ${esc(round.stage)}</small></div><div class="pc-sim-odds-grid">${cells}</div></article>`;
    }).join('');
    el('pc-sim-apply').disabled=rows.some(r=>r.error)||!rows.length;
    let warning=`Dati reali fino alla giornata ${source.originalModel.metadata.latestRound}. Formula: media pesata dei fantapunti → soglie gol → probabilità 1X2 → quota = 1/probabilità.`;
    if(fallback.size)warning+=` ⚠️ Dati insufficienti per: ${[...fallback].join('; ')}. Per questi casi i pesi effettivi sono ridistribuiti sui dati disponibili.`;
    el('pc-sim-warning').textContent=warning;
  }
  for(const k of KEYS){
    el(`pc-weight-${k}`).addEventListener('input',event=>{
      weights=rebalanceWeights(weights,k,event.target.value);
      try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(weights));}catch(_){/* no storage */}
      refresh();
    });
  }
  el('pc-sim-reset').addEventListener('click',()=>{
    weights={...SIMULATOR_DEFAULT_WEIGHTS};
    try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(weights));}catch(_){}
    refresh();
  });
  el('pc-sim-apply').addEventListener('click',()=>{
    if(!rows.length||rows.some(r=>r.error))return;
    onApply(rows.map(r=>({slot:r.slot,home_name:r.home,away_name:r.away,
      q1:r.current.q1,qx:r.current.qx,q2:r.current.q2})),{...weights});
  });
  drawControls();
  return {refresh,setSnapshot(data){mountedSnapshot=data;refresh()},getWeights(){return {...weights}},getQuoteModel(){
    const source=mountedSnapshot||getSnapshot();return source?buildModel({...source.data,weights}):null;
  }};
}
