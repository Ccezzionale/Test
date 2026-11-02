/* PLAYOFF REAL LEGENDS — mobile match index.
   Converts EXISTING match card output to separate match-route links; doesn't alter
   playoff score/seed/winner logic or desktop board. */
(() => {
  'use strict';
  const meta = {
    WC1:'WILD CARD · 1', WC2:'WILD CARD · 2', WC3:'WILD CARD · 3', WC4:'WILD CARD · 4',
    Q1:'QUARTI · 1', Q2:'QUARTI · 2', Q3:'QUARTI · 3', Q4:'QUARTI · 4',
    S1:'SEMIFINALE · 1',S2:'SEMIFINALE · 2', P3:'FINALE 3° POSTO',F:'GRAN FINALE'
  };
  const stageFromCode = c => c.startsWith('WC')?'wildcard':c.startsWith('Q')?'quarti':c.startsWith('S')?'semifinali':'finale';
  function add(tag, className, text) {
    const node=document.createElement(tag);
    if(className)node.className=className;
    if(text!==undefined)node.textContent=text;
    return node;
  }
  function visual(name, side, placeholder) {
    const wrap=add('span','rl-fixture-art rl-fixture-art--'+side+(placeholder?' is-placeholder':''));
    wrap.style.setProperty('--rl-team-color',window.PlayoffRealLegends?.color(name)||'#36bfff');
    if(!placeholder) {
      const url=window.PlayoffRealLegends?.image(name);
      if(url){
        const img=add('img');img.src=url;img.alt='';img.loading='lazy';img.decoding='async';
        img.addEventListener('error',()=>{img.remove();wrap.classList.add('is-placeholder')},{once:true});
        wrap.appendChild(img);
      } else wrap.classList.add('is-placeholder');
    }
    return wrap;
  }
  function transform(card){
    const sides=Array.from(card.querySelectorAll('.mobile-team-side'));
    if(sides.length!==2)return;
    const code=card.getAttribute('data-mobile-match')||'';
    const stage=stageFromCode(code);
    const a=add('a','rl-fixture');
    a.href='playoff-sfida.html?fase='+encodeURIComponent(stage)+'&match='+encodeURIComponent(code);
    a.setAttribute('aria-label','Apri la sfida '+(meta[code]||code));
    const teams=sides.map(s=>({
      name:s.querySelector('.mobile-team-name')?.textContent?.trim()||'In attesa',
      seed:s.querySelector('.mobile-seed')?.textContent?.trim()||'',
      placeholder:s.classList.contains('is-placeholder'),
      winner:s.classList.contains('is-winner')
    }));
    a.append(visual(teams[0].name,'left',teams[0].placeholder));
    const center=add('span','rl-fixture-center');
    center.appendChild(add('span','rl-fixture-number',meta[code]||code));
    const label=add('span','rl-fixture-versus');
    label.append(add('span','rl-team-name rl-team-left',teams[0].name),add('em','rl-vs-text','VS'),add('span','rl-team-name rl-team-right',teams[1].name));
    center.appendChild(label);
    const score=card.querySelector('.mobile-vs-pill');
    const scoreText=score?.textContent?.trim()||'VS';
    let note='APRI L’ARENA DELL’INCONTRO';
    if(score?.classList.contains('has-score'))note='RISULTATO · '+scoreText;
    else if(teams.some(x=>x.placeholder))note='IN ATTESA DEGLI ACCOPPIAMENTI';
    center.appendChild(add('span','rl-fixture-subline',note));
    a.append(center,visual(teams[1].name,'right',teams[1].placeholder),add('span','rl-fixture-arrow','›'));
    a.classList.toggle('is-decided',teams.some(x=>x.winner));
    card.replaceWith(a);
  }
  function enhance(){
    const root=document.querySelector('#mobile-stage-content');if(!root)return;
    const cards=root.querySelectorAll('.mobile-match-card');
    cards.forEach(transform);
    const title=root.querySelector('.mobile-stage-title-row');
    if(title)title.classList.add('rl-stage-heading');
    document.querySelectorAll('.stage-tab').forEach(t=>t.setAttribute('aria-selected',t.classList.contains('active')?'true':'false'));
  }
  function init(){
    const root=document.querySelector('#mobile-stage-content');if(!root)return;
    const observer=new MutationObserver(enhance);
    observer.observe(root,{childList:true,subtree:false});
    enhance();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
