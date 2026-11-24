"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {assess,freeze}=require("../src/nhl-points-role-shadow-v3.cjs");
const p={gameId:1,playerId:2,market:"points",line:0.5,tier:"Standard",
 lean:"Higher",capturedAt:"2026-11-24T16:00:00Z",gameStartAt:"2026-11-24T20:00:00Z"};
const s=()=>{
 const date="2026-11-24T16:05:00Z",x={...p};
 return {generatedAt:date,individualPropSelections:[x],
  standardQualityShadowV2:{generatedAt:date,rows:[{...x,originalSide:"Higher",
   originalLine:.5,status:"shadow_selected_research_only",bettingEligible:false,
   shadowSelectedProbability:.65}]},
  standardAdaptiveResearchV2:{generatedAt:date,rows:[{...x,originalSide:"Higher",
   priorGames:22,priorComponentVerified:true,pointsSourceEvidence:{projectedPP:"pp1",linemateCount:2}}]},
  positionRateMatchupV2:{generatedAt:date,rows:[{...x,side:"Higher",
   defense:{last10:{games:9}},offense:{last10:{games:9}},
   defenseFactor:1.05,offenseFactor:1.01}]}};
};
test("qualified points research does not become a bet or rewrites a side",()=>{
 const x=freeze(s());
 assert.equal(x.registered,1);
 assert.equal(x.retained,1);
 assert.equal(x.rows[0].originalSide,"Higher");
 assert.equal(x.modelPromoted,false);
 assert.equal(x.bettingEligible,false);
 assert.equal(x.calibrated,false);
});
test("missing PP/teammate verification abstains",()=>{
 const x=s();x.standardAdaptiveResearchV2.rows[0].pointsSourceEvidence.linemateCount=0;
 assert.match(assess(p,x).reason,/power_play_and_teammates/);
});
test("bad opponent sample abstains",()=>{
 const x=s();x.positionRateMatchupV2.rows[0].defense.last10.games=3;
 assert.match(assess(p,x).reason,/opponent_defense/);
});
test("missing original quality source cannot qualify",()=>{
 const x=s();delete x.standardQualityShadowV2;
 assert.match(assess(p,x).reason,/quality_v2/);
});
test("no backdated prospective enrollment",()=>{
 const x=s();x.generatedAt="2026-11-22T16:00:00Z";
 const y=freeze(x);assert.equal(y.status,"not_enrolled_before_policy");
 assert.equal(y.rows.length,0);
});
test("duplicate original offers fail closed",()=>{
 const x=s();x.individualPropSelections.push({...p});
 assert.throws(()=>freeze(x),/Repeated original points/);
});