"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {parseGoalieGameCsv,candidateSaves,evaluateGoalieHistory}=
 require("../src/nhl-moneypuck-goalie-game-lab.cjs");
const header=["playerId","gameId","gameDate","situation","icetime","xOnGoal","xGoals","ongoal","goals",...Array.from({length:12},(_,i)=>"unused"+i)].join(",");
const rec=(id,g,date,sit="all",saves=25,xOnGoal=32)=>
 [id,g,date,sit,3600,xOnGoal,3,saves+3,3,...Array(12).fill(0)].join(",");
const first=Array.from({length:6},(_,i)=>rec(222,2024020001+i,"2024-10-"+String(i+10).padStart(2,"0")));
const late=rec(222,2025020100,"2025-11-10","all",27,36);
const parsed=parseGoalieGameCsv(header+"\n"+[...first,late,rec(222,2024020001,"2024-10-10","5on5")].join("\n")+"\n");
test("MoneyPuck goalie all situation parsing uses actual saves = shots on goal minus goals",()=>{
 assert.equal(parsed.length,7);assert.equal(parsed[0].saves,25);
 assert.equal(parsed[6].saves,27);
});
test("conditional goalie xOnGoal/xGoals shadow uses only games before target",()=>{
 const forecast=candidateSaves(parsed.slice(0,5));
 assert.equal(forecast.champion,25);
 assert.equal(forecast.sourceMean,29);
 assert.equal(forecast.shadow,26);
 const report=evaluateGoalieHistory(parsed);
 assert.equal(report.eligibleGoalieAppearances,1);
 assert.equal(report.championMae,2);
 assert.equal(report.shotQualityMae,1);
 assert.equal(report.conditionalOnActualGoalieAppearance,true);
 assert.equal(report.actualPregameStartKnown,false);
 assert.equal(report.modelPromoted,false);
});
test("same-day goalie appearance not used for other same-day prediction",()=>{
 const extra={...parsed.at(-1),gameId:2025020101,saves:4};
 const report=evaluateGoalieHistory([...parsed,extra]);
 assert.equal(report.eligibleGoalieAppearances,2);
 assert.equal(report.distinctGames,2);
});
test("schema and goalie identity issues fail closed",()=>{
 assert.throws(()=>parseGoalieGameCsv(header.replace("xOnGoal","badField")+"\n"+first.join("\n")),/missing required/);
 assert.throws(()=>parseGoalieGameCsv(header+"\n"+first[0]+"\n"+first[0]),/Duplicate/);
 assert.throws(()=>evaluateGoalieHistory([...parsed,parsed[0]]),/Repeated/);
 assert.equal(evaluateGoalieHistory(parsed.slice(0,4)).eligibleGoalieAppearances,0);
});
