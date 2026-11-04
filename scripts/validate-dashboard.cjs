"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
assert.match(html,/href="\.\/assets\/dashboard\.css"/,"MLB-inspired local dashboard stylesheet required");
const css=fs.readFileSync(path.resolve(__dirname,"../assets/dashboard.css"),"utf8");
assert.match(css,/\.featured-grid/,"Primary standalone prop cards must have responsive styling");
assert.match(css,/@media\(max-width:680px\)/,"NHL mobile prop-card presentation required");
assert.match(css,/\.board-mode/, "Mobile archived research mode must be styled");
for(const id of ["today","slips","results","research","researchDrawer","featuredProps"])
 assert.ok(html.includes('id="'+id+'"'),"Missing user-first NHL dashboard section "+id);
const order=["id=\"today\"","id=\"slips\"","id=\"results\"","id=\"research\""];
assert.ok(order.every((x,i)=>i===0||html.indexOf(order[i-1])<html.indexOf(x)),
 "Props, lineups, results, and research must remain in that order");
const found=html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(found,"NHL page must contain an inline dashboard script");
new vm.Script(found[1],{filename:"nhl-public-dashboard.inline.js"});
assert.match(html,/id="boardMode"/,"Research board must expose a current-versus-archive switch");
assert.match(html,/id="boardNotice"/,"Freshness gate must explain empty current board");
const ids=["prospectiveAudit","standardAlternateAudit","modelEvidence","modelComparison","countDistributionLab","roleReadiness","evidence","lineupStatus","lineupPicks",
 "matchupSources","approvedResearchLab","approvedSourceGrading","matchupDetails","props","comparisons","freshness","updated"];
for(const id of ids)assert.ok(html.includes('id="'+id+'"'),"Missing required accessible dashboard region: "+id);
for(const fn of ["renderFeatured","renderProspectiveQuality","renderStandardAlternateAudit","renderModelEvidence","renderModelComparison","renderCountDistributionResearch","renderRoleReadiness","renderMatchupSources","renderApprovedResearchLab","renderApprovedSourceGrading","renderMatchupDetail","researchIsFresh"])
 assert.ok(found[1].includes("function "+fn+"("),"Missing essential data/status renderer "+fn);
