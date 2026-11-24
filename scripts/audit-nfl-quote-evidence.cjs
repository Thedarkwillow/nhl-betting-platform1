"use strict";
/**
 * Audit authentic NFL offered-line evidence separately from independent
 * partner-API board observations. Partner snapshots are useful for research
 * and line history, but are NOT authenticated app offers or verified
 * PrizePicks/Underdog settlements.
 */
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
function jsonFiles(dir,cap=10000){
 if(!fs.existsSync(dir))return [];
 const out=[],stack=[dir];
 while(stack.length){
  const d=stack.pop();
  for(const ent of fs.readdirSync(d,{withFileTypes:true})){
   if(out.length>=cap)throw Error("NFL quote scan cap exceeded");
   const full=path.join(d,ent.name);
   if(ent.isDirectory())stack.push(full);
   else if(ent.isFile()&&ent.name.endsWith(".json"))out.push(full);
  }
 }
 return out.sort();
}
function partnerObservationAudit(root){
 const base=path.join(root,"outputs/manual-board-captures");
 const result={captureCount:0,completeCaptureCount:0,
  partnerObservedRows:0,uniqueOfferRowsWithinCaptures:0,
  duplicateOfferRowsWithinCaptures:0,distinctPlayersAcrossCaptures:null,
  distinctGamesAcrossCaptures:null,marketCounts:{},tierCounts:{},
  captureSlotsPacific:{},firstCaptureUTC:null,lastCaptureUTC:null,
  firstPartyAuthenticatedCaptures:0,originalRawResponseStoredCaptures:0,
  completePaginationVerifiedCaptures:0,
  eligibleAuthenticatedPlatformOffers:0,
  interpretation:"Partner API observations only. They are not authenticated original app offers, do not prove platform settlement, and cannot be used for verified PrizePicks/Underdog hit rate or EV."};
 if(!fs.existsSync(base))return result;
 const players=new Set(),games=new Set(),captures=[];
 for(const day of fs.readdirSync(base).sort()){
  const dayDir=path.join(base,day);
  if(!fs.statSync(dayDir).isDirectory())continue;
  for(const name of fs.readdirSync(dayDir).sort()){
   const dir=path.join(dayDir,name),manifestPath=path.join(dir,"manifest.json");
   if(!fs.statSync(dir).isDirectory()||!fs.existsSync(manifestPath))continue;
   let manifest;
   try{manifest=JSON.parse(fs.readFileSync(manifestPath,"utf8"));}catch{continue;}
   if(manifest.kind!=="actual_time_private_partner_offer_observations"||
      manifest.source!=="partner-api.prizepicks.com"||
      !Array.isArray(manifest.columns)||!manifest.sports?.some(s=>s.sport==="NFL"))continue;
   result.captureCount++;
   const n=manifest.sports.find(s=>s.sport==="NFL");
   if(manifest.completePagination===true&&Number.isInteger(n.rawCount)&&n.rawCount===n.normalizedCount)
    result.completeCaptureCount++;
   if(manifest.sourceAuthenticatedFirstParty===true)result.firstPartyAuthenticatedCaptures++;
   if(manifest.originalSourceRawResponseStored===true)result.originalRawResponseStoredCaptures++;
   if(manifest.completePagination===true)result.completePaginationVerifiedCaptures++;
   const slot=manifest.captureSlotPacific||"unknown";
   result.captureSlotsPacific[slot]=(result.captureSlotsPacific[slot]||0)+1;
   const at=manifest.captureFinishedUTC;
   if(Number.isFinite(Date.parse(at)))captures.push(at);
   const ix=Object.fromEntries(manifest.columns.map((x,i)=>[x,i]));
   const files=fs.readdirSync(dir).filter(x=>/^nfl-\d+\.json$/.test(x)).sort();
   const local=new Set();
   for(const file of files){
    let chunk;try{chunk=JSON.parse(fs.readFileSync(path.join(dir,file),"utf8"));}catch{continue;}
    if(!Array.isArray(chunk.rows))continue;
    for(const row of chunk.rows){
     if(!Array.isArray(row)||row.length<manifest.columns.length)continue;
     const get=k=>row[ix[k]];
     const market=String(get("market")??"").trim();
     const tier=String(get("tier")??"").trim().toLowerCase();
     const line=Number(get("line"));
     if(!market||get("line")===null||get("line")===undefined||!Number.isFinite(line))continue;
     result.partnerObservedRows++;
     const player=String(get("providerPlayerId")??"");
     const game=String(get("providerGameId")??"");
     if(player)players.add(player);
     if(game)games.add(game);
     result.marketCounts[market]=(result.marketCounts[market]||0)+1;
     result.tierCounts[tier||"unknown"]=(result.tierCounts[tier||"unknown"]||0)+1;
     const key=[get("projectionId"),player,game,market,line,tier,
      get("period"),get("groupKey")].map(x=>String(x??"")).join("|");
     if(local.has(key)){result.duplicateOfferRowsWithinCaptures++;continue;}
     local.add(key);
     result.uniqueOfferRowsWithinCaptures++;
    }
   }
  }
 }
 result.distinctPlayersAcrossCaptures=players.size;
 result.distinctGamesAcrossCaptures=games.size;
 captures.sort();
 result.firstCaptureUTC=captures[0]||null;
 result.lastCaptureUTC=captures.at(-1)||null;
 // These files are partner observations, so authenticated app offers remain zero.
 result.eligibleAuthenticatedPlatformOffers=0;
 return result;
}
function audit(root=ROOT){
 const specs=[
  {platform:"prizepicks",dir:"outputs/nfl/boards"},
  {platform:"underdog",dir:"outputs/nfl/underdog"},
  {platform:"underdog",dir:"outputs/underdog/nfl"},
  {platform:"prizepicks",dir:"outputs/nfl/prizepicks-history"},
 ];
 const discovered=[],invalid=[],byPlatform={prizepicks:0,underdog:0};
 for(const spec of specs){
  for(const file of jsonFiles(path.join(root,spec.dir))){
   let d;try{d=JSON.parse(fs.readFileSync(file,"utf8"));}
   catch{invalid.push({platform:spec.platform,reason:"invalid_json",path:path.relative(root,file)});continue;}
   if(d?.sport&&d.sport!=="NFL"||d?.league&&d.league!=="NFL"){
    invalid.push({platform:spec.platform,reason:"non_nfl",path:path.relative(root,file)});continue;
   }
   const offers=Array.isArray(d.offers)?d.offers:null;
   if(!offers){
    invalid.push({platform:spec.platform,reason:"no_original_individual_offers",
     path:path.relative(root,file)});continue;
   }
   const valid=offers.filter(o=>Number.isFinite(Number(o.line))&&o.line!==null&&
    Number.isFinite(Date.parse(o.observedAt))&&
    Number.isFinite(Date.parse(o.startsAt))&&
    Date.parse(o.observedAt)<Date.parse(o.startsAt)&&
    o.platformOfferAuthenticated===true&&
    o.modelPredictionFrozenBeforeStart===true);
   byPlatform[spec.platform]+=valid.length;
   discovered.push({platform:spec.platform,path:path.relative(root,file),
    offers:offers.length,fullyVerifiedPregameMatchedOffers:valid.length,
    partialOrUnauthenticated:offers.length-valid.length});
  }
 }
 const partner=partnerObservationAudit(root);
 return {schemaVersion:2,kind:"nfl_offered_line_2026_validation_gate_v1",
  generatedAt:new Date().toISOString(),
  quoteFileCount:discovered.length,rawEligibleProspectiveByPlatform:byPlatform,
  partnerObservationAudit:partner,
  prizePicksHistoricalHitRate:null,underdogHistoricalHitRate:null,
  alwaysHigherAndAlwaysLowerMatchedLineBaseline:null,
  actualPostedLineExpectedValue:null,
  canReportVerifiedEdge:false,
  reason:"Requires authenticated original platform quote + frozen matched model for identical event/player/market. Partner API board captures are counted separately as unauthenticated observations; they do not satisfy app-offer or settlement verification.",
  files:discovered,excludedFiles:invalid};
}
if(require.main===module){
 const r=audit();
 const dir=path.join(ROOT,"outputs/nfl/backtests");
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,"posted-line-evidence-audit.json"),JSON.stringify(r,null,2)+"\n");
 console.log(JSON.stringify({kind:r.kind,quoteFileCount:r.quoteFileCount,
  partnerObservedRows:r.partnerObservationAudit.partnerObservedRows,
  authenticatedOffers:r.rawEligibleProspectiveByPlatform,
  genuineBettingEdgeVerified:false,generatedAt:r.generatedAt}));
}
module.exports={audit,jsonFiles,partnerObservationAudit};
