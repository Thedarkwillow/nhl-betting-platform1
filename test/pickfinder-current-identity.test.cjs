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
test('directory and research discovery emits candidates only, never roster or event approvals',()=>{
 const {discoveryCandidates}=require('../scripts/pickfinder-current-identity.cjs');
 const d=discoveryCandidates({directories:[{league:'nhl',playerSlugs:['andre-example','a-example','other']}]},
  {sources:[{league:'nhl',tables:[{columns:['Player↕'],rows:[['André Example'],['AExampleBOS']]}]}]},[facts]);
 a.equal(d.directory.scanned,3);a.equal(d.directory.oneNameCandidate,1);
 a.equal(d.directory.ambiguousNameCandidates,1);a.equal(d.reference.oneNameCandidate,1);a.equal(d.reference.playerColumnRows,2);
 a.equal(d.referenceStatus,'no_event_bound_native_identity');
});

test('exact profile retains displayed game clock and separate browser timezone without qualifying the game',()=>{
 const row={...r,sport:'nba',player:'VJ Edgecombe',market:'player_assists',
  detailId:'/players/nba/edgecombe?prop=fixture:player_assists:pf1:4'};
 const label='PHI @ IND • Fri @ 4:30PM';
 const entries=[{label:'Team',value:'PHI'},{label:'Opponent',value:'IND'},{label:'Matchup',value:label}];
 const snap={routeVerified:true,playerLabelVerified:true,entries,browserClock:{zone:'America/Los_Angeles',offsetMinutes:-480}};
 const context=captureProfileContext(row,snap,at);
 a.equal(context.displayedMatchupLabel,label);
 a.deepEqual(context.displayedLocalMatchup,{team:'PHI',opponent:'IND',homeAway:'away',weekday:'Fri',hour:4,minute:30,dayPeriod:'PM'});
 a.equal(context.browserClock.zone,'America/Los_Angeles');a.equal(context.providerDisplayZoneVerified,false);
 a.equal(context.startAt,null);a.equal(context.gameDateUtc,null);
 a.equal(result({...row,independentReconciliationContext:context}).rows[0].match,null);
 a.equal(captureProfileContext(row,{...snap,playerLabelVerified:false},at),null);
 a.equal(captureProfileContext(row,{...snap,entries:[...entries,{label:'Matchup',value:'PHI @ IND • Sat @ 4:30PM'}]},at).displayedMatchupLabel,undefined);
});

test('durable three-zone identity survives the event and does not use receipts unavailable at replay cutoff',()=>{
 const {replay}=require('../scripts/pickfinder-durable-identities.cjs');
 const {ZONES,clockAt}=require('../scripts/pickfinder-controlled-clock.cjs');
 const clock='2026-11-29T00:00:00Z',first='2026-11-27T10:00:00Z',startAt='2026-11-28T02:30:00Z';
 const sched={digest:'a'.repeat(64),first,doc:{sport:'nba',source:'espn:nba',observedAt:first,
   proofs:[{url:'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=20261127',digest:'f'.repeat(64),observedAt:first},
    {url:'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams/7/roster',teamId:'7',digest:'f'.repeat(64),observedAt:first}],
   events:[{eventId:'official-event',status:'pre',startAt,teams:[{id:'7',abbr:'DEN',homeAway:'away'},{id:'8',abbr:'UTAH',homeAway:'home'}]}],
   roster:[{teamId:'7',team:'DEN',playerId:'123',name:'Test Player'}]}};
 const p={sport:'nba',player:'Test Player',eventId:'source-event',market:'player_points',
   detailId:'/players/nba/test?prop=player%3Aplayer_points%3Asource-event%3A10'};
 const base={...p,playerPath:'/players/nba/test',routeVerified:true,playerLabelVerified:true,
   team:'DEN',opponent:'UTA',observedAt:first,displayedClocks:[]};
 const controls=ZONES.map((zone,i)=>({digest:String(i+1).repeat(64),first,doc:{schema:'pickfinder-controlled-clock-v1',records:[
   {...base,requestedZone:zone,browserClock:{zone},localMatchup:{...clockAt(startAt,zone),homeAway:'away'}}]}}));
 const profiles=[{digest:'b'.repeat(64),first,doc:{schema:'pickfinder-public-profiles-v1',records:[{...p,
   independentReconciliationContext:{team:'DEN',opponent:'UTA',observedAt:first,providerDisplayZoneVerified:false,
    browserClock:{zone:'UTC'},displayedMatchupLabel:'DEN @ UTA • Sat @ 2:30AM',
    displayedLocalMatchup:{team:'DEN',opponent:'UTA',homeAway:'away',weekday:'Sat',hour:2,minute:30,dayPeriod:'AM'}}}]}}];
 const input={facts:[sched],controls,profiles,clock,revision:'a'.repeat(40)};
 const r=replay(input);
 a.equal(r.events.length,1);a.equal(r.players[0].playerId,'123');
 a.equal(r.aliases[0].nativeCode,'UTAH');a.equal(r.rows.filter(x=>x.profileDigest).length,1);
 a.equal(replay({...input,clock:'2026-11-27T09:00:00Z'}).events.length,0);
 a.equal(replay({...input,controls:controls.slice(1)}).events.length,0);
 const conflict={...sched,digest:'c'.repeat(64),doc:{...sched.doc,events:[{...sched.doc.events[0],eventId:'conflict'}]}};
 a.equal(replay({...input,facts:[sched,conflict]}).events.length,0);
});

