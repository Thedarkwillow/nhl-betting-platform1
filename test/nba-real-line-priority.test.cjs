"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{prioritize,chooseTask}=require("../scripts/run-nba-dunk-cohort-study.cjs");
const t=[{kind:"team",tool:"get_team_stats",q:{}},{kind:"log",tool:"get_player_games",q:{player_id:"3112335"}},{kind:"identity",tool:"search_players",q:{}},{kind:"history",tool:"get_prop_history",q:{market:"player_points"}},{kind:"calibrationHistory",tool:"get_prop_history",q:{market:"player_points_rebounds_assists"}}];
test("history takes priority without mutating existing queue",()=>{assert.deepEqual(prioritize(t).map(x=>x.kind),["calibrationHistory","history","identity","log","team"]);assert.equal(t[0].kind,"team")});
test("original one-time log stays selected despite new history priority",()=>{assert.equal(chooseTask(t,new Set(),"jokic_log_20261125").kind,"log")});
test("previously reserved request is never reselected",()=>{const r=new Set([JSON.stringify([t[4].tool,t[4].q])]);assert.equal(chooseTask(t,r,"bounded_daily_cohort_v2").kind,"history");r.add(JSON.stringify([t[1].tool,t[1].q]));assert.equal(chooseTask(t,r,"jokic_log_20261125"),undefined)});
