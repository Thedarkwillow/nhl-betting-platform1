"use strict";
const fs=require("node:fs"),path=require("node:path");
const SPORTS_GAME_ODDS_URL="https://api.sportsgameodds.com/v2/events";
const BOOKS=Object.freeze({draftkings:"DraftKings",fanduel:"FanDuel",betmgm:"BetMGM",caesars:"Caesars",espnbet:"ESPN BET",bovada:"Bovada",unibet:"Unibet",pointsbet:"PointsBet",williamhill:"William Hill",prizepicks:"PrizePicks",underdog:"Underdog"});
// This first collector ONLY accepts the free plan's documented sportsbook list.
// PrizePicks/Underdog are diagnostics, not assumed to be included in the user's plan.
const FREE_BOOKS=Object.freeze(["draftkings","fanduel","betmgm","caesars","espnbet","bovada","unibet","pointsbet","williamhill"]);
const {NHL_STAT_TO_MARKET:MARKETS}=require("../src/sgo-nhl-contract.cjs");
const OUTPUT=path.resolve(__dirname,"../outputs/sportsgameodds/nhl/live-latest.json");
const stampOk=value=>Number.isFinite(Date.parse(value));
const number=value=>{
 if(value===null||value===undefined||value==="")return null;
 const n=Number(value);return Number.isFinite(n)?n:null;
};
const american=value=>{
 if(typeof value!=="string"&&typeof value!=="number")return null;
 const s=String(value).trim();
 if(!/^[+-]?\d{3,5}$/.test(s))return null;
 const n=Number(s);
 return Number.isInteger(n)&&Math.abs(n)>=100&&n!==0?n:null;
};
function extractQuotes(event,capturedAt,allowedBooks=FREE_BOOKS){
 const quotes=[],issues={unknownMarket:0,missingPlayer:0,missingTime:0,missingPrice:0,missingBothSides:0,stale:0};
 if(event?.leagueID!=="NHL")return {quotes,issues};
 const gameStart=event.status?.startsAt, start=Date.parse(gameStart),at=Date.parse(capturedAt);
 if(!Number.isFinite(start)||!Number.isFinite(at)||start<=at||event.status?.started||event.status?.live||event.status?.cancelled){
  issues.missingTime++;return {quotes,issues};
 }
 const homeTeam=event.teams?.home?.names?.long,awayTeam=event.teams?.away?.names?.long;
 if(!homeTeam||!awayTeam||!event.eventID)return {quotes,issues:{...issues,missingTime:issues.missingTime+1}};
 const pairs=new Map(),conflicted=new Set();
 for(const odd of Object.values(event.odds||{})){
  if(odd?.periodID!=="game"||odd?.betTypeID!=="ou"||!["over","under"].includes(odd.sideID)||odd.started||odd.cancelled||odd.ended)continue;
  const market=MARKETS[odd.statID];
  if(!market){issues.unknownMarket++;continue;}
  const entity=String(odd.playerID||odd.statEntityID||"");
  if(!entity||["all","home","away"].includes(entity)){issues.missingPlayer++;continue;}
  const player=event.players?.[entity]?.name;
  if(!player){issues.missingPlayer++;continue;}
  for(const bookKey of allowedBooks){
   const book=odd.byBookmaker?.[bookKey];
   if(!book||book.available!==true)continue;
   const updated=Date.parse(book.lastUpdatedAt);
   // Live quotes must be both pregame and reasonably recent (4h).
   if(!Number.isFinite(updated)||updated>at||updated>=start||at-updated>4*3600000){issues.stale++;continue;}
   const line=number(book.overUnder),price=american(book.odds);
   if(line===null||line<0||price===null){issues.missingPrice++;continue;}
   const key=[event.eventID,entity,market,line,bookKey].join("|");
   const side=odd.sideID==="over"?"overOdds":"underOdds";
   if(!pairs.has(key))pairs.set(key,{source:"SportsGameOdds",eventId:event.eventID,
    providerPlayerId:entity,player,market,line,book:BOOKS[bookKey]||bookKey,bookKey,
    homeTeam,awayTeam,commenceTime:gameStart,capturedAt,
    marketUpdatedAt:book.lastUpdatedAt});
   const p=pairs.get(key);
   if(p[side]!==undefined&&p[side]!==price)conflicted.add(key);
   p[side]=price;
   if(Date.parse(book.lastUpdatedAt)<Date.parse(p.marketUpdatedAt))p.marketUpdatedAt=book.lastUpdatedAt;
  }
 }
 for(const [key,pair] of pairs){
  if(conflicted.has(key))continue;
  if(american(pair.overOdds)===null||american(pair.underOdds)===null){issues.missingBothSides++;continue;}
  quotes.push(pair);
 }
 return {quotes,issues};
}
function analyzeResponse(body,at=new Date().toISOString()){
 if(body?.success!==true||!Array.isArray(body.data))throw Error("Unexpected SportsGameOdds response; no overwrite");
 const quotes=[],events=[],issues={},bookCounts={};
 const accumulate=(key,value)=>issues[key]=(issues[key]||0)+value;
 for(const event of body.data){
  const {quotes:q,issues:diagnostics}=extractQuotes(event,at);
  for(const [key,value] of Object.entries(diagnostics))accumulate(key,value);
  quotes.push(...q);
  events.push({eventId:event.eventID||null,startsAt:event.status?.startsAt||null,
   home:event.teams?.home?.names?.long||null,away:event.teams?.away?.names?.long||null,
   suppliedOdds:Object.keys(event.odds||{}).length,
   availableBooks:[...new Set(Object.values(event.odds||{}).flatMap(o=>
    Object.keys(o?.byBookmaker||{})))].sort()});
 }
 for(const quote of quotes)bookCounts[quote.bookKey]=(bookCounts[quote.bookKey]||0)+1;
 return {schemaVersion:1,generatedAt:at,provider:"SportsGameOdds",mode:"free_tier_live_NHL",
  source:"independent sportsbook odds",validatedOfficialPrizePicks:false,
  prizepicksIncludedInRequestedBooks:false,underdogIncludedInRequestedBooks:false,
  historicalDataTested:false,historyPlanRequirement:"Pro or higher; not included in free tier",
  incompletePagination:!!body.nextCursor,pagesFetched:1,eventsRequestedLimit:2,
  eventsReturned:body.data.length,requestedBooks:FREE_BOOKS,pairedQuotes:quotes.length,
  byBook:bookCounts,issues,events,rows:quotes,
  researchOnly:true,noVerifiedEdge:true,
  warning:"Current sportsbook quotes from one limited snapshot. NOT historical PrizePicks/Underdog lines, calibrated predictions, payout-based EV, or verified closing odds."};
}
async function fetchOne(key, fetcher=fetch, {limit=2,startsAfter=null,startsBefore=null}={}){
 if(!Number.isInteger(limit)||limit<1||limit>6)throw Error('Invalid bounded event limit');
 if(!key)throw Error("Missing SPORTSGAMEODDS_API_KEY GitHub Actions secret");
 const url=new URL(SPORTS_GAME_ODDS_URL);
 url.searchParams.set("leagueID","NHL");
 url.searchParams.set("oddsAvailable","true");
 url.searchParams.set("limit",String(limit));
 if(startsAfter&&startsBefore){if(!(Date.parse(startsAfter)<Date.parse(startsBefore)))throw Error("Invalid event window");url.searchParams.set("started","false");url.searchParams.set("startsAfter",startsAfter);url.searchParams.set("startsBefore",startsBefore);}
 url.searchParams.set("bookmakerID",FREE_BOOKS.join(","));
 const response=await fetcher(url,{headers:{"x-api-key":key,accept:"application/json"},signal:AbortSignal.timeout(30000),redirect:"error"});
 if(!response.ok){
  const message=response.status===401?"invalid_api_key":response.status===403?"account_plan_or_key_inactive":
   response.status===429?"rate_limit_or_quota":response.status>=500?"provider_server_error":"request_rejected";
  const error=Error("SportsGameOdds "+message+" HTTP "+response.status);
  error.status=response.status;throw error;
 }
 return response.json();
}
async function main(){
 const key=process.env.SPORTSGAMEODDS_API_KEY;
 if(!key)throw Error("Missing SPORTSGAMEODDS_API_KEY; no requests made");
 const at=new Date().toISOString();
 const body=await fetchOne(key),report=analyzeResponse(body,at);
 fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
 fs.writeFileSync(OUTPUT,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:"success",events:report.eventsReturned,pairedQuotes:report.pairedQuotes,
  byBook:report.byBook,nextPageAvailable:report.incompletePagination,issues:report.issues,
  historyTested:false,output:"outputs/sportsgameodds/nhl/live-latest.json"}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={american,extractQuotes,analyzeResponse,fetchOne};
