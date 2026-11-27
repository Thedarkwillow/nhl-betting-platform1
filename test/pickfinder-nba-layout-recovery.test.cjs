'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {createLayoutAudit} = require('../scripts/pickfinder-nba-layout-recovery.cjs');
const {VERSION} = require('../scripts/pickfinder-research-coverage.cjs');
const clock = '2026-11-27T00:00:00Z', observedAt = '2026-11-26T00:00:00Z';
const header = ['Date', 'Opponent', 'Min', 'Pts', 'Rebs', 'O-Reb', 'D-Reb', 'Asts',
  ...Array.from({length:50}, (_, i) => 'Archive statistic number ' + i)].join(' | ');
const make = player => ({sport:'nba', player, market:'player_points', status:'sampled',
  truncated:false, coverageVersion:VERSION, detailId:'/players/nba/player?prop=test'});
const field = {origin:'profile', tab:'Player overview', metric:'row 1', observedAt,
  scope:header.slice(0,500), value:JSON.stringify(['11/25','@BOS','20','12',
    ...Array(54).fill('0')].map(value=>({value})))};
const index = {names:new Map([[JSON.stringify(['nba','athlete']),new Set(['4'])]]),
  byPlayer:new Map([[JSON.stringify(['nba','4']),[{event:'2',gameDate:'2026-11-25',
    dates:['2026-11-25'],opp:'BOS',stats:{points:12},digest:'d'.repeat(64)}]]])};

test('only the exact unique archived layout with multiple donors recovers retrospective cells', () => {
  const audit = createLayoutAudit(clock);
  const full = {...field,scope:header,headerLayout:'span-grid-v1'};
  audit.gaps.push(audit.pin(make('Athlete'),field,'a'.repeat(64),58));
  audit.observe(make('A'),full,'b'.repeat(64),58);
  audit.observe(make('B'),{...full,observedAt:'2026-11-28T00:00:00Z'},'c'.repeat(64),58);
  assert.equal(audit.run(index).summary.reconstructedHeaders,0);
  audit.observe(make('B'),full,'c'.repeat(64),58);
  const replay = audit.run(index);
  assert.equal(replay.summary.reconstructedHeaders,1);
  assert.equal(replay.summary.independentlyMatched,1);
  assert.equal(replay.rows[0].nativeEventId,'2');
  assert.equal(replay.rows[0].sourceDigest,'a'.repeat(64));
  assert.equal(replay.rows[0].retrospectiveOnly,true);
  assert.equal(replay.summary.qualifiedCacheChanged,false);
  audit.observe(make('A'),{...full,scope:header+' alternate'},'b'.repeat(64),58);
  assert.equal(audit.run(index).summary.reconstructedHeaders,0);
});
