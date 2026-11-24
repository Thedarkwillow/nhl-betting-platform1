"use strict";
const fs=require("node:fs"),path=require("node:path");
const {normalizeNhlLog,evaluateArchiveOutcomes}=require("../src/oddspapi-walkforward.cjs");
const {FIELDS,normalizeStatsReport,mergeOfficialGameStats}=require("../src/nhl-stats-backfill.cjs");
const {compareCandidates}=require("../src/nhl-temporal-model-comparison.cjs");
const root=path.resolve(__dirname,".."),sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function officialLog(playerId,season){
 const url="https://api-web.nhle.com/v1/player/"+playerId+"/game-log/"+season+"/2";
 const response=await fetch(url,{signal:AbortSignal.timeout(24000)});
 if(!response.ok)throw Error("NHL official game log HTTP "+response.status);
 return normalizeNhlLog(await response.json(),season==="20252026"?"2025-26":"2026-27");
}
async function officialStats(id,season,market){
 if(!FIELDS[market])throw Error("Unknown NHL supplemental stat");
 const u=new URL("https://api.nhle.com/stats/rest/en/"+FIELDS[market].endpoint);
 u.searchParams.set("cayenneExp","playerId="+id+" and seasonId="+season+" and gameTypeId=2");
 u.searchParams.set("isGame","true");
 u.searchParams.set("start","0");
 u.searchParams.set("limit","150");
 const response=await fetch(u,{signal:AbortSignal.timeout(28000)});
 if(!response.ok)throw Error("Official NHL Stats REST "+market+" HTTP "+response.status);
 const payload=await response.json();
 return normalizeStatsReport(payload,{playerId:id,season,market});
}
async function main(){
 const audit=JSON.parse(fs.readFileSync(path.join(root,"outputs/oddspapi/nhl/outcome-audit-latest.json"),"utf8"));
 if(audit.status!=="partial_verified_line_outcomes"||!audit.matchedLines||!audit.lines?.length)
  throw Error("No officially confirmed historical PrizePicks line outcomes; do not backtest");
 const playerSeasons=new Map();
 for(const row of audit.lines){
  const key=String(row.playerId),existing=playerSeasons.get(key)||new Set();
  existing.add("20252026");
  if(row.season==="2026-27")existing.add("20262027");
  playerSeasons.set(key,existing);
 }
 const keys=[...playerSeasons].sort((a,b)=>Number(a[0])-Number(b[0]));
 const wanted=new Map();
 for(const row of audit.lines){
  if(row.market==="blockedShots"||row.market==="saves"){
   const set=wanted.get(String(row.playerId))||new Set();
   set.add(row.market);wanted.set(String(row.playerId),set);
  }
 }
 const cachePath=path.join(root,"outputs/oddspapi/nhl/official-historical-player-logs-latest.json");
 let calls=0,statsCalls=0,logs={},errors=[],reusedCache=false,statsRowsAdded=0;
 let previous=null;
 try{previous=JSON.parse(fs.readFileSync(cachePath,"utf8"));}catch{}
 if(previous?.schemaVersion===2&&previous.archiveGeneratedAt===audit.archiveGeneratedAt&&
    previous.lineOutcomeAuditGeneratedAt===audit.generatedAt&&previous.logs){
  logs=previous.logs;errors=previous.errors||[];
  reusedCache=true;statsRowsAdded=previous.statsRowsAdded||0;
  console.log(JSON.stringify({reusedOfficialHistory:true,players:Object.keys(logs).length}));
 }else{
  for(const [id,seasons] of keys){
   const playerGames=new Map();
   for(const season of seasons){
    let seasonGames=[];
    if(calls>=320){
     errors.push({playerId:id,season,error:"web_game_log_call_cap_reached"});
    }else{
     calls++;await sleep(260);
     try{seasonGames=await officialLog(id,season);}
     catch(e){errors.push({playerId:id,season,error:e.message});}
    }
    for(const market of wanted.get(id)||[]){
     if(statsCalls>=200){errors.push({playerId:id,season,market,error:"NHL_stats_rest_call_cap_reached"});continue;}
     statsCalls++;await sleep(260);
     try{
      const extra=await officialStats(id,season,market);
      const before=new Map(seasonGames.map(g=>[String(g.gameId),g[market]]));
      seasonGames=mergeOfficialGameStats(seasonGames,extra);
      statsRowsAdded+=extra.filter(g=>!Number.isFinite(before.get(String(g.gameId)))).length;
     }catch(e){errors.push({playerId:id,season,market,error:e.message});}
    }
    for(const g of seasonGames){
     const existing=playerGames.get(g.gameId);
     if(existing&&JSON.stringify(existing)!==JSON.stringify(g)){
      errors.push({playerId:id,season,gameId:g.gameId,error:"conflicting_official_history_game_id"});
      continue;
     }
     playerGames.set(g.gameId,g);
    }
   }
   logs[id]=[...playerGames.values()].sort((a,b)=>a.gameDate.localeCompare(b.gameDate));
  }
  const cache={schemaVersion:2,generatedAt:new Date().toISOString(),
   archiveGeneratedAt:audit.archiveGeneratedAt,lineOutcomeAuditGeneratedAt:audit.generatedAt,
   source:"NHL Web game logs with official NHL Stats REST per-game blocked shots and goalie saves",
   webGameLogCalls:calls,statsRestCalls:statsCalls,statsRowsAdded,errors,logs};
  fs.writeFileSync(cachePath,JSON.stringify(cache)+"\n");
 }
 const result=evaluateArchiveOutcomes(audit,logs);
 result.temporalModelComparison=compareCandidates(audit.lines,logs);
 result.generatedAt=new Date().toISOString();
 result.archiveGeneratedAt=audit.archiveGeneratedAt;
 result.lineOutcomeAuditGeneratedAt=audit.generatedAt;
 result.playerSeasonsFetched=keys.length;
 result.officialNhlCalls=calls;
 result.officialStatsRestCalls=statsCalls;
 result.officialStatsRowsBackfilled=statsRowsAdded;
 result.officialHistoryCached=reusedCache;
 result.logErrors=errors;
 result.modelStatus=errors.length?"partial_history_download":"historical_sample_only";
 result.sampledOnly=true;
 result.gameLogCallBudget=320;
 result.statsRestCallBudget=200;
 result.dataCoverageComplete=false;
 const output=path.join(root,"outputs/oddspapi/nhl/retrospective-model-latest.json");
 fs.writeFileSync(output,JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({evaluated:result.evaluated,bySeason:result.bySeason,
  exclusions:result.excluded,players:result.playerSeasonsFetched,nhlApiCalls:calls,logErrors:errors.length,statsRestCalls:statsCalls,statsRowsBackfilled:statsRowsAdded,cacheHit:reusedCache}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main,officialLog,officialStats};
