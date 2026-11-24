"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {gradePredictions}=require("../src/grade-nhl-predictions.cjs");
const {stablePickId,canonicalSelectedLedger,describeHistoricalMatchup,
 fairConsensusCoverage,groupAlternateLadders}=require("../src/nhl-roadmap-foundations.cjs");
const {summarizeReadiness}=require("../src/nhl-operational-alerts.cjs");
const {authorizeResearchAccess}=require("../src/nhl-premium-access-policy.cjs");
const t="2026-11-05T17:00:00Z",start="2026-11-06T00:00:00Z",
 archived="2026-11-05T17:01:00Z";
const prop={gameId:2026020251,playerId:123,market:"shotsOnGoal",line:2.5,
 tier:"Standard",lean:"Higher",probability:.65,team:"MTL",opponent:"UTA",
 capturedAt:t,gameStartAt:start,eventStartsAt:start,
 predictionRecordedAt:t,snapshotArchivedAt:archived,
 retrospectivePolicyOnly:false,model:"weighted-form-v1"};
test("exact private registry ID is stable and rejects unresolved NHL identity",()=>{
 assert.equal(stablePickId(prop),stablePickId({...prop,probability:.9,lean:"Lower"}));
 assert.notEqual(stablePickId(prop),stablePickId({...prop,gameId:2026020252}));
 assert.throws(()=>stablePickId({...prop,gameId:null}),/exact official NHL/);
});
test("original precommitted ledger reconciles decided, pushed, pending with official boxscore only",()=>{
 const other={...prop,gameId:2026020252,playerId:124,lean:"Lower"};
 const history={players:{123:{playerId:123,games:[
  {gameId:prop.gameId,playerId:123,gameDate:"2026-11-05",shotsOnGoal:4}]}}};
 const graded=gradePredictions([prop,other],history);
 const doc=canonicalSelectedLedger([prop,other],graded);
 assert.deepEqual(doc.counts,{registered:2,correct:1,incorrect:0,push:0,pending:1});
 assert.equal(doc.records[0].originalPlatformSettlementVerified,false);
 assert.ok(doc.records.every(r=>r.id&&r.firstGitCommittedAt===archived));
 assert.throws(()=>canonicalSelectedLedger([{...prop,retrospectivePolicyOnly:true}],graded),/Only original/);
 assert.throws(()=>canonicalSelectedLedger([prop,prop],graded),/Duplicate/);
 const pushing=gradePredictions([{...prop,line:4}],history);
 const pushed=canonicalSelectedLedger([{...prop,line:4}],pushing);
 assert.equal(pushed.counts.push,1);assert.equal(pushed.counts.correct,0);
});
test("historical matchup excludes same-day results and provides descriptive home/away splits",()=>{
 const games=Array.from({length:6},(_,i)=>({gameId:i+1,gameDate:"2026-10-"+String(i+10),
  type:"skater",side:i%2?"away":"home",shotsOnGoal:i+1}));
 games.push({gameId:7,gameDate:"2026-11-05",type:"skater",side:"home",shotsOnGoal:100});
 const h={players:{"123":{type:"skater",games}}};
 const r=describeHistoricalMatchup(prop,h);
 assert.equal(r.status,"official_past_only_descriptive");
 assert.equal(r.sampleGames,6);
 assert.equal(r.recentHomeAverage,3);
 assert.equal(r.recentAwayAverage,4);
 assert.equal(r.last10Average,3.5);
 assert.equal(r.modelAdjusted,false);
 assert.equal(describeHistoricalMatchup({...prop,playerId:999},h),null);
});
test("consensus refuses stale/started or invalid odds, dedupes book and reports dispersion",()=>{
 const now="2026-11-05T18:00:00Z";
 const base={player:"Example Player",book:"Book A",market:"shotsOnGoal",
  eventId:"event",line:2.5,overOdds:-120,underOdds:100,
  capturedAt:"2026-11-05T17:55:00Z",marketUpdatedAt:"2026-11-05T17:50:00Z",
  commenceTime:"2026-11-06T00:00:00Z"};
 const x=fairConsensusCoverage([base,{...base},{...base,book:"Book B",overOdds:115,underOdds:-135},
  {...base,book:"Old Book",capturedAt:"2026-11-05T01:00:00Z"},
  {...base,book:"Started",commenceTime:"2026-11-05T17:00:00Z"}],{now});
 assert.equal(x.groups,1);assert.equal(x.multiBookGroups,1);
 assert.equal(x.bookIndependentConsensusEstimates[0].distinctBooks,2);
 assert.ok(x.bookIndependentConsensusEstimates[0].highLowSpread>0);
 assert.equal(x.counts.stale,1);assert.equal(x.counts.started,1);
 assert.equal(x.noMarketQuotedReturnVerified,true);
});
test("alternate ladder requires actual unique archived side, game and stat",()=>{
 const base={...prop,market:"shotsOnGoal"};
 const r=groupAlternateLadders([base,{...base,line:3.5,tier:"Demon"},
  {...base,lean:"Lower",line:2.5},{...base,gameId:13,line:2.5}]);
 assert.equal(r.multiThresholdSides,1);
 assert.equal(r.ladders[0].alternates.length,2);
 assert.equal(r.ladders[0].originalTierTermsVerified,false);
 assert.equal(r.ladders[0].expectedValue,null);
});
test("operator health is not green when evidence is missing, distinguishes archived quote from current",()=>{
 const a=summarizeReadiness({now:"2026-11-05T20:00:00Z",
  source:{generatedAt:t,completePagination:true,quotaUnit:"requests",creditsRemaining:250},
  ledger:{counts:{registered:2,correct:0,incorrect:0,push:0,pending:2}},
  overnight:{officialGameStats:{complete:true}},actions:{counts:{criticalIssues:0}}});
 assert.equal(a.status,"review_issues");
 assert.ok(a.warning.some(w=>w.code==="BOARD_ARCHIVED_NOT_LIVE"));
 assert.equal(a.critical.length,0);
 const b=summarizeReadiness({now:"2026-11-05T20:00:00Z",
  source:{generatedAt:t,completePagination:false,quotaUnit:"unknown"},actions:null});
 assert.equal(b.status,"operator_attention_required");
 assert.equal(b.noPaidProviderRequests,true);
});
test("commercial premium service fails closed under every entitlement scenario",()=>{
 assert.equal(authorizeResearchAccess({feature:"public_results"}).allowed,true);
 const valid={feature:"premium_matchup_scenarios",verifiedServerClaims:true,
  user:{identityVerified:true,entitlement:"research_pro",subscriptionStatus:"active"},
  providerRights:Object.fromEntries(["derivedResearchPublicDisplay","commercialAnalytics",
   "cachedDataRedistribution","originalPlatformTermsReviewed","paymentUnderwritingApproved"].map(x=>[x,true])),
  policy:{paidAccessApproved:true,jurisdictionReviewed:true}};
 assert.equal(authorizeResearchAccess({feature:"premium_matchup_scenarios"}).allowed,false);
 const state=authorizeResearchAccess(valid);
 assert.equal(state.allowed,false);assert.equal(state.reason,"premium_service_not_deployed");
 assert.equal(authorizeResearchAccess({...valid,providerRights:{}}).allowed,false);
 assert.equal(authorizeResearchAccess({feature:"made_up"}).reason,"unknown_feature");
});
