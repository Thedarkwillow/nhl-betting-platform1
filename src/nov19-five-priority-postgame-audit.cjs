"use strict";
/**
 * November 19 NHL/NFL retrospective audit. Strictly READ ONLY: preserve first
 * Git frozen directions, original lines and historical selected-side outcomes.
 * Never convert a missing NHL player into a zero-stat miss or a platform void.
 */
const {audit:verifyNhlSlate}=require("./nhl-slate-graded-summary.cjs");
const DAY="2026-11-19", NFL_GAME="2026_11_IND_HOU";
const POLICY_AFTER="2026-11-21T00:00:00Z";
const NONAPPEARANCE_EVIDENCE=Object.freeze([
 {gameId:2026020350,playerId:8481582,player:"Nicholas Robertson",
  reason:"lower_body_injury_did_not_play",
  url:"https://www.nhl.com/blues/news/st-louis-blues-pittsburgh-penguins-game-recap-november-19-2026-x3151"},
 {gameId:2026020352,playerId:8480829,player:"Jesperi Kotkaniemi",
  reason:"scratched",
  url:"https://www.nhl.com/news/montreal-canadiens-carolina-hurricanes-game-preview-november-19-2026"},
 {gameId:2026020353,playerId:8484144,player:"Connor Bedard",
  reason:"right_shoulder_injury_out",
  url:"https://www.nhl.com/news/blackhawks-connor-bedard-may-need-shoulder-surgery"}
]);
const pct=(a,b)=>b?Number((a/b).toFixed(6)):null;
const newGroup=()=>({registered:0,decided:0,wins:0,losses:0,push:0,pending:0,
  estimatedProbabilitySum:0,actualHigher:0,actualLower:0});
