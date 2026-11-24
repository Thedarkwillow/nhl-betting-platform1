"use strict";
/** Aggregate only independently first-Git-archived, NEW-policy Goblin
 * screens. Never rescreen old bets or grade later results as selection input.
 * This is a diagnostics denominator, not hit rate, confidence or EV.
 */
const VALID_MARKETS=new Set(["shotsOnGoal","blockedShots","assists","points"]);
const REASONS=new Set([
 "insufficient_verified_prior_ice_time",
 "high_ice_time_or_recent_usage_uncertainty",
 "recent_lineup_role_or_team_not_stable",
 "opponent_defensive_volume_history_unverified",
 "official_pregame_scratched_or_injured",
 "distribution_direction_missing",
 "model_direction_not_on_original_offered_side",
 "insufficient_uncalibrated_directional_separation"
]);
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const tally=(o,k)=>o[k]=(o[k]||0)+1;
function summarize(rows,policyAt){
 const policy=dt(policyAt),out={
  kind:"nhl_goblin_new_policy_first_git_screening_counts_v1",
  policyFirstGitVerified:Number.isFinite(policy),
  screened:0,selected:0,abstained:0,lateOrUnverified:0,
  unknownStatus:0,byMarket:{},abstentionReasons:{},
  prospectiveDecisionsUsed:0,calibrated:false,
  authenticatedPayouts:false,recommendationsReleased:0,modelPromoted:false
 };
 if(!Number.isFinite(policy))return out;
 for(const r of Array.isArray(rows)?rows:[]){
  if(r?.sport!=="NHL"||r?.tier!=="Goblin"||!VALID_MARKETS.has(r.market))continue;
  const observed=dt(r.sourceCapturedAt);
  if(!Number.isFinite(observed)||observed<=policy)continue;
  const sourceGit=dt(r.sourceFirstGitAt),shadowGit=dt(r.shadowFirstGitAt),start=dt(r.gameStartsAt);
  if(![sourceGit,shadowGit,start].every(Number.isFinite)||
     observed>sourceGit+1000||sourceGit>shadowGit+1000||
     shadowGit>start-15*60000||
     r.originalFirstGitVerified!==true||
     r.shadowFirstGitVerified!==true||
     r.sourceIdentityVerified!==true){
    out.lateOrUnverified++;continue;
  }
  const m=out.byMarket[r.market]??={screened:0,selected:0,abstained:0};
  m.screened++;out.screened++;
  if(r.status==="shadow_candidate"&&
     r.goblinSelectiveScreen==="provisional_research_candidate"&&
     r.bettingEligible===false&&r.modelPromoted===false){
    out.selected++;m.selected++;
  }else if(r.status==="abstain"&&r.bettingEligible===false){
    out.abstained++;m.abstained++;
    tally(out.abstentionReasons,REASONS.has(r.reason)?r.reason:"other_model_abstention");
  }else out.unknownStatus++;
 }
 return out;
}
module.exports={summarize};
