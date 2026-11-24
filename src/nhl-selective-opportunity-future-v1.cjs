"use strict";
/**
 * Precommitted NHL Standard selective FUTURE shadow for original frozen
 * shots and points. Never replace the champion selection or auto-wager.
 * Market-specific rules set before results, not fitted to old winners.
 */
const {ci}=require("./nhl-prospective-slate-baseline-audit.cjs");
const KIND="nhl_standard_opportunity_concordance_future_shadow_20261117_v1";
const MIN_GAMES=30,MIN_PACIFIC_SLATES=20;
const time=x=>typeof x==="string"?Date.parse(x):NaN;
const integer=x=>Number.isInteger(x)&&x>=0;
const prob=x=>Number.isFinite(x)&&x>=0&&x<=1;
const date=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x));
const pacific=t=>{
 const v=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 return [v.year,v.month,v.day].join("-");
};
function originalSourceAfterNewPolicy({sourceGeneratedAt,sourceFirstGitCommittedAt,
 policyFirstGitCommittedAt,shadowFirstGitCommittedAt}={}){
 const source=time(sourceGeneratedAt),first=time(sourceFirstGitCommittedAt),
  policy=time(policyFirstGitCommittedAt),shadow=time(shadowFirstGitCommittedAt);
 return [source,first,policy,shadow].every(Number.isFinite)&&policy>0&&
  source>policy&&first>policy&&first>=source-1000&&
  shadow>=first&&shadow>policy;
}
function assess(r,{cutoff}={}){
 const fail=reason=>({kind:KIND,status:"abstain",reason,eligible:false,
  originalSideUnchanged:true,confidenceApproved:false,bettingEligible:false});
 if(!r||!["shotsOnGoal","points"].includes(r.market)||r.tier!=="Standard"||
   !["Higher","Lower"].includes(r.side)||!["F","D"].includes(r.role)||
   !Number.isFinite(r.line)||Math.abs(r.line-Math.floor(r.line)-.5)>1e-8||
   !prob(r.originalHigher)||!date(cutoff)||!date(r.latestPriorDate)||
   r.latestPriorDate>=cutoff||
   !Number.isFinite(time(r.gameStartAt))||!Number.isFinite(time(r.capturedAt))||
   time(r.capturedAt)>=time(r.gameStartAt)-15*60000)
  return fail("original_line_market_or_pregame_identity_invalid");
 if(!integer(r.priorGames)||r.priorGames<12)
  return fail("insufficient_prior_player_appearances");
 if(!integer(r.opponentGames)||r.opponentGames<8)
  return fail("insufficient_opponent_team_games");
 const exposure=r.market==="points"?800:700;
 if(!Number.isFinite(r.expectedIceSeconds)||r.expectedIceSeconds<exposure||
    r.expectedIceSeconds>3900)
  return fail("unreliable_prior_ice_time_exposure");
 const rest=(Date.parse(cutoff+"T00:00:00Z")-
  Date.parse(r.latestPriorDate+"T00:00:00Z"))/86400000;
 if(!Number.isFinite(rest)||rest<0||rest>14)
  return fail("stale_recent_appearance");
 if(r.market==="points"&&
  (r.ppTimeEvidenceVerified!==true||
   !integer(r.ppPointsRows)||r.ppPointsRows<8||
   !Number.isFinite(r.expectedPPSeconds)||r.expectedPPSeconds<=0||
   r.expectedPPSeconds>r.expectedIceSeconds))
  return fail("unverified_power_play_scoring_exposure");
 const v=r.variants||{};
 if(![v.empirical,v.rate,v.opportunity,v.position].every(prob))
  return fail("independent_opportunity_probability_missing");
 if(Math.abs(v.position-v.opportunity)>.2)
  return fail("position_and_opportunity_disagree");
 const meets=p=>r.side==="Higher"?p>=.58:p<=.42;
 const weak=p=>r.side==="Higher"?p>=.53:p<=.47;
 if(!meets(v.position)||!meets(v.opportunity)||!weak(v.empirical))
  return fail("original_side_not_supported_by_independent_models");
 return {kind:KIND,status:"prospective_research_candidate_only",reason:"predeclared_opportunity_and_position_agreement",
  eligible:true,originalSideUnchanged:true,confidenceApproved:false,
  bettingEligible:false,estimatedProbabilityApproved:false};
}
function grade(records,history,{policyFirstCommittedAt}={}){
 const blocked=reason=>({kind:KIND,status:reason,registered:0,eligible:0,
  decided:0,distinctGames:0,distinctPacificSlates:0,byMarket:{},
  modelPromoted:false,calibrationApproved:false,lineupsApproved:false});
 if(!Array.isArray(records)||!Number.isFinite(time(policyFirstCommittedAt)))
  return blocked("new_policy_git_commit_unverified");
 const seen=new Set(),cohort=new Map(),overall={};
 const get=k=>{const b=cohort.get(k)||{registered:0,eligible:0,abstained:0,pending:0,
  decided:0,originalCorrect:0,alwaysHigherCorrect:0,alwaysLowerCorrect:0,
  originalBrier:0,positionBrier:0,games:new Set(),slates:new Map(),reasons:{}};
  cohort.set(k,b);return b;};
 for(const r of records){
  // Old frozen challengers do not belong to this newly registered policy.
  if(r?.selective?.kind!==KIND)continue;
  if(!Number.isInteger(r.gameId)||!Number.isInteger(r.playerId)||
    !["shotsOnGoal","points"].includes(r.market)||
    r.tier!=="Standard"||!["Higher","Lower"].includes(r.side)||
    !Number.isFinite(r.line)||Math.abs(r.line-Math.floor(r.line)-.5)>1e-8||
    !Number.isFinite(time(r.gameStartAt))||
    !Number.isFinite(time(r.firstGitCommittedAt))||
    time(r.firstGitCommittedAt)<=time(policyFirstCommittedAt)||
    time(r.firstGitCommittedAt)>=time(r.gameStartAt)-15*60000||
    !["abstain","prospective_research_candidate_only"].includes(r.selective.status)||
    r.selective.eligible!==(r.selective.status==="prospective_research_candidate_only")||
    r.selective.originalSideUnchanged!==true||
    r.selective.bettingEligible!==false||
    !prob(r.originalHigher)||!prob(r.variants?.position))
   return blocked("future_original_git_source_or_shadow_reconciliation_failed");
  const key=[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
  if(seen.has(key))return blocked("duplicate_original_frozen_threshold");
  seen.add(key);
  const b=get(r.market);b.registered++;
  if(!r.selective.eligible){b.abstained++;b.reasons[r.selective.reason]=(b.reasons[r.selective.reason]||0)+1;continue;}
  b.eligible++;
  const actual=(history?.players?.[String(r.playerId)]?.games||[]).filter(g=>
   g.gameId===r.gameId&&g.playerId===r.playerId&&
   ["OFF","FINAL"].includes(g.gameState)&&Number.isInteger(g[r.market])&&g[r.market]>=0);
  if(actual.length!==1){b.pending++;continue;}
  const observed=actual[0][r.market];
  const higher=observed>r.line,lower=observed<r.line;
  if(!higher&&!lower){b.pending++;continue;}
  b.decided++;b.games.add(r.gameId);
  const right=(r.side==="Higher"&&higher)||(r.side==="Lower"&&lower);
  b.originalCorrect+=Number(right);b.alwaysHigherCorrect+=Number(higher);
  b.alwaysLowerCorrect+=Number(lower);
  b.originalBrier+=(r.originalHigher-Number(higher))**2;
  b.positionBrier+=(r.variants.position-Number(higher))**2;
  const day=pacific(r.gameStartAt),x=b.slates.get(day)||{n:0,diff:0};
  x.n++;x.diff+=Number(right)-Number(lower);b.slates.set(day,x);
 }
 const out=Object.fromEntries([...cohort.entries()].map(([k,b])=>{
  const slack=ci([...b.slates.values()]);
  return [k,{registered:b.registered,eligible:b.eligible,abstained:b.abstained,
   pending:b.pending,decided:b.decided,reasons:b.reasons,
   distinctGames:b.games.size,distinctPacificSlates:b.slates.size,
   originalSelectedHitRate:b.decided?b.originalCorrect/b.decided:null,
   sameLineAlwaysLowerRate:b.decided?b.alwaysLowerCorrect/b.decided:null,
   sameLineAlwaysHigherRate:b.decided?b.alwaysHigherCorrect/b.decided:null,
   originalHigherBrier:b.decided?b.originalBrier/b.decided:null,
   positionHigherBrier:b.decided?b.positionBrier/b.decided:null,
   originalMinusAlwaysLowerSlate95:slack,
   minimumEvidenceMet:b.games.size>=MIN_GAMES&&b.slates.size>=MIN_PACIFIC_SLATES,
   subgroupEdgeProven:false,confidenceApproved:false,modelPromoted:false}];
 }));
 const v=Object.values(out);
 return {kind:KIND,status:"new_future_only_original_git_research_unapproved",
  policyFirstCommittedAt,registered:v.reduce((n,b)=>n+b.registered,0),
  eligible:v.reduce((n,b)=>n+b.eligible,0),
  abstained:v.reduce((n,b)=>n+b.abstained,0),
  pending:v.reduce((n,b)=>n+b.pending,0),
  decided:v.reduce((n,b)=>n+b.decided,0),
  byMarket:out,precommittedPolicy:true,
  comparedOnlyOnOriginalSelectedThresholds:true,
  originalOfferedOppositeSideAuthenticated:false,
  noPosthocMarketFiltering:true,modelPromoted:false,calibrationApproved:false,
  lineupsApproved:false,originalPlatformSettlementVerified:false,
  note:"Only future first-Git original shot/point shadows created AFTER this policy commit are counted. No retrospective winner filtering, no promised hit rate or validated market payouts."};
}
module.exports={KIND,assess,grade,pacific,originalSourceAfterNewPolicy};
