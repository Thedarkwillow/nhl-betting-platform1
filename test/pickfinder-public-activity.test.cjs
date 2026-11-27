'use strict';
const t=require('node:test'),a=require('node:assert/strict'),{build}=require('../scripts/pickfinder-public-activity.cjs');
const now='2026-11-25T18:00:00Z',d='a'.repeat(64),o={sport:'nba',book:'prizepicks',observedAt:'2026-11-25T17:55:00Z',startAt:'2026-11-26T00:00:00Z',detailId:'/players/nba/a?prop=x',eventId:'1',player:'Fixture',line:5,side:'Higher'};
const board={digest:d,first:'2026-11-25T17:56:00Z',m:{sport:'nba',book:'prizepicks',lastObservedAt:o.observedAt,boardState:'populated',pageTraversalComplete:true,lastPageReached:true,authenticated:true,health:{reasons:[],repeatOrUnresolvedLinks:0,unresolvedRows:0,wrongSport:0,priceConflictKeys:0},slot:'manual'},offers:[o]};
t('fresh board evidence is not a native alert or qualified prediction',()=>{const x=build({manifests:[board,board],invalid:[]},now);a.equal(x.events.length,1);a.equal(x.events[0].nativeNotificationVerified,false);a.equal(x.readiness['nba/prizepicks'].freshClockScopedOffers,1);a.equal(x.delivery.discord,'not_measured_by_board_report');a.equal(x.modelApproved,false);});
t('stale partial or invalid observations never qualify',()=>{for(const b of [{...board,m:{...board.m,pageTraversalComplete:false}},{...board,m:{...board.m,lastObservedAt:'2026-11-25T15:00:00Z'}},{...board,offers:[{...o,startAt:null}]}])a.equal(build({manifests:[b],invalid:[]},now).readiness['nba/prizepicks'].freshClockScopedOffers,0);const x=build({manifests:[board],invalid:['bad']},now);a.equal(x.events.length,0);a.equal(x.readiness['nba/prizepicks'].reason,'invalid_archive');});
t('no future archive or event clock confusion',()=>{const x=build({manifests:[{...board,first:'2026-11-25T18:01:00Z'}],invalid:[]},now);a.equal(x.events.length,0);});
t('streamed board summary preserves current and historical counts and fail-closed readiness',()=>{
 const {summarizeBoard}=require('../scripts/pickfinder-public-activity.cjs');
 const dated=[board,{...board,digest:'b'.repeat(64),m:{...board.m,lastObservedAt:'2026-11-25T16:00:00Z'},offers:[{...o,startAt:null},o]},
  {...board,digest:'c'.repeat(64),m:{...board.m,lastObservedAt:'2026-11-25T18:01:00Z'},first:'2026-11-25T18:01:00Z'}];
 const counts=dated.map(b=>summarizeBoard(b,now));
 a.ok(counts.every(b=>!Object.hasOwn(b,'offers')));
 for(const invalid of [[],['bad']])a.deepEqual(build({manifests:counts,invalid},now),build({manifests:dated,invalid},now));
});

t('all registered scopes are visible without treating unsafe traversals as complete',()=>{
 for(const patch of [{repeatOrUnresolvedLinks:1},{unresolvedRows:1},{reasons:['possible_display_cap_requires_partition_reconciliation']},{repeatOrUnresolvedLinks:undefined}]){
  const b={...board,m:{...board.m,health:{...board.m.health,...patch}}};
  const x=build({manifests:[b],invalid:[]},now),r=x.readiness['nba/prizepicks'];
  a.equal(Object.keys(x.readiness).length,28);
  a.equal(x.readiness['tennis/underdog'].reason,'no_observation');
  a.equal(r.freshTraversal,true);
  a.equal(r.freshCompleteBoard,false);
  a.equal(r.freshClockScopedOffers,0);
  a.equal(r.observedOffers,1);
  a.equal(r.originalBoardCompletenessVerified,false);
  a.deepEqual(x,build({manifests:[require('../scripts/pickfinder-public-activity.cjs').summarizeBoard(b,now)],invalid:[]},now));
 }
});
