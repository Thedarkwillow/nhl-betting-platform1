"use strict";
const fs=require("node:fs");
const {convert}=require("./import-pickfinder-csv.cjs");
const raw=JSON.parse(fs.readFileSync("outputs/prizepicks/nhl-raw-latest.json","utf8"));
const history=JSON.parse(fs.readFileSync("outputs/history/players.json","utf8"));
const marketMap={
 "shots on goal":"Shots on Goal","sog":"Shots on Goal","goals":"Goals",
 "points":"Points","assists":"Assists","blocked shots":"Blocked Shots",
 "blocks":"Blocked Shots","goalie saves":"Goalie Saves","saves":"Goalie Saves"
};
const excluded=[],safe=[];
for(const r of raw.rows){
 const market=marketMap[String(r.market).trim().toLowerCase()];
 if(r.isLive===true){excluded.push({row:r,reason:"live prop excluded from pregame comparison"});continue;}
 if(r.tier&&/goblin|demon|discount|special|promo/i.test(r.tier)){excluded.push({row:r,reason:"special payout tier needs separate evaluation"});continue;}
 if(!market){excluded.push({row:r,reason:"market not yet modeled"});continue;}
 safe.push({league:"NHL",player:r.player,team:r.team||"",prop_type:market,line:r.line,
  matchup:r.matchup||"",extracted_at_utc:r.capturedAt||raw.capturedAt});
}
const result=convert(safe,history);
result.lines=result.lines.map(line=>({...line,source:"PrizePicks"}));
result.excluded.push(...excluded);
result.summary={...result.summary,rawRows:raw.rows.length,unsupportedOrLive:excluded.length,complete:raw.complete===true};
result.capturedAt=raw.capturedAt;
result.categoriesVisited=raw.categoriesVisited;
fs.writeFileSync("outputs/prizepicks/nhl-import-latest.json",JSON.stringify(result,null,2)+"\n");
fs.writeFileSync("outputs/prizepicks/nhl-lines-latest.json",JSON.stringify({lines:result.lines},null,2)+"\n");
console.log(JSON.stringify(result.summary));
if(!result.lines.length)console.warn("No safe matched pregame props. Inspect import report; do not assume empty board.");
