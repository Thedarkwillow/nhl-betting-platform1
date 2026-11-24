"use strict";
/**
 * Recover independently verified GAME-scoped official defensive features even
 * on large NHL slates. Immutable YYYY-MM-DD__GAMEID.json shards preserve each
 * source success despite failures/rate limits on other games of same date.
 * Only already-complete official FINAL date inventories are candidates.
 */
const fs=require("node:fs"),path=require("node:path");
const {zoneStarts,officialTeamAttemptEvidence}=
 require("../src/nhl-official-block-exposure-v1.cjs");
const {officialPbpUrl}=require("../src/nhl-official-period-events.cjs");
const {getJSON,fetchShiftPages}=require("./collect-nhl-official-period-events.cjs");
const root=process.env.RESEARCH_ARCHIVE_ROOT?fs.realpathSync(process.env.RESEARCH_ARCHIVE_ROOT):path.resolve(__dirname,".."),abs=p=>path.join(root,p),
 read=p=>JSON.parse(fs.readFileSync(abs(p),"utf8"));
const out="outputs/research/nhl-block-exposure-history";
function dates(dir){
 return fs.existsSync(abs(dir))?fs.readdirSync(abs(dir)).filter(n=>
  /^\d{4}-\d\d-\d\d\.json$/.test(n)).sort():[];
}
function gamesForDay(day){
 const live="outputs/player-stats/"+day+".json",
  train="outputs/period-stats/training-source/"+day+".json",
  chosen=fs.existsSync(abs(live))?live:train;
 if(!fs.existsSync(abs(chosen)))return [];
 const doc=read(chosen),players=doc.players;
 if(doc.requestedDate!==day||!Array.isArray(players)||
    !Array.isArray(doc.errors)||doc.errors.length||
    !Number.isInteger(doc.scheduledGames)||doc.scheduledGames<1||
    doc.scheduledGames>18||doc.scheduledGames!==doc.completedGames||
    doc.collectedGames!==doc.completedGames||
    new Set(players.map(p=>p.gameId)).size!==doc.completedGames||
    players.some(p=>p.gameDate!==day||!Number.isInteger(p.gameId)||
     !Number.isInteger(p.playerId)))
   return [];
 const grouped=new Map();
 for(const p of players){const a=grouped.get(p.gameId)||[];a.push(p);grouped.set(p.gameId,a);}
 return [...grouped.entries()].filter(([,rows])=>rows.length>=20)
  .map(([gameId,rows])=>({day,gameId,players:rows}));
}
function shardName(c){return c.day+"__"+c.gameId+".json";}
function isCompletedOldDayGame(c){
 const file=out+"/"+c.day+".json";
 if(!fs.existsSync(abs(file)))return false;
 try{
  const a=read(file);
  return a.kind==="official_nhl_exact_game_block_exposure_v1"&&
   a.attemptRows?.some(r=>r.gameId===c.gameId)&&
   a.zoneRows?.some(r=>r.gameId===c.gameId);
 }catch{return false;}
}
function candidates(){
 const last=new Date().toISOString().slice(0,10);
 const datesAll=[...new Set([...dates("outputs/player-stats"),
  ...dates("outputs/period-stats/training-source")])].sort()
  .map(n=>n.slice(0,10)).filter(d=>d<last);
 const pending=datesAll.flatMap(gamesForDay).filter(c=>
  !fs.existsSync(abs(out+"/"+shardName(c)))&&!isCompletedOldDayGame(c));
 const current=pending.filter(c=>c.day>="2026-07-01")
  .sort((a,b)=>b.day.localeCompare(a.day)||a.gameId-b.gameId);
 const prior=pending.filter(c=>c.day<"2026-07-01")
  .sort((a,b)=>a.day.localeCompare(b.day)||a.gameId-b.gameId);
 return {current,prior};
}
async function collectGame(c,{pbp=id=>getJSON(officialPbpUrl(id)),
  shifts=id=>fetchShiftPages(id)}={}){
 const [plays,shiftRows]=await Promise.all([pbp(c.gameId),shifts(c.gameId)]);
 if(plays?.id!==c.gameId||plays.gameDate!==c.day||
   !["FINAL","OFF"].includes(plays.gameState))
  throw Error("Official Gamecenter game identity or final state unverified");
 const attempt=officialTeamAttemptEvidence(plays,c.players);
 const zone=zoneStarts(plays,shiftRows,c.players);
 const attemptOk=attempt.status==="source_verified_final_official_team_attempts",
  zoneOk=zone.status==="source_verified_completed_game";
 if(!attemptOk&&!zoneOk)
  throw Error("Neither opponent attempts nor defensive starts independently verified");
 const attemptRows=attemptOk?attempt.rows:[],
  zoneRows=zoneOk?zone.rows:[];
 if(attemptRows.some(r=>r.gameId!==c.gameId||r.gameDate!==c.day)||
   zoneRows.some(r=>r.gameId!==c.gameId||r.gameDate!==c.day))
  throw Error("Cross-game defensive source rows not allowed");
 return {kind:"official_nhl_exact_game_block_exposure_v1",
  date:c.day,gameId:c.gameId,observedAt:new Date().toISOString(),
  attemptRows,zoneRows,verifiedShotAttemptGames:Number(attemptOk),
  verifiedZoneStartGames:Number(zoneOk),officialGames:1,
  errors:[...(attemptOk?[]:[{reason:attempt.status}]),
   ...(zoneOk?[]:[{reason:zone.status}])],
  source:"NHL_Gamecenter_events_shiftcharts_and_official_final_sog_reconciled",
  pastResultOnly:true,neverRetrospectivelyFreezesPredictions:true,
  paidProviderRequests:0};
}
async function main(){
 const {current,prior}=candidates();
 // Limit official free requests to 8 games per run while covering both
 // current and previous seasons; retry other games on the next scheduled run.
 const selected=[...current.slice(0,6),...prior.slice(0,2)];
 const summary={kind:"nhl_game_scoped_block_exposure_recovery_v1",
  generatedAt:new Date().toISOString(),pendingCurrentGames:current.length,
  pendingPriorGames:prior.length,attempts:[],
  originalStrictThresholdsUnchanged:true,modelPromoted:false,
  bettingEligible:false,zeroPaidRequests:true};
 for(const c of selected){
  try{
   const a=await collectGame(c);
   fs.mkdirSync(abs(out),{recursive:true});
   fs.writeFileSync(abs(out+"/"+shardName(c)),JSON.stringify(a,null,2)+"\n",
    {flag:"wx"});
   summary.attempts.push({day:c.day,gameId:c.gameId,status:"archived",
    opponentAttemptsVerified:a.verifiedShotAttemptGames===1,
    defensiveStartsVerified:a.verifiedZoneStartGames===1});
  }catch(e){
   summary.attempts.push({day:c.day,gameId:c.gameId,status:"unverified",
    error:String(e.message).slice(0,160)});
   if(/HTTP (403|429)|rate.limit/i.test(String(e.message)))break;
  }
 }
 fs.mkdirSync(abs("outputs/health"),{recursive:true});
 fs.writeFileSync(abs("outputs/health/nhl-block-exposure-shards-latest.json"),
  JSON.stringify(summary,null,2)+"\n");
 console.log(JSON.stringify({selected:selected.length,
  archived:summary.attempts.filter(x=>x.status==="archived").length,
  pendingCurrentGames:current.length,modelPromoted:false}));
 return summary;
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={gamesForDay,shardName,collectGame,candidates,main};
