/* Playoffs Challenge V4: backend ufficiale + Commissioner. Non usa SERVICE_ROLE nel browser. */
import {supabase} from './supabase.js';
import {buildModel,quoteMatch,normalizeTeam} from './bookmaker-engine.js';
import {calculateProjectedStandings} from './bookmaker-seeding.js';
import {mountCommissionerSimulator} from './bookmaker-simulator.js?v=pc-v9-4-4-one-save';
import {mountPlayerBookmaker} from './bookmaker-players.js?v=pc-v9-6-solo-gol-assist';
import {mountDemoPlayerPicker} from './pc-player-picker.js?v=pc-v9-6';
// Il parser Excel viene caricato solo durante l'import: un file assente non puo' nascondere il Commissioner.
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
const stages=[['ottavi','Ottavi · G30',4,4],['quarti','Quarti · G31',4,4],['semi_andata','Semifinali andata · G32',2,6],['semi_ritorno','Semifinali ritorno · G33',2,6],['finali','Finali · G34',2,6]];
const roles={P:'🧤 POR',D:'🛡️ DIF',C:'🎯 CEN',A:'⚽ ATT'};
const eventNames={CLEAN_SHEET:'Clean sheet',PENALTY_SAVE:'Rigore parato',GOAL:'Gol',ASSIST:'Assist',GOAL_OR_ASSIST:'Gol o assist',BRACE:'Doppietta'};
const roleEvents={P:['CLEAN_SHEET','PENALTY_SAVE'],D:['GOAL','ASSIST'],C:['GOAL','ASSIST','GOAL_OR_ASSIST'],A:['GOAL','ASSIST','BRACE']};
const S={rounds:[],events:[],entries:[],user:null,teamId:null,admin:false,active:null,model:null,projection:null,teams:[],
 picks:new Map(),hero:null,backup:null,dirty:false,adminDraft:[],adminDraftRoundId:null,busy:false,lastRoundKey:null,modelInput:null,modelUpdated:0,simulator:null,playerBookmaker:null,leaderboardRows:[],playerRole:'P',playerSearch:'',playerEvent:'ALL',pcCatalogRoundId:null,pcCatalogPreview:null,pcCatalogSource:'',pcCatalogEdited:new Set(),pcCatalogRemoved:0,gradePreview:new Map(),gradeFile:null,gradeRoundId:null};
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
 const needRosterFix=S.pcCatalogRoundId===r.id && S.pcCatalogSource==='filtered';
 const manualRoles=new Set(S.adminDraft.filter(x=>x.kind==='player'&&x.player_name&&Number(x.qyes)>=1.01).map(x=>x.player_role)).size;
 label(4,needRosterFix?'Aggiorna catalogo 2026/27':(catalog?`${catalog} eventi pronti`:(manualRoles===4?'4 ruoli manuali':'Catalogo mancante')),!needRosterFix&&(catalog>0||manualRoles===4));
 label(5,r.status==='draft'?(r.closes_at?'Bozza salvata':'Non pubblicata'):'Pubblicato',r.status!=='draft');
 const gradingStatus=r.status==='finalized'?'Omologato':r.status==='open'?(closedRound(r)?'Pronto per gli esiti':'In attesa della scadenza'):'In attesa';
 label(6,gradingStatus,r.status==='finalized');
 const publish=$('pc-admin-publish');
 if(publish)publish.disabled=r.status!=='draft'||named!==needed||quoted!==needed||needRosterFix||(!catalog&&manualRoles!==4)||!$('pc-admin-deadline').value;
}
function renderAdmin(){if(!S.admin)return;
 const selected=Number($('pc-admin-stage').value||S.rounds[0]?.id);const r=S.rounds.find(x=>x.id===selected)||S.rounds[0];if(!r)return;
 $('pc-admin-stage').innerHTML=S.rounds.map(x=>`<option value="${x.id}">${esc(stageData(x.stage)[1])} · ${x.status}</option>`).join('');$('pc-admin-stage').value=r.id;
 $('pc-admin-deadline').value=localDatetime(r.closes_at);$('pc-admin-deadline').disabled=r.status!=='draft';
 $('pc-admin-draft').hidden=r.status!=='draft';$('pc-admin-grading').hidden=r.status==='draft';
 if(S.adminDraftRoundId!==r.id){S.adminDraft=initialDraft(r);S.adminDraftRoundId=r.id;}
 renderAdminDraft(r);S.simulator?.refresh();S.playerBookmaker?.refresh();renderAdminGuide(r);
 loadCatalogForRound(r);syncCatalogueFilter();
 const count=roundEvents(r.id).filter(x=>x.is_catalog).length;const summary=$('pc-cat-status');if(summary)summary.textContent=S.pcCatalogSource==='filtered'?`⚠️ Il catalogo contiene giocatori fuori dal listone 2026/27. Ricalcola oppure conferma e salva la lista ripulita.`:count?`✅ ${count} quote già salvate nel catalogo. Puoi modificare e confermare le quote qui sotto oppure ricalcolarle.`:'Premi «Calcola le quote suggerite» per preparare il catalogo. Non verrà salvato automaticamente.';
 if(r.status!=='draft')renderGrading(r);
}
function renderAdminDraft(r){const ms=S.adminDraft.filter(x=>x.kind==='match').sort((a,b)=>a.slot-b.slot);const ps=S.adminDraft.filter(x=>x.kind==='player');
 const teamOptions=S.teams.map(t=>`<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
 $('pc-admin-matches').innerHTML=ms.map((m,i)=>`<div class="pc-admin-match pc-panel" data-admin-match="${i}"><b>Partita ${m.slot}</b>
  <select data-field="home_name"><option value="">Prima franchigia</option>${teamOptions}</select><select data-field="away_name"><option value="">Seconda franchigia</option>${teamOptions}</select>
  <div class="pc-admin-odds">${['q1','qx','q2'].map(x=>`<label>${x.toUpperCase()} <input type="number" min="1.01" step="0.01" data-field="${x}" value="${esc(m[x]??'')}"></label>`).join('')}</div><small data-odds-check class="pc-feedback" role="status"></small></div>`).join('');
 for(const [i,m] of ms.entries()){$('pc-admin-matches').querySelectorAll('[data-admin-match]')[i].querySelector('[data-field="home_name"]').value=m.home_name||'';$('pc-admin-matches').querySelectorAll('[data-admin-match]')[i].querySelector('[data-field="away_name"]').value=m.away_name||'';}
 $('pc-admin-players').innerHTML=ps.map((m,i)=>`<div class="pc-admin-player pc-panel" data-admin-player="${i}"><input placeholder="Nome calciatore" data-player-field="player_name" value="${esc(m.player_name||'')}"><select data-player-field="player_role">${Object.entries(roles).map(([code,label])=>`<option value="${code}" ${code===m.player_role?'selected':''}>${label}</option>`).join('')}</select><select data-player-field="player_event"></select><label>Quota <input type="number" min="1.01" step="0.01" data-player-field="qyes" value="${esc(m.qyes||'')}"></label><button type="button" class="pc-button pc-ghost" data-remove-player="${i}">Rimuovi</button></div>`).join('');
 for(const [i,m] of ps.entries())renderEventChoice($('pc-admin-players').querySelectorAll('[data-admin-player]')[i],m.player_role||'P',m.player_event);
 updateOddsBalanceRows();S.simulator?.refresh();renderAdminGuide(r);
}
function renderEventChoice(row,role,event){const el=row.querySelector('[data-player-field="player_event"]');el.innerHTML=(roleEvents[role]||roleEvents.P).map(x=>`<option value="${x}">${eventNames[x]}</option>`).join('');if(event&&roleEvents[role]?.includes(event))el.value=event}
// The Commissioner can edit 1/X/2 independently. Do not silently rebalance anything.
// The percentage is informative only. Manual odds are independently editable and savable.
function checkOddsBalance(values){
 const nums=['q1','qx','q2'].map(k=>Number(values[k]));
 if(nums.some(n=>!Number.isFinite(n)||n<1.01))return null;
 return nums.reduce((sum,n)=>sum+1/n,0)*100;
}
function updateOddsBalanceRows(){
 for(const row of $('pc-admin-matches').querySelectorAll('[data-admin-match]')){
  const values=Object.fromEntries(['q1','qx','q2'].map(k=>[k,row.querySelector(`[data-field="${k}"]`)?.value]));
  const status=row.querySelector('[data-odds-check]');if(!status)continue;
  const sum=checkOddsBalance(values);
  if(sum===null){status.textContent='Quote da completare: inserisci 1, X e 2 (minimo 1,01).';status.classList.remove('pc-feedback-error');continue;}
  const valid=Math.abs(sum-100)<=3.5;
  status.textContent=`Probabilità implicite totali: ${sum.toLocaleString('it-IT',{maximumFractionDigits:1,minimumFractionDigits:1})}% · ${valid?'Vicino al 100%':'Solo indicativo: puoi salvare comunque le quote manuali'}`;
  status.classList.remove('pc-feedback-error');
 }
}
function collectAdminDraft(){const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!r||r.status!=='draft')return;
 const matches=[...$('pc-admin-matches').querySelectorAll('[data-admin-match]')].map((row,i)=>{
  const old=S.adminDraft.filter(e=>e.kind==='match')[i];const m={kind:'match',slot:old.slot};for(const x of ['home_name','away_name','q1','qx','q2'])m[x]=row.querySelector(`[data-field="${x}"]`).value;return m});
 const players=[...$('pc-admin-players').querySelectorAll('[data-admin-player]')].map(row=>{const x={kind:'player'};for(const key of ['player_name','player_role','player_event','qyes'])x[key]=row.querySelector(`[data-player-field="${key}"]`).value;return x});
 S.adminDraft=[...matches,...players];
}
// Passaggio 03: l'anteprima NON scrive sul database. Solo il pulsante
// «Conferma e salva» sostituisce il catalogo del turno in Supabase.
function catalogueKey(row){return Number(row.code)+':'+row.ev}
function loadCatalogForRound(r){
 if(S.pcCatalogRoundId===r.id)return;
 S.pcCatalogRoundId=r.id;S.pcCatalogEdited=new Set();S.pcCatalogRemoved=0;
 const stored=roundEvents(r.id).filter(x=>x.kind==='player'&&x.is_catalog);
 S.pcCatalogPreview=stored.length?stored.map(x=>({code:Number(x.player_code),role:x.player_role,ev:x.player_event,q:Number(x.qyes),name:x.player_name,club:''})):null;
 S.pcCatalogSource=stored.length?'saved':'';
 msg('pc-cat-save-status',stored.length?`✅ ${stored.length} quote già salvate per questo turno. Puoi cambiarle qui sotto e confermare di nuovo.`:'Non hai ancora salvato un catalogo per questa giornata.');
}
function drawCatalogue(){
 let preview=S.pcCatalogPreview,view=$('pc-cat-list'),overview=$('pc-cat-overview');
 if(!view||!overview)return;
 const save=$('pc-cat-save');
 if(!preview?.length){view.innerHTML='<p class="pc-cat-empty">Premi «Calcola le quote suggerite» nella parte A: qui vedrai tutti i giocatori e le quote modificabili.</p>';overview.textContent='Catalogo non ancora preparato. La generazione non salva né pubblica nulla.';save.disabled=true;return}
 const players=S.playerBookmaker?.roster?.()||[];
 if(!players.length){
   view.innerHTML='<p class="pc-cat-empty">Caricamento del listone 2026/27…</p>';
   overview.textContent='Attendi il caricamento del listone attuale: non mostriamo giocatori delle vecchie stagioni.';
   save.disabled=true;return;
 }
 const allowed=new Set(players.map(p=>Number(p.code)));
 // Per i difensori sono ammessi SOLO gol e assist: escludi ogni evento precedente.
 const beforeRole=preview.length;
 preview=preview.filter(x=>x.role!=='D'||['GOAL','ASSIST'].includes(x.ev));
 S.pcCatalogPreview=preview;
 if(preview.length<beforeRole){S.pcCatalogSource='filtered';S.pcCatalogRemoved+=beforeRole-preview.length;}
 const obsolete=preview.filter(x=>!allowed.has(Number(x.code)));
 if(obsolete.length){
   S.pcCatalogPreview=preview.filter(x=>allowed.has(Number(x.code)));
   S.pcCatalogRemoved+=obsolete.length;
   S.pcCatalogSource='filtered';preview=S.pcCatalogPreview;
   renderAdminGuide(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value)));
   msg('pc-cat-save-status',`⚠️ Escluse dall’anteprima ${S.pcCatalogRemoved} quote di giocatori non presenti nel listone 2026/27. Non sono ancora state cancellate dal database: premi «Conferma e salva» per aggiornare il catalogo, oppure «Calcola» per rigenerarlo completamente.`);
 }
 const role=$('pc-cat-role').value||'P',ev=$('pc-cat-event').value||'ALL',q=$('pc-cat-search').value.trim().toLocaleLowerCase('it');
 const byCode=new Map(players.map(p=>[Number(p.code),p]));
 let filtered=preview.filter(x=>x.role===role &&(ev==='ALL'||x.ev===ev) && (!q||`${byCode.get(x.code)?.name||x.name||''} ${byCode.get(x.code)?.club||x.club||''} ${x.ev}`.toLocaleLowerCase('it').includes(q)));
 const max=60,shown=filtered.slice(0,max);
 overview.textContent=`${preview.length} quote nel catalogo · ${filtered.length} risultati per ${roles[role]}${filtered.length>max?` (prime ${max}: usa la ricerca)`:''} · ${S.pcCatalogEdited.size} modificate manualmente. ${S.pcCatalogSource==='saved'?'Quote attualmente salvate.':S.pcCatalogSource==='filtered'?'LISTONE DA CONFERMARE: rimosse le quote dei giocatori fuori stagione.':'ANTEPRIMA NON ANCORA SALVATA.'}`;
 view.innerHTML=shown.length?`<table class="pc-cat-table"><thead><tr><th>Calciatore</th><th>Evento</th><th>Metodo</th><th>Quota</th></tr></thead><tbody>${shown.map(x=>{
   const player=byCode.get(x.code),name=player?.name||x.name||`Codice ${x.code}`,club=player?.club||x.club||'';
   const manual=false;
   return `<tr><td><strong>${esc(name)}</strong><small>${esc(club)}</small></td><td>${esc(eventNames[x.ev]||x.ev)}</td><td class="pc-cat-source">${manual?'✎ Editoriale':'⚡ Statistica'}</td><td><input type="number" inputmode="decimal" min="1.01" max="10000" step="0.01" value="${esc(Number(x.q).toFixed(2))}" data-cat-code="${x.code}" data-cat-event="${esc(x.ev)}" class="${S.pcCatalogEdited.has(catalogueKey(x))?'pc-cat-edited':''}" aria-label="Quota ${esc(name)} ${esc(eventNames[x.ev]||x.ev)}"/></td></tr>`;
  }).join('')}</tbody></table>`:'<p class="pc-cat-empty">Nessun calciatore per questa ricerca. Prova un altro ruolo o un altro nome.</p>';
 save.disabled=false;
}
function syncCatalogueFilter(){
 const role=$('pc-cat-role').value,choices=roleEvents[role]||[];
 const e=$('pc-cat-event'),old=e.value;
 e.innerHTML='<option value="ALL">Tutti gli eventi</option>'+choices.map(x=>`<option value="${x}">${esc(eventNames[x])}</option>`).join('');
 e.value=choices.includes(old)?old:'ALL';drawCatalogue();
}
function prepareFullCatalog(){
 const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));
 if(!r||r.status!=='draft')return msg('pc-cat-status','Puoi modificare le quote soltanto in bozza.',true);
 if(S.pcCatalogRoundId===r.id&&S.pcCatalogEdited.size&&S.pcCatalogPreview?.length&&!confirm('Hai quote calciatori modificate ma NON SALVATE. Ricalcolare cancellerà queste correzioni locali. Vuoi continuare?'))return;

 try{
   const c=S.playerBookmaker?.catalogue();
   if(!c?.rows?.length)throw Error('Bookmaker non pronto: attendi il caricamento dell’archivio statistiche e riprova.');
   const byCode=new Map(S.playerBookmaker.roster().map(x=>[Number(x.code),x]));
   S.pcCatalogPreview=c.rows.map(x=>({...x,name:byCode.get(x.code)?.name||'',club:byCode.get(x.code)?.club||''}));
   S.pcCatalogEdited=new Set();S.pcCatalogSource='generated';S.pcCatalogRoundId=r.id;S.pcCatalogRemoved=0;
   $('pc-cat-role').value='P';$('pc-cat-search').value='';syncCatalogueFilter();
   msg('pc-cat-status',`✅ Calcolate ${c.rows.length} quote per ${c.players} calciatori, inclusi clean sheet e rigori parati personalizzati per ogni portiere. Per i difensori sono disponibili soltanto gol e assist. Controlla sotto e premi «Conferma e salva».`);
   msg('pc-cat-save-status','⚠️ Quote calcolate ma NON ANCORA SALVATE. Controllale e premi il pulsante di conferma.');
 }catch(e){msg('pc-cat-status',e.message||'Calcolo non disponibile',true)}
}
async function saveFullCatalog(){
 const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));
 if(!r||r.status!=='draft')return msg('pc-cat-save-status','Solo le giornate in bozza sono modificabili.',true);
 if(S.pcCatalogRoundId!==r.id||!S.pcCatalogPreview?.length)return msg('pc-cat-save-status','Prima calcola le quote suggerite.',true);
 const allowedCodes=new Set((S.playerBookmaker?.roster?.()||[]).map(x=>Number(x.code)));
 if(!allowedCodes.size)return msg('pc-cat-save-status','Il listone 2026/27 non è ancora pronto.',true);
 if(S.pcCatalogPreview.some(x=>!allowedCodes.has(Number(x.code))))return msg('pc-cat-save-status','Ci sono calciatori fuori dal listone 2026/27: attendi il filtro e riprova.',true);
 const rows=S.pcCatalogPreview.filter(x=>!(x.role==='D'&&x.ev==='CLEAN_SHEET')).map(x=>({code:Number(x.code),role:x.role,ev:x.ev,q:Number(x.q)}));
 const invalid=rows.find(x=>!Number.isInteger(x.code)||x.code<1||!roleEvents[x.role]?.includes(x.ev)||!Number.isFinite(x.q)||x.q<1.01||x.q>10000);
 if(invalid)return msg('pc-cat-save-status','C’è una quota non valida. Inserisci un valore tra 1,01 e 10000.',true);
 const existing=roundEvents(r.id).filter(x=>x.is_catalog).length;
 if(existing && !confirm(`Confermi di SOSTITUIRE le ${existing} quote del catalogo già salvato con queste ${rows.length} quote? Le quote delle partite 1/X/2 NON cambieranno. Il turno resterà in bozza.`))return;
 const btn=$('pc-cat-save');btn.disabled=true;
 msg('pc-cat-save-status',`Salvataggio di ${rows.length} quote in Supabase…`);
 try{
   const {data,error}=await supabase.rpc('pc_admin_replace_player_catalog',{p_round_id:r.id,p_rows:rows});
   if(error)throw error;
   await readOfficial();
   const count=roundEvents(r.id).filter(x=>x.is_catalog).length;
   if(count!==rows.length)throw Error(`Verifica salvataggio: attese ${rows.length} quote, trovate ${count}.`);
   S.pcCatalogSource='saved';S.pcCatalogEdited=new Set();S.pcCatalogRemoved=0;drawCatalogue();renderAdminGuide(r);
   msg('pc-cat-save-status',`✅ SALVATE ${count} quote per ${stageData(r.stage)[1]} su Supabase. Le quote delle partite NON sono cambiate. Le schedine restano chiuse finché non pubblichi al passo 04.`);
   msg('pc-cat-status',`✅ Catalogo aggiornato: ${count} quote ufficiali in BOZZA.`);
 }catch(e){msg('pc-cat-save-status','Salvataggio fallito: '+e.message,true)}finally{btn.disabled=false}
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
// Default generation is conservative: NEVER overwrite an existing triplet of odds.
// Recalculating all odds requires a separate explicit action and confirmation.
async function generateOdds(force=false){
 collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));
 if(!S.model||!r||r.status!=='draft')return msg('pc-admin-feedback','Il modello o il turno non è pronto.',true);
 if(document.querySelector('input[name="pc-sim-mode"]:checked')?.value==='custom'&&!S.simulator?.getWeights())return msg('pc-admin-feedback','Correggi prima i tre pesi personalizzati: devono sommare esattamente il 100%.',true);
 const matches=S.adminDraft.filter(x=>x.kind==='match');
 const hasQuote=m=>['q1','qx','q2'].some(k=>String(m[k]??'').trim()!=='');
 if(force&&matches.some(hasQuote)&&!confirm('ATTENZIONE: ricalcolare TUTTE le partite sostituirà anche le quote che hai scritto a mano. Continuare?'))return;
 const adjustedModel=S.simulator?.getQuoteModel()||S.model;
 let generated=0,protectedCount=0,incomplete=0,invalid=0;
 for(const m of matches){
  if(!m.home_name||!m.away_name||normalizeTeam(m.home_name)===normalizeTeam(m.away_name)){invalid++;continue;}
  if(!force&&hasQuote(m)){
   protectedCount++;
   if(['q1','qx','q2'].some(k=>String(m[k]??'').trim()===''))incomplete++;
   continue;
  }
  try{const q=quoteMatch(adjustedModel,m.home_name,m.away_name,r.stage);m.q1=q.q1;m.qx=q.qx;m.q2=q.q2;generated++;
  }catch(err){invalid++;}
 }
 if(generated)renderAdminDraft(r);
 let result=generated?`✅ Generate quote per ${generated} partite.`:'Nessuna quota modificata.';
 if(protectedCount)result+=` ${protectedCount} partite con quote già inserite NON sono state sovrascritte.`;
 if(incomplete)result+=` ${incomplete} partite hanno quote parziali: completa i tre campi oppure usa «Ricalcola tutte».`;
 if(invalid)result+=` ${invalid} partite non calcolabili: controlla le squadre selezionate.`;
 result+=` Le modifiche manuali vanno salvate con «💾 Salva quote in bozza», non con «Genera quote».`;
 msg('pc-admin-feedback',result,!!invalid||!!incomplete);
}
function seedFromForecast(){collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!r||r.stage!=='ottavi'||!S.projection?.hasSufficientData){msg('pc-admin-feedback','Proiezione disponibile soltanto per gli ottavi.',true);return}
 S.adminDraft.filter(x=>x.kind==='match').forEach((m,i)=>{m.home_name=S.projection.fixtures[i].home.name;m.away_name=S.projection.fixtures[i].away.name;});renderAdminDraft(r);S.simulator?.refresh();msg('pc-admin-feedback','Ottavi proiettati caricati. Prima di pubblicare, verifica il seeding UFFICIALE.');}
async function confirmChosenOdds(){
  const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));
  if(!r||r.status!=='draft')return msg('pc-admin-quote-feedback','Prima scegli un turno in bozza.',true);
  const mode=S.simulator?.getMode()||'standard';
  collectAdminDraft();
  if(mode!=='manual'){
    const proposed=S.simulator?.getProposedOdds();
    if(!proposed||proposed.length!==stageData(r.stage)[2])return msg('pc-admin-quote-feedback','Non posso ancora calcolare le quote. Controlla le squadre e, se usi i pesi, che il totale sia 100%.',true);
    for(const item of proposed){
      const match=S.adminDraft.find(e=>e.kind==='match'&&Number(e.slot)===Number(item.slot));
      if(!match||normalizeTeam(match.home_name)!==normalizeTeam(item.home_name)||normalizeTeam(match.away_name)!==normalizeTeam(item.away_name))return msg('pc-admin-quote-feedback','Controlla le squadre degli incontri: devono corrispondere alle quote proposte.',true);
    }
    for(const item of proposed){
      const match=S.adminDraft.find(e=>e.kind==='match'&&Number(e.slot)===Number(item.slot));
      match.q1=item.q1;match.qx=item.qx;match.q2=item.q2;
    }
    renderAdminDraft(r);
  }
  const button=$('pc-admin-confirm-odds');button.disabled=true;
  const label=mode==='manual'?'manuali':mode==='custom'?'del motore con pesi personalizzati':'del motore attuale';
  msg('pc-admin-quote-feedback',`Salvataggio delle quote ${label} su Supabase…`);
  try{
    const saved=await saveAdmin(false);
    if(saved){
      msg('pc-admin-quote-feedback',`✅ CONFERMATO E SALVATO su Supabase: ${stageData(r.stage)[2]} partite con le quote ${label}. Sono in BOZZA: gli allenatori non le vedono ancora.`,false);
    }else{
      msg('pc-admin-quote-feedback','⚠️ Salvataggio non completato: controlla il messaggio qui sotto.',true);
    }
  }catch(error){msg('pc-admin-quote-feedback',`Salvataggio non riuscito: ${error.message}`,true)}
  finally{button.disabled=false}
}
async function saveAdmin(publish=false){collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(!r||r.status!=='draft')return false;
 const when=$('pc-admin-deadline').value.trim();
 if(publish&&!when){msg('pc-admin-feedback','Prima di pubblicare inserisci la scadenza della giornata.',true);return false;}
 const deadline=when?new Date(when):null;
 if(deadline&&(!Number.isFinite(deadline.getTime())||deadline<=Date.now())){msg('pc-admin-feedback','La scadenza deve essere futura.',true);return false;}
 if(publish&&S.pcCatalogRoundId===r.id&&S.pcCatalogPreview?.length&&S.pcCatalogSource!=='saved'){msg('pc-admin-feedback','Hai quote calciatori nuove o modificate NON SALVATE. Torna al passaggio 03 e premi «Conferma e salva le quote dei calciatori» prima di pubblicare.',true);return false;}
 if(publish){const catalogCount=roundEvents(r.id).filter(x=>x.is_catalog).length;
    const rolesCovered=new Set(S.adminDraft.filter(x=>x.kind==='player').map(x=>x.player_role)).size;
    if(!catalogCount&&rolesCovered<4){msg('pc-admin-feedback','Prepara prima il catalogo completo dei calciatori al passo 03. In alternativa servono eventi validi per tutti e quattro i ruoli.',true);return false;}
 }
 let events=S.adminDraft.map(m=>m.kind==='match'?{kind:'match',slot:Number(m.slot),home_name:m.home_name,away_name:m.away_name,q1:Number(m.q1),qx:Number(m.qx),q2:Number(m.q2)}:{kind:'player',player_name:m.player_name,player_role:m.player_role,player_event:m.player_event,qyes:Number(m.qyes)});
 if(events.some(m=>m.kind==='match'&&(!m.home_name||!m.away_name||m.home_name===m.away_name||[m.q1,m.qx,m.q2].some(x=>!Number.isFinite(x)||x<1.01||x>10000)))||events.some(m=>m.kind==='player'&&(!m.player_name||m.qyes<=1))){msg('pc-admin-feedback','Completa le partite e inserisci quote tra 1,01 e 10000. Non devono sommare 100%.',true);return false;}
 try{let {error}=await supabase.rpc('pc_admin_save_round',{p_round_id:r.id,p_closes_at:deadline?deadline.toISOString():null,p_events:events});if(error)throw error;
 if(publish){if(!confirm('Pubblicare definitivamente quote ed eventi? Gli allenatori potranno consegnare subito. Dopo la pubblicazione NON potrai più modificare le quote.'))return false;
 ({error}=await supabase.rpc('pc_admin_publish_round',{p_round_id:r.id}));if(error)throw error;}
 await readOfficial();S.adminDraftRoundId=null;renderAdmin();chooseActive();renderOfficial();msg('pc-admin-feedback',publish?'✅ Turno pubblicato ufficialmente!':'✅ Bozza salvata su Supabase.');return true;
 }catch(error){msg('pc-admin-feedback',error.message,true);return false;}
}
function renderGrading(r){
 const selected=new Set(S.entries.filter(e=>Number(e.round_id)===Number(r.id)).flatMap(e=>(e.picks||[]).map(p=>Number(p.event_id))));
 const events=roundEvents(r.id).filter(ev=>ev.kind==='match'||selected.has(Number(ev.id)));
 if(S.gradeRoundId!==Number(r.id)){S.gradePreview.clear();S.gradeFile=null;S.gradeRoundId=Number(r.id);}
 const canGrade=r.status==='open' && Date.now()>=new Date(r.closes_at).getTime();
 const finalized=r.status==='finalized';
 $('pc-admin-finalize').hidden=finalized;
 $('pc-admin-finalize').disabled=!canGrade;
 $('pc-admin-outcomes').hidden=finalized;
 $('pc-admin-corrections').hidden=!finalized;
 $('pc-votes-panel').hidden=finalized;
 $('pc-votes-import').disabled=!canGrade;
 $('pc-votes-save').disabled=!canGrade||!S.gradeFile;
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
 const chosen=S.gradePreview.has(Number(ev.id))?S.gradePreview.get(Number(ev.id)):ev.result_sign;
 const note=S.gradePreview.get(Number(ev.id))!==undefined&&S.gradeFile?S.gradeFile.reasons.get(Number(ev.id)):'';
 return `<div class="pc-grading-row"><div><strong>${esc(title)}</strong>${note?`<small>${esc(note)}</small>`:''}</div><select data-grade-id="${ev.id}" ${canGrade?'':'disabled'}><option value="">Da verificare</option>${options.map(([value,label])=>`<option value="${value}" ${chosen===value?'selected':''}>${label}</option>`).join('')}</select>${S.gradeFile?'':`<button type="button" data-grade-save="${ev.id}" class="pc-button pc-ghost" ${canGrade?'':'disabled'}>Salva esito</button>`}</div>`}).join('');
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
 S.gradePreview.delete(Number(id));await readOfficial();renderGrading(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value)));msg('pc-admin-feedback','✅ Esito salvato.')}
async function loadGradesFromExcel(){
 const round=S.rounds.find(x=>Number(x.id)===Number($('pc-admin-stage').value));
 const file=$('pc-votes-file')?.files?.[0];
 if(!file)return msg('pc-votes-feedback','Seleziona prima un file Excel dei voti Fantacalcio.',true);
 if(!round||round.status!=='open'||!closedRound(round))return msg('pc-votes-feedback','Importazione esiti possibile solo dopo la scadenza del turno pubblicato.',true);
 if(!globalThis.XLSX?.read)return msg('pc-votes-feedback','Lettore Excel non caricato. Serve Internet per la libreria SheetJS.',true);
 const button=$('pc-votes-import');button.disabled=true;
 try{
   // Import dinamico: la schermata Admin funziona anche se il file nuovo non è ancora sul server.
   let parser;
   try {
     parser=await import('./pc-votes-import.js?v=pc-v9-6-1-excel');
   } catch(err) {
     throw new Error('Il lettore dei voti non è disponibile: carica nella root anche pc-votes-import.js (presente nello ZIP), poi aggiorna la pagina. Dettaglio: '+(err?.message||err));
   }
   if(typeof parser.parseFantacalcioVotes!=='function'||typeof parser.predictPlayerResult!=='function') {
     throw new Error('Il file pc-votes-import.js non è quello aggiornato: sostituiscilo con quello della V9.6.1.');
   }
   const {parseFantacalcioVotes,predictPlayerResult}=parser;
   const bytes=await file.arrayBuffer();
   const workbook=globalThis.XLSX.read(bytes,{type:'array',cellDates:false,cellFormula:false});
   const data=parseFantacalcioVotes(workbook);
   if(data.week!==Number(round.gw))throw Error(`Questo file è della giornata ${data.week}, ma ${stageData(round.stage)[1]} richiede la giornata ${round.gw}. Nessun risultato è stato modificato.`);
   const selected=new Set(S.entries.filter(e=>Number(e.round_id)===Number(round.id)).flatMap(e=>(e.picks||[]).map(p=>Number(p.event_id))));
   const predictions=roundEvents(round.id).filter(ev=>ev.kind==='player'&&selected.has(Number(ev.id)));
   const reasons=new Map();let yes=0,no=0,unresolved=0;
   // Discard older Excel previews, but preserve any match choices the admin has entered.
   const existingMatches=new Map([...S.gradePreview].filter(([id])=>roundEvents(round.id).some(ev=>ev.kind==='match'&&Number(ev.id)===id)));
   S.gradePreview=existingMatches;
   for(const ev of predictions){const outcome=predictPlayerResult(ev,data);
     if(outcome.result==='YES')yes++;
     else if(outcome.result==='NO')no++;
     else unresolved++;
     S.gradePreview.set(Number(ev.id),outcome.result);reasons.set(Number(ev.id),outcome.reason);
   }
   S.gradeFile={roundId:Number(round.id),week:data.week,file:file.name,reasons,players:data.playerCount};
   renderGrading(round);
   msg('pc-votes-feedback',`✅ ${file.name} verificato: 20 squadre, ${data.playerCount} giocatori, ${predictions.length} pronostici individuali. Proposti ${yes} SÌ, ${no} NO${unresolved?', '+unresolved+' da verificare':''}. Puoi correggere qualsiasi esito qui sotto. NON ancora salvati. Inserisci anche i segni 1/X/2 e premi «Conferma e salva tutti gli esiti».`);
 }catch(e){S.gradeFile=null;S.gradePreview.clear();msg('pc-votes-feedback','❌ '+e.message,true);
 }finally{button.disabled=false;}
}
async function saveAllGrades(){
 const round=S.rounds.find(x=>Number(x.id)===Number($('pc-admin-stage').value));
 if(!S.gradeFile||!round||S.gradeFile.roundId!==Number(round.id))return msg('pc-votes-feedback','Prima carica il file Excel completo della giornata selezionata.',true);
 if(!closedRound(round)||round.status!=='open')return msg('pc-votes-feedback','Gli esiti sono salvabili solo dopo la scadenza.',true);
 const choices=[...$('pc-admin-outcomes').querySelectorAll('[data-grade-id]')].map(select=>({id:Number(select.dataset.gradeId),result:select.value||null}));
 const matchMissing=choices.filter(x=>roundEvents(round.id).some(e=>e.id===x.id&&e.kind==='match')&&!x.result);
 const unanswered=choices.filter(x=>!x.result);
 if(matchMissing.length)return msg('pc-votes-feedback',`Mancano ${matchMissing.length} risultati 1/X/2. Sceglili prima di confermare.`,true);
 if(unanswered.length)return msg('pc-votes-feedback',`Ci sono ${unanswered.length} eventi ancora «Da verificare». Correggili prima di confermare.`,true);
 if(!choices.length)return msg('pc-votes-feedback','Nessun pronostico da salvare per questo turno.',true);
 if(!confirm(`Salvare su Supabase ${choices.length} esiti per ${stageData(round.stage)[1]}?\nI valori mostrati nei menu saranno registrati, ma la classifica diventerà ufficiale solo dopo l’omologazione.`))return;
 const btn=$('pc-votes-save');btn.disabled=true;
 try{
   const {data,error}=await supabase.rpc('pc_admin_save_results_batch',{p_round_id:round.id,p_results:choices.map(x=>({event_id:x.id,result:x.result}))});
   if(error)throw error;
   await readOfficial();
   S.gradeFile=null;S.gradePreview.clear();
   renderGrading(S.rounds.find(x=>Number(x.id)===Number(round.id)));
   msg('pc-votes-feedback',`✅ ${data??choices.length} esiti SALVATI su Supabase. Controlla i risultati e premi «Omologa giornata» quando sei sicuro.`);
 }catch(e){msg('pc-votes-feedback','❌ Salvataggio non riuscito: '+e.message,true);
 }finally{btn.disabled=false;}
}
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
 $('pc-cat-save').addEventListener('click',saveFullCatalog);
 $('pc-cat-role').addEventListener('change',syncCatalogueFilter);
 $('pc-cat-event').addEventListener('change',drawCatalogue);
 $('pc-cat-search').addEventListener('input',drawCatalogue);
 $('pc-cat-list').addEventListener('input',e=>{
   const input=e.target.closest('[data-cat-code][data-cat-event]');if(!input||!S.pcCatalogPreview)return;
   const code=Number(input.dataset.catCode),ev=input.dataset.catEvent,entry=S.pcCatalogPreview.find(x=>Number(x.code)===code&&x.ev===ev);if(!entry)return;
   entry.q=input.value.trim()===''?NaN:Number(input.value);S.pcCatalogEdited.add(catalogueKey(entry));S.pcCatalogSource='modified';
   input.classList.add('pc-cat-edited');
   msg('pc-cat-save-status','✎ Quote modificate, NON ancora salvate. Premi «Conferma e salva le quote dei calciatori».');
   const ov=$('pc-cat-overview');if(ov)ov.textContent=`${S.pcCatalogPreview.length} quote · ${S.pcCatalogEdited.size} modificate manualmente · MODIFICHE NON SALVATE.`;
 });
 $('pc-official-clear').addEventListener('click',()=>{S.picks.clear();S.hero=null;S.backup=null;S.dirty=true;renderOfficial()});
 $('pc-official-save').addEventListener('click',saveEntry);
 $('pc-admin-stage').addEventListener('change',()=>{S.gradePreview.clear();S.gradeFile=null;S.gradeRoundId=null;msg('pc-votes-feedback','Carica il file Excel completo del turno selezionato.');msg('pc-admin-quote-feedback','Scegli le quote per questo turno e premi Conferma e salva.');renderAdmin();});
 $('pc-admin-deadline').addEventListener('input',()=>renderAdminGuide(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value))));
 $('pc-admin-matches').addEventListener('change',()=>{msg('pc-admin-quote-feedback','✎ Hai modificato le partite o le quote. Premi «Conferma e salva queste quote».');collectAdminDraft();S.simulator?.refresh();renderAdminGuide(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value))) });
 $('pc-admin-matches').addEventListener('input',()=>{msg('pc-admin-quote-feedback','✎ Modifiche non ancora salvate. Premi «Conferma e salva queste quote».');collectAdminDraft();updateOddsBalanceRows();S.simulator?.refresh();renderAdminGuide(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value))) });
 $('pc-admin-players').addEventListener('change',e=>{const row=e.target.closest('[data-admin-player]');if(e.target.dataset.playerField==='player_role')renderEventChoice(row,e.target.value);collectAdminDraft()});
 $('pc-admin-players').addEventListener('input',()=>{collectAdminDraft();renderAdminGuide(S.rounds.find(r=>r.id===Number($('pc-admin-stage').value)))});
 $('pc-admin-players').addEventListener('click',e=>{const btn=e.target.closest('[data-remove-player]');if(!btn)return;collectAdminDraft();const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));const players=S.adminDraft.filter(x=>x.kind==='player');const removed=players[Number(btn.dataset.removePlayer)];S.adminDraft=S.adminDraft.filter(x=>x!==removed);renderAdminDraft(r)});
 $('pc-admin-add-player').addEventListener('click',()=>{collectAdminDraft();S.adminDraft.push({kind:'player',player_name:'',player_role:'P',player_event:'CLEAN_SHEET',qyes:''});renderAdminDraft(S.rounds.find(x=>x.id===Number($('pc-admin-stage').value)))});
 $('pc-admin-forecast').addEventListener('click',seedFromForecast);
 $('pc-admin-confirm-odds').addEventListener('click',confirmChosenOdds);
 for(const radio of document.querySelectorAll('input[name="pc-sim-mode"]')) radio.addEventListener('change',()=>msg('pc-admin-quote-feedback','Hai cambiato metodo. Controlla le quote e premi «Conferma e salva queste quote».'));
 for(const field of document.querySelectorAll('[data-weight]')) field.addEventListener('input',()=>msg('pc-admin-quote-feedback','Pesi modificati: le nuove quote non sono ancora salvate. Premi «Conferma e salva queste quote».')); 
 $('pc-admin-save-draft').addEventListener('click',()=>saveAdmin(false));
 $('pc-admin-publish').addEventListener('click',()=>saveAdmin(true));
 $('pc-admin-unpublish').addEventListener('click',unpublishRound);
 $('pc-admin-outcomes').addEventListener('click',e=>{const btn=e.target.closest('[data-grade-save]');if(btn)setGrade(Number(btn.dataset.gradeSave))});
 $('pc-admin-outcomes').addEventListener('change',e=>{const id=Number(e.target.dataset.gradeId);if(id)S.gradePreview.set(id,e.target.value||null);});
 $('pc-votes-import').addEventListener('click',loadGradesFromExcel);
 $('pc-votes-save').addEventListener('click',saveAllGrades);
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
  onRosterLoaded:()=>{const r=S.rounds.find(x=>x.id===Number($('pc-admin-stage').value));if(r&&S.pcCatalogRoundId===r.id){drawCatalogue();renderAdminGuide(r);}},
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
