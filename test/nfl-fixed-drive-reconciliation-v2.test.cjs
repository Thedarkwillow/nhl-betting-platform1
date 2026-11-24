"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{reconcile}=require("../src/nfl-fixed-drive-reconciliation-v2.cjs");
const base={game_id:"g",fixed_drive:1,fixed_drive_result:"Opp touchdown",posteam:"A",defteam:"B",play_type:"pass",two_point_attempt:0,extra_point_attempt:0,yardline_100:45,touchdown:1,td_team:"B"};
test("opponent two-point try after defensive score does not constitute a possession",()=>{
 const a={...base,play_id:10},b={...base,play_id:11,posteam:"B",defteam:"A",two_point_attempt:1,td_team:null,touchdown:0};
 const r=reconcile([a,b],[a,b],"A","B");assert.equal(r.verifiedObservedDrives,1);assert.equal(r.verifiedObservedRedZoneTouchdowns,0);assert.equal(r.completeDriveChartVerified,false);
 assert.equal(reconcile([a,b],[a,{...b,two_point_attempt:0}],"A","B"),null);
 assert.equal(reconcile([a,b],[a,{...b,two_point_attempt:null}],"A","B"),null);
});
test("fixed source result must agree with explicit terminal evidence even when original boundaries conflict",()=>{
 const a={...base,play_id:10,drive_play_id_started:9,drive_play_id_ended:20};
 const b={...base,play_id:11,drive_play_id_started:11,drive_play_id_ended:12,play_type:"run",touchdown:0};
 assert.equal(reconcile([a,b],[a,b],"A","B").fixedGroupReconciled,true);
 assert.equal(reconcile([a,b],[{...a,touchdown:0},b],"A","B"),null);
 assert.equal(reconcile([a,b],[a,{...b,posteam:"B"}],"A","B"),null);
});
