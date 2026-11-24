"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {SOURCE_CATALOG,playerUsageMatchup,opponentSummary,buildOne,attachMatchups}
 =require("../src/nhl-matchup-scout.cjs");
const prop={playerId:50,gameId:2026020242,team:"BOS",opponent:"VGK",
 eventStartsAt:"2026-11-03T03:00:00Z",market:"shotsOnGoal",researchEligibility:"research_only"};
const rows=Array.from({length:12},(_,i)=>({
 playerId:50,gameId:2026020101+i,
 gameDate:"2026-10-"+String(i+1).padStart(2,"0"),type:"skater",
 timeOnIceSeconds:1200,shotsOnGoal:2,blockedShots:1
}));
const usage={players:{"50":rows}};
test("five real source links are classified by commercial rights and no proprietary claims",()=>{
 assert.deepEqual(SOURCE_CATALOG.map(s=>s.id),
  ["daily-faceoff","nhl-official","rotowire","moneypuck","puckpedia"]);
 assert.equal(SOURCE_CATALOG.filter(x=>x.modelFeatureImported).length,1);
 assert.equal(SOURCE_CATALOG.every(x=>x.commercialDataLicenseVerified===false),true);
 assert.equal(SOURCE_CATALOG.find(x=>x.id==="moneypuck").integration,"private_rate_shadow_and_reference");
});
test("skater last ten count per sixty uses actual official minutes, not decimal minutes",()=>{
 const x=playerUsageMatchup(prop,usage);
 assert.equal(x.status,"official_past_only");
 assert.equal(x.sampleGames,12);
 assert.equal(x.last5CountPer60,6);
 assert.equal(x.last10CountPer60,6);
 assert.equal(x.last10AverageCount,2);
 assert.equal(x.last10AverageMinutes,20);
});
test("future/same-day official stats never leak into an earlier event's matchup",()=>{
 const amended={players:{"50":[...rows,{...rows[11],gameId:99,
  gameDate:"2026-11-03",shotsOnGoal:9999}]}};
 const before=playerUsageMatchup(prop,usage);
 const after=playerUsageMatchup(prop,amended);
 assert.deepEqual(before,after);
 const earlier=playerUsageMatchup({...prop,eventStartsAt:"2026-10-06T20:00:00Z"},usage);
 assert.equal(earlier.sampleGames,5);
 assert.equal(earlier.last5CountPer60,6);
});
test("not enough minutes, goalie record, and missing statistics are explicitly unavailable",()=>{
 const few=playerUsageMatchup({...prop,eventStartsAt:"2026-10-04T20:00:00Z"},usage);
 assert.equal(few.status,"insufficient_official_history");
 assert.equal(few.last10CountPer60,null);
 assert.equal(playerUsageMatchup({...prop,market:"goals"},usage).status,
  "stat_unavailable_in_usage_archive");
 assert.equal(playerUsageMatchup({...prop,playerId:undefined},usage).status,
  "identity_or_start_missing");
 const goalie=playerUsageMatchup({...prop,market:"saves"},{
  players:{"50":rows.map(x=>({...x,type:"goalie",saves:27}))}});
 assert.equal(goalie.last10CountPer60,81);
});
test("opponent league-relative volume is descriptive, not an allowed adjustment",()=>{
 const o=opponentSummary(prop,{factors:{VGK:{shotsOnGoal:{
  ready:true,observedRatio:1.1033,games:17,multiplier:1.03}}}});
 assert.equal(o.status,"historical_only");
 assert.equal(o.observedRelativeToLeague,1.103);
 assert.equal(o.liveModelOverrideAllowed,false);
 const bad=opponentSummary(prop,{factors:{}});
 assert.equal(bad.status,"not_ready");
 assert.equal(bad.observedRelativeToLeague,null);
});
test("annotate instead of overwriting model price or probabilistic decision",()=>{
 const props=[{...prop,probability:.682,projection:3.2,tier:"Standard",
  researchEligibility:"watchlist"}];
 const r=attachMatchups(props,{usage,history:{players:{}}});
 assert.equal(r.props[0].probability,.682);
 assert.equal(r.props[0].projection,3.2);
 assert.equal(r.props[0].matchupScout.modelProbabilityAdjusted,false);
 assert.ok(r.props[0].matchupScout.qualityFlags.includes("PLAYER_ON_SAFETY_WATCHLIST"));
 assert.equal(r.summary.playerRateAvailable,1);
 assert.equal(r.summary.activeThirdPartyStatFeeds,0);
 assert.throws(()=>attachMatchups({}),/array/);
});
test("official future game identity unresolved is clearly flagged",()=>{
 const x=buildOne({...prop,gameId:null},usage,{});
 assert.ok(x.qualityFlags.includes("OFFICIAL_GAME_ID_UNRESOLVED"));
 assert.equal(x.verifiedEdge,false);
 assert.equal(x.moneyPuckDataIncluded,false);
});
