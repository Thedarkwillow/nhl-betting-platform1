(function(){
 'use strict';
 const markets={sog:'Shots on goal',points:'Points',receiving_yards:'Receiving yards',receptions:'Receptions',
  rebounds:'Rebounds',assists:'Assists',threePointersMade:'3-pointers made'};
 const arms={workload:'Workload',defense:'Opponent defense',workloadDefense:'Workload + defense',matchup:'Head-to-head'};
 const metrics=['candidate','incumbent','priorEmpirical','neutral'];
 const sports=['NHL','NFL','NBA'];
 const finite=Number.isFinite;
 function rows(doc){
  if(doc?.kind!=='native_workload_matchup_research_v1'||doc.retrospective!==true||
   doc.prospective!==false||doc.untouchedHoldout!==false||doc.modelPromoted!==false||
   doc.rawRowsPublished!==0||doc.originalOffersVerified!==0||doc.thresholds!=='synthetic_incumbent_projection_floor_plus_half')return null;
  return sports.flatMap(sport=>Object.entries(doc.bySport?.[sport]?.comparison||{}).flatMap(([market,methods])=>{
   if(!Object.hasOwn(markets,market))return [];
   return Object.keys(arms).flatMap(arm=>{
    const v=methods?.[arm];
    if(!Number.isSafeInteger(v?.decisions)||v.decisions<=0||!Number.isSafeInteger(v.distinctEvents)||
     v.distinctEvents<=0||v.distinctEvents>v.decisions||!metrics.every(k=>
      finite(v.scores?.[k]?.brier)&&v.scores[k].brier>=0&&v.scores[k].brier<=1&&finite(v.scores[k].logLoss)&&v.scores[k].logLoss>=0))return [];
    return [{sport,market:markets[market],arm:arms[arm],decisions:v.decisions,events:v.distinctEvents,scores:v.scores}];
   });
  }));
 }
 function display(panel,doc){
  const results=rows(doc);
  if(!results)throw Error('unrecognized context report');
  const table=panel.querySelector('tbody'),status=panel.querySelector('[role="status"]');
  status.textContent=sports.map(s=>s+': '+(results.some(r=>r.sport===s)?'scored '+results.filter(r=>r.sport===s).length+' comparisons':'no eligible comparisons')).join(' · ');
  const tr=document.createDocumentFragment();
  for(const row of results){
   const t=document.createElement('tr');
   const pair=q=>q.brier.toFixed(4)+' / '+q.logLoss.toFixed(4);
   for(const value of [row.sport,row.market,row.arm,row.decisions,row.events,...metrics.map(k=>pair(row.scores[k]))]){
    const td=document.createElement('td');td.textContent=value;t.append(td);
   }
   tr.append(t);
  }
  table.replaceChildren(tr);
  panel.querySelector('.table-wrap').hidden=!results.length;
 }
 if(typeof module!=='undefined')module.exports={rows};
 if(typeof document==='undefined')return;
 const p=document.getElementById('nativeContextPerformance');
 if(!p)return;
 fetch('./data/native-workload-matchup-validation.json',{cache:'no-cache'}).then(x=>{
  if(!x.ok)throw Error('context report unavailable');
  return x.json();
 }).then(x=>display(p,x)).catch(()=>{p.querySelector('[role="status"]').textContent='Native context comparison unavailable.';});
})();
