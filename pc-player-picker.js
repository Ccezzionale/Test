/* Playoffs Challenge V9.3 - demo interattiva. Nessuna chiamata di scrittura. */
import {loadRoster,PLAYER_EVENTS} from './bookmaker-players.js?v=pc-v9-3';
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={P:'🧤 POR',D:'🛡️ DIF',C:'🎯 CEN',A:'⚽ ATT'};
export function mountDemoPlayerPicker(supabase){
 const root=$('pc-demo-role-picker');if(!root)return;
 let roster=[],role='P',search='',chosen=new Map();
 const q=$('pc-demo-player-search'),select=$('pc-demo-player-select'),event=$('pc-demo-player-event'),status=$('pc-demo-player-feedback');
 function renderRoles(){root.innerHTML=Object.entries(labels).map(([key,label])=>`<button type="button" class="pc-role-choice ${role===key?'active':''}" data-demo-role="${key}" aria-pressed="${role===key}"><strong>${label}</strong><small>${chosen.has(key)?'✓ Scelto':'Tocca per scegliere'}</small></button>`).join('');}
 function renderOptions(){
   const filtered=roster.filter(x=>x.role===role && (!search || (`${x.name} ${x.club}`).toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'))));
   const old=select.value; const limit=70;
   select.innerHTML=`<option value="">Scegli un calciatore…</option>`+filtered.slice(0,limit).map(x=>`<option value="${esc(x.code)}">${esc(x.name)} · ${esc(x.club)}</option>`).join('');
   if(filtered.some(x=>String(x.code)===old)&&filtered.slice(0,limit).some(x=>String(x.code)===old))select.value=old;
   event.innerHTML=PLAYER_EVENTS[role].map(x=>`<option value="${x.key}">${esc(x.title)}</option>`).join('');
   status.textContent=`${filtered.length} calciatori ${labels[role]}. ${filtered.length>limit?'Mostro i primi '+limit+': scrivi il nome per restringere la ricerca.':'Scegli il nome e l’evento.'} Prova non ufficiale.`;
 }
 function renderChosen(){
  $('pc-demo-player-selected').innerHTML=[...chosen.entries()].map(([r,x])=>`<div class="pc-picker-chip"><span><b>${labels[r]}</b> · ${esc(x.name)} · ${esc(x.title)} <small>(quota non pubblicata)</small></span><button type="button" class="pc-button pc-ghost" data-demo-remove="${r}">Rimuovi</button></div>`).join('');
 }
 root.addEventListener('click',e=>{const b=e.target.closest('[data-demo-role]');if(!b)return;role=b.dataset.demoRole;search='';q.value='';renderRoles();renderOptions();});
 q.addEventListener('input',()=>{search=q.value.trim();renderOptions()});
 $('pc-demo-player-add').addEventListener('click',()=>{const p=roster.find(x=>String(x.code)===select.value&&x.role===role);if(!p)return status.textContent='Seleziona prima un calciatore.';
   const ev=PLAYER_EVENTS[role].find(x=>x.key===event.value);if(!ev)return;
   chosen.set(role,{name:p.name,club:p.club,title:ev.title,event:ev.key});
   renderRoles();renderChosen();status.textContent='✅ Scelta simulata. Nessun dato è stato salvato e la quota arriverà solo con il palinsesto ufficiale.';
 });
 $('pc-demo-player-selected').addEventListener('click',e=>{const b=e.target.closest('[data-demo-remove]');if(!b)return;chosen.delete(b.dataset.demoRemove);renderRoles();renderChosen();});
 renderRoles();select.innerHTML='<option>Caricamento calciatori…</option>';
 loadRoster(supabase).then(rows=>{roster=rows;renderOptions();}).catch(e=>{status.textContent='Listino non disponibile: '+e.message;select.innerHTML='<option value="">Impossibile caricare</option>';});
}
