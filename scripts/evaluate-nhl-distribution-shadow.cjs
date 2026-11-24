"use strict";
const fs=require("node:fs"),path=require("node:path");
const {evaluateArchivedLines}=require("../src/nhl-count-distribution-shadow.cjs");
const root=path.resolve(__dirname,"..");
function main(){
 const audit=JSON.parse(fs.readFileSync(path.join(root,"outputs/oddspapi/nhl/outcome-audit-latest.json"),"utf8"));
 const logs=JSON.parse(fs.readFileSync(path.join(root,"outputs/oddspapi/nhl/official-historical-player-logs-latest.json"),"utf8"));
 if(!Array.isArray(audit.lines)||!logs.logs||audit.generatedAt!==logs.lineOutcomeAuditGeneratedAt)
  throw Error("Historical quote and official stat source provenance mismatch");
 const result=evaluateArchivedLines(audit.lines,logs.logs);
 const report={...result,generatedAt:new Date().toISOString(),
  inputAuditGeneratedAt:audit.generatedAt,inputOfficialLogGeneratedAt:logs.generatedAt,
  dataSource:"Previously cached independent OddsPapi NHL PrizePicks-labelled lines, checked against official NHL past-only player logs",
  retrospectiveNotFrozenPregame:true,sourceTierLabelsVerified:false,
  originalPrizePicksSettlementVerified:false,commercialThirdPartyFeedUsed:false};
 const target=path.join(root,"outputs/backtests/nhl-count-distribution-shadow-latest.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({quoteRows:result.actualArchivedQuoteRows,
  overall:result.overall,bySeason:result.bySeason,byMarket:result.byMarket,
  confidenceBand:result.gameClusterDifferenceInterval,notDeployed:true}));
}
if(require.main===module)try{main();}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={main};
