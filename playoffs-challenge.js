/* Lega degli Eroi · Playoffs Challenge V3
 * Panoramica 2026/27, schedina interattiva DIMOSTRATIVA, classifiche e calendario.
 * Nessuna scrittura su Supabase. Non sostituisce l'assegnazione delle quote ufficiali.
 */
import { supabase } from './supabase.js';
import { buildModel, quoteMatch, normalizeTeam } from './bookmaker-engine.js';
import { calculateProjectedStandings } from './bookmaker-seeding.js';

const $ = id => document.getElementById(id);
const fmt = (v, d=2) => Number(v).toLocaleString('it-IT', { minimumFractionDigits:d, maximumFractionDigits:d });
const safe = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const state = {
  projection:null, matchups:[], selections:new Map(), heroSlot:null,
  isAdmin:false, loading:false, activeTab:'schedina'
};
const UPDATE_INTERVAL = 90000;
const ROUNDS = [
  {title:'Ottavi di finale', gw:30, code:'ottavi', matches:4, players:4, note:'I primi quattro della regular season sono già ai quarti.'},
  {title:'Quarti di finale', gw:31, code:'quarti', matches:4, players:4, note:'Quattro partite playoff e quattro eventi individuali.'},
  {title:'Semifinali · Andata', gw:32, code:'semi_andata', matches:2, players:6, note:'Due partite playoff e sei eventi individuali.'},
  {title:'Semifinali · Ritorno', gw:33, code:'semi_ritorno', matches:2, players:6, note:'Ritorno delle semifinali, quote distinte dall’andata.'},
  {title:'Finali', gw:34, code:'finali', matches:2, players:6, note:'Finale Scudetto e finale terzo posto.'}
];

function changeTab(tab, updateHash=true) {
  const target = ['schedina','classifiche','calendario','regole'].includes(tab) ? tab : 'schedina';
  state.activeTab = target;
  document.querySelectorAll('.pc-tab').forEach(button => {
    const active = button.dataset.tab === target;
    button.classList.toggle('active', active);
    button.setAttribute('aria-selected', String(active));
    button.tabIndex = active ? 0 : -1;
  });
  document.querySelectorAll('.pc-tabpanel').forEach(panel => {
    const active = panel.id === `pc-tab-${target}`;
    panel.classList.toggle('active', active);
    panel.hidden = !active;
  });
  if(updateHash && location.hash !== `#${target}`) history.replaceState(null,'',`#${target}`);
}

async function readTable(name, fields, modify=q=>q) {
  const {data,error} = await modify(supabase.from(name).select(fields).limit(1000));
  if(error) throw new Error(`Errore lettura ${name}: ${error.message}`);
  return data || [];
}

async function loadData(){
  const [teams,results,fixtures,history] = await Promise.all([
    readTable('teams','id,name,conference', q=>q.order('name')),
    readTable('fantacalcio_results','conference,phase,gw,team,opponent,points_for,result,is_home',q=>q.order('gw')),
    readTable('fantacalcio_fixtures','gw,home_team,away_team',q=>q.order('gw')),
    readTable('match_history','season,season_week,team_a,team_b,score_a,score_b',q=>q.eq('season','2025/26'))
  ]);
  const projection = calculateProjectedStandings(teams,results);
  if(!projection.hasSufficientData) throw new Error('Non sono ancora disponibili giornate complete della regular season.');
  const accepted = results.filter(r=>Number(r.gw)<=projection.lastCompleted && String(r.phase||'').toLowerCase()==='regular');
  const model = buildModel({teams,results:accepted,fixtures,history});
  const matchups = projection.fixtures.map(item => ({
    ...item,
    key:`${normalizeTeam(item.home.name)}:${normalizeTeam(item.away.name)}`,
    odds:quoteMatch(model,item.home.name,item.away.name,'ottavi')
  }));
  return {projection,matchups};
}

