"use strict";
/**
 * True forward NFL research challenger grading. Every shadow policy has
 * an independent first-Git pregame commit, with no reclassification of old
 * numerical forecasts or the November 9 outcome that motivated the study.
 */
const {verifyShadow,POLICY,KIND}=require("./nfl-prospective-shadow.cjs");
const {firstOriginals}=require("./nfl-original-freeze-identity.cjs");
const EXPECTED="nfl_private_pregame_evidence_separated_outcome_audit_v1";
const init=()=>({researchSelections:0,decided:0,correct:0,incorrect:0,pushes:0,pending:0,
 hypotheticalAlwaysHigher:0,hypotheticalAlwaysLower:0,distinctGameKeys:new Set()});
function compute(v){
 const {distinctGameKeys,...s}=v;
 return {...s,distinctFinalGames:distinctGameKeys.size,
  observedHitRate:s.decided?s.correct/s.decided:null,
  hypotheticalAlwaysHigherRate:s.decided?s.hypotheticalAlwaysHigher/s.decided:null,
  hypotheticalAlwaysLowerRate:s.decided?s.hypotheticalAlwaysLower/s.decided:null,
  calibratedProbability:null,expectedValue:null,provenImprovement:false};
}
function gradeProspectiveShadows({grade,shadowSources,originalSnapshots}={}){
 if(grade?.kind!==EXPECTED||grade.nflverseFinalStatsNotPlatformSettlement!==true||
   grade.neverClaimNumericSideAsPreviouslyFrozenHigherLower!==true||
   !Array.isArray(grade.explicitFrozenDirections?.rows))
   throw Error("NFL original frozen pregame evidence unavailable");
 const indexed=firstOriginals(originalSnapshots||[]),
  original=indexed.earliest,byOriginalCommit=indexed.byCommit,graded=new Map();
 for(const row of grade.explicitFrozenDirections.rows){
  if(graded.has(row.id))throw Error("Repeated final result identity");
  graded.set(row.id,row);
 }
 const byPolicy=Object.fromEntries(Object.keys(POLICY).map(k=>[k,init()]));
 const seen=new Set(),pendingByStatus={},shadows=(shadowSources||[]).sort((a,b)=>
  Date.parse(a.firstCommittedAt)-Date.parse(b.firstCommittedAt));
 let eligibleRows=0,duplicates=0,lockedSnapshots=0;
 for(const item of shadows){
  if(item.gitHistoryCount!==1||
   !verifyShadow(item.shadow,item.firstCommittedAt).verified)
   throw Error("Postgame policy did not have an original before-kickoff Git addition");
  lockedSnapshots++;
  const s=item.shadow;
  for(const p of s.selected){
   // A shadow must match its OWN originally precommitted capture, even
   // if the same exact quote was frozen by an earlier retry.
   const src=byOriginalCommit.get(s.sourceSnapshotFirstGitCommittedAt+"|"+p.id),
    canonical=original.get(p.id),row=graded.get(p.id);
   if(!src||!canonical||!row||
      p.selectedSide!==src.p.selectedSide||p.offeredSide!==src.p.offeredSide||
      p.sourceGameId!==src.p.sourceGameId||
      p.historicalPlayerId!==src.p.historicalPlayerId||
      p.market!==src.p.market||p.line!==src.p.line||
      p.historicalProjection!==src.p.historicalProjection||
      p.eventStartsAt!==src.p.eventStartsAt||
      row.firstGitCommittedAt!==canonical.firstCommittedAt||
      row.modeledSide!==src.p.selectedSide||row.line!==p.line)
    throw Error("Shadow not identical to an originally frozen Standard quote and outcome");
   // Do not inflate N by treating every 6/9 AM observation of the same
   // player/game/line as an independent postgame result.
   const key=[p.sourceGameId,p.historicalPlayerId,p.market,p.line].join("|");
   if(seen.has(key)){duplicates++;continue}
   seen.add(key);eligibleRows++;
   pendingByStatus[row.status]=(pendingByStatus[row.status]||0)+1;
   for(const policy of Object.keys(POLICY)){
    if(p.policyDecisions[policy]!=="include")continue;
    const v=byPolicy[policy];v.researchSelections++;
    if(row.status==="push"){v.pushes++;continue}
    if(row.status!=="decided"){v.pending++;continue}
    const correct=row.selectedSideResult==="correct";
    if(!["correct","incorrect"].includes(row.selectedSideResult)||
       !["Higher","Lower"].includes(row.actualSide)||!row.officialScheduleGameId)
     throw Error("Missing source-verified decisive outcome");
    v.decided++;v.correct+=correct;v.incorrect+=!correct;
    v.hypotheticalAlwaysHigher+=row.actualSide==="Higher";
    v.hypotheticalAlwaysLower+=row.actualSide==="Lower";
    v.distinctGameKeys.add(row.officialScheduleGameId);
   }
  }
 }
 return {kind:"nfl_original_pregame_shadow_abstention_grading_v1",
  schemaVersion:1,originalGitShadowSnapshotsVerified:lockedSnapshots,
  uniqueOriginalFrozenQuotes:eligibleRows,duplicateQuotesNotCounted:duplicates,
  duplicateOriginalSnapshotObservationsNotCounted:indexed.exactRepeated,
  originalOutcomesGradeAt:grade.generatedAt,pendingBySourceStatus:pendingByStatus,
  byPolicy:Object.fromEntries(Object.entries(byPolicy).map(([k,v])=>[k,compute(v)])),
  policiesRegisteredAfterNov9OutcomesWereKnown:true,
  claimsForEarlierGamesExcluded:true,originalHigherLowerDirectionsUnchanged:true,
  comparingOnlySelectedOriginalThresholds:true,
  oneGameCorrelationAndSourceSideSelectionStillUnresolved:true,
  noCurrentWagerRecommendation:true,platformSettlementVerified:false,
  calibratedProbabilities:false,payoutAdjustedEV:null,modelPromoted:false,officialWagersPlaced:0};
}
module.exports={gradeProspectiveShadows};
