"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{score}=require("../src/expanded-common-ml-grade.cjs");
test("first-Git shadow grades only exact original offered side and rejects late commit",()=>{
 const gameStartAt="2026-11-25T02:00:00Z",capturedAt="2026-11-25T00:00:00Z",generatedAt="2026-11-25T00:01:00Z",row={gameId:123,playerId:42,market:"points",line:.5,side:"Higher",gameStartAt,capturedAt,commonML:{kind:"priority_common_features_logistic_shadow_v1",market:"nhl_points",line:.5,higher:.7,artifactFirstGitAt:"2026-11-24T00:00:00Z",researchOnly:true,calibrated:false,modelPromoted:false}};
 const frame={firstGitCommittedAt:"2026-11-25T00:02:00Z",gitHistoryCount:1,snapshot:{matchupContextReviewV1:{generatedAt,rows:[row,row]}}},history={players:{42:{games:[{gameId:123,playerId:42,gameState:"OFF",type:"skater",timeOnIceSeconds:1200,points:1}]}}},now="2026-11-25T08:00:00Z";
 const a=score({nhlFrames:[frame],history,now});assert.equal(a.markets.nhl_points.registered,1);assert.equal(a.markets.nhl_points.correct,1);
 assert.equal(Object.keys(score({nhlFrames:[{...frame,firstGitCommittedAt:gameStartAt}],history,now}).markets).length,0);
 row.side="Lower";assert.equal(Object.keys(score({nhlFrames:[frame],history,now}).markets).length,0);
});
