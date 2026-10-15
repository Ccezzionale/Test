/* Importatore Client XLSX, Admin only. Utilizza SheetJS caricata nel sito.
 * Scrive attraverso la RPC protetta; mai insert diretto da browser. */
const $=id=>document.getElementById(id);
export function mountPlayerHistoryImport({supabase,onImported}){
 const root=$('pc-history-upload');
 if(!root)return;
 const file=$('pc-history-file'),season=$('pc-history-season'),gw=$('pc-history-gw');
 const button=$('pc-history-import'),feedback=$('pc-history-feedback');
 const note=(msg,isError=false)=>{feedback.textContent=msg;feedback.style.color=isError?'#ffadad':'#bbf0cf'};
 season.addEventListener('change',()=>{gw.value=season.value==='2026/27'?'6':'38';gw.disabled=season.value!=='2026/27'});
 async function importFile(){
  if(!file.files?.length)return note('Seleziona un file Excel da importare.',true);
  if(!window.XLSX)return note('Libreria XLSX non caricata. Controlla la connessione a Internet e riprova.',true);
  const targetSeason=season.value,targetGw=Number(gw.value);
  if(!Number.isInteger(targetGw)||targetGw<1||targetGw>38)return note('Giornata non valida.',true);
  if(!['2024/25','2025/26','2026/27'].includes(targetSeason))return note('Stagione non supportata.',true);
  if(!/\.xlsx?$/i.test(file.files[0].name))return note('È necessario un file Excel .xlsx o .xls.',true);
  if(!confirm(`Importare il file per ${targetSeason}, giornata ${targetGw}? Se esiste già una fotografia della stessa giornata, verrà sostituita.`))return;
  button.disabled=true;note('Lettura e verifica del file…');
  try{
   const buffer=await file.files[0].arrayBuffer();
   const wb=window.XLSX.read(buffer,{type:'array',cellDates:false});
   const sheet=wb.Sheets['Tutti'];if(!sheet)throw new Error('Foglio «Tutti» mancante.');
   const title=String(sheet.A1?.v||'');
   if(!title.includes(targetSeason.replace('/',' ')))throw new Error(`La stagione indicata nel file («${title}») non coincide con ${targetSeason}.`);
   const raw=window.XLSX.utils.sheet_to_json(sheet,{range:1,defval:null,raw:true});
   const must=['Id','R','Rm','Nome','Squadra','Pv','Gf','Ass','Gs','Rp'];
   if(!raw.length||must.some(key=>!Object.hasOwn(raw[0],key)))throw new Error('Intestazioni incompatibili: servono '+must.join(', '));
   const n=(v,def=0)=>v===null||v===''?def:Number(v);
   const rows=raw.filter(r=>Number.isInteger(n(r.Id,NaN))&&n(r.Id)>0).map(r=>({
    code:n(r.Id),name:String(r.Nome||'').trim(),club:String(r.Squadra||'').trim(),role:String(r.R||'').trim(),
    mantra:String(r.Rm||'').trim(),pv:n(r.Pv),gf:n(r.Gf),ass:n(r.Ass),gs:n(r.Gs),rp:n(r.Rp),
    mv:r.Mv===null?null:n(r.Mv),fm:r.Fm===null?null:n(r.Fm)
   }));
   if(rows.length<100||rows.length>1200)throw new Error('Numero calciatori inatteso: '+rows.length);
   const codes=new Set(rows.map(r=>r.code));if(codes.size!==rows.length)throw new Error('ID duplicati nel file.');
   if(rows.some(r=>!r.name||!r.mantra||!['P','D','C','A'].includes(r.role)||
       [r.pv,r.gf,r.ass,r.gs,r.rp].some(x=>!Number.isInteger(x)||x<0)))throw new Error('Dati mancanti o non validi: importazione bloccata.');
   note(`Importazione protetta di ${rows.length} giocatori in Supabase…`);
   const {data,error}=await supabase.rpc('pc_admin_import_player_snapshot',{p_season:targetSeason,p_gw:targetGw,p_rows:rows});
   if(error)throw new Error(error.message);
   file.value='';note(`✅ Importati ${data} calciatori · ${targetSeason} · giornata ${targetGw}. Quote ricalcolate con lo storico aggiornato.`);
   if(onImported)await onImported();
  }catch(e){note(`Errore importazione: ${e.message}`,true)}finally{button.disabled=false}
 }
 button.addEventListener('click',importFile);
}
