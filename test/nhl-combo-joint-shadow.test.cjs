"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {comboJointSample,researchComboProbability,priorMemberGames}=
 require("../src/nhl-combo-joint-shadow.cjs");
const {auditComboBoard,buildReports}=
 require("../scripts/build-nhl-period-combo-models.cjs");
const id1=8479001,id2=8479002,game1=2026020601,game2=2026020702;
const at="2026-11-06T18:00:00Z",captured="2026-11-06T17:59:30Z",
 future="2026-11-07T02:00:00Z";
const day=i=>"2026-10-"+String(i+1).padStart(2,"0");
function history(cross=false){
 const mk=(playerId,shift)=>({playerId,type:"skater",
  games:Array.from({length:12},(_,i)=>({
   gameId:2026020100+i+(cross?shift:0),
   gameDate:day(i),shotsOnGoal:playerId===id1?2+(i%3):1+(i%2),
   goals:i%6===0?1:0,saves:null}))});
 return {players:{[id1]:mk(id1,0),[id2]:mk(id2,500)}};
}
const offer={market:"shotsOnGoalCombo",line:3.5,scoringOperator:"sum",
 settlementPeriod:"full_game",membersProvenance:"structured_original_source_metadata",
 sourceCapturedAt:captured,members:[
  {playerId:id1,role:"skater",officialGameId:game1,gameStartAt:future},
  {playerId:id2,role:"skater",officialGameId:game1,gameStartAt:future}
 ]};
test("observed combo joint stats use real same-game exact player-game pairs",()=>{
 const h=history();
 const arr=comboJointSample([h.players[id1],h.players[id2]],"shotsOnGoal",at);
 assert.equal(arr.length,12);
 assert.equal(arr[0].value,3);
 const x=researchComboProbability(offer,h,{asOf:at});
 assert.equal(x.eligible,true);
 assert.equal(x.relation,"same_game");
 assert.equal(x.sharedGameSamples,12);
 assert.equal(x.historicalJointMembershipProven,true);
 assert.equal(x.probabilities.calibrated,false);
 assert.equal(x.eligibleForOptimizedLineups,false);
 assert.equal(x.originalPlatformSettlementVerified,false);
 assert.ok(x.probabilities.higher>0&&x.probabilities.higher<1);
 assert.ok(x.probabilities.lower>0&&x.probabilities.lower<1);
});
test("future same-date stats never leak backward into the combo distribution",()=>{
 const h=history();
 h.players[id1].games.push({gameId:2026029000,gameDate:"2026-11-06",shotsOnGoal:999});
 h.players[id2].games.push({gameId:2026029000,gameDate:"2026-11-06",shotsOnGoal:999});
 const x=researchComboProbability(offer,h,{asOf:at});
 assert.equal(x.sharedGameSamples,12);
 assert.ok(x.meanSum<10);
});
test("cross-game combos use marginals, never fabricated same-game history",()=>{
 const h=history(true);
 const cross={...offer,members:[
  offer.members[0],{...offer.members[1],officialGameId:game2,
   gameStartAt:"2026-11-07T03:30:00Z"}]};
 const x=researchComboProbability(cross,h,{asOf:at});
 assert.equal(x.eligible,true);
 assert.equal(x.relation,"cross_game");
 assert.deepEqual(x.marginalSamples,[12,12]);
 assert.equal(x.independenceAssumptionUnverified,true);
 assert.equal(x.historicalJointMembershipProven,false);
 assert.equal(x.eligibleForAutoHigherLower,false);
 assert.equal(x.eligibleForOptimizedLineups,false);
 assert.ok(x.probabilities.higher>=0&&x.probabilities.higher<=1);
 assert.equal(comboJointSample([h.players[id1],h.players[id2]],"shotsOnGoal",at).length,0);
});
test("insufficient true co-games does not silently switch into independent model",()=>{
 const h=history();
 h.players[id2].games=h.players[id2].games.slice(0,6);
 const r=researchComboProbability(offer,h,{asOf:at});
 assert.equal(r.eligible,false);
 assert.equal(r.reason,"insufficient_exact_co_game_history");
 assert.equal(r.availableCoGames,6);
});
test("first-party source identities, exact line and timing remain mandatory",()=>{
 const h=history();
 assert.equal(researchComboProbability({...offer,membersProvenance:
  "parsed_from_label"},h,{asOf:at}).eligible,false);
 assert.equal(researchComboProbability({...offer,
  sourceCapturedAt:"2026-11-06T16:00:00Z"},h,{asOf:at}).reason,
  "stale_or_missing_original_combo_capture");
 assert.equal(researchComboProbability({...offer,scoringOperator:"average"},
  h,{asOf:at}).reason,"exact_combo_scoring_operator_or_period_not_verified");
});
test("missing provider metadata yields audited abstention, not synthetic picks",()=>{
 const h=history(),board={rows:[
  {...offer,market:"Shots on Goal (Combo)"},
  {market:"Goals (Combo)",line:1.5,capturedAt:captured},
  {market:"Shots on Goal",line:3.5},
  {...offer,membersProvenance:"text_only"}]};
 const out=auditComboBoard(board,h,{now:at});
 assert.equal(out.comboRows,3);
 assert.equal(out.withExactStructuredMembers,1);
 assert.equal(out.sameGameResearchReady,1);
 assert.equal(out.candidateProbabilities.length,1);
 assert.equal(out.candidateProbabilities[0].liveEligible,false);
 assert.equal(out.originalProviderAuthenticated,false);
 assert.equal(out.liveLineupEligible,false);
 assert.equal(out.reasons.original_combo_members_not_structured,1);
 assert.equal(out.reasons.exact_combo_scoring_operator_or_period_not_verified,1);
});
test("historical period and combo reports build without any fabricated platform quote",()=>{
 const pId=String(id1),p={"1":[],"2":[],"3":[]};
 for(let i=0;i<10;i++)for(const period of [1,2,3])
  p[period].push({period,playedInPeriod:true,playerId:id1,
   gameId:2026020100+i,gameDate:day(i),shotsOnGoal:i%2,
   goals:0,assists:0,points:0,blockedShots:0,hits:1,faceoffsWon:2});
 const hist={kind:"nhl_official_period_history_v1",players:{[pId]:p},
  sourceDates:[day(0),day(9)]};
 const reports=buildReports({periodHistory:hist,playerHistory:history(),
  board:{rows:[{market:"Goals (Combo)",line:1.5}]},now:at});
 assert.equal(reports.period.playerCount,1);
 assert.equal(reports.walkforward.productionPromotionAllowed,false);
 assert.equal(reports.combos.comboRows,1);
 assert.equal(reports.combos.withExactStructuredMembers,0);
 assert.equal(reports.period.automaticLineupEligible,false);
});
