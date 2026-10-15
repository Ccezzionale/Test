import { supabase } from './supabase.js';
import { buildModel, quoteMatch, normalizeTeam } from './bookmaker-engine.js';
import { calculateProjectedStandings } from './bookmaker-seeding.js';

const $ = id => document.getElementById(id);
const format = (value, digits=2) => Number(value).toLocaleString('it-IT', {minimumFractionDigits:digits,maximumFractionDigits:digits});
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = { isAdmin:false, data:null, model:null, projection:null, quoted:[], editorMode:'automatico', overrides:new Map(), busy:false };
const AUTO_REFRESH_MS = 90_000;
let refreshTimer = null;

function errorMessage(err) {
  $('error').textContent=String(err?.message || err);
  $('error').hidden=false;
  $('loading').hidden=true;
}
function setAdminMessage(message){$('admin-feedback').textContent=message;}

async function getUserAndAdmin(){
  const { data:{user},error }=await supabase.auth.getUser();
  if(error || !user)throw new Error('Accedi alla Lega per vedere gli accoppiamenti virtuali dei playoff.');
  const {data,isError,error:rpcError}=await supabase.rpc('totoeroi_is_admin');
  if(!rpcError)return {isAdmin:data===true,user};
  // Fallback di sola interfaccia. Nessuna operazione di modifica è disponibile.
  const {data:profile}=await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
  return {isAdmin:String(profile?.role||'').toLowerCase()==='admin',user};
}
async function queryTable(table,fields,mod = query=>query){
  const {data,error}=await mod(supabase.from(table).select(fields).limit(1000));
  if(error)throw new Error(`Lettura ${table}: ${error.message}`);
  return data||[];
}
async function loadSnapshot(){
  const [teams,results,fixtures,history]=await Promise.all([
    queryTable('teams','id,name,conference',q=>q.order('name')),
    queryTable('fantacalcio_results','conference,phase,gw,team,opponent,points_for,result,is_home',q=>q.order('gw')),
    queryTable('fantacalcio_fixtures','gw,home_team,away_team',q=>q.order('gw')),
    queryTable('match_history','season,season_week,team_a,team_b,score_a,score_b',q=>q.eq('season','2025/26'))
  ]);
  const projection=calculateProjectedStandings(teams,results);
  if(!projection.hasSufficientData)throw new Error('Non trovo ancora una giornata completa della regular season. Le quote non possono essere calcolate.');
  // Solo settimane COMPLETE, in modo che quote e posizioni abbiano lo stesso aggiornamento.
  const valid=results.filter(r=>Number(r.gw)<=projection.lastCompleted && String(r.phase||'').toLowerCase()==='regular');
  const model=buildModel({teams,results:valid,fixtures,history});
  const quoted=projection.fixtures.map(item=>{
    const result=quoteMatch(model,item.home.name,item.away.name,'ottavi');
    return {...item,auto:result, key:`${normalizeTeam(item.home.name)}-${normalizeTeam(item.away.name)}`};
  });
  return {teams,results:valid,fixtures,history,projection,model,quoted};
}
function selectedOdds(item){
  if(state.isAdmin && state.editorMode==='manuale'){
    return state.overrides.get(item.key) || [item.auto.q1,item.auto.qx,item.auto.q2];
  }
  return [item.auto.q1,item.auto.qx,item.auto.q2];
}
function manualValidation(odds){
  const values=odds.map(Number);
  if(!values.every(q=>Number.isFinite(q)&&q>1&&q<=1000))return {valid:false,label:'Le quote devono essere numeri maggiori di 1 e al massimo 1000.'};
  const implied=values.reduce((sum,q)=>sum+1/q,0);
  if(Math.abs(implied-1)>0.015)return {valid:false,implied,label:`Somma probabilità implicite: ${format(implied*100,2)}%. Deve essere circa 100% (tolleranza 1,5%).`};
  return {valid:true,implied,label:`Probabilità implicite: ${format(implied*100,2)}% · nessun margine significativo.`};
}
function renderMatchups(){
  const box=$('match-grid');
  const manualMode=state.isAdmin && state.editorMode==='manuale';
  box.innerHTML=state.quoted.map(item=>{
    const odds=selectedOdds(item);
    const check=manualValidation(odds);
    const modeLabel=manualMode && state.overrides.has(item.key)?'<span class="manual-tag">Modifica locale</span>':'';
    return `<article class="match-card">
      <div class="match-card-top"><span>OTTAVO ${item.slot} · SEED ${item.seeds[0]} vs ${item.seeds[1]}</span>${modeLabel}</div>
      <div class="fixture-names">
        <div><span class="seed">#${item.home.seed}</span><strong>${escapeHtml(item.home.name)}</strong><small>${item.home.points} pt · ${format(item.home.fp,1)} FP</small></div>
        <span class="versus">VS</span>
        <div><span class="seed">#${item.away.seed}</span><strong>${escapeHtml(item.away.name)}</strong><small>${item.away.points} pt · ${format(item.away.fp,1)} FP</small></div>
      </div>
      <div class="odds-grid">${[['1',0],['X',1],['2',2]].map(([sign,idx])=>`<div class="odds-card"><span>${sign}</span><strong>${check.valid?format(odds[idx]):'—'}</strong><small>${format([item.auto.p1,item.auto.px,item.auto.p2][idx]*100,1)}% auto</small></div>`).join('')}</div>
      ${manualMode && !check.valid?'<p class="draft-error">Valori manuali non validi. Vedi il pannello Admin.</p>':''}
    </article>`;
  }).join('');
}
function renderStandings(){
  $('standings-body').innerHTML=state.projection.standings.map(t=>`<tr class="${t.seed>=5&&t.seed<=12?'in-bracket':t.seed>12?'outside':''}">
    <td class="seed-cell">${t.seed}</td><td>${escapeHtml(t.name)}</td><td>${t.played}</td><td><strong>${t.points}</strong></td><td>${format(t.fp,1)}</td>
  </tr>`).join('');
}
function renderEditor(){
  if(!state.isAdmin)return;
  $('editor-mode').value=state.editorMode;
  const manual=state.editorMode==='manuale';
  $('admin-editor').hidden=!manual;
  $('admin-editor').innerHTML=manual ? state.quoted.map(item=>{
    const odds=selectedOdds(item);
    const check=manualValidation(odds);
    return `<section class="edit-card" data-key="${escapeHtml(item.key)}">
      <div class="edit-top"><strong>${escapeHtml(item.home.name)} <span>vs</span> ${escapeHtml(item.away.name)}</strong><button class="btn ghost small" data-reset="${escapeHtml(item.key)}" type="button">Ripristina auto</button></div>
      <div class="draft-fields">${['1','X','2'].map((sign,i)=>`<label>Quota ${sign}<input type="number" inputmode="decimal" step="0.01" min="1.01" max="1000" data-index="${i}" value="${Number(odds[i]).toFixed(2)}" aria-label="Quota ${sign} ${escapeHtml(item.home.name)} contro ${escapeHtml(item.away.name)}"></label>`).join('')}</div>
      <p class="${check.valid?'validity':'draft-error'}">${check.label}</p>
    </section>`;
  }).join('') : '';
  $('export').disabled=manual&&state.quoted.some(i=>!manualValidation(selectedOdds(i)).valid);
}
function renderAll(){
  const s=state.projection;
  $('latest-gw').textContent=`${s.lastCompleted} / 29`;
  $('sample-count').textContent=String(s.lastCompleted*16);
  $('refreshed-at').textContent=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  $('playoff-state').textContent=s.lastCompleted>=29?'Da omologare':'Provvisorio';
  $('bracket-hint').textContent=`Quattro ottavi virtuali sulla base delle prime ${s.lastCompleted} giornate complete. `+
    (s.unresolvedTies?'Alcune parità di punti non sono ancora risolvibili con gli scontri diretti: il seeding resta indicativo. ':'')+
    (s.pending?'La giornata successiva è in caricamento, aspettiamo tutti e 16 i risultati. ':'')+
    'Il tabellone ufficiale sarà definito dalla classifica omologata della Lega.';
  renderMatchups();renderStandings();renderEditor();
}
async function refresh(silent=false){
  if(state.busy || document.hidden)return;
  state.busy=true;
  const button=$('refresh'); if(button)button.disabled=true;
  try{
    const loaded=await loadSnapshot();
    const oldSig=state.projection?.lastCompleted+':'+state.quoted.map(q=>q.key).join(',');
    const newSig=loaded.projection.lastCompleted+':'+loaded.quoted.map(q=>q.key).join(',');
    const hadOverrides=state.overrides.size>0;
    if(oldSig!==newSig){state.overrides.clear();if(hadOverrides)setAdminMessage('Giornata o accoppiamenti cambiati: le modifiche manuali locali sono state azzerate.');}
    Object.assign(state,{projection:loaded.projection,model:loaded.model,quoted:loaded.quoted});
    renderAll();$('error').hidden=true;$('loading').hidden=true;$('app').hidden=false;
  }catch(e){console.error('Bookmaker refresh:',e); if(!silent||!state.projection)errorMessage(e);}
  finally{state.busy=false;if(button)button.disabled=false;}
}
function regenerate(){
  if(state.overrides.size && !confirm('Rigenerare le quote automatiche ed eliminare tutte le modifiche manuali locali?'))return;
  state.overrides.clear();state.editorMode='automatico';$('editor-mode').value='automatico';
  renderAll();setAdminMessage('Quote rigenerate dal modello attuale. Nessun salvataggio sul server.');
}
function exportDraft(){
  if(!state.isAdmin)return;
  const manual=state.editorMode==='manuale';
  if(manual&&state.quoted.some(item=>!manualValidation(selectedOdds(item)).valid)){
    setAdminMessage('Correggi le quote manuali: le probabilità implicite devono sommare circa il 100%.');return;
  }
  const payload={
    tool:'Bookmaker degli Eroi',version:'2.0',season:'2026/27',stage:'ottavi',
    status:'bozza_non_pubblicata',source:'proiezione_standings_regular_season',
    last_completed_gw:state.projection.lastCompleted,
    ties_unresolved:state.projection.unresolvedTies,
    generated_at:new Date().toISOString(),review_mode:state.editorMode,
    notes:'Non pubblicare come quote definitive prima della conclusione della regular season, omologazione del tabellone e revisione del Commissioner.',
    matches:state.quoted.map(item=>({
      slot:item.slot,seed_home:item.home.seed,seed_away:item.away.seed,
      team_home:item.home.name,team_away:item.away.name,
      model_probabilities:{'1':item.auto.p1,'X':item.auto.px,'2':item.auto.p2},
      odds: Object.fromEntries(['1','X','2'].map((sign,i)=>[sign,Number(selectedOdds(item)[i])])),
      mode:manual&&state.overrides.has(item.key)?'manuale':'automatico'
    }))
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');
  link.href=url;link.download=`bookmaker-ottavi-gw${state.projection.lastCompleted}-bozza.json`;
  document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  setAdminMessage('Bozza esportata. Le quote NON sono state salvate o pubblicate.');
}

$('refresh').addEventListener('click',()=>refresh(false));
$('generate').addEventListener('click',regenerate);
$('editor-mode').addEventListener('change',e=>{
  state.editorMode=e.target.value==='manuale'?'manuale':'automatico';
  renderAll();setAdminMessage(state.editorMode==='manuale'?'Puoi correggere le quote qui sotto. Le modifiche sono locali e non visibili agli altri allenatori.':'Visualizzazione delle quote automatiche.');
});
$('export').addEventListener('click',exportDraft);
$('admin-editor').addEventListener('input',event=>{
  const input=event.target.closest('input[data-index]');if(!input)return;
  const card=input.closest('[data-key]');const key=card?.dataset.key;
  const item=state.quoted.find(q=>q.key===key);if(!item)return;
  const previous=[...(state.overrides.get(key)||[item.auto.q1,item.auto.qx,item.auto.q2])];
  previous[Number(input.dataset.index)]=input.value===''?NaN:Number(input.value);
  state.overrides.set(key,previous);
  const check=manualValidation(previous);
  const message=card.querySelector('p');message.textContent=check.label;message.className=check.valid?'validity':'draft-error';
  $('export').disabled=state.quoted.some(q=>!manualValidation(selectedOdds(q)).valid);
  renderMatchups();
});
$('admin-editor').addEventListener('click',event=>{
  const button=event.target.closest('button[data-reset]');if(!button)return;
  state.overrides.delete(button.dataset.reset);renderAll();
});

(async()=>{
  try{
    const access=await getUserAndAdmin();state.isAdmin=access.isAdmin;
    $('admin-panel').hidden=!state.isAdmin;
    await refresh();
    refreshTimer=setInterval(()=>refresh(true),AUTO_REFRESH_MS);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
  }catch(e){console.error('Bookmaker init:',e);errorMessage(e);}
})();
