'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {forecast,priorOf}=require('../src/native-workload-matchup-challenger.cjs');
const {statRows,evaluate}=require('../scripts/report-native-workload-matchup.cjs');
const day=86400000,now=Date.parse('2026-11-20T23:00Z');
const target={id:'one',team:'NYK',opponent:'BOS',sport:'NBA',event:'next',start:now};
const row=(i,opponent='BOS')=>({id:'one',team:'NYK',opponent,sport:'NBA',event:'g'+i,start:now-(i+2)*day,
 exposure:i<7?30:25,values:{points:i<7?22:12}});
const playerRows=Array.from({length:15},(_,i)=>row(i,i<5?'BOS':'SEA'));
const leagueSides=Array.from({length:48},(_,i)=>({...row(i,i<6?'BOS':'SEA'),team:'CLE',start:now-(i%30+2)*day,values:{points:i<6?16:20}}));
const input={target,metric:'points',line:17.5,incumbentHigher:.67,playerRows,leagueSides};
test('fixed historical feature arms compare against identical incumbent and never consult target stats',()=>{
 const p=forecast(input);
 assert.equal(p.priorGames,15);
 assert.equal(p.matchupGames,5);
 assert.equal(p.defensiveGames,6);
 assert.equal(p.modelApproved,false);
 for(const k of ['workload','defense','workloadDefense','matchup','priorEmpirical'])assert.equal(typeof p[k],'number');
 assert.deepEqual(forecast({...input,target:{...target,values:{points:9999},exposure:99}}),p);
});
test('same event, future and insufficiently separated rows cannot change the NBA challenger',()=>{
 const original=forecast(input);
 const extra=[{...row(1),event:target.event},{...row(1),start:now+2000},{...row(1),start:now-day+1000}];
 extra.forEach(r=>{r.values={points:1000};});
 assert.deepEqual(forecast({...input,playerRows:[...playerRows,...extra],leagueSides:[...leagueSides,...extra]}),original);
 assert.equal(forecast({...input,playerRows:[...playerRows,playerRows[2]]}),null);
});
test('NFL previous-week and 48h rules both apply, including dates crossing seasons',()=>{
 const t={...target,sport:'NFL',season:2026,week:1};
 const r=(event,season,week,time)=>({...t,event,season,week,start:now-time*day});
 assert.deepEqual(priorOf([r('first',2025,18,7),r('same',2026,1,3),r('close',2025,18,1),r('future',2026,2,4)],t).map(x=>x.event),['first']);
});
test('no eligible independent baseline appears as null coverage, never a baseline win',()=>{
 const empty=statRows('NBA',[{kind:'nba_official_web_final_history_v1',source:'unknown'}]);
 assert.equal(empty.gameCount,0);
 assert.deepEqual(evaluate(empty,'NBA').comparison.points.workload,{decisions:0,distinctEvents:0,distinctDates:0,scores:null});
});
test('website includes validated aggregate comparisons but cannot relabel a promoted or prospective result',()=>{
 const {rows}=require('../assets/native-context-performance.js');
 const score={brier:.25,logLoss:.6931};
 const report={kind:'native_workload_matchup_research_v1',retrospective:true,prospective:false,untouchedHoldout:false,modelPromoted:false,
  rawRowsPublished:0,originalOffersVerified:0,thresholds:'synthetic_incumbent_projection_floor_plus_half',bySport:{NFL:{comparison:{receptions:{
   workload:{decisions:4,distinctEvents:3,scores:{candidate:score,incumbent:score,priorEmpirical:score,neutral:score}},
   defense:{decisions:0,distinctEvents:0,scores:null}}}}}};
 assert.equal(rows(report)[0].events,3);
 assert.equal(rows(report).length,1);
 assert.equal(rows({...report,prospective:true}),null);
 assert.equal(rows({...report,modelPromoted:true}),null);
});
