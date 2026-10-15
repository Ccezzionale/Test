/* Lega degli Eroi · Playoffs Challenge V8
 * Bookmaker calciatori basato su quotazioni CLASSIC correnti.
 * Calibrazione EDITORIALE, non probabilita' di mercato o storico validato.
 * I parametri sono esclusivamente locali nel browser dell'admin.
 * Nessun salvataggio o pubblicazione automatica su Supabase.
 */
export const PLAYER_EVENTS = {
  P: [
    {key:'CLEAN_SHEET',title:'Clean sheet',manual:true,reason:'Per applicare la regola servono almeno 60 minuti giocati e assenza di reti subite durante la permanenza in campo.'},
    {key:'PENALTY_SAVE',title:'Rigore parato',manual:true,reason:'La quotazione Classic non permette di stimare ragionevolmente la probabilità di un rigore parato.'}
  ],
  D: [
    {key:'GOAL',title:'Segna almeno un gol'},
    {key:'ASSIST',title:'Fa almeno un assist'},
    {key:'CLEAN_SHEET',title:'Clean sheet',manual:true,reason:'Servono minuti giocati e reti subite mentre il calciatore è in campo.'}
  ],
  C: [
    {key:'GOAL',title:'Segna almeno un gol'},
    {key:'ASSIST',title:'Fa almeno un assist'},
    {key:'GOAL_OR_ASSIST',title:'Gol o assist',derived:true}
  ],
  A: [
    {key:'GOAL',title:'Segna almeno un gol'},
    {key:'ASSIST',title:'Fa almeno un assist'},
    {key:'BRACE',title:'Segna almeno due gol',derived:true}
  ]
};
export const ROLE_LABELS = {P:'Portiere',D:'Difensore',C:'Centrocampista',A:'Attaccante'};
// Quote di riferimento CLASSIC: ancore puramente euristiche per ruolo.
export const QUOTATION_ANCHORS = {D:6,C:8,A:10};
// Probabilita' base EDITORIALI associate alle quote di riferimento.
// Non sono stimate dallo storico; il commissioner puo' regolarle.
export const DEFAULT_PLAYER_SETTINGS = Object.freeze({
  sensitivity:65,
  baseline:{D:{GOAL:5,ASSIST:7},C:{GOAL:12,ASSIST:11},A:{GOAL:28,ASSIST:11}}
});
const CONFIG_KEY='lega_pc_bookmaker_players_v8';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const round2=x=>Math.round((x+Number.EPSILON)*100)/100;
const nameLabel=x=>`${x.name} · ${x.club||'Squadra n.d.'} [${x.code}]`;
export function getDefaultPlayerSettings(){return JSON.parse(JSON.stringify(DEFAULT_PLAYER_SETTINGS));}
export function safePlayerSettings(raw){
  const cfg=getDefaultPlayerSettings();
  if(!raw || typeof raw!=='object')return cfg;
  const val=Number(raw.sensitivity);
  if(Number.isFinite(val))cfg.sensitivity=clamp(Math.round(val),0,100);
  for(const role of ['D','C','A'])for(const evt of ['GOAL','ASSIST']){
    const n=Number(raw.baseline?.[role]?.[evt]);
    if(Number.isFinite(n)&&n>=1&&n<=70)cfg.baseline[role][evt]=n;
  }
  return cfg;
}
function adjustedProbability(basePercent,price,anchor,sensitivity){
  const baseline=clamp(basePercent/100,.01,.70);
  // Il logit conserva limiti 0..1 ed evita crescite non lineari eccessive.
  const logOdds=Math.log(baseline/(1-baseline))+(sensitivity/100)*.90*Math.log(price/anchor);
  return 1/(1+Math.exp(-logOdds));
}
export function estimatePlayerEvent(player,event,settings=DEFAULT_PLAYER_SETTINGS){
  if(!player||!PLAYER_EVENTS[player.role]?.some(e=>e.key===event))throw new Error('Calciatore o evento non valido');
  const e=PLAYER_EVENTS[player.role].find(e=>e.key===event);
  if(e.manual)return {supported:false,manual:true,why:e.reason};
  const q=Number(player.quotation);
  if(!Number.isFinite(q)||q<1)return {supported:false,manual:true,why:'Il listino non contiene una quotazione Classic valida per questo calciatore.'};
  const cfg=safePlayerSettings(settings),anchor=QUOTATION_ANCHORS[player.role];
  const pGoals=adjustedProbability(cfg.baseline[player.role].GOAL,q,anchor,cfg.sensitivity);
  const pAssists=adjustedProbability(cfg.baseline[player.role].ASSIST,q,anchor,cfg.sensitivity);
  let p, derivation;
  switch(event){
    case 'GOAL':p=pGoals;derivation='Probabilità base gol adattata al rapporto fra quotazione Classic e riferimento di ruolo.';break;
    case 'ASSIST':p=pAssists;derivation='Probabilità base assist adattata alla quotazione Classic.';break;
    case 'GOAL_OR_ASSIST':p=pGoals+pAssists-pGoals*pAssists;derivation='Unione gol/assist stimata assumendo indipendenza: p(gol)+p(assist)-p(gol)×p(assist).';break;
    case 'BRACE':{
      const lambda=-Math.log(1-pGoals);
      p=1-Math.exp(-lambda)*(1+lambda);
      derivation='Doppietta stimata da p(gol) con un modello di Poisson semplificato.';
      break;
    }
    default:return {supported:false,manual:true,why:'Evento non stimabile dalla quotazione.'};
  }
  p=clamp(p,.005,.95);
  const odd=round2(1/p);
  return {supported:true,probability:p,odd,quotation:q,anchor,sensitivity:cfg.sensitivity,
    baseGoal:cfg.baseline[player.role].GOAL,baseAssist:cfg.baseline[player.role].ASSIST,
    derived:Boolean(e.derived),confidence:'euristica',why:derivation};
}
async function loadRoster(supabase){
  const pageSize=700,items=[];
  for(let offset=0;offset<30000;offset+=pageSize){
    const {data,error}=await supabase.from('players')
      .select('external_id,name,role_classic,serie_a_team,quotation_classic,updated_at')
      .range(offset,offset+pageSize-1);
    if(error)throw new Error('Listino players: '+error.message);
    items.push(...(data||[]));
    if(!data||data.length<pageSize)break;
  }
  const uniq=new Map();
  for(const x of items){
    const code=String(x.external_id||'').trim(),role=String(x.role_classic||'').trim();
    if(!code||!PLAYER_EVENTS[role]||!x.name||!x.serie_a_team)continue;
    const price=x.quotation_classic===null||x.quotation_classic===undefined||x.quotation_classic===''?null:Number(x.quotation_classic);
    const item={code,name:String(x.name).trim(),club:String(x.serie_a_team).trim(),role,
      quotation:price!==null&&Number.isFinite(price)&&price>=1?price:null,updated:x.updated_at||''};
    const prev=uniq.get(code);
    // Il listino può contenere lo stesso codice in più Conference. Preferisci
    // il record con quotazione valida e, a parità, l'aggiornamento più recente.
    if(!prev||(prev.quotation===null&&item.quotation!==null)||
      ((prev.quotation===null)===(item.quotation===null)&&item.updated>prev.updated))uniq.set(code,item);
  }
  return [...uniq.values()].sort((a,b)=>a.name.localeCompare(b.name,'it'));
}
export function mountPlayerBookmaker({supabase,onApply,getRound}){
  const root=$('pc-player-bookmaker');
  if(!root)return {refresh(){}};
  let roster=[],byLabel=new Map(),chosen=null,lastEstimate=null;
  let settings;
  try{settings=safePlayerSettings(JSON.parse(localStorage.getItem(CONFIG_KEY)||'null'))}catch{settings=getDefaultPlayerSettings()}
  const search=$('pc-player-search'),list=$('pc-player-suggestions'),event=$('pc-player-event'),odd=$('pc-player-odd'),status=$('pc-player-quote-status');
  const calculate=$('pc-player-calculate'),apply=$('pc-player-apply');
  const impact=$('pc-player-impact'),base=$('pc-player-baseline');
  const impactOut=$('pc-player-impact-value'),baseOut=$('pc-player-baseline-value');
  const help=$('pc-player-settings-help'),reset=$('pc-player-reset');
  const note=(value,error=false)=>{status.textContent=value;status.classList.toggle('pc-feedback-error',error)};
  const store=()=>{try{localStorage.setItem(CONFIG_KEY,JSON.stringify(settings))}catch{}};
  const selectedEvent=()=>PLAYER_EVENTS[chosen?.role]?.find(e=>e.key===event.value);
  function showSettings(){
    impact.value=String(settings.sensitivity);impactOut.textContent=settings.sensitivity+'%';
    const meta=selectedEvent();
    if(!chosen){base.disabled=true;baseOut.textContent='—';help.textContent='Seleziona un calciatore: qui puoi modificare la sensibilità alla quotazione e la probabilità base del suo ruolo.';return}
    if(meta?.manual){base.disabled=true;baseOut.textContent='Manuale';help.textContent='Questo evento resta manuale. La quotazione Classic non basta a stimarlo.';return}
    if(meta?.derived){base.disabled=true;baseOut.textContent='Derivata';help.textContent=event.value==='BRACE'?'La doppietta è ricavata dalla probabilità gol con un modello semplificato. Per correggere la quota finale usa il campo a destra.':'Gol o assist è ricavato dalle probabilità di gol e assist. Per correggere la quota finale usa il campo a destra.';return}
    const v=settings.baseline[chosen.role][event.value];
    base.disabled=false;base.value=String(v);baseOut.textContent=Number(v).toLocaleString('it-IT')+'%';
    help.textContent=`Probabilità BASE di «${meta?.title}» per un ${ROLE_LABELS[chosen.role].toLowerCase()} con quotazione Classic ${QUOTATION_ANCHORS[chosen.role]}. Non è un dato storico. Modificandola aggiorni le quote suggerite di quel ruolo/evento.`;
  }
  function drawEstimate(){
    const box=$('pc-player-evidence');
    if(!chosen){box.innerHTML='<p>Seleziona un calciatore dal listino.</p>';return}
    const meta=selectedEvent();
    if(!meta){box.innerHTML='<p>Evento non disponibile per questo ruolo.</p>';return}
    if(!lastEstimate){box.innerHTML='<p>La quota sarà suggerita dalla quotazione Classic aggiornata; il Commissioner potrà correggerla.</p>';return}
    if(!lastEstimate.supported){box.innerHTML=`<div class="pc-pb-alert">⚠️ <strong>Quota manuale.</strong> ${esc(lastEstimate.why)}</div>`;return}
    const a=lastEstimate;
    box.innerHTML=`<div class="pc-pb-metrics"><div><small>Quotazione Classic</small><strong>${fmt(a.quotation)}</strong></div><div><small>Probabilità suggerita</small><strong>${(a.probability*100).toFixed(1).replace('.',',')}%</strong></div><div><small>Quota suggerita</small><strong>${fmt(a.odd)}</strong></div></div>
      <p><strong>${esc(chosen.name)}</strong> · ${esc(chosen.club)} · ${ROLE_LABELS[chosen.role]}. Quotazione riferimento di ruolo: <strong>${a.anchor}</strong> · sensibilità alla quotazione: <strong>${a.sensitivity}%</strong>.</p>
      <p>${esc(a.why)} Le probabilità base utilizzate sono gol <strong>${a.baseGoal}%</strong> e assist <strong>${a.baseAssist}%</strong>. <strong>Stima editoriale non calibrata</strong>: il listino misura il valore fantacalcistico, non la probabilità reale dell'evento.</p>`;
  }
  function recompute(){
    if(!chosen)return;
    const result=estimatePlayerEvent(chosen,event.value,settings);
    lastEstimate=result;
    odd.value=result.supported?result.odd.toFixed(2):'';
    drawEstimate();
    note(result.supported?`Quota ${fmt(result.odd)} suggerita dalla quotazione Classic ${fmt(chosen.quotation)}. Puoi correggerla o aggiungerla alla bozza.`:`${result.why} Inserisci una quota manuale.`,!result.supported);
  }
  function setPlayer(){
    const next=byLabel.get(search.value.trim())||null;
    if(!next){chosen=null;lastEstimate=null;odd.value='';drawEstimate();showSettings();note('Scegli un calciatore esatto dai suggerimenti.',true);return}
    const changed=String(chosen?.code||'')!==String(next.code);
    chosen=next;
    if(changed){event.innerHTML=(PLAYER_EVENTS[chosen.role]||[]).map(x=>`<option value="${x.key}">${esc(x.title)}${x.manual?' · MANUALE':''}</option>`).join('');event.disabled=false}
    showSettings();recompute();
  }
  search.addEventListener('change',setPlayer);
  search.addEventListener('input',()=>{if(!byLabel.has(search.value.trim())){chosen=null;lastEstimate=null;odd.value='';drawEstimate();showSettings()}});
  event.addEventListener('change',()=>{showSettings();recompute()});
  calculate.addEventListener('click',()=>{if(!chosen){setPlayer();if(!chosen)return}showSettings();recompute()});
  impact.addEventListener('input',()=>{settings.sensitivity=Number(impact.value);store();showSettings();recompute()});
  base.addEventListener('input',()=>{
    const meta=selectedEvent();if(!chosen||!meta||meta.manual||meta.derived)return;
    settings.baseline[chosen.role][event.value]=Number(base.value);
    store();showSettings();recompute();
  });
  reset.addEventListener('click',()=>{settings=getDefaultPlayerSettings();store();showSettings();recompute();note('Parametri iniziali ripristinati. Nessuna modifica alla bozza o a Supabase.')});
  apply.addEventListener('click',()=>{
    const r=getRound?.();
    if(!r||r.status!=='draft')return note('Il turno pubblicato non può essere modificato.',true);
    if(!chosen||!event.value)return note('Seleziona un calciatore e un evento.',true);
    // Number('')=0, dunque controllo esplicito di input vuoto.
    const value=odd.value.trim()===''?NaN:Number(odd.value);
    if(!Number.isFinite(value)||value<1.01||value>99999999)return note('Inserisci una quota valida (minimo 1,01).',true);
    if(!window.confirm('Questa è una quota virtuale basata sul listino e/o corretta manualmente. Confermi di averla verificata prima di inserirla nella BOZZA?'))return;
    const ok=onApply({kind:'player',player_name:chosen.name,player_role:chosen.role,player_event:event.value,qyes:value.toFixed(2)});
    if(ok!==false)note(`✅ ${chosen.name} · ${event.value} · quota ${fmt(value)} aggiunta alla BOZZA. Devi ancora salvarla e pubblicarla.`);
  });
  async function load(){
    note('Lettura quotazioni Classic attuali da Supabase…');
    try{
      roster=await loadRoster(supabase);
      byLabel=new Map(roster.map(x=>[nameLabel(x),x]));
      list.innerHTML=roster.map(x=>`<option value="${esc(nameLabel(x))}"></option>`).join('');
      const priced=roster.filter(x=>x.quotation!==null).length;
      $('pc-player-data-note').textContent=`Listino Classic aggiornato · ${roster.length} calciatori unici, ${priced} con quotazione valida. Non è necessario importare statistiche partita per calcolare le quote suggerite. Parametri euristici locali all'admin.`;
      note('Seleziona un calciatore. Quotazione, quota e probabilità verranno mostrate automaticamente.');
    }catch(e){note(`Impossibile leggere il listino: ${e.message}. Puoi comunque creare eventi manualmente nella tabella del palinsesto.`,true)}
  }
  showSettings();drawEstimate();load();
  return {refresh(){root.hidden=getRound?.()?.status!=='draft'}};
}
