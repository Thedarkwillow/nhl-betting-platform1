"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
const found=html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(found,"NHL page must contain an inline dashboard script");
new vm.Script(found[1],{filename:"nhl-public-dashboard.inline.js"});
const ids=["prospectiveAudit","standardAlternateAudit","modelEvidence","modelComparison","roleReadiness","evidence","lineupStatus","lineupPicks",
 "props","comparisons","freshness","updated"];
for(const id of ids)assert.ok(html.includes('id="'+id+'"'),"Missing required accessible dashboard region: "+id);
for(const fn of ["renderProspectiveQuality","renderStandardAlternateAudit","renderModelEvidence","renderModelComparison","renderRoleReadiness","researchIsFresh"])
 assert.ok(found[1].includes("function "+fn+"("),"Missing essential data/status renderer "+fn);
assert.match(found[1],/if\(!researchIsFresh\(\)\)/,"Stale lineups must fail closed");
assert.match(found[1],/original|unverified|Uncalibrated|uncalibrated/i);
assert.match(found[1],/model_market_disagreement/,"Must display opposing sportsbook market signal");
assert.match(found[1],/STARTING_GOALIE_NOT_CONFIRMED/,"Unconfirmed goalie starters must be visibly flagged");
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
  assert.equal(data.roleContextAudit.pregameGoalieStartersConfirmed,false);
  assert.equal(data.roleContextAudit.pregameInjuriesVerified,false);
  assert.ok(data.roleContextAudit.withOfficialTOI>=0);
 }
 if(data.evidenceSummary){
  assert.equal(data.evidenceSummary.verifiedBettingPicks,0);
  assert.ok(Array.isArray(data.props));
  for(const row of data.props){assert.equal(row.evidence?.readyForBetting,false);
   assert.equal(row.evidence?.probabilityCalibrated,false);}
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
