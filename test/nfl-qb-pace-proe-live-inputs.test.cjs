"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const pace=require("../src/nfl-qb-pace-proe-v1.cjs"),market=require("../src/nfl-pregame-game-market-v1.cjs"),live=require("../src/nfl-qb-live-context-v1.cjs");
test("dropbacks include sack but official pass attempts do not; PROE uses percentage points",()=>{
 const base={game_id:"g",season:2025,week:1,posteam:"A",defteam:"B",play_type:"pass",qtr:1,two_point_attempt:0,pass_attempt:1,sack:0,qb_dropback:1,score_differential:0,xpass:.5,pass_oe:50};
 const a=[{...base,play_id:1},{...base,play_id:2,sack:1},{...base,play_id:3,play_type:"run",pass_attempt:0,qb_dropback:0,pass_oe:-50}];
 const v={gameId:"g",y:2025,w:1,team:"A",opponent:"B",attempts:1};
 const r=pace.build(a,[v])[0];assert.equal(r.regulationScrimmagePlays,3);assert.equal(r.neutralDropbacks,2);assert.equal(r.proeSum,50);assert.equal(r.attemptsPerDropback,.5);
 assert.equal(pace.build(a,[{...v,attempts:2}]).length,0);assert.equal(pace.build([...a,a[0]],[v]).length,0);
});
test("spread and total must have two matching opposite outcomes, with fresh pregame time",()=>{
 const e={id:"e",home_team:"A",away_team:"B",commence_time:"2026-11-25T20:00:00Z"},stamp="2026-11-25T19:00:00Z";
 const s={key:"spreads",last_update:stamp,outcomes:[{name:"A",point:-3},{name:"B",point:3}]},t={key:"totals",last_update:stamp,outcomes:[{name:"Over",point:45},{name:"Under",point:45}]};
 const d={...e,bookmakers:[{key:"draftkings",markets:[s,t]}]};assert.equal(market.capture(d,e,stamp,["draftkings"])[0].homeSpread,-3);
 assert.equal(market.capture({...d,bookmakers:[{key:"draftkings",markets:[s,{...t,outcomes:[t.outcomes[0]]}]}]},e,stamp,["draftkings"]).length,0);
});
test("missing official starters and active roster cannot clear QB or offensive line",()=>{
 const now="2026-11-25T19:00:00Z",p={gameId:"2026_12_GB_LA",team:"GB",opponent:"LA",historicalPlayerId:"00-0000001",eventStartsAt:"2026-11-25T20:00:00Z",season:2026,week:12};
 const x={gameId:p.gameId,eventStartsAt:p.eventStartsAt,team:p.team,opponent:p.opponent,source:"The Odds API",twoSidedVerified:true,teamSpread:-3,total:45,marketUpdatedAt:now,observedAt:now,firstGitAt:now,firstGitVerified:true};
 const r=live.context(p,{now,quotes:[{...x,book:"a"},{...x,book:"b"}]});assert.equal(r.startingQBVerified,false);assert.equal(r.offensiveLineStartingFiveVerified,false);assert.equal(r.market.impliedTeamTotal,24);assert.equal(r.liveInputsComplete,false);
 assert.equal(live.context(p,{now,quotes:[x,x]}).market,null);
});
