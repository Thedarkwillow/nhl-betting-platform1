'use strict';

const test=require('node:test'),assert=require('node:assert/strict');
const {eligibleCurrent,committedForecasts,newRows,results,scoreboard}=require('../scripts/pickfinder-reviewed-history-forward.cjs');
const {policy}=require('../scripts/pickfinder-reviewed-history-model.cjs');
const forecastAt='2026-11-26T18:00:00Z',startAt='2026-11-26T20:00:00Z',post='2026-11-27T00:00:00Z';
const p={sport:'NHL',gameId:99,playerId:1,market:'shotsOnGoal',team:'ABC',opponent:'DEF',side:'Higher',line:2.5,
 startAt,forecastAt,sourceObservedAt:forecastAt,manifestDigest:'a'.repeat(64),modelRevision:'b'.repeat(40),
 researchOnly:true,modelApproved:false,originalPlatformVerified:false,
 reviewedHistoryPair:{policy,existing:.25,reviewed:.75,challenger:.5,neutral:.5,nativeMetric:'sog',reviewedObservations:5,reviewDigests:['c'.repeat(64)],modelApproved:false}};
const frame={first:'2026-11-26T18:01:00Z',digest:'d'.repeat(64),doc:{kind:'pickfinder_nhlnfl_reviewed_history_shadow_forecasts_v1',rows:[p]}};
test('public pregame arm requires fresh, committed and explicit offer evidence',()=>{
 const offer={sport:'nhl',book:'prizepicks',observedAt:forecastAt,startAt};
 const b={m:{sport:'nhl',book:'prizepicks'},digest:p.manifestDigest,first:forecastAt,offers:[offer]};
 assert.equal(eligibleCurrent({latest:[b]},forecastAt).length,1);
 assert.equal(eligibleCurrent({latest:[{...b,offers:[{...offer,startAt:null}]}]},forecastAt).length,0);
 assert.equal(eligibleCurrent({latest:[b]},'2026-11-26T18:06:00Z').length,0);
 assert.equal(newRows([p],new Map(),forecastAt).length,1);
 assert.equal(newRows([p],new Map(),post).length,0);
 assert.equal(newRows([p],committedForecasts([frame],post),forecastAt).length,0);
 assert.equal(committedForecasts([{...frame,first:'2026-11-26T19:50:00Z'}],post).size,0);
});
test('independent grading matches final native identity and exact start time',()=>{
 const f=committedForecasts([frame],post);
 const final={event:'99',team:'ABC',opp:'DEF',start:startAt,first:'2026-11-26T23:00:00Z',digest:'e'.repeat(64),stats:{sog:3}};
 const native=x=>({byPlayer:new Map([['["nhl","1"]',[x]]])});
 assert.deepEqual(results(f,native({...final,opp:'GHI'}),post),[]);
 assert.deepEqual(results(f,native({...final,start:forecastAt}),post),[]);
 assert.deepEqual(results(f,native(final),startAt),[]);
 const grades=results(f,native(final),post);
 assert.equal(grades.length,1);assert.equal(grades[0].actual,3);assert.equal(grades[0].officialFinalDigest,final.digest);
 const score=scoreboard(f,grades).NHL.shotsOnGoal;
 assert.equal(score.graded,1);assert.equal(score.distinctGames,1);
 assert.equal(score.scores.existing.brier,.5625);assert.equal(score.scores.reviewed.brier,.0625);
 assert.equal(score.scores.challenger.brier,.25);assert.equal(score.scores.neutral.brier,.25);
 assert.equal(score.gameEqualChallengerComparison.delta.brier,-.3125);
 assert.equal(score.gameEqualChallengerComparison.uncertainty.brier,null);
});
