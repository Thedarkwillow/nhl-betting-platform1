"use strict";
const assert=require("node:assert/strict");
const W=require("../assets/lineup-workspace.js");
const at=Date.parse("2026-11-05T18:00:00Z");
const iso=ms=>new Date(ms).toISOString();
function prop(i,overrides={}){
 return {
  player:"Player "+i,team:"T"+i,market:"Shots on goal",line:2.5,tier:"Standard",
  lean:"Higher",probability:.78-i*.01,observations:20,
  matchup:"Game "+i,capturedAt:iso(at-5*60000),
  eventStartsAt:iso(at+120*60000),researchEligibility:"research_only",
  roleWarning:null,...overrides
 };
}
const pool=Array.from({length:9},(_,i)=>prop(i+1));
for(let n=2;n<=6;n++){
 const result=W.build(pool,{size:n,at});
 assert.equal(result.picks.length,n,"Build "+n+" picks");
 assert.ok(W.validComplete(result.picks,n),"Respect distinct athletes and games");
}
assert.deepEqual(W.build(pool,{size:1,at}).picks,[],"2–6 only");
assert.deepEqual(W.build(pool,{size:7,at}).picks,[],"2–6 only");
for(const bad of [
 prop(10,{tier:"Demon"}),prop(10,{tier:"Goblin"}),
 prop(10,{lean:"Sideways"}),prop(10,{probability:1}),
 prop(10,{probability:.49}),prop(10,{researchEligibility:"watchlist"}),
 prop(10,{roleWarning:"Starter unknown"}),
 prop(10,{capturedAt:iso(at-31*60000)}),
 prop(10,{capturedAt:iso(at+60000)}),
 prop(10,{eventStartsAt:iso(at+10*60000)}),
 prop(10,{matchup:""})
]){
 assert.equal(W.eligible(bad,at),false,"Unsafe offer must be rejected");
}
assert.equal(W.eligible(prop(10),at),true);
assert.equal(W.eligible(prop(10),at+31*60000),false,"Clock refresh invalidates stale offers");
const sameGame=[prop(1,{matchup:"Game X"}),prop(2,{matchup:"Game X"})];
assert.equal(W.build(sameGame,{size:2,at}).picks.length,0,"2-4 picks need different games");
const five=[prop(1,{matchup:"Game A"}),prop(2,{matchup:"Game A"}),
 prop(3,{matchup:"Game B"}),prop(4,{matchup:"Game B"}),
 prop(5,{matchup:"Game C"}),prop(6,{matchup:"Game C"})];
assert.equal(W.build(five,{size:5,at}).picks.length,5);
assert.ok(W.validComplete(W.build(five,{size:6,at}).picks,6));
assert.equal(W.validComplete([five[0],five[1],five[2],five[3],five[4]],4),false);
assert.equal(W.validComplete(five.slice(0,4),4),false);
const duplicate=[prop(1,{market:"Assists"}),prop(1,{market:"Shots on goal"})];
assert.equal(W.build(duplicate,{size:2,at}).picks.length,0,"One person cannot occupy two slots");
const lowPriority=W.key(pool[8]);
assert.ok(W.build(pool,{size:2,at,lockedKeys:[lowPriority]}).picks.some(p=>W.key(p)===lowPriority),
 "Locked eligible pick must remain");
assert.ok(!W.build(pool,{size:2,at,excludedPlayers:[W.playerKey(pool[0])]}).picks
 .some(p=>W.playerKey(p)===W.playerKey(pool[0])),"Exclusion applies to player");
assert.equal(W.build(pool,{size:2,at,lockedKeys:["unknown"]}).picks.length,0,
 "A missing locked offer must never be silently substituted");
const first=W.build(pool,{size:3,at}).picks;
const swaps=W.swapOptions(pool,first,0,{at});
assert.ok(swaps.length>0,"Valid replacement options should exist");
assert.ok(swaps.every(p=>W.validComplete([p,...first.slice(1)],3)));
assert.ok(swaps.every(p=>W.playerKey(p)!==W.playerKey(first[1])));
assert.deepEqual(W.swapOptions(pool,first,0,{at:at+31*60000}),[],
 "Stale board cannot offer swap options");
