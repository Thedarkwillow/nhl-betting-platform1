"use strict";
// Source evidence diagnostics only. Do not expose a new offered side or infer
// a side's icon, actual availability, payout, or financial edge.
const {COLUMNS,SOURCE,verifiedSlot}=require("./partner-prizepicks-board.cjs");
const known=new Set(["standard","goblin","demon"]);
const sideMap=Object.freeze({over:["Higher"],under:["Lower"],under_or_over:["Higher","Lower"]});
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
function classify(tier,access){
 const t=typeof tier==="string"?tier.toLowerCase():null;
 const sides=typeof access==="string"&&own(sideMap,access)?[...sideMap[access]]:[];
 const sourceTier=known.has(t)?t:null;
 const special=sourceTier==="goblin"||sourceTier==="demon";
 return {sourceProjectionTier:sourceTier,sourceReportedDirections:sides,
  status:!sourceTier?"unknown_projection_tier":!sides.length?"unknown_source_direction":
   special&&sides.length===2?"special_both_direction_tier_unresolved":
   special?"special_single_direction_source_label_only":"standard_source_label_only",
  directionTierAuthenticated:false,originalPlatformAvailabilityVerified:false,
  payoutVerified:false,requiresExplicitSideTierEvidence:special&&sides.length>0,
  noNewEligibleDirections:true};
}
const inc=(o,k,n=1)=>{o[k]=(o[k]||0)+n;};
function summarize(manifest,parts,sport){
 if(manifest?.schemaVersion!==1||manifest.source!==SOURCE||
  manifest.snapshotMode!=="direct_live_board"||manifest.completePagination!==true||
  !verifiedSlot(manifest)||JSON.stringify(manifest.columns)!==JSON.stringify(COLUMNS)||
  !Number.isFinite(Date.parse(manifest.captureStartedUTC))||!Number.isFinite(Date.parse(manifest.captureFinishedUTC))||
  Date.parse(manifest.captureFinishedUTC)<Date.parse(manifest.captureStartedUTC)||
  !["NHL","NFL"].includes(sport))throw Error("Invalid archive manifest");
 const info=manifest.sports?.find(x=>x.sport===sport);
 if(!info||!Number.isInteger(info.rawCount)||info.rawCount<1||info.normalizedCount!==info.rawCount||
  !Number.isInteger(info.parts)||info.parts!==parts.length||
  !Number.isFinite(Date.parse(info.sourceObservedAt)))throw Error("Incomplete source sport");
 const ids=new Set(),matrix={},statuses={},byMarket={};let total=0,pregame=0,specialBoth=0,unknown=0;
 for(const part of [...parts].sort((a,b)=>a.startIndex-b.startIndex)){
  if(part.sport!==sport||part.startIndex!==total||part.observedAtUTC!==info.sourceObservedAt||
   !Array.isArray(part.rows)||!part.rows.length)throw Error("Invalid archive part");
  for(const raw of part.rows){
   if(!Array.isArray(raw)||raw.length!==COLUMNS.length)throw Error("Invalid archive row");
   const r=Object.fromEntries(COLUMNS.map((k,i)=>[k,raw[i]]));
   if(typeof r.projectionId!=="string"||!r.projectionId||ids.has(r.projectionId))throw Error("Duplicate or missing offer identity");
   ids.add(r.projectionId);total++;
   const a=classify(r.tier,r.offeredWagerTypes);
   const t=a.sourceProjectionTier||"unknown",d=typeof r.offeredWagerTypes==="string"&&own(sideMap,r.offeredWagerTypes)?r.offeredWagerTypes:"unknown";
   inc(matrix,t+"|"+d);inc(statuses,a.status);
   if(!a.sourceReportedDirections.length)unknown++;
   const both=a.status==="special_both_direction_tier_unresolved";
   if(both)specialBoth++;
   const pre=r.status==="pre_game"&&r.inGame!==true&&r.isLive!==true&&Date.parse(r.eventStartsAt)>Date.parse(info.sourceObservedAt);
   if(pre){
    pregame++;
    if(both)inc(byMarket,String(r.market||"unknown"));
   }
  }
 }
 if(total!==info.rawCount)throw Error("Incomplete archive row count");
 return {sport,observedAt:info.sourceObservedAt,sourceOffers:total,pregameSourceOffers:pregame,
  projectionTierAndDirectionField:matrix,evidenceStatus:statuses,
  specialBothDirectionsUnresolved:specialBoth,unknownDirectionOffers:unknown,
  pregameSpecialBothDirectionsByMarket:byMarket,originalAppSideTierVerified:false,newSelectionEligibleDirections:0};
}
function auditCoverage(archives){
 const days={},failures=[];let accepted=0;
 for(const a of archives){
  try{
   const m=a.manifest;
   if(typeof m?.pacificDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(m.pacificDate))throw Error("Missing archive date");
   const reports=["NHL","NFL"].map(s=>summarize(m,a.parts[s],s));
   const day=days[m.pacificDate]??={captures:0,slots:{},manual:0};
   day.captures++;accepted++;
   if(m.notSixOrNineAmSlot===true)day.manual++;
   else{
    const prior=day.slots[m.captureSlotPacific];
    if(!prior||Date.parse(m.captureFinishedUTC)<Date.parse(prior.capturedAt))
     day.slots[m.captureSlotPacific]={capturedAt:m.captureFinishedUTC,sports:reports};
   }
  }catch(e){failures.push({archive:a.id,reason:String(e.message)});}
 }
 for(const day of Object.values(days))day.bothMorningSlotsVerified=!!(day.slots["06:00"]&&day.slots["09:00"]);
 return {kind:"private_partner_direction_tier_evidence_v1",acceptedArchives:accepted,rejectedArchives:failures,
  observedDates:Object.keys(days).length,days,originalPlatformAvailabilityVerified:false,originalPlatformPayoutVerified:false,
  liveModelChanged:false,researchOnly:true,note:"Count observed archived source IDs, not unique independent wagers; projection-level odds_type is not authenticated per-side icon evidence. No unobserved dates or directions are reconstructed."};
}
module.exports={classify,summarize,auditCoverage};
