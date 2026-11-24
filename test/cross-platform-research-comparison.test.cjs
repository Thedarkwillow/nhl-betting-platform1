"use strict";const {test}=require("node:test"),assert=require("node:assert/strict"),{compare}=require("../src/cross-platform-research-comparison.cjs");const now="2026-11-17T01:00:00Z",r={league:"NHL",gameId:1,playerId:2,market:"shotsOnGoal",period:"full_game",tier:"Standard",side:"higher",line:2.5,platform:"PrizePicks",sourceOfferId:"prize-001",marketScoringFingerprint:"nhl-sog-full-game-ot-included-v1",observedAt:now,eventStartsAt:"2026-11-17T02:00:00Z",identityMethod:"independent_roster_and_schedule",available:true,marketContractVerified:true};
test("exact market and side comparison with unequal thresholds never infers payout advantage",()=>{const a=compare([r],[{...r,platform:"Underdog",sourceOfferId:"dog-001",line:3.5}],now);assert.equal(a.matched,1);assert.equal(a.sameThreshold,0);assert.equal(a.comparisons[0].payoutComparable,false);assert.equal(a.productionEligible,false);});
test("reject ambiguity, unknown semantics, different markets or side, stale timestamps and started game",()=>{assert.equal(compare([r],[{...r,platform:"Underdog",sourceOfferId:"dog-001"},{...r,platform:"Underdog",sourceOfferId:"dog-002"}],now).ambiguous,1);for(const patch of [{marketContractVerified:false},{tier:"Goblin"},{tier:null},{market:"blockedShots"},{side:"lower"},{observedAt:"2026-11-17T00:00:00Z"},{eventStartsAt:now}])assert.equal(compare([r],[{...r,platform:"Underdog",sourceOfferId:"dog-001",...patch}],now).matched,0);});

test("two different PrizePicks/Underdog tiers cannot be called a verified matching quote",()=>{const a=compare([r],[{...r,platform:"Underdog",sourceOfferId:"dog-001",tier:"Demon"}],now);assert.equal(a.matched,0);assert.equal(a.productionEligible,false);const b=compare([r],[{...r,platform:"Underdog",sourceOfferId:"dog-001",line:3.5}],now);assert.equal(b.comparisons[0].tier,"Standard");assert.equal(b.comparisons[0].originalAppQuoteAuthenticated,false);});

test("independent platform identity and exact scoring rules are required before calling two quotes comparable",()=>{
 const counterpart={...r,platform:"Underdog",sourceOfferId:"dog-001"};
 assert.equal(compare([r],[r],now).matched,0);
 assert.equal(compare([{...r,sourceOfferId:null}],[counterpart],now).matched,0);
 assert.equal(compare([r],[{...counterpart,sourceOfferId:null}],now).matched,0);
 assert.equal(compare([r],[{...counterpart,marketScoringFingerprint:null}],now).matched,0);
 assert.equal(compare([r],[{...counterpart,marketScoringFingerprint:"nhl-sog-no-overtime"}],now).matched,0);
 const good=compare([r],[counterpart],now);
 assert.equal(good.matched,1);assert.equal(good.sameThreshold,1);
 assert.equal(good.comparisons[0].originalAppQuoteAuthenticated,false);
 assert.equal(good.productionEligible,false);
});
