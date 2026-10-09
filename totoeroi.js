import { supabase } from './supabase.js';
import { loadResultsRows } from './results-source.js';

const SEASON = '2026/27';
// Admin verificati da Supabase: stessa autorizzazione usata dalle RLS di TotoEroi.
const $ = id => document.getElementById(id);
const state = {
  rounds: [], round: null, fixtures: [], teams: [], user: null, profile: null, adminAuthorized: false,
  resultsRows: [], fallbacks: [], picks: {}, savedPicks: {},
  publicEntries: [], leaderboard: [], adminFixtures: [], adminResults: {}, gw: 7,
  loading: false, count: 0, timer: null
};
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm = x => String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const logoOverrides = {
  wildboys78:'img/wildboys78.webp', pokermantra:'img/PokerMantra.webp',
  minnesotasnakes:'img/MinneSota Snakes.webp'
};
const logo = name => logoOverrides[norm(name)] || `img/${name}.webp`;
const timeString = val => val ? new Date(val).toLocaleString('it-IT', {
  timeZone:'Europe/Brussels', weekday:'short', day:'2-digit',month:'2-digit',
  hour:'2-digit',minute:'2-digit'
}) : 'Da definire';
function localDateTime(iso){
  if (!iso) return '';
  const date = new Date(iso);
  const pad = n => String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
const isAdmin = () => state.adminAuthorized === true;
const isExpired = r => Boolean(r?.closes_at && Date.now() >= new Date(r.closes_at).getTime());
const isOpen = () => state.round?.status === 'open' && !isExpired(state.round);
const isPublished = () => isExpired(state.round);
const hasEightFixtures = () => state.fixtures.length === 8 && new Set(state.fixtures.map(f=>Number(f.slot))).size===8;
const isResultKnown = f => ['1','X','2'].includes(f.result_sign);
const statusLabels = {
  draft:'Da programmare', open:'Pronostici aperti', suspended:'Giornata sospesa',
  homologated:'Omologata', cancelled:'Annullata'
};

async function safeRpc(name,args,defaultValue){
  try {
    const {data,error}=await supabase.rpc(name,args);
    if (error) throw error;
    return data;
  }catch(e){console.warn('TotoEroi:',name,e);return defaultValue;}
}
function renderStatus(){
  const r=state.round;
  $('te-round-label').textContent=`Giornata ${state.gw}`;
  $('te-round-phase').textContent=state.gw<=15 ? 'Conference' : 'Round Robin';
  $('te-status').textContent=!r ? 'Da programmare' :
    r.status==='open' && isExpired(r) ? 'Pronostici chiusi' : statusLabels[r.status] || r.status;
  $('te-status').classList.toggle('te-is-open',isOpen());
  $('te-deadline').textContent=r?.closes_at ? `Scadenza: ${timeString(r.closes_at)}` : 'Scadenza non impostata';
  $('te-entry-count').innerHTML=`${state.count} <em>/ 16</em>`;
  renderTimer();
}
function renderTimer(){
  const r=state.round, target=$('te-timer');
  if (!r?.closes_at){target.textContent='--g --h --m';return;}
  const difference=new Date(r.closes_at).getTime()-Date.now();
  if (difference<=0){target.textContent='CHIUSO';return;}
  if (r.status!=='open'){target.textContent='IN ATTESA';return;}
  const minutes=Math.floor(difference/60000);
  const days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),mins=minutes%60;
  target.textContent=days?`${days}g ${String(hours).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m`:`${String(hours).padStart(2,'0')}h ${String(mins).padStart(2,'0')}m`;
}
function pickedCount(){return Object.values(state.picks).filter(p=>['1','X','2'].includes(p)).length;}
function showSaveMessage(message,bad=false){$('te-save-message').textContent=message;$('te-save-message').style.color=bad?'#ff9e96':'#a9bad0';}
function renderPicks(){
  const list=$('te-match-list');
  const editable=isOpen() && Boolean(state.profile?.team_id) && hasEightFixtures();
  $('te-team-label').textContent=state.profile?.team_id
    ? `La schedina di ${state.teams.find(t=>String(t.id)===String(state.profile.team_id))?.name||'tua franchigia'}`
    : 'Accedi per partecipare';
  if (!state.round){list.innerHTML='<div class="te-empty">La giornata non è ancora stata programmata dal Commissioner.</div>';}
  else if (!state.fixtures.length){list.innerHTML='<div class="te-empty">Nessun incontro configurato per questa giornata.</div>';}
  else {
    list.innerHTML=state.fixtures.map(f=>{
      const pick=state.picks[String(f.slot)]||'';
      const outcome=f.result_sign || '';
      return `<article class="te-match-row ${pick?'is-picked':''}">
        <div class="te-match-index"><span>SFIDA ${String(f.slot).padStart(2,'0')}</span><small>${esc(f.conference==='Conf A'?'Conference League':f.conference==='Conf B'?'Conference Championship':f.conference)}</small></div>
        <div class="te-team te-home"><img src="${esc(logo(f.home_name))}" alt="" onerror="this.src='icon-192.png';this.onerror=null"><div class="te-team-name"><small>CASA</small><strong>${esc(f.home_name)}</strong></div></div>
        <div class="te-pick-buttons" role="group" aria-label="Pronostico ${esc(f.home_name)} contro ${esc(f.away_name)}">
          ${['1','X','2'].map(sign=>`<button type="button" data-pick-slot="${f.slot}" data-pick="${sign}" aria-label="${sign==='1'?'Vittoria casa':sign==='X'?'Pareggio':'Vittoria trasferta'}: ${esc(f.home_name)} contro ${esc(f.away_name)}" aria-pressed="${String(pick===sign)}" class="${sign===pick?'is-selected':''}" ${editable?'':'disabled'}>${sign}</button>`).join('')}
        </div>
        <div class="te-team te-away"><img src="${esc(logo(f.away_name))}" alt="" onerror="this.src='icon-192.png';this.onerror=null"><div class="te-team-name"><small>TRASFERTA</small><strong>${esc(f.away_name)}</strong></div></div>
      </article>`;
    }).join('');
  }
  const count=pickedCount();
  $('te-progress').textContent=`${count}/8`;
  $('te-save').disabled=!(editable&&count===8);
  $('te-draft-state').textContent=!state.round ? 'In attesa' :
    isOpen() ? (Object.keys(state.savedPicks).length?'Schedina inviata · modificabile':'Selezione in corso') :
    isExpired(state.round)?'Schedina bloccata':'Non aperta';
  if(!state.profile?.team_id){showSaveMessage('Accedi con una franchigia per inviare la schedina.');}
  else if(!state.round){showSaveMessage('Giornata non ancora configurata.');}
  else if(isOpen()){
    showSaveMessage(Object.keys(state.savedPicks).length
      ? `Ultima schedina registrata. Puoi cambiarla fino alla scadenza. (${count}/8 selezionati)`
      : `Completa tutti gli 8 pronostici e premi Salva. (${count}/8 selezionati)`);
  } else {showSaveMessage('Pronostici non modificabili in questo momento.');}
}
function switchTab(name){
  if(name==='admin' && !isAdmin()) name='picks';
  document.querySelectorAll('[data-te-tab]').forEach(b=>b.classList.toggle('is-active',b.dataset.teTab===name));
  document.querySelectorAll('.te-panel').forEach(p=>{const active=p.id==='te-panel-'+name;p.hidden=!active;p.classList.toggle('is-active',active);});
  if(name==='entries')renderPublicEntries();
  if(name==='ranking')renderRanking();
  if(name==='history')renderHistory();
}
function formatPreview(sign){return ['1','X','2'].includes(sign)?sign:'?';}
function renderPublicEntries(){
  const el=$('te-public-entries');
  if(!isPublished()){el.innerHTML='<div class="te-card te-empty">🔒 Le schedine saranno pubbliche dopo la scadenza.</div>';return;}
  if(!state.publicEntries.length){el.innerHTML='<div class="te-card te-empty">Nessuna schedina inviata per questa giornata.</div>';return;}
  el.innerHTML=state.publicEntries.map(entry=>{
    const correct=state.fixtures.filter(f=>isResultKnown(f)&&entry.picks?.[String(f.slot)]===f.result_sign).length;
    const complete=state.fixtures.length===8 && state.fixtures.every(isResultKnown);
    const perfect=complete&&correct===8&&state.round?.status==='homologated';
    return `<article class="te-public-card"><div class="te-public-header"><img src="${esc(logo(entry.team_name))}" alt="" onerror="this.src='icon-192.png';this.onerror=null"><div><strong>${esc(entry.team_name)}</strong><small>${complete?`${correct}/8 corretti`:'In attesa degli esiti ufficiali'}</small></div></div>
      <div class="te-public-picks">${state.fixtures.map(f=>{
        const s=entry.picks?.[String(f.slot)]||'?';
        return `<span data-match="${f.slot}" title="Match ${f.slot}: ${esc(f.home_name)} - ${esc(f.away_name)}" class="${isResultKnown(f)?(s===f.result_sign?'is-correct':'is-wrong'):''}">${esc(s)}</span>`;
      }).join('')}</div>${perfect?'<div class="te-public-win">🏆 CACCIATORE DELL’8! Otto pronostici esatti.</div>':''}</article>`;
  }).join('');
}
function renderRanking(){
  const data=new Map((state.leaderboard||[]).map(r=>[String(r.team_id),r]));
  const items=state.teams.map(t=>({team_id:String(t.id),team_name:t.name,
    points:data.get(String(t.id))?.points||0,
    rounds:data.get(String(t.id))?.rounds||0,
    perfect_eights:data.get(String(t.id))?.perfect_eights||0}));
  (state.leaderboard||[]).forEach(r=>{if(!items.some(t=>t.team_id===String(r.team_id)))items.push(r);});
  items.sort((a,b)=>b.points-a.points||b.perfect_eights-a.perfect_eights||a.team_name.localeCompare(b.team_name));
  if(!items.length){$('te-ranking').innerHTML='<div class="te-empty">Le classifiche appariranno dopo la prima omologazione.</div>';return;}
  $('te-ranking').innerHTML=`<div class="te-ranking-header"><span>#</span><span>Franchigia</span><span>Punti</span><span>Giorn.</span><span>8/8</span></div>${items.map((r,i)=>
    `<div class="te-ranking-row"><div>${i+1}</div><strong><img src="${esc(logo(r.team_name))}" alt="" onerror="this.src='icon-192.png';this.onerror=null">${esc(r.team_name)}</strong><div>${r.points||0}</div><div>${r.rounds||0}</div><div>${r.perfect_eights||0}</div></div>`
  ).join('')}`;
}
function renderHistory(){
  $('te-history').innerHTML=!state.rounds.length ? '<div class="te-card te-empty">Nessuna giornata programmata.</div>'
    :[...state.rounds].sort((a,b)=>b.gw-a.gw).map(r=>{
      const label=r.status==='open'&&new Date(r.closes_at)<=new Date()?'Chiusa':statusLabels[r.status]||r.status;
      return `<button type="button" class="te-history-card" data-open-gw="${r.gw}" style="text-align:left;cursor:pointer;color:inherit;font:inherit">
      <div><strong>Giornata ${r.gw}</strong><small>${esc(r.closes_at?timeString(r.closes_at):'Scadenza da fissare')}</small></div><span class="te-history-pill ${r.status==='homologated'?'won':''}">${esc(label)} →</span></button>`;
    }).join('');
}
function renderAdmin(){
  const admin=$('te-admin');admin.hidden=!isAdmin();
  const adminTab=document.querySelector('[data-te-tab="admin"]');
  if(adminTab){ adminTab.hidden=!isAdmin(); adminTab.style.display=isAdmin()?'':'none'; }
  const adminPanel=$('te-panel-admin'); if(adminPanel && !isAdmin()){ adminPanel.hidden=true;adminPanel.classList.remove('is-active'); }
  if(!isAdmin())return;
  $('te-admin-week').value=String(state.gw);
  const round=state.round;
  $('te-admin-deadline').value=localDateTime(round?.closes_at);
  const select=$('te-admin-status');
  // Evita il downgrade di una giornata già pubblicata e il finto "riavvio" delle schedine.
  for(const option of select.options){option.disabled=Boolean(round && round.status!=='draft' && option.value==='draft');}
  if(round?.status==='homologated'){
    if(![...select.options].some(o=>o.value==='homologated'))select.add(new Option('Omologata','homologated'));
  } else [...select.options].filter(o=>o.value==='homologated').forEach(o=>o.remove());
  select.value=round?.status||'draft';
  $('te-admin-note').value=round?.note||'';
  renderAdminFixtures();
  renderAdminResults();
  $('te-prefill').disabled=Boolean(round&&round.status!=='draft');
}
function renderAdminFixtures(){
  const round=state.round;
  $('te-admin-fixtures').innerHTML=state.adminFixtures.length ? state.adminFixtures.map((f,i)=>{
    const disabled=round && round.status!=='draft';
    return `<div class="te-fixture-editor ${disabled?'is-readonly':''}"><small>${i+1}</small><select data-f-conf="${i}" ${disabled?'disabled':''}><option value="Conf A" ${f.conference==='Conf A'?'selected':''}>Conf A</option><option value="Conf B" ${f.conference==='Conf B'?'selected':''}>Conf B</option><option value="Unificata" ${f.conference==='Unificata'?'selected':''}>Unificata</option></select>
      <input data-f-home="${i}" value="${esc(f.home_name)}" placeholder="Casa" ${disabled?'disabled':''}><input data-f-away="${i}" value="${esc(f.away_name)}" placeholder="Trasferta" ${disabled?'disabled':''}></div>`;
  }).join('') : '<div class="te-empty">Nessun incontro precaricato.</div>';
}
function renderAdminResults(){
  const el=$('te-admin-results');
  if(!state.round||!state.fixtures.length){el.innerHTML='<div class="te-empty">Salva gli otto incontri prima di importare i risultati.</div>';return;}
  el.innerHTML=state.fixtures.map(f=>{
    const pick=state.adminResults[String(f.slot)] ?? f.result_sign ?? '';
    return `<div class="te-fixture-editor te-result-editor"><small>${f.slot}</small><span>${esc(f.home_name)}</span><span>${esc(f.away_name)}</span>
      <select data-result-slot="${f.slot}"><option value="" ${!pick?'selected':''}>—</option>${['1','X','2'].map(s=>`<option value="${s}" ${pick===s?'selected':''}>${s}</option>`).join('')}</select></div>`;
  }).join('');
}
function adminMessage(str, bad=false){$('te-admin-message').textContent=str;$('te-admin-message').style.color=bad?'#b52121':'#235681';}
function renderAll(){renderStatus();renderPicks();renderPublicEntries();renderRanking();renderHistory();renderAdmin();}

