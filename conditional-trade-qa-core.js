import {
  validateCandidates,resolveStandings,resolveRanked,resolveTrophyCondition,
  TROPHY_COMPETITIONS,validateOneForOne
} from "./conditional-trades-core.js";

// Solo simulazione in memoria. Mai chiamare RPC di mercato o salvare questi dati.
const error=(msg)=>{throw new Error(msg);};
const requireTest=(ok,msg)=>{if(!ok)error(msg);};
const same=(a,b)=>String(a)===String(b);
const clone=x=>JSON.parse(JSON.stringify(x));
export const QA_TROPHIES=TROPHY_COMPETITIONS;

export function createQaState({teams,picks,players=[],season}){
  requireTest(Array.isArray(teams)&&Array.isArray(picks),"Mancano i dati di lettura per avviare il test.");
  return {teams:clone(teams),picks:clone(picks),players:clone(players),season:Number(season),
    offers:[],rights:[],messages:[],activity:[],nextId:0};
}
export const qaTeam=(s,id)=>s.teams.find(t=>same(t.id,id));
export const qaPick=(s,id)=>s.picks.find(p=>same(p.id,id));
export const qaPlayer=(s,id)=>s.players.find(p=>same(p.id,id));
export const qaLockedIds=s=>new Set(s.rights.filter(r=>r.status==="active")
  .flatMap(r=>r.candidate_pick_ids.map(String)));
export const qaOwnedPicks=(s,id)=>s.picks.filter(p=>same(p.owner_team_id,id)&&p.status==="active"
  &&p.pick_kind==="normal").sort((a,b)=>Number(a.round)-Number(b.round)||
  String(qaTeam(s,a.original_team_id)?.name||"").localeCompare(String(qaTeam(s,b.original_team_id)?.name||""),"it"));
export const qaOwnedPlayers=(s,id)=>s.players.filter(p=>same(p.owner_team_id,id)&&p.status==="active")
  .sort((a,b)=>String(a.name).localeCompare(String(b.name),"it"));

const push=(s,teamId,title,body)=>{
  s.messages.unshift({id:"notice-"+(++s.nextId),to_team_id:teamId,title,body,read:false,
    created_at:new Date().toISOString()});
};
const log=(s,description)=>s.activity.unshift({id:"event-"+(++s.nextId),description});
const competitionList=(s,subject)=>TROPHY_COMPETITIONS.filter(c=>
  c.id!=="conference_league"&&c.id!=="conference_championship"||
  (c.id==="conference_league"&&qaTeam(s,subject)?.conference==="Conference League")||
  (c.id==="conference_championship"&&qaTeam(s,subject)?.conference==="Conference Championship")
).map(c=>c.id);

