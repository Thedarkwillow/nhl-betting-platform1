"use strict";
const fs=require("node:fs/promises"),path=require("node:path");
const {BASE,parseMoneyPuckSeason,extractNextData,normalizeFaceoffGoalies,normalizeFaceoffLines}=
 require("../src/nhl-approved-source-adapters.cjs");
const {articleLinks,parseGame,sourceHealth,slugDate}=require("../src/nhl-editorial-lineups.cjs");
const {canonicalTeam}=require("../src/nhl-pregame-intel.cjs");
const root=path.resolve(__dirname,"..");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function fetchText(url,maxBytes=4500000){
 if(!url.startsWith("https://moneypuck.com/")&&!url.startsWith("https://www.dailyfaceoff.com/")&&
  !url.startsWith("https://api-web.nhle.com/")&&!url.startsWith("https://www.nhl.com/news/"))throw Error("Unexpected provider URL");
 const r=await fetch(url,{signal:AbortSignal.timeout(22000),headers:{"User-Agent":"NHL-Private-Research/1.0","Accept":"text/csv,text/html,application/json"}});
 if(!r.ok)throw Error(new URL(url).hostname+" HTTP "+r.status);
 const bytes=Number(r.headers.get("content-length"));
 if(Number.isFinite(bytes)&&bytes>maxBytes)throw Error("Provider file exceeds strict request budget");
 const body=await r.text();
 if(Buffer.byteLength(body)>maxBytes)throw Error("Provider file too large");
 return {body,lastModified:r.headers.get("last-modified")||null};
}
// Retry only a transient network timeout for a MoneyPuck season CSV, once.
// Never retry 4xx errors, schema errors or malformed/missing official data.
async function fetchMoneyPuckOnceMore(url,{fetcher=fetchText,wait=sleep}={}){
 try{return await fetcher(url);}
 catch(error){
  const transient=error?.name==="TimeoutError"||error?.name==="AbortError"||
   (error?.name==="TypeError"&&/fetch failed/i.test(error.message));
  if(!transient)throw error;
  await wait(1500);
  return fetcher(url);
 }
}
// A failed independent MoneyPuck file must not block current Daily Faceoff
// reporting. Return no partial MoneyPuck model features after any failure.
async function collectMoneyPuckSeasons({at,fetcher=fetchMoneyPuckOnceMore,parser=parseMoneyPuckSeason}={}){
 const now=Date.parse(at);
 if(!Number.isFinite(now))throw Error("Invalid MoneyPuck capture timestamp");
 const data={},timestamps={};
 for(const kind of ["skaters","goalies","teams"]){
  try{
   const {body,lastModified}=await fetcher(BASE+kind+".csv");
   if(lastModified&&Date.parse(lastModified)>now+60000)
    throw Error("MoneyPuck clock anomaly");
   data[kind]=parser(body,kind,at);
   timestamps[kind]=lastModified;
  }catch(e){
   return {complete:false,data:{},timestamps:{},
    errors:[{provider:"MoneyPuck",kind,reason:e.message}]};
  }
 }
 return {complete:true,data,timestamps,errors:[]};
}
const dateET=d=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
async function main(){
 const capturedAt=new Date().toISOString(),now=Date.parse(capturedAt),
  rawSchedule=JSON.parse(await fs.readFile(path.join(root,"outputs/official-nhl/season-schedules/2026-27.json"),"utf8"));
 if(rawSchedule.complete!==true||!Array.isArray(rawSchedule.games))throw Error("Official NHL season schedule unavailable");
 const future=rawSchedule.games.filter(g=>Date.parse(g.startTimeUTC)>now&&Date.parse(g.startTimeUTC)-now<=48*3600000);
 const dates=[dateET(new Date()),dateET(new Date(now+86400000))];
 const rosters={},sourceErrors=[];
 const teams=[...new Set(future.flatMap(g=>[canonicalTeam(g.home),canonicalTeam(g.away)]))].sort().slice(0,32);
 for(const team of teams){
  if(!/^[A-Z]{3}$/.test(team))continue;
  try{
   const {body}=await fetchText("https://api-web.nhle.com/v1/roster/"+team+"/20262027",1100000);
   const data=JSON.parse(body);
   if(!Array.isArray(data.goalies)||!Array.isArray(data.forwards))throw Error("Missing current official roster");
   rosters[team]=data;
  }catch(e){sourceErrors.push({provider:"NHL official roster",team,reason:e.message});}
  await sleep(70);
 }
 if(Object.keys(rosters).length<Math.min(2,teams.length))throw Error("No official NHL roster IDs available");
 const mp=await collectMoneyPuckSeasons({at:capturedAt});
 const moneypuck=mp.data,mpSourceTimes=mp.timestamps,moneyPuckComplete=mp.complete;
 sourceErrors.push(...mp.errors);
 const gameData=[],lineups={},officialEditorial=[];const requested=new Set();
 for(const d of dates){
  try{
   const {body}=await fetchText("https://www.dailyfaceoff.com/starting-goalies/"+d,900000);
   const record=normalizeFaceoffGoalies(extractNextData(body),rosters,rawSchedule,new Date().toISOString());
   for(const g of record.games)if(!gameData.some(x=>x.gameId===g.gameId))gameData.push(g);
  }catch(e){sourceErrors.push({provider:"Daily Faceoff goalies",date:d,reason:e.message});if(/HTTP (403|429)/.test(e.message))break;}
 }
 const gameTeams=[...new Set(future.flatMap(g=>[canonicalTeam(g.home),canonicalTeam(g.away)]))].slice(0,32);
 const teamSlugs={
  ANA:"anaheim-ducks",BOS:"boston-bruins",BUF:"buffalo-sabres",CGY:"calgary-flames",
  CAR:"carolina-hurricanes",CHI:"chicago-blackhawks",COL:"colorado-avalanche",CBJ:"columbus-blue-jackets",
  DAL:"dallas-stars",DET:"detroit-red-wings",EDM:"edmonton-oilers",FLA:"florida-panthers",
  LAK:"los-angeles-kings",MIN:"minnesota-wild",MTL:"montreal-canadiens",NSH:"nashville-predators",
  NJD:"new-jersey-devils",NYI:"new-york-islanders",NYR:"new-york-rangers",OTT:"ottawa-senators",
  PHI:"philadelphia-flyers",PIT:"pittsburgh-penguins",SJS:"san-jose-sharks",SEA:"seattle-kraken",
  STL:"st-louis-blues",TBL:"tampa-bay-lightning",TOR:"toronto-maple-leafs",UTA:"utah-mammoth",
  VAN:"vancouver-canucks",VGK:"vegas-golden-knights",WSH:"washington-capitals",WPG:"winnipeg-jets"
 };
 for(const team of gameTeams){
  const slug=teamSlugs[team];
  if(!slug||!rosters[team]||requested.has(team))continue;requested.add(team);
  try{
   const {body}=await fetchText("https://www.dailyfaceoff.com/teams/"+slug+"/line-combinations",900000);
   const normal=normalizeFaceoffLines(extractNextData(body),rosters,new Date().toISOString());
   if(normal.team!==team)throw Error("DFO team page does not match schedule");
   lineups[team]=normal;
  }catch(e){sourceErrors.push({provider:"Daily Faceoff lines",team,reason:e.message});if(/HTTP (403|429)/.test(e.message))break;}
  await sleep(140);
 }
 // Independently match NHL editorial preview links to official dated games.
 const indexes=[];
 for(const url of ["https://www.nhl.com/news/nhl-lineup-projections-2026-27-season","https://www.nhl.com/news/topic/game-previews/"]){
  try{indexes.push((await fetchText(url,8000000)).body);}catch(e){sourceErrors.push({provider:"NHL.com editorial index",reason:e.message});if(/HTTP (403|429)/.test(e.message))break;}
 }
 if(indexes.length)for(const game of future.filter(g=>Date.parse(g.startTimeUTC)>Date.now())){
  const away=teamSlugs[canonicalTeam(game.away)],home=teamSlugs[canonicalTeam(game.home)];
  const links=[...new Set(indexes.flatMap(html=>articleLinks(html,game)))];
  if(links.length>1){sourceErrors.push({provider:"NHL.com editorial preview",gameId:game.id,reason:"Ambiguous preview links"});continue;}
  // Use the documented NHL game-preview URL pattern only as a single fallback.
  const url=links[0]||(away&&home?"https://www.nhl.com/news/"+away+"-"+home+"-game-preview-"+slugDate(game.gameDate):null);
  if(!url)continue;
  try{
   const {body}=await fetchText(url,8000000);
   officialEditorial.push(parseGame(body,game,rosters,new Date().toISOString(),url));
  }catch(e){sourceErrors.push({provider:"NHL.com editorial preview",gameId:game.id,reason:e.message});if(/HTTP (403|429)/.test(e.message))break;}
  await sleep(220);
 }
 // Do not overwrite the last useful archive with an empty failed crawl.
 if(!moneyPuckComplete&&!gameData.length&&!Object.keys(lineups).length&&!officialEditorial.length)
  throw Error("Both approved NHL sources unavailable; previous immutable archive retained");
 const report={schemaVersion:1,kind:"approved_nhl_source_research_snapshots",
  generatedAt:new Date().toISOString(),privateRepoOnly:true,sourceApprovalUserReported:true,
  commercialUsageTermsAndRateLimitsNotDocumented:true,
  approvedProviders:["MoneyPuck","Daily Faceoff","NHL.com editorial"],
  dataAsOfPolicy:"first-observed source capture, no reconstructing earlier historical predictions",
  moneyPuck:{sourceFileLastModified:mpSourceTimes,
   completeSeasonSummary:moneyPuckComplete,
   availableForCurrentShadow:moneyPuckComplete,...moneypuck},
  dailyFaceoff:{sourceCapturedAt:capturedAt,games:gameData,lineups,
   goalieReports:gameData.reduce((s,g)=>s+g.goalies.length,0),
   reporterConfirmed:gameData.flatMap(g=>g.goalies).filter(x=>x.status==="reported_confirmed").length,
   lineTeams:Object.keys(lineups).length,officialClubLineupProof:false},
  nhlEditorial:{games:officialEditorial,projectedOnly:true,clubLineupsConfirmed:false},
  sourceHealth:sourceHealth(future,gameData,lineups,officialEditorial,sourceErrors),
  provenance:{officialRosterTeams:Object.keys(rosters).length,
   scheduledGames:future.length,collectionDates:dates,errors:sourceErrors},
  warnings:["Season-to-date MoneyPuck summary cannot be used to backtest games that occurred before capture",
   "DFO confirmed is a reported source status, not an original club confirmation",
   "DFO lines and PP unit assignments are projected, not guaranteed for puck drop",
   "No proprietary raw full CSV or raw webpage HTML syndicated publicly",
   "No model promotion or betting eligibility claims without prospective grading",
   "Missing MoneyPuck CSVs are NOT filled from older files or inferred from DFO; partial snapshots never produce a MoneyPuck shadow"]};
 const dir=path.join(root,"outputs/approved-nhl-sources");
 await fs.mkdir(path.join(dir,"snapshots"),{recursive:true});
 const stamp=capturedAt.slice(0,19).replace(/[-:]/g,"")+"Z",payload=JSON.stringify(report)+"\n";
 await fs.writeFile(path.join(dir,"snapshots",stamp+".json"),payload,{flag:"wx"});
 await fs.writeFile(path.join(dir,"latest.json"),payload);
 console.log(JSON.stringify({source:"MoneyPuck + Daily Faceoff",moneyPuckComplete,moneyPuckSkaters:moneypuck.skaters?.matchedRows??0,
  moneyPuckGoalies:moneypuck.goalies?.matchedRows??0,moneyPuckTeams:moneypuck.teams?.matchedRows??0,
  officialRosterTeams:Object.keys(rosters).length,futureGames:gameData.length,
  goalieReports:report.dailyFaceoff.goalieReports,reporterConfirmed:report.dailyFaceoff.reporterConfirmed,
  lineTeams:report.dailyFaceoff.lineTeams,editorialGames:officialEditorial.length,sourceHealth:report.sourceHealth,sourceWarnings:sourceErrors.length,
  warningExamples:sourceErrors.slice(0,8),
  pregameModelPromoted:false}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
module.exports={main,dateET,fetchMoneyPuckOnceMore,collectMoneyPuckSeasons};
