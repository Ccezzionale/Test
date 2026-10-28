/* Playoffs Challenge V9.4 · Commissioner: standard engine or independently editable weights.
   This module NEVER writes to Supabase. Only an explicit button copies odds to the draft. */
import {buildModel,quoteMatch,normalizeTeam,SIMULATOR_DEFAULT_WEIGHTS,validateSimulatorWeights} from './bookmaker-engine.js';

const FIELDS=['historic','season','recent5'];
const STORAGE_KEY='lega_pc_commissioner_custom_weights_v94';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=(value,places=2)=>Number(value).toLocaleString('it-IT',{minimumFractionDigits:places,maximumFractionDigits:places});

// Kept for compatibility with older tests/modules. NOT used by the new editable fields.
export function rebalanceWeights(previous,changed,target){
  const original=validateSimulatorWeights(previous);
  const value=Math.min(100,Math.max(0,Math.round(Number(target))));
  if(!FIELDS.includes(changed))throw new Error('Peso sconosciuto');
  const [a,b]=FIELDS.filter(k=>k!==changed);
  const remaining=100-value;
  const sum=original[a]+original[b];
  const av=sum?Math.round(remaining*original[a]/sum):Math.round(remaining/2);
  return validateSimulatorWeights({[changed]:value,[a]:av,[b]:remaining-av});
}

