"use strict";
/**
 * Non-production NHL period/combo release evidence report.
 * Runs after the existing period history/model build. Data collection and
 * 16-market production/website pipelines are unchanged.
 */
const fs=require("node:fs"),path=require("node:path");
const {buildReleaseEvidence}=require("../src/nhl-period-combo-launch-evidence.cjs");
const ROOT=path.resolve(__dirname,"..");
const read=p=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));}
 catch(e){if(e.code==="ENOENT")return null;throw e;}};
function loadKnownEmptyDays(){
 const dir=path.join(ROOT,"outputs/period-stats/empty-dates");
 try{return fs.readdirSync(dir).filter(f=>/^\d{4}-\d{2}-\d{2}\.json$/.test(f))
  .filter(f=>{const d=read(path.join("outputs/period-stats/empty-dates",f));
    return d?.noScheduledGames===true&&d?.date===f.slice(0,10);})
  .map(f=>f.slice(0,10));}
 catch(e){if(e.code==="ENOENT")return [];throw e;}
}
function buildFromRepository({now=new Date().toISOString()}={}){
 return buildReleaseEvidence({
  periodHistory:read("outputs/period-stats/history.json"),
  walkforward:read("outputs/backtests/nhl-period-walkforward-latest.json"),
  comboAudit:read("outputs/backtests/nhl-combo-structured-offer-audit-latest.json"),
  periodAudit:read("outputs/backtests/nhl-period-offer-readiness-latest.json"),
  backfillStatus:read("outputs/period-stats/prior-season-backfill-status-latest.json"),
  emptyDates:loadKnownEmptyDays(),now});
}
function main(){
 const out=buildFromRepository();
 const target=path.join(ROOT,"outputs/backtests/nhl-combo-period-release-gates-latest.json");
 fs.mkdirSync(path.dirname(target),{recursive:true});
 fs.writeFileSync(target,JSON.stringify(out,null,2)+"\n");
 console.log(JSON.stringify({
  kind:out.kind,historicalCoverage:out.stages["1_historical_coverage"].detail,
  calibrationMarkets:out.stages["3_heldout_calibration"].detail.evaluatedMarkets,
  autoPicks:out.automaticHigherLowerEnabled,lineups:out.optimizedLineupEligibilityEnabled
 }));
}
if(require.main===module)try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={buildFromRepository,loadKnownEmptyDays,main};