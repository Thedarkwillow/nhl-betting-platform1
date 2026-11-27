(function(){
 'use strict';
 const markets={sog:'Shots on goal',shotsOnGoal:'Shots on goal',points:'Points',receiving_yards:'Receiving yards',receptions:'Receptions',
  rebounds:'Rebounds',assists:'Assists',threePointersMade:'3-pointers made'};
 const arms={workload:'Workload',defense:'Opponent defense',workloadDefense:'Workload + defense',matchup:'Head-to-head'};
 const metrics=['candidate','incumbent','priorEmpirical','neutral'];
 const sports=['NHL','NFL','NBA'];
 const finite=Number.isFinite;
 const validScore=q=>finite(q?.brier)&&q.brier>=0&&q.brier<=1&&finite(q.logLoss)&&q.logLoss>=0;
 function rows(doc){
  if(doc?.kind!=='native_workload_matchup_research_v1'||doc.retrospective!==true||
   doc.prospective!==false||doc.untouchedHoldout!==false||doc.modelPromoted!==false||
   doc.rawRowsPublished!==0||doc.originalOffersVerified!==0||doc.thresholds!=='synthetic_incumbent_projection_floor_plus_half')return null;
  return sports.flatMap(sport=>Object.entries(doc.bySport?.[sport]?.comparison||{}).flatMap(([market,methods])=>{
   if(!Object.hasOwn(markets,market))return [];
   return Object.keys(arms).flatMap(arm=>{
    const v=methods?.[arm];
    if(!Number.isSafeInteger(v?.decisions)||v.decisions<=0||!Number.isSafeInteger(v.distinctEvents)||
     v.distinctEvents<=0||v.distinctEvents>v.decisions||!metrics.every(k=>validScore(v.scores?.[k])))return [];
    return [{sport,market:markets[market],arm:arms[arm],decisions:v.decisions,events:v.distinctEvents,scores:v.scores}];
   });
  }));
 }
 function gameEqualText(v){
  const x=v?.gameEqualComparison;
  if(x?.method!=='equal_game_paired_v1'||x.researchOnly!==true||x.productionApproved!==false||
   x.distinctGames!==v.distinctGames||x.decisionCount!==v.decisions||!finite(x.delta?.brier)||
   Math.abs(x.delta.brier)>1||!finite(x.delta?.logLoss))return 'Unavailable';
  const d=n=>(Object.is(n,-0)||Math.abs(n)<.00005?0:n).toFixed(4);
  const ci=x.uncertainty?.brier;
  const fits=x.distinctGames>=30&&Array.isArray(ci)&&ci.length===2&&ci.every(finite)&&ci[0]<=x.delta.brier&&x.delta.brier<=ci[1];
  return d(x.delta.brier)+' / '+d(x.delta.logLoss)+(fits?' · Brier interval '+ci.map(d).join(' to '):' · Brier interval withheld');
 }
 function prospectiveRows(sport,doc,now=Date.now()){
  if(!sports.includes(sport)||doc?.modelApproved!==false||doc.paidRequests!==0||
   !(Date.parse(doc.generatedAt)<=now))return null;
  const nba=sport==='NBA';
  if(nba?(doc.schema!=='pickfinder_public_research_health_v1'||doc.prospectiveComparisonEvidence!=='first_git_forecast_and_official_grade_v1'):
   (doc.kind!=='pickfinder_nhlnfl_reviewed_history_performance_v1'||doc.retrospective!==false||doc.productionChanged!==false))return null;
  return Object.entries(nba?doc.prospectiveComparisons||{}:doc.bySport?.[sport]||{}).flatMap(([market,item])=>{
   if(!Object.hasOwn(markets,market)||nba&&item?.approved!==false)return [];
   return Object.entries(arms).flatMap(([arm,label])=>{
    const v=item?.nativeContextFeatureComparison?.[arm];
    if(!Number.isSafeInteger(v?.decisions)||v.decisions<=0||!Number.isSafeInteger(v.distinctGames)||
     v.distinctGames<=0||v.distinctGames>v.decisions||!metrics.every(k=>validScore(v.scores?.[k])))return [];
    return [{sport,market:markets[market],arm:label,decisions:v.decisions,events:v.distinctGames,scores:v.scores,gameEqual:gameEqualText(v)}];
   });
  });
 }
 function display(panel,results,statusText){
  if(!results)throw Error('unrecognized context report');
  const table=panel.querySelector('tbody'),status=panel.querySelector('[role="status"]');
  status.textContent=statusText||sports.map(s=>s+': '+(results.some(r=>r.sport===s)?'scored '+results.filter(r=>r.sport===s).length+' comparisons':'no eligible comparisons')).join(' · ');
  const tr=document.createDocumentFragment();
  for(const row of results){
   const t=document.createElement('tr');
   const pair=q=>q.brier.toFixed(4)+' / '+q.logLoss.toFixed(4);
   const values=[row.sport,row.market,row.arm,row.decisions,row.events,...metrics.map(k=>pair(row.scores[k]))];
   if(panel.id==='nativeContextProspective')values.push(row.gameEqual);
   for(const value of values){
    const td=document.createElement('td');td.textContent=value;t.append(td);
   }
   tr.append(t);
  }
  table.replaceChildren(tr);
  panel.querySelector('.table-wrap').hidden=!results.length;
 }
 if(typeof module!=='undefined')module.exports={rows,prospectiveRows};
 if(typeof document==='undefined')return;
 async function get(name){
  const x=await fetch('./data/'+name,{cache:'no-cache'});
  if(!x.ok)throw Error('context report unavailable');
  return x.json();
 }
 const p=document.getElementById('nativeContextPerformance');
 if(p)get('native-workload-matchup-validation.json').then(x=>display(p,rows(x))).catch(()=>{p.querySelector('[role="status"]').textContent='Native context comparison unavailable.';});
 const q=document.getElementById('nativeContextProspective');
 if(q)Promise.allSettled([get('pickfinder-reviewed-history-performance.json'),get('pickfinder-public-research-health.json')]).then(([nhlnfl,nba])=>{
  const valid=sports.map(s=>{const d=(s==='NBA'?nba:nhlnfl).value;return {sport:s,results:prospectiveRows(s,d),at:d?.generatedAt};});
  const status=valid.map(({sport,results,at})=>sport+': '+(results===null?'report unavailable':(results.length?'scored '+results.length+' comparisons':'no eligible graded pairs')+' · through '+new Date(at).toLocaleString())).join(' · ');
  display(q,valid.flatMap(x=>x.results||[]),status);
 });
})();
