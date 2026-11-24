"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {verifiedPlayerIds,loadSeason}=require("../scripts/backfill-official-nhl-2024-25.cjs");
test("only selects official-identity-verified players, deduplicated",()=>{
 const ids=verifiedPlayerIds({lines:[
  {playerId:8478402,officialResultVerified:true,providerPlayerIdentityVerified:true},
  {playerId:8478402,officialResultVerified:true,providerPlayerIdentityVerified:true},
  {playerId:8477492,officialResultVerified:true,providerPlayerIdentityVerified:true},
  {playerId:22,officialResultVerified:false,providerPlayerIdentityVerified:true},
  {playerId:33,officialResultVerified:true,providerPlayerIdentityVerified:false}]});
 assert.deepEqual(ids,[8477492,8478402]);
});
test("fetches regular 2024-25 season and normalizes official shot counts",async()=>{
 let requested="";
 const r=await loadSeason(8478402,{fetcher:async url=>{
  requested=url;
  return {ok:true,status:200,json:async()=>({gameLog:[
   {gameId:2024020111,gameDate:"2024-10-18",shots:5,goals:1,assists:2,points:3}]})};
 }});
 assert.match(requested,/20242025\/2$/);
 assert.equal(r.status,"verified_games");
 assert.equal(r.games[0].shotsOnGoal,5);
 assert.equal(r.games[0].season,"2024-25");
 assert.equal(r.games[0].blockedShots,null);
});
test("missing past-season player is recorded without fabricating stats",async()=>{
 const r=await loadSeason(1,{fetcher:async()=>({status:404,ok:false})});
 assert.deepEqual(r,{status:"not_found",games:[]});
});
test("rejects unofficial or erroneous game-log payloads",async()=>{
 await assert.rejects(()=>loadSeason(1,{fetcher:async()=>({status:200,ok:true,
  json:async()=>({notGameLog:[]})})}),/missing/);
});
