"use strict";
/**
 * Offline NFL source-label completeness audit.
 * Input: a previously AUTHORIZED archived NFL board JSON file.
 * No network, API secrets, paid requests, model predictions, or wagers.
 */
const fs=require("node:fs"),path=require("node:path");
const {auditBoardLabels,classifyMarket}=require("../src/nfl-market-registry.cjs");
function auditArchive(platform,document){
 const rows=Array.isArray(document)?document:document?.rows;
 if(!Array.isArray(rows))throw Error("Cached NFL archive must provide a rows array");
 if(!["NFL","nfl",undefined].includes(document?.league))
  throw Error("Refuse mismatched league archive");
 const report=auditBoardLabels(platform,rows);
 const byGroup={};
 for(const r of rows){
  const found=classifyMarket(platform,r?.market||r?.statType,{period:r?.period,participants:r?.participants??1});
  if(found.status==="recognized_research_only")
   byGroup[found.group]=(byGroup[found.group]||0)+1;
 }
 return {...report,knownGroupsObserved:byGroup,totalRows:rows.length,
  liveBoardConfirmed:false,fullCoverageVerified:false,
  exactProviderSettlementVerified:false,originalPlatformOfferAuthenticated:false,
  modelPredictionsGenerated:0,eligibleAutomaticNFLPicks:0,
  note:"Read-only labels from supplied archived source; unknown labels must be reviewed and all current availability must be verified independently."};
}
function main(args=process.argv.slice(2)){
 const [platform,source]=args;
 if(!["prizepicks","underdog"].includes(platform)||!source)
  throw Error("Usage: node scripts/audit-nfl-archived-board.cjs prizepicks|underdog ./path/to/authorized-cached-NFL-board.json");
 const target=path.resolve(source),doc=JSON.parse(fs.readFileSync(target,"utf8"));
 const result=auditArchive(platform,doc);
 console.log(JSON.stringify(result,null,2));
 return result;
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1}
module.exports={auditArchive,main};
