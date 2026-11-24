"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {sogOpportunity,sogAttempts,usageData,moneyPuckGate}=
 require("../src/nhl-sog-opportunity-challengers.cjs");
const {evaluateOne,freezeOnOriginalSelections}=
 require("../src/nhl-standard-triple-challenger.cjs");
const {compare}=require("../src/nhl-standard-triple-challenger-grader.cjs");

const now="2026-11-12T17:00:00Z",start="2026-11-13T01:00:00Z";
const original={gameId:2026020912,playerId:888991,team:"TOR",opponent:"NJD",
 market:"shotsOnGoal",line:2.5,tier:"Standard",lean:"Lower",
 projection:2.1,probability:.65,capturedAt:"2026-11-12T16:57:00Z",
 eventStartsAt:start,gameStartAt:start,model:"weighted-form-v1"};
const prior=Array.from({length:15},(_,i)=>({
  gameId:2026020300+i,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  type:"skater",gameState:"OFF",playerId:888991,team:"TOR",
  shotsOnGoal:i%4+1,timeOnIceSeconds:900+i*8
}));
const history={players:{"888991":{type:"skater",playerId:888991,games:prior}}};
const context={factors:{NJD:{shotsOnGoal:{ready:true,games:10,multiplier:.96}}}};
const approved={
 generatedAt:"2026-11-12T16:30:00Z",
 moneyPuck:{skaters:{
  sourceCapturedAt:"2026-11-12T16:29:00Z",
  rows:{"888991":{playerId:888991,team:"TOR",gamesPlayed:15,
   shotAttemptsPer60:13,shotsOnGoalPer60:7.5,xOnGoalPer60:7.2,
   sourceObservedAt:"2026-11-12T16:29:00Z"}}
 }},
 dailyFaceoff:{lineups:{TOR:{
  sourceCapturedAt:"2026-11-12T16:35:00Z",
  sourceUpdatedAt:"2026-11-12T16:33:00Z",
  players:[{playerId:888991,team:"TOR",injuryStatus:"",
   gameTimeDecision:false,roles:[
   {categoryIdentifier:"ev",groupIdentifier:"f1"},
   {categoryIdentifier:"pp",groupIdentifier:"pp1"}]}]
 }}}
};
const official=(p=original,h=history,c=context,s=approved)=>
 evaluateOne(p,h,{asOf:now,opponentContext:c,approved:s});
