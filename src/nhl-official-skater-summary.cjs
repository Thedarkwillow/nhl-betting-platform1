"use strict";
/**
 * Game-specific official NHL Stats REST skater/summary data. Power-play
 * points are not interchangeable with power-play goals. Full-game Plus/Minus
 * is signed and cannot be modeled as a Poisson count.
 */
const MAX_RECORDS=200;
function skaterSummaryUrl(gameId){
 if(!Number.isInteger(gameId)||gameId<1000000000||gameId>9999999999)
  throw Error("Invalid official NHL game ID");
 const params=new URLSearchParams({isAggregate:"false",isGame:"true",
  start:"0",limit:String(MAX_RECORDS),cayenneExp:"gameId="+gameId});
 return "https://api.nhle.com/stats/rest/en/skater/summary?"+params.toString();
}
function normalizeOfficialSkaterSummary(data,{gameId}={}){
 if(!Number.isInteger(gameId)||!Array.isArray(data?.data)||
  !Number.isInteger(data.total)||data.total<0||
  data.total>data.data.length||data.data.length>MAX_RECORDS)
  throw Error("Missing/incomplete NHL official skater summary");
 const out=new Map();
 for(const row of data.data){
  const id=Number(row.playerId),pp=row.ppPoints,plusMinus=row.plusMinus;
  if(!Number.isInteger(id)||id<=0||Number(row.gameId)!==gameId||
   !Number.isInteger(pp)||pp<0||!Number.isInteger(plusMinus)||
   out.has(id))throw Error("Invalid official skater per-game stat identity");
  out.set(id,{powerPlayPoints:pp,plusMinus});
 }
 return out;
}
function mergeOfficialSkaterSummary(players,summary,{gameId}={}){
 if(!Number.isInteger(gameId)||!Array.isArray(players)||
  !(summary instanceof Map))throw Error("Missing skater merge identity");
 const seen=new Set();
 const result=players.map(row=>{
  if(row.gameId!==gameId||!Number.isInteger(row.playerId)||
   seen.has(row.playerId))throw Error("Ambiguous player in skater final boxscore");
  seen.add(row.playerId);
  if(row.type!=="skater")return row;
  const stat=summary.get(row.playerId);
  if(!stat)return row;
  if(Number.isInteger(row.plusMinus)&&row.plusMinus!==stat.plusMinus)
   throw Error("Official NHL skater plus-minus source disagreement");
  if(stat.powerPlayPoints>row.points&&Number.isInteger(row.points))
   throw Error("Power play points exceed official total player points");
  return {...row,powerPlayPoints:stat.powerPlayPoints,plusMinus:stat.plusMinus};
 });
 for(const id of summary.keys())if(!seen.has(id))
  throw Error("Skater summary entry missing original NHL final boxscore");
 return result;
}
module.exports={MAX_RECORDS,skaterSummaryUrl,
 normalizeOfficialSkaterSummary,mergeOfficialSkaterSummary};
