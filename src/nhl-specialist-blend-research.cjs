"use strict";
// Fixed research-only combination of original frozen inputs. Not a new original forecast.
const {eligible}=require("./nhl-standard-forward-scoreboard.cjs");
const {score}=require("./nhl-original-line-calibration-pairs.cjs");
const {pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const specs=Object.freeze({shotsOnGoal:["sogOpportunity","sogAttempts"],points:["pointsStability","matchup"],assists:["usage","matchup"],blockedShots:["usage","matchup"]});
function prob(r,k){if(!eligible(r,k))return null;const q=r.shadow.variants[k].probabilities,d=q?.higher+q?.lower;return Number.isFinite(d)&&d>0&&q.higher>=0&&q.lower>=0?Math.max(.000001,Math.min(.999999,q.higher/d)):null;}
function blend(r){const base=prob(r,"champion"),keys=specs[r.market];if(!keys||base===null)return null;const ps=keys.map(k=>prob(r,k)).filter(x=>x!==null);if(!ps.length)return null;return {base,adjusted:.5*base+.5*ps.reduce((s,x)=>s+x,0)/ps.length,specialists:ps.length};}
function evaluate(rows){
 const markets={};
 for(const m of Object.keys(specs)){
  const all=rows.filter(r=>r.market===m&&eligible(r,"champion")),matched=[];
  for(const r of all){const b=blend(r),day=pacificDay(r.gameStartAt);if(!b||!day)continue;matched.push({id:JSON.stringify([r.gameId,r.playerId,r.market,r.line]),gameId:r.gameId,day,raw:b.base,adjusted:b.adjusted,y:Number(r.outcome.side==="Higher"),specialists:b.specialists});}
  const summary=score(matched),n=matched.length;
  const directional=k=>matched.filter(r=>r[k]!==.5&&Number(r[k]>.5)===r.y).length;
  markets[m]={eligibleOriginalLines:all.length,matched:n,coverage:all.length?n/all.length:null,oneSpecialist:matched.filter(r=>r.specialists===1).length,twoSpecialists:matched.filter(r=>r.specialists===2).length,championCorrect:directional("raw"),blendCorrect:directional("adjusted"),blendAbstentions:matched.filter(r=>r.adjusted===.5).length,alwaysHigher:matched.filter(r=>r.y===1).length,alwaysLower:matched.filter(r=>r.y===0).length,paired:summary};
 }
 return {kind:"nhl_fixed_specialist_blend_research_v1",markets,inputsFromOriginalFreeze:true,blendItselfOriginallyFrozen:false,posthocResearchOnly:true,productionEligible:false,modelPromoted:false,paidRequests:0,rawRowsPublished:0};
}
module.exports={blend,evaluate};
