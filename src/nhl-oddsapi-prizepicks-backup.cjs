"use strict";
/**
 * Provider-labelled PrizePicks backup. Not official PrizePicks API.
 * Do not infer verified Goblin/Demon tier or payout from flat DFS odds.
 * Never use partial NHL-event scope as a complete league board.
 */
const {nameKey,canonicalTeam}=require("./nhl-pregame-intel.cjs");
const {matchEvent}=require("./nhl-oddsapi-underdog.cjs");
const MARKETS=Object.freeze({
 player_shots_on_goal:"Shots On Goal",
 player_points:"Points",
 player_assists:"Assists",
 player_blocked_shots:"Blocked Shots",
 player_goals:"Goals",
 player_total_saves:"Goalie Saves",
 player_shots_on_goal_alternate:"Shots On Goal",
 player_points_alternate:"Points"
});
const time=s=>typeof s==="string"&&Number.isFinite(Date.parse(s))?Date.parse(s):null;
function normalizePrizePicksOddsApiEvent(doc,schedule,projections,now=new Date().toISOString()){
 const at=time(now),g=matchEvent(doc,schedule,now);
 const rows=[],issues={invalidEvent:0,missingBook:0,unsupportedMarket:0,
  staleMarket:0,ambiguousPlayer:0,badQuote:0,conflictingSide:0};
 if(!g||!at){issues.invalidEvent++;return {rows,issues,gameId:null};}
 const books=(doc.bookmakers||[]).filter(b=>b.key==="prizepicks");
 if(books.length!==1){issues.missingBook++;return {rows,issues,gameId:g.id};}
 const players=new Map();
 for(const p of Object.values(projections?.players||{})){
  if(!Number.isInteger(p.playerId)||!["skater","goalie"].includes(p.type))continue;
  if(![canonicalTeam(g.home),canonicalTeam(g.away)].includes(canonicalTeam(p.team)))continue;
  const k=nameKey(p.name),a=players.get(k)||[];
  a.push(p);players.set(k,a);
 }
 const dedup=new Map(),conflict=new Set();
 for(const market of books[0].markets||[]){
  const label=MARKETS[market.key];
  if(!label){issues.unsupportedMarket++;continue;}
  const last=time(market.last_update);
  if(last===null||last>at||at-last>30*60000||last>=time(g.startTimeUTC)){
   issues.staleMarket++;continue;
  }
  const alternate=market.key.endsWith("_alternate");
  for(const outcome of market.outcomes||[]){
   const side=outcome.name==="Over"?"Higher":outcome.name==="Under"?"Lower":null;
   if(!side||!Number.isFinite(outcome.point)||outcome.point<0||
     typeof outcome.description!=="string"||!nameKey(outcome.description)){
    issues.badQuote++;continue;
   }
   const candidates=(players.get(nameKey(outcome.description))||[]).filter(p=>
    label==="Goalie Saves"?p.type==="goalie":p.type==="skater");
   if(candidates.length!==1){issues.ambiguousPlayer++;continue;}
   const player=candidates[0];
   const key=[g.id,player.playerId,market.key,outcome.point,side].join("|");
   if(dedup.has(key)){
    const a=dedup.get(key);
    if(a.indicativeFlatPrice!==outcome.price)conflict.add(key);
    continue;
   }
   dedup.set(key,{
    platform:"prizepicks",sourceProvider:"The Odds API",bookmakerKey:"prizepicks",
    originalPrizePicksPlatformAuthenticated:false,
    league:"NHL",gameId:g.id,
    projectionId:"oddsapi:"+doc.id+":"+key,
    player:player.name,playerId:player.playerId,team:canonicalTeam(player.team),
    matchup:canonicalTeam(player.team)===canonicalTeam(g.home)?canonicalTeam(g.away):canonicalTeam(g.home),
    market:label,sourceMarketKey:market.key,period:"Full game",
    line:outcome.point,side,tier:alternate?"Unverified alternate":"Standard",
    originalPrizePicksTierVerified:false,
    alternateTierNeedsVerification:alternate,
    originalPlatformPayoutVerified:false,
    indicativeFlatPrice:Number.isFinite(outcome.price)?outcome.price:null,
    capturedAt:now,observedAt:market.last_update,eventStartsAt:g.startTimeUTC,
    isLive:false,status:"research_only",
    completeLeagueBoard:false,sourceScope:"verified_event_only"
   });
  }
 }
 for(const [key,row] of dedup)if(!conflict.has(key))rows.push(row);
 issues.conflictingSide=conflict.size;
 return {rows,issues,gameId:g.id};
}
module.exports={MARKETS,normalizePrizePicksOddsApiEvent};