function renderGames(){
  $('pc-match-list').innerHTML = state.matchups.map(match=>{
    const slot = match.slot;
    const prediction = state.selections.get(slot);
    const hero = state.heroSlot === slot;
    const odds = [match.odds.q1,match.odds.qx,match.odds.q2];
    const buttons = ['1','X','2'].map((sign,i)=>
      `<button type="button" class="pc-odd ${prediction===sign?'selected':''}" data-pick="${slot}" data-sign="${sign}" aria-pressed="${prediction===sign}">
         <span>${sign}</span><strong>${fmt(odds[i])}</strong><small>${['Vittoria prima','Pareggio','Vittoria seconda'][i]}</small>
       </button>`).join('');
    return `<article class="pc-game" aria-label="Ottavo ${slot}">
      <div class="pc-game-top"><span>OTTAVO ${slot} · ${match.seeds[0]}ª VS ${match.seeds[1]}ª</span><span class="pc-provisional">QUOTE INDICATIVE</span></div>
      <div class="pc-game-teams">
        <div><em>SEED #${match.home.seed}</em><strong>${safe(match.home.name)}</strong><small>${match.home.points} pt · ${fmt(match.home.fp,1)} FP</small></div>
        <span class="pc-vs">VS</span>
        <div><em>SEED #${match.away.seed}</em><strong>${safe(match.away.name)}</strong><small>${match.away.points} pt · ${fmt(match.away.fp,1)} FP</small></div>
      </div>
      <div class="pc-odds" role="group" aria-label="Pronostico ${safe(match.home.name)} contro ${safe(match.away.name)}">${buttons}</div>
      <div class="pc-game-bottom"><span>${prediction ? `La tua simulazione: <b>${prediction}</b>` : 'Seleziona un segno per provare'}</span>
      <button type="button" data-hero="${slot}" class="pc-hero-pick ${hero?'active':''}" ${!prediction?'disabled':''} aria-pressed="${hero}">⭐ ${hero?'HERO PICK (+50%)':'Scegli HERO PICK'}</button></div>
    </article>`;
  }).join('');
  const picked = state.selections.size;
  $('pc-progress').textContent = `${picked}/4`;
  let points=0;
  for(const m of state.matchups){
    const sign=state.selections.get(m.slot);
    const quota= sign==='1'?m.odds.q1:sign==='X'?m.odds.qx:sign==='2'?m.odds.q2:null;
    if(quota!==null) points += quota * (state.heroSlot===m.slot ? 1.5 : 1);
  }
  $('pc-demo-points').textContent=`${fmt(points)} pt potenziali`;
  $('pc-demo-hint').textContent=picked===0?
    'Scegli qualche segno per simulare la schedina. Le quote si sommano, non si moltiplicano.' :
    `Hai provato ${picked} pronostic${picked===1?'o':'i'} sulle partite. Il punteggio è ipotetico: varrebbe solo se fossero tutti corretti. Mancano i 4 eventi calciatori.`;
}

function renderStandings(){
  $('pc-standings').innerHTML = state.projection.standings.map(team=>{
    const cls = team.seed<=4?'pc-promoted':team.seed<=12?'pc-qualified':'pc-eliminated';
    const mark = team.seed<=4?'Quarti':team.seed<=12?'Ottavi':'Fuori';
    return `<tr class="${cls}"><td><b>${team.seed}</b></td><td><strong>${safe(team.name)}</strong><span class="pc-seed-mark">${mark}</span></td><td>${team.played}</td><td><strong>${team.points}</strong></td><td>${fmt(team.fp,1)}</td></tr>`;
  }).join('');
  $('pc-ranking-note').textContent = state.projection.unresolvedTies?
    'Classifica provvisoria 3-1-0. Alcune parità non sono ancora risolte dagli scontri diretti: è stato usato temporaneamente il totale fantapunti. Vale solo il seeding ufficiale della Lega.' :
    'Classifica provvisoria 3-1-0, con scontri diretti applicati dove possibile. Vale solo il seeding ufficiale della Lega.';
}

