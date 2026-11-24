"use strict";
/** Research-only Goblin track; every candidate must be independently frozen
 * before play. Never use these estimates to release confidence, quotes or bets.
 */
const {nhlSkater,nflPlayer}=require("./sport-opportunity-production-shadow.cjs");
const {audit:calibrationAudit}=require("./past-only-calibration-research.cjs");
const NHL=new Set(["shotsOnGoal","blockedShots","points","assists"]);
const NFL=new Set(["receiving_yards","receptions","rushing_yards","passing_yards","passing_completions"]);
const num=x=>typeof x==="number"&&Number.isFinite(x);
const prob=x=>num(x)&&x>=0&&x<=1;
const timestamp=x=>typeof x==="string"?Date.parse(x):NaN;
const validTime=x=>Number.isFinite(timestamp(x));
const before=(a,b)=>validTime(a)&&validTime(b)&&timestamp(a)<timestamp(b);
const tag=(reason)=>({status:"abstain",reason,researchOnly:true,bettingEligible:false,
 calibratedProbability:null,automatedLineupEligible:false,modelPromoted:false});
const safeId=x=>(typeof x==="string"&&x.length>0&&x.length<160)||
 (Number.isInteger(x)&&x>=0);
function quoteBase(p,now,marketSet){
 if(!p||p.tier!=="Goblin"||!marketSet.has(p.market)||
  !num(p.line)||p.line<0||!["Higher","Lower"].includes(p.lean)||
  !safeId(p.playerId)||!safeId(p.gameId)||
  !prob(p.probabilities?.higher)||!prob(p.probabilities?.lower)||
  Math.abs(p.probabilities.higher+p.probabilities.lower+
   (p.probabilities.push??0)-1)>1e-5||
  !validTime(p.capturedAt)||!validTime(now)||
  !before(p.capturedAt,p.gameStartAt)||
  timestamp(p.gameStartAt)-timestamp(now)<15*60000||
  timestamp(now)-timestamp(p.capturedAt)>30*60000||
  timestamp(p.capturedAt)>timestamp(now))return false;
 return true;
}
function pnum(x){return x===null?null:num(x)?x:null;}
function precommittedAbstention(p,reason,sport){
 return {...tag(reason),kind:sport==="NHL"?
  "goblin_two_stage_nhl_first_git_shadow_v1":
  "goblin_two_stage_nfl_first_git_shadow_v1",
  sport,tier:"Goblin",gameId:p.gameId,playerId:p.playerId,
  market:p.market,line:p.line,originalSide:p.lean,
  internalChallengerSide:null,sourceCapturedAt:p.capturedAt,
  gameStartsAt:p.gameStartAt,originalHigher:p.probabilities.higher,
  // Only a placeholder to validate probability syntax; no candidate model.
  challengerHigher:p.probabilities.higher,abstentionHasNoCandidateProbability:true,
  originalAppAvailabilityAuthenticated:false,verifiedPayoutQuote:false,
  expectedValue:null};
}
function makeNHL(p,prior,{now,opponent}={}){
 if(!quoteBase(p,now,NHL))return tag("invalid_or_stale_original_goblin_line");
 const out=nhlSkater(prior,{market:p.market,cutoff:now,line:p.line,opponent});
 if(out.status!=="research_shadow_only")return precommittedAbstention(p,out.reason,"NHL");
 const challengerHigher=out.probabilityHigherResearchOnly;
 if(!prob(challengerHigher)||!prob(out.probabilityLowerResearchOnly))
  return tag("missing_market_count_distribution");
 const side=challengerHigher===.5?null:challengerHigher>.5?"Higher":"Lower";
 return {status:side?"shadow_candidate":"abstain",reason:side?"prior_exposure_probability":"neutral_model_probability",
  kind:"goblin_two_stage_nhl_first_git_shadow_v1",sport:"NHL",tier:"Goblin",
  gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,
  originalSide:p.lean,internalChallengerSide:side,
  sourceCapturedAt:p.capturedAt,gameStartsAt:p.gameStartAt,
  originalHigher:p.probabilities.higher,challengerHigher,
  exposure:out.projectedOpportunity,mean:out.projectedMean,
  priorGames:out.sampleAppearances,zeroGamesRetained:out.zeroGamesPreserved,
  opponentExposureProven:p.market==="blockedShots"?out.opponentAdjustmentSource==="verified_prior_team_volume":null,
  sourceOfferedSide:p.lean,
  originalAppAvailabilityAuthenticated:false,verifiedPayoutQuote:false,
  probabilityCalibrated:false,expectedValue:null,researchOnly:true,
  bettingEligible:false,automatedLineupEligible:false,modelPromoted:false};
}
const approxErf=x=>{const s=x<0?-1:1,a=Math.abs(x),t=1/(1+.3275911*a);
 const y=1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-a*a);return s*y;};
