"use strict";
const fs=require("node:fs/promises"),path=require("node:path");
const {normalizePregame,canonicalTeam}=require("../src/nhl-pregame-intel.cjs");
const root=path.resolve(__dirname,".."),sourceBase="https://site.api.espn.com/apis/site/v2/sports/hockey/nhl";
async function getJson(url){
 const response=await fetch(url,{headers:{Accept:"application/json","User-Agent":"NHL-research-availability/1.0"},
  signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Error("NHL availability HTTP "+response.status+" "+new URL(url).hostname);
 return response.json();
}
const edtDate=now=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);
function datesToCheck(now){
 const d=edtDate(now),base=Date.parse(d+"T12:00:00Z");
 if(!Number.isFinite(base))throw Error("Unable to determine eastern calendar date");
 return [d,new Date(base+86400000).toISOString().slice(0,10)];
}
async function main(){
 const now=new Date(),at=now.toISOString(),dates=datesToCheck(now);
 const schedule=JSON.parse(await fs.readFile(path.join(root,"outputs/official-nhl/season-schedules/2026-27.json"),"utf8"));
 if(schedule.complete!==true||schedule.seasonID!=="20262027"||!Array.isArray(schedule.games))
  throw Error("Complete current-season official NHL game schedule required");
 const inj=await getJson(sourceBase+"/injuries");
 if(!Array.isArray(inj.injuries)||!Number.isFinite(Date.parse(inj.timestamp))||
    Date.parse(inj.timestamp)>Date.parse(at)+60000||
    Date.parse(at)-Date.parse(inj.timestamp)>36*3600000)
  throw Error("ESPN NHL injury response missing or stale; refusing to publish");
 const boards=[];
 for(const d of dates){const j=await getJson(sourceBase+"/scoreboard?dates="+d.replace(/-/g,""));
  if(!Array.isArray(j.events))throw Error("ESPN NHL scoreboard unexpected");
  boards.push(j);
 }
 const events=[...new Map(boards.flatMap(x=>x.events).map(x=>[x.id,x])).values()];
 const teams=new Set();
 for(const event of events)for(const comp of event.competitions||[])
  for(const team of comp.competitors||[]){
   const code=canonicalTeam(team.team?.abbreviation);
   if(/^[A-Z]{3}$/.test(code))teams.add(code);
  }
 // Only official CURRENT-SEASON roster identities, not guessed ESPN player IDs.
 const rosters={},missing=[];
 for(const code of [...teams].sort().slice(0,32)){
  try{
   const r=await getJson("https://api-web.nhle.com/v1/roster/"+code+"/20262027");
   if(!Array.isArray(r.goalies)||!Array.isArray(r.forwards))throw Error("Missing official roster groups");
   rosters[code]=r;
  }catch(e){missing.push({team:code,error:e.message});}
 }
 if(!Object.keys(rosters).length)throw Error("No NHL official roster identities available");
 const report=normalizePregame(inj,{events},rosters,schedule,at);
 const result={...report,sourceChecks:{espnInjuriesTimestamp:inj.timestamp,espnScoreboardDates:dates,
  officialScheduleGeneratedAt:schedule.generatedAt,rosterTeamCount:Object.keys(rosters).length,
  failedNhlRosters:missing.map(x=>x.team)},feedsFreshOnCapture:true,
  clearedPlayersAssumedFromMissingInjuries:false,
  requestedGameDayLineCombinationSource:false};
 const dir=path.join(root,"outputs/pregame-availability");
 await fs.mkdir(path.join(dir,"snapshots"),{recursive:true});
 const stamp=at.slice(0,19).replace(/[-:]/g,"")+"Z";
 // A first-write daily/at-time record; never modify older pregame records.
 await fs.writeFile(path.join(dir,"snapshots",stamp+".json"),JSON.stringify(result)+"\n",{flag:"wx"});
 await fs.writeFile(path.join(dir,"latest.json"),JSON.stringify(result)+"\n");
 console.log(JSON.stringify({source:"ESPN research only",capturedAt:at,injuryStatuses:report.injuries.length,
  sourceInjuries:report.coverage.injuries.sourceRecords,
  futureGames:report.events.length,reportedGoalies:report.events.flatMap(e=>e.goalies).length,
  reportedConfirmed:report.goalieReportedConfirmed,
  missingOfficialRosters:missing.length,neverAssumedHealthy:true,officialStarterConfirmations:0}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={datesToCheck,main};