function pickRound(){
  const open=state.rounds.filter(r=>r.status==='open'&&!isExpired(r)).sort((a,b)=>new Date(a.closes_at)-new Date(b.closes_at));
  if(open.length)return open[0].gw;
  const upcoming=[...state.rounds].filter(r=>r.status==='draft').sort((a,b)=>a.gw-b.gw);
  if(upcoming.length)return upcoming[0].gw;
  const byRecent=[...state.rounds].sort((a,b)=>b.gw-a.gw);
  return byRecent[0]?.gw||7;
}
async function refreshLeaderboard(){state.leaderboard=await safeRpc('totoeroi_leaderboard',{p_season:SEASON},[]);}
async function loadRound(gw){
  state.gw=Number(gw);
  state.round=state.rounds.find(r=>Number(r.gw)===Number(gw))||null;
  state.fixtures=[];state.picks={};state.savedPicks={};state.publicEntries=[];state.adminResults={};state.count=0;
  if(state.round){
    const {data,error}=await supabase.from('totoeroi_fixtures').select('*').eq('round_id',state.round.id).order('slot');
    if(error){console.error('Incontri TotoEroi:',error);}
    state.fixtures=data||[];
    state.adminFixtures=state.fixtures.map(f=>({...f}));
    const [saved,count]=await Promise.all([
      state.user?safeRpc('totoeroi_my_entry',{p_round_id:state.round.id},{}):{},
      safeRpc('totoeroi_entry_count',{p_round_id:state.round.id},0)
    ]);
    state.picks=saved||{};state.savedPicks={...state.picks};state.count=count||0;
    if(isExpired(state.round)){
      state.publicEntries=await safeRpc('totoeroi_public_entries',{p_round_id:state.round.id},[]);
    }
  }else{state.adminFixtures=[];}
  renderAll();
}

