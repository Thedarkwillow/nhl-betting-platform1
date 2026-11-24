"use strict";
/**
 * First-Git-proven NFL original selected directions vs nflverse game stats.
 * Diagnose systematic-over and tiny-margin Higher misses without EVER
 * recoding results as new pregame picks or optimizing on one finished game.
 */
const {firstOriginals}=require("./nfl-original-freeze-identity.cjs");
const KIND="nfl_original_frozen_direction_diagnostic_v1";
const decided=new Set(["decided","push"]);
const n=x=>typeof x==="number"&&Number.isFinite(x);
const pct=(a,b)=>b?Number((a/b).toFixed(6)):null;
const zeros=()=>({registered:0,decided:0,correct:0,incorrect:0,pushes:0,pending:0,
 higherChosen:0,lowerChosen:0,higherCorrect:0,higherWrong:0,lowerCorrect:0,lowerWrong:0,
 overForecast:0,underForecast:0,exactForecast:0,projectionMinusActualSum:0,
 forecastMAESum:0,nearMarginHigherWrong:0,nearMarginHigherChosen:0,
 actualHigher:0,actualLower:0,independentGameIds:new Set()});
function finish(x,{withinMarket=false}={}){
 const {independentGameIds,...o}=x;
 o.distinctFinalGames=independentGameIds.size;
 o.rateDecided=pct(o.correct,o.decided);
 o.higherCorrectRate=pct(o.higherCorrect,o.higherChosen);
 o.lowerCorrectRate=pct(o.lowerCorrect,o.lowerChosen);
 o.pairedAlwaysHigherCorrect=o.actualHigher;
 o.pairedAlwaysLowerCorrect=o.actualLower;
 o.meanProjectionMinusActual=withinMarket&&o.decided?
  Number((o.projectionMinusActualSum/o.decided).toFixed(6)):null;
 o.meanAbsoluteForecastError=withinMarket&&o.decided?
  Number((o.forecastMAESum/o.decided).toFixed(6)):null;
 delete o.projectionMinusActualSum;delete o.forecastMAESum;
 o.differentPropUnitsMustNotBeSummed=!withinMarket;
 o.expectedValue=null;
 return o;
}
function add(x,row,p){
 x.registered++;
 if(row.status==="push"){x.pushes++;return;}
 if(row.status!=="decided"){x.pending++;return;}
 x.decided++;x.independentGameIds.add(row.officialScheduleGameId);
 const side=p.selectedSide,actual=row.actualSide;
 if(side==="Higher"){
  x.higherChosen++;if(actual===side)x.higherCorrect++;else x.higherWrong++;
 }else{
  x.lowerChosen++;if(actual===side)x.lowerCorrect++;else x.lowerWrong++;
 }
 x.correct+=side===actual;x.incorrect+=side!==actual;
 x.actualHigher+=actual==="Higher";x.actualLower+=actual==="Lower";
 const d=p.historicalProjection-row.actual;
 x.overForecast+=d>0;x.underForecast+=d<0;x.exactForecast+=d===0;
 x.projectionMinusActualSum+=d;x.forecastMAESum+=Math.abs(d);
 // Descriptive line proximity, not tuned selection or probability.
 const within=Math.abs(p.historicalProjection-p.line)<=Math.max(1,.05*Math.abs(p.line));
 if(side==="Higher"&&within){
  x.nearMarginHigherChosen++;
  if(actual==="Lower")x.nearMarginHigherWrong++;
 }
}
function diagnose(grade,snapshots,{now=new Date().toISOString()}={}){
 if(grade?.kind!=="nfl_private_pregame_evidence_separated_outcome_audit_v1"||
   grade.nflverseFinalStatsNotPlatformSettlement!==true||
   grade.neverClaimNumericSideAsPreviouslyFrozenHigherLower!==true||
   grade.explicitFrozenDirections?.kind!=="nfl_original_git_precommitted_directional_research_grade_v1"||
   !Array.isArray(grade.explicitFrozenDirections.rows))
  throw Error("Unverified explicit original NFL frozen grading evidence");
 const indexed=firstOriginals(snapshots||[]),source=indexed.earliest;
 const firstCommits=new Set([...source.values()].map(x=>x.firstCommittedAt));
 for(const {p} of source.values()){
  if(!["Higher","Lower"].includes(p.selectedSide)||
    p.tier!=="Standard"||p.offeredSide!==p.selectedSide||
    p.autoPickEligible!==false||p.probability!==null)
   throw Error("Malformed original frozen research direction");
 }
 const g=grade.explicitFrozenDirections,overall=zeros(),
  byMarket=new Map(),byTeam=new Map(),byGame=new Map(),status={};
 const rows=[];
 for(const row of g.rows){
  const src=source.get(row.id);
  if(!src||rows.some(x=>x.id===row.id))
   throw Error("Unknown or repeated graded original frozen direction");
  const {p,firstCommittedAt}=src;
  if(row.firstGitCommittedAt!==firstCommittedAt||
     row.market!==p.market||row.line!==p.line||
     row.sourceGameId!==p.sourceGameId||
     row.modeledSide!==p.selectedSide||
     Math.abs(row.modelProjection-p.historicalProjection)>1e-7)
   throw Error("Original freeze/grade line, side or Git chronology differs");
  if(row.status==="decided"){
   if(!n(row.actual)||!["Higher","Lower"].includes(row.actualSide)||
      (row.actual>p.line?"Higher":row.actual<p.line?"Lower":"Push")!==row.actualSide||
      row.selectedSideResult!==(p.selectedSide===row.actualSide?"correct":"incorrect")||
      !row.officialScheduleGameId)
    throw Error("Decided original grade has inconsistent final player stat");
  }else if(row.status==="push"){
   if(row.actual!==p.line||row.actualSide!=="Push")throw Error("Invalid push");
  }
  status[row.status]=(status[row.status]||0)+1;
  add(overall,row,p);
  const bM=byMarket.get(p.market)||zeros();add(bM,row,p);byMarket.set(p.market,bM);
  const team=p.team+" vs "+p.opponent,bT=byTeam.get(team)||zeros();
  add(bT,row,p);byTeam.set(team,bT);
  const game=p.sourceGameId,bG=byGame.get(game)||zeros();add(bG,row,p);byGame.set(game,bG);
  rows.push({id:row.id,market:p.market,team:p.team,opponent:p.opponent,
   originalSelectedSide:p.selectedSide,offeredSide:p.offeredSide,
   status:row.status,sourceGameId:p.sourceGameId,officialScheduleGameId:row.officialScheduleGameId||null,
   line:p.line,frozenProjection:p.historicalProjection,
   priorLast5Baseline:p.last5Baseline,
   actual:row.status==="decided"||row.status==="push"?row.actual:null,
   actualSide:row.actualSide||null,
   selectedSideResult:row.selectedSideResult||null,
   projectedMargin:p.historicalProjection-p.line,
   nearLineFivePercentOrOneUnit:Math.abs(p.historicalProjection-p.line)<=
      Math.max(1,.05*Math.abs(p.line)),
   firstGitCommittedAt:firstCommittedAt,
   marketEvidenceResearchOnly:true});
 }
 if(rows.length!==source.size||g.registered!==rows.length||
  g.decided!==overall.decided||g.correct!==overall.correct||
  g.incorrect!==overall.incorrect||g.pushes!==overall.pushes||
  g.pending!==overall.pending||
  g.alwaysHigherOnExactSameSelectedLines!==overall.actualHigher||
  g.alwaysLowerOnExactSameSelectedLines!==overall.actualLower||
  overall.decided!==overall.correct+overall.incorrect)
  throw Error("Model/Higher/Lower same-line aggregates cannot be independently reconciled");
 const toMap=(m,withinMarket)=>Object.fromEntries([...m].sort(([a],[b])=>a.localeCompare(b))
  .map(([k,v])=>[k,finish(v,{withinMarket})]));
 return {kind:KIND,generatedAt:now,sourceGradeAt:grade.generatedAt,
  evidence:"original_first_git_only",firstGitCommits:[...firstCommits].sort(),
  exactRepeatObservationsNotCounted:indexed.exactRepeated,
  overall:finish(overall),byMarket:toMap(byMarket,true),
  byTeam:toMap(byTeam,false),byOriginalSourceGame:toMap(byGame,false),
  statusCounts:status,
  originalDirectionsCanNeverBeRevised:true,oneGameNotGeneralizable:
   overall.independentGameIds.size===1,
  representativeGameLevelSamplingNotPickIndependent:true,
  projectionBiasAcrossMarketsInDifferentUnitsSuppressed:true,
  diagnosedCause:"historical_usage_plus_game_script_opponent_effects_are_hypotheses_not_proven_causes",
  currentGameScoreUsedOnlyForPostgameDiagnosis:true,
  noSelectionRuleChangedUsingPastOutcomes:true,originalPlatformAppOffersVerified:false,
  officialPlatformSettlementsVerified:false,calibratedProbabilities:false,
  payoutEV:null,productionModelPromotionApproved:false,automatedWagers:0,
  // Private only. The public publisher may share summary COUNTS, never rows.
  rows};
}
module.exports={diagnose,KIND};
