"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {summarize}=require("../src/goblin-prospective-selectivity-audit.cjs");
const {quoteTiming,validTimingForComparison}=require("../src/sportsbook-match-funnel.cjs");
const {auditNFL}=require("../src/nfl-goblin-identity-audit-v1.cjs");
const policy="2026-11-18T23:54:26Z";
const row={sport:"NHL",tier:"Goblin",market:"shotsOnGoal",
 sourceCapturedAt:"2026-11-19T01:15:00Z",
 sourceFirstGitAt:"2026-11-19T01:16:00Z",
 shadowFirstGitAt:"2026-11-19T01:20:00Z",
 gameStartsAt:"2026-11-19T03:00:00Z",
 originalFirstGitVerified:true,shadowFirstGitVerified:true,sourceIdentityVerified:true,
 status:"shadow_candidate",goblinSelectiveScreen:"provisional_research_candidate",
 bettingEligible:false,modelPromoted:false};
test("new policy selectivity ledger keeps candidates AND abstentions, not old freezes",()=>{
 const old={...row,sourceCapturedAt:"2026-11-18T23:25:00Z",
  sourceFirstGitAt:"2026-11-18T23:26:00Z",shadowFirstGitAt:"2026-11-18T23:27:00Z"};
 const abstain={...row,status:"abstain",
  goblinSelectiveScreen:"abstain",
  reason:"model_direction_not_on_original_offered_side"};
 const late={...row,shadowFirstGitAt:"2026-11-19T02:59:00Z"};
 const unknown={...row,status:"ambiguous",goblinSelectiveScreen:"unknown"};
 const s=summarize([row,old,abstain,late,unknown],policy);
 a.equal(s.screened,3);a.equal(s.selected,1);a.equal(s.abstained,1);
 a.equal(s.unknownStatus,1);a.equal(s.lateOrUnverified,1);
 a.equal(s.abstentionReasons.model_direction_not_on_original_offered_side,1);
 a.equal(s.byMarket.shotsOnGoal.screened,3);
 a.equal(s.prospectiveDecisionsUsed,0);a.equal(s.modelPromoted,false);
});
test("invalid new-policy timestamp never reclassifies old Goblin cohort",()=>{
 const s=summarize([row],null);
 a.equal(s.policyFirstGitVerified,false);a.equal(s.screened,0);
});
test("sportsbook quote recorded BEFORE original capture but committed AFTER is not original evidence",()=>{
 const p={capturedAt:"2026-11-17T00:10:00Z",
  committedAt:"2026-11-17T00:12:00Z",gameStart:"2026-11-17T01:00:00Z"};
 const q=Date.parse("2026-11-17T00:08:00Z");
 a.notEqual(quoteTiming(p,q,Date.parse("2026-11-17T00:11:00Z")),"beforeFreeze");
 a.equal(validTimingForComparison(p,q,Date.parse("2026-11-17T00:11:00Z")),false);
 a.equal(quoteTiming(p,q,Date.parse("2026-11-17T00:09:00Z")),"beforeFreeze");
});
test("NFL audit exposes all simultaneous missing evidence without approving unverified players",()=>{
 const now="2026-11-18T23:40:00Z",r={tier:"goblin",period:"Full",
  status:"pre_game",providerPlayerId:"provider-1",providerGameId:"game-1",
  eventStartsAt:"2026-11-20T01:00:00Z",line:12.5,team:"BUF"};
 const s=auditNFL([r],{now,sourceAt:"2026-11-18T23:34:00Z",
  originalArchiveFirstGitAt:"2026-11-18T23:35:00Z"});
 a.equal(s.originalOfferRows,1);
 a.deepEqual(s.prerequisiteGaps,
  {officialGame:1,providerToGSIS:1,positiveActiveRoster:1});
 a.equal(s.eligibleModelInputRows,0);
 a.equal(s.recommendationsReleased,0);
});
