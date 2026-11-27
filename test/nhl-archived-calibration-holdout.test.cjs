'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluate}=require('../scripts/nhl-archived-calibration-holdout.cjs');
const tiers=['Standard','Goblin','Demon'];
function date(day){return `2026-11-${day}`;}
function evidence(day,correct=20,publishedAt=`${date(day+1)}T17:00:00Z`){
 const group={registered:40,decided:39,correct,incorrect:39-correct,push:1,pending:0,distinctGradedGames:2};
 return {publishedAt,doc:{kind:'public_original_daily_grade_v1',slateDate:date(day),rawPropRowsExposed:0,platformSettlementVerified:false,
  generatedAt:`${date(day+1)}T16:00:00Z`,nhl:{status:'official_final_slate_graded',scheduledGames:2,finalGames:2,
   statsFetchedAt:`${date(day+1)}T14:00:00Z`,ledgerBuiltAt:`${date(day+1)}T15:00:00Z`,
   byTier:Object.fromEntries(tiers.map(t=>[t,{...group}])),standardByMarket:{points:{...group}}}}};
}
function inputs(){
 const training=Object.fromEntries([14,15,16,17,18].map(n=>[date(n),evidence(n)]));
 const heldOut=Object.fromEntries([23,24,25].map(n=>[date(n),evidence(n,30)]));
 const src={kind:'public_nhl_rolling_probability_reliability_v1',target:'strict_selected_side_hit_given_resolved_stat',pushIsNonHitOnlyForProbabilityScoring:true,
  calibrated:false,platformSettlementVerified:false,modelPromoted:false,
  byTier:tiers.map(t=>({tier:t,byPacificDate:Object.entries(heldOut).map(([date,v])=>{
   const x=v.doc.nhl.byTier[t];return {date,...x,pushes:x.push,resolved:40,distinctGames:2,brier:.24,logLoss:.68};
  })}))};
 return {training,heldOut,report:{kind:'public_nhl_nfl_original_git_frozen_model_scorecards_v1',nhl:{rollingProbabilityPerformance:src}}};
}
test('fits only previously published slates and counts pushes only as strict stat non-hits',()=>{
 const x=inputs();
 x.training[date(22)]=evidence(22,39);
 const r=evaluate(x);
 assert.equal(r.trainingDates.length,5);
 assert.equal(r.trainCounts.Standard,200);
 assert.equal(r.byTier.Standard.resolved,120);
 assert.equal(r.byTier.Standard.pushes,3);
 assert.equal(r.tierProbabilities.Standard,.5);
 assert.equal(r.marketProbabilities.points,.5);
 assert.equal(r.byTier.Standard.scores.marketPrior.brier,.25);
 assert.ok(Math.abs(r.byTier.Goblin.scores.frozenOriginal.brier-.24)<1e-12);
 const day=date(25);x.heldOut[day]=evidence(25,10);
 for(const t of x.report.nhl.rollingProbabilityPerformance.byTier){
  Object.assign(t.byPacificDate.find(x=>x.date===day),{correct:10,incorrect:29});
 }
 assert.deepEqual(evaluate(x).tierProbabilities,r.tierProbabilities);
 assert.deepEqual(evaluate(x).marketProbabilities,r.marketProbabilities);
});
test('mismatched cohorts, invalid source clock, and too little prior data fail closed',()=>{
 const x=inputs();x.report.nhl.rollingProbabilityPerformance.byTier[0].byPacificDate[0].distinctGames++;
 assert.throws(()=>evaluate(x),/aggregate scores invalid/);
 const y=inputs();y.heldOut[date(24)].doc.nhl.statsFetchedAt='2026-11-22T00:00:00Z';
 assert.throws(()=>evaluate(y),/daily evidence/);
 const z=inputs();delete z.training[date(18)];
 assert.throws(()=>evaluate(z),/previously published/);
});
