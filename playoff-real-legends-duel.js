/* Dedicated mobile duel screen, real existing playoff data, never demo scores. */
(() => {
  'use strict';
  const q = new URLSearchParams(location.search);
  const stages=['wildcard','quarti','semifinali','finale'];
  const stage=stages.includes(q.get('fase'))?q.get('fase'):'wildcard';
  const labels={wildcard:'WILD CARD',quarti:'QUARTI',semifinali:'SEMIFINALI',finale:'FINALI'};
  const stageCode={WC1:'WILD CARD 1',WC2:'WILD CARD 2',WC3:'WILD CARD 3',WC4:'WILD CARD 4',
    Q1:'QUARTO 1',Q2:'QUARTO 2',Q3:'QUARTO 3',Q4:'QUARTO 4',S1:'SEMIFINALE 1',S2:'SEMIFINALE 2',
    F:'GRAN FINALE',P3:'FINALE 3° POSTO'};
  const $=id=>document.getElementById(id);
  const clean=name=>typeof stripSeed==='function'?stripSeed(name):String(name||'').replace(/^\s*\d+\s*°\s*/,'').trim();
  const hasNum=v=>v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v));
  const href=code=>'playoff-sfida.html?fase='+encodeURIComponent(stage)+'&match='+encodeURIComponent(code);
  function put(id,text){const el=$(id);if(el)el.textContent=text;}
  function update(P){
    const meta=typeof MOBILE_STAGE_META!=='undefined'?MOBILE_STAGE_META[stage]:null;
    if(!meta){put('rl-loading','Errore: fasi Playoff non disponibili.');return;}
    const matches=meta.matches.filter(m=>P[m.code]);
    if(!matches.length){put('rl-loading','Gli incontri non sono ancora disponibili.');return;}
    const requested=q.get('match');
    const index=Math.max(0,matches.findIndex(m=>m.code===requested));
    const code=matches[index].code;
    const data=P[code]||{};
    const teams=[data.home||{name:'In attesa'},data.away||{name:'In attesa'}];
    const winner=(typeof getWinnerSide==='function')?getWinnerSide(code,data):null;
    const pick=(typeof PICKS!=='undefined')?PICKS[code]:null;
    const scored=pick&&hasNum(pick.home)&&hasNum(pick.away);
    put('rl-stage-kicker','REAL LEGENDS · '+labels[stage]);
    put('rl-event-stage',labels[stage]);
    document.querySelectorAll('[data-rl-stage]').forEach(tab => { const active=tab.dataset.rlStage===stage; tab.classList.toggle('active',active); if(active) tab.setAttribute('aria-current','page'); else tab.removeAttribute('aria-current'); });
    put('rl-duel-title',stage==='finale'?(code==='F'?'GRAN FINALE':'FINALE 3° POSTO'):'DUELLO '+(index+1));
    put('rl-duel-counter',(index+1)+' / '+matches.length);
    put('rl-arena-code',stageCode[code]||code);
    put('rl-score-kicker',scored?'RISULTATO UFFICIALE':'UNA SFIDA. DUE LEGGENDE.');
    put('rl-score-left',scored?String(pick.home):'–');
    put('rl-score-right',scored?String(pick.away):'–');
    put('rl-score-middle',scored?'':'VS');
    put('rl-score-note',scored?(winner?'Il verdetto è arrivato. La leggenda continua.':'Risultato registrato'):'Una sola franchigia passerà al turno successivo.');
    ['left','right'].forEach((pos,i)=>{
      const team=teams[i];
      const name=clean(team.name)||'In attesa';
      const placeholder=!(team.seed)&&(/vincente|perdente|classificata|in attesa/i.test(name)||!team.name);
      put('rl-'+pos+'-name',name);
      put('rl-'+pos+'-seed',team.seed?'#'+team.seed+' SEED':'DA DEFINIRE');
      const side=$('rl-'+pos+'-side');
      side.style.setProperty('--rl-color',window.PlayoffRealLegends?.color(name)||'#23aaff');
      $('rl-arena').style.setProperty(i===0?'--rl-left-color':'--rl-right-color',window.PlayoffRealLegends?.color(name)||'#23aaff');
      side.classList.toggle('rl-placeholder',placeholder);
      side.classList.toggle('rl-qualificata',winner===(i===0?'home':'away'));
      side.classList.toggle('rl-eliminata',Boolean(winner)&&winner!==(i===0?'home':'away'));
      const image=$('rl-'+pos+'-image');
      const src=!placeholder?window.PlayoffRealLegends?.image(name):null;
      if(src){image.style.display='block';image.src=src;image.alt='REAL LEGEND '+name;
         image.onerror=()=>{image.style.display='none';side.classList.add('rl-placeholder')};
      }else{image.removeAttribute('src');image.style.display='none'}
      put('rl-'+pos+'-outcome',winner===(i===0?'home':'away')?(code==='F'?'🏆 CAMPIONE':'✓ QUALIFICATA'):(winner?'ELIMINATA':''));
    });
    $('rl-duel-content').hidden=false;
    $('rl-loading').hidden=true;
    $('rl-back').href='playoff.html?fase='+encodeURIComponent(stage);
    const prev=$('rl-prev'),next=$('rl-next');
    function setNav(a,i){const okay=i>=0&&i<matches.length;
      a.classList.toggle('rl-disabled',!okay);a.setAttribute('aria-disabled',String(!okay));
      if(okay)a.href=href(matches[i].code);else a.removeAttribute('href');}
    setNav(prev,index-1);setNav(next,index+1);
    const dots=$('rl-dots');dots.replaceChildren();
    matches.forEach((m,i)=>{const a=document.createElement('a');a.href=href(m.code);
      a.className='rl-dot'+(i===index?' active':'');a.setAttribute('aria-label','Vai alla sfida '+(i+1));
      if(i===index)a.setAttribute('aria-current','page');dots.appendChild(a)});
    document.title=clean(teams[0].name)+' vs '+clean(teams[1].name)+' | Playoff Lega degli Eroi';
    // Swipe only on this one duel, not on the stage selection screen.
    let start=null;const area=$('rl-arena');
    area.ontouchstart=e=>{start=e.changedTouches[0].screenX};
    area.ontouchend=e=>{if(start===null)return;const d=e.changedTouches[0].screenX-start;start=null;
      if(Math.abs(d)<65)return;const i=index+(d<0?1:-1);if(i>=0&&i<matches.length)location.href=href(matches[i].code)};
  }
  document.addEventListener('lega:playoff-rendered',e=>update(e.detail.participants));
  // Graceful if the event arrived before registration (or page is restored from bfcache).
  window.addEventListener('pageshow',()=>{
    if(typeof computeParticipants==='function' && Array.isArray(window.squadre) && window.squadre.length>=12){
      const P=computeParticipants();if(Object.keys(P).length)update(P);
    }
  });
})();
