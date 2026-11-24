"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {candidatePointsStability,POLICY}=require("../src/nhl-points-stability-shadow.cjs");
const {evaluateOne,freezeOnOriginalSelections,priorRows}=
 require("../src/nhl-standard-triple-challenger.cjs");
const {shadowFrames,MODES}=require("../src/nhl-standard-triple-challenger-grader.cjs");
const {scoreboard}=require("../src/nhl-standard-forward-scoreboard.cjs");
const at="2026-11-19T16:00:00Z",start="2026-11-19T23:00:00Z",playerId=999602;
const original={gameId:2026029991,playerId,market:"points",
 line:.5,tier:"Standard",team:"MTL",opponent:"NJD",lean:"Lower",
 projection:.6,probability:.55,capturedAt:"2026-11-19T15:56:00Z",
 gameStartAt:start,eventStartsAt:start,model:"weighted-form-v1"};
const context={factors:{NJD:{points:{ready:true,games:12,multiplier:.95}}}};
function games(){
 return Array.from({length:22},(_,i)=>{
  const goals=i%7===0?1:0,assists=i%3===0?1:0;
  return {gameId:2026020600+i,playerId,type:"skater",team:"MTL",
   gameState:"OFF",gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
   goals,assists,points:goals+assists,shotsOnGoal:1+i%3,
   timeOnIceSeconds:900+i*7};
 });
}
function history(){
 const players={[String(playerId)]:{playerId,type:"skater",games:games()}};
 // Thirteen previously completed full two-team games establish a real
 // past-only opponent context for the integration test.
 for(let k=0;k<19;k++){
  const id=900000+k,team=k<9?"MTL":"NJD";
  players[String(id)]={playerId:id,type:"skater",games:games().slice(-13).map(g=>({
   ...g,playerId:id,team,points:k%3===0?1:0,
   goals:0,assists:k%3===0?1:0}))};
 }
 return {players};
}
test("points-specific research is minutes/shot/opponent aware but does not modify champion",()=>{
 const h=history(),p=evaluateOne(original,h,{asOf:at,opponentContext:context});
 assert.equal(p.status,"research_only");
 assert.equal(p.pointsShadowPolicyVersion,POLICY);
 assert.ok(MODES.includes("pointsStability"));
 const a=p.variants.pointsStability;
 assert.equal(a.status,"research_only");assert.equal(a.policyVersion,POLICY);
 assert.equal(a.market,"points");assert.equal(a.priorGames,20);
 assert.equal(a.opponentGames,12);assert.equal(a.calibrated,false);
 assert.equal(a.releaseApproved,false);
 assert.equal(a.verifiedSportsbookOrPlatformOdds,false);
 assert.ok(a.past5ShotRatePer60>0);
 assert.ok(Math.abs(a.probabilities.higher+a.probabilities.lower+
  a.probabilities.push-1)<.00001);
 assert.equal(p.variants.champion.estimate,original.projection);
 assert.equal(p.originalSelectedSide,"Lower");
 assert.equal(p.automaticRecommendationEligible,false);
});
test("future and same-day final game events cannot leak into new points model",()=>{
 const h=history(),p=priorRows(h,original,at);
 const base=candidatePointsStability(original,p,context);
 const poisoned=structuredClone(h);
 poisoned.players[String(playerId)].games.push({gameId:original.gameId,
  gameDate:"2026-11-19",type:"skater",gameState:"OFF",team:"MTL",
  points:30,assists:0,goals:30,shotsOnGoal:100,timeOnIceSeconds:1700});
 assert.deepEqual(candidatePointsStability(original,
  priorRows(poisoned,original,at),context),base);
 assert.equal(base.lastPriorOfficialDate,"2026-10-22");
});
test("stale or thin official evidence abstains instead of inventing a points edge",()=>{
 const p=priorRows(history(),original,at);
 assert.equal(candidatePointsStability(original,p.slice(0,8),context).status,
  "insufficient_same_team_prior_points_and_minutes");
 assert.equal(candidatePointsStability(original,p,null).status,
  "insufficient_prior_opponent_point_context");
 const bad=p.map((r,i)=>({...r,timeOnIceSeconds:i>=12&&i%2===0?210:2100}));
 assert.equal(candidatePointsStability(original,bad,context).status,
  "unstable_recent_ice_time");
 const badPoints=p.map((r,i)=>i===4?{...r,points:99}:r);
 assert.equal(candidatePointsStability(original,badPoints,context).priorGames,20);
 assert.equal(candidatePointsStability({...original,market:"shotsOnGoal"},p,context).status,
  "not_points_market");
});
test("zero-point mixtures preserve integer-line pushes as pushes, not Lower",()=>{
 const r=candidatePointsStability({...original,line:0},
  priorRows(history(),original,at),context);
 assert.equal(r.status,"research_only");
 assert.equal(r.probabilities.lower,0);
 assert.ok(r.probabilities.push>=0);
 assert.ok(Math.abs(r.probabilities.higher+r.probabilities.push-1)<.00001);
});
test("only an original first-Git pregame snapshot can earn new points-challenger grade",()=>{
 const h=history();
 const snapshot={generatedAt:at,rankedProps:[{...original}],
  individualPropSelections:[{...original}]};
 const unchanged=JSON.stringify(snapshot);
 snapshot.standardTripleChallenger=freezeOnOriginalSelections(snapshot,h,
  {asOf:at,opponentContext:context});
 assert.equal(JSON.stringify({generatedAt:snapshot.generatedAt,
  rankedProps:snapshot.rankedProps,individualPropSelections:snapshot.individualPropSelections}),
  unchanged);
 const frame={snapshot,firstCommittedAt:"2026-11-19T16:01:00Z",gitHistoryCount:1};
 const frozen=shadowFrames([frame],h);
 assert.equal(frozen.rows.length,1);
 assert.equal(frozen.rows[0].outcome.status,"pending_official_player_stat");
 assert.equal(scoreboard(frozen.rows).byMarket.points.byVariant.pointsStability.decided,0);
 const complete=structuredClone(h);
 complete.players[String(playerId)].games.push({gameId:original.gameId,
  type:"skater",gameState:"OFF",gameDate:"2026-11-19",team:"MTL",
  playerId,points:1});
 const done=shadowFrames([frame],complete);
 assert.equal(done.rows[0].outcome.status,"decided");
 assert.equal(scoreboard(done.rows).byMarket.points.byVariant.pointsStability.decided,1);
 const old=structuredClone(frame);
 delete old.snapshot.standardTripleChallenger.rows[0].variants.pointsStability;
 delete old.snapshot.standardTripleChallenger.rows[0].decisions.pointsStability;
 delete old.snapshot.standardTripleChallenger.rows[0].pointsShadowPolicyVersion;
 assert.equal(scoreboard(shadowFrames([old],complete).rows)
  .byMarket.points.byVariant.pointsStability.decided,0);
 const late={...frame,firstCommittedAt:start};
 assert.equal(shadowFrames([late],complete).rows.length,0);
});

test("UTC midnight rollover cannot import same-Pacific-date completed stats",()=>{
 const rolled={...original,gameStartAt:"2026-11-19T00:30:00Z"};
 const {pacificGameDate}=require("../src/nhl-points-stability-shadow.cjs");
 assert.equal(pacificGameDate(rolled.gameStartAt),"2026-11-18");
 const h=history(),base=priorRows(h,rolled,at);
 h.players[String(playerId)].games.push(
  {gameId:rolled.gameId,playerId,type:"skater",team:"MTL",gameState:"OFF",
   gameDate:"2026-11-18",points:40,goals:40,assists:0,
   shotsOnGoal:99,timeOnIceSeconds:2000},
  {gameId:2026028001,playerId,type:"skater",team:"MTL",gameState:"OFF",
   gameDate:"2026-11-18",points:40,goals:40,assists:0,
   shotsOnGoal:99,timeOnIceSeconds:2000}
 );
 const clean=priorRows(h,rolled,at);
 assert.deepEqual(clean,base);
 assert.deepEqual(candidatePointsStability(rolled,[...base,
  ...h.players[String(playerId)].games.slice(-2)],context),
  candidatePointsStability(rolled,base,context));
});
