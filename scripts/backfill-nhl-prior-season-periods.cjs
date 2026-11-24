"use strict";
/**
 * Isolated official 2025-26 NHL PREVIOUS-SEASON period-result collector.
 * Does NOT touch outputs/player-stats, frozen predictions, production
 * champion or MLB. Collects complete official games, enriches exact
 * final counts, then feeds the existing period event/shift reconciler.
 */
const fs=require("node:fs/promises"),path=require("node:path");
const {normalizeSchedule}=require("../src/schedule.cjs");
const {normalizeBoxscore}=require("../src/boxscore.cjs");
const {faceoffsReportUrl,normalizeOfficialFaceoffWins,mergeOfficialFaceoffs}=
 require("../src/nhl-official-faceoff-wins.cjs");
const {goalieSummaryUrl,parseOfficialGoalieSummary,mergeOfficialGoalieFantasy}=
 require("../src/nhl-official-goalie-fantasy.cjs");
const {skaterSummaryUrl,normalizeOfficialSkaterSummary,mergeOfficialSkaterSummary}=
 require("../src/nhl-official-skater-summary.cjs");
const {getJSON,collectPeriodArchive}=
 require("./collect-nhl-official-period-events.cjs");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/**
 * NHL APIs rate-limit burst backfills. All endpoints in this single-date
 * pipeline share one sequential pacing gate, including PBP and shift pages.
 * A caller-supplied client enables deterministic, network-free unit tests.
 */
function makePacedClient(client,{minimumGapMs=1200,now=()=>Date.now(),
 sleepFn=sleep}={}){
 if(typeof client!=="function"||!Number.isFinite(minimumGapMs)||
  minimumGapMs<0||minimumGapMs>10000)throw Error("Invalid NHL pacing client");
 let last=-Infinity;
 return async(...args)=>{
  const gap=minimumGapMs-(now()-last);
  if(gap>0)await sleepFn(gap);
  last=now();
  return client(...args);
 };
}

function failureCategory(why){
 const x=String(why||"");
 if(/shiftchart pagination.*reported=0, received=0|shiftchart.*reported=0, received=0/i.test(x))
  return "official_shiftchart_zero_rows";
 if(/shiftchart|shift charts/i.test(x))return "official_shiftchart_incomplete";
 if(/aborted due to timeout|timed out|TimeoutError|AbortError|ETIMEDOUT|ECONNRESET|fetch failed/i.test(x))
  return "transient_or_http_source_failure";
 if(/NHL official source HTTP|HTTP [45]\d\d/i.test(x))return "transient_or_http_source_failure";
 if(/reconcil|game.*incomplete|official.*final/i.test(x))
  return "historical_source_or_reconciliation_incomplete";
 return "unclassified_historical_source_error";
}
function coverage(existing,empty,added,addedEmpty){
 const a=new Set(existing),b=new Set(empty);
 for(const x of added){if(b.has(x))throw Error("Same NHL date cannot be both complete and empty");a.add(x);}
 for(const x of addedEmpty){if(a.has(x))throw Error("Same NHL date cannot be both complete and empty");b.add(x);}
 const all=historicalDates(),allowed=new Set(all);
 if([...a,...b].some(x=>!allowed.has(x))||
  [...a].some(x=>b.has(x)))throw Error("Invalid NHL historical completion calendar");
 return {seasonCalendarDays:all.length,completeDates:a.size,
  verifiedEmptyDates:b.size,accountedDates:a.size+b.size,
  remainingDates:all.length-a.size-b.size,
  allDatesAccountedFor:a.size+b.size===all.length};
}
const ROOT=path.resolve(__dirname,"..");
const SEASON_START="2025-10-07",SEASON_END="2026-06-24",MAX_DATES=5;
const dateOK=x=>/^\d{4}-\d{2}-\d{2}$/.test(x||"")&&
 Number.isFinite(Date.parse(x+"T00:00:00Z"));
