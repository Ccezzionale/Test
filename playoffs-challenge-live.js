/* Playoffs Challenge V4: backend ufficiale + Commissioner. Non usa SERVICE_ROLE nel browser. */
import {supabase} from './supabase.js';
import {buildModel,quoteMatch,normalizeTeam} from './bookmaker-engine.js';
import {calculateProjectedStandings} from './bookmaker-seeding.js';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
const stages=[['ottavi','Ottavi · G30',4,4],['quarti','Quarti · G31',4,4],['semi_andata','Semifinali andata · G32',2,6],['semi_ritorno','Semifinali ritorno · G33',2,6],['finali','Finali · G34',2,6]];
const roles={P:'🧤 POR',D:'🛡️ DIF',C:'🎯 CEN',A:'⚽ ATT'};
const eventNames={CLEAN_SHEET:'Clean sheet',PENALTY_SAVE:'Rigore parato',GOAL:'Gol',ASSIST:'Assist',GOAL_OR_ASSIST:'Gol o assist',BRACE:'Doppietta'};
const roleEvents={P:['CLEAN_SHEET','PENALTY_SAVE'],D:['GOAL','ASSIST','CLEAN_SHEET'],C:['GOAL','ASSIST','GOAL_OR_ASSIST'],A:['GOAL','ASSIST','BRACE']};
const S={rounds:[],events:[],entries:[],user:null,teamId:null,admin:false,active:null,model:null,projection:null,teams:[],
 picks:new Map(),hero:null,backup:null,dirty:false,adminDraft:[],busy:false,lastRoundKey:null};
function stageData(stage){return stages.find(x=>x[0]===stage)||stages[0]}
function openRound(r){return r?.status==='open' && new Date(r.closes_at).getTime()>Date.now()}
function closedRound(r){return r?.status==='finalized'||(r?.status==='open' && new Date(r.closes_at).getTime()<=Date.now())}
function msg(id,message,isError=false){let el=$(id);if(!el)return;el.textContent=message;el.classList.toggle('pc-feedback-error',!!isError)}
function quoteOf(e,sign){return Number(sign==='1'?e.q1:sign==='X'?e.qx:sign==='2'?e.q2:e.qyes)}
async function getRows(table,fields,cb=q=>q){let {data,error}=await cb(supabase.from(table).select(fields).limit(1000));if(error)throw new Error(`${table}: ${error.message}`);return data||[]}
async function readOfficial(){const [rounds,events,entries]=await Promise.all([
 getRows('pc_rounds','*',q=>q.eq('season','2026/27').order('gw')),
 getRows('pc_events','*',q=>q.order('id')),
 getRows('pc_entries','round_id,team_id,picks,hero_event_id,backup_event_id,updated_at',q=>q.order('updated_at',{ascending:false}))
]);S.rounds=rounds;S.events=events;S.entries=entries}
function roundEvents(id){return S.events.filter(e=>Number(e.round_id)===Number(id))}
function storedEntry(r){return S.entries.find(e=>Number(e.round_id)===Number(r.id)&&e.team_id===S.teamId)}
function fillOwnEntry(r){S.picks.clear();S.hero=null;S.backup=null;let e=storedEntry(r);
 if(e){for(const p of e.picks||[]){S.picks.set(Number(p.event_id),p.pick)}S.hero=e.hero_event_id?Number(e.hero_event_id):null;S.backup=e.backup_event_id?Number(e.backup_event_id):null}
 S.dirty=false;S.lastRoundKey=r.id}
