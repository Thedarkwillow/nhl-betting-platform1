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
test('prospective feature arms require pregame committed history, cannot use retrospective receipts, and retain source digests',()=>{
 const archiveDigest='a'.repeat(64), asOf=now-3600000;
 const p=forecast({...input,asOf});
 assert.equal(p,null);
 const committed=playerRows.map(r=>({...r,knownAt:r.start+12*3600000,archiveDigest}));
 const late={...committed[0],knownAt:asOf+1};
 const q=forecast({...input,asOf,playerRows:[late,...committed.slice(1)]});
 assert.equal(q.priorGames,14);
 assert.deepEqual(q.sourceDigests,[archiveDigest]);
 assert.ok(Date.parse(q.latestArchiveKnownAt)<asOf);
 assert.equal(forecast({...input,playerRows:committed,asOf:now-900000}),null);
});
test('prospective report keeps ungraded and failed validation pairs out of performance',()=>{
 const {scores}=require('../scripts/native-context-prospective-pairs.cjs');
 const p={...forecast(input),sourceDigests:['a'.repeat(64)],latestArchiveKnownAt:'2026-11-19T00:00Z'};
 assert.equal(scores([{gameId:'1',result:'pending',nativeContextPair:p}]).workload.decisions,0);
 const a=scores([{gameId:'1',result:'correct',nativeContextPair:p},{gameId:'2',result:'incorrect',nativeContextPair:{...p,modelApproved:true}}]);
 assert.equal(a.workload.decisions,1);
 assert.equal(a.workload.scores.neutral.brier,.25);
 assert.equal(a.workload.gameEqualComparison.distinctGames,1);
 assert.equal(a.workload.gameEqualComparison.candidate.brier,a.workload.scores.candidate.brier);
});
test('website distinguishes verified prospective NBA and NHL/NFL feeds from retrospective and future reports',()=>{
 const {prospectiveRows}=require('../assets/native-context-performance.js'),score={brier:.25,logLoss:.6931};
 const item={approved:false,nativeContextFeatureComparison:{workload:{decisions:1,distinctGames:1,
  scores:{candidate:score,incumbent:score,priorEmpirical:score,neutral:score}}}};
 const nba={schema:'pickfinder_public_research_health_v1',modelApproved:false,paidRequests:0,
  generatedAt:'2026-11-20T20:00Z',prospectiveComparisons:{points:item}};
 const live={...nba,prospectiveComparisonEvidence:'first_git_forecast_and_official_grade_v1'};
 assert.equal(prospectiveRows('NBA',nba,now),null);
 assert.equal(prospectiveRows('NBA',live,now)[0].events,1);
 const {compareByGame}=require('../scripts/prospective-game-comparison.cjs');
 assert.equal(prospectiveRows('NBA',live,now)[0].gameEqual,'Unavailable');
 item.nativeContextFeatureComparison.workload.gameEqualComparison=compareByGame([{gameId:1,candidate:.75,benchmark:.5,outcome:1}]);
 assert.equal(prospectiveRows('NBA',live,now)[0].gameEqual,'-0.1875 / -0.4055 · Brier interval withheld');
 assert.equal(prospectiveRows('NBA',{...live,generatedAt:'2026-11-21T20:00Z'},now),null);
 const nhl={kind:'pickfinder_nhlnfl_reviewed_history_performance_v1',modelApproved:false,paidRequests:0,
  generatedAt:nba.generatedAt,retrospective:false,productionChanged:false,bySport:{NHL:{shotsOnGoal:item}}};
 assert.equal(prospectiveRows('NHL',nhl,now)[0].market,'Shots on goal');
 assert.deepEqual(prospectiveRows('NFL',nhl,now),[]);
 assert.equal(prospectiveRows('NHL',{...nhl,retrospective:true},now),null);
});

test('game-equal comparisons prevent crowded games from controlling a paired estimate',()=>{
 const {compareByGame}=require('../scripts/prospective-game-comparison.cjs');
 const hit={gameId:1,candidate:1,benchmark:.5,outcome:1},miss={gameId:2,candidate:0,benchmark:.5,outcome:1};
 const many=compareByGame([hit,...Array(8).fill({...hit,gameId:'1'}),miss]);
 const one=compareByGame([hit,miss]);
 assert.equal(many.decisionCount,10);
 assert.equal(many.distinctGames,2);
 assert.equal(many.delta.brier,.25);
 assert.deepEqual(many.delta,one.delta);
 assert.deepEqual(many.candidate,one.candidate);
 assert.equal(many.hitRate,1);
 assert.equal(many.uncertainty.brier,null);
 assert.equal(many.uncertainty.logLoss,null);
 assert.equal(many.productionApproved,false);
 assert.equal(compareByGame([{...hit,gameId:undefined},{...hit,benchmark:2},{...hit,outcome:'1'}]).candidate.brier,null);
});

test('descriptive uncertainty requires thirty distinct games rather than thirty offers',()=>{
 const {compareByGame}=require('../scripts/prospective-game-comparison.cjs');
 const rows=Array.from({length:30},(_,i)=>({gameId:i+1,candidate:i%2?.9:.8,benchmark:.5,outcome:1}));
 assert.equal(compareByGame(Array(40).fill(rows[0])).uncertainty.brier,null);
 const v=compareByGame(rows);
 assert.equal(v.distinctGames,30);
 assert.ok(v.uncertainty.brier[0]<v.delta.brier);
 assert.ok(v.delta.brier<v.uncertainty.brier[1]);
 assert.ok(v.uncertainty.logLoss[1]<0);
});
