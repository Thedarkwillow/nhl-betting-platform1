"use strict";
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const {normalizeBoxscore}=require("../src/boxscore.cjs");
const {gradeGame,tally,backtest}=require("../src/sgo-nhl-official-grader.cjs");
const ROOT=path.resolve(__dirname,"..");
const SOURCE=path.join(ROOT,"outputs/sportsgameodds/nhl/full-game-coverage/windows");
const SCHEDULE=path.join(ROOT,"outputs/official-nhl/season-schedules");
const CACHE=path.join(ROOT,"outputs/official-nhl/prop-grading-boxscores");
const OUTPUT=path.join(ROOT,"outputs/sportsgameodds/nhl/official-outcome-grading");
const SEASONS=["2025-26","2026-27"];
const BOOKS=new Set(["prizepicks","underdog"]);
const MARKETS=new Set(["goals","assists","points","shotsOnGoal","blockedShots","saves"]);
const BUDGET=Math.max(1,Math.min(220,Math.floor(Number(process.env.NHL_BOX_SCORE_BUDGET)||180)));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const read=file=>JSON.parse(fs.readFileSync(file,"utf8"));
function loadInputs(){
 const games=new Map();
 for(const season of SEASONS){
  const official=read(path.join(SCHEDULE,season+".json"));
  if(official.complete!==true)throw Error("Incomplete official NHL season schedule: "+season);
  for(const g of official.games){
   if(!g.finalized||Date.parse(g.startTimeUTC)>Date.now())continue;
   games.set(g.id,{...g,season});
  }
 }
 if(!fs.existsSync(SOURCE))throw Error("No archived NHL closing-line windows");
 const props=new Map(),identity=new Set();
 for(const file of fs.readdirSync(SOURCE).filter(x=>x.endsWith(".json")).sort()){
  const snapshot=read(path.join(SOURCE,file));
  if(snapshot.queryFullyPaginated!==true)throw Error("Refusing partially paginated odds file "+file);
  for(const r of snapshot.rows||[]){
   const game=games.get(r.officialGameId);
   if(!game||!BOOKS.has(r.book)||!MARKETS.has(r.market)||r.closeField!=="closeOverUnder"||
     r.sourceGameMatched!==true||!Number.isFinite(r.line)||r.line<0||!r.player||
     Math.abs(Date.parse(r.eventStartsAt)-Date.parse(game.startTimeUTC))>3*3600000)continue;
   const key=[game.id,r.book,r.providerPlayerId,r.statID,r.line].join("|");
   if(identity.has(key))continue;
   identity.add(key);
   if(!props.has(game.id))props.set(game.id,[]);
   props.get(game.id).push({...r,season:game.season});
  }
 }
 return {games,props,sourceFiles:fs.readdirSync(SOURCE).filter(x=>x.endsWith(".json")).length};
}
function validateCached(game,doc){
 return doc?.schemaVersion===1&&doc.gameId===game.id&&
 doc.gameStartAt===game.startTimeUTC&&Array.isArray(doc.players)&&
 doc.players.length>0&&doc.players.every(p=>
  Number.isInteger(p.playerId)&&p.name&&[game.home,game.away].includes(p.team));
}
function decodeOfficial(game,payload){
 if(payload?.id!==game.id||!["OFF","FINAL"].includes(payload.gameState))throw Error("NHL boxscore not final or gameID disagrees");
 const players=normalizeBoxscore(payload);
 const doc={schemaVersion:1,source:"Official NHL gamecenter final boxscore",
  gameId:game.id,season:game.season,gameStartAt:game.startTimeUTC,
  gameDate:payload.gameDate||game.gameDate,home:game.home,away:game.away,
  gameState:payload.gameState,capturedAt:new Date().toISOString(),players};
 if(!validateCached(game,doc))throw Error("NHL official game boxscore player/team mismatch");
 return doc;
}
async function requestFinalBoxscore(game,fetcher=fetch){
 const response=await fetcher("https://api-web.nhle.com/v1/gamecenter/"+game.id+"/boxscore",
  {signal:AbortSignal.timeout(25000)});
 if(!response.ok){
  const err=Error("Official NHL boxscore HTTP "+response.status+" for game "+game.id);
  err.status=response.status;throw err;
 }
 return decodeOfficial(game,await response.json());
}
function countBucket(graded,fn){
 const counts={};
 for(const row of graded){
  const key=fn(row);
  if(!counts[key])counts[key]={higher:0,lower:0,push:0,lines:0};
  const c=counts[key];c.lines++;
  if(row.result==="Higher")c.higher++;
  else if(row.result==="Lower")c.lower++;
  else c.push++;
 }
 return counts;
}
function generateReports({games,props},cached,{updatedAt=new Date().toISOString()}={}){
 const graded=[],excluded=[],gameResults=[];
 for(const [id,lines] of props){
  const box=cached.get(id);
  if(!box)continue;
  const gradedFile=path.join(OUTPUT,"by-game",id+".json");
  const checksum=crypto.createHash("sha256").update(JSON.stringify(lines)).digest("hex");
  let report=null;
  try{report=read(gradedFile);}catch{}
  if(!report||report.schemaVersion!==1||report.gradeAlgorithmVersion!==3||report.lineChecksum!==checksum){
   const outcome=gradeGame(lines,box);
   report={schemaVersion:1,gameId:id,season:box.season,
    lineChecksum:checksum,gradeAlgorithmVersion:3,officialNhlBoxscoreId:box.gameId,
    generatedAt:updatedAt,source:"Independent SGO closing lines + official NHL boxscore",
    sourceOriginalPlatformsVerified:false,tiersVerified:false,
    originalPlatformSettlementVerified:false,dnpRebootVerified:false,
    originalScoringPartnerSnapshotVerified:false,
    prospectivePredictionsVerified:false,graded:outcome.graded,excluded:outcome.excluded};
   fs.mkdirSync(path.dirname(gradedFile),{recursive:true});
   fs.writeFileSync(gradedFile,JSON.stringify(report)+"\n");
  }
  graded.push(...report.graded);excluded.push(...report.excluded);
  gameResults.push({id,season:box.season,lines:lines.length,
   graded:report.graded.length,excluded:report.excluded.length});
 }
 const replay=backtest(graded,[...cached.values()]);
 const {decisions,...replaySummary}=replay;
 fs.writeFileSync(path.join(OUTPUT,"retrospective-model-latest.json"),
  JSON.stringify({...replaySummary,decisions},null,2)+"\n");
 const exclusions=Object.fromEntries([...new Set(excluded.map(e=>e.reason))].sort().map(reason=>
  [reason,excluded.filter(e=>e.reason===reason).length]));
 const byBookSeason=tally(graded,r=>r.book+"|"+r.season);
 const byMarket=tally(graded,r=>r.book+"|"+r.season+"|"+r.market);
 const complete=cached.size===props.size;
 const summary={
  schemaVersion:1,generatedAt:updatedAt,
  source:"Independent SportsGameOdds closeOverUnder + Official NHL final boxscore",
  scheduledBatchBudget:BUDGET,targetGamesWithArchivedPlatformLines:props.size,
  gamesWithOfficialCachedBoxscores:cached.size,remainingGames:props.size-cached.size,
  outcomeCoverageComplete:complete,
  sourceOriginalPlatformOffersVerified:false,tiersVerified:false,payoutsVerified:false,
  originalPlatformSettlementVerified:false,dnpRebootVerified:false,
  originalScoringPartnerSnapshotVerified:false,
  prospectiveModelAccuracyVerified:false,retrospectiveModelOnly:true,
  gradedLineRecords:graded.length,excludedLineRecords:excluded.length,exclusionCounts:exclusions,
  byBookSeason,byMarket,replaySummary,
  warning:"Graded directions indicate only which side won at each independent provider's historical close. They are NOT pregame model picks, not verified original PrizePicks/Underdog offers or tiers. The current official NHL boxscore can differ from originally settled PrizePicks scoring due to late stat corrections, DNP and Reboot policies; these conditions are unverified. Ambiguous names and missing official stats remain excluded. Retrospective model replay uses only prior cached official game results; prior-season history is incomplete. No profitability or prospective hit rate claimed."
 };
 fs.writeFileSync(path.join(OUTPUT,"summary-latest.json"),JSON.stringify(summary,null,2)+"\n");
 return summary;
}
async function main(){
 const {games,props,sourceFiles}=loadInputs();
 fs.mkdirSync(CACHE,{recursive:true});fs.mkdirSync(OUTPUT,{recursive:true});
 const cached=new Map(),errors=[],newlyFetched=[],sorted=[...props.keys()].sort((a,b)=>
  Date.parse(games.get(a).startTimeUTC)-Date.parse(games.get(b).startTimeUTC)||a-b);
 for(const id of sorted){
  const game=games.get(id),file=path.join(CACHE,id+".json");
  let item=null;
  try{item=read(file);}catch{}
  if(item&&!validateCached(game,item))item=null;
  if(item)cached.set(id,item);
 }
 for(const id of sorted){
  if(cached.has(id))continue;
  if(newlyFetched.length+errors.length>=BUDGET)break;
  const game=games.get(id);
  await sleep(450);
  try{
   const doc=await requestFinalBoxscore(game);
   fs.writeFileSync(path.join(CACHE,id+".json"),JSON.stringify(doc)+"\n");
   cached.set(id,doc);newlyFetched.push(id);
   if(newlyFetched.length%25===0)console.log(JSON.stringify({newlyFetched:newlyFetched.length,
    cachedTotal:cached.size,targetGames:props.size}));
  }catch(e){
   errors.push({gameId:id,error:e.message});
   if(e.status===429||e.status>=500){
    console.error("Provider rate limit/server error; preserving partial boxscores: "+e.message);
    break;
   }
  }
 }
 const summary=generateReports({games,props},cached);
 summary.requestedSourceWindowFiles=sourceFiles;
 summary.boxscoresFetchedThisRun=newlyFetched.length;
 summary.errorsThisRun=errors;
 fs.writeFileSync(path.join(OUTPUT,"summary-latest.json"),JSON.stringify(summary,null,2)+"\n");
 console.log(JSON.stringify({target:props.size,cached:cached.size,remaining:props.size-cached.size,
  fetched:newlyFetched.length,graded:summary.gradedLineRecords,
  excluded:summary.excludedLineRecords,modelEvaluated:summary.replaySummary.evaluated,
  errors:errors.length,complete:summary.outcomeCoverageComplete}));
 if(errors.some(e=>/HTTP (429|5\d\d)/.test(e.error)))process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={loadInputs,validateCached,decodeOfficial,requestFinalBoxscore,generateReports};
