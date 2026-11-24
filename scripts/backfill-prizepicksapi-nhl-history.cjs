"use strict";
const {assertPrizePicksApiAllowed}=require("../src/prizepicksapi-november-quota-lock.cjs");
const fs = require("node:fs");
const path = require("node:path");
const {normalizeProjections} = require("../src/prizepicksapi-normalize.cjs");
const ROOT = path.resolve(__dirname, "../outputs/historical-prizepicks-api/nhl");
const DEFAULT_DATES = ["2026-10-28","2026-10-29","2026-10-30","2026-10-31","2026-11-01"];
const MAX_REQUESTS = 85, MAX_PAGES = 22;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function datesToArchive(raw = "") {
 const dates = raw ? raw.split(",").map(x => x.trim()) : DEFAULT_DATES;
 if (!dates.length || dates.length > 5 || new Set(dates).size !== dates.length) throw Error("Specify 1-5 distinct dates");
 for (const d of dates) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d+"T00:00:00Z")) ||
      d < "2026-10-28") throw Error("Invalid or pre-archive date: "+d);
  if (Date.parse(d+"T21:00:00Z") >= Date.now()-3600000) throw Error("As-of date not safely historical: "+d);
 }
 return dates;
}
function prepareHistoricalBoard(offers,asOf,retrievedAt) {
 const at = Date.parse(asOf), fetched = Date.parse(retrievedAt);
 if (!Array.isArray(offers) || !Number.isFinite(at) || !Number.isFinite(fetched) || fetched <= at)
  throw Error("Invalid retrospective archive inputs");
 const eligible = offers.filter(p=>{
  const observed=Date.parse(p?.observed_at),starts=Date.parse(p?.event?.starts_at);
  return Number.isFinite(observed) && observed <= at && Number.isFinite(starts) &&
   starts > at && starts <= at + 24*3600000;
 });
 const parsed=normalizeProjections(eligible,asOf);
 const byId=new Map(eligible.map(p=>[p.id,p]));
 const rows=parsed.rows.map(row=>{
  const p=byId.get(row.projectionId);
  return {...row, capturedAt:retrievedAt,archiveRetrievedAt:retrievedAt,boardAsOf:asOf,
   firstSeenAt:p?.first_seen_at??null,providerPlayerId:p?.player?.id??null,
   sourceFields:p?.source_fields?{
    oddsType:p.source_fields.odds_type??null,adjustedOdds:p.source_fields.adjusted_odds??null,
    isPromo:p.source_fields.is_promo??null}:null,
   pricing:p?.pricing??null,retrospectiveSource:true,verifiedProspectivePrediction:false,
   verifiedClosingLine:false,officialResultVerified:false};
 });
 return {rows,eligibleOffers:eligible.length,skipped:parsed.skipped};
}
async function getHistoricalBoard(asOf,key,{fetchPage,pause=sleep,budget={calls:0}}={}) {
 if (!fetchPage) fetchPage=async cursor=>{
  const url=new URL("https://prizepicksapi.com/api/v1/board");
  url.searchParams.set("as_of",asOf);url.searchParams.set("league","NHL");
  url.searchParams.set("limit","200");
  if (cursor) url.searchParams.set("cursor",cursor);
  const response=await fetch(url,{headers:{Authorization:"Bearer "+key,Accept:"application/json"},
   signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw Error("Historical NHL board HTTP "+response.status+
   (response.status===429?" (quota limited; no retry)":""));
  return response.json();
 };
 const offers=[],seenCursors=new Set();
 let cursor=null,pages=0;
 while(true){
  if(pages>=MAX_PAGES || budget.calls>=MAX_REQUESTS) throw Error("Request cap or pagination cap reached; incomplete date not archived");
  if(budget.calls>0) await pause(6500);
  budget.calls++;
  const page=await fetchPage(cursor),meta=page?.meta;
  if(meta?.mode!=="live"||!Array.isArray(page?.data)||Date.parse(meta.as_of)!==Date.parse(asOf)||
    !Number.isFinite(Date.parse(meta.collection_started_at))||
    Date.parse(meta.collection_started_at)>Date.parse(asOf))
   throw Error("Invalid historical board metadata / collection window");
  offers.push(...page.data);pages++;
  const next=meta.next_cursor;
  if(next==null||next==="")break;
  if(typeof next!=="string"||seenCursors.has(next))throw Error("Invalid or repeated page cursor");
  seenCursors.add(next);cursor=next;
 }
 return {offers,pages};
}
async function main(){
 assertPrizePicksApiAllowed();
 const key=process.env.PRIZEPICKSAPI_KEY;
 if(!key)throw Error("PRIZEPICKSAPI_KEY GitHub secret missing; no requests made");
 const dates=datesToArchive(process.env.BACKFILL_DATES||"");
 const directory=path.join(ROOT,"asof");
 fs.mkdirSync(directory,{recursive:true});
 const fetched=new Date().toISOString(),budget={calls:0},added=[],reused=[],errors=[];
 for(const date of dates){
  const file=path.join(directory,date+"T21-00Z.json");
  if(fs.existsSync(file)){
   const existing=JSON.parse(fs.readFileSync(file,"utf8"));
   if(existing.status==="complete_paginated_board_snapshot"){
    reused.push({date,rows:existing.rows?.length||0});continue;
   }
  }
  const asOf=date+"T21:00:00.000Z";
  try{
   const {offers,pages}=await getHistoricalBoard(asOf,key,{budget});
   const parsed=prepareHistoricalBoard(offers,asOf,fetched);
   const report={schemaVersion:1,status:"complete_paginated_board_snapshot",
    season:"2026-27",league:"NHL",provider:"prizepicksapi.com",
    source:"independent_retrospective_board",asOf,retrievedAt:fetched,
    offersOnBoard:offers.length,eligiblePregameOffers:parsed.eligibleOffers,
    rows:parsed.rows,skipped:parsed.skipped,pages,paginationComplete:true,
    fullSeasonCovered:false,sourceNotOfficial:true,verifiedClosingLines:false,
    prospectivePredictions:false,
    warning:"Third-party board reconstructed retrospectively at one time. It is not a pregame model prediction, complete season, verified closing line, or verified result."};
   fs.writeFileSync(file,JSON.stringify(report)+"\n");
   added.push({date,offers:offers.length,rows:parsed.rows.length,pages});
   console.log(JSON.stringify(added.at(-1)));
  }catch(e){errors.push({date,message:e.message});console.error(e.message);break;}
 }
 const coverage={generatedAt:new Date().toISOString(),season:"2026-27",
  earliestSupportedNhlDate:"2026-10-28",requestedDates:dates,newlyCollected:added,
  previouslyCollected:reused,errors,requestsUsed:budget.calls,requestCap:MAX_REQUESTS,
  storedSnapshots:fs.readdirSync(directory).filter(f=>/^\d{4}-\d{2}-\d{2}T21-00Z\.json$/.test(f)).length,
  fullSeasonCovered:false,modelAccuracyChanged:false,
  covers2025_26:false,oddspapiUnchanged:true,
  warning:"One 21:00 UTC snapshot per date: early games and other as-of times omitted; snapshots must be graded and audited separately."};
 fs.writeFileSync(path.join(ROOT,"coverage-latest.json"),JSON.stringify(coverage,null,2)+"\n");
 console.log(JSON.stringify({new:added.length,reused:reused.length,errors:errors.length,calls:budget.calls}));
 if(errors.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={datesToArchive,prepareHistoricalBoard,getHistoricalBoard};
