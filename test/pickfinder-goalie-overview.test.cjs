'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),{schema,reconcile}=require('../scripts/pickfinder-goalie-overview.cjs');
test('goalie overview requires exact independent final, venue, paired totals and multi-game identity',()=>{
 const digest='a'.repeat(64),first='2026-11-27T12:00:00Z',observedAt='2026-11-27T11:00:00Z',id='123',team='UTA';
 const roster={doc:{sport:'nhl',source:'nhl:official',roster:[{playerId:id,name:'Sample Goalie',position:'G',team}]},first,digest};
 const events=['25','24','23'].map((d,i)=>({event:String(i),start:'2026-11-'+d+'T12:00:00Z',dates:['2026-11-'+d],team,opp:'MIN',stats:{saves:21+i,goalsAgainst:3},first,digest}));
 const schedule={doc:{games:events.map(g=>({sourceDigest:digest,event:{namespace:'nhl:official',eventId:g.event,completed:true,status:'post',teams:[{abbr:team,homeAway:'away'}]}}))},first,digest};
 const index={names:new Map([['["nhl","sample goalie"]',new Set([id])]]),byPlayer:new Map([[JSON.stringify(['nhl',id]),events]])};
 const p={authenticated:true,player:'Sample Goalie',team,position:'G',playerPath:'/players/nhl/exact',observedAt,gameLogLabel:'Gamelog - Last 15 Games',
  headers:['Date','Opponent','TOI','Save','GA','Shots-Faced','1P Save'],rows:[['11/25','@MIN','60','21','3','24'],['11/24','@MIN','60','22','3','25'],['11/23','MIN','60','23','3','26']]};
 const run=(patch={},rows=[])=>reconcile([{doc:{schema,records:[{...p,...patch}]},digest,first}],index,[roster],[schedule],{rows},first);
 const out=run();
 assert.equal(out.noGame,1);assert.deepEqual(out.statistics.map(x=>[x.market,x.value]),[['saves',21],['goalsAgainst',3],['saves',22],['goalsAgainst',3]]);
 assert.ok(out.statistics.every(r=>r.shadowResearchEligible&&!r.productionModelEligible&&!r.operatorOfferVerified&&!r.settlementVerified));
 assert.equal(run({rows:[p.rows[0],p.rows[0]]}).statistics.length,0);
 assert.equal(run({rows:[p.rows[0],['11/24','@MIN','60','22','4','26']]}).statistics.length,0);
 assert.equal(run({headers:[...p.headers,'Save']}).statistics.length,0);
 assert.equal(run({observedAt:'2026-11-28T00:00:00Z'}).statistics.length,0);
 assert.equal(run({},[{sourcePlayerPath:p.playerPath,playerId:'456'}]).statistics.length,0);
});
