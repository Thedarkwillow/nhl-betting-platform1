"use strict";
/** Private, scope-limited fallback research; no paid network requests. */
const fs=require("node:fs"),path=require("node:path");
const {buildFreeNhlResearch}=require("../src/free-nhl-research.cjs");
const {resolveSchedule}=require("./build-free-nhl-research.cjs");
const {selectIndividualProps,POLICY}=require("../src/nhl-frozen-individual-props.cjs");
const {frozenSelectionReadiness}=require("../src/nhl-prospective-freeze-readiness.cjs");
const {optimize}=require("../src/nhl-lineup-optimizer.cjs");
const {revalidateResearchLineups}=require("../src/nhl-lineup-revalidation.cjs");
const {applyPregameSignal}=require("../src/nhl-pregame-intel.cjs");
const {compareNhlPrizePicksSources,quarantineBackupRows}=
 require("../src/nhl-cross-source-prizepicks-audit.cjs");
const ROOT=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
function optional(p){try{return read(p);}catch{return null;}}
async function main({now=new Date().toISOString()}={}){
 const provider=read("outputs/prizepicks-backup/nhl/latest.json"),
  projections=read("outputs/projections/players.json");
 if(provider.sourceScope!=="verified_selected_events"||
  provider.completePagination!==true||
  provider.coverage?.scopeComplete!==true||
  provider.fullNhlBoardCoverageVerified!==false||
  provider.provider!=="The Odds API"||!Array.isArray(provider.rows)||!provider.rows.length)
  throw Error("Cannot freeze incomplete or unproven NHL PrizePicks backup event scope");
 const backupRows=provider.rows.filter(p=>p.tier==="Standard");
 if(!backupRows.length)throw Error("No supported regular PrizePicks-labelled lines to model");
 // A current, complete *independent* primary board is only a cross-check,
 // never an original-platform assertion. A known same-key line conflict must
 // abstain instead of silently trusting either provider.
 const cross=compareNhlPrizePicksSources(
  optional("outputs/free-source/nhl/latest.json"),provider,{now});
 const guarded=quarantineBackupRows(backupRows,cross);
 if(!guarded.rows.length)
  throw Error("No nonconflicting eligible regular backup offers remain");
 const board={...provider,rows:guarded.rows};
 const output=buildFreeNhlResearch(board,projections,now,null,optional("outputs/nhl-usage/latest.json"));
 if(!output.boardFresh||!output.projectionsFresh||output.boardCoverageComplete===true||
  output.sourceScope!=="verified_selected_events")
  throw Error("Backup partial board misclassified or model stale");
 await resolveSchedule(output);
 const intel=optional("outputs/pregame-availability/latest.json");
 output.rankedProps=output.rankedProps.map(p=>applyPregameSignal(p,intel,output.generatedAt));
 output.lineups=optimize(output.rankedProps,{at:output.generatedAt});
 const priorResearch=optional("outputs/prizepicks-backup/nhl/research-latest.json");
 output.lineupReoptimizationAudit=revalidateResearchLineups(priorResearch,output,{
  now:output.generatedAt,newBoardComplete:output.captureScopeComplete===true,
  sourceSame:priorResearch?.source==="The Odds API / prizepicks provider-labelled event subset"
 });
 const selected=selectIndividualProps(output.rankedProps);
 output.individualPropSelectionPolicy=POLICY;
 output.individualPropSelections=selected.selected;
 output.individualPropSelectionSummary={
  selected: selected.selected.length,
  exclusions:selected.exclusions,abstentions:selected.abstained,
  originalFantasyPlatformAuthenticated:false,sourceScopePartial:true,
  lineupPayoutVerified:false,modelProbabilityCalibrated:false,
  alternateTierExcludedUntilVerified:true
 };
 output.crossSourceAudit={
  comparisonPossible:cross.comparisonPossible,
  status:cross.status,primarySourceValid:cross.primarySourceValid,
  backupSourceValid:cross.backupSourceValid,
  independentlyMatchedSameLine:cross.matchedSameLine,
  independentlyConflictingLine:cross.conflictingLine,
  primaryAmbiguous:cross.ambiguousPrimary,
  backupAmbiguous:cross.ambiguousBackup,
  rowsQuarantinedBeforeModelSelection:guarded.quarantined,
  originalPlatformConfirmed:false,
  missingIndependentCrossCheckDoesNotImplySameLine:true
 };
 output.originalPlatformOfferAuthenticated=false;
 output.alternateTierVerified=false;
 output.sourceVendorAuthenticated=provider.sourceVendorAuthenticated===true;
 output.sourceScope="verified_selected_events";
 output.captureScopeComplete=true;
 output.boardCoverageComplete=false;
 output.source="The Odds API / prizepicks provider-labelled event subset";
 output.scopeNotice="Selected-event subset only, not full NHL board coverage; source-labelled pregame model research, no authenticated original PrizePicks availability, tier payouts, or settlement.";
 const gate=frozenSelectionReadiness({research:output,now});
 if(!gate.ready)throw Error("Cannot precommit backup cohort: "+gate.reasons.join(", "));
 const day=output.generatedAt.slice(0,19).replace(/[-:]/g,"")+"Z";
 const archive=path.join(ROOT,"outputs/research/snapshots/"+day+".json");
 const outDir=path.join(ROOT,"outputs/prizepicks-backup/nhl");
 fs.mkdirSync(path.dirname(archive),{recursive:true});
 const json=JSON.stringify(output,null,2)+"\n";
 // The source scope and selected directions are frozen together in first-write
 // Git-archived research. Never overwrite an existing archived decision.
 fs.writeFileSync(archive,json,{flag:"wx"});
 fs.writeFileSync(path.join(outDir,"research-latest.json"),json);
 console.log(JSON.stringify({
  kind:"precommit_independent_oddsapi_prizepicks_nhl_limited_scope",
  originalPlatformVerified:false,fullLeagueBoardVerified:false,
  selected:gate.selectedIndividualProps,ranked:output.rankedProps.length,
  archivedFile:"outputs/research/snapshots/"+day+".json",
  gitCommitBeforeEveryPuckDropNotYetVerified:true,
  paidProviderRequests:0
 }));
}
if(require.main===module)main().catch(e=>{
 console.error("Backup model could not freeze: "+e.message);process.exitCode=1;
});
module.exports={main};
