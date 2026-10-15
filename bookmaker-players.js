/* Lega degli Eroi · Playoffs Challenge V6
 * Bookmaker calciatori: stima statistica conservativa + conferma admin.
 * Solo letture di Supabase; non invia dati se non attraverso il pulsante della
 * V5 «Salva bozza» / «Pubblica palinsesto», già protetto sul backend.
 * Non usare le stime sui clean sheet: mancano minuti giocati e gol in campo.
 */
const EVENTS = {
  P: [{key:'CLEAN_SHEET',title:'Clean sheet',manual:true,reason:'Non sono disponibili minuti giocati e gol subiti mentre il portiere era in campo.'},{key:'PENALTY_SAVE',title:'Rigore parato',manual:true,reason:'Campione troppo piccolo per stimare un evento estremamente raro.'}],
  D: [{key:'GOAL',title:'Segna almeno un gol'},{key:'ASSIST',title:'Fa almeno un assist'},{key:'CLEAN_SHEET',title:'Clean sheet',manual:true,reason:'La regola richiede almeno 60 minuti e porta inviolata durante la presenza in campo: i dati non lo certificano.'}],
  C: [{key:'GOAL',title:'Segna almeno un gol'},{key:'ASSIST',title:'Fa almeno un assist'},{key:'GOAL_OR_ASSIST',title:'Gol o assist'}],
  A: [{key:'GOAL',title:'Segna almeno un gol'},{key:'ASSIST',title:'Fa almeno un assist'},{key:'BRACE',title:'Segna almeno due gol'}]
};
const ROLE_LABELS = {P:'Portiere',D:'Difensore',C:'Centrocampista',A:'Attaccante'};
// Baseline *euristiche* per ruolo (NON quote storiche verificabili).
// Vengono regolarizzate con gli eventi osservati nei dati ufficiali importati.
const EDITORIAL_PRIORS = {
  D:{GOAL:.055,ASSIST:.075},
  C:{GOAL:.14,ASSIST:.12,GOAL_OR_ASSIST:.23},
  A:{GOAL:.285,ASSIST:.13,BRACE:.057}
};
const COHORT_PRIOR_MATCHES = 50; // peso del riferimento euristico, in presenze equivalenti
const PLAYER_SHRINK_MATCHES = 12; // evita deduzioni da 1 gol in una sola giornata
const $ = id=>document.getElementById(id);
const esc = v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const label=(name,team,code)=>`${name} · ${team||'Squadra n.d.'} [${code}]`;
const fmt=n=>Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});

export function eventOccurred(stats,event){
  const goals=Number(stats?.goals_scored||0),assists=Number(stats?.assists||0);
  if(event==='GOAL')return goals>=1;
  if(event==='ASSIST')return assists>=1;
  if(event==='GOAL_OR_ASSIST')return goals>=1||assists>=1;
  if(event==='BRACE')return goals>=2;
  return null; // Non calcolabile dai soli stats della V6
}

export function estimatePlayerEvent(player,rows,roster,event){
  if(!player || !EVENTS[player.role]?.some(e=>e.key===event))throw new Error('Calciatore o evento non valido.');
  const meta=EVENTS[player.role].find(e=>e.key===event);
  if(meta.manual)return {supported:false,why:meta.reason};
  const baseline=EDITORIAL_PRIORS[player.role]?.[event];
  if(!(baseline>0))return {supported:false,why:'Nessuna base statistica per questa combinazione.'};
  const byCode=new Map(roster.map(x=>[String(x.code),x]));
  const cohort=rows.filter(r=>r.vote_numeric!==null && r.vote_numeric!==undefined && r.vote_numeric!=='' && byCode.get(String(r.player_code))?.role===player.role);
  if(!cohort.length)return {supported:false,why:'Non ci sono voti verificabili per questo ruolo. Inserisci la quota manualmente.'};
  const own=cohort.filter(r=>String(r.player_code)===String(player.code));
  const successes=data=>data.filter(r=>eventOccurred(r.stats,event)===true).length;
  const cohortWins=successes(cohort), ownWins=successes(own);
  const roleRate=(cohortWins+COHORT_PRIOR_MATCHES*baseline)/(cohort.length+COHORT_PRIOR_MATCHES);
  const p=(ownWins+PLAYER_SHRINK_MATCHES*roleRate)/(own.length+PLAYER_SHRINK_MATCHES);
  const rounds=[...new Set(rows.map(r=>Number(r.gw)).filter(Number.isFinite))];
  return {
    supported:true,probability:p,odd:Number((1/p).toFixed(2)),
    playerGames:own.length,playerHits:ownWins,roleGames:cohort.length,roleHits:cohortWins,
    observedRounds:rounds.length,lastRound:Math.max(0,...rounds),baseRate:baseline,roleRate,
    confidence:rounds.length>=8&&own.length>=5?'in sviluppo':'molto bassa',
    why:'Stima sperimentale: frequenze osservate + regolarizzazione con una baseline euristica di ruolo. Non equivale a una quota di mercato.'
  };
}

