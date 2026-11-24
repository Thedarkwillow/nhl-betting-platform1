"use strict";
const fs=require("node:fs"),path=require("node:path");
const {auditContext}=require("../src/nfl-context-source-matrix.cjs");
const ROOT=path.resolve(__dirname,"..");
function main(){
 const history=JSON.parse(fs.readFileSync(path.join(ROOT,"outputs/nfl/history/manifest.json"),"utf8"));
 const stats=JSON.parse(fs.readFileSync(path.join(ROOT,"outputs/nfl/backtests/stats-only-latest.json"),"utf8"));
 if(!history?.allRequiredSuccessful||stats?.kind!=="nfl_retro_chronological_stats_only_v1")
  throw Error("Missing historical NFL source proof or real stats-only backtest");
 const report=auditContext({manifest:history,backtest:stats});
 const target=path.join(ROOT,"outputs/nfl/research/source-readiness-latest.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({kind:report.kind,archiveAsOf:report.archiveSnapshotAt,
  marketCount:report.marketCount,availableCoreHistoricalInputs:report.contextReadyForModeling,
  marketsWithMissingRequiredInputs:report.missingContextMarketCount,
  alreadyBacktestedStatsOnly:report.statsOnlyBacktestMarketCount,
  fullyLicensedLiveMatchupConnectors:0,automaticPicksEnabled:0}));
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
