"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {compare}=require("../src/archived-prop-market-benchmark.cjs"),paper=require("../src/standard-paper-reference.cjs"),component=require("../src/nfl-dedicated-component-lab.cjs"),period=require("../src/nhl-dedicated-period-distributions.cjs");
test("exact quote bridge refuses different names, lines, games or ambiguous player IDs",()=>{
 const at="2026-11-15T17:00:00Z",start="2026-11-15T20:00:00Z",q={sport:"NHL",eventId:"abc",homeTeam:"Utah Mammoth",awayTeam:"San Jose Sharks",commenceTime:start,player:"Test Player",market:"goals",period:"full_game",line:.5,source:"The Odds API",overOdds:-110,underOdds:-110,capturedAt:at,marketUpdatedAt:at};
 const a={kind:"bounded_sportsbook_capture_v1",status:"fresh_bounded_archive",generatedAt:at,rows:[{...q,book:"draftkings"},{...q,book:"fanduel"}]};
 const p={player:"Test Player",gameId:123,playerId:1,team:"UTA",opponent:"SJS",market:"goals",line:.5,tier:"Standard",lean:"Higher",capturedAt:"2026-11-15T16:50:00Z",eventStartsAt:start,probabilities:{higher:.6}};
 const f=rows=>({NHL:[{firstCommittedAt:"2026-11-15T16:55:00Z",gitHistoryCount:1,snapshot:{source:"partner-api.prizepicks.com",generatedAt:"2026-11-15T16:54:00Z",rankedProps:rows}}],NFL:[]});
 const x=compare(a,f([p]));assert.equal(x.matchedRows,1);assert.equal(x.within30Minutes,1);assert.equal(x.verifiedCrossPlatformIds,false);
 assert.equal(compare(a,f([{...p,player:"T Player"}])).matchedRows,0);assert.equal(compare(a,f([{...p,line:1.5}])).matchedRows,0);assert.equal(compare(a,f([p,{...p,playerId:2}])).matchedRows,0);
});
test("standard reference counts only first per slate format and never authenticates payout",()=>{
 const a={id:"a",formatSize:"power_2",slate:"2026-11-15",frozenAt:"2026-11-15T10:00:00Z",hits:2};
 const x=paper.study([a,{...a,id:"b",hits:0}]);assert.equal(x.byFormat.power_2.entries,1);assert.equal(x.byFormat.power_2.referenceROI,2);assert.equal(x.authenticatedPaperROI,null);assert.equal(x.actualQuotedPayout,false);
 assert.deepEqual(paper.study([{...a,formatSize:"flex_2"}]).byFormat,{});
});
test("NFL components require exact named data and ratio denominators",()=>{
 const s=component.SPECS;assert.equal(s.rush_receive_yards.v({rushing_yards:10}),null);assert.equal(s.rush_receive_yards.v({rushing_yards:10,receiving_yards:20}),30);
 assert.equal(s.rush_yards_per_carry.v({rushing_yards:5,carries:0}),null);
 const rows=Array.from({length:10},()=>({rushing_yards:10,receiving_yards:20,carries:5,targets:4}));
 assert.ok(component.forecast(rows,s.rush_receive_yards,20.5).candidate>component.forecast(rows,s.rush_receive_yards,40.5).candidate);
});
test("period workload challenger preserves probability mass when prior exposure exists",()=>{
 const a=Array.from({length:10},(_,i)=>({playedInPeriod:true,period:1,gameId:i+1,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),shotsOnGoal:i%3,timeOnIceSeconds:400+i}));
 const x=period.forecast(a,"shotsOnGoal",.5);assert.ok(x);if(x.usageAdjusted)assert.ok(Math.abs(Object.values(x.usageAdjusted).reduce((a,b)=>a+b,0)-1)<1e-8);
});
