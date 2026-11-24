"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {buildPlatformLineShop,normalizeUnderdogBoard,officialGame}=
 require("../src/nhl-platform-line-shop.cjs");
const start="2026-11-04T01:00:00Z",now="2026-11-03T23:00:00Z";
const schedule={complete:true,games:[{id:2026020301,home:"BOS",away:"NYR",startTimeUTC:start}]};
const officialPlayers={players:{"111":{playerId:111,team:"BOS",name:"Example Skater"}}};
const pp={completePagination:true,provider:"prizepicksapi.com",rows:[
 {projectionId:"p1",player:"Example Skater",team:"BOS",matchup:"NYR",market:"Shots On Goal",period:"Full game",
 line:2.5,tier:"Standard",side:"Higher",eventStartsAt:start,
 capturedAt:"2026-11-03T22:45:00Z",observedAt:"2026-11-03T22:44:00Z"},
 {projectionId:"p1",player:"Example Skater",team:"BOS",matchup:"NYR",market:"Shots On Goal",period:"Full game",
 line:2.5,tier:"Standard",side:"Lower",eventStartsAt:start,
 capturedAt:"2026-11-03T22:45:00Z",observedAt:"2026-11-03T22:44:00Z"}]};
const ud={kind:"approved_underdog_nhl_offers",completePagination:true,
 provider:"approved vendor adapter",generatedAt:"2026-11-03T22:47:00Z",
 commercialDerivedPublicDisplayAuthorized:true,originalUnderdogPlatformAuthenticated:false,
 rows:[{platform:"underdog",league:"NHL",status:"active",
  offerId:"u1",player:"Example Skater",team:"BOS",opponent:"NYR",
  eventStartsAt:start,observedAt:"2026-11-03T22:43:00Z",
  market:"Shots On Goal",period:"Full game",line:3.5,tier:"Standard",
  higherAvailable:true,lowerAvailable:true}]};
test("missing licensed Underdog feed does not fabricate match or current availability",()=>{
 const r=buildPlatformLineShop(pp,null,schedule,now,officialPlayers);
 assert.equal(r.status,"underdog_feed_not_connected");
 assert.equal(r.underdogObservedProps,0);
 assert.equal(r.publicComparisons.length,0);
 assert.equal(r.payoutAndSettlementVerified,false);
});
test("exact same NHL game/player/stat/side yields two Standard comparisons",()=>{
 const r=buildPlatformLineShop(pp,ud,schedule,now,officialPlayers);
 assert.equal(r.prizePicksObservedProps,2);
 assert.equal(r.underdogObservedProps,2);
 assert.equal(r.standardSideMatches,2);
 assert.equal(r.publicComparisons[0].prizePicksLine,2.5);
 assert.equal(r.publicComparisons[0].underdogLine,3.5);
 assert.equal(r.publicComparisons[0].payoutComparisonSupported,false);
});
test("unlicensed Underdog feed remains private-only",()=>{
 const r=buildPlatformLineShop(pp,{...ud,commercialDerivedPublicDisplayAuthorized:false},schedule,now,officialPlayers);
 assert.equal(r.status,"underdog_private_research_only");
 assert.equal(r.privateComparisons.length,2);
 assert.equal(r.publicComparisons.length,0);
});
test("wrong NHL team, wrong event time, incomplete boards and stale observation fail closed",()=>{
 assert.equal(officialGame("BOS","NYR",start,schedule).id,2026020301);
 assert.equal(officialGame("BOS","TOR",start,schedule),null);
 assert.equal(officialGame("BOS","NYR","2026-11-05T01:00:00Z",schedule),null);
 assert.equal(buildPlatformLineShop(pp,{...ud,completePagination:false},schedule,now,officialPlayers).standardSideMatches,0);
 assert.equal(buildPlatformLineShop(pp,{...ud,rows:ud.rows.map(x=>({...x,opponent:"TOR"}))},schedule,now,officialPlayers).standardSideMatches,0);
 assert.equal(buildPlatformLineShop(pp,{...ud,generatedAt:"2026-11-02T20:00:00Z"},schedule,now,officialPlayers).standardSideMatches,0);
});
test("do not arbitrarily pair two competing Standard lines from one provider",()=>{
 const duplicate={...pp,rows:[...pp.rows,{...pp.rows[0],line:4.5,projectionId:"p2"}]};
 assert.equal(buildPlatformLineShop(duplicate,ud,schedule,now,officialPlayers).standardSideMatches,1);
});

