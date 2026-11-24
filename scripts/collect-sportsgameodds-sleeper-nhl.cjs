"use strict";
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"../outputs/sportsgameodds/nhl/sleeper");
const WINDOWS=[
 ["2023-24","2024-03-12","2024-03-14"],
 ["2024-25","2024-10-15","2024-10-17"],
 ["2025-26","2025-11-01","2025-11-03"],
 ["2025-26","2026-01-15","2026-01-17"],
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
const MARKETS=Object.freeze({
 shots_onGoal:"shotsOnGoal",blocks:"blockedShots",goalie_saves:"saves",saves:"saves",
 assists:"assists",points:"goals","goals+assists":"points",goals:"goals"
});
const finite=v=>v!==null&&v!==undefined&&v!==""&&Number.isFinite(Number(v))?Number(v):null;
const validTime=v=>Number.isFinite(Date.parse(v));
function playerMarket(odd,event){
 if(odd?.periodID!=="game"||odd.betTypeID!=="ou"||
    !["over","under"].includes(odd.sideID)||!MARKETS[odd.statID])return null;
 const id=String(odd.playerID||odd.statEntityID||"");
 const player=event.players?.[id]?.name;
 if(!player||["home","away","all"].includes(id))return null;
 return {id,player,market:MARKETS[odd.statID],statID:odd.statID};
}
function parseEvent(event,mode,at=new Date().toISOString()){
 if(!["historical","live"].includes(mode))throw Error("Unsupported Sleeper archive mode");
 const rows=new Map(),issues={noCloseField:0,staleOrInGame:0,invalidLine:0,unknownPlayerOrStat:0,
   conflictingSides:0},start=Date.parse(event?.status?.startsAt),now=Date.parse(at);
 if(event?.leagueID!=="NHL"||!event?.eventID||!Number.isFinite(start)||!Number.isFinite(now))
  return {rows:[],issues,hadSleeperQuote:false};
 if(mode==="live"&&(start<=now||event.status?.started||event.status?.live||
    event.status?.cancelled||event.status?.ended))
  return {rows:[],issues,hadSleeperQuote:false};
 let hadSleeperQuote=false;
 for(const odd of Object.values(event.odds||{})){
  const book=odd?.byBookmaker?.sleeper;
  if(!book)continue;
  hadSleeperQuote=true;
  const identity=playerMarket(odd,event);
  if(!identity){issues.unknownPlayerOrStat++;continue;}
  let line,updated=null,observedAt=null;
  if(mode==="historical"){
   // SGO's last overUnder may be an in-game line; never use it on a completed event.
   line=finite(book.closeOverUnder);
   if(line===null){issues.noCloseField++;continue;}
  }else{
   if(book.available!==true){issues.staleOrInGame++;continue;}
   updated=book.lastUpdatedAt;
   if(!validTime(updated)||Date.parse(updated)>=start||Date.parse(updated)>now+60000||
       now-Date.parse(updated)>4*3600000){issues.staleOrInGame++;continue;}
   line=finite(book.overUnder);
   observedAt=updated;
  }
  if(line===null||line<0){issues.invalidLine++;continue;}
  const key=[event.eventID,identity.id,identity.statID,line].join("|");
  if(!rows.has(key))rows.set(key,{
   source:"SportsGameOdds",platform:"Sleeper",bookmakerID:"sleeper",
   season:null,eventId:event.eventID,eventStartsAt:event.status.startsAt,
   homeTeam:event.teams?.home?.names?.long??null,
   awayTeam:event.teams?.away?.names?.long??null,
   providerPlayerId:identity.id,player:identity.player,
   market:identity.market,statID:identity.statID,line,
   observedAt:mode==="historical"?null:observedAt,
   capturedAt:at,archiveMode:mode,
   originalPlatformLineVerified:false,providerReportedHistoricalClose:mode==="historical",
   originalPregameTimestampVerified:mode==="live",
   sourceField:mode==="historical"?"closeOverUnder":"overUnder",
   tier:"unverified",payoutVerified:false,expectedValue:null,
   prospectivePrediction:false,officialResultVerified:false,
   sides:[]});
  const row=rows.get(key);
  const side=odd.sideID==="over"?"Higher":"Lower";
  const price=finite(mode==="historical"?book.closeOdds:book.odds);
  const existing=row.sides.find(x=>x.side===side);
  if(existing){if(existing.price!==price)issues.conflictingSides++;continue;}
  row.sides.push({side,price,providerQuoteAvailable:mode==="live"?true:null});
  if(mode==="live"&&Date.parse(updated)>Date.parse(row.observedAt))row.observedAt=updated;
 }
 return {rows:[...rows.values()].filter(r=>r.sides.length),issues,hadSleeperQuote};
}
async function request(key,params,fetcher=fetch){
 if(!key)throw Error("SPORTSGAMEODDS_API_KEY missing");
 const url=new URL("https://api.sportsgameodds.com/v2/events");
 for(const [k,v] of Object.entries({...params,bookmakerID:"sleeper"}))url.searchParams.set(k,String(v));
 const response=await fetcher(url,{headers:{"x-api-key":key.trim(),accept:"application/json"},signal:AbortSignal.timeout(50000)});
 if(!response.ok){const e=Error("SportsGameOdds Sleeper HTTP "+response.status);e.status=response.status;throw e;}
 const body=await response.json();
 if(body?.success!==true||!Array.isArray(body.data))throw Error("Sleeper response malformed; no archive overwrite");
 return body;
}
async function loadWindow(key,window,{fetcher=fetch,maxPages=2,at=new Date().toISOString()}={}){
 const base={leagueID:"NHL",finalized:"true",includeOpenCloseOdds:"true",
  startsAfter:window.from,startsBefore:window.to,limit:"40"};
 const unique=new Map(),seenCursor=new Set();
 let pages=0,cursor=null,paginationComplete=false;
 while(pages<maxPages){
  const body=await request(key,{...base,...(cursor?{cursor}:{})},fetcher);
  for(const game of body.data){
   if(game?.leagueID!=="NHL"||!game.eventID)continue;
   const start=Date.parse(game.status?.startsAt);
   if(Number.isFinite(start)&&start>=Date.parse(window.from)&&start<Date.parse(window.to))
    unique.set(game.eventID,game);
  }
  pages++;
  if(!body.nextCursor){paginationComplete=true;break;}
  if(typeof body.nextCursor!=="string"||seenCursor.has(body.nextCursor))throw Error("Repeating Sleeper history cursor");
  seenCursor.add(body.nextCursor);cursor=body.nextCursor;
 }
 const events=[...unique.values()],rows=[],issues={};
 let gamesWithSleeper=0;
 for(const event of events){
  const parsed=parseEvent(event,"historical",at);
  if(parsed.hadSleeperQuote)gamesWithSleeper++;
  for(const [k,v] of Object.entries(parsed.issues))issues[k]=(issues[k]||0)+v;
  rows.push(...parsed.rows.map(r=>({...r,season:window.season})));
 }
 return {schemaVersion:1,source:"SportsGameOdds Pro",platform:"Sleeper",
  season:window.season,from:window.from,to:window.to,archivedAt:at,
  gamesReturned:events.length,gamesWithSleeper,distinctEventsWithClose:new Set(rows.map(r=>r.eventId)).size,
  paginationComplete,pagesFetched:pages,closingLineRecords:rows.length,issues,rows,
  tierVerified:false,fullSeasonComplete:false,officialPlayerIdentityVerified:false,
  disclaimer:"Bookmaker-labelled Sleeper closeOverUnder from independent provider only; NOT a verified original Sleeper offer, odds payout, or pre-published model prediction. No in-game last line substitution."};
}
async function loadLive(key,{fetcher=fetch,at=new Date().toISOString()}={}){
 const body=await request(key,{leagueID:"NHL",oddsAvailable:"true",limit:"20"},fetcher);
 const rows=[],issues={},seen=new Set();
 let gamesWithSleeper=0;
 for(const event of body.data){
  const d=parseEvent(event,"live",at);
  if(d.hadSleeperQuote)gamesWithSleeper++;
  for(const [k,v] of Object.entries(d.issues))issues[k]=(issues[k]||0)+v;
  for(const line of d.rows){
   const key=[line.eventId,line.providerPlayerId,line.statID,line.line].join("|");
   if(seen.has(key))continue;seen.add(key);rows.push(line);
  }
 }
 return {schemaVersion:1,provider:"SportsGameOdds",platform:"Sleeper",capturedAt:at,
  gamesReturned:body.data.length,gamesWithSleeper,paginationComplete:!body.nextCursor,
  liveLineRecords:rows.length,rows,issues,
  tierVerified:false,officialSleeperBoardVerified:false,
  disclaimer:"Independent feed, pregame available quotes only. Tier and payout unverified; no guaranteed winning probability or automatic wager."};
}
async function main(){
 const key=process.env.SPORTSGAMEODDS_API_KEY;
 if(!key)throw Error("Missing SPORTSGAMEODDS_API_KEY GitHub secret");
 const mode=process.argv[2]||"history";
 fs.mkdirSync(ROOT,{recursive:true});
 if(mode==="live"){
  const result=await loadLive(key);
  const dir=path.join(ROOT,"live-snapshots");
  fs.mkdirSync(dir,{recursive:true});
  const stamp=result.capturedAt.slice(0,19).replace(/[-:]/g,"")+"Z";
  fs.writeFileSync(path.join(ROOT,"live-latest.json"),JSON.stringify(result)+"\n");
  if(result.liveLineRecords)fs.writeFileSync(path.join(dir,stamp+".json"),JSON.stringify(result)+"\n");
  console.log(JSON.stringify({mode,lines:result.liveLineRecords,gamesWithSleeper:result.gamesWithSleeper,
   events:result.gamesReturned,paginationComplete:result.paginationComplete}));
  return;
 }
 if(mode!=="history")throw Error("Use history or live");
 const dir=path.join(ROOT,"historical-windows");
 fs.mkdirSync(dir,{recursive:true});
 let completed=0,reused=0,errors=[];
 for(const w of WINDOWS){
  const file=path.join(dir,w.season+"_"+w.from.slice(0,10)+".json");
  if(fs.existsSync(file)){
   const prior=JSON.parse(fs.readFileSync(file,"utf8"));
   if(prior?.schemaVersion===1){reused++;continue;}
  }
  try{
   const d=await loadWindow(key,w);
   fs.writeFileSync(file,JSON.stringify(d)+"\n");
   completed++;
   console.log(JSON.stringify({season:w.season,from:w.from.slice(0,10),
    events:d.gamesReturned,withSleeper:d.gamesWithSleeper,closingLines:d.closingLineRecords,
    paginationComplete:d.paginationComplete}));
  }catch(e){
   errors.push({season:w.season,from:w.from,error:e.message});
   console.error("Sleeper history stopped at "+w.from+": "+e.message);
   break;
  }
 }
 const existing=fs.readdirSync(dir).filter(x=>x.endsWith(".json")).map(name=>
   JSON.parse(fs.readFileSync(path.join(dir,name),"utf8")));
 const seasons=[...new Set(WINDOWS.map(x=>x.season))];
 const bySeason=Object.fromEntries(seasons.map(season=>{
  const docs=existing.filter(d=>d.season===season);
  return [season,{windows:docs.length,gamesObserved:docs.reduce((n,x)=>n+x.gamesReturned,0),
   gamesWithSleeper:docs.reduce((n,x)=>n+x.gamesWithSleeper,0),
   closingLineRecords:docs.reduce((n,x)=>n+x.closingLineRecords,0),
   fullyPaginatedWindows:docs.filter(x=>x.paginationComplete).length}];
 }));
 const summary={generatedAt:new Date().toISOString(),platform:"Sleeper",source:"SportsGameOdds Pro",
  windowsTargeted:WINDOWS.length,newWindows:completed,reusedWindows:reused,errors,bySeason,
  completeSeasons:false,olderThanJan2026ClosingLinesExpected:false,
  sourceVerifiedOfficialSleeper:false,prospectivePredictions:false,modelHitRatesChanged:false};
 fs.writeFileSync(path.join(ROOT,"historical-coverage-latest.json"),JSON.stringify(summary,null,2)+"\n");
 console.log(JSON.stringify({mode,bySeason,newWindows:completed,errors:errors.length}));
 if(errors.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={WINDOWS,parseEvent,request,loadWindow,loadLive};
