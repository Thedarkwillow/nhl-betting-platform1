'use strict';
const t=require('node:test'),assert=require('node:assert/strict'),{quotes,features}=require('../scripts/pickfinder-public-evidence-audit.cjs'),{aliases}=require('../scripts/pickfinder-public-model-validation.cjs');
const o={sport:'nba',detailId:'/players/nba/a?prop=x',eventId:'e',market:'player_points',line:5.5,observedAt:'2026-11-25T12:00:00Z'};
t('exact two-sided explicit threshold, no inferred line or stale quote',()=>{const a={...o,book:'draftkings',quoteLine:5.5,price:'-110',side:'Higher'},b={...a,side:'Lower'};assert.equal(quotes(o,[a,b],o.observedAt)[0].higher,.5);assert.equal(quotes(o,[a,{...b,quoteLine:null}],o.observedAt).length,0);assert.equal(quotes(o,[a,b],'2026-11-25T12:06:00Z').length,0);assert.equal(quotes(o,[a,b,{...a,price:'-120'}],o.observedAt).length,0);});
t('observed statistics stay separate from probabilities and contradictory cells are rejected',()=>{const a={...o,origin:'board',metric:'L10',value:'60%'};assert.equal(features(o,[a]).L10,.6);assert.equal(features(o,[a,{...a,value:'70%'}]).L10,undefined);assert.equal(features(o,[{...a,value:'60%\n1/10'}]).L10,undefined);assert.equal(aliases.player_points,'points');assert.equal(aliases.player_double_double,undefined);});

t('paired prospective comparisons exclude pushes and keep denominators paired',()=>{const {pairedStats}=require('../scripts/pickfinder-public-model-validation.cjs');const r={id:'a',market:'points',actual:8,result:'correct',modelEstimate:.6,modelProjection:7,pickfinderAverage:6,side:'Higher',quoteBenchmarks:[{higher:.5}]};const x=pairedStats([r,r,{...r,id:'b',result:'push'}]).points;assert.equal(x.decided,1);assert.equal(x.pairedAverageN,1);assert.equal(x.pickfinderAverageMAE,2);assert.equal(x.quoteBrier,.25);});

t('prospective comparison rejects conflicting and out-of-range grades',()=>{
 const {pairedStats}=require('../scripts/pickfinder-public-model-validation.cjs');
 const r={id:'a',market:'points',actual:8,result:'correct',modelEstimate:.6,side:'Higher'};
 assert.equal(pairedStats([r,{...r,result:'incorrect'}]).points,undefined);
 assert.equal(pairedStats([{...r,modelEstimate:1.2}]).points,undefined);
 const s=pairedStats([r,r]).points;assert.equal(s.decided,1);assert.ok(Math.abs(s.modelLogLoss+Math.log(.6))<1e-10);
});
t('NBA final history fallback requires official final status, teams and completed player statistics',()=>{
 const {finalHistory}=require('../scripts/pickfinder-public-model-validation.cjs');
 const startAt='2026-11-20T23:00:00Z',at='2026-11-22T00:00:00Z',gameId=22600001;
 const team=(abbr,id,score)=>({teamTricode:abbr,score,players:Array.from({length:5},(_,i)=>({personId:id+i,firstName:'Fixture',familyName:String(id+i),played:'1',statistics:{minutes:'PT25M30.00S',points:10,reboundsTotal:4,assists:2,threePointersMade:1,steals:1,blocks:0,turnovers:1}}))});
 const g={gameId,startAt,home:'BOS',away:'TOR',status:3};
 const d={game:{gameId:String(gameId),gameTimeUTC:startAt,gameStatus:3,homeTeam:team('BOS',10,110),awayTeam:team('TOR',20,100)}};
 const x=finalHistory(d,g,at,'a'.repeat(64));assert.equal(x.rows.length,10);assert.equal(x.rows[0].minutes,25.5);assert.equal(x.seasonCompletenessVerified,false);assert.equal(x.officialFinalClockVerified,true);
 assert.equal(finalHistory(d,{...g,status:2},at,'a'.repeat(64)),null);
 assert.equal(finalHistory(d,{...g,away:'NYK'},at,'a'.repeat(64)),null);
});