async function loadPaginated(supabase,table,columns,season){
  const out=[];const pageSize=750;
  for(let offset=0;offset<30000;offset+=pageSize){
    let query=supabase.from(table).select(columns).range(offset,offset+pageSize-1);
    if(season)query=query.eq('season',season);
    const {data,error}=await query;
    if(error)throw new Error(`${table}: ${error.message}`);
    out.push(...(data||[]));
    if(!data||data.length<pageSize)break;
  }
  return out;
}

export function mountPlayerBookmaker({supabase,onApply,getRound}){
  const root=$('pc-player-bookmaker');
  if(!root)return {refresh(){}};
  let roster=[],rows=[],byLabel=new Map(),chosen=null,lastEstimate=null,loaded=false;
  const search=$('pc-player-search'),list=$('pc-player-suggestions'),event=$('pc-player-event'),odd=$('pc-player-odd'),status=$('pc-player-quote-status');
  const calculate=$('pc-player-calculate'),apply=$('pc-player-apply');
  const note=(text,error=false)=>{status.textContent=text;status.classList.toggle('pc-feedback-error',error)};
  const updateEvents=()=>{
    const options=EVENTS[chosen?.role]||[];
    event.innerHTML=options.map(e=>`<option value="${e.key}">${esc(e.title)}${e.manual?' · MANUALE':''}</option>`).join('');
    event.disabled=!options.length;lastEstimate=null;odd.value='';drawEstimate();
  };
  function drawEstimate(){
    const box=$('pc-player-evidence');
    if(!chosen){box.innerHTML='<p>Seleziona un calciatore dal listino e scegli un evento.</p>';return}
    const e=EVENTS[chosen.role]?.find(x=>x.key===event.value);
    if(!e){box.innerHTML='<p>Evento non disponibile per questo ruolo.</p>';return}
    if(e.manual){box.innerHTML=`<div class="pc-pb-alert">⚠️ <strong>Quota manuale obbligatoria.</strong> ${esc(e.reason)}</div>`;return}
    if(!lastEstimate){box.innerHTML='<p>Premi «Calcola quota» per vedere la stima e i dati utilizzati.</p>';return}
    const a=lastEstimate;
    box.innerHTML=`<div class="pc-pb-metrics"><div><small>Probabilità stimata</small><strong>${(a.probability*100).toFixed(1).replace('.',',')}%</strong></div><div><small>Quota suggerita</small><strong>${fmt(a.odd)}</strong></div><div><small>Affidabilità</small><strong>${esc(a.confidence)}</strong></div></div>
      <p><strong>${esc(chosen.name)}</strong>: ${a.playerGames} presenze con voto, ${a.playerHits} eventi riusciti. Campione di ruolo: ${a.roleGames} presenze, ${a.roleHits} successi; ${a.observedRounds} giornate importate (ultima G${a.lastRound}).</p>
      <p>Media di ruolo corretta: ${(a.roleRate*100).toFixed(1).replace('.',',')}%. Riferimento iniziale euristico: ${(a.baseRate*100).toFixed(1).replace('.',',')}%. ${esc(a.why)}</p>`;
  }
  function identify(){
    const next=byLabel.get(search.value.trim())||null;
    // Il blur dell'input search può inviare un secondo change quando l'admin
    // clicca il pulsante Calcola. Non reimpostare l'evento già selezionato.
    const playerChanged=String(chosen?.code||'')!==String(next?.code||'');
    chosen=next;
    if(playerChanged)updateEvents();
    if(!chosen)note('Scegli un nome esatto dai suggerimenti. Non saranno proposte quote per giocatori non identificati.',true);
    else note(`${chosen.name} · ${chosen.club} · ${ROLE_LABELS[chosen.role]} · ID ${chosen.code}`);
  }
  search.addEventListener('change',identify);
  search.addEventListener('input',()=>{if(!byLabel.has(search.value.trim())){chosen=null;lastEstimate=null;odd.value='';drawEstimate()}});
  event.addEventListener('change',()=>{lastEstimate=null;odd.value='';drawEstimate();note('Evento selezionato. Calcola la quota oppure inseriscila manualmente.')});
  calculate.addEventListener('click',()=>{
    if(!chosen)return note('Seleziona prima un calciatore dal listino.',true);
    const result=estimatePlayerEvent(chosen,rows,roster,event.value);
    lastEstimate=result.supported?result:null;
    if(result.supported){odd.value=result.odd.toFixed(2);note(`Suggerimento calcolato. Revisione del Commissioner obbligatoria: affidabilità ${result.confidence}.`)}
    else{odd.value='';note(result.why+' Inserisci una quota manuale.',true)}
    drawEstimate();
  });
  apply.addEventListener('click',()=>{
    const r=getRound?.();
    if(!r||r.status!=='draft')return note('Il palinsesto pubblicato non può essere modificato.',true);
    if(!chosen||!event.value)return note('Seleziona calciatore ed evento.',true);
    const value=Number(odd.value);
    if(!Number.isFinite(value)||value<1.01||value>99999999)return note('Inserisci una quota valida (minimo 1,01).',true);
    if(!lastEstimate || lastEstimate.confidence==='molto bassa'){
      if(!window.confirm('⚠️ Campione insufficiente o quota manuale. Hai verificato personalmente il valore prima di inserirlo nella bozza?'))return;
    }
    const ok=onApply({kind:'player',player_name:chosen.name,player_role:chosen.role,player_event:event.value,qyes:value.toFixed(2)});
    if(ok!==false)note(`✅ ${chosen.name} · ${event.value} · quota ${fmt(value)} inserita nella BOZZA. Deve ancora essere salvata e pubblicata.`);
  });
  async function load(){
    note('Lettura listino e statistiche da Supabase…');
    try{
      const [p,v]=await Promise.all([
        loadPaginated(supabase,'players','external_id,name,role_classic,serie_a_team',null),
        loadPaginated(supabase,'mc_vote_players','season,gw,player_code,vote_numeric,stats','2026/27')
      ]);
      const map=new Map();
      for(const x of p){
        const code=String(x.external_id||'').trim(),role=String(x.role_classic||'').trim();
        if(!code||!EVENTS[role]||!x.name||!x.serie_a_team)continue;
        if(!map.has(code))map.set(code,{code,name:x.name.trim(),role,club:String(x.serie_a_team).trim()});
      }
      roster=[...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'it'));
      rows=v;byLabel=new Map(roster.map(x=>[label(x.name,x.club,x.code),x]));
      list.innerHTML=roster.map(x=>`<option value="${esc(label(x.name,x.club,x.code))}"></option>`).join('');
      loaded=true;
      const uniqueGW=new Set(rows.map(x=>x.gw));
      $('pc-player-data-note').textContent=`${roster.length} calciatori nel listino · ${rows.length} voti importati · ${uniqueGW.size} giornata/e con dati (2026/27). Le stime sono sperimentali: rivedere ogni quota prima della pubblicazione.`;
      note('Listino disponibile. Cerca un calciatore per iniziare.');
    }catch(e){note(`Dati non caricabili: ${e.message}. Puoi comunque compilare le quote manualmente nella tabella sottostante.`,true);}
  }
  load();
  return {refresh(){root.hidden=getRound?.()?.status!=='draft';if(loaded && chosen && !roster.some(x=>x.code===chosen.code)){chosen=null;search.value='';updateEvents()}}};
}
