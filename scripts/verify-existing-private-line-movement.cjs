"use strict";
/**
 * The genuine 6->9 AM comparison can already be first-Git-archived privately
 * before a later workflow_runner retries. Re-publish its safe counts without
 * either recreating an immutable file or silently skipping the public site.
 * No private player/offered-line data is exported.
 */
const fs=require("node:fs"),path=require("node:path"),
 cp=require("node:child_process");
const COUNT_FIELDS=["firstObserved","secondObserved","newSourceOfferIDs",
 "noLongerSeenSourceIDsUnverified","existingLineChanged","existingTierChanged",
 "existingSideAvailabilityChanged","existingStartChanged","unchanged"];
function verifyPayload(report,expected,{baselineRel,currentRel,
 baselineDay,currentDay,baselineSlot,currentSlot}={}){
 const fail=reason=>({verified:false,reason});
 if(!report||report.kind!=="private_partner_actual_time_two_observations_v1"||
    !expected||expected.kind!==report.kind||report.baselineArchive!==baselineRel||
    report.currentArchive!==currentRel||
    report.earlierCaptureAt!==expected.earlierCaptureAt||
    report.laterCaptureAt!==expected.laterCaptureAt||
    report.priorCapturePacificDay!==baselineDay||
    report.currentCapturePacificDay!==currentDay||
    report.exactSixToNineComparisonVerified!==expected.exactSixToNineComparisonVerified||
    report.sixToNineVerified!==expected.exactSixToNineComparisonVerified||
    report.originalPlatformLineRemovalVerified!==false||
    report.originalPlatformAvailabilityVerified!==false||
    report.noFrozenDirectionsRewritten!==true||
    report.sourceOfferDisappearanceDoesNotVerifyAppRemoval!==true||
    !["genuine_same_day_six_to_nine","cross_day_previous_full_source"].includes(report.comparisonKind))
   return fail("original_capture_or_scope_mismatch");
 if(baselineDay===currentDay&&baselineSlot==="06:00"&&currentSlot==="09:00"&&
    (report.comparisonKind!=="genuine_same_day_six_to_nine"||
      report.crossDayLineComparisonVerified!==false))
    return fail("false_same_day_six_to_nine_scope");
 if(baselineDay!==currentDay&&(report.comparisonKind!=="cross_day_previous_full_source"||
      report.crossDayLineComparisonVerified!==true))
    return fail("false_cross_day_scope");
 for(const sport of ["NHL","NFL"]){
  if(COUNT_FIELDS.some(k=>!Number.isInteger(expected.bySport?.[sport]?.[k])||
     report.bySport?.[sport]?.[k]!==expected.bySport[sport][k]))
   return fail("source_offer_identity_or_count_mismatch");
 }
 return {verified:true,reason:"certified_original_source_pair_and_counts_matched"};
}
function verifyExisting(privateRoot,currentRel,reportRel){
 const root=path.resolve(privateRoot),prefix="outputs/manual-board-captures/",
  deltaPrefix="outputs/partner-source/line-delta/";
 if(!currentRel?.startsWith(prefix)||!reportRel?.startsWith(deltaPrefix)||
   path.isAbsolute(currentRel)||path.isAbsolute(reportRel)||
   currentRel.includes("..")||reportRel.includes(".."))
  return {verified:false,reason:"untrusted_private_paths"};
 const {loadCapture,compare,findBaseline,isCertifiedMorning}=
  require(path.join(root,"scripts/diff-live-partner-captures.cjs"));
 const current=loadCapture(currentRel,root),baseline=findBaseline(currentRel,root);
 if(!baseline||!isCertifiedMorning(current.manifest)||
    !isCertifiedMorning(baseline.manifest))
  return {verified:false,reason:"certified_original_board_pair_missing"};
 const earlier=loadCapture(baseline.rel,root),expected=compare(earlier,current);
 const target=path.join(root,reportRel);
 if(!fs.existsSync(target))return {verified:false,reason:"archived_private_delta_missing"};
 const doc=JSON.parse(fs.readFileSync(target,"utf8"));
 const check=verifyPayload(doc,expected,{
  baselineRel:baseline.rel,currentRel,
  baselineDay:baseline.manifest.pacificDate,
  currentDay:current.manifest.pacificDate,
  baselineSlot:baseline.manifest.captureSlotPacific,
  currentSlot:current.manifest.captureSlotPacific});
 if(!check.verified)return check;
 // Require actual remote-Git first-addition proof. A file generated in the
 // runner's workspace alone is NOT immutable archived evidence.
 const git=(...args)=>cp.execFileSync("git",args,{cwd:root,
  encoding:"utf8",timeout:18000,maxBuffer:2*1024*1024}).trim();
 const commits=git("log","--diff-filter=A","--format=%H","--",reportRel)
  .split("\n").filter(Boolean);
 if(commits.length!==1)return {verified:false,reason:"no_unique_private_first_git"};
 const first=JSON.parse(git("show",commits[0]+":"+reportRel));
 if(JSON.stringify(doc)!==JSON.stringify(first))
  return {verified:false,reason:"first_git_original_delta_was_modified"};
 const firstTime=Date.parse(git("show","-s","--format=%cI",commits[0]));
 if(!Number.isFinite(firstTime)||
   firstTime<Date.parse(doc.laterCaptureAt)-1000)
  return {verified:false,reason:"source_delta_commit_timing_invalid"};
 return {verified:true,reason:check.reason,reportRel,
  comparisonKind:doc.comparisonKind};
}
if(require.main===module){
 try{
  const d=verifyExisting(...process.argv.slice(2));
  console.log(JSON.stringify({verified:d.verified,reason:d.reason,
   comparisonKind:d.comparisonKind||null,privateRowsEmitted:0}));
  if(!d.verified)process.exitCode=1;
 }catch(e){console.error("Certified original movement rejected: "+e.message);
  process.exitCode=1;}
}
module.exports={verifyPayload,verifyExisting,COUNT_FIELDS};
