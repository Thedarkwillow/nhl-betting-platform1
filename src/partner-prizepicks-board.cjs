"use strict";
/**
 * Fail-closed converter for the 2026-11-08 private, directly observed
 * PrizePicks partner projection snapshots. Never reconstruct an earlier slot.
 * A source row's updated_at is a last-change time, NOT the observation time.
 * This module is not a network collector, model, payout or wager engine.
 */
const COLUMNS=Object.freeze([
 "projectionId","providerPlayerId","player","team","position",
 "providerGameId","gameExternalId","eventStartsAt","opponent",
 "market","line","tier","offeredWagerTypes","boardTime",
 "lineUpdatedAt","status","inGame","isLive","eventType",
 "period","groupKey","combo"
]);
const SOURCE="partner-api.prizepicks.com";
const MAX_AGE_MS=30*60*1000;
const validTime=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
function offeredSides(tier,access) {
 const t=String(tier||"").toLowerCase();
 if(!["standard","goblin","demon"].includes(t))return [];
 // Missing/unknown field is NOT evidence both sides are available.
 if(access==="under_or_over")return t==="standard"?["Higher","Lower"]:["Higher"];
 if(access==="over")return ["Higher"];
 if(access==="under")return t==="standard"?["Lower"]:[];
 return [];
}
function verifiedSlot(manifest){
 // Manual archives and genuine 06/09 Pacific archives have different proof.
 // Never label an out-of-hour, stale or below-inventory manual observation as
 // a full 6/9 AM capture while evaluating the SAME source rows.
 if(manifest?.notSixOrNineAmSlot===true)return manifest.captureSlotPacific==null;
 if(manifest?.notSixOrNineAmSlot!==false||
    !["06:00","09:00"].includes(manifest.captureSlotPacific)||
    manifest.actualCaptureInRequestedHour!==true||
    manifest.hasBelowMorningMinimumInventory!==false||
    !/^\d{4}-\d{2}-\d{2}$/.test(manifest.pacificDate||""))return false;
 const ps=t=>{
  const x=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
   year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",
   hourCycle:"h23"}).formatToParts(new Date(t));
  const d=Object.fromEntries(x.map(k=>[k.type,k.value]));
  return {day:d.year+"-"+d.month+"-"+d.day,hour:d.hour};
 };
 const a=ps(manifest.captureStartedUTC),b=ps(manifest.captureFinishedUTC),
  hour=manifest.captureSlotPacific.slice(0,2);
 return a.day===manifest.pacificDate&&b.day===a.day&&a.hour===hour&&b.hour===hour&&
  ["NHL","NFL"].every(s=>manifest.sports?.some(x=>x.sport===s&&
    Number.isInteger(x.rawCount)&&x.rawCount>0&&
    x.belowMorningMinimumInventory!==true&&
    x.missingPlayers===0&&x.missingGames===0));
}
function normalizeArchive(manifest,parts,{sport,now=new Date().toISOString()}={}) {
 if(!["NHL","NFL"].includes(sport)||manifest?.schemaVersion!==1||
  manifest?.source!==SOURCE||manifest?.snapshotMode!=="direct_live_board"||
  manifest?.completePagination!==true||!verifiedSlot(manifest)||
  JSON.stringify(manifest?.columns)!==JSON.stringify(COLUMNS)||
  !validTime(manifest?.captureStartedUTC)||!validTime(manifest?.captureFinishedUTC)||
  !validTime(now)||!Array.isArray(parts))throw Error("Untrusted partner archive manifest");
 const info=manifest.sports?.find(s=>s.sport===sport);
 if(!info||info.sourceObservedAt===undefined||!validTime(info.sourceObservedAt)||
  !Number.isInteger(info.rawCount)||info.rawCount<1||
  info.normalizedCount!==info.rawCount||
  !Number.isInteger(info.parts)||info.parts<1||parts.length!==info.parts||
  !info.source?.startsWith("https://partner-api.prizepicks.com/projections?"))
  throw Error("Incomplete partner source inventory");
 const captured=Date.parse(info.sourceObservedAt);
 const finished=Date.parse(manifest.captureFinishedUTC),started=Date.parse(manifest.captureStartedUTC);
 if(captured<started-60000||captured>finished+60000||finished<started||
  Date.parse(now)<finished-60000)throw Error("Partner capture chronology impossible");
 const age=Date.parse(now)-finished;
 const fresh=age>=0&&age<=MAX_AGE_MS;
 const ordered=[...parts].sort((a,b)=>a.startIndex-b.startIndex);
 const stored=[];let next=0;
 for(const chunk of ordered) {
  if(chunk?.sport!==sport||chunk.startIndex!==next||
   chunk.observedAtUTC!==info.sourceObservedAt||!Array.isArray(chunk.rows)||
   chunk.rows.length<1)throw Error("Missing, mismatched or reordered source chunk");
  for(const r of chunk.rows){
   if(!Array.isArray(r)||r.length!==COLUMNS.length)
    throw Error("Malformed partner projection row");
   stored.push(Object.fromEntries(COLUMNS.map((key,i)=>[key,r[i]])));
  }
  next+=chunk.rows.length;
 }
 if(next!==info.rawCount)throw Error("Partner source row count disagrees with archive");
 const unique=new Set(),reasons={},rows=[],periodResearchRows=[];
 const skip=k=>{reasons[k]=(reasons[k]||0)+1;};
 for(const r of stored) {
  if(typeof r.projectionId!=="string"||!r.projectionId||unique.has(r.projectionId))
   throw Error("Duplicate or missing original offer ID");
  unique.add(r.projectionId);
  if(!validTime(r.eventStartsAt)||!validTime(r.lineUpdatedAt)||
   Date.parse(r.lineUpdatedAt)>captured+60000||!Number.isFinite(r.line)){
   skip("invalid_time_or_line");continue;
  }
  if(r.isLive===true||r.inGame===true||r.status!=="pre_game"||
   Date.parse(r.eventStartsAt)<=captured||Date.parse(r.eventStartsAt)<=Date.parse(now)){
   skip("already_started_or_not_pregame");continue;
  }
  if(r.combo===true||r.eventType==="combo"||r.player?.includes(" + ")){
   skip("special_combo_requires_validation");continue;
  }
  const period=sport==="NFL"&&typeof r.period==="string"?require("./nfl-market-registry.cjs").classifyPeriod(r.period):null;
  const partial=sport==="NFL"&&period&&/^(quarter_[1-4]|half_[12])$/.test(period);
  if(r.period!=="Full"&&!partial){skip("segment_requires_separate_model");continue;}
  if(sport==="NFL"&&require("./nfl-market-registry.cjs").classifyMarket("prizepicks",r.market,{period:r.period}).reason==="conflicting_or_unknown_period_label"){skip("conflicting_period_label");continue;}
  if(typeof r.player!=="string"||!r.player.trim()||
   typeof r.team!=="string"||!/^[A-Z]{2,4}$/.test(r.team)||
   typeof r.opponent!=="string"||!/^[A-Z]{2,4}$/.test(r.opponent)||
   r.opponent===r.team||typeof r.market!=="string"||!r.market.trim()){
   skip("unresolved_player_or_opponent");continue;
  }
  const sides=offeredSides(r.tier,r.offeredWagerTypes);
  if(!sides.length){skip("unverified_offered_side");continue;}
  for(const side of sides){
   (partial?periodResearchRows:rows).push({
    projectionId:r.projectionId,providerPlayerId:r.providerPlayerId,
    providerGameId:r.providerGameId,player:r.player,team:r.team,
    matchup:r.opponent,market:r.market,line:r.line,
    period:partial?period:"Full game",tier:r.tier[0].toUpperCase()+r.tier.slice(1),
    side,isLive:false,capturedAt:info.sourceObservedAt,
    observedAt:r.lineUpdatedAt,eventStartsAt:r.eventStartsAt,
    source:"prizepicks_partner_direct",provider:SOURCE,
    sourceStatus:"fresh",originalPlatformAvailabilityVerified:false,
    originalTierPayoutVerified:false
   });
  }
 }
 return {
  schemaVersion:1,provider:SOURCE,sourceScope:"full_provider_board",
  sourceStatus:fresh?"fresh":"stale",snapshotMode:"direct_live_board",
  completePagination:true,boardAsOfAt:info.sourceObservedAt,
  generatedAt:manifest.captureFinishedUTC,sourceCapturedAt:info.sourceObservedAt,
  dataPlatform:"PrizePicks",sourceAuthenticatedFirstParty:false,
  originalPlatformAvailabilityVerified:false,originalPlatformSettlementVerified:false,
  originalModelSelectionGitFrozen:false,officialPregameSelection:false,
  rawOfferCount:stored.length,rows,periodResearchRows,
  normalization:{eligibleSideRows:rows.length,explicitNflPeriodResearchSideRows:periodResearchRows.length,skipped:reasons,
   totalOfferIDs:unique.size,ageMinutes:Math.max(0,Math.round(age/60000)),
   freshAtEvaluation:fresh,completedAt:manifest.captureFinishedUTC,
   sourceObservedAt:info.sourceObservedAt,
   completeSourceRowsVerified:true},
  caveat:"Partner endpoint original-time source; actual 6/9 Pacific archive only when manifest provenance verified. Not an authenticated region-specific app offer, payout quote, or frozen model selection."
 };
}
module.exports={COLUMNS,SOURCE,offeredSides,verifiedSlot,normalizeArchive};
