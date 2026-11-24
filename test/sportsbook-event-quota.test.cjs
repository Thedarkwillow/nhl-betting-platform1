"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{allowance,selectEvents}=require("../src/sportsbook-event-quota.cjs");
test("old completed NFL-only six credit archive permits NHL only, crash/unknown never refunded",()=>{
 const date="2026-11-15",legacy={pacificDate:date,reservedCredits:12,createdAt:"2026-11-15T15:29:00Z"},completed={pacificDate:date,generatedAt:"2026-11-15T15:30:00Z",status:"fresh_bounded_archive",reservedCredits:12,plannedCreditsAttempted:6,quotaCreditsReported:6,results:{NFL:{status:"fresh_two_sided_quotes"}},rows:[{sport:"NFL"}]};
 assert.equal(allowance({sport:"NHL",date,legacy,completed}),6);
 assert.equal(allowance({sport:"NFL",date,legacy,completed}),0);
 assert.equal(allowance({sport:"NHL",date,legacy,completed,marker:{}}),0);
 assert.equal(allowance({sport:"NHL",date,legacy}),0);
 assert.equal(allowance({sport:"NHL",date,legacy,completed:{...completed,failure:"unknown"}}),0);
 assert.equal(allowance({sport:"NFL",date}),6);
});
const now=Date.parse("2026-11-15T20:00:00Z"),norm=x=>String(x).toLowerCase(),pair=(a,b)=>[a,b].sort().join("|"),club=(s,t)=>({PHI:"philadelphia flyers",EDM:"edmonton oilers"})[t],e={id:"odds",home_team:"Philadelphia Flyers",away_team:"Edmonton Oilers",commence_time:"2026-11-16T00:40:00Z"},g={id:123,home:"PHI",away:"EDM",startTimeUTC:"2026-11-16T00:30:00Z",gameState:"FUT"},board=[{game:"pp",teams:pair("philadelphia flyers","edmonton oilers"),start:Date.parse(g.startTimeUTC),playerId:"x",tier:"standard",marketKey:"player_shots_on_goal",line:2.5}],base={sport:"NHL",events:[e],board,official:[g],officialFresh:true,now,club,pair,norm};
test("official unique game bridges ten minute offset; stale, wrong, duplicated or live games fail",()=>{
 assert.equal(selectEvents(base).targets[0].method,"official_schedule_bridge");
 assert.equal(selectEvents({...base,officialFresh:false}).targets.length,0);
 assert.equal(selectEvents({...base,official:[g,{...g,id:456}]}).targets.length,0);
 assert.equal(selectEvents({...base,events:[e,{...e,id:"duplicate"}]}).targets.length,0);
 assert.equal(selectEvents({...base,official:[{...g,gameState:"LIVE"}]}).targets.length,0);
 assert.equal(selectEvents({...base,official:[{...g,home:"EDM",away:"PHI"}]}).targets.length,0);
});
