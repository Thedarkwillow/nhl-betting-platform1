"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{sameEvent}=require("../src/archived-prop-market-benchmark.cjs");
test("official bridge requires same game ID, pair, observed pregame and native sportsbook time",()=>{
 const p={sport:"NHL",team:"EDM",opponent:"PHI",gameId:123,gameStartAt:"2026-11-16T00:30:00Z"},q={eventId:"e",homeTeam:"Philadelphia Flyers",awayTeam:"Edmonton Oilers",commenceTime:"2026-11-16T00:45:00Z"};
 const x={sport:"NHL",eventId:"e",homeTeam:q.homeTeam,awayTeam:q.awayTeam,commenceTime:q.commenceTime,officialGameId:123,officialStartTimeUTC:p.gameStartAt,boardStart:p.gameStartAt,boardGame:"pp",method:"official_schedule_bridge",officialScheduleFresh:true,officialObservedAt:"2026-11-15T20:00:00Z"},a={generatedAt:"2026-11-15T20:05:00Z",eventCrosswalk:[x]};
 assert.equal(sameEvent(p,q,a),true);
 assert.equal(sameEvent({...p,gameId:456},q,a),false);
 assert.equal(sameEvent(p,q,{...a,eventCrosswalk:[x,x]}),false);
 assert.equal(sameEvent(p,q,{...a,eventCrosswalk:[{...x,officialScheduleFresh:false}]}),false);
 assert.equal(sameEvent(p,q,{...a,generatedAt:"2026-11-16T00:40:00Z"}),false);
 assert.equal(sameEvent(p,{...q,commenceTime:p.gameStartAt},{}),true);
});
