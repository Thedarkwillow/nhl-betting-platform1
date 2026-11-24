"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit}=require("../src/paired-historical-game-projection.cjs");
const sample=()=>Array.from({length:48},(_,i)=>({
 season:2025,week:1+Math.floor(i/3)%16,gameId:"2025-"+i,
 playerId:"player"+i,market:"receiving_yards",
 observed:50,baseline:65,challenger:54
}));
test("matched historical NFL opponent/usage challenger uses independent game resampling",()=>{
 const x=audit(sample(),{draws:600});
 assert.equal(x.observations,48);
 assert.equal(x.games,48);
 assert.equal(x.weeks,16);
 assert.ok(x.gameBootstrap95.lower>0);
 assert.ok(x.descriptiveImprovement);
 assert.equal(x.modelPromoted,false);
 assert.equal(x.independentlyValidatedFutureOriginalLines,false);
 assert.deepEqual(x,audit(sample(),{draws:600}));
});
test("few NFL slates or games cannot establish even descriptive evidence",()=>{
 const x=audit(sample().slice(0,9));
 assert.equal(x.gameBootstrap95,null);
 assert.equal(x.minimumDescriptiveSupport,false);
 assert.equal(x.descriptiveImprovement,false);
});
test("repeated player-market game, invalid values and NFL weeks fail closed",()=>{
 const xs=sample();
 xs[1]={...xs[0]};
 assert.equal(audit(xs).status,"ambiguous_repeated_player_game_market");
 const ys=sample();ys[0].challenger=NaN;
 assert.equal(audit(ys).status,"invalid_historical_feature_evidence");
 const zs=sample();zs[0].week=19;
 assert.equal(audit(zs).status,"invalid_historical_feature_evidence");
});
test("game weighted effect does not treat a crowded single game as independent trials",()=>{
 const rows=Array.from({length:30},(_,i)=>({
  season:2025,week:1,gameId:"game1",playerId:String(i),market:"rushing_yards",
  observed:10,baseline:1,challenger:10
 })).concat(Array.from({length:11},(_,i)=>({
  season:2025,week:2+i,gameId:"other"+i,playerId:"p"+i,market:"rushing_yards",
  observed:10,baseline:10,challenger:15
 })));
 const x=audit(rows,{draws:300});
 assert.equal(x.games,12);assert.equal(x.observations,41);
 assert.ok(x.gameBootstrap95);
 assert.ok(x.baselineMinusChallengerGameWeighted<0);
 assert.equal(x.descriptiveImprovement,false);
});

test("negative official rushing/receiving yards are valid matched outcomes, not invalid data",()=>{
 const rows=sample().map((v,i)=>({
  ...v,market:i%2?"rushing_yards":"receiving_yards",
  observed:i%5===0?-3:50
 }));
 const x=audit(rows,{draws:400});
 assert.equal(x.status,"paired_prior_week_historical_research_only");
 assert.equal(x.observations,rows.length);
 assert.equal(x.games,rows.length);
 assert.ok(x.gameBootstrap95);
 assert.equal(x.independentlyValidatedFutureOriginalLines,false);
 const negativeForecast=rows.map(x=>({...x}));negativeForecast[0].challenger=-2;
 assert.equal(audit(negativeForecast).status,"invalid_historical_feature_evidence");
});
