"use strict";
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,"../outputs/official-nhl/season-schedules");
const YEARS=["2023-24","2024-25","2025-26","2026-27"];
const TEAM_CODES=[
 "ANA","BOS","BUF","CAR","CBJ","CGY","CHI","COL","DAL","DET","EDM","FLA",
 "LAK","MIN","MTL","NJD","NSH","NYI","NYR","OTT","PHI","PIT","SEA","SJS",
 "STL","TBL","TOR","VAN","VGK","WPG","WSH"
];
function clubsForSeason(season){
 return [...TEAM_CODES,season==="2023-24"?"ARI":"UTA"];
}
function normalizeClubSchedule(payload,season){
 if(!Array.isArray(payload?.games))throw Error("Unexpected official NHL club schedule");
 return payload.games.filter(g=>[2,3].includes(Number(g.gameType))).map(g=>({
  id:Number(g.id),season,gameType:Number(g.gameType),
  startTimeUTC:g.startTimeUTC,gameState:g.gameState,
  home:g.homeTeam?.abbrev||null,away:g.awayTeam?.abbrev||null,
  gameDate:g.gameDate||null,
  finalized:["OFF","FINAL"].includes(g.gameState)
 })).filter(g=>Number.isInteger(g.id)&&g.id>0&&Number.isFinite(Date.parse(g.startTimeUTC))&&g.home&&g.away);
}
async function officialSeason(season,{fetcher=fetch,teams=clubsForSeason(season),pause=async()=>{}}={}){
 if(!YEARS.includes(season))throw Error("Unsupported NHL season");
 const games=new Map(),failed=[];
 const seasonID=season.slice(0,4)+"20"+season.slice(5);
 for(const club of teams){
  const url="https://api-web.nhle.com/v1/club-schedule-season/"+club+"/"+seasonID;
  try{
   const response=await fetcher(url,{signal:AbortSignal.timeout(30000)});
   if(!response.ok)throw Error("HTTP "+response.status);
   const rows=normalizeClubSchedule(await response.json(),season);
   if(!rows.length)throw Error("No regular-season or playoff games");
   for(const game of rows){
    const previous=games.get(game.id);
    if(previous && (previous.startTimeUTC!==game.startTimeUTC||
     previous.home!==game.home||previous.away!==game.away))
     throw Error("Official schedule identity conflict game "+game.id);
    games.set(game.id,game);
   }
  }catch(e){failed.push({team:club,message:e.message});}
  await pause();
 }
 return {schemaVersion:1,source:"Official NHL Web API",season,seasonID,
  generatedAt:new Date().toISOString(),teamSchedulesRequested:teams.length,
  teamSchedulesSucceeded:teams.length-failed.length,teamSchedulesFailed:failed,
  complete:failed.length===0&&teams.length===32,
  finalGames:[...games.values()].filter(g=>g.finalized).length,
  regularSeasonGames:[...games.values()].filter(g=>g.gameType===2).length,
  playoffGames:[...games.values()].filter(g=>g.gameType===3).length,
  games:[...games.values()].sort((a,b)=>a.startTimeUTC.localeCompare(b.startTimeUTC)||a.id-b.id),
  caveat:"Official schedule covers NHL regular season and playoffs. No claim about historical PrizePicks/Underdog prop existence."
 };
}
async function main(){
 fs.mkdirSync(ROOT,{recursive:true});
 const now=Date.now(),reports=[],errors=[];
 for(const season of YEARS){
  const target=path.join(ROOT,season+".json");
  let previous=null;
  try{previous=JSON.parse(fs.readFileSync(target,"utf8"))}catch{}
  const useCache=previous?.complete===true&&
    (season!=="2026-27"||now-Date.parse(previous.generatedAt)<20*3600000);
  if(useCache){reports.push({season,cached:true,complete:true,finalGames:previous.finalGames,totalGames:previous.games.length});continue;}
  const report=await officialSeason(season,{pause:()=>new Promise(r=>setTimeout(r,125))});
  // Do not overwrite a previously complete official schedule with an incomplete one.
  if(report.complete || !previous?.complete){
   fs.writeFileSync(target,JSON.stringify(report)+"\n");
  }
  reports.push({season,cached:false,complete:report.complete,finalGames:report.finalGames,
   totalGames:report.games.length,teamsOK:report.teamSchedulesSucceeded,
   failed:report.teamSchedulesFailed.slice(0,5)});
  if(!report.complete)errors.push({season,missingTeams:report.teamSchedulesFailed.length});
  console.log(JSON.stringify(reports.at(-1)));
 }
 fs.writeFileSync(path.join(ROOT,"coverage-latest.json"),JSON.stringify({
  generatedAt:new Date().toISOString(),source:"Official NHL Web API",
  seasons:reports,errors,allSeasonSchedulesComplete:errors.length===0,
  containsBookmakerLines:false},null,2)+"\n");
 if(errors.length)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={YEARS,clubsForSeason,normalizeClubSchedule,officialSeason};
