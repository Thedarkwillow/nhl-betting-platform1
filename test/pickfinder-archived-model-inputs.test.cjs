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
 assert.equal(matchRow(r,{...field,scope:'Date | Opponent | SOG | Shots | Other | Other',value:JSON.stringify([{value:'11/20'},{value:'BOS'},{value:'4'},{value:'7'},{value:null},{value:'2'}])},idx,clock).candidate.eventId,'1');
 assert.equal(matchRow(r,{...field,scope:'Date | Opponent | Shots'},idx,clock).reason,'missing_exact_columns');
 assert.equal(matchRow(r,{...field,scope:'Date | Opponent | SOG | SOG'},idx,clock).reason,'missing_exact_columns');
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
 const docs=[{digest:'b'.repeat(64),first:clock,doc:{records:[{...r,research:[field]}]}},{digest:'c'.repeat(64),first:observedAt,doc:{records:[{...r,research:[field]}]}}];
 const earlier=audit(docs,idx,clock),reversed=audit([...docs].reverse(),idx,clock);
 assert.equal(earlier.summary.distinctCandidates,1);
 assert.equal([...earlier.rows.values()][0].profileDigest,'c'.repeat(64));
 assert.equal([...reversed.rows.values()][0].profileDigest,'c'.repeat(64));
 assert.equal(earlier.summary.qualifiedCacheEntries,0);
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

test('reviewed history intake requires exact independent evidence and preserves as-of gate',()=>{
 const {identityEvidence,reviewedHistory,historyForModel}=require('../scripts/pickfinder-native-history-reconciliation.cjs');
 const nativeDigest='a'.repeat(64),profileDigest='b'.repeat(64),first='2026-11-25T20:30:00Z',verifiedAt='2026-11-25T21:00:00Z';
 const x={sport:'nhl',sourceDetailId:'/players/nhl/fixture?prop=a:b:c',sourcePlayer:'Fixture',playerId:'9',eventId:'1',market:'sog',value:4,officialStartAt:'2026-11-20T00:00:00Z',nativeDigest,profileDigest,nativeAvailableAt:'2026-11-24T10:00:00Z',profileObservedAt:observedAt,profileAvailableAt:first};
 const rows=new Map([['a',x],['b',{...x,eventId:'2',officialStartAt:'2026-11-21T00:00:00Z'}]]);
 const groups=identityEvidence(rows,clock).reviewCandidates;
 const review={sport:'nhl',profilePath:'/players/nhl/fixture',nativePlayerId:'9',sourcePlayer:'Fixture',identityEvidenceSha256:'c'.repeat(64),independentReviewVerified:true,verifiedAt,nativeDigests:[nativeDigest],profileDigests:[profileDigest]};
 const h={digest:'d'.repeat(64),first:verifiedAt,doc:{rows:[review]}};
 assert.equal(reviewedHistory(rows,groups,[],clock).index.size,0);
 assert.equal(reviewedHistory(rows,groups,[{...h,doc:{rows:[{...review,independentReviewVerified:false}]}}],clock).index.size,0);
 const c=reviewedHistory(rows,groups,[h],clock);
 assert.equal(c.index.size,2);
 const q={sport:'nhl',playerId:'9',market:'sog',gameStartAt:'2026-11-26T00:00:00Z'};
 assert.equal(historyForModel(c.index,{...q,asOf:first}).length,0);
 assert.equal(historyForModel(c.index,{...q,asOf:clock}).length,2);
 assert.equal([...c.index.values()][0].modelApproved,false);
});
test('esports explicit hyphen range recovers only source-labeled map scope',()=>{
 const {esportsScope}=require('../scripts/pickfinder-archived-model-inputs.cjs');
 const o={sport:'cs2',market:'1-2_maps_player_kills',mapRange:'1-2_maps'};
 assert.deepEqual(esportsScope(o).maps,[1,2]);
 assert.equal(esportsScope({...o,mapRange:'1_maps'}),null);
 const m='maps_1-2_player_kills';
 assert.deepEqual(esportsScope({sport:'cs2',market:m,detailId:'/players/cs2/fixture?prop=a:'+m+':b:10'}).maps,[1,2]);
 assert.equal(esportsScope({sport:'cs2',market:m,detailId:'https://example.com/players/cs2/fixture?prop=a:'+m+':b:10'}),null);
});

