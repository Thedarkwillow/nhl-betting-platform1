"use strict";
/**
 * Private read-only source integrity. Does not use paid provider endpoints,
 * disclose proprietary model calculations, or treat provider labels as
 * first-party fantasy platform availability.
 */
const iso=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))?
 new Date(s).toISOString():null;
function classifyBoard(doc,kind,now){
 const provider=kind==="primary"?"prizepicksapi.com":"The Odds API";
 const captured=iso(doc?.generatedAt),at=Date.parse(now);
 const age=captured?Number(((at-Date.parse(captured))/60000).toFixed(2)):null;
 const rows=Array.isArray(doc?.rows)?doc.rows:[];
 const coverage=kind==="primary"?
  doc?.completePagination===true&&doc?.sourceStatus==="fresh":
  doc?.completePagination===true&&
   doc?.coverage?.scopeComplete===true&&
   doc?.sourceScope==="verified_selected_events"&&
   doc?.fullNhlBoardCoverageVerified===false;
 const sourceMatches=doc?.provider===provider||
  (kind==="primary"&&doc?.sourceProvider===provider);
 const quality={missingTimestamp:0,invalidCaptureChronology:0,
  missingEventStart:0,notPregame:0,staleObservedAtCapture:0,
  unknownMarket:0,unverifiedTier:0,unknownPlayer:0,
  noObservedTimestamp:0};
 const markets={},eventStarts={},tierCounts={};
 for(const row of rows){
  const observed=iso(row.observedAt),capture=iso(row.capturedAt),
   event=iso(row.eventStartsAt);
  if(!capture)quality.missingTimestamp++;
  if(!observed)quality.noObservedTimestamp++;
  if(!event)quality.missingEventStart++;
  if(capture&&observed&&Date.parse(observed)>Date.parse(capture))
   quality.invalidCaptureChronology++;
  if(capture&&event&&Date.parse(event)<=Date.parse(capture))
   quality.notPregame++;
  if(observed&&capture&&Date.parse(capture)-Date.parse(observed)>30*60000)
   quality.staleObservedAtCapture++;
  if(!row.market)quality.unknownMarket++;
  if(!row.player)quality.unknownPlayer++;
  const tier=String(row.tier||"unverified");
  tierCounts[tier]=(tierCounts[tier]||0)+1;
  if(!["Standard","Goblin","Demon"].includes(tier))quality.unverifiedTier++;
  const market=String(row.market||"unknown");
  markets[market]=(markets[market]||0)+1;
  if(event){const day=event.slice(0,10);eventStarts[day]=(eventStarts[day]||0)+1;}
 }
 const allChecksPass=sourceMatches&&coverage&&rows.length>0&&
  age!==null&&age>=0&&age<=30&&
  quality.missingTimestamp===0&&quality.invalidCaptureChronology===0&&
  quality.missingEventStart===0&&quality.notPregame===0&&
  quality.staleObservedAtCapture===0&&quality.noObservedTimestamp===0&&
  quality.unknownPlayer===0;
 return {kind,configured:!!doc,provider,sourceIdentityCorrect:sourceMatches,
  generatedAt:captured,ageMinutes:age,
  freshForResearch:allChecksPass,
  scope:kind==="primary"?"full_provider_board":"at_most_two_verified_NHL_events",
  completeScopeArchived:coverage,
  fullLeagueBoardClaimSupported:kind==="primary"&&coverage,
  sourceRows:rows.length,
  officialPlatformOfferAuthenticated:false,
  originalPlatformTierAuthenticated:false,
  rowsByMarket:markets,rowsByEventUtcDate:eventStarts,
  rowsByTier:tierCounts,issues:quality,
  providerQuotaRemainingAtLastArchive:
   kind==="primary"&&Number.isInteger(doc?.creditsRemaining)?
   doc.creditsRemaining:
   kind==="backup"&&Number.isInteger(doc?.remainingProviderCredits)?
   doc.remainingProviderCredits:null,
  quotaIsLive:false};
}
function auditProviderQuality({primary=null,backup=null,grading=null,
 officialStats=null,now=new Date().toISOString()}={}){
 if(!iso(now))throw Error("Invalid private NHL audit clock");
 const a=classifyBoard(primary,"primary",now),
 b=classifyBoard(backup,"backup",now),
 prospective=grading?.individualPropAudit?.explicitProspective;
 const decided=Number.isInteger(prospective?.decided)?prospective.decided:0;
 const graded=Number.isInteger(prospective?.graded)?prospective.graded:0;
 const finalComplete=officialStats?.scheduledGames===officialStats?.completedGames&&
  officialStats?.completedGames===officialStats?.collectedGames&&
  !(officialStats?.errors||[]).length&&officialStats!=null;
 return {schemaVersion:1,kind:"nhl_private_provider_integrity_manifest",
  generatedAt:iso(now),providerApiRequests:0,paidApiCreditsSpentByAudit:0,
  providers:{primary:a,backup:b},
  officialFinals:{latestDate:officialStats?.requestedDate||null,
   scheduled:officialStats?.scheduledGames??null,
   final:officialStats?.completedGames??null,
   archived:officialStats?.collectedGames??null,
   complete:finalComplete},
  prospective:{originalPrecommittedSelections:
    Number.isInteger(prospective?.uniqueSelections)?prospective.uniqueSelections:0,
   graded,decided,prospectiveRateEstablished:decided>0,
   independentlyVerifiedOriginalPlatformSettlement:false,
   profitabilityVerified:false},
  actionNeeded:[
   ...(a.freshForResearch?[]:["primary_current_board_not_verified"]),
   ...(b.freshForResearch?[]:["backup_current_event_subset_not_verified"]),
   ...(finalComplete?[]:["latest_official_NHL_final_archive_incomplete"]),
   ...(decided?[]:["no_graded_precommitted_predictions_yet"])
  ],
  note:"Latest known provider usage numbers are historical archive values only. A complete backup subset is not a full league board. Provider-labelled lines and official NHL outcomes never establish original-platform availability, settlement or payouts."};
}
module.exports={classifyBoard,auditProviderQuality};
