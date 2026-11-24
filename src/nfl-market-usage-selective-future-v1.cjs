"use strict";
/**
 * Research-only *future* NFL market-specific abstention shadow.
 * Fixed before future results; calibrated outcomes and platform payouts absent.
 * The independent source-side remains unchanged, no synthesized opposite offer.
 */
const {clusterCI}=require("./nfl-directional-bias-cluster-audit.cjs");
const KIND="nfl_market_usage_margin_future_shadow_20261117_v1";
const T={
 passing_yards:{history:12,absolute:15,relative:.14},
 passing_attempts:{history:12,absolute:4,relative:.13},
 passing_completions:{history:12,absolute:3,relative:.13},
 rushing_yards:{history:12,absolute:8,relative:.20},
 rushing_attempts:{history:12,absolute:3,relative:.20},
 receiving_yards:{history:12,absolute:8,relative:.20},
 receptions:{history:12,absolute:1,relative:.24},
 receiving_targets:{history:12,absolute:1.5,relative:.20}
};
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const finite=Number.isFinite;
function assess(p,{now,originalAssessment}={}){
 const fail=reason=>({kind:KIND,status:"abstain",reason,
  originalSideUnchanged:true,bettingEligible:false,calibratedProbability:null});
 const t=T[p?.market];
 if(!t)return fail("unsupported_or_unverified_usage_market_including_kicking_and_combo");
 if(!["Higher","Lower"].includes(p.selectedSide)||p.offeredSide!==p.selectedSide||
  p.tier!=="Standard"||p.autoPickEligible!==false||p.probability!==null||
  !finite(p.line)||p.line<0||!finite(p.historicalProjection)||
  !finite(p.last5Baseline)||!Number.isInteger(p.priorRecordedGames)||
  ![at(now),at(p.eventStartsAt),at(p.sourceObservedAt)].every(finite)||
  at(p.sourceObservedAt)>at(now)||at(now)-at(p.sourceObservedAt)>30*60000||
  at(p.eventStartsAt)-at(now)<15*60000)
  return fail("unverified_original_source_clock_market_or_identity");
 if(originalAssessment?.status==="abstain")return fail("existing_future_v2_abstention");
 if(!["directional_candidate_research_only","eligible_for_research_review"].includes(originalAssessment?.status))
  return fail("existing_v2_eligibility_unknown");
 if(p.priorRecordedGames<t.history)
  return fail("insufficient_recent_player_opportunity_history");
 const margin=Math.max(t.absolute,Math.abs(p.line)*t.relative);
 const expected=p.selectedSide==="Higher"?1:-1;
 if((p.historicalProjection-p.line)*expected<margin)
  return fail("market_specific_projection_margin_unconvincing");
 if((p.last5Baseline-p.line)*expected<margin*.5)
  return fail("recent_usage_baseline_does_not_confirm_margin");
 return {kind:KIND,status:"selective_future_research_candidate_only",
  reason:"fixed_market_volume_margin_and_five_game_agreement",
  originalSideUnchanged:true,bettingEligible:false,
  originalAppQuoteAuthenticated:p.authenticatedPrizePicksAppQuote===true,
  verifiedPreKickoffParticipation:false,opponentMatchupCalibrated:false,
  calibratedProbability:null,
  // These are evidence gates, NOT bookmaker probabilities or actual EV.
  researchMargin:margin,priorRecordedGames:p.priorRecordedGames};
}
function summarize(rows){
 const decided=rows.filter(x=>x.status==="decided"),n=decided.length,
  perGame=new Map();
 for(const r of decided){
  const g=perGame.get(r.officialGameId)||{decided:0,correct:0,alwaysLowerSameLines:0};
  g.decided++;g.correct+=Number(r.correct===true);
  g.alwaysLowerSameLines+=Number(r.actualSide==="Lower");
  perGame.set(r.officialGameId,g);
 }
 const gameCI=clusterCI([...perGame.values()],"alwaysLowerSameLines"),
  correct=decided.filter(x=>x.correct===true).length,
  lower=decided.filter(x=>x.actualSide==="Lower").length;
 return {included:rows.length,decided:n,pending:rows.length-n,
  distinctGames:new Set(decided.map(x=>x.officialGameId)).size,
  distinctGameDates:new Set(decided.map(x=>x.gameDay)).size,
  originalHitRate:n?correct/n:null,alwaysLowerSameThresholdRate:n?lower/n:null,
  modelMinusAlwaysLower:n?(correct-lower)/n:null,
  originalMinusAlwaysLowerGameCluster95:gameCI,
  minimumEvidenceMet:new Set(decided.map(x=>x.officialGameId)).size>=30&&
   new Set(decided.map(x=>x.gameDay)).size>=20,
  calibratedProbability:null,oppositeSideOnAppVerified:false,
  modelPromoted:false};
}
module.exports={KIND,T,assess,summarize};
