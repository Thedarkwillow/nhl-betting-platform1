"use strict";
/**
 * Two intentionally non-overlapping cohorts:
 *   1) Retrospective replay of the NEW fixed recipe applied TODAY to OLD
 *      authentic first-Git PrizePicks lines with prior-date NHL official stats.
 *   2) Genuine prospective original Git-precommitted NEW forecast outcomes.
 *
 * Pre-existing original champion directions remain the comparator. Never
 * imply historical replay is a frozen new forecast, bookable opposite side,
 * independently available historical feed, or actual wager settlement.
 */
const {source,KIND}=require("./nhl-eight-accuracy-research-v1.cjs");
const {key,LIMITS}=require("./nhl-standard-quality-challenger-v2.cjs");
const {officialOutcome}=require("./nhl-standard-abstention-audit.cjs");
const finite=Number.isFinite;
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const pvalid=x=>finite(x)&&x>=0&&x<=1&&x!==.5;
const half=x=>finite(x)&&x>=0&&x%1===.5;
const historicKind="nhl_original_platform_line_retrospective_new_policy_replay_v1";
const futureKind="nhl_original_platform_line_first_git_new_policy_forward_hit_rate_v1";
const windowStart="2026-11-08T00:00:00Z";
const mlist=Object.keys(LIMITS);
function group(){
 return {originals:0,sourceUnsupported:0,resultsPending:0,
  decidedOriginal:0,winOriginal:0,lossOriginal:0,
  actualHigherOriginal:0,actualLowerOriginal:0,
  pairDecided:0,winNew:0,lossNew:0,winOldOnPair:0,lossOldOnPair:0,
  actualHigherPair:0,actualLowerPair:0,
  selected:0,selectedPending:0,selectedDecided:0,selectedWins:0,
  selectedLosses:0,selectedHigher:0,selectedLower:0,
  uniqueGames:new Set(),uniqueSlates:new Set(),
  missingSourceReasons:{}};
}
function slate(t){
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",
  day:"2-digit"}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));
 return [p.year,p.month,p.day].join("-");
}
function add(g,p,out,r){
 g.originals++;
 if(r?.status!=="research_only_conditional_on_appearance"){
  g.sourceUnsupported++;
  const reason=r?.status||"source_not_available";
  g.missingSourceReasons[reason]=(g.missingSourceReasons[reason]||0)+1;
 }
 if(r?.candidateResearchOnly===true)g.selected++;
 if(out.status!=="decided"){
  g.resultsPending++;
  if(r?.candidateResearchOnly===true)g.selectedPending++;
  return;
 }
 const y=out.side==="Higher",oldWin=p.lean===out.side;
 g.decidedOriginal++;g.winOriginal+=Number(oldWin);
 g.lossOriginal+=Number(!oldWin);
 g.actualHigherOriginal+=Number(y);g.actualLowerOriginal+=Number(!y);
 g.uniqueGames.add(p.gameId);g.uniqueSlates.add(slate(p.gameStartAt));
 const q=r?.models?.opponentAdjusted;
 if(pvalid(q)&&r.status==="research_only_conditional_on_appearance"){
  const win=q>.5===y;
  g.pairDecided++;g.winNew+=Number(win);g.lossNew+=Number(!win);
  g.winOldOnPair+=Number(oldWin);g.lossOldOnPair+=Number(!oldWin);
  g.actualHigherPair+=Number(y);g.actualLowerPair+=Number(!y);
  if(r.candidateResearchOnly===true){
   g.selectedDecided++;g.selectedWins+=Number(win);
   g.selectedLosses+=Number(!win);
   g.selectedHigher+=Number(y);g.selectedLower+=Number(!y);
  }
 }
}
function rate(n,total){return total?n/total:null;}
function pack(g){
 return {originalSelections:g.originals,sourceUnsupported:g.sourceUnsupported,
  officialPendingOrPush:g.resultsPending,
  original:{selections:g.decidedOriginal,wins:g.winOriginal,losses:g.lossOriginal,
   hitRate:rate(g.winOriginal,g.decidedOriginal),
   alwaysHigherOnSameLines:rate(g.actualHigherOriginal,g.decidedOriginal),
   alwaysLowerOnSameLines:rate(g.actualLowerOriginal,g.decidedOriginal)},
  exactSameLinePaired:{
   selections:g.pairDecided,newModel:{wins:g.winNew,losses:g.lossNew,
    hitRate:rate(g.winNew,g.pairDecided)},
   originalOnTheseLines:{wins:g.winOldOnPair,losses:g.lossOldOnPair,
    hitRate:rate(g.winOldOnPair,g.pairDecided)},
   alwaysHigher:rate(g.actualHigherPair,g.pairDecided),
   alwaysLower:rate(g.actualLowerPair,g.pairDecided)
  },
  exploratorySelected:{
   selectionsRegistered:g.selected,decided:g.selectedDecided,
   pending:g.selectedPending,wins:g.selectedWins,losses:g.selectedLosses,
   hitRate:rate(g.selectedWins,g.selectedDecided),
   alwaysHigherOnSameLines:rate(g.selectedHigher,g.selectedDecided),
   alwaysLowerOnSameLines:rate(g.selectedLower,g.selectedDecided)
  },
  distinctOriginalGames:g.uniqueGames.size,distinctOriginalSlates:g.uniqueSlates.size,
  missingSourceReasons:g.missingSourceReasons};
}
function originalFrame(f,policyAt){
 const s=f?.snapshot,t=at(s?.generatedAt),git=at(f?.firstGitCommittedAt),
  cut=at(policyAt);
 return f?.gitHistoryCount===1&&s?.source==="partner-api.prizepicks.com"&&
  Array.isArray(s?.rankedProps)&&Array.isArray(s?.individualPropSelections)&&
  [t,git,cut].every(finite)&&t>=at(windowStart)&&t<cut&&
  git>=t&&git-t<=15*60000&&git<cut;
}
function replay(frames,history,{policyAt,includeDiagnosticRows=false}={}){
 const diagnosticRows=[],by={},all=group(),seen=new Set(),
  excluded={invalidFrames:0,invalidOriginals:0,repeatedLines:0},
  controls={validatedFirstGitFrames:0,originalEligible:0,gradedBeforePolicy:0};
 for(const f of [...(frames||[])].sort((a,b)=>
  at(a.firstGitCommittedAt)-at(b.firstGitCommittedAt))){
  if(!originalFrame(f,policyAt)){excluded.invalidFrames++;continue;}
  controls.validatedFirstGitFrames++;
  const s=f.snapshot,t=at(s.generatedAt),git=at(f.firstGitCommittedAt);
  for(const p of s.individualPropSelections.filter(x=>
    x?.tier==="Standard"&&mlist.includes(x.market))){
   const identity=key(p),captured=at(p.capturedAt),
    start=at(p.gameStartAt);
   if(seen.has(identity)){excluded.repeatedLines++;continue;}
   // Don't contaminate the cohort with late-inserted or retroactive props.
   const originals=s.rankedProps.filter(x=>key(x)===identity&&
     x.lean===p.lean&&x.capturedAt===p.capturedAt&&
     x.gameStartAt===p.gameStartAt);
   if(!Number.isInteger(p.playerId)||!Number.isInteger(p.gameId)||
    !["Higher","Lower"].includes(p.lean)||!half(p.line)||
    ![captured,start].every(finite)||captured>t||
    t-captured>30*60000||start-git<15*60000||
    originals.length!==1||originals[0].probabilities?.push!==0){
    excluded.invalidOriginals++;continue;
   }
   // First authentic immutable line wins, even if later captures disagree.
   seen.add(identity);controls.originalEligible++;
   const match=x=>key(x)===identity&&x.capturedAt===p.capturedAt&&
    x.gameStartAt===p.gameStartAt;
   const ad=(s.standardAdaptiveResearchV2?.rows||[]).filter(x=>
    match(x)&&x.originalSide===p.lean);
   const positions=(s.positionRateMatchupV2?.rows||[]).filter(x=>
    match(x)&&x.side===p.lean);
   const contexts=(s.matchupContextReviewV1?.rows||[]).filter(x=>
    match(x)&&x.side===p.lean);
   // Crucially no current/updated external lineup, xG, injury, book quote.
   // We replay only official games with dates strictly BEFORE the freeze.
   const shadow=source(p,{...s,_historicalContext:history},
    ad.length===1?ad[0]:null,positions.length===1?positions[0]:null,
    contexts.length===1?contexts[0].context:null,null);
   const out=officialOutcome(p,history);
   if(includeDiagnosticRows)diagnosticRows.push({
    gameId:p.gameId,playerId:p.playerId,market:p.market,
    line:p.line,tier:p.tier,originalSide:p.lean,
    gameStartAt:p.gameStartAt,sourceCapturedAt:p.capturedAt,
    originalModelHigher:originals[0].probabilities?.higher??null,
    eightFactorReplayedHigher:shadow?.models?.opponentAdjusted??null,
    replayedSource:shadow,
    officialStatus:out.status,
    actualSide:out.status==="decided"?out.side:null
   });
   const groups=[all,by[p.market]??=group()];
   for(const g of groups)add(g,p,out,shadow);
   if(out.status==="decided")controls.gradedBeforePolicy++;
  }
 }
 return {kind:historicKind,
  source:"original first-Git pregame archived PrizePicks Standard lines",
  replayPolicyAt:policyAt??null,archiveFrom:windowStart,
  ...controls,excluded,
  ...(includeDiagnosticRows?{diagnosticRows}:{}),
  all:pack(all),byMarket:Object.fromEntries(Object.entries(by).map(([k,v])=>[k,pack(v)])),
  interpretation:"RETROSPECTIVE reconstruction, not an original frozen forecast",
  historicalOfficialGamesOnlyPriorDates:true,
  oldOriginalSideFromAuthenticFrozenBoard:true,
  newFixedPolicyWasDevelopedAfterTheseGames:true,
  historicalStatFeedAsOfOriginalCaptureIndependentlyVerified:false,
  externalPregameRoleAndTrackingNotReconstructed:true,
  exactSportsbookIdentityAndBookabilityUnverified:true,
  rightTailThresholdsAndPushesNotReinterpreted:true,
  exploratorySelectedRuleNotRetrospectivelyValidated:true,
  possibleSelectionAndTemporalBias:true,
  prospectiveResultsNotMerged:true,
  provenBettingEdge:false,modelPromoted:false,bettingEligible:false};
}
function forward(a,{generatedAt=null}={}){
 if(a?.kind!=="nhl_eight_accuracy_first_git_future_scorecard_v1")
  throw Error("No authenticated prospective eight-model scorecard");
 function packForward(g){
  const m=g?.models?.opponentAdjusted||{},
   old=g?.models?.originalChampion||{},
   selected=g?.selectedModel||{},n=m.decided||0,
   sn=selected.decided||0;
  // Same registered original population is audited in source scorecard;
  // new/old may have different missing predictions, so they are NOT
  // asserted to be an exact paired subset here.
  return {originalSelections:g?.originals||0,
   sourceUnsupported:g?.unsupported||0,
   officialPendingOrPush:g?.pending||0,
   original:{selections:old.decided||0,wins:old.hits||0,
    losses:(old.decided||0)-(old.hits||0),
    hitRate:old.directionalHitRate??null,
    alwaysHigherOnSameLines:old.alwaysHigherSameLines??null,
    alwaysLowerOnSameLines:old.alwaysLowerSameLines??null},
   newModel:{selections:n,wins:m.hits||0,losses:n-(m.hits||0),
    hitRate:m.directionalHitRate??null,
    alwaysHigherOnSameLines:m.alwaysHigherSameLines??null,
    alwaysLowerOnSameLines:m.alwaysLowerSameLines??null},
   exploratorySelected:{selectionsRegistered:g?.selectedResearch||0,
    decided:sn,wins:selected.hits||0,losses:sn-(selected.hits||0),
    hitRate:selected.directionalHitRate??null,
    alwaysHigherOnSameLines:selected.alwaysHigherSameLines??null,
    alwaysLowerOnSameLines:selected.alwaysLowerSameLines??null},
   exactSameLinePaired:{
    selections:g?.strictSameLinePair?.newModel?.decided||0,
    newModel:{wins:g?.strictSameLinePair?.newModel?.hits||0,
     losses:(g?.strictSameLinePair?.newModel?.decided||0)-
      (g?.strictSameLinePair?.newModel?.hits||0),
     hitRate:g?.strictSameLinePair?.newModel?.directionalHitRate??null},
    originalOnTheseLines:{wins:g?.strictSameLinePair?.originalFrozenSide?.hits||0,
     losses:(g?.strictSameLinePair?.originalFrozenSide?.decided||0)-
       (g?.strictSameLinePair?.originalFrozenSide?.hits||0),
     hitRate:g?.strictSameLinePair?.originalFrozenSide?.directionalHitRate??null},
    alwaysHigher:g?.strictSameLinePair?.newModel?.alwaysHigherSameLines??null,
    alwaysLower:g?.strictSameLinePair?.newModel?.alwaysLowerSameLines??null
   },
   independentSameLineModelComparisonReady:(g?.strictSameLinePair?.newModel?.decided||0)>0,
   sourceCoverage:g?.sourceCoverage||{}};
 }
 return {kind:futureKind,source:"exact original first-Git pregame NEW model snapshots",
  generatedAt,policyAt:a.policyAt,
  originals:a.originals,acceptedFrames:a.acceptedFrames,
  latestOfficialDecisions:a.officialDecided,
  all:packForward(a.overall),
  byMarket:Object.fromEntries(Object.entries(a.byMarket||{}).map(([k,v])=>[k,packForward(v)])),
  rawForwardReportKind:a.kind,
  originalPolicyAndModelFrozenBeforeGame:true,
  noRetrospectiveReconstructionInThisCohort:true,
  performanceApproved:false,
  independentBookabilityVerified:false,
  payoutAdjustedProfitabilityVerified:false,
  calibrated:false,modelPromoted:false,bettingEligible:false};
}
module.exports={replay,forward,originalFrame};
