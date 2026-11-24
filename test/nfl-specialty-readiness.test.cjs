"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const os=require("node:os"),path=require("node:path"),fs=require("node:fs");
const {verifyYear,build}=require("../scripts/audit-nfl-specialty-readiness.cjs");
test("specialist event source is unavailable until archived and validated",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nfl-specialty-"));
 try{
  const report=build({root:dir,manifest:{datasets:[]},
   backtest:{byMarketYear:[]}});
  assert.equal(report.eventSeasonsValidated,0);
  assert.deepEqual(report.eventSeasonsMissing,[2024,2025,2026]);
  assert.equal(report.settleRuleChecks,264);
  assert.equal(report.marketSpecificSpecialistGradesReconciled,0);
  assert.equal(report.automaticPicksEnabled,0);
  assert.equal(report.payoutAndJointCalibrationComplete,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("PBP event identity and diversity must pass before counting a validated archive",()=>{
 const rows=[];
 for(let i=0;i<1200;i++){
  const type=i%20<10?"pass":i%20<17?"run":i%20===17?"punt":i%20===18?"field_goal":"extra_point";
  rows.push({season:2025,week:1,season_type:"REG",game_id:"2025_01_AAA_BBB",
   play_id:i+1,qtr:i%4+1,play_type:type,posteam:"AAA",defteam:"BBB",
   receiver_player_id:"r1",rusher_player_id:"b1",passer_player_id:"q1",
   punter_player_id:"p1"});
 }
 const d={rows};
 const result=verifyYear(d,2025);
 assert.equal(result.events,1200);
 assert.ok(result.counts.passPlays>=100);
 assert.ok(result.counts.punts>=10);
 assert.equal(result.exactMarketSettlementVerified,false);
 assert.throws(()=>verifyYear({rows:[...rows,rows[0]]},2025),/Duplicated/);
 assert.throws(()=>verifyYear({rows:[...rows.slice(1),{...rows[0],qtr:7}]},2025),/Bad NFL specialty/);
});
