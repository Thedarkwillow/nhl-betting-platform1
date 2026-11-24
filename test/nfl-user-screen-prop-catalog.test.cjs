"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {SCREEN_LABELS,MARKET_REGISTRY,classifyMarket,classifyPeriod,normalizeLabel}=
 require("../src/nfl-market-registry.cjs");

test("50 distinct owner-recorded NFL player-market menu labels are preserved",()=>{
 assert.equal(SCREEN_LABELS.length,50);
 assert.equal(new Set(SCREEN_LABELS.map(x=>normalizeLabel(x.label))).size,50);
 assert.equal(SCREEN_LABELS.filter(x=>x.marketId===null).length,1);
 assert.equal(SCREEN_LABELS.find(x=>x.marketId===null)?.label,"INT");
 assert.ok(SCREEN_LABELS.every(x=>x.observationType==="menu_filter_label_only" &&
   x.underlyingOffersAuthenticated===false && x.autoPickEligible===false));
});
test("49 app-visible labels map deterministically, INT always quarantined",()=>{
 for(const row of SCREEN_LABELS){
  const result=classifyMarket("prizepicks",row.label);
  if(row.label==="INT"){
   assert.equal(result.status,"quarantine");
   continue;
  }
  assert.equal(result.status,"recognized_research_only",row.label);
  assert.equal(result.marketId,row.marketId,row.label);
  assert.equal(result.autoPickEligible,false,row.label);
  assert.equal(result.platformOfferAuthenticated,false,row.label);
  assert.equal(result.menuFilterSeenButOfferNotVerified,true,row.label);
 }
});
test("app menu-only types are not misattributed to the third-party board",()=>{
 for(const label of ["Pass Yards (Combo)","FG Made (Combo)",
   "Punt Touchbacks (Combo)","Passer Rating","Quarters with 25+ Pass Yards"]){
  const result=classifyMarket("prizepicks",label);
  const market=MARKET_REGISTRY.find(x=>x.id===result.marketId);
  assert.equal(market.documentedByPrizePicks,false,label);
  assert.equal(market.observedByIndependentPrizePicksFeed,false,label);
  assert.equal(market.observedInOwnerAppMenu,true,label);
  assert.equal(market.confirmedPlatformSettlementRule,false,label);
 }
});
test("quarter and half threshold categories do not become ordinary full-game props",()=>{
 for(const label of ["Quarters with 1+ Reception",
  "Quarters with 25+ Pass Yards","Quarters with 5+ Receiving Yards",
  "Quarters with 10+ Receiving Yards","Halves with 50+ Rush Yards"]){
  const result=classifyMarket("prizepicks",label);
  assert.equal(result.periodSpecificValidationNeeded,true,label);
 }
 assert.equal(classifyPeriod("NFL1Q"),"quarter_1");
 assert.equal(classifyPeriod("NFL1H"),"half_1");
 assert.equal(classifyMarket("prizepicks","Pass Yards",{period:"NFL1Q"}).period,"quarter_1");
 assert.equal(classifyMarket("prizepicks","Pass Yards",{period:"NFL1H"}).period,"half_1");
 assert.equal(classifyMarket("prizepicks","Pass Yards",{period:"NBA1Q"}).status,"quarantine");
});
test("all recorded combination markets require special validation before selection",()=>{
 for(const r of SCREEN_LABELS.filter(x=>x.label.includes("(Combo)")||
  x.label==="Pass+Rush+Rec TDs"||x.label==="Pass+Rush Yds"||
  x.label==="Rush+Rec Yds")){
  const c=classifyMarket("prizepicks",r.label);
  assert.equal(c.comboValidationNeeded,true,r.label);
  assert.equal(c.autoPickEligible,false,r.label);
 }
});
test("the recording does not change existing Underdog classifications",()=>{
 assert.equal(classifyMarket("underdog","Punts").marketId,"punt_attempts");
 assert.equal(classifyMarket("underdog","Passer Rating").status,"quarantine");
 assert.equal(MARKET_REGISTRY.every(x=>x.autoPickEligible===false),true);
});
