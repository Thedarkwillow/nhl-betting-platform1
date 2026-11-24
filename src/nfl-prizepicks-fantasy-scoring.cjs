"use strict";
/**
 * NFL PrizePicks offensive/kicker research score calculators.
 * Values transcribed from the public PrizePicks NFL scoring guide (2025-09-17).
 * Do NOT imply current 2026 in-app scoring verification, settlement,
 * inactivity/reboot eligibility, or available fantasy-point projections.
 */
const SOURCE="https://www.prizepicks.com/playbook-article/how-to-play-prizepicks-nfl-fantasy-scoring-system";
const POSITIVE=["passingYards","passingTDs","interceptionsThrown","rushingYards",
 "rushingTDs","receptions","receivingYards","receivingTDs","fumblesLost",
 "twoPointConversions","offensiveFumbleRecoveryTDs","returnTDs"];
function validateCounts(x,fields){
 if(!x||typeof x!=="object")return fields;
 return fields.filter(k=>typeof x[k]!=="number"||!Number.isFinite(x[k])||x[k]<0||
  (k.toLowerCase().includes("yards")?false:!Number.isInteger(x[k])));
}
function scoreOffense(stats){
 const missing=validateCounts(stats,POSITIVE);
 if(missing.length)return {status:"missing_or_invalid_stat_components",missing,
  score:null,autoPickEligible:false,verifiedOriginalSettlement:false};
 const sum=stats.passingYards*.04+stats.passingTDs*4-stats.interceptionsThrown+
  stats.rushingYards*.1+stats.rushingTDs*6+stats.receptions+
  stats.receivingYards*.1+stats.receivingTDs*6-stats.fumblesLost+
  stats.twoPointConversions*2+stats.offensiveFumbleRecoveryTDs*6+stats.returnTDs*6;
 return {status:"scoring_math_only_requires_in_app_rule_and_snap_verification",
  score:Number(sum.toFixed(4)),source:SOURCE,fullPPR:true,
  autoPickEligible:false,verifiedOriginalSettlement:false};
}
function scoreKicker({fgAttempts,extraPointsMade,extraPointsMissed,wasActive}={}){
 if(wasActive!==true||!Array.isArray(fgAttempts)||!Number.isInteger(extraPointsMade)||
  extraPointsMade<0||!Number.isInteger(extraPointsMissed)||extraPointsMissed<0||
  fgAttempts.some(x=>!x||typeof x.made!=="boolean"||
   !Number.isInteger(x.distance)||x.distance<0||x.distance>100))
  return {status:"unverified_active_kicker_or_incomplete_kick_components",
   score:null,kickingPoints:null,autoPickEligible:false,verifiedOriginalSettlement:false};
 let points=0,fgMade=0;
 for(const attempt of fgAttempts){
  if(!attempt.made){points-=1;continue}
  fgMade++;points+=attempt.distance<40?3:attempt.distance<50?4:5;
 }
 points+=extraPointsMade-extraPointsMissed;
 return {status:"scoring_math_only_requires_in_app_rule_and_snap_verification",
  score:points,kickingPoints:fgMade*3+extraPointsMade,fieldGoalsMade:fgMade,
  source:SOURCE,autoPickEligible:false,verifiedOriginalSettlement:false,
  note:"Kicking Points (3*FG made + PAT made) differs from distance-weighted Kicker Fantasy Score."};
}
module.exports={SOURCE,scoreOffense,scoreKicker};
