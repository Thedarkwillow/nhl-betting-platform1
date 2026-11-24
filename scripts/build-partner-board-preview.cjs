"use strict";
/**
 * Safe private archive import and research preview. No provider requests or
 * source credential usage. Does not replace frozen pregame selections.
 *
 * node scripts/build-partner-board-preview.cjs outputs/manual-board-captures/YYYY-MM-DD/TIMESTAMP
 */
const fs=require("node:fs"),path=require("node:path");
const {normalizeArchive}=require("../src/partner-prizepicks-board.cjs");
const {convertCompactArchive}=require("../src/partner-prizepicks-compact-archive.cjs");
const {buildFreeNhlResearch}=require("../src/free-nhl-research.cjs");
const ROOT=path.resolve(__dirname,"..");
function read(pathname){return JSON.parse(fs.readFileSync(pathname,"utf8"));}
function loadCapture(relative,{now=new Date().toISOString()}={}){
 const dir=path.resolve(ROOT,relative);
 const prefix=path.join(ROOT,"outputs","manual-board-captures")+path.sep;
 if(!dir.startsWith(prefix))throw Error("Archive path must remain under private captured source");
 const manifest=read(path.join(dir,"manifest.json"));
 const result={manifest,boards:{}};
 for(const sport of ["NHL","NFL"]){
  const info=manifest.sports?.find(s=>s.sport===sport);
  if(!info)throw Error("Missing complete "+sport+" archived source");
  const parts=[];
  for(let n=1;n<=info.parts;n++)
   parts.push(read(path.join(dir,sport.toLowerCase()+"-"+String(n).padStart(2,"0")+".json")));
  if(manifest.snapshotMode==="direct_live_board_compact_mixed_formats"){
   const metadata=sport==="NFL"?read(path.join(dir,"nfl-meta.json")):null;
   result.boards[sport]=convertCompactArchive(manifest,parts,{sport,now,metadata});
  }else{
   result.boards[sport]=normalizeArchive(manifest,parts,{sport,now});
  }
 }
 return result;
}
function buildOfflineReport(archive,{now=new Date().toISOString(),projections=null}={}){
 const nhl=archive.boards.NHL,nfl=archive.boards.NFL;
 const result={
  schemaVersion:1,kind:"private_partner_board_research_preview_not_frozen_picks",
  generatedAt:now,source:nhl.provider,
  originalCaptureAtUTC:nhl.boardAsOfAt,
  actualNhlBoardRows:nhl.rawOfferCount,actualNflBoardRows:nfl.rawOfferCount,
  nhlNormalizedSides:nhl.rows.length,nflNormalizedSides:nfl.rows.length,
  eligibleForOfficialProspectiveGrading:false,originalModelSelectionGitFrozen:false,
  originalPlatformSettlementVerified:false,
  modelCalibrated:false,verifiedExpectedValue:false,accountWagersPlaced:0,
  nhl:{sourceFresh:nhl.sourceStatus==="fresh",
    normalizedSides:nhl.rows.length,normalization:nhl.normalization},
  nfl:{status:"source_inventory_only_nfl_model_not_integrated",
    normalizedSides:nfl.rows.length,normalization:nfl.normalization,
    playerPropsReadyForAutomaticLineups:false},
  note:archive?.manifest?.captureWithinNineAmPacificWindow===true?
   "Observed inside 09:00 Pacific hour, not an exact 09:00 quote. The earlier 07:30 snapshot is NOT a 06:00 capture; no verified 06-to-09 comparison or retrospectively frozen selections.":
   "Actual-time partner board; no inferred directions or payout, no retrospective official predictions."
 };
 if(!projections) {result.nhl.status="projection_file_unavailable";return result;}
 const built=Date.parse(projections.builtAt),cap=Date.parse(nhl.boardAsOfAt);
 if(!Number.isFinite(built)||built>cap||cap-built>48*3600000){
  result.nhl.status="past_only_model_history_unavailable_or_stale";return result;
 }
 if(nhl.sourceStatus!=="fresh"){
  result.nhl.status="stale_snapshot_preview_only_no_new_live_recommendations";return result;
 }
 // Actual existing NHL model, not a rewritten scoring formula.
 const evaluated=buildFreeNhlResearch(nhl,projections,now);
 result.nhl={...result.nhl,status:"uncalibrated_research_preview",
  projectionBuiltAt:projections.builtAt,
  matchedRows:evaluated.matchedRows,excluded:evaluated.excluded,
  rankedProps:evaluated.rankedProps,
  lineups:evaluated.lineups,
  modelProvenance:evaluated.model,originalPlatformAvailabilityVerified:false};
 return result;
}
function main(){
 const input=process.argv[2];if(!input)throw Error("Required private source archive directory");
 const now=new Date().toISOString(),a=loadCapture(input,{now});
 let projections=null;
 try{projections=read(path.join(ROOT,"outputs/projections/players.json"));}
 catch(e){console.warn("NHL model projection file unavailable: "+e.message);}
 const result=buildOfflineReport(a,{now,projections});
 const stamp=now.replace(/[:.]/g,"-");
 const dest=path.join(ROOT,"outputs","partner-source","research-preview",stamp+".json");
 fs.mkdirSync(path.dirname(dest),{recursive:true});
 fs.writeFileSync(dest,JSON.stringify(result,null,2)+"\n",{flag:"wx"});
 console.log(JSON.stringify({preview:dest,nhl:result.nhl.status,nfl:result.nfl.status,
  nhlSourceRows:result.actualNhlBoardRows,nflSourceRows:result.actualNflBoardRows,
  nhlMatched:result.nhl.matchedRows??null,slipsOfficiallyFrozen:false}));
}
if(require.main===module)try{main();}catch(error){console.error(error.message);process.exitCode=1;}
module.exports={loadCapture,buildOfflineReport};
