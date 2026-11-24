"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {archivedGames,verifyOpponentAttempts,assessNhlOpponentOpportunity}=require("../src/nhl-opponent-opportunity-gate-v1.cjs");
function fixture(day,index,attempts=54,observedAt=null){
 const gameId=2026020300+index;
 const rows=[];
 for(let i=0;i<18;i++)rows.push({gameId,gameDate:day,playerId:8480000+i,
  team:"PHI",opponentShotAttempts:48,
  opponentShotAttemptSource:"NHL_official_exact_team_attempts_verified"});
 for(let i=0;i<18;i++)rows.push({gameId,gameDate:day,playerId:8490000+i,
  team:"BOS",opponentShotAttempts:attempts,
  opponentShotAttemptSource:"NHL_official_exact_team_attempts_verified"});
 return {kind:"official_nhl_exact_game_block_exposure_v1",date:day,gameId,
  observedAt:observedAt||day+"T23:00:00Z",verifiedShotAttemptGames:1,
  source:"NHL_Gamecenter_events_shiftcharts_and_official_final_sog_reconciled",
  attemptRows:rows,errors:[]};
}
const at="2026-11-21T22:13:35Z";
const days=["2026-11-09","2026-11-10","2026-11-11","2026-11-12",
 "2026-11-13","2026-11-14","2026-11-17","2026-11-19"];
const eight=days.map((d,i)=>fixture(d,i,50+i));
const prop={market:"blockedShots",line:1.5,direction:"Higher",projection:2.7,
 observations:16,opponent:"PHI",capturedAt:at,gameStartAt:"2026-11-22T00:00:00Z",
 matchup:{direction:"Higher",projection:2.9}};
test("official team shot attempts are derived from the OPPOSING team's opponentShotAttempts",()=>{
 const a=archivedGames(fixture("2026-11-19",9,62));
 assert.equal(a.length,1);
 assert.equal(a[0].attemptsFor.PHI,62);
 assert.equal(a[0].attemptsFor.BOS,48);
});
test("two verified games do not unlock high confidence, even with an agreeing model",()=>{
 const x=assessNhlOpponentOpportunity(prop,eight.slice(-2));
 assert.equal(x.opponentAttempts.priorDistinctGames,2);
 assert.equal(x.opponentOpportunityVerified,false);
 assert.equal(x.evidenceQualified,false);
 assert.equal(x.confidenceApproved,false);
 assert.ok(x.reasons.includes("insufficient_verified_opponent_shot_attempt_games"));
});
test("eight distinct pregame final-game archives permit an EVIDENCE qualification, not calibrated confidence",()=>{
 const x=assessNhlOpponentOpportunity(prop,eight);
 assert.equal(x.opponentAttempts.priorDistinctGames,8);
 assert.equal(x.opponentAttempts.attemptsForPerGame,53.5);
 assert.equal(x.evidenceQualified,true);
 assert.equal(x.confidenceApproved,false);
 assert.equal(x.automaticRecommendationEligible,false);
});
test("duplicate games, late archives and target-day games cannot be used as prior exposure",()=>{
 const late=fixture("2026-11-19",10,80,"2026-11-22T01:00:00Z");
 const sameDay=fixture("2026-11-21",11,80);
 const result=verifyOpponentAttempts([...eight,eight[0],late,sameDay],"PHI",at);
 assert.equal(result.priorDistinctGames,7);
 assert.equal(result.verified,false);
});
test("missing final SOG reconciliation, bad source, partial roster and duplicate player IDs fail",()=>{
 for(const bad of [
  {...eight[0],verifiedShotAttemptGames:0},
  {...eight[0],source:"boxscore_derived_guess"},
  {...eight[0],attemptRows:eight[0].attemptRows.slice(0,20)},
  {...eight[0],attemptRows:[...eight[0].attemptRows.slice(0,-1),eight[0].attemptRows[0]]},
  {...eight[0],attemptRows:eight[0].attemptRows.map(r=>({...r,opponentShotAttemptSource:"SOG_plus_blocks_proxy"}))}
 ])assert.equal(archivedGames(bad).length,0);
});
test("shot-on-goal opponent DEFENSE requires a distinct official concession source",()=>{
 const x=assessNhlOpponentOpportunity({...prop,market:"shotsOnGoal"},eight);
 assert.equal(x.evidenceQualified,false);
 assert.ok(x.reasons.includes("official_opponent_defensive_shots_conceded_not_verified"));
});
test("player projection and independent matchup direction are both required",()=>{
 const x=assessNhlOpponentOpportunity({...prop,matchup:{direction:"Lower",projection:1.2}},eight);
 assert.equal(x.evidenceQualified,false);
 assert.ok(x.reasons.includes("matchup_model_disagrees_or_missing"));
});

