"use strict";
// Research-only exact market consensus. No live prices or assumed closing
// odds, no ROI estimation or automatic selection. All quoted timestamps
// and matched identities must be provided by a verified archive adapter.
const {noVig,paperReturns}=require("./market-evidence-quality.cjs");
const dt=x=>typeof x==="string"?Date.parse(x):NaN,num=x=>Number.isFinite(x),key=x=>JSON.stringify([x.gameId,x.playerId,x.market,x.period,x.line]);
const identity=x=>x&&x.gameId!=null&&x.playerId!=null&&typeof x.market==="string"&&!!x.market&&typeof x.period==="string"&&!!x.period&&num(x.line);
function consensus(target,pairs,{asOf,maxAgeMinutes=30,minBooks=2}={}){
 if(!identity(target)||!Number.isFinite(dt(asOf))||!(dt(asOf)<dt(target.eventStartsAt)))return null;
 const groups=new Map();
 for(const pair of pairs||[]){
  if(!Array.isArray(pair)||pair.length!==2)continue;
  const a=pair[0];if(!identity(a)||key(a)!==key(target)||a.eventStartsAt!==target.eventStartsAt||!a.book||a.archiveVerified!==true||pair[1].archiveVerified!==true||dt(asOf)-dt(a.observedAt)>60000*maxAgeMinutes)continue;
  const q=noVig(pair,{asOf});if(!q)continue;
  const book=String(a.book).toLowerCase().trim(),rows=groups.get(book)||[];rows.push({at:a.observedAt,q});groups.set(book,rows);
 }
 const rows=[...groups.values()].flatMap(a=>{a.sort((x,y)=>dt(y.at)-dt(x.at));return a.length>1&&a[0].at===a[1].at?[]:[a[0].q];});
 if(rows.length<minBooks)return null;
 const higher=rows.reduce((s,x)=>s+x.higher,0)/rows.length;
 return {books:rows.length,higher,lower:1-higher,rangeHigher:[Math.min(...rows.map(x=>x.higher)),Math.max(...rows.map(x=>x.higher))],conditionalOnNoPush:true,benchmarkOnly:true};
}
function assessEvidence(x){
 const reasons=[];
 if(x?.exactMarketIdentityVerified!==true)reasons.push("market_identity_missing");
 if(x?.periodRuleVerified!==true)reasons.push("period_or_settlement_unverified");
 if(x?.sourceFresh!==true)reasons.push("source_stale_or_unverified");
 if(x?.availabilityVerified!==true)reasons.push("participation_unverified");
 if(x?.probabilityCalibrationApproved!==true)reasons.push("calibration_unapproved");
 if(x?.heldoutEvidenceApproved!==true)reasons.push("heldout_evidence_unapproved");
 if(x?.payoutTermsAuthenticated!==true)reasons.push("payout_unverified");
 return {status:reasons.length?"abstain":"eligible_for_independent_review",reasons,researchOnly:true,autoPickEligible:false};
}
function evidenceReport({sourceArchive=null,comparison=null,close=null,paper=[]}={}){
 return {kind:"private_market_benchmark_readiness_v1",sportsbookArchive:{generatedAt:sourceArchive?.generatedAt??null,sourceQuoteRows:Array.isArray(sourceArchive?.rows)?sourceArchive.rows.length:0,latestMatchedRows:Array.isArray(comparison?.comparisons)?comparison.comparisons.length:0,liveConsensusVerified:false},closing:{observedArchiveCount:close?.verifiedArchives??0,byTier:close?.byTier??{},authenticatedClose:false},paper:paperReturns(paper),releaseGate:assessEvidence({}),newProviderCalls:0,modelPromoted:false};
}
module.exports={consensus,assessEvidence,evidenceReport};