test('observed first-N map identifiers preserve explicit source scope without approving fantasy scoring',()=>{
 const {esportsScope}=require('../scripts/pickfinder-archived-model-inputs.cjs');
 const o={sport:'cs2',market:'1st_2_maps_player_headshots',mapRange:'1st_2_maps'};
 assert.deepEqual(esportsScope(o).maps,[1,2]);
 assert.equal(esportsScope(o).market,'headshotKills');
 assert.equal(esportsScope(o).modelApproved,false);
 assert.deepEqual(esportsScope({...o,market:'1st_1_maps_player_kills',mapRange:'1st_1_maps'}).maps,[1]);
 assert.equal(esportsScope({...o,sport:'dota2',market:'1st_2_maps_player_fantasy_score_underdog_'}),null);
 assert.equal(esportsScope({...o,mapRange:'2_maps'}),null);
});

test('public sporting tables retain complete bounded headings while legacy scope stays bounded',()=>{
 const {readSections}=require('../scripts/pickfinder-player-research.cjs');
 const headers=['Date','Opponent',...Array.from({length:87},(_,i)=>'Sport stat '+i)];
 const table={getClientRects:()=>[{}],querySelectorAll:s=>s==='thead th'?headers.map(innerText=>({innerText})):s==='tbody tr'?[{cells:headers.map(()=>({innerText:'1',querySelectorAll:()=>[]}))}]:[]};
 const prior=global.document;
 try{
  global.document={body:{innerText:''},querySelectorAll:s=>s==='table'?[table]:[]};
  const p={tab:'Game Log',origin:'profile',observedAt,context:{}};
  const all=readSections({...p,fullSportingHeaders:true});
  assert.equal(all[0].scope.split(' | ').length,89);
  assert.ok(all.every(f=>f.scope===all[0].scope));
  const legacy=readSections(p);
  assert.ok(legacy[0].scope.length<=512);
  assert.ok(legacy[0].scope.endsWith('[header truncated]'));
 }finally{if(prior===undefined)delete global.document;else global.document=prior;}
});

test('historical review packet contains linked evidence without certifying reviewer approval',()=>{
 const {reviewPacket}=require('../scripts/pickfinder-archived-model-inputs.cjs');
 const c={sport:'nhl',profilePath:'/players/nhl/fixture',nativePlayerId:'9',sourcePlayer:'fixture',independentReviewVerified:false};
 const f={sport:'nhl',sourceDetailId:c.profilePath+'?prop=a:b:c',playerId:'9',eventId:'1',market:'sog',value:4,nativeDigest:'a'.repeat(64),profileDigest:'b'.repeat(64)};
 const p=reviewPacket({identityCandidates:[c],rows:new Map([['a',f],['b',f]])},clock);
 assert.equal(p.rows.length,1);assert.equal(p.rows[0].facts.length,1);assert.equal(p.rows[0].independentReviewVerified,false);assert.equal(p.reviewReceipt,false);assert.equal(p.modelApproved,false);
});

test('reviewed cache joins native model histories only on exact prior event and stat',()=>{
 const {shadowHistoryJoin}=require('../scripts/pickfinder-archived-model-inputs.cjs');
 const f={sport:'nhl',playerId:'9',eventId:'123',market:'sog',value:4,officialStartAt:'2026-11-20T00:00:00Z',availableAt:'2026-11-25T21:00:00Z',providerIdentityReviewed:true};
 const s={sport:'NHL',playerId:9,startAt:'2026-11-26T00:00:00Z',identityReviewed:true,eventReviewed:true,rosterReviewed:true,history:{games:[{gameId:123,shotsOnGoal:4,finalVerified:true,knownAt:'2026-11-25T20:00:00Z'}]}};
 const x=shadowHistoryJoin(new Map([['f',f]]),[s],clock);
 assert.equal(x.matchedFacts,1);assert.equal(x.modelApproved,false);
 assert.equal(shadowHistoryJoin(new Map([['f',{...f,value:5}]]),[s],clock).matchedFacts,0);
 assert.equal(shadowHistoryJoin(new Map([['f',{...f,providerIdentityReviewed:false}]]),[s],clock).matchedFacts,0);
});
test('esports review queue does not assert native identity from parsed scope',()=>{
 const {esportsReviewQueue}=require('../scripts/pickfinder-archived-model-inputs.cjs');
 const o={sport:'cs2',eventId:'e',player:'Fixture',detailId:'/players/cs2/a?prop=a:b:c',market:'1st_2_maps_player_kills',mapRange:'1st_2_maps'};
 const x={offer:o,manifestDigest:'a'.repeat(64)};
 const q=esportsReviewQueue(new Map([['a',x],['b',x]]));
 assert.equal(q.length,1);assert.deepEqual(q[0].maps,[1,2]);assert.equal(q[0].offerObservations,2);assert.equal(q[0].independentReviewVerified,false);
});

