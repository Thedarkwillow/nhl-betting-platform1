"use strict";
/**
 * Rebuild private research-only Standard challenger audit. No provider calls.
 * Retro-constructed forecasts are never attributed to their original Git
 * commit; true challenger holdout begins AFTER challenger code is committed.
 */
const fs=require("node:fs"),path=require("node:path");
const {execFileSync}=require("node:child_process");
const {compare}=require("../src/nhl-standard-triple-challenger-grader.cjs");
const ROOT=process.env.RESEARCH_ARCHIVE_ROOT?fs.realpathSync(process.env.RESEARCH_ARCHIVE_ROOT):path.resolve(__dirname,"..");
const load=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
function originalFrames(){
 const dir="outputs/research/snapshots",abs=path.join(ROOT,dir);
 return fs.readdirSync(abs).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort().map(name=>{
  const relative=dir+"/"+name,git=args=>execFileSync("git",args,
   {cwd:ROOT,encoding:"utf8",timeout:12000}).trim();
  return {path:relative,snapshot:load(relative),
   firstCommittedAt:git(["log","--diff-filter=A","-1","--format=%cI","--",relative]),
   gitHistoryCount:Number(git(["rev-list","--count","HEAD","--",relative]))};
 });
}
function main(){
 const history=load("outputs/history/players.json");
 const approvedPath=path.join(ROOT,"outputs/approved-nhl-sources/latest.json");
 const approved=fs.existsSync(approvedPath)?load("outputs/approved-nhl-sources/latest.json"):null;
 const result=compare(originalFrames(),history,{approved});
 const file="outputs/health/nhl-standard-triple-challenger-latest.json";
 fs.mkdirSync(path.dirname(path.join(ROOT,file)),{recursive:true});
 fs.writeFileSync(path.join(ROOT,file),JSON.stringify(result,null,2)+"\n");
 const compact=s=>({recorded:s.registered,decided:s.gradedDecisions,pushes:s.pushes,
  pending:s.pending,distinctGames:s.distinctDecidedGames,
  champion:s.variants.champion?.hitRate,usage:s.variants.usage?.hitRate,
  matchup:s.variants.matchup?.hitRate,distribution:s.variants.distribution?.hitRate,
  sogOpportunity:s.variants.sogOpportunity?.hitRate,
  sogAttempts:s.variants.sogAttempts?.hitRate,
  sogMovement:s.variants.sogMovement?.hitRate,
  pointsStability:s.variants.pointsStability?.hitRate,
  pointsStabilityCovered:s.variants.pointsStability?.decided,
  sogOfficialCovered:s.variants.sogOpportunity?.decided,
  sogAttemptCovered:s.variants.sogAttempts?.decided,
  sogMovementCovered:s.variants.sogMovement?.decided,
  filterCovered:s.researchFilter.eligible});
 console.log(JSON.stringify({report:file,originalPrecommitted:compact(result.actualPrecommitted),
  postgameRetrospective:compact(result.retrospectiveResearchOnly),
  prospectiveOriginalChallengerAvailable:result.actualPrecommitted.gradedDecisions>0,
  existingChampionChanged:false,modelPromoted:false,platformSettlementVerified:false}));
 return result;
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main,originalFrames};
