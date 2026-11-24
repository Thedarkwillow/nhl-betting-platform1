"use strict";
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const SOURCES=[
 "outputs/historical-prizepicks-api/nhl/asof",
 "outputs/free-source/nhl/snapshots"
];
const DEST=path.join(ROOT,"outputs/research/prizepicks-tier-evidence-latest.json");
function classify(row){
 const tier=String(row?.tier||"").toLowerCase();
 const observed=Date.parse(row?.observedAt),start=Date.parse(row?.eventStartsAt);
 const declared=String(row?.sourceFields?.oddsType||row?.pricing?.odds_type||"").toLowerCase();
 if(!["standard","goblin","demon"].includes(tier))return {tier:null,reason:"unknown_tier"};
 if(declared&&declared!==tier)return {tier:null,reason:"conflicting_tier_fields"};
 if(!["Higher","Lower"].includes(row.side)||tier!=="standard"&&row.side!=="Higher")
  return {tier:null,reason:"invalid_side"};
 if(!Number.isFinite(row.line)||!Number.isFinite(observed)||!Number.isFinite(start)||observed>=start)
  return {tier:null,reason:"unverified_pregame"};
 return {tier,reason:null};
}
function analyze(docs){
 const tiers={standard:0,goblin:0,demon:0},byMarket={},rejected={};
 let exactMultiplierRecords=0,rowsSeen=0,valid=0;
 const seen=new Set();
 for(const doc of docs){
  if(doc?.provider!=="prizepicksapi.com"||doc.completePagination!==true||!Array.isArray(doc.rows))
   continue;
  for(const row of doc.rows){
   const id=[row.projectionId,row.observedAt,row.line,row.tier,row.side].join("|");
   if(seen.has(id))continue;
   seen.add(id);rowsSeen++;
   const {tier,reason}=classify(row);
   if(!tier){rejected[reason]=(rejected[reason]||0)+1;continue;}
   valid++;tiers[tier]++;
   const market=String(row.market||"Unknown");
   if(!byMarket[market])byMarket[market]={standard:0,goblin:0,demon:0};
   byMarket[market][tier]++;
   if(row.tierPayoutVerified===true&&typeof row.payoutMultiplier==="number"&&
    Number.isFinite(row.payoutMultiplier))exactMultiplierRecords++;
  }
 }
 return {schemaVersion:1,generatedAt:new Date().toISOString(),
  dataSource:"prizepicksapi.com observed snapshots; independent provider",
  observedTierValues:tiers,byMarket,rowsSeen,validObservations:valid,rejected,
  exactMultiplierRecords,
  bySeason:{
   "2023-24":{originalOfferTierEvidence:"not_established"},
   "2024-25":{originalOfferTierEvidence:"not_established"},
   "2025-26":{originalOfferTierEvidence:"not_established_from_independent_SGO_closes"},
   "2026-27":{independentTierObservations:valid,coverageComplete:false}
  },
  earliestTierSnapshotSource:"2026-10-28",
  sourceIsOriginalPrizePicks:false,originalPayoutRulesVerified:false,
  intradayMovementComplete:false,oldSeasonTiersInferred:false,
  note:"Only observed historical selection tier fields are counted. Older missing seasons cannot be reconstructed with sportsbook fairOdds, alt lines, or an assumed multiplier. Records duplicated across snapshots are deduplicated by projection, observation, line, side and tier."};
}
function main(){
 const docs=[];
 for(const rel of SOURCES){
  const dir=path.join(ROOT,rel);
  if(!fs.existsSync(dir))continue;
  for(const name of fs.readdirSync(dir).filter(n=>n.endsWith(".json")).sort()){
   const obj=JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));docs.push(obj);
  }
 }
 const result=analyze(docs);
 fs.mkdirSync(path.dirname(DEST),{recursive:true});
 fs.writeFileSync(DEST,JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({snapshotsInspected:docs.length,observations:result.validObservations,
  tiers:result.observedTierValues,verifiedMultipliers:result.exactMultiplierRecords}));
}
if(require.main===module)main();
module.exports={classify,analyze};
