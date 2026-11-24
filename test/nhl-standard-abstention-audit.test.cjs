"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {review}=require("../src/nhl-standard-abstention-audit.cjs");
const START="2026-11-21T20:00:00Z",CREATED="2026-11-21T04:00:00Z",
 GIT="2026-11-21T04:00:25Z",OBSERVED="2026-11-21T03:55:00Z";
function player(gameId,playerId,market="shotsOnGoal"){
 return {gameId,playerId,tier:"Standard",market,lean:"Higher",line:2.5,
  gameStartAt:START,capturedAt:OBSERVED};
}
function shadow(p,status,reason){
 return {...p,originalSide:p.lean,originalLine:p.line,status,
  reason,modelSideNeverReversed:true,platformSettlementVerified:false,
  bettingEligible:false};
}
function frame(props,shadows,{created=CREATED,first=GIT}={}){
 return {gitHistoryCount:1,firstGitCommittedAt:first,snapshot:{
  generatedAt:created,rankedProps:props.map(x=>({...x})),
  individualPropSelections:props,standardQualityShadowV2:{
   kind:"nhl_standard_market_quality_challenger_20261120_v2",
   generatedAt:created,rows:shadows}}};
}
function official(p,value){
 return {gameId:p.gameId,playerId:p.playerId,type:"skater",
  gameState:"OFF",timeOnIceSeconds:999,[p.market]:value};
}
test("NHL selected and skipped original thresholds both count, DNP remains pending",()=>{
 const p1=player(2026020401,101),p2=player(2026020402,102),
  p3=player(2026020403,103);
 const f=frame([p1,p2,p3],[shadow(p1,"shadow_selected_research_only",
  "fixed_model_agreement"),shadow(p2,"shadow_abstain",
  "no_credible_model_side_separation"),shadow(p3,"shadow_abstain",
  "unverified_or_negative_pregame_availability")]);
 const h={players:{"101":{games:[official(p1,4)]},
  "102":{games:[official(p2,0)]},"103":{games:[]}}};
 const r=review([f],h);
 a.equal(r.acceptedOriginalFrozenThresholds,3);
 a.equal(r.all.registered,3);
 a.equal(r.selected.registered,1);
 a.equal(r.abstained.registered,2);
 a.equal(r.abstained.decided,1);
 a.equal(r.abstained.pending,1);
 a.equal(r.selectedDirectionalHitRate,undefined);
 a.equal(r.selected.selectedDirectionalHitRate,1);
 a.equal(r.abstained.selectedDirectionalHitRate,0);
 a.equal(r.selectionCoverage,1/3);
 a.equal(r.selectedMinusAbstainedObservedHitRate,1);
 a.equal(r.abstentionReasons.no_credible_model_side_separation,1);
 a.equal(r.selectedWithoutPositiveGameDayParticipation,1);
 a.equal(r.selectionQualityProven,false);
 a.equal(r.calibrationApproved,false);a.equal(r.modelPromoted,false);
});
test("NHL no retrospective data, first-Git integrity or false active approvals",()=>{
 const p=player(2026020401,101),q=shadow(p,"shadow_selected_research_only");
 const good=frame([p],[q]);
 a.equal(review([frame([p],[q],{created:"2026-11-20T23:00:00Z",
  first:"2026-11-20T23:00:25Z"})],{}).all.registered,0);
 a.equal(review([{...good,gitHistoryCount:2}],{}).all.registered,0);
 a.equal(review([frame([p],[q],{first:START})],{}).all.registered,0);
 a.equal(review([good,good],{}).all.registered,1);
 const changed=frame([p],[{...q,originalLine:3.5}]);
 a.equal(review([changed],{}).unscoredOriginalThresholds,1);
 a.equal(review([frame([p],[])],{}).abstained.registered,0);
 a.equal(review([frame([p],[])],{}).unscoredOriginalThresholds,1);
});
test("NHL withheld calls do not silently become 0% losses or 100% success",()=>{
 const p=player(2026020401,101);
 const r=review([frame([p],[shadow(p,"shadow_abstain","no_matchup")])],{});
 a.equal(r.abstained.decided,0);
 a.equal(r.abstained.selectedDirectionalHitRate,null);
 a.equal(r.selected.selectedDirectionalHitRate,null);
 a.equal(r.selectionCoverage,0);
 a.equal(r.selectedMinusAbstainedObservedHitRate,null);
 a.equal(r.verifiedPayoutEV,null);
});

test("kept vs skipped comparison is paired by Pacific slate, not picked from other days",()=>{
 const {selectedVsSkippedSlates}=require("../src/nhl-standard-abstention-audit.cjs");
 const kept={slateHits:new Map()},skip={slateHits:new Map()};
 for(let i=1;i<=12;i++){
  const date="2026-12-"+String(i).padStart(2,"0");
  kept.slateHits.set(date,{n:2,hits:2});
  skip.slateHits.set(date,{n:3,hits:0});
 }
 const o=selectedVsSkippedSlates(kept,skip);
 a.equal(o.overlappingPacificSlates,12);
 a.equal(o.observedLiftOnSharedSlates,1);
 a.equal(o.pairedSlate95.lower,1);
 a.equal(o.pairedSlate95.upper,1);
 a.equal(o.minimumSharedSlateCountMet,false);
 a.equal(o.confidenceApproved,false);
 skip.slateHits=new Map([["2026-11-30",{n:10,hits:0}]]);
 const noMatch=selectedVsSkippedSlates(kept,skip);
 a.equal(noMatch.overlappingPacificSlates,0);
 a.equal(noMatch.pairedSlate95,null);
});