t('dated final fallback requires explicit ESPN final and unique official NBA game route',async()=>{
 const {datedFinalGames,recentFinalSchedule}=require('../scripts/pickfinder-public-model-validation.cjs');
 const date='2026-11-24',html='<a href="/game/tor-vs-bos-0022600001">Box Score</a>',event={competitions:[{date:'2026-11-24T23:00:00Z',status:{type:{name:'STATUS_FINAL',state:'post',completed:true}},competitors:[{homeAway:'home',team:{abbreviation:'BOS'}},{homeAway:'away',team:{abbreviation:'TOR'}}]}]};
 assert.equal(datedFinalGames(html,{events:[event]},date)[0].gameId,22600001);
 const preseason=html.replace('0022600001','0012600001');
 assert.equal(datedFinalGames(preseason,{events:[event]},date).length,0);
 assert.equal(datedFinalGames(preseason,{events:[event]},date,{historicalSeasonTypes:true})[0].gameId,12600001);
 assert.equal(datedFinalGames(preseason+' /game/tor-vs-bos-0042600001',{events:[event]},date,{historicalSeasonTypes:true}).length,0);
 assert.equal(datedFinalGames(html+' /game/tor-vs-bos-0022600002',{events:[event]},date).length,0);
 assert.equal(datedFinalGames(html,{events:[{competitions:[{...event.competitions[0],status:{type:{state:'pre'}}}]}]},date).length,0);
 const r=await recentFinalSchedule('2026-11-26T01:00:00Z',async url=>url.includes('www.nba.com')?new Response(html):new Response(JSON.stringify({events:[event]})));
 assert.equal(r.calls,4);assert.equal(r.games.length,1);assert.match(r.games[0].routeResponseSha256,/^[a-f0-9]{64}$/);
});

t('frozen pregame baseline uses identical independently decided rows for both scores',()=>{
 const {pairedStats}=require('../scripts/pickfinder-public-model-validation.cjs');
 const hit={id:'one',market:'points',actual:8,result:'correct',modelEstimate:.75,baselineEstimate:.5};
 const stats=pairedStats([hit,hit,{...hit,id:'two',baselineEstimate:null},{...hit,id:'three',result:'push'}]).points;
 assert.equal(stats.decided,2);
 assert.deepEqual(stats.frozenBaselineComparison,{decided:1,modelBrier:.0625,baselineBrier:.25,modelLogLoss:-Math.log(.75),baselineLogLoss:-Math.log(.5)});
 assert.equal(pairedStats([{...hit,baselineEstimate:2}]).points.frozenBaselineComparison.modelBrier,null);
});

t('matchup features require matching archived period, map range and game mode',()=>{
 const offer={...o,period:'series',mapRange:'maps_1_2',gameMode:'search'};
 const row={...offer,origin:'board',metric:'H2H',value:'70%'};
 assert.equal(features(offer,[row]).H2H,.7);
 for(const field of ['period','mapRange','gameMode']){
  assert.deepEqual(features(offer,[{...row,[field]:null}]),{});
  assert.deepEqual(features(offer,[{...row,[field]:'conflicting'}]),{});
 }
});

t('frozen low-count feature on/off pair shares the link and grades identical decisions',()=>{
 const {lowCountPair,pairedStats}=require('../scripts/pickfinder-public-model-validation.cjs');
 const pair=lowCountPair('steals',0.5,'Lower',1,3);
 assert.equal(pair.featureOff,Math.exp(-1));
 assert.equal(pair.featureOn,Math.exp(-2));
 assert.equal(lowCountPair('blocks',1,'Higher',2,1),null);
 assert.equal(lowCountPair('steals',0.5,'Higher',1,null),null);
 const r={market:'steals',id:'x',result:'correct',actual:0,modelEstimate:.6,lowCountPair:pair};
 const score=pairedStats([r,r,{...r,id:'legacy',lowCountPair:null},{...r,id:'p',result:'push'}]).steals.lowCountFeatureComparison;
 assert.equal(score.decided,1);
 assert.equal(score.modelLogLoss,2);
 assert.equal(score.baselineLogLoss,1);
});

