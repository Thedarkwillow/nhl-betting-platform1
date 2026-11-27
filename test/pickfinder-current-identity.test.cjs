'use strict';
const a=require('node:assert/strict'),test=require('node:test');
const {build,captureProfileContext}=require('../scripts/pickfinder-current-identity.cjs');
const at='2026-11-27T07:20:00Z',nativeAt='2026-11-27T06:50:00Z',startAt='2026-11-27T22:00:00Z';
const dig='a'.repeat(64),rosterProof='b'.repeat(64),r={sport:'nhl',player:'A Example',market:'shots',eventId:'pf1',
 detailId:'/players/nhl/p?prop=q:shots:pf1:1.5',key:'scope',currentProfileAttemptedAt:at,research:[{}],
 independentReconciliationContext:{team:'BOS',opponent:'MTL',gameDateUtc:'2026-11-27'}};
const facts={digest:dig,first:nativeAt,doc:{sport:'nhl',source:'nhl:official',observedAt:nativeAt,
 events:[{sport:'nhl',namespace:'nhl:official',eventId:'game',startAt,teams:[{id:'BOS',abbr:'BOS'},{id:'MTL',abbr:'MTL'}]}],
 roster:[{teamId:'BOS',playerId:'1',name:'André Example',aliases:['A. Example']},{teamId:'MTL',playerId:'2',name:'A. Example'}],
 proofs:[{digest:dig,url:'https://api-web.nhle.com/v1/schedule/date',observedAt:nativeAt},
 {digest:rosterProof,url:'https://api-web.nhle.com/v1/roster/BOS/season',observedAt:nativeAt,teamId:'BOS'}]}};
function result(record=r,archives=[facts]){return build([{record,digest:dig}],archives,[],
 {directories:[{playerSlugs:['first']}]},{sources:[{tables:[{rows:[[]]}]}]},{clock:at,revision:'f'.repeat(40)});}
test('name or alias plus source team, opponent and date resolves an exact native player and scheduled time without operator IDs',()=>{
 const x=result(),row=x.rows[0];a.equal(row.status,'confirmed');a.equal(row.match.playerId,'1');a.equal(row.match.startAt,startAt);
 a.equal(x.registry.length,1);a.equal(row.operatorOfferVerified,false);a.equal(row.settlementVerified,false);a.equal(row.statisticalModelEligible,false);
 a.equal(x.discovery.directoryLinks,1);a.equal(x.discovery.referenceRows,1);
 for(const extra of [{gameDateUtc:'2026-11-28'},{opponent:'OTT'}])a.notEqual(result({...r,independentReconciliationContext:{...r.independentReconciliationContext,...extra}}).rows[0].status,'confirmed');
});
test('duplicate names or doubleheaders on the same team and date remain ambiguous',()=>{
 const d=structuredClone(facts);d.doc.roster.push({teamId:'BOS',name:'A Example',playerId:'3'});
 a.equal(result(r,[d]).rows[0].status,'needs_review');
 const e=structuredClone(facts);e.doc.events.push({...e.doc.events[0],eventId:'game2',startAt:'2026-11-27T23:30:00Z'});
 a.equal(result(r,[e]).rows[0].status,'needs_review');
});
test('newer dated evidence removes a departed player and later evidence is not backdated',()=>{
 const d=structuredClone(facts);d.first=d.doc.observedAt='2026-11-27T07:10:00Z';
 d.doc.proofs.forEach(x=>x.observedAt=d.first);
 d.doc.roster=[{teamId:'BOS',name:'Other Player',playerId:'4'}];
 a.equal(result(r,[facts,d]).rows[0].status,'native_event_or_roster_missing');
 a.equal(result(r,[{...facts,first:'2026-11-28T00:00:00Z'}]).registry.length,0);
});
test('source clock conflicts are never masked by a valid label',()=>{
 const context=captureProfileContext(r,{routeVerified:true,playerLabelVerified:true,entries:[
  {label:'Team',value:'BOS'},{label:'Opponent',value:'MTL'}],clocks:[{value:startAt},{value:'2026-11-27T23:00:00Z'}]},at);
 a.equal(context.conflictingClock,true);
 a.equal(result({...r,independentReconciliationContext:context}).rows[0].status,'needs_review');
});
test('verified official game stats need native appearance and result, not a book offer ID',()=>{
 const {verifiedStats}=require('../scripts/pickfinder-current-identity.cjs');
 const match={namespace:'nba:official',playerId:'1',eventId:'2',team:'BOS',opponent:'NYK',startAt};
 const after='2026-11-28T04:00:00Z';
 const f={first:after,digest:dig,doc:{kind:'nba_official_cdn_final_history_v1',officialFinalClockVerified:true,
  gameId:2,startAt,capturedAt:after,rows:[{playerId:1,team:'BOS',opponent:'NYK',appeared:true,identityVerified:true,officialGameFinalVerified:true,points:21}]}};
 a.deepEqual(verifiedStats(match,[f],after).stats,{points:21});
 a.equal(verifiedStats(match,[f],at),null);
 a.equal(verifiedStats({...match,opponent:'ATL'},[f],after),null);
 const other=structuredClone(f);other.doc.rows[0].points=22;
 a.equal(verifiedStats(match,[f,other],after),null);
});
test('an archived reviewed player ID survives absent current-event evidence but cannot qualify the event or stats',()=>{
 const o={...r,independentReconciliationContext:null};
 const known=[{digest:dig,first:nativeAt,doc:{rows:[{sport:'nhl',profilePath:'/players/nhl/p',nativePlayerId:'123',
  identityEvidenceSha256:rosterProof,independentReviewVerified:true,verifiedAt:nativeAt,sourcePlayer:'A. Example'}]}}];
 const x=build([{record:o,digest:dig}],[],[],{directories:[]},{sources:[]},{clock:at,revision:'f'.repeat(40),known});
 a.equal(x.scopesWithReusedPlayerId,1);a.equal(x.registry[0].playerId,'123');
 a.equal(x.rows[0].status,'source_matchup_or_clock_missing');
 a.equal(x.rows[0].match,null);a.equal(x.rows[0].officialStatistics,null);
});
