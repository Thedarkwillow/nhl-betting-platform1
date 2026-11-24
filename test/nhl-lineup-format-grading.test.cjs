"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit}=require("../src/nhl-lineup-format-grading.cjs");
const {scenario}=require("../src/nhl-lineup-format-scenario.cjs");
function fixture(){
 const generatedAt="2026-11-14T19:00:00Z",start="2026-11-15T00:00:00Z";
 const picks=Array.from({length:3},(_,i)=>({gameId:101+i,playerId:201+i,market:"shotsOnGoal",model:"weighted-form-v1",
 team:"ABC",opponent:"XYZ",tier:"Standard",lean:"Higher",line:2.5,probability:.7,probabilities:{higher:.7,lower:.3,push:0},
 capturedAt:generatedAt,eventStartsAt:start,gameStartAt:start}));
 const l=(n,format)=>({picks:picks.slice(0,n).map(x=>({...x})),strictIndependentGamesOnly:true,privateFormatScenario:scenario(Array(n).fill(.7),format)});
 const snapshot={generatedAt,rankedProps:picks,privateFormatLineupResearch:{kind:"nhl_private_power_flex_scenario_v1",generatedAt,researchOnly:true,power:{2:l(2,"power"),3:l(3,"power")},flex:{3:l(3,"flex")}}};
 const frame={snapshot,firstCommittedAt:"2026-11-14T19:01:00Z",gitHistoryCount:1};
 const history={players:Object.fromEntries(picks.map((p,i)=>[p.playerId,{games:[{gameId:p.gameId,playerId:p.playerId,gameState:"OFF",type:"skater",timeOnIceSeconds:900,shotsOnGoal:i===2?1:4}]}]))};
 const schedule={games:picks.map(p=>({id:p.gameId,home:"ABC",away:"XYZ",startTimeUTC:start}))};
 return {frame,history,schedule,opts:{firstPolicyCommit:"2026-11-14T18:00:00Z"}};
}
test("exact original format scenarios grade separately without pooled or platform ROI",()=>{
 const {frame,history,schedule,opts}=fixture(),r=audit([frame,frame],history,schedule,opts);
 assert.equal(r.groups.power_2.allCorrect,1);
 assert.deepEqual(r.groups.flex_3.observedHitCount,[0,0,1,0]);
 assert.equal(r.groups.power_3.decided,1);
 assert.equal(r.groups.flex_3.hitCountBrier,r.groups.power_3.hitCountBrier);
 assert.equal(r.excluded.repeat_exact_slip,3);assert.equal(r.verifiedROI,null);
});
test("no final evidence means pending; altered originals and late commits refused",()=>{
 const {frame,history,schedule,opts}=fixture();
 history.players["203"].games[0].gameState="LIVE";
 const r=audit([frame],history,schedule,opts);
 assert.equal(r.groups.flex_3.pending,1);assert.equal(r.groups.flex_3.decided,0);
 frame.snapshot.privateFormatLineupResearch.flex[3].picks[0].line=9.5;
 assert.equal(audit([frame],history,schedule,opts).excluded.invalid_original_legs,1);
 frame.firstCommittedAt="2026-11-15T00:00:00Z";
 assert.deepEqual(audit([frame],history,schedule,opts).groups,{});
});
test("invalid scenario mass and retroactive archive excluded",()=>{
 const {frame,history,schedule,opts}=fixture();
 frame.snapshot.privateFormatLineupResearch.power[2].privateFormatScenario.modeledCountMass[0]=.9;
 assert.equal(audit([frame],history,schedule,opts).excluded.scenario_mismatch,1);
 frame.gitHistoryCount=2;
 assert.deepEqual(audit([frame],history,schedule,opts).groups,{});
});

test("NHL Power/Flex paper slates use Pacific date, not next UTC day",()=>{
 const {frame,history,schedule,opts}=fixture(),r=audit([frame],history,schedule,opts);
 assert.equal(r.resolvedScenarioObservations[0].slate,"2026-11-14");
 assert.equal(r.resolvedScenarioObservations[0].slateTimeZone,"America/Los_Angeles");
 assert.equal(r.groups.power_2.distinctResolvedPacificSlates,1);
 assert.equal(r.groups.power_2.additionalPacificSlatesToReview,49);
 assert.equal(r.groups.power_2.eligibleForPayoutAdjustedRelease,false);
});
test("Multi-Pacific-date slips cannot count as one independent slate even if original quotes match",()=>{
 const {frame,history,schedule,opts}=fixture();
 const next="2026-11-16T00:00:00Z";
 const item=frame.snapshot.privateFormatLineupResearch.flex[3].picks[2];
 item.gameStartAt=next;item.eventStartsAt=next;
 const original=frame.snapshot.rankedProps.find(x=>x.gameId===item.gameId);
 original.gameStartAt=next;original.eventStartsAt=next;
 const game=schedule.games.find(x=>x.id===item.gameId);
 game.startTimeUTC=next;
 const report=audit([frame],history,schedule,opts);
 assert.ok(report.excluded.cross_pacific_slate_lineup>=1);
 assert.equal(report.groups.flex_3,undefined);
 assert.equal(report.verifiedROI,null);
});
