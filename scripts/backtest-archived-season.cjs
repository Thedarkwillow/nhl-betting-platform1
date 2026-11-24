"use strict";
const fs=require("node:fs/promises"),path=require("node:path");
const {buildHistory}=require("../src/history.cjs");
const {evaluate}=require("../src/backtest.cjs");
(async()=>{
 const root=path.resolve(__dirname,"..");
 const folder=path.join(root,"outputs","historical-archive","2025-26");
 const files=(await fs.readdir(folder).catch(()=>[])).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
 if(!files.length){console.log("No archived historical dates yet");return;}
 const reports=await Promise.all(files.map(x=>fs.readFile(path.join(folder,x),"utf8").then(JSON.parse)));
 const integrity={archiveDates:files.length,completedGames:0,playerRows:0,emptyDates:[],incompleteDates:[],duplicateGameIds:[],datesWithMismatchedReports:[]};
 const seenGames=new Set();
 for(let i=0;i<reports.length;i++){
  const report=reports[i],date=files[i].slice(0,10);
  if(report.requestedDate!==date)integrity.datesWithMismatchedReports.push(date);
  if((report.errors||[]).length||report.collectedGames!==report.completedGames)integrity.incompleteDates.push(date);
  if(!report.completedGames)integrity.emptyDates.push(date);
  integrity.completedGames+=report.completedGames||0;
  integrity.playerRows+=(report.players||[]).length;
  for(const row of report.players||[]){
   const key=String(row.gameId);
   if(row.gameDate!==date)integrity.datesWithMismatchedReports.push(date);
   seenGames.add(key);
  }
 }
 integrity.uniqueGameIds=seenGames.size;
 if(integrity.incompleteDates.length||integrity.datesWithMismatchedReports.length)throw Error("Archive integrity check failed: "+JSON.stringify(integrity));
 const history=buildHistory(reports);
 const result={...evaluate(history),season:"2025-26",archiveDates:files.length,integrity,generatedAt:new Date().toISOString()};
 // Do not select a production model on in-sample evidence. The later calendar dates
 // are held out for a future dedicated, per-game scoring implementation.
 result.validation={status:"exploratory_only",historicalPrizePicksLines:false,
  independentPropBets:false,holdoutVerified:false,
  note:"Synthetic lines and repeated thresholds; no verified independent holdout. Never promote observed winners to production."};
 for(const decision of Object.values(result.marketDecisions||{})){
  decision.recommendation=null;
  decision.eligibleForModelSelection=false;
  decision.reason="Archive exploratory only; independent holdout and real market lines not yet validated";
 }
 const out=path.join(root,"outputs","backtests");await fs.mkdir(out,{recursive:true});
 await fs.writeFile(path.join(out,"nhl-2025-26.json"),JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({archiveDates:files.length,completedGames:integrity.completedGames,playerRows:integrity.playerRows,gameDates:result.distinctGameDates,predictions:result.predictions,validation:result.validation.status}));
})().catch(e=>{console.error(e);process.exitCode=1});
