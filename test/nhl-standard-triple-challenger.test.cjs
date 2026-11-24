"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {evaluateOne,freezeOnOriginalSelections,projectedRole,candidateC,priorRows}=
 require("../src/nhl-standard-triple-challenger.cjs");
const {shadowFrames,compare,officialOutcome}=require("../src/nhl-standard-triple-challenger-grader.cjs");
const {fitAtFreeze}=require("../src/nhl-standard-calibration-shadow.cjs");
const at="2026-11-09T16:00:00Z",gameStart="2026-11-09T22:00:00Z",gameId=2026020991;
const original={gameId,playerId:999901,team:"TOR",opponent:"NJD",type:"skater",market:"shotsOnGoal",
 line:2.5,tier:"Standard",lean:"Higher",projection:3.0,probability:.57681,
 model:"weighted-form-v1",capturedAt:"2026-11-09T15:58:00Z",eventStartsAt:gameStart,gameStartAt:gameStart};
const history={players:{"999901":{playerId:999901,type:"skater",
 games:Array.from({length:18},(_,i)=>({
  gameId:2026020100+i,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  gameState:"OFF",type:"skater",playerId:999901,team:"TOR",shotsOnGoal:i%4+1,
  points:i%3,assists:i%2,goals:i%3===0?1:0,blockedShots:i%3,
  timeOnIceSeconds:950+i*12
 }))}}};
const context={factors:{NJD:{shotsOnGoal:{ready:true,games:12,multiplier:.94}}}};
const approved={generatedAt:"2026-11-09T15:30:00Z",moneyPuck:{teams:{rows:{
 NJD:{gamesPlayed:20,shotsOnGoalAgainstPer60:28,xGoalsAgainstPer60:2.3},
 TOR:{gamesPlayed:20,shotsOnGoalAgainstPer60:29,xGoalsAgainstPer60:2.6}
 }}},dailyFaceoff:{lineups:{TOR:{sourceCapturedAt:"2026-11-09T15:40:00Z",
 sourceUpdatedAt:"2026-11-09T15:35:00Z",players:[{
 playerId:999901,team:"TOR",injuryStatus:"",gameTimeDecision:false,
 roles:[{categoryIdentifier:"ev",groupIdentifier:"f1"},
  {categoryIdentifier:"pp",groupIdentifier:"pp1"}]
 }]}}}};