function renderCalendar(){
  $('pc-round-list').innerHTML=ROUNDS.map((item,index)=>{
    const isFirst=index===0;
    const badge = isFirst ? 'Proiezione disponibile' : 'In attesa dei playoff';
    return `<article class="pc-round pc-panel">
      <div class="pc-round-number">${String(index+1).padStart(2,'0')}</div>
      <div class="pc-round-data"><div class="pc-round-eyebrow">GIORNATA SERIE A ${item.gw} <span>· ${badge}</span></div><h3>${item.title}</h3><p>${item.note}</p>
      <div class="pc-round-tags"><span>⚔️ ${item.matches} pronostici 1X2</span><span>⚽ ${item.players} eventi calciatori</span><span>⭐ 1 HERO PICK</span></div></div>
      ${isFirst?'<button type="button" class="pc-round-open" data-open-tab="schedina">Vedi gli ottavi →</button>':'<span class="pc-round-lock">🔒</span>'}
    </article>`;
  }).join('');
}

function renderStatus(){
  $('pc-week').textContent=`${state.projection.lastCompleted} / 29`;
  $('pc-status').textContent=state.projection.lastCompleted >= 29 ? 'Seeding da omologare' : 'Ottavi provvisori';
  $('pc-updated').textContent=new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  $('pc-preliminary-message').innerHTML=`🔒 <strong>Simulazione, non una schedina ufficiale.</strong> Gli ottavi e le quote si basano sulle prime ${state.projection.lastCompleted} giornate complete. `+
    (state.projection.pending?'Una giornata è in fase di caricamento: aspettiamo tutti i risultati. ':'')+
    (state.projection.unresolvedTies?'Alcuni spareggi in classifica sono ancora provvisori. ':'')+
    'Nessun pronostico viene salvato.';
}

async function refresh(silent=false){
  if(state.loading || (silent && document.hidden)) return;
  state.loading=true;
  try {
    const snapshot=await loadData();
    const previous = state.matchups.map(m=>m.key).join('|');
    const next = snapshot.matchups.map(m=>m.key).join('|');
    if(previous!==next){state.selections.clear();state.heroSlot=null;}
    state.projection=snapshot.projection;
    state.matchups=snapshot.matchups;
    renderStatus();renderStandings();renderGames();
    $('pc-error').hidden=true;
    $('pc-loading').hidden=true;
    $('pc-app').hidden=false;
  }catch(error){
    console.error('Playoffs Challenge V3:',error);
    if(!silent || !state.projection){$('pc-error').textContent=String(error.message||error);$('pc-error').hidden=false;$('pc-loading').hidden=true;}
  }finally{state.loading=false;}
}

$('pc-match-list').addEventListener('click',event=>{
  const selected=event.target.closest('button[data-pick]');
  if(selected){
    const slot=Number(selected.dataset.pick),sign=selected.dataset.sign;
    const old=state.selections.get(slot);
    if(old===sign){state.selections.delete(slot);if(state.heroSlot===slot)state.heroSlot=null;}
    else state.selections.set(slot,sign);
    renderGames();return;
  }
  const star=event.target.closest('button[data-hero]');
  if(star){
    const slot=Number(star.dataset.hero);
    if(!state.selections.has(slot)) return;
    state.heroSlot=state.heroSlot===slot?null:slot;
    renderGames();
  }
});
$('pc-clear').addEventListener('click',()=>{state.selections.clear();state.heroSlot=null;renderGames();});
document.querySelectorAll('.pc-tab').forEach(tab=>tab.addEventListener('click',()=>changeTab(tab.dataset.tab)));
$('pc-round-list').addEventListener('click',event=>{if(event.target.closest('[data-open-tab]'))changeTab('schedina');});
window.addEventListener('hashchange',()=>changeTab(location.hash.slice(1),false));

(async function init(){
  changeTab(location.hash.slice(1),false);
  renderCalendar();
  try{
    const {data:{user},error}=await supabase.auth.getUser();
    if(error || !user) throw new Error('Per accedere alla Playoffs Challenge devi effettuare il login alla Lega.');
    const {data:admin,error:adminError}=await supabase.rpc('totoeroi_is_admin');
    state.isAdmin=!adminError && admin===true;
    $('pc-admin-shortcut').hidden=!state.isAdmin;
    await refresh();
    setInterval(()=>refresh(true),UPDATE_INTERVAL);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh(true);});
  }catch(error){
    console.error('Playoffs Challenge init:',error);
    $('pc-loading').hidden=true;
    $('pc-error').textContent=String(error.message||error);
    $('pc-error').hidden=false;
  }
})();
