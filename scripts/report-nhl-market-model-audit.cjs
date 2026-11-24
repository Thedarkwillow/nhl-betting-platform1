"use strict";
const fs=require("node:fs"),path=require("node:path");
const {validateNhlModelShadow}=require("../src/nhl-paired-market-model-audit.cjs");
const root=path.resolve(__dirname,"..");
function main(){
 const source=path.join(root,"outputs/backtests/nhl-approved-source-prospective-latest.json");
 const audit=validateNhlModelShadow(JSON.parse(fs.readFileSync(source,"utf8")));
 const output=path.join(root,"outputs/health/nhl-market-model-challenger-audit.json");
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(audit,null,2)+"\n");
 const summary=["# NHL Candidate Model Verification (Research Only)",
 "Paired archived forecasts against official NHL final statistics. No new provider calls.",
 "",
 "| Market | Observed offered sides | NHL games | Champion Brier | Challenger Brier | Cluster difference 95% |",
 "|---|---:|---:|---:|---:|---|"];
 for(const [name,s] of Object.entries(audit.byMarket)){
  const bounds=s.gameCluster95;
  summary.push("| "+name+" | "+s.propSides+" | "+s.distinctOfficialGames+
   " | "+s.championBrier+" | "+s.challengerBrier+" | "+
   (bounds?"["+bounds.lower+", "+bounds.upper+"]":"Insufficient games")+" |");
 }
 summary.push("","Observed differences are not independent wagers or proven profit. No automatic model promotion.","");
 const md=summary.join("\n");
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,md);
 console.log(md);
 return audit;
}
if(require.main===module)try{main()}catch(e){console.error("::error::"+e.message);process.exitCode=1;}
module.exports={main};
