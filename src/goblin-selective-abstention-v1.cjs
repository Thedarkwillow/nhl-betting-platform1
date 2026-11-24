"use strict";
/** Forward-only experimental Goblin abstention: never rescreen prior first-Git
 * cohorts or label these thresholds as calibrated / positive EV.
 */
const finite=x=>typeof x==="number"&&Number.isFinite(x);
const mean=a=>a.reduce((v,x)=>v+x,0)/a.length;
const time=x=>typeof x==="string"?Date.parse(x):NaN;
function abstain(row,reason){
 return {...row,kind:row.kind||"goblin_two_stage_nhl_first_git_shadow_v1",
  status:"abstain",reason,internalChallengerSide:null,
  goblinSelectiveScreen:"abstain",selectiveAbstentionRecordedBeforeGame:true,
  originalAppAvailabilityAuthenticated:false,
  bettingEligible:false,automatedLineupEligible:false,
  modelPromoted:false,probabilityCalibrated:false,expectedValue:null};
}
function filterNHL(p,history,row,{now,opponent,officialPreview}={}){
 if(row?.status!=="shadow_candidate")return row;
 if(!Number.isFinite(time(now))||!Array.isArray(history)||
   history.length<18||history.some(x=>x?.gameDate>=now.slice(0,10)||
    !Number.isInteger(x?.timeOnIceSeconds)||x.timeOnIceSeconds<=0||
    !["FINAL","OFF"].includes(x.gameState)))
  return abstain(row,"insufficient_verified_prior_ice_time");
 const rows=history.slice().sort((a,b)=>a.gameDate.localeCompare(b.gameDate));
 const last5=rows.slice(-5),last10=rows.slice(-10),p5=mean(last5.map(x=>x.timeOnIceSeconds)),
  p10=mean(last10.map(x=>x.timeOnIceSeconds));
 const variance=mean(last5.map(x=>(x.timeOnIceSeconds-p5)**2));
 if(p5<600||p10<600||Math.sqrt(variance)/p5>.24||
    Math.abs(p5/p10-1)>.18)
  return abstain(row,"high_ice_time_or_recent_usage_uncertainty");
 const current=rows.at(-1);
 if(last5.some(x=>x.position!==current.position||x.team!==current.team))
  return abstain(row,"recent_lineup_role_or_team_not_stable");
 // Complete prior-team observations are a matchup data-quality prerequisite,
 // not proof that shots-allowed measures points/assists or true Goblin EV.
 if(opponent?.source!=="prior_complete_official_games"||
    !Number.isInteger(opponent.games)||opponent.games<8||
    !finite(opponent.ratio)||opponent.ratio<=0||
    !Number.isFinite(time(opponent.knownAt))||time(opponent.knownAt)>=time(now))
  return abstain(row,"opponent_defensive_volume_history_unverified");
 if(Array.isArray(officialPreview?.rows)){
  const matched=officialPreview.rows.filter(x=>x.playerId===p.playerId&&
    x.gameId===p.gameId&&
    ["injured","scratched","out"].includes(String(x.status).toLowerCase())&&
    Number.isFinite(time(x.reportedAt))&&time(x.reportedAt)<=time(now));
  if(matched.length)return abstain(row,"official_pregame_scratched_or_injured");
 }
 const higher=row.challengerHigher,side=row.internalChallengerSide;
 if(!finite(higher)||higher<0||higher>1||!["Higher","Lower"].includes(side))
  return abstain(row,"distribution_direction_missing");
 if(side!==p.lean)
  return abstain(row,"model_direction_not_on_original_offered_side");
 const support=side==="Higher"?higher:1-higher;
 if(support<.64)
  return abstain(row,"insufficient_uncalibrated_directional_separation");
 return {...row,goblinSelectiveScreen:"provisional_research_candidate",
  selectiveScreenVersion:"goblin_pregame_abstention_v1",
  selectedSideOnlyBecauseOriginallyOffered:true,
  supportedByPriorOpponentVolume:true,
  recentRoleAndMinutesStable:true,
  officialActiveStatusVerified:false, // absence of scratch is NOT active proof
  experimentalThresholdNotCalibrated:true,
  originalAppAvailabilityAuthenticated:false,
  bettingEligible:false,automatedLineupEligible:false,modelPromoted:false};
}
module.exports={filterNHL,abstain};
