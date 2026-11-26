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
 assert.equal(c.eventId,'1');
 assert.equal(matchRow({...r,market:'player_shots_on_goal'},field,idx,clock).candidate.eventId,'1');
 assert.equal(matchRow({...r,market:'player_shots_on_goal_first_period'},field,idx,clock).reason,'unsupported_market');
 assert.equal(matchRow(r,{...field,tab:'Overview',window:'Last 10 Games'},idx,clock).candidate.eventId,'1');
 assert.equal(matchRow(r,{...field,tab:'Overview'},idx,clock).reason,'not_game_log');
 assert.equal(matchRow(r,{...field,tab:'Overview',window:'Last 10 Games',scope:'Date | Opponent | SOG | Line'},idx,clock).reason,'not_final_stat_table');assert.equal(c.sourceDateYearRecovered,true);assert.equal(c.providerIdentityReviewed,false);
 assert.equal(matchRow(r,{...field,value:field.value.replace('"4"','"5"')},idx,clock).reason,'native_result_mismatch');
 assert.equal(matchRow({...r,period:'first'},field,idx,clock).reason,'unsupported_scope');
 const other={...receipt,doc:{games:[{...receipt.doc.games[0],event:{...receipt.doc.games[0].event,eventId:'2',startAt:'2025-11-21T00:00:00Z'}}]}};
 assert.equal(matchRow(r,field,make([receipt,other]),clock).reason,'ambiguous_native_game');
 const out=audit([{digest,doc:{records:[{...r,research:[field,field]}]}}],idx,clock);
 assert.equal(out.summary.candidates,2);assert.equal(out.summary.distinctCandidates,1);assert.equal(out.summary.qualifiedCacheEntries,0);assert.equal(out.summary.qualifiedModelInputs,0);
});

test('official NBA dated history corroborates exact game rows without inventing tipoff',()=>{
 const {nativeIndex,matchRow}=require('../scripts/pickfinder-native-history-reconciliation.cjs');
 const {VERSION}=require('../scripts/pickfinder-research-coverage.cjs');
 const digest='b'.repeat(64),first='2026-11-24T15:00:00Z';
 const h={digest,first,doc:{kind:'nba_official_stats_regular_season_log_v1',source:'stats.nba.com LeagueGameLog',sourceResponseSha256:digest,historicalAppearancesOnly:true,capturedAt:first,rows:[{gameId:123,gameDate:'2026-11-20',playerId:9,player:'Fixture',team:'BOS',opponent:'TOR',minutes:24,wl:'W',points:14}]}};
 const idx=nativeIndex({facts:[],nhlFinals:[],nflSeasons:[],nbaHistories:[h]},clock);
 const r={sport:'nba',player:'Fixture',market:'player_points',status:'sampled',truncated:false,coverageVersion:VERSION,detailId:'/players/nba/a'};
 const field={origin:'profile',metric:'row 1',tab:'Overview',window:'Last 10 Games',scope:'Date | Opp | PTS | MIN',value:JSON.stringify([{value:'11/20'},{value:'TOR'},{value:'14'},{value:null}]),observedAt};
 const c=matchRow(r,field,idx,clock).candidate;
 assert.equal(matchRow(r,{...field,tab:'Player overview',window:null},idx,clock).candidate.officialGameDate,'2026-11-20');
 assert.equal(matchRow(r,{...field,tab:'Player overview',window:null,scope:'Date | Opp | PTS',value:JSON.stringify([{value:'11/20'},{value:'TOR'},{value:'14'}])},idx,clock).reason,'overview_game_log_unverified');
 assert.equal(c.officialGameDate,'2026-11-20');assert.equal(c.officialStartAt,null);assert.equal(c.providerIdentityReviewed,false);
 assert.equal(matchRow(r,{...field,value:field.value.replace('"14"','"15"')},idx,clock).reason,'native_result_mismatch');
 assert.equal(matchRow(r,{...field,scope:'Date | Opp | PTS | Opponent'},idx,clock).reason,'missing_exact_columns');
});

