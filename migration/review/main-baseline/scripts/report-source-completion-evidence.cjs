"use strict";
// Private source readiness report. Owner-reviewed paper evidence is not
// independent authentication. Missing inputs remain explicit, never zero ROI.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process"),root=path.resolve(__dirname,"..");
const get=p=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));}catch{return null;}};
function originalArchives(){
 const dir="outputs/sportsbooks/bounded-live",abs=path.join(root,dir);
 if(!fs.existsSync(abs))return [];
 const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:10000,maxBuffer:16*1024*1024}).trim(),out=[];
 for(const file of fs.readdirSync(abs).filter(x=>/^\d{8}T\d{9}Z\.json$/.test(x)).sort()){
  const rel=dir+"/"+file;
  try{const hashes=git(["log","--format=%H","--",rel]).split("\n").filter(Boolean);if(hashes.length!==1)continue;
   out.push({archive:JSON.parse(git(["show",hashes[0]+":"+rel])),firstCommittedAt:git(["show","-s","--format=%cI",hashes[0]]),gitHistoryCount:1});
  }catch{}
 }
 return out;
}

/** Count-only diagnostic: match stages partition each native sportsbook group.
 * Names, player IDs, lines, prices and conditional model probabilities are excluded.
 */
function safeFunnel(f){
 const stage=["no_event","no_exact_name","no_market","no_same_threshold",
  "no_preexisting_frame","ambiguous_identity","conditional_match"];
 const n=x=>Number.isInteger(x)&&x>=0?x:null;
 if(f?.kind!=="sportsbook_exact_threshold_match_funnel_and_native_price_movement_v1"||
  f.newPaidRequests!==0||f.modelPromoted!==false||n(f.archives)===null)return null;
 const bySport={};
 for(const sport of ["NHL","NFL"]){
  const r=f.bySport?.[sport]||{};
  const native=n(r.native||0);
  const vals=Object.fromEntries(stage.map(k=>[k,n(r[k]||0)]));
  if(native===null||Object.values(vals).some(v=>v===null)||
   Object.values(vals).reduce((a,b)=>a+b,0)!==native)return null;
  bySport[sport]={native,...vals};
 }
 const buckets=["within10m","within30m","within2h","within8h","noExactThreshold"];
 const captureSkewBuckets=Object.fromEntries(buckets.map(k=>[k,n(f.captureSkewBuckets?.[k]||0)]));
 if(Object.values(captureSkewBuckets).some(v=>v===null))return null;
 return {kind:"private_sportsbook_match_stage_counts_v1",archives:f.archives,
  bySport,captureSkewBuckets,sharedPlayerIdVerified:false,
  authenticatedClosingLine:false,newPaidRequests:0,modelPromoted:false};
}
function main(now=new Date().toISOString()){
 const capture=get("outputs/sportsbooks/bounded-live/status-latest.json");
 const {study}=require("../src/bounded-sportsbook-consensus.cjs"),s=study(get("outputs/sportsbooks/bounded-live/latest.json"),{now});
 const {quote,settle}=require("../src/paper-entry-evidence.cjs"),paper=get("outputs/research/private-paper-entry-intake.json"),quotes=Array.isArray(paper?.quotes)?paper.quotes:[],settlements=Array.isArray(paper?.settlements)?paper.settlements:[];
 const accepted=new Map(),duplicate=new Set();
 for(const q of quotes){const x=quote(q);if(!x)continue;if(accepted.has(x.id))duplicate.add(x.id);accepted.set(x.id,q);}
 for(const id of duplicate)accepted.delete(id);
 let ready=0;for(const [id,q] of accepted){const a=settlements.filter(x=>x.quoteId===id);if(a.length===1&&settle(q,a[0]))ready++;}
 const n=get("outputs/health/nhl-standard-forward-improvement-latest.json"),f=get("outputs/nfl/backtests/independent-source-forward-latest.json");
 const evidence=x=>({reportedAt:x?.generatedAt??null,firstObserved:x?.firstObservedCalibrationState?.firstObserved?.length??null,matchedCalibrationRows:Object.values(x?.hierarchicalCalibration?.byMarketTierSide||{}).reduce((s,r)=>s+r.matchedHeldout,0)});
 const report={kind:"private_source_completion_readiness_v1",generatedAt:now,odds:{lastCaptureStatus:capture?.status??"no_capture",captureAt:capture?.generatedAt??null,requested:capture?.requests??null,quotaCreditsReported:capture?.quotaCreditsReported??null,sourceNativeConsensusGroups:s.groups.length,strictPlatformMatches:s.strictPlatformMatches,livePlatformConsensusVerified:false},
 paper:{publicStandardReference:{source:"https://www.prizepicks.com/help-center/payouts",updated:"2026-10-19",entrySpecificTermsRequired:true},submittedQuotes:quotes.length,uniqueOwnerReviewedQuotes:accepted.size,settlementsReadyForIndependentReview:ready,authenticatedSettledEntries:0,paperROI:null},prospective:{nhl:evidence(n),nfl:evidence(f)},periodCoverage:get("outputs/backtests/nhl-combo-period-release-gates-latest.json")?.stages?.["1_historical_coverage"]?.detail??null,modelPromoted:false,wagersPlaced:0};
 const accept=get("outputs/health/four-priority-evidence-latest.json");
 if(accept?.kind==="private_multisport_four_priority_acceptance_v1"&&
  accept.acceptance?.probabilityRelease===false&&
  accept.acceptance?.approvedOptimizedLineups===false&&
  accept.acceptance?.noOfficialWagers===true&&
  Number.isFinite(Date.parse(accept.generatedAt))&&
  Date.parse(accept.generatedAt)<=Date.parse(now)){
  report.validationSample={sourceReportAt:accept.generatedAt,
   nhlStandardFrozenDecisions:accept.calibration?.originalStandardDecided??null,
   nhlStandardFrozenGames:accept.calibration?.originalStandardGames??null,
   nhlStandardFrozenPacificSlates:accept.calibration?.originalPacificSlateDays??null,
   matchedFrozenCalibrationDecisions:accept.calibration?.totalGenuinelyFrozenTrialDecisions??null,
   independentlySupportedCalibrationGroups:accept.calibration?.groupsPassingMinimum??null,
   nflFirstDistinctThresholdDecisions:accept.grading?.nflDistinctThresholdDecided??null,
   nflFirstDistinctThresholdGames:accept.grading?.nflDistinctThresholdGames??null,
   powerFlexRegisteredReferenceEntries:accept.lineups?.totalRegistered??null,
   powerFlexResolvedReferenceEntries:accept.lineups?.totalDecided??null,
   powerFlexUniqueUnderlyingResolvedSlates:accept.lineups?.uniqueUnderlyingCalendarSlatesResolved??null,
   originalPlatformSettlementVerified:false,actualPayoutEVVerified:false,
   modelPromoted:false};
 }
 const archive=get("outputs/sportsbooks/bounded-live/latest.json");
 if(archive){
  const frames={NHL:require("./report-nhl-standard-triple-challengers.cjs").originalFrames(),NFL:require("./report-nfl-independent-forward.cjs").frames()};
  const bridge=require("../src/archived-prop-market-benchmark.cjs").compare(archive,frames);
  const archives=originalArchives();
  report.odds.archiveCoverage=require("../src/archived-sportsbook-coverage.cjs").audit(archives,frames);
  report.odds.matchFunnel=safeFunnel(require("../src/sportsbook-match-funnel.cjs").audit(archives,frames));
  if(!report.odds.matchFunnel)throw Error("Private sportsbook match stages invalid; refuse unverifiable research status");
  report.odds.archivedConditionalMatches=bridge.matchedRows;report.odds.within30Minutes=bridge.within30Minutes;report.odds.bySport=bridge.bySport;report.odds.sharedProviderIdsVerified=false;
  const target=path.join(root,"outputs/health/archived-prop-benchmark-latest.json");fs.writeFileSync(target,JSON.stringify(bridge,null,2)+"\n");
 }
 report.lineupSlateEvidence={NHL:n?.lineupSlateCoverage??null,NFL:f?.lineupSlateCoverage??null};
 report.paper.standardReferenceSimulations={NHL:n?.standardReferencePaperSimulation??null,NFL:f?.standardReferencePaperSimulation??null};
 const dst=path.join(root,"outputs/health/source-completion-readiness-latest.json");fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,JSON.stringify(report,null,2)+"\n");return report;
}
if(require.main===module)main();
module.exports={main,safeFunnel};
