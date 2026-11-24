"use strict";
/** Actual outcomes versus same-frozen-line champion/experimental context. */
const {firstOriginals}=require("./nfl-original-freeze-identity.cjs");
const KIND="nfl_pregame_matchup_all_sources_shadow_v1";
const PROOF="nfl_context_matchup_original_git_forward_only_grade_v1";
const stamp=x=>typeof x==="string"?Date.parse(x):NaN;
const isNum=x=>typeof x==="number"&&Number.isFinite(x);
function verify(snapshot,firstGitAt,{minimumLeadMinutes=15}={}){
 const t=stamp(firstGitAt),created=stamp(snapshot?.createdAt),
  origin=stamp(snapshot?.originalFirstGitCommittedAt),
  board=stamp(snapshot?.sourceBoardAsOfAt);
 if(snapshot?.kind!==KIND||snapshot.schemaVersion!==1||
  snapshot.originalHigherLowerDirectionsImmutable!==true||
  snapshot.championModelUnchanged!==true||
  snapshot.trueProspectiveOnlyAfterOwnFirstGitCommitBeforeKickoff!==true||
  snapshot.calibratedProbabilities!==false||
  ![t,created,origin,board].every(Number.isFinite)||created-t>=1000||
  origin>t||board>origin||minimumLeadMinutes<15||
  !Array.isArray(snapshot.rows)||!snapshot.rows.length)return false;
 const ids=new Set();
 for(const x of snapshot.rows){
  const start=stamp(x.gameStartAt);
  if(!x.id||ids.has(x.id)||!Number.isFinite(start)||
     start-t<minimumLeadMinutes*60000||
     x.originalOfferedSideUnchanged!==true||
     !["Higher","Lower"].includes(x.originalSelectedSide)||
     !isNum(x.originalLine)||!isNum(x.originalProjection)||
     !["research_shadow_only","abstain_missing_core_or_injury"].includes(x.shadowStatus)||
     x.autoPickEligible!==false||x.calibratedProbability!==null||
     x.sourceSnapshotFirstGitCommitAt!==snapshot.originalFirstGitCommittedAt)return false;
  ids.add(x.id);
 }
 return true;
}
const summary=()=>({includedOriginalLines:0,decided:0,correctChampion:0,
 correctContext:0,correctHigher:0,correctLower:0,
 originalAbsoluteErrorSum:0,contextAbsoluteErrorSum:0,pushes:0,pending:0,
 games:new Set()});
function finish(o){
 const {games,...s}=o;
 const n=s.decided;
 return {...s,distinctFinalGames:games.size,
  originalSameLineHitRate:n?s.correctChampion/n:null,
  contextHypotheticalHitRate:n?s.correctContext/n:null,
  originalMAE:n?s.originalAbsoluteErrorSum/n:null,
  contextMAE:n?s.contextAbsoluteErrorSum/n:null,
  pairedMAEImprovement:n?
    (s.originalAbsoluteErrorSum-s.contextAbsoluteErrorSum)/n:null,
  contextIsAvailableAppQuote:false,validatedProbability:null,
  modelBetterThanAlwaysHigherLower:false,
  calibratedBettingEV:null};
}
// Experimental three-outcome scores on immutable original thresholds only.
const outcomes=["higher","lower","push"];
function validEmpirical(v,p,shadow,policyAt,firstGitAt){
 const probs=v?.probabilities;
 return v?.kind==="nfl_empirical_threshold_shadow_v1"&&v.researchOnly===true&&
  v.calibrated===false&&v.modelPromoted===false&&v.conditionalOnPlaying===true&&
  Number.isInteger(v.priorGames)&&v.priorGames>=8&&v.priorGames<=20&&
  v.createdAt===shadow.createdAt&&Number.isFinite(stamp(policyAt))&&
  stamp(v.createdAt)>stamp(policyAt)&&stamp(firstGitAt)>stamp(policyAt)&&
  stamp(v.createdAt)>=stamp(shadow.originalFirstGitCommittedAt)&&
  p.tier==="Standard"&&v.originalLine===p.line&&v.originalSide===p.selectedSide&&
  v.originalMean===p.historicalProjection&&v.sourceGameId===p.sourceGameId&&
  v.historicalPlayerId===p.historicalPlayerId&&
  outcomes.every(k=>isNum(probs?.[k])&&probs[k]>=0&&probs[k]<=1)&&
  Math.abs(outcomes.reduce((s,k)=>s+probs[k],0)-1)<1e-6;
}
const probSummary=()=>({registered:0,resolved:0,pending:0,pushes:0,correctOriginalSide:0,
 brierSum:0,logLossSum:0,selectedProbabilitySum:0,games:new Set()});
