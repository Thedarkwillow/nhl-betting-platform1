"use strict";
/**
 * Compare two independent PrizePicks-labelled sources after the fallback
 * collector, without contacting either vendor or exposing raw lines.
 */
const fs=require("node:fs"),path=require("node:path");
const {compareNhlPrizePicksSources}=require("../src/nhl-cross-source-prizepicks-audit.cjs");
const ROOT=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
function optional(p){try{return read(p);}catch{return null;}}
function main({now=new Date().toISOString()}={}){
 const backup=read("outputs/prizepicks-backup/nhl/latest.json"),
  primary=optional("outputs/free-source/nhl/latest.json");
 const audit=compareNhlPrizePicksSources(primary,backup,{now});
 const report={...audit,
  backupGeneratedAt:backup.generatedAt,
  primaryGeneratedAt:primary?.generatedAt||null,
  independentProvidersOnly:true,
  sourceProviderChoices:["prizepicksapi.com","The Odds API"],
  customerFacingAccuracyClaimAllowed:false,
  canCertifyAuthenticatedPrizePicksOffer:false};
 const filename=path.join(ROOT,"outputs/prizepicks-backup/nhl/cross-source-audit-latest.json");
 fs.writeFileSync(filename,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:report.status,
  currentComparableSources:report.comparisonPossible,
  independentlyMatchedSameLine:report.matchedSameLine,
  conflictingLinesRequireAbstention:report.conflictingLine,
  uncertainOrAmbiguousMatches:report.ambiguousBackup+report.ambiguousPrimary,
  missingBackupComparisons:report.unmatchedBackup,
  vendorRequests:0}));
 return report;
}
if(require.main===module)try{main()}catch(e){
 console.error("NHL backup offline cross-check: "+e.message);process.exitCode=1;
}
module.exports={main};
