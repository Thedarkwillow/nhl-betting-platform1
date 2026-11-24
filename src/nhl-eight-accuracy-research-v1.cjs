"use strict";
/**
 * Eight NHL hit-rate improvement hypotheses. Research ONLY, original immutable
 * Standard lines, strictly earlier official games and precommitted sources.
 * No wager / live recommendation, no medical clearance, no calibrated confidence.
 */
const {key,LIMITS}=require("./nhl-standard-quality-challenger-v2.cjs");
const {distribution}=require("./nhl-market-distribution-availability.cjs");
const {moneyPuckGate}=require("./nhl-sog-opportunity-challengers.cjs");
const {teamGoalOpportunity,ppAssistHistory,blockExposure}=require("./nhl-strict-official-evidence-v1.cjs");
const KIND="nhl_standard_eight_accuracy_source_gated_shadow_20261120_v1";
const sum=a=>a.reduce((s,x)=>s+x,0);
const mean=a=>sum(a)/a.length;
const finite=Number.isFinite,integer=x=>Number.isInteger(x)&&x>=0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const probability=x=>finite(x)&&x>=0&&x<=1;
const half=x=>finite(x)&&x>=0&&x%1===.5;
function day(t){
 const x=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  year:"numeric",month:"2-digit",day:"2-digit",
  timeZone:"America/Los_Angeles"
 }).formatToParts(new Date(t)).map(y=>[y.type,y.value]));
 return [x.year,x.month,x.day].join("-");
}
function historyBefore(history,p,asOf){
 const cutoff=day(asOf),rows=history?.players?.[String(p.playerId)]?.games||[];
 const seen=new Set(),out=[];
 for(const r of rows){
  if(!r||r.gameDate>=cutoff||r.type!=="skater"||
   !["FINAL","OFF"].includes(r.gameState)||r.playerId!==p.playerId||
   !Number.isInteger(r.gameId)||!Number.isFinite(r.timeOnIceSeconds)||
   r.timeOnIceSeconds<180||r.timeOnIceSeconds>3900||
   !integer(r[p.market])||seen.has(r.gameId))continue;
  seen.add(r.gameId);out.push(r);
 }
 return out.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId).slice(-30);
}
function ice(prior){
 if(prior.length<10)return {status:"insufficient_official_history"};
 const ten=prior.slice(-10),five=ten.slice(-5),
  whole=.65*mean(ten.map(g=>g.timeOnIceSeconds))+
    .35*mean(five.map(g=>g.timeOnIceSeconds)),
  totalFive=mean(five.map(g=>g.timeOnIceSeconds)),
  instability=Math.abs(totalFive-mean(ten.map(g=>g.timeOnIceSeconds)))/
    mean(ten.map(g=>g.timeOnIceSeconds))>.18;
 const ppValid=ten.every(r=>integer(r.powerPlayTimeOnIceSeconds)&&
   r.powerPlayTimeOnIceSeconds<=r.timeOnIceSeconds);
 const pkKey=ten.every(r=>integer(r.shortHandedTimeOnIceSeconds)&&
   r.shortHandedTimeOnIceSeconds<=r.timeOnIceSeconds)?
   "shortHandedTimeOnIceSeconds":
   ten.every(r=>integer(r.penaltyKillTimeOnIceSeconds)&&
     r.penaltyKillTimeOnIceSeconds<=r.timeOnIceSeconds)?
    "penaltyKillTimeOnIceSeconds":null;
 let pp=null,pk=null,evenStrength=null,nonPP=null;
 if(ppValid){
  pp=.65*mean(ten.map(g=>g.powerPlayTimeOnIceSeconds))+
    .35*mean(five.map(g=>g.powerPlayTimeOnIceSeconds));
  nonPP=whole-pp;
  if(pkKey){
   pk=.65*mean(ten.map(g=>g[pkKey]))+.35*mean(five.map(g=>g[pkKey]));
   evenStrength=whole-pp-pk;
   if(evenStrength<0){pk=null;evenStrength=null;}
  }
 }
 return {status:"official_past_only",totalSeconds:whole,
  ppSeconds:pp,pkSeconds:pk,
  evSeconds:evenStrength,nonPPSeconds:nonPP,
  ppVerifiedHistory:pp!==null,pkVerifiedHistory:pk!==null,
  evVerifiedHistory:evenStrength!==null,
  instableRecentUsage:instability,priorGames:prior.length,
  lastHistoricalGameDate:prior.at(-1).gameDate,
  projectedRoleOnly:true,activeRosterVerified:false};
}
function source(p,s,a,pos,ctx,approved){
 const prior=historyBefore(s._historicalContext,p,s.generatedAt),
  toi=ice(prior),values=prior.map(g=>g[p.market]),
  teamGoals=["assists","points"].includes(p.market)?
   teamGoalOpportunity(s._historicalContext,p.team,day(s.generatedAt)):{verified:false},
  ppAssists=p.market==="assists"?ppAssistHistory(prior):{verified:false,games:0},
  blockInput=p.market==="blockedShots"?blockExposure(prior):
   {opponentShotAttemptsVerified:false,defensiveZoneStartsVerified:false},
  now=at(s.generatedAt),start=at(p.gameStartAt),raw=s.rankedProps.filter(x=>
   key(x)===key(p)&&x.capturedAt===p.capturedAt&&
   x.gameStartAt===p.gameStartAt&&x.lean===p.lean);
 if(raw.length!==1)return {status:"ambiguous_original_source",models:{}};
 if(!half(p.line)||raw[0].probabilities?.push!==0)
  return {status:"unsupported_nonbinary_source_line",models:{}};
 if(prior.length<10||toi.status!=="official_past_only")
  return {status:"insufficient_official_past_only_game_history",
   priorGames:prior.length,models:{}};
 const matchup=pos?.probabilities?.offenseDefense?.higher,
  factor=finite(pos?.defenseFactor)?clamp(pos.defenseFactor,.8,1.2):1,
  baseMu=sum(values)*toi.totalSeconds/sum(prior.map(x=>x.timeOnIceSeconds)),
  usageOnly=distribution(values,baseMu,p.line,"count"),
  results={},means={usage:baseMu},evidence={};
 if(!usageOnly)return {status:"distribution_not_available",models:{}};
 for(const [name,prob] of Object.entries(usageOnly))
  if(probability(prob))results["dist_"+name]=prob;
 // Precommitted opportunity exposure adjustment vs usage-only count rate.
 const exposureMu=baseMu*factor;
 means.opponentAdjusted=exposureMu;
 const dist=distribution(values,exposureMu,p.line,"count");
 results.opponentAdjusted=dist?.negativeBinomial??null;
 results.opponentRemoved=usageOnly.negativeBinomial;
 results.distributionPoisson=dist?.poisson??null;
 results.distributionHurdle=dist?.hurdle??null;
 // A genuine before-freeze MoneyPuck source is mandatory for shot attempts.
 let shots={status:"not_shots_market"};
 if(p.market==="shotsOnGoal"){
  const mp=approved?moneyPuckGate(p,approved,s.generatedAt):
    {status:"no_git_verified_pregame_moneypuck_source"};
  if(mp.status==="ready"){
   const conversion=clamp(.5*mp.shotsPer60/mp.attemptsPer60+
     .5*mp.xOnGoalPer60/mp.attemptsPer60,0,1);
   const predicted=.65*baseMu+.35*
      mp.attemptsPer60*conversion*toi.totalSeconds/3600*factor;
   means.shotAttemptsAndOnNet=predicted;
   results.shotAttemptConversion=distribution(values,predicted,p.line,
     "count")?.negativeBinomial??null;
   shots={status:"source_verified_pregame",attemptsPer60:mp.attemptsPer60,
    expectedOnNetConversion:conversion,observedGames:mp.seasonGames,
    asOf:mp.sourceCapturedAt};
  }else shots={status:mp.status};
 }
 // Historical assist participation: no fabricated exact PP-assist splits.
 if(p.market==="assists"||p.market==="points"){
  const pp=toi.ppVerifiedHistory&&toi.nonPPSeconds>0,
   oppGoalFactor=finite(pos?.offenseFactor)?
    clamp(pos.offenseFactor,.85,1.15):1;
  let roleFactor=1;
  if(ctx?.role?.powerPlayGroup==="pp1")roleFactor=1.03;
  else if(ctx?.role?.powerPlayGroup==="pp2")roleFactor=1.01;
  const opportunity=baseMu*oppGoalFactor*roleFactor*factor;
  means.teammateAndRole=opportunity;
  results.teammateAndRole=distribution(values,opportunity,p.line,
    "count")?.negativeBinomial??null;
  evidence.assists={historicalPPMinutesVerified:!!pp,
   projectedPowerPlayGroup:ctx?.role?.powerPlayGroup??null,
   lineMatesProjected:(ctx?.role?.projectedLinemateIds||[]).length,
   individualPPAssistHistoryVerified:ppAssists.verified,
   historicalPPAssistGames:ppAssists.games,
   sourceGoalOpportunityAvailable:teamGoals.verified||!!a?.pointsSourceEvidence,
   officialTeamGoalHistory:teamGoals,
   teamOffenseFactor:oppGoalFactor};
  if(probability(a?.predictions?.pointsSource)&&a?.pointsSourceEvidence?.sourceAt&&
    at(a.pointsSourceEvidence.sourceAt)<=now&&
    at(a.pointsSourceEvidence.sourceAt)<start)
    results.teammateXGoalsSource=a.predictions.pointsSource;
 }
 if(p.market==="blockedShots"){
  const pk=toi.pkSeconds,def=pos?.defense?.last10?.games??0;
  // Without exact opponent shot ATTEMPTS do not call SOG "shot attempts".
  const match=def>=5?baseMu*factor:baseMu;
  // Only genuine ten-game opponent attempt AND exact on-ice defensive-zone
  // history adjusts this research shadow. Proxy blocks never certify either.
  const blockFactor=blockInput.opponentShotAttemptsVerified&&
   blockInput.defensiveZoneStartsVerified?
   clamp(1+.15*(blockInput.opponentAttemptsPerGame/55-1)+
    .08*(blockInput.defensiveZoneStartsPerGame/3-1),.9,1.1):1;
  means.defensiveExposure=match*blockFactor;
  results.defensiveExposure=distribution(values,means.defensiveExposure,p.line,
    "count")?.negativeBinomial??null;
  evidence.blocks={positionOpponentGames:def,pkMinutesVerified:pk!==null,
   opponentShotAttemptsVerified:blockInput.opponentShotAttemptsVerified,
   defensiveZoneStartsVerified:blockInput.defensiveZoneStartsVerified,
   opponentShotAttemptsPerGame:blockInput.opponentAttemptsPerGame,
   defensiveZoneStartsPerGame:blockInput.defensiveZoneStartsPerGame,
   historicalExposureGames:blockInput.sampleGames,
   researchExposureFactor:blockFactor,
   rinkSpecificRecordingVerified:false,
   volumeProxyIsOpponentPositionHistoricalBlocks:!blockInput.opponentShotAttemptsVerified||
    !blockInput.defensiveZoneStartsVerified};
 }
 // Data-provider NHL shot-recording regime may shift; do NOT learn a new
 // offset from the target season's later games.
 const seasonSplit=prior.filter(r=>r.gameDate>="2026-07-01"),
  oldSplit=prior.filter(r=>r.gameDate<"2026-07-01");
 if(p.market==="shotsOnGoal"&&seasonSplit.length>=8&&oldSplit.length>=8){
  const currentRate=sum(seasonSplit.map(g=>g.shotsOnGoal))/
    sum(seasonSplit.map(g=>g.timeOnIceSeconds)),
   oldRate=sum(oldSplit.map(g=>g.shotsOnGoal))/
    sum(oldSplit.map(g=>g.timeOnIceSeconds));
  if(oldRate>0){
   const shift=clamp(1+.5*(currentRate/oldRate-1),.88,1.12);
   means.pastOnlySeasonShotRateAdjustment=baseMu*shift*factor;
   results.pastSeasonShotRateAdjustment=distribution(values,
    means.pastOnlySeasonShotRateAdjustment,p.line,"count")?.negativeBinomial??null;
  }
 }
 evidence.recording={
  currentSeasonPastGames:seasonSplit.length,
  priorSeasonPastGames:oldSplit.length,
  trackingChangeCorrectionVerified:false,
  rinkAdjustmentVerified:false,
  empiricalSeasonShiftOnly:p.market==="shotsOnGoal"&&
   seasonSplit.length>=8&&oldSplit.length>=8?
   mean(seasonSplit.map(r=>r.shotsOnGoal))-
     mean(oldSplit.map(r=>r.shotsOnGoal)):null,
  shadowPastOnlySogRateAdjustmentRecorded:
    probability(results.pastSeasonShotRateAdjustment),
  trackingChangeCorrectionVerified:false,
  crossSeasonRateAdjustmentApplied:false};
 const book=a?.sportsbookBenchmark;
 const sportsbook=book&&probability(book.higher)&&
   at(book.quoteAt)<=now&&at(book.firstCommittedAt)<=now&&
   at(book.quoteAt)<start&&book.conditionalIdentityOnly===true?
    {status:"conditional_identity_name_team_game_line",books:book.bookCount,
     higher:book.higher,gapFromOriginal:
       probability(raw[0].probabilities?.higher)?
        raw[0].probabilities.higher-book.higher:null,
     sharedPlayerIdVerified:false,actualPricePayoutVerified:false,
     quoteAt:book.quoteAt}:{
      status:"missing_exact_first_git_pregame_match",
      sharedPlayerIdVerified:false};
 if(sportsbook.status==="conditional_identity_name_team_game_line")
  results.sportsbookConditionalHigher=sportsbook.higher;
 const q=results.opponentAdjusted,predict=q!==null&&probability(q)?
   q>.5?"Higher":q<.5?"Lower":null:null,
   lower=probability(q)?1-q:null,
   chosen=p.lean==="Higher"?q:lower,
   abstain=!probability(chosen)?"missing_statistical_probability":
     predict!==p.lean?"independent_direction_disagrees_with_original":
     chosen<.65?"selection_probability_below_exploratory_threshold":
     toi.instableRecentUsage?"volatile_recent_ice_time":
     !finite(pos?.defenseFactor)?"unverified_position_opponent_adjustment":
     sportsbook.status==="conditional_identity_name_team_game_line"&&
       Math.abs(sportsbook.gapFromOriginal)>=.2?
       "conditional_market_disagreement":"shadow_candidate_only";
 return {status:"research_only_conditional_on_appearance",
  priorGames:prior.length,iceTime:toi,shotConversion:shots,
  opponentFactorUsed:finite(pos?.defenseFactor),
  means,models:results,evidence,
  sportsbookBenchmark:sportsbook,
  researchAbstention:abstain,
  candidateResearchOnly:abstain==="shadow_candidate_only",
  bookmakerMatchingNotAuthentication:true,
  riskGateDoesNotApproveBetting:true,
  calibrated:false,productionDirectionUnchanged:true};
}
function freeze(snapshot,{history,approved=null}={}){
 if(!finite(at(snapshot?.generatedAt))||
  !Array.isArray(snapshot?.rankedProps)||
  !Array.isArray(snapshot?.individualPropSelections))
  throw Error("Original source required");
 const s={...snapshot,_historicalContext:history},rows=[],seen=new Set();
 const data=Object.fromEntries(Object.keys(LIMITS).map(m=>[m,0]));
 for(const p of snapshot.individualPropSelections.filter(x=>
   x.tier==="Standard"&&LIMITS[x.market])){
  const id=key(p);
  if(seen.has(id))throw Error("Duplicate original Standard source");
  seen.add(id);data[p.market]++;
  const match=x=>key(x)===id&&x.capturedAt===p.capturedAt&&
    x.gameStartAt===p.gameStartAt,
   adaptive=(snapshot.standardAdaptiveResearchV2?.rows||[]).filter(x=>
    match(x)&&x.originalSide===p.lean),
   pos=(snapshot.positionRateMatchupV2?.rows||[]).filter(x=>
    match(x)&&x.side===p.lean),
   context=(snapshot.matchupContextReviewV1?.rows||[]).filter(x=>
    match(x)&&x.side===p.lean),
   validClock=at(p.capturedAt)<=at(snapshot.generatedAt)&&
    at(p.gameStartAt)-at(snapshot.generatedAt)>=900000;
  const output=validClock?source(p,s,adaptive.length===1?adaptive[0]:null,
    pos.length===1?pos[0]:null,context.length===1?context[0].context:null,
    approved):{status:"original_clock_invalid",models:{}};
  rows.push({gameId:p.gameId,playerId:p.playerId,market:p.market,
   tier:p.tier,line:p.line,originalSide:p.lean,
   capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,
   ...output,bettingEligible:false,platformSettlementVerified:false});
 }
 return {kind:KIND,generatedAt:snapshot.generatedAt,rows,
  registered:rows.length,byMarketRegistered:data,modelPromoted:false,
  existingChampionUntouched:true,researchOnly:true,
  conditionalOnAppearance:true,neverRetrofitFromFinalResult:true,
  calibrationApproved:false,sportsbookPlayerIdentityVerified:false,
  exactPayoutExpectedValueVerified:false,bettingEligible:false,
  placedWagers:0};
}
module.exports={KIND,historyBefore,ice,source,freeze};
