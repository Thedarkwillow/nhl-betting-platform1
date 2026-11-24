"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const quality=require("../src/nhl-standard-quality-challenger-v2.cjs");
const conditional=require("../src/nhl-standard-statistical-quality-v1.cjs");
const now="2026-11-21T02:00:00Z",start="2026-11-23T18:00:00Z",
 observed="2026-11-21T01:55:00Z";
const p={gameId:2026020669,playerId:8482001,team:"TOR",opponent:"BOS",
 market:"shotsOnGoal",line:2.5,tier:"Standard",lean:"Higher",
 probability:.78,capturedAt:observed,gameStartAt:start};
const adaptive={...p,originalSide:p.lean,
 priorGames:24,opponentGames:16,trainingGames:148,trainingDates:28,
 expectedIceSeconds:850,opponentHistoryUsed:true,
 predictions:{learned:.8,fixed:.81}};
const position={...p,side:p.lean,position:"RW",defenseFactor:1.02,
 offenseFactor:1.04,defense:{last10:{games:10}},
 probabilities:{offenseDefense:{higher:.82}}};
function sample(){return{generatedAt:now,
 individualPropSelections:[p],
 rankedProps:[{...p,probabilities:{higher:.78,lower:.22,push:0}}],
 standardAdaptiveResearchV2:{generatedAt:now,modelPromoted:false,
  rows:[adaptive]},positionRateMatchupV2:{generatedAt:now,
  modelPromoted:false,rows:[position]}};}
test("Statistical-only selection equals unchanged strict quality when no availability source blocks",()=>{
 const s=sample(),d=conditional.assess(p,s),q=quality.assess(p,s,{now});
 assert.equal(q.status,"shadow_selected_research_only");
 assert.equal(d.status,q.status);
 assert.equal(d.shadowSelectedProbability,q.shadowSelectedProbability);
 assert.equal(d.bettingEligible,false);
 assert.equal(d.activePlayerVerified,false);
 assert.equal(d.conditionalOnOfficialAppearance,true);
});
test("Missing/invalid medical sources remain blocked for strict policy but never become fictitious clearances",()=>{
 const s=sample(),q=quality.assess(p,s,{now,
  official:{kind:"nhl_league_published_pregame_status_v1",
   capturedAt:"2026-11-21T01:00:00Z",rows:[]},
  officialGitAt:"2026-11-21T02:01:00Z"}),
  research=conditional.freeze(s);
 assert.equal(q.status,"shadow_abstain");
 assert.equal(q.reason,"unverified_or_negative_pregame_availability");
 assert.equal(research.selected,1);
 assert.equal(research.rows[0].activePlayerVerified,false);
 assert.equal(research.rows[0].bettingEligible,false);
 assert.equal(research.automaticPicksApproved,false);
 assert.equal(research.placedWagers,0);
});
test("Conditional statistical sample rules and offered side cannot change, injury does not prove appearance",()=>{
 const s=sample();
 assert.equal(conditional.freeze(s).selected,1);
 const few=structuredClone(s);few.standardAdaptiveResearchV2.rows[0].priorGames=7;
 assert.equal(conditional.freeze(few).selected,0);
 const weak=structuredClone(s);weak.positionRateMatchupV2.rows[0].defense.last10.games=2;
 assert.equal(conditional.freeze(weak).selected,0);
 const changed=structuredClone(s);changed.individualPropSelections[0].line=3.5;
 assert.equal(conditional.freeze(changed).selected,0);
 const future=structuredClone(s);
 future.generatedAt="2026-11-23T18:01:00Z";
 assert.equal(conditional.freeze(future).selected,0);
 const t=conditional.freeze(s).rows[0];
 assert.equal(t.originalSide,"Higher");
 assert.equal(t.originalLine,2.5);
 assert.equal(t.modelSideNeverReversed,true);
 assert.equal(t.platformSettlementVerified,false);
});
