"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {diffBoards}=require("../src/nhl-line-movement.cjs");
const r=(line,player="A. Fox")=>({player,team:"NYR",market:"SOG",tier:"Standard",period:"Full Game",matchup:"vs EDM",line,capturedAt:"2026-11-01T20:00:00Z"});
test("tracks up/down and new lines without inventing removals",()=>{
 const a={generatedAt:"a",rows:[r(1.5),r(2.5,"B. Player")]},b={generatedAt:"b",rows:[r(2.5),r(1.5,"C. Player")]};
 const x=diffBoards(a,b);
 assert.equal(x.changes.filter(z=>z.type==="increased").length,1);
 assert.equal(x.changes.filter(z=>z.type==="added").length,1);
 assert.equal(x.changes.filter(z=>z.type==="removed").length,0);
});
test("reports removals only with complete fresh coverage in both snapshots",()=>{
 const a={rows:[r(1.5)],coverageComplete:true,allCategoriesFresh:true},b={rows:[],coverageComplete:true,allCategoriesFresh:true};
 assert.equal(diffBoards(a,b).changes[0].type,"removed");
 assert.equal(diffBoards(a,{...b,allCategoriesFresh:false}).changes.length,0);
});
