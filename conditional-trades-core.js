/* 
 * Conditional Trade Lab · Core deterministico, privo di mutazioni.
 * NON e' la logica ufficiale di esecuzione degli scambi.
 */
const assert=(condition,msg)=>{if(!condition)throw new Error(msg);};
const asNum=value=>Number(value);
export function validateCandidates(candidates,{ownerId=null,season=null,round=null}={}){
  assert(Array.isArray(candidates)&&candidates.length>=2,"Servono almeno due pick candidate.");
  const ids=candidates.map(p=>String(p.id));
  assert(new Set(ids).size===ids.length,"La stessa pick non può essere indicata due volte.");
  const seasons=new Set(candidates.map(p=>asNum(p.season)));
  assert(seasons.size===1,"Le pick candidate devono appartenere alla stessa stagione.");
  if(season!==null)assert(candidates.every(p=>asNum(p.season)===asNum(season)),"Stagione della condizione incoerente.");
  assert(candidates.every(p=>p.status==="active"&&p.pick_kind==="normal"),"Solo pick normali e attive possono essere vincolate.");
  const holder=new Set(candidates.map(p=>String(p.owner_team_id)));
  assert(holder.size===1,"Le pick devono avere tutte lo stesso proprietario prima dell'accordo.");
  if(ownerId!==null)assert(candidates.every(p=>String(p.owner_team_id)===String(ownerId)),"Una pick non è più disponibile presso chi la promette.");
  if(round!==null)assert(candidates.every(p=>asNum(p.round)===asNum(round)),"Le pick devono appartenere allo stesso round.");
  return {ownerId:String(candidates[0].owner_team_id),season:asNum(candidates[0].season)};
}
export function resolveStandings({
  position,teamCount,topCount=4,bottomCount=4,
  topPickId,bottomPickId,middlePickId
}){
  const pos=asNum(position),size=asNum(teamCount),top=asNum(topCount),bottom=asNum(bottomCount);
  assert([pos,size,top,bottom].every(Number.isInteger),"La classifica deve contenere numeri interi.");
  assert(size>=2&&pos>=1&&pos<=size,"Posizione finale non valida.");
  assert(top>=1&&bottom>=1&&top+bottom<=size,"Le fasce di classifica si sovrappongono.");
  let branch,chosen;
  if(pos<=top){branch="top";chosen=topPickId;}
  else if(pos>size-bottom){branch="bottom";chosen=bottomPickId;}
  else{branch="middle";chosen=middlePickId;}
  assert(chosen,"Condizione incompleta: specificare anche la pick per la fascia intermedia.");
  return {branch,pickId:String(chosen)};
}
export function resolveRanked({candidates,orderByPickId,which="worst"}){
  assert(["worst","best"].includes(which),"Criterio deve essere migliore o peggiore.");
  validateCandidates(candidates,{round:candidates?.[0]?.round});
  const rows=candidates.map(p=>{
    const overallPick=asNum(orderByPickId[String(p.id)]);
    assert(Number.isInteger(overallPick)&&overallPick>0,"Manca la posizione ufficiale di una delle pick.");
    return {...p,overallPick};
  });
  assert(new Set(rows.map(p=>p.overallPick)).size===rows.length,"Posizioni del Draft duplicate: impossibile stabilire la scelta.");
  const chosen=rows.reduce((acc,p)=>acc===null||((which==="worst")?(p.overallPick>acc.overallPick):(p.overallPick<acc.overallPick))?p:acc,null);
  return {pickId:String(chosen.id),overallPick:chosen.overallPick,which};
}
export function transferConditionalRight(right,newHolderId){
  assert(right&&right.status==="active","Solo un diritto attivo è cedibile.");
  assert(newHolderId&&String(newHolderId)!==String(right.holder_team_id),"Scegli una squadra diversa dal titolare.");
  // Il proprietario delle pick sottostanti non cambia.
  return {...right,holder_team_id:String(newHolderId),history:[
    ...(right.history||[]),{from:String(right.holder_team_id),to:String(newHolderId)}
  ]};
}
export function isPickLocked(pickId,rights){
  return (rights||[]).some(r=>
    r.status==="active"&&(r.candidate_pick_ids||[]).map(String).includes(String(pickId))
  );
}
export function pickUnits(assets){
  return (assets||[]).filter(x=>x.kind==="future_pick"||x.kind==="conditional_right").length;
}
export function validateOneForOne(offered,requested){
  const left=pickUnits(offered),right=pickUnits(requested);
  assert(left===right,"Rapporto 1:1 non rispettato: i diritti condizionati contano come una singola pick.");
  return {left,right,valid:true};
}


