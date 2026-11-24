"use strict";
/** Grade only original private Git precommitted numeric forecasts and sides. */
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib"),
 {execFileSync}=require("node:child_process");
const {evaluateOriginalFrozen,evaluatePriorNumericPreviews}=require("../src/nfl-precommitted-grading.cjs");
const ROOT=path.resolve(__dirname,"..");
function read(relative){return JSON.parse(fs.readFileSync(path.join(ROOT,relative),"utf8"));}
function history(dataset){
 const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ROOT,
  "outputs/nfl/history/2026",dataset+".json.gz"))).toString("utf8"));
 if(d?.sport!=="NFL"||d.dataset!==dataset||d.recordCount!==d.rows?.length||
    d.retrospectivePlayerStatsNotPregameLines!==true)
  throw Error("Private NFL outcome archive invalid: "+dataset);
 return d.rows;
}
function filesIn(dir,pattern){
 const abs=path.join(ROOT,dir);
 return fs.existsSync(abs)?fs.readdirSync(abs).filter(n=>pattern.test(n)).sort()
  .map(n=>dir+"/"+n):[];
}
function original(relative){
 const git=args=>execFileSync("git",args,{cwd:ROOT,encoding:"utf8",timeout:15000}).trim();
 const stamp=git(["log","--diff-filter=A","-1","--format=%cI","--",relative]);
 const count=Number(git(["rev-list","--count","HEAD","--",relative]));
 return {path:relative,firstCommittedAt:stamp,gitHistoryCount:count};
}
function main(){
 const weekly=history("player_weekly"),schedule=history("schedule");
 const old=filesIn("outputs/nfl/research",/^partner-research-preview-2026-11-(?:08|09).*\.json$/);
 const future=filesIn("outputs/nfl/prospective",/^\d{8}T\d{6}Z\.json$/);
 // These files must originate from original Git commits. Fail closed on
 // modified, missing, or uncommitted research snapshots.
 const previews=old.map(path=>({...original(path),preview:read(path)}));
 const frozen=future.map(path=>({...original(path),snapshot:read(path)}));
 const now=new Date().toISOString();
 const numeric=evaluatePriorNumericPreviews(previews,weekly,schedule,{now});
 const sides=evaluateOriginalFrozen(frozen,weekly,schedule,{now});
 const report={kind:"nfl_private_pregame_evidence_separated_outcome_audit_v1",
  generatedAt:now,numeric,explicitFrozenDirections:sides,
  nflverseFinalStatsNotPlatformSettlement:true,
  neverClaimNumericSideAsPreviouslyFrozenHigherLower:true,
  automatedWagers:0};
 const output="outputs/nfl/backtests/pregame-forecast-proof-latest.json";
 fs.mkdirSync(path.dirname(path.join(ROOT,output)),{recursive:true});
 fs.writeFileSync(path.join(ROOT,output),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({output,
   historicNumeric:{registered:numeric.registered,decided:numeric.decided,
    pending:numeric.pending,meanAbsoluteError:numeric.meanAbsoluteError},
   originalFrozen:{registered:sides.registered,decided:sides.decided,
    pending:sides.pending},
   historicalSidesPrecommitted:false,platformSettlementsVerified:false}));
 return report;
}
if(require.main===module)try{main()}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={main,original,filesIn,history};
