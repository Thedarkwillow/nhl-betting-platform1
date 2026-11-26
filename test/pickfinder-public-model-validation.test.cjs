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
 assert.equal(datedFinalGames(html+' /game/tor-vs-bos-0022600002',{events:[event]},date).length,0);
 assert.equal(datedFinalGames(html,{events:[{competitions:[{...event.competitions[0],status:{type:{state:'pre'}}}]}]},date).length,0);
 const r=await recentFinalSchedule('2026-11-26T01:00:00Z',async url=>url.includes('www.nba.com')?new Response(html):new Response(JSON.stringify({events:[event]})));
 assert.equal(r.calls,4);assert.equal(r.games.length,1);assert.match(r.games[0].routeResponseSha256,/^[a-f0-9]{64}$/);
});
