
import {supabase} from "./supabase.js";

const SEASON = 2027;
const POOLS = ["conference_league","conference_championship"];
const TITLES = {
  conference_league:"Conference League",
  conference_championship:"Conference Championship"
};
const MAX_BYTES = 8 * 1024 * 1024;
let activeUser = null;
const previews = new Map();
const $ = id => document.getElementById(id);

function line(label, value, status="") {
  const root = document.createElement("div");
  root.className = "season-status-line";
  const left = document.createElement("strong");
  left.textContent = label;
  const right = document.createElement("span");
  right.className = "status "+status;
  right.textContent = value;
  root.append(left,right);
  return root;
}
function message(value, isError=false) {
  const el = $("season-import-note");
  if(el){el.textContent=value;el.style.color=isError?"#a43236":"#3b5e7c";}
}
function normalizeHeader(v) {
  return String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .toLowerCase().replace(/[^a-z0-9]/g,"");
}
function numeric(value) {
  if (typeof value==="number" && Number.isFinite(value)) return value;
  const v=String(value??"").trim().replace(/\s/g,"");
  if(!v)return null;
  const normalized=v.includes(",")?v.replace(/\./g,"").replace(",","."):v;
  const n=Number(normalized);
  return Number.isFinite(n) && n>=0 && n<=100000 ? n : null;
}
function rowField(row,idx,aliases) {
  for(const alias of aliases) if(idx[alias]!==undefined) return row[idx[alias]];
  return "";
}
function parseListone(file) {
  if(!window.XLSX) throw Error("Lettore Excel non disponibile. Ricarica la pagina con Internet attivo.");
  if(!/\.xlsx?$/i.test(file.name))throw Error("Seleziona un file Excel .xlsx o .xls.");
  if(file.size>MAX_BYTES) throw Error("File troppo grande: massimo 8 MB.");
  return file.arrayBuffer().then(buffer => {
    const book=window.XLSX.read(buffer,{type:"array",cellDates:false,cellFormula:false});
    const selected=book.SheetNames.find(x=>x.toLowerCase()==="tutti")||book.SheetNames[0];
    if(!selected)throw Error("Il file Excel non contiene fogli.");
    const matrix=window.XLSX.utils.sheet_to_json(book.Sheets[selected],{header:1,raw:true,defval:""});
    const headAt=matrix.findIndex((row,i) => {
      if(i>20)return false;
      const labels=(row||[]).map(normalizeHeader);
      return labels.includes("id") && (labels.includes("nome")||labels.includes("name"))
        && (labels.includes("rm")||labels.includes("ruolomantra"));
    });
    if(headAt<0)throw Error("Intestazioni non riconosciute. Servono Id, Nome, RM, Squadra e Qt.A M.");
    const index={};
    matrix[headAt].forEach((name,i)=>{const k=normalizeHeader(name);if(k && index[k]===undefined)index[k]=i;});
    if(!("squadra" in index) && !("serieateam" in index))throw Error("Manca la colonna Squadra.");
    if(!("qtam" in index) && !("quotationmantra" in index) && !("quotazionemantra" in index))
      throw Error("Manca la colonna quotazione Mantra (Qt.A M).");

    const result=[], ids=new Set(), errors=[];
    for(const row of matrix.slice(headAt+1)){
      const id=String(rowField(row,index,["id","externalid"])??"").trim();
      const name=String(rowField(row,index,["nome","name"])??"").trim();
      const mantra=String(rowField(row,index,["rm","ruolomantra"])??"").trim();
      const classic=String(rowField(row,index,["r","ruoloclassic","roleclassic"])??"").trim();
      const club=String(rowField(row,index,["squadra","serieateam"])??"").trim();
      const qMantra=numeric(rowField(row,index,["qtam","quotationmantra","quotazionemantra"]));
      const qClassic=numeric(rowField(row,index,["qta","quotationclassic","quotazioneclassic"]));
      const fvmMantra=numeric(rowField(row,index,["fvmm","fvmmantra"]));
      const isEmpty=!id&&!name&&!mantra&&!club;
      if(isEmpty)continue;
      if(!id||!name||!mantra||!club||qMantra===null){
        errors.push("Riga "+(headAt+result.length+errors.length+2)+": Id, Nome, RM, Squadra o Qt.A M mancante.");
        if(errors.length>=8)break;
        continue;
      }
      if(ids.has(id)){
        errors.push("ID duplicato: "+id+" ("+name+").");
        if(errors.length>=8)break;
        continue;
      }
      ids.add(id);
      result.push({
        external_id:id,name,
        role_classic:classic,
        role_mantra:mantra,
        serie_a_team:club,
        quotation_classic:qClassic,
        quotation_mantra:qMantra,
        fvm_mantra:fvmMantra
      });
      if(result.length>1500)throw Error("Il listone supera 1500 giocatori.");
    }
    if(errors.length)throw Error(errors.join(" "));
    if(result.length<100)throw Error("Listone incompleto: trovati soltanto "+result.length+" giocatori.");
    return result;
  });
}
function drawPreview(pool, parsed, name) {
  const root=$("season-preview-"+pool);
  root.replaceChildren();
  const intro=document.createElement("div");
  intro.className="preview-summary";
  intro.textContent=parsed.length+" giocatori validati · "+name;
  root.append(intro);
  const table=document.createElement("table");
  const header=document.createElement("tr");
  ["ID","Nome","Ruolo Mantra","Squadra","Qt. M"].forEach(text=>{
    const th=document.createElement("th");th.textContent=text;header.appendChild(th);
  });
  const thead=document.createElement("thead");thead.appendChild(header);table.appendChild(thead);
  const tbody=document.createElement("tbody");
  parsed.slice(0,5).forEach(p=>{
    const tr=document.createElement("tr");
    [p.external_id,p.name,p.role_mantra,p.serie_a_team,p.quotation_mantra].forEach(v=>{
      const td=document.createElement("td");td.textContent=String(v??"-");tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);root.appendChild(table);
}
async function loadStatuses(){
  const [seasons,archives,listones,future,keeper,orders,keeperSelections]=await Promise.all([
    supabase.from("draft_seasons").select("season,label,status").in("season",[2026,2027]),
    supabase.from("draft_season_archives").select("season,draft_name,order_rows,pick_rows,visual_rows").eq("season",2026),
    supabase.from("draft_season_listone_staging").select("season,pool,source_filename,player_count,uploaded_at").eq("season",SEASON),
    supabase.from("future_draft_picks").select("draft_name,status,pick_kind").eq("season",SEASON),
    supabase.from("keeper_settings").select("season,is_open,is_applied").eq("id",1).maybeSingle(),
    supabase.from("draft_season_order_previews").select("draft_name,generated_at,last_matchday,future_pick_count").eq("season",SEASON),
    supabase.from("keeper_selections").select("id,selection_type,status").eq("season",SEASON)
  ]);
  if(seasons.error||archives.error||listones.error||future.error||keeper.error||orders.error||keeperSelections.error) {
    const err=seasons.error||archives.error||listones.error||future.error||keeper.error||orders.error||keeperSelections.error;
    throw Error(err.message||"Errore caricamento dati");
  }

  const archive=$("season-archive");archive.replaceChildren();
  for(const [draft,name] of [["Draft Conference","Conference League"],["Draft Championship","Conference Championship"]]){
    const entry=(archives.data||[]).find(v=>v.draft_name===draft);
    const count=entry?.pick_rows?.length||0;
    const order=entry?.order_rows?.length||0;
    archive.appendChild(line(name,(count===184&&order===184?"✓ ":"⚠ ")+count+" pick · "+order+" posizioni",
      count===184&&order===184?"okay":"warn"));
  }

  const pre=$("season-preflight");pre.replaceChildren();
  const season=(seasons.data||[]).find(x=>x.season===SEASON);
  $("season-new-status").textContent=season?.status==="preparing"?"In preparazione":(season?.status||"Non configurata");
  for(const [draft,name] of [["Draft Conference","Pick future League"],["Draft Championship","Pick future Championship"]]){
    const list=(future.data||[]).filter(v=>v.draft_name===draft);
    pre.appendChild(line(name,list.length+" registrate","okay"));
  }
  POOLS.forEach(pool=>{
    const found=(listones.data||[]).find(l=>l.pool===pool);
    const node=$("season-status-"+pool);
    node.textContent=found?(found.player_count+" giocatori · "+found.source_filename):"Nessun listone preparato";
    pre.appendChild(line("Listone "+TITLES[pool],found?"✓ "+found.player_count+" righe":"Da caricare",
      found?"okay":"warn"));
  });
  for(const [draft,label] of [["Draft Conference","Ordine League"],["Draft Championship","Ordine Championship"]]){
    const saved=(orders.data||[]).find(x=>x.draft_name===draft);
    pre.appendChild(line(label,saved?"Proiezione salvata (GW "+saved.last_matchday+")":"Proiezione da salvare",saved?"okay":"warn"));
  }
  const selCount=(keeperSelections.data||[]).length;
  pre.appendChild(line("Conferme Pre-Draft 2027",selCount+" selezioni",selCount?"warn":"blocked"));
  const keeperSettings=keeper.data;
  const keeperOkay=keeperSettings?.season===SEASON && keeperSettings?.is_applied!==true;
  pre.appendChild(line("Pre-Draft 2027",keeperOkay?"Da verificare":"⚠ Stato da verificare",keeperOkay?"warn":"blocked"));
  pre.appendChild(line("Passaggio di stagione","Non ancora abilitato","blocked"));
}

async function init(){
  try{
    const {data:auth,error:authError}=await supabase.auth.getUser();
    if(authError)throw authError;
    activeUser=auth?.user;
    if(!activeUser)throw Error("Accedi all'app per usare il gestore delle stagioni.");
    const {data:profile,error:profileError}=await supabase.from("profiles")
      .select("role").eq("id",activeUser.id).single();
    if(profileError)throw profileError;
    if(profile?.role!=="admin")throw Error("Accesso riservato al Commissioner (Admin).");
    $("season-auth").hidden=true;
    $("season-content").hidden=false;
    await loadStatuses();
  } catch(e){
    $("season-auth").hidden=false;
    $("season-auth").textContent=e.message||"Autorizzazione o caricamento non disponibile.";
    $("season-content").hidden=true;
  }
}
document.querySelectorAll("[data-file-pool]").forEach(input=>{
  input.addEventListener("change",async ()=>{
    const pool=input.dataset.filePool;
    const button=document.querySelector('[data-save-pool="'+pool+'"]');
    const preview=$("season-preview-"+pool);
    button.disabled=true;
    previews.delete(pool);
    preview.textContent="";
    const file=input.files?.[0];
    if(!file)return;
    preview.textContent="Controllo struttura e ruoli Mantra…";
    try{
      const parsed=await parseListone(file);
      previews.set(pool,{rows:parsed,filename:file.name});
      drawPreview(pool,parsed,file.name);
      button.disabled=false;
    }catch(e){
      const err=document.createElement("p");
      err.className="error";err.textContent=e.message;
      preview.replaceChildren(err);
    }
  });
});
document.querySelectorAll("[data-save-pool]").forEach(button=>{
  button.addEventListener("click",async ()=>{
    const pool=button.dataset.savePool;
    const staged=previews.get(pool);
    if(!staged||!activeUser)return;
    if(!window.confirm("Confermi il salvataggio del listone "+TITLES[pool]+" ("+staged.rows.length+" giocatori)? Non cambia le Rose e non avvia il Draft."))return;
    button.disabled=true;
    message("Salvataggio listone "+TITLES[pool]+" in preparazione…");
    try{
      const {error}=await supabase.from("draft_season_listone_staging").upsert({
        season:SEASON,pool,source_filename:staged.filename,
        player_rows:staged.rows,player_count:staged.rows.length,
        uploaded_by:activeUser.id,uploaded_at:new Date().toISOString()
      },{onConflict:"season,pool"});
      if(error)throw error;
      message("✓ Listone "+TITLES[pool]+" salvato in preparazione. La rosa attuale è invariata.");
      await loadStatuses();
    }catch(e){
      message("Errore: "+(e.message||"salvataggio non riuscito"),true);
    }finally{button.disabled=false;}
  });
});
document.addEventListener("season-order-staged",()=>loadStatuses().catch(err=>console.warn("Impossibile aggiornare lo stato proiezioni",err)));
init();