test("research probability safety never promotes a model without both evidence dimensions and calibration",()=>{
 const {assessNhlResearchProbability}=require("../src/nhl-probability-safety.cjs");
 const bare=assessNhlResearchProbability({...prop,probability:.7,market:"blockedShots"});
 assert.equal(bare.highConfidenceEligible,false);
 assert.equal(bare.playerProjectionVerified,true);
 assert.equal(bare.opponentOpportunityVerified,false);
 assert.ok(bare.highConfidenceBlockers.includes("verified_opponent_opportunity_missing"));
 const exposed=assessNhlResearchProbability({...prop,probability:.7,
  opponentOpportunity:{kind:"nhl_opponent_opportunity_verified_v1",
   verified:true,evidenceQualified:true}});
 assert.equal(exposed.opponentOpportunityVerified,true);
 assert.equal(exposed.highConfidenceEligible,false);
 assert.ok(exposed.highConfidenceBlockers.includes(
  "independent_calibration_and_original_platform_value_not_approved"));
 assert.notEqual(exposed.confidenceLabel,"high_confidence");
});
test("market-specific defensive SOG and scoring concessions require eight real prior games",()=>{
 const {verifyOpponentConcessions}=require("../src/nhl-opponent-opportunity-gate-v1.cjs");
 const complete=eight.map(a=>({...a,attemptRows:a.attemptRows.map(r=>({
  ...r,opponentShotsOnGoal:r.team==="PHI"?29:35,
  opponentSogConcessionSource:"NHL_official_SOG_independently_reconciled",
  opponentTeamGoals:r.team==="PHI"?2:3,
  opponentTeamAssists:r.team==="PHI"?3:4,
  opponentTeamPoints:r.team==="PHI"?5:7,
  opponentScoringSource:"NHL_official_final_scoring_and_gamecenter_goals_reconciled"
 }))}));
 const sog=verifyOpponentConcessions(complete,"PHI",at,"shotsOnGoal");
 const pts=verifyOpponentConcessions(complete,"PHI",at,"points");
 const assists=verifyOpponentConcessions(complete,"PHI",at,"assists");
 assert.equal(sog.verified,true);
 assert.equal(sog.concededPerGame,29);
 assert.equal(pts.concededPerGame,5);
 assert.equal(assists.concededPerGame,3);
 for(const market of ["shotsOnGoal","points","assists"]){
  const result=assessNhlOpponentOpportunity({...prop,market},complete);
  assert.equal(result.opponentOpportunityVerified,true);
  assert.equal(result.evidenceQualified,true);
  assert.equal(verifyOpponentConcessions(complete.slice(1),"PHI",at,market).verified,false);
  assert.equal(verifyOpponentConcessions([...complete,complete[0]],"PHI",at,market).verified,false);
 }
 const tampered=complete.map((a,i)=>i===0?{...a,attemptRows:a.attemptRows.map((r,j)=>
  j===0?{...r,opponentTeamPoints:99}:r)}:a);
 assert.equal(verifyOpponentConcessions(tampered,"PHI",at,"points").verified,false);
 assert.equal(verifyOpponentConcessions(eight,"PHI",at,"shotsOnGoal").verified,false);
});


