"use strict";
const fs=require("node:fs"),path=require("node:path");
const URL_BASE="https://api.sportsgameodds.com/v2/events";
const OUT=path.resolve(__dirname,"../outputs/sportsgameodds/nhl/historical-pro-probe-latest.json");
const WINDOWS=[
 {season:"2024-25",from:"2024-10-15T00:00:00Z",to:"2024-10-17T00:00:00Z"},
 {season:"2025-26",from:"2025-11-01T00:00:00Z",to:"2025-11-03T00:00:00Z"},
 {season:"2025-26",from:"2026-01-15T00:00:00Z",to:"2026-01-17T00:00:00Z"},
 {season:"2025-26",from:"2026-02-03T00:00:00Z",to:"2026-02-05T00:00:00Z"},
 {season:"2026-27",from:"2026-10-28T00:00:00Z",to:"2026-10-30T00:00:00Z"}
];
const BOOKS=["prizepicks","underdog","fanduel","draftkings"];
const {NHL_STAT_TO_MARKET:MARKETS,bookmakerCloseLine}=require("../src/sgo-nhl-contract.cjs");
const finite=x=>x!==null&&x!==undefined&&x!==""&&Number.isFinite(Number(x))?Number(x):null;
function archiveClosingLines(event,season){
 const rows=[],counts={trackedOdds:0,closingLineValues:0,missingClosingLine:0,
  prizepicksBooks:0,underdogBooks:0,otherBooks:0};
 const eventStart=Date.parse(event?.status?.startsAt);
 if(event?.leagueID!=="NHL"||!Number.isFinite(eventStart)||!event?.eventID)return {rows,counts};
 const players=event.players||{};
 const pairMap=new Map();
 for(const odd of Object.values(event.odds||{})){
  if(odd?.periodID!=="game"||odd?.betTypeID!=="ou"||
   !["over","under"].includes(odd.sideID)||!MARKETS[odd.statID])continue;
  const pid=String(odd.playerID||odd.statEntityID||"");
  if(!pid||["all","home","away"].includes(pid))continue;
  const player=players[pid]?.name||null;
  if(!player)continue;
  for(const book of BOOKS){
   const quote=odd.byBookmaker?.[book];
   if(!quote)continue;
   counts.trackedOdds++;
   const closing=bookmakerCloseLine(quote);
   if(closing===null||closing<0){counts.missingClosingLine++;continue;}
   counts.closingLineValues++;
   // Strictly the provider's declared pregame close. NEVER use byBookmaker.overUnder
   // on completed games: that can be a live/in-game final observation.
   const key=[event.eventID,pid,MARKETS[odd.statID],closing,book].join("|");
   if(!pairMap.has(key))pairMap.set(key,{
    source:"SportsGameOdds historical close",season,eventId:event.eventID,
    eventStartsAt:event.status.startsAt,homeTeam:event.teams?.home?.names?.long||null,
    awayTeam:event.teams?.away?.names?.long||null,player,providerPlayerId:pid,
    market:MARKETS[odd.statID],statID:odd.statID,line:closing,book,
    closeField:"closeOverUnder",closingLineSourcePresent:true,
    isHistorical:true,providerClaimsPregameClose:true,
    verifiedPrizePicksOriginalOffer:false,verifiedPrizePicksTier:false,
    verifiedProspectivePrediction:false,preStartTimestamp:null,
    tier:"unverified",payoutMultiplier:null,officialResultVerified:false,
    higherPrice:null,lowerPrice:null
   });
   const r=pairMap.get(key),side=odd.sideID==="over"?"higherPrice":"lowerPrice";
   // Prices are ordinary book odds, not PrizePicks pick'em payout multipliers.
   const price=String(quote.closeOdds||"").trim();
   if(/^[+-]?\d{3,6}$/.test(price))r[side]=Number(price);
  }
 }
 for(const item of pairMap.values()){
  rows.push(item);
  if(item.book==="prizepicks")counts.prizepicksBooks++;
  else if(item.book==="underdog")counts.underdogBooks++;
  else counts.otherBooks++;
 }
 return {rows,counts};
}
function summarizeResponse(response,window,retrievedAt){
 if(response?.success!==true||!Array.isArray(response.data))throw Error("Invalid SportsGameOdds response");
 const events=response.data.filter(x=>x?.leagueID==="NHL");
 const rows=[],totals={trackedOdds:0,closingLineValues:0,missingClosingLine:0,
  prizepicksBooks:0,underdogBooks:0,otherBooks:0};
 const eventSummaries=[];
 for(const event of events){
  const normalized=archiveClosingLines(event,window.season);
  rows.push(...normalized.rows);
  for(const [key,value] of Object.entries(normalized.counts))totals[key]+=value;
  const bookmakers=[...new Set(Object.values(event.odds||{}).flatMap(
   x=>Object.keys(x?.byBookmaker||{})).filter(b=>BOOKS.includes(b)))].sort();
  eventSummaries.push({eventId:event.eventID||null,start:event.status?.startsAt||null,
   bookmakers,oddsObjects:Object.keys(event.odds||{}).length,
   players:Object.keys(event.players||{}).length});
 }
 return {...window,retrievedAt,eventsReturned:events.length,
  completePagination:!response.nextCursor,partialWindow:!!response.nextCursor,
  hadPrizePicksOddsOnReturnedEvents:eventSummaries.some(e=>e.bookmakers.includes("prizepicks")),
  hadUnderdogOddsOnReturnedEvents:eventSummaries.some(e=>e.bookmakers.includes("underdog")),
  counts:totals,eventSummaries,closingLines:rows};
}
async function fetchWindow(key,window,fetcher=fetch){
 const u=new URL(URL_BASE);
 const params={leagueID:"NHL",startsAfter:window.from,startsBefore:window.to,
  finalized:"true",includeOpenCloseOdds:"true",
  bookmakerID:BOOKS.join(","),limit:"3"};
 for(const [k,v] of Object.entries(params))u.searchParams.set(k,v);
 const response=await fetcher(u,{headers:{"x-api-key":key.trim(),accept:"application/json"},
  signal:AbortSignal.timeout(45000)});
 if(!response.ok){
  const kind={401:"unauthorized_or_revoked_key",403:"inactive_or_plan_restricted",
   429:"rate_limited"}[response.status]||(response.status>=500?"provider_server_error":"request_rejected");
  const err=Error("Historical NHL SportsGameOdds "+kind+" HTTP "+response.status);
  err.status=response.status;throw err;
 }
 return response.json();
}
async function main(){
 const key=process.env.SPORTSGAMEODDS_API_KEY;
 if(!key)throw Error("SPORTSGAMEODDS_API_KEY missing: no requests made");
 const started=new Date().toISOString(),samples=[],errors=[];
 // Maximum 5 API calls, up to 3 completed events each; no automatic retries.
 for(const window of WINDOWS){
  try{
   const data=await fetchWindow(key,window);
   const report=summarizeResponse(data,window,started);
   samples.push(report);
   console.log(JSON.stringify({season:window.season,events:report.eventsReturned,
    books:report.eventSummaries.map(e=>e.bookmakers),verifiedCloseRows:report.closingLines.length,
    prizepicksClosingRows:report.counts.prizepicksBooks,
    underdogClosingRows:report.counts.underdogBooks,
    paginationComplete:report.completePagination}));
  }catch(e){errors.push({season:window.season,error:e.message});console.error(e.message);
   if([401,403,429].includes(e.status)||e.status>=500)break;}
 }
 const output={schemaVersion:1,generatedAt:new Date().toISOString(),
  source:"SportsGameOdds Pro historical NHL /events",sourcePlanProClaimedNotIndependentlyVerified:true,
  attemptedWindows:WINDOWS,successfulWindows:samples.length,requestCap:5,eventLimitPerWindow:3,
  coverageComplete:false,booksRequested:BOOKS,providerHistoricalPeriodApprox:"2024-present",
  preJan2026OpenCloseNotGuaranteed:true,windowSnapshots:samples,errors,
  historicLines:samples.flatMap(s=>s.closingLines),
  verifiedBacktestDecisions:0,providerTierLabelsVerified:false,
  sourceCaution:"Only documented closeOverUnder values count as provider-supplied pregame closes. Completed-event byBookmaker.overUnder may be last in-game odds and is NEVER used. SGO may not retain PrizePicks historically or distinguish Goblin/Demon. Sampled windows are NOT complete season coverage. Outcomes and player ID matching still need independent verification."};
 fs.mkdirSync(path.dirname(OUT),{recursive:true});
 fs.writeFileSync(OUT,JSON.stringify(output,null,2)+"\n");
 console.log(JSON.stringify({successfulWindows:samples.length,historicalCloseRows:output.historicLines.length,
  errors:errors.length,saved:OUT.split("/outputs/")[1]}));
 if(errors.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={WINDOWS,archiveClosingLines,summarizeResponse,fetchWindow};