function normalHigher(mu,sigma,line){
 if(!num(mu)||!num(sigma)||sigma<=0||!num(line))return null;
 const x=(line-mu)/(sigma*Math.SQRT2);
 return Math.min(.995,Math.max(.005,(1-approxErf(x))/2));
}
function makeNFL(p,prior,{now,opponent,injuryStatus}={}){
 if(!quoteBase(p,now,NFL))return tag("invalid_or_stale_original_nfl_goblin_line");
 if(p.officialKickoffIdentityVerified!==true||
    p.sourcePlayerIdMatchedOfficial!==true)
  return precommittedAbstention(p,"nfl_official_game_and_player_identity_unverified","NFL");
 const out=nflPlayer(prior,{market:p.market,cutoff:now,opponent,injuryStatus});
 if(out.status!=="research_shadow_only")return precommittedAbstention(p,out.reason,"NFL");
 const recent=prior.slice(-20);
 if(recent.length<12||recent.some(r=>!num(r[p.market])||r[p.market]<0))
  return precommittedAbstention(p,"missing_prior_week_nfl_stat_variance","NFL");
 const obs=recent.map(r=>r[p.market]),avg=obs.reduce((a,b)=>a+b,0)/obs.length;
 const variance=obs.reduce((a,b)=>a+(b-avg)**2,0)/(obs.length-1);
 // A variance floor avoids a falsely near-certain tail for low-variance samples.
 const sigma=Math.sqrt(Math.max(variance,Math.max(1,Math.abs(out.projectedMean)*.15)));
 const higher=normalHigher(out.projectedMean,sigma,p.line);
 if(!prob(higher))return precommittedAbstention(p,"unsupported_nfl_distribution","NFL");
 return {status:"shadow_candidate",kind:"goblin_two_stage_nfl_first_git_shadow_v1",
  sport:"NFL",tier:"Goblin",gameId:p.gameId,playerId:p.playerId,
  market:p.market,line:p.line,originalSide:p.lean,
  internalChallengerSide:higher>=.5?"Higher":"Lower",
  sourceCapturedAt:p.capturedAt,gameStartsAt:p.gameStartAt,
  originalHigher:p.probabilities.higher,challengerHigher:higher,
  exposure:out.projectedOpportunity,mean:out.projectedMean,
  priorGames:out.priorRecordedGames,opponentExposureProven:true,
  originalAppAvailabilityAuthenticated:false,verifiedPayoutQuote:false,
  probabilityCalibrated:false,expectedValue:null,researchOnly:true,
  bettingEligible:false,automatedLineupEligible:false,modelPromoted:false};
}
function validateFirstGit(r,policyFirstGitAt){
 const times=[policyFirstGitAt,r?.sourceCapturedAt,r?.sourceFirstGitAt,
   r?.shadowCreatedAt,r?.shadowFirstGitAt,r?.gameStartsAt];
 if(times.some(t=>!validTime(t))||
   !before(policyFirstGitAt,r.sourceCapturedAt)||
   timestamp(r.sourceCapturedAt)>timestamp(r.sourceFirstGitAt)||
   timestamp(r.sourceFirstGitAt)>timestamp(r.shadowCreatedAt)||
   timestamp(r.shadowCreatedAt)>timestamp(r.shadowFirstGitAt)||
   timestamp(r.shadowFirstGitAt)>=timestamp(r.gameStartsAt)-15*60000||
   r.originalFirstGitVerified!==true||r.shadowFirstGitVerified!==true||
   r.sourceIdentityVerified!==true||r.tier!=="Goblin"||
   !["NHL","NFL"].includes(r.sport)||
   !(r.sport==="NHL"?NHL:NFL).has(r.market)||
   !safeId(r.gameId)||!safeId(r.playerId)||
   !["Higher","Lower"].includes(r.originalSide)||!num(r.line)||
   !prob(r.originalHigher)||!prob(r.challengerHigher)||
   !["shadow_candidate","abstain"].includes(r.status)||
   r.modelPromoted!==false||r.bettingEligible!==false)
  return false;
 return true;
}
function gradeFrozen(records,officialResults,{policyFirstGitAt}={}){
 const counted=new Map(),rejected={},skip=k=>rejected[k]=(rejected[k]||0)+1;
 let registered=0,abstained=0,pending=0,pushes=0,decided=0,
  championCorrect=0,challengerCorrect=0,higherCorrect=0,lowerCorrect=0,
  championBrier=0,challengerBrier=0;
 const games=new Set(),slates=new Set(),byMarket={};
 for(const r of Array.isArray(records)?records:[]){
  if(!validateFirstGit(r,policyFirstGitAt)){skip("missing_prospective_first_git_or_identity");continue;}
  const key=[r.sport,r.gameId,r.playerId,r.market,r.line].join("|");
  if(counted.has(key)){skip("duplicate_original_prop");continue;}
  counted.set(key,true);registered++;
  const bucket=byMarket[r.sport+"|"+r.market]??={
   registered:0,abstained:0,pending:0,pushes:0,decided:0,
   championHits:0,challengerHits:0,alwaysHigherHits:0};
  bucket.registered++;
  if(r.status==="abstain"||!r.internalChallengerSide){abstained++;bucket.abstained++;continue;}
  const match=(officialResults||[]).filter(x=>x.sport===r.sport&&
    String(x.gameId)===String(r.gameId)&&String(x.playerId)===String(r.playerId)&&
    x.market===r.market&&
    ["FINAL","OFF"].includes(x.gameState)&&
    x.officialVerified===true&&num(x.actual)&&x.actual>=0&&
    validTime(x.officialFinalAt)&&before(r.gameStartsAt,x.officialFinalAt));
  if(match.length!==1){pending++;bucket.pending++;continue;}
  if(match[0].actual===r.line){pushes++;bucket.pushes++;continue;}
  const higher=match[0].actual>r.line;
  const champion=r.originalSide===(higher?"Higher":"Lower"),
   challenger=r.internalChallengerSide===(higher?"Higher":"Lower");
  championCorrect+=Number(champion);challengerCorrect+=Number(challenger);
  higherCorrect+=Number(higher);lowerCorrect+=Number(!higher);
  championBrier+=(r.originalHigher-Number(higher))**2;
  challengerBrier+=(r.challengerHigher-Number(higher))**2;
  decided++;bucket.decided++;bucket.championHits+=Number(champion);
  bucket.challengerHits+=Number(challenger);
  bucket.alwaysHigherHits+=Number(higher);
  games.add(r.sport+"|"+r.gameId);
  slates.add(r.sport+"|"+r.gameStartsAt.slice(0,10));
 }
 const pct=x=>decided?x/decided:null;
 const groups=Object.fromEntries(Object.entries(byMarket).map(([k,v])=>[k,{
  ...v,championHitRate:v.decided?v.championHits/v.decided:null,
  challengerHitRate:v.decided?v.challengerHits/v.decided:null,
  alwaysHigherSameLineRate:v.decided?v.alwaysHigherHits/v.decided:null}]));
 return {kind:"future_only_goblin_original_line_comparison_v1",
  registered,abstained,pending,pushes,decided,distinctGames:games.size,
  distinctSlates:slates.size,championHitRate:pct(championCorrect),
  challengerHitRate:pct(challengerCorrect),
  alwaysHigherSameLineRate:pct(higherCorrect),
  alwaysLowerSameLineRate:pct(lowerCorrect),
  championHigherBrier:pct(championBrier),
  challengerHigherBrier:pct(challengerBrier),
  byMarket:groups,rejected,identicalOriginalLinesOnly:true,
  minimumReviewSampleMet:games.size>=30&&slates.size>=20,
  verifiedOutperformance:false,calibratedProbabilitiesApproved:false,
  payoutEVVerified:false,modelsPromoted:false,
  automaticLineupsApproved:false,officialWagersPlaced:0};
}
function calibrateGoblin(rows,{fitAt}={}){
 if(!Array.isArray(rows)||rows.some(r=>r.tier!=="Goblin"||
   !["NHL","NFL"].includes(r.sport)||typeof r.market!=="string"))
  return {status:"invalid_or_mixed_goblin_tier",calibrationApproved:false};
 const key=new Set(rows.map(r=>[r.sport,r.market,r.tier].join("|")));
 if(key.size!==1)return {status:"must_calibrate_each_sport_and_market_separately",
  calibrationApproved:false};
 const report=calibrationAudit(rows,{fitAt});
 return {kind:"goblin_only_past_calibration_v1",sport:rows[0]?.sport??null,
  market:rows[0]?.market??null,tier:"Goblin",...report,
  calibratedProbabilityApproved:false,calibrationApproved:false,
  modelPromoted:false};
}
module.exports={NHL,NFL,makeNHL,makeNFL,gradeFrozen,calibrateGoblin,
 validateFirstGit,normalHigher};
