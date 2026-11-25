"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{summarize}=require("../scripts/export-private-nhl-compact.cjs");
const generatedAt="2026-11-15T14:06:00Z",capturedAt="2026-11-15T14:05:00Z",gameStartAt="2026-11-15T22:00:00Z";
const p={gameId:1,playerId:2,player:"Test Player",team:"EDM",opponent:"PHI",market:"shotsOnGoal",line:2.5,tier:"Standard",lean:"Lower",probability:.61,capturedAt,gameStartAt,projection:2.2,observations:20};
const fixture=()=>({source:"partner-api.prizepicks.com",generatedAt,boardFresh:true,projectionsFresh:true,boardCoverageComplete:true,individualPropSelectionPolicy:"nhl-individual-prop-max-available-direction-v1",individualPropSelections:[{...p}],rankedProps:[{...p}]});
const options={now:"2026-11-15T14:10:00Z",firstCommittedAt:"2026-11-15T14:06:02Z",sourceSha:"abc",sourcePath:"fixture"};
test("fresh original match, separated tiers and explicit no approval",()=>{const a=summarize(fixture(),options);assert.equal(a.snapshots.Standard.rows.length,1);assert.equal(a.snapshots.Standard.rows[0].approvedConfidence,null);assert.equal(a.snapshots.Goblin.rows.length,0);assert.equal(a.snapshots.Standard.rows[0].direction,"Lower");});
test("expired or unproven source must not display rows",()=>{for(const o of [{...options,now:"2026-11-15T15:00:00Z"},{...options,firstCommittedAt:null}])assert.equal(summarize(fixture(),o).snapshots.Standard.rows.length,0);});
test("ambiguous original, watchlist, missing offered side and starts soon are excluded",()=>{for(const f of [s=>s.rankedProps.push({...p}),s=>s.rankedProps[0].researchEligibility="watchlist",s=>s.rankedProps[0].lean="Higher",s=>{s.rankedProps[0].gameStartAt=s.individualPropSelections[0].gameStartAt="2026-11-15T14:20:00Z";}]){const s=fixture();f(s);assert.equal(summarize(s,options).snapshots.Standard.rows.length,0);}});
test("existing matchup shadow joined only on exact frozen side and capture",()=>{const s=fixture();s.standardTripleChallenger={originalSnapshotGeneratedAt:generatedAt,rows:[{...p,originalSelectedSide:"Lower",originalCapturedAt:capturedAt,variants:{matchup:{status:"research_only",estimate:2.1}},decisions:{matchup:{side:"Lower",probability:.63}}}]};assert.equal(summarize(s,options).snapshots.Standard.rows[0].matchup.projection,2.1);s.standardTripleChallenger.rows[0].originalSelectedSide="Higher";assert.equal(summarize(s,options).snapshots.Standard.rows[0].matchup,null);});
test("validation counts are distinct from calibration",()=>{const v={kind:"private_nhl_prospective_probability_validation_v1",allStandardDescriptive:{decided:524},futureHoldout:{decided:495},training:{decided:29},calibrated:false};const a=summarize(fixture(),{...options,validation:v});assert.equal(a.health.standardGraded,524);assert.equal(a.health.standardFutureHoldout,495);assert.equal(a.health.calibrated,false);});

test("compact private NHL rows expose frozen opponent-by-position evidence without granting confidence",()=>{
 const s=fixture(),stat={games:10,allowedPerAppearance:1.2,allowedPer60:3.4};
 s.positionRateMatchupV2={kind:"nhl_position_rate_matchup_v2",generatedAt,rows:[{
  ...p,side:p.lean,position:"D",latestPriorDate:"2026-11-14",
  defense:{season:{...stat,games:18},last10:stat,last5:{...stat,games:5}},
  offense:{season:{...stat,games:18},last10:stat,last5:{...stat,games:5}},
  defenseFactor:1.08,offenseFactor:.96
 }]};
 s.standardAdaptiveResearchV2={kind:"nhl_standard_adaptive_research_v2",generatedAt,rows:[{
  ...p,originalSide:p.lean,priorGames:20,opponentGames:12,
  expectedIceSeconds:1100,restDaysFromLastAppearance:1,
  opponentHistoryUsed:true,priorComponentVerified:true,
  pointsSourceEvidence:{projectedPP:"pp1",linemateCount:2}
 }]};
 const a=summarize(s,options).snapshots.Standard.rows[0];
 assert.equal(a.multifactorMatchup.position,"D");
 assert.equal(a.multifactorMatchup.opponentByPosition.games,10);
 assert.equal(a.multifactorMatchup.opponentByPosition.allowedPer60,3.4);
 assert.equal(a.multifactorMatchup.ownTeamByPosition.games,10);
 assert.equal(a.multifactorMatchup.playerExpectedIceSeconds,1100);
 assert.equal(a.multifactorMatchup.coverage.opponentVersusExactPosition,true);
 assert.equal(a.multifactorMatchup.coverage.opponentMarketOpportunity,false);
 assert.equal(a.approvedConfidence,null);
 assert.equal(a.highConfidenceEligible,false);
 const status=summarize(s,options).health;
 assert.equal(status.positionContextVerifiedByTier.Standard,1);
 assert.equal(status.allRequiredMatchupEvidenceByTier.Standard,0);
});

test("compact audit preserves no approval and counts missing evidence without inventing sportsbook matches",()=>{
 const a=summarize(fixture(),options).health.evidenceAuditByTier.Standard;
 assert.equal(a.exactLineBenchmark,0);assert.equal(a.independentExactLineBenchmark,0);
 assert.equal(a.incorporatedBenchmark,0);
 assert.equal(a.missingMatchupReasons.market_specific_opponent_opportunity_unverified,1);
});

test("compact serialization preserves total eligibility and only drops tail rows",()=>{const {encodeBounded}=require("../scripts/export-private-nhl-compact.cjs");const doc={totalEligible:20,rows:Array.from({length:10},(_,i)=>({id:i,text:"a".repeat(500)})),calibrated:false};const a=JSON.parse(encodeBounded(doc,1500));assert.equal(a.totalEligible,20);assert.equal(a.rows[0].id,0);assert.ok(a.rows.length<10);assert.equal(a.byteLimitTruncated,true);assert.equal(doc.rows.length,10);assert.equal(a.calibrated,false);});
