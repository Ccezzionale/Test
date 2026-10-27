/* Playoffs Challenge V4: backend ufficiale + Commissioner. Non usa SERVICE_ROLE nel browser. */
import {supabase} from './supabase.js';
import {buildModel,quoteMatch,normalizeTeam} from './bookmaker-engine.js';
import {calculateProjectedStandings} from './bookmaker-seeding.js';
import {mountCommissionerSimulator} from './bookmaker-simulator.js?v=pc-v9-4-admin';
import {mountPlayerBookmaker} from './bookmaker-players.js?v=pc-v9-3';
import {mountDemoPlayerPicker} from './pc-player-picker.js?v=pc-v9-3';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
const stages=[['ottavi','Ottavi · G30',4,4],['quarti','Quarti · G31',4,4],['semi_andata','Semifinali andata · G32',2,6],['semi_ritorno','Semifinali ritorno · G33',2,6],['finali','Finali · G34',2,6]];
const roles={P:'🧤 POR',D:'🛡️ DIF',C:'🎯 CEN',A:'⚽ ATT'};
const eventNames={CLEAN_SHEET:'Clean sheet',PENALTY_SAVE:'Rigore parato',GOAL:'Gol',ASSIST:'Assist',GOAL_OR_ASSIST:'Gol o assist',BRACE:'Doppietta'};
const roleEvents={P:['CLEAN_SHEET','PENALTY_SAVE'],D:['GOAL','ASSIST','CLEAN_SHEET'],C:['GOAL','ASSIST','GOAL_OR_ASSIST'],A:['GOAL','ASSIST','BRACE']};
const S={rounds:[],events:[],entries:[],user:null,teamId:null,admin:false,active:null,model:null,projection:null,teams:[],
 picks:new Map(),hero:null,backup:null,dirty:false,adminDraft:[],adminDraftRoundId:null,busy:false,lastRoundKey:null,modelInput:null,modelUpdated:0,simulator:null,playerBookmaker:null,leaderboardRows:[],playerRole:'P',playerSearch:'',playerEvent:'ALL'};
