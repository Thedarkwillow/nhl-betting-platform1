"use strict";
// The NHL's web game log omits blocked shots and goalie saves. Stats REST
// exposes those official, per-game values with isGame=true.
const FIELDS={blockedShots:{endpoint:"skater/realtime",field:"blockedShots"},
 saves:{endpoint:"goalie/summary",field:"saves"}};
function normalizeStatsReport(payload,{playerId,season,market}){
 if(!FIELDS[market]||!/^\d{8}$/.test(season)||!/^\d+$/.test(String(playerId)))
  throw Error("Unsupported official NHL supplemental history request");
 if(!Array.isArray(payload?.data)||!Number.isInteger(payload.total)||payload.total<0)
  throw Error("NHL Stats REST missing report metadata or game rows");
 if(payload.total>payload.data.length)
  throw Error("NHL Stats REST truncated official game report; refuse partial historical inputs");
 const games=[],seen=new Set();
 for(const row of payload.data){
  const id=Number(row.gameId),date=row.gameDate,value=row[FIELDS[market].field];
  if(String(row.playerId)!==String(playerId)||!Number.isInteger(id)||
   !/^\d{4}-\d{2}-\d{2}$/.test(date||"")||!Number.isInteger(value)||value<0)
   throw Error("NHL Stats REST returned invalid player/game/stat identity");
  if(seen.has(id))throw Error("NHL Stats REST duplicated same official player game");
  seen.add(id);
  games.push({gameId:id,gameDate:date,season:season.slice(0,4)+"-"+season.slice(6),
   market,value});
 }
 return games;
}
function mergeOfficialGameStats(base,extra){
 const output=(base||[]).map(g=>({...g})),byId=new Map(output.map(g=>[String(g.gameId),g]));
 for(const item of extra||[]){
  if(!FIELDS[item.market]||!Number.isInteger(item.value)||!item.gameDate||!Number.isInteger(item.gameId))
   throw Error("Bad official NHL supplementary game stat");
  const id=String(item.gameId);let row=byId.get(id);
  if(row){
   if(row.gameDate!==item.gameDate)throw Error("Conflicting NHL official game dates for player history");
   if(Number.isFinite(row[item.market])&&row[item.market]!==item.value)
    throw Error("Conflicting NHL official game stats for player history");
  }else{
   row={gameId:item.gameId,gameDate:item.gameDate,season:item.season,
    goals:null,assists:null,points:null,shotsOnGoal:null,blockedShots:null,saves:null};
   output.push(row);byId.set(id,row);
  }
  row[item.market]=item.value;
 }
 return output.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
}
module.exports={FIELDS,normalizeStatsReport,mergeOfficialGameStats};
