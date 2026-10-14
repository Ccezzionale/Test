import { supabase } from './supabase.js';
import { buildModel, quoteMatch, probsToOdds, normalizeTeam } from './bookmaker-engine.js';

const STAGES = Object.freeze({
  ottavi: { label: 'Ottavi', max: 4 },
  quarti: { label: 'Quarti', max: 4 },
  semi_andata: { label: 'Semifinali di andata', max: 2 },
  semi_ritorno: { label: 'Semifinali di ritorno', max: 2 },
  finali: { label: 'Finali', max: 2 }
});

const $ = (id) => document.getElementById(id);
const fmt = (value, digits = 2) => Number(value).toLocaleString('it-IT', {minimumFractionDigits:digits, maximumFractionDigits:digits});
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let model = null;
let estimate = null;
let slate = [];

function showError(message) {
  $('loading').hidden = true;
  $('error').hidden = false;
  $('error').textContent = String(message);
}

function status(message) { $('slate-feedback').textContent = message; }

async function requireAdmin() {
  const {data:{user}, error} = await supabase.auth.getUser();
  if (error || !user) throw new Error('Accedi alla Lega prima di aprire il Bookmaker.');
  // Il controllo d'accesso è solo per questa pagina di anteprima.
  // La futura pubblicazione userà obbligatoriamente RPC server-side protette.
  const {data:admin, error:rpcError} = await supabase.rpc('totoeroi_is_admin');
  if (!rpcError && admin === true) return;
  const {data:profile, error:profileError} = await supabase.from('profiles').select('role').eq('id',user.id).maybeSingle();
  if (profileError || profile?.role !== 'admin') throw new Error('Anteprima riservata agli amministratori della Lega.');
}

async function queryAll(table, fields, transform = query => query) {
  const {data,error} = await transform(supabase.from(table).select(fields).limit(1000));
  if (error) throw new Error(`Impossibile leggere ${table}: ${error.message}`);
  return data || [];
}

function selectTeams(teams) {
  const list = teams.map(team => `<option value="${escapeHtml(team.name)}">${escapeHtml(team.name)}</option>`).join('');
  $('home-team').innerHTML = list;
  $('away-team').innerHTML = list;
  const homeIndex = teams.findIndex(t => normalizeTeam(t.name) === 'teambartowski');
  const awayIndex = teams.findIndex(t => normalizeTeam(t.name) === 'goldenknights');
  $('home-team').selectedIndex = homeIndex >= 0 ? homeIndex : 0;
  $('away-team').selectedIndex = awayIndex >= 0 ? awayIndex : 1;
}

async function initialize() {
  try {
    await requireAdmin();
    const [teams, results, fixtures, history] = await Promise.all([
      queryAll('teams','id,name,conference', q => q.order('name')),
      queryAll('fantacalcio_results','conference,phase,gw,team,opponent,points_for,is_home',q => q.order('gw')),
      queryAll('fantacalcio_fixtures','gw,home_team,away_team'),
      queryAll('match_history','season,season_week,team_a,team_b,score_a,score_b',q => q.eq('season','2025/26'))
    ]);
    if(teams.length < 2) throw new Error('La tabella teams non contiene almeno due franchigie.');
    model = buildModel({teams,results,fixtures,history});
    selectTeams(teams);
    $('latest-gw').textContent = String(model.metadata.latestRound);
    $('sample-count').textContent = String(model.metadata.currentRows);
    $('league-mean').textContent = `${fmt(model.metadata.leagueAverage)} FP`;
    $('loading').hidden = true;
    $('app').hidden = false;
    calculate();
    renderSlate();
  } catch(error) { console.error('Bookmaker init:',error); showError(error.message || error); }
}

function calculate() {
  $('calc-error').hidden = true;
  $('estimate').hidden = true;
  try {
    estimate = quoteMatch(model,$('home-team').value,$('away-team').value,$('stage').value);
    for(const [sign,key] of [['1','p1'],['x','px'],['2','p2']]) {
      $(`odd-${sign}`).textContent = fmt(estimate[`q${sign}`]);
      $(`prob-${sign}`).textContent = `${fmt(estimate[key]*100,1)}%`;
    }
    $('bonus-label').textContent = estimate.homeBonus ? '+2 casa semifinale' : 'Campo neutro';
    const profileHtml = p => `<div><b>${escapeHtml(p.name)}</b>Attuali: ${p.currentGames} partite · Storico: ${p.historyGames}<br>Media prevista: ${fmt(p.expected)} FP · σ ${fmt(p.volatility)}<br>Affidabilità: ${escapeHtml(p.confidence)}</div>`;
    $('team-evidence').innerHTML = profileHtml(estimate.homeProfile) + profileHtml(estimate.awayProfile);
    $('estimate').hidden = false;
  } catch(error) {
    estimate = null;
    $('calc-error').textContent = error.message;
    $('calc-error').hidden = false;
  }
}

function addMatch() {
  if (!estimate) return;
  const max = STAGES[$('stage').value].max;
  if(slate.length >= max) return status(`Il turno consente soltanto ${max} partite.`);
  const existing = slate.find(item => [item.home,item.away].some(name => [estimate.home,estimate.away].some(n => normalizeTeam(n) === normalizeTeam(name))));
  if (existing) return status('Ogni franchigia può comparire una sola volta nello stesso turno.');
  slate.push({
    home:estimate.home,away:estimate.away,stage:estimate.stage,homeBonus:estimate.homeBonus,
    p1:Number((estimate.p1*100).toFixed(4)),px:Number((estimate.px*100).toFixed(4)),p2:Number((estimate.p2*100).toFixed(4)),
    initial_probs:[estimate.p1,estimate.px,estimate.p2], reviewed:false, reviewedAt:null,
    evidence:{home:{expected:estimate.homeProfile.expected,sigma:estimate.homeProfile.volatility,currentGames:estimate.homeProfile.currentGames},away:{expected:estimate.awayProfile.expected,sigma:estimate.awayProfile.volatility,currentGames:estimate.awayProfile.currentGames}}
  });
  status('Confronto aggiunto. Puoi rivedere le probabilità prima di esportare.');
  renderSlate();
}