test('statistical crosswalks reuse the verified NBA review or exact NFL event and weekly roster, not names or ESPN IDs alone',()=>{
 const {crosswalk}=require('../scripts/pickfinder-stat-identity-crosswalk.cjs');
 const {qualifyResearch}=require('../scripts/pickfinder-durable-identities.cjs');
 const {displayedClockAt}=require('../scripts/pickfinder-reviewed-game-context.cjs');
 const nfl={sport:'nfl',namespace:'espn:nfl',sourcePlayer:'A Example',sourcePlayerPath:'/players/nfl/test',sourceEventId:'pf',
   playerId:'100',eventId:'101',team:'JAC',opponent:'BAL',startAt,proofAvailableAt:nativeAt,nativeReceiptDigest:dig,
   timezoneReceiptDigests:['1','2','3'].map(x=>x.repeat(64))};
 const g={eventId:'pf',nbaGameId:'0022600072',espnGameId:'401909334',scheduleStartAt:startAt,observedAt:nativeAt,home:'BOS',away:'NYK',
   sourceUrl:'https://www.pickfinder.app/game-lines?game=pf',displayedClock:displayedClockAt(startAt,'UTC')};
 const p={eventId:'pf',playerPath:'/players/nba/test',nbaPlayerId:'103',espnPlayerId:'999',team:'BOS',opponent:'NYK',
   sourceUrl:'https://www.pickfinder.app/players/nba/test?prop=one:points:pf:12',player:'A Example',displayedMatchup:'BOS vs NYK',
   observedAt:nativeAt,independentRosterVerified:true};
 const reviews=[{digest:dig,first:at,doc:{schema:'pickfinder-independent-nba-matchup-review-v1',clockComparisonZone:'UTC',games:[g],records:[p]}}];
 const season={digest:rosterProof,first:at,doc:{kind:'nflverse_public_native_history_v1',
   games:[{espnEventId:'101',gameId:'native',week:10,home:'BAL',away:'JAX',startAt}],
   rosters:[{espnId:'100',gsisId:'00-0000001',week:10,team:'JAX'}]}};
 const bridges=crosswalk({rows:[nfl]},reviews,[season],at);
 a.deepEqual(bridges.map(x=>[x.namespace,x.playerId,x.eventId]),[['nba:official','103','0022600072'],['nfl:gsis','00-0000001','native']]);
 const historical='2026-11-23T00:00:00Z';
 const facts=new Map(bridges.map(x=>[x.sport,{sport:x.sport,playerId:x.playerId,eventId:'historical-final',market:'points',value:0,
   officialStartAt:historical,profileAvailableAt:at,nativeAvailableAt:at,profileObservedAt:nativeAt,sourcePlayer:x.sourcePlayer,
   sourceDetailId:x.sourcePlayerPath,profileDigest:dig,nativeDigest:rosterProof}]));
 const qualified=qualifyResearch(facts,{rows:[nfl],statisticalCrosswalks:bridges},at);
 a.equal(qualified.length,2);
 a.ok(qualified.every(x=>x.shadowResearchEligible&&!x.operatorOfferVerified&&!x.settlementVerified&&!x.productionModelEligible));
 a.equal(qualifyResearch(facts,{rows:[nfl],statisticalCrosswalks:bridges},nativeAt).length,0);
 a.equal(crosswalk({rows:[{...nfl,opponent:'KC'}]},[],[season],at).length,0);
 const contradictory=structuredClone(season);contradictory.doc.rosters[0].gsisId='00-0000002';
 a.equal(crosswalk({rows:[nfl]},[],[season,contradictory],at).length,0);
});

test('stat identity reuse authenticates immutable review body and rejects a conflicting durable person',()=>{
 const {createHash}=require('node:crypto');
 const {reviewedStatIdentities}=require('../scripts/pickfinder-stat-identity-crosswalk.cjs');
 const first='2026-11-27T10:00:00Z',observed='2026-11-27T09:00:00Z',d='a'.repeat(64);
 const e={providerDetail:'/players/nfl/test?prop=x%3Ay%3Ae%3A5',providerEvent:'e',nativePlayerId:'00-1234567',
  nativeRoster:d,rosterProof:d,boardManifest:d,boardObservedAt:observed,rosterObservedAt:observed,name:'fixture player'};
 const r={sport:'nfl',sourcePlayer:e.name,profilePath:'/players/nfl/test',nativePlayerId:e.nativePlayerId,
  identityEvidence:e,identityEvidenceSha256:createHash('sha256').update(JSON.stringify(e)).digest('hex'),
  independentReviewVerified:true,modelApproved:false,verifiedAt:observed,nativeDigests:[d],profileDigests:[d]};
 const receipt={first,digest:d,doc:{kind:'pickfinder_historical_reviewed_identity_v1',rows:[r]}};
 const good=reviewedStatIdentities([receipt],{rows:[]},first);
 a.equal(good.length,1);a.equal(good[0].playerId,r.nativePlayerId);a.equal(Date.parse(good[0].proofAvailableAt),Date.parse(first));
 a.equal(reviewedStatIdentities([receipt],{rows:[{namespace:'nfl:gsis',sourcePlayerPath:r.profilePath,playerId:'00-7654321'}]},first).length,0);
 a.equal(reviewedStatIdentities([{...receipt,doc:{...receipt.doc,rows:[{...r,identityEvidence:{...e,providerEvent:'fake'}}]}}],{rows:[]},first).length,0);
 a.equal(reviewedStatIdentities([receipt],{rows:[]},observed).length,0);
});
