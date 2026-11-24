"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assess,positionEvidence}=require("../src/nhl-multifactor-position-matchup-v1.cjs");
const market="blockedShots";
const p={gameId:2026020370,playerId:8482345,team:"MTL",opponent:"PHI",
 market,line:1.5,tier:"Standard",lean:"Higher",probability:.64,
 capturedAt:"2026-11-21T17:05:00Z",gameStartAt:"2026-11-22T00:00:00Z"};
const generatedAt="2026-11-21T17:08:00Z";
const stats=(games)=>({games,allowedPerAppearance:1.4,allowedPer60:3.2});
function fixture(){
 const frozen={...p,side:p.lean,position:"D",latestPriorDate:"2026-11-20",
  defense:{season:stats(18),last10:stats(10),last5:stats(5)},
  offense:{season:stats(18),last10:stats(10),last5:stats(5)},
  defenseFactor:1.05,offenseFactor:1.03};
 const usage={...p,originalSide:p.lean,priorGames:20,opponentGames:12,
  expectedIceSeconds:1300,latestPriorDate:"2026-11-20",
  opponentHistoryUsed:true,restDaysFromLastAppearance:1,
  priorComponentVerified:true,pointsSourceEvidence:{projectedPP:"pp1",linemateCount:2}};
 return {source:"partner-api.prizepicks.com",generatedAt,
  individualPropSelections:[{...p}],rankedProps:[{...p}],
  positionRateMatchupV2:{kind:"nhl_position_rate_matchup_v2",generatedAt,rows:[frozen]},
  standardAdaptiveResearchV2:{kind:"nhl_standard_adaptive_research_v2",generatedAt,rows:[usage]}};
}
const official={kind:"nhl_opponent_opportunity_verified_v1",evidenceQualified:true};
test("exact role and opponent-by-position allowed per60 are reported as research, not high-confidence picks",()=>{
 const x=assess(fixture(),p,{opponentOpportunity:official});
 assert.equal(x.researchEvidenceQualified,true);
 assert.equal(x.position,"D");
 assert.equal(x.positionOpponent.last10.games,10);
 assert.equal(x.positionOpponent.last10.allowedPer60,3.2);
 assert.equal(x.teamOwnPosition.last10.games,10);
 assert.equal(x.playerUsage.expectedIceSeconds,1300);
 assert.equal(x.coverage.opponentVersusExactPosition,true);
 assert.equal(x.coverage.liveLineAndLinematesVerified,false);
 assert.equal(x.highConfidenceEligible,false);
 assert.equal(x.automaticRecommendationEligible,false);
 assert.equal(x.positionOpponent.leagueRank,null);
});
test("source-backed opponent opportunities remain an independent required market input",()=>{
 const x=assess(fixture(),p);
 assert.equal(x.researchEvidenceQualified,false);
 assert.ok(x.reasons.includes("market_specific_opponent_opportunity_unverified"));
});
test("incomplete last10 opponent-position sample abstains",()=>{
 const s=fixture();s.positionRateMatchupV2.rows[0].defense.last10=stats(4);
 const x=assess(s,p,{opponentOpportunity:official});
 assert.equal(x.researchEvidenceQualified,false);
 assert.ok(x.reasons.includes("insufficient_position_sample"));
});
test("missing or ambiguous original frozen position row abstains",()=>{
 const s=fixture();s.positionRateMatchupV2.rows.push({...s.positionRateMatchupV2.rows[0]});
 const x=assess(s,p,{opponentOpportunity:official});
 assert.equal(x.researchEvidenceQualified,false);
 assert.ok(x.reasons.includes("missing_or_ambiguous_exact_position_match"));
});
test("an otherwise identical alternative prop threshold may not borrow the position row",()=>{
 const s=fixture();const x=assess(s,{...p,line:2.5},{opponentOpportunity:official});
 assert.equal(x.researchEvidenceQualified,false);
 assert.ok(x.reasons.includes("original_selected_offer_not_unique"));
});
test("future-day position history and mismatched source freeze fail closed",()=>{
 const s=fixture();s.positionRateMatchupV2.rows[0].latestPriorDate="2026-11-21";
 assert.equal(assess(s,p,{opponentOpportunity:official}).researchEvidenceQualified,false);
 s.positionRateMatchupV2.generatedAt="2026-11-22T10:00:00Z";
 assert.equal(positionEvidence(s,p).coverage,undefined);
});
test("goals, points and assists must prove special teams or teammate role",()=>{
 for(const m of ["goals","points","assists","powerPlayPoints"]){
  const s=fixture(),q={...p,market:m};
  s.rankedProps[0].market=m;s.individualPropSelections[0].market=m;
  s.positionRateMatchupV2.rows[0].market=m;
  s.standardAdaptiveResearchV2.rows[0].market=m;
  s.standardAdaptiveResearchV2.rows[0].priorComponentVerified=false;
  const x=assess(s,q,{opponentOpportunity:official});
  assert.equal(x.researchEvidenceQualified,false);
  assert.ok(x.reasons.includes("special_teams_or_teammate_role_unverified"));
 }
});
test("short recent usage or non-pregame capture cannot inherit past evidence",()=>{
 const s=fixture();s.standardAdaptiveResearchV2.rows[0].expectedIceSeconds=20;
 assert.equal(assess(s,p,{opponentOpportunity:official}).researchEvidenceQualified,false);
 const q={...p,capturedAt:"2026-11-22T00:01:00Z"};
 assert.equal(assess(s,q,{opponentOpportunity:official}).highConfidenceEligible,false);
});
test("as-of provenance and exact original offered side required, no post-result reclassification",()=>{
 const s=fixture();s.rankedProps[0].lean="Lower";
 const x=assess(s,p,{opponentOpportunity:official});
 assert.equal(x.researchEvidenceQualified,false);
 assert.ok(x.reasons.includes("original_selected_offer_not_unique"));
});

