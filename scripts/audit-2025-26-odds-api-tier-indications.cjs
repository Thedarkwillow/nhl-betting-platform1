"use strict";
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"..");
const SAMPLE=path.join(ROOT,"outputs/the-odds-api/nhl/prizepicks-2025-26-opening-probe-latest.json");
const BACKFILL=path.join(ROOT,"outputs/the-odds-api/nhl/2025-26-fall-backfill/by-date");
const OUT=path.join(ROOT,"outputs/the-odds-api/nhl/2025-26-tier-indications-latest.json");
const read=file=>JSON.parse(fs.readFileSync(file,"utf8"));
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function classify({market,price,side}){
  const name=String(market||"");
  const isAlternate=name.endsWith("_alternate");
  if(!name.startsWith("player_"))
    return {indicatedTier:null,method:"unsupported_market",originalVerified:false};
  if(!isAlternate)
    return {indicatedTier:"Standard",method:"provider_standard_market_indicator_only",originalVerified:false};
  // According to The Odds API: PrizePicks Demons map to +100 and Goblins
  // map to provider-default odds. Mapping is indicative and NOT invertible
  // proof: an alternate market can also contain other ladder rungs.
  if(side!=="Over")
    return {indicatedTier:null,method:"alternate_non_over_unverified",originalVerified:false};
  if(price===100)
    return {indicatedTier:"Demon",method:"provider_even_odds_alternate_indicator_only",originalVerified:false};
  if(price===-137)
    return {indicatedTier:"Goblin",method:"provider_observed_default_odds_alternate_indicator_only",originalVerified:false};
  return {indicatedTier:null,method:"alternate_without_confirmed_price_mapping",originalVerified:false};
}
function rows(){
 const result=[];
 if(fs.existsSync(SAMPLE)){
  const sample=read(SAMPLE);
  for(const evt of sample.results||[]){
   for(const r of evt.datedOfferRecords||[]){
    result.push({season:evt.season,snapshotAt:evt.actualSnapshotTimestamp,
     gameStartsAt:evt.eventStart,eventId:evt.eventId,player:r.player,market:r.market,
     side:r.side,line:r.line,price:r.indicativePrice,source:"sample_2025_26",multiplier:r.sourceMultiplier});
   }
  }
 }
 if(fs.existsSync(BACKFILL)){
  for(const file of fs.readdirSync(BACKFILL).filter(f=>f.endsWith(".json")).sort()){
   const d=read(path.join(BACKFILL,file));
   if(d?.season!=="2025-26")continue;
   for(const evt of d.events||[]){
    if(evt.status!=="captured")continue;
    for(const r of evt.offers||[]){
     result.push({season:d.season,snapshotAt:r.oddsProviderObservedAt||evt.snapshotAt,
      gameStartsAt:evt.startAt,eventId:evt.id,player:r.player,market:r.market,
      side:r.side,line:r.line,price:r.indicativeAmericanPrice,
      source:"fall_2025_26",multiplier:r.sourceProvidedMultiplier});
    }
   }
  }
 }
 return result;
}
function summarize(input,generatedAt=new Date().toISOString()){
 const seen=new Set(),summary={Standard:0,Goblin:0,Demon:0,Unclassified:0},methods={},samples=[];
 let repeated=0,invalid=0,preGameObservations=0;
 for(const r of input){
  const observed=Date.parse(r.snapshotAt),start=Date.parse(r.gameStartsAt);
  if(r.season!=="2025-26"||r.side!=="Over"&&r.side!=="Under"||
     !Number.isFinite(observed)||!Number.isFinite(start)||observed>=start||
     !Number.isFinite(r.line)||!r.eventId||!r.player){invalid++;continue}
  const identity=[r.eventId,norm(r.player),r.market,r.side,r.line,r.price,r.snapshotAt].join("|");
  if(seen.has(identity)){repeated++;continue}
  seen.add(identity);preGameObservations++;
  const c=classify(r);
  const k=c.indicatedTier||"Unclassified";
  summary[k]++;methods[c.method]=(methods[c.method]||0)+1;
  if(samples.length<20)samples.push({
   eventId:r.eventId,observedAt:r.snapshotAt,gameStartsAt:r.gameStartsAt,
   player:r.player,market:r.market,line:r.line,side:r.side,price:r.price,
   source:r.source,providerIndicatedTier:c.indicatedTier,
   tierInferenceMethod:c.method,originalPrizePicksTierVerified:false,
   originalPrizePicksPayoutVerified:false,actualLineupSettlementVerified:false
  });
 }
 return {schemaVersion:1,generatedAt,season:"2025-26",
  archiveTypes:["The Odds API historical PrizePicks-labelled per-event odds"],
  officialMappingReference:"https://the-odds-api.com/sports-odds-data/bookmaker-apis.html",
  originalHistoricalTierVerification:false,
  uniquePregamePriceLineObservations:preGameObservations,duplicatesAcrossSources:repeated,
  invalidOrPostStartObservations:invalid,providerIndicatedTierCounts:summary,classificationMethods:methods,
  exactPrizePicksPayoutMultipliersVerified:0,
  originalPlatformOfferIdsVerified:false,
  originalIntradayChangeLogVerified:false,
  recordsEligibleForTierSpecificEV:0,
  dataIncomplete:true,
  caution:"Provider maps PrizePicks goblins to default odds and demons to +100 in alternate markets. This is a heuristic indicator in archived odds, NOT proof of original tier; +100 can occur in an alternate ladder with uncertain base-line role. Standard requires original standard-market record. No true original PrizePicks payout, settlement, or complete intraday changes verified. Never treat counts as distinct players or offered slips.",
  examples:samples};
}
function main(){
 const result=summarize(rows());
 fs.mkdirSync(path.dirname(OUT),{recursive:true});
 fs.writeFileSync(OUT,JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({status:"complete",observations:result.uniquePregamePriceLineObservations,
  candidates:result.providerIndicatedTierCounts,duplicates:result.duplicatesAcrossSources,paidCalls:0}));
}
if(require.main===module)main();
module.exports={classify,summarize};
