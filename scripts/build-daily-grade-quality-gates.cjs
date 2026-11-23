"use strict";
/**
 * Sanitary, descriptive same-slate quality desk. Never rewrites an original
 * pick, learns pregame thresholds from yesterday, or manufactures a settlement.
 * Input is ONLY the public aggregate day report, never the private prop ledger.
 */
const fs=require("node:fs"),path=require("node:path");
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const integer=x=>Number.isSafeInteger(x)&&x>=0;
function fail(msg){throw Error("Unsafe daily grade: "+msg);}
function tally(x,other="pending"){
 if(!x||!["registered","correct","incorrect","push","decided",other].every(k=>integer(x[k])))
  fail("missing integer counters");
 if(x.correct+x.incorrect!==x.decided||x.decided+x.push+x[other]!==x.registered)
  fail("inconsistent selections or unresolved accounting");
 if(x.decided>0&&(!finite(x.hitRate)||Math.abs(x.hitRate-x.correct/x.decided)>1e-9))
  fail("hit rate conflicts with win/loss counts");
 if(x.decided===0&&x.hitRate!==null)fail("empty group has claimed hit rate");
 for(const b of ["alwaysHigher","alwaysLower"])
  if(x.decided&&(!finite(x[b])||x[b]<0||x[b]>1))
   fail("missing paired directional benchmark");
}
function evaluate(doc){
 if(doc?.kind!=="public_original_daily_grade_v1"||
  !/^\d{4}-\d\d-\d\d$/.test(doc.slateDate||"")||
  !finite(Date.parse(doc.generatedAt))||doc.platformSettlementVerified!==false||
  doc.payoutROI!==null||doc.modelPromoted!==false||
  doc.rawPropRowsExposed!==0)fail("source identity, clock, or settlement claims");
 const h=doc.nhl||{},f=doc.nfl||{};
 const hn=h.status==="official_final_slate_graded"&&
  integer(h.scheduledGames)&&h.scheduledGames===h.finalGames;
 const fn=f.status==="archived_official_stat_outcomes_only"&&
  integer(f.scheduledGames)&&f.scheduledGames===f.finalGames&&
  f.originalIdsReconciled===true;
 if(hn){
  tally(h.all);
  for(const t of ["Standard","Goblin","Demon"])tally(h.byTier?.[t]);
  const tiers=["Standard","Goblin","Demon"].map(t=>h.byTier[t]);
  for(const k of ["registered","decided","correct","incorrect","push","pending"])
   if(tiers.reduce((n,t)=>n+t[k],0)!==h.all[k])fail("NHL tier totals disagree");
  for(const x of Object.values(h.standardByMarket||{}))tally(x);
  for(const k of ["registered","decided","correct","incorrect","push","pending"])
   if(Object.values(h.standardByMarket||{}).reduce((n,t)=>n+t[k],0)!==h.byTier.Standard[k])
    fail("NHL Standard market totals disagree");
 }
 if(fn){
  tally(f,"unresolvedPerSlate");
  if(!f.firstDistinctThreshold||!f.firstPlayerGameMarket)fail("NFL deduplication views missing");
  tally(f.firstDistinctThreshold,"unresolvedPerSlate");
  tally(f.firstPlayerGameMarket,"unresolvedPerSlate");
  for(const x of Object.values(f.distinctByMarket||{}))tally(x,"unresolvedPerSlate");
  for(const k of ["registered","decided","correct","incorrect","push","unresolvedPerSlate"])
   if(Object.values(f.distinctByMarket||{}).reduce((n,t)=>n+t[k],0)!==f.firstDistinctThreshold[k])
    fail("NFL first threshold and market totals disagree");
 }
 const p=h.standardByMarket?.points,st=h.byTier?.Standard,
  rush=f.distinctByMarket?.rushing_yards,attempts=f.distinctByMarket?.rushing_attempts;
 const as=(x)=>x?{decided:x.decided,wins:x.correct,losses:x.incorrect,
  observedHitRate:x.hitRate,alwaysHigherSameLine:x.alwaysHigher,
  alwaysLowerSameLine:x.alwaysLower}:null;
 const belowBoth=x=>x&&x.decided>=20&&x.hitRate<Math.max(x.alwaysHigher,x.alwaysLower);
 const tracks=[
  {id:"nhl_points",status:!hn?"awaiting_complete_final":belowBoth(p)?"needs_new_future_challenger":"monitor_future",
   observed:as(p),mustUsePregameEvidence:true,
   remedy:"Audit frozen points, TOI, PP, linemates and opponent concessions; test any new policy only on later first-Git games"},
  {id:"nhl_standard",status:!hn?"awaiting_complete_final":belowBoth(st)?"underperformed_same_line_baseline":"monitor_future",
   observed:as(st),modelPromotionApproved:false,
   remedy:"Require positive paired future game/slate-cluster bounds versus BOTH directional baselines before promotion"},
  {id:"nfl_rushing",status:!fn?"awaiting_complete_final":
   (belowBoth(rush)||belowBoth(attempts))?"underperformed_market_benchmark":"monitor_future",
   yards:as(rush),attempts:as(attempts),notIndependentEntries:true,
   remedy:"Investigate carries, snaps, injuries, matchup and source identity using past-only evidence; freeze any new filter before games"},
  {id:"unresolved",status:hn&&fn?"needs_individual_evidence":"awaiting_complete_final",
   nhlPending:hn?h.all.pending:null,nflUnresolved:fn?f.unresolvedPerSlate:null,
   nflFirstDistinctThresholdUnresolved:fn?f.firstDistinctThreshold.unresolvedPerSlate:null,
   evidenceNeeded:"Official boxscore and exact identity/appearance; do not convert to a loss or a platform refund"},
  {id:"probability_payout",status:"not_verified",
   calibratedHigherLowerProbability:false,originalAppSettlementVerified:false,
   authenticatedPlatformPayout:false,expectedValue:null,approvedLineups:0,
   remedy:"Withhold wagering-ready confidence, EV and Power/Flex lineup claims until independent held-out calibration and exact platform settlement"},
  {id:"automated_grading",status:hn&&fn?"aggregate_evidence_reconciled":"incomplete_sources",
   officialNhlFinals:hn,officialNflFinals:fn,privateLedgerPreserved:true,
   remedy:"Generate this fail-closed aggregate check each day after final-only original Git grading; never publish player rows"}
 ];
 return {kind:"public_daily_six_quality_gates_v1",
  slateDate:doc.slateDate,sourceGeneratedAt:doc.generatedAt,
  generatedAt:new Date().toISOString(),tracks,
  gradedNhlFinalOnly:hn,gradedNflFinalOnly:fn,
  notActualBettingROI:true,officialWagersPlaced:0,modelPromoted:false,
  originalPlatformSettlementVerified:false,calibrated:false,
  payoutAdjustedEV:null,rawPropRowsExposed:0};
}
if(require.main===module){
 const [input,output]=process.argv.slice(2);
 if(!input||!output||path.resolve(input)===path.resolve(output))fail("separate input and output required");
 const result=evaluate(JSON.parse(fs.readFileSync(input,"utf8")));
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({slateDate:result.slateDate,tracks:result.tracks.map(x=>[x.id,x.status]),
  rawPropRowsExposed:0,modelPromoted:false}));
}
module.exports={evaluate,tally};