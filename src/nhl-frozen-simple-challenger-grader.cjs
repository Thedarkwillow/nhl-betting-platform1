"use strict";
/** Only score truly Git-frozen pregame challenger sides. No retrospective sides. */
const {KIND}=require("./nhl-simple-pregame-challengers.cjs");
const {stablePickId}=require("./nhl-roadmap-foundations.cjs");
const VALID=["last5","last10","consensus5And10MarginHalf"];
const side=x=>x===null||x==="Higher"||x==="Lower";
const count=a=>a.length;
function score(records){
 const decided=records.filter(x=>["correct","incorrect"].includes(x.selectionStatus)),
  pushes=records.filter(x=>x.selectionStatus==="push"),
  pending=records.filter(x=>x.selectionStatus==="pending_official_player_stats");
 const out={kind:"nhl_first_git_frozen_standard_simple_challengers_v1",
  status:"original_committed_selection_benchmark_research_only",
  archivedStandardSelections:records.length,decided:decided.length,
  pushes:pushes.length,pending:pending.length,
  distinctGames:new Set(decided.map(x=>x.gameId)).size,
  strategyComparison:{},evaluableOnSameLinesOnly:true,
  fullBoardSelectionStrategyComparison:false,
  originalPlatformOfferAvailableSidesAuthenticated:false,
  actualPlatformSettlementsVerified:false,verifiedPayoutEV:false,
  productionModelChanged:false,modelPromoted:false};
 for(const strategy of VALID){
  const available=records.filter(x=>["Higher","Lower"].includes(x.strategies[strategy])),
   settled=available.filter(x=>["correct","incorrect"].includes(x.selectionStatus)),
   n=settled.length,win=fn=>settled.reduce((a,x)=>a+Number(fn(x)),0),
   model=win(x=>x.selectedSide===x.officialResult),
   challenger=win(x=>x.strategies[strategy]===x.officialResult),
   higher=win(x=>x.officialResult==="Higher"),
   lower=win(x=>x.officialResult==="Lower");
  const pct=(a,b)=>b?Number((a/b).toFixed(6)):null;
  out.strategyComparison[strategy]={
   pregameCoveredSelections:available.length,decidedOnCoveredLines:n,
   abstainedOnAllOriginalStandardSelections:records.length-available.length,
   coverageFraction:pct(available.length,records.length),
   distinctCompletedGames:new Set(settled.map(x=>x.gameId)).size,
   modelWinsOnSameCoveredLines:model,challengerWins:challenger,
   alwaysHigherWinsOnSameCoveredLines:higher,alwaysLowerWinsOnSameCoveredLines:lower,
   modelHitRateOnCoveredLines:pct(model,n),
   challengerHitRate:pct(challenger,n),higherHitRateOnCoveredLines:pct(higher,n),
   lowerHitRateOnCoveredLines:pct(lower,n),
   challengerMinusModel:pct(challenger-model,n),
   challengerMinusHigher:pct(challenger-higher,n),
   significanceEstablished:false,
   note:"Same exact originally frozen model-selected Standard lines. Historical simple side stored in that original pregame commit; no full-board or payout comparison."};
 }
 return out;
}
function evaluate(ledger,frames,{firstPolicyCommittedAt}={}){
 if(!ledger||ledger.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
  ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
  !Array.isArray(ledger.records)||!Array.isArray(frames))
  throw Error("Original immutable prospective selection ledger and snapshot provenance required");
 const time=Date.parse(firstPolicyCommittedAt);
 if(!Number.isFinite(time))throw Error("Need first Git commit date for challenger policy");
 const eligible=new Map(ledger.records.filter(r=>r.tier==="Standard"&&
  Date.parse(r.firstGitCommittedAt)>time).map(r=>[stablePickId(r),r]));
 const items=new Map(),issues=[];
 const fail=x=>issues.push(x);
 for(const frame of frames){
  const b=frame?.snapshot?.simplePregameBenchmarks;
  if(!b)continue;
  const committed=Date.parse(frame.firstCommittedAt),created=Date.parse(frame.snapshot?.generatedAt);
  // This code policy cannot retroactively claim pre-registration for snapshots
  // first committed before the policy itself was registered in Git.
  if(Number.isFinite(committed)&&committed<=time)continue;
  if(frame.gitHistoryCount!==1||!Number.isFinite(committed)||!Number.isFinite(created)||
    committed<created-999||b.kind!==KIND||
    b.createdAt!==frame.snapshot.generatedAt||
    !Array.isArray(b.rows)||b.originalStandardSelections!==b.rows.length||
    !Array.isArray(frame.snapshot.individualPropSelections)){
   fail("invalid_single_commit_or_challenger_snapshot");continue;
  }
  const expected=frame.snapshot.individualPropSelections.filter(p=>p.tier==="Standard");
  if(expected.length!==b.rows.length){fail("missing_original_frozen_standard_challenger");continue;}
  const map=new Map(expected.map(p=>[stablePickId(p),p]));
  const seen=new Set();
  for(const row of b.rows){
   let id;
   try{id=stablePickId(row);}catch{fail("malformed_challenger_identity");continue;}
   const original=map.get(id);
   if(!original||seen.has(id)||row.modelSelectedSide!==original.lean||
    row.originalGameStartAt!==original.gameStartAt||
    row.originalSourceCapturedAt!==original.capturedAt||
    !Number.isFinite(Date.parse(row.originalGameStartAt))||
    committed>=Date.parse(row.originalGameStartAt)||
    !row.strategies||VALID.some(k=>!side(row.strategies[k]))||
    !(row.samples?.last5>=0&&row.samples?.last10>=0)){
    fail("mismatched_or_invalid_pregame_challenger");continue;
   }
   seen.add(id);
   const entry=eligible.get(id);
   if(!entry||Date.parse(entry.firstGitCommittedAt)!==committed||
    entry.selectedSide!==row.modelSelectedSide)continue;
   if(items.has(id))throw Error("Repeated future frozen challenger outcome identity");
   items.set(id,{...entry,strategies:Object.fromEntries(VALID.map(k=>[k,row.strategies[k]]))});
  }
  if(seen.size!==expected.length)fail("incomplete_original_selection_coverage");
 }
 if(issues.length)throw Error("Refuse corrupted immutable baseline snapshots: "+issues.join(","));
 const audited=score([...items.values()]);
 return {...audited,
  policyFirstGitCommittedAt:firstPolicyCommittedAt,
  futureOnlyOriginalSnapshots:true,uniqueFrozenSelectedMatchCount:items.size,
  originalFrozenFutureStandardSelectionCount:eligible.size,
  missingFrozenBenchmarkForFutureStandard:eligible.size-items.size,
  initialHistoricalCohortExcluded:true,
  fullyFrozenFutureCohort:eligible.size===items.size,
  noOriginalPlatformPayoutProof:true,bettingEdgeEstablished:false};
}
module.exports={VALID,score,evaluate};