test('series review cross-checks exact event, profile, roster label and ordinal without retroactive approval', () => {
 const {reconcileSeries} = require('../scripts/pickfinder-esports-series-review.cjs');
 const evidence = require('../config/esports/pickfinder-series-review-2026-11-27.json');
 const fixture = evidence.series.find(x => x.sport === 'dota2' && x.sourceEventId === '20261126889AC86E');
 const player = fixture.roster.find(x => x.label === 'Boxi');
 const scope = {sport:fixture.sport, sourceEventId:fixture.sourceEventId, sourcePlayer:player.label,
                profilePath:player.pickfinderProfilePath, maps:[1,2]};
 const review = x => reconcileSeries([x], evidence.reviewedAt).rows[0];
 const row = review(scope);
 assert.equal(row.independentSeriesEvidence.status, 'roster_and_map_corroborated');
 assert.deepEqual(row.independentSeriesEvidence.firstTwoValveMatchIds, ['9106185090','9106299101']);
 assert.equal(row.independentReviewVerified,false);
 assert.equal(row.modelApproved,false);
 assert.equal(review({...scope,profilePath:'/players/dota2/wrong'}).independentSeriesEvidence.status,'player_unresolved');
 assert.equal(review({...scope,sourcePlayer:'other'}).independentSeriesEvidence.status,'player_unresolved');
 assert.equal(review({...scope,maps:[2,3]}).independentSeriesEvidence.status,'map_scope_unresolved');
 assert.equal(review({...scope,sport:'cs2'}).independentSeriesEvidence.status,'series_unreviewed');
 assert.equal(reconcileSeries([scope],'2026-11-26T00:00:00Z').rows[0].independentSeriesEvidence.status,'series_unreviewed');
});

test('dated result evidence resolves exact map scope while preserving pregame roster conflicts', () => {
 const {reconcileSeries} = require('../scripts/pickfinder-esports-series-review.cjs');
 const base = require('../config/esports/pickfinder-series-review-2026-11-27.json');
 const followup = require('../config/esports/pickfinder-series-review-remainder-2026-11-27.json');
 const rows = [
  {sport:'valorant',sourceEventId:'20261126889E98FA',sourcePlayer:'Zap',profilePath:'/players/val/2y5lrc9frzttg3v',maps:[1,2]},
  {sport:'cs2',sourceEventId:'2026112650362690',sourcePlayer:'bl1x1',profilePath:'/players/cs2/u2qbkafgxd78s8o',maps:[1,2]},
  {sport:'dota2',sourceEventId:'2026112556AC1CE4',sourcePlayer:'sailyn',profilePath:'/players/dota2/0o1dtky16ckvf5v',maps:[1,2]}
 ];
 const before = reconcileSeries(rows, base.reviewedAt);
 assert.equal(before.rows[0].independentSeriesEvidence.status,'map_scope_unresolved');
 assert.equal(before.rows[1].independentSeriesEvidence.status,'player_unresolved');
 assert.equal(before.rows[2].independentSeriesEvidence.status,'player_unresolved');
 const after = reconcileSeries(rows, followup.reviewedAt);
 const [map,conflict,alias] = after.rows.map(x=>x.independentSeriesEvidence);
 assert.deepEqual(map.firstTwoMapNames,['Lotus','Corrode']);
 assert.deepEqual(map.firstTwoResultSiteMapIds,['297131','297132']);
 assert.equal(map.reviewedAt,followup.reviewedAt);
 assert.equal(map.status,'roster_and_map_corroborated');
 assert.equal(conflict.status,'roster_conflict');
 assert.equal(conflict.rosterConflict.resultSiteLabel,'interz');
 assert.equal(alias.status,'roster_and_map_corroborated');
 assert.equal(alias.resultSiteLabel,'inori');
 assert.equal(after.summary.officialSettlementVerified,0);
 assert.equal(after.summary.qualifiedModelInputs,0);
 assert.ok(after.rows.every(x=>x.modelApproved===false));
});