function published(){return S.rounds.filter(r=>r.status!=='draft')}
function renderOfficial(){const available=published();const current=S.active&&S.rounds.find(r=>r.id===S.active);if(!current||!available.length){$('pc-official').hidden=true;$('pc-demo-area').hidden=false;$('pc-schedina-title').textContent='La schedina degli ottavi';return;}
 $('pc-official').hidden=false;$('pc-demo-area').hidden=true;
 $('pc-status').textContent=current.status==='finalized'?'Turno omologato':openRound(current)?'Schedine aperte':'Schedine chiuse';
 $('pc-schedina-title').textContent=`Schedina ${stageData(current.stage)[1]}`;
 const select=$('pc-official-stage');const value=String(current.id);
 select.innerHTML=available.map(r=>`<option value="${r.id}">${esc(stageData(r.stage)[1])}${r.status==='finalized'?' · OMOLOGATO':''}</option>`).join('');select.value=value;
 let editable=openRound(current);const e=roundEvents(current.id);const match=e.filter(x=>x.kind==='match').sort((a,b)=>a.slot-b.slot);const player=e.filter(x=>x.kind==='player').sort((a,b)=>a.player_role.localeCompare(b.player_role)||a.player_name.localeCompare(b.player_name,'it'));
 $('pc-official-state').textContent=current.status==='finalized'?'🏆 Omologato':editable?'🟢 Schedina aperta':'🔒 Schedina chiusa';
 $('pc-official-save').disabled=!editable||!S.teamId;
 $('pc-official-clear').disabled=!editable;
 $('pc-preliminary-message').innerHTML=`<strong>Palinsesto ufficiale ${esc(stageData(current.stage)[1])}.</strong> ${current.status==='finalized'?'Turno omologato.':`Scadenza: ${new Date(current.closes_at).toLocaleString('it-IT')}. ${editable?'Puoi aggiornare la schedina fino alla chiusura.':'Niente ulteriori modifiche.'}`}`;
 $('pc-official-matches').innerHTML=match.map(ev=>{
  const selected=S.picks.get(Number(ev.id));const choices=['1','X','2'].map(x=>`<button class="pc-odd ${selected===x?'selected':''}" type="button" data-official-pick="${ev.id}" data-sign="${x}" ${editable?'':'disabled'} aria-pressed="${selected===x}"><span>${x}</span><strong>${fmt(quoteOf(ev,x))}</strong></button>`).join('');
  return `<article class="pc-game"><div class="pc-game-top"><span>PARTITA ${ev.slot}</span><span class="pc-provisional">QUOTE UFFICIALI</span></div><div class="pc-game-teams"><div><strong>${esc(ev.home_name)}</strong></div><span class="pc-vs">VS</span><div><strong>${esc(ev.away_name)}</strong></div></div><div class="pc-odds">${choices}</div>${heroControls(ev,editable)}</article>`
 }).join('');
 $('pc-official-players').innerHTML=player.map(ev=>{
 const checked=S.picks.has(Number(ev.id));return `<div class="pc-player-option ${checked?'chosen':''}"><div><small>${esc(roles[ev.player_role])}</small><strong>${esc(ev.player_name)}</strong><span>${esc(eventNames[ev.player_event])}</span></div><button class="pc-button ${checked?'pc-primary':'pc-ghost'}" type="button" data-official-player="${ev.id}" ${editable?'':'disabled'}>${checked?'✓ Scelto':'+ Seleziona'} · ${fmt(ev.qyes)}</button>${heroControls(ev,editable)}</div>`}).join('');
 renderSummary(current,e);
 renderPublicEntries(current,e);
}
function heroControls(ev,editable){const has=S.picks.has(Number(ev.id));return `<div class="pc-choice-extras"><button type="button" data-official-hero="${ev.id}" class="${S.hero===Number(ev.id)?'chosen':''}" ${has&&editable?'':'disabled'}>⭐ ${S.hero===Number(ev.id)?'HERO PICK':'Hero'}</button><button type="button" data-official-backup="${ev.id}" class="${S.backup===Number(ev.id)?'chosen':''}" ${has&&editable?'':'disabled'}>🛡️ ${S.backup===Number(ev.id)?'Riserva scelta':'Riserva'}</button></div>`}
function renderSummary(round,events){const matches=events.filter(x=>x.kind==='match'&&S.picks.has(Number(x.id))).length,players=events.filter(x=>x.kind==='player'&&S.picks.has(Number(x.id))).length;
 let sum=0;for(const ev of events){let sign=S.picks.get(Number(ev.id));if(sign)sum+=quoteOf(ev,sign)*(S.hero===Number(ev.id)?1.5:1)}
 $('pc-official-count').textContent=`${matches}/${stageData(round.stage)[2]} partite · ${players}/${stageData(round.stage)[3]} calciatori`;
 $('pc-official-potential').textContent=`${fmt(sum)} pt massimi teorici per queste scelte`;
 $('pc-progress').textContent=`${matches+players}/8`;
 if(!S.dirty){let entry=storedEntry(round);msg('pc-official-message',entry?`Schedina consegnata · ultima modifica ${new Date(entry.updated_at).toLocaleString('it-IT')}`:'Nessuna schedina ufficiale inviata.');}
}
function toggleMatch(evId,sign){if(S.picks.get(evId)===sign){S.picks.delete(evId);removeHero(evId)}else S.picks.set(evId,sign);S.dirty=true;msg('pc-official-message','Modifiche non ancora salvate.');renderOfficial()}
function removeHero(id){if(S.hero===id)S.hero=null;if(S.backup===id)S.backup=null}
function togglePlayer(id){if(S.picks.has(id)){S.picks.delete(id);removeHero(id)}else{const r=S.rounds.find(x=>x.id===S.active);const ev=roundEvents(r.id).find(x=>x.id===id);const chosen=roundEvents(r.id).filter(x=>x.kind==='player'&&S.picks.has(Number(x.id)));
 const max=stageData(r.stage)[3];if(chosen.length>=max){msg('pc-official-message',`Massimo ${max} calciatori per turno.`,true);return}
 if(chosen.some(x=>normalizeTeam(x.player_name)===normalizeTeam(ev.player_name))){msg('pc-official-message','Non puoi selezionare due eventi dello stesso calciatore.',true);return}
 const used=new Set(chosen.map(x=>x.player_role));if(used.has(ev.player_role)&&(!['semi_andata','semi_ritorno','finali'].includes(r.stage)||used.size<4)){
   msg('pc-official-message','Prima scegli un calciatore per ciascuno dei 4 ruoli.',true);return;
 }
 S.picks.set(id,'YES');}
 S.dirty=true;msg('pc-official-message','Modifiche non ancora salvate.');renderOfficial()}
