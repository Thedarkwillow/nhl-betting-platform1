"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {eligible,normalize,day}=require("../scripts/collect-independent-nhl-sportsbook-fallback.cjs");
const {study}=require("../src/bounded-sportsbook-consensus.cjs");
const {beforeFreeze}=require("../src/archived-prop-market-benchmark.cjs");
const at="2026-11-24T17:10:00.000Z",start="2026-11-25T02:00:00.000Z";
const updated="2026-11-24T17:00:00.000Z";
function body(){
 const byBookmaker=(price)=>Object.fromEntries(["fanduel","draftkings"].map(k=>[k,{available:true,overUnder:"2.5",odds:price,lastUpdatedAt:updated}]));
 return {success:true,data:[{leagueID:"NHL",eventID:"g",status:{startsAt:start},teams:{home:{names:{long:"Boston Bruins"}},away:{names:{long:"Toronto Maple Leafs"}}},players:{P1:{name:"Example Player"}},odds:{o:{statID:"shots_onGoal",playerID:"P1",periodID:"game",betTypeID:"ou",sideID:"over",byBookmaker:byBookmaker("-120")},u:{statID:"shots_onGoal",playerID:"P1",periodID:"game",betTypeID:"ou",sideID:"under",byBookmaker:byBookmaker("+100")}}}]};
}
test("fallback only after exhausted primary and fresh board, once per day",()=>{
 const a={repeat:true,boardFresh:true,keyPresent:true};assert.equal(eligible(a),true);
 for(const b of [{repeat:false},{boardFresh:false},{keyPresent:false},{alreadyAttempted:true},{primaryFresh:true}])assert.equal(eligible({...a,...b}),false);
 assert.equal(day(Date.parse("2026-11-24T07:59:00Z")),"2026-11-23");
});
test("independent archive retains source and supports only exact two-book prefreeze match",()=>{
 const a=normalize(body(),at);assert.equal(a.rows.length,2);assert.equal(a.primaryCredits,0);
 const q=study(a,{now:at});assert.equal(q.groups.length,1);assert.equal(q.groups[0].source,"SportsGameOdds");
 const prop={player:"Example Player",playerId:1,gameId:2,team:"BOS",opponent:"TOR",market:"shotsOnGoal",line:2.5,gameStartAt:start};
 const archives=[{archive:a,firstCommittedAt:at,gitHistoryCount:1}];
 assert.equal(beforeFreeze(prop,archives,at).source,"SportsGameOdds");
 assert.equal(beforeFreeze({...prop,line:3.5},archives,at),null);
 assert.equal(beforeFreeze(prop,archives,"2026-11-24T17:31:00Z"),null);
 assert.equal(beforeFreeze(prop,[{...archives[0],gitHistoryCount:2}],at),null);
});
test("both sides must be fresh; no single book or wrong source",()=>{
 const d=body();d.data[0].odds.u.byBookmaker.fanduel.lastUpdatedAt="2026-11-24T16:30:00Z";
 const a=normalize(d,at);assert.equal(a.rows.length,1);assert.equal(study(a,{now:at}).groups.length,0);
 const b=normalize(body(),at);b.rows[0].source="The Odds API";assert.equal(study(b,{now:at}).groups.length,0);
 assert.throws(()=>normalize({success:false,data:[]},at));
});

test("independent account must be active with request and object headroom",()=>{
 const {accountAllows}=require("../scripts/collect-independent-nhl-sportsbook-fallback.cjs");
 const q={status:"ok",isActive:true,limits:{"per-day":{maxRequests:10,currentRequests:8,maxObjects:100,currentObjects:98}}};
 assert.equal(accountAllows(q),true);assert.equal(accountAllows({...q,isActive:false}),false);assert.equal(accountAllows({...q,limits:{}}),false);
 q.limits["per-day"].currentRequests=10;assert.equal(accountAllows(q),false);
});

test("expanded coverage remains within account headroom and event cap",()=>{
 const {accountAllows,normalize}=require("../scripts/collect-independent-nhl-sportsbook-fallback.cjs");
 const q={status:"ok",isActive:true,limits:{"per-month":{maxRequests:"unlimited",maxObjects:100,currentObjects:96}}};
 assert.equal(accountAllows(q,6),false);assert.equal(accountAllows(q,4),true);assert.equal(accountAllows(q,7),false);
 const payload={success:true,data:[]};assert.equal(normalize(payload,"2026-11-24T17:00:00Z",6).eventsRequestedLimit,6);assert.throws(()=>normalize(payload,"2026-11-24T17:00:00Z",7));
});