function isRelevantResultRow(r,gw,conference){
  if(String(r.Conference||'').trim()!==conference)return false;
  if(String(r.Phase||'').toLowerCase()==='playoff')return false;
  const n=Number(r.GW)||0,season=Number(r.GW_Stagionale)||0;
  return conference==='Unificata'?(season===gw || n+15===gw):(n===gw);
}
function fallbackFor(gw){
  return state.fallbacks.filter(f=>f.gw===gw).map(f=>({conference:f.conference,home_name:f.home,away_name:f.away}));
}
function sourceFor(gw){
  const fromRows=[];
  for(const conf of gw<=15?['Conf A','Conf B']:['Unificata']){
    const rows=state.resultsRows.filter(r=>isRelevantResultRow(r,gw,conf));
    const byPair=new Map();
    for(const r of rows){
      const a=String(r.Team||'').trim(),b=String(r.Opponent||'').trim();
      if(!a||!b)continue;
      const key=[norm(a),norm(b)].sort().join('|');
      const home = r.IsHome===true ? a : r.IsHome===false ? b : a;
      const away = r.IsHome===true ? b : r.IsHome===false ? a : b;
      if(!byPair.has(key)||r.IsHome===true||r.IsHome===false&&!byPair.get(key).homeKnown){
        byPair.set(key,{conference:conf,home_name:home,away_name:away,homeKnown:typeof r.IsHome==='boolean'});
      }
    }
    fromRows.push(...byPair.values());
  }
  const fallbacks=fallbackFor(gw);
  // Le prime 14 giornate hanno un calendario di riferimento dell'app.
  // Se esistono righe live con IsHome vero, prevalgono; altrimenti teniamo il calendario fisso.
  if(fallbacks.length===8){
    return fallbacks.map(f=>{
      const found=fromRows.find(r=>r.conference===f.conference &&
        [norm(r.home_name),norm(r.away_name)].sort().join('|')===[norm(f.home_name),norm(f.away_name)].sort().join('|'));
      return found?.homeKnown?{conference:f.conference,home_name:found.home_name,away_name:found.away_name}:f;
    });
  }
  return fromRows.map(({conference,home_name,away_name})=>({conference,home_name,away_name})).slice(0,8);
}
function readFixtureEditor(){
  const rows=[];
  for(let i=0;i<8;i++){
    const conf=document.querySelector(`[data-f-conf="${i}"]`),home=document.querySelector(`[data-f-home="${i}"]`),away=document.querySelector(`[data-f-away="${i}"]`);
    if(!conf||!home||!away)continue;
    rows.push({slot:i+1,conference:conf.value,home_name:home.value.trim(),away_name:away.value.trim()});
  }
  return rows;
}
function validateEight(fixtures){
  if(fixtures.length!==8)return 'Devono esserci esattamente 8 incontri.';
  const teams=new Set();
  for(const f of fixtures){
    if(!f.home_name||!f.away_name||norm(f.home_name)===norm(f.away_name))return `Controlla le squadre della partita ${f.slot}.`;
    for(const name of [f.home_name,f.away_name]){
      if(teams.has(norm(name)))return `La squadra ${name} compare più di una volta.`;
      teams.add(norm(name));
    }
  }
  if(teams.size!==16)return 'Le otto partite devono coinvolgere 16 franchigie diverse.';
  return '';
}
async function prefillFixtures(){
  if(state.round && state.round.status!=='draft'){adminMessage('Gli incontri già pubblicati non possono essere modificati.',true);return;}
  state.resultsRows=await loadResultsRows();
  const preview=sourceFor(state.gw);
  state.adminFixtures=Array.from({length:8},(_,i)=>({
    conference:preview[i]?.conference || (state.gw<=15?(i<4?'Conf A':'Conf B'):'Unificata'),
    home_name:preview[i]?.home_name||'',away_name:preview[i]?.away_name||''
  }));
  renderAdminFixtures();
  adminMessage(preview.length===8?'Otto partite precaricate. Controlla casa/trasferta prima di aprire la giornata.':
    `Trovate ${preview.length} partite su 8. Completa manualmente il calendario prima di pubblicare.`,preview.length!==8);
}
async function saveAdminRound(){
  if(!isAdmin())return;
  const btn=$('te-admin-save-round');btn.disabled=true;
  try{
    const gw=Number($('te-admin-week').value),existing=state.rounds.find(r=>r.gw===gw);
    const deadline=$('te-admin-deadline').value;
    const wanted=$('te-admin-status').value;
    if(wanted==='homologated')throw new Error('Per omologare usa il pulsante specifico.');
    if(wanted==='open' && (!deadline || new Date(deadline).getTime()<=Date.now()))throw new Error('Per aprire la giornata serve una scadenza futura.');
    // Riapertura amministrativa anche se la giornata e' stata sospesa,
    // annullata, omologata o rimasta in bozza con scadenza passata.
    // Una giornata aperta con scadenza futura si gestisce normalmente.
    const needsReopen = Boolean(existing && wanted === 'open' && (
      ['suspended', 'homologated', 'cancelled'].includes(existing.status) ||
      (isExpired(existing) && ['open', 'draft'].includes(existing.status))
    ));
    if(needsReopen){
      if(!['draft','open','suspended','homologated','cancelled'].includes(existing.status))
        throw new Error(`Stato non gestito: ${existing.status}. Non modificare direttamente il database.`);
      if(!confirm('Riaprire la giornata '+gw+' fino a '+timeString(new Date(deadline).toISOString())+'?\n\nLe schedine già inviate resteranno salvate e potranno essere modificate. Gli esiti di prova verranno cancellati e la giornata uscirà temporaneamente dalla classifica.')){
        adminMessage('Riapertura annullata.');
        return;
      }
      const {error}=await supabase.rpc('totoeroi_reopen_round',{
        p_round_id:existing.id,
        p_new_deadline:new Date(deadline).toISOString(),
        p_note:$('te-admin-note').value.trim()||null
      });
      if(error)throw error;
      await reloadRounds(gw);
      adminMessage('Giornata '+gw+' riaperta fino a '+timeString(new Date(deadline).toISOString())+'. Schedine conservate, risultati azzerati.');
      return;
    }
    if(existing?.closes_at && isExpired(existing) && deadline &&
       new Date(deadline).getTime()!==new Date(existing.closes_at).getTime())
      throw new Error('La vecchia scadenza è trascorsa. Per cambiarla, scegli "Pronostici aperti" e salva: la giornata verrà riaperta.');
    const fixtures=existing && existing.status!=='draft' ? [] : readFixtureEditor();
    const err=fixtures.length?validateEight(fixtures):'';
    if(err)throw new Error(err);
    if(wanted==='open' && fixtures.length!==8 && (!existing || existing.status==='draft'))throw new Error('Prima di aprire completa tutti gli 8 incontri.');
    const patch={season:SEASON,gw,status:'draft',closes_at:deadline?new Date(deadline).toISOString():null,note:$('te-admin-note').value.trim()||null};
    let round=existing;
    if(!round){
      const res=await supabase.from('totoeroi_rounds').insert(patch).select('*').single();
      if(res.error)throw res.error;
      round=res.data;
    }else{
      const res=await supabase.from('totoeroi_rounds').update({...patch,status:existing.status}).eq('id',existing.id).select('*').single();
      if(res.error)throw res.error;
      round=res.data;
    }
    if(round.status==='draft'&&fixtures.length===8){
      const removed=await supabase.from('totoeroi_fixtures').delete().eq('round_id',round.id);
      if(removed.error)throw removed.error;
      const inserted=await supabase.from('totoeroi_fixtures').insert(fixtures.map(f=>({...f,round_id:round.id})));
      if(inserted.error)throw inserted.error;
    }
    if(wanted!==round.status){
      const changed=await supabase.from('totoeroi_rounds').update({status:wanted}).eq('id',round.id);
      if(changed.error)throw changed.error;
    }
    adminMessage('Giornata salvata. La scadenza e il blocco dei pronostici sono gestiti da Supabase.');
    await reloadRounds(gw);
  }catch(e){console.error(e);adminMessage(`Errore: ${e.message||e}`,true);}finally{btn.disabled=false;}
}

