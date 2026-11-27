'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {sourceUrl,sections,calculate}=require('../scripts/nba-official-gamebook-periods.cjs');
const {collect}=require('../scripts/pickfinder-nba-period-archive-replay.cjs');
const date='2026-10-20',clock='2026-11-27T06:00:00Z';
const stat={points:19,rebounds:8,assists:6,steals:0,blocks:0,turnovers:0,threePointersMade:3};
const box=(title,minutes,awayNums)=>{
 const [fg,three,reb,ast,pts]=awayNums;
 const data=[fg,fg,three,three,0,0,0,reb,reb,ast,0,0,0,0,0,pts];
 const out=(side,visitor)=>[side,'POS MIN FG FGA 3P 3PA FT FTA OR DR TOT A PF ST TO BS +/- PTS',
   ...Array.from({length:5},(_,i)=>[i+1,visitor&&i===0?'Player One':side+' Name '+i,minutes+':00',...(i===0&&visitor?data:data.map(()=>0))].join(' ')),
   [5*minutes+':00',...(visitor?data:data.map(()=>0))].join(' ')];
 return ["NATIONAL BASKETBALL ASSOCIATION OFFICIAL SCORER'S REPORT",title,'Tuesday, October 20, 2026 Arena',...out('VISITOR: ABC',true),...out('HOME: XYZ',false)].join('\n');
};
const whole=box('FINAL BOX',48,[8,3,8,6,19]),q1=box('1st QUARTER ONLY',12,[1,1,2,0,3]),q2=box('2nd QUARTER ONLY',12,[3,0,1,0,6]),half=box('FIRST HALF',24,[4,1,3,0,9]);
const joined=[whole,q1,q2,half].join('\f');
const player={...stat,player:'Player One',home:false,appeared:true};

test('official scorer report binds exact quarter rows and derives first-half PRA',()=>{
 assert.equal(sourceUrl(date,'PHI','NYK'),'https://statsdmz.nba.com/pdfs/20261020/20261020_PHINYK_book.pdf');
 assert.equal(sourceUrl('2026-02-30','PHI','NYK'),null);
 const values=sections(joined,date);
 assert.equal(calculate(values,player,'1st_quarter_player_points').nativeValue,3);
 const result=calculate(values,player,'1st_half_player_points_+_rebounds_+_assists');
 assert.equal(result.nativeValue,12);
 assert.deepEqual(result.periods,['q1','q2']);
 assert.equal(result.originalSourceDisplayVerified,false);
 assert.equal(result.originalPlatformSettlementVerified,false);
 assert.equal(calculate(values,player,'1st_half_player_fantasy_score_all_'),null);
 assert.equal(calculate(values,{...player,points:18},'1st_half_player_points'),null);
 assert.equal(calculate(values,{...player,home:true},'1st_half_player_points'),null);
});

test('rejects mislabeled, incomplete, wrong date and conflicting official boxes',()=>{
 assert.equal(sections([whole,q2].join('\f'),date),null);
 assert.equal(sections(joined.replace('1st QUARTER ONLY','FIRST HALF'),date),null);
 assert.equal(sections(joined,'2026-10-21'),null);
 assert.equal(sections(joined+'\f'+box('2nd QUARTER ONLY',12,[3,0,0,0,6]),date),null);
 assert.equal(sections([whole,q1,q2,whole].join('\f'),date).q1.away.total.points,3);
 assert.equal(sections([whole,q1,q2,box('FIRST HALF',24,[5,1,3,0,11])].join('\f'),date),null);
});

test('archive targeting requires exact side, opponent badge, chronology and one final fact',()=>{
 const make=(k,p=player)=>({digest:k.repeat(64),first:'2026-11-26T01:00:00Z',doc:{gameId:22600002,
  officialFinalClockVerified:true,rows:[{...p,gameId:22600002,playerId:10,gameDate:date,team:'PHI',opponent:'NYK',identityVerified:true,officialGameFinalVerified:true}]}});
 const r={sport:'nba',market:'1st_half_player_points',player:player.player,period:'1st_half'};
 const field=(enemy,badge='NYK')=>({period:'1st_half',value:JSON.stringify([{value:'10/20'},{value:enemy,labels:[badge]}]),observedAt:'2026-11-25T00:00:00Z'});
 const x=collect([{record:r,field:field('@NYK')},{record:r,field:field('NYK')},{record:r,field:field('@NYK','LAL')}],[make('a')],clock);
 assert.equal(x.tally.legacyPeriodRows,3);
 assert.equal([...x.targets.values()][0].observations,1);
 assert.equal(x.tally.noOfficialGameRows,1);
 const conflict=collect([{record:r,field:field('@NYK')}],[make('a'),make('b',{...player,points:18})],clock);
 assert.equal(conflict.targets.size,0);
 assert.equal(conflict.tally.ambiguousOfficialGameRows,1);
});
