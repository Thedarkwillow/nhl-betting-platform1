"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseSkaterGameCsv,estimateFromPast,comparePastOnly,normalizeDay}=require("../src/nhl-moneypuck-game-lab.cjs");
const head=["playerId","gameId","gameDate","situation","icetime","I_F_xOnGoal",
 "I_F_xGoals","I_F_shotsOnGoal","I_F_goals",...Array.from({length:12},(_,i)=>"unused"+i)].join(",");
const record=(id,gameId,day,sit="all",shots=2,goals=0,xOnGoal=6,xGoals=.8)=>([
 id,gameId,day,sit,1200,xOnGoal,xGoals,shots,goals,...Array(12).fill(0)]).join(",");
const games=[];
for(let i=1;i<=6;i++)games.push(record(111,2024020000+i,"2024-10-"+String(10+i).padStart(2,"0")));
games.push(record(111,2025020001,"2025-10-10","all",4,1));
const csv=head+"\n"+[...games,record(111,2024020001,"2024-10-11","5on5")].join("\n")+"\n";
test("strict MoneyPuck game-level skater parsing and non-all exclusion",()=>{
 const parsed=parseSkaterGameCsv(csv);
 assert.equal(parsed.rows.length,7);assert.equal(parsed.excludedNonAll,1);
 assert.equal(parsed.rows[0].gameDate,"2024-10-11");
 assert.equal(normalizeDay("20251010"),"2025-10-10");
 assert.equal(normalizeDay("2025-02-30"),null);
 assert.equal(parsed.historicallyReconstructedNotPublishedPregame,true);
});
test("MoneyPuck 75/25 xOnGoal remains an isolated count shadow",()=>{
 const history=parseSkaterGameCsv(csv).rows.slice(0,5);
 const forecast=estimateFromPast(history,"shotsOnGoal");
 assert.equal(forecast.champion,2);
 assert.equal(forecast.sourceMean,6);
 assert.equal(forecast.shadow,3);
 assert.equal(forecast.estimatedMinutes,20);
});
test("holdout uses past-only game features, never in-sample current-game xG",()=>{
 const parsed=parseSkaterGameCsv(csv);
 const lab=comparePastOnly(parsed.rows);
 assert.equal(lab.holdoutSeason,"2025-26");
 assert.equal(lab.byMarket.shotsOnGoal.observations,1);
 assert.equal(lab.byMarket.shotsOnGoal.championMAE,2);
 assert.equal(lab.byMarket.shotsOnGoal.shotQualityShadowMAE,1);
 assert.equal(lab.scoredRows[0].lastFeatureDay,"2024-10-16");
 assert.equal(lab.lineOffersUsed,false);
 assert.equal(lab.modelHitRate,null);
 assert.equal(lab.modelDeployed,false);
});
test("same-date outcomes cannot leak into other same-day forecasts",()=>{
 const past=parseSkaterGameCsv(csv).rows;
 const same={...past.at(-1),gameId:2025020002,shotsOnGoal:30,xOnGoal:50};
 const lab=comparePastOnly([...past,same]);
 const shots=lab.scoredRows.filter(x=>x.market==="shotsOnGoal");
 assert.equal(shots.length,2);
 assert.equal(shots[0].champion,shots[1].champion);
 assert.equal(shots[0].shadow,shots[1].shadow);
});
test("duplicated, malformed, and missing history data fail closed",()=>{
 assert.throws(()=>parseSkaterGameCsv(csv+games[0]+"\n"),/Duplicate/);
 assert.throws(()=>parseSkaterGameCsv(csv.replace("I_F_xOnGoal","not_xOnGoal")),/missing required columns/);
 const parsed=parseSkaterGameCsv(csv).rows;
 assert.throws(()=>comparePastOnly([...parsed,parsed[0]]),/Repeated/);
 assert.throws(()=>comparePastOnly([{...parsed[0],gameDate:"2025-02-30"}]),/validation/);
 assert.equal(comparePastOnly(parsed.slice(-1)).evaluatedForecasts,0);
});