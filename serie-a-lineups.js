import {supabase} from './supabase.js';
import {parseLineups} from './serie-a-lineup-parser.js?v=1';
const $=id=>document.getElementById(id);
let user, pending, snapshots=[], current;
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(s,error=false){$('message').textContent=s;$('message').className=error?'lu-error':'';}
const format=x=>new Date(x).toLocaleString('it-IT',{timeZone:'Europe/Rome'});
const row=p=>'<div class="lu-player"><span>'+esc(p.name)+'</span><span class="lu-pct '+(p.pct>=75?'high':'')+'">'+esc(p.pct)+'%</span></div>';
function team(t){return '<div class="lu-team"><h3>'+esc(t.name)+' <small>'+esc(t.formation)+'</small></h3><div>'+t.starters.map(row).join('')+'</div><details><summary>Panchina ('+t.reserves.length+')</summary>'+t.reserves.map(row).join('')+'</details></div>';}
function render(){
  const m=current?.matches||[], club=$('club').value;
  $('meta').textContent=current?'Giornata '+current.gw+' • File del '+format(current.captured_at)+(pending===current?' • ANTEPRIMA NON PUBBLICATA':' • Pubblicato '+format(current.imported_at)):'Nessuna giornata pubblicata.';
  $('matches').innerHTML=m.filter(x=>!club||x.teams.some(t=>t.name===club)).map(x=>'<article class="lu-card"><p class="lu-info">'+esc(x.date)+' · '+esc(x.updated)+'</p><div class="lu-teams">'+x.teams.map(team).join('')+'</div><details class="lu-details"><summary>Ballottaggi e indisponibili</summary>'+x.ballots.map(b=>'<p>'+b.map(p=>esc(p.name)+' '+esc(p.pct)+'%').join(' / ')+'</p>').join('')+Object.entries({injured:'Infortunati',suspended:'Squalificati',cautioned:'Diffidati',doubt:'In dubbio'}).map(([k,label])=>'<p><strong>'+label+':</strong> '+(x.statuses[k].map(p=>esc(p.name)).join(', ')||'Nessuno segnalato')+'</p>').join('')+'</details></article>').join('');
}
function setCurrent(s){
  current=s;const clubs=(s?.matches||[]).flatMap(m=>m.teams.map(t=>t.name)).sort();
  $('club').replaceChildren(new Option('Tutte',''),...clubs.map(c=>new Option(c,c)));render();
}
async function load(preferred){
  const {data,error}=await supabase.from('serie_a_lineup_snapshots').select('season,gw,captured_at,imported_at').order('season',{ascending:false}).order('gw',{ascending:false}).limit(80);
  if(error)throw error;snapshots=data||[];
  $('round').replaceChildren(...snapshots.map((s,i)=>new Option(s.season+' · Giornata '+s.gw,String(i))));
  const i=preferred?snapshots.findIndex(s=>s.season===preferred.season&&s.gw===preferred.gw):0;
  if(snapshots.length){$('round').value=String(Math.max(i,0));await loadRound();}
  else setCurrent(null);
}
let request=0;
async function loadRound(){
  const s=snapshots[Number($('round').value)];if(!s)return;const token=++request;
  const {data,error}=await supabase.from('serie_a_lineup_snapshots').select('season,gw,captured_at,imported_at,matches').eq('season',s.season).eq('gw',s.gw).single();
  if(token!==request)return;if(error)throw error;setCurrent(data);
}
async function checkIds(p){
  const ids=p.matches.flatMap(m=>m.teams.flatMap(t=>[...t.starters,...t.reserves].map(x=>x.id)));
  const found=new Set();
  for(let i=0;i<ids.length;i+=100){
    const {data,error}=await supabase.from('players').select('external_id').in('external_id',ids.slice(i,i+100));
    if(error)throw error;for(const x of data||[])found.add(String(x.external_id));
  }
  return ids.filter(id=>found.has(id)).length;
}
$('file').addEventListener('change',async()=>{
  pending=null;$('save').disabled=true;$('preview').textContent='';
  const f=$('file').files[0];if(!f)return;
  try{
    if(f.size>30*1024*1024)throw Error('File troppo grande (max 30 MB)');
    const p=parseLineups(await f.text());
    pending=p;request++;setCurrent(p);
    const count=p.matches.flatMap(m=>m.teams).reduce((n,t)=>n+t.reserves.length,0);
    $('preview').textContent='Giornata '+p.gw+' • 10 partite • 20 squadre • 220 titolari • '+count+' riserve.';
    try{const matched=await checkIds(p);if(pending!==p)return;$('preview').textContent+=' '+matched+'/'+(220+count)+' ID presenti nel listone.';}catch(e){if(pending!==p)return;$('preview').textContent+=' Controllo ID non disponibile: '+e.message;}
    if(pending===p)$('save').disabled=false;
  }catch(e){message(e.message||String(e),true);$('preview').textContent='Importazione non valida.';}
});
$('save').addEventListener('click',async()=>{
  if(!pending)return;const p=pending,season=$('season').value.trim();
  if(!/^20\d{2}\/\d{2}$/.test(season)){message('Stagione non valida',true);return;}
  if(!confirm('Pubblicare le probabili formazioni della giornata '+p.gw+' ('+season+')?'))return;
  $('save').disabled=true;$('file').disabled=true;
  try{
    const {data:old,error:readError}=await supabase.from('serie_a_lineup_snapshots').select('captured_at').eq('season',season).eq('gw',p.gw).maybeSingle();
    if(readError)throw readError;
    if(old&&new Date(old.captured_at)>new Date(p.captured_at))throw Error('Il file è precedente all’aggiornamento pubblicato.');
    const {error}=await supabase.from('serie_a_lineup_snapshots').upsert({season,gw:p.gw,captured_at:p.captured_at,matches:p.matches,imported_by:user.id,imported_at:new Date().toISOString()},{onConflict:'season,gw'});
    if(error)throw error;
    pending=null;$('file').value='';$('preview').textContent='';message('Giornata pubblicata.');await load({season,gw:p.gw});
  }catch(e){message(e.message||String(e),true);}finally{$('file').disabled=false;$('save').disabled=!pending;}
});
$('round').addEventListener('change',()=>loadRound().catch(e=>message(e.message,true)));
$('club').addEventListener('change',render);
async function init(){
  const {data,error}=await supabase.auth.getUser();user=data?.user;
  if(error||!user){$('access').textContent='Accedi alla Lega per consultare le formazioni.';return;}
  const [a,p]=await Promise.all([supabase.from('mc_admin_users').select('user_id').eq('user_id',user.id).maybeSingle(),supabase.from('profiles').select('id').eq('id',user.id).maybeSingle()]);
  if(!a.data&&!p.data){$('access').textContent='Accesso riservato ai membri della Lega.';return;}
  $('access').hidden=true;$('workspace').hidden=false;$('admin').hidden=!a.data;await load();
}
init().catch(e=>message(e.message||String(e),true));