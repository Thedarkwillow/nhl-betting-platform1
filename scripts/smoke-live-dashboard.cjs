"use strict";
const assert=require("node:assert/strict");
const ROOT="https://thedarkwillow.github.io/nhl-betting-platform1/";
async function get(url){
 const response=await fetch(url,{headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(20000)});
 assert.equal(response.status,200,"Public website unavailable: "+url+" HTTP "+response.status);
 return response;
}
async function smoke(){
 const html=await (await get(ROOT+"?smoke="+Date.now())).text();
 for(const id of ["prospectiveAudit","standardAlternateAudit","lineupStatus","props"])
  assert.ok(html.includes('id="'+id+'"'),"Missing deployed dashboard component "+id);
 assert.ok(html.includes("function researchIsFresh"),"Public website lacks stale-lineup blocker");
 const body=await (await get(ROOT+"data.json?smoke="+Date.now())).json();
 assert.ok(body.prospectiveResearchAudit,"No public prospective research status");
 assert.ok(body.historicalStandardAlternateResearch,"No public historical standard/alternate report");
 const quality=body.prospectiveResearchAudit,history=body.historicalStandardAlternateResearch;
 assert.equal(quality.calibrationApproved,false);
 assert.equal(quality.originalPlatformSettlementVerified,false);
 assert.equal(history.originalTierVerified,false);
 assert.equal(history.originalPayoutVerified,false);
 assert.ok(Number.isInteger(quality.eligiblePregamePredictions)&&quality.eligiblePregamePredictions>=0);
 assert.ok(Number.isInteger(history.standardAlternatePairs)&&history.standardAlternatePairs>=0);
 if(quality.gradedDecisions===0)assert.equal(quality.verifiedProspectiveHitRate,null);
 console.log(JSON.stringify({livePublicSite:"verified",dataBuiltAt:body.builtAt,
  eligiblePregamePredictions:quality.eligiblePregamePredictions,
  pending:quality.pendingTotal,graded:quality.gradedDecisions,
  standardAlternatePairs:history.standardAlternatePairs,
  goalieStandard:history.goalieStandardSaves,goalieAlternate:history.goalieAlternateSaves}));
}
smoke().catch(e=>{console.error("Deployed NHL mobile research smoke failed:",e.message);process.exitCode=1});
