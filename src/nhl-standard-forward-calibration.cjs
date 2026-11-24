"use strict";
/**
 * Frozen, UNFITTED calibration sensitivity study on original Standard picks.
 * This is not historical training and cannot alter the selected side.
 * New snapshots alone can contribute prospective validation after official FINAL.
 */
const {POLICY}=require("./nhl-frozen-individual-props.cjs");
const {officialOutcome,provenance}=require("./nhl-standard-triple-challenger-grader.cjs");
const {pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const KIND="nhl_standard_forward_fixed_shrink_original_git_v1";
const VERSION="fixed_selected_probability_half_shrink_to_fifty_v1";
const MIN={decisions:200,games:30,dates:20};
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const signature=r=>[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
const rounded=x=>Number(x.toFixed(6));
function shrink(p){
 if(!Number.isFinite(p)||p<=0||p>=1)throw Error("Invalid original frozen confidence");
 return rounded(.5+.5*(p-.5));
}
function freeze(snapshot){
 const at=dt(snapshot?.generatedAt);
 if(!Number.isFinite(at)||snapshot?.individualPropSelectionPolicy!==POLICY||
  !Array.isArray(snapshot?.individualPropSelections)||
  !Array.isArray(snapshot?.rankedProps))
  throw Error("Require exact original pregame NHL selected preferences");
 const originals=snapshot.individualPropSelections.filter(r=>r.tier==="Standard");
 const seen=new Set(),rows=[];
 for(const o of originals){
  const key=signature(o);
  const raw=snapshot.rankedProps.filter(r=>signature(r)===key&&
    r.lean===o.lean&&r.capturedAt===o.capturedAt);
  if(seen.has(key)||raw.length!==1||
   !Number.isFinite(o.probability)||o.probability<=.5||o.probability>=1||
   !Number.isFinite(dt(o.capturedAt))||dt(o.capturedAt)>at||
   !Number.isFinite(dt(o.gameStartAt))||dt(o.gameStartAt)-at<15*60000||
   Math.abs(raw[0].probability-o.probability)>1e-5||
   !["Higher","Lower"].includes(o.lean))throw Error("Unproven original selected Standard quote");
  seen.add(key);
  rows.push({gameId:o.gameId,playerId:o.playerId,market:o.market,
   line:o.line,tier:"Standard",gameStartAt:o.gameStartAt,
   originalCapturedAt:o.capturedAt,originalSelectedSide:o.lean,
   originalProbability:o.probability,
   shrinkProbability:shrink(o.probability),
   generatedAt:snapshot.generatedAt,
   policyVersion:VERSION,sourceOfferOriginal:true,
   changedOriginalSelectedSide:false,calibrated:false,
   originalPlatformSettlementVerified:false});
 }
 return {kind:KIND,policyVersion:VERSION,createdAt:snapshot.generatedAt,
  originalSnapshotGeneratedAt:snapshot.generatedAt,rows,
  researchOnly:true,fittedOnPastOutcomes:false,
  target:"selected_direction_correctness_given_no_push",
  notProvenCalibrated:true,notDeployed:true,
  noBettingRecommendation:true};
}
const isDecided=r=>r.outcome.status==="decided";
function score(rows){
 const ready=rows.filter(isDecided);
 const n=ready.length;
 const avg=f=>n?rounded(ready.reduce((s,r)=>s+f(r),0)/n):null;
 const bs=prob=>avg(r=>(prob(r)-Number(r.originalSelectedSide===r.outcome.side))**2);
 const ll=prob=>avg(r=>{
  const p=Math.max(1e-6,Math.min(1-1e-6,prob(r)));
  return r.originalSelectedSide===r.outcome.side?-Math.log(p):-Math.log(1-p);
 });
 const originalBrier=bs(r=>r.originalProbability);
 const shrinkBrier=bs(r=>r.shrinkProbability);
 const originalLogLoss=ll(r=>r.originalProbability);
 const shrinkLogLoss=ll(r=>r.shrinkProbability);
 return {registered:rows.length,decided:n,pending:rows.filter(r=>!isDecided(r)&&r.outcome.status!=="push").length,
  pushes:rows.filter(r=>r.outcome.status==="push").length,
  distinctGames:new Set(ready.map(r=>r.gameId)).size,
  distinctGameDates:new Set(ready.map(r=>pacificDay(r.gameStartAt))).size,
  originalCorrect:ready.filter(r=>r.originalSelectedSide===r.outcome.side).length,
  alwaysHigherCorrect:ready.filter(r=>r.outcome.side==="Higher").length,
  alwaysLowerCorrect:ready.filter(r=>r.outcome.side==="Lower").length,
  rawBrier:originalBrier,shrinkBrier,
  rawLogLoss:originalLogLoss,shrinkLogLoss,
  pairedShrinkMinusRawBrier:n?rounded(shrinkBrier-originalBrier):null,
  pairedShrinkMinusRawLogLoss:n?rounded(shrinkLogLoss-originalLogLoss):null,
  currentPolicyPromoted:false,probabilitiesIndependentlyCalibrated:false,
  eligibleForFurtherResearch:n>=MIN.decisions&&
    new Set(ready.map(r=>r.gameId)).size>=MIN.games&&
    new Set(ready.map(r=>pacificDay(r.gameStartAt))).size>=MIN.dates,
  correctedForGameClustering:false};
}
function grade(frames,history,{firstPolicyCommit=null}={}){
 if(!Array.isArray(frames)||!history?.players)throw Error("Original frames and official NHL history required");
 const policyAt=dt(firstPolicyCommit),rows=[],excluded={};
 const skip=k=>excluded[k]=(excluded[k]||0)+1;
 const seen=new Set();
 for(const frame of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=frame?.snapshot,study=s?.standardForwardCalibrationShadow;
  if(study?.kind!==KIND||study.policyVersion!==VERSION){skip("shadow_missing_from_original");continue;}
  if(!Number.isFinite(policyAt)||dt(frame.firstCommittedAt)<=policyAt||
   dt(s?.generatedAt)<=policyAt){skip("not_first_committed_after_policy");continue;}
  if(!provenance(s,frame.firstCommittedAt,frame.gitHistoryCount)||
   s.individualPropSelectionPolicy!==POLICY||
   study.createdAt!==s.generatedAt||study.originalSnapshotGeneratedAt!==s.generatedAt||
   !Array.isArray(study.rows)||!Array.isArray(s.individualPropSelections)||
   !Array.isArray(s.rankedProps)){
   skip("original_git_proof_unavailable");continue;
  }
  const originals=s.individualPropSelections.filter(r=>r.tier==="Standard");
  if(originals.length!==study.rows.length||
   new Set(originals.map(signature)).size!==originals.length||
   new Set(study.rows.map(signature)).size!==study.rows.length){
   skip("shadow_or_selection_count_invalid");continue;
  }
  const validated=[];
  let failed=false;
  for(const o of originals){
   const row=study.rows.find(r=>signature(r)===signature(o));
   const raw=s.rankedProps.filter(r=>signature(r)===signature(o)&&
    r.lean===o.lean&&r.capturedAt===o.capturedAt);
   if(!row||row.policyVersion!==VERSION||row.generatedAt!==s.generatedAt||
    row.tier!=="Standard"||row.originalSelectedSide!==o.lean||
    row.originalCapturedAt!==o.capturedAt||row.gameStartAt!==o.gameStartAt||
    row.originalProbability!==o.probability||
    row.shrinkProbability!==shrink(o.probability)||
    row.changedOriginalSelectedSide!==false||row.calibrated!==false||
    raw.length!==1||Math.abs(raw[0].probability-o.probability)>1e-5||
    !Number.isFinite(dt(o.gameStartAt))||
    dt(o.gameStartAt)-dt(frame.firstCommittedAt)<15*60000||
    dt(o.capturedAt)>dt(s.generatedAt)){
    failed=true;break;
   }
   validated.push(row);
  }
  if(failed){skip("frozen_shadow_does_not_match_original_quote");continue;}
  for(const row of validated){
   const key=signature(row);
   if(seen.has(key)){skip("duplicate_original_selected_threshold");continue;}
   seen.add(key);
   rows.push({...row,outcome:officialOutcome(row,history)});
  }
 }
 const byMarket={};
 for(const market of ["shotsOnGoal","points","assists","blockedShots","goals"])
  byMarket[market]=score(rows.filter(r=>r.market===market));
 const byOriginalSide={};
 for(const side of ["Higher","Lower"])
  byOriginalSide[side]=score(rows.filter(r=>r.originalSelectedSide===side));
 const all=score(rows);
 return {kind:KIND,policyVersion:VERSION,status:"research_only_forward_test",
  firstPolicyCommitVerified:Number.isFinite(policyAt),originalFirstGitRequired:true,
  all,byMarket,byOriginalSide,exclusions:excluded,
  minimumReleaseSample:{...MIN},modelPromoted:false,
  originalPlatformSettlementVerified:false,EVVerified:false,
  interpretation:"Only same original Git-frozen Standard preferences whose FIRST commit follows this policy qualify. Fixed shrink changes confidence, never side. Do not pick a winning shrink strength after the fact. A possible Brier improvement still requires independent game-cluster and payout validation."};
}
module.exports={KIND,VERSION,MIN,shrink,freeze,score,grade,signature};
