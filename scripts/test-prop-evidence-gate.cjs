"use strict";
const assert=require("node:assert/strict"),{test}=require("node:test");
const {probability,lineup}=require("../assets/prop-evidence-gate.js");
const p={market:"shotsOnGoal",tier:"Standard",period:"full_game",lean:"Higher",calibrationPolicyId:"v1",calibratedProbability:.61,probability:.92};
const group={approved:true,market:p.market,tier:p.tier,period:p.period,side:p.lean,policyId:"v1"};
const data={probabilityValidation:{estimatedProbabilitiesValidated:true,bettingRecommendationsApproved:true,approvedGroups:[group]}};
test("unvalidated or missing evidence never exposes raw estimate",()=>{assert.equal(probability({},p),null);assert.equal(probability(data,{...p,calibratedProbability:undefined}),null);assert.equal(probability(data,{...p,researchEligibility:"watchlist"}),null);});
test("exact market, tier, period, side and policy are mandatory",()=>{assert.equal(probability(data,p),.61);for(const patch of [{tier:"Goblin"},{period:undefined},{lean:"Lower"},{market:"points"},{calibrationPolicyId:"v2"}])assert.equal(probability(data,{...p,...patch}),null);assert.equal(probability({probabilityValidation:{...data.probabilityValidation,approvedGroups:[group,group]}},p),null);});
test("lineups require separate joint, settlement, payout and explicit approval",()=>{assert.equal(lineup(data),false);const d={...data,researchQuality:{lineupJointProbabilityVerified:true},probabilityValidation:{...data.probabilityValidation,actualPlatformSettlementsVerified:true,payoutAdjustedEVVerified:true,lineupRecommendationsApproved:true}};assert.equal(lineup(d),true);assert.equal(lineup({...d,researchQuality:{}}),false);});
