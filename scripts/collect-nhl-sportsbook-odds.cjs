"use strict";
const fs=require("node:fs");
const key=process.env.ODDS_API_KEY;
const BOOKS={draftkings:"DraftKings",fanduel:"FanDuel",betmgm:"BetMGM",caesars:"Caesars"};
const MARKETS={player_shots_on_goal:"shotsOnGoal",player_goals:"goals",player_assists:"assists",player_points:"points",player_blocked_shots:"blockedShots",player_total_saves:"saves"};
const endpoint="https://api.the-odds-api.com/v4/sports/icehockey_nhl";
async function get(path,params={}){
 const url=new URL(endpoint+path);
 for(const [k,v] of Object.entries({...params,apiKey:key}))url.searchParams.set(k,v);
 const res=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!res.ok)throw Error("Odds API HTTP "+res.status+" at "+path);
 return res.json();
}
function normalizeEvent(data,now=new Date().toISOString()){
 const rows=[];
 for(const book of data.bookmakers||[]){
  if(!BOOKS[book.key])continue;
  for(const market of book.markets||[]){
   if(!MARKETS[market.key])continue;
   const pairs=new Map();
   for(const outcome of market.outcomes||[]){
    if(!["Over","Under"].includes(outcome.name)||!outcome.description||!Number.isFinite(outcome.point)||!Number.isFinite(outcome.price))continue;
    const k=[outcome.description,market.key,outcome.point].join("|");
    if(!pairs.has(k))pairs.set(k,{player:outcome.description,market:MARKETS[market.key],line:outcome.point});
    pairs.get(k)[outcome.name==="Over"?"overOdds":"underOdds"]=outcome.price;
   }
   for(const pair of pairs.values()){
    if(!Number.isFinite(pair.overOdds)||!Number.isFinite(pair.underOdds))continue;
    rows.push({...pair,book:BOOKS[book.key],bookKey:book.key,eventId:data.id,homeTeam:data.home_team,awayTeam:data.away_team,commenceTime:data.commence_time,capturedAt:now,marketUpdatedAt:market.last_update||null,source:"The Odds API"});
   }
  }
 }
 return rows;
}
async function main(){
 if(!key)throw Error("ODDS_API_KEY not configured; no sportsbook quotes collected");
 const events=await get("/events",{dateFormat:"iso"});
 const maxEvents=Math.min(20,Math.max(1,Number(process.env.ODDS_MAX_EVENTS)||10));
 const rows=[],errors=[];
 for(const event of events.filter(e=>Date.parse(e.commence_time)>Date.now()).slice(0,maxEvents)){
  try{
   const data=await get("/events/"+encodeURIComponent(event.id)+"/odds",{regions:"us,us2",bookmakers:Object.keys(BOOKS).join(","),markets:Object.keys(MARKETS).join(","),oddsFormat:"american"});
   rows.push(...normalizeEvent(data));
  }catch(e){errors.push({eventId:event.id,error:e.message});}
 }
 const report={schemaVersion:1,source:"The Odds API",generatedAt:new Date().toISOString(),requestedBooks:Object.values(BOOKS),eventCount:Math.min(events.length,maxEvents),quotes:rows.length,errors,complete:errors.length===0,rows};
 fs.mkdirSync("outputs/sportsbooks/snapshots",{recursive:true});
 const stamp=new Date().toISOString().replace(/[-:.]/g,"").replace(/\..*/,"Z");
 fs.writeFileSync("outputs/sportsbooks/latest.json",JSON.stringify(report,null,2)+"\n");
 fs.writeFileSync("outputs/sportsbooks/snapshots/"+stamp+".json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({quotes:rows.length,byBook:Object.fromEntries(Object.values(BOOKS).map(b=>[b,rows.filter(x=>x.book===b).length])),errors:errors.length}));
 if(errors.length)process.exitCode=1;
}
if(require.main===module)main();
module.exports={normalizeEvent};
