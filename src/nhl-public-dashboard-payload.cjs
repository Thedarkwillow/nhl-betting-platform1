"use strict";
/**
 * PUBLIC allowlist: proprietary NHL modeling and research remain private.
 * This file controls exactly what the unauthenticated GitHub Pages
 * data.json may disclose. Never copy backend reports wholesale.
 * Keep accuracy, estimated-probability and provider-freshness caveats.
 */
const {buildMovementSummary,buildResultBreakdown,sanitizePlatformResearch}=require("./nhl-public-research-extensions.cjs");
const {buildPublicProspectiveCohort}=require("./nhl-public-prospective-cohort.cjs");
const {guardNhlPublicClaim}=require("./nhl-offer-claim-guard.cjs");
const {buildSixPriorityBrief}=require("./nhl-six-priority-evidence-brief.cjs");
const {publicEvidenceLabels,publicResponsibleResearch}=require("./nhl-public-evidence-labels.cjs");
const {publicBrief}=require("./nhl-prospective-validation.cjs");
function publicNhlCollectionCoverage(source,at){
 const valid=x=>Number.isInteger(x)&&x>=0;
 const stamp=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
 const basic={kind:"nhl_independent_archive_coverage_public_v1",
  status:"no_verified_archived_official_game_coverage",archiveAt:null,
  sourceFreshForLiveDisplay:false,officialGamesInWindow:null,
  officialGamesWithObservedOffers:null,observedOfficialGameShare:null,
  matchedSideRows:null,observationWindowHours:48,
  originalPlatformBoardCoverageVerified:false,source:"Independent third-party NHL research observations"};
 if(source?.kind!=="private_nhl_independent_source_coverage_v1"||
  !valid(source.officialGamesInWindow)||!valid(source.officialGamesWithObservedOffers)||
  source.officialGamesWithObservedOffers>source.officialGamesInWindow||
  !valid(source.matchedEligibleSideRows)||source.expectedWindowHours!==48||
  source.sourceCompletePagination!==true||
  stamp(source.boardCapturedAt)===null)return basic;
 const now=stamp(at),captured=stamp(source.boardCapturedAt),
  age=now===null?Infinity:(now-captured)/60000;
 const fresh=age>=0&&age<=30&&source.sourceFreshForLiveUse===true;
 return {...basic,status:"archived_independent_pagination_verified",
  archiveAt:source.boardCapturedAt,
  sourceFreshForLiveDisplay:fresh,
  officialGamesInWindow:source.officialGamesInWindow,
  officialGamesWithObservedOffers:source.officialGamesWithObservedOffers,
  observedOfficialGameShare:source.officialGamesInWindow?
   Number((source.officialGamesWithObservedOffers/source.officialGamesInWindow).toFixed(4)):null,
  matchedSideRows:source.matchedEligibleSideRows};
}

