import {createPlayerHistoryModel,estimateHistoricalEvent} from './bookmaker-player-history.js?v=pc-v9-1-assistfix';
import {mountPlayerHistoryImport} from './bookmaker-player-import.js';
import {createGoalkeeperModel,estimateGoalkeeperEvent} from './bookmaker-goalkeeper.js?v=pc-v9-5';
/* Lega degli Eroi · Playoffs Challenge V9
 * Bookmaker calciatori basato su quotazioni CLASSIC correnti.
 * Calibrazione EDITORIALE, non probabilita' di mercato o storico validato.
 * I parametri sono esclusivamente locali nel browser dell'admin.
 * Nessun salvataggio o pubblicazione automatica su Supabase.
 */
export const PLAYER_EVENTS = {
  P: [
    {key:'CLEAN_SHEET',title:'Clean sheet'},
    {key:'PENALTY_SAVE',title:'Rigore parato'}
  ],
  D: [
    {key:'GOAL',title:'Segna almeno un gol'},
    {key:'ASSIST',title:'Fa almeno un assist'}
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
  sensitivity:40,
  priorStrength:15,
  baseline:{D:{GOAL:5,ASSIST:7},C:{GOAL:12,ASSIST:11},A:{GOAL:28,ASSIST:11}}
});
const CONFIG_KEY='lega_pc_bookmaker_players_v9';
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
  const prior=Number(raw.priorStrength);if(Number.isFinite(prior))cfg.priorStrength=clamp(Math.round(prior),5,60);
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
export async function loadRoster(supabase){
  // Il listone 2026/27 e' la sorgente dei calciatori ammessi. Gli archivi
  // 2024/25 e 2025/26 servono SOLO al calcolo delle probabilita'.
  // La RPC espone il listone corrente anche agli allenatori, senza dare
  // accesso diretto agli archivi statistici protetti dell'admin.
  const {data:items,error}=await supabase.rpc('pc_current_season_roster');
  if(error)throw new Error('Listone 2026/27: '+error.message);
  if(!Array.isArray(items)||!items.length)throw new Error('Listone 2026/27 vuoto. Importa il file statistiche aggiornato.');
  const uniq=new Map();
  for(const x of items){
    const code=String(x.external_id||'').trim(),role=String(x.role_classic||'').trim();
    if(!code||!PLAYER_EVENTS[role]||!x.name||!x.serie_a_team)continue;
    const price=x.quotation_classic===null||x.quotation_classic===undefined||x.quotation_classic===''?null:Number(x.quotation_classic);
    const item={code,name:String(x.name).trim(),club:String(x.serie_a_team).trim(),role,mantra:String(x.role_mantra||'').trim(),
      quotation:price!==null&&Number.isFinite(price)&&price>=1?price:null,updated:x.updated_at||''};
    const prev=uniq.get(code);
    // Il listino può contenere lo stesso codice in più Conference. Preferisci
    // il record con quotazione valida e, a parità, l'aggiornamento più recente.
    if(!prev||(prev.quotation===null&&item.quotation!==null)||
      ((prev.quotation===null)===(item.quotation===null)&&item.updated>prev.updated))uniq.set(code,item);
  }
  return [...uniq.values()].sort((a,b)=>a.name.localeCompare(b.name,'it'));
}

async function loadHistoricalSnapshots(supabase){
  const results=[];
  for(const season of ['2024/25','2025/26','2026/27']){
    const {data:latest,error:e0}=await supabase.from('pc_player_snapshots').select('gw')
      .eq('season',season).order('gw',{ascending:false}).limit(1);
    if(e0)throw new Error('Archivio statistiche: '+e0.message);
    if(!latest?.length)continue;
    const gw=latest[0].gw;
    for(let start=0;start<1500;start+=800){
      const {data,error}=await supabase.from('pc_player_snapshots')
       .select('season,gw,player_code,role_classic,role_mantra,appearances,goals,assists,goals_conceded,penalties_saved')
       .eq('season',season).eq('gw',gw).order('player_code').range(start,start+799);
      if(error)throw new Error('Archivio statistiche: '+error.message);
      results.push(...(data||[]));
      if(!data||data.length<800)break;
    }
  }
  const h=createPlayerHistoryModel(results);
  h.keeperModel=createGoalkeeperModel(results);
  return h;
}