function historicalDates(start=SEASON_START,end=SEASON_END){
 if(!dateOK(start)||!dateOK(end)||start<SEASON_START||
  end>SEASON_END||start>end)throw Error("Outside verified 2025–26 NHL date bounds");
 const list=[],first=Date.parse(start+"T00:00:00Z");
 const last=Date.parse(end+"T00:00:00Z");
 for(let t=first;t<=last;t+=86400000)
  list.push(new Date(t).toISOString().slice(0,10));
 return list;
}
function nextMissingSeasonDates({existingDates=[],emptyDates=[],recentFailedDates=[],max=MAX_DATES}={}){
 if(!Number.isInteger(max)||max<1||max>7)
  throw Error("Only 1–7 official season dates permitted per bounded batch");
 const seen=new Set([...existingDates,...emptyDates]);
 const missing=historicalDates().filter(d=>!seen.has(d)),failed=new Set(recentFailedDates);
 // A failing date stays missing, but cannot starve all later dates. Retain
 // one retry slot each batch plus four new dates where available.
 const retry=recentFailedDates.filter(d=>missing.includes(d)),newDates=missing.filter(d=>!failed.has(d));
 return [...retry.slice(0,1),...newDates,...retry.slice(1)].slice(0,max);
}
// NHL API schedule mixes NHL club games with the 2026 Olympic tournament
// (202509xxxx), for which NHL Stats shiftcharts do not exist. Only season
// 2025 regular (02) and NHL playoffs (03) belong to NHL training history.
function partitionLeagueSeasonGames(games,date){
 if(!Array.isArray(games)||!dateOK(date))throw Error("Invalid NHL season schedule partition");
 const onDate=games.filter(g=>g?.date===date),league=[],other=[];
 for(const g of onDate){
  const family=Number.isInteger(g.id)?Math.floor(g.id/10000):null;
  if(family===202502||family===202503)league.push(g);
  else other.push(g);
 }
 return {league,excludedNonLeagueGames:other.length,
  otherCompetitionTypes:[...new Set(other.map(g=>Number.isInteger(g.id)?Math.floor(g.id/10000):"unknown"))].sort()};
}
async function officialHistoricalSource(date,{client=fetch}={}){
 if(!historicalDates().includes(date))throw Error("Not a 2025–26 NHL historical date");
 const response=await getJSON("https://api-web.nhle.com/v1/schedule/"+date,{client});
 const observed=partitionLeagueSeasonGames(normalizeSchedule(response),date),
  games=observed.league;
 if(!games.length)return {requestedDate:date,scheduledGames:0,
  completedGames:0,collectedGames:0,players:[],errors:[],emptySchedule:true,
  excludedNonLeagueGames:observed.excludedNonLeagueGames,
  excludedCompetitionTypes:observed.otherCompetitionTypes,
  noNhlClubGamesInVerifiedOfficialSchedule:true};
 if(games.some(g=>!["OFF","FINAL"].includes(g.gameState)))
  throw Error("Historical NHL game unexpectedly not official FINAL");
 const players=[],supplementalWarnings=[];
 for(const game of games){
  const original=await getJSON(
   "https://api-web.nhle.com/v1/gamecenter/"+game.id+"/boxscore",{client});
  let rows=normalizeBoxscore(original);
  const supplement=async(url,normalize,merge,label)=>{
   try{
    const response=await getJSON(url,{client});
    rows=merge(rows,normalize(response,{gameId:game.id}),{gameId:game.id});
   }catch(e){supplementalWarnings.push({gameId:game.id,
    source:label,error:e.message,fieldsRemainNullIfUnproven:true});}
  };
  await supplement(faceoffsReportUrl(game.id),normalizeOfficialFaceoffWins,
   mergeOfficialFaceoffs,"NHL official skater faceoffwins");
  await supplement(goalieSummaryUrl(game.id),parseOfficialGoalieSummary,
   mergeOfficialGoalieFantasy,"NHL official goalie summary");
  await supplement(skaterSummaryUrl(game.id),normalizeOfficialSkaterSummary,
   mergeOfficialSkaterSummary,"NHL official skater summary");
  players.push(...rows);
 }
 return {requestedDate:date,sourceSchemaVersion:5,
  fetchedAt:new Date().toISOString(),
  source:"NHL public API - isolated 2025-26 period training archive",
  historicalSeason:"2025-26",
  scheduledGames:games.length,completedGames:games.length,
  collectedGames:games.length,players,errors:[],supplementalWarnings,
  excludedNonLeagueGames:observed.excludedNonLeagueGames,
  excludedCompetitionTypes:observed.otherCompetitionTypes,
  isolatedFromProductionPlayerHistory:true};
}
function priorSeasonDateFiles(names){
 const allowed=new Set(historicalDates());
 return names.filter(name=>/^\d{4}-\d{2}-\d{2}\.json$/.test(name)&&allowed.has(name.slice(0,10)))
  .map(name=>name.slice(0,10));
}
async function loadExisting(){
 const list=async folder=>{
  try{return priorSeasonDateFiles(await fs.readdir(path.join(ROOT,folder)));}
  catch(e){if(e.code==="ENOENT")return [];throw e;}
 };
 return {existingDates:await list("outputs/period-stats/dates"),
  emptyDates:await list("outputs/period-stats/empty-dates")};
}
async function main(){
 const range=await loadExisting();
 let previous={};try{previous=JSON.parse(await fs.readFile(path.join(ROOT,"outputs/period-stats/prior-season-backfill-status-latest.json"),"utf8"));}catch{}
 const failures=new Map((previous.retryBacklog||[]).map(x=>[x.date,x]));
 for(const x of previous.failed||[])if(!failures.has(x.date))failures.set(x.date,{date:x.date,attempts:1,lastAttemptAt:previous.createdAt||null});
 const recentFailedDates=[...failures.values()].sort((a,b)=>String(a.lastAttemptAt).localeCompare(String(b.lastAttemptAt))).map(x=>x.date);
 const todo=nextMissingSeasonDates({...range,recentFailedDates});
 const client=makePacedClient(fetch,{minimumGapMs:1200});
 const summary={kind:"nhl_2025_26_prior_season_period_backfill_v1",
  requested:todo,completeDates:[],emptyDates:[],failed:[],
  noProductionPlayerHistoryChanges:true,paidProviderRequests:0,
  originalPlatformQuoteChecks:0,gradedWagers:0};
 for(const date of todo){
  try{
   const source=await officialHistoricalSource(date,{client});
   if(source.emptySchedule){
    const dir=path.join(ROOT,"outputs/period-stats/empty-dates");
    await fs.mkdir(dir,{recursive:true});
    await fs.writeFile(path.join(dir,date+".json"),
     JSON.stringify({date,source:"NHL_schedule",noScheduledGames:true,
     noNhlClubGamesInVerifiedOfficialSchedule:source.noNhlClubGamesInVerifiedOfficialSchedule===true,
     excludedNonLeagueGames:source.excludedNonLeagueGames||0,
     excludedCompetitionTypes:source.excludedCompetitionTypes||[]},null,2)+"\n");
    summary.emptyDates.push(date);failures.delete(date);continue;
   }
   const report=await collectPeriodArchive(date,{source,client});
   if(!report.complete||report.gameCount!==source.scheduledGames){
    const dir=path.join(ROOT,"outputs/period-stats/partial-dates");await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,date+".json"),JSON.stringify({...report,complete:false,researchOnly:true,notForProductionGrading:true},null,2)+"\n");
    throw Error("NHL historical period archive incomplete: "+report.errors.map(x=>x.reason).slice(0,3).join("; "));
   }
   const sourceDir=path.join(ROOT,"outputs/period-stats/training-source"),
    outputDir=path.join(ROOT,"outputs/period-stats/dates");
   await fs.mkdir(sourceDir,{recursive:true});await fs.mkdir(outputDir,{recursive:true});
   await fs.writeFile(path.join(sourceDir,date+".json"),
    JSON.stringify(source,null,2)+"\n");
   await fs.writeFile(path.join(outputDir,date+".json"),
    JSON.stringify(report,null,2)+"\n");
   failures.delete(date);
   summary.completeDates.push({date,games:report.gameCount,
    periodRows:report.playerPeriodRows.length,
    quarantinedMarketPlayerRows:report.sourceReconciliationQuarantine.length,
    supplementalWarnings:source.supplementalWarnings.length});
  }catch(e){
   summary.failed.push({date,error:e.message,category:failureCategory(e.message)});
   failures.set(date,{date,attempts:(failures.get(date)?.attempts||0)+1,lastAttemptAt:new Date().toISOString(),reason:e.message,category:failureCategory(e.message)});
   console.warn("::warning::NHL previous-season period date "+date+
    " not complete; retry on next scheduled run: "+e.message);
  }
 }
 const dir=path.join(ROOT,"outputs/period-stats");
 await fs.mkdir(dir,{recursive:true});
 await fs.writeFile(path.join(dir,"prior-season-backfill-status-latest.json"),
  JSON.stringify({...summary,
   historicalCoverage:coverage(range.existingDates,range.emptyDates,summary.completeDates.map(x=>x.date),summary.emptyDates),
   retryBacklog:[...failures.values()],
   retryFailureCategories:Object.fromEntries([...new Set([...failures.values()].map(x=>x.category||failureCategory(x.reason)))].sort().map(cat=>[cat,[...failures.values()].filter(x=>(x.category||failureCategory(x.reason))===cat).length])),
   zeroRowShiftchartDatesStillMissing:[...failures.values()].filter(x=>(x.category||failureCategory(x.reason))==="official_shiftchart_zero_rows").length,
   createdAt:new Date().toISOString(),
   sourceStatus:summary.failed.length?"partial_retry_pending":"batch_complete"},null,2)+"\n");
 console.log(JSON.stringify(summary));
 // Failed dates are NOT marked complete; the next scheduled pass retries.
}
if(require.main===module)main().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
module.exports={SEASON_START,SEASON_END,MAX_DATES,historicalDates,
 nextMissingSeasonDates,makePacedClient,officialHistoricalSource,loadExisting,main,failureCategory,coverage,priorSeasonDateFiles,partitionLeagueSeasonGames};
