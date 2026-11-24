"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {auditAndGrade,combine,score}=require("../src/nhl-approved-shadow-grader.cjs");
const start="2026-11-04T01:00:00Z",at="2026-11-03T03:00:00Z",commit="2026-11-03T03:01:00Z";
const schedule={complete:true,games:[{id:2026020344,home:"BOS",away:"NYR",gameDate:"2026-11-03",startTimeUTC:start}]};
const official={2026020344:{gameId:2026020344,gameState:"OFF",home:"BOS",away:"NYR",players:[
 {playerId:123,team:"BOS",type:"skater",shotsOnGoal:4,goals:1},
 {playerId:456,team:"BOS",type:"goalie",saves:29}
]}};
const row={gameId:2026020344,playerId:123,market:"shotsOnGoal",line:2.5,
 tier:"Standard",selectedSide:"Higher",eventStartsAt:start,playerTeam:"BOS",opponentTeam:"NYR",
 baseMean:2.8,shadowMean:3.1,championHigher:.54,shadowHigher:.59,
 originalQuoteCapturedAt:"2026-11-03T02:40:00Z",sourceCapturedAt:"2026-11-03T02:55:00Z",
 shadowCreatedAt:at};
const snap={kind:"nhl_approved_source_shadow_research",asOf:at,sourceCapturedAt:row.sourceCapturedAt,sourceRows:[row]};
const params={path:"outputs/projections/approved-source-snapshots/test.json",
 firstCommitAt:commit,firstCommitSha:"a".repeat(40),historyCount:1,schedule,finalGames:official,
 now:"2026-11-04T05:00:00Z"};
test("strict official game and original Git snapshot grade same source-observed line",()=>{
 const r=auditAndGrade(snap,params);
 assert.equal(r.decisions.length,1);
 const d=r.decisions[0];
 assert.equal(d.actual,4);assert.equal(d.actualDirection,"Higher");
 assert.equal(d.championBrier,Number((.54-1)**2).toFixed(6)*1);
 assert.equal(d.shadowBrier,Number((.59-1)**2).toFixed(6)*1);
 assert.equal(d.neutralBrier,.25);
 assert.equal(d.statsOfficialNhlFinal,true);
 assert.equal(r.originalPlatformOfferVerified,false);
 assert.equal(r.modelPromoted,false);
});
test("future game and incomplete official NHL game never receive a graded outcome",()=>{
 const future=auditAndGrade(snap,{...params,now:"2026-11-03T05:00:00Z"});
 assert.equal(future.decisions.length,0);
 assert.equal(future.pending[0].reason,"future_game");
 const live=auditAndGrade(snap,{...params,finalGames:{2026020344:{...official[2026020344],gameState:"LIVE"}}});
 assert.equal(live.decisions.length,0);
 assert.equal(live.pending[0].reason,"official_final_boxscore_not_available");
});
test("missing player is not guessed to be zero; pushes excluded without declaring failed pick",()=>{
 const absent=auditAndGrade(snap,{...params,finalGames:{2026020344:{...official[2026020344],players:[]}}});
 assert.equal(absent.decisions.length,0);
 assert.equal(absent.excluded[0].reason,"player_did_not_appear_or_ambiguous_official_boxscore");
 const push=auditAndGrade({...snap,sourceRows:[{...row,line:4}]},params);
 assert.equal(push.decisions.length,0);
 assert.equal(push.excluded[0].reason,"stat_line_push");
});
test("post-start or rewritten Git snapshot, future source and wrong opponent fail closed",()=>{
 const bad=auditAndGrade(snap,{...params,firstCommitAt:"2026-11-04T02:00:00Z"});
 assert.equal(bad.excluded[0].reason,"not_originally_archived_before_puck_drop");
 const mutate=auditAndGrade(snap,{...params,historyCount:2});
 assert.equal(mutate.excluded[0].reason,"frozen_snapshot_rewritten_in_git");
 const source=auditAndGrade({...snap,sourceRows:[{...row,sourceCapturedAt:"2026-11-04T01:01:00Z"}]},params);
 assert.equal(source.excluded[0].reason,"not_originally_archived_before_puck_drop");
 const wrong=auditAndGrade({...snap,sourceRows:[{...row,opponentTeam:"SJS"}]},params);
 assert.equal(wrong.excluded[0].reason,"game_team_or_start_mismatch");
});
test("no false official team source or missing player stat, and duplicate exact offers stay out",()=>{
 const mismatch=auditAndGrade(snap,{...params,finalGames:{2026020344:{...official[2026020344],away:"SJS"}}});
 assert.equal(mismatch.excluded[0].reason,"official_boxscore_team_identity_conflict");
 const miss=auditAndGrade({...snap,sourceRows:[{...row,market:"saves",playerId:456}]},params);
 assert.equal(miss.decisions.length,1);
 const duplicate=auditAndGrade({...snap,sourceRows:[row,row]},params);
 assert.equal(duplicate.decisions.length,1);
 assert.equal(duplicate.excluded[0].reason,"duplicate_within_snapshot");
});
test("scorecard compares Brier, log-loss, MAE and baseline, deduplicates repeat snapshots",()=>{
 const a=auditAndGrade(snap,params),b=auditAndGrade(snap,params),x=combine([a,b]);
 assert.equal(x.matchedDecisions,1);
 assert.equal(x.excludedReasons.repeated_line_across_source_snapshots,1);
 assert.equal(x.grade.overall.n,1);
 assert.equal(x.grade.byMarket.shotsOnGoal.n,1);
 assert.equal(x.grade.overall.brier.neutral,.25);
 assert.equal(x.grade.overall.brier.champion,Number((.54-1)**2).toFixed(6)*1);
 assert.equal(x.grade.overall.mae.shadow,.9);
 assert.equal(x.modelDeploymentApproved,false);
 assert.equal(x.originalPlatformOfferAndPayoutVerified,false);
 assert.equal(score([]).overall.n,0);
});