test('split rows are reconstructed only from contiguous identical scopes',()=>{
 const {structuredFields,columnShape}=require('../scripts/pickfinder-native-history-reconciliation.cjs');
 const f={origin:'profile',tab:'Player overview',scope:'Date | Opp | PTS',observedAt,metric:'row 1 part 1',value:'[{"value":"11/20"},'};
 const next={...f,metric:'row 1 part 2',value:'{"value":"TOR"},{"value":"14"}]'};
 const rows=[...structuredFields([f,next])];assert.equal(rows.length,1);assert.equal(rows[0].metric,'row 1');assert.equal(rows[0].reassembled,true);
 assert.equal([...structuredFields([f,{...next,scope:'Date | Opp | AST'}])].length,0);
 assert.equal(columnShape({scope:'Date | Opp | PTS | arbitrary text'}),'date|opp|pts|other');
});
test('sportsbook threshold inventory and esports scope do not infer missing facts',()=>{
 const {quoteInventory,esportsScope}=require('../scripts/pickfinder-archived-model-inputs.cjs');
 const q={sport:'nba',detailId:'p',eventId:'e',market:'points',book:'draftkings',quoteLine:20.5,side:'Higher',price:'-110',observedAt};
 const x=quoteInventory([q,{...q,side:'Lower'},{...q,quoteLine:null}]);
 assert.equal(x.exactPairs,1);assert.equal(x.missingThreshold,1);
 assert.equal(quoteInventory([q,{...q,side:'Lower',quoteLine:21}]).exactPairs,0);
 const e={sport:'cs2',market:'maps_1_2_player_kills',mapRange:'maps_1_2'};
 assert.deepEqual(esportsScope(e).maps,[1,2]);assert.equal(esportsScope(e).modelApproved,false);assert.equal(esportsScope({...e,mapRange:null}),null);
 assert.equal(esportsScope({...e,sport:'cod'}),null);
});
test('research candidate cache requires both availability clocks and excludes conflicting values',()=>{
 const {candidateCache,lookupCandidate}=require('../scripts/pickfinder-native-history-reconciliation.cjs');
 const x={sport:'nba',playerId:'9',eventId:'1',market:'points',value:14,nativeDigest:'a'.repeat(64),profileDigest:'b'.repeat(64),nativeAvailableAt:'2026-11-24T10:00:00Z',profileObservedAt:observedAt,profileAvailableAt:'2026-11-25T20:30:00Z'};
 const k={sport:x.sport,playerId:x.playerId,eventId:x.eventId,market:x.market};
 const c=candidateCache(new Map([['a',x]]),clock);
 assert.equal(c.index.size,1);assert.equal(lookupCandidate(c.index,{...k,asOf:observedAt}),null);assert.equal(lookupCandidate(c.index,{...k,asOf:clock}).modelApproved,false);
 assert.equal(candidateCache(new Map([['a',x],['b',{...x,value:15}]]),clock).index.size,0);
});

test('historical identity evidence requires multiple distinct games and rejects conflicting profile mappings',()=>{
 const {identityEvidence}=require('../scripts/pickfinder-native-history-reconciliation.cjs');
 const x={sport:'nhl',sourceDetailId:'/players/nhl/fixture?prop=a:b:c',sourcePlayer:'Fixture',playerId:'9',eventId:'1',market:'sog',value:4,nativeDigest:'a'.repeat(64),profileDigest:'b'.repeat(64),nativeAvailableAt:'2026-11-24T10:00:00Z',profileObservedAt:observedAt,profileAvailableAt:'2026-11-25T20:30:00Z'};
 const make=a=>identityEvidence(new Map(a.map((v,i)=>[String(i),v])),clock);
 assert.equal(make([x,{...x}]).summary.multipleGameCandidates,0);
 const out=make([x,{...x,eventId:'2'}]);
 assert.equal(out.summary.multipleGameCandidates,1);assert.equal(out.reviewCandidates[0].independentReviewVerified,false);
 assert.equal(make([x,{...x,eventId:'2',playerId:'10'}]).summary.multipleGameCandidates,0);
 assert.equal(make([x,{...x,eventId:'2'},{...x,sourceDetailId:'/players/nhl/another'}]).summary.multipleGameCandidates,0);
 assert.equal(make([x,{...x,eventId:'2',sourceDetailId:'https://example.com/players/nhl/fixture'}]).summary.multipleGameCandidates,0);
});
