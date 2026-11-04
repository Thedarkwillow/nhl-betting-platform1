"use strict";
const assert=require("node:assert/strict");
const ROOT="https://thedarkwillow.github.io/nhl-betting-platform1/";
async function get(url){
 const r=await fetch(url,{headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(20000)});
 assert.equal(r.status,200,"Public NHL website unavailable: "+url+" HTTP "+r.status);
 return r;
}
async function main(){
 const html=await (await get(ROOT+"?smoke="+Date.now())).text();
 for(const id of ["today","slips","results","featuredProps","props",
  "lineupPicks","lineupStatus","prospectiveAudit","boardMode","boardNotice"])
  assert.ok(html.includes('id="'+id+'"'),"Missing NHL customer dashboard component: "+id);
 for(const term of ["Everything behind the model","MoneyPuck","modelComparison",
  "distributionResearch","researchDrawer","stable-shrink-v2"])
  assert.ok(!html.includes(term),"Internal methodology visible on NHL public site: "+term);
 for(const fn of ["currentBoardIsFresh","isCurrentOffer"])
  assert.ok(html.includes("function "+fn+"("),"Missing live source safety check "+fn);
 const css=await (await get(ROOT+"assets/dashboard.css?smoke="+Date.now())).text();
 for(const pattern of [".featured-grid",".props-data-table",".board-mode","@media(max-width:680px)"])
  assert.ok(css.includes(pattern),"Missing mobile NHL stylesheet: "+pattern);
 const data=await (await get(ROOT+"data.json?smoke="+Date.now())).json();
 assert.equal(data.schemaVersion,2);
 assert.equal(data.kind,"public_nhl_research_cards_not_internal_model");
 assert.ok(Array.isArray(data.props));assert.ok(Array.isArray(data.featuredIndividualProps));
 assert.equal(data.performance.modelCalibrated,false);
 assert.equal(data.performance.payoutAdjustedReturnVerified,false);
 assert.equal(data.performance.originalPlatformSettlementVerified,false);
 if(data.performance.gradedProspectivePicks===0)
  assert.equal(data.performance.verifiedProspectiveHitRate,null);
 for(const key of ["historicalModelResearch","distributionResearch",
  "approvedSourceResearch","matchupResearch","prospectiveResearchAudit"])
  assert.equal(data[key],undefined,"Internal research disclosure on public dashboard: "+key);
 console.log(JSON.stringify({status:"live_public_dashboard_verified",
  schemaVersion:data.schemaVersion,tracked:data.performance.gradedProspectivePicks,
  featured:data.featuredIndividualProps.length,props:data.props.length,
  privateMethodologyPublished:false}));
}
main().catch(e=>{console.error("NHL deployed site smoke failed:",e.message);process.exitCode=1});
