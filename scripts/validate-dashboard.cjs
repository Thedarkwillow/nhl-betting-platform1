"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),
 assert=require("node:assert/strict");
const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
const css=fs.readFileSync(path.resolve(__dirname,"../assets/dashboard.css"),"utf8");
const workspace=fs.readFileSync(path.resolve(__dirname,"../assets/lineup-workspace.js"),"utf8");
new vm.Script(workspace,{filename:"lineup-workspace.js"});
assert.match(html,/<script src="\.\/assets\/lineup-workspace\.js"><\/script>/,"Public builder module must load");
const statusJs=fs.readFileSync(path.resolve(__dirname,"../assets/research-status.js"),"utf8");
new vm.Script(statusJs,{filename:"research-status.js"});
assert.match(html,/<script src="\.\/assets\/research-status\.js"><\/script>/,"Public source-quality module must load");
assert.match(css,/\.quality-grid/,"Responsive seven-area evidence layout must exist");
assert.match(css,/\.quality-card/,"Source-quality cards must have accessible styling");

const data=JSON.parse(fs.readFileSync(path.resolve(__dirname,"../data.json"),"utf8"));
assert.match(html,/href="\.\/assets\/dashboard\.css"/,"NHL dashboard stylesheet missing");
assert.match(css,/\.featured-grid/);
assert.match(css,/@media\(max-width:680px\)/,"Mobile NHL prop cards required");
assert.match(css,/\.board-mode/,"Historical vs fresh data mode required");
assert.match(html,/aria-label="Filter by NHL game"/,"Game filter must be accessible");
assert.match(html,/aria-label="Sort player prop research"/,"Sorting must be accessible");
for(const id of ["today","slips","results","featuredProps","boardMode","boardNotice",
 "props","lineupPicks","lineupStatus","prospectiveAudit","freshness","comparisons",
 "gameFilter","sortProps","teamFilter","minEstimate","minHistory","eligibilityFilter",
 "saveResearchView","restoreResearchView","resetResearchView","researchViewStatus",
 "rebuildLineup","resetLineup","lineupSwapPanel",
 "lineupSwapOption","applyLineupSwap","cancelLineupSwap","lineupDetails",
 "saveLineupDraft","restoreLineupDraft","clearLineupDraft","lineupFeedback",
 "playerResearch","playerDetail","movementResearch","movementSummary","underdogResearch",
 "underdogStatus","underdogMatches","resultBreakdown","lineupDependencyNote",
 "collectionCoverageDrawer","collectionCoverageStatus","cohortAuditDrawer",
 "cohortAuditPanel","cohortAuditTable","cohortGroupBy","researchHealth",
 "researchQualityCards","researchQualityNotes","researchQualityDetails"])
 assert.ok(html.includes('id="'+id+'"'),"Missing customer-facing element "+id);
assert.ok(html.indexOf('id="today"')<html.indexOf('id="slips"')&&
 html.indexOf('id="slips"')<html.indexOf('id="results"'),
 "Customer layout must prioritize top props, lineup builder and results");
const match=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match,"NHL dashboard script missing");
new vm.Script(match[1],{filename:"nhl-public-site.js"});
for(const fn of ["currentBoardIsFresh","isCurrentOffer","renderFeatured",
 "render","renderLineup","renderResults","renderComparisons","showPlayerDetail",
 "renderSourceMovements","renderUnderdogResearch","renderResultBreakdown",
 "renderOriginalCohort","renderCollectionCoverage","renderResearchQuality"])
 assert.ok(match[1].includes("function "+fn+"("),"Missing safe public renderer "+fn);
