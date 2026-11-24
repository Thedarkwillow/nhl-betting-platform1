"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {aggregate,reconcile,study,FIELDS,PERIODS}=require("../src/nfl-dedicated-period-lab.cjs");
const {probability,preview}=require("../src/nfl-dedicated-period-preview.cjs");
const {classifyMarket}=require("../src/nfl-market-registry.cjs");
function fixture(){
 const game="2025_01_A_B",event=(q,v)=>({game_id:game,play_id:q,qtr:q,season_type:"REG",posteam:"A",play_type:"run",rush_attempt:1,rusher_player_id:"r",rushing_yards:v,rush_touchdown:0});
 const events=[event(1,4),event(2,7),event(3,0),event(4,-2),event(5,3),{...event(1,99),play_id:10,play_type:"no_play"}];
 const weekly=[{season:2025,week:1,season_type:"REG",recent_team:"A",player_id:"r",position:"RB",carries:5,rushing_yards:12,rushing_tds:0,attempts:0,targets:0}];
 const schedule=[{game_id:game,season:2025,week:1,game_type:"REG",home_team:"A",away_team:"B",home_score:21,away_score:18}];
 return {events,weekly,schedule};
}
test("1Q and 1H require their own exact labels and reject conflicting explicit metadata",()=>{
 assert.equal(classifyMarket("prizepicks","1Q Pass Yards").period,"quarter_1");
 assert.equal(classifyMarket("prizepicks","Rush Yards (1H)").period,"half_1");
 assert.equal(classifyMarket("prizepicks","1Q Pass Yards",{period:"1H"}).status,"quarantine");
 assert.equal(classifyMarket("prizepicks","Pass Yards",{period:"First Half"}).period,"half_1");
 assert.equal(classifyMarket("prizepicks","Pass Yards",{period:"Q5"}).status,"quarantine");
});
test("quarter and half totals are reconciled including overtime in full game but not regulation",()=>{
 const a=reconcile(fixture());assert.equal(a.rows.length,1);
 const p=a.rows[0].periods.rushing_yards;
 assert.equal(p.quarter_1,4);assert.equal(p.half_1,11);assert.equal(p.quarter_3,0);assert.equal(p.half_2,-2);
 assert.equal(a.rows[0].full.rushing_yards.value,12);
});
test("incomplete quarters, duplicate plays or mismatched totals do not silently grade",()=>{
 const f=fixture(),a=reconcile({...f,events:f.events.filter(e=>e.qtr!==4)});assert.equal(a.rows.length,0);
 assert.equal(reconcile({...f,events:[...f.events,f.events[0]]}).rows.length,0);
 f.weekly[0].rushing_yards=999;
 assert.equal(reconcile(f).rows[0].periods.rushing_yards,undefined);
});
test("period-specific probability mass uses explicit push handling and signed yards",()=>{
 const a=probability([0,1,2,3,4,5,6,7],3),b=probability([0,1,2,3,4,5,6,7],3.5);
 assert.ok(a.probabilities.push>0);assert.equal(b.probabilities.push,0);
 assert.ok(Math.abs(a.probabilities.higher+a.probabilities.lower+a.probabilities.push-1)<1e-8);
 assert.equal(probability([1,2],1),null);
});
test("missing actual period source abstains and never publishes picks",()=>{
 const at="2026-11-15T01:00:00Z",r=preview({board:{provider:"partner-api.prizepicks.com",sourceStatus:"fresh",completePagination:true,boardAsOfAt:at,periodResearchRows:[]},now:at});
 assert.equal(r.status,"no_explicit_period_source_rows");assert.equal(r.autoPickEligible,false);
});
test("empty archives do not fabricate period coverage",()=>{
 const d=study({events:[],weekly:[],schedule:[]});assert.equal(d.reconciledAppearanceRows,0);assert.deepEqual(d.bySeasonMarketPeriod,{});assert.equal(d.markets.length,16);assert.equal(d.periods.length,6);
});
