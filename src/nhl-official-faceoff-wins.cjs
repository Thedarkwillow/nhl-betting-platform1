"use strict";
/**
 * Official NHL Stats REST faceoffwins per-game supplement. The gamecenter
 * boxscore commonly supplies only faceoffWinningPctg; that PERCENT cannot be
 * used to fabricate the exact number of faceoffs won.
 * Network access is supplied by the official NHL collector, never this module.
 */
const MAX_RECORDS=200;
function faceoffsReportUrl(gameId){
 if(!Number.isInteger(gameId)||gameId<1000000000||gameId>9999999999)
  throw Error("Invalid official NHL game ID");
 const base="https://api.nhle.com/stats/rest/en/skater/faceoffwins";
 const params=new URLSearchParams({
  isAggregate:"false",isGame:"true",start:"0",limit:String(MAX_RECORDS),
  cayenneExp:"gameId="+gameId
 });
 return base+"?"+params.toString();
}
function normalizeOfficialFaceoffWins(report,{gameId}={}){
 if(!Number.isInteger(gameId)||!Array.isArray(report?.data)||
   !Number.isInteger(report?.total)||report.total<0||
   report.total>report.data.length||report.data.length>MAX_RECORDS)
  throw Error("Missing/incomplete official NHL faceoffwins report");
 const out=new Map();
 for(const record of report.data){
  const id=Number(record.playerId),foundGame=Number(record.gameId);
  // Verified against 2026-10-17 /skater/faceoffwins?isGame=true:
  // totalFaceoffWins is the NHL Stats REST game-count field.
  // Do NOT substitute ppFaceoffsWon, evFaceoffsWon or percentage.
  const value=record.totalFaceoffWins;
  if(!Number.isInteger(id)||id<=0||foundGame!==gameId||
    !Number.isInteger(value)||value<0||out.has(id))
   throw Error("Ambiguous official game/player exact faceoff wins");
  out.set(id,value);
 }
 return out;
}
function mergeOfficialFaceoffs(players,wins,{gameId}={}){
 if(!Array.isArray(players)||!(wins instanceof Map)||!Number.isInteger(gameId))
  throw Error("Require official player-game rows and exact wins map");
 const ids=new Set(),result=[];
 for(const p of players){
  if(p.gameId!==gameId||!Number.isInteger(p.playerId)||
    ids.has(p.playerId))throw Error("Invalid player identity in NHL faceoff merge");
  ids.add(p.playerId);
  const count=p.type==="skater"?wins.get(p.playerId):undefined;
  // An absent row is UNKNOWN: it is NOT proof of zero faceoff wins.
  if(count!==undefined&&(!Number.isInteger(count)||count<0))
   throw Error("Faceoff value is not an official exact nonnegative count");
  if(count!==undefined&&p.faceoffsWon!==null&&p.faceoffsWon!==undefined&&
    p.faceoffsWon!==count)
   throw Error("Official gamecenter/Stats REST faceoff disagreement");
  result.push({...p,faceoffsWon:p.type==="skater"?
   (count===undefined?(p.faceoffsWon??null):count):null});
 }
 // Do not accept player IDs not present in same official final boxscore.
 for(const id of wins.keys())if(!ids.has(id))
  throw Error("Faceoff report player missing official final boxscore");
 return result;
}
module.exports={MAX_RECORDS,faceoffsReportUrl,normalizeOfficialFaceoffWins,
 mergeOfficialFaceoffs};
