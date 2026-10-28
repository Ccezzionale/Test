/* Playoffs Challenge V9.5 · stime portieri con dati cumulativi delle tre stagioni.
 * Stimiamo la frequenza dell'evento nella prossima gara, non la percentuale
 * di rigori parati su quelli affrontati (dato non disponibile).
 * I clean sheet sono approssimati dalla distribuzione Poisson dei gol subiti.
 * I 60 minuti richiesti dal regolamento non sono osservabili negli snapshot:
 * la probabilità di restare >=60 minuti è una correzione esplicita del 96%.
 */
const cap=(x,a,b)=>Math.max(a,Math.min(b,x));
const round2=x=>Math.round((x+Number.EPSILON)*100)/100;
const seasons=['2024/25','2025/26','2026/27'];
function asN(n){const x=Number(n);return Number.isFinite(x)?Math.max(0,x):0}
export function createGoalkeeperModel(rows){
 const records=new Map(),byPlayer=new Map(),league={};
 for(const s of seasons)league[s]={apps:0,goals:0,saves:0};
 for(const r of rows||[]){
  if(r.role_classic!=='P'||!seasons.includes(r.season))continue;
  const code=Number(r.player_code),gw=Number(r.gw);
  if(!Number.isInteger(code)||code<=0||!Number.isFinite(gw))continue;
  const k=`${r.season}:${code}`;
  if(!records.has(k)||gw>records.get(k).gw)records.set(k,{code,season:r.season,gw,apps:asN(r.appearances),goals:asN(r.goals_conceded),saves:asN(r.penalties_saved)});
 }
 for(const r of records.values()){
  const s=league[r.season];s.apps+=r.apps;s.goals+=r.goals;s.saves+=r.saves;
  const p=byPlayer.get(r.code)||{};p[r.season]=r;byPlayer.set(r.code,p);
 }
 const pastApps=league['2024/25'].apps+league['2025/26'].apps;
 return {byPlayer,league,
  leagueGoalRate:pastApps?(league['2024/25'].goals+league['2025/26'].goals)/pastApps:1.22,
  leaguePenaltyRate:pastApps?(league['2024/25'].saves+league['2025/26'].saves)/pastApps:.025,
  currentGW:Math.max(0,...[...records.values()].filter(r=>r.season==='2026/27').map(r=>r.gw)),
  keeperCount:byPlayer.size};
}
export function estimateGoalkeeperEvent(player,event,model){
 if(player?.role!=='P'||!['CLEAN_SHEET','PENALTY_SAVE'].includes(event)||!model?.league)return {supported:false,reason:'Dati portieri non disponibili.'};
 const data=model.byPlayer.get(Number(player.code))||{};
 const h24=data['2024/25'],h25=data['2025/26'],current=data['2026/27'];
 const app24=asN(h24?.apps),app25=asN(h25?.apps),apps=asN(current?.apps);
 const globalGoal=cap(model.leagueGoalRate,.2,3);
 const globalPen=cap(model.leaguePenaltyRate,.001,.15);
 // Il passato stima il livello iniziale, con maggiore importanza al 2025/26.
 // Un prior da 6 presenze evita che pochi minuti storici dominino la media Serie A.
 const histApps=app25+.6*app24;
 const histGoals=asN(h25?.goals)+.6*asN(h24?.goals);
 const historyLambda=(histGoals+6*globalGoal)/(histApps+6);
 // 5 presenze equivalenti: N/(N+5) cresce automaticamente durante la stagione.
 const currentGoals=asN(current?.goals);
 const seasonWeight=apps/(apps+5);
 const lambda=cap((1-seasonWeight)*historyLambda+seasonWeight*(apps?currentGoals/apps:historyLambda),.03,4);
 // Fattore presenza: record delle presenze attuali e probabilità storica di giocare.
 // La scelta dell'undici e gli infortuni non sono noti: stima, non certezza.
 const seasonExposure=(h25?1:0)+(h24?.season?0.6:0);
 const pastRate=seasonExposure>0?cap((app25+.6*app24)/(38*seasonExposure),.02,.99):.50;
 const gw=Math.max(model.currentGW,Number(current?.gw)||0);
 const pPlay=gw>0?cap((apps+4*pastRate)/(gw+4),.04,.99):cap(pastRate,.04,.99);
 const histSaves=asN(h25?.saves)+.6*asN(h24?.saves);
 // Per il rigore parato prior molto forte (50 presenze), evento rarissimo.
 const weightedApps=histApps+1.5*apps;
 const weightedSaves=histSaves+1.5*asN(current?.saves);
 const penRate=(weightedSaves+50*globalPen)/(weightedApps+50);
 const pConditional=event==='CLEAN_SHEET'?Math.exp(-lambda):1-Math.exp(-penRate);
 const p=cap(pPlay*pConditional*(event==='CLEAN_SHEET'?.96:1),.0001,.95);
 return {supported:true,probability:p,odd:round2(1/p),
  confidence:apps>=15?'stagione attuale robusta':apps>=5?'stagione attuale in crescita':'storico prevalente',
  goalkeeperEvidence:{seasonWeight,lambda,historyLambda,pPlay,currentApps:apps,currentGW:gw,
   currentGoals,currentSaves:asN(current?.saves),priorApps:histApps,priorSaves:histSaves,
   leagueGoalRate:globalGoal,leaguePenaltyRate:globalPen,penRate},
  reason:event==='CLEAN_SHEET'?'Poisson: gol subiti per presenza, storico iniziale e stagione corrente con peso crescente (5 presenze di regolarizzazione), probabilità di giocare e correzione 60 minuti (96%).':
  'Frequenza rigori parati per presenza nelle tre stagioni, regolarizzata con 50 presenze equivalenti di media Serie A e moltiplicata per la probabilità di giocare. Non sono noti i rigori affrontati.'};
}
