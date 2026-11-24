"use strict";
const fs=require("node:fs"),path=require("node:path");
const {archiveClosingLines}=require("./probe-sportsgameodds-historical-nhl.cjs");
const ROOT=path.resolve(__dirname,"../outputs/sportsgameodds/nhl");
const WINDOWS=[
 ["2025-26","2026-01-30","2026-02-01"],
 ["2025-26","2026-02-03","2026-02-05"],
 ["2025-26","2026-02-25","2026-02-27"],
 ["2025-26","2026-03-11","2026-03-13"],
 ["2025-26","2026-03-25","2026-03-27"],
 ["2025-26","2026-04-08","2026-04-10"],
 ["2025-26","2026-05-07","2026-05-09"],
 ["2026-27","2026-10-07","2026-10-09"],
 ["2026-27","2026-10-14","2026-10-16"],
 ["2026-27","2026-10-21","2026-10-23"],
 ["2026-27","2026-10-28","2026-10-30"],
 ["2026-27","2026-10-30","2026-11-01"]
].map(([season,from,to])=>({season,from:from+"T00:00:00Z",to:to+"T00:00:00Z"}));
const MAX_PAGES_PER_WINDOW=2,MAX_API_CALLS=24,PER_PAGE=25;
function validateWindow(window){
 if(!["2025-26","2026-27"].includes(window.season)||!Number.isFinite(Date.parse(window.from))||
  !Number.isFinite(Date.parse(window.to))||window.from>=window.to||
  Date.parse(window.to)>Date.now()-600000)throw Error("Invalid or not-yet-complete historical window");
}
async function retrieveWindow(key,window,{fetcher=fetch,delay=async()=>{},budget={calls:0}}={}){
 validateWindow(window);
 const all=[],seenIds=new Set(),seenCursors=new Set();
 let cursor=null,pages=0,truncated=false;
 while(true){
  if(budget.calls>=MAX_API_CALLS)throw Error("Historical requests capped; no partial file saved");
  if(pages>=MAX_PAGES_PER_WINDOW){truncated=true;break;}
  if(budget.calls>0)await delay();
  const u=new URL("https://api.sportsgameodds.com/v2/events");
  const args={leagueID:"NHL",finalized:"true",includeOpenCloseOdds:"true",
   startsAfter:window.from,startsBefore:window.to,
   bookmakerID:"prizepicks,underdog,draftkings,fanduel",limit:String(PER_PAGE)};
  for(const [k,v]of Object.entries(args))u.searchParams.set(k,v);
  if(cursor)u.searchParams.set("cursor",cursor);
  budget.calls++;
  const response=await fetcher(u,{headers:{"x-api-key":key.trim(),accept:"application/json"},
   signal:AbortSignal.timeout(55000)});
  if(!response.ok){
   const err=Error("SportsGameOdds history HTTP "+response.status);
   err.status=response.status;throw err;
  }
  const body=await response.json();
  if(body?.success!==true||!Array.isArray(body.data))
   throw Error("Malformed provider history response; no partial file saved");
  for(const event of body.data){
   if(event?.leagueID!=="NHL"||!event.eventID)continue;
   const at=Date.parse(event.status?.startsAt);
   if(!Number.isFinite(at)||at<Date.parse(window.from)||at>Date.parse(window.to))continue;
   if(seenIds.has(event.eventID))continue;
   seenIds.add(event.eventID);all.push(event);
  }
  pages++;
  const next=body.nextCursor;
  if(!next)break;
  if(typeof next!=="string"||seenCursors.has(next))throw Error("Repeated/invalid cursor; no partial file saved");
  seenCursors.add(next);cursor=next;
 }
 return {events:all,pages,paginationComplete:!truncated,nextCursorSkipped:truncated};
}
function archiveWindow(window,events,{pages,paginationComplete},retrievedAt){
 const lines=[],eventDiagnostics=[],seen=new Set();
 let prizepicks=0,underdog=0,sportsbooks=0,unverifiedLastMarketLines=0;
 for(const event of events){
  const parsed=archiveClosingLines(event,window.season);
  unverifiedLastMarketLines+=parsed.counts.missingClosingLine;
  const uniqueLines=[];
  for(const row of parsed.rows){
   const key=[row.eventId,row.providerPlayerId,row.statID,row.line,row.book].join("|");
   if(seen.has(key))continue;
   seen.add(key);
   uniqueLines.push(row);
   if(row.book==="prizepicks")prizepicks++;
   else if(row.book==="underdog")underdog++;
   else sportsbooks++;
  }
  lines.push(...uniqueLines);
  eventDiagnostics.push({eventId:event.eventID,startsAt:event.status?.startsAt||null,
   prizepicksCloses:uniqueLines.filter(x=>x.book==="prizepicks").length,
   underdogCloses:uniqueLines.filter(x=>x.book==="underdog").length,
   ordinarySportsbookCloses:uniqueLines.filter(x=>!["prizepicks","underdog"].includes(x.book)).length});
 }
 return {schemaVersion:1,source:"SportsGameOdds historical book-level closing lines",
  season:window.season,from:window.from,to:window.to,archivedAt:retrievedAt,
  gamesRetrieved:events.length,pagesFetched:pages,completePagination:paginationComplete,
  sampleOnly:true,fullSeasonCovered:false,uniqueLineObservations:lines.length,
  prizepicks,underdog,sportsbooks,unverifiedLastMarketLines,
  events:eventDiagnostics,rows:lines,
  officialPlayerIdentityVerified:false,verifiedOriginalPrizePicks:true===false,
  historicalCloseFieldVerified:lines.length>0,closingLineSource:"closeOverUnder",
  historicalTierVerified:false,modelPredictionBacktested:false,
  warning:"Independent provider identifies book-level closing lines, but source has not been cross-checked against official PrizePicks/Underdog archives. Never substitute postgame in-play overUnder for closeOverUnder. Standard/Goblin/Demon tiers, payout and prospective model accuracy remain unverified."};
}
async function main(){
 const key=process.env.SPORTSGAMEODDS_API_KEY;
 if(!key)throw Error("SPORTSGAMEODDS_API_KEY not configured");
 const base=path.join(ROOT,"closing-windows"),requested=WINDOWS,errors=[],newlyCollected=[],reused=[];
 fs.mkdirSync(base,{recursive:true});
 const budget={calls:0};
 for(const window of requested){
  const filename=window.season+"_"+window.from.slice(0,10)+"_"+window.to.slice(0,10)+".json";
  const file=path.join(base,filename);
  if(fs.existsSync(file)){
   const old=JSON.parse(fs.readFileSync(file,"utf8"));
   if(old?.schemaVersion===1){reused.push({file:filename,rows:old.uniqueLineObservations});continue;}
  }
  try{
   const batch=await retrieveWindow(key,window,{budget});
   const archived=archiveWindow(window,batch.events,batch,new Date().toISOString());
   fs.writeFileSync(file,JSON.stringify(archived)+"\n");
   newlyCollected.push({file:filename,season:window.season,games:archived.gamesRetrieved,
    prizepicks:archived.prizepicks,underdog:archived.underdog,
    ordinarySportsbooks:archived.sportsbooks,rows:archived.uniqueLineObservations,
    paginationComplete:archived.completePagination});
   console.log(JSON.stringify(newlyCollected.at(-1)));
  }catch(e){
   errors.push({season:window.season,from:window.from,error:e.message});
   console.error("Stopped at "+window.from+": "+e.message);
   break;
  }
 }
 const summaries=fs.readdirSync(base).filter(f=>f.endsWith(".json")).map(f=>{
  const d=JSON.parse(fs.readFileSync(path.join(base,f),"utf8"));
  return {file:f,season:d.season,events:d.gamesRetrieved,prizepicks:d.prizepicks,
   underdog:d.underdog,ordinarySportsbooks:d.sportsbooks,
   rows:d.uniqueLineObservations,completePagination:d.completePagination};
 });
 const bySeason=Object.fromEntries(["2025-26","2026-27"].map(season=>{
  const s=summaries.filter(x=>x.season===season);
  return [season,{windows:s.length,gameObservations:s.reduce((n,x)=>n+x.events,0),
   prizepicksClosingLines:s.reduce((n,x)=>n+x.prizepicks,0),
   underdogClosingLines:s.reduce((n,x)=>n+x.underdog,0),
   ordinarySportsbookClosingLines:s.reduce((n,x)=>n+x.ordinarySportsbooks,0),
   windowsFullyPaginated:s.filter(x=>x.completePagination).length}];
 }));
 const summary={generatedAt:new Date().toISOString(),source:"SportsGameOdds Pro /v2/events",
  sourceProAccessTested:true,windowsRequested:requested.length,newlyCollected,
  reused,bySeason,errors,apiCallsThisRun:budget.calls,apiCallCap:MAX_API_CALLS,
  partialCoverage:true,accuracyRatesRecomputed:false,
  officialPrizePicksArchiveVerified:false,
  warning:"These are provider-supplied historical CLOSE lines for book-level props, not verified historical PrizePicks offer timelines or pregame model predictions. Historical 2024/2025 games may lack documented close fields. No full-season or tier coverage claimed."};
 fs.writeFileSync(path.join(ROOT,"closing-coverage-latest.json"),JSON.stringify(summary,null,2)+"\n");
 console.log(JSON.stringify({bySeason,calls:budget.calls,errors:errors.length,files:summaries.length}));
 if(errors.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={validateWindow,retrieveWindow,archiveWindow,WINDOWS};
