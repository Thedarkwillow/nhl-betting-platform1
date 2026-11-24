"use strict";
// Matched original pregame selections, one deterministic pair per game
// and relationship. No fitted 3-6-leg joint law or payout calculation.
const date=x=>typeof x==="string"?Date.parse(x):NaN,clip=x=>Math.min(1,Math.max(0,x));
const pairKey=(a,b)=>JSON.stringify([a.market,a.period||"full_game",a.side,a.tier,b.market,b.period||"full_game",b.side,b.tier,a.playerId===b.playerId?"same_player":a.team&&a.team===b.team?"same_team":"other_or_unknown_team"]);
const byId=(a,b)=>String(a.id).localeCompare(String(b.id));
function pairs(state){
 const blocked=new Set(state?.quarantined||[]),games=new Map(),out=[];
 for(const r of state?.firstObserved||[]){
  if(blocked.has(r.id)||r.playerId==null||r.gameId==null||![0,1].includes(r.y)||!Number.isFinite(r.p)||r.p<=0||r.p>=1||!(date(r.frozenAt)<date(r.startAt)&&date(r.startAt)<date(r.observedFinalAt)))continue;
  const a=games.get(r.gameId)||[];a.push(r);games.set(r.gameId,a);
 }
 for(const [gameId,rows] of games){
  // Choose only by the earliest original commit and IDs; no outcomes or
  // probability ranking. Exclude multiple thresholds on identical target.
  const sorted=rows.sort((a,b)=>date(a.frozenAt)-date(b.frozenAt)||byId(a,b)),chosen=new Map();
  for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++){
   let a=sorted[i],b=sorted[j];
   if(a.playerId===b.playerId&&a.market===b.market&&(a.period||"full_game")===(b.period||"full_game"))continue;
   if(a.startAt!==b.startAt)continue;
   if(byId(a,b)>0)[a,b]=[b,a];
   // Use lexicographic target ordering, not different IDs each game.
   const target=r=>JSON.stringify([r.market,r.period||"full_game",r.side,r.tier]);
   if(target(a)>target(b))[a,b]=[b,a];
   const k=pairKey(a,b);if(chosen.has(k))continue;
   chosen.set(k,{gameId,k,a:a.p,b:b.p,y:a.y*b.y,frozenAt:Math.max(date(a.frozenAt),date(b.frozenAt)),observedAt:Math.max(date(a.observedFinalAt),date(b.observedFinalAt))});
  }
  out.push(...chosen.values());
 }
 return out;
}
function study(state){
 const groups=new Map();for(const x of pairs(state)){const a=groups.get(x.k)||[];a.push(x);groups.set(x.k,a);}
 const byRelationship={};
 for(const [k,a] of groups){
  let n=0,base=0,adjusted=0;
  for(const x of a){
   const prior=a.filter(p=>p.gameId!==x.gameId&&p.observedAt<x.frozenAt);
   if(prior.length<20)continue;
   const offset=prior.reduce((s,p)=>s+p.y-p.a*p.b,0)/(prior.length+30);
   const p=x.a*x.b,q=Math.max(0,x.a+x.b-1,Math.min(Math.min(x.a,x.b),clip(p+offset)));
   n++;base+=(p-x.y)**2;adjusted+=(q-x.y)**2;
  }
  byRelationship[k]={uniqueGamePairs:a.length,heldoutGames:n,independentBrier:n?base/n:null,adjustedBrier:n?adjusted/n:null,minimumSampleReached:n>=50,approved:false};
 }
 return {kind:"first_observed_original_pair_relationship_study_v1",byRelationship,requiresFirstObservedEarlierFinal:true,strictHitIncludesPushAsNonhit:true,verifiedJointProbability:false,threeToSixLegJointLawVerified:false,modelPromoted:false};
}
module.exports={pairs,study};
