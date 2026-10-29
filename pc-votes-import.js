/* Lega degli Eroi · Playoffs Challenge V9.6 · import voti Fantacalcio.
   Reads the Fantacalcio sheet locally; never uploads the original workbook.
   Only finalized commissioner approval writes outcomes through a protected RPC. */
const normalize = v => String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const number = v => {
  if(v===null||v===undefined||v==='')return 0;
  const n=Number(String(v).replace(',','.'));
  if(!Number.isFinite(n)||n<0)throw new Error('Il file contiene un bonus non valido: '+String(v));
  return n;
};
export function parseFantacalcioVotes(workbook){
  if(!workbook?.SheetNames?.length)throw new Error('File Excel senza fogli.');
  const name=workbook.SheetNames.find(x=>x.toLowerCase()==='fantacalcio')||workbook.SheetNames[0];
  if(!globalThis.XLSX?.utils)throw new Error('Lettore Excel non caricato. Ricarica la pagina con Internet attivo.');
  const rows=globalThis.XLSX.utils.sheet_to_json(workbook.Sheets[name],{header:1,defval:null,raw:true,blankrows:false});
  const heading=String(rows[0]?.[0]||'');
  const match=heading.match(/(?:^|\s)(\d{1,2})\s*[ªa°]?\s*giornata/i);
  if(!match)throw new Error('Non riconosco il numero di giornata nel titolo del file Fantacalcio.');
  const week=Number(match[1]),clubs=new Set(),players=new Map();
  const errors=[];let activeClub='';let reading=false;let teamCount=0;
  for(let i=0;i<rows.length;i++){
    const r=rows[i]||[];
    if(/^Cod\.?$/i.test(String(r[0]??'').trim())&&normalize(r[2])==='nome'){
      const prev=String(rows[i-1]?.[0]??'').trim();
      if(!prev||prev.length>55||/www\.|file|iscritt|voti/i.test(prev))throw new Error(`Nome squadra non riconosciuto alla riga ${i+1}.`);
      activeClub=prev;clubs.add(normalize(prev));teamCount++;reading=true;continue;
    }
    if(!reading)continue;
    const code=Number(r[0]);
    if(!Number.isInteger(code)||code<=0)continue;
    const role=String(r[1]??'').trim().toUpperCase();
    const playerName=String(r[2]??'').trim();
    if(role==='ALL')continue; // allenatori: non sono eventi della Playoffs Challenge
    if(!['P','D','C','A'].includes(role)||!playerName){errors.push(i+1);continue;}
    if(players.has(code))throw new Error(`Codice giocatore duplicato: ${code} (${playerName}).`);
    const item={code,name:playerName,club:activeClub,role,
      goals:number(r[4]),goalsConceded:number(r[5]),penaltiesSaved:number(r[6]),
      ownGoals:number(r[9]),assists:number(r[12])};
    players.set(code,item);
  }
  if(errors.length)throw new Error(`Righe giocatore non valide: ${errors.slice(0,8).join(', ')}.`);
  if(clubs.size!==20||players.size<150||teamCount!==20)
    throw new Error(`Excel incompleto: ${clubs.size}/20 squadre e ${players.size} calciatori. Carica il file definitivo con tutte le partite.`);
  return {week,clubs:[...clubs],players,playerCount:players.size,sheet:name};
}
export function predictPlayerResult(event,data){
  if(event.kind!=='player')return {result:null,reason:'Risultato fantacalcio da confermare.'};
  if(event.player_role==='D'&&event.player_event==='CLEAN_SHEET')return {result:null,reason:'Evento difensore non più ammesso.'};
  const code=Number(event.player_code),name=normalize(event.player_name);
  let p=Number.isInteger(code)&&code>0?data.players.get(code):null;
  if(!p){
    // Manual events without a Fantacalcio ID are only matched when name is unique.
    if(!code){const choices=[...data.players.values()].filter(x=>normalize(x.name)===name);
      if(choices.length>1)return {result:null,reason:'Nome ambiguo: verifica manualmente.'};
      p=choices[0];}
  }
  if(!p)return {result:'NO',reason:'Non presente nell’Excel completo.'};
  if(p.role!==event.player_role)return {result:null,reason:'Il ruolo del calciatore non corrisponde: verifica manualmente.'};
  const checks={GOAL:()=>p.goals>=1,ASSIST:()=>p.assists>=1,
    GOAL_OR_ASSIST:()=>p.goals>=1||p.assists>=1,BRACE:()=>p.goals>=2,
    PENALTY_SAVE:()=>p.penaltiesSaved>=1,
    CLEAN_SHEET:()=>p.role==='P'&&p.goalsConceded===0};
  const test=checks[event.player_event];if(!test)return {result:null,reason:'Evento non riconosciuto.'};
  return {result:test()?'YES':'NO',reason:p.role==='P'&&event.player_event==='CLEAN_SHEET'
    ?`Portiere presente nel file: ${p.goalsConceded} gol subiti. Convenzione: 90 minuti, correggibile.`
    :`${p.name} · gol ${p.goals}, assist ${p.assists}, rigori parati ${p.penaltiesSaved}.`};
}
