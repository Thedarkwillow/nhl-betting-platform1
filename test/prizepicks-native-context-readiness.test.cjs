'use strict';
const t=require('node:test'),a=require('node:assert/strict');
const {build,report}=require('../scripts/prizepicks-native-context-readiness.cjs');
const clock='2026-11-25T16:30:00Z',observedAt='2026-11-25T16:00:00Z',startAt='2026-11-26T01:00:00Z',first='2026-11-25T16:01:00Z',h='a'.repeat(64),revision='b'.repeat(40);
const wrap=(doc)=>({doc:{observedAt,...doc},digest:h,first,commit:revision});
const game={eventId:'100',status:'pre',startAt,teams:[{id:'AAA',abbr:'AAA'},{id:'BBB',abbr:'BBB'}]};
const player={playerId:'7',name:'Fixture Player',team:'AAA',teamId:'AAA',position:'C'};
const facts=[wrap({sport:'nhl',source:'nhl:official',events:[game],roster:[player],proofs:[{url:'https://api-web.nhle.com/v1/schedule/2026-11-25',observedAt,digest:h},{url:'https://api-web.nhle.com/v1/roster/AAA/20262027',observedAt,digest:h,teamId:'AAA'}]})];
const nhlFinals=[wrap({games:Array.from({length:6},(_,i)=>({sourceDigest:h,event:{completed:true,status:'post',eventId:String(i+1),startAt:'2026-11-0'+(i+1)+'T00:00:00Z'},observedAt,rows:[{playerId:'7',appeared:true,stats:{sog:3}}]}))})];
const args={facts,nhlFinals,nflSeasons:[],archive:{invalid:[],latest:[]},clock,revision};
t('builds scoped native NHL context from independent facts and five prior finals',()=>{
 const ctx=build(args);a.equal(ctx.scopes.length,1);a.equal(ctx.scopes[0].history.games.length,6);a.equal(ctx.scopes[0].history.playerId,7);a.equal(ctx.scopes[0].opponent,'BBB');a.equal(ctx.scopes[0].pickfinder,undefined);a.equal(ctx.status.NHL.eligibleContextScopes,1);
 const r=report(ctx);a.equal(r.paidCaptureReady,false);a.equal(r.qualifiedPaperLineups,0);a.equal(r.storageAuthorized,false);a.equal(r.status.CS2.eligibleContextScopes,0);
});
t('stale source, ambiguous roster, missing source proof, or insufficient history abstain',()=>{
 for(const f of [
 {...facts[0],doc:{...facts[0].doc,observedAt:'2026-11-25T12:00:00Z'}},
 {...facts[0],doc:{...facts[0].doc,roster:[player,{...player,playerId:'8'}]}},
 {...facts[0],doc:{...facts[0].doc,proofs:[]}},
 {...facts[0],doc:{...facts[0].doc,roster:[{...player,position:'G'}]}}
 ])a.equal(build({...args,facts:[f]}).scopes.length,0);
 a.equal(build({...args,nhlFinals:[]}).scopes.length,0);
 a.throws(()=>build({...args,archive:{invalid:['bad'],latest:[]}}));
});
t('NFL needs independent ESPN to GSIS exact event and weekly roster plus prior history',()=>{
 const nGame={eventId:'123',status:'pre',startAt,teams:[{id:'1',abbr:'AAA'},{id:'2',abbr:'BBB'}]};
 const nflFacts=[wrap({sport:'nfl',source:'espn:nfl',events:[nGame],roster:[{...player,teamId:'1',position:'QB'}],proofs:[{url:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=20261125',observedAt,digest:h},{url:'https://site.api.espn.com/apis/site/v2/sports/football/nfl/teams/1/roster',observedAt,digest:h,teamId:'1'}]})];
 const nflSeasons=[2024,2025,2026].map(season=>wrap({season,games:[...Array.from({length:5},(_,i)=>({gameId:season+'_'+i,week:i+1,startAt:season+'-09-0'+(i+1)+'T00:00:00Z',home:'AAA',away:'BBB',completedScoreObserved:true})),...(season===2026?[{gameId:'2026_12_BBB_AAA',season,week:12,espnEventId:'123',startAt,home:'AAA',away:'BBB',completedScoreObserved:false}]:[])],rosters:[{week:12,espnId:'7',gsisId:'00-1234567',team:'AAA',name:player.name}],playerRows:Array.from({length:5},(_,i)=>({gameId:season+'_'+i,playerId:'00-1234567',week:i+1,gameStartAt:season+'-09-0'+(i+1)+'T00:00:00Z',team:'AAA',opponent:'BBB',stats:{attempts:30,passing_yards:250}}))}));
 const c=build({...args,facts:nflFacts,nflSeasons});a.equal(c.scopes.length,1);a.equal(c.scopes[0].playerId,'00-1234567');a.equal(c.scopes[0].history.length,15);a.equal(c.scopes[0].position,'QB');a.equal(c.scopes[0].kickerParticipationVerified,undefined);
 a.equal(build({...args,facts:nflFacts,nflSeasons:nflSeasons.slice(0,2)}).scopes.length,0);
});