function add(bucket,row){
 bucket.registered++;
 if(row.selectionStatus==="correct"||row.selectionStatus==="incorrect"){
  bucket.decided++;
  bucket.wins+=Number(row.selectionStatus==="correct");
  bucket.losses+=Number(row.selectionStatus==="incorrect");
  bucket.estimatedProbabilitySum+=row.estimatedProbability;
  bucket.actualHigher+=Number(row.officialResult==="Higher");
  bucket.actualLower+=Number(row.officialResult==="Lower");
 } else if(row.selectionStatus==="push")bucket.push++;
 else bucket.pending++;
}
function finish(b){
 const {estimatedProbabilitySum,...o}=b;
 return {...o,hitRate:pct(o.wins,o.decided),
  meanOriginalUncalibratedEstimate:pct(estimatedProbabilitySum,o.decided),
  hypotheticalAlwaysHigher:pct(o.actualHigher,o.decided),
  hypotheticalAlwaysLower:pct(o.actualLower,o.decided),
  nonindependentPlayerSelections:true};
}
function reviewNhl({ledger,stats,schedule}){
 const prior=verifyNhlSlate({date:DAY,ledger,stats,schedule});
 if(prior.status!=="all_games_official_final_original_frozen_prop_research_only"||
    !prior.all12GamesVerified||prior.officialGamesTotal!==12)
  throw Error("Not a verified full official November 19 NHL slate");
 const rows=ledger.records.filter(x=>x.gameId>=2026020347&&x.gameId<=2026020358);
 const pending=rows.filter(x=>x.selectionStatus==="pending_official_player_stats");
 const officialIds=new Set(stats.players.map(x=>x.gameId+"|"+x.playerId));
 const proofByKey=new Map(NONAPPEARANCE_EVIDENCE.map(x=>[x.gameId+"|"+x.playerId,x]));
 const evidenceKeys=new Set();
 const reconciled=pending.map(x=>{
  const key=x.gameId+"|"+x.playerId,proof=proofByKey.get(key);
  if(!proof||officialIds.has(key))throw Error("Cannot call unsupported or dressed player a DNP: "+key);
  evidenceKeys.add(key);
  return {originalSelectionId:x.id,gameId:x.gameId,playerId:x.playerId,
   player:proof.player,tier:x.tier,market:x.market,line:x.line,originalSelectedSide:x.selectedSide,
   originalFrozenFirstGitAt:x.firstGitCommittedAt,
   officialBoxscorePlayerPresent:false,
   externalOfficialEvidence:proof.url,reason:proof.reason,
   evidenceReviewedAsOf:"2026-11-20",
   classification:"confirmed_nonappearance_not_model_decision",
   platformVoidOrRefundVerified:false};
 });
 if(evidenceKeys.size!==NONAPPEARANCE_EVIDENCE.length||reconciled.length!==4)
  throw Error("Missing or changed nonappearance evidence set");
 const current=rows.filter(x=>x.tier==="Standard"),all=newGroup(),byMarket={},bySide={},
  poorGame={};
 for(const x of current){
  for(const [target,k] of [[byMarket,x.market],[bySide,x.selectedSide],
   [poorGame,String(x.gameId)]]){const b=target[k]||(target[k]=newGroup());add(b,x);}
  add(all,x);
 }
 return {kind:"private_nhl_nov19_frozen_standard_error_and_dnp_review_v1",
  totalOfficialFinalGames:12,sourceFrozenSelections:prior.all.registered,
  decidedSelections:prior.all.decided,preservedWins:prior.all.correct,
  preservedLosses:prior.all.incorrect,
  originalPending:prior.all.pending,confirmedNonappearances:reconciled.length,
  stillUnresolved:pending.length-reconciled.length,
  modelHitRateUnchanged:prior.all.hitRate,
  nonappearances:reconciled,
  standard:{overall:finish(all),
    byMarket:Object.fromEntries(Object.entries(byMarket).map(([k,v])=>[k,finish(v)])),
    bySide:Object.fromEntries(Object.entries(bySide).map(([k,v])=>[k,finish(v)])),
    worstGameFocus:Object.fromEntries(["2026020348","2026020356"].map(k=>{
     const gameRows=current.filter(x=>String(x.gameId)===k),
      m={},side={},team={};
     for(const x of gameRows){
      add(m[x.market]||(m[x.market]=newGroup()),x);
      add(side[x.selectedSide]||(side[x.selectedSide]=newGroup()),x);
      const teamKey=x.team+" vs "+x.opponent;
      add(team[teamKey]||(team[teamKey]=newGroup()),x);
     }
     const formatted=o=>Object.fromEntries(Object.entries(o).map(([key,v])=>[key,finish(v)]));
     return [k,{...finish(poorGame[k]||newGroup()),
      byMarket:formatted(m),byOriginalDirection:formatted(side),
      byTeamFacingOpponent:formatted(team)}];
    }))},
  diagnosticOnly:true,platformSettlementVerified:false,bettingEdgeEstablished:false,
  historicalDirectionsChanged:0};
}
function reviewNfl(diagnostic){
 if(diagnostic?.kind!=="nfl_original_frozen_direction_diagnostic_v1"||
    diagnostic.originalDirectionsCanNeverBeRevised!==true||
    !Array.isArray(diagnostic.rows))throw Error("NFL first Git frozen diagnostic is missing");
 const rows=diagnostic.rows.filter(r=>r.officialScheduleGameId===NFL_GAME);
 if(!rows.length)throw Error("November 19 NFL official final missing");
 const buckets={overall:newGroup(),side:{},market:{},higherByMarket:{}};
 for(const r of rows){
  if(!["decided","push"].includes(r.status)||!["Higher","Lower"].includes(r.originalSelectedSide)||
     r.offeredSide!==r.originalSelectedSide)
   throw Error("Unexpected NFL frozen status/side or unresolved game");
  const adapted={selectionStatus:r.status==="push"?"push":
    r.selectedSideResult==="correct"?"correct":"incorrect",
    estimatedProbability:0,officialResult:r.actualSide};
  if(r.status==="decided"&&!["correct","incorrect"].includes(r.selectedSideResult))
   throw Error("Unreconciled NFL selection");
  add(buckets.overall,adapted);
  const key=r.originalSelectedSide,m=r.market;
  add(buckets.side[key]||(buckets.side[key]=newGroup()),adapted);
  add(buckets.market[m]||(buckets.market[m]=newGroup()),adapted);
  if(key==="Higher")add(buckets.higherByMarket[m]||(buckets.higherByMarket[m]=newGroup()),adapted);
 }
 if(buckets.overall.decided!==269||buckets.overall.wins!==145||buckets.overall.push!==2)
  throw Error("NFL November 19 direction grade does not reconcile to original final");
 const safe=b=>{const {meanOriginalUncalibratedEstimate,...v}=finish(b);return v;};
 return {kind:"private_nfl_nov19_original_direction_bias_audit_v1",
  officialScheduleGameId:NFL_GAME,registered:rows.length,
  overall:safe(buckets.overall),
  bySide:Object.fromEntries(Object.entries(buckets.side).map(([k,v])=>[k,safe(v)])),
  byMarket:Object.fromEntries(Object.entries(buckets.market).map(([k,v])=>[k,safe(v)])),
  higherByMarket:Object.fromEntries(Object.entries(buckets.higherByMarket).map(([k,v])=>[k,safe(v)])),
  gameClusterCount:1,pairedBaselineSameOriginallySelectedThresholdsOnly:true,
  duplicateOrCorrelatedLinesNotIndependent:true,oneGameCannotProveFutureSideFlip:true,
  originalAppSettlementVerified:false,productionSideFlipsAuthorized:false};
}
/** A future-only research challenger gate. Passing only permits independent
 * review, not model promotion or wagering. No new model is fitted here. */
