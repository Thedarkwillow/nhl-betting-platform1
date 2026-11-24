"use strict";
const fs=require("node:fs"),path=require("node:path");
const {compareCandidates}=require("../src/nhl-temporal-model-comparison.cjs");
const ROOT=path.resolve(__dirname,"..");
const read=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),"utf8"));
function main(){
 const audit=read("outputs/oddspapi/nhl/outcome-audit-latest.json");
 const hist=read("outputs/oddspapi/nhl/official-historical-player-logs-latest.json");
 if(!Array.isArray(audit.lines)||!hist.logs||audit.matchedLines<1)
  throw Error("Officially scored line archive or historical player logs missing");
 if(audit.generatedAt!==hist.lineOutcomeAuditGeneratedAt)
  throw Error("Source provenance mismatch; cannot mix stale line outcomes and player game logs");
 const result=compareCandidates(audit.lines,hist.logs);
 const report={...result,generatedAt:new Date().toISOString(),
  source:"Cached OddsPapi PrizePicks-labelled historical quotes crossed to official NHL player game logs",
  inputAuditGeneratedAt:audit.generatedAt,
  inputLogGeneratedAt:hist.generatedAt,
  verifiedOfficialStatOutcomes:true,
  archivedModelSelectionBeforeGames:false,
  platformSettlementsVerified:false,
  actualProspectiveHitRate:null,
  modelShadowStatus:"research_only_not_deployed",
  furtherWarning:"Historical official stat outcomes ARE verified, but model choices reconstructed afterwards are retrospective. This is not a verified prospective betting hit rate."};
 const target=path.join(ROOT,"outputs/backtests/nhl-archived-line-challenger-latest.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({gradedArchivedQuoteDecisions:result.eligibleArchivedLines,
  bySeason:result.bySeason,holdout:result.temporalHoldout,
  testedShadow:"stable-shrink-v2",archivedModelSelectionBeforeGames:false}));
}
if(require.main===module)try{main()}catch(e){console.error(e.stack||e.message);process.exitCode=1}
module.exports={main};
