"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {build,TEAMS}=require("../scripts/report-nhl-opponent-concession-coverage.cjs");
function fixture(day,index,scoring=true){
 const gameId=2026020500+index;
 const rows=[];
 for(const [team,playerStart]of[["PHI",8480000],["BOS",8490000]])
  for(let i=0;i<13;i++)rows.push({
   gameId,gameDate:day,playerId:playerStart+i,team,
   opponentShotAttempts:team==="PHI"?51:45,
   opponentShotAttemptSource:"NHL_official_exact_team_attempts_verified",
   opponentShotsOnGoal:team==="PHI"?34:27,
   opponentSogConcessionSource:"NHL_official_SOG_independently_reconciled",
   ...(scoring?{
    opponentTeamGoals:team==="PHI"?3:2,
    opponentTeamAssists:team==="PHI"?4:3,
    opponentTeamPoints:team==="PHI"?7:5,
    opponentScoringSource:"NHL_official_final_scoring_and_gamecenter_goals_reconciled"
   }:{})
  });
 return {kind:"official_nhl_exact_game_block_exposure_v1",
  date:day,gameId,observedAt:day+"T23:00:00Z",
  attemptRows:rows,verifiedShotAttemptGames:1,
  source:"NHL_Gamecenter_events_and_official_final_SOG_concessions_reconciled"};
}
const days=["2026-11-09","2026-11-10","2026-11-11","2026-11-12",
 "2026-11-13","2026-11-14","2026-11-17","2026-11-19"];
const docs=days.map((d,i)=>fixture(d,i));
const now="2026-11-22T20:00:00Z";
test("one official future-ready opponent source sample requires eight unique historical games",()=>{
 assert.equal(TEAMS.length,32);
 const r=build({concessions:docs,asOf:now});
 assert.equal(r.byOpponent.PHI.shotsOnGoal.sampleSourceQualified,true);
 assert.equal(r.byOpponent.PHI.points.sampleSourceQualified,true);
 assert.equal(r.byOpponent.PHI.assists.sampleSourceQualified,true);
 assert.equal(r.byOpponent.BOS.blockedShots.sampleSourceQualified,true);
 assert.equal(r.byMarket.points.teamsAtEightSourceVerified,2);
 assert.equal(r.verifiedConcessionArchiveGames,8);
 assert.equal(r.paidProviderRequests,0);
 assert.equal(r.bettingEligible,false);
 assert.equal(r.approvedLineups,0);
});
test("partial scoring, sparse opponents, duplicates and post-freeze archives fail closed",()=>{
 const insufficient=build({concessions:docs.slice(0,7),asOf:now});
 assert.equal(insufficient.byOpponent.PHI.shotsOnGoal.sampleSourceQualified,false);
 const noScoring=build({concessions:docs.map((d,i)=>i===0?fixture(days[i],i,false):d),asOf:now});
 assert.equal(noScoring.byOpponent.PHI.shotsOnGoal.sampleSourceQualified,true);
 assert.equal(noScoring.byOpponent.PHI.points.sampleSourceQualified,false);
 assert.equal(noScoring.byOpponent.PHI.assists.sampleSourceQualified,false);
 const dup=build({concessions:[...docs,docs[0]],asOf:now});
 assert.equal(dup.byOpponent.PHI.points.sampleSourceQualified,false);
 const future=build({concessions:[...docs.slice(0,7),
  {...docs[7],observedAt:"2026-11-23T10:00:00Z"}],asOf:now});
 assert.equal(future.byOpponent.PHI.points.sampleSourceQualified,false);
});
