'use strict';
// Only retrospective aggregate statistics. No board, forecasts, freeze, or provider calls.
const fs=require('node:fs'),nba=require('../src/nba-research-pipeline-v1.cjs');
function evaluate(doc){
 if(doc?.kind!=='nba_alternate_mirror_model_input_v1'||!Array.isArray(doc.rows)||!doc.rows.length)throw Error('mirror history schema');
 const valid=new Set(),stat=['points','rebounds','assists','threePointersMade','steals','blocks','turnovers'];
 for(const r of doc.rows){
  if(!Number.isSafeInteger(r.gameId)||!Number.isSafeInteger(r.playerId)||r.playerId<=0||!/^\d{4}-\d{2}-\d{2}$/.test(r.gameDate)||!Number.isFinite(Date.parse(r.gameDate))||!Number.isFinite(r.minutes)||r.minutes<=0||r.minutes>70||!stat.every(k=>Number.isInteger(r[k])&&r[k]>=0)||r.pointsReboundsAssists!==r.points+r.rebounds+r.assists||r.pointsRebounds!==r.points+r.rebounds||r.pointsAssists!==r.points+r.assists||r.reboundsAssists!==r.rebounds+r.assists)throw Error('invalid mirror row');
  const k=r.gameId+'|'+r.playerId;if(valid.has(k))throw Error('duplicate');valid.add(k);
 }
 const h=nba.indexHistory([{rows:doc.rows}]),result=nba.backtest(h);
 return {kind:'nba_alternate_mirror_model_evaluation_v1',status:'observed',inputPlayerGames:h.rows.length,uniquePlayers:h.players.size,uniqueGames:new Set(h.rows.map(r=>r.gameId)).size,source:'NBA Stats-derived SportsDataverse mirror, owner-attested permission',rawRowsPublished:0,officialFinalClockVerified:false,originalPlatformLinesUsed:false,modelApproved:false,retrospective:result};
}
if(require.main===module)try{const doc=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(evaluate(doc)));}catch{console.error('Alternate NBA model evaluation failed closed');process.exitCode=1;}
module.exports={evaluate};
