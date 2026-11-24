"use strict";
/** Grade ONLY immutable first-Git pregame NHL SOG real-attempt research arms.
 * No after-game reconstruction, no new direction recommendations, and no ROI.
 */
const {KIND,POLICY_EFFECTIVE,signature}=require("./nhl-official-attempt-future-v1.cjs");
const {officialOutcome,provenance}=require("./nhl-standard-triple-challenger-grader.cjs");
const {pacificDay}=require("./nhl-opponent-opportunity-gate-v1.cjs");
const NAMES=["base","attempt","defense","attemptRecency","defenseRecency"];
const at=s=>typeof s==="string"?Date.parse(s):NaN;
function grade(frames,official){
 if(!Array.isArray(frames)||!official?.players)throw Error("Original Git frames and verified official history required");
 const excluded={},rows=[],seen=new Set();
 const skip=why=>excluded[why]=(excluded[why]||0)+1;
 for(const frame of [...frames].sort((a,b)=>at(a?.firstCommittedAt)-at(b?.firstCommittedAt))){
  const s=frame?.snapshot,trial=s?.sogActualAttemptFutureV1;
  if(!provenance(s,frame?.firstCommittedAt,frame?.gitHistoryCount)||
   at(s?.generatedAt)<at(POLICY_EFFECTIVE)){
   skip("not_genuinely_frozen_after_policy");continue;
  }
  if(trial?.kind!==KIND||trial.generatedAt!==s.generatedAt||
   !Array.isArray(trial.rows)||trial.productionEligible!==false||
   trial.modelPromoted!==false||!Array.isArray(s.individualPropSelections)||
   !Array.isArray(s.rankedProps)){
   skip("missing_original_research_or_source_integrity");continue;
  }
  const selected=s.individualPropSelections.filter(p=>p.market==="shotsOnGoal"&&p.tier==="Standard");
  if(trial.rows.length!==selected.length||
    new Set(selected.map(signature)).size!==selected.length||
    new Set(trial.rows.map(signature)).size!==trial.rows.length){
   skip("not_full_original_sog_population");continue;
  }
  for(const original of selected){
   const frozen=trial.rows.find(x=>signature(x)===signature(original));
   const raw=s.rankedProps.filter(x=>signature(x)===signature(original)&&
    x.capturedAt===original.capturedAt&&x.gameStartAt===original.gameStartAt&&
    x.lean===original.lean);
   const key=signature(original),start=at(original.gameStartAt),
    capture=at(original.capturedAt);
   if(seen.has(key)||!frozen||raw.length!==1||
      frozen.originalSide!==original.lean||
      frozen.originalProbability!==original.probability||
      frozen.capturedAt!==original.capturedAt||
      frozen.gameStartAt!==original.gameStartAt||
      frozen.line!==original.line||
      !Number.isFinite(start)||!Number.isFinite(capture)||
      capture>at(s.generatedAt)||start-at(frame.firstCommittedAt)<900000||
      frozen.bettingEligible!==false||frozen.calibrated!==false){
    skip("exact_original_offer_or_clock_mismatch");continue;
   }
   seen.add(key);
   const result=officialOutcome(original,official);
   if(frozen.status==="research_only"){
    if(NAMES.some(name=>frozen.variants?.[name]?.status!=="research_only"||
       !["Higher","Lower"].includes(frozen.variants?.[name]?.side)||
       frozen.variants?.[name]?.calibrated!==false)){
      skip("frozen_variant_integrity_failed");continue;
    }
   }else if(frozen.status!=="shadow_abstain"){
    skip("invalid_frozen_abstention_status");continue;
   }
   rows.push({gameId:original.gameId,playerId:original.playerId,
    originalSide:original.lean,gameStartAt:original.gameStartAt,
    outcome:result,model:frozen});
  }
 }
 const candidates=rows.filter(x=>x.outcome.status==="decided"&&x.model.status==="research_only");
 const byVariant={};
 for(const name of NAMES){
  const group=candidates.filter(x=>["Higher","Lower"].includes(x.model.variants[name].side));
  const n=group.length,candidateWin=group.filter(x=>x.model.variants[name].side===x.outcome.side).length,
    championWin=group.filter(x=>x.originalSide===x.outcome.side).length,
    higher=group.filter(x=>x.outcome.side==="Higher").length,lower=n-higher,
    games=new Set(group.map(x=>x.gameId)).size,
    slates=new Set(group.map(x=>pacificDay(x.gameStartAt))).size;
  const delta=new Map();
  for(const r of group){
   const key=r.gameId,v=delta.get(key)||{n:0,sum:0};
   v.n++;v.sum+=Number(r.model.variants[name].side===r.outcome.side)-Number(r.originalSide===r.outcome.side);
   delta.set(key,v);
  }
  // Exploratory paired-by-game resampling only; no account for shared slate
  // correlations, sample selection, original app terms or calibrated EV.
  let interval=null;
  if(delta.size>=10){
   const clusters=[...delta.values()],replicates=1000,samples=[];let seed=0xc31e6a07;
   for(let i=0;i<replicates;i++){
    let sum=0,count=0;
    for(let j=0;j<clusters.length;j++){
     seed=(Math.imul(seed,1664525)+1013904223)>>>0;
     const x=clusters[Math.floor(seed/4294967296*clusters.length)];
     sum+=x.sum;count+=x.n;
    }
    samples.push(sum/count);
   }
   samples.sort((a,b)=>a-b);
   interval={lower:samples[24],upper:samples[974],
    unit:"same_exact_original_line_equal_game_cluster_bootstrap",
    independenceNotProven:true};
  }
  byVariant[name]={decided:n,distinctOfficialGames:games,distinctPacificSlates:slates,
   championCorrect:championWin,challengerCorrect:candidateWin,
   alwaysHigherCorrect:higher,alwaysLowerCorrect:lower,
   challengerHitRate:n?candidateWin/n:null,championHitRate:n?championWin/n:null,
   alwaysHigherHitRate:n?higher/n:null,alwaysLowerHitRate:n?lower/n:null,
   challengerMinusChampion:n?(candidateWin-championWin)/n:null,
   exploratoryPairedGame95:interval,
   sampleMinimumReached:n>=200&&games>=30&&slates>=20,
   candidateBeatsBothBaselinesWithIndependentProof:false,
   productionEligible:false,expectedValueVerified:false};
 }
 return {kind:"nhl_official_real_attempt_original_git_forward_grade_v1",
  status:"prospective_frozen_original_offer_only",
  firstGitBeforeOriginalPuckDropRequired:true,
  originalBeforePolicyNeverPromoted:true,
  registered:rows.length,pending:rows.filter(r=>r.outcome.status!=="decided"&&r.outcome.status!=="push").length,
  pushes:rows.filter(r=>r.outcome.status==="push").length,
  abstained:rows.filter(r=>r.model.status==="shadow_abstain").length,
  decidedQualified:candidates.length,byVariant,excluded,
  sampleMinimum:{decided:200,games:30,distinctPacificSlates:20},
  calibrationApproved:false,payoutEVVerified:false,
  certifiedEdge:false,modelPromoted:false,placedWagers:0};
}
module.exports={grade,NAMES};
