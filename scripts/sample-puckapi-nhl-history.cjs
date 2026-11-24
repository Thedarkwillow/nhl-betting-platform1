"use strict";
const fs=require("node:fs"),path=require("node:path");
const {evaluateHistory,summarizeSeasonResults}=require("../src/puckapi-historical-backtest.cjs");
const root=path.resolve(__dirname,"..");
const players=[{id:8478402,name:"Connor McDavid"},{id:8477492,name:"Nathan MacKinnon"}];
const seasons=[{label:"2025-26",id:"20252026",from:"2025-10-07",to:"2026-06-30"},
 {label:"2026-27",id:"20262027",from:"2026-10-07",to:"2026-11-01"}];
const endpoint="https://mcp.puckapi.com/v1/get_prop_history";
async function fetchHistory(key,player,season){
 const request={player_id:player.id,market:"player_shots_on_goal",from_date:season.from,
  to_date:season.to,limit:25};
 const response=await fetch(endpoint,{method:"POST",
  headers:{"Content-Type":"application/json","x-api-key":key},
  body:JSON.stringify(request),signal:AbortSignal.timeout(30000)});
 if(!response.ok){
  const body=await response.text();
  let hint="API request rejected";
  if(response.status===401||response.status===403)hint="Check PUCKAPI_API_KEY GitHub Actions secret and PuckAPI permissions";
  if(response.status===402||/insufficient credits/i.test(body))hint="PuckAPI free credits unavailable; stop without further requests";
  if(response.status===429)hint="PuckAPI rate-limited; no additional requests";
  throw Error("PuckAPI HTTP "+response.status+": "+hint);
 }
 const envelope=await response.json(),data=envelope?.data;
 if(!data||!Array.isArray(data.games)||String(data.player_id)!==String(player.id)||
    data.market!=="player_shots_on_goal")throw Error("PuckAPI historical response failed schema/player/market checks");
 if(data.games.some(g=>g.game_date<season.from||g.game_date>season.to))
  throw Error("PuckAPI returned games outside requested historical season");
 return {data,request,creditsRemaining:response.headers.get("x-credits-remaining")||null};
}
async function fetchOfficialLog(player,season){
 const url="https://api-web.nhle.com/v1/player/"+player.id+"/game-log/"+season.id+"/2";
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error("NHL official game log HTTP "+response.status+" for "+season.label);
 const data=await response.json();
 if(!Array.isArray(data.gameLog))throw Error("Official NHL game log response missing gameLog for "+season.label);
 return data;
}
async function main(){
 const key=process.env.PUCKAPI_API_KEY;
 if(!key)throw Error("Missing PUCKAPI_API_KEY GitHub Actions secret (no calls made)");
 const pieces=[],snapshots=[],retrievedAt=new Date().toISOString();
 for(const player of players){
  for(const season of seasons){
   const official=await fetchOfficialLog(player,season);
   const {data,request,creditsRemaining}=await fetchHistory(key,player,season);
   const result=evaluateHistory({response:data,official,season:season.label,
    playerId:player.id,market:request.market,retrievedAt});
   pieces.push(result);
   snapshots.push({playerId:player.id,player:player.name,season:season.label,
    source:"PuckAPI historical sportsbook closing median",retrievedAt,request,sourcePlayerName:data.player_name,
    truncated:result.truncated,nextFromDate:result.nextFromDate,providerReportedGames:result.providerReportedGames});
   console.log(JSON.stringify({player:player.name,season:season.label,lines:data.games.length,
    officialMatches:result.matchedOfficialDecisions,evaluated:result.evaluatedDecisions,
    truncated:result.truncated,creditsRemaining}));
 }
 }
 const summary=summarizeSeasonResults(pieces);
 const report={schemaVersion:1,generatedAt:new Date().toISOString(),summary,
  sampledPlayers:players,sampledSeasons:seasons.map(x=>x.label),
  samples:pieces.map(({providerReportedGames,...rest})=>rest)};
 const dir=path.join(root,"outputs/puckapi/nhl");
 fs.mkdirSync(path.join(dir,"history-snapshots"),{recursive:true});
 fs.writeFileSync(path.join(dir,"backtest-latest.json"),JSON.stringify(report,null,2)+"\n");
 for(const entry of snapshots){
  const filename=entry.season+"-"+entry.playerId+".json";
  fs.writeFileSync(path.join(dir,"history-snapshots",filename),JSON.stringify(entry,null,2)+"\n");
 }
 console.log(JSON.stringify({summary:summary.overall,seasons:summary.seasons,provider:"PuckAPI, not PrizePicks"}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main,fetchHistory,fetchOfficialLog};
