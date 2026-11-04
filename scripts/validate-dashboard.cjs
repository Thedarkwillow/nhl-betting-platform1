"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),
 assert=require("node:assert/strict");
const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
const css=fs.readFileSync(path.resolve(__dirname,"../assets/dashboard.css"),"utf8");
const data=JSON.parse(fs.readFileSync(path.resolve(__dirname,"../data.json"),"utf8"));
assert.match(html,/href="\.\/assets\/dashboard\.css"/,"NHL dashboard stylesheet missing");
assert.match(css,/\.featured-grid/);
assert.match(css,/@media\(max-width:680px\)/,"Mobile NHL prop cards required");
assert.match(css,/\.board-mode/,"Historical vs fresh data mode required");
for(const id of ["today","slips","results","featuredProps","boardMode","boardNotice",
 "props","lineupPicks","lineupStatus","prospectiveAudit","freshness","comparisons"])
 assert.ok(html.includes('id="'+id+'"'),"Missing customer-facing element "+id);
assert.ok(html.indexOf('id="today"')<html.indexOf('id="slips"')&&
 html.indexOf('id="slips"')<html.indexOf('id="results"'),
 "Customer layout must prioritize top props, lineup builder and results");
const match=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(match,"NHL dashboard script missing");
new vm.Script(match[1],{filename:"nhl-public-site.js"});
for(const fn of ["currentBoardIsFresh","isCurrentOffer","renderFeatured",
 "render","renderLineup","renderResults","renderComparisons"])
 assert.ok(match[1].includes("function "+fn+"("),"Missing safe public renderer "+fn);
assert.match(html,/probabilities are estimates/i,"Probability caveat required");
assert.match(html,/unverified/i,"Original platform terms and payout caveat required");
assert.match(match[1],/now-captured<=30\*60000/,"Current prop age must be limited");
assert.match(match[1],/Number\.isFinite\(start\)&&start>now/,"Puck drop guard required");
assert.match(match[1],/slip\.picks\.every\(isCurrentOffer\)/,"Lineups must fail closed");
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
assert.deepEqual(Object.keys(data).sort(),keys,"Unexpected public data field");
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
   "researchEligibility","roleWarning"].includes(key),"Excess public prop field "+key);
}
console.log("Public NHL site: customer-only design, safe fresh-board gates and no internal model disclosure");
