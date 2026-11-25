"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{official,gradeFrame}=require("../scripts/grade-nba-frozen-research-v1.cjs");
const start="2026-11-25T01:00:00Z",at="2026-11-24T17:00:00Z",commit="2026-11-24T17:01:00Z";
function fixture(){
 const stat={points:14,reboundsTotal:5,assists:3,threePointersMade:2,steals:1,blocks:0,turnovers:2};
 const team=(teamTricode,offset)=>({teamTricode,players:Array.from({length:5},(_,i)=>({personId:offset+i,played:"1",statistics:stat}))});
 const doc={game:{gameId:"0022600001",gameStatus:3,gameTimeUTC:start,homeTeam:team("BOS",1),awayTeam:team("WAS",11)}};
 const p={gameId:22600001,gameStartAt:start,playerId:1,team:"BOS",market:"points",line:12.5,tier:"Standard",offeredSide:"Higher",researchOnly:true,sourceObservedAt:at};
 return {doc,frame:{kind:"nba_private_research_rankings_v1",generatedAt:at,boardCapturedAt:at,calibrated:false,rows:[p]},id:p.gameId};
}
test("official final status, exact player identity and immutable pregame clock",()=>{
 const {doc,frame,id}=fixture(),o=official(doc,id,start,"2026-11-25T05:00:00Z");
 assert.equal(gradeFrame(frame,commit,new Map([[id,o]]))[0].status,"correct");
 assert.equal(gradeFrame(frame,start,new Map([[id,o]])).length,0);
 doc.game.gameStatus=2;assert.equal(official(doc,id,start,"2026-11-25T05:00:00Z"),null);
});
test("nonappearance or unknown final never counted as an under",()=>{
 const {doc,frame,id}=fixture();doc.game.homeTeam.players[0].played="0";
 const o=official(doc,id,start,"2026-11-25T05:00:00Z");
 frame.rows[0].offeredSide="Lower";assert.equal(gradeFrame(frame,commit,new Map([[id,o]]))[0].status,"pending");
});

test("calibration diagnostics isolate model revisions and unconfirmed provenance",()=>{
 const {prospectiveSummary}=require("../scripts/grade-nba-frozen-research-v1.cjs");
 const base={gameId:1,gameDate:"2026-11-25",tier:"Standard",market:"points",side:"Higher",status:"correct",rawSelectedEstimate:.7,sourceCommit:"a"};
 const r=prospectiveSummary([{...base,id:"1",modelRevision:"b".repeat(40)},{...base,id:"2",modelRevision:"c".repeat(40),status:"incorrect"},{...base,id:"3"}]);
 assert.equal(Object.keys(r.groups).length,3);
 assert.ok(Object.values(r.groups).every(g=>g.decided===1&&g.reliability.reduce((n,b)=>n+b.n,0)===1&&g.approved===false));
 assert.equal(r.calibrationApproved,false);
});
