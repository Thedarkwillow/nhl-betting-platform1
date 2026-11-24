"use strict";
/**
 * Source-evidence labels only. Derived from timestamped and exact-stat-line
 * bookmaker comparisons, never from a guessed threshold or historical payout.
 * This module must NEVER promote an uncalibrated selection into a verified pick.
 */
function idOf(p){
 return [String(p.playerId??""),String(p.team||""),String(p.market||""),
  String(p.line??""),String(p.tier||"").toLowerCase()].join("|");
}
function toPublicEvidence(prop,comparison){
 const notes=["Model probability uncalibrated; historical prospective edge not established"];
 const tier=String(prop.tier||"").toLowerCase(),side=prop.lean;
 const identity=Number.isInteger(Number(prop.playerId))&&Number(prop.playerId)>0;
 const start=Date.parse(prop.eventStartsAt);
 if(!identity)notes.push("Canonical player ID not confirmed");
 if(!Number.isFinite(start))notes.push("Official event start unconfirmed");
 if(tier!=="standard")notes.push("Alternate tier payout and settlement unverified");
 if(side!=="Higher"&&side!=="Lower")notes.push("No directional model decision");
 const usable=identity&&Number.isFinite(start)&&["Higher","Lower"].includes(side)&&tier==="standard";
 let status="model_only",books=0,bookProbability=null,modelProbability=null;
 if(comparison&&Number.isFinite(comparison.sportsbookHigher)&&
    comparison.sportsbookHigher>0&&comparison.sportsbookHigher<1&&
    Number.isFinite(comparison.modelHigher)&&
    comparison.modelHigher>0&&comparison.modelHigher<1){
  books=new Set((comparison.books||[]).map(b=>String(typeof b==="string"?b:b?.book||"").toLowerCase()).filter(Boolean)).size;
  if(books){
   bookProbability=side==="Higher"?comparison.sportsbookHigher:1-comparison.sportsbookHigher;
   modelProbability=side==="Higher"?comparison.modelHigher:1-comparison.modelHigher;
   status=!["Higher","Lower"].includes(side)?"model_only":
    (side==="Higher"?(comparison.sportsbookHigher>.5):(comparison.sportsbookHigher<.5))?
     "model_market_agreement":comparison.sportsbookHigher===.5?"market_neutral":"model_market_disagreement";
   notes.push("Exact-line independent sportsbook comparison; "+books+" distinct book(s)");
  }
 }
 if(!books)notes.push("No fresh exact-line sportsbook match");
 if(status==="model_market_disagreement")notes.push("Model side differs from no-vig sportsbook consensus");
 if(!usable)notes.push("Not fully qualified for even research-only lineup review");
 return {status,books,bookSideProbability:bookProbability,
  modelSideProbability:modelProbability,identityConfirmed:identity,
  scheduledStartConfirmed:Number.isFinite(start),
  providerOfferVerified:false,platformPayoutVerified:false,
  probabilityCalibrated:false,prospectiveEdgeVerified:false,
  readyForBetting:false,
  requiresResearchReview:!usable||status!=="model_market_agreement",
  notes};
}
function addEvidence(props,comparisons){
 if(!Array.isArray(props)||!Array.isArray(comparisons))throw Error("Evidence requires props and exact-line comparisons");
 const grouped=new Map();
 for(const q of comparisons){
  const key=idOf(q);const a=grouped.get(key)||[];a.push(q);grouped.set(key,a);
 }
 const output=props.map(p=>{
  const all=grouped.get(idOf(p))||[];
  const comparison=all.length===1?all[0]:null;
  const evidence=toPublicEvidence(p,comparison);
  if(all.length>1){evidence.status="ambiguous_market";evidence.requiresResearchReview=true;
   evidence.notes.push("Multiple exact market comparisons with ambiguous identity; no consensus used");}
  return {...p,evidence};
 });
 const counts={};
 for(const p of output)counts[p.evidence.status]=(counts[p.evidence.status]||0)+1;
 return {props:output,summary:{totalProps:output.length,counts,
  agree:counts.model_market_agreement||0,disagree:counts.model_market_disagreement||0,
  exactBookMatch:output.filter(p=>p.evidence.books>0).length,
  verifiedBettingPicks:0,
  note:"Evidence classification, not model confidence, calibrated accuracy or a recommendation to wager."}};
}
function summarizeModelResearch(seasonLab,archiveLab){
 if(seasonLab?.kind!=="nhl_official_stat_two_season_projection_lab"||
    archiveLab?.kind!=="two_season_exploratory_nhl_model_comparison")return null;
 const bySeason={};
 for(const season of ["2025-26","2026-27"]){
  const source=archiveLab.bySeason?.[season]||{};
  const pick={};
  for(const model of ["weighted-form-v1","stable-shrink-v2","prior-mean"]){
   const r=source[model];pick[model]={decisions:r?.decisions||0,
    correct:r?.correct||0,retrospectiveRate:r?.hitRate??null,
    brierScore:r?.brierScore??null};
  }
  bySeason[season]=pick;
 }
 const marketMAE=Object.fromEntries(Object.entries(seasonLab.byMarket||{}).map(([market,x])=>
  [market,{holdoutRows:x.holdout?.playerGames||0,
    championMAE:x.championHoldoutMae??null,
    stableShrinkMAE:x.shadowHoldoutMae??null,
    improvement:x.measuredShadowImprovement??null}]));
 return {trainingSeason:seasonLab.trainingSeason,holdoutSeason:seasonLab.holdoutSeason,
  trainingObservations:seasonLab.evaluatedTrainingRows,
  holdoutObservations:seasonLab.evaluatedHoldoutRows,
  marketMAE,archivedLines:archiveLab.eligibleArchivedLines,
  retrospectiveBySeason:bySeason,
  holdoutAlwaysLowerRate:archiveLab.temporalHoldout?.alwaysLowerHeldOutHitRate??null,
  retrospectiveTrainingGate:{
   selectedCandidate:archiveLab.temporalHoldout?.chosenOnTrainingOnly??null,
   passed:archiveLab.temporalHoldout?.trainingSelectionGatePassed===true,
   archivedDecisions:archiveLab.temporalHoldout?.observedTrainingDecisions??0,
   distinctGames:archiveLab.temporalHoldout?.observedTrainingGames??0,
   requiredDecisions:archiveLab.temporalHoldout?.minimumTrainingDecisions??100,
   requiredGames:archiveLab.temporalHoldout?.minimumDistinctTrainingGames??20,
   selectedFormulaApproved:false},
  championModel:"weighted-form-v1",challengers:["stable-shrink-v2","prior-mean-v2"],
  prospectiveModelAccuracyVerified:false,
  alternativePromoted:false,calibrated:false,
  warning:"Historical NHL stats validate actual results, not reconstructed pregame model picks. Archived quote samples are selected and correlated; stronger raw-stat MAE did not translate to uniformly stronger Higher/Lower decisions. No tier payout or proven EV."};
}
module.exports={toPublicEvidence,addEvidence,summarizeModelResearch,idOf};
