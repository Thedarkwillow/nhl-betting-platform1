"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {MARKET_REGISTRY,SOURCES,classifyMarket,classifyPeriod,auditBoardLabels,normalizeLabel}=
 require("../src/nfl-market-registry.cjs");
const {scoreOffense,scoreKicker}=require("../src/nfl-prizepicks-fantasy-scoring.cjs");
test("NFL registry is a broad vendor-source-qualified catalog, NOT a live board",()=>{
 assert.ok(MARKET_REGISTRY.length>=90);
 const keys=new Set(MARKET_REGISTRY.map(x=>x.id));
 assert.equal(keys.size,MARKET_REGISTRY.length);
 for(const market of MARKET_REGISTRY){
  assert.equal(market.autoPickEligible,false);
  assert.equal(market.confirmedPlatformSettlementRule,false);
  assert.equal(market.registeredButNotLiveOffer,true);
  assert.ok(["boxscore","play_by_play","components","event","drive_chart",
   "comparison","fantasy_rules","tracking","special_teams","period",
   "futures","team_market"].includes(market.requiredData));
 }
 assert.ok(SOURCES.ppOfficial.includes("prizepicks.com"));
 assert.ok(SOURCES.udRules.includes("underdogsports.com"));
});
test("no duplicate aliases within an individual platform can map to two markets",()=>{
 for(const platform of ["prizepicks","underdog"]){
  const names=new Map();
  for(const market of MARKET_REGISTRY)for(const alias of market.labels[platform]){
   const key=normalizeLabel(alias);
   if(names.has(key)&&names.get(key)!==market.id)
    assert.fail("ambiguous "+platform+" alias "+alias+" / "+names.get(key)+" / "+market.id);
   names.set(key,market.id);
  }
 }
});
test("PrizePicks officially documented kicker/punter props, defensive stats and third-party board are distinguished",()=>{
 const kicker=MARKET_REGISTRY.find(x=>x.id==="kicker_fantasy_score");
 assert.equal(kicker.documentedByPrizePicks,true);
 assert.equal(kicker.observedByIndependentPrizePicksFeed,false);
 const tackles=MARKET_REGISTRY.find(x=>x.id==="tackles_plus_assists");
 assert.equal(tackles.observedByIndependentPrizePicksFeed,true);
 const pp=classifyMarket("prizepicks","FG Made",{period:"1Q",observedAt:"2026-11-08T13:00:00Z"});
 assert.equal(pp.marketId,"fg_made");assert.equal(pp.period,"quarter_1");
 assert.equal(pp.periodSpecificValidationNeeded,true);
 assert.equal(pp.autoPickEligible,false);
 assert.equal(pp.platformOfferAuthenticated,false);
 const pp2=classifyMarket("prizepicks","Rush+Rec Yds");
 assert.equal(pp2.marketId,"rush_receive_yards");
 assert.equal(pp2.comboValidationNeeded,true);
 const x=classifyMarket("prizepicks","INT");
 assert.equal(x.status,"quarantine","ambiguous INT label needs role/market disambiguation");
});
test("Underdog official rules cover unusual plays, both early drives and special kicking",()=>{
 assert.equal(classifyMarket("underdog","First Drive Field Goals Made").marketId,"fg_on_first_drive");
 assert.equal(classifyMarket("underdog","First Reception (Yards)").marketId,"first_reception_yards");
 assert.equal(classifyMarket("underdog","Doinks").marketId,"doinks");
 assert.equal(classifyMarket("underdog","1Q Field Goals Made",{period:"1Q"}).marketId,"fg_made_quarter");
 assert.equal(classifyMarket("underdog","First Interception Thrown").marketId,"first_interception_thrown");
 assert.equal(classifyMarket("underdog","Red Zone Targets").marketId,"red_zone_targets");
 assert.equal(classifyMarket("underdog","First TD Scorer").marketId,"first_td_scorer");
 assert.equal(classifyMarket("underdog","Kicking Points").marketId,"kicking_points");
 assert.equal(classifyMarket("underdog","Punts Inside 20").marketId,"punt_inside_20");
});
test("all odds, injury, period, live and unrecognized categories default to no picks",()=>{
 assert.equal(classifyMarket("underdog","Unknown Props").reason,"undocumented_or_new_market");
 assert.equal(classifyMarket("prizepicks","FG Made",{period:"Q5"}).reason,"unknown_period");
 assert.equal(classifyMarket("prizepicks","FG Made",{participants:0}).reason,"invalid_participant_count");
 assert.equal(classifyPeriod("1st Half"),"half_1");
 assert.equal(classifyPeriod("2H"),"half_2");
 assert.equal(classifyPeriod("live"),"live");
 const r=auditBoardLabels("prizepicks",[
  {market:"FG Made",period:"1H"},{market:"Random Mystery Stat"},{market:"INT"}]);
 assert.equal(r.recognized,1);
 assert.equal(r.quarantined,2);
 assert.equal(r.unknownMarkets.INT,1);
 assert.equal(r.unrecognizedDataNeverAutoPicked,true);
});
test("PrizePicks kicker points and fantasy differ; field-goal distances and misses matter",()=>{
 const r=scoreKicker({fgAttempts:[{made:true,distance:37},{made:true,distance:43},
  {made:true,distance:52},{made:false,distance:48}],
  extraPointsMade:2,extraPointsMissed:1,wasActive:true});
 assert.equal(r.score,12); // 3+4+5-1+2-1
 assert.equal(r.kickingPoints,11); // 3 FG made * 3 + 2 XP
 assert.equal(r.autoPickEligible,false);
 assert.equal(scoreKicker({fgAttempts:[],extraPointsMade:0,extraPointsMissed:0,
  wasActive:false}).score,null);
 assert.equal(scoreKicker({fgAttempts:[{made:true,distance:50}]}).score,null);
});
test("PrizePicks offensive fantasy full PPR requires every versioned component",()=>{
 const all={passingYards:250,passingTDs:2,interceptionsThrown:1,rushingYards:20,
  rushingTDs:0,receptions:3,receivingYards:30,receivingTDs:0,fumblesLost:0,
  twoPointConversions:0,offensiveFumbleRecoveryTDs:0,returnTDs:0};
 const r=scoreOffense(all);
 assert.equal(r.score,25);
 assert.equal(r.fullPPR,true);
 assert.equal(r.verifiedOriginalSettlement,false);
 assert.equal(scoreOffense({...all,receptions:undefined}).score,null);
 assert.equal(scoreOffense({...all,rushingYards:-1}).score,null);
});


