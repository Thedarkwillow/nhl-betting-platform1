"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {diagnose}=require("../src/nfl-frozen-direction-diagnostic.cjs");
const source="2026-11-09T17:22:17Z",commit="2026-11-09T17:26:51Z",
 created="2026-11-09T17:26:51.150Z",start="2026-11-09T23:15:00Z";
const pick=(id,team,market,line,proj,side)=>({
 id,sourceGameId:"G1",historicalPlayerId:"P"+id,market,
 team,opponent:team==="MIN"?"BUF":"MIN",
 line,historicalProjection:proj,selectedSide:side,offeredSide:side,
 tier:"Standard",eventStartsAt:start,probability:null,autoPickEligible:false,
 last5Baseline:proj});
const snap={kind:"nfl_independent_partner_standard_directional_original_research_v1",
 createdAt:created,sourceBoardAsOfAt:source,
 selections:[pick("a","MIN","rushing_yards",50.5,60,"Higher"),
 pick("b","BUF","receptions",3.5,2,"Lower"),
 pick("c","BUF","receiving_yards",20.5,26,"Higher"),
 pick("d","MIN","receiving_yards",10.5,15,"Higher")]};
const outcome=(p,status,actual)=>({
 id:p.id,market:p.market,line:p.line,sourceGameId:p.sourceGameId,
 modelProjection:p.historicalProjection,modeledSide:p.selectedSide,
 firstGitCommittedAt:commit,status,
 ...(status==="decided"||status==="push"?{
 actual,actualSide:actual>p.line?"Higher":actual<p.line?"Lower":"Push",
 selectedSideResult:status==="decided"?
  (p.selectedSide===(actual>p.line?"Higher":"Lower")?"correct":"incorrect"):null,
 officialScheduleGameId:"official-G1"}:{})
});
const rows=[
 outcome(snap.selections[0],"decided",24),
 outcome(snap.selections[1],"decided",1),
 outcome(snap.selections[2],"decided",34),
 outcome(snap.selections[3],"pending_official_final")];
const grade={kind:"nfl_private_pregame_evidence_separated_outcome_audit_v1",
 generatedAt:"2026-11-10T09:38:00Z",nflverseFinalStatsNotPlatformSettlement:true,
 neverClaimNumericSideAsPreviouslyFrozenHigherLower:true,
 explicitFrozenDirections:{kind:"nfl_original_git_precommitted_directional_research_grade_v1",
  rows,registered:4,decided:3,correct:2,incorrect:1,pushes:0,pending:1,
  alwaysHigherOnExactSameSelectedLines:1,alwaysLowerOnExactSameSelectedLines:2}};
const input=[{snapshot:snap,gitHistoryCount:1,firstCommittedAt:commit}];
test("the Higher miss is correctly traced without counting any pending or fake alternative",()=>{
 const r=diagnose(grade,input);
 assert.equal(r.overall.registered,4);
 assert.equal(r.overall.decided,3);
 assert.equal(r.overall.higherChosen,2);
 assert.equal(r.overall.higherWrong,1);
 assert.equal(r.overall.lowerCorrect,1);
 assert.equal(r.overall.overForecast,2);
 assert.equal(r.byMarket.rushing_yards.higherWrong,1);
 assert.equal(r.byMarket.rushing_yards.meanProjectionMinusActual,36);
 assert.equal(r.overall.meanProjectionMinusActual,null);
 assert.equal(r.oneGameNotGeneralizable,true);
 assert.equal(r.payoutEV,null);
 assert.equal(r.rows.find(x=>x.id==="d").actual,null);
});
test("tampered original side, forecast, Git provenance, and result are refused",()=>{
 const altered=(field,value)=>({ ...grade,explicitFrozenDirections:{
  ...grade.explicitFrozenDirections,rows:rows.map((r,i)=>i===0?{...r,[field]:value}:r)}});
 assert.throws(()=>diagnose(altered("modeledSide","Lower"),input),/differs/);
 assert.throws(()=>diagnose(altered("actual",70),input),/inconsistent/);
 assert.throws(()=>diagnose(grade,[{...input[0],gitHistoryCount:2}]),/Refuse/);
 assert.throws(()=>diagnose(grade,[{...input[0],firstCommittedAt:start}]),/Refuse/);
 assert.throws(()=>diagnose({...grade,explicitFrozenDirections:{
  ...grade.explicitFrozenDirections,correct:3}},input),/reconciled/);
});
test("same-line hypothetical always Lower is not model promotion or user settlement",()=>{
 const r=diagnose(grade,input);
 assert.equal(r.overall.pairedAlwaysLowerCorrect,2);
 assert.equal(r.overall.pairedAlwaysHigherCorrect,1);
 assert.equal(r.productionModelPromotionApproved,false);
 assert.equal(r.calibratedProbabilities,false);
 assert.equal(r.officialPlatformSettlementsVerified,false);
 assert.equal(r.originalDirectionsCanNeverBeRevised,true);
});
