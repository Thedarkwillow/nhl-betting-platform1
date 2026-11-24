"use strict";
/** Research-only NFL rushing workload stability gate, first-Git FUTURE only.
 * Uses 2026 player-week stats STRICTLY before the offered event week. No
 * new direction, backfitted probability, current-game stat or payout claim.
 */
const KIND="nfl_rushing_early_week_usage_shadow_20261123_v4";
const POLICY_EFFECTIVE="2026-11-24T00:00:00Z";
const MARKETS=new Set(["rushing_yards","rushing_attempts","rush_receive_yards"]);
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const n=x=>typeof x==="number"&&Number.isFinite(x)&&x>=0;
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const team=x=>({LAR:"LA",AZ:"ARI",WSH:"WAS",JAC:"JAX"}[String(x||"").toUpperCase()]||String(x||"").toUpperCase());
function assess(p,s,weekly){
 const no=reason=>({status:"shadow_abstain",reason,originalSideNeverChanged:true,
  calibratedProbability:null,bettingEligible:false,modelPromoted:false});
 if(!MARKETS.has(p?.market)||p?.tier!=="Standard"||
    !["Higher","Lower"].includes(p.selectedSide)||!n(p.line)||
    !Number.isInteger(p.season)||!Number.isInteger(p.week)||
    !p.historicalPlayerId||!Number.isFinite(at(p.eventStartsAt))||
    !(at(s.createdAt)>=at(POLICY_EFFECTIVE))||
    at(p.eventStartsAt)-at(s.createdAt)<900000)
  return no("invalid_or_prepolicy_original_rushing_quote");
 const v3=s.usageDirectionShadowV3;
 const matches=(v3?.rows||[]).filter(r=>r.originalId===p.id&&
  r.originalMarket===p.market&&r.originalLine===p.line&&
  r.originalSide===p.selectedSide&&r.eventStartsAt===p.eventStartsAt);
 if(matches.length!==1||matches[0].status!=="shadow_selected_research_only")
  return no("directional_v3_abstained_or_exact_identity_missing");
 if(!Array.isArray(weekly))return no("prior_weekly_source_unavailable");
 const prev=weekly.filter(r=>r.player_id===p.historicalPlayerId&&
  Number(r.season)===p.season&&Number.isInteger(Number(r.week))&&
  Number(r.week)<p.week&&team(r.recent_team||r.team)===team(p.team)&&
  n(r.carries)&&n(r.rushing_yards)).sort((a,b)=>Number(a.week)-Number(b.week));
 if(new Set(prev.map(r=>Number(r.week))).size!==prev.length)
  return no("ambiguous_prior_player_week_rows");
 if(prev.length<8||Number(prev[prev.length-1].week)<p.week-3)
  return no("insufficient_fresh_prior_player_games");
 const a=prev.slice(-8),earlier=a.slice(0,4),recent=a.slice(4),
  carriesOld=mean(earlier.map(r=>r.carries)),
  carriesRecent=mean(recent.map(r=>r.carries));
 if(carriesOld<2||carriesRecent<2)
  return no("too_few_recent_rushing_opportunities");
 if(Math.abs(carriesRecent-carriesOld)>=Math.max(5,.35*carriesOld))
  return no("rushing_workload_shift_uncertain");
 const oldYpc=earlier.reduce((s,r)=>s+r.rushing_yards,0)/
   earlier.reduce((s,r)=>s+r.carries,0),
  newYpc=recent.reduce((s,r)=>s+r.rushing_yards,0)/
   recent.reduce((s,r)=>s+r.carries,0);
 if(!n(oldYpc)||!n(newYpc)||oldYpc<2||newYpc<2||
    Math.abs(newYpc-oldYpc)>=Math.max(2,.45*oldYpc))
  return no("rushing_efficiency_regime_change");
 return {status:"research_only_future_rushing_stability_screen",
  reason:"frozen_prior_usage_and_projection_agree",
  originalSide:p.selectedSide,originalLine:p.line,
  priorGamesChecked:8,lastPriorWeek:Number(a[a.length-1].week),
  earlierFourCarriesMean:Number(carriesOld.toFixed(3)),
  recentFourCarriesMean:Number(carriesRecent.toFixed(3)),
  oldYardsPerCarry:Number(oldYpc.toFixed(3)),
  recentYardsPerCarry:Number(newYpc.toFixed(3)),
  verifiedPregameActive:false,platformOfferAuthenticated:false,
  matchupDataIndependentlyVerified:false,calibratedProbability:null,
  bettingEligible:false,modelPromoted:false,originalSideNeverChanged:true};
}
function freeze(s,weekly){
 if(s?.kind!=="nfl_independent_partner_standard_directional_original_research_v1"||
    !Number.isFinite(at(s.createdAt))||!Array.isArray(s.selections))
  throw Error("Original frozen NFL prospectives required");
 if(at(s.createdAt)<at(POLICY_EFFECTIVE))
  return {kind:KIND,status:"not_enrolled_before_policy",rows:[],selected:0,
   modelPromoted:false,bettingEligible:false};
 const rows=[],seen=new Set(),reasons={};
 for(const p of s.selections.filter(p=>MARKETS.has(p.market))){
  if(seen.has(p.id))throw Error("Duplicate original first-Git NFL source ID");
  seen.add(p.id);
  const z=assess(p,s,weekly);
  if(z.status==="shadow_abstain")reasons[z.reason]=(reasons[z.reason]||0)+1;
  rows.push({originalId:p.id,market:p.market,sourceGameId:p.sourceGameId,
   originalLine:p.line,originalSide:p.selectedSide,eventStartsAt:p.eventStartsAt,
   ...z,originalSide:p.selectedSide,firstGitBeforeKickoffRequired:true});
 }
 return {kind:KIND,policyEffectiveAtOrAfter:POLICY_EFFECTIVE,
  generatedAt:s.createdAt,source:"season_week_strictly_before_game_from_private_nflverse",
  rows,screened:rows.length,
  selected:rows.filter(r=>r.status==="research_only_future_rushing_stability_screen").length,
  reasons,originalSideNeverChanged:true,outcomeLeakageAllowed:false,
  calibrated:false,modelPromoted:false,bettingEligible:false,
  platformSettlementVerified:false,expectedValue:null,placedWagers:0};
}
module.exports={KIND,POLICY_EFFECTIVE,assess,freeze};