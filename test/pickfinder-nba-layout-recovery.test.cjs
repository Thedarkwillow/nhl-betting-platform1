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


test('full-game NBA TO resolves to independent turnovers without consuming a period column', () => {
  const audit = createLayoutAudit(clock);
  const scope = header.replace('Archive statistic number 0','TO')
    .replace('Archive statistic number 1','2Q TO');
  const row = {...field,scope:scope.slice(0,500)};
  const values=JSON.parse(row.value);
  values[8].value='3';
  values[9].value='1';
  row.value=JSON.stringify(values);
  const athlete={...make('Athlete'),market:'player_turnovers'};
  audit.gaps.push(audit.pin(athlete,row,'a'.repeat(64),58));
  for (const [player,digest] of [['A','b'],['B','c']]) {
    audit.observe(make(player),{...row,scope,headerLayout:'span-grid-v1'},digest.repeat(64),58);
  }
  const official=index.byPlayer.get(JSON.stringify(['nba','4']))[0];
  const source={...index,byPlayer:new Map([[JSON.stringify(['nba','4']),
    [{...official,stats:{turnovers:3}}]]])};
  assert.equal(audit.run(source).rows[0].value,3);
  assert.equal(audit.run(source).rows[0].retrospectiveOnly,true);
});

test('legacy fantasy rows need two exact bracketing book boards and a later singleton profile',()=>{
 const scope=header.replace('Archive statistic number 0','FP');
 const row={...field,scope:scope.slice(0,500)};
 const values=JSON.parse(row.value);values[8].value='31.60';row.value=JSON.stringify(values);
 const athlete={...make('Athlete'),book:'prizepicks',eventId:'ev1',market:'player_fantasy_score_all_',
  detailId:'/players/nba/athlete?prop=abc%3Aplayer_fantasy_score_all_%3Aev1%3A24'};
 const game=index.byPlayer.get(JSON.stringify(['nba','4']))[0];
 const exact={...index,byPlayer:new Map([[JSON.stringify(['nba','4']),[{...game,stats:{prizePicksFantasyScore:31.6}}]]])};
 const start='2026-11-25T23:59:00Z',end='2026-11-26T00:01:00Z';
 const audit=()=>{const a=createLayoutAudit(clock);a.gaps.push(a.pin(athlete,row,'a'.repeat(64),58));
  a.observe(make('A'),{...row,scope,headerLayout:'span-grid-v1'},'b'.repeat(64),58);
  a.observe(make('B'),{...row,scope,headerLayout:'span-grid-v1'},'c'.repeat(64),58);
  return a;};
 const board=(a,d,at,opts={})=>{
  const {line=24,book='prizepicks',sides=['Higher','Lower'],market=athlete.market}=opts;
  a.observeFormulaBoard({m:{sport:'nba',authenticated:true,book,firstObservedAt:at,lastObservedAt:at},first:at,
    digest:d.repeat(64),offers:sides.map(side=>({...athlete,book,market,line,side,observedAt:at}))});};
 const prepare=(a,opts)=>{board(a,'d',start);board(a,'e',end,opts);
  a.observeFormulaProfile({...athlete,books:['prizepicks']},'f'.repeat(64),end,end);return a;};
 const good=prepare(audit()).run(exact);
 assert.equal(good.summary.archivedFormulaBindings,1);
 assert.equal(good.rows[0].value,31.6);
 assert.equal(good.rows[0].archivedFormulaBinding.originalSettlementVerified,false);
 assert.equal(good.summary.qualifiedCacheChanged,false);
 assert.equal(prepare(audit(),{line:25}).run(exact).summary.archivedFormulaBindings,0);
 assert.equal(prepare(audit(),{sides:['Higher']}).run(exact).summary.archivedFormulaBindings,0);
 const mixed=prepare(audit());board(mixed,'9',end,{book:'underdog'});
 assert.equal(mixed.run(exact).summary.archivedFormulaBindings,0);
 const noDonor=audit();board(noDonor,'d',start);board(noDonor,'e',end);
 assert.equal(noDonor.run(exact).summary.archivedFormulaBindings,0);
 noDonor.observeFormulaProfile({...athlete,books:['prizepicks']},'f'.repeat(64),'2026-11-28T00:00:00Z','2026-11-28T00:00:00Z');
 assert.equal(noDonor.run(exact).summary.archivedFormulaBindings,0);
});
