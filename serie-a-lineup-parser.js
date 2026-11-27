// Read only the saved HTML MIME part; never attach source HTML to the live DOM.
export function extractHtml(raw){
  if(/^\s*(?:<!doctype html|<html)/i.test(raw))return raw;
  const sep=/\r?\n\r?\n/; const end=raw.search(sep);
  if(end<0)throw Error('Archivio MHT non riconosciuto');
  const boundary=raw.slice(0,end).match(/boundary\s*=\s*(?:"([^"]+)"|([^\s;]+))/i);
  if(!boundary)throw Error('Boundary MIME mancante');
  for(const part of raw.split('--'+(boundary[1]||boundary[2])).slice(1)){
    const pos=part.search(sep);if(pos<0)continue;
    const head=part.slice(0,pos);
    if(!/content-type:\s*text\/html\b/i.test(head))continue;
    let body=part.slice(pos+part.slice(pos).match(sep)[0].length);
    if(/content-transfer-encoding:\s*base64/i.test(head)){
      body=new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\s/g,'')),c=>c.charCodeAt(0)));
    }else if(/content-transfer-encoding:\s*quoted-printable/i.test(head)){
      body=body.replace(/=\r?\n/g,'');
      const bytes=[];for(let i=0;i<body.length;i++){
        if(body[i]==='='&&/^[0-9a-f]{2}$/i.test(body.slice(i+1,i+3))){bytes.push(parseInt(body.slice(i+1,i+3),16));i+=2;}
        else bytes.push(...new TextEncoder().encode(body[i]));
      }
      body=new TextDecoder().decode(Uint8Array.from(bytes));
    }
    if(/probabili formazioni serie a/i.test(body))return body;
  }
  throw Error('Pagina delle probabili formazioni non trovata nell’archivio');
}
const txt=(el,sel)=>el.querySelector(sel)?.textContent.trim()||'';
function player(el){
  const a=el.querySelector('a.player-name');
  const id=a?.getAttribute('href')?.match(/\/(\d+)\/?(?:[?#].*)?$/)?.[1];
  const name=a?.textContent.trim();
  if(!id||!name)throw Error('Calciatore senza ID o nome');
  return {id,name};
}
function percentage(raw){
  if(raw==null||raw==='')throw Error('Percentuale mancante');
  const n=Number(String(raw).replace('%','').replace(',','.').trim());
  if(!Number.isFinite(n)||n<0||n>100)throw Error('Percentuale non valida');
  return n;
}
export function parseLineups(raw){
  const html=extractHtml(raw);
  const template=document.createElement('template');template.innerHTML=html;
  const root=template.content;
  const gw=Number([...root.querySelectorAll('header small')].map(e=>e.textContent.match(/^\s*Giornata\s+(\d+)\s*$/i)).find(Boolean)?.[1]);
  if(!Number.isInteger(gw)||gw<1||gw>38)throw Error('Giornata non rilevata');
  const matches=[...root.querySelectorAll('.match-item')].map(m=>{
    const teams=[...m.querySelectorAll('.team-card')].map(c=>{
      const list=cls=>[...c.querySelectorAll(cls+' .player-item')].map(el=>({...player(el),role:el.querySelector('.role')?.dataset.value||'',pct:percentage(el.querySelector('[aria-valuenow]')?.getAttribute('aria-valuenow'))}));
      const starters=list('.starters'), reserves=list('.reserves');
      const name=txt(c,'.team-name'), formation=txt(c,'.team-formation');
      if(!name||!formation||starters.length!==11)throw Error('Formazione incompleta: '+name);
      return {name,formation,starters,reserves};
    });
    if(teams.length!==2)throw Error('Partita incompleta');
    const ballots=[...m.querySelectorAll('.ballots .ballot')].map(b=>[...b.querySelectorAll('.ballot-list li')].map(el=>({...player(el),pct:percentage(txt(el,'.percentage'))})));
    const statuses={};
    for(const [key,cls] of Object.entries({injured:'injureds',suspended:'suspendeds',cautioned:'cautioneds',doubt:'dubts'})){
      statuses[key]=[...m.querySelectorAll('.'+cls+' li')].filter(el=>el.querySelector('a.player-name')).map(player);
    }
    return {teams,date:txt(m,'.match-date'),updated:txt(m,'.last-update'),ballots,statuses};
  });
  const teams=matches.flatMap(m=>m.teams), ids=teams.flatMap(t=>[...t.starters,...t.reserves].map(p=>p.id));
  if(matches.length!==10||new Set(teams.map(t=>t.name)).size!==20||new Set(ids).size!==ids.length)throw Error('Giornata incompleta o duplicati: servono 10 partite e 20 squadre');
  const captured=raw.slice(0,2000).match(/^Date:\s*(.+)$/mi)?.[1];
  const capturedAt=captured?new Date(captured):new Date();
  if(!Number.isFinite(capturedAt.getTime()))throw Error('Data archivio non valida');
  return {gw,matches,captured_at:capturedAt.toISOString()};
}