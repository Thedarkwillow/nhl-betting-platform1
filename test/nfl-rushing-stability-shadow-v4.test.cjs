"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assess,freeze}=require("../src/nfl-rushing-stability-shadow-v4.cjs");
function fixture(){
 const p={id:"abc",season:2026,week:13,historicalPlayerId:"00-123",team:"SF",
  sourceGameId:"a",eventStartsAt:"2026-11-29T21:00:00Z",
  market:"rushing_yards",tier:"Standard",selectedSide:"Lower",line:72.5};
 const s={kind:"nfl_independent_partner_standard_directional_original_research_v1",
  createdAt:"2026-11-27T16:00:00Z",selections:[p],
  usageDirectionShadowV3:{rows:[{originalId:"abc",originalMarket:p.market,
   originalLine:p.line,originalSide:p.selectedSide,eventStartsAt:p.eventStartsAt,
   status:"shadow_selected_research_only"}]}};
 const history=Array.from({length:8},(_,i)=>({season:2026,week:i+4,
  player_id:p.historicalPlayerId,recent_team:"SF",carries:12+i%2,
  rushing_yards:53+i%3}));
 return {p,s,history};
}
test("stable strictly prior eight games qualifies research only",()=>{
 const {s,history}=fixture(),x=freeze(s,history);
 assert.equal(x.selected,1);
 assert.equal(x.rows[0].originalSide,"Lower");
 assert.equal(x.bettingEligible,false);
 assert.equal(x.expectedValue,null);
});
test("future/current game weekly result is excluded",()=>{
 const {p,s,history}=fixture();
 history.splice(0,1);
 history.push({season:2026,week:p.week,player_id:p.historicalPlayerId,
  recent_team:"SF",carries:12,rushing_yards:58});
 assert.match(assess(p,s,history).reason,/insufficient_fresh/);
});
test("dramatic carry volume change must abstain",()=>{
 const {p,s,history}=fixture();
 for(const x of history.slice(-4))x.carries=25;
 assert.match(assess(p,s,history).reason,/workload_shift/);
});
test("ambiguous player-week records cannot inflate sample",()=>{
 const {p,s,history}=fixture();
 history.push({...history[0]});
 assert.match(assess(p,s,history).reason,/ambiguous/);
});
test("missing V3 direction never qualifies on identity alone",()=>{
 const {p,s,history}=fixture();
 s.usageDirectionShadowV3.rows=[];
 assert.match(assess(p,s,history).reason,/directional_v3/);
});
test("cannot backdate new market filter",()=>{
 const {s,history}=fixture();
 s.createdAt="2026-11-22T16:00:00Z";
 assert.equal(freeze(s,history).status,"not_enrolled_before_policy");
});
test("duplicates must be rejected",()=>{
 const {s,history}=fixture();s.selections.push({...s.selections[0]});
 assert.throws(()=>freeze(s,history),/Duplicate original/);
});