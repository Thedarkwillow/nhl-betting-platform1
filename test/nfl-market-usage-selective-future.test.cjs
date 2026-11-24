"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {assess,summarize,KIND}=require("../src/nfl-market-usage-selective-future-v1.cjs");
const now="2026-11-20T12:00:00Z",base={
 id:"nfl-1",tier:"Standard",market:"receiving_yards",line:40.5,
 selectedSide:"Higher",offeredSide:"Higher",autoPickEligible:false,probability:null,
 priorRecordedGames:20,historicalProjection:56,last5Baseline:50,
 sourceObservedAt:"2026-11-20T11:55:00Z",eventStartsAt:"2026-11-22T18:00:00Z",
 authenticatedPrizePicksAppQuote:false
},originalAssessment={status:"directional_candidate_research_only"};
test("NFL market-specific pregame volume shadow is fixed and research-only",()=>{
 const x=assess(base,{now,originalAssessment});
 a.equal(x.kind,KIND);a.equal(x.status,"selective_future_research_candidate_only");
 a.equal(x.bettingEligible,false);a.equal(x.verifiedPreKickoffParticipation,false);
 a.equal(assess({...base,historicalProjection:46},{now,originalAssessment}).reason,
  "market_specific_projection_margin_unconvincing");
 a.equal(assess({...base,last5Baseline:42},{now,originalAssessment}).reason,
  "recent_usage_baseline_does_not_confirm_margin");
 a.equal(assess({...base,priorRecordedGames:3},{now,originalAssessment}).reason,
  "insufficient_recent_player_opportunity_history");
});
test("NFL unsupported combo/kicking never implicitly enters a verified market",()=>{
 a.equal(assess({...base,market:"field_goals_made"},{now,originalAssessment}).reason,
  "unsupported_or_unverified_usage_market_including_kicking_and_combo");
 a.equal(assess({...base,market:"pass_rush_yards"},{now,originalAssessment}).status,"abstain");
 a.equal(assess(base,{now,originalAssessment:{status:"abstain"}}).reason,
  "existing_future_v2_abstention");
 a.equal(assess({...base,sourceObservedAt:"2026-11-19T00:00:00Z"},{now,originalAssessment}).status,"abstain");
 a.equal(assess({...base,offeredSide:"Lower"},{now,originalAssessment}).status,"abstain");
});
test("same-line NFL Lower baseline requires multiple games and dates; no EV claim",()=>{
 const rows=Array.from({length:12},(_,i)=>({
  status:"decided",correct:i<8,actualSide:i<7?"Higher":"Lower",
  officialGameId:"game"+i,gameDay:"2026-11-"+String(i+1).padStart(2,"0")
 }));
 const x=summarize(rows);
 a.equal(x.decided,12);a.equal(x.originalHitRate,8/12);
 a.equal(x.alwaysLowerSameThresholdRate,5/12);
 a.ok(x.originalMinusAlwaysLowerGameCluster95);
 a.equal(x.minimumEvidenceMet,false);a.equal(x.modelPromoted,false);
 a.equal(summarize([]).originalMinusAlwaysLowerGameCluster95,null);
});
