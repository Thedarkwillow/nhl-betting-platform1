"use strict";
const fs=require("node:fs/promises"),path=require("node:path");
const {buildNhlPeriodHistory}=require("../src/nhl-period-history.cjs");
const root=path.resolve(__dirname,"..");
async function main(){
 const dir=path.join(root,"outputs/period-stats/dates");
 await fs.mkdir(dir,{recursive:true});
 const files=(await fs.readdir(dir)).filter(x=>/^\d{4}-\d{2}-\d{2}\.json$/.test(x)).sort();
 const daily=[];
 for(const file of files){
  const data=JSON.parse(await fs.readFile(path.join(dir,file),"utf8"));
  if(data.complete!==true){
   console.warn("Skipping incomplete period date "+file);continue;
  }
  daily.push(data);
 }
 const history=buildNhlPeriodHistory(daily);
 await fs.writeFile(path.join(root,"outputs/period-stats/history.json"),
  JSON.stringify({...history,builtAt:new Date().toISOString()},null,2)+"\n");
 console.log(JSON.stringify({historicalDates:history.sourceDates.length,
  games:history.completedGames,playerPeriodRows:history.playerPeriodObservations,
  marketValid:history.coverage.perMarketValid,
  marketQuarantined:history.coverage.perMarketQuarantined}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={main};
