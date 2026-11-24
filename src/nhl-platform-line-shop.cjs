"use strict";
/**
 * Exact-source 2-platform NHL line matching. Missing Underdog data remains missing;
 * a synthetic quote or guessed commercial right never enters the website.
 */
const {canonicalTeam,nameKey}=require("./nhl-pregame-intel.cjs");
const nowTime=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const marketOf=s=>({
 "shots on goal":"shotsOnGoal",sog:"shotsOnGoal",goals:"goals",
 assists:"assists",points:"points","blocked shots":"blockedShots",
 blocks:"blockedShots","goalie saves":"saves",saves:"saves",
 hits:"hits","faceoffs won":"faceoffsWon","power play points":"powerPlayPoints",
 "goals allowed":"goalsAgainst","goals against":"goalsAgainst",
 "plus/minus":"plusMinus","plus minus":"plusMinus"
})[String(s||"").toLowerCase().trim()]||null;
function periodOf(x){
 const v=String(x||"").toLowerCase().trim();
 return ["full game","game","full"].includes(v)?"full_game":null;
}
function officialGame(team,opponent,start,schedule){
 const t=canonicalTeam(team),o=canonicalTeam(opponent),at=nowTime(start);
 if(!at||!t||!o||t===o||!schedule?.complete)return null;
 const games=(schedule.games||[]).filter(g=>
  [canonicalTeam(g.home),canonicalTeam(g.away)].sort().join("|")===
   [t,o].sort().join("|")&&
  Math.abs(nowTime(g.startTimeUTC)-at)<=300000);
 return games.length===1?games[0]:null;
}
function sourceValidity(time,observed,starts,asOf){
 const current=nowTime(asOf),capture=nowTime(time),seen=nowTime(observed),game=nowTime(starts);
 return current&&capture&&seen&&game&&seen<=capture&&capture<=current&&
  current-seen<=30*60000&&current-capture<=30*60000&&seen<game&&capture<game&&current<game;
}
function normalizePrizePicksBoard(board,schedule,asOf){
 const reason={},rows=[],seen=new Map(),ambiguous=new Set();
 if(!board||!Array.isArray(board.rows)||board.completePagination!==true)
  return {rows,reason:{incomplete_independent_prizepicks_board:1}};
 for(const p of board.rows){
  const observed=nowTime(p.observedAt),pin=nowTime(board.boardAsOfAt),capture=nowTime(p.capturedAt);
  const immutable=board.provider==="prizepicksapi.com"&&board.snapshotMode==="immutable_as_of"&&board.sourceStatus==="fresh"&&
    Number.isFinite(pin)&&Number.isFinite(capture)&&pin<=capture&&capture-pin<=300000&&Number.isFinite(observed)&&observed<=pin;
  if(!sourceValidity(p.capturedAt,immutable?board.boardAsOfAt:p.observedAt,p.eventStartsAt,asOf)){
   reason.stale_or_started=(reason.stale_or_started||0)+1;continue;
  }
  const game=officialGame(p.team,p.matchup,p.eventStartsAt,schedule),
   market=marketOf(p.market),side=p.side,
   tier=String(p.tier||"").toLowerCase(),person=nameKey(p.player);
  if(!game||!market||!person||periodOf(p.period)!=="full_game"||!Number.isFinite(p.line)||p.line<0||
    !["Higher","Lower"].includes(side)||!["standard","goblin","demon"].includes(tier)){
   reason.unmatched_identity_or_market=(reason.unmatched_identity_or_market||0)+1;continue;
  }
  const key=[game.id,canonicalTeam(p.team),person,market,p.line,tier,side].join("|");
  if(ambiguous.has(key))continue;
  if(seen.has(key)){
   if(seen.get(key).originalOfferId!==p.projectionId){
    seen.delete(key);ambiguous.add(key);
    reason.conflicting_source_offer_ids=(reason.conflicting_source_offer_ids||0)+1;
   }
   continue;
  }
  seen.set(key,{platform:"PrizePicks",gameId:game.id,team:canonicalTeam(p.team),
   playerKey:person,market,period:"full_game",line:p.line,tier,side,originalOfferId:p.projectionId,
   observedAt:p.observedAt,capturedAt:p.capturedAt,sourceProvider:board.provider,
   originalPlatformAuthenticated:false,platformSettlementVerified:false});
 }
 return {rows:[...seen.values()],reason};
}
function normalizeUnderdogBoard(board,schedule,asOf){
 const rows=[],reason={};
 if(!board)return {rows,reason:{approved_underdog_feed_not_connected:1},
  authorizedForPublicDisplay:false};
 if(board.kind!=="approved_underdog_nhl_offers"||board.completePagination!==true||
  !Array.isArray(board.rows)||typeof board.provider!=="string"||!board.provider.trim())
  return {rows,reason:{invalid_or_incomplete_underdog_feed:1},authorizedForPublicDisplay:false};
 const authenticated=board.originalUnderdogPlatformAuthenticated===true;
 // Explicitly distinguish third-party vendor license from original UnderDog board truth.
 const licensed=board.commercialDerivedPublicDisplayAuthorized===true;
 const seen=new Map(),ambiguous=new Set();
 for(const p of board.rows){
  if(p.platform!=="underdog"||p.league!=="NHL"||p.status!=="active"||
   !sourceValidity(board.generatedAt,p.observedAt,p.eventStartsAt,asOf)){
   reason.stale_or_invalid=(reason.stale_or_invalid||0)+1;continue;
  }
  const game=officialGame(p.team,p.opponent,p.eventStartsAt,schedule),
   market=marketOf(p.market),person=nameKey(p.player),
   tier=String(p.tier||"standard").toLowerCase();
  if(!game||!market||!person||periodOf(p.period)!=="full_game"||!Number.isFinite(p.line)||p.line<0||
   !(["standard","alternate"].includes(tier)||(tier==="unverified"&&p.originalTierVerified===false&&p.marketVariant==="source_regular_market_not_original_tier"&&board.provider==="The Odds API us_dfs / underdog"))||!p.offerId){
   reason.unmatched_identity_or_market=(reason.unmatched_identity_or_market||0)+1;continue;
  }
  for(const side of ["Higher","Lower"]){
   if(p[side==="Higher"?"higherAvailable":"lowerAvailable"]!==true)continue;
   const key=[game.id,canonicalTeam(p.team),person,market,p.line,tier,side].join("|");
   if(ambiguous.has(key))continue;
   if(seen.has(key)){
    if(seen.get(key).originalOfferId!==p.offerId){
     seen.delete(key);ambiguous.add(key);
     reason.conflicting_source_offer_ids=(reason.conflicting_source_offer_ids||0)+1;
    }else reason.duplicate=(reason.duplicate||0)+1;
    continue;
   }
   seen.set(key,{platform:"Underdog",gameId:game.id,team:canonicalTeam(p.team),
    playerKey:person,market,period:"full_game",line:p.line,tier,side,originalOfferId:p.offerId,
    observedAt:p.observedAt,capturedAt:board.generatedAt,sourceProvider:board.provider,
    sourcePlayerId:Number.isInteger(p.playerId)?p.playerId:null,
    originalPlatformAuthenticated:authenticated,platformSettlementVerified:false});
  }
 }
 return {rows:[...seen.values()],reason,authorizedForPublicDisplay:licensed};
}
function canonicalIdentity(rows,officialPlayers){
 const lookup=new Map();
 for(const p of Object.values(officialPlayers?.players||{})){
  const id=Number(p.playerId),team=canonicalTeam(p.team),name=nameKey(p.name);
  if(!Number.isInteger(id)||id<=0||!team||!name)continue;
  const key=team+"|"+name;
  if(!lookup.has(key))lookup.set(key,new Set());
  lookup.get(key).add(id);
 }
 return rows.flatMap(row=>{
  const ids=lookup.get(row.team+"|"+row.playerKey);
  return ids?.size===1&&(row.sourcePlayerId==null||ids.has(row.sourcePlayerId))?[{...row,officialNhlPlayerId:[...ids][0]}]:[];
 });
}
function comparePlatformLines(pp,ud){
 const by=new Map();
 for(const item of [...pp,...ud]){
  if(item.tier!=="standard")continue;
  if(!Number.isInteger(item.officialNhlPlayerId))continue;
  const key=[item.gameId,item.team,item.officialNhlPlayerId,item.market,item.period,item.side].join("|");
  if(!by.has(key))by.set(key,{PrizePicks:new Map(),Underdog:new Map(),
    ambiguous:new Set()});
  const bucket=by.get(key),prior=bucket[item.platform].get(item.line);
  // Multiple independently observed vendor offer IDs for the same exact
  // side and threshold are not silently overwritten or called one quote.
  if(prior&&prior.originalOfferId!==item.originalOfferId)
    bucket.ambiguous.add(item.platform);
  else bucket[item.platform].set(item.line,item);
 }
 const matched=[];
 for(const [key,sides] of by){
  if(sides.ambiguous.size||sides.PrizePicks.size!==1||sides.Underdog.size!==1)continue;
  const a=[...sides.PrizePicks.values()][0],b=[...sides.Underdog.values()][0];
  // Comparing quotes observed far apart creates stale false line shopping.
  // Both independent snapshots must be close in time; a freshly republished
  // board is not evidence that a prior app offer stayed available.
  const apart=Math.abs(Date.parse(a.capturedAt)-Date.parse(b.capturedAt));
  if(a.side!==b.side||!Number.isFinite(apart)||apart>10*60000)continue;
  matched.push({gameId:a.gameId,team:a.team,playerKey:a.playerKey,
   officialNhlPlayerId:a.officialNhlPlayerId,officialRosterIdentityMatched:true,
   market:a.market,side:a.side,prizePicksLine:a.line,underdogLine:b.line,
   lineDifference:Number((a.line-b.line).toFixed(3)),
   lowerThresholdPlatform:a.line<b.line?"PrizePicks":b.line<a.line?"Underdog":"Same",
   // A lower threshold helps Higher; a higher threshold helps Lower.
   // Threshold preference is NOT a payout, win probability or EV claim.
   favorableThresholdPlatform:a.side==="Higher"?
    (a.line<b.line?"PrizePicks":b.line<a.line?"Underdog":"Same"):
    (a.line>b.line?"PrizePicks":b.line>a.line?"Underdog":"Same"),
   thresholdComparisonOnly:true,captureSkewSeconds:apart/1000,
   originalOfferIdsNotPublished:true,independentVendorQuotesOnly:true,
   payoutComparisonSupported:false,confidenceVerified:false});
 }
 return matched.sort((a,b)=>a.gameId-b.gameId||a.playerKey.localeCompare(b.playerKey));
}
function buildPlatformLineShop(prizepicks,underdog,schedule,now,officialPlayers=null){
 const pp=normalizePrizePicksBoard(prizepicks,schedule,now),
   ud=normalizeUnderdogBoard(underdog,schedule,now),
   verifiedPrizePicks=canonicalIdentity(pp.rows,officialPlayers),
   verifiedUnderdog=canonicalIdentity(ud.rows,officialPlayers),
   matches=comparePlatformLines(verifiedPrizePicks,verifiedUnderdog),
   published=ud.authorizedForPublicDisplay===true;
 const privateUnverifiedTierMatches=comparePlatformLines(verifiedPrizePicks,verifiedUnderdog.filter(r=>r.tier==="unverified").map(r=>({...r,tier:"standard"}))).map(r=>({...r,underdogTier:"unverified",standardTierComparable:false,privateResearchOnly:true,payoutComparisonSupported:false}));
 return {schemaVersion:1,kind:"nhl_cross_platform_line_shop_research_v1",
  generatedAt:now,prizePicksObservedProps:pp.rows.length,
  underdogObservedProps:ud.rows.length,canonicalPrizePicksProps:verifiedPrizePicks.length,
  canonicalUnderdogProps:verifiedUnderdog.length,standardSideMatches:matches.length,
  prizePicksProviderVerifiedFirstParty:false,
  underdogConnected:!!underdog&&ud.rows.length>0,
  underdogPublicDerivedDisplayAuthorized:published,
  status:!underdog?"underdog_feed_not_connected":
    ud.rows.length===0?"underdog_feed_rejected_or_empty":
    !published?"underdog_private_research_only":"comparison_source_available",
  exclusions:{prizePicks:pp.reason,underdog:ud.reason},
  publicComparisons:published?matches:[],
  privateComparisons:matches,
  privateUnverifiedTierThresholdComparisons:privateUnverifiedTierMatches,
  unverifiedTierThresholdMatchCount:privateUnverifiedTierMatches.length,
  payoutAndSettlementVerified:false,modelCalibrationEstablished:false,
  warning:"Compare identical official NHL game, player identity, market and side, Standard only; never use approximate player names or unmatched alternates. No confirmed platform-authenticated quotes, current availability guarantee or EV. Without a licensed fresh Underdog feed, show unavailable instead of inventing lines."};
}
module.exports={marketOf,periodOf,officialGame,sourceValidity,normalizePrizePicksBoard,
 normalizeUnderdogBoard,comparePlatformLines,canonicalIdentity,buildPlatformLineShop};