test("different game periods do not share a prop market",()=>{
 assert.equal(buildPlatformLineShop(pp,{...ud,rows:ud.rows.map(x=>({...x,period:"1st period"}))},schedule,now,officialPlayers).standardSideMatches,0);
 assert.equal(buildPlatformLineShop({...pp,rows:pp.rows.map(x=>({...x,period:"1P"}))},ud,schedule,now,officialPlayers).standardSideMatches,0);
});
test("missing canonical NHL player identity yields zero platform matches",()=>{
 assert.equal(buildPlatformLineShop(pp,ud,schedule,now,{players:{}}).standardSideMatches,0);
});

test("threshold preference correctly reverses for Lower props, without payout claims",()=>{
 const r=buildPlatformLineShop(pp,ud,schedule,now,officialPlayers);
 const higher=r.privateComparisons.find(x=>x.side==="Higher"),lower=r.privateComparisons.find(x=>x.side==="Lower");
 assert.equal(higher.favorableThresholdPlatform,"PrizePicks");
 assert.equal(lower.favorableThresholdPlatform,"Underdog");
 assert.equal(higher.thresholdComparisonOnly,true);
 assert.equal(lower.payoutComparisonSupported,false);
});

test("conflicting exact-threshold provider IDs and 10+ minute quote skew must abstain",()=>{
 const {comparePlatformLines}=require("../src/nhl-platform-line-shop.cjs");
 const base={gameId:2026020301,team:"BOS",playerKey:"example skater",
  officialNhlPlayerId:111,market:"shotsOnGoal",period:"full_game",
  side:"Higher",tier:"standard",line:2.5,capturedAt:"2026-11-03T22:45:00Z"};
 const a={...base,platform:"PrizePicks",originalOfferId:"p1"};
 const b={...base,platform:"Underdog",originalOfferId:"u1",capturedAt:"2026-11-03T22:47:00Z"};
 assert.equal(comparePlatformLines([a],[b]).length,1);
 assert.equal(comparePlatformLines([a,{...a,originalOfferId:"p2"}],[b]).length,0);
 assert.equal(comparePlatformLines([a],[{...b,capturedAt:"2026-11-03T22:58:00Z"}]).length,0);
 assert.equal(comparePlatformLines([a],[b])[0].captureSkewSeconds,120);
});

test("duplicate raw original offer IDs cannot be silently merged before quote matching",()=>{
 const badPP={...pp,rows:[...pp.rows,{...pp.rows[0],projectionId:"other-id"}]};
 const ppAudit=buildPlatformLineShop(badPP,ud,schedule,now,officialPlayers);
 assert.equal(ppAudit.exclusions.prizePicks.conflicting_source_offer_ids,1);
 assert.equal(ppAudit.standardSideMatches,1);
 assert.equal(ppAudit.publicComparisons[0].side,"Lower");
 const badUD={...ud,rows:[...ud.rows,{...ud.rows[0],offerId:"other-vendor-id",
   lowerAvailable:false}]};
 const udAudit=buildPlatformLineShop(pp,badUD,schedule,now,officialPlayers);
 assert.equal(udAudit.exclusions.underdog.conflicting_source_offer_ids,1);
 assert.equal(udAudit.standardSideMatches,1);
 assert.equal(udAudit.publicComparisons[0].side,"Lower");
});

test("vendor regular Underdog source with unknown tier compares only in private threshold research",()=>{
 const fixed={...pp,snapshotMode:"immutable_as_of",sourceStatus:"fresh",boardAsOfAt:"2026-11-03T22:44:30Z",
 rows:pp.rows.map(x=>({...x,observedAt:"2026-11-03T15:00:00Z"}))};
 const vendor={...ud,provider:"The Odds API us_dfs / underdog",rows:ud.rows.map(x=>({...x,playerId:111,tier:"Unverified",originalTierVerified:false,marketVariant:"source_regular_market_not_original_tier"}))};
 const r=buildPlatformLineShop(fixed,vendor,schedule,now,officialPlayers);
 assert.equal(r.standardSideMatches,0);assert.equal(r.publicComparisons.length,0);
 assert.equal(r.unverifiedTierThresholdMatchCount,2);
 assert.ok(r.privateUnverifiedTierThresholdComparisons.every(x=>x.standardTierComparable===false&&x.privateResearchOnly));
 assert.equal(buildPlatformLineShop(fixed,{...vendor,rows:vendor.rows.map(x=>({...x,playerId:999}))},schedule,now,officialPlayers).unverifiedTierThresholdMatchCount,0);
});
