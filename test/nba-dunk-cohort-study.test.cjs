"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),{normalizeIdentity,normalizeLogs,evaluate,compare}=require("../scripts/run-nba-dunk-cohort-study.cjs");
test("provider identity must match exact normalized name uniquely",()=>{
 const d={data:{count:1,players:[{name:"Nikola Jokić",player_id:"3112335"}]}};
 assert.equal(normalizeIdentity(d,"Nikola Jokic").providerPlayerId,"3112335");
 assert.throws(()=>normalizeIdentity(d,"Other Player"));
});
function sample(){
 const games=Array.from({length:24},(_,i)=>({game_id:String(i+1),date:"2026-01-"+String(i+1).padStart(2,"0"),season:2026,season_type:2,opponent:i%2?"BOS":"WAS",did_not_play:false,minutes:30+i%5,pts:15+i%10,reb:8,ast:5,tpm:2,fga:17,fta:5,tov:2,home:true}));
 const raw={data:{player_id:"3112335",count:games.length,games}};
 const history={kind:"nba_dunkapi_historical_market_research_v1",request:{player_id:"3112335",market:"player_points"},rows:games.map(g=>({providerGameId:g.game_id,gameDate:g.date,actual:g.pts,closingLine:20.5,overOdds:-110,underOdds:-110}))};
 return {raw,history};
}
test("full game log rejects incomplete pagination and excludes DNP without inventing zero",()=>{
 const {raw}=sample();const x=normalizeLogs(raw,"3112335",2026);assert.equal(x.rows.length,24);
 raw.data.next_offset=24;assert.throws(()=>normalizeLogs(raw,"3112335",2026));
 delete raw.data.next_offset;raw.data.games[0].did_not_play=true;raw.data.games[0].minutes=null;
 assert.equal(normalizeLogs(raw,"3112335",2026).rows.length,23);
});
test("exact provider game and actual reconciliation, strictly earlier features",()=>{
 const {raw,history}=sample(),log=normalizeLogs(raw,"3112335",2026);
 const a=evaluate(log,history);assert.equal(a.excluded.warmup,12);assert.equal(a.rows.length,12);assert.equal(a.rows[0].marketHigher,.5);
 const x=a.rows[0],target=log.rows.find(g=>g.gameId===x.gameId);target.minutes=60;target.usageProxyPerMinute=999;
 const b=evaluate(log,history);assert.equal(b.rows[0].expectedMinutes,x.expectedMinutes);assert.equal(b.rows[0].priorUsageProxyPerMinute,x.priorUsageProxyPerMinute);
 history.rows[12].actual=999;assert.equal(evaluate(log,history).excluded.identityOrActual,1);
});
test("holdout data cannot alter development-selected weight; duplicate outcomes rejected",()=>{
 const {raw,history}=sample(),a=evaluate(normalizeLogs(raw,"3112335",2026),history).rows;
 const split="2026-01-19",x=compare(a,split),y=compare(a.map(r=>r.date>=split?{...r,y:1-r.y}:r),split);
 assert.equal(x.selectedWeight,y.selectedWeight);assert.equal(x.developmentRows,6);assert.equal(x.holdoutRows,6);assert.equal(x.prospectiveApproval,false);
 assert.throws(()=>compare([...a,a[0]],split));
});
