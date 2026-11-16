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
