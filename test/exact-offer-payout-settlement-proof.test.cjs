"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const p=require("../src/exact-offer-payout-settlement-proof-v1.cjs");
const original={platform:"PrizePicks",sport:"NHL",period:"full_game",
 originalSourceOfferId:"projection-123",originalModelSelectionId:"nhl-1",
 gameId:2026020399,playerId:8484144,team:"CHI",opponent:"CBJ",
 market:"shotsOnGoal",tier:"Standard",line:2.5,originalSide:"Lower",
 capturedAt:"2026-11-21T14:00:00Z",
 firstGitCommittedAt:"2026-11-21T14:01:00Z",
 gameStartAt:"2026-11-21T20:00:00Z"};
const witness={platform:"PrizePicks",sport:"NHL",period:"full_game",
 originalSourceOfferId:"projection-123",gameId:original.gameId,
 playerId:original.playerId,team:"CHI",opponent:"CBJ",
 market:"shotsOnGoal",tier:"Standard",line:2.5,
 availableSides:["Higher","Lower"],observedAt:"2026-11-21T14:00:10Z",
 verificationMethod:"verified_app_export",
 verifiedByIndependentAppAccess:true,signedOrAuthenticatedReceiptVerified:true,
 receiptId:"app-original-123"};
const quote={...witness,verificationMethod:"authenticated_platform_receipt",
 receiptId:"payout-123456",entryId:"ticket-42",
 entryType:"power",pickCount:2,entryFee:1,maximumMultiplier:3,
 payoutTableId:"as-submitted-123",includesOriginalSelectionIds:["nhl-1"]};
const settled={...quote,receiptId:"settlement-42",status:"final",netPayout:0,
 settledAt:"2026-11-22T02:00:00Z"};
test("Documentation and partner board alone do not authenticate real app offers",()=>{
 assert.equal(p.exactOffer(original,{}).verified,false);
 assert.equal(p.exactOffer(original,{...witness,verifiedByIndependentAppAccess:false}).verified,false);
 assert.equal(p.exactOffer(original,{...witness,originalSourceOfferId:"wrong"}).verified,false);
});
test("Exact original player/game/market/period/line/tier/side and time all required",()=>{
 assert.equal(p.exactOffer(original,witness).verified,true);
 for(const [field,value] of [["line",3.5],["market","points"],["playerId",12],
   ["gameId",1],["team","OTT"],["period","1st"],["tier","Goblin"],["platform","Underdog"]]){
  assert.equal(p.exactOffer(original,{...witness,[field]:value}).verified,false,field);
 }
 assert.equal(p.exactOffer(original,{...witness,availableSides:["Higher"]}).verified,false);
 assert.equal(p.exactOffer(original,{...witness,observedAt:"2026-11-22T12:00:00Z"}).verified,false);
});
test("Specific payout quote and final settlement are separate authenticated stages",()=>{
 assert.equal(p.payout(original,witness,{}).verified,false);
 const q=p.payout(original,witness,quote);
 assert.equal(q.entrySpecificPayoutVerified,true);
 assert.equal(q.platformSettlementVerified,false);
 assert.equal(p.settlement(original,witness,quote,{...settled,status:"open"}).verified,false);
 const x=p.settlement(original,witness,quote,settled);
 assert.equal(x.platformSettlementVerified,true);
 assert.equal(x.payoutAdjustedExpectedValue,null);
 assert.equal(x.automaticWagersAuthorized,false);
});
test("Underdog flex under 3 picks is invalid and repeated receipts not independent",()=>{
 const o={...original,platform:"Underdog"};
 const a={...witness,platform:"Underdog"};
 const q={...quote,platform:"Underdog",entryType:"flex",pickCount:2};
 assert.equal(p.payout(o,a,q).verified,false);
 assert.equal(p.coverage({originals:[original,original],
  appOffers:[witness],entryQuotes:[quote],settlements:[settled]})
  .authenticatedFinalSettlements,1);
});
test("No verified payout EV from scraped public rules, same-score official results or source-only ledger",()=>{
 const x=p.coverage({originals:[original],appOffers:[],entryQuotes:[],settlements:[]});
 assert.equal(x.sourceOriginals,1);
 assert.equal(x.authenticatedExactAppOffers,0);
 assert.equal(x.authenticatedExactPayoutQuotes,0);
 assert.equal(x.authenticatedFinalSettlements,0);
 assert.equal(x.roiApproved,false);
});

