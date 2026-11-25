"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {main,bdlPlan,dunkEstimate}=require("../scripts/check-nba-authorized-provider-access.cjs");
const {prospectiveSummary}=require("../scripts/grade-nba-frozen-research-v1.cjs");
const response=d=>({ok:true,json:async()=>d});
test("default and shared credentials never trigger a provider call",async()=>{
 const x=await main({SPORTSGAMEODDS_API_KEY:"shared",NBA_SPORTSGAMEODDS_API_KEY:"separate"},()=>{throw Error("unexpected network")});
 assert.equal(x.sharedCredentialRead,false);assert.equal(x.oddsRequests,0);assert.equal(x.providers.sportsGameOdds.status,"blocked_no_approved_nba_allocation_or_key");
});
test("BDL only account plan endpoint, no key or user details in report",async()=>{
 const x=await bdlPlan("test",async(url,o)=>{assert.equal(url,"https://api.balldontlie.io/account/v1/subscriptions");assert.equal(o.redirect,"error");return response({data:[{sport:"nba",tier:"paid_plus",status:"active",email:"private@example.com"}]});});
 assert.equal(x.propsEntitlementDocumented,true);assert.equal(x.liveEndpointVerified,false);assert.ok(!JSON.stringify(x).includes("private@example.com"));
});
test("DunkAPI sends estimate-only request and rejects actual records",async()=>{
 const x=await dunkEstimate("test",async(url,o)=>{assert.equal(JSON.parse(o.body).estimate_only,true);assert.equal(url,"https://mcp.dunkapi.com/v1/get_prop_history");return response({games:[{actual:24}]});});
 assert.equal(x.status,"unverified_estimate_response");
});
test("future validation requires distinct days, rejects conflicting duplicate outcome, never auto-promotes",()=>{
 const rows=Array.from({length:100},(_,i)=>({id:"r"+i,gameId:100+i,gameDate:"2026-11-24",tier:"Standard",market:"points",side:"Higher",status:"correct",rawSelectedEstimate:.6,sourceCommit:"a",modelRevision:"b".repeat(40)}));
 const x=prospectiveSummary([...rows,{...rows[0],status:"incorrect"}]);assert.equal(x.conflictingGradesExcluded,1);
 const g=Object.values(x.groups)[0];assert.equal(g.decided,99);assert.equal(g.minimumEvidenceMet,false);assert.equal(x.calibrationApproved,false);
 const y=prospectiveSummary(rows.map((r,i)=>({...r,gameDate:"2026-11-"+String(10+i%10)})));assert.equal(Object.values(y.groups)[0].minimumEvidenceMet,true);assert.equal(y.modelPromoted,false);
});
