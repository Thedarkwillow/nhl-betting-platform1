"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {prepare,injuryStatus,extended,replay,compare}=require("../src/nba-sdv-context-replay-v1.cjs");
function fixture(){
 const boxScores=[],injuries=[];
 for(let i=1;i<=16;i++){
 const date="2026-01-"+String(i).padStart(2,"0"),tip=date+"T23:00:00Z",gameId=String(i);
 for(const team of ["A","B"])for(let j=0;j<5;j++){
 const opponent=team==="A"?"B":"A";
 boxScores.push({date,tip,gameId,playerId:team+j,player:team+j,team,teamName:team,teamId:team,opponent,opponentId:opponent,minutes:48,points:10+j+i%4,rebounds:5,assists:4,threePointersMade:2,fga:10+j,fta:4,tov:2,orb:1,starter:true,position:"C"});
 }
 injuries.push({date,reportAt:date+"T21:00:00Z",matchup:"B@A",teamName:"A",nbaGameId:gameId,playerId:"A4",status:i%2?"Out":"Available",identityMatched:true,notSubmitted:false});
 }
 return {kind:"nba_sdv_research_context_v1",boxScores,injuries};
}
test("all extended challengers use only prior game statistics",()=>{
 const d=fixture(),ctx=prepare(d),t=ctx.games.get("16")[0],a=extended(ctx,t,12.5,"player_points");
 for(const k of ["minutesP","roleP","usageP","usageRateP","paceP","defenseOnlyP","positionalP","teammateP"])assert.ok(Number.isFinite(a[k]),k);
 const b=prepare({...d,boxScores:d.boxScores.map(r=>r.date===t.date?{...r,points:999,position:"G",fga:200}:r)});
 assert.deepEqual(extended(b,b.games.get("16")[0],12.5,"player_points"),a);
});
test("injury reports must be pre-cutoff, explicit, matched and submitted",()=>{
 const d=fixture(),t=prepare(d).games.get("16")[0];assert.equal(injuryStatus(prepare(d),t,"A4"),"Available");
 const late={date:t.date,reportAt:t.date+"T22:30:00Z",matchup:"B@A",teamName:"A",nbaGameId:"16",playerId:"A4",status:"Out",identityMatched:true};
 assert.equal(injuryStatus(prepare({...d,injuries:[...d.injuries,late]}),t,"A4"),"Available");
 assert.equal(injuryStatus(prepare({...d,injuries:[]}),t,"A4"),null);
 assert.equal(injuryStatus(prepare({...d,injuries:d.injuries.map(r=>({...r,notSubmitted:true}))}),t,"A4"),null);
});
test("archive replay requires player/game/date/name/actual match and refuses duplicate lines",()=>{
 const ctx=prepare(fixture()),t=ctx.games.get("16")[0];
 const h={kind:"nba_dunkapi_historical_market_research_v1",providerReportedTruncated:false,request:{market:"player_points",player_id:"A0",from_date:"2026-01-01",to_date:"2026-01-31"},rows:[{providerGameId:"16",providerPlayerId:"A0",player:"A0",gameDate:t.date,market:"player_points",actual:t.points,closingLine:12.5,overOdds:-110,underOdds:-110}]};
 const r=replay(ctx,[h]);assert.equal(r.rows.length,1);assert.equal(r.prospectiveApproval,false);
 assert.equal(compare(r.rows).markets.player_points.features.positionalP.candidate.n,1);
 assert.equal(replay(ctx,[{...h,rows:[{...h.rows[0],actual:999}]}]).excluded.unmatched,1);
 assert.throws(()=>replay(ctx,[h,h]));
});
