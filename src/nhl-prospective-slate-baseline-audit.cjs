"use strict";
/* Original frozen NHL Standard future decisions vs always-Higher/always-Lower.
 * Game + Pacific-slate clusters; a large raw prop count is NOT 20 slates.
 * Does not fit/approve probabilities, selection strategy or payout EV.
 */
const tm=x=>typeof x==="string"?Date.parse(x):NaN;
const pacific=x=>{
 const v=tm(x);if(!Number.isFinite(v))return null;
 const z=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
  year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(v).map(x=>[x.type,x.value]));
 return z.year+"-"+z.month+"-"+z.day;
};
function ci(clusters,{draws=1200,baseline="Lower"}={}){
 if(!["Higher","Lower"].includes(baseline))throw Error("Unknown paired baseline");
 if(!Array.isArray(clusters)||clusters.length<10)return null;
 let seed=0x79ad53e1,vals=[];
 for(let i=0;i<draws;i++){
  let total=0,sum=0;
  for(let j=0;j<clusters.length;j++){
   seed=(Math.imul(1664525,seed)+1013904223)>>>0;
   const x=clusters[Math.floor(seed/4294967296*clusters.length)];
   total+=x.n;sum+=x.diff;
  }
  vals.push(sum/total);
 }
 vals.sort((a,b)=>a-b);
 return {lower:vals[Math.floor((vals.length-1)*.025)],
  upper:vals[Math.ceil((vals.length-1)*.975)],draws,
  originalMinusAlwaysLower:baseline==="Lower",
  originalMinusAlwaysHigher:baseline==="Higher",baseline};
}
function audit(ledger,policyAt){
 const bad=why=>({kind:"nhl_future_first_git_standard_vs_baseline_clusters_v1",
  status:why,decided:0,distinctGames:0,distinctPacificSlates:0,
  modelMinusAlwaysLower95ByGame:null,modelMinusAlwaysLower95BySlate:null,
  modelMinusAlwaysHigher95ByGame:null,modelMinusAlwaysHigher95BySlate:null,
  beatsBothBaselinesConsistently:false,
  calibrationApproved:false,bettingEdgeEstablished:false,modelPromoted:false});
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
 ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
 !Array.isArray(ledger.records)||!Number.isFinite(tm(policyAt)))
 return bad("unverified_registry_or_policy_clock");
 const ids=new Set(),future=[];
 for(const r of ledger.records){
  if(!r||typeof r.id!=="string"||!r.id||ids.has(r.id)||
   !Number.isInteger(r.gameId)||!Number.isInteger(r.playerId)||
   !Number.isFinite(tm(r.firstGitCommittedAt))||!Number.isFinite(tm(r.gameStartAt))||
   tm(r.firstGitCommittedAt)>=tm(r.gameStartAt))
    return bad("invalid_original_first_git_identity");
  ids.add(r.id);
  if(tm(r.firstGitCommittedAt)<=tm(policyAt)||tm(r.gameStartAt)<=tm(policyAt)||
    r.tier!=="Standard"||!["correct","incorrect"].includes(r.selectionStatus))continue;
  if(!["Higher","Lower"].includes(r.selectedSide)||
   !["Higher","Lower"].includes(r.officialResult)||
   (r.selectedSide===r.officialResult)!==(r.selectionStatus==="correct")||
   !Number.isFinite(r.estimatedProbability)||r.estimatedProbability<=0||
   r.estimatedProbability>=1||
   !/^\d{4}-\d{2}-\d{2}$/.test(r.officialGameDate||""))
   return bad("future_standard_original_outcome_reconciliation_failed");
  future.push(r);
 }
 const games=new Map(),slates=new Map(),higherGames=new Map(),
  higherSlates=new Map(),markets=new Map();
 for(const r of future){
  const day=pacific(r.gameStartAt);
  if(!day)return bad("invalid_pacific_slate");
  const hit=Number(r.selectionStatus==="correct");
  const low=Number(r.officialResult==="Lower"),high=Number(r.officialResult==="Higher");
  const diff=hit-low,diffHigher=hit-high;
  const mk=typeof r.market==="string"&&r.market?r.market:"unverified_market";
  const market=markets.get(mk)||{n:0,correct:0,lower:0,higher:0,
   games:new Set(),slates:new Map(),higherSlates:new Map()};
  market.n++;market.correct+=hit;market.lower+=low;market.higher+=high;
  market.games.add(r.gameId);
  const ms=market.slates.get(day)||{n:0,diff:0};
  ms.n++;ms.diff+=diff;market.slates.set(day,ms);
  const hs=market.higherSlates.get(day)||{n:0,diff:0};
  hs.n++;hs.diff+=diffHigher;market.higherSlates.set(day,hs);
  markets.set(mk,market);
  for(const [map,key,difference] of [[games,r.gameId,diff],
   [slates,day,diff],[higherGames,r.gameId,diffHigher],
   [higherSlates,day,diffHigher]]){
   const v=map.get(key)||{n:0,diff:0};
   v.n++;v.diff+=difference;map.set(key,v);
  }
 }
 const n=future.length,model=future.filter(x=>x.selectionStatus==="correct").length,
  lower=future.filter(x=>x.officialResult==="Lower").length,higher=n-lower;
 const byGame=ci([...games.values()]),bySlate=ci([...slates.values()]),
  byHigherGame=ci([...higherGames.values()],{baseline:"Higher"}),
  byHigherSlate=ci([...higherSlates.values()],{baseline:"Higher"});
 return {kind:"nhl_future_first_git_standard_vs_baseline_clusters_v1",
  status:"original_pregame_research_only",
  decided:n,distinctGames:games.size,distinctPacificSlates:slates.size,
  selectedDirectionalHitRate:n?model/n:null,
  alwaysLowerSameLines:n?lower/n:null,
  alwaysHigherSameLines:n?higher/n:null,
  modelMinusAlwaysLower:n?(model-lower)/n:null,
  modelMinusAlwaysHigher:n?(model-higher)/n:null,
  byOriginalMarket:Object.fromEntries([...markets.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([name,x])=>{
   const interval=ci([...x.slates.values()]);
   const higherInterval=ci([...x.higherSlates.values()],{baseline:"Higher"});
   return [name,{decided:x.n,distinctGames:x.games.size,distinctPacificSlates:x.slates.size,
    modelHitRate:x.correct/x.n,alwaysLowerSameLineHitRate:x.lower/x.n,
    alwaysHigherSameLineHitRate:x.higher/x.n,
    modelMinusAlwaysLower:(x.correct-x.lower)/x.n,
    modelMinusAlwaysHigher:(x.correct-x.higher)/x.n,
    preliminaryEvidenceGate:x.games.size>=30&&x.slates.size>=20,
    slateCluster95:interval,slateClusterHigher95:higherInterval,
    futureSameMarketBeatsBothBaselines:x.games.size>=30&&x.slates.size>=20&&
     interval!==null&&higherInterval!==null&&interval.lower>0&&higherInterval.lower>0,
    futureSameMarketEdgeSupported:x.games.size>=30&&x.slates.size>=20&&interval!==null&&interval.lower>0,
    postHocMarketFilteringCouldOverfit:true,modelPromoted:false}];
  })),
  modelMinusAlwaysLower95ByGame:byGame,
  modelMinusAlwaysLower95BySlate:bySlate,
  modelMinusAlwaysHigher95ByGame:byHigherGame,
  modelMinusAlwaysHigher95BySlate:byHigherSlate,
  pairedByPacificSlate:[...slates.keys()].sort().map(day=>{
   const rows=future.filter(r=>pacific(r.gameStartAt)===day),
    correct=rows.filter(r=>r.selectionStatus==="correct").length,
    h=rows.filter(r=>r.officialResult==="Higher").length;
   return {pacificSlate:day,decided:rows.length,modelWins:correct,
    alwaysHigherWins:h,alwaysLowerWins:rows.length-h};
  }),
  preliminaryMinimumGamesMet:games.size>=30,
  minimumTwentyIndependentSlatesMet:slates.size>=20,
  independentHeldoutCalibrationEstablished:false,
  modelBeatsAlwaysLowerWithSlateClusterConfidence:slates.size>=20&&
   bySlate!==null&&bySlate.lower>0,
  modelBeatsAlwaysHigherWithSlateClusterConfidence:slates.size>=20&&
   byHigherSlate!==null&&byHigherSlate.lower>0,
  beatsBothBaselinesConsistently:slates.size>=20&&games.size>=30&&
   bySlate!==null&&byHigherSlate!==null&&
   bySlate.lower>0&&byHigherSlate.lower>0,
  calibrationApproved:false,bettingEdgeEstablished:false,modelPromoted:false,
  note:"Strictly later first-Git original Standard directions, no retrospective side flips, paired same-line Higher and Lower comparisons. Same-night games and repeated prop thresholds can be correlated; require both positive slate-cluster bounds, 20 slates and 30 games even for exploratory consistency. No executable full-board comparison, monetary EV or original fantasy-platform settlement."};
}
module.exports={audit,ci};
