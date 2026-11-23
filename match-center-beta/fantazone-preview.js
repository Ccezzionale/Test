/* Lega degli Eroi • test volontario con file pubblici Fantazone.
 * NON usa endpoint Fantacalcio, non scarica il file in Supabase o sul nostro repository.
 * In anteprima soltanto: file GitHub di terzi, niente risultati ufficiali.
 */
(() => {
  'use strict';
  if (typeof DATA === 'undefined' || typeof render !== 'function' || DATA.season !== '2026/27') return;
  const snapshot = document.querySelector('.snapshot-strip');
  if (!snapshot) return;

  const CLUBS = Object.freeze({
    ATA:'Atalanta', BOL:'Bologna', CAG:'Cagliari', COM:'Como', FIO:'Fiorentina',
    FRO:'Frosinone', GEN:'Genoa', INT:'Inter', JUV:'Juventus', LAZ:'Lazio',
    LEC:'Lecce', MIL:'Milan', MON:'Monza', NAP:'Napoli', PAR:'Parma',
    ROM:'Roma', SAS:'Sassuolo', TOR:'Torino', UDI:'Udinese', VEN:'Venezia'
  });
  const safeDay = Number(DATA.gw);
  if (!Number.isInteger(safeDay) || safeDay < 1 || safeDay > 38) return;
  // 15 è la chiave interna Fantazone per la Serie A 2026/27.
  const url = 'https://raw.githubusercontent.com/KeyserDSoze/Fantazone/main/data/serie-a/votes/live/15/' + safeDay + '.json';
  const originalVotes = {...DATA.voti_certi};
  const originalCaption = snapshot.querySelector('span b')?.textContent || 'Snapshot Highlightly.';
  const originalLine = snapshot.querySelector('span:not(.update-time)')?.innerHTML || '';
  const originalStamp = snapshot.querySelector('.update-time')?.textContent || '';
  const norm = value => String(value ?? '').trim().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const index = new Map();
  for (const fixture of DATA.matches) {
    for (const team of [fixture.home, fixture.away]) {
      for (const p of team.players) {
        const club = CLUBS[String(p.club ?? '').toUpperCase()];
        if (!club) continue;
        const normalized = norm(p.name) + '|' + norm(club);
        if (!index.has(normalized)) index.set(normalized, new Set());
        index.get(normalized).add(p.name + '|' + p.club);
      }
    }
  }

  const style = document.createElement('style');
  style.textContent = '.fantazone-lab{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:0 2px 16px}.fantazone-lab button{font:800 11px system-ui,sans-serif;background:#174e5a;color:#dbfcfd;border:1px solid #61b9b9;border-radius:10px;padding:11px 13px}.fantazone-lab button:disabled{opacity:.6;cursor:wait}.fantazone-lab a{color:#92e7e9;font-size:10px}.fantazone-lab p{flex:1 1 100%;font-size:10px;line-height:1.6;color:#abc6d5;margin:0}.fantazone-lab .test-label{font-size:9px;color:#ffe2a1;font-weight:800;letter-spacing:.09em}';
  document.head.appendChild(style);
  const box = document.createElement('div');
  box.className = 'fantazone-lab';
  const badge = document.createElement('span');
  badge.className = 'test-label';
  badge.textContent = 'FONTE ALTERNATIVA · SOLO TEST';
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Prova voti Fantazone';
  const link = document.createElement('a');
  link.href = 'https://github.com/KeyserDSoze/Fantazone/blob/main/data/serie-a/votes/live/15/' + safeDay + '.json';
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Apri il file originale';
  const info = document.createElement('p');
  info.setAttribute('role','status');
  info.setAttribute('aria-live','polite');
  info.textContent = 'Carica i voti Fantacalcio pubblicati su GitHub da Fantazone, senza modificare la lega. Non è una fonte live verificata.';
  box.append(badge,button,link,info);
  const other = document.querySelector('.beta-feed-controls');
  (other || snapshot).insertAdjacentElement('afterend',box);

  const integer = (v, max=20) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
  };
  function convert(row) {
    const v = row?.vote;
    if (!v || v.hasVote !== true || v.isFinal === true) return null;
    const base = Number(v.value);
    if (!Number.isFinite(base) || base < 1 || base > 10) return null;
    const fields = ['goal','penalty','assist','stoppedPenalty','sufferedGoal','wrongedPenalty','ownGoal'];
    const counts = fields.map(key => integer(v[key],10));
    const status = integer(v.status,2);
    if (counts.some(n => n === null) || status === null) return null;
    const [goal,penalty,assists,saved,suffered,missed,own] = counts;
    const yellow = status===1?1:0, red=status===2?1:0;
    // Solo fantavoto orientativo: assist speciali, clean sheet e fattore difensivo esclusi.
    const bonus = goal*3 + penalty*3 + assists + saved*3 - suffered - missed*3 - own*2 - yellow*.5 - red;
    const fantasy = Math.round((base + bonus)*100)/100;
    if (fantasy < -12 || fantasy > 40) return null;
    return {base,bonus,fantavote:fantasy,goal:goal+penalty,assists,yellow,red,
      penalties_missed:missed,source:'Fantazone · Fantacalcio.it · voto provvisorio'};
  }

  let enabled=false, busy=false, signature='';
  function switchBack() {
    enabled=false;
    DATA.__fantazonePreviewActive = false;
    DATA.voti_certi = {...originalVotes};
    const heading = snapshot.querySelector('span b');
    if (heading) heading.textContent=originalCaption;
    const sub = snapshot.querySelector('span:not(.update-time)');
    if (sub) sub.innerHTML=originalLine;
    const stamp = snapshot.querySelector('.update-time');
    if (stamp) stamp.textContent=originalStamp;
    button.textContent='Prova voti Fantazone';
    info.textContent='Ripristinati i rating Highlightly della beta. Nessun risultato ufficiale modificato.';
    render();
  }

  async function load() {
    if (busy || document.visibilityState === 'hidden') return;
    busy=true;
    button.disabled=true;
    const wasEnabled=enabled;
    info.textContent='Lettura del file pubblico su GitHub…';
    try {
      const response = await fetch(url, {method:'GET',mode:'cors',credentials:'omit',cache:'no-store'});
      if (!response.ok) throw new Error('File GitHub non disponibile (HTTP '+response.status+').');
      const payload=await response.json();
      if (payload.year !== 15 || payload.serieADay !== safeDay ||
          !Array.isArray(payload.players) || payload.players.length<1 || payload.players.length>2000) {
        throw new Error('Stagione, giornata o elenco giocatori non validi.');
      }
      const bySource=new Map();
      const duplicates=new Set();
      for (const player of payload.players) {
        const key = norm(player?.name)+'|'+norm(player?.team?.name);
        if (!player?.name || !player?.team?.name) continue;
        if (bySource.has(key)) duplicates.add(key);
        else bySource.set(key,player);
      }
      const clubsInFeed=new Set(payload.players.map(p=>norm(p?.team?.name)).filter(Boolean));
      const missingClubs=[...new Set(Object.values(CLUBS))]
        .filter(club=>!clubsInFeed.has(norm(club)));
      const coverage=20-missingClubs.length;
      const votes={};
      let matched=0,withoutVote=0;
      for (const [key,originalKeys] of index) {
        if (duplicates.has(key) || originalKeys.size!==1) continue;
        const row=bySource.get(key);
        if (!row) continue;
        matched++;
        const converted=convert(row);
        if (!converted){withoutVote++;continue;}
        for (const oldKey of originalKeys) votes[oldKey]=converted;
      }
      if (matched < 15 || !Object.keys(votes).length) throw new Error('Troppi pochi giocatori abbinati: file non applicato.');
      const sampleSignature = JSON.stringify(votes);
      const changed=sampleSignature!==signature;
      signature=sampleSignature;
      enabled=true;
      DATA.__fantazonePreviewActive=true;
      DATA.voti_certi=votes;
      button.textContent='Ripristina Highlightly';
      const heading=snapshot.querySelector('span b');
      if (heading) heading.textContent=missingClubs.length?'Fantazone · DATI INCOMPLETI':'Fonte Fantazone (test).';
      const sub=snapshot.querySelector('span:not(.update-time)');
      if (sub) sub.innerHTML='<b>Fonte Fantazone (test).</b> Voti provvisori Fantacalcio.it, fantavoti stimati e non ufficiali.';
      const stamp=snapshot.querySelector('.update-time');
      if (stamp) stamp.textContent='G'+safeDay;
      render();
      info.textContent=(missingClubs.length
        ? 'ATTENZIONE: ARCHIVIO PARZIALE, NON LIVE AFFIDABILE. Copertura '+coverage+'/20 squadre; mancano '+missingClubs.join(', ')+'. '
        : 'Copertura 20/20 squadre (non garantisce freschezza live). ')+
        Object.keys(votes).length+' voti utilizzabili su '+matched+
        ' calciatori riconosciuti ('+withoutVote+' senza voto). '+
        (changed?'File letto':'Contenuto invariato')+' alle '+
        new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit',timeZone:'Europe/Brussels'})+
        ". Questa è l’ora del controllo, NON dell’ultimo aggiornamento Fantazone. Bonus e sostituzioni non ufficiali.";
    } catch (error) {
      info.textContent='Test non riuscito: '+(error.message||'errore sconosciuto')+
        '. '+(wasEnabled?'Rimangono i precedenti dati Fantazone.':'Restano i dati Highlightly.');
    } finally {
      busy=false;
      button.disabled=false;
    }
  }
  button.addEventListener('click',()=>enabled?switchBack():load());
  document.addEventListener('visibilitychange',()=>{
    if (enabled && document.visibilityState==='visible') load();
  });
  window.setInterval(()=>{if (enabled && document.visibilityState==='visible')load();},300000);
})();