function fresh(){
 const chosen={...original,probabilities:{higher:original.probability,lower:1-original.probability}};
 return {generatedAt:at,rankedProps:[chosen],
  individualPropSelections:[{...original}],model:"weighted-form-v1"};
}
test("A usage, B opponent and C distribution generate separate research-only forecasts",()=>{
 const result=evaluateOne(original,history,{asOf:at,approved,opponentContext:context});
 assert.equal(result.status,"research_only");
 for(const variant of ["champion","usage","matchup","distribution"]){
  assert.equal(result.variants[variant].status,"research_only");
  assert.equal(result.variants[variant].probabilities.calibrated,false);
 }
 assert.equal(result.variants.usage.role.ev,"f1");
 assert.equal(result.variants.matchup.officialSuppression,.94);
 assert.ok(result.variants.usage.historicalGames>=8);
 assert.equal(result.researchFilter.status==="shadow_candidate_only"||
  result.researchFilter.status==="abstain",true);
 assert.equal(result.automaticRecommendationEligible,false);
 assert.equal(result.verifiedPayoutEV,null);
});
test("Future same-day outcomes never leak into prior usage or NB distribution",()=>{
 const base=evaluateOne(original,history,{asOf:at,approved,opponentContext:context});
 const adversarial=structuredClone(history);
 adversarial.players["999901"].games.push({gameId,gameDate:"2026-11-09",gameState:"OFF",
  type:"skater",playerId:999901,shotsOnGoal:1000,timeOnIceSeconds:300});
 const future=evaluateOne(original,adversarial,{asOf:at,approved,opponentContext:context});
 assert.deepEqual(future.variants.usage,base.variants.usage);
 assert.deepEqual(future.variants.distribution,base.variants.distribution);
 assert.equal(priorRows(adversarial,original,at).length,18);
});
test("Postgame source data cannot alter historical frozen role and matchup",()=>{
 const after={...approved,generatedAt:"2026-11-10T01:00:00Z"};
 const r=evaluateOne(original,history,{asOf:at,approved:after,opponentContext:context});
 assert.equal(r.variants.usage.role,null);
 assert.equal(r.variants.matchup.moneyPuckPregameSourceUsed,false);
 assert.equal(projectedRole(after,original,at),null);
});
test("Historical unknown minutes, missing defense and low count sample abstain",()=>{
 const empty={players:{"999901":{playerId:999901,type:"skater",games:[]}}};
 const r=evaluateOne(original,empty,{asOf:at});
 assert.equal(r.variants.usage.status,"insufficient_prior_verified_minutes");
 assert.equal(r.variants.matchup.status,"insufficient_prior_opponent_games");
 assert.equal(r.variants.distribution.status,"insufficient_prior_count_games");
 assert.equal(r.researchFilter.status,"abstain");
});
test("Shadow is attached to the ORIGINAL standard pick and not a replacement",()=>{
 const snapshot=fresh();
 const shadow=freezeOnOriginalSelections(snapshot,history,{asOf:at,approved});
 assert.equal(shadow.originalStandardSelectionCount,1);
 assert.equal(shadow.rows[0].originalSelectedSide,"Higher");
 assert.equal(shadow.championSelectionsUnchanged,true);
 assert.equal(shadow.calibrationVerified,false);
 assert.equal(snapshot.individualPropSelections[0].lean,"Higher");
 assert.throws(()=>freezeOnOriginalSelections({...snapshot,
  rankedProps:[{...snapshot.rankedProps[0],line:7.5}]},history,{asOf:at}),/exactly one/);
});
test("Separate TRUE first-commit freeze from retrospective postgame reconstruction",()=>{
 const snap=fresh();
 snap.standardTripleChallenger=freezeOnOriginalSelections(snap,history,{asOf:at,approved});
 const frame={snapshot:snap,firstCommittedAt:"2026-11-09T16:01:00Z",gitHistoryCount:1};
 const before=shadowFrames([frame],history);
 assert.equal(before.rows.length,1);
 assert.equal(before.rows[0].outcome.status,"pending_official_player_stat");
 const complete=structuredClone(history);
 complete.players["999901"].games.push({gameId,gameDate:"2026-11-09",
  type:"skater",gameState:"OFF",shotsOnGoal:4,playerId:999901});
 const report=compare([frame],complete);
 assert.equal(report.actualPrecommitted.gradedDecisions,1);
 assert.equal(report.actualPrecommitted.variants.champion.correct,1);
 assert.equal(report.actualPrecommitted.originalShadowPicksFrozenBeforeGames,true);
 assert.equal(report.retrospectiveResearchOnly.originalShadowPicksFrozenBeforeGames,false);
 const old={...snap};delete old.standardTripleChallenger;
 const oldResult=compare([{...frame,snapshot:old}],complete);
 assert.equal(oldResult.actualPrecommitted.gradedDecisions,0);
 assert.equal(oldResult.retrospectiveResearchOnly.gradedDecisions,1);
 assert.equal(compare([{...frame,firstCommittedAt:"2026-11-09T22:00:00Z"}],complete)
  .actualPrecommitted.gradedDecisions,0);
});
test("Only original pre-completed-Git Standard outcomes are calibration training",()=>{
 const none=fitAtFreeze(null,at);
 assert.equal(none.fittedParameters,null);
 const records=Array.from({length:210},(_,i)=>({id:"x"+i,tier:"Standard",
  gameId:2026020001+Math.floor(i/5),
  gameStartAt:"2026-11-01T20:00:00Z",
  firstGitCommittedAt:"2026-10-31T20:00:00Z",
  officialGameDate:"2026-11-01",
  estimatedProbability:.6,
  selectionStatus:i%3===0?"incorrect":"correct"}));
 const j={kind:"private_immutable_source_linked_nhl_selected_predictions",
  builtAt:"2026-11-08T10:00:00Z",records};
 const fit=fitAtFreeze(j,at);
 assert.equal(fit.trainingRows,210);
 assert.equal(fit.trainingGames,42);
 assert.equal(fit.trainingDates,1);
 assert.equal(fit.fittedParameters,null); // 20 independent dates required
 const leaked=fitAtFreeze({...j,records:records.map(x=>({...x,
  officialGameDate:"2026-11-09",gameStartAt:"2026-11-09T20:00:00Z"}))},at);
 assert.equal(leaked.trainingRows,0);
});
test("Zero-inflation handles line zero as a PUSH and never treats zero as Lower",()=>{
 const p={...original,market:"goals",line:0,projection:.8};
 const counts=Array.from({length:25},(_,i)=>({gameDate:"2026-10-"+String(i%28+1).padStart(2,"0"),
  gameId:2026020300+i,goals:i%5===0?1:0,type:"skater"}));
 const alt=candidateC(p,counts);
 assert.equal(alt.status,"research_only");
 assert.equal(alt.probabilities.lower,0);
 assert.ok(alt.probabilities.push>=0);
 assert.equal(alt.probabilities.calibrated,false);
});

test("evening game with next-UTC-day start cannot leak same Pacific final into prior variants",()=>{
 const nextUtcStart="2026-11-19T00:30:00Z";
 const p={...original,gameStartAt:nextUtcStart,eventStartsAt:nextUtcStart,
  capturedAt:"2026-11-18T16:59:00Z"};
 const now="2026-11-18T17:00:00Z",pre=structuredClone(history);
 const before=evaluateOne(p,pre,{asOf:now,opponentContext:context});
 pre.players["999901"].games.push({gameId:2026020991,gameDate:"2026-11-18",
  gameState:"OFF",type:"skater",playerId:999901,team:"TOR",
  goals:100,assists:100,points:200,shotsOnGoal:200,
  blockedShots:200,timeOnIceSeconds:10000});
 pre.players["999901"].games.push({gameId:2026020992,gameDate:"2026-11-18",
  gameState:"OFF",type:"skater",playerId:999901,team:"TOR",
  goals:100,assists:100,points:200,shotsOnGoal:200,
  blockedShots:200,timeOnIceSeconds:10000});
 const after=evaluateOne(p,pre,{asOf:now,opponentContext:context});
 assert.equal(priorRows(pre,p,now).length,18);
 assert.deepEqual(after.variants.usage,before.variants.usage);
 assert.deepEqual(after.variants.distribution,before.variants.distribution);
});
