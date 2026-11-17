/* Proiezioni 2027/28 · solo preparazione, non modifica mai draft_order o draft_picks. */
import {supabase} from "./supabase.js";
import {loadResultsRows} from "./results-source.js";
import {generaDraftDaCSV,loadFutureDraftPicks} from "./dinamico-draft.js?v=20261117-season-link";
const SEASON=2027, el=id=>document.getElementById(id);
let pending=null, adminUser=null;
function key(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function msg(text,bad=false){const e=el("season-order-note");e.textContent=text;e.style.color=bad?"#a33442":"#536a80";}
function stat(label,value,kind=""){const root=document.createElement("div");root.className="season-status-line";
const a=document.createElement("strong");a.textContent=label;const b=document.createElement("span");b.className="status "+kind;b.textContent=value;root.append(a,b);return root;}
function validate(name,rounds,ranked,future,teams){
 const conference=name==="Draft Conference"?"Conference League":"Conference Championship";
 const expectedTeams=teams.filter(t=>t.conference===conference);
 const foundTeams=new Set((ranked||[]).map(key)), expectedKeys=new Set(expectedTeams.map(t=>key(t.name)));
 const errors=[], rows=[], numbers=new Set(), seen=new Set();
 if(expectedTeams.length!==8 || foundTeams.size!==8 || [...expectedKeys].some(t=>!foundTeams.has(t)))
   errors.push("Le 8 franchigie della classifica non coincidono con l'anagrafica");
 if(!Array.isArray(rounds)||rounds.length!==23)errors.push("Sono necessari 23 round");
 const active=future.filter(p=>p.draft_name===name&&p.status==="active");
 const byId=new Map(active.map(p=>[String(p.id),p]));
 for(let ri=0;ri<(rounds||[]).length;ri++){
   const round=rounds[ri];
   if(Number(round.Round)!==ri+1)errors.push("Round non consecutivi");
   for(const p of (round.Picks||[])){
     const id=String(p.future_pick_id||""), original=byId.get(id), n=Number(p.pickNumber);
     if(!original){errors.push("Pick "+n+" senza diritto futuro riconosciuto");continue;}
     if(seen.has(id)||numbers.has(n))errors.push("Pick futura o numero ripetuti");
     seen.add(id);numbers.add(n);
     if(original.owner?.id!==p.owner_team_id||original.original?.id!==p.original_team_id)
       errors.push("Proprietà pick "+n+" incoerente");
     rows.push({pick_number:n,round:Number(p.round||round.Round),
       display_round:Number(p.displayRound||p.round||round.Round),
       team_id:p.owner_team_id,original_team_id:p.original_team_id,
       future_pick_id:id,team_name:String(p.team||""),
       original_team_name:String(p.originalTeam||""),traded:!!p.traded,bonus:!!p.bonus,
       source_trade_id:p.source_trade_id||null,
       protection_note:String(p.protection_note||""),notes:String(p.notes||"")});
   }
 }
 if(rows.length!==active.length||seen.size!==active.length)errors.push("Numero di pick non corrispondente ai diritti futuri attivi");
 if([...numbers].some(n=>!Number.isInteger(n)||n<1||n>numbers.size))errors.push("Numerazione pick non consecutiva");
 if(rows.some(p=>!p.team_id||!p.original_team_id))errors.push("ID franchigia mancante");
 return {draft_name:name,ranked_teams:ranked||[],picks:rows,expected:active.length,
   traded:rows.filter(r=>r.traded).length,errors:[...new Set(errors)].slice(0,8)};
}
function preview(id,report){
 const root=el(id);root.replaceChildren();
 const summary=document.createElement("p");summary.className="season-order-summary";
 summary.textContent=report.picks.length+" pick, "+report.traded+" scambiate, 23 round";
 root.append(summary);
 if(report.errors.length){const note=document.createElement("p");note.className="season-order-error";note.textContent=report.errors.join(" · ");root.append(note);return;}
 const tbl=document.createElement("table");tbl.className="season-order-table";
 const head=document.createElement("tr");
 ["Pick","R","Proprietario","Originale"].forEach(x=>{const th=document.createElement("th");th.textContent=x;head.append(th);});
 const thead=document.createElement("thead");thead.append(head);tbl.append(thead);
 const tbody=document.createElement("tbody");
 report.picks.slice(0,10).forEach(p=>{
   const tr=document.createElement("tr");
   [p.pick_number,p.round,p.team_name,p.original_team_name].forEach((value,i)=>{
     const td=document.createElement("td");td.textContent=String(value);if(i===3&&p.traded)td.className="is-traded";tr.append(td);
   });tbody.append(tr);
 });
 tbl.append(tbody);root.append(tbl);
 const caption=document.createElement("small");caption.textContent="Prime 10 pick, l'intero ordine sarà salvato.";root.append(caption);
}
async function confirmAdmin(){
 const {data:{user},error:e}=await supabase.auth.getUser();if(e)throw e;
 if(!user)throw Error("Accesso richiesto.");
 const {data:profile,error}=await supabase.from("profiles").select("role").eq("id",user.id).single();
 if(error||profile?.role!=="admin")throw Error("Funzione riservata al Commissioner.");
 adminUser=user;return user;
}
async function build(){
 const generate=el("season-order-generate"), save=el("season-order-save");
 generate.disabled=true;save.disabled=true;pending=null;
 msg("Calcolo classifica, round e pick future…");
 el("season-order-overview").replaceChildren();
 try{
   await confirmAdmin();
   const [results,future,teams,settings,rights]=await Promise.all([
     loadResultsRows(),loadFutureDraftPicks(),
     supabase.from("teams").select("id,name,conference"),
     supabase.from("keeper_settings").select("season,is_applied").eq("id",1).maybeSingle(),
     supabase.from("conditional_trade_rights").select("status").eq("season",SEASON)
   ]);
   if(teams.error)throw teams.error;if(settings.error)throw settings.error;
   if(!Array.isArray(results)||!results.length)throw Error("Risultati assenti.");
   if(!Array.isArray(future)||!future.length)throw Error("Pick future assenti.");
   const data=generaDraftDaCSV(results,future);
   const reports=[
     validate("Draft Conference",data.league,data.leagueTeams,future,teams.data||[]),
     validate("Draft Championship",data.championship,data.champTeams,future,teams.data||[])
   ];
   const regular=results.filter(x=>x.Phase==="Regular"&&["Conf A","Conf B","Unificata"].includes(x.Conference));
   const gw=regular.reduce((n,r)=>Math.max(n,Number(r.GW_Stagionale||r.GW)||0),0);
   const warnings=[];
   if(gw<29)warnings.push("Regular Season in corso: giornata "+gw+"/29. Questa proiezione cambierà con i risultati.");
   if(settings.data?.season===SEASON&&settings.data?.is_applied===true)
     warnings.push("Pre-Draft 2027 segnato come applicato: stato amministrativo da correggere prima dello switch.");
   if(rights.error)warnings.push("Diritti condizionati non verificati automaticamente: "+rights.error.message);
   else {const unresolved=(rights.data||[]).filter(r=>!["resolved","cancelled","void"].includes(String(r.status||"").toLowerCase()));
     if(unresolved.length)warnings.push(unresolved.length+" diritti condizionati ancora aperti.");}
   const stats=el("season-order-overview");
   stats.append(stat("Risultati Regular",regular.length+" righe · giornata "+gw,gw>=29?"okay":"warn"));
   for(const r of reports)stats.append(stat(r.draft_name,r.picks.length+" pick · "+r.traded+" scambiate",r.errors.length?"blocked":"okay"));
   for(const w of warnings){const div=document.createElement("div");div.className="season-order-warning";div.textContent=w;stats.append(div);}
   preview("season-order-league",reports[0]);preview("season-order-championship",reports[1]);
   if(reports.some(x=>x.errors.length)){msg("Proiezione incompleta: verifica gli errori prima di salvare.",true);return;}
   pending={reports,gw,warnings,resultCount:regular.length};save.disabled=false;
   msg("Proiezione valida e provvisoria. Puoi salvarla in preparazione, senza modificare le chiamate 2026/27.");
 }catch(e){msg("Errore: "+(e.message||String(e)),true)}
 finally{generate.disabled=false;}
}
async function save(){
 if(!pending)return;
 const button=el("season-order-save");button.disabled=true;
 try{
   await confirmAdmin();
   if(!window.confirm("Salvare le proiezioni PROVVISORIE 2027/28? Nessun reset, nessuna attivazione e nessun cambiamento alle Rose."))return;
   const stamp=new Date().toISOString();
   const payload=pending.reports.map(x=>({
     season:SEASON,draft_name:x.draft_name,projected_picks:x.picks,
     original_team_order:x.ranked_teams,future_pick_count:x.expected,
     results_row_count:pending.resultCount,last_matchday:pending.gw,
     warnings:pending.warnings,stage:"provisional",
     generated_by:adminUser.id,generated_at:stamp
   }));
   msg("Salvataggio delle proiezioni separate…");
   const {error}=await supabase.from("draft_season_order_previews").upsert(payload,{onConflict:"season,draft_name"});
   if(error)throw error;
   msg("✓ Due proiezioni salvate in preparazione. Draft 2026/27 e Rose invariati.");
   const summary=el("season-order-overview");
   summary.append(stat("Salvataggio","Completato · "+stamp.slice(0,10),"okay"));
 }catch(e){msg("Errore salvataggio: "+(e.message||String(e)),true)}
 finally{button.disabled=!pending;}
}
el("season-order-generate")?.addEventListener("click",build);
el("season-order-save")?.addEventListener("click",save);
