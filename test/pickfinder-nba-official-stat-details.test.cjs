'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildStatDetails,indexDetails,playerStatistics}=require('../scripts/pickfinder-nba-official-stat-details.cjs');
const {matchRow}=require('../scripts/pickfinder-native-history-reconciliation.cjs');
const {VERSION}=require('../scripts/pickfinder-research-coverage.cjs');
const first='2026-11-26T04:01:00Z', capturedAt='2026-11-26T04:00:00Z', startAt='2026-11-25T00:00:00Z';
const source='nba.com official game box score', url='https://www.nba.com/game/nyk-vs-bos-0022600055/box-score';
const f='a'.repeat(64),e='b'.repeat(64),g='c'.repeat(64);
const stats={fieldGoalsMade:4,fieldGoalsAttempted:9,threePointersMade:2,threePointersAttempted:4,freeThrowsMade:1,freeThrowsAttempted:2,reboundsOffensive:1,reboundsDefensive:2,reboundsTotal:3,points:11};
const rows=Array.from({length:10},(_,i)=>({playerId:i+1,home:i<5,team:i<5?'BOS':'NYK',opponent:i<5?'NYK':'BOS',
 wl:i<5?'W':'L',appeared:true,identityVerified:true,officialGameFinalVerified:true,points:11,rebounds:3,threePointersMade:2}));
const final={first,digest:f,doc:{kind:'nba_official_web_final_history_v1',source,sourceUrl:url,sourceResponseSha256:e,officialFinalClockVerified:true,
 gameId:22600055,startAt,capturedAt,scheduleEvidence:{finalScoreAgreement:{home:100,away:90}},rows}};
function fixture(){
 const side=home=>({teamTricode:home?'BOS':'NYK',score:home?100:90,players:rows.filter(p=>p.home===home).map(p=>({personId:p.playerId,statistics:{...stats}}))});
 return {sourceUrl:url,digest:e,doc:{game:{gameId:'0022600055',gameTimeUTC:startAt,gameStatus:3,homeTeam:side(true),awayTeam:side(false)}}};
}
function details(web=fixture()){
 return buildStatDetails(web,final,capturedAt);
}

test('full-game shot and rebound subcounts require official accounting and exact final binding',()=>{
 assert.equal(playerStatistics({...stats,points:12}),null);
 assert.equal(playerStatistics({...stats,reboundsTotal:4}),null);
 assert.equal(playerStatistics(stats).twoPointersAttempted,5);
 const x=details();
 assert.equal(x.rows.length,10);
 assert.equal(x.rows[0].stats.twoPointersMade,2);
 const mismatched=fixture();
 mismatched.doc.game.homeTeam.score++;
 assert.equal(details(mismatched),null);
 mismatched.doc.game.homeTeam.score--;
 mismatched.doc.game.gameId='0022600056';
 assert.equal(details(mismatched),null);
});

test('committed supplemental stats exclude wrong receipt, conflicting evidence and future evidence',()=>{
 const doc=details(), k='["1","22600055"]';
 const make=(extra={})=>({doc,digest:g,first,...extra});
 assert.equal(indexDetails([make()],[final],Date.parse(first)).get(k).stats.freeThrowsAttempted,2);
 assert.equal(indexDetails([make()],[final],Date.parse(capturedAt)).size,0);
 assert.equal(indexDetails([make({doc:{...doc,officialFinalDigest:'z'.repeat(64)}})],[final],Date.parse(first)).size,0);
 const conflict=structuredClone(doc);
 conflict.rows[0].stats.freeThrowsAttempted++;
 assert.equal(indexDetails([make(),make({doc:conflict,digest:'d'.repeat(64)})],[final],Date.parse(first)).has(k),false);
});

test('extended receipt can corroborate only a requested exact stat column for the retrospective recovery path',()=>{
 const doc=details(), r={sport:'nba',market:'player_free_throws_attempted',player:'Athlete',status:'sampled',truncated:false,coverageVersion:VERSION};
 const obs={origin:'profile',tab:'Player overview',metric:'row 1',scope:'Date | Opponent | Min | FTA | 2Q FTA',
  observedAt:'2026-11-25T23:00:00Z',value:JSON.stringify(['11/24','NYK','20','2','4'].map(value=>({value})))};
 const ext=indexDetails([{doc,digest:g,first}],[final],Date.parse(first));
 const index={names:new Map([['["nba","athlete"]',new Set(['1'])]]),byPlayer:new Map([['["nba","1"]',
  [{event:'22600055',gameDate:'2026-11-24',dates:['2026-11-24'],opp:'NYK',stats:{},digest:f}]]]),extendedNba:ext};
 assert.equal(matchRow(r,obs,index,first).reason,'unsupported_market');
 const m=(r0,f0)=>matchRow(r0,f0,index,first,{allowNbaExtendedFinals:true});
 assert.equal(m(r,obs).candidate.value,2);
 assert.equal(m(r,obs).candidate.nativeDigest,g);
 assert.equal(m(r,{...obs,scope:obs.scope.replace('| FTA |','| 1H FTA |')}).reason,'missing_exact_columns');
 assert.equal(m({...r,period:'1st_half'},obs).reason,'unsupported_scope');
 assert.equal(m({...r,market:'player_fantasy_score_all_'},obs).reason,'unsupported_market');
});