test("as-of frozen same-history ice time formula supplies role-shift diagnostics but does not modify v1 keeper",()=>{
 const s=fixture(),cutoff="2026-11-21";
 const e={kind:"nhl_pregame_expected_ice_time_history_shadow_20261120_v1",
  cutoff,priorGames:20,latestPriorDate:"2026-11-20",
  originalExpectedIceSeconds:1320,alternateExpectedIceSeconds:1290,
  recentRoleInstability:false,uniqueOriginalGameRows:true,pregameOnly:true};
 s.standardExpectedIceTimeShadowV1={kind:e.kind,generatedAt,cutoff,
  rows:[{...p,originalSide:p.lean,evidence:e}]};
 let x=assess(s,p,{opponentOpportunity:official});
 assert.equal(x.iceTimeCrosscheck.sourceVerified,true);
 assert.equal(x.iceTimeCrosscheck.independentSource,false);
 assert.equal(x.iceTimeCrosscheck.absoluteDifferenceSeconds,20);
 assert.equal(x.iceTimeCrosscheck.roleShiftRisk,false);
 assert.equal(x.researchEvidenceQualified,true);
 assert.equal(x.coverage.historicalIceTimeCrosscheckVerified,true);
 s.standardExpectedIceTimeShadowV1.rows[0].evidence={
  ...e,originalExpectedIceSeconds:700,alternateExpectedIceSeconds:705,
  recentRoleInstability:true};
 x=assess(s,p,{opponentOpportunity:official});
 assert.equal(x.iceTimeCrosscheck.roleShiftRisk,true);
 assert.equal(x.coverage.historicalIceTimeRoleShiftRisk,true);
 assert.equal(x.researchEvidenceQualified,true); // experimental diagnostic, not v1 gate
 assert.equal(x.highConfidenceEligible,false);
});
test("expected ice time never borrows another threshold or side or post-freeze game",()=>{
 const s=fixture(),cutoff="2026-11-21",kind="nhl_pregame_expected_ice_time_history_shadow_20261120_v1";
 const e={kind,cutoff,priorGames:22,latestPriorDate:"2026-11-20",
  originalExpectedIceSeconds:1320,alternateExpectedIceSeconds:1200,
  recentRoleInstability:false,uniqueOriginalGameRows:true,pregameOnly:true};
 s.standardExpectedIceTimeShadowV1={kind,generatedAt,cutoff,
  rows:[{...p,originalSide:"Lower",evidence:e}]};
 assert.equal(assess(s,p,{opponentOpportunity:official}).iceTimeCrosscheck.sourceVerified,false);
 s.standardExpectedIceTimeShadowV1.rows[0].originalSide=p.lean;
 s.standardExpectedIceTimeShadowV1.rows[0].line=2.5;
 assert.equal(assess(s,p,{opponentOpportunity:official}).iceTimeCrosscheck.sourceVerified,false);
 s.standardExpectedIceTimeShadowV1.rows[0].line=p.line;
 s.standardExpectedIceTimeShadowV1.rows[0].evidence={...e,latestPriorDate:"2026-11-21"};
 assert.equal(assess(s,p,{opponentOpportunity:official}).iceTimeCrosscheck.sourceVerified,false);
 s.standardExpectedIceTimeShadowV1.rows[0].evidence={...e,cutoff:"2026-11-22"};
 assert.equal(assess(s,p,{opponentOpportunity:official}).iceTimeCrosscheck.sourceVerified,false);
});
