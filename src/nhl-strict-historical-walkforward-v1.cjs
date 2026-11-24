"use strict";
/**
 * Retrospective counterfactual, NOT a true prospective frozen model test.
 * Nov 8-19 ORIGINAL PrizePicks source offers are verified by first Git
 * commit, then the current fixed strict algorithm is reconstructed using
 * strictly earlier official games. Recovered official PP/block observations
 * were archived AFTER these games: never mislabel this as first-Git frozen.
 * No historical target-game feature, line changes, injury hindsight or bets.
 */
const {freeze:rebuild}=require("./nhl-eight-accuracy-research-v1.cjs");
const {assess}=require("./nhl-strict-directional-abstention-v1.cjs");
const {key,LIMITS}=require("./nhl-standard-quality-challenger-v2.cjs");
const {officialOutcome}=require("./nhl-standard-abstention-audit.cjs");
const {ci}=require("./nhl-prospective-slate-baseline-audit.cjs");
const marketResearch=require("./nhl-market-direction-research-v1.cjs");
const KIND="nhl_strict_nov8_19_official_past_only_reconstruction_v1";
const at=x=>typeof x==="string"?Date.parse(x):NaN;
function pacific(x){
 const v=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(x)).map(a=>[a.type,a.value]));
 return [v.year,v.month,v.day].join("-");
}
function bucket(){
 return {registered:0,decided:0,pending:0,push:0,originalWins:0,
  challengerWins:0,higherWins:0,lowerWins:0,games:new Set(),slates:new Set(),
  challengerVsLower:new Map(),challengerVsHigher:new Map(),
  challengerVsOriginal:new Map()};
}
function cluster(map,k,diff){
 const r=map.get(k)||{n:0,diff:0};r.n++;r.diff+=diff;map.set(k,r);
}
function add(b,p,out,side){
 b.registered++;
 if(out.status!=="decided"){
  b[out.status==="push"?"push":"pending"]++;return;
 }
 const a=out.side,original=Number(a===p.lean),newHit=side==null?null:Number(a===side),
  higher=Number(a==="Higher"),lower=1-higher,day=pacific(p.gameStartAt);
 b.decided++;b.originalWins+=original;b.higherWins+=higher;b.lowerWins+=lower;
 b.games.add(p.gameId);b.slates.add(day);
 if(newHit!==null){
  b.challengerWins+=newHit;
  cluster(b.challengerVsLower,p.gameId,newHit-lower);
  cluster(b.challengerVsHigher,p.gameId,newHit-higher);
  cluster(b.challengerVsOriginal,p.gameId,newHit-original);
 }
}
function summary(b,{hasChallenger=false}={}){
 const n=b.decided;
 return {registered:b.registered,decided:n,pending:b.pending,push:b.push,
  originalWins:b.originalWins,originalLosses:n-b.originalWins,
  originalHitRate:n?b.originalWins/n:null,
  alwaysHigherWins:b.higherWins,alwaysHigherHitRate:n?b.higherWins/n:null,
  alwaysLowerWins:b.lowerWins,alwaysLowerHitRate:n?b.lowerWins/n:null,
  challengerWins:hasChallenger?b.challengerWins:null,
  challengerLosses:hasChallenger?n-b.challengerWins:null,
  challengerHitRate:hasChallenger&&n?b.challengerWins/n:null,
  distinctGames:b.games.size,distinctPacificSlates:b.slates.size,
  challengerMinusAlwaysLowerGame95:hasChallenger?
   ci([...b.challengerVsLower.values()]):null,
  challengerMinusAlwaysHigherGame95:hasChallenger?
   ci([...b.challengerVsHigher.values()],{baseline:"Higher"}):null,
  challengerMinusOriginalGame95:hasChallenger?
   ci([...b.challengerVsOriginal.values()]):null};
}
function validFrame(f){
 const s=f?.snapshot,gen=at(s?.generatedAt),git=at(f?.firstCommittedAt);
 return f?.gitHistoryCount===1&&Number.isFinite(gen)&&Number.isFinite(git)&&
  gen<=git&&git-gen<15*60000&&Array.isArray(s?.rankedProps)&&
  Array.isArray(s?.individualPropSelections);
}
function validOriginal(p,s,git){
 const capture=at(p?.capturedAt),start=at(p?.gameStartAt),gen=at(s.generatedAt);
 return Number.isInteger(p.gameId)&&Number.isInteger(p.playerId)&&
  p.tier==="Standard"&&!!LIMITS[p.market]&&
  ["Higher","Lower"].includes(p.lean)&&
  Number.isFinite(p.line)&&p.line>=0&&p.line%1===.5&&
  [capture,start,gen,git].every(Number.isFinite)&&
  capture<=gen&&gen-capture<=30*60000&&start-git>=15*60000&&
  s.rankedProps.filter(q=>key(q)===key(p)&&q.lean===p.lean&&
   q.capturedAt===p.capturedAt&&q.gameStartAt===p.gameStartAt&&
   q.probabilities?.push===0).length===1;
}
function replay(frames,history,{from="2026-11-08",through="2026-11-19"}={}){
 const all=bucket(),modeled=bucket(),kept=bucket(),skipped=bucket(),
  marketSpecific=bucket(),marketWatchlist=bucket(),
  byOriginalSide={},byExactMarketLine={},
  byMarket={},byDate={},reasons={},sourceCoverage={},exclusions={},seen=new Set();
 let validFrames=0,originals=0,invalidOriginals=0,framesWithoutOffers=0;
 const inc=(o,k)=>o[k]=(o[k]||0)+1;
 const sorted=[...(frames||[])].sort((a,b)=>
  at(a?.firstCommittedAt)-at(b?.firstCommittedAt));
 for(const f of sorted){
  if(!validFrame(f)){inc(exclusions,"not_unique_first_git_pregame_source");continue;}
  validFrames++;
  const s=f.snapshot,git=at(f.firstCommittedAt);
  const eligible=s.individualPropSelections.filter(p=>
   p.tier==="Standard"&&!!LIMITS[p.market]&&Number.isFinite(at(p.gameStartAt))&&
   pacific(p.gameStartAt)>=from&&pacific(p.gameStartAt)<=through);
  if(!eligible.length){framesWithoutOffers++;continue;}
  const accepted=[];
  for(const p of eligible){
   if(!validOriginal(p,s,git)){invalidOriginals++;continue;}
   const k=key(p);if(seen.has(k)){inc(exclusions,"duplicate_original_offer");continue;}
   seen.add(k);accepted.push(p);
  }
  if(!accepted.length)continue;
  // Only the original selection population is reconstructed; original
  // rankedProps and original pregame research/context rows remain untouched.
  const subset={...s,individualPropSelections:accepted};
  const lab=rebuild(subset,{history,approved:null});
  const labMap=new Map(lab.rows.map(r=>[key(r),r]));
  for(const p of accepted){
   const r=labMap.get(key(p)),out=officialOutcome(p,history);
   const scored=assess(p,r),chosen=scored.selectedResearchOnly===true,
    alternative=marketResearch.evaluate(p,s,history),
    alternativeAvailable=alternative.status===
     "research_only_conditional_on_official_appearance"&&
     alternative.exploratoryDirection!==null,
    alternativeWatch=alternativeAvailable&&alternative.researchWatchlist===true,
    q=r?.models?.opponentAdjusted,
    modelAvailable=r?.status==="research_only_conditional_on_appearance"&&
     r.opponentFactorUsed===true&&Number.isFinite(q)&&q>=0&&q<=1&&q!==.5,
    modelSide=modelAvailable?(q>.5?"Higher":"Lower"):null,
    date=pacific(p.gameStartAt),market=byMarket[p.market]??={
     all:bucket(),modeled:bucket(),kept:bucket(),skipped:bucket(),
     marketSpecific:bucket(),marketWatchlist:bucket()},
    daily=byDate[date]??={all:bucket(),modeled:bucket(),
     kept:bucket(),skipped:bucket(),
     marketSpecific:bucket(),marketWatchlist:bucket()};
   originals++;
   for(const b of [all,market.all,daily.all])add(b,p,out,null);
   const side=byOriginalSide[p.market+"|"+p.lean]??=bucket(),
    marketLine=byExactMarketLine[p.market+"|"+p.line]??=bucket();
   add(side,p,out,null);add(marketLine,p,out,null);
   if(alternativeAvailable){
    for(const b of [marketSpecific,market.marketSpecific,daily.marketSpecific])
     add(b,p,out,alternative.exploratoryDirection);
    if(alternativeWatch)for(const b of
     [marketWatchlist,market.marketWatchlist,daily.marketWatchlist])
     add(b,p,out,alternative.exploratoryDirection);
   }
   if(modelAvailable)for(const b of [modeled,market.modeled,daily.modeled])
    add(b,p,out,modelSide);
   if(chosen)for(const b of [kept,market.kept,daily.kept])
    add(b,p,out,scored.direction);
   else{
    inc(reasons,scored.reason||"unclassified_strict_abstention");
    for(const b of [skipped,market.skipped,daily.skipped])add(b,p,out,null);
   }
   for(const [name,flag] of Object.entries({
    originalPositionOpponentEvidence:r?.opponentFactorUsed===true,
    pregameMoneyPuckCaptureReauthenticated:false,
    recoveredOfficialPPAssist10Games:r?.evidence?.assists?.
     individualPPAssistHistoryVerified===true,
    verifiedPriorTeamGoalOpportunities:r?.evidence?.assists?.
     officialTeamGoalHistory?.verified===true,
    verifiedOpponentAttempts10Games:r?.evidence?.blocks?.
     opponentShotAttemptsVerified===true,
    verifiedDefensiveZoneStarts10Games:r?.evidence?.blocks?.
     defensiveZoneStartsVerified===true
   }))sourceCoverage[name]=(sourceCoverage[name]||0)+Number(flag);
  }
 }
 const pack=v=>({all:summary(v.all),modeled:summary(v.modeled,{hasChallenger:true}),
  marketSpecific:summary(v.marketSpecific,{hasChallenger:true}),
  marketResearchWatchlist:summary(v.marketWatchlist,{hasChallenger:true}),
  strictKept:summary(v.kept,{hasChallenger:true}),strictSkipped:summary(v.skipped)});
 return {kind:KIND,period:{from,through,timeZone:"America/Los_Angeles"},
  originalFramesChecked:frames?.length||0,validFirstGitFrames:validFrames,
  framesWithoutTargetOffers:framesWithoutOffers,invalidOriginals,
  uniqueOriginalOffers:originals,exclusions,
  allOriginal:summary(all),recomputedModel:summary(modeled,{hasChallenger:true}),
  marketSpecific:summary(marketSpecific,{hasChallenger:true}),
  marketResearchWatchlist:summary(marketWatchlist,{hasChallenger:true}),
  byOriginalSide:Object.fromEntries(Object.entries(byOriginalSide).map(([k,v])=>
   [k,summary(v)])),
  byExactMarketLine:Object.fromEntries(Object.entries(byExactMarketLine).map(([k,v])=>
   [k,summary(v)])),
  strictKept:summary(kept,{hasChallenger:true}),strictSkipped:summary(skipped),
  byMarket:Object.fromEntries(Object.entries(byMarket).map(([k,v])=>[k,pack(v)])),
  byDate:Object.fromEntries(Object.entries(byDate).sort().map(([k,v])=>[k,pack(v)])),
  strictAbstentionReasons:reasons,reconstructedEvidenceCoverage:sourceCoverage,
  flags:{
   notProspective:true,codePolicyWrittenAfterTargetDates:true,
   newHistoricalOfficialSourcesWereNotArchivedBeforeTargetGames:true,
   forecastsRecomputedAfterOutcomes:true,
   fixedMarketFamiliesDefinedAfterTestDates:true,
   researchWatchlistNotStrictEvidence:true,
   historyFeaturesFilterGamesStrictlyBeforeLocalGameDay:true,
   originalPlatformSideAndLinePreserved:true,
   bothDirectionsOnSameThresholdAreHypotheticalBaselines:true,
   fullPlatformBoardNotRepresented:true,
   noHistoricalMoneyPuckAuthorizationInferred:true,
   neverCountsMissingPlayerAsLoss:true,
   doNotTuneCutoffsOnTheseResults:true,
   minimumProspectiveEvidenceNotMet:true,
   bettingEdgeVerified:false,modelPromoted:false,
   bettingEligible:false,placedWagers:0
  }};
}
module.exports={KIND,pacific,replay};