test('retrospective recovery normalizes suffix punctuation only with one native identity',()=>{
 const obs={origin:'profile',tab:'Player overview',metric:'row 1',scope:'Date | Opponent | Min | Pts',
  observedAt:'2026-11-25T23:00:00Z',value:JSON.stringify(['11/24','NYK','20','11'].map(value=>({value})))};
 const rec={sport:'nba',market:'player_points',player:'Athlete Jr.',status:'sampled',truncated:false,coverageVersion:VERSION};
 const index={names:new Map([['["nba","athlete jr"]',new Set(['1'])]]),byPlayer:new Map([['["nba","1"]',
  [{event:'22600055',gameDate:'2026-11-24',dates:['2026-11-24'],opp:'NYK',stats:{points:11},digest:f}]]])};
 const m=(r,feature)=>matchRow(r,obs,index,first,feature);
 assert.equal(m(rec,{}).reason,'native_identity_ambiguous');
 assert.equal(m(rec,{allowNbaExtendedFinals:true}).candidate.playerId,'1');
 assert.equal(m({...rec,player:'Athlete'},{allowNbaExtendedFinals:true}).reason,'native_identity_ambiguous');
 index.names.set('["nba","athlete jr."]',new Set(['2']));
 assert.equal(m(rec,{allowNbaExtendedFinals:true}).reason,'native_identity_ambiguous');
});

test('dunks require complete official made-shot accounting and retain per-market provenance',()=>{
 const box=fixture();
 const make=(player,i,j)=>({actionType:'Made Shot',actionNumber:i*10+j,personId:player.personId,teamTricode:i<5?'BOS':'NYK',
  shotResult:'Made',isFieldGoal:1,shotValue:j<2?2:3,subType:j===0?'Running Dunk Shot':'Jump Shot'});
 const actions=[...box.doc.game.homeTeam.players,...box.doc.game.awayTeam.players].flatMap((player,i)=>[0,1,2,3].map(j=>make(player,i,j)));
 box.doc.playByPlay={gameId:'0022600055',source:'hanaV3',actions};
 const d=details(box);
 assert.equal(d.dunksReconciledAgainstFinalFGM,true);
 assert.equal(d.rows[0].stats.dunks,1);
 const me=indexDetails([{doc:details(),digest:g,first},{doc:d,digest:'d'.repeat(64),first:'2026-11-26T04:02:00Z'}],
 [final],Date.parse('2026-11-26T04:03:00Z')).get('["1","22600055"]');
 assert.equal(me.metricEvidence.twoPointersMade.digest,g);
 assert.equal(me.metricEvidence.dunks.digest,'d'.repeat(64));
 box.doc.playByPlay.actions=actions.slice(1);
 assert.equal(details(box).dunksReconciledAgainstFinalFGM,undefined);
 box.doc.playByPlay.actions=[...actions,actions[0]];
 assert.equal(details(box).dunksReconciledAgainstFinalFGM,undefined);
});

test('published PrizePicks scoring corroborates full-game FP only for an exact, exclusive app scope',()=>{
 const obs={origin:'profile',tab:'Player overview',metric:'row 1',scope:'Date | Opponent | Min | FP | 2Q FP',
  observedAt:'2026-11-25T23:00:00Z',value:JSON.stringify(['11/24','NYK','20','11.6','4'].map(value=>({value})))};
 const rec={sport:'nba',market:'player_fantasy_score_all_',player:'Athlete',status:'sampled',truncated:false,
  coverageVersion:VERSION,book:'prizepicks',books:['prizepicks']};
 const index={names:new Map([['["nba","athlete"]',new Set(['1'])]]),byPlayer:new Map([['["nba","1"]',
  [{event:'22600055',gameDate:'2026-11-24',dates:['2026-11-24'],opp:'NYK',stats:{prizePicksFantasyScore:11.6},digest:f}]]])};
 const m=(r,f=obs)=>matchRow(r,f,index,first,{allowNbaExtendedFinals:true});
 assert.equal(m(rec).candidate.value,11.6);
 assert.equal(m({...rec,books:['prizepicks','underdog']}).reason,'unsupported_market');
 assert.equal(m({...rec,books:undefined}).reason,'unsupported_market');
 assert.equal(m({...rec,book:'underdog'}).reason,'unsupported_market');
 assert.equal(m(rec,{...obs,period:'1st_half'}).reason,'unsupported_scope');
 assert.equal(m(rec,{...obs,scope:obs.scope.replace('| FP |','| 1H FP |')}).reason,'missing_exact_columns');
});
