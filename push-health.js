import { supabase } from './supabase.js';

const key = id => 'lega.push.optout.v1.' + id;
const memory = new Map();
export function optedOut(id) {
  try { return localStorage.getItem(key(id)) === '1' || memory.get(id) === true; }
  catch { return memory.get(id) === true; }
}
export function setPushOptOut(id, off) {
  if (!id) return;
  memory.set(id, off);
  try { if (off) localStorage.setItem(key(id),'1'); else localStorage.removeItem(key(id)); } catch {}
  window.dispatchEvent(new Event('lega-push-changed'));
}
// Two notification UIs can ask for a check simultaneously. Serialize checks.
let tail = Promise.resolve();
export function queuePushCheck(fn) {
  const next = tail.then(fn,fn);
  tail = next.catch(()=>{});
  return next;
}
export async function pushRegistration() {
  let timer;
  try {
    return await Promise.race([navigator.serviceWorker.ready,new Promise((_,reject)=>{
      timer=setTimeout(()=>reject(new Error('Service worker non pronto')),8000);
    })]);
  } finally { clearTimeout(timer); }
}
let device;
function deviceId() {
  if (device) return device;
  try { device=localStorage.getItem('lega.push.device.v1'); if (!device) { device=crypto.randomUUID(); localStorage.setItem('lega.push.device.v1',device); } }
  catch { device=crypto.randomUUID(); }
  return device;
}
function deviceKind() {
  const ua=navigator.userAgent||'';
  if (/iPad|iPhone|iPod/i.test(ua)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  return 'Desktop';
}
async function invoke(body) {
  const {data,error}=await supabase.functions.invoke('push-health',{body});
  if (error) {
    let detail;
    try { detail=(await error.context?.json())?.error; } catch {}
    throw Error(detail||error.message||'Diagnostica non disponibile');
  }
  if (data?.error) throw Error(data.error);
  return data;
}
const labels={
  active:'Registrazione attiva', 'repair-needed':'Registrazione da riparare',
  'check-error':'Verifica non riuscita', 'permission-denied':'Permessi bloccati',
  'permission-default':'Permessi non concessi', 'local-missing':'Registrazione assente',
  unsupported:'Browser non supportato', 'opted-out':'Disattivate volontariamente'
};
const validStates=new Set(Object.keys(labels));
let started=false, running=false, lastRun=0, lastReport='', lastReportTime=0, adminMounted=false, lastState='';
const stamp = date => date ? new Date(date).toLocaleString('it-IT',{dateStyle:'short',timeStyle:'short'}) : 'Mai';
function el(tag,text,style) {
  const n=document.createElement(tag); if(text!==undefined)n.textContent=text;
  if(style)n.style.cssText=style; return n;
}
function renderBanner(state,api) {
  // Home only; both responsive versions use the same shell.
  const main=document.querySelector('main.shell');
  let banner=document.getElementById('lega-push-health-banner');
  if (!main) return;
  if (!['permission-denied','permission-default','local-missing','repair-needed','check-error'].includes(state)) { banner?.remove();return; }
  if (!banner) {
    banner=el('aside',undefined,'margin:12px 0;padding:13px 15px;border:1px solid #e2b45a;border-radius:13px;background:#fff7e7;color:#172b45;display:flex;gap:10px;align-items:center;flex-wrap:wrap;font:inherit;text-align:left');
    banner.id='lega-push-health-banner';banner.setAttribute('role','status');
    main.prepend(banner);
  }
  const copy=el('div',undefined,'flex:1 1 190px');
  copy.append(el('strong',state==='check-error'?'🔔 Notifiche da controllare':'🔔 Notifiche push non attive','display:block;font-size:14px'));
  const note=state==='permission-denied'?'Riabilita le notifiche nelle impostazioni del telefono o del browser, poi torna nell’app.':state==='check-error'?'Non siamo riusciti a verificare la registrazione. Riprova.':'Potresti perdere aggiornamenti su waiver, mercato e scambi.';
  copy.append(el('small',note,'display:block;margin-top:4px;line-height:1.4;color:#42536a'));
  const action=el('button',state==='permission-denied'||state==='check-error'?'Ricontrolla':'Riattiva notifiche','border:0;border-radius:9px;padding:10px 13px;font:600 13px inherit;font-family:inherit;background:#192c48;color:white;cursor:pointer');
  action.type='button';
  action.onclick=async()=>{action.disabled=true;try{if(!['permission-denied','check-error'].includes(state))await api.enable();await run(true);}catch(err){alert(err.message||'Controllo non riuscito');}finally{action.disabled=false;}};
  banner.replaceChildren(copy,action);
}
async function run(force=false) {
  if(running||document.hidden||(!force&&Date.now()-lastRun<60000))return;
  const api=window.LegaPush;
  if(!api?.check)return;
  running=true;lastRun=Date.now();
  try {
    let state;
    try { state=(await api.check({autoRepair:true})).status; } catch { state='check-error'; }
    renderBanner(state,api);
    if (state!==lastState) { lastState=state; window.dispatchEvent(new CustomEvent('lega-push-health-state',{detail:state})); }
    if (validStates.has(state)) {
      const {data:{user}}=await supabase.auth.getUser();
      if(user){
        const reportKey=user.id+':'+state;
        if(reportKey!==lastReport||Date.now()-lastReportTime>=5*60*1000){
          try {await invoke({action:'report',device_id:deviceId(),device_kind:deviceKind(),status:state});lastReport=reportKey;lastReportTime=Date.now();}catch(e){console.warn('Push Health:',e.message);}
        }
      }
    }
    // Repaint existing bell/footer; do not change notification delivery.
    if (force) await api.refreshButton?.();
  } finally {running=false;}
}
export function startPushHealth() {
  if(started)return;
  started=true;
  const onReturn=()=>{if(!document.hidden)void run().catch(console.warn);};
  document.addEventListener('visibilitychange',onReturn);
  window.addEventListener('focus',onReturn);
  window.addEventListener('pageshow',onReturn);
  window.addEventListener('online',onReturn);
  window.addEventListener('lega-push-changed',()=>{setTimeout(()=>void run(true).catch(console.warn),250);});
  void run(true).catch(console.warn);
}
export function mountPushHealthAdmin(composer) {
  if(!composer||adminMounted)return;
  adminMounted=true;
  const panel=el('details',undefined,'margin:14px 0;padding:12px;border:1px solid #cbd5e1;border-radius:12px;background:#fff;color:#172b45;');
  panel.append(el('summary','🔔 Push Health · Monitoraggio allenatori','font-weight:700;cursor:pointer;'));
  const help=el('p','Stato dell’ultima verifica per dispositivo; le registrazioni attive non garantiscono la visualizzazione sul telefono. I test sono individuali.','font-size:12px;line-height:1.4;margin:10px 0;');
  const refresh=el('button','Aggiorna','padding:7px 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#172b45;cursor:pointer;');
  refresh.type='button';
  const status=el('p','','font-size:12px;margin:6px 0;');
  const list=el('div',undefined,'max-height:340px;overflow:auto;display:grid;gap:7px;');
  panel.append(help,refresh,status,list);
  let busy=false;
  async function load(){
    if(busy)return;busy=true;refresh.disabled=true;status.textContent='Caricamento…';
    try {
      const data=await invoke({action:'list'});list.replaceChildren();
      const accounts=data.accounts||[];
      status.textContent=accounts.length+' account · '+accounts.filter(a=>a.active===0).length+' senza registrazioni attive';
      for(const a of accounts.sort((x,y)=>(x.active>0)-(y.active>0)||x.team.localeCompare(y.team))){
        const card=el('article',undefined,'border:1px solid #e2e8f0;padding:9px;border-radius:9px;overflow-wrap:anywhere;');
        card.append(el('strong',a.team+' · '+(a.active?'registrate: '+a.active:'nessuna attiva'),'font-size:13px;color:'+(a.active?'#166534':'#b91c1c')+';display:block'));
        card.append(el('small',a.email+' · '+a.inactive+' inattive','font-size:11px;display:block;'));
        if(!a.devices.length)card.append(el('small','Nessun controllo del dispositivo ancora registrato','display:block;font-size:11px;color:#64748b;margin-top:4px;'));
        for(const d of a.devices.slice(0,8))card.append(el('small',d.device_kind+' · '+(labels[d.status]||d.status)+' · '+stamp(d.checked_at),'display:block;margin-top:3px;font-size:11px;'));
        if(a.devices.length>8)card.append(el('small','Altri '+(a.devices.length-8)+' controlli storici','font-size:11px;'));
        const t=a.last_test;
        if(t)card.append(el('small','Ultimo test '+stamp(t.requested_at)+': '+(t.completed_at?t.accepted+' accettate / '+t.failed+' fallite ('+t.expired+' scadute)':'esito non ancora registrato'),'display:block;margin-top:5px;font-size:11px;'));
        const test=el('button','Invia push di prova','margin-top:7px;padding:6px 10px;border:0;border-radius:7px;background:#192c48;color:white;font:inherit;font-size:12px;cursor:pointer;');
        test.type='button';test.disabled=!a.active;
        test.onclick=async()=>{if(!confirm('Inviare una push di prova soltanto a '+a.team+' ('+a.email+')?'))return;test.disabled=true;try{const r=await invoke({action:'test',target_user_id:a.id});alert(r.accepted+' accettate dal provider · '+r.failed+' fallite. Verificare sul telefono.');await load();}catch(e){alert(e.message);}finally{test.disabled=!a.active;}};
        card.append(test);list.append(card);
      }
    } catch(e){status.textContent=e.message||'Monitoraggio non disponibile';}
    finally{busy=false;refresh.disabled=false;}
  }
  panel.addEventListener('toggle',()=>{if(panel.open)void load();});
  refresh.onclick=()=>void load();
  composer.append(panel);
}
