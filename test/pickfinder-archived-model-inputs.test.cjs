'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {classify,auditProfiles,auditBoards}=require('../scripts/pickfinder-archived-model-inputs.cjs');
const clock='2026-11-25T22:00:00Z',observedAt='2026-11-25T20:00:00Z';
test('profile categories remain observed evidence and reject future fields',()=>{
 const fields=[{origin:'prop_history',observedAt},{origin:'line_movement',observedAt},{origin:'profile',tab:'Game Logs',observedAt},{origin:'profile',tab:'Injuries',observedAt},{origin:'profile',tab:'Opponent splits',observedAt},{origin:'profile',tab:'Map statistics',observedAt},{origin:'profile',observedAt:'2026-11-26T00:00:00Z'}];
 const r=auditProfiles([{digest:'fixture',doc:{records:[{sport:'nba',research:fields}]}}],clock).summary;
 assert.equal(r.fields,7);assert.equal(r.invalid,1);assert.equal(r.bySport.nba.observed.historical_prop,1);assert.equal(r.bySport.nba.observed.game_logs,1);assert.equal(r.bySport.nba.observed.availability_workload,1);assert.equal(r.bySport.nba.observed.matchup_splits,1);assert.equal(r.bySport.nba.observed.esports_scope,1);assert.equal(r.usableCacheKeys,0);
});
test('historical odds require exact threshold and pre-archive clock',()=>{
 const o={sport:'nba',book:'prizepicks',detailId:'p',eventId:'e',market:'points',line:20.5,side:'Higher',tier:'standard',observedAt,startAt:'2026-11-25T23:00:00Z'};
 const q={...o,book:'draftkings',quoteLine:20.5,price:'-110'};
 const b={m:{sport:'nba'},first:'2026-11-25T20:01:00Z',digest:'fixture',offers:[o,o],sportsbookQuotes:[q,{...q,side:'Lower'}],researchObservations:[]};
 const r=auditBoards({manifests:[b]},clock);
 assert.equal(r.summary.distinctObservations,1);assert.equal(r.summary.quoteMatches,2);assert.equal([...r.history.values()][0].quotes[0].higher,.5);assert.equal([...r.history.values()][0].modelApproved,false);
 assert.equal(auditBoards({manifests:[{...b,sportsbookQuotes:[q,{...q,side:'Lower',quoteLine:21.5}]}]},clock).summary.quoteMatches,0);
 assert.equal(auditBoards({manifests:[{...b,first:'2026-11-26T00:00:00Z'}]},clock).summary.observations,0);
});

test('explicit full dates decode without guessing ambiguous dates or missing years',()=>{
 const {fullDate,priorSeason,candidate}=require('../scripts/pickfinder-public-history-cache.cjs');
 const {VERSION}=require('../scripts/pickfinder-research-coverage.cjs');
 const now=new Date(clock);
 assert.equal(fullDate('Nov 21, 2024'),'2024-11-21');
 assert.equal(fullDate('11/21/2024'),'2024-11-21');
 assert.equal(fullDate('21/11/2024'),'2024-11-21');
 for(const v of ['11/01/2024','11/21','Feb 30, 2024','Nov 21','2024-02-30'])assert.equal(fullDate(v),null);
 assert.equal(priorSeason([{label:'Season',display:'Season 2024-25'}],now).end,2025);
 const f={origin:'profile',metric:'row 1',tab:'Game Log',scope:'Date | PTS',value:JSON.stringify([{value:'Nov 21, 2024'},{value:'12'}]),observedAt,filterSelection:[{label:'Season',display:'2024-25 season'}]};
 const r={status:'sampled',coverageVersion:VERSION,truncated:false,sport:'nba',player:'Fixture',market:'points',detailId:'/players/nba/a'};
 assert.ok(candidate(r,f,now));assert.equal(candidate(r,{...f,filterSelection:[]},now),null);
});
test('quote freshness uses offer observation not delayed archive commit, and rejects later quotes',()=>{
 const o={sport:'nba',book:'prizepicks',detailId:'p',eventId:'e',market:'points',line:20.5,side:'Higher',tier:'standard',observedAt,startAt:'2026-11-25T23:00:00Z'};
 const q={...o,book:'draftkings',quoteLine:20.5,price:'-110'};
 const b={m:{sport:'nba'},first:'2026-11-25T20:30:00Z',digest:'fixture',offers:[o],sportsbookQuotes:[q,{...q,side:'Lower'}],researchObservations:[]};
 assert.equal(auditBoards({manifests:[b]},clock).summary.quoteMatches,1);
 assert.equal(auditBoards({manifests:[{...b,sportsbookQuotes:[q,{...q,side:'Lower',observedAt:'2026-11-25T20:01:00Z'}]}]},clock).summary.quoteMatches,0);
 assert.equal(auditBoards({manifests:[{...b,sportsbookQuotes:[q,{...q,side:'Lower',quoteLine:21}]}]},clock).summary.quoteMatches,0);
});

test('native historical matching resolves a partial date only with unique player, opponent and exact result',()=>{
 const {nativeIndex,matchRow,audit}=require('../scripts/pickfinder-native-history-reconciliation.cjs');
 const {VERSION}=require('../scripts/pickfinder-research-coverage.cjs');
 const digest='a'.repeat(64),first='2026-11-24T15:00:00Z';
 const receipt={digest,first,doc:{games:[{sourceDigest:digest,observedAt:first,event:{namespace:'nhl:official',completed:true,status:'post',eventId:'1',startAt:'2026-11-21T00:00:00Z',teams:[{abbr:'TOR'},{abbr:'BOS'}]},rows:[{playerId:'9',team:'TOR',appeared:true,stats:{sog:4}}]}]}};
 const facts=[{doc:{sport:'nhl',source:'nhl:official',roster:[{name:'Fixture',playerId:'9'}]}}];
 const make=(finals=[receipt],f=facts)=>nativeIndex({facts:f,nhlFinals:finals,nflSeasons:[]},clock);
 const r={sport:'nhl',player:'Fixture',market:'shots on goal',status:'sampled',truncated:false,coverageVersion:VERSION,detailId:'/players/nhl/a'};
 const field={origin:'profile',metric:'row 1',tab:'Game Log',scope:'Date | Opponent | SOG',value:JSON.stringify([{value:'11/20'},{value:'BOS'},{value:'4'}]),observedAt};
 const idx=make(),c=matchRow(r,field,idx,clock).candidate;
 assert.equal(c.eventId,'1');assert.equal(c.sourceDateYearRecovered,true);assert.equal(c.providerIdentityReviewed,false);
 assert.equal(matchRow(r,{...field,value:field.value.replace('"4"','"5"')},idx,clock).reason,'no_matching_native_game');
 assert.equal(matchRow({...r,period:'first'},field,idx,clock).reason,'unsupported_scope');
 const other={...receipt,doc:{games:[{...receipt.doc.games[0],event:{...receipt.doc.games[0].event,eventId:'2',startAt:'2025-11-21T00:00:00Z'}}]}};
 assert.equal(matchRow(r,field,make([receipt,other]),clock).reason,'ambiguous_native_game');
 const out=audit([{digest,doc:{records:[{...r,research:[field,field]}]}}],idx,clock);
 assert.equal(out.summary.candidates,2);assert.equal(out.summary.distinctCandidates,1);assert.equal(out.summary.qualifiedCacheEntries,0);assert.equal(out.summary.qualifiedModelInputs,0);
});
