"use strict";
const fs=require("node:fs"),path=require("node:path");
const {archiveClosingLines}=require("./probe-sportsgameodds-historical-nhl.cjs");
const ROOT=path.resolve(__dirname,"../outputs/sportsgameodds/nhl/full-game-coverage");
const SCHEDULES=path.resolve(__dirname,"../outputs/official-nhl/season-schedules");
const STARTS={"2025-26":"2026-01-01","2026-27":"2026-10-01"};
const ENDS={"2025-26":"2026-07-01","2026-27":"2027-07-01"};
const MAX_PAGES_PER_WINDOW=4,PER_PAGE=100,MAX_CALLS_PER_RUN=110;
const TARGET_BOOKS="prizepicks,underdog,draftkings,fanduel";
const TEAM_NAMES={
 "anaheim ducks":"ANA","arizona coyotes":"ARI","boston bruins":"BOS","buffalo sabres":"BUF",
 "calgary flames":"CGY","carolina hurricanes":"CAR","chicago blackhawks":"CHI",
 "colorado avalanche":"COL","columbus blue jackets":"CBJ","dallas stars":"DAL",
 "detroit red wings":"DET","edmonton oilers":"EDM","florida panthers":"FLA",
 "los angeles kings":"LAK","minnesota wild":"MIN","montreal canadiens":"MTL",
 "nashville predators":"NSH","new jersey devils":"NJD","new york islanders":"NYI",
 "new york rangers":"NYR","ottawa senators":"OTT","philadelphia flyers":"PHI",
 "pittsburgh penguins":"PIT","san jose sharks":"SJS","seattle kraken":"SEA",
 "st louis blues":"STL","st. louis blues":"STL","tampa bay lightning":"TBL",
 "toronto maple leafs":"TOR","utah hockey club":"UTA","utah mammoth":"UTA",
 "vancouver canucks":"VAN","vegas golden knights":"VGK","washington capitals":"WSH",
 "winnipeg jets":"WPG"
};
const normalize=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
function teamCode(name){return TEAM_NAMES[normalize(name)]||null;}
const date=ms=>new Date(ms).toISOString().slice(0,10);
const iso=d=>d+"T00:00:00.000Z";
function makeWindows(now=new Date().toISOString()){
 const endCutoff=date(Date.parse(iso(date(Date.parse(now))))+86400000); // Include today: finalized events only; refresh recent windows.
 const windows=[],day=86400000,week=7*day;
 for(const season of Object.keys(STARTS)){
  const end=Math.min(Date.parse(iso(endCutoff)),Date.parse(iso(ENDS[season])));
  let cursor=Date.parse(iso(STARTS[season]));
  while(cursor<end){
   const next=cursor+week<=end?cursor+week:cursor+day;
   windows.push({season,from:iso(date(cursor)),to:iso(date(next))});
   cursor=next;
  }
 }
 return windows;
}
function matchOfficial(event,games){
 const home=teamCode(event.teams?.home?.names?.long),away=teamCode(event.teams?.away?.names?.long);
 const start=Date.parse(event.status?.startsAt);
 if(!home||!away||!Number.isFinite(start))return {status:"missing_event_identity"};
 const matches=games.filter(g=>g.home===home&&g.away===away&&
  Math.abs(Date.parse(g.startTimeUTC)-start)<=3*3600000);
 if(matches.length===1)return {status:"matched",gameId:matches[0].id};
 return {status:matches.length?"ambiguous_game_identity":"no_official_game_match"};
}
async function retrieveWindow(key,window,{fetcher=fetch,budget={calls:0},pause=async()=>{}}={}){
 if(!Object.hasOwn(STARTS,window.season)||Date.parse(window.from)>=Date.parse(window.to))
  throw Error("Invalid historical NHL window");
 const events=new Map(),seenCursors=new Set(),start=Date.parse(window.from),end=Date.parse(window.to);
 let cursor=null,pages=0,complete=false;
 while(pages<MAX_PAGES_PER_WINDOW){
  if(budget.calls>=MAX_CALLS_PER_RUN)throw Error("Provider historical call budget exhausted");
  const u=new URL("https://api.sportsgameodds.com/v2/events");
  const args={
   leagueID:"NHL",type:"match",finalized:"true",includeOpenCloseOdds:"true",
   bookmakerID:TARGET_BOOKS,limit:String(PER_PAGE),
   // API says startsAfter is exclusive: cover games at exactly midnight UTC.
   startsAfter:new Date(start-1000).toISOString(),
   startsBefore:new Date(end+1000).toISOString(),
   ...(cursor?{cursor}:{})
  };
  for(const [k,v] of Object.entries(args))u.searchParams.set(k,v);
  await pause();
  budget.calls++;
  const r=await fetcher(u,{headers:{"x-api-key":key.trim(),accept:"application/json"},
   signal:AbortSignal.timeout(90000)});
  if(!r.ok){const e=Error("SportsGameOdds HTTP "+r.status);e.status=r.status;throw e;}
  const body=await r.json();
  if(body?.success!==true||!Array.isArray(body.data))throw Error("Malformed historical NHL response");
  for(const event of body.data){
   const starts=Date.parse(event?.status?.startsAt);
   if(event?.leagueID!=="NHL"||!event?.eventID||!Number.isFinite(starts)||
     starts<start||starts>=end)continue;
   if(!events.has(event.eventID))events.set(event.eventID,event);
  }
  pages++;
  if(!body.nextCursor){complete=true;break;}
  if(typeof body.nextCursor!=="string"||seenCursors.has(body.nextCursor))
   throw Error("Repeating/invalid historical pagination cursor");
  seenCursors.add(body.nextCursor);cursor=body.nextCursor;
 }
 if(!complete)throw Error("Too many pages: refusing to mark date window complete");
 return {events:[...events.values()],pages,complete};
}
function auditWindow(window,provider,officialGames,at=new Date().toISOString()){
 if(!provider?.complete)throw Error("Partial provider window cannot pass coverage audit");
 const eligibleOfficial=officialGames.filter(g=>g.finalized&&
  Date.parse(g.startTimeUTC)>=Date.parse(window.from)&&Date.parse(g.startTimeUTC)<Date.parse(window.to));
 const matched=new Map(),bySource=[],unmatched=[],seenLine=new Set();
 for(const event of provider.events){
  const outcome=matchOfficial(event,eligibleOfficial);
  if(outcome.status!=="matched"){
   unmatched.push({providerEventId:event.eventID,status:outcome.status});
   continue;
  }
  const gameId=outcome.gameId,prior=matched.get(gameId);
  if(prior && prior.providerEventId!==event.eventID){
   unmatched.push({providerEventId:event.eventID,officialGameId:gameId,status:"duplicate_provider_games"});
   continue;
  }
  const converted=archiveClosingLines(event,window.season);
  let prizepicks=0,underdog=0;
  for(const entry of converted.rows){
   if(!["prizepicks","underdog"].includes(entry.book))continue;
   const key=[gameId,entry.book,entry.providerPlayerId,entry.statID,entry.line].join("|");
   if(seenLine.has(key))continue;
   seenLine.add(key);
   bySource.push({...entry,officialGameId:gameId,sourceGameMatched:true,
    officialResultVerified:false,originalOfferVerified:false,
    prospectiveVerified:false,payoutVerified:false});
   if(entry.book==="prizepicks")prizepicks++;
   else underdog++;
  }
  matched.set(gameId,{officialGameId:gameId,providerEventId:event.eventID,
   prizepicksClosingLineRecords:prizepicks,underdogClosingLineRecords:underdog});
 }
 const games=eligibleOfficial.map(g=>({
  officialGameId:g.id,startTimeUTC:g.startTimeUTC,home:g.home,away:g.away,
  ...(
   matched.has(g.id)?{status:"provider_event_matched",...matched.get(g.id)}:
   {status:"no_provider_event_returned",prizepicksClosingLineRecords:0,
    underdogClosingLineRecords:0}
  )
 }));
 return {schemaVersion:1,season:window.season,from:window.from,to:window.to,
  source:"SportsGameOdds Pro independent historical book-level closes",
  checkedAt:at,queryFullyPaginated:true,pagesFetched:provider.pages,
  officialCompletedGamesInWindow:eligibleOfficial.length,providerEvents:provider.events.length,
  providerMatchedOfficialGames:matched.size,
  gamesWithPrizePicksClose:games.filter(g=>g.prizepicksClosingLineRecords>0).length,
  gamesWithUnderdogClose:games.filter(g=>g.underdogClosingLineRecords>0).length,
  prizepicksClosingLineRecords:bySource.filter(r=>r.book==="prizepicks").length,
  underdogClosingLineRecords:bySource.filter(r=>r.book==="underdog").length,
  providerEventsUnmatched:unmatched,
  games,rows:bySource,
  fullSeasonCovered:false,tierVerified:false,independentlyVerifiedOriginalOffers:false,
  warning:"Per-book closeOverUnder only. A missing provider event is NOT proof the platform had no line. No source-original tier/payout verification or prospective model correctness."};
}
function summarizeCoverage(manifests,windows,now=new Date().toISOString()){
 const completeWindows=windows.filter(x=>x.queryFullyPaginated===true),bySeason={};
 for(const season of Object.keys(STARTS)){
  const official=manifests[season],f=completeWindows.filter(x=>x.season===season);
  const coveredGames=new Map(),providerGames=new Set(),ppGames=new Set(),udGames=new Set();
  const lineKeys={prizepicks:new Set(),underdog:new Set()};
  for(const win of f){
   for(const game of win.games){
    coveredGames.set(String(game.officialGameId),game);
    if(game.status==="provider_event_matched")providerGames.add(String(game.officialGameId));
    if(game.prizepicksClosingLineRecords>0)ppGames.add(String(game.officialGameId));
    if(game.underdogClosingLineRecords>0)udGames.add(String(game.officialGameId));
   }
   for(const row of win.rows){
    lineKeys[row.book]?.add([row.officialGameId,row.providerPlayerId,row.statID,row.line].join("|"));
   }
  }
  const since=Date.parse(iso(STARTS[season]));
  const expected=official.games.filter(g=>g.finalized&&Date.parse(g.startTimeUTC)>=since&&
    Date.parse(g.startTimeUTC)<=Date.parse(now)).length;
  bySeason[season]={
   officialScheduleComplete:official.complete,
   officialGamesRecorded:official.games.length,officialCompletedGamesTotal:official.finalGames,
   documentedHistoricalCloseStart:STARTS[season],
   officialCompletedGamesInEligiblePeriod:expected,
   fullyPaginatedWindows:f.length,
   completedGamesInsideCheckedWindows:coveredGames.size,
   completedGamesNotYetChecked:Math.max(0,expected-coveredGames.size),
   officialGamesMatchedToProvider:providerGames.size,
   officialGamesWithoutMatchedProviderEvents:coveredGames.size-providerGames.size,
   officialGamesWithPrizePicksClosingLines:ppGames.size,
   officialGamesWithUnderdogClosingLines:udGames.size,
   distinctPrizePicksClosingLineRecords:lineKeys.prizepicks.size,
   distinctUnderdogClosingLineRecords:lineKeys.underdog.size,
   allEligibleCompletedGameDatesChecked:official.complete&&coveredGames.size>=expected,
   allGamesHaveOriginalProviderLinesVerified:false
  };
 }
 return {generatedAt:now,source:"Official NHL game schedules + SportsGameOdds historical closeOverUnder",
  bySeason,calibratedHitRatesUpdated:false,
  verifiedLineupProbabilities:false,allPreviousSeasonsCovered:false,
  providerLineMissingDoesNotImplyNoPlatformOffer:true,
  "2023-24":"No documented bookmaker closing line history from this provider in 2023-24",
  "2024-25":"No documented bookmaker closing line history from this provider in 2024-25",
  caution:"Checking every completed game is distinct from obtaining a source-authentic historic prop for every game. Provider matching is independent; PrizePicks/Underdog historical lines require source provenance and tiers before any verified accuracy or EV claim."};
}
async function main(){
 const key=process.env.SPORTSGAMEODDS_API_KEY;
 if(!key)throw Error("Missing SPORTSGAMEODDS_API_KEY GitHub secret");
 const manifests={};
 for(const season of Object.keys(STARTS)){
  const p=path.join(SCHEDULES,season+".json");
  if(!fs.existsSync(p))throw Error("Official NHL season schedule missing: "+season);
  const m=JSON.parse(fs.readFileSync(p,"utf8"));
  if(m.complete!==true||m.teamSchedulesSucceeded!==32)throw Error("Incomplete official schedule for "+season);
  manifests[season]=m;
 }
 const target=path.join(ROOT,"windows"),budget={calls:0},newWindows=[],reused=[],errors=[];
 fs.mkdirSync(target,{recursive:true});
 const wanted=makeWindows(),persisted=[];
 for(const window of wanted){
  const filename=window.season+"_"+window.from.slice(0,10)+"_"+window.to.slice(0,10)+".json";
  const file=path.join(target,filename);
  if(fs.existsSync(file)){
   const old=JSON.parse(fs.readFileSync(file,"utf8"));
   if(old?.queryFullyPaginated===true && Date.parse(window.to)<Date.now()-48*3600000){
    persisted.push(old);reused.push(filename);continue;
   }
  }
  try{
   const fetched=await retrieveWindow(key,window,{budget});
   const result=auditWindow(window,fetched,manifests[window.season].games);
   fs.writeFileSync(file,JSON.stringify(result)+"\n");
   persisted.push(result);
   newWindows.push({filename,games:result.officialCompletedGamesInWindow,
    matched:result.providerMatchedOfficialGames,pp:result.prizepicksClosingLineRecords,
    ud:result.underdogClosingLineRecords,pages:result.pagesFetched});
   console.log(JSON.stringify({window:filename,...newWindows.at(-1)}));
  }catch(e){
   errors.push({window:filename,error:e.message});
   console.error("Stopped full coverage backfill at "+filename+": "+e.message);
   break;
  }
 }
 // Include any previously stored windows even if they were not in today's generated plan.
 const byFile=new Map(persisted.map(w=>[w.season+"_"+w.from.slice(0,10)+"_"+w.to.slice(0,10),w]));
 for(const name of fs.readdirSync(target).filter(n=>n.endsWith(".json"))){
  const key=name.slice(0,-5);
  if(!byFile.has(key)){
   const doc=JSON.parse(fs.readFileSync(path.join(target,name),"utf8"));
   if(doc.queryFullyPaginated===true)byFile.set(key,doc);
  }
 }
 const summary=summarizeCoverage(manifests,[...byFile.values()]);
 summary.windowsRequestedToday=wanted.length;
 summary.newlyCollectedWindows=newWindows;
 summary.preexistingWindowsReused=reused.length;
 summary.errors=errors;
 summary.requestsThisRun=budget.calls;
 summary.requestCap=MAX_CALLS_PER_RUN;
 fs.mkdirSync(ROOT,{recursive:true});
 fs.writeFileSync(path.join(ROOT,"coverage-latest.json"),JSON.stringify(summary,null,2)+"\n");
 console.log(JSON.stringify({bySeason:summary.bySeason,requests:budget.calls,
  windowsNew:newWindows.length,errors:errors.length}));
 if(errors.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={makeWindows,matchOfficial,retrieveWindow,auditWindow,summarizeCoverage,teamCode};