function stageData(stage){return stages.find(x=>x[0]===stage)||stages[0]}
function openRound(r){return r?.status==='open' && new Date(r.closes_at).getTime()>Date.now()}
function closedRound(r){return r?.status==='finalized'||(r?.status==='open' && new Date(r.closes_at).getTime()<=Date.now())}
function msg(id,message,isError=false){let el=$(id);if(!el)return;el.textContent=message;el.classList.toggle('pc-feedback-error',!!isError)}
function quoteOf(e,sign){return Number(sign==='1'?e.q1:sign==='X'?e.qx:sign==='2'?e.q2:e.qyes)}
async function getRows(table,fields,cb=q=>q){let {data,error}=await cb(supabase.from(table).select(fields).limit(1000));if(error)throw new Error(`${table}: ${error.message}`);return data||[]}
async function getAllRows(table,fields){const out=[],size=600;for(let start=0;start<10000;start+=size){
 const {data,error}=await supabase.from(table).select(fields).order('id').range(start,start+size-1);
 if(error)throw new Error(table+': '+error.message);out.push(...(data||[]));if(!data||data.length<size)break;
}return out;}
async function readOfficial(){const [rounds,events,entries]=await Promise.all([
 getRows('pc_rounds','*',q=>q.eq('season','2026/27').order('gw')),
 getAllRows('pc_events','*'),
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
 renderPlayerPicker(current,player,editable);
 renderSummary(current,e);
 renderPublicEntries(current,e);
}

function playerCard(ev,editable){
 const checked=S.picks.has(Number(ev.id));
 return `<div class="pc-player-option ${checked?'chosen':''}"><div><small>${esc(roles[ev.player_role])}</small><strong>${esc(ev.player_name)}</strong><span>${esc(eventNames[ev.player_event])}</span></div><button class="pc-button ${checked?'pc-primary':'pc-ghost'}" type="button" data-official-player="${ev.id}" ${editable?'':'disabled'}>${checked?'✓ Scelto':'+ Seleziona'} · ${fmt(ev.qyes)}</button>${heroControls(ev,editable)}</div>`;
}
function renderPlayerPicker(round,player,editable){
 const labels=Object.entries(roles);
 $('pc-official-role-picker').innerHTML=labels.map(([key,label])=>{
  const n=player.filter(x=>x.player_role===key).length;
  const chosen=player.filter(x=>x.player_role===key&&S.picks.has(Number(x.id))).length;
  return `<button type="button" class="pc-role-choice ${S.playerRole===key?'active':''}" data-picker-role="${key}" aria-pressed="${S.playerRole===key}"><strong>${label}</strong><small>${chosen} scelti · ${n} quote</small></button>`;
 }).join('');
 const event=$('pc-official-player-event'),prev=S.playerEvent;
 event.innerHTML=`<option value="ALL">Tutti gli eventi</option>`+(roleEvents[S.playerRole]||[]).map(x=>`<option value="${x}">${esc(eventNames[x])}</option>`).join('');
 event.value=roleEvents[S.playerRole]?.includes(prev)?prev:'ALL';S.playerEvent=event.value;
 const q=S.playerSearch.toLocaleLowerCase('it');
 const filtered=player.filter(x=>x.player_role===S.playerRole&&(S.playerEvent==='ALL'||x.player_event===S.playerEvent)&&(!q||`${x.player_name} ${x.player_event}`.toLocaleLowerCase('it').includes(q)));
 const size=36,display=filtered.slice(0,size);
 $('pc-official-player-info').textContent=`${filtered.length} quote ufficiali disponibili per ${roles[S.playerRole]}. ${filtered.length>size?'Mostro le prime '+size+': cerca il nome per restringere.':''} ${editable?'Puoi aggiungere un evento alla schedina.':'Turno chiuso: le quote restano consultabili.'}`;
 $('pc-official-players').innerHTML=display.length?display.map(x=>playerCard(x,editable)).join(''):'Nessun evento pubblicato per questo ruolo o questa ricerca.';
 const selected=player.filter(x=>S.picks.has(Number(x.id)));
 $('pc-official-player-selected').innerHTML=selected.length?selected.map(x=>`<div class="pc-picker-chip"><span><b>${esc(roles[x.player_role])}</b> · ${esc(x.player_name)} · ${esc(eventNames[x.player_event])} <strong>${fmt(x.qyes)}</strong></span><button type="button" class="pc-button pc-ghost" data-official-player="${x.id}" ${editable?'':'disabled'}>Rimuovi</button></div>`).join(''):'<p>Nessun calciatore ancora selezionato.</p>';
 $('pc-official-player-search').value=S.playerSearch;
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
function renderLeaderboard(rows){
 S.leaderboardRows=rows;
 const official=S.rounds.some(r=>r.status==='finalized');$('pc-official-ranking').hidden=!official;
 if(!official)return;
 const filter=$('pc-ranking-filter')?.value||'all';
 const selected=filter==='all'?rows:rows.filter(r=>r.conference===filter);
 let lastRank=1,hasTies=false;
 $('pc-official-leaderboard').innerHTML=selected.map((r,i)=>{
  const prev=selected[i-1];const tied=prev&&['points','correct_picks','correct_matches','hero_hits','last_round_points'].every(k=>Number(prev[k])===Number(r[k]));
  if(!tied)lastRank=i+1;else hasTies=true;
  return `<tr><td>${tied?'=':''}${lastRank}</td><td>${esc(r.team_name)}</td><td><strong>${fmt(r.points)}</strong></td><td>${r.correct_picks}</td><td>${r.correct_matches}</td><td>${r.hero_hits}</td></tr>`;
 }).join('');
 $('pc-ranking-tie-note').textContent=hasTies?'Parità dopo tutti i criteri numerici: per questa graduatoria servirà il sorteggio ufficiale del Commissioner.':'';
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
 S.modelInput={teams,results:accepted,fixtures,history};S.model=buildModel(S.modelInput);S.modelUpdated=Date.now();
 if(S.simulator)S.simulator.setSnapshot({originalModel:S.model,data:S.modelInput});
}
function chooseActive(){const previous=S.active;
 const available=published();if(!available.length){S.active=null;return}
 if(!available.some(r=>r.id===S.active)){S.active=available.find(r=>openRound(r))?.id||available[available.length-1].id;}
 const r=S.rounds.find(x=>x.id===S.active);
 if(previous!==S.active || (S.lastRoundKey!==r.id && !S.dirty))fillOwnEntry(r);
}
async function update(){if(S.busy)return;
 if(S.dirty){const r=S.rounds.find(x=>x.id===S.active);if(openRound(r))return;S.dirty=false;}S.busy=true;try{await readOfficial();chooseActive();renderOfficial();await refreshLeaderboard();
 if(S.admin && Date.now()-S.modelUpdated>5*60*1000)await loadModel();
 if(S.admin && !$('pc-tab-admin').classList.contains('active'))renderAdmin();}catch(e){console.warn('Playoffs Challenge V4:',e);msg('pc-admin-feedback',e.message,true)}finally{S.busy=false;}}
function initialDraft(round){let rows=roundEvents(round.id).filter(x=>!x.is_catalog);
 if(rows.length)return rows.map(e=>({...e}));
 return Array.from({length:stageData(round.stage)[2]},(_,i)=>({kind:'match',slot:i+1,home_name:'',away_name:'',q1:'',qx:'',q2:''}));}
function localDatetime(iso){if(!iso)return '';const d=new Date(iso);const offset=d.getTimezoneOffset()*60000;return new Date(d-offset).toISOString().slice(0,16)}
function renderAdminGuide(r){
 if(!r||!S.admin)return;
 const status={draft:'In preparazione',open:'Pubblicato',finalized:'Omologato'}[r.status]||r.status;
 const roundNote=$('pc-guide-round-status');
 if(roundNote)roundNote.textContent=r.status==='draft'?
   `Stato: ${status}. Gli allenatori NON possono ancora consegnare schedine per questo turno.`:
   r.status==='open'?`Stato: ${status}. Le quote sono bloccate. Termine consegna: ${new Date(r.closes_at).toLocaleString('it-IT')}.`:
   'Stato: omologato. Le classifiche sono ufficiali; eventuali correzioni richiedono una motivazione.';
 const unpublishBox=$('pc-unpublish-panel');
 if(unpublishBox){
   const isPublished=r.status==='open';
   const entryCount=S.entries.filter(e=>Number(e.round_id)===Number(r.id)).length;
   unpublishBox.hidden=!isPublished;
   if(isPublished){
     $('pc-unpublish-count').textContent=entryCount
       ? `${entryCount} schedine già consegnate: NON puoi tornare in bozza senza gestire prima i pronostici ricevuti.`
       : 'Nessuna schedina consegnata: puoi ritirare questa pubblicazione senza perdere partite e quote.';
     $('pc-admin-unpublish').disabled=entryCount>0;
   }
 }
 const label=(n,value,ok=false)=>{
   const node=$(`pc-guide-state-${n}`);if(!node)return;
   node.textContent=value;node.classList.toggle('pc-step-done',ok);
 };
 label(1,status,true);
 const selected=S.adminDraft.filter(x=>x.kind==='match');
 const needed=stageData(r.stage)[2];
 const named=selected.filter(x=>x.home_name&&x.away_name&&normalizeTeam(x.home_name)!==normalizeTeam(x.away_name)).length;
 const quoted=selected.filter(x=>x.home_name&&x.away_name&&['q1','qx','q2'].every(key=>Number(x[key])>=1.01)).length;
 label(2,`${named}/${needed} partite`,named===needed);
 label(3,quoted===needed?'Quote presenti':`${quoted}/${needed} quote complete`,quoted===needed);
 const catalog=roundEvents(r.id).filter(x=>x.is_catalog).length;
 const manualRoles=new Set(S.adminDraft.filter(x=>x.kind==='player'&&x.player_name&&Number(x.qyes)>=1.01).map(x=>x.player_role)).size;
 label(4,catalog?`${catalog} eventi pronti`:(manualRoles===4?'4 ruoli manuali':'Catalogo mancante'),catalog>0||manualRoles===4);
 label(5,r.status==='draft'?(r.closes_at?'Bozza salvata':'Non pubblicata'):'Pubblicato',r.status!=='draft');
 const gradingStatus=r.status==='finalized'?'Omologato':r.status==='open'?(closedRound(r)?'Pronto per gli esiti':'In attesa della scadenza'):'In attesa';
 label(6,gradingStatus,r.status==='finalized');
 const publish=$('pc-admin-publish');
 if(publish)publish.disabled=r.status!=='draft'||named!==needed||quoted!==needed||(!catalog&&manualRoles!==4)||!$('pc-admin-deadline').value;
}
function renderAdmin(){if(!S.admin)return;
 const selected=Number($('pc-admin-stage').value||S.rounds[0]?.id);const r=S.rounds.find(x=>x.id===selected)||S.rounds[0];if(!r)return;
 $('pc-admin-stage').innerHTML=S.rounds.map(x=>`<option value="${x.id}">${esc(stageData(x.stage)[1])} · ${x.status}</option>`).join('');$('pc-admin-stage').value=r.id;
 $('pc-admin-deadline').value=localDatetime(r.closes_at);$('pc-admin-deadline').disabled=r.status!=='draft';
 $('pc-admin-draft').hidden=r.status!=='draft';$('pc-admin-grading').hidden=r.status==='draft';
 if(S.adminDraftRoundId!==r.id){S.adminDraft=initialDraft(r);S.adminDraftRoundId=r.id;}
 renderAdminDraft(r);S.simulator?.refresh();S.playerBookmaker?.refresh();renderAdminGuide(r);
 const count=roundEvents(r.id).filter(x=>x.is_catalog).length;const summary=$('pc-cat-status');if(summary)summary.textContent=count?`✅ ${count} eventi nel catalogo del turno. Le quote restano provvisorie finché non pubblichi.`:'Nessun catalogo ancora preparato. Le scelte ufficiali saranno limitate agli eventi che inserisci manualmente.';
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
 S.simulator?.refresh();renderAdminGuide(r);
}
function renderEventChoice(row,role,event){const el=row.querySelector('[data-player-field="player_event"]');el.innerHTML=(roleEvents[role]||roleEvents.P).map(x=>`<option value="${x}">${eventNames[x]}</option>`).join('');if(event&&roleEvents[role]?.includes(event))el.value=event}
function collectAdminDraft(){const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!r||r.status!=='draft')return;
 const matches=[...$('pc-admin-matches').querySelectorAll('[data-admin-match]')].map((row,i)=>{
  const old=S.adminDraft.filter(e=>e.kind==='match')[i];const m={kind:'match',slot:old.slot};for(const x of ['home_name','away_name','q1','qx','q2'])m[x]=row.querySelector(`[data-field="${x}"]`).value;return m});
 const players=[...$('pc-admin-players').querySelectorAll('[data-admin-player]')].map(row=>{const x={kind:'player'};for(const key of ['player_name','player_role','player_event','qyes'])x[key]=row.querySelector(`[data-player-field="${key}"]`).value;return x});
 S.adminDraft=[...matches,...players];
}
async function prepareFullCatalog(){
 const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));
 if(!r||r.status!=='draft')return msg('pc-cat-status','Catalogo modificabile solo in bozza.',true);
 if(!$('pc-cat-ack').checked)return msg('pc-cat-status','Devi prima confermare di aver controllato le quote editoriali per i clean sheet e i rigori parati.',true);
 const manual={'P:CLEAN_SHEET':Number($('pc-cat-p-cs').value),'P:PENALTY_SAVE':Number($('pc-cat-p-pen').value),'D:CLEAN_SHEET':Number($('pc-cat-d-cs').value)};
 if(Object.values(manual).some(x=>!Number.isFinite(x)||x<1.01||x>10000))return msg('pc-cat-status','Inserisci tre quote editoriali valide (almeno 1,01).',true);
 let catalog;
 try{catalog=S.playerBookmaker?.catalogue(manual);if(!catalog)throw new Error('Bookmaker non ancora disponibile.');}
 catch(e){return msg('pc-cat-status',e.message,true)}
 const existing=roundEvents(r.id).filter(x=>x.is_catalog).length;
 if(!confirm(`Generare ${catalog.rows.length} quote da ${catalog.players} calciatori (di cui ${catalog.editorial} EDITORIALI da controllare)? ${existing?'Il catalogo precedente verrà sostituito.':''} Saranno solo in BOZZA e dovrai pubblicarle manualmente.`))return;
 const button=$('pc-cat-generate');button.disabled=true;
 msg('pc-cat-status',`Salvataggio di ${catalog.rows.length} quote in Supabase…`);
 try{
  const {data,error}=await supabase.rpc('pc_admin_replace_player_catalog',{p_round_id:r.id,p_rows:catalog.rows});
  if(error)throw error;
  await readOfficial();
  msg('pc-cat-status',`✅ ${data} quote in BOZZA salvate (${catalog.supported} statistiche, ${catalog.editorial} editoriali). Dopo la pubblicazione tutti gli allenatori potranno cercare i calciatori.`);renderAdminGuide(r);
 }catch(e){msg('pc-cat-status',e.message,true)}finally{button.disabled=false;}
}
async function unpublishRound(){
 const id=Number($('pc-admin-stage').value);
 const r=S.rounds.find(x=>Number(x.id)===id);
 if(!r||r.status!=='open')return msg('pc-admin-feedback','Questa giornata non è pubblicata.',true);
 const submitted=S.entries.filter(e=>Number(e.round_id)===id).length;
 if(submitted)return msg('pc-admin-feedback',`Operazione bloccata: ci sono già ${submitted} schedine consegnate.`,true);
 if(!confirm(`RITIRARE la pubblicazione di ${stageData(r.stage)[1]}?\n\nLe schedine si chiuderanno subito e il turno tornerà in bozza. Partite, calciatori e quote NON verranno cancellati.\n\nConsentito soltanto se nessuno ha già consegnato pronostici.`))return;
 const btn=$('pc-admin-unpublish');btn.disabled=true;
 try{
   const {error}=await supabase.rpc('pc_admin_unpublish_round',{p_round_id:id});
   if(error)throw error;
   await readOfficial();S.adminDraftRoundId=null;
   chooseActive();renderOfficial();renderAdmin();
   msg('pc-admin-feedback','✅ Pubblicazione ritirata. La giornata è di nuovo in bozza: puoi modificare quote e partite ai passaggi 02–05. Gli eventi già preparati sono rimasti salvati.');
 }catch(e){msg('pc-admin-feedback',`Impossibile tornare in bozza: ${e.message}`,true);
   await readOfficial().catch(()=>{});renderAdmin();
 }finally{btn.disabled=false;renderAdminGuide(S.rounds.find(x=>Number(x.id)===id));}
}
async function generateOdds(){collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!S.model||!r)return;
 if(document.querySelector('input[name="pc-sim-mode"]:checked')?.value==='custom'&&!S.simulator?.getWeights())return msg('pc-admin-feedback','Correggi prima i tre pesi personalizzati: devono sommare esattamente il 100%.',true);
 const adjustedModel=S.simulator?.getQuoteModel()||S.model;
 for(const m of S.adminDraft.filter(x=>x.kind==='match')){if(!m.home_name||!m.away_name||normalizeTeam(m.home_name)===normalizeTeam(m.away_name))continue;
 try{const q=quoteMatch(adjustedModel,m.home_name,m.away_name,r.stage);m.q1=q.q1;m.qx=q.qx;m.q2=q.q2}catch(err){msg('pc-admin-feedback',`Quote ${m.home_name}: ${err.message}`,true)}}renderAdminDraft(r);msg('pc-admin-feedback','Quote generate. Controllale prima della pubblicazione.');}
