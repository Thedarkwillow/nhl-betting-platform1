"use strict";
/**
 * Reconcile nflverse ordered play-by-play event totals against its separately
 * produced final player-weekly stats. This confirms internal source agreement,
 * NOT independently sourced NFL.com gamebooks or DFS platform settlement.
 * Importing historical finalized stats into current pregame forecasts forbidden.
 */
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const {derive}=require("./reconcile-nfl-espn-boxscore.cjs");
const ROOT=path.resolve(__dirname,"..");
const YEARS=[2024,2025,2026];
const MARKETS=[["rushing_attempts","carries"],["rushing_yards","rushing_yards"],
 ["receptions","receptions"],["receiving_yards","receiving_yards"]];
function load(root,year,name){
 const file=path.join(root,"outputs/nfl/history",String(year),name+".json.gz");
 const d=JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString("utf8"));
 if(d.sport!=="NFL"||d.dataset!==name||d.recordCount!==d.rows?.length)
  throw Error("Source archive/provenance invalid for "+year+"/"+name);
 return d.rows;
}
function verifyYear(year,plays,weekly){
 const byGame=new Map(),seen=new Set();
 for(const x of plays){
  if(x.season_type!=="REG"||Number(x.season)!==year||!x.game_id||x.play_id==null)
   throw Error("Nonregular or inconsistent specialty play in "+year);
  const k=x.game_id+"|"+x.play_id;
  if(seen.has(k))throw Error("Duplicate NFL play identity");
  seen.add(k);
  if(!byGame.has(x.game_id))byGame.set(x.game_id,[]);
  byGame.get(x.game_id).push(x);
 }
 const outcomes=new Map();
 for(const [gameId,ev] of byGame){
  for(const [playerId,stats] of derive(ev))
   outcomes.set(gameId+"|"+playerId,stats);
 }
 const report={year,gameCount:byGame.size,sourcePlayCount:plays.length,
  playerWeeklyRows:weekly.length,eligiblePlayerRows:0,
  playerMarketComparisons:0,byMarket:{},rowsMissingWeeklyIdentity:0,
  duplicateWeeklyIdentities:0,examplesOfDiscrepancy:[],
  nflOfficialGamebookIndependentlyReconciled:false};
 const weeklySeen=new Set();
 for(const row of weekly){
  if(row.season_type!=="REG"||Number(row.season)!==year)continue;
  const key=row.game_id+"|"+row.player_id;
  if(!row.game_id||!row.player_id)continue;
  if(weeklySeen.has(key)){report.duplicateWeeklyIdentities++;continue;}
  weeklySeen.add(key);
  const eventStats=outcomes.get(key);
  if(!eventStats)continue;
  report.eligiblePlayerRows++;
  for(const [metric,box] of MARKETS){
   if(!Number.isFinite(Number(row[box]))||row[box]===null)continue;
   if(metric.startsWith("rushing")&&eventStats.rushing_attempts===0)continue;
   if((metric.startsWith("rec")||metric==="receiving_yards")&&eventStats.receptions===0)continue;
   const final=Number(row[box]),derived=eventStats[metric];
   const entry=report.byMarket[metric]||(report.byMarket[metric]={compared:0,matched:0,disagreed:0});
   entry.compared++;report.playerMarketComparisons++;
   if(derived===final)entry.matched++;
   else{
    entry.disagreed++;
    if(report.examplesOfDiscrepancy.length<12)report.examplesOfDiscrepancy.push({
     gameId:row.game_id,playerId:row.player_id,metric,
     playDerivedValue:derived,weeklyFinalValue:final
    });
   }
  }
 }
 if(report.duplicateWeeklyIdentities)throw Error("Duplicate weekly boxscore IDs "+year);
 return report;
}
function build({root=ROOT}={}){
 const years=YEARS.map(y=>verifyYear(y,load(root,y,"pbp_specialty_events"),load(root,y,"player_weekly")));
 const aggregated={};
 for(const r of years)for(const [m,v] of Object.entries(r.byMarket)){
  const x=aggregated[m]||(aggregated[m]={compared:0,matched:0,disagreed:0});
  for(const k of ["compared","matched","disagreed"])x[k]+=v[k];
 }
 return {schemaVersion:1,kind:"nfl_reconstructed_pbp_against_nflverse_final_stats_v1",
  generatedAt:new Date().toISOString(),sourceYears:YEARS,
  originalNFLGamebookPDFIndependentlyMatched:false,
  sameSourceEcosystemStatsCrosscheck:true,
  readyToSettlePrizePicksOrUnderdog:false,
  originalHistoricalPlatformQuoteLinked:false,
  matchRateByStat:Object.fromEntries(Object.entries(aggregated).map(([k,v])=>[
   k,{...v,agreementPct:v.compared?Number((100*v.matched/v.compared).toFixed(2)):null}])),
  byYear:years,
  noAutomatedPlayerPropsPromoted:true,
  nonAppearanceDoesNotImplyZero:true,
  warnings:"Comparison is cross-product source consistency only; ESPN secondary final boxscore and NFL.com gamebooks require separate validation; platform void/DNP/tier and overtime still independent."};
}
function main(){
 const r=build();
 const dir=path.join(ROOT,"outputs/nfl/research");fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,"specialty-pbp-final-stats-reconciliation-latest.json"),JSON.stringify(r,null,2)+"\n");
 const n=Object.values(r.matchRateByStat).reduce((s,x)=>s+x.compared,0);
 console.log(JSON.stringify({kind:r.kind,compared:n,byMarket:r.matchRateByStat,officialGamebookVerified:false}));
 if(n<100)throw Error("Insufficient current NFL specialty-vs-final box-score comparisons");
}
if(require.main===module)try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={MARKETS,verifyYear,build};
