"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {VERSION,MARKETS,UNSUPPORTED,resolveMarket,validateOffer}=
 require("../src/nhl-market-registry.cjs");
test("NHL supported skater markets and goalie saves normalize to distinct canonical IDs",()=>{
 const expected={shotsOnGoal:["Shots On Goal","SOG","shots","Shot On Goal"],
  goals:["goals","GOAL"],assists:["assists","assist"],
  points:["points","point"],blockedShots:["Blocked Shots","blocks"],
  saves:["Goalie Saves","saves"]};
 for(const [field,labels] of Object.entries(expected))
  for(const label of labels)assert.equal(resolveMarket(label),field,label);
 assert.equal(Object.keys(MARKETS).length,16);
 assert.match(VERSION,/^nhl-market-registry-/);
});
test("four new markets resolve but remain research-only until independently validated",()=>{
 const labels={hits:"Hits",timeOnIceSeconds:"Time On Ice",
  faceoffsWon:"Faceoffs Won",goalieFantasyScore:"Goalie Fantasy Score"};
 for(const [market,label] of Object.entries(labels)){
  assert.equal(resolveMarket(label),market);
  assert.equal(MARKETS[market].researchOnly,true);
  const offer=validateOffer({market:label,tier:"Standard",side:"Higher",
   playerType:market==="goalieFantasyScore"?"goalie":"skater"});
  assert.equal(offer.field,market);
  assert.equal(offer.eligible,false);
  assert.equal(offer.reason,"research_shadow_not_validated_for_live_picks");
  assert.equal(offer.sourceMarketRecognized,true);
 }
 for(const unknown of ["1st period saves","first goal scorer",""])
  assert.equal(validateOffer({market:unknown,tier:"Standard",side:"Higher"}).eligible,false);
 assert.match(UNSUPPORTED["first goal scorer"],/Not a full-game/);
 const partial=validateOffer({market:"Goalie Saves",period:"1st period",tier:"Standard",side:"Higher"});
 assert.equal(partial.reason,"non_full_game");
});
test("special tiers are Higher only, with no inferred payout evidence",()=>{
 for(const tier of ["Standard","Goblin","Demon"]){
  const higher=validateOffer({market:"shots on goal",period:"Full game",tier,side:"Higher",playerType:"skater"});
  assert.equal(higher.eligible,true);
  assert.equal(higher.platformAvailabilityVerified,false);
  assert.equal(higher.payoutVerified,false);
 }
 assert.equal(validateOffer({market:"shots on goal",tier:"Demon",side:"Lower"}).reason,"unavailable_side");
 assert.equal(validateOffer({market:"saves",tier:"Goblin",side:"Lower"}).eligible,false);
});
test("role mismatches are quarantined instead of generating fantasy saves for skaters",()=>{
 assert.equal(validateOffer({market:"saves",tier:"Standard",side:"Higher",playerType:"skater"}).reason,"role_market_mismatch");
 assert.equal(validateOffer({market:"shots",tier:"Standard",side:"Higher",playerType:"goalie"}).reason,"role_market_mismatch");
 assert.equal(validateOffer({market:"saves",tier:"Standard",side:"Higher",playerType:"goalie"}).eligible,true);
 assert.equal(validateOffer({market:"saves",tier:"Standard",side:"Higher",playerType:null}).eligible,true);
});
