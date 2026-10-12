import { supabase } from "./supabase.js";
import {parseFormationRows,parseVoteRows,COMPETITIONS} from "./match-center-importer.js";

const $ = id => document.getElementById(id);
const seasonInput = $("adm-season");
const gwInput = $("adm-gw");
const imports = new Map();
let pendingVotes=null;
let saving=false;
const log = (message,error=false) => {
  const el=$("adm-feedback");
  el.textContent=message;
  el.className=`adm-feedback ${error?"error":"ok"}`;
};
const activePeriod = () => {
  const season=seasonInput.value.trim();
  const gw=Number(gwInput.value);
  if (!/^\d{4}\/\d{2}$/.test(season)) throw new Error("Stagione non valida: esempio 2026/27.");
  if (!Number.isInteger(gw)||gw<1||gw>50) throw new Error("Seleziona una giornata da 1 a 50.");
  return {season,gw};
};
const clearPreviews=()=>{
  imports.clear();pendingVotes=null;
  document.querySelectorAll('[data-save-comp]').forEach(b=>b.disabled=true);
  document.querySelectorAll('[data-preview]').forEach(p=>{p.hidden=true;p.textContent=""});
  document.querySelectorAll('[data-file-comp]').forEach(f=>f.value="");
  document.querySelectorAll('[data-name]').forEach(n=>n.textContent="Nessun file selezionato");
  $("adm-vote-file").value="";$("adm-vote-name").textContent="Nessun file selezionato";
  $("adm-vote-preview").hidden=true;$("adm-save-votes").disabled=true;
};

async function spreadsheet(file, sheetName) {
  if (!file || !/\.xlsx?$/i.test(file.name)) throw new Error("Seleziona un file Excel .xlsx o .xls.");
  if (file.size > 10*1024*1024) throw new Error("File troppo grande (massimo 10 MB).");
  if (!globalThis.XLSX) throw new Error("Lettore Excel non disponibile: controlla la connessione Internet e ricarica la pagina.");
  const data=await file.arrayBuffer();
  const book=XLSX.read(data,{type:"array",cellDates:false,raw:true});
  const sheet = sheetName
    ? book.SheetNames.find(name=>name.toLowerCase()===sheetName.toLowerCase())
    : book.SheetNames[0];
  if (!sheet) throw new Error(`Nel file manca il foglio “${sheetName}”.`);
  return XLSX.utils.sheet_to_json(book.Sheets[sheet],{header:1,defval:null,blankrows:true});
}

async function handleFormationFile(comp,file) {
  const target=document.querySelector(`[data-preview="${comp}"]`);
  const save=document.querySelector(`[data-save-comp="${comp}"]`);
  imports.delete(comp); save.disabled=true;
  target.hidden=false;
  document.querySelector(`[data-name="${comp}"]`).textContent=file?.name||"Nessun file selezionato";
  target.textContent="Lettura e verifica…";
  try {
    const {gw}=activePeriod();
    const parsed=parseFormationRows(await spreadsheet(file),file.name);
    if (parsed.gw && parsed.gw!==gw) throw new Error(`Il file contiene la giornata ${parsed.gw}, mentre hai selezionato la ${gw}.`);
    if (parsed.competition && parsed.competition!==comp) throw new Error(`Questo Excel è per ${COMPETITIONS[parsed.competition]}, non per ${COMPETITIONS[comp]}.`);
    if (!parsed.competition) throw new Error("Non riesco a riconoscere la competizione nell'intestazione dell'Excel. Nessun dato salvato.");
    imports.set(comp,{fileName:file.name,parsed});
    target.textContent=`${parsed.stats.matches} incontri · ${parsed.stats.teams} franchigie · ${parsed.stats.starters} titolari · ${parsed.stats.bench} panchinari · ${parsed.stats.switches} switch segnalati. Pronto per il salvataggio.`;
    save.disabled=false;
    log(`Excel ${COMPETITIONS[comp]} verificato. Per salvare premi “Salva formazioni”.`);
  } catch(error) {
    target.textContent=`Errore: ${error.message}`;
    log(error.message,true);
  }
}

async function handleVoteFile(file) {
  pendingVotes=null;
  $("adm-save-votes").disabled=true;
  $("adm-vote-name").textContent=file?.name||"Nessun file selezionato";
  const preview=$("adm-vote-preview"); preview.hidden=false;preview.textContent="Lettura e verifica…";
  try {
    const {gw}=activePeriod();
    const parsed=parseVoteRows(await spreadsheet(file,"Fantacalcio"));
    if (parsed.gw && parsed.gw!==gw) throw new Error(`Il file è della giornata ${parsed.gw}, ma hai selezionato la ${gw}.`);
    pendingVotes={fileName:file.name,parsed};
    preview.textContent=`${parsed.stats.clubs} squadre di Serie A · ${parsed.stats.players} calciatori · ${parsed.stats.rated} voti validi · ${parsed.stats.sv} senza voto (inclusi 6*). Pronto per il salvataggio.`;
    $("adm-save-votes").disabled=false;
    log("Excel voti verificato. L'upload sostituirà i voti precedenti della stessa giornata.");
  } catch(error) {preview.textContent=`Errore: ${error.message}`; log(error.message,true);}
}

