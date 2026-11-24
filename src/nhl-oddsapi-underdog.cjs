"use strict";
/** Source-labelled, strictly bounded The Odds API Underdog Fantasy NHL sample. */
const {nameKey,canonicalTeam}=require("./nhl-pregame-intel.cjs");
const CLUB=Object.freeze({
 "anaheim ducks":"ANA","boston bruins":"BOS","buffalo sabres":"BUF","calgary flames":"CGY",
 "carolina hurricanes":"CAR","chicago blackhawks":"CHI","colorado avalanche":"COL","columbus blue jackets":"CBJ",
 "dallas stars":"DAL","detroit red wings":"DET","edmonton oilers":"EDM","florida panthers":"FLA",
 "los angeles kings":"LAK","minnesota wild":"MIN","montreal canadiens":"MTL","nashville predators":"NSH",
 "new jersey devils":"NJD","new york islanders":"NYI","new york rangers":"NYR","ottawa senators":"OTT",
 "philadelphia flyers":"PHI","pittsburgh penguins":"PIT","san jose sharks":"SJS","seattle kraken":"SEA",
 "st louis blues":"STL","st. louis blues":"STL","tampa bay lightning":"TBL","toronto maple leafs":"TOR",
 "utah mammoth":"UTA","vancouver canucks":"VAN","vegas golden knights":"VGK","washington capitals":"WSH",
 "winnipeg jets":"WPG"
});
const MARKETS=Object.freeze({player_shots_on_goal:"Shots On Goal",player_total_saves:"Goalie Saves"});
const club=x=>CLUB[nameKey(x)]||null;
const asTime=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
function matchEvent(event,schedule,now){
 const home=club(event?.home_team),away=club(event?.away_team),at=asTime(event?.commence_time);
 if(!home||!away||home===away||!at||at<=asTime(now)||!schedule?.complete)return null;
 const games=(schedule.games||[]).filter(g=>canonicalTeam(g.home)===home&&
  canonicalTeam(g.away)===away&&Math.abs(asTime(g.startTimeUTC)-at)<=300000);
 return games.length===1?games[0]:null;
}
function normalizeUnderdogEvent(source,schedule,players,at){
 const game=matchEvent(source,schedule,at),rows=[],errors={};
 if(!game)return {rows,errors:{unmatched_official_event:1}};
 const books=(source.bookmakers||[]).filter(b=>b.key==="underdog");
 if(books.length!==1)return {rows,errors:{underdog_book_missing_or_ambiguous:1}};
 const byName=new Map();
 for(const p of Object.values(players?.players||{})){
  if(!Number.isInteger(p.playerId)||!["skater","goalie"].includes(p.type))continue;
  if(![canonicalTeam(game.home),canonicalTeam(game.away)].includes(canonicalTeam(p.team)))continue;
  const k=nameKey(p.name);if(!byName.has(k))byName.set(k,[]);
  byName.get(k).push(p);
 }
 for(const m of books[0].markets||[]){
  const market=MARKETS[m.key],seenAt=asTime(m.last_update);
  if(!market){errors.unlisted_market=(errors.unlisted_market||0)+1;continue;}
  if(!seenAt||seenAt>asTime(at)||asTime(at)-seenAt>30*60000||seenAt>=asTime(source.commence_time)){
   errors.stale_market=(errors.stale_market||0)+1;continue;
  }
  const grouped=new Map();
  for(const o of m.outcomes||[]){
   if(!["Over","Under"].includes(o.name)||!Number.isFinite(o.point)||o.point<0||
    typeof o.description!=="string")continue;
   const playerMatches=byName.get(nameKey(o.description))||[];
   const matches=playerMatches.filter(p=>m.key==="player_total_saves"?p.type==="goalie":p.type==="skater");
   if(matches.length!==1){errors.ambiguous_or_missing_player=(errors.ambiguous_or_missing_player||0)+1;continue;}
   const player=matches[0],key=[player.playerId,m.key,o.point].join("|");
   if(!grouped.has(key))grouped.set(key,{player,point:o.point,sides:new Set()});
   if(grouped.get(key).sides.has(o.name)){errors.duplicate_side=(errors.duplicate_side||0)+1;continue;}
   grouped.get(key).sides.add(o.name);
  }
  for(const [key,p] of grouped){
   rows.push({platform:"underdog",league:"NHL",status:"active",
    offerId:"oddsapi:"+source.id+":"+key,
    player:p.player.name,playerId:p.player.playerId,team:canonicalTeam(p.player.team),
    opponent:canonicalTeam(p.player.team)===canonicalTeam(game.home)?canonicalTeam(game.away):canonicalTeam(game.home),
    eventStartsAt:game.startTimeUTC,period:"Full game",market,line:p.point,tier:"Unverified",
    marketVariant:"source_regular_market_not_original_tier",originalTierVerified:false,
    observedAt:m.last_update,
    higherAvailable:p.sides.has("Over"),lowerAvailable:p.sides.has("Under"),
    originalUnderdogPlatformVerified:false,sourceMarketKey:m.key,
    sourceProvider:"The Odds API us_dfs bookmaker underdog"});
  }
 }
 return {rows,errors};
}
module.exports={CLUB,MARKETS,club,matchEvent,normalizeUnderdogEvent};