function recordProbability(s,v,p,final){
 s.registered++;
 if(!["decided","push"].includes(final.status)){s.pending++;return;}
 if(!isNum(final.actual)||!final.officialScheduleGameId)throw Error("Invalid official probability outcome");
 const actual=final.actual>p.line?"higher":final.actual<p.line?"lower":"push";
 if(final.actualSide?.toLowerCase()!==actual||
   (final.status==="push")!==(actual==="push")||
   (actual!=="push"&&final.selectedSideResult!==(p.selectedSide.toLowerCase()===actual?"correct":"incorrect")))
  throw Error("Official probability outcome inconsistent with original threshold");
 s.resolved++;s.pushes+=Number(actual==="push");
 s.correctOriginalSide+=Number(actual===p.selectedSide.toLowerCase());
 s.brierSum+=outcomes.reduce((a,k)=>a+(v.probabilities[k]-Number(k===actual))**2,0);
 s.logLossSum-=Math.log(Math.max(1e-6,v.probabilities[actual]));
 s.selectedProbabilitySum+=v.probabilities[p.selectedSide.toLowerCase()];
 s.games.add(final.officialScheduleGameId);
}
function finishProbability({games,brierSum,logLossSum,selectedProbabilitySum,...s}){
 return {...s,distinctFinalGames:games.size,
  threeOutcomeBrier:s.resolved?brierSum/s.resolved:null,
  threeOutcomeLogLoss:s.resolved?logLossSum/s.resolved:null,
  meanSelectedProbability:s.resolved?selectedProbabilitySum/s.resolved:null,
  strictSelectedHitRate:s.resolved?s.correctOriginalSide/s.resolved:null,
  researchOnly:true,independentlyCalibrated:false,modelPromoted:false};
}
function grade({snapshots=[],originalSnapshots=[],originalGrade,empiricalPolicyAt=null,positionPolicyAt=null}={}){
 if(originalGrade?.kind!=="nfl_private_pregame_evidence_separated_outcome_audit_v1"||
    originalGrade.nflverseFinalStatsNotPlatformSettlement!==true||
    !Array.isArray(originalGrade.explicitFrozenDirections?.rows))
  throw Error("Original precommitted NFL final outcomes not verified");
 const indexed=firstOriginals(originalSnapshots),originals=indexed.earliest,
  byOriginalCommit=indexed.byCommit;
 const finals=new Map(originalGrade.explicitFrozenDirections.rows.map(r=>[r.id,r]));
 const out=summary(),byMarket=new Map(),seen=new Set(),exclusions={};
 const prob=probSummary(),probMarkets=new Map(),probSeen=new Set();
 const positionSeen=new Set(),positionMarkets=new Map();
 let invalidProbabilities=0;
 let verified=0,eligibleShadows=0;
 const skip=k=>{exclusions[k]=(exclusions[k]||0)+1;};
 for(const item of [...snapshots].sort((a,b)=>stamp(a.firstCommittedAt)-stamp(b.firstCommittedAt))){
  if(item.gitHistoryCount!==1||!verify(item.snapshot,item.firstCommittedAt))
   throw Error("Original context challenger did not have first Git pregame proof");
  verified++;
  const shadow=item.snapshot;
  for(const x of shadow.rows){
   const orig=byOriginalCommit.get(shadow.originalFirstGitCommittedAt+"|"+x.id),
    earliest=originals.get(x.id),final=finals.get(x.id);
   if(!orig||!earliest||!final||
    orig.p.line!==x.originalLine||
    orig.p.historicalProjection!==x.originalProjection||
    orig.p.selectedSide!==x.originalSelectedSide||
    orig.p.eventStartsAt!==x.gameStartAt||
    final.modeledSide!==x.originalSelectedSide||
    final.line!==x.originalLine||
    final.firstGitCommittedAt!==earliest.firstCommittedAt)
     throw Error("Context projection did not match same original Git-frozen NFL line");
   // Same player/game/stat/threshold is one research event, however many
   // morning observations/publishers saw the quote.
   const key=[orig.p.sourceGameId,orig.p.historicalPlayerId,
     orig.p.market,orig.p.line].join("|");
   const pos=x.positionOpportunityShadow;
   if(pos?.researchOnly===true&&pos.pastOpportunityAppearancesOnly===true&&Number.isFinite(stamp(positionPolicyAt))&&stamp(shadow.createdAt)>stamp(positionPolicyAt)&&stamp(item.firstCommittedAt)>stamp(positionPolicyAt)&&!positionSeen.has(key)&&["QB","RB","FB","WR","TE"].includes(pos.position)&&["baseline","positionDefense","offenseDefense"].every(m=>isNum(pos[m]))){
    positionSeen.add(key);const m=orig.p.market+"|"+pos.position,a=positionMarkets.get(m)||{registered:0,decided:0,originalError:0,baselineError:0,defenseError:0,combinedError:0,originalCorrect:0,combinedCorrect:0,alwaysHigher:0,alwaysLower:0,games:new Set()};a.registered++;
    if(final.status==="decided"&&isNum(final.actual)&&final.officialScheduleGameId){a.decided++;a.originalError+=Math.abs(final.actual-x.originalProjection);a.baselineError+=Math.abs(final.actual-pos.baseline);a.defenseError+=Math.abs(final.actual-pos.positionDefense);a.combinedError+=Math.abs(final.actual-pos.offenseDefense);a.originalCorrect+=Number(orig.p.selectedSide===final.actualSide);a.combinedCorrect+=Number((pos.offenseDefense>orig.p.line?"Higher":pos.offenseDefense<orig.p.line?"Lower":"Abstain")===final.actualSide);a.alwaysHigher+=Number(final.actualSide==="Higher");a.alwaysLower+=Number(final.actualSide==="Lower");a.games.add(final.officialScheduleGameId);}
    positionMarkets.set(m,a);
   }
   const v=x.empiricalThresholdShadow;
   if(v!=null&&!probSeen.has(key)){
    if(validEmpirical(v,orig.p,shadow,empiricalPolicyAt,item.firstCommittedAt)){
     probSeen.add(key);
     const bucket=probMarkets.get(orig.p.market)||probSummary();
     recordProbability(bucket,v,orig.p,final);recordProbability(prob,v,orig.p,final);
     probMarkets.set(orig.p.market,bucket);
    }else invalidProbabilities++;
   }
   if(seen.has(key)){skip("duplicate_original_game_market_line");continue;}
   seen.add(key);
   if(x.shadowStatus!=="research_shadow_only"||
      !isNum(x.shadowProjection)||!["Higher","Lower"].includes(x.shadowDirection)){
    skip("abstained_or_no_predeclared_context");continue;
   }
   eligibleShadows++;
   const m=byMarket.get(orig.p.market)||summary();
   const update=s=>{
    s.includedOriginalLines++;
    if(final.status==="push"){s.pushes++;return;}
    if(final.status!=="decided"){s.pending++;return;}
    if(!isNum(final.actual)||!["Higher","Lower"].includes(final.actualSide)||
       final.selectedSideResult!==(orig.p.selectedSide===final.actualSide?"correct":"incorrect")||
       !final.officialScheduleGameId)
      throw Error("Invalid original game final outcome for context audit");
    s.decided++;s.correctChampion+=orig.p.selectedSide===final.actualSide;
    s.correctContext+=x.shadowDirection===final.actualSide;
    s.correctHigher+=final.actualSide==="Higher";
    s.correctLower+=final.actualSide==="Lower";
    s.originalAbsoluteErrorSum+=Math.abs(final.actual-x.originalProjection);
    s.contextAbsoluteErrorSum+=Math.abs(final.actual-x.shadowProjection);
    s.games.add(final.officialScheduleGameId);
   };
   update(m);update(out);byMarket.set(orig.p.market,m);
  }
 }
 return {kind:PROOF,schemaVersion:1,
  originalFirstGitSnapshotsVerified:verified,eligibleShadows,
  originalRepeatSnapshotsExcluded:indexed.exactRepeated,
  duplicateAndAbstentionExclusions:exclusions,
  originalSourceGradeAt:originalGrade.generatedAt,
  combined:finish(out),
  byMarket:Object.fromEntries([...byMarket].sort(([a],[b])=>a.localeCompare(b))
    .map(([k,v])=>[k,finish(v)])),
  empiricalThresholdResearch:{kind:"nfl_original_empirical_three_outcome_research_grade_v1",
   policyCommitVerified:Number.isFinite(stamp(empiricalPolicyAt)),
   invalidProbabilities,overall:finishProbability(prob),
   byMarket:Object.fromEntries([...probMarkets].map(([k,v])=>[k,finishProbability(v)])),
   threeOutcomeLogLossFloor:1e-6,distinctRowsNotIndependent:true,
   exactOriginalPlatformSettlementVerified:false,modelPromoted:false},
  positionOpportunityResearch:{registered:positionSeen.size,byMarketPosition:Object.fromEntries([...positionMarkets].map(([k,a])=>[k,{registered:a.registered,decided:a.decided,distinctGames:a.games.size,originalMAE:a.decided?a.originalError/a.decided:null,baselineMAE:a.decided?a.baselineError/a.decided:null,positionDefenseMAE:a.decided?a.defenseError/a.decided:null,offenseDefenseMAE:a.decided?a.combinedError/a.decided:null,originalHitRate:a.decided?a.originalCorrect/a.decided:null,combinedCounterfactualHitRate:a.decided?a.combinedCorrect/a.decided:null,alwaysHigher:a.decided?a.alwaysHigher/a.decided:null,alwaysLower:a.decided?a.alwaysLower/a.decided:null}])),modelPromoted:false,calibrated:false},
  firstGitProofRequiredForEachShadow:true,
  shadowDesignedAfterNov9GameFinished:true,
  november9GameCannotBePrecommittedChallengerEvidence:true,
  allSameLineThresholds:true,
  sourceWebsiteLicensesStillRequireApproval:true,
  currentFirstPartyQuotesVerified:false,
  nflverseStatsNotOriginalPlatformSettlement:true,
  gameClusterIndependenceNotProven:true,
  noCalibratedProbabilities:true,
  noExpectedValue:true,
  productionChampionUnchanged:true,
  automaticWagersPlaced:0};
}
module.exports={verify,grade,PROOF};
