"use strict";
/**
 * Compare actual *independent-source* complete NHL board captures at the
 * 06:00 and 09:00 Pacific windows. The later observation still requires
 * a full source refresh to prove additions/changes, but output records ONLY
 * changed offers. This NEVER authenticates an original PrizePicks board.
 */
const ZONE="America/Los_Angeles";
const lower=x=>String(x??"").trim().toLowerCase();
const iso=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
function pacificSlot(x){
 const stamp=iso(x);
 if(stamp===null)return null;
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:ZONE,
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",
  minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(stamp));
 const val=k=>parts.find(p=>p.type===k)?.value;
 const min=Number(val("hour"))*60+Number(val("minute"));
 return {day:[val("year"),val("month"),val("day")].join("-"),minute:min,
  slot:min>=360&&min<420?"06:00":
   min>=540&&min<625?"09:00":null};
}
/**
 * Find the latest *actual* 06:00 Pacific original source snapshot on the
 * same date as the current 09:00 capture. Never use the second-to-last
 * archive (which may be from a different day or an intervening manual run).
 * This does not read files or make any provider requests.
 */
function selectMorningBaselineFilename(filenames,currentAt){
 const current=pacificSlot(currentAt),now=iso(currentAt);
 if(current?.slot!=="09:00"||now===null||!Array.isArray(filenames))return null;
 let best=null,bestTime=-Infinity;
 for(const filename of filenames){
  const match=String(filename).match(new RegExp("(?:^|/)([0-9]{8}T[0-9]{6}Z)[.]json$"));
  if(!match)continue;
  const stamp=match[1];
  const at=stamp.slice(0,4)+"-"+stamp.slice(4,6)+"-"+stamp.slice(6,8)+"T"+
   stamp.slice(9,11)+":"+stamp.slice(11,13)+":"+stamp.slice(13,15)+"Z";
  const time=iso(at);
  if(time===null||new Date(time).toISOString().slice(0,19)+"Z"!==at||
   time>=now||time<=bestTime)continue;
  const slot=pacificSlot(at);
  if(slot?.day!==current.day||slot.slot!=="06:00")continue;
  best=filename;bestTime=time;
 }
 return best;
}