t('official game page box score verifies both point totals and excludes DNPs',()=>{
 const {parsePage,url}=require('../scripts/nba-official-web-boxscore.cjs');
 const {finalHistory}=require('../scripts/pickfinder-public-model-validation.cjs');
 const game={gameId:'0022600001',gameStatus:3,gameStatusText:'Final',gameTimeUTC:'2026-11-20T23:00:00Z'};
 for(const [side,abbr,offset,points] of [['homeTeam','BOS',10,12],['awayTeam','TOR',20,9]]){
  const players=Array.from({length:5},(_,i)=>({personId:offset+i,firstName:'Player',familyName:String(offset+i),comment:'',statistics:{minutes:'48:00',points,reboundsTotal:1,assists:2,threePointersMade:0,steals:1,blocks:0,turnovers:1}}));
  players.push({personId:offset+5,comment:'DNP - Coach’s Decision',statistics:{minutes:'',points:0}});
  game[side]={teamTricode:abbr,score:5*points,players};
 }
 const html=()=>'<script type="application/json" id="__NEXT_DATA__">'+JSON.stringify({props:{pageProps:{game}}})+'</script>';
 const g={gameId:22600001,status:3,home:'BOS',away:'TOR',startAt:game.gameTimeUTC};
 assert.equal(url(g),'https://www.nba.com/game/tor-vs-bos-0022600001/box-score');
 assert.equal(finalHistory(parsePage(html()),g,'2026-11-22T00:00:00Z','a'.repeat(64)).rows.length,10);
 game.homeTeam.players[0].statistics.minutes='PT25M30.00S';
 assert.equal(finalHistory(parsePage(html()),g,'2026-11-22T00:00:00Z','a'.repeat(64)).rows[0].minutes,25.5);
 game.homeTeam.players[0].statistics.minutes='PT25M60S';
 assert.equal(parsePage(html()),null);
 game.homeTeam.players[0].statistics.minutes='PT25M30S';
 assert.equal(parsePage(html()+html()),null);
 game.homeTeam.score++;
 assert.equal(parsePage(html()),null);
 game.homeTeam.score--;
 game.awayTeam.players[0].personId=10;
 assert.equal(parsePage(html()),null);
});

t('official minute correction requires the reviewed game, player, team, raw token and source bytes',()=>{
 const {scorebookClock}=require('../scripts/nba-official-web-boxscore.cjs');
 const digest='cfae25f8920a7a7e6d0df27927a875344cada0ebf24a24be622c67f2fe8d9bbd';
 const args=['0022600041',203081,'POR','32:60',digest];
 assert.equal(scorebookClock(...args).minutes,'33:00');
 for(const [i,v] of [[0,'0022600042'],[1,1629057],[2,'SAC'],[3,'34:60'],[4,'a'.repeat(64)]]){
  const x=[...args]; x[i]=v;
  assert.equal(scorebookClock(...x),null);
 }
});