function suggestedResultFor(f){
  const matching=state.resultsRows.filter(r=>isRelevantResultRow(r,state.gw,f.conference)).find(r=>
    norm(r.Team)===norm(f.home_name)&&norm(r.Opponent)===norm(f.away_name)) ||
    state.resultsRows.filter(r=>isRelevantResultRow(r,state.gw,f.conference)).find(r=>
    norm(r.Team)===norm(f.away_name)&&norm(r.Opponent)===norm(f.home_name));
  if(!matching)return '';
  const homeSide=norm(matching.Team)===norm(f.home_name);
  const explicit=String(matching.Result||'').trim().toUpperCase();
  if(['V','N','P'].includes(explicit))return explicit==='N'?'X':
    explicit==='V'?(homeSide?'1':'2'):(homeSide?'2':'1');
  const a=Number(String(matching.PointsFor??'0').replace(',','.'))||0;
  const b=Number(String(matching.PointsAgainst??'0').replace(',','.'))||0;
  if(a===0&&b===0)return '';
  const calc=p=>p<66?0:1+Math.floor((p-66)/6);
  const gf=calc(a),ga=calc(b);
  if(gf===ga)return 'X';
  return (gf>ga) === homeSide?'1':'2';
}
async function importResults(){
  if(!state.round||!isExpired(state.round)){adminMessage('Gli esiti ufficiali si importano dopo la scadenza.',true);return;}
  let n=0;
  state.resultsRows=await loadResultsRows();
  for(const f of state.fixtures){const s=suggestedResultFor(f);if(s){state.adminResults[String(f.slot)]=s;n++;}}
  renderAdminResults();
  adminMessage(`Proposti ${n} risultati su 8. Verifica gli esiti ufficiali prima di salvarli.${n<8?' Alcuni incontri non sono ancora disponibili.':''}`,n===0);
}
async function saveResults(){
  if(!isAdmin()||!state.round)return;
  if(!isExpired(state.round)){adminMessage('Prima attendi la scadenza dei pronostici.',true);return;}
  try{
    const updates=[...document.querySelectorAll('[data-result-slot]')].map(el=>({slot:Number(el.dataset.resultSlot),sign:el.value||null}));
    if(updates.length!==8)throw new Error('Mancano gli otto incontri');
    for(const rec of updates){
      const fixture=state.fixtures.find(f=>f.slot===rec.slot);
      const {error}=await supabase.from('totoeroi_fixtures').update({result_sign:rec.sign}).eq('id',fixture.id);
      if(error)throw error;
    }
    adminMessage('Esiti ufficiali salvati. La classifica si aggiorna sulle giornate omologate.');
    await loadRound(state.gw);
    await refreshLeaderboard();renderRanking();
  }catch(e){adminMessage(`Errore: ${e.message}`,true);}
}
async function homologate(){
  if(!state.round)return;
  const complete=[...document.querySelectorAll('[data-result-slot]')].every(el=>['1','X','2'].includes(el.value));
  if(!complete){adminMessage('Inserisci e salva tutti gli otto esiti prima di omologare.',true);return;}
  if(!confirm('Confermi di aver verificato gli 8 risultati ufficiali e vuoi omologare la giornata?'))return;
  try{
    const {error}=await supabase.rpc('totoeroi_homologate',{p_round_id:state.round.id});
    if(error)throw error;
    adminMessage('Giornata omologata. Punti e 8/8 sono stati aggiornati.');
    await reloadRounds(state.gw);
  }catch(e){adminMessage(`Errore omologazione: ${e.message}`,true);}
}
async function reloadRounds(gw){
  const {data,error}=await supabase.from('totoeroi_rounds').select('*').eq('season',SEASON).order('gw');
  if(error)throw error;
  state.rounds=data||[];
  await refreshLeaderboard();
  await loadRound(gw??pickRound());
}