assert.match(found[1],/if\(!researchIsFresh\(\)\|\|!currentBoardIsFresh\(\)/,"Stale or unverified current-board lineups must fail closed");
assert.match(found[1],/function currentBoardIsFresh\(/,"30-minute live-age gate is required");
assert.match(found[1],/function isCurrentOffer\(/,"Per-offer pregame source age must be checked");
assert.match(found[1],/archiveMode\|\|isCurrentOffer\(p\)/,"Current props must exclude expired offers");
assert.match(found[1],/original|unverified|Uncalibrated|uncalibrated/i);
assert.match(found[1],/model_market_disagreement/,"Must display opposing sportsbook market signal");
assert.match(found[1],/STARTING_GOALIE_NOT_CONFIRMED/,"Unconfirmed goalie starters must be visibly flagged");
assert.match(found[1],/EXTERNAL_INJURY_OUT_OR_IR_REPORT/,"Source-reported injury OUT must be visible and watchlisted");
assert.match(found[1],/reported_confirmed/,"ESPN confirmation label must remain source-attributed");
assert.match(found[1],/externalFeedFreshAtBuild/,"NHL pregame intel must show freshness guard");
assert.match(found[1],/qualityFlags/,"Matchup research must display unavailable-data flags");
assert.match(found[1],/MoneyPuck/,"Noncommercial MoneyPuck data may not be claimed as imported");
assert.match(found[1],/new Date|toFixed/,"Matchup numeric context should be formatted, not trusted as web odds");
assert.match(found[1],/prospective|retrospective/i,"Must distinguish historic from prospective model evidence");
const raw=path.resolve(__dirname,"../data.json");
if(fs.existsSync(raw)){
 const data=JSON.parse(fs.readFileSync(raw,"utf8"));
 assert.ok(data&&typeof data==="object","Dashboard JSON required");
 if(data.prospectiveResearchAudit){
  const p=data.prospectiveResearchAudit;
  assert.equal(p.calibrationApproved,false);
  assert.equal(p.originalPlatformSettlementVerified,false);
  assert.equal(p.statisticalEdgeVerified,false);
  if(p.gradedDecisions===0)assert.equal(p.verifiedProspectiveHitRate,null);
 }
 if(data.roleContextAudit){
  assert.equal(data.roleContextAudit.independentTeamStarterConfirmationVerified??false,false);
  assert.equal(data.roleContextAudit.externalCommercialLicenseVerified??false,false);
  assert.equal(data.roleContextAudit.lineCombinationAndPowerPlayVerified??false,false);
  assert.equal(data.roleContextAudit.pregameGoalieStartersConfirmed,false);
  assert.equal(data.roleContextAudit.pregameInjuriesVerified,false);
  assert.ok(data.roleContextAudit.withOfficialTOI>=0);
 }
 if(data.approvedSourceScorecard){
  assert.equal(data.approvedSourceScorecard.modelPromoted,false);
  assert.equal(data.approvedSourceScorecard.calibrationVerified,false);
  assert.equal(data.approvedSourceScorecard.originalPlatformOfferAuthenticated,false);
  assert.equal(data.approvedSourceScorecard.platformSettlementVerified,false);
  assert.ok(data.approvedSourceScorecard.verifiedOfficialFinalDecisions>=0);
  assert.ok(data.approvedSourceScorecard.pendingRows>=0);
 }
 if(data.approvedSourceResearch){
  assert.equal(data.approvedSourceResearch.shotQualityProbabilitiesDeployed,false);
  assert.equal(data.approvedSourceResearch.writtenCommercialTermsVerified,false);
  assert.equal(data.approvedSourceResearch.prospectiveModelAccuracyEstablished,false);
  assert.equal(data.approvedSourceResearch.originalExactPlatformSettlementVerified,false);
  assert.ok(data.approvedSourceResearch.shadowCandidateRows>=0);
 }
 if(data.matchupResearch){
  assert.equal(data.matchupResearch.sources?.length,5);
  assert.equal(data.matchupResearch.thirdPartyDataAccessAuthorized,false);
  assert.equal(data.matchupResearch.noNewModelAdjustment,true);
  for(const s of data.matchupResearch.sources)assert.equal(s.commercialDataLicenseVerified,false);
  for(const p of data.props){assert.equal(p.matchupScout?.modelProbabilityAdjusted,false);
   assert.equal(p.matchupScout?.verifiedEdge,false);
   assert.equal(p.matchupScout?.moneyPuckDataIncluded,false);}
 }
 if(data.evidenceSummary){
  assert.equal(data.evidenceSummary.verifiedBettingPicks,0);
  assert.ok(Array.isArray(data.props));
  for(const row of data.props){assert.equal(row.evidence?.readyForBetting,false);
   assert.equal(row.evidence?.probabilityCalibrated,false);}
 }
 if(data.distributionResearch){
  assert.equal(data.distributionResearch.modelPromoted,false);
  assert.equal(data.distributionResearch.prospectiveVerified,false);
  assert.equal(data.distributionResearch.probabilityCalibrated,false);
  assert.equal(data.distributionResearch.actualPlatformSettlementVerified,false);
  assert.ok(data.distributionResearch.sourceMatchedQuoteRows>=0);
  if(data.distributionResearch.overall?.fixedHalfBrier!=null)
   assert.equal(data.distributionResearch.overall.fixedHalfBrier,0.25);
 }
 if(data.distributionProspectiveArchiveAudit){
  assert.ok(data.distributionProspectiveArchiveAudit.gitAndOfficialStartMatchedRows>=0);
  assert.equal(data.distributionProspectiveArchiveAudit.officialResultsGraded,false);
  assert.equal(data.distributionProspectiveArchiveAudit.independentlyAuthenticatedOriginalPlatformOffers,false);
  assert.equal(data.distributionProspectiveArchiveAudit.verifiedOriginalPrizePicksSettlement,false);
 }
 if(data.distributionShadowArchive){
  assert.equal(data.distributionShadowArchive.gitCommitBeforePuckDropProven,false);
  assert.equal(data.distributionShadowArchive.originalPlatformSettlementVerified,false);
  assert.equal(data.distributionShadowArchive.liveLineupsAffected,false);
 }
 if(data.historicalModelResearch){assert.equal(data.historicalModelResearch.alternativePromoted,false);
  assert.equal(data.historicalModelResearch.prospectiveModelAccuracyVerified,false);}
 if(data.historicalStandardAlternateResearch){
  const q=data.historicalStandardAlternateResearch;
  assert.equal(q.originalTierVerified,false);
  assert.equal(q.originalPayoutVerified,false);
 }
}
console.log("NHL public page JavaScript, expected UI sections and stale/research evidence guards pass");
