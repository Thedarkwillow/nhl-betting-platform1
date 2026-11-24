"use strict";
/**
 * Fixed four-market NHL directional research arms. Uses only earlier official
 * appearances and source vectors already present in an ORIGINAL pregame
 * snapshot. NEVER authorizes wagers or supersedes strict production abstention.
 * The feature family and coefficients are defined before new prospective games.
 */
const {historyBefore,ice}=require("./nhl-eight-accuracy-research-v1.cjs");
const {distribution}=require("./nhl-market-distribution-availability.cjs");
const {key,LIMITS}=require("./nhl-standard-quality-challenger-v2.cjs");
const KIND="nhl_four_market_pregame_direction_research_v1";
const bound=(x,l,h)=>Math.min(h,Math.max(l,x));
const finite=Number.isFinite,prob=x=>finite(x)&&x>=0&&x<=1;
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const POLICY=Object.freeze({
 shotsOnGoal:Object.freeze({family:"on_net_count_and_recency",nb:.65,shift:.35}),
 points:Object.freeze({family:"zero_aware_points",nb:.50,hurdle:.50}),
 assists:Object.freeze({family:"zero_aware_assists",hurdle:.70,empirical:.30}),
 blockedShots:Object.freeze({family:"block_count_and_recency",nb:.60,empirical:.40})
});
function evaluate(p,s,history){
 const bare={gameId:p?.gameId,playerId:p?.playerId,market:p?.market,
  tier:p?.tier,line:p?.line,originalSide:p?.lean,
  capturedAt:p?.capturedAt,gameStartAt:p?.gameStartAt,
  status:"research_abstain",reason:"unsupported_original",
  marketSpecificHigher:null,usageHigher:null,empiricalHigher:null,
  exploratoryDirection:null,matchedOriginalOffer:false,
  fixedPolicy:POLICY[p?.market]?.family??null,
  bettingEligible:false,modelPromoted:false,
  strictQualified:false,actualPayoutEVVerified:false};
 const fail=reason=>({...bare,reason});
 const now=Date.parse(s?.generatedAt),start=Date.parse(p?.gameStartAt),
  captured=Date.parse(p?.capturedAt);
 if(p?.tier!=="Standard"||!LIMITS[p.market]||
    !Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
    !["Higher","Lower"].includes(p.lean)||!finite(p.line)||
    p.line<0||p.line%1!==.5||![now,start,captured].every(finite)||
    now<captured||now-captured>30*60000||start-now<15*60000)
  return fail("unsupported_original_clock_line_or_side");
 const raws=(s.rankedProps||[]).filter(r=>key(r)===key(p)&&
  r.lean===p.lean&&r.capturedAt===p.capturedAt&&
  r.gameStartAt===p.gameStartAt&&r.probabilities?.push===0);
 if(raws.length!==1)return fail("missing_or_ambiguous_original_offer");
 const prior=historyBefore(history,p,s.generatedAt);
 if(prior.length<10)return fail("less_than_10_official_prior_games");
 const toi=ice(prior);
 if(toi.status!=="official_past_only"||toi.instableRecentUsage)
  return fail("insufficient_or_unstable_expected_ice_time");
 const values=prior.map(g=>g[p.market]),
  tot=prior.reduce((n,g)=>n+g.timeOnIceSeconds,0);
 if(values.some(x=>!Number.isInteger(x)||x<0)||tot<=0)
  return fail("invalid_official_prior_player_counts");
 const projected=values.reduce((a,b)=>a+b,0)*toi.totalSeconds/tot;
 const context=(s.positionRateMatchupV2?.rows||[]).filter(r=>
  key(r)===key(p)&&r.capturedAt===p.capturedAt&&
  r.gameStartAt===p.gameStartAt&&r.side===p.lean),
  factor=context.length===1&&finite(context[0].defenseFactor)?
   bound(context[0].defenseFactor,.85,1.15):null;
 // A missing opponent adjustment is NOT replaced by invented source evidence.
 // Still record a non-promoted usage-only research arm for ablation.
 const dist=distribution(values,projected,p.line,"count");
 if(!dist||!["negativeBinomial","shifted","empirical","hurdle"]
   .every(k=>prob(dist[k])))return fail("market_count_distribution_unavailable");
 const config=POLICY[p.market];
 const pHigher=p.market==="shotsOnGoal"?
  config.nb*dist.negativeBinomial+config.shift*dist.shifted:
  p.market==="points"?
   config.nb*dist.negativeBinomial+config.hurdle*dist.hurdle:
  p.market==="assists"?
   config.hurdle*dist.hurdle+config.empirical*dist.empirical:
   config.nb*dist.negativeBinomial+config.empirical*dist.empirical;
 const oppDist=factor===null?null:
  distribution(values,projected*factor,p.line,"count");
 const opponentAdjusted=prob(oppDist?.negativeBinomial)?
  oppDist.negativeBinomial:null;
 const historicalDirection=dist.empirical>.5?"Higher":
  dist.empirical<.5?"Lower":null;
 const direction=pHigher>.5?"Higher":pHigher<.5?"Lower":null;
 // This is only a fixed research/abstention diagnostic, NOT the unchanged
 // strict source-verified gate. Opposite-side quotes were not authenticated.
 const watch=direction===p.lean&&historicalDirection===direction&&
  Math.abs(pHigher-.5)>=.10&&factor!==null;
 return {...bare,status:"research_only_conditional_on_official_appearance",
  reason:watch?"research_watchlist_not_strict_qualified":
   "direction_or_separation_or_opponent_disagreement",
  matchedOriginalOffer:true,priorGames:prior.length,
  priorLastGameDate:prior.at(-1).gameDate,
  originalHigher:raws[0].probabilities.higher,
  expectedIceSeconds:toi.totalSeconds,
  expectedPowerPlaySeconds:toi.ppSeconds,
  expectedPenaltyKillSeconds:toi.pkSeconds,
  playerSampleMean:mean(values),
  marketSpecificHigher:pHigher,
  usageHigher:dist.negativeBinomial,
  poissonHigher:dist.poisson,
  empiricalHigher:dist.empirical,
  shiftedHigher:dist.shifted,
  hurdleHigher:dist.hurdle,
  opponentAdjustedHigher:opponentAdjusted,
  opponentSourceVerified:factor!==null,
  opponentFactor:factor,
  exploratoryDirection:direction,
  historicalDirection,
  researchWatchlist:watch,
  watchlistNotStrictEvidence:true,
  originalOfferedSideNeverInverted:true,
  activeStatusUnverified:true,
  noTargetOrLaterGameStatisticUsed:true};
}
function freeze(snapshot,history){
 if(!Number.isFinite(Date.parse(snapshot?.generatedAt))||
   !Array.isArray(snapshot?.rankedProps)||
   !Array.isArray(snapshot?.individualPropSelections))
  throw Error("Original pregame offers and source clock required");
 const originals=snapshot.individualPropSelections.filter(p=>
  p.tier==="Standard"&&!!LIMITS[p.market]),seen=new Set(),rows=[];
 for(const p of originals){
  const k=key(p);
  if(seen.has(k))throw Error("Duplicate original market source");
  seen.add(k);rows.push(evaluate(p,snapshot,history));
 }
 return {kind:KIND,generatedAt:snapshot.generatedAt,registered:rows.length,
  rows,fixedMarketPolicies:POLICY,
  researchOnly:true,historicalFeatureWindow:"strictly_before_game_date",
  sameOriginalPlatformOffers:true,strictDirectionGatesUnchanged:true,
  notConfirmedPlayerParticipation:true,calibrated:false,
  bettingEligible:false,modelPromoted:false,placedWagers:0};
}
module.exports={KIND,POLICY,evaluate,freeze};