test("offline archived-board audit reports all source labels without dropping unfamiliar props",()=>{
 const {auditArchive}=require("../scripts/audit-nfl-archived-board.cjs");
 const r=auditArchive("underdog",{league:"NFL",rows:[
  {market:"First Drive Field Goals Made",period:"1Q"},
  {market:"Rushing Yards",period:"full_game"},
  {market:"Just Added Special Stat",period:"full_game"}]});
 assert.equal(r.recognized,2);
 assert.equal(r.quarantined,1);
 assert.equal(r.unknownMarkets["Just Added Special Stat"],1);
 assert.equal(r.knownGroupsObserved.drive,1);
 assert.equal(r.knownGroupsObserved.rushing,1);
 assert.equal(r.originalPlatformOfferAuthenticated,false);
 assert.equal(r.eligibleAutomaticNFLPicks,0);
 assert.throws(()=>auditArchive("underdog",{league:"NHL",rows:[]}),/mismatched league/);
 assert.throws(()=>auditArchive("underdog",{league:"NFL"}),/rows array/);
});
test("a self-declared authenticated caller field never makes market a verified executable offer",()=>{
 const x=classifyMarket("prizepicks","Pass Yards",{
  period:"full_game",sourceAuthenticity:"first_party_authorized_verified"});
 assert.equal(x.marketId,"passing_yards");
 assert.equal(x.platformOfferAuthenticated,false);
 assert.equal(x.autoPickEligible,false);
});
