/* Admin-only test surface. Private Supabase reads protected by Phase 1 RLS.
   No writes. No public vote publication. */
import {supabase} from './supabase.js';
import {calculateRound,requiredForWin,normalize} from './match-live-engine.js';

const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fp = v => Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:1,maximumFractionDigits:2});
let data=null;
let selected=null;
let currentOverride=null;
let loading=false;

function showAlert(message,isError=false){
  const el=$('live-alert');el.hidden=false;el.textContent=message;el.className='live-alert'+(isError?' error':'');
}
async function loadData(event){
  event?.preventDefault();if(loading)return;
  const season=$('live-season').value.trim(),gw=Number($('live-gw').value),fixtureGw=Number($('live-fixture-gw').value),competition=$('live-comp').value;
  if(!/^20\d\d\/\d\d$/.test(season)||!Number.isInteger(gw)||gw<1||gw>50||!Number.isInteger(fixtureGw)||fixtureGw<1||fixtureGw>50){showAlert('Stagione/giornata non valide.',true);return;}
  const button=$('live-filter').querySelector('button');
  loading=true;button.disabled=true;button.textContent='Elaborazione…';
  try {
    const [f,v,fx,vi]=await Promise.all([
      supabase.from('mc_formation_players').select('season,gw,competition,team_name,opponent_name,module,slot_type,slot_index,role,player_name,club_code,switch_state').eq('season',season).eq('gw',gw).eq('competition',competition).order('team_name').order('slot_type').order('slot_index'),
      supabase.from('mc_vote_players').select('season,gw,player_code,player_name,club_name,vote_raw,vote_numeric,status,stats').eq('season',season).eq('gw',gw),
      supabase.from('fantacalcio_fixtures').select('conference,phase,gw,home_team,away_team').eq('conference',competition).eq('gw',fixtureGw),
      supabase.from('mc_vote_imports').select('clubs_count,players_count,imported_at').eq('season',season).eq('gw',gw).maybeSingle()
    ]);
    if(f.error)throw f.error;
    if(v.error)throw v.error;
    if(!f.data?.length)throw new Error('Nessuna formazione importata per questa competizione/giornata. Torna alla pagina Importazioni.');
    if(!vi.data || !v.data?.length)throw new Error('Non ci sono ancora voti importati per questa giornata.');
    // In assenza fixture, il motore sospende il +2 casa e avvisa, non inventa chi gioca in casa.
    const fixtureRows=fx.error?[]:(fx.data||[]);
    data={season,gw,competition,fixtureGw,formations:f.data,votes:v.data,fixtures:fixtureRows,importedAt:vi.data.imported_at,fixtureError:fx.error?.message||null};
    selected=null;currentOverride=null;
    renderRound();
    if(fx.error)showAlert('Impossibile leggere fantacalcio_fixtures: '+fx.error.message,true);
    else if(!fixtureRows.length && competition!=='Unificata')showAlert('Calendario non trovato: i +2 della squadra di casa sono sospesi finché non identifichiamo la squadra ospitante.',true);
    else $('live-alert').hidden=true;
  }catch(error){
    $('live-match-list').innerHTML='';$('live-detail').hidden=true;
    showAlert(error.message||String(error),true);
  }finally{loading=false;button.disabled=false;button.textContent='Calcola proiezioni';}
}
function getRound(overrides={}){
  return calculateRound({...data,overrides});
}
function metrics(team){
  const factor=team.defensiveFactor||{};
  return `<div class="live-mini-card"><h3>${esc(team.team)}</h3>
    <div class="live-metric"><span>Somma fantavoti</span><b>${fp(team.baseFP)}</b></div>
    <div class="live-metric"><span>Fattore campo</span><b>${team.fieldBonus>0?'+':''}${fp(team.fieldBonus)}</b></div>
    <div class="live-metric"><span>Fattore difensivo</span><b>+${fp(factor.bonus)}</b></div>
    <div class="live-metric"><span>Malus Mantra</span><b>-${fp(team.roleMalus)}</b></div>
    <div class="live-metric"><span>Modulo calcolato</span><b>${esc(team.selectedModule||'Non valido')}</b></div>
    <div class="live-metric"><span>Sostituzioni</span><b>${team.substitutions}/5</b></div>
    <div class="live-metric"><span>Voti ancora stimati</span><b>${team.pending}</b></div>
    <div class="live-metric"><span>Totale stimato</span><b>${fp(team.total)} FP</b></div>
    </div>`;
}
function tinyPlayers(team){
  const used=new Set((team.benchUsed||[]).map(x=>normalize(x.player_name)));
  return `<div class="live-mini-card"><h3>${esc(team.team)}</h3><table class="live-player-table"><thead><tr><th>Calciatore (campo)</th><th>Stato</th><th>FV</th></tr></thead><tbody>`+
    team.onField.map(p=>`<tr><td>${esc(p.player_name)}${used.has(normalize(p.player_name))?' ↥':''}</td><td class="${esc(p.status)}">${p.status==='pending'?'6 stim.':p.status==='rated'?'Voto':p.status==='simulated'?'Prova':esc(p.status)}</td><td>${fp(p.fantavote)}</td></tr>`).join('')+
    `</tbody></table></div>`;
}
function future(team){return team.onField.filter(p=>p.status==='pending');}
function winText(team,opponent){
  if(team.goals>opponent.goals)return `${team.team} è virtualmente avanti ${team.goals}-${opponent.goals}. Mancano ${team.pending} voti reali.`;
  const win=requiredForWin(opponent.goals,team.total);
  return `A ${team.team} servono almeno ${fp(win.missing)} FP in più per raggiungere ${fp(win.target)} FP e superare i ${opponent.goals} gol avversari.`;
}
function renderRound(){
  const r=getRound();
  $('live-summary').textContent=`${r.matches.length} incontri • ${r.clubCount} club di Serie A nei voti • ${r.playersCount} righe • ultima importazione ${new Date(data.importedAt).toLocaleString('it-IT')}. Risultati NON ufficiali.`;
  $('live-match-list').innerHTML=r.matches.map((m,i)=>{
    if(m.error||m.homeScore.error||m.awayScore.error)return `<div class="live-match-card">${esc(m.error||m.homeScore.error||m.awayScore.error)}</div>`;
    const h=m.homeScore,a=m.awayScore;
    return `<button class="live-match-card" type="button" data-match-index="${i}" aria-pressed="${selected===i}">
      <div class="live-match-head"><span>Giornata ${data.gw} • Proiezione</span><span class="live-match-status">${h.pending+a.pending?'IN CORSO':'VOTI DISPONIBILI'}</span></div>
      <div class="live-duel"><div><strong>${esc(m.home)}</strong><span>${fp(h.total)} FP</span></div><div class="live-score">${h.goals} <b>–</b> ${a.goals}</div><div><strong>${esc(m.away)}</strong><span>${fp(a.total)} FP</span></div></div>
      <div class="live-card-foot ${m.issues.length?'warn':''}">${h.pending+a.pending} valutazioni ancora stimate • ${m.issues.length?'Calendario da verificare':'Apri analisi e simulatore'}</div>
    </button>`;
  }).join('');
  $('live-match-list').querySelectorAll('[data-match-index]').forEach(el=>el.addEventListener('click',()=>{
    selected=Number(el.dataset.matchIndex);currentOverride=null;
    renderRound();renderDetails();
  }));
  if(selected!==null)renderDetails();
  else $('live-detail').hidden=true;
}
function renderDetails(){
  const container=$('live-detail');
  const initial=getRound();
  const match=initial.matches[selected];if(!match||match.error||match.homeScore.error||match.awayScore.error){container.hidden=true;return;}
  const h=match.homeScore,a=match.awayScore;
  const allPending=[...future(h),...future(a)];
  const details=`<div class="live-section"><div class="live-head">⚽ Risultato simulato • ${esc(match.home)} vs ${esc(match.away)}</div><div class="live-body"><div class="live-main-result"><div><strong>${esc(match.home)}</strong><div class="live-fp">${fp(h.total)} FP</div><div class="live-subline">${h.pending} in attesa</div></div><div class="live-goals">${h.goals} – ${a.goals}</div><div><strong>${esc(match.away)}</strong><div class="live-fp">${fp(a.total)} FP</div><div class="live-subline">${a.pending} in attesa</div></div></div></div></div>
    <div class="live-section"><div class="live-head">🎯 Cosa serve per vincere</div><div class="live-body live-insights"><div class="live-insight"><h3>${esc(h.team)}</h3><p>${esc(winText(h,a))}</p></div><div class="live-insight"><h3>${esc(a.team)}</h3><p>${esc(winText(a,h))}</p></div></div></div>
    <div class="live-section"><div class="live-head">📊 Analisi dei fantapunti</div><div class="live-body live-breakdown">${metrics(h)}${metrics(a)}</div></div>
    <div class="live-section"><div class="live-head">👥 Giocatori calcolati</div><div class="live-body live-player-grid">${tinyPlayers(h)}${tinyPlayers(a)}</div></div>
    <div class="live-section"><div class="live-head">🎚️ Simulatore interattivo</div><div class="live-body live-simulator">
    ${allPending.length?`<div class="live-controls">
      <label>Giocatore ancora da valutare<select id="live-sim-player">${allPending.map((p,i)=>`<option value="${i}">${esc(p.player_name)} • ${esc(p.team_name)}</option>`).join('')}</select></label>
      <label>Voto ipotetico: <strong id="live-vote-label">6,0</strong><input id="live-sim-vote" type="range" min="3" max="9" step="0.5" value="6"></label>
      <div class="live-check-row"><label><input id="live-sim-goal" type="checkbox"> Gol (+3)</label><label><input id="live-sim-assist" type="checkbox"> Assist (+1)</label></div>
      <div class="live-check-row"><button type="button" id="live-sim-reset" class="live-btn">Azzera simulazione</button></div>
      </div><div class="live-whatif" id="live-sim-result">Seleziona un voto o un bonus.</div>`
      :`<div>Nessun calciatore ancora da valutare in questa sfida.</div>`}
    </div></div>
    <div class="live-section"><div class="live-head">⚠️ Controlli e limitazioni</div><div class="live-body">${[...new Set([...match.issues,...h.warnings,...a.warnings,'Assist gold/soft e gol vittoria/pareggio non sono distinguibili nel file Excel: eventuali differenze vanno confrontate con Fantacalcio.'])].map(w=>`<p class="live-warning-line">• ${esc(w)}</p>`).join('')}</div></div>`;
  container.innerHTML=details;
  container.className='live-detail';container.hidden=false;
  if(allPending.length){
    const choose=$('live-sim-player'),slider=$('live-sim-vote'),goal=$('live-sim-goal'),assist=$('live-sim-assist');
    const update=()=>{
      const player=allPending[Number(choose.value)];
      $('live-vote-label').textContent=fp(slider.value);
      const key=normalize(player.team_name)+'|'+normalize(player.player_name);
      const override={[key]:{vote:Number(slider.value),goal:goal.checked?1:0,assist:assist.checked?1:0}};
      const sim=getRound(override).matches[selected];
      if(sim?.homeScore?.error||sim?.awayScore?.error)return;
      $('live-sim-result').innerHTML=`<strong>${esc(sim.home)}</strong><b>${fp(sim.homeScore.total)} FP (${sim.homeScore.goals} gol)</b><br><strong>${esc(sim.away)}</strong><b>${fp(sim.awayScore.total)} FP (${sim.awayScore.goals} gol)</b><p class="live-small-note">Il 6 provvisorio del giocatore scelto è stato sostituito. Nessun salvataggio.</p>`;
    };
    [choose,slider,goal,assist].forEach(el=>el.addEventListener('input',update));
    $('live-sim-reset').addEventListener('click',()=>{choose.value='0';slider.value='6';goal.checked=false;assist.checked=false;update();});
    update();
  }
}
async function init(){
  try{
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if(authError||!user){$('live-access').className='adm-access error';$('live-access').textContent='Accedi al sito per aprire il laboratorio LIVE.';return;}
    const {data:admin,error}=await supabase.from('mc_admin_users').select('user_id').eq('user_id',user.id).maybeSingle();
    if(error)throw error;
    if(!admin){$('live-access').className='adm-access error';$('live-access').textContent='Solo gli amministratori autorizzati possono aprire questa pagina.';return;}
    $('live-workspace').hidden=false;
    $('live-access').className='adm-access ok';
    $('live-access').textContent='Accesso autorizzato. Calcolo provvisorio sperimentale pronto.';
    $('live-filter').addEventListener('submit',loadData);
    $('live-gw').addEventListener('input',()=>{$('live-fixture-gw').value=$('live-gw').value;});
    $('live-comp').addEventListener('change',()=>{$('live-match-list').innerHTML='';$('live-detail').hidden=true;});
    await loadData();
  }catch(error){
    $('live-access').className='adm-access error';
    $('live-access').textContent='Errore durante l’autorizzazione: '+error.message;
  }
}
void init();