async function savePicks(){
  if(!state.round||!isOpen()||pickedCount()!==8||!state.profile?.team_id)return;
  const btn=$('te-save');btn.disabled=true;
  try{
    const {error}=await supabase.rpc('totoeroi_submit',{p_round_id:state.round.id,p_picks:state.picks});
    if(error)throw error;
    state.savedPicks={...state.picks};state.count=await safeRpc('totoeroi_entry_count',{p_round_id:state.round.id},state.count);
    renderPicks();renderStatus();showSaveMessage('✅ Schedina salvata! L’ultimo invio prima della scadenza è quello valido.');
  }catch(e){renderPicks();showSaveMessage(`Impossibile salvare: ${e.message||e}`,true);}
}
function setupEvents(){
  document.querySelector('.te-tabs').addEventListener('click',e=>{
    const btn=e.target.closest('[data-te-tab]');if(btn)switchTab(btn.dataset.teTab);
  });
  $('te-match-list').addEventListener('click',e=>{
    const btn=e.target.closest('[data-pick-slot]');if(!btn||!isOpen()||!state.profile?.team_id)return;
    state.picks[String(btn.dataset.pickSlot)]=btn.dataset.pick;
    renderPicks();
  });
  $('te-save').addEventListener('click',savePicks);
  $('te-admin-week').addEventListener('change',async e=>loadRound(Number(e.target.value)));
  $('te-preset-deadline').addEventListener('click',()=>{
    const d=new Date(),day=d.getDay();
    const plus=(6-day+7)%7;
    d.setDate(d.getDate()+plus);d.setHours(14,55,0,0);
    if(d<=new Date())d.setDate(d.getDate()+7);
    $('te-admin-deadline').value=localDateTime(d.toISOString());
    adminMessage('Preset sabato 14:55 applicato. Verifica il calendario della Serie A: la scadenza deve essere 5 minuti prima del primo anticipo.');
  });
  $('te-prefill').addEventListener('click',prefillFixtures);
  $('te-admin-save-round').addEventListener('click',saveAdminRound);
  $('te-import-results').addEventListener('click',importResults);
  $('te-save-results').addEventListener('click',saveResults);
  $('te-homologate').addEventListener('click',homologate);
  $('te-history').addEventListener('click',async e=>{
    const btn=e.target.closest('[data-open-gw]');if(!btn)return;
    await loadRound(Number(btn.dataset.openGw));switchTab('entries');window.scrollTo({top:0,behavior:'smooth'});
  });
  state.timer=setInterval(()=>{
    const wasOpen=Boolean($('te-status').classList.contains('te-is-open'));
    renderStatus();
    if(wasOpen&&!isOpen()){
      loadRound(state.gw);
    }
  },10000);
  // Un cambio scadenza in admin e' visibile anche agli altri partecipanti
  // senza dover attendere un reload manuale.
  setInterval(async()=>{
    if(!state.round)return;
    try{
      const {data,error}=await supabase.from('totoeroi_rounds')
        .select('*').eq('id',state.round.id).maybeSingle();
      if(error||!data)return;
      if(data.updated_at!==state.round.updated_at || data.status!==state.round.status){
        state.round=data;
        state.rounds=state.rounds.map(r=>r.id===data.id?data:r);
        renderStatus();renderPicks();
      }
    }catch(e){console.warn('Aggiornamento scadenza TotoEroi',e);}
  },60000);
}
async function authorizePrivatePreview(){
  const message = $('te-gate-message');
  try {
    const {data, error} = await supabase.auth.getUser();
    if(error) throw error;
    const user = data?.user;
    if(!user){
      message.innerHTML = 'Accedi con il tuo account autorizzato per aprire l\'anteprima.<div><a href="login.html">Vai al login</a></div>';
      return false;
    }
    // Controllo server-side: legge il ruolo da profiles e NON si basa sulla visibilità del link.
    const {data:authorized, error:authorizationError} = await supabase.rpc('totoeroi_is_admin');
    if(authorizationError) throw authorizationError;
    if(authorized !== true){
      message.textContent = 'Accesso riservato agli amministratori della Lega degli Eroi.';
      return false;
    }
    const {data:profile, error:profileError} = await supabase.from('profiles')
      .select('team_id,role').eq('id',user.id).maybeSingle();
    if(profileError) throw profileError;
    if(!profile){ message.textContent='Profilo non disponibile per questo account.'; return false; }
    state.user=user;
    state.profile=profile;
    state.adminAuthorized=true;
    document.body.classList.add('te-authorized');
    return true;
  }catch(error){
    console.error('Accesso anteprima privata:',error);
    message.textContent='Impossibile verificare l\'accesso. Controlla la connessione o il login.';
    return false;
  }
}
async function init(){
  if(!await authorizePrivatePreview()) return;
  setupEvents();
  $('te-admin-week').innerHTML=Array.from({length:23},(_,i)=>i+7).map(g=>`<option value="${g}">Giornata ${g}</option>`).join('');
  try{
    const [auth,profileTeams,rows,fallbacks,rounds]=await Promise.all([
      supabase.auth.getUser(),
      supabase.from('teams').select('id,name').order('name'),
      loadResultsRows().catch(e=>(console.warn(e),[])),
      fetch('totoeroi-fallback.json').then(r=>r.ok?r.json():[]).catch(()=>[]),
      supabase.from('totoeroi_rounds').select('*').eq('season',SEASON).order('gw')
    ]);
    state.user=auth.data?.user||null;
    state.teams=profileTeams.data||[];
    state.resultsRows=rows||[];
    state.fallbacks=fallbacks||[];
    if(rounds.error)throw new Error('Le tabelle TotoEroi non sono ancora state create. Esegui prima totoeroi.sql su Supabase.');
    state.rounds=rounds.data||[];
    if(state.user){
      const p=await supabase.from('profiles').select('team_id,role').eq('id',state.user.id).maybeSingle();
      if(!p.error)state.profile=p.data;
    }
    await refreshLeaderboard();
    await loadRound(pickRound());
  }catch(e){
    console.error('Avvio TotoEroi:',e);
    $('te-match-list').innerHTML=`<div class="te-empty">${esc(e.message)}<br>La pagina grafica è pronta, ma il database deve essere configurato.</div>`;
    $('te-status').textContent='Da configurare';
    if(isAdmin())renderAdmin();
  }
}
init();
