"use strict";
/**
 * Import the separately archived 2026-11-08 09:03 Pacific partner response.
 * Original evidence is mixed: NHL object arrays, NFL compact 21-column arrays.
 * Validate every stored source offer before adapting to the already-tested
 * strict 22-column private partner normalization path. Never rewrite evidence.
 * A nine-o'clock-HOUR capture is not an exact 09:00 snapshot or an app quote.
 */
const {COLUMNS,normalizeArchive,SOURCE}=require("./partner-prizepicks-board.cjs");
const NFL_COLUMNS=Object.freeze([
 "projectionId","providerPlayerId","player","team","position",
 "providerGameId","eventStartsAt","opponent","market","line","tier",
 "offeredWagerTypes","boardTime","lineUpdatedAt","status","inGame",
 "isLive","eventType","durationId","combo","groupKey"
]);
const LEAGUE_IDS=Object.freeze({NHL:8,NFL:9});
const FORMATS=Object.freeze({NHL:"object_rows",NFL:"compact_21_columns"});
const isTime=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
function pacificHour(timestamp){
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",hour:"2-digit",hourCycle:"h23"
 }).formatToParts(new Date(timestamp));
 return Number(parts.find(p=>p.type==="hour")?.value);
}
function convertCompactArchive(manifest,parts,{sport,now=new Date().toISOString(),metadata=null}={}){
 if(!has(LEAGUE_IDS,sport)||!Array.isArray(parts)||!isTime(now)||
  manifest?.schemaVersion!==1||manifest?.source!==SOURCE||
  manifest?.kind!=="actual_time_private_partner_offer_observations"||
  manifest?.snapshotMode!=="direct_live_board_compact_mixed_formats"||
  manifest?.completePagination!==true||
  manifest?.captureWithinNineAmPacificWindow!==true||
  manifest?.exactNineAmInstantCertified!==false||
  manifest?.sourceAuthenticatedFirstParty!==false||
  !isTime(manifest?.captureStartedUTC)||!isTime(manifest?.captureFinishedUTC)||
  pacificHour(manifest.captureStartedUTC)!==9||
  pacificHour(manifest.captureFinishedUTC)!==9)
  throw Error("Untrusted or non-09-hour compact partner manifest");
 const start=Date.parse(manifest.captureStartedUTC),end=Date.parse(manifest.captureFinishedUTC);
 if(start>end||Date.parse(now)<end-60000)
  throw Error("Impossible compact partner capture chronology");
 const info=manifest.sports?.find(s=>s.sport===sport);
 if(manifest.sports?.length!==2||
  !manifest.sports.some(s=>s.sport==="NHL")||
  !manifest.sports.some(s=>s.sport==="NFL")||
  !info||info.leagueId!==LEAGUE_IDS[sport]||info.format!==FORMATS[sport]||
  info.completePagination!==true||!isTime(info.sourceObservedAt)||
  Date.parse(info.sourceObservedAt)<start-60000||
  Date.parse(info.sourceObservedAt)>end+60000||
  !Number.isInteger(info.rawCount)||info.rawCount<1||
  info.normalizedCount!==info.rawCount||
  !Number.isInteger(info.parts)||info.parts<1||parts.length!==info.parts)
  throw Error("Incomplete compact partner source inventory");
 if(sport==="NFL"&&(
  metadata?.schemaVersion!==1||metadata?.source!==SOURCE||
  metadata?.leagueId!==9||metadata?.sourceCount!==info.rawCount||
  metadata?.parts!==info.parts||metadata?.completePagination!==true||
  metadata?.sourceMeta?.current_page!==1||
  metadata?.sourceMeta?.total_pages!==1||
  JSON.stringify(metadata.columns)!==JSON.stringify(NFL_COLUMNS)||
  metadata.captureStartedUTC!==undefined&&
   (!isTime(metadata.captureStartedUTC)||Date.parse(metadata.captureStartedUTC)<start-60000)||
  metadata.captureFinishedUTC!==undefined&&metadata.captureFinishedUTC!==manifest.captureFinishedUTC
 ))throw Error("NFL compact column metadata mismatch");
 const chunks=[];let offset=0;
 for(const part of parts){
  if(!Array.isArray(part)||part.length<1||part.length>1000)
   throw Error("Missing or oversized compact source chunk");
  const rows=[];
  for(const r of part){
   if(sport==="NHL"){
    if(!r||typeof r!=="object"||Array.isArray(r)||
     COLUMNS.some(key=>!has(r,key)))
     throw Error("Incomplete NHL source object");
    // The object archive spells the complete segment "Full game"; the
    // original 22-column adapter's canonical segment label is "Full".
    rows.push(COLUMNS.map(key=>key==="period"&&
     (r.period==="Full game"||r.period==="Full Game")?"Full":r[key]));
   }else{
    if(!Array.isArray(r)||r.length!==NFL_COLUMNS.length)
     throw Error("Malformed 21-column NFL source offer");
    const v=Object.fromEntries(NFL_COLUMNS.map((key,i)=>[key,r[i]]));
    // NFL metadata does not contain gameExternalId; never manufacture one.
    rows.push(COLUMNS.map(key=>key==="gameExternalId"?null:
     key==="period"?(v.durationId==="11"?"Full":null):v[key]));
   }
  }
  chunks.push({sport,startIndex:offset,observedAtUTC:info.sourceObservedAt,rows});
  offset+=rows.length;
 }
 if(offset!==info.rawCount)throw Error("Truncated compact source offer archive");
 // This adapter-only contract reuses the strict legacy side/time/ID filters.
 // It is NOT an archive manifest, and does not overwrite the captured manifest.
 const adapterManifest={
  schemaVersion:1,source:SOURCE,snapshotMode:"direct_live_board",
  completePagination:true,notSixOrNineAmSlot:true,
  captureStartedUTC:manifest.captureStartedUTC,
  captureFinishedUTC:manifest.captureFinishedUTC,columns:COLUMNS,
  sports:[{...info,source:
   "https://partner-api.prizepicks.com/projections?league_id="+LEAGUE_IDS[sport]}]
 };
 const board=normalizeArchive(adapterManifest,chunks,{sport,now});
 return {...board,archiveFormat:info.format,
  captureWithinNineAmPacificWindow:true,exactNineAmInstantCertified:false,
  originalCaptureManifestMode:manifest.snapshotMode,
  caveat:"Actual 09:03 Pacific partner source observation, NOT an exact 09:00 board, authenticated PrizePicks app availability, tier payout, calibrated prediction or pre-game Git-frozen selection."};
}
module.exports={NFL_COLUMNS,convertCompactArchive};
