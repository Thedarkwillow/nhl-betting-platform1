"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {quote,settle}=require("../src/paper-entry-evidence.cjs");
const {study}=require("../src/bounded-sportsbook-consensus.cjs");
const e={sha256:"a".repeat(64),reviewedByOwner:true,privateReference:"private/example"};
const legs=[1,2].map(playerId=>({gameId:playerId,playerId,market:"goals",period:"full_game",line:.5,tier:"Standard",side:"Higher",startAt:"2026-11-15T20:00:00Z"}));
const q={paperOnly:true,platform:"PrizePicks",format:"power",legs,paperStake:1,quoteEvidence:e,termsEvidence:e,termsVersion:"2026-10-19",quoteAt:"2026-11-15T17:00:00Z",frozenAt:"2026-11-15T17:01:00Z",firstEventStart:"2026-11-15T20:00:00Z",quotedGrossMultipliers:[0,0,3]};
test("paper evidence intake requires exact quote, unique legs, both times and no wager",()=>{
 const x=quote(q);assert.ok(x.id);assert.equal(x.termsAuthenticated,false);
 assert.equal(quote({...q,legs:[legs[0],legs[0]]}),null);assert.equal(quote({...q,frozenAt:q.firstEventStart}),null);assert.equal(quote({...q,paperOnly:false}),null);
 const s={quoteId:x.id,settledAt:"2026-11-16T01:00:00Z",settlementEvidence:e,officialOutcomeEvidence:e,legs:legs.map(z=>({...z,status:"hit"})),documentedGrossReturn:3};
 assert.equal(settle(q,s).readyForIndependentReview,true);assert.equal(settle(q,s).settlementAuthenticated,false);assert.equal(settle(q,{...s,documentedGrossReturn:4}),null);
});
test("source consensus requires same exact label, event, line and two fresh uniquely quoted books",()=>{
 const x={sport:"NHL",eventId:"abc",homeTeam:"AAA",awayTeam:"BBB",commenceTime:"2026-11-15T20:00:00Z",player:"Test Player",market:"goals",period:"full_game",line:.5,source:"The Odds API",book:"draftkings",overOdds:-110,underOdds:-110,capturedAt:"2026-11-15T19:45:00Z",marketUpdatedAt:"2026-11-15T19:44:00Z"};
 const a={kind:"bounded_sportsbook_capture_v1",status:"fresh_bounded_archive",rows:[x,{...x,book:"fanduel"}]},opts={now:"2026-11-15T19:50:00Z"};
 assert.equal(study(a,opts).groups[0].higher,.5);assert.equal(study(a,opts).strictPlatformMatches,0);
 assert.equal(study({...a,rows:[x,{...x,book:"fanduel",line:1.5}]},opts).groups.length,0);
 assert.equal(study({...a,rows:[x,x]},opts).groups.length,0);
 assert.equal(study(a,{now:"2026-11-15T20:01:00Z"}).groups.length,0);
});


test("sportsbook zero-credit diagnostic exposes only stage counts with exact partition",()=>{
 const {safeFunnel}=require("../scripts/report-source-completion-evidence.cjs");
 const raw={kind:"sportsbook_exact_threshold_match_funnel_and_native_price_movement_v1",
  archives:2,newPaidRequests:0,modelPromoted:false,
  bySport:{NHL:{native:4,no_event:1,no_exact_name:1,no_market:1,
   conditional_match:1},NFL:{native:1,no_same_threshold:1}},
  captureSkewBuckets:{within10m:0,within30m:0,within2h:1,within8h:0,
   noExactThreshold:4},
  playerName:"PRIVATE PLAYER",line:3.5,books:["private sportsbook"],
  close:{meanAbsoluteProbabilityMove:.3}};
 const x=safeFunnel(raw);
 assert.equal(x.bySport.NHL.no_exact_name,1);
 assert.equal(x.bySport.NFL.no_same_threshold,1);
 assert.equal(x.sharedPlayerIdVerified,false);
 assert.equal(x.authenticatedClosingLine,false);
 assert.ok(!JSON.stringify(x).includes("PRIVATE PLAYER"));
 assert.ok(!JSON.stringify(x).includes("private sportsbook"));
 assert.equal(safeFunnel({...raw,bySport:{...raw.bySport,NHL:{...raw.bySport.NHL,native:3}}}),null);
 assert.equal(safeFunnel({...raw,newPaidRequests:1}),null);
});
