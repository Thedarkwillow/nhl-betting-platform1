"use strict";
// Source coverage is independent of production eligibility. No restricted-page
// calls; use existing archived inputs, without relabeling them as vendor data.
const fs=require("node:fs"),path=require("node:path");
const ROOT=path.resolve(__dirname,".."),read=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),"utf8"));
function build(table,nfl,nhl,epa,usage){
 const d=nfl.datasets||[],data=name=>d.filter(x=>x.dataset===name&&x.status==="saved").map(x=>({season:x.season,count:x.records}));
 const mp=nhl.moneyPuck||{},available=table.providers||{};
 return {kind:"private_source_fallback_status_v1",generatedAt:new Date().toISOString(),providers:{
  natural_stat_trick:{direct:available.natural_stat_trick?.status??null,substitute:"MoneyPuck + official NHL historical game/shift data",sourceObservedAt:nhl.generatedAt??null,teams:mp.teams?.matchedRows??0,skaters:mp.skaters?.matchedRows??0,metrics:["xGoalsForPer60","xGoalsAgainstPer60","shotAttemptsAgainstPer60","shotAttemptsPer60"],exactNSTMetrics:false},
  pro_football_reference:{direct:available.pro_football_reference?.status??null,substitute:"PFR exported through nflverse",manifestAt:nfl.collectedAt,datasets:Object.fromEntries(["pfr_pass","pfr_rush","pfr_rec","pfr_def","snap_counts"].map(k=>[k,data(k)]))},
  fantasypros:{direct:available.fantasypros?.status??null,substitute:"nflverse weekly usage/snap count",manifestAt:nfl.collectedAt,datasets:{snap_counts:data("snap_counts"),player_weekly:data("player_weekly")},sourceSpecificRatings:false},
  rbsdm:{direct:available.rbsdm?.status??null,substitute:"independently calculated nflverse EPA and success",observedAt:epa.generatedAt??null,teamGameTypeRows:epa.teamGameTypeRows??0,identicalFiltersVerified:false},
  fantasy_life:{direct:available.fantasy_life?.status??null,substitute:"nflverse target/carry share and red-zone opportunity",markets:Object.keys(usage.markets||{}),actualRoutesRunAvailable:false,exactUtilizationScoreAvailable:false}
 },modelPromoted:false,publicRawRows:0,notes:"Fallbacks supply related features, not identical source values. Dataset counts are archived historical evidence; current-season snapshot freshness and model performance are separate."};
}
function main(){
 const r=build(read("outputs/keyfree-source-tables/status-latest.json"),read("outputs/nfl/history/manifest.json"),read("outputs/approved-nhl-sources/latest.json"),read("outputs/nfl/backtests/free-efficiency-latest.json"),read("outputs/nfl/backtests/free-pbp-usage-latest.json"));
 const p=path.join(ROOT,"outputs/keyfree-source-tables/fallback-latest.json");fs.writeFileSync(p,JSON.stringify(r,null,2)+"\n");console.log(JSON.stringify({kind:r.kind,modelPromoted:false,sourceCount:Object.keys(r.providers).length}));
}
if(require.main===module)main();module.exports={build};