test("NFL exact game and GSIS operator-offer proof is possible, but source-only quote and payout are separate",()=>{
 const o={...original,sport:"NFL",gameId:"2026_11_ARI_KC",
  playerId:"00-0039067",team:"KC",opponent:"ARI",
  market:"receiving_yards",line:48.5,originalSourceOfferId:"pp-source-17071730",
  originalModelSelectionId:"nfl-rice-48.5-higher",originalSide:"Higher"};
 const app={...witness,sport:"NFL",gameId:o.gameId,
  playerId:o.playerId,team:o.team,opponent:o.opponent,market:o.market,
  line:o.line,originalSourceOfferId:o.originalSourceOfferId,
  availableSides:["Higher"]};
 assert.equal(p.identityValid(o),true);
 const r=p.exactOffer(o,app);
 assert.equal(r.originalAppOfferVerified,true);
 assert.equal(r.entrySpecificPayoutVerified,false);
 assert.equal(r.platformSettlementVerified,false);
 assert.equal(r.payoutAdjustedExpectedValue,null);
 assert.equal(r.automaticWagersAuthorized,false);
 for(const wrong of [
  {...o,gameId:"2026_99_ARI_KC"},
  {...o,gameId:"2026_11_KC"},
  {...o,playerId:"Rice"},
  {...o,playerId:"00-123"},
  {...o,playerId:"00-0039068"}
 ]){
  if(wrong.playerId!==o.playerId)
   assert.equal(p.exactOffer(wrong,app).verified,false);
  else assert.equal(p.identityValid(wrong),false);
 }
 assert.equal(p.exactOffer(o,{...app,gameId:"2026_10_ARI_KC"}).verified,false);
 assert.equal(p.exactOffer(o,{...app,playerId:"00-0039068"}).verified,false);
 assert.equal(p.exactOffer(o,{...app,verificationMethod:"third_party_scraper"}).verified,false);
 assert.equal(p.exactOffer(o,{...app,signedOrAuthenticatedReceiptVerified:false}).verified,false);
 const q={...quote,sport:"NFL",gameId:o.gameId,playerId:o.playerId,
  team:o.team,opponent:o.opponent,
  platform:"PrizePicks",market:o.market,line:o.line,
  originalSourceOfferId:o.originalSourceOfferId,
  includesOriginalSelectionIds:[o.originalModelSelectionId]};
 assert.equal(p.payout(o,app,q).entrySpecificPayoutVerified,true);
 assert.equal(p.payout(o,app,{...q,entryType:"flex",pickCount:2}).verified,false,
  "Two-pick PrizePicks entry can only be Power, never Flex");
 const ud={...o,platform:"Underdog"},udApp={...app,platform:"Underdog"};
 assert.equal(p.payout(ud,udApp,{...q,platform:"Underdog",entryType:"flex",pickCount:2}).verified,false);
 // NBA official game and player identity also require exact IDs; unverified
 // esports display names are not acceptable shared provider identities.
 assert.equal(p.identityValid({...o,sport:"NBA",gameId:"0022601111",playerId:1628369}),true);
 assert.equal(p.identityValid({...o,sport:"Esports",gameId:"cs2-final",playerId:"player-name"}),false);
});

test("Authenticated payouts and settlements must be for THIS exact original player market period line",()=>{
 const ok=p.payout(original,witness,quote);
 assert.equal(ok.entrySpecificPayoutVerified,true);
 for(const [field,value] of [["line",3.5],["gameId",2026020400],
    ["playerId",99999],["market","assists"],["period","1st"],
    ["tier","Goblin"],["originalSourceOfferId","other-id"],
    ["team","BOS"],["sport","NFL"]]){
  const broken=p.payout(original,witness,{...quote,[field]:value});
  assert.equal(broken.entrySpecificPayoutVerified,false,field);
  assert.equal(broken.payoutAdjustedExpectedValue,null,field);
 }
 assert.equal(p.payout(original,witness,{...quote,
   includesOriginalSelectionIds:["nhl-1","nhl-1"]}).entrySpecificPayoutVerified,false);
 assert.equal(p.payout(original,witness,{...quote,
   observedAt:"2026-11-19T00:00:00Z"}).entrySpecificPayoutVerified,false);
 const altered={...settled,period:"2nd"};
 assert.equal(p.settlement(original,witness,quote,altered).platformSettlementVerified,false);
 assert.equal(p.settlement(original,witness,quote,{
  ...settled,payoutTableId:"different"}).platformSettlementVerified,false);
});