function rowValid(row) {
  try { row.odds = probsToOdds(row.p1,row.px,row.p2); return true; }
  catch(e){row.odds=null;return false;}
}
function renderSlate() {
  const max = STAGES[$('stage').value].max;
  $('slate-count').textContent = `${slate.length}/${max}`;
  $('slate-empty').hidden = !!slate.length;
  $('slate-list').innerHTML = slate.map((row,i) => `
    <div class="draft-card" data-index="${i}">
      <div class="draft-top"><strong>${i+1}. ${escapeHtml(row.home)} <span style="color:#f3cb70">vs</span> ${escapeHtml(row.away)}</strong><button type="button" data-remove="${i}">Rimuovi</button></div>
      <div class="draft-fields">${[['1','p1'],['X','px'],['2','p2']].map(([label,k],idx)=>`<label>${label} · probabilità (%)<input type="number" min="0.01" max="99.98" step="0.01" data-field="${k}" data-index="${i}" value="${Number(row[k]).toFixed(2)}"><div class="resulting-odd" data-odd="${idx}">Quota —</div></label>`).join('')}</div>
      <div class="draft-error" role="status"></div>
      <label class="approve-check"><input type="checkbox" data-approved="${i}" ${row.reviewed ? "checked" : ""}> <span>Confermo le probabilità di questo confronto</span></label>
    </div>`).join('');
  refreshAllValidations();
}
function refreshAllValidations() {
  let allValid = true;
  for(let i=0;i<slate.length;i++){
    const valid = rowValid(slate[i]);
    allValid = allValid && valid && slate[i].reviewed;
    const card = $('slate-list').querySelector(`[data-index="${i}"].draft-card`);
    if(!card) continue;
    card.querySelector('.draft-error').textContent = !valid ? 'La somma delle tre probabilità deve essere esattamente 100% e ogni valore maggiore di zero.' : (!slate[i].reviewed ? 'In attesa della conferma del Commissioner.' : '');
    card.querySelectorAll('[data-odd]').forEach((el,index)=>{el.textContent = valid ? `Quota ${fmt(slate[i].odds[index])}` : 'Quota —';});
  }
  $('export').disabled = !slate.length || !allValid;
}
function removeMatch(index) { slate.splice(index,1);status('Confronto rimosso.');renderSlate(); }
function exportJson() {
  refreshAllValidations();
  if($('export').disabled) return;
  const stage = $('stage').value;
  const payload={
    tool:'Bookmaker degli Eroi',version:'1.0',status:'reviewed_draft_not_published',season:'2026/27',stage,
    stage_label:STAGES[stage].label,created_at:new Date().toISOString(),
    model:{source_current:'fantacalcio_results',source_history:'match_history 2025/26',sample_latest_gw:model.metadata.latestRound,mode:'normal_fantapoints_goal_buckets',home_factor:stage.startsWith('semi_')?2:0,odds_margin:0},
    matches:slate.map((row,i)=>({slot:i+1,home_team:row.home,away_team:row.away,probabilities:{'1':Number((row.p1/100).toFixed(8)),'X':Number((row.px/100).toFixed(8)),'2':Number((row.p2/100).toFixed(8))},odds:{'1':row.odds[0],'X':row.odds[1],'2':row.odds[2]},home_bonus:row.homeBonus,reviewed_at:row.reviewedAt,evidence:row.evidence}))
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('a');
  link.href=url;link.download=`bookmaker-2026-27-${stage}-bozza.json`;document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  status('Bozza esportata. Nessuna quota è stata pubblicata o salvata nel database.');
}

$('calculate').addEventListener('click',calculate);
$('add-match').addEventListener('click',addMatch);
$('stage').addEventListener('change',function(){
  if(slate.length && !window.confirm('Cambiare turno azzera il palinsesto in preparazione. Continuare?')){
    this.value=slate[0].stage;return;
  }
  slate=[];status('');renderSlate();calculate();
});
$('home-team').addEventListener('change',()=>{estimate=null;$('estimate').hidden=true;});
$('away-team').addEventListener('change',()=>{estimate=null;$('estimate').hidden=true;});
$('reset-slate').addEventListener('click',()=>{if(slate.length && !confirm('Svuotare il palinsesto in preparazione?')) return;slate=[];renderSlate();status('Palinsesto svuotato.');});
$('export').addEventListener('click',exportJson);
$('slate-list').addEventListener('click',e=>{const button=e.target.closest('[data-remove]');if(button)removeMatch(Number(button.dataset.remove));});
$('slate-list').addEventListener('input',e=>{
  const input=e.target.closest('input[data-field]');if(!input)return;
  const row=slate[Number(input.dataset.index)];if(!row)return;
  row[input.dataset.field]=input.value === '' ? NaN : Number(input.value);
  row.reviewed=false;row.reviewedAt=null;
  const card=input.closest('.draft-card');
  const check=card?.querySelector('[data-approved]');
  if(check) check.checked=false;
  refreshAllValidations();
});
$('slate-list').addEventListener('change',e=>{
  const check=e.target.closest('input[data-approved]');if(!check)return;
  const row=slate[Number(check.dataset.approved)];if(!row)return;
  row.reviewed=Boolean(check.checked);row.reviewedAt=row.reviewed?new Date().toISOString():null;
  refreshAllValidations();
});
initialize();
