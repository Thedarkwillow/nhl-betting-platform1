"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {sourceFeatures,adjusted,ALPHA,rowScore,prepare}=
 require("../scripts/backtest-nfl-matchup-context.cjs");
const map=(key,values)=>new Map([[key,values]]);
const team=(team,other,yards=220,snaps=60)=>({season:2025,team,
 opponent_team:other,passing_yards:yards,priorOffenseSnaps:snaps});
test("context model genuinely uses numeric previous opponent and FTN inputs",()=>{
 const own=map("2025|AAA",[team("AAA","BBB",200),team("AAA","CCC",210),team("AAA","DDD",205)]);
 const defense=map("2025|BBB",[team("EEE","BBB",260),team("FFF","BBB",270),team("GGG","BBB",250)]);
 const league=new Map([[2025,Array.from({length:45},()=>team("X","Y",210,60))]]);
 const ftn=new Map([["2025|BBB",[0.6,0.7]],["2025|__league__",Array(30).fill(0.3)]]);
 const r={season:2025,week:9,team:"AAA",opponent_team:"BBB"};
 const f=sourceFeatures(r,"passing_yards",180,own,defense,league,ftn);
 assert.ok(f&&f.oppImpact>0);
 assert.ok(f.ftnDelta>0);
 assert.equal(f.ftnLagWeeks,2);
 const forecast=adjusted(180,f);
 assert.ok(forecast.opponentOnly>180);
 assert.ok(forecast.withFtn>forecast.opponentPace);
 ftn.set("2025|BBB",[0.15,0.2]);
 const lower=adjusted(180,sourceFeatures(r,"passing_yards",180,own,defense,league,ftn));
 assert.ok(lower.withFtn<forecast.withFtn);
 assert.equal(ALPHA.ftn>0,true);
});
test("missing/late contextual inputs are null rather than invented values",()=>{
 const r={season:2025,week:2,team:"AAA",opponent_team:"BBB"};
 assert.equal(sourceFeatures(r,"passing_yards",180,new Map(),new Map(),new Map(),new Map()),null);
});
test("source prep joins only valid historical nflverse schedule games and market rows",()=>{
 const raw=Object.fromEntries(["player_weekly","team_weekly","snap_counts",
  "ftn_charting_research_only","schedule"].map(k=>[k,
  Object.fromEntries([2024,2025,2026].map(y=>[y,[]]))]));
 raw.schedule[2025]=[{season:2025,week:8,game_type:"REG",game_id:"2025_08_X_Y",
  home_team:"Y",away_team:"X"}];
 raw.ftn_charting_research_only[2025]=[
  {nflverse_game_id:"2025_08_X_Y",n_blitzers:2},
  {nflverse_game_id:"2025_08_X_Y",n_blitzers:0}];
 raw.player_weekly[2025]=[{season:2025,week:8,season_type:"REG",
  player_id:"qb",position:"QB",team:"X",opponent_team:"Y",passing_yards:190}];
 const p=prepare(raw);
 assert.equal(p.audit.ftnGames,1);
 assert.equal(p.audit.ftnPlays,2);
 assert.equal(p.weeks[0].ftn[0].rate,0.5);
 assert.equal(p.weeks[0].players.length,1);
});
test("paired MAE comparison can show decline and FTN degradation",()=>{
 const r=rowScore([{actual:100,baseline:100,opponentOnly:98,opponentPace:95,withFtn:93},
  {actual:110,baseline:110,opponentOnly:108,opponentPace:108,withFtn:107}]);
 assert.equal(r.baseline.mae,0);
 assert.ok(r.withFtn.mae>r.opponentPace.mae);
 assert.ok(r.withFtn.deltaMAEVsSameModelWithoutFtn<0);
});
