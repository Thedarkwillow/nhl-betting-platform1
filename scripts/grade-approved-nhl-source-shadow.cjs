"use strict";
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
const {normalizeBoxscore}=require("../src/boxscore.cjs");
const {auditAndGrade,combine}=require("../src/nhl-approved-shadow-grader.cjs");
const root=path.resolve(__dirname,"..");
const relative="outputs/projections/approved-source-snapshots",dir=path.join(root,relative);
function firstCommit(file){
 const record=cp.execFileSync("git",["log","--diff-filter=A","-1","--format=%H|%cI","--",file],
  {cwd:root,encoding:"utf8",timeout:15000}).trim();
 const [sha,date]=record.split("|");
 const count=Number(cp.execFileSync("git",["rev-list","--count","HEAD","--",file],
  {cwd:root,encoding:"utf8",timeout:15000}).trim());
 return {sha,date,count};
}
async function getFinals(ids,schedule,now){
 const results={},checks={attempted:0,officialFinal:0,notYetFinal:0,sourceErrors:0},errors=[];
 const official=new Map(schedule.games.map(g=>[g.id,g]));
 for(const id of ids){
  const g=official.get(id);
  // Game completion cannot be assumed from scheduled start alone.
  if(!g||!Number.isFinite(Date.parse(g.startTimeUTC))||
    Date.parse(g.startTimeUTC)>Date.parse(now)-90*60000)continue;
  checks.attempted++;
  try{
   const response=await fetch("https://api-web.nhle.com/v1/gamecenter/"+id+"/boxscore",{
    signal:AbortSignal.timeout(18000),headers:{Accept:"application/json"}});
   if(!response.ok)throw Error("Official NHL gamecenter HTTP "+response.status);
   const payload=await response.json();
   if(payload.id!==id||!["OFF","FINAL"].includes(payload.gameState)){
    checks.notYetFinal++;continue;
   }
   if(payload.homeTeam?.abbrev!==g.home||payload.awayTeam?.abbrev!==g.away)
    throw Error("NHL boxscore home/away does not match official complete schedule");
   results[id]={gameId:id,gameState:payload.gameState,home:g.home,away:g.away,
    players:normalizeBoxscore(payload)};
   checks.officialFinal++;
  }catch(e){checks.sourceErrors++;errors.push({gameId:id,reason:e.message});}
 }
 return {results,checks,errors};
}
async function main(){
 if(!fs.existsSync(dir))throw Error("No frozen user-approved source projections found");
 const schedule=JSON.parse(fs.readFileSync(path.join(root,
  "outputs/official-nhl/season-schedules/2026-27.json"),"utf8"));
 if(!schedule.complete||!Array.isArray(schedule.games))throw Error("Complete official NHL schedule required");
 const now=new Date().toISOString();
 const files=fs.readdirSync(dir).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort().slice(-60);
 const snapshots=[],skipped=[];
 for(const file of files){
  const p=path.posix.join(relative,file);
  try{
   const snap=JSON.parse(fs.readFileSync(path.join(root,p),"utf8")),git=firstCommit(p);
   if(!git.sha||!git.date||!Number.isInteger(git.count)||git.count<1)
    throw Error("Frozen source snapshot not in Git original commit history");
   if(snap.kind!=="nhl_approved_source_shadow_research"||!Array.isArray(snap.sourceRows))
    throw Error("Incompatible source projection snapshot contract");
   snapshots.push({snapshot:snap,path:p,firstCommitAt:git.date,firstCommitSha:git.sha,
    historyCount:git.count});
  }catch(e){skipped.push({file,reason:e.message});}
 }
 if(!snapshots.length)throw Error("No original Git-frozen MoneyPuck/DFO shadow to grade");
 const ids=[...new Set(snapshots.flatMap(s=>s.snapshot.sourceRows.map(r=>r.gameId)))]
  .filter(x=>Number.isInteger(x)).slice(0,80);
 const finals=await getFinals(ids,schedule,now);
 const audits=snapshots.map(s=>auditAndGrade(s.snapshot,{
  ...s,schedule,finalGames:finals.results,now}));
 const combined=combine(audits);
 const out={...combined,
  generatedAt:now,sourceSnapshotsProcessed:snapshots.length,
  sourceSnapshotsRejected:skipped,
  officialNhlGamecenter:finals.checks,officialFetchErrors:finals.errors,
  firstArchiveProofMethod:"git first addition commit timestamp and no later modifications; independent GitHub server receipt still open",
  archivedQuoteAuthenticityIndependentlyVerified:false,
  version:"moneypuck-rate-25pct-shrink-shadow-v1 versus existing original weighted-form-v1 plus Poisson",
  sourceModelHasNoHistoricalLookahead:true,
  gradingCompleteForEveryFutureGame:false,
  warning:combined.warning+" Only grades when official NHL gamecenter gameState is OFF/FINAL; never uses ongoing score, missing players as zero, uncommitted or post-start snapshots."};
 const target=path.join(root,"outputs/backtests/nhl-approved-source-prospective-latest.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(out,null,2)+"\n");
 console.log(JSON.stringify({sourceSnapshots:snapshots.length,acceptedDecisionCount:out.matchedDecisions,
  games:out.distinctGames,pending:out.pendingRows,excluded:out.excludedRows,
  official:finals.checks,brier:out.grade.overall.brier,mae:out.grade.overall.mae,
  modelPromoted:false,platformSettlementsVerified:false}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
module.exports={main,firstCommit,getFinals};