test('reviewed history challenger uses only prior exact native facts and leaves baseline unchanged',()=>{
 const {compareOffer,scorePairs}=require('../scripts/pickfinder-reviewed-history-model.cjs');
 const clock='2026-11-26T18:00:00Z',startAt='2026-11-27T01:00:00Z';
 const o={sport:'nhl',player:'Ex',eventId:'a',market:'player_shots_on_goal',detailId:'/players/nhl/x?prop=b:player_shots_on_goal:a:2.5',side:'Higher',line:2.5,startAt,observedAt:clock};
 const games=Array.from({length:6},(_,i)=>({gameId:i+1,gameDate:'2026-11-0'+(i+1),knownAt:'2026-11-20T01:00:00Z',finalVerified:true,shotsOnGoal:i<4?3:2}));
 const s={sport:'NHL',name:'Ex',team:'ABC',opponent:'DEF',playerId:1,gameId:99,startAt,firstGitAt:clock,
  identityReviewed:true,eventReviewed:true,rosterReviewed:true,history:{playerId:1,name:'Ex',team:'ABC',type:'skater',games}};
 const index=new Map(games.map((g,i)=>[i,{sport:'nhl',playerId:'1',market:'sog',value:g.shotsOnGoal,eventId:String(g.gameId),
  availableAt:i===5?startAt:clock,officialStartAt:g.gameDate+'T00:00:00Z',reviewDigest:'b'.repeat(64),providerIdentityReviewed:true}]));
 const baseline={metric:'shotsOnGoal',probabilities:{higher:.4,lower:.6}};
 const pair=compareOffer(o,s,index,clock,clock,baseline);
 assert.equal(pair.existing,.4);assert.equal(pair.reviewed,.75);assert.equal(pair.challenger,.575);assert.equal(pair.reviewedObservations,5);
 assert.equal(compareOffer({...o,line:3.5},s,index,clock,clock,baseline),null);
 assert.equal(compareOffer({...o,startAt:null},s,index,clock,clock,baseline),null);
 assert.equal(compareOffer(o,{...s,firstGitAt:startAt},index,clock,clock,baseline),null);
 index.get(0).value=4;
 assert.equal(compareOffer(o,s,index,clock,clock,baseline),null);
 const row={...s,market:'shotsOnGoal',line:o.line,side:o.side,forecastAt:clock,reviewedHistoryPair:pair};
 const final={event:'99',team:'ABC',opp:'DEF',start:startAt,first:'2026-11-27T04:00:00Z',digest:'d'.repeat(64),stats:{sog:3}};
 const finals={byPlayer:new Map([['["nhl","1"]',[final]]])};
 const result=scorePairs([row,row],finals,'2026-11-27T05:00:00Z').nhl.shotsOnGoal;
 assert.equal(result.eligiblePairs,1);assert.equal(result.decided,1);assert.equal(result.scores.neutral.brier,.25);
 assert.ok(result.scores.challenger.brier<result.scores.existing.brier);
 assert.equal(scorePairs([row],finals,startAt).nhl.shotsOnGoal.decided,0);
});

test('independent schedule relisting does not corroborate unplayed maps or relabel the original offer', () => {
 const {reconcileSeries}=require('../scripts/pickfinder-esports-series-review.cjs');
 const {series}=require('../config/esports/pickfinder-series-review-2026-11-27.json');
 const event=series.find(x=>x.sourceEventId==='2026112600B7ED27');
 const player=event.roster[0];
 const scope={sport:'valorant',sourceEventId:event.sourceEventId,sourcePlayer:player.label,
  profilePath:player.pickfinderProfilePath,maps:[1,2]};
 const read=clock=>reconcileSeries([scope],clock);
 const before=read('2026-11-27T04:51:32Z').rows[0].independentSeriesEvidence;
 assert.equal(before.scheduleDisposition,undefined);
 const after=read('2026-11-27T04:51:33Z');
 const later=after.rows[0].independentSeriesEvidence;
 assert.equal(later.status,'map_scope_unresolved');
 assert.deepEqual(later.firstTwoMapNames,[]);
 assert.equal(later.scheduleDisposition.priorListedStartAt,'2026-11-26T22:00:00Z');
 assert.equal(later.scheduleDisposition.currentListedStartAt,'2026-11-28T22:00:00Z');
 assert.equal(later.reportedDate,'2026-11-26');
 assert.equal(after.summary.officialSettlementVerified,0);
 assert.equal(after.summary.qualifiedModelInputs,0);
});

test('published final maps corroborate CS2 nonparticipation without asserting platform settlement', () => {
 const {reconcileSeries}=require('../scripts/pickfinder-esports-series-review.cjs');
 const scope={sport:'cs2',sourceEventId:'2026112650362690',sourcePlayer:'bl1x1',
  profilePath:'/players/cs2/u2qbkafgxd78s8o',maps:[1,2]};
 const other={...scope,sourcePlayer:'HeCkBNk'};
 const {rows,summary}=reconcileSeries([scope,other],'2026-11-27T04:51:33Z');
 assert.equal(rows[0].independentSeriesEvidence.status,'roster_conflict');
 assert.equal(rows[0].independentSeriesEvidence.rosterExclusion.resultReferences.length,2);
 assert.equal(rows[0].independentSeriesEvidence.rosterExclusion.actualMapParticipant,'interz');
 assert.equal(rows[0].independentSeriesEvidence.rosterExclusion.platformSettlement,'unverified');
 assert.equal(rows[1].independentSeriesEvidence.rosterExclusion,undefined);
 assert.equal(summary.officialSettlementVerified,0);
});