function seedFromForecast(){collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!r||r.stage!=='ottavi'||!S.projection?.hasSufficientData){msg('pc-admin-feedback','Proiezione disponibile soltanto per gli ottavi.',true);return}
 S.adminDraft.filter(x=>x.kind==='match').forEach((m,i)=>{m.home_name=S.projection.fixtures[i].home.name;m.away_name=S.projection.fixtures[i].away.name;});renderAdminDraft(r);S.simulator?.refresh();msg('pc-admin-feedback','Ottavi proiettati caricati. Prima di pubblicare, verifica il seeding UFFICIALE.');}
async function saveAdmin(publish=false){collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!r||r.status!=='draft')return;
 const when=$('pc-admin-deadline').value.trim();
 if(publish&&!when)return msg('pc-admin-feedback','Prima di pubblicare inserisci la scadenza della giornata.',true);
 const deadline=when?new Date(when):null;
 if(deadline&&(!Number.isFinite(deadline.getTime())||deadline<=Date.now()))return msg('pc-admin-feedback','La scadenza deve essere futura.',true);
 if(publish){const catalogCount=roundEvents(r.id).filter(x=>x.is_catalog).length;
    const rolesCovered=new Set(S.adminDraft.filter(x=>x.kind==='player').map(x=>x.player_role)).size;
    if(!catalogCount&&rolesCovered<4)return msg('pc-admin-feedback','Prepara prima il catalogo completo dei calciatori al passo 04. In alternativa servono eventi validi per tutti e quattro i ruoli.',true);
 }
 let events=S.adminDraft.map(m=>m.kind==='match'?{kind:'match',slot:Number(m.slot),home_name:m.home_name,away_name:m.away_name,q1:Number(m.q1),qx:Number(m.qx),q2:Number(m.q2)}:{kind:'player',player_name:m.player_name,player_role:m.player_role,player_event:m.player_event,qyes:Number(m.qyes)});
 if(events.some(m=>m.kind==='match'&&(!m.home_name||!m.away_name||m.home_name===m.away_name||[m.q1,m.qx,m.q2].some(x=>x<=1)))||events.some(m=>m.kind==='player'&&(!m.player_name||m.qyes<=1)))return msg('pc-admin-feedback','Controlla che tutte le partite e le quote siano compilate.',true);
 try{let {error}=await supabase.rpc('pc_admin_save_round',{p_round_id:r.id,p_closes_at:deadline?deadline.toISOString():null,p_events:events});if(error)throw error;
 if(publish){if(!confirm('Pubblicare definitivamente quote ed eventi? Gli allenatori potranno consegnare subito. Dopo la pubblicazione NON potrai più modificare le quote.'))return;
 ({error}=await supabase.rpc('pc_admin_publish_round',{p_round_id:r.id}));if(error)throw error;}
 await readOfficial();S.adminDraftRoundId=null;renderAdmin();chooseActive();renderOfficial();msg('pc-admin-feedback',publish?'✅ Turno pubblicato ufficialmente!':'✅ Bozza salvata su Supabase.');
 }catch(error){msg('pc-admin-feedback',error.message,true)}
}
function renderGrading(r){
 const selected=new Set(S.entries.filter(e=>Number(e.round_id)===Number(r.id)).flatMap(e=>(e.picks||[]).map(p=>Number(p.event_id))));
 const events=roundEvents(r.id).filter(ev=>ev.kind==='match'||selected.has(Number(ev.id)));
 const canGrade=r.status==='open' && Date.now()>=new Date(r.closes_at).getTime();
 const finalized=r.status==='finalized';
 $('pc-admin-finalize').hidden=finalized;
 $('pc-admin-finalize').disabled=!canGrade;
 $('pc-admin-outcomes').hidden=finalized;
 $('pc-admin-corrections').hidden=!finalized;
 if(finalized){
  $('pc-admin-correction-items').innerHTML=events.map(ev=>{
   const title=ev.kind==='match'?`${ev.home_name} vs ${ev.away_name}`:`${ev.player_name}: ${eventNames[ev.player_event]}`;
   const opts=ev.kind==='match'?[['1','1'],['X','X'],['2','2'],['VOID','Annullato']]:[['YES','Avvenuto'],['NO','Non avvenuto'],['VOID','Annullato']];
   return `<div class="pc-correction-row" data-correction-row="${ev.id}"><strong>${esc(title)}</strong><small>Esito omologato: ${esc(ev.result_sign)}</small><label>Nuovo esito <select data-correction-value>${opts.map(([v,label])=>`<option value="${v}" ${ev.result_sign===v?'selected':''}>${label}</option>`).join('')}</select></label><label>Motivazione della rettifica <input data-correction-reason maxlength="500" placeholder="Es. assist rettificato dal sito ufficiale" /></label><button type="button" class="pc-button pc-ghost" data-correction-save="${ev.id}">Salva rettifica</button></div>`;
  }).join('');
  loadCorrectionLog(r.id);
  return;
 }
 $('pc-admin-outcomes').innerHTML=events.map(ev=>{const title=ev.kind==='match'?`${ev.home_name} vs ${ev.away_name}`:`${ev.player_name}: ${eventNames[ev.player_event]}`;
 const options=ev.kind==='match'?[['1','1'],['X','X'],['2','2'],['VOID','Annullato']]:[['YES','Avvenuto'],['NO','Non avvenuto'],['VOID','Annullato']];
 return `<div class="pc-grading-row"><strong>${esc(title)}</strong><select data-grade-id="${ev.id}" ${canGrade?'':'disabled'}><option value="">Da verificare</option>${options.map(([value,label])=>`<option value="${value}" ${ev.result_sign===value?'selected':''}>${label}</option>`).join('')}</select><button type="button" data-grade-save="${ev.id}" class="pc-button pc-ghost" ${canGrade?'':'disabled'}>Salva esito</button></div>`}).join('');
 if(!canGrade)msg('pc-admin-feedback',`Potrai inserire gli esiti dopo la scadenza: ${new Date(r.closes_at).toLocaleString('it-IT')}`);
}
async function loadCorrectionLog(roundId){
 const target=$('pc-admin-correction-log');if(!target)return;
 target.textContent='Caricamento storico…';
 const {data,error}=await supabase.from('pc_result_corrections').select('event_id,old_result,new_result,reason,corrected_at').eq('round_id',roundId).order('corrected_at',{ascending:false}).limit(100);
 if(Number($('pc-admin-stage').value)!==Number(roundId))return;
 if(error){target.textContent=`Impossibile leggere lo storico: ${error.message}`;return;}
 const events=new Map(roundEvents(roundId).map(e=>[Number(e.id),e]));
 target.innerHTML=data?.length?data.map(row=>{
  const ev=events.get(Number(row.event_id));const name=ev?.kind==='match'?`${ev.home_name} vs ${ev.away_name}`:(ev?`${ev.player_name} · ${eventNames[ev.player_event]}`:`Evento ${row.event_id}`);
  return `<p class="pc-correction-history"><strong>${esc(name)}</strong> · ${esc(row.old_result)} → ${esc(row.new_result)}<small>${new Date(row.corrected_at).toLocaleString('it-IT')} · ${esc(row.reason)}</small></p>`;
 }).join(''):'Nessuna rettifica effettuata.';
}
async function correctResult(id){
 const row=$(`[data-correction-row="${id}"]`);if(!row)return;
 const next=row.querySelector('[data-correction-value]')?.value;
 const reason=row.querySelector('[data-correction-reason]')?.value.trim()||'';
 const old=S.events.find(e=>Number(e.id)===Number(id));
 if(!old||next===old.result_sign)return msg('pc-admin-feedback','Seleziona un esito diverso da quello già omologato.',true);
 if(reason.length<10||reason.length>500)return msg('pc-admin-feedback','Scrivi una motivazione di almeno 10 caratteri (massimo 500).',true);
 if(!confirm(`Correggere definitivamente ${old.result_sign} → ${next}? La classifica sarà aggiornata immediatamente. Motivazione: ${reason}`))return;
 const btn=row.querySelector('[data-correction-save]');btn.disabled=true;
 try{
  const {error}=await supabase.rpc('pc_admin_correct_result',{p_event_id:id,p_new_result:next,p_reason:reason});if(error)throw error;
  await readOfficial();const round=S.rounds.find(r=>r.id===Number($('pc-admin-stage').value));if(round)renderGrading(round);
  await refreshLeaderboard();renderOfficial();msg('pc-admin-feedback','✅ Rettifica registrata nello storico. Classifica ricalcolata.');
 }catch(e){msg('pc-admin-feedback',e.message,true)}finally{if(btn.isConnected)btn.disabled=false;}
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
 $('pc-official-role-picker').addEventListener('click',e=>{const b=e.target.closest('[data-picker-role]');if(!b)return;S.playerRole=b.dataset.pickerRole;S.playerEvent='ALL';S.playerSearch='';renderOfficial();});
 $('pc-official-player-search').addEventListener('input',e=>{S.playerSearch=e.target.value;const r=S.rounds.find(x=>x.id===S.active);if(r)renderPlayerPicker(r,roundEvents(r.id).filter(x=>x.kind==='player'),openRound(r));$('pc-official-player-search').focus();});
 $('pc-official-player-event').addEventListener('change',e=>{S.playerEvent=e.target.value;renderOfficial();});
 $('pc-cat-generate').addEventListener('click',prepareFullCatalog);
 $('pc-official-clear').addEventListener('click',()=>{S.picks.clear();S.hero=null;S.backup=null;S.dirty=true;renderOfficial()});
 $('pc-official-save').addEventListener('click',saveEntry);
 $('pc-admin-stage').addEventListener('change',renderAdmin);
 $('pc-admin-deadline').addEventListener('input',()=>renderAdminGuide(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value))));
 $('pc-admin-matches').addEventListener('change',()=>{collectAdminDraft();S.simulator?.refresh();renderAdminGuide(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value))) });
 $('pc-admin-matches').addEventListener('input',()=>{collectAdminDraft();S.simulator?.refresh();renderAdminGuide(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value))) });
 $('pc-admin-players').addEventListener('change',e=>{const row=e.target.closest('[data-admin-player]');if(e.target.dataset.playerField==='player_role')renderEventChoice(row,e.target.value);collectAdminDraft()});
 $('pc-admin-players').addEventListener('input',()=>{collectAdminDraft();renderAdminGuide(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value)))});
 $('pc-admin-players').addEventListener('click',e=>{const btn=e.target.closest('[data-remove-player]');if(!btn)return;collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));const players=S.adminDraft.filter(x=>x.kind==='player');const removed=players[Number(btn.dataset.removePlayer)];S.adminDraft=S.adminDraft.filter(x=>x!==removed);renderAdminDraft(r)});
 $('pc-admin-add-player').addEventListener('click',()=>{collectAdminDraft();S.adminDraft.push({kind:'player',player_name:'',player_role:'P',player_event:'CLEAN_SHEET',qyes:''});renderAdminDraft(S.rounds.find(x=>x.id===Number($('pc-admin-stage').value)))});
 $('pc-admin-forecast').addEventListener('click',seedFromForecast);
 $('pc-admin-generate').addEventListener('click',generateOdds);
 $('pc-admin-save-draft').addEventListener('click',()=>saveAdmin(false));
 $('pc-admin-publish').addEventListener('click',()=>saveAdmin(true));
 $('pc-admin-unpublish').addEventListener('click',unpublishRound);
 $('pc-admin-outcomes').addEventListener('click',e=>{const btn=e.target.closest('[data-grade-save]');if(btn)setGrade(Number(btn.dataset.gradeSave))});
 $('pc-admin-finalize').addEventListener('click',finalize);
 $('pc-ranking-filter').addEventListener('change',()=>renderLeaderboard(S.leaderboardRows));
 $('pc-admin-corrections').addEventListener('click',e=>{const btn=e.target.closest('[data-correction-save]');if(btn)correctResult(Number(btn.dataset.correctionSave));});
 window.addEventListener('hashchange',()=>{if(location.hash==='#admin'&&!S.admin)location.hash='#schedina'});
}
(async function init(){try{
 const {data:{user},error}=await supabase.auth.getUser();if(error||!user)return;S.user=user;
 const [profile,role]=await Promise.all([
 supabase.from('profiles').select('team_id').eq('id',user.id).maybeSingle(),supabase.rpc('totoeroi_is_admin')]);
 S.teamId=profile.data?.team_id||null;S.admin=role.data===true&&!role.error;
 $('pc-admin-tab').hidden=!S.admin;
 if(!S.admin && location.hash==='#admin')location.hash='#schedina';
  if(S.admin){S.simulator=mountCommissionerSimulator({
   getSnapshot:()=>S.modelInput?{originalModel:S.model,data:S.modelInput}:null,
   getRound:()=>S.rounds.find(x=>x.id===Number($('pc-admin-stage').value||S.rounds[0]?.id)),
   getDraftMatches:()=>{collectAdminDraft();return S.adminDraft.filter(x=>x.kind==='match')},
   getProjectedMatches:()=>S.projection?.hasSufficientData?S.projection.fixtures.map(x=>({slot:x.slot,home_name:x.home.name,away_name:x.away.name})):[],
   onApply:(odds,weights)=>{
     const round=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));
     if(!round||round.status!=='draft')return;
     collectAdminDraft();
     for(const item of odds){const m=S.adminDraft.find(x=>x.kind==='match'&&Number(x.slot)===Number(item.slot));
       if(!m)continue;
       if((!m.home_name||!m.away_name)&&round.stage==='ottavi'){
         m.home_name=item.home_name;m.away_name=item.away_name;
       }
       if(normalizeTeam(m.home_name)!==normalizeTeam(item.home_name)||normalizeTeam(m.away_name)!==normalizeTeam(item.away_name))continue;
       m.q1=item.q1;m.qx=item.qx;m.q2=item.q2;
     }
     renderAdminDraft(round);
     msg('pc-admin-feedback',`✅ Quote ${weights.mode==='standard'?'del motore attuale':`con pesi ${weights.historic}/${weights.season}/${weights.recent5}`} copiate nelle partite. Puoi ancora cambiarle a mano. Salva la bozza prima di uscire: non è pubblicata.`);renderAdminGuide(round);
   }
 });}
 if(S.admin){S.playerBookmaker=mountPlayerBookmaker({
  supabase,
  getRound:()=>S.rounds.find(x=>x.id===Number($('pc-admin-stage').value||S.rounds[0]?.id)),
  onApply:entry=>{
    const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));
    if(!r||r.status!=='draft')return false;
    collectAdminDraft();
    const existing=S.adminDraft.find(x=>x.kind==='player'&&normalizeTeam(x.player_name)===normalizeTeam(entry.player_name));
    if(existing && existing.player_event!==entry.player_event){
      msg('pc-admin-feedback',`${entry.player_name} è già presente con un altro evento: rimuovilo prima di cambiarlo.`,true);
      return false;
    }
    if(existing){existing.qyes=entry.qyes;existing.player_role=entry.player_role;}
    else S.adminDraft.push(entry);
    renderAdminDraft(r);
    msg('pc-admin-feedback',`${entry.player_name} aggiunto alla BOZZA con quota ${entry.qyes}. Salva la bozza per conservarlo.`);
    return true;
  }
 });}
 mountDemoPlayerPicker(supabase);
 bind();await loadModel();await readOfficial();chooseActive();renderOfficial();await refreshLeaderboard();if(S.admin)renderAdmin();
 setInterval(()=>{if(!document.hidden)update()},90000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)update()});
}catch(e){console.error('Playoffs Challenge V4 non pronta:',e);msg('pc-official-message',e.message,true);}}
)();
