'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {chronologicalAblation}=require('../scripts/pickfinder-nba-matchup-retrospective.cjs');

function row(event,gameStartAt,market='points',extras={}){
 return {event,gameStartAt,market,l10:.6,outcome:1,higher:0,historicalGames:4,...extras};
}
test('matchup ablation splits entire Pacific dates and scores both arms on identical rows',()=>{
 const first=row(1,'2026-11-22T23:00:00Z');
 const second=row(2,'2026-11-24T00:00:00Z');
 const third=row(3,'2026-11-25T00:00:00Z');
 const later=row(4,'2026-11-26T04:00:00Z','rebounds');
 const earlierOnSamePacificDate=row(5,'2026-11-25T23:00:00Z','points');
 const crowded={...later,outcome:0};
 const report=chronologicalAblation([later,third,crowded,first,earlierOnSamePacificDate,second]);
 assert.equal(report.laterStartsAtPacificDate,'2026-11-24');
 assert.deepEqual(report.cohorts.earlier.slates,['2026-11-22','2026-11-23']);
 assert.deepEqual(report.cohorts.later.slates,['2026-11-24','2026-11-25']);
 assert.equal(report.fitObservations,0);
 assert.equal(report.untouchedHoldout,false);
 const comparison=report.cohorts.later.matchupIncrementAfterShrinkage;
 assert.equal(comparison.decisionCount,4);
 assert.equal(comparison.distinctGames,3);
 // Game 4 averages a hit and miss, games 3 and 5 are hits. Each contributes equally.
 assert.equal(comparison.hitRate,2.5/3);
 assert.equal(comparison.candidate.meanProbability,.5);
 assert.ok(Math.abs(comparison.benchmark.meanProbability-.55)<1e-12);
 assert.equal(comparison.uncertainty.brier,null);
 assert.deepEqual(Object.keys(report.laterByMarket),['points','rebounds']);
 assert.equal(report.laterByMarket.rebounds.distinctGames,1);
});

test('fewer than three distinct dates produces no chronological split',()=>{
 const report=chronologicalAblation([row(1,'2026-11-22T23:00:00Z'),row(2,'2026-11-23T22:00:00Z')]);
 assert.equal(report.laterStartsAtPacificDate,null);
 assert.equal(report.cohorts.all.l10Shrinkage.decisionCount,2);
 assert.equal(report.cohorts.later.l10Shrinkage.decisionCount,0);
 assert.equal(report.cohorts.earlier.l10Shrinkage.decisionCount,0);
 assert.deepEqual(report.laterByMarket,{});
});