const frozen=()=>{
 const snap={generatedAt:now,rankedProps:[{...original}],
   individualPropSelections:[{...original}]};
 snap.standardTripleChallenger=freezeOnOriginalSelections(snap,history,
   {asOf:now,approved});
 return snap;
};
test("SOG shadow freezes distinct official-minute and pregame attempts variants",()=>{
 const got=official();
 assert.equal(got.status,"research_only");
 assert.equal(got.variants.sogOpportunity.status,"research_only");
 assert.equal(got.variants.sogAttempts.status,"research_only");
 assert.equal(got.sogShadowPolicyVersion,"sog-unfitted-opportunity-attempts-v1");
 assert.ok(got.variants.sogOpportunity.historicalExpectedMinutes>0);
 assert.equal(got.variants.sogOpportunity.officialOpponentUsed,true);
 assert.equal(got.variants.sogAttempts.moneyPuckShotAttemptsPer60,13);
 assert.equal(got.variants.sogAttempts.roleUsed,true);
 assert.equal(got.automaticRecommendationEligible,false);
 assert.equal(got.verifiedPayoutEV,null);
 assert.equal(got.originalSelectedSide,"Lower");
 assert.equal(got.researchFilter.status==="abstain"||
   got.researchFilter.status==="shadow_candidate_only",true);
});
test("SOG excludes postgame history and recent source snapshots captured after freeze",()=>{
 const base=official();
 const poisoned=structuredClone(history);
 poisoned.players["888991"].games.push({
  gameId:original.gameId,gameDate:"2026-11-13",gameState:"OFF",
  type:"skater",shotsOnGoal:100,timeOnIceSeconds:1800
 });
 const same=official(original,poisoned);
 assert.deepEqual(same.variants.sogOpportunity,base.variants.sogOpportunity);
 assert.deepEqual(same.variants.sogAttempts,base.variants.sogAttempts);
 const future=structuredClone(approved);
 future.moneyPuck.skaters.sourceCapturedAt="2026-11-13T05:00:00Z";
 future.moneyPuck.skaters.rows["888991"].sourceObservedAt="2026-11-13T05:00:00Z";
 assert.equal(official(original,history,context,future).variants.sogAttempts.status,
  "money_puck_source_missing_stale_or_future");
 assert.equal(moneyPuckGate(original,future,now).status,
  "money_puck_source_missing_stale_or_future");
});
test("Missing pregame attempts/verified minutes abstains; never replaces champion",()=>{
 const broken=structuredClone(approved);
 delete broken.moneyPuck.skaters.rows["888991"].shotAttemptsPer60;
 assert.equal(official(original,history,context,broken).variants.sogAttempts.status,
   "money_puck_attempt_rates_invalid");
 const thin={players:{"888991":{type:"skater",games:prior.slice(-3)}}};
 assert.equal(usageData(prior.slice(-3)).status,"insufficient_prior_official_minutes");
 assert.equal(official(original,thin).variants.sogOpportunity.status,
   "insufficient_prior_official_minutes");
 const other=official({...original,market:"points"});
 assert.equal(other.variants.sogOpportunity.status,"not_standard_shots_on_goal");
 assert.equal(other.variants.sogAttempts.status,"not_standard_shots_on_goal");
});
test("Actual Git-frozen original SOG strategies grade only after official final",()=>{
 const snap=frozen(), row=snap.standardTripleChallenger.rows[0];
 assert.equal(row.variants.sogOpportunity.status,"research_only");
 assert.equal(row.variants.sogAttempts.status,"research_only");
 assert.equal(row.originalSelectedSide,"Lower");
 assert.equal(snap.individualPropSelections[0].lean,"Lower");
 const frame={snapshot:snap,firstCommittedAt:"2026-11-12T17:01:00Z",gitHistoryCount:1};
 const before=compare([frame],history).actualPrecommitted;
 assert.equal(before.gradedDecisions,0);
 const finished=structuredClone(history);
 finished.players["888991"].games.push({gameId:original.gameId,
  gameDate:"2026-11-13",type:"skater",gameState:"OFF",shotsOnGoal:4});
 const report=compare([frame],finished).actualPrecommitted;
 assert.equal(report.gradedDecisions,1);
 assert.equal(report.variants.sogOpportunity.decided,1);
 assert.equal(report.variants.sogAttempts.decided,1);
 assert.equal(report.variants.sogAttempts.alwaysHigherOnSameLines,1);
 assert.equal(report.originalShadowPicksFrozenBeforeGames,true);
 const originalOld=structuredClone(snap);
 const oldRow=originalOld.standardTripleChallenger.rows[0];
 delete oldRow.variants.sogOpportunity;
 delete oldRow.variants.sogAttempts;
 delete oldRow.decisions.sogOpportunity;
 delete oldRow.decisions.sogAttempts;
 delete oldRow.sogShadowPolicyVersion;
 const without=compare([{...frame,snapshot:originalOld}],finished).actualPrecommitted;
 assert.equal(without.variants.sogOpportunity.decided,0);
 assert.equal(without.variants.sogAttempts.decided,0);
 assert.equal(compare([{...frame,firstCommittedAt:start}],finished)
  .actualPrecommitted.gradedDecisions,0);
});
test("SOG MoneyPuck evidence requires exact team and genuine source timestamp",()=>{
 const bad=structuredClone(approved);
 bad.moneyPuck.skaters.rows["888991"].team="NJD";
 assert.equal(sogAttempts(original,prior,context,bad,now).status,
  "money_puck_player_missing_identity_or_pregame_proof");
 const bad2=structuredClone(approved);
 bad2.moneyPuck.skaters.rows["888991"].sourceObservedAt="2026-11-12T16:40:00Z";
 assert.equal(sogAttempts(original,prior,context,bad2,now).status,
  "money_puck_player_missing_identity_or_pregame_proof");
});
