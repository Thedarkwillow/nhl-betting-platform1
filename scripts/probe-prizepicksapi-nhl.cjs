"use strict";
const {assertPrizePicksApiAllowed}=require("../src/prizepicksapi-november-quota-lock.cjs");
/**
 * One authenticated, read-only, 25-row request matching the user's curl.
 * No second request, writes, provider response body or secrets in logs.
 * Not a replacement for full-board pagination or actual sportsbook verification.
 */
const {requestNhlPage}=require("../src/prizepicksapi-nhl-request.cjs");
// Pure, offline-only parser for contract tests. The real probe must always
// enforce the metered provider lock *before* requesting the network.
function summarizeProbeResponse(response){
 const rows=response?.data,meta=response?.meta||{};
 if(!Array.isArray(rows)||rows.length>25)
  throw Error("Independent provider returned malformed 25-row NHL response");
 const curs=meta.next_cursor;
 if(curs!==null&&curs!==undefined&&
  (typeof curs!=="string"||!/^[\x21-\x7e]{1,512}$/.test(curs)))
  throw Error("Independent provider returned an invalid cursor format");
 return {status:"nhl_minimal_request_accepted",
  authenticated:true,method:"GET",league:"NHL",
  pageSizeLimit:25,actualRows:rows.length,
  pageCount:1,additionalRequests:0,
  sourceMode:typeof meta.mode==="string"?meta.mode:"unknown",
  sourceStatus:["fresh","partial","stale","failed"].includes(meta.source_status)?
   meta.source_status:"unknown",
  nextCursorPresent:!!curs,
  sourceObservedAt:typeof meta.observed_at==="string"?meta.observed_at:null,
  boardComplete:!curs&&meta.mode==="live"&&meta.source_status==="fresh",
  quotaAndFinalSettlementVerified:false,
  note:"This is one successful provider HTTP response, not proof of full live NHL coverage, future API uptime or original PrizePicks platform authenticity."};
}
async function probe(key,{client=fetch}={}){
 assertPrizePicksApiAllowed();
 if(!key)throw Error("PRIZEPICKSAPI_KEY is not configured");
 const response=await requestNhlPage(key,{limit:25,client});
 return summarizeProbeResponse(response);
}
if(require.main===module)probe(process.env.PRIZEPICKSAPI_KEY).then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error("Minimal NHL provider contract probe: "+e.message);process.exitCode=1});
module.exports={probe,summarizeProbeResponse};
