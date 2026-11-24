"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {weeklyObservations,kickingObservations,forecast,chronology,summarize,
 buildReport,isRoleEligible,marketValue,SPECS}=require("../scripts/backtest-nfl-historical-stats.cjs");
const player=(season,week,value,id="p1")=>({season,week,season_type:"REG",
 player_id:id,position:"QB",passing_yards:value,attempts:22,completions:18,
 passing_tds:2,interceptions:0,carries:1,rushing_yards:0,rushing_tds:0,
 receiving_yards:0,receptions:0,targets:0,receiving_tds:0});
test("fully withheld same-week outcomes in NFL weekly retrospective forecast",()=>{
 const rows=[];
 for(let w=1;w<=5;w++)rows.push(player(2024,w,w*10));
 rows.push(player(2025,1,900),player(2025,1,700,"p2"),player(2025,2,80),
  player(2026,1,50),player(2026,2,60));
 const a=weeklyObservations(rows);
 assert.equal(a.rejected.duplicate,0);
 const out=chronology(a.observations);
 const one=out.scores.get("passing_yards|2025").find(x=>x.week===1);
 assert.equal(one.predictions.last5_mean,30);
 assert.equal(one.predictions.career_mean,30);
 assert.equal(one.actual,900);
 // Change the current week's outcome without changing its forecast.
 rows[5].passing_yards=900000;
 const newer=chronology(weeklyObservations(rows).observations);
 assert.equal(newer.scores.get("passing_yards|2025").find(x=>x.week===1).predictions.last5_mean,30);
 assert.equal(out.counts.sameWeekWithheld,true);
 assert.equal(out.scores.get("passing_yards|2026").length,2);
});
test("prior-game gate, deterministic baselines and no 2026 model fitting",()=>{
 assert.equal(forecast([1,2]),null);
 const x=forecast([1,2,3,4,5]);
 assert.equal(x.last5_mean,3);
 assert.equal(x.career_mean,3);
 assert.equal(x.last10_mean,3);
 assert.equal(x.ewma_035>3,true);
 assert.equal(x.shrunk_last5,3);
});
test("reject duplicated weekly player appearances and absent result fields",()=>{
 assert.throws(()=>weeklyObservations([player(2024,1,2),player(2024,1,5)]),/Duplicate/);
 const missing={...player(2024,1,2),passing_yards:null,attempts:null};
 const obs=weeklyObservations([missing]).observations[0];
 assert.equal(Object.hasOwn(obs.measures,"passing_yards"),false);
 assert.equal(Object.hasOwn(obs.measures,"passing_attempts"),false);
 const s=SPECS.find(s=>s.id==="pass_rush_yards");
 assert.equal(marketValue(s,missing),null);
});
test("FG/XP attempt-level game summary retains misses and no zero-game inference",()=>{
 const common={season:2025,week:1,game_id:"g1",kicker_player_id:"k1",
  field_goal_attempt:0,extra_point_attempt:0};
 const plays=[
  {...common,play_id:"1",field_goal_attempt:1,field_goal_result:"made",kick_distance:49},
  {...common,play_id:"2",field_goal_attempt:1,field_goal_result:"missed",kick_distance:53},
  {...common,play_id:"3",extra_point_attempt:1,extra_point_result:"good"},
  {...common,play_id:"4",extra_point_attempt:1,extra_point_result:"failed"},
  {...common,play_id:"5",kicker_player_id:null,field_goal_attempt:1,field_goal_result:"made"},
  {...common,play_id:"6",field_goal_attempt:1,field_goal_result:"unknown"}];
 const k=kickingObservations(plays);
 assert.equal(k.audit.acceptedPlays,4);
 assert.equal(k.audit.missingKickerId,1);
 assert.equal(k.audit.unknownResult,1);
 assert.deepEqual(k.observations[0].measures,{fg_made:1,fg_attempts:2,pat_made:1,kicking_points:4});
 assert.equal(k.observations[0].identity,"kicker:k1");
});
test("aggregate reports never create inferred historical prop hit rates or imply settlement",()=>{
 const rows=[];
 for(const year of [2024,2025,2026])
  for(const week of [1,2,3,4,5])rows.push(player(year,week,week*10));
 const set=weeklyObservations(rows).observations;
 const r=buildReport({observations:set,sourceCounts:[],kickingAudit:{}},{at:"2026-11-08T00:00:00Z"});
 assert.equal(r.prizePicksHigherLowerHitRate,null);
 assert.equal(r.underdogHigherLowerHitRate,null);
 assert.equal(r.verifiedProspectiveEdge,false);
 assert.equal(r.sameWeekResultsWithheldUntilBatchEnd,true);
 assert.equal(r.autoPickEligible,false);
 assert.equal(r.byMarketYear.some(x=>x.year===2026&&x.market==="passing_yards"),true);
 assert.equal(r.byMarketYear[0].models.last5_mean.mae>=0,true);
 assert.equal(JSON.stringify(r).includes("p1"),false);
});

test("non-QBs and unproven QB usage must not produce misleading passing MAE",()=>{
 const data=[];
 for(const year of [2024,2025,2026])for(const w of [1,2,3,4,5]){
  data.push({...player(year,w,0,"defender"),position:"LB",attempts:0,
   completions:0,passing_tds:0});
  data.push({...player(year,w,0,"qb_backup"),position:"QB",attempts:0,
   completions:0,passing_tds:0});
  data.push(player(year,w,100+w,"qb_starter"));
 }
 const rows=weeklyObservations(data).observations;
 const replay=chronology(rows);
 const score=replay.scores.get("passing_yards|2026");
 assert.equal(score.length,5);
 assert.equal(replay.counts.skippedRoleOrPriorUsage>0,true);
 const defender=rows.find(r=>r.identity==="player:defender");
 const histories=new Map([["player:defender|passing_attempts",[22,22,22]]]);
 assert.equal(isRoleEligible(defender,"passing_yards",histories),false);
 const lowUse=rows.find(r=>r.identity==="player:qb_backup");
 assert.equal(isRoleEligible(lowUse,"passing_yards",new Map([["player:qb_backup|passing_attempts",[0,0,0]]])),false);
});
