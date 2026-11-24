"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {scenario,eligibleVector}=require("../src/nhl-lineup-format-scenario.cjs");
const {optimize}=require("../src/nhl-lineup-optimizer.cjs");
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-10);
function prop(i,p=.7,extra={}){
 return {playerId:i,matchup:"game "+i,tier:"Standard",market:"shotsOnGoal",
  line:2.5,lean:"Higher",probability:p,probabilities:{higher:p,lower:1-p,push:0},...extra};
}
test("format scenario correctly models all hit counts and partial flex results",()=>{
 const power=scenario([.5,.5,.5],"power"),flex=scenario([.5,.5,.5],"flex");
 assert.deepEqual(power.modeledCountMass,[.125,.375,.375,.125]);
 near(power.hypotheticalGrossWeight,.75);near(flex.hypotheticalGrossWeight,.75);
 near(scenario([1,1,0,0,1,1],"flex").hypotheticalGrossWeight,.4);
 assert.equal(scenario([.6,.6],"flex"),null);
 assert.equal(scenario([.6,-.1],"power"),null);
 assert.equal(power.verifiedExpectedValue,null);
});
test("format search respects strict games, exact vectors and supported sizes",()=>{
 const props=Array.from({length:8},(_,i)=>prop(i+1,.8-i*.02));
 props.push(prop(99,.98,{tier:"Demon"}),prop(100,.95,{probabilities:{higher:.95,lower:.01,push:.04}}),
     prop(101,.97,{researchEligibility:"watchlist"}));
 for(const format of ["power","flex"]){
  const r=optimize(props,{researchFormat:format,allowSameGameFallback:false});
  for(let n=2;n<=6;n++){
   if(format==="flex"&&n===2){assert.equal(r[n],null);continue;}
   const s=r[n];
   assert.equal(s.picks.length,n);
   assert.deepEqual(s.picks.map(p=>p.playerId),Array.from({length:n},(_,i)=>i+1));
   assert.equal(s.privateFormatScenario.format,format);
   assert.equal(s.expectedValue,null);assert.equal(s.probability,null);
   assert.equal(s.payoutQuoteVerified,false);assert.equal(s.distinctGames,n);
  }
 }
 assert.throws(()=>optimize(props,{researchFormat:"flex"}),/strict distinct games/);
 assert.equal(eligibleVector(prop(1,.7,{probabilities:{higher:.6,lower:.4,push:0}})),false);
});
test("separate objective search handles game conflicts and higher-only vector mismatch",()=>{
 const props=[prop(1,.91),prop(2,.90,{matchup:"game 1"}),prop(3,.8),prop(4,.7),
   prop(5,.99,{probabilities:{higher:.9,lower:.1,push:0}})];
 const r=optimize(props,{min:3,max:3,researchFormat:"flex",allowSameGameFallback:false});
 assert.deepEqual(r[3].picks.map(p=>p.playerId),[1,3,4]);
});
