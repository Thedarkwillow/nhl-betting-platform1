"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {reviewAll,settlementFor}=require("../src/nfl-market-settlement-gates.cjs");
const {MARKET_REGISTRY}=require("../src/nfl-market-registry.cjs");
const {pearson,standardize,audit}=require("../scripts/build-nfl-correlation-research.cjs");

test("every NFL market has two distinct platform-versioned settlement gates",()=>{
 const result=reviewAll();
 assert.equal(result.marketCount,132);
 assert.equal(result.totalChecks,264);
 assert.equal(result.records.length,2*MARKET_REGISTRY.length);
 assert.equal(result.eligibleAutomaticPicks,0);
 for(const row of result.records){
  assert.equal(row.autoPickEligible,false);
  assert.equal(row.originalMarketSettlementVersionCaptured,false);
  assert.equal(row.originalOfferTimestampAndSourceAuthenticated,false);
 }
});
test("current Underdog punter and quarter rules never leak into PrizePicks assumptions",()=>{
 const ud=settlementFor("punting_average","underdog");
 const pp=settlementFor("punting_average","prizepicks");
 assert.match(ud.publiclyDocumentedCaveat,/void/i);
 assert.equal(pp.publiclyDocumentedCaveat,null);
 const fg=settlementFor("fg_made_quarter","underdog");
 assert.match(fg.publiclyDocumentedCaveat,/grades even/i);
 const qt=settlementFor("quarters_5_plus_receiving_yards","underdog");
 assert.equal(qt.specificallyExcludeOvertimeUnderUdCurrentRules,true);
 assert.equal(qt.DNPAndVoidRuleReviewedForOriginalQuote,false);
 const punt=settlementFor("punt_gross_yards","underdog");
 assert.match(punt.publiclyDocumentedCaveat,/zero/i);
});
test("nfl statistical correlations require sample size, variance and per-pair identity",()=>{
 assert.equal(pearson([[1,3],[2,6],[3,9]]),1);
 assert.equal(pearson([[1,3],[1,4]]),null);
 assert.equal(pearson([[1,3],[2,2],[3,1]]),-1);
 const rows=[];
 const add=(season,w,id,rush,rec)=>rows.push({season,week:w,
  season_type:"REG",game_id:season+"_"+w+"_AAA_BBB",
  team:"AAA",player_id:id,position:"RB",rushing_yards:rush,
  receiving_yards:rec,passing_yards:0,passing_tds:0,
  rushing_tds:0,receiving_tds:0});
 for(const y of [2024,2025])for(let w=1;w<=15;w++)add(y,w,"rb1",w*5,3*w+1);
 for(let w=1;w<=6;w++)add(2026,w,"rb1",w*6,w*3);
 const r=audit(rows);
 const pair=r.groups.find(x=>x.id==="rb_rush_receive_yards");
 assert.equal(pair.enough2024to2025Training,1);
 assert.equal(pair.has2026Comparison,1);
 assert.ok(pair.shrinkMean>0);
 assert.equal(r.futureLineupCorrelationValidated,false);
 assert.equal(r.autoPickEligible,false);
 assert.equal(r.asOfHistoricalPredictionsFrozen,false);
 assert.equal(standardize(rows).counts.accepted,36);
});
test("duplicate game/player rows rejected rather than overcounted as correlations",()=>{
 const x={season:2025,week:1,season_type:"REG",game_id:"g1",
  team:"AAA",position:"QB",player_id:"p1"};
 assert.throws(()=>standardize([x,x]),/Duplicate/);
});
