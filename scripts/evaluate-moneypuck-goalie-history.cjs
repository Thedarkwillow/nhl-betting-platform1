"use strict";
const fs=require("node:fs"),path=require("node:path");
const {parseGoalieGameCsv,evaluateGoalieHistory}=require("../src/nhl-moneypuck-goalie-game-lab.cjs");
function main(files=process.argv.slice(2)){
 if(files.length!==2)throw Error("Expected MoneyPuck 2024 and 2025 goalie CSV paths");
 const records=[],sources=[];
 for(const [idx,file] of files.entries()){
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size<100||stat.size>9000000)
   throw Error("Invalid goalie CSV source size");
  const rows=parseGoalieGameCsv(fs.readFileSync(file,"utf8"));
  const season=idx===0?"2024-25":"2025-26";
  if(rows.some(x=>x.season!==season)||rows.length<100)
   throw Error("Goalie history archive season or coverage invalid");
  records.push(...rows);
  sources.push({season,goalieAppearances:rows.length});
 }
 const result=evaluateGoalieHistory(records);
 const output={...result,sourceCounts:sources,generatedAt:new Date().toISOString(),
  originalPlatformSourceAuthenticated:false,officialPregameStartsVerified:false};
 const target=path.resolve("outputs/backtests/nhl-moneypuck-goalie-history-latest.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(output,null,2)+"\n");
 console.log(JSON.stringify({sources,appearances:result.eligibleGoalieAppearances,
  games:result.distinctGames,championMae:result.championMae,
  shotQualityMae:result.shotQualityMae,eligibleForProduction:false}));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={main};