t('matchup challenger freezes a conservative same-offer pair and grades it independently',()=>{
 const {matchupSample}=require('../scripts/pickfinder-public-evidence-audit.cjs');
 const {matchupPair,pairedStats}=require('../scripts/pickfinder-public-model-validation.cjs');
 const offer={...o,detailId:'/players/nba/a?prop=id%3Aplayer_points%3Ae%3A5.5',player:'Fixture',
  book:'prizepicks',side:'Lower',startAt:'2026-11-25T20:00:00Z'};
 const obs={...offer,origin:'board',boardBook:offer.book,metric:'H2H',value:'75%\n3/4'};
 const sample=matchupSample(offer,[obs,obs]);
 assert.deepEqual(sample,{higher:3,games:4});
 assert.equal(matchupSample({...offer,line:7.5},[obs]),null);
 assert.equal(matchupSample(offer,[obs,{...obs,value:'50%\n2/4'}]),null);
 assert.equal(matchupSample(offer,[{...obs,value:'75%'}]),null);
 assert.equal(matchupSample(offer,[{...obs,value:'100%\n3/3'}]),null);
 assert.equal(matchupSample(offer,[{...obs,boardBook:'underdog'}]),null);
 const game={startAt:offer.startAt};
 assert.equal(matchupPair({...offer,startAt:null},game,.55,sample),null);
 assert.equal(matchupPair(offer,{startAt:'2026-11-25T20:06:00Z'},.55,sample),null);
 const pair=matchupPair(offer,game,.55,sample);
 assert.equal(pair.featureOff,1-.55);
 assert.equal(pair.featureOn,1-14/24);
 const grade={id:'verified',market:'points',actual:5,result:'correct',modelEstimate:.45,matchupPair:pair};
 const scores=pairedStats([grade,grade,{...grade,id:'push',result:'push'}]).points.matchupFeatureComparison;
 assert.equal(scores.decided,1);
 assert.equal(scores.modelBrier,(1-pair.featureOn)**2);
 assert.equal(scores.baselineBrier,(1-pair.featureOff)**2);
});

t('native workload challenger uses only previous games for the verified player team',()=>{
 const {workloadPair,pairedStats}=require('../scripts/pickfinder-public-model-validation.cjs');
 const previous=Array.from({length:16},(_,i)=>({gameDate:'2026-11-'+String(i+1).padStart(2,'0'),team:'PHI',
  threePointersMade:2,minutes:i<6?10:30}));
 const player={playerId:1,team:'PHI',market:'threePointersMade',line:1.5,offeredSide:'Higher'};
 const index=rows=>({players:new Map([[1,rows]])});
 const extra=[{team:'PHI',gameDate:'2026-11-25',threePointersMade:50,minutes:10},
  {team:'NYK',gameDate:'2026-11-24',threePointersMade:42,minutes:10}];
 const pair=workloadPair(index(previous),player,'2026-11-25');
 assert.equal(pair.historyGames,16);
 assert.ok(pair.featureOn>pair.featureOff);
 assert.deepEqual(workloadPair(index([...previous,...extra]),player,'2026-11-25'),pair);
 assert.equal(workloadPair(index(previous.slice(0,11)),player,'2026-11-25'),null);
 const grade={id:'workload',market:player.market,result:'incorrect',actual:1,modelEstimate:.6,workloadPair:pair};
 const scores=pairedStats([grade]).threePointersMade.workloadFeatureComparison;
 assert.equal(scores.decided,1);
 assert.equal(scores.modelBrier,pair.featureOn**2);
});

t('same scoped forecast cannot be frozen again under a new model revision',()=>{
 const {newForecastRows}=require('../scripts/pickfinder-public-model-validation.cjs');
 const row={book:'prizepicks',gameId:2,playerId:1,market:'points',line:5.5,tier:'standard',offeredSide:'Higher'};
 const other={...row,line:6.5};
 assert.deepEqual(newForecastRows([{...row,modelRevision:'new'},other,other],[{...row,modelRevision:'old'}]),[other]);
});

