'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const {recover}=require('../scripts/pickfinder-clock-reconciliation.cjs');
const {clockAt,ZONES}=require('../scripts/pickfinder-controlled-clock.cjs');
const startAt='2026-11-26T01:00:00Z',observedAt='2026-11-25T20:00:00Z';
const base={sport:'nba',eventId:'e',player:'Fixture',playerPath:'/players/nba/a',detailId:'/players/nba/a?prop=x%3Apoints%3Ae%3A5',team:'BOS',opponent:'NYK',routeVerified:true,playerLabelVerified:true,observedAt,displayedClocks:[],startAt:null};
const scope={sport:'NBA',name:'Fixture',team:'BOS',opponent:'NYK',homeAway:'away',gameId:'g',playerId:'p',startAt,firstGitAt:observedAt,receiptDigest:'a'.repeat(64),identityReviewed:true,eventReviewed:true,rosterReviewed:true,evidenceKind:'automated_native_schedule_roster_only'};
const sample=ZONES.map(z=>({...base,requestedZone:z,browserClock:{zone:z},localMatchup:{...clockAt(startAt,z),homeAway:'away'}}));
const record={...base,browserClock:{zone:'America/Los_Angeles'},displayedEvidence:[{label:'Matchup',value:'BOS @ NYK • Wed @ 5:00PM'}]};
const ctx={preparedAt:'2026-11-25T22:00:00Z',identityScopes:[scope]};
const docs=[{schema:'pickfinder-controlled-clock-v1',records:sample},{schema:'pickfinder-public-nba-context-v1',records:[record]}];
test('corroborates exact sample and archived local clock without approving forecast',()=>{const r=recover(ctx,docs);a.equal(r.summary.sample.nba.matched,1);a.equal(r.rows.length,1);a.equal(r.rows[0].clockCorroborated,true);a.equal(r.rows[0].modelApproved,false);a.equal(r.rows[0].sourceClockVerified,false);});
test('rejects ambiguous schedule, missing zone and unsampled events',()=>{a.equal(recover({...ctx,identityScopes:[scope,{...scope,gameId:'other'}]},docs).rows.length,0);a.equal(recover(ctx,[docs[0],{...docs[1],records:[{...record,browserClock:null},{...record,eventId:'other'}]}]).rows.length,0);});
test('rejects conflicting sample or archived time',()=>{a.equal(recover(ctx,[{...docs[0],records:sample.map((r,i)=>i? r:{...r,localMatchup:{...r.localMatchup,hour:2}})},docs[1]]).rows.length,0);a.equal(recover(ctx,[docs[0],{...docs[1],records:[{...record,displayedEvidence:[{label:'Matchup',value:'BOS @ NYK • Wed @ 6:00PM'}]}]}]).rows.length,0);});

test('archived profile header reuses verified event clock proof, not a standalone browser timezone',()=>{
 const {profileContexts}=require('../scripts/pickfinder-clock-reconciliation.cjs');
 const digest='b'.repeat(64),first='2026-11-25T21:00:00Z';
 const profile={...base,market:'points',independentReconciliationContext:{
  observedAt,team:'BOS',opponent:'NYK',browserClock:{zone:'America/Los_Angeles',offsetMinutes:-480},
  providerDisplayZoneVerified:false,displayedMatchupLabel:record.displayedEvidence[0].value,
  displayedLocalMatchup:{team:'BOS',opponent:'NYK',homeAway:'away',...clockAt(startAt,'America/Los_Angeles')}}};
 const immutable={doc:{schema:'pickfinder-public-profiles-v1',records:[profile]},first,digest};
 const archived=profileContexts([immutable],ctx.preparedAt);
 a.equal(archived.records.length,1);
 a.equal(recover(ctx,[archived]).rows.length,0);
 const rows=recover(ctx,[docs[0],archived]).rows;
 a.equal(rows.length,1);a.equal(rows[0].sourceProfileDigest,digest);a.equal(rows[0].sourceDetailId,base.detailId);
 a.equal(rows[0].sourceClockVerified,false);a.equal(rows[0].modelApproved,false);
 a.equal(profileContexts([{...immutable,first:'2026-11-25T23:00:00Z'}],ctx.preparedAt).records.length,0);
});

test('known source-specific team codes join the same independently verified team without cross-sport alias guesses',()=>{
 const {nativeMatches}=require('../scripts/pickfinder-clock-reconciliation.cjs');
 const x={...scope,team:'DEN',opponent:'UTAH'};
 const y={...sample[0],team:'DEN',opponent:'UTA'};
 a.equal(nativeMatches(y,[x],Date.parse(ctx.preparedAt)).length,1);
 a.equal(nativeMatches({...y,sport:'nhl'},[{...x,sport:'NHL'}],Date.parse(ctx.preparedAt)).length,0);
 a.equal(nativeMatches({...y,opponent:'PHX'},[x],Date.parse(ctx.preparedAt)).length,0);
});
