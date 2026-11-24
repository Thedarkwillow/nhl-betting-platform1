"use strict";
const fs=require("node:fs"),path=require("node:path");
const {normalizeNhlLog}=require("../src/oddspapi-walkforward.cjs");
const ROOT=path.resolve(__dirname,"..");
const OUTPUT=path.join(ROOT,"outputs/official-nhl/2024-25/referenced-players-latest.json");
const SOURCE=path.join(ROOT,"outputs/oddspapi/nhl/outcome-audit-latest.json");
function verifiedPlayerIds(audit){
 if(!Array.isArray(audit?.lines))throw Error("Official-outcome audit missing");
 return [...new Set(audit.lines.filter(r=>r.officialResultVerified===true&&
  r.providerPlayerIdentityVerified===true&&Number.isInteger(Number(r.playerId))&&Number(r.playerId)>0)
  .map(r=>Number(r.playerId)))].sort((a,b)=>a-b);
}
async function loadSeason(id,{fetcher=fetch}={}){
 const url="https://api-web.nhle.com/v1/player/"+id+"/game-log/20242025/2";
 const res=await fetcher(url,{signal:AbortSignal.timeout(30000)});
 if(res.status===404)return {status:"not_found",games:[]};
 if(!res.ok){const e=Error("Official NHL game log HTTP "+res.status);e.status=res.status;throw e;}
 const games=normalizeNhlLog(await res.json(),"2024-25");
 if(games.some(g=>g.gameDate<"2024-09-01"||g.gameDate>"2025-07-01"))
  throw Error("Unexpected game outside NHL 2024-25 season");
 return {status:games.length?"verified_games":"no_regular_season_games",games};
}
async function main(){
 const audit=JSON.parse(fs.readFileSync(SOURCE,"utf8"));
 const all=verifiedPlayerIds(audit);
 if(!all.length)throw Error("No officially verified player IDs; refuse ungrounded historical import");
 fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});
 let previous=null;try{previous=JSON.parse(fs.readFileSync(OUTPUT,"utf8"));}catch{}
 const records=previous?.schemaVersion===1&&previous.sourceAuditFile==="outcome-audit-latest.json"?
  previous.players||{}:{};
 const errors=[],MAX_CALLS=180;let calls=0,added=0,rateLimited=false;
 const persist=()=>{
  const completed=all.filter(id=>records[id]?.status).length;
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),
   source:"Official NHL Web player game logs",sourceAuditFile:"outcome-audit-latest.json",
   season:"2024-25",nhlSeasonId:"20242025",scope:"Only players with identities verified against archived PrizePicks line outcomes",
   targetPlayers:all.length,completedPlayers:completed,
   playersWith2024_25Games:all.filter(id=>records[id]?.games?.length>0).length,
   historicalGameRows:all.reduce((n,id)=>n+(records[id]?.games?.length||0),0),
   complete:completed===all.length,requestsThisRun:calls,
   errors,players:records,
   containsPrizePicksLines:false,verifiedHistoricalPrizePicksClosingLines:false,
   modifiesExistingModel:false,
   warning:"Official 2024-25 player performance, NOT historical PickFinder or PrizePicks offered lines. Cannot by itself establish 2024-25 PrizePicks hit rates."};
  fs.writeFileSync(OUTPUT,JSON.stringify(report)+"\n");
  return report;
 };
 for(const id of all){
  if(records[id]?.status)continue;
  if(calls>=MAX_CALLS){errors.push({error:"bounded_call_budget"});break;}
  try{await new Promise(resolve=>setTimeout(resolve,380));
   calls++;records[id]=await loadSeason(id);added++;
   if(added%15===0)persist();
  }catch(e){
   errors.push({playerId:id,error:e.message});
   if(e.status===429||e.status>=500){rateLimited=true;break;}
   // Do not mark failed players resolved so a later run can try again.
  }
 }
 const output=persist();
 console.log(JSON.stringify({target:all.length,completed:output.completedPlayers,
  added,gameRows:output.historicalGameRows,requests:calls,
  errors:errors.length,complete:output.complete,rateLimited}));
 if(errors.length||!output.complete)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={verifiedPlayerIds,loadSeason};