t('NBA availability distinguishes a committed official status from late, conflicting or missing evidence',async()=>{
 const {statusFor,collect}=require('../scripts/pickfinder-nba-official-availability.cjs');
 const startAt='2026-11-27T01:00:00Z',clock='2026-11-27T00:00:00Z',game={startAt,home:'PHI',away:'MIA',status:1};
 const date='2026-11-26',match='MIA@PHI',row={date,match,team:'PHI',player:'Example Player',status:'questionable'};
 const doc={kind:'nba_public_official_pregame_availability_v1',capturedAt:'2026-11-26T23:35:00Z',
  reportPublishedAt:'2026-11-26T23:30:00Z',
  sourceDocumentUrl:'https://ak-static.cms.nba.com/referee/injury/Injury-Report_2026-11-26_06_30PM.pdf',
  sourceResponseSha256:'a'.repeat(64),scopes:[JSON.stringify([date,match])],rows:[row],notSubmitted:[]};
 const f={doc,digest:'b'.repeat(64),first:'2026-11-26T23:36:00Z'},player={name:row.player,team:row.team};
 const status=statusFor([f],player,game,clock);
 assert.equal(status.status,'questionable');
 assert.equal(status.positiveParticipationVerified,false);
 assert.equal(statusFor([{...f,first:'2026-11-27T00:05:00Z'}],player,game,clock),null);
 assert.equal(statusFor([{...f,doc:{...doc,kind:'nba_historical_pickfinder_injury_report_comparison_v1'}}],player,game,clock),null);
 assert.equal(statusFor([f],{name:row.player,team:'MIA'},game,clock),null);
 assert.equal(statusFor([f,{...f,doc:{...doc,sourceResponseSha256:'c'.repeat(64)}}],player,game,clock),null);
 assert.equal(statusFor([{...f,doc:{...doc,rows:[],notSubmitted:[row]}}],player,game,clock),null);
 assert.deepEqual(await collect(null,[],clock,async()=>assert.fail('no requests on an empty slate')),
  {state:'no_verified_game_within_six_hours',calls:0});
 const html='<a href="'+doc.sourceDocumentUrl+'">Report</a>';
 assert.deepEqual(await collect({games:[game]},[f],clock,async()=>new Response(html)),
  {state:'committed_report_reused',calls:1});
});

t('reviewed NBA history blends only distinct independently known prior half-line results',()=>{
 const {reviewedHistoryPair,pairedStats}=require('../scripts/pickfinder-public-model-validation.cjs');
 const clock='2026-11-26T10:00:00Z';
 const row={gameId:99,gameStartAt:'2026-11-26T20:00:00Z',playerId:42,market:'points',line:19.5,offeredSide:'Lower',rawSelectedEstimate:.6};
 const fact=(eventId,value,knownAt='2026-11-26T09:00:00Z',extra={})=>({sport:'nba',playerId:'42',market:'points',eventId:String(eventId),
   officialStartAt:'2026-11-25T20:00:00Z',availableAt:knownAt,value,providerIdentityReviewed:true,
   reviewDigest:'1'.repeat(64),nativeDigest:'2'.repeat(64),profileDigest:'3'.repeat(64),...extra});
 const index=new Map(Object.entries({
   a:fact(1,10),b:fact(2,25),c:fact(3,10),d:fact(4,10,'2026-11-26T11:00:00Z'),
   e:fact(5,10,undefined,{officialStartAt:null}),f:fact(99,10),
   g:fact(6,10,undefined,{providerIdentityReviewed:false})
 }));
 const pair=reviewedHistoryPair(index,row,clock);
 assert.equal(pair.historyGames,3);
 assert.deepEqual(pair.facts.map(x=>x.eventId),['1','2','3']);
 assert.equal(pair.featureOff,.6);
 assert.equal(pair.featureOn,14/23);
 assert.equal(reviewedHistoryPair(index,{...row,line:20},clock),null);
 assert.equal(reviewedHistoryPair(index,row,'2026-11-26T08:00:00Z'),null);
 const base={id:'grade',market:'points',actual:10,result:'correct',modelEstimate:.6};
 const scores=pairedStats([base,{...base,id:'qualified',reviewedHistoryPair:pair}]).points.reviewedHistoryFeatureComparison;
 assert.equal(scores.decided,1);
 assert.equal(scores.evenBrier,.25);
 assert.equal(scores.evenLogLoss,Math.log(2));
 assert.equal(scores.baselineBrier,(1-.6)**2);
 assert.equal(scores.modelBrier,(1-14/23)**2);
 assert.equal(pairedStats([base]).points.reviewedHistoryFeatureComparison.decided,0);
});
