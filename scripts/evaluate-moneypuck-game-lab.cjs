"use strict";
/** Analysis only. Inputs are sanitized MoneyPuck game-level skater CSVs, never commit raw data. */
const fs=require("node:fs"),path=require("node:path");
const {parseSkaterGameCsv,comparePastOnly}=require("../src/nhl-moneypuck-game-lab.cjs");
function main(args=process.argv.slice(2)){
 if(args.length!==2)throw Error("Usage: node scripts/evaluate-moneypuck-game-lab.cjs <2024.csv> <2025.csv>");
 const all=[];const counts=[];
 for(const [i,file] of args.entries()){
  const stat=fs.statSync(file);
  if(!stat.isFile()||stat.size<100||stat.size>9000000)throw Error("Invalid sanitized game-level CSV size");
  const result=parseSkaterGameCsv(fs.readFileSync(file,"utf8"));
  const season=i===0?"2024-25":"2025-26";
  if(result.rows.some(x=>x.season!==season))throw Error("Input season does not match the archive");
  counts.push({season,playerGames:result.rows.length,ignoredNonAll:result.excludedNonAll});
  all.push(...result.rows);
 }
 if(counts.some(x=>x.playerGames<100))throw Error("Incomplete MoneyPuck season download; refusing misleading model comparison");
 const report=comparePastOnly(all,{holdoutSeason:"2025-26"});
 const summary={...report,scoredRows:undefined,sourceCounts:counts,
  historicOfficialNhlIdentityCrossCheckComplete:false,
  sourceFileCaptureAndOriginalPublicationEvidenceNotAvailable:true,
  commercialDerivativePublicationRightsNotIndependentlyVerified:true};
 const dest=path.resolve("outputs/backtests/nhl-moneypuck-historical-game-lab-latest.json");
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(summary,null,2)+"\n");
 console.log(JSON.stringify({sourceCounts:counts,holdout:summary.holdoutSeason,
  evaluated:summary.evaluatedForecasts,byMarket:summary.byMarket,
  modelPromoted:false,prospectiveVerified:false}));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={main};