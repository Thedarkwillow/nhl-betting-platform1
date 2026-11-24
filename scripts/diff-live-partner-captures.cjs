"use strict";
/** Private source-only movement audit, never a simulated 06:00 observation. */
const fs=require("node:fs"),path=require("node:path");
const {COLUMNS,verifiedSlot}=require("../src/partner-prizepicks-board.cjs");
const ROOT=path.resolve(__dirname,"..");
function loadCapture(rel,root=ROOT){
 const base=path.resolve(root,rel),prefix=path.join(root,"outputs/manual-board-captures")+path.sep;
 if(!base.startsWith(prefix))throw Error("Only private manual source captures permitted");
 const manifest=JSON.parse(fs.readFileSync(path.join(base,"manifest.json"),"utf8"));
 if(manifest.schemaVersion!==1||manifest.source!=="partner-api.prizepicks.com"||
  manifest.completePagination!==true||JSON.stringify(manifest.columns)!==JSON.stringify(COLUMNS))
  throw Error("Unverified source capture for comparisons");
 const results={};
 for(const s of ["NHL","NFL"]){
  const entry=manifest.sports.find(x=>x.sport===s),all=[],ids=new Set();
  if(!entry||!Number.isInteger(entry.parts)||entry.parts<1)throw Error("Missing league capture");
  for(let i=1;i<=entry.parts;i++){
   const p=path.join(base,s.toLowerCase()+"-"+String(i).padStart(2,"0")+".json");
   const doc=JSON.parse(fs.readFileSync(p,"utf8"));
   if(doc.sport!==s||doc.startIndex!==all.length||doc.observedAtUTC!==entry.sourceObservedAt||
    !Array.isArray(doc.rows))throw Error("Corrupted source chunk sequence");
   for(const r of doc.rows){
    if(!Array.isArray(r)||r.length!==COLUMNS.length||
     typeof r[0]!=="string"||ids.has(r[0]))throw Error("Duplicate or malformed source offer");
    ids.add(r[0]);all.push(r);
   }
  }
  if(all.length!==entry.rawCount)throw Error("Capture count mismatch");
  results[s]=new Map(all.map(x=>[x[0],x]));
 }
 return {manifest,rows:results};
}
function compare(previous,current){
 const out={kind:"private_partner_actual_time_two_observations_v1",
  earlierCaptureAt:previous.manifest.captureFinishedUTC,
  laterCaptureAt:current.manifest.captureFinishedUTC,
  exactSixToNineComparisonVerified:
   previous.manifest.captureSlotPacific==="06:00"&&
   current.manifest.captureSlotPacific==="09:00"&&
   previous.manifest.pacificDate===current.manifest.pacificDate,
  originalPlatformLineRemovalVerified:false,
  originalPlatformAvailabilityVerified:false,bySport:{}};
 if(Date.parse(out.earlierCaptureAt)>=Date.parse(out.laterCaptureAt))
  throw Error("Source movement must compare true chronological observations");
 for(const sport of ["NHL","NFL"]){
  const a=previous.rows[sport],b=current.rows[sport],z={firstObserved:a.size,secondObserved:b.size,
   newSourceOfferIDs:0,noLongerSeenSourceIDsUnverified:0,
   existingLineChanged:0,existingTierChanged:0,existingSideAvailabilityChanged:0,
   existingStartChanged:0,unchanged:0};
  for(const [id,row] of b){
   const p=a.get(id);
   if(!p){z.newSourceOfferIDs++;continue;}
   let modified=false;
   for(const [column,key] of [[10,"existingLineChanged"],[11,"existingTierChanged"],
    [12,"existingSideAvailabilityChanged"],[7,"existingStartChanged"]]){
    if(row[column]!==p[column]){z[key]++;modified=true;}
   }
   if(!modified)z.unchanged++;
  }
  for(const id of a.keys())if(!b.has(id))z.noLongerSeenSourceIDsUnverified++;
  out.bySport[sport]=z;
 }
 return out;
}
/**
 * For 9 AM prefer the same calendar day's complete original 6 AM archive.
 * For 6 AM compare the most recent previous complete capture, even if it was
 * yesterday. Never call an across-days comparison a real 6-to-9 AM movement.
 * Never treat source disappearance as verified removal from the PrizePicks app.
 */