export function qaCheckOffer(s,offer){
  const {from_team_id:from,to_team_id:to,grantor_team_id:grantor,rule_kind:kind}=offer;
  const holder=same(grantor,from)?to:from;
  requireTest(from&&to&&!same(from,to)&&qaTeam(s,from)&&qaTeam(s,to),"Indica due franchigie differenti.");
  requireTest(same(grantor,from)||same(grantor,to),"Il titolare originale deve partecipare allo scambio.");
  requireTest(qaTeam(s,from).conference===qaTeam(s,to).conference,
    "Per questo test le due squadre devono appartenere alla stessa Conference.");
  const counter=qaPick(s,offer.counter_pick_id);
  requireTest(counter&&same(counter.owner_team_id,holder)&&counter.status==="active"&&
    counter.pick_kind==="normal"&&Number(counter.season)===s.season,
    "La pick di contropartita non è disponibile presso chi compra il diritto.");
  requireTest(!qaLockedIds(s).has(String(counter.id)),"La pick di contropartita è vincolata.");

  let candidates=[];
  const rule=offer.rule_spec||{};
  if(kind==="right_transfer"){
    const right=s.rights.find(r=>same(r.id,offer.existing_right_id));
    requireTest(right&&right.status==="active"&&same(right.holder_team_id,grantor),
      "Il diritto non è più attivo oppure non appartiene al venditore.");
    requireTest(!same(holder,right.grantor_team_id),
      "Il diritto non può essere rivenduto alla squadra che deve già consegnare la pick.");
    requireTest(counter.draft_name===right.draft_name,"La contropartita deve appartenere allo stesso Draft.");
  }else{
    requireTest(["standing","ranked","trophy"].includes(kind),"Seleziona una condizione valida.");
    requireTest(Array.isArray(offer.candidate_pick_ids),"Mancano le pick candidate.");
    candidates=offer.candidate_pick_ids.map(id=>qaPick(s,id));
    requireTest(candidates.every(Boolean),"Una delle pick candidate non esiste.");
    validateCandidates(candidates,{ownerId:grantor,season:s.season});
    requireTest(candidates.every(p=>p.draft_name===counter.draft_name),
      "Le pick e la contropartita devono appartenere allo stesso Draft.");
    requireTest(candidates.every(p=>!qaLockedIds(s).has(String(p.id))),
      "Almeno una pick è già vincolata a un altro diritto.");
    requireTest(!candidates.some(p=>same(p.id,counter.id)),
      "La contropartita non può essere anche una pick candidata.");
    if(kind==="standing"){
      const scope=rule.scope,subject=qaTeam(s,rule.subject_team_id);
      requireTest(subject&&["conference","round_robin"].includes(scope),"Scegli la squadra e la classifica.");
      const total=scope==="round_robin"?s.teams.length:
        s.teams.filter(t=>t.conference===subject.conference).length;
      const top=Number(rule.top_count),bottom=Number(rule.bottom_count);
      requireTest(Number.isInteger(top)&&Number.isInteger(bottom)&&top>0&&bottom>0&&top+bottom<=total,
        "Le fasce di classifica si sovrappongono.");
      const branches=[rule.top_pick_id,rule.bottom_pick_id,...(top+bottom<total?[rule.middle_pick_id]:[])];
      requireTest(branches.every(Boolean)&&new Set(branches.map(String)).size===branches.length,
        "Ogni fascia deve corrispondere a una pick diversa.");
      requireTest(branches.every(id=>candidates.some(p=>same(p.id,id)))&&
        branches.length===candidates.length,"Le scelte della condizione non corrispondono alle candidate.");
    }else if(kind==="ranked"){
      requireTest(["best","worst"].includes(rule.which),"Scegli la pick migliore o peggiore.");
      requireTest(candidates.every(p=>Number(p.round)===Number(candidates[0].round)),
        "Per migliore/peggiore servono pick dello stesso round.");
    }else{
      const subject=qaTeam(s,rule.subject_team_id);
      requireTest(subject&&["any_trophy","specific_trophy"].includes(rule.mode),
        "Clausola trofeo non valida.");
      const eligible=competitionList(s,subject.id);
      requireTest(rule.mode!=="specific_trophy"||eligible.includes(rule.competition_id),
        "Il trofeo scelto non è valido per questa squadra.");
      requireTest(candidates.length===2&&rule.won_pick_id&&rule.not_won_pick_id&&
        !same(rule.won_pick_id,rule.not_won_pick_id)&&
        [rule.won_pick_id,rule.not_won_pick_id].every(id=>candidates.some(p=>same(p.id,id))),
        "Per vittoria e mancata vittoria servono due pick differenti.");
      if(rule.mode==="any_trophy")offer.rule_spec.eligible_competition_ids=eligible.slice();
    }
  }
  const extras=offer.mixed_assets||[];
  requireTest(Array.isArray(extras)&&extras.length<=24,"Gli asset aggiuntivi non sono validi.");
  let nFrom=0,nTo=0,uFrom=0,uTo=0,fromPicks=0,toPicks=0;
  const used=new Set([...candidates.map(x=>"future_pick:"+x.id),"future_pick:"+counter.id]);
  for(const asset of extras){
    const owner=asset.side==="from"?from:asset.side==="to"?to:null;
    requireTest(owner&&["player","future_pick"].includes(asset.asset_type),
      "Un asset aggiuntivo ha un tipo o un lato non valido.");
    const key=asset.asset_type+":"+asset.asset_id;
    requireTest(!used.has(key),"Lo stesso asset compare due volte.");
    used.add(key);
    if(asset.asset_type==="player"){
      const p=qaPlayer(s,asset.asset_id);
      requireTest(p&&same(p.owner_team_id,owner)&&p.status==="active",
        "Un giocatore aggiuntivo non è più disponibile.");
      requireTest(p.role!=="P","I portieri non sono inclusi nei contratti misti in questa fase.");
      if(asset.side==="from"){nFrom++;if(p.is_u21_slot)uFrom++;}
      else{nTo++;if(p.is_u21_slot)uTo++;}
    }else{
      const p=qaPick(s,asset.asset_id);
      requireTest(p&&same(p.owner_team_id,owner)&&p.status==="active"&&p.pick_kind==="normal"&&
        Number(p.season)===s.season&&p.draft_name===counter.draft_name&&
        !qaLockedIds(s).has(String(p.id)),"Una pick aggiuntiva non è disponibile.");
      if(asset.side==="from")fromPicks++;else toPicks++;
    }
  }
  requireTest(nFrom===nTo,"Nelle trade miste i giocatori devono essere bilanciati.");
  requireTest(uFrom===uTo,"I giocatori U21 slot devono rispettare il rapporto 1:1.");
  requireTest(fromPicks===toPicks,"Le pick aggiuntive devono rispettare il rapporto 1:1.");
  validateOneForOne([{kind:"conditional_right"},...Array(fromPicks).fill({kind:"future_pick"})],
    [{kind:"future_pick"},...Array(toPicks).fill({kind:"future_pick"})]);
  return {holder,candidates,counter,extras};
}
export function qaSendOffer(s,actor,payload){
  requireTest(same(actor,payload.from_team_id),"Solo la franchigia mittente può creare questa proposta.");
  const offer=clone(payload);
  qaCheckOffer(s,offer);
  offer.id="qa-offer-"+(++s.nextId);
  offer.status="pending";
  offer.created_at=new Date().toISOString();
  s.offers.unshift(offer);
  push(s,offer.to_team_id,"🔐 Trade condizionata ricevuta","Nuova proposta da "+
    (qaTeam(s,actor)?.name||"una franchigia")+". Controlla le condizioni.");
  log(s,"Proposta "+offer.id+" inviata");
  return offer;
}
export function qaCancelOffer(s,actor,id){
  const offer=s.offers.find(o=>same(o.id,id));
  requireTest(offer&&offer.status==="pending"&&same(actor,offer.from_team_id),
    "Solo il mittente può annullare una proposta ancora aperta.");
  offer.status="cancelled";
  push(s,offer.to_team_id,"↩️ Proposta annullata","La proposta è stata ritirata.");
  log(s,"Proposta "+id+" annullata");
  return offer;
}
export function qaRespondOffer(s,actor,id,accept){
  const offer=s.offers.find(o=>same(o.id,id));
  requireTest(offer&&offer.status==="pending","La proposta non è più disponibile.");
  requireTest(same(actor,offer.to_team_id),"Solo il destinatario può rispondere alla proposta.");
  if(!accept){
    offer.status="rejected";
    push(s,offer.from_team_id,"❌ Trade rifiutata","La proposta condizionata è stata rifiutata.");
    log(s,"Proposta "+id+" rifiutata");
    return null;
  }
  const details=qaCheckOffer(s,offer); // Revalidate after all prior offers.
  const originalCounter=qaPick(s,offer.counter_pick_id);
  originalCounter.owner_team_id=offer.grantor_team_id;
  for(const asset of offer.mixed_assets||[]){
    const target=asset.side==="from"?offer.to_team_id:offer.from_team_id;
    if(asset.asset_type==="player")qaPlayer(s,asset.asset_id).owner_team_id=target;
    else qaPick(s,asset.asset_id).owner_team_id=target;
  }
  let right;
  if(offer.rule_kind==="right_transfer"){
    right=s.rights.find(r=>same(r.id,offer.existing_right_id));
    right.history.push({from:right.holder_team_id,to:details.holder,via:offer.id});
    right.holder_team_id=details.holder;
  }else{
    right={id:"qa-right-"+(++s.nextId),source_offer_id:offer.id,status:"active",
      grantor_team_id:offer.grantor_team_id,holder_team_id:details.holder,
      rule_kind:offer.rule_kind,rule_spec:clone(offer.rule_spec),
      candidate_pick_ids:offer.candidate_pick_ids.slice(),
      season:s.season,draft_name:details.counter.draft_name,resolved_pick_id:null,history:[]};
    s.rights.unshift(right);
  }
  offer.status="accepted";
  offer.accepted_at=new Date().toISOString();
  offer.right_id=right.id;
  for(const t of s.teams)push(s,t.id,"🚨 Trade condizionata conclusa",
    "Un diritto è stato "+(offer.rule_kind==="right_transfer"?"rivenduto":"creato")+
    " tra "+(qaTeam(s,offer.from_team_id)?.name||"")+
    " e "+(qaTeam(s,offer.to_team_id)?.name||"")+".");
  log(s,"Trade "+id+" accettata. Diritto "+right.id);
  return right;
}
export function qaPreviewRight(s,id,evidence){
  const right=s.rights.find(r=>same(r.id,id));
  requireTest(right,"Diritto non trovato.");
  if(right.status==="resolved")return {status:"resolved",pickId:right.resolved_pick_id};
  const picks=right.candidate_pick_ids.map(x=>qaPick(s,x));
  let resolution;
  const r=right.rule_spec;
  if(right.rule_kind==="standing"){
    const total=r.scope==="round_robin"?s.teams.length:s.teams.filter(t=>
      t.conference===qaTeam(s,r.subject_team_id)?.conference).length;
    resolution=resolveStandings({
      position:evidence.position,teamCount:total,
      topCount:r.top_count,bottomCount:r.bottom_count,
      topPickId:r.top_pick_id,bottomPickId:r.bottom_pick_id,middlePickId:r.middle_pick_id
    });
    return {status:"projected",pickId:resolution.pickId,detail:"Fascia "+resolution.branch};
  }
  if(right.rule_kind==="ranked"){
    resolution=resolveRanked({candidates:picks,orderByPickId:evidence.positions,
      which:r.which});
    return {status:"projected",pickId:resolution.pickId,detail:"Posizione Draft "+resolution.overallPick};
  }
  requireTest(right.rule_kind==="trophy","Tipo di clausola non riconosciuto.");
  resolution=resolveTrophyCondition({
    mode:r.mode,subjectTeamId:r.subject_team_id,competitionId:r.competition_id,
    eligibleCompetitionIds:r.mode==="any_trophy"?r.eligible_competition_ids:
      competitionList(s,r.subject_team_id),
    outcomes:evidence.outcomes||[]
  });
  if(resolution.status==="pending")return {status:"pending",pickId:null,
    detail:"Risultato ancora in corso: nessuna pick viene assegnata."};
  return {status:"projected",pickId:resolution.triggered?r.won_pick_id:r.not_won_pick_id,
    detail:resolution.triggered?"Trofeo conquistato":"Trofeo non conquistato"};
}
export function qaResolveRight(s,id,evidence){
  const right=s.rights.find(r=>same(r.id,id));
  requireTest(right&&right.status==="active","Il diritto è già stato risolto.");
  const result=qaPreviewRight(s,id,evidence);
  requireTest(result.status==="projected"&&result.pickId,
    "La condizione è ancora aperta: non puoi assegnare la pick.");
  const pick=qaPick(s,result.pickId);
  requireTest(pick&&same(pick.owner_team_id,right.grantor_team_id),
    "La pick promessa non si trova più presso il proprietario originale.");
  pick.owner_team_id=right.holder_team_id;
  right.status="resolved";
  right.resolved_pick_id=pick.id;
  right.resolved_at=new Date().toISOString();
  push(s,right.grantor_team_id,"🔓 Condizione risolta","La pick R"+pick.round+" è stata assegnata.");
  push(s,right.holder_team_id,"🏆 Pick ricevuta!","Hai ricevuto la R"+pick.round+
    " grazie al diritto condizionato.");
  log(s,"Condizione "+right.id+" risolta: R"+pick.round+" trasferita");
  return {...result,status:"resolved"};
}