function publicNhlSevenReadiness(privateAudit){
 const empty={kind:"public_nhl_seven_workstream_brief_v1",
  status:"source_evidence_not_available",sourceCapturedAt:null,
  sourcePaginationComplete:false,sourceOfferedSideRows:0,
  prospectiveRegistered:0,prospectiveDecided:0,prospectivePending:0,
  prospectivePushes:0,descriptiveWilson95:null,
  modelValidation:"not_calibrated",lineupJointProbabilityVerified:false,
  lineupsWithSameGameOverlap:0,goalieSideRowsNeedReview:0,
  originalClubStarterVerified:false,
  underdogStatus:"underdog_current_comparison_unavailable",
  sourceFreshUnderdogMatches:0,newlyObservedIndependentQuotes:0,
  unverifiedNotSeenQuotes:0,originalPlatformRemovalsVerified:false,
  originalPlatformAvailabilityVerified:false,originalPlatformSettlementsVerified:false,
  expectedValueVerified:false};
 if(privateAudit?.kind!=="private_nhl_seven_workstream_readiness_v1")return empty;
 const o=privateAudit.operations||{},g=privateAudit.grading||{},
  l=privateAudit.lineups||{},goal=privateAudit.goalie||{},
  p=privateAudit.crossPlatform||{},life=privateAudit.lifecycle||{};
 const status=["fresh_independent_archive","archived_not_current",
  "incomplete_or_unverified_source","missing_archive"].includes(o.status)?
  o.status:"source_evidence_not_available";
 const statsVerified=g.originalPrecommittedRegistryVerified===true;
 const validInt=x=>Number.isInteger(x)&&x>=0?x:0;
 const interval=statsVerified&&g.wilson95&&
  Number.isFinite(g.wilson95.lower)&&Number.isFinite(g.wilson95.upper)&&
  g.wilson95.lower>=0&&g.wilson95.upper<=1?
  {lower:g.wilson95.lower,upper:g.wilson95.upper}:null;
 return {...empty,status,
  sourceCapturedAt:typeof o.sourceCapturedAt==="string"&&
   Number.isFinite(Date.parse(o.sourceCapturedAt))?o.sourceCapturedAt:null,
  sourcePaginationComplete:o.completePagination===true,
  sourceOfferedSideRows:validInt(o.offeredSideRows),
  prospectiveRegistered:statsVerified?validInt(g.registered):0,
  prospectiveDecided:statsVerified?validInt(g.decided):0,
  prospectivePending:statsVerified?validInt(g.pending):0,
  prospectivePushes:statsVerified?validInt(g.pushes):0,
  descriptiveWilson95:interval,
  lineupsWithSameGameOverlap:validInt(l.riskCount?.elevated),
  goalieSideRowsNeedReview:validInt(goal.goalieNeedsReview),
  underdogStatus:p.status==="fresh_authorized_derived_comparisons"?
   "fresh_authorized_derived_comparisons":"underdog_current_comparison_unavailable",
  sourceFreshUnderdogMatches:p.status==="fresh_authorized_derived_comparisons"?
   validInt(p.matchedStandardSides):0,
  newlyObservedIndependentQuotes:validInt(life.newlyObserved),
  unverifiedNotSeenQuotes:validInt(life.notSeenInNewFeedUnverified)
 };
}
const number=x=>typeof x==="number"&&Number.isFinite(x)?x:null;
const text=x=>typeof x==="string"?x.slice(0,240):null;
const bool=x=>x===true;
function prop(p){
 return {
  player:text(p?.player),team:text(p?.team),market:text(p?.market),
  line:number(p?.line),tier:guardNhlPublicClaim({tier:p?.tier}).tier,
  tierEvidence:"independent_provider_only",
  lean:text(p?.lean),
  probability:number(p?.probability),observations:number(p?.observations),
  matchup:text(p?.matchup),capturedAt:text(p?.capturedAt),
  eventStartsAt:text(p?.eventStartsAt),
  researchEligibility:p?.researchEligibility==="watchlist"?"watchlist":"research_only",
  roleWarning:p?.researchEligibility==="watchlist"?"Availability or role unverified":null
 };
}
const list=a=>Array.isArray(a)?a:[];
function sanitizePublicDashboard(d){
 if(!d||typeof d!=="object"||!Array.isArray(d.props))
  throw Error("Valid private NHL research export required");
 const audit=d.prospectiveResearchAudit||{};
 const cohort=buildPublicProspectiveCohort(d.originalPrecommitLedger);
 const approvedCohort=cohort.cohortVerified===true&&
  Number.isInteger(audit.eligiblePregamePredictions)&&
  cohort.counts.registered===audit.eligiblePregamePredictions&&
  cohort.counts.pending===audit.selectedIndividualPending&&
  cohort.counts.correct===audit.prospectiveCorrect&&
  cohort.counts.push===audit.prospectivePushes&&
  cohort.decided===audit.gradedDecisions;
 const publicCohort=approvedCohort?cohort:buildPublicProspectiveCohort(null);

 const decided=audit.gradedDecisions??d.grading?.decisions??0;
 const graded=audit.selectedOfficialStatsGraded??d.grading?.graded??0;
 const hit=approvedCohort&&decided>=10?
  number(audit.verifiedProspectiveHitRate):null;
 const present=list(d.featuredIndividualProps).map(p=>({
  ...prop({...p,capturedAt:p.sourceCapturedAt}),
  modelProbabilityCalibrated:false,expectedValue:null
 }));
 const lineups={};
 for(const n of [2,3,4,5,6]){
  const source=d.lineups?.[n];
  lineups[n]=source?.picks?.length===n?{
   status:"research_only",picks:source.picks.map(prop),
   distinctGames:number(source.distinctGames),
   correlationRisk:source.correlationRisk==="elevated_same_game"?"elevated_same_game":"same_game_excluded",
   payoutQuoteVerified:false,probability:null,expectedValue:null
  }:null;
 }
 // Preview entries are independent provider research estimates, NOT
 // precommitted prospective model picks. They must never inflate the
 // official verified pregame selected cohort or return metrics.
 const previewAllowed=d.liveResearchOrigin==="independent_nonprecommitted_model_preview"&&
  d.researchFreshAtBuild===true&&d.boardCoverage?.apiPaginationComplete===true;
 const previewProps=previewAllowed?list(d.previewResearchProps).slice(0,8).map(prop):[];
 const freshProps=list(d.props).map(prop);
 const comparisons=list(d.comparisons).map(c=>({
  player:text(c.player),market:text(c.market),line:number(c.line),tier:text(c.tier),
  modelHigher:number(c.modelHigher),sportsbookHigher:number(c.sportsbookHigher),
  books:list(c.books).filter(x=>typeof x==="string").slice(0,5).map(text)
 }));
 return {
  schemaVersion:2,kind:"public_nhl_research_cards_not_internal_model",
  evidenceLegend:publicEvidenceLabels(),
  responsibleResearch:publicResponsibleResearch(),
  builtAt:text(d.builtAt),researchAt:text(d.researchAt),
  boardAt:text(d.boardAt),comparisonAt:text(d.comparisonAt),
  // Coverage and freshness are essential for honest offer labelling.
  researchFreshAtBuild:bool(d.researchFreshAtBuild),
  boardCoverageComplete:bool(d.boardCoverageComplete),
  boardCoverage:{apiPaginationComplete:bool(d.boardCoverage?.apiPaginationComplete)},
  dataProvider:"Independent third-party research data; original platform availability unverified",
  props:freshProps,comparisons,lineups,
  previewResearchProps:previewProps,
  previewResearchOnly:previewAllowed,
  previewSelectionsOfficiallyPrecommitted:false,
  playerInsights:list(d.playerInsights).filter(x=>x&&x.source==="Official NHL completed-game statistics"&&
   x.futureGameStatsExcluded===true&&typeof x.player==="string"&&
   typeof x.team==="string"&&typeof x.market==="string"&&
   Number.isInteger(x.historicalGames)&&x.historicalGames>0)
   .slice(0,600).map(x=>({player:text(x.player),team:text(x.team),market:text(x.market),
    last5:number(x.last5),last10:number(x.last10),last20:number(x.last20),
    seasonAverage:number(x.seasonAverage),historicalGames:x.historicalGames,
    seasonGames:Number.isInteger(x.seasonGames)?x.seasonGames:0,
    lastGameDate:text(x.lastGameDate),recentOfficialValues:list(x.recentOfficialValues).filter(v=>v&&typeof v.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(v.date)&&v.date<=x.lastGameDate&&Number.isFinite(v.value)&&v.value>=0).slice(-20).map(v=>({date:v.date,value:v.value})),source:"Official NHL completed-game statistics"})),
  sixPriorityBrief:buildSixPriorityBrief({
    at:typeof d.builtAt==="string"&&Number.isFinite(Date.parse(d.builtAt))?
      d.builtAt:new Date(0).toISOString(),
    board:d.sixPriorityPrivateInputs?.board,
    morningAudit:d.sixPriorityPrivateInputs?.morningAudit,
    movement:d.lineMovement,
    officialCoverage:d.sixPriorityPrivateInputs?.officialCoverage,
    walkforward:d.sixPriorityPrivateInputs?.walkforward,
    baselineChallenge:d.sixPriorityPrivateInputs?.baselineChallenge,
    simpleChallenger:d.sixPriorityPrivateInputs?.simpleChallenger,
    publicProps:freshProps,cohort:publicCohort,lineups
  }),
  movementSummary:buildMovementSummary(d.lineMovement),
  researchQuality:publicNhlSevenReadiness(d.researchIntelligence),
  // Private registry and raw provider rows are deliberately excluded here.
  prospectiveCohort:publicCohort,
  probabilityValidation:publicBrief(d.privateProbabilityValidation),
  collectionCoverage:publicNhlCollectionCoverage(d.sourceCoverageAudit,d.builtAt),
  platformResearch:sanitizePlatformResearch(d.platformLineShopping),
  resultBreakdown:buildResultBreakdown(audit),
  featuredIndividualProps:present,
  featuredPropsSourceFresh:bool(d.featuredPropsSourceFresh),
  performance:{
   gradedProspectivePicks:Number.isInteger(graded)&&graded>=0?graded:0,
   decidedProspectivePicks:Number.isInteger(decided)&&decided>=0?decided:0,
   verifiedProspectiveHitRate:hit,
   pendingProspectivePicks:Number.isInteger(audit.selectedIndividualPending)?audit.selectedIndividualPending:0,
   correctProspectivePicks:Number.isInteger(audit?.prospectiveCorrect)?audit.prospectiveCorrect:0,
   pushedProspectivePicks:Number.isInteger(audit?.prospectivePushes)?audit.prospectivePushes:0,
   originalPlatformSettlementVerified:false,
   payoutAdjustedReturnVerified:false,
   modelCalibrated:false
  },
  disclaimer:"Research only. Probabilities are estimates, not verified historical hit rates or guaranteed outcomes. Exact platform availability, settlement and payout-adjusted returns are unverified. No wager recommendation."
 };
}
module.exports={sanitizePublicDashboard,publicNhlSevenReadiness};
