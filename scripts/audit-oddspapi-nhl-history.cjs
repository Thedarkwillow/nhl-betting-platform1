"use strict";
const fs=require("node:fs"),path=require("node:path");
const {normalizeSchedule}=require("../src/schedule.cjs");
const {normalizeBoxscore}=require("../src/boxscore.cjs");
const {parsePlayers,findOfficialGame,auditHistoricalArchive}=require("../src/oddspapi-historical-identity.cjs");
const root=path.resolve(__dirname,"..");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function json(url,timeout=25000){
 const response=await fetch(url,{signal:AbortSignal.timeout(timeout)});
 if(!response.ok)throw Error("HTTP "+response.status+" on "+url.origin+url.pathname);
 return response.json();
}
async function playerLookup(key,ids){
 const url=new URL("https://api.oddspapi.io/v4/players");
 url.searchParams.set("sportId","15");
 url.searchParams.set("playerIds",ids.join(","));
 url.searchParams.set("apiKey",key);
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok){
  let providerReason="unspecified";
  try{
   const body=await response.json();
   providerReason=String(body?.message||body?.error?.message||body?.details||body?.code||"unspecified")
    .replace(/apiKey\s*[:=]\s*[^ ]+/gi,"[redacted]").slice(0,180);
  }catch{}
  const e=new Error("OddsPapi /players HTTP "+response.status+" "+providerReason);
  e.httpStatus=response.status;throw e;
 }
 const body=await response.json();
 const parsed=parsePlayers(body);
 const keys=body&&typeof body==="object"?Object.keys(body):[];
 const first=keys.length?body[keys[0]]:null;
 parsed.diagnostic={responseType:Array.isArray(body)?"array":typeof body,
   topLevelKeys:keys.slice(0,6),
   firstValueType:Array.isArray(first)?"array":typeof first,
   firstValueKeys:first&&typeof first==="object"?Object.keys(first).slice(0,8):[],
   sampleEntryType:Array.isArray(first)&&first.length?typeof first[0]:null,
   sampleEntryKeys:Array.isArray(first)&&first[0]&&typeof first[0]==="object"?Object.keys(first[0]).slice(0,8):[],
   nestedFirstType:first&&typeof first==="object"?typeof Object.values(first)[0]:"none",
   nestedFirstKeys:first&&typeof first==="object"&&Object.values(first)[0]&&typeof Object.values(first)[0]==="object"?
    Object.keys(Object.values(first)[0]).slice(0,8):[],
   nestedFirstArrayLength:first&&typeof first==="object"&&Array.isArray(Object.values(first)[0])?
    Object.values(first)[0].length:null};
 return parsed;
}
function augmentHistory(history,boxscores){
 const augmented=structuredClone(history),conflicts=[],added=[];
 if(!augmented.players)augmented.players={};
 for(const game of boxscores){
  for(const record of game.players){
   if(!record.playerId||!record.name||!record.gameDate)continue;
   const id=String(record.playerId),previous=augmented.players[id];
   if(previous?.games?.some(g=>String(g.gameId)===String(record.gameId))){
    const earlier=previous.games.find(g=>String(g.gameId)===String(record.gameId));
    if(["goals","assists","shotsOnGoal","blockedShots","saves"].some(field=>Number.isFinite(earlier[field])&&Number.isFinite(record[field])&&earlier[field]!==record[field]))
     conflicts.push({playerId:record.playerId,gameId:record.gameId,reason:"official_boxscore_conflicts_with_archive"});
    continue;
   }
   if(previous){
    previous.games.push(record);
   }else{
    augmented.players[id]={playerId:record.playerId,name:record.name,team:record.team,
      type:record.type,games:[record]};
   }
   added.push({playerId:record.playerId,gameId:record.gameId});
  }
 }
 return {history:augmented,added:added.length,conflicts};
}
async function main(){
 const key=process.env.ODDSPAPI_API_KEY;
 if(!key)throw Error("Missing ODDSPAPI_API_KEY: no paid-quota metadata requests made");
 const expanded=path.join(root,"outputs/oddspapi/nhl/archive-expanded-latest.json");
 const fallback=path.join(root,"outputs/oddspapi/nhl/archive-probe-latest.json");
 const archive=JSON.parse(fs.readFileSync(fs.existsSync(expanded)?expanded:fallback,"utf8"));
 const history=JSON.parse(fs.readFileSync(path.join(root,"outputs/history/players.json"),"utf8"));
 const fixtures=archive.samples.filter(f=>f.rows?.length>0&&Array.isArray(f.teams));
 const seasons=["2025-26","2026-27"],ids=[];
 for(const season of seasons){
  const seasonIds=[...new Set(fixtures.filter(f=>f.season===season).flatMap(f=>f.rows.map(r=>String(r.playerId))))];
  ids.push(...seasonIds.slice(0,24));
 }
 const uniqueIds=[...new Set(ids)].slice(0,48),names={},providerIssues=[];
 let lookupCalls=0;
 // First diagnose the provider contract with ONE player ID. No broad
 // metadata pulls until we know lookup shape and authentication work.
 const lookupSubset=uniqueIds.slice(0,1);
 for(let i=0;i<lookupSubset.length;i+=1){
  if(i)await sleep(1300);
  lookupCalls++;
  try{
   const response=await playerLookup(key,lookupSubset.slice(i,i+1));
   Object.assign(names,response.names);
   providerIssues.push(...response.issues);
   console.log(JSON.stringify({playerLookupBatch:lookupCalls,idsQueried:Math.min(1,lookupSubset.length-i),
    namesResolved:Object.keys(response.names).length,apiShape:response.shape,diagnostic:response.diagnostic,issueCount:response.issues.length}));
  }catch(e){
   providerIssues.push("player_lookup_"+e.message);
   console.log(JSON.stringify({lookupError:e.message,remainingBatchesSkipped:true}));
   break;
  }
 }
 const games=new Map(),dates=new Set();
 for(const f of fixtures){
  const stamp=Date.parse(f.eventStartsAt);
  for(const offset of [0,-86400000])dates.add(new Date(stamp+offset).toISOString().slice(0,10));
 }
 const scheduleErrors=[];
 for(const date of dates){
  try{
   const schedule=normalizeSchedule(await json(new URL("https://api-web.nhle.com/v1/schedule/"+date)));
   for(const game of schedule)games.set(game.id,game);
  }catch(e){scheduleErrors.push({date,reason:e.message});}
 }
 const gameIds=new Map();
 for(const fixture of fixtures){
  const g=findOfficialGame(fixture,[...games.values()]);
  if(g)gameIds.set(g.id,g);
 }
 const boxscores=[],boxscoreErrors=[];
 for(const g of gameIds.values()){
  try{
   const url=new URL("https://api-web.nhle.com/v1/gamecenter/"+g.id+"/boxscore");
   const payload=await json(url);
   if(!["OFF","FINAL"].includes(payload.gameState))throw Error("Official game not final");
   boxscores.push({gameId:g.id,players:normalizeBoxscore(payload)});
  }catch(e){boxscoreErrors.push({gameId:g.id,reason:e.message});}
 }
 const merged=augmentHistory(history,boxscores);
 const report=auditHistoricalArchive(archive,names,merged.history,[...games.values()]);
 report.generatedAt=new Date().toISOString();
 report.archiveGeneratedAt=archive.generatedAt;
 report.source="Archived OddsPapi PrizePicks lines, OddsPapi player lookup, official NHL schedule and final boxscore";
 report.metadataRequestsMade=lookupCalls;
 report.providerIdsQueried=uniqueIds.length;
 report.providerNamesResolved=Object.keys(names).length;
 report.officialGamesMatched=gameIds.size;
 report.officialBoxscoresAvailable=boxscores.length;
 report.officialBoxscorePlayersAdded=merged.added;
 report.providerIssues=providerIssues;
 report.scheduleErrors=scheduleErrors;
 report.boxscoreErrors=boxscoreErrors;
 report.officialStatConflicts=merged.conflicts;
 if(merged.conflicts.length){
  // Fail closed: do not grade any inconsistent official/archive records.
  report.lines=[];report.matchedLines=0;
  for(const s of Object.values(report.bySeason)){s.matchedLines=0;s.modelEvaluable=0;s.hitRate=null;}
  report.status="blocked_official_stat_conflict";
 }else report.status=report.matchedLines?"partial_verified_line_outcomes":"needs_player_identity_or_official_history";
 const output=path.join(root,"outputs/oddspapi/nhl/outcome-audit-latest.json");
 fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:report.status,matchedLines:report.matchedLines,
  bySeason:report.bySeason,providerNamesResolved:report.providerNamesResolved,officialGamesMatched:report.officialGamesMatched,
  issues:report.issues,providerIssues:report.providerIssues.slice(0,3)}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main,augmentHistory,playerLookup};
