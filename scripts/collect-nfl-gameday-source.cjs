"use strict";
/** Exact pregame NFL partner-board SOURCE freeze only; no live picks, bets,
 * promoted identities, calibration, or authenticated in-app offerings.
 * Public Actions can run this source-only process in a private checkout.
 */
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const zlib=require("node:zlib");
const {fetchLeague,LEAGUES,pacificClock}=require("./collect-live-partner-nhl-nfl.cjs");
const {kickoffUTC,team}=require("../src/nfl-goblin-schedule-bridge-v1.cjs");
const {COLUMNS}=require("../src/partner-prizepicks-board.cjs");
const ROOT=path.resolve(__dirname,"..");
const schedulePath="outputs/nfl/history/2026/schedule.json.gz";
const ts=x=>typeof x==="string"?Date.parse(x):NaN;
function gamesToFreeze(schedule,asOf){
 const at=Date.parse(asOf);
 if(!Number.isFinite(at)||!Array.isArray(schedule))return [];
 return schedule.filter(x=>Number(x?.season)===2026&&
  ["REG","REGULAR_SEASON"].includes(x.game_type)&&
  /^2026_\d{1,2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(String(x.game_id||"")))
 .map(x=>({gameId:x.game_id,teamPair:[team(x.home_team),team(x.away_team)].sort().join("|"),
  kickoff:kickoffUTC(x.gameday,x.gametime)}))
 .filter(x=>Number.isFinite(ts(x.kickoff))&&ts(x.kickoff)-at>=45*60000&&
   ts(x.kickoff)-at<=135*60000);
}
function priorSchedule(root=ROOT,commitAt){
 try{
  const file=path.join(root,schedulePath);
  const doc=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const sha=cp.execFileSync("git",["log","-1","--format=%H","--",schedulePath],
   {cwd:root,encoding:"utf8"}).trim();
  const first=cp.execFileSync("git",["show","-s","--format=%cI",sha],
   {cwd:root,encoding:"utf8"}).trim();
  const blob=cp.execFileSync("git",["hash-object",schedulePath],
   {cwd:root,encoding:"utf8"}).trim();
  const committed=cp.execFileSync("git",["rev-parse",sha+":"+schedulePath],
   {cwd:root,encoding:"utf8"}).trim();
  if(blob!==committed||!Number.isFinite(ts(first))||
   ts(first)>ts(commitAt)||doc.dataset!=="schedule"||
   doc.recordCount!==doc.rows?.length||doc.rows.length<200)return null;
  return doc.rows;
 }catch{return null;}
}
function selectedSourceGames(rows,games){
 const source=new Map();
 for(const v of rows){
  const r=Object.fromEntries(COLUMNS.map((k,i)=>[k,v[i]]));
  if(!r.providerGameId||!r.team||!r.opponent||r.status!=="pre_game"||
    r.combo===true||r.eventType==="combo"||!Number.isFinite(ts(r.eventStartsAt)))continue;
  const pair=[team(r.team),team(r.opponent)].sort().join("|");
  const m=games.filter(g=>g.teamPair===pair&&
    Math.abs(ts(g.kickoff)-ts(r.eventStartsAt))<=5*60000);
  if(m.length===1){
   const k=r.providerGameId;
   const prev=source.get(k);
   if(prev&&prev.gameId!==m[0].gameId)source.set(k,{conflict:true});
   else if(!prev)source.set(k,m[0]);
  }
 }
 return [...source].filter(([,g])=>!g.conflict).map(([providerGameId,g])=>({
  providerGameId,gameId:g.gameId,kickoff:g.kickoff}));
}
async function capture({now=new Date(),root=ROOT,fetcher=fetchLeague,
 scheduleLoader=priorSchedule,finishedAt=()=>new Date().toISOString()}={}){
 const started=now.toISOString(),at=Date.parse(started);
 const schedule=scheduleLoader(root,started);
 if(!schedule)return {status:"pregame_schedule_git_proof_missing",providerRequests:0};
 const planned=gamesToFreeze(schedule,started);
 if(!planned.length)return {status:"no_upcoming_game_in_45_to_135_minute_window",providerRequests:0};
 // Same free partner-source endpoint as morning collection; only NFL.
 const league={...LEAGUES.find(x=>x.sport==="NFL"),minimumRows:1};
 const source=await fetcher(league),finished=finishedAt();
 const matching=selectedSourceGames(source.rows,planned);
 if(!matching.length)return {status:"no_exact_partner_schedule_matches",providerRequests:1,
   gamesInWindow:planned.length};
 const soonest=Math.min(...matching.map(x=>ts(x.kickoff)));
 if(soonest-Date.parse(finished)<20*60000)
  return {status:"too_close_to_kickoff_for_first_git_freeze",providerRequests:1};
 const clock=pacificClock(new Date(finished));
 const stamp=finished.slice(0,19).replace(/[-:]/g,"")+"Z";
 const relative="outputs/manual-board-captures/"+clock.day+"/"+stamp;
 const dir=path.join(root,relative);
 if(fs.existsSync(dir))throw Error("Append-only NFL gameday original archive already exists");
 fs.mkdirSync(dir,{recursive:true});
 const parts=Math.ceil(source.rows.length/1000);
 if(parts<1)throw Error("Missing original NFL source rows");
 for(let i=0;i<parts;i++)fs.writeFileSync(path.join(dir,
  "nfl-"+String(i+1).padStart(2,"0")+".json"),
  JSON.stringify({sport:"NFL",startIndex:i*1000,observedAtUTC:source.receivedAt,
   rows:source.rows.slice(i*1000,(i+1)*1000)})+"\n",{flag:"wx"});
 const manifest={schemaVersion:1,source:"partner-api.prizepicks.com",
  kind:"actual_time_private_partner_offer_observations",
  snapshotMode:"nfl_verified_gameday_source_only",
  captureStartedUTC:started,captureFinishedUTC:finished,pacificDate:clock.day,
  completePagination:true,sourceAuthenticatedFirstParty:false,
  officialPlatformSettlementVerified:false,originalSourceRawResponseStored:false,
  notSixOrNineAmSlot:true,captureSlotPacific:null,
  actualCaptureInRequestedHour:false,noOriginalSixAmObservation:true,
  columns:COLUMNS,
  sports:[{sport:"NFL",leagueId:9,source:source.url,
   rawCount:source.rows.length,normalizedCount:source.rows.length,
   players:source.players,games:source.games,missingPlayers:0,missingGames:0,
   sourceObservedAt:source.receivedAt,parts,
   belowMorningMinimumInventory:source.rows.length<1000}],
  hasBelowMorningMinimumInventory:source.rows.length<1000,
  nflGamedaySourceProof:{kind:"nfl_precapture_game_window_v1",
   futureGames:matching,minimumKickoffFirstGitMinutes:20,
   sourceToScheduleOnly:true,playerGSISVerified:false,
   officialActiveRosterVerified:false,bettingEligible:false},
  note:"Immutable original partner-source observation only; not an authenticated PrizePicks app offer or betting selection. Original first-Git commitment must precede each event."};
 fs.writeFileSync(path.join(dir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",
  {flag:"wx"});
 return {status:"private_nfl_gameday_source_precommit_pending",archiveDir:relative,
  manifest:relative+"/manifest.json",parts,verifiedGameCount:matching.length,
  originalRows:source.rows.length,earliestKickoffAt:new Date(soonest).toISOString(),
  sourceAuthenticatedFirstParty:false,providerRequests:1,approvedBets:0};
}
async function main(){
 const result=await capture();
 console.log(JSON.stringify(result));
 if(process.env.GITHUB_OUTPUT){
  fs.appendFileSync(process.env.GITHUB_OUTPUT,"status="+result.status+"\n");
  if(result.manifest)fs.appendFileSync(process.env.GITHUB_OUTPUT,
   "manifest="+result.manifest+"\n");
  if(result.archiveDir)fs.appendFileSync(process.env.GITHUB_OUTPUT,
   "archive_dir="+result.archiveDir+"\n");
 }
}
if(require.main===module)main().catch(e=>{console.error("NFL gameday source failed: "+e.message);
 process.exitCode=1;});
module.exports={capture,gamesToFreeze,selectedSourceGames,priorSchedule};