export function mountPlayerBookmaker({supabase,onApply,getRound,onRosterLoaded}){
  const root=$('pc-player-bookmaker');
  if(!root)return {refresh(){}};
  let roster=[],byLabel=new Map(),chosen=null,lastEstimate=null,history=null;
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
    base.disabled=false;base.min='5';base.max='60';base.step='1';
    base.value=String(settings.priorStrength);baseOut.textContent=settings.priorStrength+' presenze';
    const mantra=chosen?.mantra||'—';
    help.textContent=history?.hasHistoricalSeasons?
      `Stima sulla base del ruolo Mantra (${mantra}), dello storico personale 2024-2027 e della quotazione Classic. La forza della media Mantra controlla quanto prudentemente rientriamo verso i dati del ruolo.`:
      'Importa prima i file 2024/25 e 2025/26 per attivare il modello storico Mantra. Fino ad allora resta attiva la stima V8 basata sulla quotazione Classic.';
  }
  function getEventEstimate(player,ev){
    if(player.role==='P')return history?.keeperModel?estimateGoalkeeperEvent(player,ev,history.keeperModel):{supported:false,manual:true,reason:'Storico portieri non disponibile: attendi il caricamento.'};
    return history?.hasHistoricalSeasons?estimateHistoricalEvent(player,ev,history,settings):estimatePlayerEvent(player,ev,settings);
  }
  function drawEstimate(){
    const box=$('pc-player-evidence');
    if(!chosen){box.innerHTML='<p>Seleziona un calciatore dal listino.</p>';return}
    const meta=selectedEvent();
    if(!meta){box.innerHTML='<p>Evento non disponibile per questo ruolo.</p>';return}
    if(!lastEstimate){box.innerHTML='<p>La quota sarà suggerita dalla quotazione Classic aggiornata; il Commissioner potrà correggerla.</p>';return}
    if(!lastEstimate.supported){box.innerHTML=`<div class="pc-pb-alert">⚠️ <strong>Quota manuale.</strong> ${esc(lastEstimate.why)}</div>`;return}
    const a=lastEstimate;
    if(a.goalkeeperEvidence){
      const k=a.goalkeeperEvidence;
      box.innerHTML=`<div class="pc-pb-metrics"><div><small>Probabilità di giocare</small><strong>${fmt(k.pPlay*100)}%</strong></div><div><small>Probabilità evento</small><strong>${fmt(a.probability*100)}%</strong></div><div><small>Quota suggerita</small><strong>${fmt(a.odd)}</strong></div></div><p><strong>${esc(chosen.name)}</strong> · ${esc(a.confidence)} · ${esc(a.reason)}</p><p>Stagione attuale: ${k.currentApps} presenze, ${k.currentGoals} gol subiti, ${k.currentSaves} rigori parati. Peso stagione corrente clean sheet: ${fmt(k.seasonWeight*100)}%.</p>`;
      return;
    }
    if(a.seasonEvidence){
      const entries=a.seasonEvidence.map(x=>`<tr><td>${esc(x.season)}</td><td>${x.pv}</td><td>${x.goals}</td><td>${x.assists}</td></tr>`).join('');
      const roleValues=a.roleComponents.map(x=>`${esc(x.role)} ${(x.weight*100).toFixed(0)}%`).join(' + ');
      box.innerHTML=`<div class="pc-pb-metrics"><div><small>Quotazione Classic</small><strong>${fmt(chosen.quotation)}</strong></div><div><small>Probabilità per presenza</small><strong>${(a.probability*100).toFixed(1).replace('.',',')}%</strong></div><div><small>Quota consigliata</small><strong>${fmt(a.odd)}</strong></div></div>
       <p><strong>${esc(chosen.name)}</strong> · Mantra: <b>${roleValues}</b> · ${esc(a.confidence)}.</p>
       <div class="pc-pb-history-table"><table><thead><tr><th>Stagione</th><th>Presenze</th><th>Gol</th><th>Assist</th></tr></thead><tbody>${entries||'<tr><td colspan="4">Nessuna presenza storica: prior Mantra</td></tr>'}</tbody></table></div>
       <p>Media ruolo: ${fmt(a.priorG*100)} gol e ${fmt(a.priorA*100)} assist ogni 100 presenze. Peso effettivo dello storico personale: <b>${(a.trust*100).toFixed(0)}%</b>. ${esc(a.reason)}</p>`;
      return;
    }
    box.innerHTML=`<div class="pc-pb-metrics"><div><small>Quotazione Classic</small><strong>${fmt(a.quotation)}</strong></div><div><small>Probabilità suggerita</small><strong>${(a.probability*100).toFixed(1).replace('.',',')}%</strong></div><div><small>Quota suggerita</small><strong>${fmt(a.odd)}</strong></div></div>
      <p><strong>${esc(chosen.name)}</strong> · ${esc(chosen.club)} · ${ROLE_LABELS[chosen.role]}. <strong>Modello V8 di riserva</strong>, ancora senza archivio storico completo: i dati Mantra diventano disponibili dopo l'importazione dei file storici.</p>`;
  }
  function recompute(){
    if(!chosen)return;
    const result=getEventEstimate(chosen,event.value);
    lastEstimate=result;
    odd.value=result.supported?result.odd.toFixed(2):'';
    drawEstimate();
    note(result.supported?`Quota ${fmt(result.odd)} suggerita da ${result.seasonEvidence?'statistiche storiche e ruoli Mantra':'quotazione Classic'}. Puoi correggerla o aggiungerla alla bozza.`:`${result.why||result.reason||'Stima non disponibile.'} Inserisci una quota manuale.`,!result.supported);
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
    settings.priorStrength=Number(base.value);
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
      $('pc-player-data-note').textContent=`Listone 2026/27 · ${roster.length} calciatori attuali, ${priced} con quotazione valida. Caricamento dello storico…`;
      onRosterLoaded?.();
      note('Lettura delle tre stagioni storiche…');
      await reloadHistory();
      note('Seleziona un calciatore: la stima sarà per ruolo Mantra e rendimento storico.');
    }catch(e){note(`Impossibile leggere il listino: ${e.message}. Puoi comunque creare eventi manualmente nella tabella del palinsesto.`,true)}
  }
  async function reloadHistory(){
    try{
      history=await loadHistoricalSnapshots(supabase);
      const c=history.seasonCounts;
      $('pc-player-data-note').textContent=`Archivio ${c['2024/25']} (2024/25), ${c['2025/26']} (2025/26), ${c['2026/27']} (2026/27) giocatori. ${history.hasHistoricalSeasons?'✅ Modello storico Mantra attivo.':'⚠️ Importa entrambe le stagioni passate per attivare il modello V9.'} Quote suggerite per presenza, revisione manuale obbligatoria.`;
    }catch(e){history=null;$('pc-player-data-note').textContent='Archivio non disponibile: '+e.message+' · Usa il generatore Classic V8 di riserva.';}
    showSettings();if(chosen)recompute();
  }
  mountPlayerHistoryImport({supabase,onImported:reloadHistory});
  showSettings();drawEstimate();load();
  return {
    refresh(){root.hidden=getRound?.()?.status!=='draft'},
    roster(){return roster.map(p=>({...p}))},
    isReady(){return roster.length>0&&Boolean(history?.hasHistoricalSeasons)},
    keeperEstimate(code,event){const p=roster.find(x=>Number(x.code)===Number(code));return p?.role==='P'?getEventEstimate(p,event):null},
    catalogue(manual={}){
      if(!roster.length)throw new Error('Il listino calciatori non è ancora stato caricato.');
      if(!history?.hasHistoricalSeasons)throw new Error('Archivio Mantra incompleto: importa prima i due Excel storici.');
      const out=[];let supported=0,editorial=0;
      for(const player of roster){
        for(const eventSpec of (PLAYER_EVENTS[player.role]||[])){
          let q;
          const m=getEventEstimate(player,eventSpec.key);
          if(m.supported){q=m.odd;supported++;}
          else if(m.manual){q=Number(manual[`${player.role}:${eventSpec.key}`]);editorial++;}
          else continue;
          if(!Number.isFinite(q)||q<1.01||q>10000)throw new Error('Quota editoriale mancante/non valida per '+player.role+':'+eventSpec.key);
          out.push({code:Number(player.code),role:player.role,ev:eventSpec.key,q:Number(q.toFixed(2))});
        }
      }
      return {rows:out,supported,editorial,players:roster.length};
    }
  };
}
