"use strict";
/**
 * Compare *two independent provider-labelled* PrizePicks snapshots.
 * Only fresh, pregame, regular full-game offers can be compared. Comparison
 * never authenticates either original platform line or validates payouts.
 */
const {nameKey,canonicalTeam}=require("./nhl-pregame-intel.cjs");
const {validateOffer,normalize}=require("./nhl-market-registry.cjs");
const ts=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):NaN;
function safeKey(p){
 const player=nameKey(p?.player),team=canonicalTeam(p?.team),
  // Research-only newly recognized markets have no independently approved
  // scoring/settlement contract and MUST NOT inherit standard comparisons.
  contract=validateOffer({market:p?.market,period:p?.period,
    tier:p?.tier,side:p?.side}),
  market=contract.eligible?contract.field:null,side=p?.side;
 const start=ts(p?.eventStartsAt);
 if(!player||!team||!market||!["Higher","Lower"].includes(side)||
  !Number.isFinite(start)||p?.tier!=="Standard"||
  (p.period&& !["full game","game"].includes(normalize(p.period))))return null;
 // Preserve official start to the minute; archive times include seconds/UTC.
 return [player,team,market,side,new Date(Math.floor(start/60000)*60000).toISOString()].join("|");
}
function isCurrentStandardOffer(p,now,minutes=30){
 const age=now-ts(p?.observedAt),capture=ts(p?.capturedAt),
  gameStart=ts(p?.eventStartsAt);
 return safeKey(p)!==null&&Number.isFinite(age)&&age>=0&&
  age<=minutes*60000&&Number.isFinite(capture)&&capture<=now&&
  capture>=ts(p?.observedAt)&&Number.isFinite(gameStart)&&
  gameStart>now+15*60000&&Number.isFinite(p.line)&&p.line>=0&&p.isLive!==true;
}
function compareNhlPrizePicksSources(primary,backup,{now=new Date().toISOString(),maxAgeMinutes=30}={}){
 const at=ts(now);
 if(!Number.isFinite(at))throw Error("Invalid comparative NHL research time");
 const fresh=d=>Number.isFinite(ts(d?.generatedAt))&&
   ts(d.generatedAt)<=at&&at-ts(d.generatedAt)<=maxAgeMinutes*60000;
 const primaryReady=primary?.provider==="prizepicksapi.com"&&
  primary?.completePagination===true&&primary?.sourceStatus==="fresh"&&
  Array.isArray(primary?.rows)&&fresh(primary);
 const backupReady=backup?.provider==="The Odds API"&&
  backup?.sourceScope==="verified_selected_events"&&
  backup?.coverage?.scopeComplete===true&&
  backup?.completePagination===true&&Array.isArray(backup?.rows)&&fresh(backup);
 const result={schemaVersion:1,kind:"nhl_independent_prizepicks_standard_offer_cross_check",
  generatedAt:new Date(at).toISOString(),
  comparisonPossible:primaryReady&&backupReady,
  primarySourceValid:!!primaryReady,backupSourceValid:!!backupReady,
  originalPrizePicksPlatformVerified:false,completeLeagueBoardVerified:false,
  verifiedOriginalPlatformTier:false,verifiedPayout:false,
  eligibleOfferCount:0,matchedSameLine:0,conflictingLine:0,
  unmatchedBackup:0,ambiguousPrimary:0,ambiguousBackup:0,
  staleOrUnsafePrimaryRows:0,staleOrUnsafeBackupRows:0,
  conflicts:[],ambiguousBackupKeys:[],verifiedAgreementNotProofOfPlatformAvailability:true,
  providerRequests:0};
 if(!result.comparisonPossible)return {...result,status:"comparison_not_possible_source_missing_stale_or_incomplete"};
 const mapFor=(rows,label)=>{
  const map=new Map();
  for(const p of rows){
   if(!isCurrentStandardOffer(p,at,maxAgeMinutes)){
    result[label==="primary"?"staleOrUnsafePrimaryRows":"staleOrUnsafeBackupRows"]++;
    continue;
   }
   const key=safeKey(p),list=map.get(key)||[];
   list.push(p);map.set(key,list);
  }
  return map;
 };
 const a=mapFor(primary.rows,"primary"),b=mapFor(backup.rows,"backup");
 for(const [key,offers] of b){
  result.eligibleOfferCount++;
  if(offers.length!==1){result.ambiguousBackup++;result.ambiguousBackupKeys.push(key);continue;}
  const same=a.get(key)||[];
  if(!same.length){result.unmatchedBackup++;continue;}
  if(same.length!==1){result.ambiguousPrimary++;result.ambiguousBackupKeys.push(key);continue;}
  if(same[0].line===offers[0].line){result.matchedSameLine++;continue;}
  result.conflictingLine++;
  result.conflicts.push({key,
   independentPrimaryLine:same[0].line,independentBackupLine:offers[0].line,
   originalPlatformQuoteVerified:false});
 }
 return {...result,status:result.conflictingLine||result.ambiguousPrimary||
  result.ambiguousBackup?"provider_conflicts_need_review":
  result.matchedSameLine?"independent_line_agreement_observed":"no_comparable_quote_keys"};
}
function quarantineBackupRows(rows,audit){
 if(!Array.isArray(rows))throw Error("NHL backup rows required");
 if(audit?.comparisonPossible!==true)
  return {rows:rows.slice(),quarantined:0,comparisonUnavailable:true};
 const blocks=new Set([
  ...(audit.conflicts||[]).map(x=>x.key),
  ...(audit.ambiguousBackupKeys||[])
 ]);
 let quarantined=0;
 return {rows:rows.filter(x=>{
  if(x.tier!=="Standard")return true;
  if(blocks.has(safeKey(x))){quarantined++;return false;}
  return true;
 }),quarantined,comparisonUnavailable:false};
}
module.exports={safeKey,isCurrentStandardOffer,compareNhlPrizePicksSources,quarantineBackupRows};
