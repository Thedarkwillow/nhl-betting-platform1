"use strict";
/**
 * Explicit, documented PrizePicks independent-provider request builder.
 * Keep the API key in an Authorization header, never a URL, file or log.
 */
const URL_BASE="https://prizepicksapi.com/api/v1/projections";
const USER_CONTEXT="Explore live props in the workspace";
// Cursors are opaque provider values: bound size/controls, encode via URLSearchParams.
const cursorPattern=/^[\x21-\x7e]{1,512}$/;
function makeNhlRequest(key,{limit=200,cursor=null,view=null}={}){
 if(typeof key!=="string"||!key.trim())throw Error("Provider key unavailable");
 if(USER_CONTEXT.length<3||USER_CONTEXT.length>500)throw Error("Missing mandatory X-User-Request task context");
 if(view!==null&&view!=="compact")throw Error("Unsupported provider projection view");
 const maximum=view==="compact"?1000:200;
 if(!Number.isInteger(limit)||limit<1||limit>maximum)throw Error("Provider page limit must be 1-"+maximum);
 if(cursor!==null&&(typeof cursor!=="string"||!cursorPattern.test(cursor)))
  throw Error("Unsafe or malformed provider pagination cursor");
 const url=new URL(URL_BASE);
 url.searchParams.set("league","NHL");
 if(view)url.searchParams.set("view",view);
 url.searchParams.set("limit",String(limit));
 if(cursor!==null)url.searchParams.set("cursor",cursor);
 return {url,options:{method:"GET",headers:{
   Authorization:"Bearer "+key,
   Accept:"application/json",
   "X-User-Request":USER_CONTEXT
 },signal:AbortSignal.timeout(30000)}};
}
function cleanProviderError(status,responseBody,{page=1,hasCursor=false}={}){
 // Provider-owned message text can contain request echoes or credentials.
 // Whitelist machine code only, never copy untrusted response error.message.
 const code=String(responseBody?.error?.code||"unknown");
 const cleaned=/^[A-Za-z0-9_-]{1,64}$/.test(code)?code:"redacted";
 const cause=status===400&&cleaned.toUpperCase()==="TASK_CONTEXT_REQUIRED"?
   "task_context_required":status===400?
   (hasCursor?"invalid_query_or_cursor":"invalid_query_or_provider_validation"):
   status===401?"provider_authentication":status===403?"provider_permission":
   status===429?"provider_request_limit":status>=500?"provider_service_failure":"provider_http_failure";
 return new Error("Independent PrizePicks API HTTP "+Number(status)+
  " code="+cleaned+" phase="+cause+" page="+page+
  ". Archive unchanged; inspect provider logs. No automatic retry on HTTP 400.");
}
// Read only safe numeric provider usage headers; never log API keys or raw offers.
const countHeader=(headers,name)=>{
 const value=headers?.get?.(name);
 return typeof value==="string"&&/^(0|[1-9][0-9]{0,8})$/.test(value)?Number(value):null;
};
function providerUsage(headers){
 const unit=headers?.get?.("x-usage-unit");
 return {unit:unit==="credits"||unit==="requests"?unit:"unknown",
  creditsRemaining:countHeader(headers,"x-credits-remaining"),
  creditsCost:countHeader(headers,"x-credits-cost"),
  requestsRemaining:countHeader(headers,"x-ratelimit-remaining")};
}
async function requestNhlPage(key,{cursor=null,limit=200,view=null,page=1,client=fetch,withUsage=false}={}){
 const {url,options}=makeNhlRequest(key,{limit,cursor,view});
 const r=await client(url,options);
 if(!r?.ok){
  let payload=null;
  try{payload=await r.json();}catch{}
  throw cleanProviderError(r?.status,payload,{page,hasCursor:cursor!==null});
 }
 const document=await r.json();
 return withUsage?{document,usage:providerUsage(r.headers)}:document;
}
module.exports={URL_BASE,USER_CONTEXT,makeNhlRequest,cleanProviderError,requestNhlPage,providerUsage};
