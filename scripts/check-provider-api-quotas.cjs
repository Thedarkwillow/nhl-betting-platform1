"use strict";
const fs=require("node:fs"),path=require("node:path");
const OUTPUT=path.resolve(__dirname,"../outputs/provider-quota/usage-latest.json");
const INTERVALS=["per-second","per-minute","per-hour","per-day","per-month"];
const finite=x=>typeof x==="number"&&Number.isFinite(x)?x:null;
function rateLimits(raw){
 const out={};
 for(const interval of INTERVALS){
  const row=raw?.[interval];
  if(!row||typeof row!=="object")continue;
  out[interval]={
   maxRequests:finite(row["max-requests"])??finite(row.maxRequestsPerInterval)??(row["max-requests"]==="unlimited"||row.maxRequestsPerInterval==="unlimited"?"unlimited":null),
   currentRequests:finite(row["current-requests"])??finite(row.currentIntervalRequests),
   maxObjects:finite(row["max-entities"])??finite(row.maxEntitiesPerInterval)??(row["max-entities"]==="unlimited"||row.maxEntitiesPerInterval==="unlimited"?"unlimited":null),
   currentObjects:finite(row["current-entities"])??finite(row.currentIntervalEntities),
   nextResetAt:typeof row.currentIntervalEndTime==="string"&&Number.isFinite(Date.parse(row.currentIntervalEndTime))?row.currentIntervalEndTime:null
  };
 }
 return out;
}
async function querySportsGameOdds(key,fetcher=fetch){
 if(!key)return {status:"missing_key"};
 const url="https://api.sportsgameodds.com/v2/account/usage";
 const r=await fetcher(url,{headers:{"x-api-key":key,accept:"application/json"},signal:AbortSignal.timeout(20000)});
 if(!r.ok)return {status:"http_error",httpStatus:r.status};
 const body=await r.json();
 if(body?.success!==true||typeof body.data!=="object")return {status:"invalid_response"};
 return {status:"ok",tier:typeof body.data.tier==="string"?body.data.tier:null,
  isActive:body.data.isActive===true,
  limits:rateLimits(body.data.rateLimits)
 };
}
async function queryPrizePicksApi(key,fetcher=fetch){
 if(!key)return {status:"missing_key"};
 const url="https://prizepicksapi.com/api/v1/coverage";
 const r=await fetcher(url,{headers:{Authorization:"Bearer "+key,accept:"application/json"},signal:AbortSignal.timeout(20000)});
 const remaining=Number(r.headers?.get("x-ratelimit-remaining"));
 const limit=Number(r.headers?.get("x-ratelimit-limit"));
 const reset= r.headers?.get("x-ratelimit-reset")||null;
 // Do not fetch or store the body because coverage can expose unnecessary identifying metadata.
 return {status:r.ok?"ok":"http_error",httpStatus:r.status,
  monthlyRequestsRemaining:Number.isFinite(remaining)&&remaining>=0?remaining:null,
  monthlyRequestLimit:Number.isFinite(limit)&&limit>0?limit:null,
  resetHint:reset&&reset.length<80?reset:null,
  plan:"unverified_by_response",planSource:"Published docs; no plan claim from response headers"};
}
async function main(){
 const [sgo,pp]=await Promise.all([
  querySportsGameOdds(process.env.SPORTSGAMEODDS_API_KEY),
  queryPrizePicksApi(process.env.PRIZEPICKSAPI_KEY)
 ].map(p=>p.catch(e=>({status:"network_error",message:e.name==="TimeoutError"?"timeout":"request_failed"}))));
 const report={generatedAt:new Date().toISOString(),
  SportsGameOdds:sgo,PrizePicksApi:pp,
  publicDocs:{SportsGameOddsPro:{requestsPerMinute:300,objectsPerMonth:"unlimited"},
   PrizePicksApiFree:{requestsPerMonth:1000,requestsPerMinute:60},
   PrizePicksApiDeveloper:{requestsPerMonth:100000,requestsPerMinute:300},
   PrizePicksApiProduction:{requestsPerMonth:1000000,requestsPerMinute:1000}},
  noCredentialsStored:true,
  caution:"Only the returned provider quota values are account verified. Published limits may differ from grandfathered subscriptions. PrizePicksAPI monthly remaining header is the authoritative key-specific quota. No PrizePicks platform API credentials used."};
 fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
 fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify(report));
 if(sgo.status!=="ok"||pp.status!=="ok")process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error("Provider quota probe failed:",e.name);process.exitCode=1;});
module.exports={rateLimits,querySportsGameOdds,queryPrizePicksApi};
