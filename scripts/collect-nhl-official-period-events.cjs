"use strict";
const fs=require("node:fs/promises"),path=require("node:path");
const {assertDate}=require("../src/schedule.cjs");
const {officialPbpUrl,officialShiftsUrl,validateShiftPages,
 normalizeOfficialPeriods}=require("../src/nhl-official-period-events.cjs");
const root=path.resolve(__dirname,"..");
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function retryDelayMs(status,attempt,retryAfter=null){
 const raw=typeof retryAfter==="string"?retryAfter.trim():"";
 const asSeconds=raw&&/^\d+$/.test(raw)?Number(raw)*1000:NaN;
 const asDate=raw?Date.parse(raw):NaN;
 const headerMs=Number.isFinite(asSeconds)?asSeconds:
  Number.isFinite(asDate)?Math.max(0,asDate-Date.now()):0;
 const backoff=status===429?5000*Math.pow(2,attempt):
  1200*Math.pow(2,attempt);
 return Math.max(0,Math.min(90000,Math.max(backoff,headerMs)));
}
function transientSourceError(e){
 return e&&(["TimeoutError","AbortError"].includes(e.name)||
  ["ETIMEDOUT","ECONNRESET","UND_ERR_CONNECT_TIMEOUT"].includes(e.code));
}
async function getJSON(url,{client=fetch,sleepFn=sleep}={}){
 for(let attempt=0;attempt<6;attempt++){
  let response;
  try{response=await client(url,{signal:AbortSignal.timeout(20000)});}
  catch(e){
   // Retry ONLY transient transport failures: a slow official NHL endpoint
   // should not convert a game with known scheduled final stats into an
   // invented no-game day or a "complete" period record.
   if(!transientSourceError(e)||attempt>=2)throw e;
   await sleepFn(retryDelayMs(503,attempt));
   continue;
  }
  if(response.ok)return response.json();
  if(![429,500,502,503,504].includes(response.status)||attempt===5)
   throw Error("NHL official source HTTP "+response.status);
  const delay=retryDelayMs(response.status,attempt,
   response.headers?.get?.("retry-after")||null);
  await sleepFn(delay);
 }
}
async function fetchShiftPages(gameId,{client=fetch}={}){
 const pages=[],limit=500,maxPages=8;
 let total=null;
 for(let start=0,page=0;page<maxPages;page++){
  const result=await getJSON(officialShiftsUrl(gameId,{start,limit}),{client});
  if(!Number.isInteger(result?.total)||!Array.isArray(result?.data))
   throw Error("Incomplete official NHL shiftchart pagination metadata");
  if(total!==null&&result.total!==total)
   throw Error("Official NHL shiftchart changed during pagination");
  total=result.total;pages.push(result);
  const loaded=pages.reduce((s,p)=>s+p.data.length,0);
  if(loaded===total){try{return validateShiftPages(pages,gameId);}catch(e){throw Error(e.message+` (reported=${total}, received=${loaded}, pages=${pages.length})`);}}
  if(loaded>total||result.data.length===0)
   throw Error(`Incomplete official shiftchart response (reported=${total}, received=${loaded}, pages=${pages.length}, lastPage=${result.data.length})`);
  start=loaded;
 }
 throw Error(`NHL shiftchart exceeded safe page budget (reported=${total}, received=${pages.reduce((s,p)=>s+p.data.length,0)}, pages=${pages.length})`);
}
async function collectPeriodArchive(date,{client=fetch,source=null}={}){
 const requestedDate=assertDate(date);
 const report=source||JSON.parse(await fs.readFile(path.join(root,
  "outputs/player-stats",requestedDate+".json"),"utf8"));
 if(report.requestedDate!==requestedDate||!Array.isArray(report.players)||
    !Array.isArray(report.errors)||report.errors.length!==0||
    report.scheduledGames===0||report.scheduledGames!==report.completedGames||
    report.collectedGames!==report.completedGames)
  throw Error("Incomplete original NHL official final-stat date; no period archive");
 const games=new Map();
 for(const p of report.players){
  if(!Number.isInteger(p.gameId)||p.gameDate!==requestedDate)
   throw Error("Original player-game date or identity mismatch");
  const current=games.get(p.gameId)||[];current.push(p);games.set(p.gameId,current);
 }
 if(games.size!==report.completedGames)
  throw Error("Original completed NHL schedule and player-game mismatch");
 const outputs=[],errors=[];
 for(const [gameId,players] of games){
  try{
   const pbp=await getJSON(officialPbpUrl(gameId),{client});
   const shifts=await fetchShiftPages(gameId,{client});
   const result=normalizeOfficialPeriods(pbp,shifts,players);
   outputs.push(result);
   await sleep(350);
  }catch(e){errors.push({gameId,reason:e.message});}
 }
 return {schemaVersion:1,kind:"nhl_official_period_event_history_daily",
  requestedDate,generatedAt:new Date().toISOString(),
  // Previous source snapshots (before schema 5) contain no hit, faceoff,
  // goalie GA or TOI original totals. Event values are null-quarantined
  // until the upstream NHL final date is re-captured with the richer schema.
  baseOfficialPlayerStatSchemaVersion:report.sourceSchemaVersion??1,
  baseOfficialPlayerStatsFetchedAt:report.fetchedAt??null,
  fullStatSourceCoverageSchemaReady:(report.sourceSchemaVersion??1)>=5,
  source:"official_NHL_Gamecenter_play_by_play_plus_NHL_Stats_REST_shiftcharts",
  gameCount:games.size,completedGameResults:outputs.length,
  errors,complete:errors.length===0&&outputs.length===games.size,
  sharedShiftRows:outputs.flatMap(g=>g.sharedShiftRows||[]),
  shotAttemptRows:outputs.flatMap(g=>g.shotAttemptRows||[]),
  playerPeriodRows:outputs.flatMap(g=>g.playerPeriodRows),
  sourceReconciliationQuarantine:outputs.flatMap(g=>
   g.quarantined.map(q=>({...q,gameId:g.gameId}))),
  originalPrizePicksOrUnderdogSettlementVerified:false,
  productionModelChanged:false,automatedLineupsEnabled:false,
  warning:"Official per-period outcomes, not platform settlement. Inconsistencies are null. Cannot use results retroactively to create prospective picks."};
}
async function main(){
 const date=assertDate(process.argv[2]||"");
 const report=await collectPeriodArchive(date);
 const dir=path.join(root,"outputs/period-stats/dates");
 await fs.mkdir(dir,{recursive:true});
 const target=path.join(dir,date+".json");
 await fs.writeFile(target,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({date,gameCount:report.gameCount,
  completed:report.completedGameResults,periodPlayerRows:report.playerPeriodRows.length,
  quarantined:report.sourceReconciliationQuarantine.length,
  complete:report.complete,errors:report.errors}));
 if(!report.complete)process.exitCode=1;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={getJSON,retryDelayMs,transientSourceError,fetchShiftPages,collectPeriodArchive};
