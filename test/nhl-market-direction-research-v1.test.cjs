"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {evaluate,freeze}=require("../src/nhl-market-direction-research-v1.cjs");
const {audit}=require("../src/nhl-market-specific-forward-audit-v1.cjs");
const gen="2026-11-21T02:00:00Z",git="2026-11-21T02:00:30Z",
 captured="2026-11-21T01:55:00Z",start="2026-11-23T02:00:00Z";
function fixture(market="shotsOnGoal"){
 const p={gameId:2026020606,playerId:8481111,tier:"Standard",
  market,line:market==="shotsOnGoal"?2.5:.5,lean:"Higher",team:"NYR",
  opponent:"BOS",capturedAt:captured,gameStartAt:start};
 const orig={...p,probabilities:{higher:.73,lower:.27,push:0}};
 const s={generatedAt:gen,rankedProps:[orig],individualPropSelections:[p],
  positionRateMatchupV2:{rows:[{...p,side:p.lean,defenseFactor:1.08}]}};
 const games=Array.from({length:16},(_,i)=>({
  gameId:2026020120+i,playerId:p.playerId,type:"skater",
  gameState:"FINAL",gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  team:"NYR",timeOnIceSeconds:880+i*8,
  powerPlayTimeOnIceSeconds:100,shortHandedTimeOnIceSeconds:120,
  shotsOnGoal:i%3+1,assists:i%6===0?1:0,
  points:i%5===0?1:0,goals:0,blockedShots:i%3}));
 const history={players:{[p.playerId]:{games}}};
 return {p,s,history,orig};
}
test("fixed market-specific families produce research-only past-only forecasts",()=>{
 for(const m of ["shotsOnGoal","points","assists","blockedShots"]){
  const {p,s,history}=fixture(m);
  const r=evaluate(p,s,history);
  a.equal(r.status,"research_only_conditional_on_official_appearance",m);
  a.ok(r.marketSpecificHigher>=0&&r.marketSpecificHigher<=1,m);
  a.ok(["Higher","Lower",null].includes(r.exploratoryDirection));
  a.equal(r.bettingEligible,false);
  a.equal(r.strictQualified,false);
  a.equal(r.priorLastGameDate<"2026-11-20",true);
  const frozen=freeze(s,history);
  a.equal(frozen.registered,1);
  a.equal(frozen.modelPromoted,false);
 }
});
test("later official completed games never change pregame research forecast",()=>{
 const {p,s,history}=fixture("points");
 const first=evaluate(p,s,history);
 const added=structuredClone(history);
 added.players[p.playerId].games.push({
  gameId:2026020606,playerId:p.playerId,type:"skater",gameState:"FINAL",
  gameDate:"2026-11-22",team:"NYR",timeOnIceSeconds:900,
  shotsOnGoal:50,points:50,assists:50,blockedShots:50});
 a.deepEqual(evaluate(p,s,added),first);
});
test("original line mismatches and same-key duplicate originals abstain",()=>{
 const {p,s,history}=fixture("blockedShots");
 const changed=structuredClone(s);
 changed.individualPropSelections[0].line=1.5;
 a.equal(evaluate(changed.individualPropSelections[0],changed,history).status,
  "research_abstain");
 const dup=structuredClone(s);
 dup.individualPropSelections.push({...p});
 a.throws(()=>freeze(dup,history),/Duplicate original market source/);
});
test("true future audit accepts only fixed model already frozen in first-Git original",()=>{
 const {s,history,p}=fixture("shotsOnGoal");
 s.marketDirectionResearchV1=freeze(s,history);
 const result=structuredClone(history);
 result.players[p.playerId].games.push({
  gameId:p.gameId,playerId:p.playerId,type:"skater",gameState:"FINAL",
  gameDate:"2026-11-22",team:"NYR",timeOnIceSeconds:900,shotsOnGoal:4});
 const f={snapshot:s,firstCommittedAt:git,gitHistoryCount:1},
  run=fs=>audit(fs,result,"2026-11-21T01:00:00Z");
 const x=run([f]);
 a.equal(x.acceptedFrames,1);
 a.equal(x.overall.all.decided,1);
 a.equal(x.overall.modeled.decided,1);
 a.equal(x.modelPromoted,false);
 a.equal(run([f,f]).originalLines,1);
 a.equal(run([{...f,firstCommittedAt:"2026-11-23T03:00:00Z"}])
  .acceptedFrames,0);
 const altered=structuredClone(f);
 altered.snapshot.marketDirectionResearchV1.rows[0].marketSpecificHigher=.01;
 a.equal(run([altered]).acceptedFrames,0);
});
