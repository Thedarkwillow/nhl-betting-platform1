'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {select,executeArm,compare,fieldShapes,publicArm,ORDER}=require('../scripts/pickfinder-paired-worker-benchmark.cjs');
const digest='a'.repeat(64),fieldShape='b'.repeat(64);
function o(i){return {sport:'nba',book:'prizepicks',player:'Player '+i,market:'player_points',
 eventId:'event'+i,detailId:'/players/nba/player'+i+'?prop=id%3Aplayer_points%3Aevent'+i+'%3A15.5',line:15.5};}
const board={digest,m:{sport:'nba',book:'prizepicks',authenticated:true,pageTraversalComplete:true,boardState:'populated'},offers:[0,1,2,3,4,5].map(o)};
test('selects a stable cohort of four authenticated full-game distinct profiles',()=>{
 const a=select(board),b=select({...board,offers:board.offers.slice().reverse()});
 assert.equal(a.length,4);assert.deepEqual(a,b);assert.equal(new Set(a.map(x=>x.player)).size,4);
 assert.equal(select({...board,m:{...board.m,pageTraversalComplete:false}}).length,0);
 assert.equal(select({...board,offers:[...board.offers.slice(0,2),{...o(3),period:'1Q'}]}).length,2);
});
test('requires same cohort, complete reads and field shape parity in both ABBA pairs',()=>{
 const arms=ORDER.map((workers,i)=>({workers,cohortDigest:digest,wallMs:[100,80,70,90][i],
 profileResults:Array.from({length:4},()=>({authenticated:true,complete:true,fields:40,fieldShape}))}));
 const r=compare(arms,digest);assert.equal(r.status,'matched_abba_evidence');assert.equal(r.parity,true);
 assert.equal(r.bothPairedRunsFaster,true);assert.equal(r.parallelRecommended,false);
 arms[1].profileResults[1].fieldShape='c'.repeat(64);
 assert.equal(compare(arms,digest).status,'field_parity_not_met');
 arms[1].profileResults[0].complete=false;assert.equal(compare(arms,digest).status,'incomplete_or_unauthenticated_arm');
 assert.equal(compare(arms.slice(1),digest).status,'incomplete_trial');
});
test('uses a separate tab per concurrent worker, retains order and closes tabs',async()=>{
 let count=0,closed=0,clock=0;
 const context={newPage:async()=>({id:++count,setDefaultTimeout(){},close:async()=>{closed++}})};
 const cohort=select(board),rec=[];
 const result=await executeArm({context,cohort,workers:2,alive:()=>true,current:()=>clock+=100,
 probe:async (page,item)=>{rec.push([page.id,item.player]);return {authenticated:true,complete:true,fields:3,fieldShape,navMs:5,readMs:3,bytes:40}}});
 assert.equal(count,2);assert.equal(closed,2);assert.deepEqual(rec.map(x=>x[0]),[1,2,1,2]);
 assert.deepEqual(rec.map(x=>x[1]),cohort.map(x=>x.player));assert.equal(result.navigationAggregateMs,20);
});
test('explains dropped duplicates and equal-count replacements without publishing field labels',()=>{
 const counter=(...metrics)=>fieldShapes(metrics.map(([origin,metric,tab])=>({origin,metric,tab})));
 const ref=counter(['profile','Sample A','Player Stats'],['profile','Sample A','Player Stats'],['profile','Sample B','Defense'],['line_movement','Clock']);
 const candidate=counter(['profile','Sample A','Player Stats'],['profile','Sample C','Defense'],['line_movement','Clock']);
 const reverse=counter(['profile','Sample A','Player Stats'],['profile','Sample A','Player Stats'],['profile','Sample A','Player Stats'],['line_movement','Quote']);
 const field=(shapesByGroup,fields,shape=fieldShape)=>({authenticated:true,complete:true,fields,fieldShape:shape,shapesByGroup});
 const arms=ORDER.map((workers,i)=>({workers,cohortDigest:digest,wallMs:100,
  profileResults:Array.from({length:4},()=>field(ref,4))}));
 arms[1].profileResults[0]=field(candidate,3,'c'.repeat(64));
 arms[1].profileResults[1]=field(reverse,4,'d'.repeat(64));
 const result=compare(arms,digest),[change,unchanged]=result.shapeDiagnostics;
 assert.equal(result.status,'field_parity_not_met');
 assert.equal(change.ordinal,2);assert.equal(change.workers,2);assert.equal(change.counts.mismatchedReads,2);
 assert.deepEqual(change.counts.byGroup.player_stats,{missing:1,extra:1});
 assert.deepEqual(change.counts.byGroup.defense,{missing:2,extra:1});
 assert.deepEqual(change.counts.byGroup.line_movement,{missing:1,extra:1});
 assert.deepEqual(change.counts.byGroup.other_profile,{missing:0,extra:0});
 assert.equal(unchanged.counts.mismatchedReads,0);
 assert.doesNotMatch(JSON.stringify([result,publicArm(arms[1])]),/Sample [ABC]|Clock|Quote|shapesByGroup/);
 assert.ok(arms[1].profileResults[0].shapesByGroup);
 delete arms[2].profileResults[0].shapesByGroup;
 assert.equal(compare(arms,digest).shapeDiagnostics[1].counts,null);
});
