"use strict";
const assert=require("node:assert/strict");
const ROOT="https://thedarkwillow.github.io/nhl-betting-platform1/";
const RETRY_HTTP=new Set([408,429,500,502,503,504]);
function isTransientFetch(error){
 return ['TimeoutError','AbortError'].includes(error?.name)||
  ['ECONNRESET','ECONNREFUSED','ETIMEDOUT','EAI_AGAIN','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT'].includes(error?.cause?.code);
}
async function get(url,{client=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
 warn=message=>console.warn(message)}={}){
 for(let attempt=1;;attempt++){
  let response,error;
  try{response=await client(url,{headers:{"Cache-Control":"no-cache"},signal:AbortSignal.timeout(8000)});}
  catch(e){error=e;}
  if(response?.status===200)return response;
  if(response)await response.body?.cancel().catch(()=>{});
  if(attempt===3||!(response?RETRY_HTTP.has(response.status):isTransientFetch(error))){
   if(error)throw new Error("Public NHL website unavailable: "+url,{cause:error});
   assert.equal(response.status,200,"Public NHL website unavailable: "+url+" HTTP "+response.status);
  }
  warn("Retrying deployed resource after "+(response?"HTTP "+response.status:error.cause?.code||error.name)+" (attempt "+attempt+"): "+url);
  await wait(attempt*1000);
 }
}
async function main(){
 const html=await (await get(ROOT+"?smoke="+Date.now())).text();
 for(const id of ["today","slips","results","featuredProps","props",
  "lineupPicks","lineupStatus","prospectiveAudit","boardMode","boardNotice",
  "rebuildLineup","resetLineup","lineupSwapPanel","lineupSwapOption","applyLineupSwap",
  "saveLineupDraft","restoreLineupDraft","clearLineupDraft","lineupFeedback",
  "accuracyEvidenceContent","accuracyEvidenceStatus","refreshAccuracyEvidence"])
  assert.ok(html.includes('id="'+id+'"'),"Missing NHL customer dashboard component: "+id);
 for(const term of ["Everything behind the model","MoneyPuck","modelComparison",
  "distributionResearch","researchDrawer","stable-shrink-v2"])
  assert.ok(!html.includes(term),"Internal methodology visible on NHL public site: "+term);
 for(const fn of ["currentBoardIsFresh","isCurrentOffer"])
  assert.ok(html.includes("function "+fn+"("),"Missing live source safety check "+fn);
 assert.ok(html.includes('src="./assets/lineup-workspace.js"'),"Missing interactive editor script reference");
 const editor=await (await get(ROOT+"assets/lineup-workspace.js?smoke="+Date.now())).text();
 for(const required of ["function eligible(","function build(","function swapOptions(",
  "function addSelection(","function createDraft(","function restoreDraft("])
  assert.ok(editor.includes(required),"Deployed research editor missing safeguard: "+required);
 const css=await (await get(ROOT+"assets/dashboard.css?smoke="+Date.now())).text();
 for(const pattern of [".featured-grid",".props-data-table",".board-mode",".lineup-row-actions","#lineupFeedback","@media(max-width:680px)"])
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
 const accuracy=await (await get(ROOT+"data/accuracy-platform-evidence.json?smoke="+Date.now())).json();
 assert.equal(accuracy.kind,"public_six_priority_accuracy_platform_evidence_desk_v1");
 assert.equal(accuracy.schemaVersion,1);
 assert.equal(accuracy.privatePlayerRowsExposed,0);
 assert.equal(accuracy.automaticWagers,0);
 assert.equal(accuracy.providerProof.authenticatedPayoutEV,null);
 assert.equal(accuracy.noActualPlatformSettlementClaim,true);
 const verifiedScript=await (await get(ROOT+"assets/accuracy-platform-evidence.js?smoke="+Date.now())).text();
 assert.ok(verifiedScript.includes("public_six_priority_accuracy_platform_evidence_desk_v1"));
 console.log(JSON.stringify({status:"live_public_dashboard_verified",
  schemaVersion:data.schemaVersion,tracked:data.performance.gradedProspectivePicks,
  featured:data.featuredIndividualProps.length,props:data.props.length,
  interactiveLineupBuilderPublished:true,privateMethodologyPublished:false}));
}
module.exports={get};
if(require.main===module)main().catch(e=>{console.error("NHL deployed site smoke failed:",e.message);process.exitCode=1});