assert.deepEqual(W.swapOptions(pool,first,0,{at,excludedPlayers:pool.map(W.playerKey)}),[],
 "No candidates from excluded players");
// Add from public board: exact current line, distinct player, and lock control.
const added=W.addSelection(pool,pool[7],{size:3,at});
assert.ok(added.picks.some(p=>W.key(p)===W.key(pool[7])));
assert.ok(added.lockedKeys.includes(W.key(pool[7])));
assert.ok(W.validComplete(added.picks,3));
assert.equal(W.addSelection(pool,prop(11,{tier:"Demon"}),{size:3,at}).picks.length,0);
assert.equal(W.addSelection(pool,pool[0],{size:3,at,
 excludedPlayers:[W.playerKey(pool[0])]}).picks.length,0);
assert.equal(W.addSelection(pool,pool[1],{size:3,at,
 lockedKeys:[W.key(pool[0])],excludedPlayers:pool.slice(2).map(W.playerKey)}).picks.length,0);
const alt=prop(1,{market:"Assists",line:1.5});
assert.equal(W.addSelection([...pool,alt],alt,{size:3,at,
 lockedKeys:[W.key(pool[0])]}).picks.length,0,
 "Cannot lock a second offer for the same player");
assert.equal(W.addSelection(pool,pool[0],{size:2,at:at+31*60000}).picks.length,0,
 "Cannot add stale prop to lineup");
// Draft stores only reference keys and settings, never raw offers or estimates.
const boardAt=iso(at-4*60000),researchAt=iso(at-4*60000);
const excludeUnused=W.playerKey(pool.find(p=>!added.picks.some(s=>W.playerKey(s)===W.playerKey(p))));
const saved=W.createDraft({props:pool,picks:added.picks,size:3,
 lockedKeys:added.lockedKeys,excludedPlayers:[excludeUnused],
 boardAt,researchAt,at,boardFresh:true});
assert.ok(saved,"Fresh complete draft should save");
assert.ok(Array.isArray(saved.pickKeys));
assert.equal(saved.pickKeys.length,3);
assert.ok(!JSON.stringify(saved).includes('"probability"'));
assert.ok(!JSON.stringify(saved).includes('"props"'));
const restored=W.restoreDraft(JSON.stringify(saved),{props:pool,boardAt,researchAt,
 at,boardFresh:true});
assert.equal(restored.valid,true);
assert.deepEqual(restored.picks.map(W.key),added.picks.map(W.key));
assert.deepEqual(restored.lockedKeys,added.lockedKeys);
assert.equal(W.restoreDraft(JSON.stringify(saved),{props:pool,boardAt,researchAt,
 at:at+31*60000,boardFresh:true}).valid,false,"Expired draft must not resurrect stale offers");
assert.equal(W.restoreDraft(JSON.stringify(saved),{props:pool,boardAt:iso(at-2*60000),
 researchAt,at,boardFresh:true}).valid,false,"Draft must be board-scoped");
assert.equal(W.restoreDraft(JSON.stringify(saved),{props:pool.filter(p=>W.key(p)!==W.key(added.picks[0])),
 boardAt,researchAt,at,boardFresh:true}).valid,false,"Removed saved prop must invalidate draft");
assert.equal(W.restoreDraft(JSON.stringify(saved),{props:pool,boardAt,researchAt,
 at,boardFresh:false}).valid,false,"Source-incomplete board must never restore a draft");
assert.equal(W.restoreDraft("not json",{props:pool,boardAt,researchAt,at,boardFresh:true}).valid,false);
assert.equal(W.createDraft({props:pool,picks:added.picks,size:3,
 lockedKeys:added.lockedKeys,boardAt,researchAt,at,boardFresh:false}),null);
assert.equal(W.createDraft({props:pool,picks:added.picks,size:3,
 lockedKeys:added.lockedKeys,boardAt,researchAt,at,
 excludedPlayers:[W.playerKey(added.picks[0])],boardFresh:true}),null,
 "Cannot save contradictory exclusions");

console.log("NHL interactive workspace: 2–6 picks, source age, watchlists, tiers, games, locks, swaps and exclusions verified");
