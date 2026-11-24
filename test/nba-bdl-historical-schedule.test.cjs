"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalize,coverage,collect}=require("../scripts/collect-nba-bdl-historical-schedule.cjs");
const g={id:1,season:2025,date:"2026-01-05",datetime:"2026-01-06T00:00:00Z",status_state:"final",postseason:false,postponed:false,home_team_score:100,visitor_team_score:105,home_team:{id:1,abbreviation:"ATL"},visitor_team:{id:2,abbreviation:"BOS"}};
test("historical schedule validates exact season, final and unique identity",()=>{
 const a=normalize(g);assert.equal(a.namespace,"balldontlie:nba");assert.equal(coverage([a]).completeRegularSeasonCount,false);assert.throws(()=>coverage([a,a]));assert.throws(()=>normalize({...g,status_state:"scheduled"}));assert.throws(()=>normalize({...g,season:2026}));
});
test("collector paginates, excludes championship/postseason, and records incomplete league count honestly",async()=>{
 let n=0;const d=await collect("key",{wait:async()=>{},client:async(url)=>{assert.equal(url.searchParams.get("seasons[]"),"2025");n++;return {ok:true,json:async()=>n===1?{data:[g,{...g,id:2,ist_stage:"Championship"}],meta:{next_cursor:2}}:{data:[{...g,id:3,postseason:true},{...g,id:4,ist_stage:"East Group A"}],meta:{next_cursor:null}}};}});
 assert.equal(d.requests,2);assert.equal(d.games,2);assert.equal(d.completeRegularSeasonCount,false);assert.equal(d.paginationComplete,true);
});
