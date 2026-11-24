"use strict";
/**
 * P08-02 / P08-03: private, offline replay of already archived independent NHL boards.
 * No network, no platform authentication, no payouts and no wagering.
 * Raw original board files stay separate; normalized observations and changes
 * are content-addressed and written once, never modified in place.
 */
const fs=require("node:fs"),path=require("node:path");
const {createHash}=require("node:crypto");
const sha=value=>createHash("sha256").update(typeof value==="string"?value:JSON.stringify(value)).digest("hex");
const validTime=x=>typeof x==="string"&&Number.isFinite(Date.parse(x));
const clean=x=>typeof x==="string"?x.trim():"";
const identity=r=>JSON.stringify([clean(r.projectionId),clean(r.tier),clean(r.side),clean(r.period)]);
function normalizeSnapshot(board,rawArchivePath){
 if(!board||board.provider!=="prizepicksapi.com"||
    board.completePagination!==true||board.sourceStatus!=="fresh"||
    !validTime(board.generatedAt)||!Array.isArray(board.rows)||!board.rows.length)
  throw Error("A complete, fresh, dated independent provider board is required");
 if(!/^[a-zA-Z0-9_./-]+\.json$/.test(rawArchivePath||"")||
    rawArchivePath.includes(".."))throw Error("Unsafe raw archive path");
 const normalized=[],seen=new Map();
 for(const row of board.rows){
  if(!clean(row?.projectionId)||!clean(row?.player)||!clean(row?.team)||
     !clean(row?.market)||!clean(row?.side)||!clean(row?.tier)||
     !["higher","lower"].includes(row.side.toLowerCase())||
     !Number.isFinite(row.line)||!validTime(row.eventStartsAt))
   throw Error("Incomplete/ambiguous independent-source offer; refuse derived archive");
  const key=identity(row);
  if(seen.has(key))throw Error("Duplicate source offer identity inside complete snapshot");
  seen.set(key,true);
  normalized.push({sourceOfferKey:sha(key),sourceOfferId:row.projectionId,
   player:row.player,team:row.team,playerId:Number.isInteger(row.playerId)?row.playerId:null,
   market:row.market,period:row.period||"Full game",tier:row.tier,side:row.side,
   line:row.line,eventStartsAt:row.eventStartsAt,matchup:row.matchup||null,
   sourceObservedAt:validTime(row.observedAt)?row.observedAt:null,
   provider:"prizepicksapi.com",originalPrizePicksAuthenticated:false,
   confirmedOriginalPlatformAvailability:false});
 }
 normalized.sort((a,b)=>a.sourceOfferKey.localeCompare(b.sourceOfferKey));
 const contentHash=sha(board);
 const snapshotId=sha([board.provider,board.generatedAt,contentHash]);
 return {snapshotId,generatedAt:board.generatedAt,rawArchivePath,rawContentSha256:contentHash,
  source:"independent_prizepicksapi_nhl",originalPlatformAuthenticated:false,
  completePagination:true,offerCount:normalized.length,offers:normalized};
}
function buildLedger(archives){
 if(!Array.isArray(archives))throw Error("Archived board list required");
 const snapshots=archives.map(x=>normalizeSnapshot(x.board,x.path)).sort((a,b)=>
  Date.parse(a.generatedAt)-Date.parse(b.generatedAt)||a.snapshotId.localeCompare(b.snapshotId));
 const observed=new Set(),items=[],coverage=[];
 let previous=null;
 for(const snap of snapshots){
  if(observed.has(snap.snapshotId))continue;
  observed.add(snap.snapshotId);
  const before=new Map((previous?.offers||[]).map(o=>[o.sourceOfferKey,o]));
  const now=new Map(snap.offers.map(o=>[o.sourceOfferKey,o]));
  const events=[];
  for(const next of snap.offers){
   const old=before.get(next.sourceOfferKey);
   const type=!old?"first_observed_in_archive":old.line!==next.line?
    "observed_line_change":null;
   if(type)events.push({eventId:sha([snap.snapshotId,next.sourceOfferKey,type]),
    type,sourceOfferKey:next.sourceOfferKey,priorLine:old?.line??null,
    currentLine:next.line,observedAt:snap.generatedAt,
    verifiedOriginalPlatformChange:false});
  }
  for(const old of before.values()){
   if(!now.has(old.sourceOfferKey))events.push({
    eventId:sha([snap.snapshotId,old.sourceOfferKey,"not_seen_in_this_source_snapshot"]),
    type:"not_seen_in_this_source_snapshot",sourceOfferKey:old.sourceOfferKey,
    priorLine:old.line,currentLine:null,observedAt:snap.generatedAt,
    verifiedOriginalPlatformChange:false});
  }
  events.sort((a,b)=>a.eventId.localeCompare(b.eventId));
  const observations=snap.offers.map(o=>({...o,
   observationId:sha([snap.snapshotId,o.sourceOfferKey]),snapshotId:snap.snapshotId}));
  items.push({snapshot:{snapshotId:snap.snapshotId,generatedAt:snap.generatedAt,
    source:snap.source,rawArchivePath:snap.rawArchivePath,rawContentSha256:snap.rawContentSha256,
    originalPlatformAuthenticated:false,completePagination:true,
    offerCount:snap.offerCount,previousSnapshotId:previous?.snapshotId||null},
   observations,events});
  const markets={};
  for(const o of snap.offers)markets[o.market]=(markets[o.market]||0)+1;
  coverage.push({snapshotId:snap.snapshotId,observedAt:snap.generatedAt,
   offers:snap.offerCount,markets,previousSnapshotId:previous?.snapshotId||null,
   intervalMinutes:previous?Math.round((Date.parse(snap.generatedAt)-Date.parse(previous.generatedAt))/60000):null});
  previous=snap;
 }
 return {schemaVersion:1,kind:"private_offline_immutable_nhl_provider_board_ledger_v1",
  rawSourceRowsNeverPublished:true,originalPrizePicksAuthenticated:false,
  verifiedOriginalPlatformRemovals:0,providerCalls:0,paidCredits:0,
  snapshots:items,coverage};
}
function writeImmutable(filename,doc){
 fs.mkdirSync(path.dirname(filename),{recursive:true});
 const data=JSON.stringify(doc,null,2)+"\n";
 try{fs.writeFileSync(filename,data,{flag:"wx",mode:0o600});return "new";}
 catch(e){
  if(e.code!=="EEXIST")throw e;
  if(fs.readFileSync(filename,"utf8")!==data)
   throw Error("Immutable ledger collision: "+path.basename(filename));
  return "unchanged";
 }
}
function persistLedger(root,ledger){
 if(!root||!path.isAbsolute(root)||ledger?.kind!=="private_offline_immutable_nhl_provider_board_ledger_v1")
  throw Error("Absolute private ledger directory and validated offline replay required");
 const status={newFiles:0,unchangedFiles:0,snapshots:ledger.snapshots.length};
 for(const item of ledger.snapshots){
  const id=item.snapshot.snapshotId;
  for(const [subdir,doc] of [["snapshots",item.snapshot],["normalized",item.observations],
    ["events",item.events]]){
   const result=writeImmutable(path.join(root,subdir,id+".json"),doc);
   status[result==="new"?"newFiles":"unchangedFiles"]++;
  }
 }
 return status;
}
module.exports={normalizeSnapshot,buildLedger,persistLedger,sha};
