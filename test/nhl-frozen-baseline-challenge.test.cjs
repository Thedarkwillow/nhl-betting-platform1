"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evaluate,paired,seededCluster95,rowValid}=require("../src/nhl-frozen-baseline-challenge.cjs");
const capture="2026-11-08T18:00:00Z",model="2026-11-08T18:02:00Z",
 commit="2026-11-08T18:03:00Z",start="2026-11-09T00:00:00Z";
function record(i,{side="Higher",actual="Higher",tier="Standard",gameId=1000,
 firstGitCommittedAt=commit,market="shotsOnGoal"}={}){
 const line=2.5,stat=actual==="Higher"?4:actual==="Lower"?1:2.5;
 return {id:"orig-"+i,playerId:10000+i,gameId,market,
  line,tier,selectedSide:side,estimatedProbability:0.7,team:"BOS",
  opponent:"NYR",firstCaptureAt:capture,firstResearchAt:model,
  firstGitCommittedAt,gameStartAt:start,
  selectionStatus:actual==="Push"?"push":side===actual?"correct":"incorrect",
  officialResult:actual,officialStat:stat};
}
function ledger(rows){const counts={registered:rows.length,correct:0,incorrect:0,push:0,pending:0};
for(const r of rows)counts[r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus]++;
return {kind:"private_immutable_source_linked_nhl_selected_predictions",
cohort:"explicit_original_Git_precommitted_standalone_model_directions",
counts,records:rows};}
test("same-line benchmark shows exactly the correct paired disagreements without moving outcomes",()=>{
 const l=ledger([record(1,{side:"Higher",actual:"Higher"}),
  record(2,{side:"Lower",actual:"Lower"}),record(3,{side:"Lower",actual:"Higher"}),
  record(4,{tier:"Goblin"}),record(5,{tier:"Demon",actual:"Lower"}),
  record(6,{actual:"Push"})]);
 const r=evaluate(l,{baselinePolicyGitCommittedAt:"2026-11-08T18:01:00Z"});
 assert.equal(r.evidenceValid,true);
 const s=r.historicalSameSelectedLines.standardDirectional;
 assert.equal(s.observedSelected,4);assert.equal(s.decided,3);
 assert.equal(s.modelWins,2);assert.equal(s.alwaysHigherWins,2);
 assert.equal(s.alwaysLowerWins,1);assert.equal(s.pushes,1);
 assert.equal(s.modelMinusAlwaysHigher,0);
 assert.equal(s.modelWinsHigherLoses,1);
 assert.equal(s.modelLosesHigherWins,1);
 assert.equal(r.historicalSameSelectedLines.goblinHigherOnly.decided,1);
 assert.equal(r.historicalSameSelectedLines.demonHigherOnly.decided,1);
 assert.equal(r.originalPlatformSettlementVerified,false);
 assert.equal(r.bettingEdgeEstablished,false);
 assert.equal(r.payoutAdjustedEV,null);
});
test("future-only part never treats pre-policy picks as preregistered benchmark",()=>{
 const earlier=record(10,{firstGitCommittedAt:"2026-11-08T17:59:00Z"});
 earlier.firstCaptureAt="2026-11-08T17:00:00Z";
 earlier.firstResearchAt="2026-11-08T17:02:00Z";
 const later=record(11,{side:"Lower",actual:"Lower"});
 const d=evaluate(ledger([earlier,later]),{
  baselinePolicyGitCommittedAt:"2026-11-08T18:01:00Z"});
 assert.equal(d.historicalSameSelectedLines.allFrozenSelections.decided,2);
 assert.equal(d.postPolicySameSelectedLines.standardDirectional.decided,1);
 assert.equal(d.postPolicyGameClusterModelMinusHigher95.interval95,null);
 const noStamp=evaluate(ledger([earlier,later]));
 assert.equal(noStamp.predeclaredComparisonAtModelFreezeVerified,false);
 assert.equal(noStamp.postPolicySameSelectedLines.standardDirectional.decided,0);
});
test("duplicate IDs, contradicting results and missing first-Git proof fail closed",()=>{
 const a=record(2);
 assert.equal(evaluate(ledger([a,{...a}])).evidenceValid,false);
 assert.equal(evaluate(ledger([{...a,officialResult:"Lower"}])).evidenceValid,false);
 assert.equal(evaluate(ledger([{...a,firstGitCommittedAt:start}])).evidenceValid,false);
 assert.equal(evaluate(ledger([{...a,firstResearchAt:null}])).evidenceValid,false);
 assert.equal(evaluate(ledger([{...a,selectionStatus:"correct",officialStat:1}])).evidenceValid,false);
 const mismatched=ledger([a]);mismatched.counts.correct=0;
 assert.equal(evaluate(mismatched).status,"source_ledger_status_count_mismatch");
 assert.equal(evaluate(null).status,"missing_original_frozen_precommit_ledger");
});
test("whole-second Git dates accept only same-second original research, never a prior second",()=>{
 const original=record(51);
 original.firstResearchAt="2026-11-08T18:03:00.750Z";
 original.firstGitCommittedAt="2026-11-08T18:03:00Z";
 assert.equal(rowValid(original),true);
 const earlier={...original,firstGitCommittedAt:"2026-11-08T18:02:59Z"};
 assert.equal(rowValid(earlier),false);
 const preciseEarly={...original,firstGitCommittedAt:"2026-11-08T18:03:00.100Z"};
 assert.equal(rowValid(preciseEarly),false);
 const afterStart={...original,firstGitCommittedAt:start};
 assert.equal(rowValid(afterStart),false);
});

test("pushes are not wins or losses and pending official results remain pending",()=>{
 const pending=record(6);pending.selectionStatus="pending_official_player_stats";
 pending.officialResult=null;pending.officialStat=null;
 assert.equal(rowValid(pending),true);
 const v=paired([record(7,{side:"Lower",actual:"Push"}),pending]);
 assert.equal(v.decided,0);assert.equal(v.pushes,1);assert.equal(v.ungraded,1);
 assert.equal(v.modelHitRate,null);
});
test("game cluster interval requires distinct games, sufficient Standard decisions and actual Lower choices",()=>{
 const rows=[];
 for(let game=0;game<30;game++)for(let j=0;j<8;j++){
  const i=game*8+j;
  rows.push(record(i,{gameId:3000+game,side:j===0?"Lower":"Higher",
   actual:j===0?"Lower":"Higher"}));
 }
 const a=seededCluster95(rows,{samples:1000});
 assert.equal(a.status,"preliminary_cluster_interval_computed");
 assert.ok(a.interval95.lower>0);
 assert.equal(seededCluster95(rows.slice(0,16)).interval95,null);
 const sameGame=rows.map(r=>({...r,gameId:9999}));
 assert.equal(seededCluster95(sameGame).interval95,null);
 const noFlips=rows.map(r=>({...r,selectedSide:"Higher",
  selectionStatus:r.officialResult==="Higher"?"correct":"incorrect"}));
 assert.equal(seededCluster95(noFlips).interval95,null);
});
