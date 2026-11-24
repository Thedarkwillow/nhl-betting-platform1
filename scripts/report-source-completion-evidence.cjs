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
 const archive=get("outputs/sportsbooks/bounded-live/latest.json");
 if(archive){
  const frames={NHL:require("./report-nhl-standard-triple-challengers.cjs").originalFrames(),NFL:require("./report-nfl-independent-forward.cjs").frames()};
  const bridge=require("../src/archived-prop-market-benchmark.cjs").compare(archive,frames);
  report.odds.archiveCoverage=require("../src/archived-sportsbook-coverage.cjs").audit(originalArchives(),frames);
  report.odds.archivedConditionalMatches=bridge.matchedRows;report.odds.within30Minutes=bridge.within30Minutes;report.odds.bySport=bridge.bySport;report.odds.sharedProviderIdsVerified=false;
  const target=path.join(root,"outputs/health/archived-prop-benchmark-latest.json");fs.writeFileSync(target,JSON.stringify(bridge,null,2)+"\n");
 }
 const context=require("../src/daily-context-readiness.cjs");
 report.roleSourceCoverage=context.roleCoverage({usage:get("outputs/nhl-usage/latest.json"),external:get("outputs/pregame-availability/latest.json"),league:get("outputs/pregame-availability/official-preview-latest.json"),approved:get("outputs/approved-nhl-sources/latest.json")},now);
 report.tierCalibrationCoverage={NHL:context.calibrationCoverage(n),NFL:context.calibrationCoverage(f)};
 report.lineupSlateEvidence={NHL:n?.lineupSlateCoverage??null,NFL:f?.lineupSlateCoverage??null};
 report.paper.standardReferenceSimulations={NHL:n?.standardReferencePaperSimulation??null,NFL:f?.standardReferencePaperSimulation??null};
 const dst=path.join(root,"outputs/health/source-completion-readiness-latest.json");fs.mkdirSync(path.dirname(dst),{recursive:true});fs.writeFileSync(dst,JSON.stringify(report,null,2)+"\n");return report;
}
if(require.main===module)main();
module.exports={main};
