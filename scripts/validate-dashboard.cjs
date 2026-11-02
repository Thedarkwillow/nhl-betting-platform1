"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm"),assert=require("node:assert/strict");
const html=fs.readFileSync(path.resolve(__dirname,"../index.html"),"utf8");
const found=html.match(/<script>([\s\S]*?)<\/script>/i);
assert.ok(found,"NHL page must contain an inline dashboard script");
new vm.Script(found[1],{filename:"nhl-public-dashboard.inline.js"});
const ids=["prospectiveAudit","standardAlternateAudit","lineupStatus","lineupPicks",
 "props","comparisons","freshness","updated"];
for(const id of ids)assert.ok(html.includes('id="'+id+'"'),"Missing required accessible dashboard region: "+id);
for(const fn of ["renderProspectiveQuality","renderStandardAlternateAudit","researchIsFresh"])
 assert.ok(found[1].includes("function "+fn+"("),"Missing essential data/status renderer "+fn);
assert.match(found[1],/if\(!researchIsFresh\(\)\)/,"Stale lineups must fail closed");
assert.match(found[1],/original|unverified|Uncalibrated|uncalibrated/i);
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
 if(data.historicalStandardAlternateResearch){
  const q=data.historicalStandardAlternateResearch;
  assert.equal(q.originalTierVerified,false);
  assert.equal(q.originalPayoutVerified,false);
 }
}
console.log("NHL public page JavaScript, expected UI sections and stale/research evidence guards pass");
