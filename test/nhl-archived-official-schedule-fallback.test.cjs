"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {resolveSchedule}=require("../scripts/build-free-nhl-research.cjs");
const start="2026-11-05T00:00:00Z",captured="2026-11-04T20:00:00Z";
const official={id:2026020250,home:"BOS",away:"VGK",startTimeUTC:start};
const prop={player:"Example Player",team:"BOS",opponent:"VGK",
  matchup:"BOS vs VGK | "+start,eventStartsAt:start,capturedAt:captured};
test("cached complete official schedule resolves game IDs when live NHL feed is offline",async()=>{
 const out={rankedProps:[{...prop}]};
 await resolveSchedule(out,{cached:{complete:true,generatedAt:"2026-11-04T15:00:00Z",games:[official]},
  client:async()=>{throw Error("NHL schedule temporary outage");}});
 assert.equal(out.gameIdentityResolved,1);
 assert.equal(out.rankedProps[0].gameId,official.id);
 assert.equal(out.cachedOfficialSeasonScheduleUsed,true);
 assert.ok(out.gameIdentityErrors.length>0);
});
test("incomplete cached schedule cannot manufacture a game identity",async()=>{
 const out={rankedProps:[{...prop}]};
 await resolveSchedule(out,{cached:{complete:false,games:[official]},
  client:async()=>{throw Error("NHL schedule unavailable");}});
 assert.equal(out.gameIdentityResolved,0);
 assert.equal(out.rankedProps[0].gameId,undefined);
});
test("mismatched official game start or opponent fails closed",async()=>{
 const out={rankedProps:[{...prop}]};
 await resolveSchedule(out,{cached:{complete:true,games:[
  {...official,startTimeUTC:"2026-11-05T00:10:00Z"}
 ]},client:async()=>{throw Error("down");}});
 assert.equal(out.gameIdentityResolved,0);
});
