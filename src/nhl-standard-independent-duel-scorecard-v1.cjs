"use strict";
/**
 * Read-only first-Git precommitted independent Higher/Lower A/B scorecard.
 * Shares exact original offered LINE across all models, never infers a bookable
 * opposite side, never grades absent player as a lost selection.
 */
const {key}=require("./nhl-standard-quality-challenger-v2.cjs");
const {KIND,side}=require("./nhl-standard-independent-duel-v1.cjs");
const {validate}=require("./nhl-standard-input-ab-future-scorecard-v1.cjs");
const {officialOutcome}=require("./nhl-standard-abstention-audit.cjs");
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const valid=x=>Number.isFinite(x)&&x>=0&&x<=1;
const names=["champion","currentOnly","enriched","enrichedNoOpponent",
  "enrichedNoLearned","enrichedFixedOnly","enrichedUsageOnly"];
function pacific(x){
 const pieces=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(x)).map(y=>[y.type,y.value]));
 return pieces.year+"-"+pieces.month+"-"+pieces.day;
}
function cell(){
 return {n:0,hits:0,brier:0,logLoss:0,higher:0,lower:0,
  bins:Array.from({length:5},()=>({n:0,forecastSum:0,actualSum:0}))};
}
function collect(x,p,y){
 if(!valid(p))return;
 x.n++;x.hits+=Number(side(p)===(y?"Higher":"Lower"));
 x.brier+=(p-y)**2;x.logLoss-=Math.log(Math.max(1e-8,y?p:1-p));
 x.higher+=y;x.lower+=1-y;
 const b=x.bins[Math.min(4,Math.floor(p*5))];
 b.n++;b.forecastSum+=p;b.actualSum+=y;
}
function summary(x){
 const n=x.n;
 return {decided:n,hits:x.hits,hitRate:n?x.hits/n:null,
  brier:n?x.brier/n:null,logLoss:n?x.logLoss/n:null,
  alwaysHigherSameLines:n?x.higher/n:null,
  alwaysLowerSameLines:n?x.lower/n:null,
  calibrationBins:x.bins.map((b,i)=>({
   forecastBand:i,decided:b.n,
   meanForecast:b.n?b.forecastSum/b.n:null,
   observedHigherRate:b.n?b.actualSum/b.n:null
  })),
  verifiedCalibration:false};
}
function pairedCI(grouped){
 if(grouped.size<10)return null;
 const items=[...grouped.values()],n=items.length,values=[];
 let seed=0x7c09aa17;const iterations=1800;
 for(let i=0;i<iterations;i++){
  let nobs=0,diff=0;
  for(let j=0;j<n;j++){
   seed=(Math.imul(1664525,seed)+1013904223)>>>0;
   const sample=items[Math.floor(seed/4294967296*n)];
   nobs+=sample.n;diff+=sample.sum;
  }
  if(nobs>0)values.push(diff/nobs);
 }
 values.sort((a,b)=>a-b);
 return {lower:values[Math.floor((values.length-1)*.025)],
  upper:values[Math.ceil((values.length-1)*.975)],
  draws:iterations,clusterCount:n,
  direction:"enriched_minus_current_negative_favors_enriched"};
}
function group(){
 return {n:0,models:Object.fromEntries(names.map(n=>[n,cell()])),
  pair:{n:0,enhanced:cell(),current:cell(),champion:cell(),higher:0,lower:0,originalFrozenSideHits:0,
   flippedDirections:0,game:new Map(),slate:new Map(),
   ablations:{}}};
}
function addPair(map,id,diff){
 const z=map.get(id)||{n:0,sum:0};z.n++;z.sum+=diff;map.set(id,z);
}
function record(g,r,outcome){
 g.n++;if(outcome.status!=="decided")return;
 const y=Number(outcome.side==="Higher");
 const vals={champion:r.originalHigher,...r.models};
 for(const [n,v] of Object.entries(vals)){
  if(g.models[n]&&valid(v))collect(g.models[n],v,y);
 }
 if(!valid(vals.currentOnly)||!valid(vals.enriched)||!valid(vals.champion))return;
 const p=g.pair;p.n++;p.higher+=y;p.lower+=1-y;
 p.originalFrozenSideHits+=Number(r.originalSide===(y?"Higher":"Lower"));
 collect(p.enhanced,vals.enriched,y);
 collect(p.current,vals.currentOnly,y);
 collect(p.champion,vals.champion,y);
 p.flippedDirections+=Number(side(vals.enriched)!==side(vals.currentOnly));
 const delta=(vals.enriched-y)**2-(vals.currentOnly-y)**2;
 addPair(p.game,r.gameId,delta);
 addPair(p.slate,pacific(r.gameStartAt),delta);
 for(const name of names.filter(n=>!["champion","currentOnly","enriched"].includes(n))){
  const q=vals[name];if(!valid(q))continue;
  const a=p.ablations[name]??={n:0,delta:0,game:new Map(),slate:new Map()};
  a.n++;a.delta+=(vals.enriched-y)**2-(q-y)**2;
  const change=(vals.enriched-y)**2-(q-y)**2;
  addPair(a.game,r.gameId,change);addPair(a.slate,pacific(r.gameStartAt),change);
 }
}
function reduced(g){
 const p=g.pair;
 return {totalOriginalThresholds:g.n,
  models:Object.fromEntries(Object.entries(g.models).map(([n,z])=>[n,summary(z)])),
  strictSameLineHeadToHead:{
   decided:p.n,flippedIndependentDirections:p.flippedDirections,
   current:summary(p.current),enriched:summary(p.enhanced),
   originalChampionProbabilityModel:summary(p.champion),
   originalFrozenOfferedSideHitRate:p.n?p.originalFrozenSideHits/p.n:null,
   alwaysHigherSameOriginalLine:p.n?p.higher/p.n:null,
   alwaysLowerSameOriginalLine:p.n?p.lower/p.n:null,
   distinctGames:p.game.size,distinctPacificSlates:p.slate.size,
   enhancedMinusCurrentBrier:p.n?(p.enhanced.brier-p.current.brier)/p.n:null,
   pairedGame95:pairedCI(p.game),pairedPacificSlate95:pairedCI(p.slate),
   minimumFutureSampleMet:p.n>=200&&p.game.size>=30&&p.slate.size>=20,
   researchOnly:true},
  ablations:Object.fromEntries(Object.entries(p.ablations).map(([n,a])=>[
   n,{matchedDecided:a.n,enhancedMinusAblatedBrier:a.n?a.delta/a.n:null,
    gameCI:pairedCI(a.game),slateCI:pairedCI(a.slate),
    precommittedFormulaComparison:true,causalFeatureEffectProven:false}
  ]))};
}
function audit(frames,history,abPolicyAt,duelPolicyAt){
 const seen=new Set(),counts={framesAccepted:0,framesRejected:0,
   noPrecommittedDuel:0,duplicateOriginalThresholds:0,invalidDuel:0,
   notOfficiallyDecided:0,push:0,completedDecisions:0,
   invalidOriginalThresholdsExcluded:0},
  overall=group(),byMarket={},evidence={iceTimeEligible:0,
   iceTimeMissing:0,opponentVerified:0,ppRoleVerified:0},
  policy=at(duelPolicyAt);
 for(const f of [...(frames||[])].sort((a,b)=>at(a.firstGitCommittedAt)-at(b.firstGitCommittedAt))){
  const v=validate(f,abPolicyAt),s=f?.snapshot,m=s?.standardQualityInputABV1?.independentDuel;
  if(!v.ok){counts.framesRejected++;continue;}
  if(!Number.isFinite(policy)||at(s.generatedAt)<=policy||!m||
    m.kind!==KIND||m.generatedAt!==s.generatedAt||
    m.registered!==v.eligible.length||m.rows?.length!==v.eligible.length||
    m.bettingEligible!==false||m.modelPromoted!==false||
    m.noActualOppositeSideOfferVerification!==true||
    m.independentHigherLowerForecasts!==true){
   counts.noPrecommittedDuel++;continue;
  }
  const keyed=new Map(m.rows.map(r=>[key(r),r]));
  const validOriginals=keyed.size===v.eligible.length&&
   v.eligible.every(p=>{
    const r=keyed.get(key(p)),orig=s.rankedProps.filter(x=>key(x)===key(p)&&
      x.lean===p.lean&&x.capturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt);
    const pr=orig.length===1?orig[0].probabilities||{}:{},
      ts=at(s.generatedAt),start=at(p.gameStartAt),seenAt=at(p.capturedAt),
      clockOK=[ts,start,seenAt].every(Number.isFinite)&&
        start-ts>=900000&&seenAt<=ts&&ts-seenAt<=1800000,
      identityOK=Number.isInteger(p.gameId)&&Number.isInteger(p.playerId)&&
        ["Higher","Lower"].includes(p.lean)&&Number.isFinite(p.line)&&p.line>=0,
      expectedEligible=clockOK&&identityOK&&p.line%1===.5&&
        valid(pr.higher)&&valid(pr.lower)&&pr.push===0&&
        Math.abs(pr.higher+pr.lower-1)<=1e-5;
    return r&&r.originalSide===p.lean&&r.line===p.line&&
     r.capturedAt===p.capturedAt&&r.gameStartAt===p.gameStartAt&&
     r.tier==="Standard"&&r.originalSideAndLineUntouched===true&&
     r.oppositeSideBookabilityVerified===false&&r.bettingEligible===false&&
     r.playerParticipationVerified===false&&r.platformSettlementVerified===false&&
     orig.length===1&&r.sourceEligible===expectedEligible&&
     (r.originalHigher===null?!valid(pr.higher):
       valid(r.originalHigher)&&Math.abs(r.originalHigher-pr.higher)<1e-5)&&
     (expectedEligible||(
       typeof r.sourceEligibilityReason==="string"&&r.sourceEligibilityReason.length>0&&
       Object.values(r.models||{}).every(q=>q===null)
     ))&&
     Object.entries(r.models||{}).every(([n,q])=>
       names.includes(n)&&n!=="champion"&&(q===null||valid(q)))&&
     Object.entries(r.predictedSides||{}).every(([n,z])=>
       names.includes(n)&&z===side(r.models[n]));
   });
  if(!validOriginals){counts.invalidDuel++;continue;}
  counts.framesAccepted++;
  for(const original of v.eligible){
   const k=key(original);
   if(seen.has(k)){counts.duplicateOriginalThresholds++;continue;}
   seen.add(k);
   const r=keyed.get(k);
   if(r.sourceEligible===false){
    counts.invalidOriginalThresholdsExcluded++;
    overall.n++;
    (byMarket[r.market]??=group()).n++;
    continue;
   }
   const outcome=officialOutcome(original,history);
   if(outcome.status==="push")counts.push++;
   if(outcome.status!=="decided")counts.notOfficiallyDecided++;
   else counts.completedDecisions++;
   record(overall,r,outcome);
   const g=byMarket[r.market]??=group();record(g,r,outcome);
   if(r.pregameEvidence?.enrichedExpectedIceSeconds!=null)evidence.iceTimeEligible++;
   else evidence.iceTimeMissing++;
   evidence.opponentVerified+=Number(r.pregameEvidence?.enrichedOpponentEvidence===true);
   evidence.ppRoleVerified+=Number(r.pregameEvidence?.enrichedPowerPlayRoleVerified===true);
  }
 }
 const result=reduced(overall),paired=result.strictSameLineHeadToHead;
 return {kind:"nhl_standard_independent_direction_forward_scorecard_20261120_v1",
  policyCommittedAt:duelPolicyAt??null,sourceABPolicyCommittedAt:abPolicyAt??null,
  ...counts,originals:seen.size,overall:result,
  byMarket:Object.fromEntries(Object.entries(byMarket).map(([m,g])=>[m,reduced(g)])),
  featureEvidence:evidence,
  missingFeatureAblations:{
   independentExpectedIceTimeCounterfactual:"requires_separately_frozen_pregame_feature_recomputation",
   independentPowerPlayRoleCounterfactual:"requires_verified_pregame_role_and_separately_frozen_model",
   notClaimedAsTested:true
  },
  pairedBrierCIsSupportEnhanced:
   paired.minimumFutureSampleMet===true&&
   paired.pairedGame95?.upper<0&&paired.pairedPacificSlate95?.upper<0,
  evidenceForClaimingBetterAccuracy:false,
  independentOutperformanceVerified:false,
  sameOriginalLineNotOppositeSideBookability:true,
  historicalSimulationNotMixedIntoProspective:true,
  conditionalOnOfficialAppearance:true,calibrated:false,
  expectedValueVerified:false,bettingEligible:false,
  modelPromoted:false,placedWagers:0};
}
module.exports={audit,KIND,pairedCI};