function renderPublicEntries(round,events){const visible=closedRound(round);$('pc-public-entries').hidden=!visible;if(!visible)return;
 const rows=S.entries.filter(x=>x.round_id===round.id);const map=new Map(events.map(x=>[x.id,x]));
 const options=rows.map(e=>`<option value="${esc(e.team_id)}">${esc(S.teams.find(t=>t.id===e.team_id)?.name||'Franchigia')}</option>`).join('');
 $('pc-public-entry-list').innerHTML=rows.length?`<label>Scegli una franchigia: <select id="pc-entry-inspect">${options}</select></label><div id="pc-entry-inspect-result"></div>`:'Nessuna schedina presentata.';
 if(rows.length){const show=()=>{const row=rows.find(x=>x.team_id===$('pc-entry-inspect').value);if(!row)return;
 $('pc-entry-inspect-result').innerHTML=(row.picks||[]).map(p=>{const ev=map.get(Number(p.event_id));if(!ev)return '';return `<p>${p.event_id===row.hero_event_id?'⭐ ':p.event_id===row.backup_event_id?'🛡️ ':''}${esc(ev.kind==='match'?`${ev.home_name} vs ${ev.away_name}`:`${ev.player_name}: ${eventNames[ev.player_event]}`)} · <b>${esc(p.pick==='YES'?'SÌ':p.pick)}</b> (${fmt(quoteOf(ev,p.pick))})</p>`}).join('')};$('pc-entry-inspect').addEventListener('change',show);show();}
}
async function saveEntry(){const r=S.rounds.find(x=>x.id===S.active);if(!openRound(r))return msg('pc-official-message','Schedina già chiusa.',true);
 const picks=[...S.picks.entries()].map(([event_id,pick])=>({event_id,pick}));if(!picks.length)return msg('pc-official-message','Seleziona almeno un pronostico.',true);
 $('pc-official-save').disabled=true;
 try{const {error}=await supabase.rpc('pc_submit_entry',{p_round_id:r.id,p_picks:picks,p_hero_event_id:S.hero,p_backup_event_id:S.backup});if(error)throw error;
 S.dirty=false;await readOfficial();fillOwnEntry(r);renderOfficial();msg('pc-official-message','✅ Schedina registrata su Supabase. Puoi modificarla fino alla scadenza.');
 }catch(error){msg('pc-official-message',error.message,true)}finally{$('pc-official-save').disabled=!openRound(r)}
}
function renderLeaderboard(rows){const official=S.rounds.some(r=>r.status==='finalized');$('pc-official-ranking').hidden=!official;
 if(!official)return;
 let lastRank=1,hasTies=false;
 $('pc-official-leaderboard').innerHTML=rows.map((r,i)=>{
  const prev=rows[i-1];const tied=prev&&['points','correct_picks','correct_matches','hero_hits','last_round_points'].every(k=>Number(prev[k])===Number(r[k]));
  if(!tied)lastRank=i+1;else hasTies=true;
  return `<tr><td>${tied?'=':''}${lastRank}</td><td>${esc(r.team_name)}</td><td><strong>${fmt(r.points)}</strong></td><td>${r.correct_picks}</td><td>${r.correct_matches}</td><td>${r.hero_hits}</td></tr>`;
 }).join('');
 $('pc-ranking-tie-note').textContent=hasTies?'Parità perfetta dopo tutti i criteri numerici: serve il sorteggio ufficiale del Commissioner.':'';
 document.querySelector('.pc-future-ranking').hidden=true;
}
async function refreshLeaderboard(){const {data,error}=await supabase.rpc('pc_leaderboard',{p_season:'2026/27'});if(error)throw error;renderLeaderboard(data||[])}
async function loadModel(){const [teams,results,fixtures,history]=await Promise.all([
 getRows('teams','id,name,conference',q=>q.order('name')),
 getRows('fantacalcio_results','conference,phase,gw,team,opponent,points_for,result,is_home',q=>q.order('gw')),
 getRows('fantacalcio_fixtures','gw,home_team,away_team',q=>q.order('gw')),
 getRows('match_history','season,season_week,team_a,team_b,score_a,score_b',q=>q.eq('season','2025/26'))
 ]);S.teams=teams;S.projection=calculateProjectedStandings(teams,results);
 const accepted=results.filter(r=>Number(r.gw)<=S.projection.lastCompleted&&String(r.phase).toLowerCase()==='regular');
 S.model=buildModel({teams,results:accepted,fixtures,history});
}
function chooseActive(){const previous=S.active;
 const available=published();if(!available.length){S.active=null;return}
 if(!available.some(r=>r.id===S.active)){S.active=available.find(r=>openRound(r))?.id||available[available.length-1].id;}
 const r=S.rounds.find(x=>x.id===S.active);
 if(previous!==S.active || (S.lastRoundKey!==r.id && !S.dirty))fillOwnEntry(r);
}
async function update(){if(S.busy)return;
 if(S.dirty){const r=S.rounds.find(x=>x.id===S.active);if(openRound(r))return;S.dirty=false;}S.busy=true;try{await readOfficial();chooseActive();renderOfficial();await refreshLeaderboard();if(S.admin)renderAdmin();}catch(e){console.warn('Playoffs Challenge V4:',e);msg('pc-admin-feedback',e.message,true)}finally{S.busy=false;}}