function isCertifiedMorning(manifest){
 // The generic parser correctly permits legitimate manual observations, but
 // comparisons labelled daily 6/9 AM must use ONLY certified 6/9 AM source
 // captures. A 20:00 Pacific manual full board is NOT a morning slot.
 if(!["06:00","09:00"].includes(manifest?.captureSlotPacific)||
  manifest.actualCaptureInRequestedHour!==true)return false;
 if(manifest.notSixOrNineAmSlot===false)return verifiedSlot(manifest);
 // Historical Nov 9 09:22 PT source was truly captured in the 09 Pacific
 // hour but its legacy manifest had the *wrong* notSixOrNineAmSlot flag.
 // Independently re-verify start/end Pacific chronology and both sports,
 // rather than rewriting an immutable original source manifest. This
 // exception applies ONLY to the already-archived Nov 9 morning capture.
 if(manifest.notSixOrNineAmSlot===true&&
    manifest.pacificDate==="2026-11-09"&&
    manifest.captureSlotPacific==="09:00"&&
    Date.parse(manifest.captureFinishedUTC)<Date.parse("2026-11-10T08:00:00Z"))
  return verifiedSlot({...manifest,notSixOrNineAmSlot:false});
 return false;
}
function findBaseline(currentRel,root=ROOT,{maxLookbackDays=7}={}){
 const cur=loadCapture(currentRel,root),m=cur.manifest;
 if(!isCertifiedMorning(m))throw Error("Current board is not a verified complete original morning capture");
 const today=Date.parse(m.captureStartedUTC);
 if(!Number.isFinite(today)||!Number.isInteger(maxLookbackDays)||
  maxLookbackDays<1||maxLookbackDays>14)throw Error("Invalid daily comparison window");
 const parent=path.join(root,"outputs/manual-board-captures");
 if(!fs.existsSync(parent))return null;
 const options=[];
 for(const day of fs.readdirSync(parent)){
  const dayDir=path.join(parent,day);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!fs.statSync(dayDir).isDirectory())continue;
  for(const snapshot of fs.readdirSync(dayDir)){
   const dir=path.join(dayDir,snapshot),filename=path.join(dir,"manifest.json");
   if(!fs.existsSync(filename)||path.resolve(dir)===path.resolve(root,currentRel))continue;
   let doc;
   try{doc=JSON.parse(fs.readFileSync(filename,"utf8"));}catch{continue;}
   if(!isCertifiedMorning(doc))continue;
   const at=Date.parse(doc.captureFinishedUTC);
   if(!Number.isFinite(at)||at>=today||today-at>maxLookbackDays*86400000||
      doc.pacificDate!==day)continue;
   options.push({rel:path.relative(root,dir),manifest:doc,time:at});
  }
 }
 if(!options.length)return null;
 const sameday=m.captureSlotPacific==="09:00"?
  options.filter(x=>x.manifest.pacificDate===m.pacificDate&&
    x.manifest.captureSlotPacific==="06:00"):[];
 const list=sameday.length?sameday:options;
 list.sort((a,b)=>b.time-a.time);
 return list[0];
}
function main(args=process.argv.slice(2),root=ROOT){
 const rel=args[0];
 if(!rel)throw Error("Pass complete current private capture directory");
 const current=loadCapture(rel,root);
 const baseline=findBaseline(rel,root);
 if(!baseline){
  console.log(JSON.stringify({status:"no_prior_verified_complete_capture_within_seven_days",
   sixToNineVerified:false,crossDayLineComparisonVerified:false,
   lineChangesNotInferred:true}));
  return {status:"no_prior_verified_complete_capture_within_seven_days"};
 }
 const prior=loadCapture(baseline.rel,root);
 const result=compare(prior,current);
 const crossDay=prior.manifest.pacificDate!==current.manifest.pacificDate;
 const comparisonKind=result.exactSixToNineComparisonVerified?
  "genuine_same_day_six_to_nine":
  crossDay?"cross_day_previous_full_source":"other_same_day_complete_captures";
 const day=current.manifest.pacificDate,base=path.join(root,"outputs/partner-source/line-delta",day);
 fs.mkdirSync(base,{recursive:true});
 const timestamp=current.manifest.captureFinishedUTC.slice(0,19).replace(/[-:]/g,"")+"Z";
 const output=path.join(base,timestamp+".json");
 const verified={...result,baselineArchive:baseline.rel,currentArchive:rel,
  comparisonKind,sourceGapUnobserved:true,
  crossDayLineComparisonVerified:crossDay,
  priorCapturePacificDay:prior.manifest.pacificDate,
  currentCapturePacificDay:day,
  secondsBetweenObservations:Math.round((Date.parse(result.laterCaptureAt)-
   Date.parse(result.earlierCaptureAt))/1000),
  sourceOfferDisappearanceDoesNotVerifyAppRemoval:true,
  noFrozenDirectionsRewritten:true,
  sixToNineVerified:result.exactSixToNineComparisonVerified};
 const existing=fs.existsSync(output);
 if(existing){
  // Correct DERIVED aggregates that were mistakenly compared to an
  // out-of-hour manual source. NEVER edit the original raw archive, frozen
  // selections, or a report whose baseline was a certified morning source.
  const older=JSON.parse(fs.readFileSync(output,"utf8"));
  if(older.baselineArchive===baseline.rel&&older.currentArchive===rel){
   console.log(JSON.stringify({status:"already_verified_morning_comparison",
    baselineArchive:baseline.rel,currentArchive:rel,sourceLineChangesReused:true}));
   return {status:"already_verified_morning_comparison"};
  }
  if(typeof older.baselineArchive!=="string"||
     !older.baselineArchive.startsWith("outputs/manual-board-captures/"))
   throw Error("No verified provenance for correcting an existing derived report");
  const prevManifest=path.join(root,older.baselineArchive,"manifest.json");
  if(!fs.existsSync(prevManifest)||
     isCertifiedMorning(JSON.parse(fs.readFileSync(prevManifest,"utf8"))))
   throw Error("Refuse overwriting a previously certified source comparison");
  verified.correction={reason:"prior_comparison_accidentally_used_manual_out_of_hour_source",
   previousVersionPreservedInPrivateGitHistory:true,
   originalSourceArchivesAndFrozenDirectionsUntouched:true};
 }
 fs.writeFileSync(output,JSON.stringify(verified,null,2)+"\n",
  existing?undefined:{flag:"wx"});
 const summary={status:"verified_original_source_line_delta_saved_privately",
  baselineCaptureAt:result.earlierCaptureAt,currentCaptureAt:result.laterCaptureAt,
  comparisonKind,crossDayLineComparisonVerified:crossDay,
  correctedPriorOutOfHourManualComparison:existing,
  sixToNineVerified:result.exactSixToNineComparisonVerified,
  summary:result.bySport,output:path.relative(root,output)};
 console.log(JSON.stringify(summary));
 return summary;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={loadCapture,compare,findBaseline,isCertifiedMorning,main};