/*
 * I nomi vengono dall'Albo d'Oro della Lega; per risolvere davvero una
 * condizione serve una fonte autorevole che dichiari il torneo concluso.
 */
export const TROPHY_COMPETITIONS=Object.freeze([
  {id:"playoff",name:"Playoff"},
  {id:"campionato",name:"Campionato"},
  {id:"crash_out",name:"Crash Out Cup"},
  {id:"highlander",name:"Highlander Cup"},
  {id:"conference_league",name:"Conference League"},
  {id:"conference_championship",name:"Conference Championship"},
  {id:"round_robin",name:"Round Robin"},
  {id:"supercoppa",name:"Supercoppa degli Eroi"}
]);

/*
 * Esito della clausola:
 *  - qualsiasi titolo: TRUE appena ne esiste uno finale vinto dalla squadra;
 *    FALSE solo quando TUTTE le competizioni comprese nella clausola
 *    risultano definitive (altrimenti pending).
 *  - trofeo preciso: TRUE/FALSE soltanto a evento definitivo.
 *
 * outcomes: [{competition_id, status:"final"|"ongoing",
 *             winner_team_id}].
 * Nessun dato provvisorio può chiudere un diritto.
 */
export function resolveTrophyCondition({
  mode,subjectTeamId,competitionId=null,outcomes=[],
  eligibleCompetitionIds=TROPHY_COMPETITIONS.map(x=>x.id)
}){
  assert(["any_trophy","specific_trophy"].includes(mode),"Tipo di premio non valido.");
  assert(subjectTeamId,"Indicare la franchigia cui è legata la condizione.");
  const catalog=new Set(TROPHY_COMPETITIONS.map(x=>x.id));
  assert(Array.isArray(eligibleCompetitionIds)&&eligibleCompetitionIds.length>0,"Nessuna competizione considerata.");
  assert(eligibleCompetitionIds.every(id=>catalog.has(id)),"Competizione sconosciuta nell'elenco dei trofei.");
  assert(new Set(eligibleCompetitionIds).size===eligibleCompetitionIds.length,"La stessa competizione è indicata più volte.");
  if(mode==="specific_trophy"){
    assert(competitionId&&eligibleCompetitionIds.includes(competitionId),"Trofeo specifico non valido.");
  }
  const byId=new Map();
  for(const result of outcomes){
    if(!result||!catalog.has(result.competition_id))continue;
    assert(!byId.has(result.competition_id),"Esito di una competizione duplicato.");
    assert(["final","ongoing"].includes(result.status),"Stato della competizione non riconosciuto.");
    if(result.status==="final")assert(result.winner_team_id,"Una competizione definitiva deve avere un vincitore.");
    byId.set(result.competition_id,result);
  }
  const target=mode==="specific_trophy"?[competitionId]:eligibleCompetitionIds;
  const winners=target.filter(id=>{
    const row=byId.get(id);
    return row?.status==="final" && String(row.winner_team_id)===String(subjectTeamId);
  });
  if(winners.length){
    return {status:"resolved",triggered:true,winningCompetitionIds:winners};
  }
  const done=target.every(id=>byId.get(id)?.status==="final");
  if(!done){
    return {status:"pending",triggered:null,winningCompetitionIds:[]};
  }
  return {status:"resolved",triggered:false,winningCompetitionIds:[]};
}
