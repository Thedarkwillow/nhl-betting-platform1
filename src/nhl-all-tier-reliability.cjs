"use strict";
// Original selected-forecast accuracy/reliability only. No new picks, rankings,
// inferred prices, financial returns or promotion. Push is not a loss.
const {rowValid}=require("./nhl-frozen-baseline-challenge.cjs");
const {pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const TIERS=["Standard","Goblin","Demon"];
const cutoffs=[0,.5,.6,.7,.8,.9,1];
const round=x=>Number(x.toFixed(6));
const frac=(x,n)=>n?round(x/n):null;
const done=r=>r.selectionStatus==="correct"||r.selectionStatus==="incorrect";
const resolved=r=>done(r)||r.selectionStatus==="push";
const win=r=>Number(r.selectionStatus==="correct");
const key=r=>[r.tier,r.gameId,r.playerId,r.market,r.line].join("|");
const by=(rows,field)=>Object.fromEntries([...new Set(rows.map(field))].sort().map(k=>[k,summary(rows.filter(r=>field(r)===k))]));
function summary(rows){
 const d=rows.filter(done),f=rows.filter(resolved),n=d.length,w=d.reduce((s,r)=>s+win(r),0);
 const q=f.length;const mean=q?frac(f.reduce((s,r)=>s+r.estimatedProbability,0),q):null;
 const realized=frac(w,q);
 return {registered:rows.length,decided:n,correct:w,incorrect:n-w,pushes:f.length-n,pending:rows.length-f.length,
  distinctGames:new Set(d.map(r=>r.gameId)).size,distinctPacificDates:new Set(d.map(r=>pacificDay(r.gameStartAt))).size,
  hitRateExcludingPushes:frac(w,n),resolvedStrictHitEventRate:realized,
  meanOriginalRawSelectedProbability:mean,rawEventCalibrationGap:q?round(mean-realized):null,
  rawEventBrier:q?frac(f.reduce((s,r)=>s+(r.estimatedProbability-win(r))**2,0),q):null,
  rawEventLogLoss:q?frac(f.reduce((s,r)=>s-(win(r)?Math.log(r.estimatedProbability):Math.log1p(-r.estimatedProbability)),0),q):null};
}
function bins(rows){
 const groups=cutoffs.slice(0,-1).map((lo,i)=>({lower:lo,upper:cutoffs[i+1],...summary(rows.filter(r=>r.estimatedProbability>=lo&&r.estimatedProbability<cutoffs[i+1]))}));
 const n=groups.reduce((s,g)=>s+g.decided+g.pushes,0);
 return {bins:groups,resolved:n,rawEventECE:n?frac(groups.reduce((s,g)=>s+(g.decided+g.pushes)*Math.abs(g.rawEventCalibrationGap??0),0),n):null};
}
function describe(rows){
 return {overall:summary(rows),byMarket:by(rows,r=>r.market),byPacificDate:by(rows,r=>pacificDay(r.gameStartAt)),
  reliability:bins(rows),reliabilityByMarket:Object.fromEntries([...new Set(rows.map(r=>r.market))].sort().map(k=>[k,bins(rows.filter(r=>r.market===k))]))};
}
function audit(ledger){
 const fail=status=>({kind:"nhl_all_tier_reliability_v1",status,researchOnly:true,calibrationApproved:false,modelPromoted:false,payoutAdjustedROI:null});
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
 ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||!Array.isArray(ledger.records)||!ledger.counts)return fail("missing_original_ledger");
 const ids=new Set(),thresholds=new Set(),tally={registered:0,correct:0,incorrect:0,push:0,pending:0};
 for(const r of ledger.records){
  if(!rowValid(r)||ids.has(r.id)||thresholds.has(key(r))||!Number.isFinite(r.estimatedProbability)||r.estimatedProbability<=0||r.estimatedProbability>=1||
   (r.tier!=="Standard"&&r.selectedSide!=="Higher"))return fail("invalid_repeated_or_unsupported_original");
  ids.add(r.id);thresholds.add(key(r));tally.registered++;tally[r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus]++;
 }
 if(Object.keys(tally).some(k=>tally[k]!==ledger.counts[k]))return fail("inconsistent_ledger_counts");
 const cohorts=Object.fromEntries(TIERS.map(t=>[t,describe(ledger.records.filter(r=>r.tier===t))]));
 return {...fail("descriptive_original_forecasts_only"),cohorts,
  rawProbabilityTarget:"strict selected-side statistical hit, conditional on presence of an official resolved stat; push is non-hit for the binary event score only, not a wager loss",
  coverageScope:"only original selected forecasts, not entire offered board; no independent selection advantage established",
  distinctRowsNotIndependent:true,originalPlatformSettlementVerified:false,bettingEdgeEstablished:false,
  note:"No postgame fitting or threshold optimization. Same-player and same-game outcomes remain correlated; no high-confidence subset is approved. Raw probability calibration depends on the source probability target; no payout comparison."};
}
module.exports={audit,summary,bins,describe};
