"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {verifiedGames,candidate,freeze,POLICY_EFFECTIVE}=require("../src/nhl-official-attempt-future-v1.cjs");
const now="2026-11-24T14:00:00Z",start="2026-11-25T02:00:00Z";
const selection={gameId:2026020500,playerId:8482001,
 team:"TOR",opponent:"NJD",market:"shotsOnGoal",line:2.5,tier:"Standard",
 lean:"Higher",probability:.61,capturedAt:"2026-11-24T13:58:00Z",
 gameStartAt:start,projection:3.2};
function archive(i){
 const day="2026-10-"+String(i+1).padStart(2,"0");
 const gameId=2026020200+i;
 const shotAttemptRows=["TOR","NJD"].flatMap((team,k)=>
  Array.from({length:18},(_,j)=>{
   const shots=j%3+1,missed=1,blocked=2;
   return {gameId,gameDate:day,playerId:k===0&&j===0?8482001:8500000+k*1000+i*20+j,
    team,shotAttempts:shots+missed+blocked,shotsOnGoal:shots,
    missedAttempts:missed,blockedAttempts:blocked,timeOnIceSeconds:925+j*9,
    powerPlayTimeOnIceSeconds:null,source:"official_final_pbp_sog_reconciled"};
  }));
 return {document:{requestedDate:day,generatedAt:day+"T23:00:00Z",
  complete:true,shotAttemptRows},firstGitAt:day+"T23:02:00Z"};
}
const archives=Array.from({length:30},(_,i)=>archive(i));
const snapshot={generatedAt:now,individualPropSelections:[selection],
 rankedProps:[{...selection,probabilities:{higher:.61,lower:.39}}]};
test("New SOG challenger requires genuinely old original-Git official attempts and 16 prior games",()=>{
 assert.ok(Date.parse(POLICY_EFFECTIVE)<Date.parse(now));
 const games=verifiedGames(archives,now);
 assert.equal(games.length,30);
 const m=candidate(selection,games);
 assert.equal(m.status,"research_only");
 assert.ok(m.verifiedPlayerGames>=16);
 assert.ok(m.verifiedOpponentGames>=5);
 for(const variant of ["base","attempt","defense","attemptRecency","defenseRecency"]){
  assert.equal(m.variants[variant].status,"research_only");
  assert.ok(Number.isFinite(m.variants[variant].estimate));
  assert.equal(m.variants[variant].calibrated,false);
 }
 const f=freeze(snapshot,archives);
 assert.equal(f.kind,"nhl_original_git_official_attempt_sog_future_v1");
 assert.equal(f.rows.length,1);
 assert.equal(f.rows[0].originalSide,"Higher");
 assert.equal(f.rows[0].line,2.5);
 assert.equal(f.originalAppOfferAuthenticated,false);
 assert.equal(f.modelPromoted,false);
 assert.equal(f.bettingEligible,false);
 assert.equal(f.rows[0].variants.defenseRecency.calibrated,false);
});
test("Duplicate, later-committed and same-day official result cannot contaminate pregame features",()=>{
 const base=freeze(snapshot,archives);
 const post={...archive(0),firstGitAt:"2026-11-25T05:00:00Z"};
 assert.equal(verifiedGames([...archives,post],now).length,30);
 const badFuture={...archive(0),document:{...archive(0).document,
  requestedDate:"2026-11-24",
  generatedAt:"2026-11-24T13:00:00Z",
  shotAttemptRows:archive(0).document.shotAttemptRows.map(x=>({...x,gameDate:"2026-11-24",
   shotsOnGoal:500,shotAttempts:503}))}};
 assert.equal(verifiedGames([...archives,badFuture],now).length,30);
 const duplic=structuredClone(archive(1));
 assert.equal(verifiedGames([...archives,duplic],now).length,29);
 assert.equal(freeze(snapshot,[...archives,post]).rows[0].variants.attemptRecency.estimate,
  base.rows[0].variants.attemptRecency.estimate);
});
test("Never infer attempts from SOG, and refuse post-commit changed original lines",()=>{
 assert.equal(freeze(snapshot,[]).rows[0].status,"shadow_abstain");
 assert.equal(freeze({...snapshot,rankedProps:[{...selection,line:3.5}]},archives)
  .status,"not_enrolled_invalid_original_offer_or_clock");
 const malformed=archives.map(x=>structuredClone(x));
 malformed[0].document.shotAttemptRows[0].shotAttempts=999;
 assert.equal(verifiedGames(malformed,now).length,29);
 const late={...snapshot,generatedAt:"2026-11-25T02:00:00Z"};
 assert.equal(freeze(late,archives).status,"not_enrolled_invalid_original_offer_or_clock");
});

test("Original first-Git prospective grader compares EXACT SOG offer against current model and Higher/Lower",()=>{
 const {grade}=require("../src/nhl-official-attempt-forward-grader-v1.cjs");
 const snap={...snapshot,sogActualAttemptFutureV1:freeze(snapshot,archives)};
 const frame={snapshot:snap,firstCommittedAt:"2026-11-24T14:01:00Z",gitHistoryCount:1};
 const actual={players:{[selection.playerId]:{games:[
  {gameId:selection.gameId,type:"skater",gameState:"OFF",
   shotsOnGoal:4}]}}};
 const report=grade([frame],actual);
 assert.equal(report.registered,1);
 assert.equal(report.decidedQualified,1);
 assert.equal(report.byVariant.defenseRecency.decided,1);
 assert.equal(report.byVariant.defenseRecency.alwaysHigherCorrect,1);
 assert.equal(report.byVariant.defenseRecency.alwaysLowerCorrect,0);
 assert.equal(report.byVariant.defenseRecency.championCorrect,1);
 assert.equal(report.byVariant.defenseRecency.sampleMinimumReached,false);
 assert.equal(report.certifiedEdge,false);
 assert.equal(report.calibrationApproved,false);
 assert.equal(report.placedWagers,0);
 assert.equal(grade([{...frame,firstCommittedAt:start}],actual).registered,0);
 const broken={...snap,sogActualAttemptFutureV1:{...snap.sogActualAttemptFutureV1,
  rows:[{...snap.sogActualAttemptFutureV1.rows[0],line:5.5}]}};
 assert.equal(grade([{...frame,snapshot:broken}],actual).registered,0);
 assert.equal(grade([frame,frame],actual).registered,1);
});
