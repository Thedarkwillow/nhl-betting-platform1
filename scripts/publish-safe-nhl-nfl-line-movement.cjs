"use strict";
/**
 * Public report is an audited allowlist of COUNTS, never raw prop IDs, lines,
 * players, provider URLs, private Git file paths or projections.
 */
const fs=require("node:fs"),path=require("node:path");
const KIND="private_partner_actual_time_two_observations_v1";
const n=x=>Number.isInteger(x)&&x>=0;
const KEYS=Object.freeze(["firstObserved","secondObserved","newSourceOfferIDs",
 "noLongerSeenSourceIDsUnverified","existingLineChanged",
 "existingTierChanged","existingSideAvailabilityChanged","existingStartChanged","unchanged"]);
function safeCounts(src){
 if(!src||KEYS.some(k=>!n(src[k]))||
  src.newSourceOfferIDs>src.secondObserved||
  src.noLongerSeenSourceIDsUnverified>src.firstObserved||
  src.unchanged>src.firstObserved||
  src.unchanged>src.secondObserved||
  src.unchanged+src.newSourceOfferIDs>src.secondObserved)
  throw Error("Invalid independently compared original source offer counts");
 return Object.fromEntries(KEYS.map(k=>[k,src[k]]));
}
function build(d,{generatedAt=new Date().toISOString()}={}){
 const before=Date.parse(d?.earlierCaptureAt),after=Date.parse(d?.laterCaptureAt);
 const same=d?.comparisonKind==="genuine_same_day_six_to_nine",
  across=d?.comparisonKind==="cross_day_previous_full_source";
 if(d?.kind!==KIND||(!same&&!across&&d.comparisonKind!=="other_same_day_complete_captures")||
  ![before,after,Date.parse(generatedAt)].every(Number.isFinite)||after<=before||
  d.sourceOfferDisappearanceDoesNotVerifyAppRemoval!==true||
  d.originalPlatformAvailabilityVerified!==false||
  d.originalPlatformLineRemovalVerified!==false||
  d.noFrozenDirectionsRewritten!==true||
  d.sixToNineVerified!==same||d.exactSixToNineComparisonVerified!==same||
  d.crossDayLineComparisonVerified!==across||
  !/^\d{4}-\d{2}-\d{2}$/.test(d.priorCapturePacificDay||"")||
  !/^\d{4}-\d{2}-\d{2}$/.test(d.currentCapturePacificDay||"")||
  (across&&d.priorCapturePacificDay===d.currentCapturePacificDay)||
  (same&&d.priorCapturePacificDay!==d.currentCapturePacificDay))
  throw Error("Source movement authenticity or 6 AM to 9 AM scope unverified");
 const sports={};
 for(const sport of ["NHL","NFL"])sports[sport]=safeCounts(d.bySport?.[sport]);
 return {kind:"public_safe_nhl_nfl_board_line_movement_counts_v1",schemaVersion:1,
  generatedAt,earlierCaptureAt:d.earlierCaptureAt,laterCaptureAt:d.laterCaptureAt,
  comparisonKind:d.comparisonKind,sourceDays:{
   earlier:d.priorCapturePacificDay,later:d.currentCapturePacificDay},
  genuineSixToNineComparison:same,crossDayComparison:across,
  sports,originalOffersFromPartnerSourceNotVerifiedPrizePicksApp:true,
  removedOfferNotProvenByMissingSourceID:true,
  privatePlayerNamesPublished:0,privateOfferIDsPublished:0,
  rawLinesPublished:0,probabilitiesPublished:0,
  previouslyFrozenDirectionsRetained:true,platformPayoutVerified:false,
  automaticWagersPlaced:0};
}
function main([privateReport,publicRepo]=process.argv.slice(2)){
 if(!privateReport||!publicRepo)throw Error("Expected original private delta path and public root");
 const d=JSON.parse(fs.readFileSync(privateReport,"utf8"));
 const v=build(d);
 const target=path.join(publicRepo,"data/source-line-movement.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(v,null,2)+"\n");
 console.log(JSON.stringify({safeCountOnly:true,comparisonKind:v.comparisonKind,
  NHL:v.sports.NHL,NFL:v.sports.NFL,rawLines:0,privateOffers:0}));
 return v;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={build,main,safeCounts,KEYS};
