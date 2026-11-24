"use strict";
/** Offline, retrospective-only and private. No data providers, wagers or public player props. */
const fs=require("node:fs"),path=require("node:path");
const {originalFrames}=require("./report-nhl-standard-triple-challengers.cjs");
const {replay}=require("../src/nhl-standard-quality-retro-replay.cjs");
const root=process.env.RESEARCH_ARCHIVE_ROOT?fs.realpathSync(process.env.RESEARCH_ARCHIVE_ROOT):path.resolve(__dirname,"..");
function run(){
 const history=JSON.parse(fs.readFileSync(path.join(root,"outputs/history/players.json"),"utf8"));
 const report=replay(originalFrames(),history);
 const where=path.join(root,"outputs/health/nhl-standard-quality-retro-diagnostic-latest.json");
 fs.mkdirSync(path.dirname(where),{recursive:true});
 fs.writeFileSync(where,JSON.stringify({...report,generatedAt:new Date().toISOString()},null,2)+"\n");
 console.log(JSON.stringify({kind:report.kind,frames:report.originalFramesChecked,
  featureFrames:report.originalFramesWithBothFeatureVectors,
  originals:report.all.registered,decided:report.all.decided,
  selected:report.selected.registered,selectedDecided:report.selected.decided,
  selectedHitRate:report.selected.hitRate,
  skippedDecided:report.skipped.decided,skippedHitRate:report.skipped.hitRate,
  alwaysLowerSelected:report.selected.alwaysLowerOnSameLines,
  independentValidation:false,bettingRecommendationsApproved:false}));
 return report;
}
if(require.main===module)try{run()}catch(e){console.error("Strict NHL retrospective audit refused:",e.message);process.exitCode=1;}
module.exports={run};
