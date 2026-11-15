"use strict";
// Public progress only; explicit count allowlist, never private names, lines,
// source prices, calibration coefficients or internal model parameters.
const fs=require("node:fs"),path=require("node:path"),count=x=>Number.isInteger(x)&&x>=0?x:null,dt=x=>typeof x==="string"?Date.parse(x):NaN;
function build(source,{now=new Date().toISOString()}={}){
 if(source?.kind!=="private_source_completion_readiness_v1"||!Number.isFinite(dt(now))||!Number.isFinite(dt(source.generatedAt))||dt(source.generatedAt)>dt(now)||source.modelPromoted!==false||source.wagersPlaced!==0)return null;
 const d=source.periodCoverage,p=d&&count(d.calendarDays)>0&&count(d.accountedDays)!==null&&count(d.pendingDays)!==null&&d.accountedDays+d.pendingDays===d.calendarDays?{accountedDays:d.accountedDays,calendarDays:d.calendarDays,pendingDays:d.pendingDays}:null;
 const evidence=Object.fromEntries(["nhl","nfl"].map(s=>[s,{firstObserved:count(source.prospective?.[s]?.firstObserved),matchedCalibrationRows:count(source.prospective?.[s]?.matchedCalibrationRows)}]));
 const odds=source.odds||{},paper=source.paper||{},slate=source.lineupSlateEvidence||{};
 return {schemaVersion:1,kind:"public_research_progress_counts_v1",generatedAt:now,sourceReportAt:source.generatedAt,periodHistory:p,evidence,
  sportsbook:{strictMatched:count(odds.strictPlatformMatches),conditionalArchived:count(odds.archiveCoverage?.uniqueConditionalPropSides??odds.archivedConditionalMatches),within30Minutes:count(odds.archiveCoverage?.uniqueWithin30Minutes??odds.within30Minutes),verifiedLiveConsensus:false},
  lineupResearch:Object.fromEntries(["NHL","NFL"].map(s=>[s,{distinctResolvedSlates:count(slate[s]?.distinctSlatesAcrossFormats)}])),
  paper:{authenticatedSettledEntries:count(paper.authenticatedSettledEntries),verifiedROI:null},
  proprietaryRowsPublished:0,calibrationApproved:false,modelPromoted:false};
}
function main([privateRoot,publicRoot]=process.argv.slice(2)){
 if(!privateRoot||!publicRoot)throw Error("Require checkout paths");
 const out=build(JSON.parse(fs.readFileSync(path.join(privateRoot,"outputs/health/source-completion-readiness-latest.json"),"utf8")));
 if(!out)throw Error("Unverified private progress report; refuse publication");
 const f=path.join(publicRoot,"data/research-evidence-progress.json");fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(out,null,2)+"\n");
 console.log("PASS: allowlisted progress counts only.");
}
if(require.main===module)main();
module.exports={build};
