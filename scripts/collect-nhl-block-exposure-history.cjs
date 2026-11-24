"use strict";
/** Free NHL official gamecenter/shift + puck possession cross-check.
 * Missing or incomplete source cannot satisfy strict blocked-shots quality.
 */
const fs=require("node:fs"),path=require("node:path");
const {zoneStarts,officialTeamAttemptEvidence}=
 require("../src/nhl-official-block-exposure-v1.cjs");
const {officialPbpUrl}=require("../src/nhl-official-period-events.cjs");
const {getJSON,fetchShiftPages}=require("./collect-nhl-official-period-events.cjs");
const root=path.resolve(__dirname,".."),abs=p=>path.join(root,p);
const read=p=>JSON.parse(fs.readFileSync(abs(p),"utf8"));
const list=dir=>fs.existsSync(abs(dir))?fs.readdirSync(abs(dir))
 .filter(n=>/^\d{4}-\d\d-\d\d\.json$/.test(n)).sort():[];
const out="outputs/research/nhl-block-exposure-history";
async function puckDay(day,{client=fetch}={}){
 const rows=[];let total=null;
 for(let page=0;page<4;page++){
  const query=new URLSearchParams({isAggregate:"false",isGame:"true",
   start:String(rows.length),limit:"500",
   cayenneExp:'gameDate>="'+day+'" and gameDate<="'+day+' 23:59:59" and gameTypeId=2',
   sort:JSON.stringify([{property:"gameId",direction:"ASC"},{property:"playerId",direction:"ASC"}])});
  let v=null,lastError="report_unavailable";
  for(const report of ["puckPossessions","puckpossessions"]){
   const r=await client("https://api.nhle.com/stats/rest/en/skater/"+report+"?"+query,
    {signal:AbortSignal.timeout(25000),redirect:"error"});
   if([403,429].includes(r.status))throw Error("Official puck possession HTTP "+r.status);
   if(!r.ok){lastError="HTTP_"+r.status;continue;}
   try{
    const parsed=await r.json();
    if(parsed&&Number.isInteger(parsed.total)&&Array.isArray(parsed.data)){
     v=parsed;break;
    }
    lastError="unrecognized_puck_possession_schema";
   }catch{lastError="non_json_report";}
  }
  if(!v)throw Error("Official puck possession source unavailable: "+lastError);
  if(!Number.isInteger(v.total)||!Array.isArray(v.data)||
    v.total>800||total!==null&&total!==v.total)throw Error("Invalid puck possession pagination");
  total=v.total;
  const seen=new Set(rows.map(x=>x.gameId+"|"+x.playerId));
  for(const p of v.data){
   const k=p.gameId+"|"+p.playerId;
   if(seen.has(k))throw Error("Duplicate puck possession player");seen.add(k);
  }
  rows.push(...v.data);
  if(rows.length===total)return {total,data:rows};
  if(rows.length>total||!v.data.length)throw Error("Incomplete puck possession page");
 }
 throw Error("Puck possession pages exceed source cap");
}
async function collectDay(day,{pbp=id=>getJSON(officialPbpUrl(id)),
 shifts=id=>fetchShiftPages(id)}={}){
 const live="outputs/player-stats/"+day+".json",
  old="outputs/period-stats/training-source/"+day+".json";
 if(!fs.existsSync(abs(live))&&!fs.existsSync(abs(old)))
  throw Error("No independently archived complete official final-stat source");
 const original=read(fs.existsSync(abs(live))?live:old);
 if(original.requestedDate!==day||!Array.isArray(original.players)||
   !Array.isArray(original.errors)||original.errors.length||
   original.completedGames!==original.scheduledGames||
   original.collectedGames!==original.completedGames||
   original.completedGames<1||original.completedGames>4||
   new Set(original.players.map(p=>p.gameId)).size!==original.completedGames||
   original.players.some(p=>p.gameDate!==day))
  throw Error("No complete, source-verified bounded official final date");
 const games=[...new Set(original.players.map(x=>x.gameId))],
  zone=[],attemptRows=[],errors=[];
 for(const gameId of games){
  try{
   const players=original.players.filter(x=>x.gameId===gameId),
    plays=await pbp(gameId),shiftRows=await shifts(gameId);
   if(plays.id!==gameId||!["FINAL","OFF"].includes(plays.gameState)||
      plays.gameDate!==day)throw Error("Gamecenter final identity mismatch");
   const attempts=officialTeamAttemptEvidence(plays,players),
    z=zoneStarts(plays,shiftRows,players);
   if(attempts.status==="source_verified_final_official_team_attempts")
    attemptRows.push(...attempts.rows);
   else errors.push({gameId,reason:attempts.status});
   if(z.status==="source_verified_completed_game")zone.push(...z.rows);
   else errors.push({gameId,reason:z.status});
  }catch(e){errors.push({gameId,reason:e.message});}
 }
 const attempt={rows:attemptRows,verifiedGames:[...new Set(attemptRows.map(x=>x.gameId))]};
 return {kind:"official_nhl_exact_game_block_exposure_v1",date:day,
  observedAt:new Date().toISOString(),attemptRows:attempt.rows,
  zoneRows:zone,verifiedShotAttemptGames:attempt.verifiedGames.length,
  verifiedZoneStartGames:new Set(zone.map(x=>x.gameId)).size,
  officialGames:games.length,errors,
  source:"NHL_Gamecenter_events_shiftcharts_and_official_final_sog_reconciled",
  pastResultOnly:true,neverRetrospectivelyFreezesPredictions:true,
  paidProviderRequests:0};
}
async function main(){
 const today=new Date().toISOString().slice(0,10);
 const candidates=[...new Set([
   ...list("outputs/player-stats"),
   ...list("outputs/period-stats/training-source")
  ])].sort().filter(n=>n.slice(0,10)<today&&!fs.existsSync(abs(out+"/"+n))&&
   (()=>{try{
    const p=fs.existsSync(abs("outputs/player-stats/"+n))?
     "outputs/player-stats/"+n:"outputs/period-stats/training-source/"+n;
    const d=read(p);
    return d.requestedDate===n.slice(0,10)&&d.errors?.length===0&&
     d.scheduledGames>0&&d.scheduledGames<=4&&
     d.scheduledGames===d.completedGames&&
     d.completedGames===d.collectedGames;
   }catch{return false;}})());
 // Bounded two historical dates per run; no commercial API requests.
 const todo=[...candidates.filter(n=>n>="2026-07-01").slice(-1),
  ...candidates.filter(n=>n<"2026-07-01").slice(0,1)].slice(0,2);
 const summary={kind:"nhl_official_block_exposure_recovery_progress_v1",
  generatedAt:new Date().toISOString(),candidates:candidates.length,
  attempts:[],modelPromoted:false,bettingEligible:false};
 for(const name of todo){
  const day=name.slice(0,10);
  try{
   const a=await collectDay(day);
   if(!a.verifiedShotAttemptGames&&!a.verifiedZoneStartGames)
    throw Error("No independently reconciled attempt or zone starts");
   fs.mkdirSync(abs(out),{recursive:true});
   fs.writeFileSync(abs(out+"/"+name),JSON.stringify(a,null,2)+"\n",{flag:"wx"});
   summary.attempts.push({day,status:"archived_partial_or_complete",
    shotGames:a.verifiedShotAttemptGames,zoneGames:a.verifiedZoneStartGames});
  }catch(e){
   summary.attempts.push({day,status:"not_source_verified",error:e.message});
   if(/HTTP (403|429)/.test(e.message))break;
  }
 }
 fs.mkdirSync(abs("outputs/health"),{recursive:true});
 fs.writeFileSync(abs("outputs/health/nhl-block-exposure-recovery-latest.json"),
  JSON.stringify(summary,null,2)+"\n");
 console.log(JSON.stringify(summary));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={puckDay,collectDay,main};