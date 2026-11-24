"use strict";
/**
 * RESEARCH ONLY: a genuinely pregame-frozen shadow using distribution families
 * picked on 2024-25, NOT tuned to 2025-26 historical evaluation or Nov 8-19.
 * Exact original platform offers remain unmodified; opposite side unverified.
 */
const {key,LIMITS}=require("./nhl-standard-quality-challenger-v2.cjs");
const {MARKER,FAMILIES}=require("./nhl-older-season-locked-families-v1.cjs");
const KIND="nhl_older_season_chosen_family_first_git_shadow_v1";
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const prob=x=>Number.isFinite(x)&&x>0&&x<1;
const pMap=Object.freeze({
 empirical:"empiricalHigher",shifted:"shiftedHigher",
 poisson:"poissonHigher",negativeBinomial:"usageHigher",
 hurdle:"hurdleHigher",fixed20261120:"marketSpecificHigher"
});
function sourceOK(s,report,firstGitAt){
 return report?.kind===MARKER&&report.trainingSeason==="2024-25"&&
  report.evaluationSeason==="2025-26"&&
  report.evaluationNeverUsedForFamilySelection===true&&
  report.flags?.noAutomatedPromotion===true&&
  report.flags?.noHistoricalPrizePicksOrUnderdogQuotes===true&&
  Object.keys(LIMITS).every(m=>report.checks?.[m]?.sufficientTraining===true&&
   FAMILIES.includes(report.selectedFamilies?.[m]))&&
  [at(s?.generatedAt),at(report.generatedAt),at(firstGitAt)]
   .every(Number.isFinite)&&
  at(report.generatedAt)<=at(firstGitAt)&&
  at(firstGitAt)<at(s.generatedAt);
}
function freeze(s,report,{sourceFirstGitAt}={}){
 if(!sourceOK(s,report,sourceFirstGitAt))
  throw Error("Not a committed older-season trained artifact available before freeze");
 if(!Array.isArray(s?.rankedProps)||!Array.isArray(s?.individualPropSelections)||
  !Array.isArray(s?.marketDirectionResearchV1?.rows)||
  s.marketDirectionResearchV1.generatedAt!==s.generatedAt)
  throw Error("Missing same original first-Git market research population");
 const originals=s.individualPropSelections.filter(p=>
   p.tier==="Standard"&&!!LIMITS[p.market]),
  source=new Map(s.marketDirectionResearchV1.rows.map(r=>[key(r),r])),
  seen=new Set(),rows=[];
 if(source.size!==originals.length)throw Error("Incomplete original research population");
 for(const p of originals){
  const k=key(p);if(seen.has(k))throw Error("Duplicate original offer");
  seen.add(k);
  const ref=source.get(k),f=report.selectedFamilies[p.market],original=
   s.rankedProps.filter(x=>key(x)===k&&x.lean===p.lean&&
    x.capturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt);
  const core={gameId:p.gameId,playerId:p.playerId,market:p.market,
   tier:p.tier,line:p.line,originalSide:p.lean,capturedAt:p.capturedAt,
   gameStartAt:p.gameStartAt,chosenFamily:f,
   higher:null,direction:null,status:"shadow_abstain",
   reason:"missing_verified_original_research_component",
   sameSideAsOriginalOffer:false,oppositeSideBookable:false,
   historicalFamilyWasChosenWithoutHoldout:true,
   activeStatusVerified:false,bettingEligible:false,modelPromoted:false};
  const sourceValid=ref?.market===p.market&&ref?.gameId===p.gameId&&
   ref?.playerId===p.playerId&&ref?.line===p.line&&
   ref?.originalSide===p.lean&&ref?.gameStartAt===p.gameStartAt&&
   ref?.capturedAt===p.capturedAt&&
   ref?.status==="research_only_conditional_on_official_appearance"&&
   ref?.bettingEligible===false&&
   ref?.priorLastGameDate<
    new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",
      year:"numeric",month:"2-digit",day:"2-digit"})
      .format(new Date(s.generatedAt))&&
   original.length===1&&
   original[0].probabilities?.higher===ref?.originalHigher;
  const q=ref?.[pMap[f]];
  if(!sourceValid||!prob(q)){
   rows.push(core);continue;
  }
  const direction=q>.5?"Higher":q<.5?"Lower":null;
  rows.push({...core,higher:q,direction,
   status:direction?"research_conditional_on_official_appearance":"shadow_abstain",
   reason:direction?"frozen_older_season_family_prediction":"indeterminate_distribution",
   sameSideAsOriginalOffer:direction===p.lean,
   sourcePriorDate:ref.priorLastGameDate});
 }
 return {kind:KIND,generatedAt:s.generatedAt,
  artifactGeneratedAt:report.generatedAt,artifactFirstGitAt:sourceFirstGitAt,
  artifactTrainingSeason:report.trainingSeason,
  artifactEvaluationSeason:report.evaluationSeason,
  selectedFamilies:report.selectedFamilies,
  originalPopulation:originals.length,rows,
  strictPolicyUnchanged:true,sourceTrainingPrecedesOriginalFreeze:true,
  sourceHistoricalHoldoutNotPristine:true,noPlatformPayoutVerified:true,
  bettingEligible:false,modelPromoted:false,placedWagers:0};
}
module.exports={KIND,pMap,sourceOK,freeze};
