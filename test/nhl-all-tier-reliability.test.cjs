"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit,bins}=require("../src/nhl-all-tier-reliability.cjs");
function row(id,tier,overrides={}){
 return {id,gameId:1,playerId:Number(id),market:"shotsOnGoal",line:2.5,tier,selectedSide:"Higher",
  estimatedProbability:.75,firstCaptureAt:"2026-11-14T16:00:00Z",firstResearchAt:"2026-11-14T16:01:00Z",
  firstGitCommittedAt:"2026-11-14T16:02:00Z",gameStartAt:"2026-11-14T23:00:00Z",selectionStatus:"correct",
  officialResult:"Higher",officialStat:3,...overrides};
}
function ledger(records){const counts={registered:records.length,correct:0,incorrect:0,push:0,pending:0};
 for(const r of records)counts[r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus]++;
 return {kind:"private_immutable_source_linked_nhl_selected_predictions",cohort:"explicit_original_Git_precommitted_standalone_model_directions",records,counts};}
test("three tier denominators and market diagnostics remain separate",()=>{
 const a=audit(ledger([row("1","Goblin"),row("2","Demon",{selectionStatus:"incorrect",officialResult:"Lower",officialStat:1}),
 row("3","Standard",{selectionStatus:"pending_official_player_stats",officialResult:null,officialStat:null})]));
 assert.equal(a.status,"descriptive_original_forecasts_only");
 assert.equal(a.cohorts.Goblin.overall.hitRateExcludingPushes,1);
 assert.equal(a.cohorts.Demon.byMarket.shotsOnGoal.hitRateExcludingPushes,0);
 assert.equal(a.cohorts.Standard.overall.pending,1);
 assert.equal(a.cohorts.Standard.overall.hitRateExcludingPushes,null);
 assert.equal(a.payoutAdjustedROI,null);assert.equal(a.modelPromoted,false);
});
test("push is not a loss; raw strict-hit event scoring includes push as a non-event",()=>{
 const a=audit(ledger([row("1","Standard",{estimatedProbability:.6}),row("2","Standard",{line:2,officialStat:2,officialResult:"Push",selectionStatus:"push",estimatedProbability:.6})]));
 const s=a.cohorts.Standard.overall;
 assert.equal(s.hitRateExcludingPushes,1);assert.equal(s.incorrect,0);assert.equal(s.pushes,1);
 assert.equal(s.resolvedStrictHitEventRate,.5);assert.equal(s.rawEventBrier,.26);
 assert.equal(a.cohorts.Standard.reliability.rawEventECE,.1);
});
test("rejects duplicate threshold, bad evidence and unsupported special tier side",()=>{
 const a=row("1","Goblin");
 assert.equal(audit(ledger([a,{...a,id:"other"}])).status,"invalid_repeated_or_unsupported_original");
 assert.equal(audit(ledger([{...a,selectedSide:"Lower",selectionStatus:"incorrect"}])).status,"invalid_repeated_or_unsupported_original");
 const l=ledger([a]);l.counts.correct=0;assert.equal(audit(l).status,"inconsistent_ledger_counts");
});
test("fixed bins include boundary .9 and report raw event scores without inventing pending outcomes",()=>{
 const b=bins([row("1","Demon",{estimatedProbability:.9})]);
 assert.equal(b.bins.at(-1).decided,1);assert.equal(b.rawEventECE,.1);
});
