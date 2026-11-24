"use strict";
const {review:officialPreviewReview}=require("./nhl-official-preview-abstention.cjs");
const {referenceBounds,stressReferenceScenario}=require("./lineup-reference-payout-bounds.cjs");
const {getPayout}=require("./prizepicks-payouts.cjs");
const {eligibleVector,scenario}=require("./nhl-lineup-format-scenario.cjs");
const {inspectLineupDependencies}=require("./nhl-lineup-correlation-evidence.cjs");
const norm=x=>String(x??"").trim().toLowerCase();
// Fail-closed: provider raw labels and partially normalized combo/period
// records must never bypass the dedicated settlement/dependency engine.
function requiresDedicatedSettlement(p){
 const market=norm(p?.market),period=norm(p?.period||p?.scoringPeriod);
 return /combo|duo|rival|period|(?:^|[^a-z0-9])[123](?:st|nd|rd)?p(?:$|[^a-z0-9])/.test(market)||
  /combo|duo|rival|period|^(?:1p|2p|3p|1st|2nd|3rd)$/.test(period)||
  p?.kind==="combo"||p?.kind==="period"||p?.isCombo===true||
  (Array.isArray(p?.members)&&p.members.length>0)||
  (Array.isArray(p?.memberPlayerIds)&&p.memberPlayerIds.length>0);
}
const matchupKey=r=>norm(r.matchup).replace(/\s+/g," ");
function optimize(props,{min=2,max=6,limit=25,at=null,maxQuoteAgeMinutes=30,
 maxSearchNodes=100000,allowSameGameFallback=true,researchFormat=null,researchObjective="independent_reference",officialPreview=null}={}){
 if(!["independent_reference","dependence_lower_reference"].includes(researchObjective)||researchObjective!=="independent_reference"&&researchFormat===null)throw Error("Invalid research-only payout objective");
 const formatScore=ps=>researchObjective==="dependence_lower_reference"?referenceBounds(ps,researchFormat).referenceGrossLower:scenario(ps,researchFormat).hypotheticalGrossWeight;
 if(researchFormat!==null&&(!["power","flex"].includes(researchFormat)||allowSameGameFallback!==false))throw Error("Format scenario requires strict distinct games and a supported format");
 if(typeof allowSameGameFallback!=="boolean")throw Error("Invalid NHL lineup correlation-risk policy");
 if(!Number.isInteger(maxSearchNodes)||maxSearchNodes<100||maxSearchNodes>1000000)
  throw Error("Invalid bounded NHL lineup-search budget");
 // Production callers supply at; fixtures may omit it for purely offline
 // combinatorial tests. A historic valid quote is not a live offer.
 const now=at===null?null:Date.parse(at);
 if(at!==null&&(!Number.isFinite(now)||!Number.isFinite(maxQuoteAgeMinutes)||
  maxQuoteAgeMinutes<=0||maxQuoteAgeMinutes>60))throw Error("Invalid live NHL optimizer clock or freshness limit");
 const current=(p)=>{
  if(now===null)return true;
  const start=Date.parse(p.eventStartsAt),captured=Date.parse(p.capturedAt),
   observed=Date.parse(p.observedAt),
   // A fixed-as-of provider board confirms membership; the row's
   // observedAt may represent its *last change*, weeks earlier.
   member=Date.parse(p.verifiedThirdPartyBoardMembershipAt);
  const fixedMembership=p.verifiedThirdPartyBoardMembershipAt!==null&&
   p.verifiedThirdPartyBoardMembershipAt!==undefined&&Number.isFinite(member)&&
   member<=captured&&captured-member<=5*60000&&member<=now&&
   now-member<=maxQuoteAgeMinutes*60000;
  return Number.isFinite(start)&&Number.isFinite(captured)&&Number.isFinite(observed)&&
   start>now+15*60000&&observed<=captured&&captured<=now&&
   observed<=now&&(fixedMembership||now-observed<=maxQuoteAgeMinutes*60000)&&
   now-captured<=maxQuoteAgeMinutes*60000&&
   p.sourceStatus!=="suspended"&&p.sourceStatus!=="removed"&&p.status!=="suspended";
 };
 const candidates=(props||[]).filter(p=>current(p)&&(!officialPreview||now===null||!officialPreviewReview(p,officialPreview,at).blocksResearch)&&norm(p.tier)==="standard"&&
  (researchFormat===null||eligibleVector(p))&&
  // Multiplayer/period offers require their own settlement and dependency
  // engine; never smuggle them into single-athlete lineup optimization.
  !requiresDedicatedSettlement(p)&&
  (!p.period||["full_game","full game","game"].includes(norm(p.period)))&&
  p.researchEligibility!=="watchlist"&&p.roleEvidence?.eligibleForResearchLineup!==false&&
  p.probabilitySafety?.researchLineupEligible!==false&&
  ["Higher","Lower"].includes(p.lean)&&Number.isFinite(p.probability)&&
  p.probability>0.5&&p.probability<1&&p.playerId&&p.matchup&&p.isLive!==true&&
  // Enforce chronology where the source supplies it. Legacy test fixtures
  // without timestamps are research-only, not proof of real offer validity.
  (!p.capturedAt||!p.eventStartsAt||(
    Number.isFinite(Date.parse(p.capturedAt))&&
    Number.isFinite(Date.parse(p.eventStartsAt))&&
    Date.parse(p.capturedAt)<Date.parse(p.eventStartsAt))));
 candidates.sort((a,b)=>b.probability-a.probability||
  ((b.observations||0)-(a.observations||0))||
  String(a.playerId).localeCompare(String(b.playerId))||
  String(a.market||"").localeCompare(String(b.market||""))||
  Number(a.line||0)-Number(b.line||0)||String(a.lean).localeCompare(String(b.lean)));
 // The original board can contain two offered directions, alternate lines,
 // and many markets for the same NHL player. Since a slip cannot reuse a
 // player, dedupe BEFORE the candidate budget. Otherwise 25 variations on
 // one player can crowd out every other player and create false "no lineup".
 // This selects one research candidate per player, never a verified edge.
 const distinctPlayers=new Map();
 for(const p of candidates){
  const id=String(p.playerId);
  if(!distinctPlayers.has(id))distinctPlayers.set(id,p);
 }
 const selected=[...distinctPlayers.values()].slice(0,Math.max(0,Math.floor(limit))),lineups={};
 for(let size=min;size<=max;size++){
  if(researchFormat==="flex"&&size===2){lineups[size]=null;continue;}
  // 2-4: require completely distinct games. 5-6: bounded same-game
  // fallback is shown explicitly as correlated, never as independent.
  const maxGamePicks=size>4&&allowSameGameFallback?2:1,
   minGames=size>4&&allowSameGameFallback?3:size;
  let best=null,visited=0,nodes=0,truncated=false;
  function search(start,picks,players,games,score){
   if(++nodes>maxSearchNodes){truncated=true;return;}
   if(picks.length===size){
    if(games.size<minGames)return;
    visited++;
    const objective=researchFormat===null?score:formatScore(picks.map(p=>p.probability));
    if(!best||objective>best.score)best={score:objective,picks:[...picks],gameCount:games.size};
    return;
   }
   if(start>=selected.length||selected.length-start<size-picks.length)return;
   // The following optimistic upper bound ignores risk penalties, so it
   // can only overestimate attainable score. Prune when no improvement.
   let upper=score;
   for(let j=start;j<start+size-picks.length;j++)
    upper+=Math.log(selected[j].probability);
   if(researchFormat!==null){
    // All published standard binary payout schedules are nondecreasing
    // in hit count: replacing any probability by a greater one cannot
    // lower the scenario objective. Ignore player/game constraints here.
    const optimistic=[...picks.map(p=>p.probability),...selected.slice(start,start+size-picks.length).map(p=>p.probability)];
    upper=formatScore(optimistic);
   }
   if(best&&upper<=best.score+1e-12)return;
   for(let i=start;i<selected.length;i++){
    if(truncated)return;
    const p=selected[i],game=matchupKey(p),id=String(p.playerId);
    if(players.has(id)||(games.get(game)||0)>=maxGamePicks)continue;
    const sameGame=games.has(game),n=games.get(game)||0;
    // Only a ranking risk penalty. It is not a correlation estimate.
    const penalty=sameGame?0.45:0;
    players.add(id);games.set(game,n+1);picks.push(p);
    search(i+1,picks,players,games,score+Math.log(p.probability)-penalty);
    picks.pop();players.delete(id);if(n)games.set(game,n);else games.delete(game);
   }
  }
  search(0,[],new Set(),new Map(),0);
  if(!best){lineups[size]=null;continue;}
  const correlated=best.gameCount<size;
  // Official published *standard* payout references, NOT verified quotes
  // for this lineup. Correlated selections can change the multiplier.
  const power=getPayout({tiers:best.picks.map(p=>p.tier),pickCount:size,playType:"power",correct:size});
  const flex=getPayout({tiers:best.picks.map(p=>p.tier),pickCount:size,playType:"flex",correct:size});
  const dependencyAudit=inspectLineupDependencies(best.picks);
  lineups[size]={status:"research_only",picks:best.picks,rankScore:Number(best.score.toFixed(5)),
   probability:null,expectedValue:null,optimized:!truncated,
   ...(researchFormat?{privateFormatScenario:scenario(best.picks.map(p=>p.probability),researchFormat),researchObjective,privateReferenceDependenceBounds:referenceBounds(best.picks.map(p=>p.probability),researchFormat),privateMarginalStress:stressReferenceScenario(best.picks.map(p=>p.probability),researchFormat)}:{}),
   lineupSearchExhaustive:!truncated,searchNodeLimit:maxSearchNodes,
   searchNodesVisited:nodes,validCompleteCombinationsEvaluated:visited,
   validatedJointProbability:false,platformLineupEligibilityValidated:false,
   sensitivityOnly:{
    perPickProbabilityHaircut:0.05,
    stressedUncalibratedLogScore:Number(best.picks.reduce(
     (acc,p)=>acc+Math.log(Math.max(0.01,p.probability-.05)),0).toFixed(5)),
    jointProbability:null,profitabilityVerified:false
   },candidateCount:selected.length,
   deduplicatedCandidates:candidates.length-selected.length,
   lineupCandidatePolicy:"one highest-ranked research prop per player; offered directions are not independent picks",
   evaluationAsOf:at,
   sourceFreshnessVerifiedAtEvaluation:at!==null,
   quoteAgeLimitMinutes:at===null?null:maxQuoteAgeMinutes,
   newBoardRequiredForReoptimization:true,
   distinctGames:best.gameCount,sameGamePairs:size-best.gameCount,
   correlationRisk:correlated?"elevated_same_game":"same_game_excluded",
   sameGameFallbackPermitted:allowSameGameFallback,
   strictIndependentGamesOnly:!allowSameGameFallback,
   sameGameStructuralPairsVerifiedAbsent:!correlated,
   dependencyAudit,structuralRiskOnly:true,
   payoutQuoteVerified:false,expectedValueAvailable:false,
   publishedStandardPowerMultiplier:correlated?null:power.multiplier,
   publishedStandardFlexMultiplier:correlated||size===2?null:flex.multiplier,
   payoutSource:power.source||null,
   optimizationScope:researchFormat? "Private "+researchFormat+" binary scenario, objective "+researchObjective+"; excludes pushes/voids, uses published Standard reference rates; no verified joint probability, payout or EV.":truncated?"Node-bounded candidate result, not proven globally optimal; no validated joint probabilities or payouts.":
    correlated?"Uncalibrated log-score minus same-game risk penalty, max 2 per game, min 3 games; correlation and payout not verified.":"Ranked uncalibrated individual probabilities across distinct players and games; no joint probability or payout-adjusted EV.",
   warning:"Not a betting recommendation. No validated joint probability, no verified lineup-specific payout quote. Confirm all platform restrictions independently."};
 }
 return lineups;
}
module.exports={optimize,requiresDedicatedSettlement};