assert.match(html,/probabilities are estimates/i,"Probability caveat required");
assert.match(html,/unverified/i,"Original platform terms and payout caveat required");
assert.match(match[1],/now-captured<=30\*60000/,"Current prop age must be limited");
assert.match(match[1],/Number\.isFinite\(start\)&&start>now/,"Puck drop guard required");
assert.match(match[1],/slip\.picks\.every\(isCurrentOffer\)/,"Lineups must fail closed");
assert.match(match[1],/workspace\.validComplete/,"Edited lineups must preserve player/game limits");
assert.match(match[1],/workspace\.swapOptions/,"Swaps must be validated before display");
assert.match(match[1],/workspace\.addSelection/,"Board action must be validated by research-only workspace");
assert.match(match[1],/workspace\.restoreDraft/,"Saved drafts must pass source and age validation");
assert.match(match[1],/currentBoardIsFresh\(\)/,"Fresh board required before lineup edits");
assert.match(match[1],/function saveResearchView\(/,"Local-only filter persistence required");
assert.match(match[1],/function restoreResearchView\(/,"Saved view must be explicitly restored");
assert.match(match[1],/x\.eventStartsAt===p\.eventStartsAt/,"Alternate ladder must match exact game start");
assert.match(match[1],/x\.lean===p\.lean/,"Alternate ladder must not combine Higher and Lower");
assert.match(html,/id="minHistory"/,"History sample threshold must be explicit");

assert.match(match[1],/localStorage\.setItem\(RESEARCH_FILTER_STORAGE/,
 "Saved filters must remain browser-local, not a remote account");
assert.match(match[1],/minHistory===0\|\|Number\(p\.observations\)>=minHistory/,
 "Historical sample cutoff required");
assert.match(match[1],/minEstimate===0\|\|Number\(p\.probability\)>=minEstimate/,
 "Estimated probability cutoff required");

assert.match(html,/id="props"[\s\S]*?Add to lineup/,"Board action must be labelled");
for(const forbidden of ["Everything behind the model","MoneyPuck",
 "projection model comparison","stable-shrink","Poisson","negative binomial",
 "private research","researchDrawer","modelComparison","distributionResearch",
 "feature attribution","internal weights"]){
 assert.ok(!html.toLowerCase().includes(forbidden.toLowerCase()),
  "Proprietary methodology exposed on public website: "+forbidden);
}
assert.equal(data.schemaVersion,2,"Only public-allowlisted data schema may deploy");
assert.equal(data.kind,"public_nhl_research_cards_not_internal_model");
assert.ok(Array.isArray(data.props));
assert.ok(Array.isArray(data.comparisons));
assert.ok(Array.isArray(data.featuredIndividualProps));
assert.ok(data.lineups&&typeof data.lineups==="object");
assert.equal(data.performance.modelCalibrated,false);
assert.equal(data.performance.originalPlatformSettlementVerified,false);
assert.equal(data.performance.payoutAdjustedReturnVerified,false);
if(data.performance.gradedProspectivePicks===0)
 assert.equal(data.performance.verifiedProspectiveHitRate,null);
const keys=["schemaVersion","kind","builtAt","researchAt","boardAt","comparisonAt",
 "researchFreshAtBuild","boardCoverageComplete","boardCoverage","dataProvider",
 "props","comparisons","lineups","featuredIndividualProps",
 "featuredPropsSourceFresh","performance","disclaimer"].sort();
const OPTIONAL_EXTENSIONS=["playerInsights","movementSummary","platformResearch","resultBreakdown",
 "prospectiveCohort","collectionCoverage","researchQuality",
 "previewResearchProps","previewResearchOnly","previewSelectionsOfficiallyPrecommitted",
 "evidenceLegend","responsibleResearch"];
assert.deepEqual(Object.keys(data).sort(),
 [...keys,...OPTIONAL_EXTENSIONS.filter(k=>Object.hasOwn(data,k))].sort(),
 "Unexpected public data field");
if(data.playerInsights!==undefined){
 assert.ok(Array.isArray(data.playerInsights),"Player trends must be an allowlisted array");
 for(const x of data.playerInsights){
  assert.equal(x.source,"Official NHL completed-game statistics");
  assert.ok(Number.isInteger(x.historicalGames)&&x.historicalGames>0);
  assert.deepEqual(Object.keys(x).sort(),
   ["player","team","market","last5","last10","last20","seasonAverage",
    "historicalGames","seasonGames","lastGameDate","source"].sort());
 }
}
if(data.movementSummary!==undefined){
 assert.equal(data.movementSummary.removalsVerified,false);
 assert.equal(data.movementSummary.changes,undefined,"Do not republish raw vendor lines");
}
if(data.platformResearch!==undefined){
 assert.ok(Array.isArray(data.platformResearch.matches));
 if(data.platformResearch.status!=="licensed_fresh_independent_comparison")
  assert.equal(data.platformResearch.matches.length,0,"Unlicensed or stale vendor data cannot be public");
 assert.equal(data.platformResearch.payoutsVerified,false);
 assert.equal(data.platformResearch.firstPartyAvailabilityVerified,false);
}
if(data.resultBreakdown!==undefined)
 assert.ok(Array.isArray(data.resultBreakdown.byMarket)&&Array.isArray(data.resultBreakdown.byTier));
if(data.prospectiveCohort!==undefined){
 const p=data.prospectiveCohort;
 assert.equal(p.kind,"nhl_public_cohort_aggregate_official_stat_v1");
 assert.equal(p.originalPlatformSettlementsVerified,false);
 assert.equal(p.realizedReturnVerified,false);
 assert.ok(Array.isArray(p.byPacificGameDay)&&Array.isArray(p.byTier)&&Array.isArray(p.byMarket));
 assert.ok(!JSON.stringify(p).includes('"playerId"'),"Never expose Git registry player IDs publicly");
 assert.ok(!JSON.stringify(p).includes('"firstGitCommittedAt"'),"Never expose raw selection proof timestamps publicly");
 if(p.cohortVerified===true){
  assert.equal(p.counts.registered,
   p.counts.correct+p.counts.incorrect+p.counts.push+p.counts.pending);
  assert.ok(p.minimumPublishedDecisions>=10);
  for(const x of [...p.byPacificGameDay,...p.byMarket,...p.byTier])
   if(x.decided<p.minimumPublishedDecisions)assert.equal(x.observedRate,null);
 }
}
if(data.collectionCoverage!==undefined){
 const c=data.collectionCoverage;
 assert.equal(c.originalPlatformBoardCoverageVerified,false);
 assert.equal(c.kind,"nhl_independent_archive_coverage_public_v1");
 assert.equal(c.rawRows,undefined);
 assert.equal(c.rows,undefined);
 assert.ok(c.officialGamesInWindow===null||
  c.officialGamesWithObservedOffers<=c.officialGamesInWindow);
}


if(data.researchQuality!==undefined){
 const s=data.researchQuality;
 assert.equal(s.kind,"public_nhl_seven_workstream_brief_v1");
 assert.equal(s.originalPlatformAvailabilityVerified,false);
 assert.equal(s.originalPlatformSettlementsVerified,false);
 assert.equal(s.expectedValueVerified,false);
 assert.equal(s.lineupJointProbabilityVerified,false);
 assert.equal(s.originalPlatformRemovalsVerified,false);
 assert.equal(s.originalClubStarterVerified,false);
 assert.ok(s.sourceOfferedSideRows>=0);
 assert.ok(s.sourceFreshUnderdogMatches===0||
  s.underdogStatus==="fresh_authorized_derived_comparisons");
 for(const banned of ["sourceRawOffers","privateLineupPicks","playerId","modelWeights",
  "privateStarterNotes","providerApiKey","championBrier"]){
  assert.ok(!JSON.stringify(s).includes('"'+banned+'"'),
   "Unexpected internal key in public evidence summary "+banned);
 }
}

const wins=data.performance.correctProspectivePicks??0,pushes=data.performance.pushedProspectivePicks??0;
assert.ok(wins>=0&&pushes>=0&&wins+pushes<=data.performance.gradedProspectivePicks);

const disallowed=["historicalModelResearch","distributionResearch","matchupResearch",
 "approvedSourceResearch","prospectiveResearchAudit","legacyReconstructed",
 "shadowMean","selectedFormula","modelWeights","fitParameters","rankScore"];
for(const field of disallowed)
 assert.ok(!JSON.stringify(data).includes('"'+field+'"'),
  "Public data must not leak internal research key: "+field);
for(const p of data.props){
 for(const key of Object.keys(p))
  assert.ok(["player","team","market","line","tier","lean","probability",
   "observations","matchup","capturedAt","eventStartsAt",
   "researchEligibility","roleWarning","tierEvidence"].includes(key),"Excess public prop field "+key);
}
assert.match(html,/id="refreshResearch"/,"Research refresh requires a working control");
assert.match(html,/function refreshPublishedResearch\(/,"Refresh must read same-site sanitized data only");
assert.match(html,/previewSelectionsOfficiallyPrecommitted===false/,"Independent preview must not be frozen selections");
assert.match(html,/New published independent-source research loaded/,"New board must be labeled correctly");
assert.match(css,/\.featured-preview-notice/,"Research preview needs visible disclaimer");
assert.match(css,/\.research-refresh-strip/,"Mobile refresh has accessible layout");
if(data.previewResearchProps!==undefined){
 assert.equal(data.previewSelectionsOfficiallyPrecommitted,false);
 assert.ok(Array.isArray(data.previewResearchProps));
 assert.ok(data.previewResearchProps.length<=8);
 if(data.previewResearchOnly!==true)assert.equal(data.previewResearchProps.length,0);
}

assert.match(html,/id="researchEvidence"/,"Evidence hierarchy must appear on phone and desktop");
assert.match(html,/id="evidenceLegend"/,"Every research claim has a category");
assert.match(html,/id="responsibleResearch"/,"Responsible-use guidance must remain visible");
assert.match(html,/function renderEvidenceLegend\(/,"Evidence legend must render saved public-only labels");
assert.match(html,/structural\.riskLevel/,"Lineup risk label must reference a defined local state");
assert.doesNotMatch(html,/\+" research lineup · "\+risk\+/,"No undefined risk variable in lineup rendering");
assert.match(css,/\.evidence-legend/,"Responsive evidence legend styling required");
assert.ok(!/place.?bet|submit.?wager|auto.?bet/i.test(
 html.replace(/no automated bet placement/gi,"")
 .replace(/does not submit wagers/gi,"")
 .replace(/No automated bet placement/gi,"")),
 "Website must not include a wagering call to action");
if(data.evidenceLegend!==undefined){
 assert.equal(data.evidenceLegend.kind,"public_nhl_evidence_categories_v1");
 for(const k of ["modelEstimate","independentQuote","retrospective",
  "frozenPregame","officialStats","platformSettlement","tier","payouts"])
  assert.ok(typeof data.evidenceLegend[k]==="string"&&data.evidenceLegend[k].length>8);
}
if(data.responsibleResearch!==undefined){
 assert.equal(data.responsibleResearch.kind,"public_responsible_research_v1");
 assert.equal(data.responsibleResearch.noAutoplacement,true);
 assert.equal(data.responsibleResearch.noBettingActionOnSite,true);
 assert.equal(data.responsibleResearch.noWinGuarantees,true);
}

console.log("Public NHL site: customer-only design, safe fresh-board gates and no internal model disclosure");
