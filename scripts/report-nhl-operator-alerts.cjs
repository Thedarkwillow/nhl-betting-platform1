"use strict";
const fs=require("node:fs"),path=require("node:path");
const {summarizeReadiness}=require("../src/nhl-operational-alerts.cjs");
const root=path.resolve(__dirname,"..");
const read=rel=>{try{return JSON.parse(fs.readFileSync(path.join(root,rel),"utf8"));}catch{return null;}};
function main(){
 const report=summarizeReadiness({now:new Date().toISOString(),
  overnight:read("outputs/health/nhl-overnight-status.json"),
  actions:read("outputs/health/nhl-actions-status.json"),
  provider:read("outputs/health/nhl-provider-quality-latest.json"),
  ledger:read("outputs/research/registry/nhl-precommitted-ledger-latest.json"),
  source:read("outputs/free-source/nhl/latest.json"),
  sourceCoverage:read("outputs/health/nhl-source-coverage-latest.json")});
 const file=path.join(root,"outputs/health/nhl-operator-alerts-latest.json");
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(file,JSON.stringify(report,null,2)+"\n");
 const summary=["# NHL Operator Alerts","","Provider API requests: **0**.",
  "Status: **"+report.status+"**.","",
  ...report.critical.map(x=>"- CRITICAL "+x.code+": "+x.reason),
  ...report.warning.map(x=>"- REVIEW "+x.code+": "+x.reason),
  "","Stale source quotes are expected outside scheduled capture windows and cannot be advertised as current."].join("\n");
 if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,summary+"\n");
 for(const c of report.critical)console.log("::error::"+c.code+": "+c.reason);
 for(const w of report.warning)console.log("::warning::"+w.code+": "+w.reason);
 console.log(JSON.stringify({status:report.status,critical:report.critical.length,
  warnings:report.warning.length,newPaidRequests:0}));
 return report;
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main};
