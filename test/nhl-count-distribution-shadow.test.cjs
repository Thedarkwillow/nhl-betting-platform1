"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {fitDispersion,negativeBinomialCdf,negativeBinomialProbabilities,
 challengerProbabilities,evaluateArchivedLines,gameClusterInterval}=
 require("../src/nhl-count-distribution-shadow.cjs");
const {estimateCountProbabilities}=require("../src/prop-probabilities.cjs");
test("NB probability 0 and recurrence conserve total including integer-line pushes",()=>{
 const mean=2,r=3;
 assert.ok(Math.abs(negativeBinomialCdf(0,mean,r)-(r/(r+mean))**r)<1e-10);
 const a=negativeBinomialProbabilities(mean,1.5,r);
 assert.equal(a.push,0);
 assert.ok(Math.abs(a.higher+a.lower-1)<1e-5);
 const b=negativeBinomialProbabilities(mean,2,r);
 assert.ok(Math.abs(b.higher+b.lower+b.push-1)<1e-5);
 assert.equal(negativeBinomialProbabilities(2,2.5,0),null);
 assert.equal(negativeBinomialCdf(3,-2,5),null);
});
test("small sample does not fit a rich distribution; no hidden boost if no dispersion",()=>{
 const s=fitDispersion([2,2,2,2,2,2,2]);
 assert.equal(s.status,"insufficient_sample_or_invalid");
 const p=challengerProbabilities(2,2.5,[2,2,2,2,2,2,2]);
 assert.deepEqual(p.challenger,estimateCountProbabilities(2,2.5));
 assert.equal(p.challengerUsesNB,false);
 const low=fitDispersion(Array(15).fill(2));
 assert.equal(low.r,null);
 assert.equal(low.varianceRatio,1);
 assert.equal(challengerProbabilities(2,2.5,Array(15).fill(2)).challengerUsesNB,false);
});
test("prior overdispersion yields a wider-tailed research-only NB candidate",()=>{
 const history=[0,0,0,0,0,0,0,0,0,0,9,9,9,9,9,9,9,9,9,9];
 const m=history.reduce((s,x)=>s+x,0)/history.length;
 const d=fitDispersion(history);
 assert.equal(d.status,"overdispersed_shadow");
 assert.ok(d.varianceRatio>1&&d.varianceRatio<=5);
 assert.ok(d.r>0);
 const p=challengerProbabilities(m,9.5,history);
 assert.equal(p.challengerUsesNB,true);
 assert.notEqual(p.challenger.higher,p.champion.higher);
 assert.equal(p.prospectiveCalibrated,false);
 assert.equal(p.releaseStatus,"research_shadow_only");
});
test("true real-line hit event is computed from official outcome with strict prior date, ignores push and duplicates",()=>{
 const stats=[0,0,1,0,8,0,4,0,6,0,2,3];
 const logs=stats.map((shots,i)=>({gameId:2025020010+i,
  gameDate:"2026-01-"+String(i+1).padStart(2,"0"),
  shotsOnGoal:shots}));
 const last=logs[11];
 const qs=[
  {season:"2025-26",playerId:90,gameId:last.gameId,market:"shotsOnGoal",line:2.5,
   actual:last.shotsOnGoal,outcome:"Higher"},
  {season:"2025-26",playerId:90,gameId:last.gameId,market:"shotsOnGoal",line:2.5,
   actual:last.shotsOnGoal,outcome:"Higher"},
  {season:"2025-26",playerId:90,gameId:last.gameId,market:"shotsOnGoal",line:3,
   actual:last.shotsOnGoal,outcome:"Push"},
  {season:"2025-26",playerId:90,gameId:last.gameId,market:"shotsOnGoal",line:0.5,
   actual:last.shotsOnGoal,outcome:"Lower"},
  {season:"2025-26",playerId:90,gameId:last.gameId,market:"shotsOnGoal",line:4.5,
   actual:9,outcome:"Higher"}];
 const r=evaluateArchivedLines(qs,{"90":logs});
 assert.equal(r.overall.decisions,1);
 assert.equal(r.sourceExcluded.duplicate_exact_player_game_stat_line,1);
 assert.equal(r.sourceExcluded.push_no_binary_direction,1);
 assert.equal(r.sourceExcluded.source_official_direction_conflict,1);
 assert.equal(r.sourceExcluded.unverified_official_outcome,1);
 assert.equal(r.bySeason["2025-26"].decisions,1);
 assert.equal(r.originalHistoricalPregameModelSnapshots,false);
 assert.equal(r.modelReleaseEligible,false);
 assert.equal(r.overall.championBrier!==null,true);
 assert.equal(r.overall.fixedHalfBrier,0.25);
 assert.equal(r.overall.fixedHalfLogLoss,Number(Math.log(2).toFixed(6)));
 assert.ok(r.overall.observedHigherFrequency>=0&&r.overall.observedHigherFrequency<=1);
 assert.equal(r.overall.higherOutcomes,1);
 assert.equal(r.challengerBeatsFixedHalfOnSelectedArchive, r.overall.challengerBrier<0.25);
});
test("chronological prior excludes high-variance record on game-day even if official result later known",()=>{
 const day="2026-01-11";
 const games=Array.from({length:10},(_,i)=>({
  gameId:2026020100+i,gameDate:"2026-01-"+String(i+1).padStart(2,"0"),
  saves:i%2?25:50}));
 const current={gameId:2026020111,gameDate:day,saves:23};
 const qs=[{season:"2026-27",playerId:20,gameId:current.gameId,market:"saves",
  actual:23,line:22.5,outcome:"Higher"}];
 const logsA={"20":[...games,current]},
  logsB={"20":[...games,current,{gameId:2026020222,gameDate:day,saves:999}]};
 const a=evaluateArchivedLines(qs,logsA),b=evaluateArchivedLines(qs,logsB);
 assert.deepEqual(a.byMarket.saves,b.byMarket.saves);
 assert.equal(a.overall.estimatedOverdispersedN,1);
 assert.equal(a.bySeason["2025-26"].decisions,0);
 assert.equal(a.gameClusterDifferenceInterval,null);
});
test("bootstrap is null for very few distinct games and NEVER marks profitability",()=>{
 const rows=[{gameId:123,champion:{higher:.6},challenger:{higher:.4},higherActual:1}];
 assert.equal(gameClusterInterval(rows),null);
});
