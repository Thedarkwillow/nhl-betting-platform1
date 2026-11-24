"use strict";
const fs=require("node:fs"),path=require("node:path");
const {compareUsageForecasts}=require("../src/nhl-usage-backtest.cjs");
const root=path.resolve(__dirname,"..");
function main(){
 const p=path.join(root,"outputs/nhl-usage/latest.json"),usage=JSON.parse(fs.readFileSync(p,"utf8"));
 const result={...compareUsageForecasts(usage),generatedAt:new Date().toISOString(),
  usageArchiveGeneratedAt:usage.generatedAt,
  archiveDates:usage.coveredDates,coverage:usage.summary};
 const out=path.join(root,"outputs/backtests/nhl-usage-role-shadow-latest.json");
 fs.mkdirSync(path.dirname(out),{recursive:true});
 fs.writeFileSync(out,JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({rows:result.evaluatedRows,byMarket:result.byMarket,deploy:result.modelReleaseEligible}));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={main};
