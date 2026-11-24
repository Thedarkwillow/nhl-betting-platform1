"use strict";
const fs=require("node:fs"),path=require("node:path"),{dataset}=require("./build-nfl-partner-board-research.cjs"),{load}=require("./report-nhl-position-multiseason-v3.cjs"),nhl=require("../src/nhl-position-rate-matchup-v2.cjs"),nfl=require("../src/nfl-position-h2h-replay-v1.cjs");
function main(){
 const {history,schedules}=load(),cutoff=new Date().toISOString().slice(0,10);
 const h=nhl.prepare(history,schedules,cutoff).report;
 const years=[2024,2025,2026],f=nfl.study(years.flatMap(y=>dataset(y,"player_weekly")),years.flatMap(y=>dataset(y,"schedule")),years.flatMap(y=>dataset(y,"team_weekly")));
 const schedule=years.flatMap(y=>dataset(y,"schedule")),weekly=years.flatMap(y=>dataset(y,"player_weekly")),teamWeekly=years.flatMap(y=>dataset(y,"team_weekly"));
 const latestWeek=Math.max(...schedule.filter(g=>Number(g.season)===2026&&g.game_type==="REG"&&Number.isFinite(g.home_score)&&Number.isFinite(g.away_score)).map(g=>Number(g.week)));
 const rankings=require("../src/nfl-position-rankings-v1.cjs").rankings(weekly,schedule,teamWeekly,2026,latestWeek+1);
 const special=require("../src/nfl-special-teams-matchup-v1.cjs");
 const kickers=years.flatMap(y=>require("../src/nfl-kicker-reconciled-appearances.cjs").reconcile({schedule:dataset(y,"schedule"),rosters:dataset(y,"weekly_rosters"),snaps:dataset(y,"snap_counts"),kicks:dataset(y,"kicking_pbp"),teams:dataset(y,"team_weekly")}).rows);
 const boundaryEvents=years.flatMap(y=>{try{return dataset(y,"drive_boundary_plays")}catch{return []}});
 const specialist=special.build({schedule,boundaryEvents,events:years.flatMap(y=>dataset(y,"pbp_specialty_events")),teamWeekly,kickers,rosters:years.flatMap(y=>dataset(y,"weekly_rosters")),snaps:years.flatMap(y=>dataset(y,"snap_counts"))});
 const exceptionTarget=path.resolve(__dirname,"../outputs/nfl/research/drive-exceptions-private-latest.json");fs.mkdirSync(path.dirname(exceptionTarget),{recursive:true});fs.writeFileSync(exceptionTarget,JSON.stringify({kind:"nfl_drive_exception_detail_v1",generatedAt:new Date().toISOString(),exceptions:specialist.driveExceptions,originalVerificationUnchanged:true},null,2)+"\n");
 const report={nflPositionalRankings:rankings,nflSpecialistCoverage:specialist.coverage,nflFullBoundaryExceptionCounts:Object.fromEntries([...new Set(specialist.driveExceptions.map(x=>x.full.reason))].map(k=>[k,specialist.driveExceptions.filter(x=>x.full.reason===k).length])),nflSpecialistReplay:special.study(specialist),kind:"cross_sport_position_h2h_paired_replay_v1",generatedAt:new Date().toISOString(),nhl:h,nfl:f,modelPromoted:false,prospectiveAccuracyVerified:false};
 const target=path.resolve(__dirname,"../outputs/health/cross-sport-position-h2h-replay-latest.json");fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+"\n");
 // No raw lines, identities or private model data in stdout.
 console.log(JSON.stringify({nhlMarkets:Object.keys(h.byMarketPosition).length,nflMarkets:Object.keys(f.byMarketPosition).length,modelPromoted:false}));
}
if(require.main===module)main();module.exports={main};
