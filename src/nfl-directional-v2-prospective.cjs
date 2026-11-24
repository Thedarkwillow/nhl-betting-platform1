"use strict";
/**
 * Proposed NFL direction research v2. Never alter the champion, synthesize an
 * unavailable opposite offer, treat a historical backtest as a prospective trial,
 * or turn injury-feed silence into clearance. This was defined after Nov 16 2026.
 */
const {verifyCommitChronology}=require("./nfl-prospective-freeze.cjs");
const {attachNflAvailability}=require("./nfl-current-injury-evidence.cjs");
const selective=require("./nfl-market-usage-selective-future-v1.cjs");
const KIND="nfl_directional_v2_strict_abstention_future_shadow_v1";
const POLICY="nfl_future_only_margin_agreement_and_availability_20261117";
const time=x=>typeof x==="string"?Date.parse(x):NaN;
const count=x=>Number.isInteger(x)&&x>=0;
const SKIP=new Set(["out","doubtful","questionable","ambiguous","did_not_participate","probable","report_status_unconfirmed","unrecognized"]);
function assessment(p,{injuries,now}={}){
 const start=time(p?.eventStartsAt),at=time(now);
 if(![start,at].every(Number.isFinite)||at>=start-15*60000)return {status:"abstain",reason:"near_or_past_kickoff"};
 if(p.tier!=="Standard"||p.offeredSide!==p.selectedSide||!["Higher","Lower"].includes(p.selectedSide)||p.autoPickEligible!==false||p.probability!==null||
 !Number.isFinite(p.line)||!Number.isFinite(p.historicalProjection)||!Number.isFinite(p.last5Baseline)||!count(p.priorRecordedGames))
 return {status:"abstain",reason:"original_identity_or_numeric_evidence_invalid"};
 if(p.priorRecordedGames<8)return {status:"abstain",reason:"insufficient_prior_player_games"};
 const margin=Math.abs(p.historicalProjection-p.line),minMargin=Math.max(1,.12*Math.abs(p.line));
 if(!(margin>=minMargin))return {status:"abstain",reason:"direction_margin_too_small"};
 const sign=x=>x>p.line?"Higher":x<p.line?"Lower":"Tie";
 if(sign(p.historicalProjection)!==p.selectedSide||sign(p.last5Baseline)!==p.selectedSide)
 return {status:"abstain",reason:"last_five_baseline_disagrees_with_selected_direction"};
 const availability=attachNflAvailability(p,injuries,now);
 if(availability.status==="unknown"||!availability.freshReport||availability.blocksResearch||SKIP.has(availability.status))
 return {status:availability.blocksResearch||SKIP.has(availability.status)?"abstain":"directional_candidate_research_only",reason:"injury_or_active_status_unverified",availabilityStatus:availability.status,bettingEligible:false};
 // A status absent from the injury report is not a verified active roster.
 if(availability.activeGameRosterVerified!==true)
 return {status:"directional_candidate_research_only",reason:"current_game_participation_unverified",availabilityStatus:availability.status,bettingEligible:false};
 return {status:"eligible_for_research_review",reason:"all_research_filters_passed",availabilityStatus:availability.status};
}
function freeze(original,{firstGitCommittedAt,now=new Date().toISOString(),injuries=null,selectivePolicyFirstGitAt=null}={}){
 const t=time(now),src=time(original?.sourceBoardAsOfAt),git=time(firstGitCommittedAt);
 const proof=verifyCommitChronology(original,firstGitCommittedAt);
 if(original?.kind!=="nfl_independent_partner_standard_directional_original_research_v1"||
 !proof.verified||![t,src,git].every(Number.isFinite)||src>t||git>t||
 t-src>30*60000||!Array.isArray(original.selections)||!original.selections.length)
 throw Error("Recent original first-Git frozen NFL source required");
 const selectiveAt=time(selectivePolicyFirstGitAt);
 const newPolicyActive=Number.isFinite(selectiveAt)&&selectiveAt>0&&selectiveAt<=git&&git<=t;
 const rows=original.selections.map(p=>{
  const originalAssessment=assessment(p,{injuries,now});
  const result={originalId:p.id,sourceGameId:p.sourceGameId,historicalPlayerId:p.historicalPlayerId,
   market:p.market,originalLine:p.line,originalSide:p.selectedSide,
   originalFrozenProjection:p.historicalProjection,originalLast5Baseline:p.last5Baseline,
   eventStartsAt:p.eventStartsAt,
   ...originalAssessment,candidateOnly:true,originalDirectionUnchanged:true,
   platformAppOfferAuthenticated:false};
  if(newPolicyActive&&time(p.eventStartsAt)>selectiveAt+15*60000)
   result.selectiveFuture=selective.assess(p,{now,originalAssessment});
  return result;
 });
 const reasons={};for(const row of rows)if(row.status==="abstain")reasons[row.reason]=(reasons[row.reason]||0)+1;
 return {kind:KIND,policy:POLICY,createdAt:now,sourceBoardAsOfAt:original.sourceBoardAsOfAt,
  originalFirstGitCommittedAt:firstGitCommittedAt,
  selectivePolicyFirstGitAt:newPolicyActive?selectivePolicyFirstGitAt:null,
  selectiveMarketPolicy:newPolicyActive?selective.KIND:null,
  rows,summary:{registered:rows.length,abstained:rows.filter(x=>x.status==="abstain").length,
  directionalCandidates:rows.filter(x=>x.status==="directional_candidate_research_only").length,researchEligible:rows.filter(x=>x.status==="eligible_for_research_review").length,reasons},
  originalSidesUnchanged:true,retrospectiveResultsCannotValidatePolicy:true,
  newPolicyFirstGitRequiredBeforeKickoff:true,
  noOutcomeStatsConsumed:true,approvedForProduction:false,calibratedProbabilities:false,
  originalAppAvailabilityVerified:false,expectedValueVerified:false,wagersPlaced:0};
}
module.exports={KIND,POLICY,assessment,freeze};
