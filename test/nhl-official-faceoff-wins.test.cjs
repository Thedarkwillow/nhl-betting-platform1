"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {faceoffsReportUrl,normalizeOfficialFaceoffWins,mergeOfficialFaceoffs}=
 require("../src/nhl-official-faceoff-wins.cjs");
const id=2026020264;
test("only official 10-digit game IDs generate the exact Stats REST URL",()=>{
 const url=new URL(faceoffsReportUrl(id));
 assert.equal(url.hostname,"api.nhle.com");
 assert.equal(url.pathname,"/stats/rest/en/skater/faceoffwins");
 assert.equal(url.searchParams.get("isGame"),"true");
 assert.equal(url.searchParams.get("cayenneExp"),"gameId="+id);
 assert.throws(()=>faceoffsReportUrl(20),/Invalid official/);
});
test("exact official player+game counts merge only into same boxscore identity",()=>{
 const payload={total:2,data:[
  {playerId:1,gameId:id,totalFaceoffWins:8},
  {playerId:2,gameId:id,totalFaceoffWins:0}]};
 const counts=normalizeOfficialFaceoffWins(payload,{gameId:id});
 const rows=[{gameId:id,playerId:1,type:"skater",faceoffsWon:null},
  {gameId:id,playerId:2,type:"skater",faceoffsWon:null},
  {gameId:id,playerId:3,type:"goalie",faceoffsWon:null}];
 const out=mergeOfficialFaceoffs(rows,counts,{gameId:id});
 assert.equal(out[0].faceoffsWon,8);
 assert.equal(out[1].faceoffsWon,0);
 assert.equal(out[2].faceoffsWon,null);
});
test("does not turn absent faceoff report rows into guessed zero counts",()=>{
 const counts=normalizeOfficialFaceoffWins({total:1,data:[
  {playerId:2,gameId:id,totalFaceoffWins:7}]},{gameId:id});
 const rows=mergeOfficialFaceoffs([{gameId:id,playerId:1,type:"skater",
  faceoffsWon:null,faceoffWinningPctg:0.5},
  {gameId:id,playerId:2,type:"skater",faceoffsWon:null}],counts,{gameId:id});
 assert.equal(rows[0].faceoffsWon,null);
 assert.equal(rows[1].faceoffsWon,7);
});
test("ambiguous IDs, partial pages and conflicts fail closed instead of guessed wins",()=>{
 assert.throws(()=>normalizeOfficialFaceoffWins({total:3,data:[]},{gameId:id}),/incomplete/);
 assert.throws(()=>normalizeOfficialFaceoffWins({total:1,data:[
  {playerId:1,gameId:id+1,totalFaceoffWins:10}]},{gameId:id}),/Ambiguous/);
 assert.throws(()=>normalizeOfficialFaceoffWins({total:1,data:[
  {playerId:1,gameId:id,faceoffWinningPctg:.75}]},{gameId:id}),/Ambiguous/);
 // Regression: actual NHL 2026-10-17 Stats REST field.
 const live=normalizeOfficialFaceoffWins({total:2,data:[
  {gameId:id,playerId:8480002,faceoffWinPct:.73076,totalFaceoffWins:19,
   ppFaceoffsWon:2,evFaceoffsWon:17},
  {gameId:id,playerId:8480003,faceoffWinPct:null,totalFaceoffWins:0}
 ]},{gameId:id});
 assert.equal(live.get(8480002),19);
 assert.equal(live.get(8480003),0);
 const n=normalizeOfficialFaceoffWins({total:1,data:[
  {playerId:1,gameId:id,totalFaceoffWins:6}]},{gameId:id});
 assert.throws(()=>mergeOfficialFaceoffs([{gameId:id,playerId:1,
  type:"skater",faceoffsWon:7}],n,{gameId:id}),/disagreement/);
 assert.throws(()=>mergeOfficialFaceoffs([],n,{gameId:id}),/missing official/);
});