export function mountCommissionerSimulator({getSnapshot,getRound,getDraftMatches,getProjectedMatches,onApply}){
  const el=id=>document.getElementById(id);
  const shell=el('pc-weight-simulator');
  if(!shell)return {refresh(){},setSnapshot(){},getQuoteModel(){return null},getWeights(){return null}};
  let mode='standard'; // ALWAYS start with the actual current bookmaker model.
  let weights={...SIMULATOR_DEFAULT_WEIGHTS};
  let snapshot=null, rows=[];
  try{
    const stored=JSON.parse(window.localStorage.getItem(STORAGE_KEY)||'null');
    if(stored)weights=validateSimulatorWeights(stored);
  }catch(_){/* browser without storage */}
  for(const key of FIELDS)el(`pc-weight-${key}`).value=String(weights[key]);

  function readFields(){
    const draft={};
    for(const k of FIELDS){
      const raw=el(`pc-weight-${k}`).value.trim();
      if(raw===''||!/^\d+$/.test(raw))return {valid:false,raw:null,sum:null,message:'Inserisci tre numeri interi fra 0 e 100.'};
      draft[k]=Number(raw);
      if(draft[k]<0||draft[k]>100)return {valid:false,raw:draft,sum:null,message:'Ogni numero deve essere fra 0 e 100.'};
    }
    const sum=FIELDS.reduce((total,k)=>total+draft[k],0);
    return {valid:sum===100,raw:draft,sum,message:sum===100?'✓ Le percentuali sommano il 100%.':`Totale ${sum}%: modifica i numeri fino ad arrivare al 100%. Nessun campo verrà spostato automaticamente.`};
  }
  function clear(message){rows=[];el('pc-sim-games').innerHTML=`<p class="pc-sim-empty">${esc(message)}</p>`;}
  function render(){
    const custom=mode==='custom';
    const manual=mode==='manual';
    el('pc-sim-custom').hidden=!custom;
    el('pc-sim-manual-note').hidden=!manual;
    el('pc-weight-simulator').querySelector('.pc-sim-results').hidden=manual;
    for(const radio of document.querySelectorAll('input[name="pc-sim-mode"]'))radio.checked=radio.value===mode;
    const state=readFields();
    el('pc-sim-total').textContent=manual?'MANUALE':custom?(state.sum===null?'DA COMPLETARE':`${state.sum}%`):'STANDARD';
    el('pc-sim-total').classList.toggle('pc-sim-invalid',custom&&!state.valid);
    el('pc-sim-input-feedback').textContent=custom?state.message:'';
    el('pc-sim-input-feedback').classList.toggle('pc-feedback-error',custom&&!state.valid);
    const round=getRound();
    if(!round||round.status!=='draft'){shell.hidden=true;return;}
    shell.hidden=false;
    if(manual){rows=[];el('pc-sim-warning').textContent='Scrivi le quote nelle quattro partite qui sopra. Il pulsante finale salverà esattamente i valori digitati.';return;}
    if(custom&&!state.valid){clear('Completa i tre pesi fino al 100% per vedere le nuove quote. Le quote della bozza restano intatte.');return;}
    if(custom){weights={...state.raw};try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(weights));}catch(_){}}
    const source=snapshot||getSnapshot();
    if(!source?.originalModel){clear('Sto aspettando i risultati della Lega per mostrare le quote.');return;}
    const current=getDraftMatches().map(x=>({...x}));
    const projected=getProjectedMatches();
    const fixtures=current.some(m=>m.home_name&&m.away_name)?current:(round.stage==='ottavi'?projected:current);
    if(!fixtures?.length){clear('Prima seleziona le squadre degli incontri al passaggio 02.');return;}
    let model;
    try{model=custom?buildModel({...source.data,weights}):source.originalModel;}catch(e){clear(e.message);return;}
    const fallback=new Set();
    rows=fixtures.map(m=>{
      const home=m.home_name,away=m.away_name;
      if(!home||!away||normalizeTeam(home)===normalizeTeam(away))return {slot:m.slot,home,away,error:'Scegli prima due franchigie diverse.'};
      try{
        const previous=quoteMatch(source.originalModel,home,away,round.stage);
        const currentQuote=custom?quoteMatch(model,home,away,round.stage):previous;
        if(custom)for(const t of [currentQuote.homeProfile,currentQuote.awayProfile])if(t.missingSources?.length)fallback.add(`${t.name}: ${t.missingSources.join(', ')}`);
        return {slot:m.slot,home,away,previous,current:currentQuote};
      }catch(e){return {slot:m.slot,home,away,error:e.message};}
    });
    el('pc-sim-games').innerHTML=rows.map(match=>{
      if(match.error)return `<article class="pc-sim-fixture"><strong>Partita ${match.slot}: ${esc(match.home||'?')} vs ${esc(match.away||'?')}</strong><p class="pc-sim-empty">${esc(match.error)}</p></article>`;
      const old=[match.previous.q1,match.previous.qx,match.previous.q2];
      const now=[match.current.q1,match.current.qx,match.current.q2];
      const probs=[match.current.p1,match.current.px,match.current.p2];
      const cells=['1','X','2'].map((name,i)=>{
        const delta=now[i]-old[i];
        return `<div class="pc-sim-odd"><span>${name}</span><strong>${custom?`${fmt(old[i])} → `:''}${fmt(now[i])}</strong><small>${fmt(probs[i]*100,1)}% probabilità</small>${custom?`<em class="${delta>0.005?'increase':delta< -0.005?'decrease':''}">${Math.abs(delta)<0.005?'Invariata':`${delta>0?'+':''}${fmt(delta)} sulla quota`}</em>`:'<em>Quota del motore attuale</em>'}</div>`;
      }).join('');
      return `<article class="pc-sim-fixture"><div class="pc-sim-fixture-title"><strong>${esc(match.home)} vs ${esc(match.away)}</strong><small>Partita ${match.slot}</small></div><div class="pc-sim-odds-grid">${cells}</div></article>`;
    }).join('');
    let help=custom?'Simulazione alternativa con le percentuali inserite.':'Stai vedendo esattamente il modello 1X2 standard già utilizzato dall’app; non equivale al preset 10/60/30.';
    help+=` Dati disponibili fino alla giornata ${source.originalModel.metadata.latestRound}. Nessuna quota viene pubblicata automaticamente.`;
    if(fallback.size)help+=` Dati mancanti, pesi ridistribuiti: ${[...fallback].join('; ')}.`;
    el('pc-sim-warning').textContent=help;
  }
  for(const radio of document.querySelectorAll('input[name="pc-sim-mode"]'))radio.addEventListener('change',e=>{if(e.target.checked){mode=e.target.value;render();}});
  for(const key of FIELDS)el(`pc-weight-${key}`).addEventListener('input',render);
  el('pc-sim-reset').addEventListener('click',()=>{
    weights={...SIMULATOR_DEFAULT_WEIGHTS};
    for(const key of FIELDS)el(`pc-weight-${key}`).value=String(weights[key]);
    render();
  });
  render();
  return {
    refresh:render,
    getMode(){return mode;},
    getProposedOdds(){render();if(mode==='manual')return null;return rows.length&&rows.every(r=>!r.error&&r.current)?rows.map(r=>({slot:r.slot,home_name:r.home,away_name:r.away,q1:r.current.q1,qx:r.current.qx,q2:r.current.q2})):null;},
    setSnapshot(value){snapshot=value;render();},
    getWeights(){return mode==='custom'&&readFields().valid?{...weights}:null;},
    getQuoteModel(){const source=snapshot||getSnapshot();if(!source)return null;
      if(mode==='manual')return null;
      if(mode==='standard')return source.originalModel;
      const state=readFields();return state.valid?buildModel({...source.data,weights:state.raw}):null;}
  };
}
