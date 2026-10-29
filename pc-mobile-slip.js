/* V9.7 mobile slip: visual summary only. Official picks and submission stay in existing modules. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const init=()=>{
    const shell=$('pc-mobile-slip'),trigger=$('pc-mobile-slip-trigger'),sheet=$('pc-mobile-slip-sheet');
    const subtitle=$('pc-mobile-slip-subtitle'),count=$('pc-mobile-slip-count'),list=$('pc-mobile-slip-picks');
    const note=$('pc-mobile-slip-note'),jump=$('pc-mobile-slip-jump');
    if(!shell||!trigger||!sheet)return;
    let pending=false;
    const text=el=>(el?.textContent||'').replace(/\s+/g,' ').trim();
    const inOfficial=()=>!$('pc-official')?.hidden;
    const pickRows=()=>{
      const official=inOfficial(),scope=official?$('pc-official-matches'):$('pc-match-list');
      const rows=[];
      for(const card of scope?.querySelectorAll('.pc-game')||[]){
        const selected=card.querySelector('.pc-odd.selected');
        if(!selected)continue;
        const teams=[...card.querySelectorAll('.pc-game-teams strong')].map(text);
        rows.push({label:`${teams[0]||'Squadra 1'} · ${teams[1]||'Squadra 2'}`,value:text(selected.querySelector('span'))+' · '+text(selected.querySelector('strong'))});
      }
      const selected=official?$('pc-official-player-selected'):$('pc-demo-player-selected');
      for(const chip of selected?.querySelectorAll('.pc-picker-chip')||[]){
        const label=text(chip.querySelector('span'));
        if(label)rows.push({label,value:'⚽'});
      }
      return rows;
    };
    const close=()=>{sheet.hidden=true;trigger.setAttribute('aria-expanded','false');trigger.querySelector('.pc-mobile-slip-arrow').textContent='⌃';};
    const sync=()=>{
      pending=false;
      const app=$('pc-app'),tab=$('pc-tab-schedina'),visible=!!app&&!app.hidden&&!!tab&&tab.classList.contains('active');
      shell.hidden=!visible;
      if(!visible){close();return;}
      const official=inOfficial(),rows=pickRows();
      count.textContent=`${rows.length}/8`;
      subtitle.textContent=official?`${rows.length} pronostici selezionati · ufficiale`:`${rows.length} pronostici selezionati · prova`;
      note.textContent=official?'Rivedi le scelte; la consegna avviene soltanto dal pulsante ufficiale.':'Simulazione: queste scelte non vengono inviate o salvate.';
      list.replaceChildren();
      if(!rows.length){const li=document.createElement('li');li.textContent='Non hai ancora selezionato pronostici.';list.append(li);}
      for(const row of rows){const li=document.createElement('li'),label=document.createElement('span'),value=document.createElement('strong');label.textContent=row.label;value.textContent=row.value;li.append(label,value);list.append(li);}
      jump.textContent=official?'Vai al riepilogo e alla consegna':'Vai al riepilogo della simulazione';
    };
    const schedule=()=>{if(pending)return;pending=true;requestAnimationFrame(sync)};
    trigger.addEventListener('click',()=>{
      if(shell.hidden)return;
      if(!sheet.hidden){close();return;}
      sync();sheet.hidden=false;trigger.setAttribute('aria-expanded','true');trigger.querySelector('.pc-mobile-slip-arrow').textContent='⌄';
    });
    jump.addEventListener('click',()=>{
      const target=inOfficial()?$('pc-official-count'):$('pc-demo-points');
      close();target?.scrollIntoView({behavior:'smooth',block:'center'});
    });
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!sheet.hidden){close();trigger.focus();}});
    document.addEventListener('click',event=>{if(!shell.contains(event.target)&&!sheet.hidden)close();},true);
    const observed=['pc-app','pc-tabs','pc-progress','pc-official','pc-official-count','pc-official-matches','pc-match-list','pc-official-player-selected','pc-demo-player-selected'];
    for(const id of observed){const el=$(id);if(el)new MutationObserver(schedule).observe(el,{attributes:true,attributeFilter:['hidden','class'],childList:true,characterData:true,subtree:true});}
    schedule();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
