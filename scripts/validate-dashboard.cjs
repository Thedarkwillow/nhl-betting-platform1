"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
const found=html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(found,"NHL page must contain an inline dashboard script");
new vm.Script(found[1],{filename:"nhl-public-dashboard.inline.js"});
const ids=["prospectiveAudit","standardAlternateAudit","modelEvidence","modelComparison","countDistributionLab","roleReadiness","evidence","lineupStatus","lineupPicks",
 "matchupSources","matchupDetails","props","comparisons","freshness","updated"];
for(const id of ids)assert.ok(html.includes('id="'+id+'"'),"Missing required accessible dashboard region: "+id);
for(const fn of ["renderProspectiveQuality","renderStandardAlternateAudit","renderModelEvidence","renderModelComparison","renderCountDistributionResearch","renderRoleReadiness","renderMatchupSources","renderMatchupDetail","researchIsFresh"])
 assert.ok(found[1].includes("function "+fn+"("),"Missing essential data/status renderer "+fn);
assert.match(found[1],/if\(!researchIsFresh\(\)\)/,"Stale lineups must fail closed");
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