function initialDraft(round){let rows=roundEvents(round.id);
 if(rows.length)return rows.map(e=>({...e}));
 return Array.from({length:stageData(round.stage)[2]},(_,i)=>({kind:'match',slot:i+1,home_name:'',away_name:'',q1:'',qx:'',q2:''}));}
function localDatetime(iso){if(!iso)return '';const d=new Date(iso);const offset=d.getTimezoneOffset()*60000;return new Date(d-offset).toISOString().slice(0,16)}
function renderAdmin(){if(!S.admin)return;
 const selected=Number($('pc-admin-stage').value||S.rounds[0]?.id);const r=S.rounds.find(x=>x.id===selected)||S.rounds[0];if(!r)return;
 $('pc-admin-stage').innerHTML=S.rounds.map(x=>`<option value="${x.id}">${esc(stageData(x.stage)[1])} · ${x.status}</option>`).join('');$('pc-admin-stage').value=r.id;
 $('pc-admin-deadline').value=localDatetime(r.closes_at);$('pc-admin-deadline').disabled=r.status!=='draft';
 $('pc-admin-draft').hidden=r.status!=='draft';$('pc-admin-grading').hidden=r.status==='draft'||r.status==='finalized';
 S.adminDraft=initialDraft(r);renderAdminDraft(r);
 if(r.status!=='draft')renderGrading(r);
}
function renderAdminDraft(r){const ms=S.adminDraft.filter(x=>x.kind==='match').sort((a,b)=>a.slot-b.slot);const ps=S.adminDraft.filter(x=>x.kind==='player');
 const teamOptions=S.teams.map(t=>`<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
 $('pc-admin-matches').innerHTML=ms.map((m,i)=>`<div class="pc-admin-match pc-panel" data-admin-match="${i}"><b>Partita ${m.slot}</b>
  <select data-field="home_name"><option value="">Prima franchigia</option>${teamOptions}</select><select data-field="away_name"><option value="">Seconda franchigia</option>${teamOptions}</select>
  <div class="pc-admin-odds">${['q1','qx','q2'].map(x=>`<label>${x.toUpperCase()} <input type="number" min="1.01" step="0.01" data-field="${x}" value="${esc(m[x]??'')}"></label>`).join('')}</div></div>`).join('');
 for(const [i,m] of ms.entries()){$('pc-admin-matches').querySelectorAll('[data-admin-match]')[i].querySelector('[data-field="home_name"]').value=m.home_name||'';$('pc-admin-matches').querySelectorAll('[data-admin-match]')[i].querySelector('[data-field="away_name"]').value=m.away_name||'';}
 $('pc-admin-players').innerHTML=ps.map((m,i)=>`<div class="pc-admin-player pc-panel" data-admin-player="${i}"><input placeholder="Nome calciatore" data-player-field="player_name" value="${esc(m.player_name||'')}"><select data-player-field="player_role">${Object.entries(roles).map(([code,label])=>`<option value="${code}" ${code===m.player_role?'selected':''}>${label}</option>`).join('')}</select><select data-player-field="player_event"></select><label>Quota <input type="number" min="1.01" step="0.01" data-player-field="qyes" value="${esc(m.qyes||'')}"></label><button type="button" class="pc-button pc-ghost" data-remove-player="${i}">Rimuovi</button></div>`).join('');
 for(const [i,m] of ps.entries())renderEventChoice($('pc-admin-players').querySelectorAll('[data-admin-player]')[i],m.player_role||'P',m.player_event);
}
function renderEventChoice(row,role,event){const el=row.querySelector('[data-player-field="player_event"]');el.innerHTML=(roleEvents[role]||roleEvents.P).map(x=>`<option value="${x}">${eventNames[x]}</option>`).join('');if(event&&roleEvents[role]?.includes(event))el.value=event}
function collectAdminDraft(){const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!r||r.status!=='draft')return;
 const matches=[...$('pc-admin-matches').querySelectorAll('[data-admin-match]')].map((row,i)=>{
  const old=S.adminDraft.filter(e=>e.kind==='match')[i];const m={kind:'match',slot:old.slot};for(const x of ['home_name','away_name','q1','qx','q2'])m[x]=row.querySelector(`[data-field="${x}"]`).value;return m});
 const players=[...$('pc-admin-players').querySelectorAll('[data-admin-player]')].map(row=>{const x={kind:'player'};for(const key of ['player_name','player_role','player_event','qyes'])x[key]=row.querySelector(`[data-player-field="${key}"]`).value;return x});
 S.adminDraft=[...matches,...players];
}
async function generateOdds(){collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!S.model||!r)return;
 for(const m of S.adminDraft.filter(x=>x.kind==='match')){if(!m.home_name||!m.away_name||normalizeTeam(m.home_name)===normalizeTeam(m.away_name))continue;
 try{const q=quoteMatch(S.model,m.home_name,m.away_name,r.stage);m.q1=q.q1;m.qx=q.qx;m.q2=q.q2}catch(err){msg('pc-admin-feedback',`Quote ${m.home_name}: ${err.message}`,true)}}renderAdminDraft(r);msg('pc-admin-feedback','Quote generate. Controllale prima della pubblicazione.');}
function seedFromForecast(){collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!r||r.stage!=='ottavi'||!S.projection?.hasSufficientData){msg('pc-admin-feedback','Proiezione disponibile soltanto per gli ottavi.',true);return}
 S.adminDraft.filter(x=>x.kind==='match').forEach((m,i)=>{m.home_name=S.projection.fixtures[i].home.name;m.away_name=S.projection.fixtures[i].away.name;});renderAdminDraft(r);msg('pc-admin-feedback','Ottavi proiettati caricati. Prima di pubblicare, verifica il seeding UFFICIALE.');}
async function saveAdmin(publish=false){collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!r||r.status!=='draft')return;
 const when=$('pc-admin-deadline').value;if(!when) return msg('pc-admin-feedback','Inserisci prima la scadenza.',true);
 const deadline=new Date(when);if(!Number.isFinite(deadline.getTime())||deadline<=Date.now())return msg('pc-admin-feedback','La scadenza deve essere futura.',true);
 let events=S.adminDraft.map(m=>m.kind==='match'?{kind:'match',slot:Number(m.slot),home_name:m.home_name,away_name:m.away_name,q1:Number(m.q1),qx:Number(m.qx),q2:Number(m.q2)}:{kind:'player',player_name:m.player_name,player_role:m.player_role,player_event:m.player_event,qyes:Number(m.qyes)});
 if(events.some(m=>m.kind==='match'&&(!m.home_name||!m.away_name||m.home_name===m.away_name||[m.q1,m.qx,m.q2].some(x=>x<=1)))||events.some(m=>m.kind==='player'&&(!m.player_name||m.qyes<=1)))return msg('pc-admin-feedback','Controlla che tutte le partite e le quote siano compilate.',true);
 try{let {error}=await supabase.rpc('pc_admin_save_round',{p_round_id:r.id,p_closes_at:deadline.toISOString(),p_events:events});if(error)throw error;
 if(publish){if(!confirm('Pubblicare definitivamente quote ed eventi? Gli allenatori potranno consegnare subito. Dopo la pubblicazione NON potrai più modificare le quote.'))return;
 ({error}=await supabase.rpc('pc_admin_publish_round',{p_round_id:r.id}));if(error)throw error;}
 await readOfficial();renderAdmin();chooseActive();renderOfficial();msg('pc-admin-feedback',publish?'✅ Turno pubblicato ufficialmente!':'✅ Bozza salvata su Supabase.');
 }catch(error){msg('pc-admin-feedback',error.message,true)}
}
function renderGrading(r){const events=roundEvents(r.id);const canGrade=Date.now()>=new Date(r.closes_at).getTime();$('pc-admin-finalize').disabled=!canGrade;
 $('pc-admin-outcomes').innerHTML=events.map(ev=>{const title=ev.kind==='match'?`${ev.home_name} vs ${ev.away_name}`:`${ev.player_name}: ${eventNames[ev.player_event]}`;
 const options=ev.kind==='match'?[['1','1'],['X','X'],['2','2'],['VOID','Annullato']]:[['YES','Avvenuto'],['NO','Non avvenuto'],['VOID','Annullato']];
 return `<div class="pc-grading-row"><strong>${esc(title)}</strong><select data-grade-id="${ev.id}" ${canGrade?'':'disabled'}><option value="">Da verificare</option>${options.map(([value,label])=>`<option value="${value}" ${ev.result_sign===value?'selected':''}>${label}</option>`).join('')}</select><button type="button" data-grade-save="${ev.id}" class="pc-button pc-ghost" ${canGrade?'':'disabled'}>Salva esito</button></div>`}).join('');
 if(!canGrade)msg('pc-admin-feedback',`Potrai inserire gli esiti dopo la scadenza: ${new Date(r.closes_at).toLocaleString('it-IT')}`);
}
async function setGrade(id){const v=$(`[data-grade-id="${id}"]`)?.value||null;const {error}=await supabase.rpc('pc_admin_set_result',{p_event_id:id,p_result:v});if(error)return msg('pc-admin-feedback',error.message,true);
 await readOfficial();renderGrading(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value)));msg('pc-admin-feedback','✅ Esito salvato.')}
async function finalize(){const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!confirm('Omologare definitivamente la giornata e aggiornare la classifica?'))return;
 const {error}=await supabase.rpc('pc_admin_finalize_round',{p_round_id:r.id});if(error)return msg('pc-admin-feedback',error.message,true);
 await update();msg('pc-admin-feedback','🏆 Giornata omologata. La classifica ufficiale è aggiornata.');}
function bind(){
 $('pc-official-stage').addEventListener('change',e=>{const id=Number(e.target.value);S.active=id;fillOwnEntry(S.rounds.find(r=>r.id===id));renderOfficial()});
 $('pc-official').addEventListener('click',e=>{const pick=e.target.closest('[data-official-pick]');if(pick)return toggleMatch(Number(pick.dataset.officialPick),pick.dataset.sign);
 const player=e.target.closest('[data-official-player]');if(player)return togglePlayer(Number(player.dataset.officialPlayer));
 const h=e.target.closest('[data-official-hero]');if(h){const id=Number(h.dataset.officialHero);if(!S.picks.has(id))return;S.hero=S.hero===id?null:id;if(S.backup===id)S.backup=null;S.dirty=true;renderOfficial();return}
 const b=e.target.closest('[data-official-backup]');if(b){const id=Number(b.dataset.officialBackup);if(!S.picks.has(id))return;S.backup=S.backup===id?null:id;if(S.hero===id)S.hero=null;S.dirty=true;renderOfficial();}
 });
 $('pc-official-clear').addEventListener('click',()=>{S.picks.clear();S.hero=null;S.backup=null;S.dirty=true;renderOfficial()});
 $('pc-official-save').addEventListener('click',saveEntry);
 $('pc-admin-stage').addEventListener('change',renderAdmin);
 $('pc-admin-matches').addEventListener('change',collectAdminDraft);
 $('pc-admin-matches').addEventListener('input',collectAdminDraft);
 $('pc-admin-players').addEventListener('change',e=>{const row=e.target.closest('[data-admin-player]');if(e.target.dataset.playerField==='player_role')renderEventChoice(row,e.target.value);collectAdminDraft()});
 $('pc-admin-players').addEventListener('input',collectAdminDraft);
 $('pc-admin-players').addEventListener('click',e=>{const btn=e.target.closest('[data-remove-player]');if(!btn)return;collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));const players=S.adminDraft.filter(x=>x.kind==='player');const removed=players[Number(btn.dataset.removePlayer)];S.adminDraft=S.adminDraft.filter(x=>x!==removed);renderAdminDraft(r)});
 $('pc-admin-add-player').addEventListener('click',()=>{collectAdminDraft();S.adminDraft.push({kind:'player',player_name:'',player_role:'P',player_event:'CLEAN_SHEET',qyes:''});renderAdminDraft(S.rounds.find(x=>x.id===Number($('pc-admin-stage').value)))});
 $('pc-admin-forecast').addEventListener('click',seedFromForecast);
 $('pc-admin-generate').addEventListener('click',generateOdds);
 $('pc-admin-save-draft').addEventListener('click',()=>saveAdmin(false));
 $('pc-admin-publish').addEventListener('click',()=>saveAdmin(true));
 $('pc-admin-outcomes').addEventListener('click',e=>{const btn=e.target.closest('[data-grade-save]');if(btn)setGrade(Number(btn.dataset.gradeSave))});
 $('pc-admin-finalize').addEventListener('click',finalize);
 window.addEventListener('hashchange',()=>{if(location.hash==='#admin'&&!S.admin)location.hash='#schedina'});
}
(async function init(){try{
 const {data:{user},error}=await supabase.auth.getUser();if(error||!user)return;S.user=user;
 const [profile,role]=await Promise.all([
 supabase.from('profiles').select('team_id').eq('id',user.id).maybeSingle(),supabase.rpc('totoeroi_is_admin')]);
 S.teamId=profile.data?.team_id||null;S.admin=role.data===true&&!role.error;
 $('pc-admin-tab').hidden=!S.admin;
 if(!S.admin && location.hash==='#admin')location.hash='#schedina';
 if(S.admin){document.getElementById('pc-admin-shortcut').querySelector('p').textContent='Gestisci quote, pronostici e omologazioni dal nuovo tab Commissioner, oppure consulta il motore statistico V2.';}
 bind();await loadModel();await readOfficial();chooseActive();renderOfficial();await refreshLeaderboard();if(S.admin)renderAdmin();
 setInterval(()=>{if(!document.hidden)update()},90000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
}catch(e){console.error('Playoffs Challenge V4 non pronta:',e);msg('pc-official-message',e.message,true);}}
)();
