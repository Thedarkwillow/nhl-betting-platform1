"use strict";
/** Offline private NHL/NFL research bridge, no live provider calls. */
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const {loadCapture}=require("./build-partner-board-preview.cjs");
const {projectNflPartnerBoard}=require("../src/nfl-partner-board-research.cjs");
const ROOT=path.resolve(__dirname,"..");
function dataset(season,type){
 const p=path.join(ROOT,"outputs/nfl/history",String(season),type+".json.gz");
 const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));
 if(payload?.sport!=="NFL"||payload.dataset!==type||payload.recordCount!==payload.rows?.length||
  payload.retrospectivePlayerStatsNotPregameLines!==true)
  throw Error("NFL historical dataset provenance invalid: "+p);
 return payload.rows;
}
function weatherFor(row,gameId,now){
 const dir=path.join(ROOT,"outputs/nfl/research/weather");if(!fs.existsSync(dir))return null;
 const nowAt=Date.parse(now),matches=[];
 for(const name of fs.readdirSync(dir).filter(x=>x.endsWith(".json")).sort().reverse().slice(0,12)){
  let doc;try{doc=JSON.parse(fs.readFileSync(path.join(dir,name),"utf8"));}catch{continue;}
  if(doc.kind!=="nfl_nws_pregame_forecast_archive_v1"||doc.modelPromoted!==false)continue;
  for(const w of doc.rows||[]){
   if(w.gameId!==gameId||w.eventStartsAt!==row.eventStartsAt||w.venueVerified!==true||w.isForecast!==true||!Number.isFinite(Date.parse(w.observedAt))||Date.parse(w.observedAt)>nowAt||nowAt-Date.parse(w.observedAt)>24*3600000||!((w.team===row.team&&w.opponent===row.matchup)||(w.team===row.matchup&&w.opponent===row.team)))continue;
   matches.push({...w,team:row.team,opponent:row.matchup});
  }
 }
 return matches.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0]??null;
}
function main(){
 const archivePath=process.argv[2];
 if(!archivePath)throw Error("Specify private source capture directory");
 const now=new Date().toISOString(),a=loadCapture(archivePath,{now});
 const weekly=[2024,2025,2026].flatMap(y=>dataset(y,"player_weekly"));
 const schedule=dataset(2026,"schedule");
 const historicalSchedule=[2024,2025].flatMap(y=>dataset(y,"schedule")).concat(schedule);
 const kickerRosterRows=[2024,2025,2026].flatMap(y=>dataset(y,"weekly_rosters"));
 const kickerEventRows=[2024,2025,2026].flatMap(y=>dataset(y,"kicking_pbp"));
 const report=projectNflPartnerBoard({board:a.boards.NFL,weeklyRows:weekly,schedule,historicalSchedule,
  kickerRosterRows,kickerEventRows,now});
 // Additional private context only; do not change incumbent projections or eligibility.
 try{
  const years=[2024,2025,2026],teamWeekly=years.flatMap(y=>dataset(y,"team_weekly"));
  const rank=require("../src/nfl-position-rankings-v1.cjs"),cache=new Map();
  for(const row of report.rows){
   const k=row.season+"|"+row.week;
   if(!cache.has(k))cache.set(k,rank.rankings(weekly,historicalSchedule,teamWeekly,row.season,row.week));
   const prior=weekly.filter(x=>String(x.player_id)===row.historicalPlayerId&&
    (x.recent_team||x.team)===row.team&&(Number(x.season)<row.season||Number(x.season)===row.season&&Number(x.week)<row.week)).sort((a,b)=>Number(a.season)-Number(b.season)||Number(a.week)-Number(b.week));
   const pos=prior.at(-1)?.position,table=cache.get(k).tables[row.market+"|"+pos];
   if(table&&row.matchupEvidenceV1)row.matchupEvidenceV1.reconciledPositionRanking={position:pos,complete:table.complete,qualifiedTeams:table.qualifiedTeams,opponent:table.rows.find(x=>x.team===row.opponent)??null,rankDirection:"1_most_allowed"};
  }
  report.positionalRankingsV1=[...cache.values()];
  const special=require("../src/nfl-special-teams-matchup-v1.cjs"),bridge=require("../src/nfl-partner-board-research.cjs");
  const snaps=years.flatMap(y=>dataset(y,"snap_counts")),events=years.flatMap(y=>dataset(y,"pbp_specialty_events"));
  const kickers=years.flatMap(y=>require("../src/nfl-kicker-reconciled-appearances.cjs").reconcile({schedule:dataset(y,"schedule"),rosters:dataset(y,"weekly_rosters"),snaps:dataset(y,"snap_counts"),kicks:dataset(y,"kicking_pbp"),teams:dataset(y,"team_weekly")}).rows);
  const data=special.build({schedule:historicalSchedule,events,teamWeekly,kickers,rosters:kickerRosterRows,snaps});
  const rows=[];
  for(const row of a.boards.NFL.rows){
   if(Date.parse(row.eventStartsAt)<=Date.parse(now)+900000||!Number.isFinite(row.line))continue;
   const m=bridge.matchScheduledWeek(row,schedule);if(!m)continue;
   const market=require("../src/nfl-market-registry.cjs").classifyMarket("prizepicks",row.market,{period:"full_game",participants:1,sourceAuthenticity:"independent_partner_snapshot",observedAt:row.capturedAt});
   if(market.status!=="recognized_research_only"||!special.MARKETS.includes(market.marketId))continue;
   const pos=market.marketId.startsWith("punt")?"P":"K";
   const ids=bridge.matchPriorKickerRoster(kickerRosterRows.filter(x=>x.position===pos),row,m.season,m.week);
   if(ids.length!==1)continue;
   const context=special.context(data,{playerId:ids[0].id,team:row.team,opponent:row.matchup,season:m.season,week:m.week,market:market.marketId,line:row.line,weather:weatherFor(row,m.gameId,now),asOf:now,eventStartsAt:row.eventStartsAt});
   rows.push({sourceProjectionId:row.projectionId,playerId:ids[0].id,market:market.marketId,line:row.line,side:row.side,tier:row.tier,gameId:m.gameId,capturedAt:row.capturedAt,context,autoPickEligible:false});
  }
  report.specialTeamsMatchupResearchV1={coverage:data.coverage,rows,researchOnly:true,calibrated:false};
 }catch{report.specialTeamsMatchupResearchV1={status:"source_or_reconciliation_unavailable",rows:[],researchOnly:true,calibrated:false};}
 // Explicit period sides are separate. A source with unknown duration IDs
 // cannot be silently labeled a first-half or first-quarter offer.
 try{
  const years=[2024,2025,2026],board=a.boards.NFL;
  let events=[],allSchedule=[],kickers=[];
  if(board.periodResearchRows?.length){
   events=years.flatMap(y=>dataset(y,"pbp_specialty_events"));
   for(const y of years){
    const schedule=dataset(y,"schedule");allSchedule.push(...schedule);
    kickers.push(...require("../src/nfl-kicker-reconciled-appearances.cjs").reconcile({schedule,rosters:dataset(y,"weekly_rosters"),snaps:dataset(y,"snap_counts"),kicks:dataset(y,"kicking_pbp"),teams:dataset(y,"team_weekly")}).rows);
   }
  }
  report.periodResearch=require("../src/nfl-dedicated-period-preview.cjs").preview({board,weeklyRows:weekly,schedule,events,allSchedule,kickers,kickerRosters:kickerRosterRows,now});
 }catch{report.periodResearch={kind:"nfl_explicit_period_private_preview_v1",status:"abstained_unavailable_exact_history",rows:[],calibrated:false,autoPickEligible:false};}
 const output=path.join(ROOT,"outputs/nfl/research/partner-research-preview-"+now.replace(/[:.]/g,"-")+".json");
 fs.mkdirSync(path.dirname(output),{recursive:true});
 fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
 console.log(JSON.stringify({snapshot:path.relative(ROOT,output),
  observedAt:report.sourceBoardAsOfAt,sourceOffers:report.sourceOffers,
  matchedResearchSides:report.matchedResearchSides,excluded:report.excluded,
  calibratedProbabilities:false,officialNFLPicks:0,
  note:"Private historical boxscore research only, not original PrizePicks app approval or market settlement"}));
}
if(require.main===module)try{main();}catch(e){console.error(e.message);process.exitCode=1;}
module.exports={dataset,main,weatherFor};
