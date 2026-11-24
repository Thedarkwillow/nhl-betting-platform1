"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {score}=require("../src/nhl-original-line-calibration-pairs.cjs");
function rows({groups=32,per=4,original=.8,adjusted=.65,win=0}={}){
 return Array.from({length:groups*per},(_,i)=>({
  id:"original-"+i,gameId:7000+Math.floor(i/per),
  day:"2026-11-"+String(1+Math.floor(i/per)%30).padStart(2,"0"),
  raw:original,adjusted,y:win
 }));
}
test("paired original-line calibration only compares identical frozen decisions",()=>{
 const a=score(rows(),{replicates:300});
 assert.equal(a.decided,128);assert.equal(a.distinctGames,32);
 assert.equal(a.minimumEvidenceMet,true);
 assert.ok(a.adjustedBrier<a.rawBrier);
 assert.ok(a.pairedGameCluster95.upper<0);
 assert.equal(a.gameClusterEvidenceFavoringAdjustment,true);
 assert.equal(a.calibrationApproved,false);assert.equal(a.modelPromoted,false);
});
test("unfavorable / thin / duplicate evidence cannot assert a release",()=>{
 const unfavorable=score(rows({original:.65,adjusted:.8}),{replicates:300});
 assert.equal(unfavorable.gameClusterEvidenceFavoringAdjustment,false);
 assert.ok(unfavorable.pairedGameCluster95.lower>0);
 const tiny=score(rows({groups:5,per:2}),{replicates:300});
 assert.equal(tiny.minimumEvidenceMet,false);
 assert.equal(tiny.pairedGameCluster95,null);
 const duplicate=rows();duplicate[1]={...duplicate[1],id:duplicate[0].id};
 assert.equal(score(duplicate).status,"invalid_duplicate_or_inconsistent_paired_rows");
 assert.equal(score([{id:"a",raw:.7,adjusted:.5,y:1,day:"2026-11-01"}]).status,
  "invalid_duplicate_or_inconsistent_paired_rows");
});
test("game-equal Brier and row-weighted Brier are both reported",()=>{
 const v=score([...rows({groups:10,per:2}),...rows({groups:1,per:1}).map(x=>({...x,id:"unique",gameId:9911,y:1}))],{replicates:200});
 assert.equal(v.distinctGames,11);
 assert.notEqual(v.gameEqualRawBrier,v.rawBrier);
 assert.equal(v.pairedGameCluster95.unit,"NHL_independent_game_resampling");
});

test("Calibration cannot inflate slate sample by assigning one original NHL game different days",()=>{
 const data=rows();
 data[1].day="2026-11-30"; // exact same game as data[0], artificial new slate
 const x=score(data,{replicates:300});
 assert.equal(x.status,"invalid_duplicate_or_inconsistent_paired_rows");
 assert.equal(x.calibrationApproved,false);
});
