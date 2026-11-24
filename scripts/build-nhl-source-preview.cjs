"use strict";
/**
 * Strictly non-precommitted research preview, separate from the official
 * immutable prospective selection ledger and its eligibility tests.
 * Uses ONLY cached projections and the independently archived source board.
 */
const fs=require("node:fs"),path=require("node:path");
const {buildFreeNhlResearch}=require("../src/free-nhl-research.cjs");
const {optimize}=require("../src/nhl-lineup-optimizer.cjs");
const {applyPregameSignal}=require("../src/nhl-pregame-intel.cjs");
const root=path.resolve(__dirname,"..");
function buildPreview({board,projections,now=new Date().toISOString(),usage=null,intel=null}={}){
 const t=Date.parse(now),at=Date.parse(board?.generatedAt),
  pinned=Date.parse(board?.boardAsOfAt),built=Date.parse(projections?.builtAt);
 if(!Number.isFinite(t)||!Number.isFinite(at)||at>t||t-at>30*60000||
  !Number.isFinite(pinned)||pinned>at||at-pinned>5*60000||
  !Number.isFinite(built)||built>at||at-built>48*3600000||
  board?.snapshotMode!=="immutable_as_of"||
  board?.provider!=="prizepicksapi.com"||board?.completePagination!==true||
  board?.sourceStatus!=="fresh"||!Array.isArray(board?.rows)||!board.rows.length)
  throw Error("Cannot publish preview without complete fresh independent NHL source board");
 const ranked=buildFreeNhlResearch(board,projections,now,null,usage);
 if(!ranked.boardFresh||!ranked.projectionsFresh||!ranked.boardCoverageComplete)
  throw Error("Research preview requires matched source and non-lookahead model freshness");
 ranked.rankedProps=ranked.rankedProps.map(p=>applyPregameSignal(p,intel,now));
 ranked.lineups=optimize(ranked.rankedProps,{at:now,limit:35});
 return {...ranked,
  snapshotKind:"nhl_independent_source_model_preview_v1",
  snapshotPurpose:"customer_research_preview_not_precommitted_prediction",
  officialGameStartIdentityNotYetVerified:true,
  prospectiveCohort:false,eligibleForOfficialProspectiveGrading:false,
  originalModelSelectionGitFrozen:false,individualPropSelections:[],
  futureOfficialResultsUsed:false,accountWagersPlaced:0,
  originalPlatformAvailabilityVerified:false,modelCalibrated:false,
  publishedAt:now,
  note:"Independently archived source offers matched to prior-only NHL statistics. Browsable research estimates ONLY. No original pregame selection registry, verified fantasy platform availability, settlement, EV or joint lineup probability."};
}
const read=p=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}catch{return null;}};
function main(now=new Date().toISOString()){
 const preview=buildPreview({board:read("outputs/free-source/nhl/latest.json"),
  projections:read("outputs/projections/players.json"),now,
  usage:read("outputs/nhl-usage/latest.json"),
  intel:read("outputs/pregame-availability/latest.json")});
 const dir=path.join(root,"outputs/free-source/nhl"),suffix=now.slice(0,19).replace(/[-:]/g,"")+"Z";
 const target=path.join(dir,"research-preview-snapshots",suffix+".json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(preview,null,2)+"\n",{flag:"wx"});
 fs.writeFileSync(path.join(dir,"research-preview-latest.json"),JSON.stringify(preview,null,2)+"\n");
 const summary={kind:"nhl_source_preview_build_diagnostics_v1",at:now,
  matched:preview.matchedRows,excluded:preview.excluded,
  lineups:Object.fromEntries([2,3,4,5,6].map(n=>[n,!!preview.lineups[n]])),
  capturesOfficialProspectiveSelections:false,providerSpend:0,
  boardGeneratedAt:preview.boardGeneratedAt};
 console.log(JSON.stringify(summary));
 if(process.env.GITHUB_STEP_SUMMARY)
  fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   "### Independent NHL board → model preview\n"+
   "Source: "+preview.boardGeneratedAt+"; matched offered-side rows: "+preview.matchedRows+
   "; excluded: "+JSON.stringify(preview.excluded)+
   ". This is not a frozen pregame selection cohort.\n");
 return summary;
}
if(require.main===module)try{main()}catch(e){console.error("::error::"+e.message);process.exitCode=1;}
module.exports={buildPreview,main};
