"use strict";
/**
 * Validate one scope against two no-credit GET /coverage observations before
 * starting any billable projections pagination. Reduces a known board-refresh
 * race, but cannot guarantee atomic paging. Strict per-page identical
 * meta.observed_at and fail-closed capture remain mandatory.
 */
const number=x=>typeof x==="number"&&Number.isFinite(x)?x:null;
const date=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const covered=doc=>Array.isArray(doc?.data)?doc.data.find(x=>String(x?.league||"").toUpperCase()==="NHL"):null;
function inspectNhlCoverage(document,now=new Date().toISOString()){
 const t=date(now),row=covered(document),observed=date(row?.last_observed_at);
 const reasons=[];
 if(t===null)throw Error("Invalid NHL coverage gate time");
 if(document?.meta?.mode!=="live")reasons.push("non_live_coverage");
 if(document?.meta?.source_status!=="fresh"||row?.status!=="fresh")
  reasons.push("source_not_fresh");
 if(!row)reasons.push("nhl_scope_missing");
 if(!Number.isInteger(row?.projection_count)||row.projection_count<1)
  reasons.push("no_confirmed_nhl_offers");
 if(observed===null||observed>t||t-observed>30*60*1000)
  reasons.push("coverage_observation_too_old_or_invalid");
 return {eligible:reasons.length===0,reasons,
  observedAt:observed===null?null:new Date(observed).toISOString(),
  reportedProjectionCount:Number.isInteger(row?.projection_count)?row.projection_count:null};
}
function compareNhlCoverageSnapshots(first,second,now=new Date().toISOString()){
 const a=inspectNhlCoverage(first,now),b=inspectNhlCoverage(second,now),
  reasons=[...new Set([...a.reasons,...b.reasons])];
 if(a.observedAt!==null&&b.observedAt!==null&&a.observedAt!==b.observedAt)
  reasons.push("board_refreshed_between_free_coverage_checks");
 return {ready:reasons.length===0,reasons,
  firstObservedAt:a.observedAt,secondObservedAt:b.observedAt,
  lastReportedProjectionCount:b.reportedProjectionCount,
  checks:2,providerCreditsSpentOnGate:0,
  preventsPaidRequestWhenUnstable:true,
  atomicPaginationProven:false};
}
module.exports={inspectNhlCoverage,compareNhlCoverageSnapshots};
