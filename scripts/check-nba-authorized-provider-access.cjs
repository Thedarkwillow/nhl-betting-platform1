"use strict";
// No subscriptions, purchases, odds queries or shared NHL/NFL key access.
// Only explicit authorized account metadata probes and noncharging estimates.
const {querySportsGameOdds}=require("./check-provider-api-quotas.cjs");
const {accountAllows}=require("./collect-independent-nhl-sportsbook-fallback.cjs");
async function bdlPlan(key,client=fetch){
 if(!key)return {status:"missing_key"};
 const r=await client("https://api.balldontlie.io/account/v1/subscriptions",{headers:{Authorization:"Bearer "+key,Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(15000)});
 if(!r.ok)return {status:"http_error",httpStatus:r.status};
 const d=await r.json();if(!Array.isArray(d.data))return {status:"invalid_schema"};
 const nba=d.data.filter(x=>x.sport==="nba"&&(x.status==="active"||(x.tier==="free"&&x.status==null))),all=d.data.filter(x=>x.tier==="all_access_v3"&&x.status==="active");
 if(nba.length>1||all.length>1)return {status:"ambiguous_subscription"};
 const tier=all.length?"all_access_v3":nba[0]?.tier;
 return {status:"ok",activeTier:tier||"unverified_or_free",scheduleEntitlementDocumented:true,
  statsEntitlementDocumented:["paid","paid_plus","all_access_v3"].includes(tier),
  propsEntitlementDocumented:["paid_plus","all_access_v3"].includes(tier),liveEndpointVerified:false};
}
async function dunkEstimate(key,client=fetch){
 if(!key)return {status:"missing_key"};
 const r=await client("https://mcp.dunkapi.com/v1/get_prop_history",{method:"POST",
  headers:{"x-api-key":key,Accept:"application/json","Content-Type":"application/json"},redirect:"error",
  signal:AbortSignal.timeout(15000),body:JSON.stringify({player_id:"3112335",market:"player_points",league:"nba",from_date:"2026-10-01",to_date:"2026-11-02",limit:5,estimate_only:true})});
 if(!r.ok)return {status:"http_error",httpStatus:r.status};
 const raw=await r.json(),d=raw?.data||raw;if(!d||typeof d!=="object"||Array.isArray(d.games)||d.error||raw.error)return {status:"unverified_estimate_response"};
 // No speculative interpretation of undocumented estimate response fields.
 return {status:"estimate_response_received",actualDataRequested:false,costEstimateIndependentlyVerified:false};
}
async function main(env=process.env,client=fetch){
 const gate=env.NBA_PROVIDER_PREFLIGHT_APPROVED==="1";
 const report={kind:"nba_provider_preflight_v1",generatedAt:new Date().toISOString(),
  credentialConfigured:{sportsGameOdds:!!env.NBA_SPORTSGAMEODDS_API_KEY,ballDontLie:!!env.NBA_BALLDONTLIE_API_KEY,dunkAPI:!!env.NBA_DUNKAPI_API_KEY},
  approvedNBAAllocation:env.NBA_ODDS_SEPARATE_ACCOUNT_CONFIRMED==="1",accountProbesAuthorized:gate,
  sharedCredentialRead:false,oddsRequests:0,historicalDataRequests:0,purchases:0,
  sourceAuthorizationAutomaticallyGranted:false,validatedSelections:0,providers:{}};
 const safe=async f=>{try{return await f();}catch{return {status:"network_or_schema_error"};}};
 if(gate&&report.approvedNBAAllocation&&report.credentialConfigured.sportsGameOdds){
  report.providers.sportsGameOdds=await safe(async()=>{const q=await querySportsGameOdds(env.NBA_SPORTSGAMEODDS_API_KEY,(u,o)=>client(u,{...o,redirect:"error"}));return {status:q.status,tier:q.tier||null,active:q.isActive===true,twoEventHeadroomVerified:accountAllows(q,2),liveNBAOddsVerified:false};});
 }else report.providers.sportsGameOdds={status:"blocked_no_approved_nba_allocation_or_key"};
 report.providers.ballDontLie=gate?await safe(()=>bdlPlan(env.NBA_BALLDONTLIE_API_KEY,client)):{status:"probe_disabled"};
 report.providers.dunkAPI=gate?await safe(()=>dunkEstimate(env.NBA_DUNKAPI_API_KEY,client)):{status:"probe_disabled"};
 return report;
}
if(require.main===module)main().then(x=>console.log(JSON.stringify(x))).catch(()=>{console.error("NBA preflight failed closed");process.exitCode=1;});
module.exports={main,bdlPlan,dunkEstimate};
