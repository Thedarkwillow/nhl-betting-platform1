'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {audit}=require('../scripts/pickfinder-archive-comparison-history.cjs');
const row=(book,time,extra={})=>({sport:'nba',detailId:'/players/nba/fixture?prop=x:points:e:2.5',player:'Fixture Player',eventId:'e',market:'points',observedAt:time,apps:[{book,line:2.5,side:'Higher',displayedPrice:'-110'}],...extra});
const batch=(book,rows)=>({book,sport:'nba',pages:[{rows}]});
test('exact scope and clock comparison is not independent offer or identity verification',()=>{
 const a=row('prizepicks','2026-11-25T10:00:00Z'),b=row('underdog','2026-11-25T10:03:00Z');
 const x=audit([batch('prizepicks',[a]),batch('underdog',[b])],[{player:'Fixture Player',playerId:123}]);
 assert.equal(x.sports.nba.crossBookWithinFiveMinutes,1);assert.equal(x.sports.nba.uniqueHistoricalNameCandidate,1);assert.equal(x.authoritativePlayerLinks,0);assert.equal(x.originalPlatformVerified,0);
 const y=audit([batch('prizepicks',[a]),batch('underdog',[{...b,observedAt:'2026-11-25T11:00:00Z'}])],[{player:'Fixture Player',playerId:1},{player:'Fixture Player',playerId:2}]);
 assert.equal(y.sports.nba.crossBookClockGap,1);assert.equal(y.sports.nba.ambiguousHistoricalName,1);
});
test('different tier, period and line cannot be matched',()=>{
 const a=row('prizepicks','2026-11-25T10:00:00Z'),b=row('underdog','2026-11-25T10:03:00Z',{period:'1st_half'});
 const x=audit([batch('prizepicks',[a]),batch('underdog',[b])]);
 assert.equal(x.sports.nba.crossBookExactScope,undefined);
});
