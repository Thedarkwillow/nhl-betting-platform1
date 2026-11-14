"use strict";
/**
 * PUBLIC ALLOWLIST: aggregate original-precommit scoring only.
 * No named players/lines, private source rows, internal model parameters or
 * retrospective Higher/Lower choices may be published as prospective hits.
 */
const fs=require("node:fs"),path=require("node:path");
const NHL_KIND="nhl_frozen_same_threshold_baselines_v1";
const NFL_KIND="nfl_private_pregame_evidence_separated_outcome_audit_v1";
const num=(v)=>Number.isInteger(v)&&v>=0;
const rate=(n,d)=>d>0?Number((n/d).toFixed(6)):null;
function validateGroup(x){
 if(!x||!["observedSelected","ungraded","decided","pushes","modelWins",
  "alwaysHigherWins","alwaysLowerWins","distinctGames"].every(k=>num(x[k]))||
  x.observedSelected!==x.ungraded+x.decided+x.pushes||
  x.modelWins>x.decided||
  x.alwaysHigherWins+x.alwaysLowerWins!==x.decided||
  x.distinctGames>x.decided)
  throw Error("NHL precommitted source count mismatch; cannot publish scorecard");
 return x;
}
function group(x){
 validateGroup(x);
 return {frozenSelections:x.observedSelected,decided:x.decided,
  correct:x.modelWins,incorrect:x.decided-x.modelWins,push:x.pushes,pending:x.ungraded,
  distinctGames:x.distinctGames,
  modelObservedRate:rate(x.modelWins,x.decided),
  hypotheticalHigherWins:x.alwaysHigherWins,
  hypotheticalLowerWins:x.alwaysLowerWins,
  hypotheticalHigherRate:rate(x.alwaysHigherWins,x.decided),
  hypotheticalLowerRate:rate(x.alwaysLowerWins,x.decided),
  payoutAdjustedEV:null,calibrated:false,originalPlatformSettlementVerified:false};
}
function tierCounts(h){
 if(!h.goblinHigherOnly&&!h.demonHigherOnly)return null;
 if(!h.goblinHigherOnly||!h.demonHigherOnly)throw Error("Incomplete original special-tier cohort");
 const cohorts=[["Standard",h.standardDirectional],["Goblin",h.goblinHigherOnly],["Demon",h.demonHigherOnly]];
 const total=validateGroup(h.allFrozenSelections);
 for(const [,s] of cohorts)validateGroup(s);
 for(const k of ["observedSelected","ungraded","decided","pushes","modelWins","alwaysHigherWins","alwaysLowerWins"]){
  if(cohorts.reduce((sum,[,v])=>sum+v[k],0)!==total[k])throw Error("Original tier totals do not reconcile");
 }
 if(cohorts.slice(1).some(([,v])=>v.modelWins!==v.alwaysHigherWins||v.lowerModelChoices!==0||v.higherModelChoices!==v.decided))
  throw Error("Original special-tier direction scope not verified");
 return cohorts.map(([tier,v])=>({tier,decided:v.decided,correct:v.modelWins,incorrect:v.decided-v.modelWins,
  pending:v.ungraded,push:v.pushes,distinctGames:v.distinctGames,
  modelObservedRate:rate(v.modelWins,v.decided),frozenSelections:v.observedSelected,
  originalCohortHigherOnly:tier!=="Standard",platformSettlementVerified:false,payoutAdjustedROI:null}));
}
function futureMarkets(x){
 if(!x||typeof x!=="object")return [];
 return Object.entries(x).sort(([a],[b])=>a.localeCompare(b)).map(([market,raw])=>{
  const s=group(raw),measured=s.decided>=10&&s.distinctGames>=3;
  return {market,frozenSelections:s.frozenSelections,decided:s.decided,
   push:s.push,pending:s.pending,distinctGames:s.distinctGames,
   modelCorrect:s.correct,
   modelRate:measured?s.modelObservedRate:null,
   hypotheticalAlwaysHigherRate:measured?s.hypotheticalHigherRate:null,
   hypotheticalAlwaysLowerRate:measured?s.hypotheticalLowerRate:null,
   descriptiveRatesSuppressedForTinyOrCorrelatedSample:!measured,
   successNotEstablished:true};
 });
}
function publicNFLBias(d,fi,originalGradeAt){
 if(!d)return null;
 const a=d.overall;
 if(d.kind!=="nfl_original_frozen_direction_diagnostic_v1"||
    d.evidence!=="original_first_git_only"||
    d.sourceGradeAt!==originalGradeAt||
    d.originalDirectionsCanNeverBeRevised!==true||
    d.officialPlatformSettlementsVerified!==false||
    d.productionModelPromotionApproved!==false||
    !Array.isArray(d.firstGitCommits)||!d.firstGitCommits.length||
    !a||!["registered","decided","correct","incorrect","pushes","pending",
     "higherChosen","higherCorrect","higherWrong","lowerChosen","lowerCorrect","lowerWrong",
     "overForecast","underForecast","exactForecast","actualHigher","actualLower",
     "distinctFinalGames"].every(k=>num(a[k]))||
    a.registered!==fi.registered||a.decided!==fi.decided||
    a.correct!==fi.correct||a.incorrect!==fi.incorrect||
    a.pushes!==fi.pushes||a.pending!==fi.pending||
    a.actualHigher!==fi.alwaysHigherOnExactSameSelectedLines||
    a.actualLower!==fi.alwaysLowerOnExactSameSelectedLines||
    a.distinctFinalGames!==fi.distinctFinalGames||
    a.higherChosen+a.lowerChosen!==a.decided||
    a.higherCorrect+a.lowerCorrect!==a.correct||
    a.higherWrong+a.lowerWrong!==a.incorrect||
    a.overForecast+a.underForecast+a.exactForecast!==a.decided)
  throw Error("Refuse mismatched original first Git NFL Higher bias count evidence");
 return {decided:a.decided,correct:a.correct,
  higherChosen:a.higherChosen,higherCorrect:a.higherCorrect,
  higherWrong:a.higherWrong,
  lowerChosen:a.lowerChosen,lowerCorrect:a.lowerCorrect,
  lowerWrong:a.lowerWrong,
  projectedAboveActual:a.overForecast,
  distinctFinalGames:a.distinctFinalGames,
  sameSelectedLineOnly:true,notAnIndependentNFLGameSample:true,
  diagnosedAfterGameNotAPregameFilter:true,
  platformSettlementsVerified:false,calibrated:false,payoutEV:null};
}
function build(nhl,nfl,triple,{now=new Date().toISOString(),nflDirectionalDiagnostic=null}={}){
 if(nhl?.kind!==NHL_KIND||nhl.evidenceValid!==true||
    nhl.status!=="valid_original_git_precommitted_selection_cohort"||
    nfl?.kind!==NFL_KIND||
    nfl.neverClaimNumericSideAsPreviouslyFrozenHigherLower!==true||
    nfl.nflverseFinalStatsNotPlatformSettlement!==true||
    triple?.kind!=="nhl_standard_three_challengers_git_proven_separate_validation_v1")
  throw Error("Original model outcome scope not proven; not publishing");
 const h=nhl.historicalSameSelectedLines,post=nhl.postPolicySameSelectedLines;
 const fi=nfl.explicitFrozenDirections,nu=nfl.numeric,challenge=triple.actualPrecommitted;
 if(!h?.standardDirectional||!h.allFrozenSelections||
    !post?.standardDirectional||!post?.byStandardMarket||
    fi?.kind!=="nfl_original_git_precommitted_directional_research_grade_v1"||
    nu?.kind!=="nfl_original_pregame_numeric_forecasts_research_scoring_v1"||
    ![fi?.registered,fi?.decided,fi?.correct,fi?.incorrect,fi?.pushes,fi?.pending,
      nu?.registered,nu?.decided,nu?.pushes,nu?.pending].every(num)||
    fi.registered!==fi.correct+fi.incorrect+fi.pushes+fi.pending||
    fi.correct+fi.incorrect!==fi.decided||
    nu.registered!==nu.decided+nu.pushes+nu.pending||
    fi.platformPayoutSettlementsVerified!==false||
    nu.retrospectivelyDerivedSideNotOriginalFrozen!==true||
    !num(challenge?.registered)||!num(challenge?.gradedDecisions)||
    !num(challenge?.pushes)||!num(challenge?.pending)||
    challenge.registered!==challenge.gradedDecisions+challenge.pushes+challenge.pending)
  throw Error("NHL/NFL private frozen grades inconsistent; refusing public update");
 return {schemaVersion:1,kind:"public_nhl_nfl_original_git_frozen_model_scorecards_v1",
  generatedAt:now,
  sources:{nhlOriginalFrozenBaselineAt:nhl.generatedAt||null,
   nflFirstGitForecastAuditAt:nfl.generatedAt||null,
   nhlForwardChallengerAuditAt:triple.generatedAt||null},
  nhl:{
   sport:"NHL",
   allOriginalSelections:group(h.allFrozenSelections),
   standardOriginalSelections:group(h.standardDirectional),
   originalTierCounts:tierCounts(h),
   postPolicyStandardOnly:group(post.standardDirectional),
   postPolicyMarkets:futureMarkets(post.byStandardMarket),
   threeChallengerFuture:{registered:challenge.registered,
    decided:challenge.gradedDecisions,push:challenge.pushes,
    pending:challenge.pending,championPromoted:false},
   source:"NHL official-stat directional outcomes only",
   platformSettlementVerified:false},
  nfl:{
   sport:"NFL",
   explicitlyFrozenDirections:{frozenSelections:fi.registered,
    decided:fi.decided,correct:fi.correct,incorrect:fi.incorrect,
    push:fi.pushes,pending:fi.pending,
    distinctFinalGames:fi.distinctFinalGames||0,
    hypotheticalHigherWins:fi.alwaysHigherOnExactSameSelectedLines,
    hypotheticalLowerWins:fi.alwaysLowerOnExactSameSelectedLines,
    modelObservedRate:rate(fi.correct,fi.decided),
    platformSettlementVerified:false,calibrated:false,
    expectedValue:null},
   frozenHigherBiasAudit:publicNFLBias(nflDirectionalDiagnostic,fi,nfl.generatedAt),
   separateNumericForecasts:{registered:nu.registered,
    decided:nu.decided,push:nu.pushes,pending:nu.pending,
    meanAbsoluteError:Number.isFinite(nu.meanAbsoluteError)?nu.meanAbsoluteError:null,
    retrospectiveDerivedDirectionCannotBeCountedAsFrozen:true,
    modelSelectedHigherLowerHitRate:null},
   source:"nflverse derived regular-season player statistics; NOT platform settlement",
   platformSettlementVerified:false},
  evidenceWarnings:{
   originalGitPrecommitRequired:true,
   retrospectiveSelectionsNotProspective:true,
   rawPropRowsExposed:0,privatePlayerNamesExposed:0,
   standaloneFrozenDirectionNotAPlayableOffer:true,
   sameSelectedLineBaselinesNotFairFullBoardStrategy:true,
   correlatedSelectionsNotIndependentTrials:true,
   calibratedHigherLowerProbabilities:false,
   originalPrizePicksOrUnderdogSettlements:false,
   payoutAdjustedEV:null,automaticBettingRecommendations:false,
   automatedWagersPlaced:0}};
}
function main([privateRoot,publicRoot]=process.argv.slice(2),now=new Date().toISOString()){
 if(!privateRoot||!publicRoot)throw Error("Require private and public checkout paths");
 const read=p=>JSON.parse(fs.readFileSync(path.join(privateRoot,p),"utf8"));
 const data=build(read("outputs/health/nhl-frozen-baseline-challenge-latest.json"),
  read("outputs/nfl/backtests/pregame-forecast-proof-latest.json"),
  read("outputs/health/nhl-standard-triple-challenger-latest.json"),{
   now,
   nflDirectionalDiagnostic:read("outputs/nfl/backtests/frozen-direction-bias-diagnostic-latest.json")
  });
 const target=path.join(publicRoot,"data/model-scorecards.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(data,null,2)+"\n");
 console.log(JSON.stringify({publicSafeStatus:"rebuilt",nhlStandardDecided:data.nhl.standardOriginalSelections.decided,
  nflFrozenDecided:data.nfl.explicitlyFrozenDirections.decided,
  nflNumericDecided:data.nfl.separateNumericForecasts.decided,
  publishedPrivateRows:0}));
 return data;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={build,main,group,futureMarkets,publicNFLBias,tierCounts};
