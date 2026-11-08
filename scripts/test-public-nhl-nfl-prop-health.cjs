"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {main}=require("./probe-nhl-nfl-prop-feed.cjs");
test("Public health probe logs ONLY aggregate counts (no player or offer IDs)",async()=>{
 let lines=[];const old=console.log;console.log=x=>lines.push(x);
 try{
  const result=await main({client:async url=>({ok:true,json:async()=>({
   meta:{current_page:1,total_pages:1},
   data:Array.from({length:url.includes("league_id=8")?210:1010},(_,i)=>({
    id:"SECRET_PROP_ID_"+i,player:"SECRET_PLAYER_NAME"})),
   included:[{type:"new_player",attributes:{secret:"NEVER_EXPORT"}}]})})});
  assert.equal(result.allSourcesComplete,true);
  assert.deepEqual(result.sports.map(x=>x.projectionCount),[210,1010]);
  assert.doesNotMatch(lines.join(""),/SECRET_PLAYER_NAME|SECRET_PROP_ID_|NEVER_EXPORT/);
  assert.equal(result.noRawPropRowsPersisted,true);
 }finally{console.log=old;}
});
test("Incomplete pagination rejects misleading public source health",async()=>{
 await assert.rejects(()=>main({client:async()=>({ok:true,json:async()=>({
  meta:{current_page:1,total_pages:2},data:Array(500).fill({}),included:[]})})}),
  /incomplete/);
});