function futureGate(e={}){
 const conditions={
  policyPredatesFirstChallengerFreeze:typeof e.firstChallengerGitAt==="string"&&
   Date.parse(e.firstChallengerGitAt)>=Date.parse(POLICY_AFTER),
  genuineNewPregameGitFrames:e.originalGitVerified===true&&e.allFirstGitBeforeGame===true,
  protectedHoldout:e.holdoutNeverUsedForTuning===true,
  minimumDistinctNhlDates:Number.isInteger(e.nhlDistinctFutureSlates)&&e.nhlDistinctFutureSlates>=20,
  minimumDistinctNhlGames:Number.isInteger(e.nhlDistinctFutureGames)&&e.nhlDistinctFutureGames>=60,
  sufficientNhlMarketDecisions:Number.isInteger(e.nhlStandardMarketDecisions)&&e.nhlStandardMarketDecisions>=200,
  minimumNflFinalGames:Number.isInteger(e.nflDistinctFutureGames)&&e.nflDistinctFutureGames>=30,
  bothSidesRepresented:e.originalHigherAndLowerBothVerified===true,
  pastOnlyCalibration:e.calibrationPastOnly===true,
  betterThanBothSameLineBaselinesWithGameClusterUncertainty:
   typeof e.pairedClusterLower95VsBestBaseline==="number"&&e.pairedClusterLower95VsBestBaseline>0,
  exactOriginalAppLineAndSidesVerified:e.authenticatedOriginalOfferMatch===true,
  authenticatedPayoutSettlementEvidence:e.settledPaperReturnVerified===true
 };
 return {kind:"future_frozen_nhl_nfl_research_evidence_gate_v1",
  policyEarliestEffectiveUTC:POLICY_AFTER,conditions,
  evidenceReadyForHumanReview:Object.values(conditions).every(Boolean),
  automaticModelPromotion:false,automaticLineups:false,automaticWagers:false,
  doNotRetuneWithNov19:true,reportHistoricalHitRateAsCalibratedProbability:false};
}

/** Prospective monitoring starts strictly after this policy. This reads existing
 * immutable original-model snapshots; it does NOT create a new selected model.
 * Pending games are never counted as decided or as independent final games. */
