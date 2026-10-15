/* Playoffs Challenge V9: statistiche cumulative per stagione, prior Mantra e shrinkage.
 * Quote puramente statistiche / editoriali, mai quote da operatore commerciale.
 * La probabilita' stimata e' PER PRESENZA (non predice la titolarita').
 */
export const HIST_WEIGHTS=Object.freeze({'2024/25':.15,'2025/26':.35,'2026/27':.50});
const ATTACK=['Por','Dc','Dd','Ds','B','E','M','C','W','T','A','Pc'];
const FALLBACK={Por:[.001,.004],Dc:[.035,.025],Dd:[.035,.045],Ds:[.035,.045],B:[.035,.025],E:[.045,.055],M:[.055,.045],C:[.075,.055],W:[.11,.085],T:[.135,.08],A:[.17,.09],Pc:[.205,.06]};
const clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
export function mantraComponents(value){
 const roles=String(value||'').split(';').map(x=>x.trim()).filter(x=>ATTACK.includes(x));
 const unique=[...new Set(roles)];
 if(!unique.length)return [];
 const weights=unique.map((_,i)=>unique.length===1?1:(i===0?.65:.35/(unique.length-1)));
 return unique.map((role,i)=>({role,weight:weights[i]}));
}
export function createPlayerHistoryModel(rows){
 const unique=new Map();
 for(const row of rows||[]){
  const code=Number(row.player_code??row.code),season=String(row.season||''),gw=Number(row.gw)||0;
  if(!Number.isInteger(code)||code<=0||!HIST_WEIGHTS.hasOwnProperty(season)||gw<1||gw>38)continue;
  const key=season+':'+code,old=unique.get(key);
  if(!old||gw>Number(old.gw))unique.set(key,{...row,gw,code,season});
 }
 const latest=[...unique.values()];
 const roleAgg=Object.fromEntries(ATTACK.map(x=>[x,{n:0,g:0,a:0}]));
 for(const row of latest){
  if(row.season==='2026/27')continue;
  const visits=Number(row.appearances??row.pv)||0;
  if(visits<=0)continue;
  const weight=row.season==='2025/26'?1:.65;
  for(const c of mantraComponents(row.role_mantra??row.mantra)){
   const r=roleAgg[c.role],w=weight*c.weight;
   r.n+=visits*w;r.g+=(Number(row.goals??row.gf)||0)*w;r.a+=(Number(row.assists??row.ass)||0)*w;
  }
 }
 const roleRates={};
 for(const role of ATTACK){
  const x=roleAgg[role],fallback=FALLBACK[role];
  // 25 presenze equivalenti smussano i ruoli rari.
  roleRates[role]={g:(x.g+fallback[0]*25)/(x.n+25),a:(x.a+fallback[1]*25)/(x.n+25),sample:x.n};
 }
 const playerData=new Map();
 for(const row of latest){
  if(!playerData.has(row.code))playerData.set(row.code,{});
  playerData.get(row.code)[row.season]=row;
 }
 const seasonCounts=Object.fromEntries(Object.keys(HIST_WEIGHTS).map(season=>[season,latest.filter(r=>r.season===season).length]));
 return {roleRates,playerData,seasonCounts,records:latest.length,hasHistoricalSeasons:seasonCounts['2024/25']>100&&seasonCounts['2025/26']>100};
}
export function estimateHistoricalEvent(player,event,model,settings={}){
 if(!player||!model?.hasHistoricalSeasons)return {supported:false,reason:'Importa prima le stagioni 2024/25 e 2025/26.'};
 const classic=String(player.role||'');
 if((classic==='P'&&['CLEAN_SHEET','PENALTY_SAVE'].includes(event))||(classic==='D'&&event==='CLEAN_SHEET'))
  return {supported:false,manual:true,reason:'Minuti giocati e gol subiti durante la permanenza in campo non presenti nei file.'};
 const data=model.playerData.get(Number(player.code))||{},curr=data['2026/27'];
 const mantras=String(curr?.role_mantra||curr?.mantra||player.mantra||'');
 const split=mantraComponents(mantras);
 if(!split.length)return {supported:false,reason:'Nessun ruolo Mantra riconosciuto.'};
 const priorG=split.reduce((s,x)=>s+model.roleRates[x.role].g*x.weight,0);
 const priorA=split.reduce((s,x)=>s+model.roleRates[x.role].a*x.weight,0);
 const priorStrength=clamp(Number(settings.priorStrength)||15,5,60);
 const priceImpact=clamp(Number(settings.sensitivity??40),0,100)/100;
 let totalW=0,effN=0,rateG=0,rateA=0,seasonEvidence=[];
 for(const [season,weight] of Object.entries(HIST_WEIGHTS)){
  const r=data[season],pv=Number(r?.appearances??r?.pv)||0;
  if(!r||pv<=0)continue;
  totalW+=weight;effN+=weight*pv;
  rateG+=weight*(Math.max(0,Number(r.goals??r.gf)||0)/pv);
  rateA+=weight*(Math.max(0,Number(r.assists??r.ass)||0)/pv);
  seasonEvidence.push({season,pv,goals:Number(r.goals??r.gf)||0,assists:Number(r.assists??r.ass)||0});
 }
 if(totalW>0){rateG/=totalW;rateA/=totalW;effN/=totalW;}
 const trust=effN/(effN+priorStrength);
 let lambdaG=trust*rateG+(1-trust)*priorG;
 let lambdaA=trust*rateA+(1-trust)*priorA;
 // Prezzo Classic e' soltanto correzione attenuata, particolarmente per chi ha poco storico.
 const q=Number(player.quotation),anchor={D:6,C:8,A:10,P:4}[classic]||8;
 const factor=Number.isFinite(q)&&q>0?Math.pow(clamp(q/anchor,.15,6),.40*priceImpact*(1-.8*trust)):1;
 lambdaG=clamp(lambdaG*factor,.0002,1.50);lambdaA=clamp(lambdaA*factor,.0002,1.25);
 let p;
 switch(event){
  case 'GOAL': p=1-Math.exp(-lambdaG);break;
  case 'ASSIST':p=1-Math.exp(-lambdaA);break;
  case 'GOAL_OR_ASSIST':p=1-Math.exp(-lambdaG-lambdaA);break;
  case 'BRACE':p=1-Math.exp(-lambdaG)*(1+lambdaG);break;
  default:return {supported:false,reason:'Evento non gestito dal modello storico.'};
 }
 p=clamp(p,.002,.92);
 return {supported:true,probability:p,odd:round2(1/p),confidence:effN>=20?'storico medio':effN>=7?'storico limitato':'prior Mantra',
   mantras,roleComponents:split,priorG,priorA,trust,effN,seasonEvidence,lambdaG,lambdaA,factor,
   reason:'Media storica Mantra + rendimento del calciatore (pesi 15/35/50 e regolarizzazione) + lieve correzione Classic. Stima per presenza, non include la probabilita’ che giochi.'};
}
