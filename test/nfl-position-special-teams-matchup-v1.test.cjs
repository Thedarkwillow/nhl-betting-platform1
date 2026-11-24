"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {rankings}=require("../src/nfl-position-rankings-v1.cjs"),{build,context}=require("../src/nfl-special-teams-matchup-v1.cjs");
function fixtures(){
 const schedule=[],weekly=[],teamWeekly=[];
 for(let w=1;w<=5;w++)for(let i=0;i<32;i+=2){
  const home="T"+i,away="T"+(i+1),game_id=w+"-"+i;
  schedule.push({season:2026,week:w,game_type:"REG",game_id,home_team:home,away_team:away,home_score:20,away_score:10});
  for(const [team,opp] of [[home,away],[away,home]]){
   weekly.push({season:2026,week:w,player_id:team,position:"WR",recent_team:team,opponent_team:opp,receiving_yards:Number(team.slice(1))});
   teamWeekly.push({season:2026,week:w,team,opponent_team:opp,receiving_yards:Number(team.slice(1))});
  }
 }
 return {schedule,weekly,teamWeekly};
}
test("32 team position ranking requires all prior team games reconciled",()=>{
 const f=fixtures(),t=rankings(f.weekly,f.schedule,f.teamWeekly,2026,6).tables["receiving_yards|WR"];
 assert.equal(t.complete,true);assert.equal(t.rows.find(x=>x.team==="T30").rankMostAllowed,1);
 f.teamWeekly[0].receiving_yards=999;
 const b=rankings(f.weekly,f.schedule,f.teamWeekly,2026,6).tables["receiving_yards|WR"];
 assert.equal(b.complete,false);assert.ok(b.rows.every(x=>x.rankMostAllowed===null));
});
test("positive punter appearance plus team totals can establish zero; missing totals cannot",()=>{
 const g={season:2026,week:1,game_id:"g",game_type:"REG",home_team:"A",away_team:"B",home_score:10,away_score:7};
 const input={schedule:[g],events:[{season:2026,week:1,game_id:"g",play_id:1,posteam:"A",defteam:"B",play_type:"run",drive:1,down:1,yardline_100:50}],teamWeekly:[{season:2026,week:1,team:"A",opponent_team:"B",punts:0,fg_att:0,pat_att:0}],rosters:[{season:2026,week:1,team:"A",position:"P",pfr_id:"p",gsis_id:"id"}],snaps:[{season:2026,week:1,game_id:"g",team:"A",position:"P",pfr_player_id:"p",st_snaps:1}]};
 let result=build(input);assert.equal(result.playerRows[0].measures.punt_attempts,0);assert.equal(result.playerRows[0].measures.punting_average,undefined);
 delete input.teamWeekly[0].punts;result=build(input);assert.equal(result.playerRows.length,0);
 assert.equal(context(result,{playerId:"id",team:"A",opponent:"B",season:2026,week:2,market:"punt_attempts",line:3.5}).shadow,null);
});
test("specialist projection excludes current week and missing drives are not treated as full charts",()=>{
 const data={playerRows:[{year:2026,week:2,playerId:"id",team:"A",opponent:"B",measures:{punt_attempts:9}},{year:2026,week:1,playerId:"id",team:"A",opponent:"B",measures:{punt_attempts:2}}],teamRows:[]};
 const c=context(data,{playerId:"id",team:"A",opponent:"B",season:2026,week:2,market:"punt_attempts",line:3.5});
 assert.equal(c.playerForm.all.average,2);assert.equal(c.completeDriveChartVerified,false);
});
