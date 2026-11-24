"use strict";
const fs=require("node:fs/promises"),path=require("node:path");
const {normalizeOfficialUsage,buildUsageIndex}=require("../src/nhl-usage-goalie.cjs");
const ROOT=path.resolve(__dirname,"..");
const SRC=path.join(ROOT,"outputs/player-stats");
const DIR=path.join(ROOT,"outputs/nhl-usage/daily");
const OUT=path.join(ROOT,"outputs/nhl-usage/latest.json");
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const getJSON=async url=>{
 for(let attempt=0;attempt<3;attempt++){
  const res=await fetch(url,{signal:AbortSignal.timeout(25000)});
  if(res.ok)return res.json();
  if(![429,500,502,503,504].includes(res.status)||attempt===2)throw Error("Official NHL boxscore HTTP "+res.status);
  await sleep(1200*(attempt+1));
 }
};
async function sourceReports(){
 const files=(await fs.readdir(SRC)).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
 const reports=[];
 for(const file of files){
  const data=JSON.parse(await fs.readFile(path.join(SRC,file),"utf8"));
  if(data.collectedGames!==data.completedGames||data.errors?.length||!Array.isArray(data.players))continue;
  const ids=[...new Set(data.players.map(x=>x.gameId).filter(Number.isInteger))].sort();
  if(ids.length!==data.collectedGames||ids.length===0)continue;
  reports.push({date:file.slice(0,10),ids});
 }
 return reports;
}
async function main({maxRequests=150}={}){
 if(!Number.isInteger(maxRequests)||maxRequests<1||maxRequests>150)throw Error("Max official game requests must be 1-150");
 await fs.mkdir(DIR,{recursive:true});
 let count=0,finished=0,failed=0;const errors=[];
 for(const {date,ids} of await sourceReports()){
  const dest=path.join(DIR,date+".json");let valid=null;
  try{valid=JSON.parse(await fs.readFile(dest,"utf8"));}catch{}
  if(valid?.complete===true&&valid.games?.length===ids.length&&
     ids.every(id=>valid.games.includes(id)))continue;
  if(maxRequests-count<ids.length){errors.push({date,reason:"bounded_request_budget"});continue;}
  const rows=[];let error=null;
  for(const id of ids){
   count++;
   try{
    const box=await getJSON("https://api-web.nhle.com/v1/gamecenter/"+id+"/boxscore");
    if(box.id!==id||box.gameDate!==date)throw Error("Official boxscore identity/date mismatch");
    rows.push(...normalizeOfficialUsage(box));
   }catch(e){error={date,gameId:id,error:e.message};break;}
   await sleep(180);
  }
  if(error){errors.push(error);failed++;continue;}
  const report={schemaVersion:1,date,source:"Official NHL final gamecenter boxscore",
   capturedAt:new Date().toISOString(),games:ids,complete:true,errors:[],rows};
  // Rewrite only if source day is missing or incomplete; complete reports are immutable.
  await fs.writeFile(dest,JSON.stringify(report)+"\n");
  finished++;
 }
 const available=[];
 for(const file of (await fs.readdir(DIR)).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort()){
  const report=JSON.parse(await fs.readFile(path.join(DIR,file),"utf8"));
  if(report.complete!==true||report.errors?.length)continue;
  available.push(report);
 }
 if(!available.length)throw Error("No complete official NHL usage reports ready; previous saved latest preserved");
 const index=buildUsageIndex(available);
 const out={...index,generatedAt:new Date().toISOString(),coveredDates:available.map(x=>x.date),
  sourceGapWarnings:errors,sourceReportCount:available.length,
  currentStarterConfirmed:false,injuryCleared:false,
  verifiedGoalieStartForUpcomingGames:false,
  warning:"Official FINAL games provide historical TOI and saves observations only. No next-game starter, expected deployment, injury clearance, or PrizePicks settlement verified. No production model coefficients changed."};
 await fs.mkdir(path.dirname(OUT),{recursive:true});
 await fs.writeFile(OUT,JSON.stringify(out)+"\n");
 console.log(JSON.stringify({requests:count,completedDates:available.length,newDates:finished,
  failures:failed,sourceGapWarnings:errors.length,gameRows:index.summary.games,
  playerGameRows:index.summary.playerGames,toiAvailable:index.summary.withToi,
  goalieRows:index.summary.goalies}));
}
if(require.main===module)main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1});
module.exports={main,sourceReports};