function playerKey(r){
 return JSON.stringify([lower(r.player),lower(r.team),lower(r.matchup),
   iso(r.eventStartsAt)]);
}
const marketKey=r=>JSON.stringify([playerKey(r),lower(r.market),lower(r.period)]);
const thresholdKey=r=>JSON.stringify([marketKey(r),lower(r.tier),r.line]);
const sideKey=r=>JSON.stringify([thresholdKey(r),lower(r.side)]);
const exactSourceKey=r=>JSON.stringify([lower(r.projectionId),lower(r.tier),lower(r.side)]);
function eligible(r){
 return r&&typeof r.projectionId==="string"&&r.projectionId.trim()&&
  typeof r.player==="string"&&r.player.trim()&&typeof r.team==="string"&&
  r.team.trim()&&typeof r.matchup==="string"&&r.matchup.trim()&&
  typeof r.market==="string"&&r.market.trim()&&
  ["higher","lower"].includes(lower(r.side))&&Number.isFinite(r.line)&&
  iso(r.eventStartsAt)!==null;
}
function summarizeMorningNhlDelta(previous,current){
 const base={kind:"nhl_independent_0600_vs_0900_changed_offers_v2",
  status:"unavailable_without_two_complete_same_day_source_boards",
  previousAt:previous?.generatedAt??null,currentAt:current?.generatedAt??null,
  source:"Independently archived NHL prop snapshots; not official PrizePicks feed",
  authenticatedOriginalPrizePicksBoard:false,
  confirmedOriginalPlatformRemovals:false,
  lastObservedChangeOnly:true,providerCallsByComparison:0,
  summary:{newPlayerGames:0,newMarketsForExistingPlayers:0,
   newThresholdsForExistingMarkets:0,newSidesForExistingThresholds:0,
   changedExistingOfferLines:0,unseenSourceOffersUnverified:0},
  records:[],truncated:false,reason:"Two complete sequential morning windows required"};
 if(!Array.isArray(previous?.rows)||!Array.isArray(current?.rows)||
  previous.completePagination!==true||current.completePagination!==true||
  previous.sourceStatus!=="fresh"||current.sourceStatus!=="fresh"||
  previous.provider!==current.provider||!previous.provider)
  return {...base,reason:"Missing or incompatible complete independent-source snapshots"};
 const a=pacificSlot(previous.generatedAt),b=pacificSlot(current.generatedAt);
 if(!a||!b||a.day!==b.day||a.slot!=="06:00"||b.slot!=="09:00"||
  iso(previous.generatedAt)>=iso(current.generatedAt))
  return {...base,reason:"No complete 06:00 and later 09:00 capture for the same Pacific day"};
 const prior=previous.rows.filter(eligible),fresh=current.rows.filter(eligible);
 if(prior.length===0||fresh.length===0)
  return {...base,reason:"Board has no comparable identifiable NHL offers"};
 // Entire first board defines *what was previously known*, not only its
 // top-ranked/model-selected picks. No new-player claim from model filtering.
 const players=new Set(prior.map(playerKey)),markets=new Set(prior.map(marketKey)),
  thresholds=new Set(prior.map(thresholdKey)),sides=new Set(prior.map(sideKey));
 const priorExact=new Map(prior.map(r=>[exactSourceKey(r),r])),
  presentExact=new Set(fresh.map(exactSourceKey)),dedup=new Set();
 const types={
  newPlayerGames:"new_player_game",
  newMarketsForExistingPlayers:"new_market_for_player",
  newThresholdsForExistingMarkets:"new_line_for_existing_market",
  newSidesForExistingThresholds:"new_side_for_existing_line",
  changedExistingOfferLines:"changed_existing_offer_line",
  unseenSourceOffersUnverified:"not_seen_in_independent_feed_unverified"
 };
 const detail=[],seenByType=Object.fromEntries(Object.keys(types).map(k=>[k,new Set()]));
 const add=(category,key,r,priorLine=null)=>{
  const seen=seenByType[category];
  if(seen.has(key))return;
  seen.add(key);
  if(detail.length>=300)return;
  detail.push({type:types[category],player:r.player,team:r.team,
   opponent:r.matchup,market:r.market,period:r.period||"full_game",
   tier:r.tier,side:r.side,previousLine:priorLine,line:
    category==="unseenSourceOffersUnverified"?null:r.line,
   eventStartsAt:r.eventStartsAt,independentSourceOnly:true});
 };
 for(const r of fresh){
  const original=priorExact.get(exactSourceKey(r));
  if(original){
   if(original.line!==r.line)add("changedExistingOfferLines",exactSourceKey(r),
    r,original.line);
   continue;
  }
  if(!players.has(playerKey(r)))add("newPlayerGames",playerKey(r),r);
  else if(!markets.has(marketKey(r)))
   add("newMarketsForExistingPlayers",marketKey(r),r);
  else if(!thresholds.has(thresholdKey(r)))
   add("newThresholdsForExistingMarkets",thresholdKey(r),r);
  else if(!sides.has(sideKey(r)))
   add("newSidesForExistingThresholds",sideKey(r),r);
  // An unexplained provider ID change with same player/stat/line/side is
  // not new underlying inventory; do not inflate the additions.
 }
 for(const r of prior){
  if(presentExact.has(exactSourceKey(r)))continue;
  if(iso(r.eventStartsAt)<=iso(current.generatedAt))continue;
  const key=exactSourceKey(r);
  if(dedup.has(key))continue;dedup.add(key);
  add("unseenSourceOffersUnverified",key,r,r.line);
 }
 const summary=Object.fromEntries(Object.keys(types).map(k=>[k,seenByType[k].size]));
 return {...base,status:"valid_independent_source_delta_only",
  reason:null,previousAt:previous.generatedAt,currentAt:current.generatedAt,
  summary,records:detail,
  truncated:Object.values(summary).reduce((n,x)=>n+x,0)>detail.length,
  warning:"This is the change in two archived third-party observations; it cannot authenticate original PrizePicks additions, removals, available side, or price for your account. A 09:00 pull still retrieves enough source data to compare against the 06:00 baseline."};
}
module.exports={pacificSlot,selectMorningBaselineFilename,summarizeMorningNhlDelta};
