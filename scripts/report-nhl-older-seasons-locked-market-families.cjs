"use strict";
/**
 * Aggregate-only older-season NHL research. Input is temporary, untracked,
 * privately staged historical skater game rows. Do not archive or publish
 * player-level lines or let the 2025-26 scorecard pick training families.
 */
const fs=require("node:fs"),path=require("node:path");
const {study}=require("../src/nhl-older-season-locked-families-v1.cjs");
const root=path.resolve(__dirname,"..");
function main(file=process.argv[2]){
 if(!file||!fs.existsSync(file))throw Error("Provide bounded temporary three-season JSONL path");
 const stat=fs.statSync(file);
 if(!stat.isFile()||stat.size>180*1024*1024||stat.size<100)
  throw Error("Invalid temporary historical source size");
 const rows=[];
 for(const line of fs.readFileSync(file,"utf8").split("\n")){
  if(!line)continue;
  if(rows.length>270000)throw Error("Historical rows exceed bounded stage");
  rows.push(JSON.parse(line));
 }
 const result=study(rows);
 const dest="outputs/backtests/nhl-older-seasons-locked-market-families-latest.json";
 if(!Object.values(result.checks).every(x=>x.sufficientTraining)||
    result.flags.noAutomatedPromotion!==true||
    result.flags.noHistoricalPrizePicksOrUnderdogQuotes!==true)
  throw Error("Insufficient older-season training; never promote to selections");
 const dst=path.join(root,dest);
 fs.mkdirSync(path.dirname(dst),{recursive:true});
 fs.writeFileSync(dst,JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({report:dest,trainingSeason:result.trainingSeason,
  evaluationSeason:result.evaluationSeason,sourceCounts:result.source,
  byMarket:Object.fromEntries(Object.keys(result.selectedFamilies).map(m=>[
   m,{trainingChosen:result.selectedFamilies[m],
    trainingThresholds:result.training[m].thresholds,
    evaluationThresholds:result.evaluation[m].thresholds,
    evaluationGames:result.evaluation[m].distinctGames,
    selectedRate:result.evaluation[m].selectedOnTrainingOnly?.hitRate??null,
    alwaysLower:result.evaluation[m].alwaysLowerRate,
    selectedBrier:result.evaluation[m].selectedOnTrainingOnly?.brier??null}])),
  historicalNotPristineHoldout:true,modelPromoted:false}));
 return result;
}
if(require.main===module)try{main()}catch(e){
 console.error("Older-season training not validated:",e.message);process.exitCode=1;
}
module.exports={main};