test("identical official completed game in two DISTINCT archive series counts once, not zero or twice",()=>{
 const cross=a=>({...a,
  source:"NHL_Gamecenter_events_and_official_final_SOG_concessions_reconciled"});
 const matched=verifyOpponentAttempts([...eight,...eight.slice(0,4).map(cross)],"PHI",at);
 assert.equal(matched.verified,true);
 assert.equal(matched.priorDistinctGames,8);
 assert.equal(matched.recentOfficialGameIds.length,8);
 assert.equal(matched.matchedCrossArchiveGameIds.length,4);
 assert.equal(matched.attemptsForPerGame,53.5);
 // A repeat in the SAME source series remains ambiguous and is rejected.
 const sameSource=verifyOpponentAttempts([...eight,eight[0]],"PHI",at);
 assert.equal(sameSource.priorDistinctGames,7);
 assert.equal(sameSource.verified,false);
 // A THIRD copy is ambiguous, not a bonus extra game.
 const triple=verifyOpponentAttempts([...eight,eight[0],cross(eight[0])],"PHI",at);
 assert.equal(triple.priorDistinctGames,7);
});
test("two official source series with conflicting team attempts or game date remain unverified",()=>{
 const second={...eight[0],source:"NHL_Gamecenter_events_and_official_final_SOG_concessions_reconciled"};
 const disagree={...second,attemptRows:second.attemptRows.map(r=>r.team==="BOS"?
  {...r,opponentShotAttempts:123}:r)};
 assert.equal(verifyOpponentAttempts([...eight,disagree],"PHI",at).priorDistinctGames,7);
 const badSource={...second,source:"NHL_Gamecenter_events_unverified_other_series"};
 assert.equal(verifyOpponentAttempts([...eight,badSource],"PHI",at).priorDistinctGames,7);
 const badDate={...second,date:"2026-11-08",attemptRows:second.attemptRows.map(
  r=>({...r,gameDate:"2026-11-08"}))};
 assert.equal(verifyOpponentAttempts([...eight,badDate],"PHI",at).priorDistinctGames,7);
});

test("matching distinct official archive series reconcile market concessions without counting duplicate games",()=>{
 const {verifyOpponentConcessions}=require("../src/nhl-opponent-opportunity-gate-v1.cjs");
 const complete=eight.map(a=>({...a,attemptRows:a.attemptRows.map(r=>({
  ...r,opponentShotsOnGoal:r.team==="PHI"?29:35,
  opponentSogConcessionSource:"NHL_official_SOG_independently_reconciled",
  opponentTeamGoals:r.team==="PHI"?2:3,
  opponentTeamAssists:r.team==="PHI"?3:4,
  opponentTeamPoints:r.team==="PHI"?5:7,
  opponentScoringSource:"NHL_official_final_scoring_and_gamecenter_goals_reconciled"
 }))}));
 const cross=a=>({...a,
  source:"NHL_Gamecenter_events_and_official_final_SOG_concessions_reconciled"});
 const together=[...complete,...complete.slice(0,4).map(cross)];
 for(const [market,expected] of [["shotsOnGoal",29],["points",5],["assists",3]]){
  const r=verifyOpponentConcessions(together,"PHI",at,market);
  assert.equal(r.verified,true,market);
  assert.equal(r.priorDistinctGames,8,market);
  assert.equal(r.concededPerGame,expected,market);
  assert.equal(verifyOpponentConcessions([...complete,complete[0]],"PHI",at,market).verified,false);
  assert.equal(verifyOpponentConcessions([...complete,complete[0],cross(complete[0])],"PHI",at,market).verified,false);
 }
 // Both valid independently reconciled archives still abstain on disagreement
 // about either club, even if the requested opponent's side is unchanged.
 const disagreement=cross({...complete[0],attemptRows:complete[0].attemptRows.map(r=>(
  r.team==="BOS"?{...r,opponentShotsOnGoal:44}:r))});
 assert.equal(verifyOpponentConcessions([...complete,disagreement],"PHI",at,"shotsOnGoal").priorDistinctGames,7);
 const attemptMismatch=cross({...complete[0],attemptRows:complete[0].attemptRows.map(r=>(
  r.team==="BOS"?{...r,opponentShotAttempts:99}:r))});
 assert.equal(verifyOpponentConcessions([...complete,attemptMismatch],"PHI",at,"points").priorDistinctGames,7);
 // Earlier series may legitimately lack an independently verified SOG field,
 // but cannot create zeroes or contribute a second observation.
 const oldOnly={...complete[0],attemptRows:complete[0].attemptRows.map(r=>{
  const {opponentShotsOnGoal,opponentSogConcessionSource,...base}=r;
  return base;
 })};
 const mixed=[oldOnly,...complete.slice(1),cross(complete[0])];
 assert.equal(verifyOpponentConcessions(mixed,"PHI",at,"shotsOnGoal").priorDistinctGames,8);
 assert.equal(verifyOpponentConcessions(mixed,"PHI",at,"shotsOnGoal").verified,true);
});
