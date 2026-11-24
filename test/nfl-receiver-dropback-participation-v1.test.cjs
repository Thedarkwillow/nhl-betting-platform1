"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{project}=require("../src/nfl-receiver-dropback-participation-v1.cjs");
test("Participation feature uses only earlier games and never asserts actual routes",()=>{
 const w=Array.from({length:8},(_,i)=>({gameId:"g"+i,playerId:"p",team:"A",y:2025,w:i+1,opportunity:5,value:50}));
 const p=w.map(x=>({gameId:x.gameId,team:"A",playerId:"p",onFieldDropbacks:25,teamDropbacks:40}));
 const r=project(w,p,"p","A",2025,9);assert.equal(r.projection,50);assert.equal(r.actualRoutesVerified,false);
 assert.equal(project(w,p,"p","A",2025,8),null);
 assert.equal(project(w,[...p,p[0]],"p","A",2025,9),null);
});