async function saveFormation(comp) {
  if (saving) return;
  const candidate=imports.get(comp);
  if (!candidate) return;
  const button=document.querySelector(`[data-save-comp="${comp}"]`);
  const was=button.textContent;
  try {
    saving=true;button.disabled=true;button.textContent="Salvataggio…";
    const {season,gw}=activePeriod();
    if (candidate.parsed.gw && candidate.parsed.gw!==gw) throw new Error("Giornata cambiata dopo aver selezionato il file.");
    const {data,error}=await supabase.rpc("mc_import_formations",{
      p_season:season,p_gw:gw,p_competition:comp,p_file_name:candidate.fileName,p_players:candidate.parsed.players
    });
    if (error) throw error;
    log(`${COMPETITIONS[comp]}: importati ${data.players} calciatori di ${data.teams} franchigie, giornata ${gw}.`);
    await fetchStatus();
  } catch(error) {log(`Impossibile salvare ${COMPETITIONS[comp]}: ${error.message}`,true);}
  finally {saving=false;button.disabled=false;button.textContent=was;}
}

async function saveVotes() {
  if (saving||!pendingVotes) return;
  const button=$("adm-save-votes");const was=button.textContent;
  try {
    saving=true;button.disabled=true;button.textContent="Salvataggio…";
    const {season,gw}=activePeriod();
    if (pendingVotes.parsed.gw && pendingVotes.parsed.gw!==gw) throw new Error("Giornata cambiata dopo la selezione dei voti.");
    const {data,error}=await supabase.rpc("mc_import_votes",{
      p_season:season,p_gw:gw,p_file_name:pendingVotes.fileName,p_votes:pendingVotes.parsed.votes,
      p_allow_reduced:$("adm-allow-reduced").checked
    });
    if (error) throw error;
    log(`Voti aggiornati: ${data.players} calciatori di ${data.clubs} squadre di Serie A. Nessun risultato ufficiale modificato.`);
    await fetchStatus();
  } catch(error) {log(`Impossibile aggiornare i voti: ${error.message}`,true);}
  finally {saving=false;button.disabled=false;button.textContent=was;}
}

async function fetchStatus() {
  const {season,gw}=activePeriod();
  const [a,b]=await Promise.all([
    supabase.from("mc_formation_imports").select("competition,teams_count,players_count,imported_at").eq("season",season).eq("gw",gw),
    supabase.from("mc_vote_imports").select("clubs_count,players_count,imported_at").eq("season",season).eq("gw",gw).maybeSingle()
  ]);
  if (a.error) throw a.error;
  if (b.error) throw b.error;
  for(const comp of Object.keys(COMPETITIONS)){
    const status=document.querySelector(`[data-state="${comp}"]`);
    const row=(a.data||[]).find(x=>x.competition===comp);
    status.textContent=row?`${row.teams_count} franchigie · importato`:"Non importato";
    status.classList.toggle("ready",!!row);
    status.title=row?`Importato il ${new Date(row.imported_at).toLocaleString("it-IT")}`:"";
  }
  const status=$("adm-vote-status");
  status.textContent=b.data?`${b.data.clubs_count} squadre · importato`:"Non importato";
  status.classList.toggle("ready",!!b.data);
  status.title=b.data?`Importato il ${new Date(b.data.imported_at).toLocaleString("it-IT")}`:"";
}

async function init() {
  const access=$("adm-access");
  try {
    const {data:{user},error:authError}=await supabase.auth.getUser();
    if (authError||!user) {access.className="adm-access error";access.innerHTML='Devi <a href="login.html">accedere</a> per usare il pannello Admin.';return;}
    const {data,error}=await supabase.from("mc_admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
    if (error) throw error;
    if (!data) {access.className="adm-access error";access.textContent="Accesso riservato agli amministratori autorizzati.";return;}
    $("adm-workspace").hidden=false;
    access.className="adm-access ok";access.textContent="Accesso amministratore verificato. Importazioni abilitate.";
    document.querySelectorAll('[data-file-comp]').forEach(el=>el.addEventListener("change",()=>{if(el.files?.[0]) void handleFormationFile(el.dataset.fileComp,el.files[0]);}));
    document.querySelectorAll('[data-save-comp]').forEach(el=>el.addEventListener("click",()=>void saveFormation(el.dataset.saveComp)));
    $("adm-vote-file").addEventListener("change",e=>{if(e.target.files?.[0])void handleVoteFile(e.target.files[0]);});
    $("adm-save-votes").addEventListener("click",()=>void saveVotes());
    for(const el of [seasonInput,gwInput]) el.addEventListener("change",()=>{clearPreviews();fetchStatus().catch(e=>log(e.message,true));});
    await fetchStatus();
  } catch(error) {
    access.className="adm-access error";
    access.textContent=`Errore autorizzazione/configurazione Supabase: ${error.message}. Prima esegui lo script SQL di installazione e abilita un amministratore.`;
    $("adm-workspace").hidden=true;
  }
}
void init();
