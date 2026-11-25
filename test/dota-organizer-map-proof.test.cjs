"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict"),{audit,proof}=require("../scripts/dota-organizer-map-proof.cjs");
function fixture(){
 const g=(id,n,winner)=>({provider:"opendota",title:"DOTA2",providerGameId:id,leagueId:proof.leagueId,providerSeriesId:proof.seriesId,providerSeriesType:1,teamIds:["1","2"],winnerTeamId:winner,startAt:new Date(n*3600000).toISOString(),endAt:new Date(n*3600000+2914000).toISOString(),providerReportedFinal:true,durationSeconds:2914,teamScores:[31,17]});
 const rows=[g(proof.mapId,1,"1"),g("123",2,"2"),g("456",3,"1")];
 const players=proof.kda.flatMap((t,i)=>t.map(([kills,deaths,assists],j)=>({provider:"opendota",title:"DOTA2",providerMatchId:proof.mapId,providerPlayerId:String(i*5+j+1),teamId:String(i+1),stats:{kills,deaths,assists}})));
 return {kind:"restricted_esports_free_provider_observations_v1",opendota:{index:rows,games:[{game:{...rows[0]},players}]}};
}
test("exact organizer map facts and KDA establish only scoped ordinal",()=>{const r=audit(fixture());assert.equal(r.organizerVerifiedMapOrdinals,1);assert.equal(r.organizerKdaCorroboratedRows,10);assert.equal(r.remainingUnverifiedOrdinals,2);assert.equal(r.completeSeriesIndependentlyVerified,false);assert.equal(r.playerIdentityCrosswalkVerified,false);});
test("reject changed stats, map order, score, and duplicate player IDs",()=>{for(const change of [d=>d.opendota.games[0].players[0].stats.kills++,d=>d.opendota.index[0].startAt=new Date(4*3600000).toISOString(),d=>d.opendota.index[0].teamScores=[17,31],d=>d.opendota.games[0].players[1].providerPlayerId="1"]){const d=fixture();change(d);assert.throws(()=>audit(d));}});
