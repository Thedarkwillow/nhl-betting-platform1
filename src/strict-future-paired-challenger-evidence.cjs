"use strict";
/**
 * Fixed original-line, first-Git future-only paired model validation.
 * No candidate may be selected or altered after official results arrive.
 * Historical synthetic thresholds and retrospective labels are excluded.
 */
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const probability=x=>finite(x)&&x>=0&&x<=1;
const pct=(x,n)=>n?x/n:null;
const safe=(x)=>typeof x==="string"&&x.length>0&&x.length<120;
const MIN_GAMES=30,MIN_SLATES=20;
function valid(x,policy){
 if(!x||x.originalFirstGitVerified!==true||x.shadowFirstGitVerified!==true||
  x.officialStatVerified!==true||
  x.sideUnchanged!==true||!safe(x.originalOfferKey)||
  !safe(x.market)||!safe(x.sport)||!safe(x.gameId)||!safe(x.slate)||
  !["Higher","Lower"].includes(x.originalSide)||!finite(x.originalLine)||
  x.originalLine<0||!probability(x.championHigher)||
  !probability(x.challengerHigher)||!finite(x.actual)||
  ![at(policy),at(x.sourceCapturedAt),at(x.originalFirstGitAt),
    at(x.shadowFrozenAt),at(x.shadowFirstGitAt),
    at(x.gameStartsAt),at(x.officialFinalAt)]
   .every(Number.isFinite))return false;
 return at(policy)<at(x.sourceCapturedAt)&&
  at(x.sourceCapturedAt)<=at(x.originalFirstGitAt)&&
  at(x.originalFirstGitAt)<=at(x.shadowFrozenAt)&&
  at(x.shadowFrozenAt)<=at(x.shadowFirstGitAt)&&
  at(x.shadowFirstGitAt)<=at(x.gameStartsAt)-15*60000&&
  at(x.gameStartsAt)<at(x.officialFinalAt)&&
  at(x.sourceCapturedAt)>at(policy)&&
  x.trainingLatestKnownAt!==undefined&&
  Number.isFinite(at(x.trainingLatestKnownAt))&&
  at(x.trainingLatestKnownAt)<at(x.shadowFrozenAt);
}
function ci(batches,iterations=1200){
 if(batches.length<15)return null;
 let state=1741>>>0;const samples=[];
 for(let i=0;i<iterations;i++){
  let diff=0,n=0;
  for(let k=0;k<batches.length;k++){
   state=(Math.imul(state,1664525)+1013904223)>>>0;
   const b=batches[Math.floor(state/2**32*batches.length)];
   diff+=b.diff;n+=b.n;
  }
  samples.push(diff/n);
 }
 samples.sort((a,b)=>a-b);
 return {lower95:samples[Math.floor((iterations-1)*.025)],
  upper95:samples[Math.floor((iterations-1)*.975)],
  unit:"paired_hit_rate_model_minus_champion",
  resamplingUnit:"official_game_not_individual_correlated_props"};
}
function evaluate(rows,{policyFirstGitAt}={}){
 const reason={};
 const skip=x=>reason[x]=(reason[x]||0)+1;
 if(!Number.isFinite(at(policyFirstGitAt)))return {
  kind:"strict_future_paired_candidate_evaluation_v1",blocked:"policy_commit_unverified",
  evaluated:0,modelPromoted:false,calibrationApproved:false,optimizedLineupsApproved:false};
 const seen=new Set(),accepted=[],games=new Map(),slates=new Set();
 let abstained=0,pushes=0;
 for(const x of Array.isArray(rows)?rows:[]){
  if(x?.status==="abstain"){
   if(x.originalFirstGitVerified===true&&x.shadowFirstGitVerified===true&&
    Number.isFinite(at(x.shadowFirstGitAt))&&
    at(x.shadowFirstGitAt)<at(x.gameStartsAt)-15*60000&&
    at(policyFirstGitAt)<at(x.sourceCapturedAt)&&
    at(x.sourceCapturedAt)<=at(x.originalFirstGitAt)&&
    at(x.originalFirstGitAt)<=at(x.shadowFirstGitAt)){
    abstained++;skip("precommitted_abstain");
   }else skip("unverified_abstain_origin");
   continue;
  }
  if(!valid(x,policyFirstGitAt)){skip("invalid_original_identity_or_clock");continue;}
  const key=[x.sport,x.originalOfferKey,x.gameId,x.market,x.originalLine].join("|");
  if(seen.has(key)){skip("duplicate_original_threshold");continue;}
  seen.add(key);
  if(x.actual===x.originalLine){pushes++;skip("push");continue;}
  const higher=x.actual>x.originalLine,
   modelSide=x.challengerHigher>.5?"Higher":"Lower";
  // Evaluates a prespecified directional challenger, NOT selected after grading.
  // If equal .5, no side is inferred and candidate must abstain.
  if(x.challengerHigher===.5){abstained++;skip("neutral_candidate");continue;}
  const modelCorrect=(modelSide==="Higher")===higher,
   originalCorrect=(x.originalSide==="Higher")===higher;
  const gameKey=x.sport+"|"+x.gameId;
  const b=games.get(gameKey)||{n:0,diff:0};
  b.n++;b.diff+=Number(modelCorrect)-Number(originalCorrect);
  games.set(gameKey,b);slates.add(x.sport+"|"+x.slate);
  accepted.push({...x,modelCorrect,originalCorrect,higher});
 }
 const n=accepted.length,gameCount=games.size;
 const score=k=>n?accepted.reduce((s,x)=>s+Number(x[k]),0)/n:null;
 const brier=k=>n?accepted.reduce((s,x)=>s+(x[k]-Number(x.higher))**2,0)/n:null;
 const logLoss=k=>n?accepted.reduce((s,x)=>{
  const p=Math.max(1e-6,Math.min(1-1e-6,x[k]));
  return s-(x.higher?Math.log(p):Math.log(1-p));
 },0)/n:null;
 return {kind:"strict_future_paired_candidate_evaluation_v1",
  evaluated:n,distinctFinalGames:gameCount,distinctSlates:slates.size,
  abstained,pushes,rejections:reason,
  championHitRate:score("originalCorrect"),
  challengerHitRate:score("modelCorrect"),
  alwaysHigherSameLinesRate:n?pct(accepted.filter(x=>x.higher).length,n):null,
  alwaysLowerSameLinesRate:n?pct(accepted.filter(x=>!x.higher).length,n):null,
  championBrier:brier("championHigher"),challengerBrier:brier("challengerHigher"),
  championLogLoss:logLoss("championHigher"),challengerLogLoss:logLoss("challengerHigher"),
  pairedGameCluster95:ci([...games.values()]),
  initialEvidenceFloorMet:gameCount>=MIN_GAMES&&slates.size>=MIN_SLATES,
  independentOutperformanceProven:false,
  // Floor is a sample-size screen, never an automatic significance gate.
  authenticPlatformSettlementVerified:false,calibratedProbability:null,
  expectedValue:null,modelPromoted:false,calibrationApproved:false,
  optimizedLineupsApproved:false,placedWagers:0,
  historicalReplaysExcluded:true,sameExactOriginalLinesOnly:true};
}
module.exports={valid,evaluate,ci,MIN_GAMES,MIN_SLATES};