function monitorFuture({ledger,nflDiagnostic}={}){
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
    ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
    !Array.isArray(ledger.records)||nflDiagnostic?.kind!=="nfl_original_frozen_direction_diagnostic_v1"||
    nflDiagnostic.originalDirectionsCanNeverBeRevised!==true||
    !Array.isArray(nflDiagnostic.rows))
  throw Error("Unverified original NHL/NFL frozen source for prospective monitor");
 const after=Date.parse(POLICY_AFTER),nhlGames=new Set(),nhlDates=new Set(),
  nflGames=new Set(),nhlMarkets={},sides=new Set();
 let nhlRegistered=0,nhlDecided=0,nflRegistered=0,nflDecided=0;
 const pacificDay=iso=>{
  const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
   year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(iso));
  const obj=Object.fromEntries(p.map(x=>[x.type,x.value]));
  return obj.year+"-"+obj.month+"-"+obj.day;
 };
 for(const r of ledger.records){
  if(r.tier!=="Standard"||!Number.isFinite(Date.parse(r.firstGitCommittedAt))||
     Date.parse(r.firstGitCommittedAt)<after)continue;
  if(!["Higher","Lower"].includes(r.selectedSide)||
     !(Date.parse(r.firstCaptureAt)<=Date.parse(r.firstResearchAt))||
     !(Date.parse(r.firstResearchAt)<=Date.parse(r.firstGitCommittedAt))||
     !(Date.parse(r.gameStartAt)>Date.parse(r.firstGitCommittedAt)))
   throw Error("Invalid future NHL original first Git game chronology");
  nhlRegistered++;sides.add(r.selectedSide);
  const decided=["correct","incorrect"].includes(r.selectionStatus);
  if(decided){
   nhlDecided++;nhlGames.add(r.gameId);nhlDates.add(pacificDay(r.gameStartAt));
   const m=nhlMarkets[r.market]||(nhlMarkets[r.market]={decided:0,correct:0});
   m.decided++;m.correct+=Number(r.selectionStatus==="correct");
  }
 }
 for(const r of nflDiagnostic.rows){
  if(!Number.isFinite(Date.parse(r.firstGitCommittedAt))||
     Date.parse(r.firstGitCommittedAt)<after)continue;
  if(!["Higher","Lower"].includes(r.originalSelectedSide)||
     r.originalSelectedSide!==r.offeredSide)
   throw Error("Invalid original NFL prospective side");
  nflRegistered++;
  if(r.status==="decided"){
   if(!r.officialScheduleGameId)throw Error("Future NFL game not officially identified");
   nflDecided++;nflGames.add(r.officialScheduleGameId);
  }
 }
 const largestNhlMarketDecisions=Math.max(0,...Object.values(nhlMarkets).map(v=>v.decided));
 return {kind:"private_new_original_git_frozen_holdout_monitor_v1",
  eligibleFirstGitAtOrAfterUTC:POLICY_AFTER,
  nhl:{registered:nhlRegistered,decided:nhlDecided,
   distinctFinalGames:nhlGames.size,distinctPacificSlateDates:nhlDates.size,
   byStandardMarket:nhlMarkets},
  nfl:{registered:nflRegistered,decided:nflDecided,distinctFinalGames:nflGames.size},
  bothNhlDirectionsObserved:sides.has("Higher")&&sides.has("Lower"),
  largeEnoughNhlMarketEvidence:largestNhlMarketDecisions>=200,
  originalIncumbentModelOnlyNotANewPrecommittedChallenger:true,
  observedPastGamesNeverUsedToRetuneThisFrozenCohort:true,
  noOriginalAppSettlementOrPayoutProof:true,probabilityCalibrated:false,
  releaseApproved:false};
}

function audit({ledger,stats,schedule,nflDiagnostic}){
 return {kind:"private_nov19_five_priority_review_v1",slateDate:DAY,
  nhl:reviewNhl({ledger,stats,schedule}),nfl:reviewNfl(nflDiagnostic),
  futureProgress:monitorFuture({ledger,nflDiagnostic}),
  futureGate:futureGate(),readOnly:true,paidRequests:0,originalLedgerMutated:false,
  automaticWagers:0};
}
module.exports={DAY,NONAPPEARANCE_EVIDENCE,reviewNhl,reviewNfl,monitorFuture,futureGate,audit};
