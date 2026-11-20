"use strict";
/** All allowlisted, aggregate only. The private original model is NEVER read
 * into public JSON. Player names, source line prices and account receipts
 * cannot be copied from the optional private audit reports.
 */
const fs=require("node:fs"),path=require("node:path");
const PUBLIC=process.argv[2]?path.resolve(process.argv[2]):path.resolve(__dirname,"..");
const PRIVATE=process.argv[3]?path.resolve(process.argv[3]):null;
const read=(root,p)=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}catch{return null;}};
const get=p=>read(PUBLIC,"data/"+p);
const priv=p=>PRIVATE?read(PRIVATE,"outputs/health/"+p):null;
const good=x=>Number.isInteger(x)&&x>=0;
const toSummary=o=>{
 const push=o?.push??o?.pushes,pending=o?.pending??o?.unresolvedPerSlate;
 return o&&["registered","decided","correct","incorrect"].every(k=>good(o[k]))&&
 good(push)&&good(pending)&&o.decided===o.correct+o.incorrect&&
 o.registered===o.decided+push+pending?
 {registered:o.registered,decided:o.decided,correct:o.correct,incorrect:o.incorrect,
  push,pending,rate:o.decided?o.correct/o.decided:null}:null;
};
const rate=x=>typeof x==="number"&&x>=0&&x<=1?x:null;
function build(){
 const scores=get("model-scorecards.json"),
  health=get("collection-health.json"),freeze=get("nhl-nfl-freeze-status.json"),
  progress=get("research-evidence-progress.json"),
  next=priv("six-priority-future-evidence-latest.json"),
  platform=priv("platform-quote-settlement-readiness-latest.json");
 const dir=path.join(PUBLIC,"data"),
  files=fs.readdirSync(dir).filter(x=>/^daily-grade-\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort().reverse();
 const daily=files.map(n=>get(n)).find(d=>d?.kind==="public_original_daily_grade_v1"&&
   d.nhl?.status==="official_final_slate_graded"&&d.nhl?.finalGames===d.nhl?.scheduledGames&&
   d.nhl?.scheduledGames>0&&d.platformSettlementVerified===false);
 const dailyTier=daily?.nhl?.byTier||{};
 const tierNames=["Standard","Goblin","Demon"];
 if(!daily||!tierNames.every(t=>toSummary(dailyTier[t]))||
   !toSummary(daily.nhl.all)||!toSummary(daily.nfl))throw Error("No validated daily NHL/NFL original grade");
 const cumulative=scores?.kind==="public_nhl_nfl_original_git_frozen_model_scorecards_v1"?
 scores.nhl?.originalTierCounts:[];
 const cumulativeByTier=Object.fromEntries(tierNames.map(t=>{
  const r=cumulative?.find(x=>x.tier===t);
  return [t,r&&good(r.decided)&&good(r.correct)&&good(r.incorrect)&&
   r.correct+r.incorrect===r.decided&&r.platformSettlementVerified===false?
   {decided:r.decided,correct:r.correct,incorrect:r.incorrect,rate:r.decided?r.correct/r.decided:null,
    distinctGames:good(r.distinctGames)?r.distinctGames:null,
    originalCohortHigherOnly:r.originalCohortHigherOnly===true}:null];
 }));
 const sourceSlots={};
 for(const slot of ["06:00","09:00"]){
  const x=health?.slots?.[slot]||{};
  sourceSlots[slot]={status:x.status||"not_verified",
   observedAt:typeof x.observedAt==="string"?x.observedAt:null,
   nhlOffers:good(x.nhlOffers)?x.nhlOffers:null,
   nflOffers:good(x.nflOffers)?x.nflOffers:null,
   complete:x.status==="privately_archived_complete"&&good(x.nhlOffers)&&x.nhlOffers>0&&
     good(x.nflOffers)&&x.nflOffers>0};
 }
 const standardMarkets=Object.fromEntries(Object.entries(daily.nhl.standardByMarket||{})
  .filter(([,v])=>!!toSummary(v)).map(([m,v])=>[m,toSummary(v)]));
 const total=toSummary(daily.nhl.all);
 const finalStatsNfl=toSummary(daily.nfl);
 const newEvidence=next?.kind==="nhl_nfl_first_git_market_challenger_future_scorecard_v1"&&
   next.modelPromoted===false&&next.originalPlatformSettlementsVerified===false?next:null;
 const p=platform?.kind==="private_prizepicks_underdog_platform_proof_funnel_v1"&&
   platform.payoutAdjustedEV===null?platform:null;
 return {schemaVersion:1,kind:"public_six_priority_accuracy_platform_evidence_desk_v1",
  generatedAt:process.env.ACCURACY_EVIDENCE_FIXED_AT||new Date().toISOString(),
  lastOfficialSlateDate:daily.slateDate,lastOfficialGradePublishedAt:daily.generatedAt,
  cumulativeNhlTiers:cumulativeByTier,
  dailyNhl:{games:daily.nhl.finalGames,all:total,
    tiers:Object.fromEntries(tierNames.map(t=>[t,toSummary(dailyTier[t])])),
    standardMarkets,
    standardSameLineBaseline:{
     decided:dailyTier.Standard.decided,model:dailyTier.Standard.hitRate,
     alwaysHigher:rate(dailyTier.Standard.alwaysHigher),
     alwaysLower:rate(dailyTier.Standard.alwaysLower)},
    confirmedNoAppearance:good(daily.nhl.nonappearanceReconciliation?.externallyConfirmedNonappearances)?
     daily.nhl.nonappearanceReconciliation.externallyConfirmedNonappearances:null,
    outstandingAppearanceReconciliation:good(daily.nhl.nonappearanceReconciliation?.remainingUnresolvedOfficialAppearances)?
     daily.nhl.nonappearanceReconciliation.remainingUnresolvedOfficialAppearances:null,
    originalPendingImmutable:daily.nhl.all.pending,
    originalOfficialStatsNotPlatformSettlements:true},
  dailyNfl:{games:daily.nfl.finalGames,all:finalStatsNfl,
    sameLineBaseline:{model:rate(daily.nfl.hitRate),
     alwaysHigher:rate(daily.nfl.alwaysHigher),
     alwaysLower:rate(daily.nfl.alwaysLower)},
    firstDistinctThreshold:daily.nfl.firstDistinctThreshold?{
     ...toSummary(daily.nfl.firstDistinctThreshold),
     alwaysHigher:rate(daily.nfl.firstDistinctThreshold.alwaysHigher),
     alwaysLower:rate(daily.nfl.firstDistinctThreshold.alwaysLower)}:null,
    researchOnly:true},
  newProspectiveTrial:{
   policyFrom:"2026-11-21T00:00:00Z",
   reported:newEvidence!==null,
   nhlDecided:good(newEvidence?.nhl?.all?.decided)?newEvidence.nhl.all.decided:0,
   nhlDistinctGames:good(newEvidence?.nhl?.all?.distinctGames)?newEvidence.nhl.all.distinctGames:0,
   nhlDistinctDates:good(newEvidence?.nhl?.all?.distinctPacificDates)?newEvidence.nhl.all.distinctPacificDates:0,
   nflDecided:good(newEvidence?.nfl?.all?.decided)?newEvidence.nfl.all.decided:0,
   nflDistinctGames:good(newEvidence?.nfl?.all?.distinctGames)?newEvidence.nfl.all.distinctGames:0,
   independentlyBetterThanSimpleStrategies:false,calibrated:false,
   modelPromoted:false},
  collection:{
   pacificDate:health?.pacificDate||null,slots:sourceSlots,
   firstGitFreezeVerified:freeze?.firstGitAdditionVerified===true&&
     freeze?.originalModelDirectionsBeforeKickoff===true,
   firstGitCapturedNhl:good(freeze?.capturedOffers?.NHL)?freeze.capturedOffers.NHL:null,
   firstGitCapturedNfl:good(freeze?.capturedOffers?.NFL)?freeze.capturedOffers.NFL:null,
   comparableSixNineDeltaVerified:health?.sixToNineChangesVerified===true,
   originalPrizePicksAppQuoteVerified:false,
   note:"A successful workflow is not proof that each Pacific 6 AM/9 AM original source board was captured."},
  providerProof:{
   originalSourceFirstGitNotAppAttestation:true,
   exactSportsbookSameThresholdMatches:good(progress?.sportsbook?.strictMatched)?progress.sportsbook.strictMatched:0,
   authenticatedOriginalAppOffers:good(p?.liveExactVerifiedAppMatches)?p.liveExactVerifiedAppMatches:0,
   authenticatedSpecificEntryPayouts:good(p?.currentEntryPayoutsVerified)?p.currentEntryPayoutsVerified:0,
   authenticatedFinalSettlements:good(p?.finalPlatformSettlementsVerified)?p.finalPlatformSettlementsVerified:0,
   verifiedROI:null,authenticatedPayoutEV:null,
   officialReferencePages:{
    prizePicksPayouts:"https://www.prizepicks.com/help-center/payouts",
    prizePicksDnp:"https://www.prizepicks.com/help-center/dnps-reboots-and-ties",
    underdogStandardFlex:"https://help.underdogsports.com/en/articles/13780101-pick-em-standard-flex-entry-payouts",
    underdogVoids:"https://help.underdogsports.com/en/articles/13161362-pick-em-flex-flexed-payouts"},
   note:"Official public schedules describe base payouts, not actual captured player-specific multipliers or authenticated entry/settlement receipts."},
  uncalibratedPercentagesNotApproved:true,automaticWagers:0,
  privatePlayerRowsExposed:0,noActualPlatformSettlementClaim:true};
}
function main(){
 const out=build(),file=path.join(PUBLIC,"data/accuracy-platform-evidence.json");
 const current=read(PUBLIC,"data/accuracy-platform-evidence.json");
 if(!current||JSON.stringify((({generatedAt,...v})=>v)(current))!==
     JSON.stringify((({generatedAt,...v})=>v)(out)))
  fs.writeFileSync(file,JSON.stringify(out,null,2)+"\n");
 console.log(JSON.stringify({path:file,slate:out.lastOfficialSlateDate,
  nhlDecided:out.dailyNhl.all.decided,
  futureNhl:out.newProspectiveTrial.nhlDecided,
  authenticatedPlatformOffers:out.providerProof.authenticatedOriginalAppOffers,
  autoPicks:0}));
 return out;
}
if(require.main===module)try{main()}catch(e){console.error(e.stack);process.exitCode=1;}
module.exports={build,main,toSummary};
