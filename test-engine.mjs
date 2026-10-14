import assert from 'node:assert/strict';
import {normalizeTeam,goalsFromFantasyPoints,buildModel,quoteMatch,probsToOdds} from './bookmaker-engine.js';
assert.equal(normalizeTeam('Atlètico Leon'),'atleticoleon');
assert.equal(normalizeTeam('Wildboys 78'),normalizeTeam('wildboys78'));
for(const [points,goals] of [[65.5,0],[66,1],[71.5,1],[72,2],[77.5,2],[78,3],[84,4]]) assert.equal(goalsFromFantasyPoints(points),goals);
const teams=Array.from({length:16},(_,i)=>({name:`Squadra ${i+1}`,conference:i<8?'Conference League':'Conference Championship'}));
const results=[],fixtures=[],history=[];
for(let gw=1;gw<=6;gw++)for(let i=0;i<16;i++){
  const name=teams[i].name;
  const v=72+((i+gw*2)%7-3)*2;
  results.push({phase:'Regular',gw,team:name,points_for:v,is_home:false});
}
const model=buildModel({teams,results,fixtures,history});
let m=quoteMatch(model,'Squadra 1','Squadra 2','ottavi');
assert.ok(m.p1>0 && m.px>0 && m.p2>0);
assert.ok(Math.abs(m.p1+m.px+m.p2-1)<1e-10);
const n=quoteMatch(model,'Squadra 1','Squadra 2','semi_andata');
assert.equal(n.homeBonus,2);
assert.ok(n.p1>m.p1);
assert.deepEqual(probsToOdds(50,25,25),[2,4,4]);
assert.throws(()=>probsToOdds(40,30,29),/100%/);
const fairOdds=[m.q1,m.qx,m.q2];
assert.ok(fairOdds.every(q=>q>1));
console.log('OK: test soglie gol, alias, modello, probabilita, bonus casa, quote senza margine e validazione.');
console.log('Esempio su dati sintetici:',{neutral:{p1:m.p1,px:m.px,p2:m.p2},semifinalHome:{p1:n.p1,px:n.px,p2:n.p2}});
