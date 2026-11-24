"use strict";
/** Before and after first Git, assert original provider offers were captured
 * inside the verified pregame time window with no inferred identity/picks.
 */
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const {COLUMNS}=require("../src/partner-prizepicks-board.cjs");
const dt=s=>typeof s==="string"?Date.parse(s):NaN;
function verify(root,relative,{now=new Date().toISOString(),requireFirstGit=false}={}){
 const fail=reason=>({verified:false,reason});
 if(typeof relative!=="string"||
  !/^outputs\/manual-board-captures\/2026-\d{2}-\d{2}\/\d{8}T\d{6}Z$/.test(relative)||
  relative.includes(".."))return fail("invalid_private_archive_path");
 const file=relative+"/manifest.json";
 let m;try{m=JSON.parse(fs.readFileSync(path.join(root,file),"utf8"))}catch{return fail("manifest_missing")}
 const cap=dt(m.captureFinishedUTC),start=dt(m.captureStartedUTC),at=dt(now);
 if(m?.source!=="partner-api.prizepicks.com"||
  m.snapshotMode!=="nfl_verified_gameday_source_only"||
  m.completePagination!==true||m.sourceAuthenticatedFirstParty!==false||
  m.officialPlatformSettlementVerified!==false||
  m.nflGamedaySourceProof?.kind!=="nfl_precapture_game_window_v1"||
  m.nflGamedaySourceProof.playerGSISVerified!==false||
  m.nflGamedaySourceProof.officialActiveRosterVerified!==false||
  m.nflGamedaySourceProof.bettingEligible!==false||
  !Array.isArray(m.nflGamedaySourceProof.futureGames)||
  m.nflGamedaySourceProof.futureGames.length<1||
  !Array.isArray(m.columns)||JSON.stringify(m.columns)!==JSON.stringify(COLUMNS)||
  !Array.isArray(m.sports)||m.sports.length!==1||m.sports[0].sport!=="NFL"||
  !Number.isInteger(m.sports[0].rawCount)||m.sports[0].rawCount<1||
  !Number.isInteger(m.sports[0].parts)||m.sports[0].parts<1||
  ![cap,start,at].every(Number.isFinite)||start>cap||cap>at||
  at-cap>12*60000)return fail("invalid_original_capture_contract");
 const games=m.nflGamedaySourceProof.futureGames,
  minKick=Math.min(...games.map(g=>dt(g.kickoff)));
 if(!Number.isFinite(minKick)||minKick-cap<20*60000||
  games.some(g=>!/^2026_\d{1,2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(String(g.gameId||""))||
   !String(g.providerGameId||"").startsWith("NFL_game_")||
   !Number.isFinite(dt(g.kickoff))||dt(g.kickoff)<=cap+20*60000))
  return fail("game_schedule_or_kickoff_not_future");
 let count=0;const files=[file];
 for(let i=1;i<=m.sports[0].parts;i++){
  const part=relative+"/nfl-"+String(i).padStart(2,"0")+".json";
  files.push(part);
  let d;try{d=JSON.parse(fs.readFileSync(path.join(root,part),"utf8"))}catch{return fail("original_chunk_missing")}
  if(d.sport!=="NFL"||d.startIndex!==(i-1)*1000||
   !Array.isArray(d.rows)||d.rows.length<1||d.rows.length>1000||
   d.rows.some(x=>!Array.isArray(x)||x.length!==COLUMNS.length))
   return fail("original_chunk_schema");
  count+=d.rows.length;
 }
 if(count!==m.sports[0].rawCount)return fail("original_chunk_row_count");
 let firstAt=null;
 if(requireFirstGit){
  const commits=new Set(),timeList=[];
  try{
   for(const f of files){
    const list=cp.execFileSync("git",["log","--diff-filter=A","--format=%H","--",f],
     {cwd:root,encoding:"utf8"}).trim().split("\n").filter(Boolean);
    if(list.length!==1)return fail("original_path_not_unique_first_git");
    const sha=list[0];commits.add(sha);
    const original=cp.execFileSync("git",["show",sha+":"+f],{
     cwd:root,maxBuffer:20*1024*1024});
    if(!original.equals(fs.readFileSync(path.join(root,f))))
     return fail("original_file_changed_after_first_git");
    timeList.push(dt(cp.execFileSync("git",["show","-s","--format=%cI",sha],
      {cwd:root,encoding:"utf8"}).trim()));
   }
  }catch{return fail("first_git_unavailable")}
  if(commits.size!==1||timeList.some(x=>!Number.isFinite(x))||
   Math.max(...timeList)>at||Math.max(...timeList)>=minKick-15*60000||
   Math.min(...timeList)<cap-1000)return fail("original_git_freeze_after_kickoff");
  firstAt=new Date(timeList[0]).toISOString();
 }
 return {verified:true,status:requireFirstGit?"first_git_nfl_game_source_verified":
  "nfl_game_source_precommit_still_pending",firstGitAt:firstAt,
  sourceCapturedAt:m.captureFinishedUTC,originalRows:count,
  nearKickoffGames:games.length,firstKickoffAt:new Date(minKick).toISOString(),
  providerRequests:0,providerToGSISVerified:false,
  gameDayActiveVerified:false,modelPromoted:false,approvedPicks:0};
}
if(require.main===module){
 const relative=process.argv[2],requireFirstGit=process.argv[3]==="first-git";
 const out=verify(path.resolve(__dirname,".."),relative,{requireFirstGit});
 console.log(JSON.stringify(out));
 if(!out.verified)process.exitCode=1;
}
module.exports={verify};
