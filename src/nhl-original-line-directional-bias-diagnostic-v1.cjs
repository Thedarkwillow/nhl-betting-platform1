"use strict";
/** Retrospective DIAGNOSTIC ONLY. Never fit a selection threshold from labels. */
const {assess}=require("./nhl-strict-directional-abstention-v1.cjs");
const valid=p=>Number.isFinite(p)&&p>=0&&p<=1;
function init(){
 return {registered:0,decided:0,originalWins:0,newWins:0,
  pairedNew:0,actualHigher:0,actualLower:0,
  games:new Set(),slates:new Set(),predictedHigher:0,predictedLower:0,
  modelDisagreements:0,skipped:0,strictSelected:0,
  strictWins:0,strictSelectedDecided:0,
  skipReasons:{}};
}
function day(t){return new Date(t).toISOString().slice(0,10);}
function update(b,r){
 b.registered++;
 const p={...r,lean:r.originalSide,capturedAt:r.sourceCapturedAt};
 // The historical "source()" calculation is a model output, unlike freeze()
 // rows which include the authentic original identity wrapper. Reconstruct
 // that wrapper only from the actual first-Git original offer fields.
 const provenance=r.replayedSource?{
  ...r.replayedSource,gameId:r.gameId,playerId:r.playerId,
  market:r.market,tier:r.tier,line:r.line,originalSide:r.originalSide,
  capturedAt:r.sourceCapturedAt,gameStartAt:r.gameStartAt}:null;
 const c=assess(p,provenance),
  q=r.eightFactorReplayedHigher,has=valid(q)&&q!==.5;
 if(c.selectedResearchOnly===true)b.strictSelected++;
 else {b.skipped++;const why=c.reason||"unknown";
  b.skipReasons[why]=(b.skipReasons[why]||0)+1;}
 if(r.officialStatus!=="decided")return;
 b.decided++;
 const win=r.actualSide===r.originalSide;
 b.originalWins+=Number(win);
 b.actualHigher+=Number(r.actualSide==="Higher");
 b.actualLower+=Number(r.actualSide==="Lower");
 b.games.add(r.gameId);b.slates.add(day(r.gameStartAt));
 if(has){
  const side=q>.5?"Higher":"Lower";
  b.pairedNew++;b.newWins+=Number(side===r.actualSide);
  b.predictedHigher+=Number(side==="Higher");
  b.predictedLower+=Number(side==="Lower");
  b.modelDisagreements+=Number(side!==r.originalSide);
 }
 if(c.selectedResearchOnly===true){
  b.strictSelectedDecided++;
  b.strictWins+=Number(c.direction===r.actualSide);
 }
}
const rate=(a,b)=>b?a/b:null;
function compact(b){
 return {originals:b.registered,decided:b.decided,
  originalWins:b.originalWins,originalLosses:b.decided-b.originalWins,
  originalHitRate:rate(b.originalWins,b.decided),
  alwaysHigherSameLines:rate(b.actualHigher,b.decided),
  alwaysLowerSameLines:rate(b.actualLower,b.decided),
  reconstructedNewDecided:b.pairedNew,reconstructedNewWins:b.newWins,
  reconstructedNewLosses:b.pairedNew-b.newWins,
  reconstructedNewHitRate:rate(b.newWins,b.pairedNew),
  newModelHigherPredictions:b.predictedHigher,
  newModelLowerPredictions:b.predictedLower,
  originalVsNewDirectionDisagreement:b.modelDisagreements,
  distinctGames:b.games.size,distinctGameDates:b.slates.size,
  strictRetrospectiveSelected:b.strictSelected,
  strictRetrospectiveSelectedDecided:b.strictSelectedDecided,
  strictRetrospectiveWins:b.strictWins,
  strictRetrospectiveLosses:b.strictSelectedDecided-b.strictWins,
  strictRetrospectiveHitRate:rate(b.strictWins,b.strictSelectedDecided),
  abstentions:b.skipped,
  abstentionReasons:b.skipReasons};
}
function interval(p){
 if(!valid(p))return "prob_missing";
 if(p<.4)return "pHigher_lt_40";
 if(p<.5)return "pHigher_40_49";
 if(p<.6)return "pHigher_50_59";
 if(p<.7)return "pHigher_60_69";
 if(p<.8)return "pHigher_70_79";
 return "pHigher_80plus";
}
function analyze(rows){
 if(!Array.isArray(rows))throw Error("Original-line replay rows required");
 const all=init(),markets={},sides={},lines={},probBands={},players={},
  splitBefore="2026-11-15";
 for(const r of rows){
  const b=[all,
   markets[r.market]??=init(),
   sides[r.market+"|"+r.originalSide]??=init(),
   lines[r.market+"|"+r.line]??=init(),
   probBands[r.market+"|"+interval(r.originalModelHigher)]??=init(),
   players[r.market+"|"+r.playerId]??=init()];
  for(const g of b)update(g,r);
 }
 const summarize=o=>Object.fromEntries(Object.entries(o)
  .map(([k,b])=>[k,compact(b)]));
 const byPlayer=Object.entries(players).map(([k,b])=>[k,compact(b)])
  .filter(([,b])=>b.decided>=8&&b.distinctGames>=5)
  .sort((a,b)=>b[1].decided-a[1].decided).slice(0,35);
 const early=init(),later=init();
 for(const r of rows)update(day(r.gameStartAt)<splitBefore?early:later,r);
 return {kind:"nhl_original_line_directional_bias_diagnostic_retrospective_v1",
  originalLines:rows.length,overall:compact(all),
  byMarket:summarize(markets),byMarketOriginalSide:summarize(sides),
  byExactMarketLine:summarize(lines),
  byMarketOriginalProbabilityBand:summarize(probBands),
  descriptivePlayerSamples:Object.fromEntries(byPlayer),
  chronologicalDiagnosticPartitions:{
   earlier:{endExclusive:splitBefore,...compact(early)},
   later:{startInclusive:splitBefore,...compact(later)}
  },
  historicalReplayedNewModelNotOriginallyFrozen:true,
  precommittedStrictPolicyDevelopedAfterTheseOutcomes:true,
  chronologicalPartitionNotIndependentProspectiveHoldout:true,
  noPosthocThresholdSelection:true,
  noPlayerRankingPromotion:true,
  rawHistoricalProbabilityNotCalibrated:true,
  originalSideNeverInvertedToAssertBookability:true,
  confidenceApproved:false,modelPromoted:false,
  bettingEligible:false,payoutEVVerified:false};
}
module.exports={analyze};
