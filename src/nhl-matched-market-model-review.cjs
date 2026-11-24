"use strict";
// Matched model scorecard: each comparison uses exactly the same first
// frozen rows. Unrelated historical reports must never be ranked together.
const {bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const clip=p=>Math.max(1e-6,Math.min(1-1e-6,p)),valid=p=>Number.isFinite(p)&&p>=0&&p<=1;
function review(rows,history){
 const groups={},seen=new Set();
 for(const r of rows){const k=JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier]);if(seen.has(k))continue;seen.add(k);
  const finals=(history.players[String(r.playerId)]?.games||[]).filter(g=>g.gameId===r.gameId&&g.playerId===r.playerId&&["OFF","FINAL"].includes(g.gameState)&&g.timeOnIceSeconds>0&&Number.isInteger(g[r.market])&&g[r.market]>=0&&(!["saves","goalsAgainst"].includes(r.market)||g.goalieStarted===true));
  if(finals.length!==1||r.line%1!==.5||!valid(r.champion))continue;
  const g=finals[0],y=Number(g[r.market]>r.line),m=groups[r.market]??={},p=r.champion;
  for(const [name,q] of Object.entries(r.variants||{})){if(!valid(q))continue;const a=m[name]??={n:0,p:0,q:0,lp:0,lq:0,games:new Map(),dates:new Set(),baseHits:0,candidateHits:0,higherHits:0,lowerHits:0};a.n++;a.p+=(p-y)**2;a.q+=(q-y)**2;a.lp-=Math.log(y?clip(p):clip(1-p));a.lq-=Math.log(y?clip(q):clip(1-q));a.baseHits+=Number((p>=.5)===Boolean(y));a.candidateHits+=Number((q>=.5)===Boolean(y));a.higherHits+=y;a.lowerHits+=1-y;a.dates.add(g.gameDate);const d=a.games.get(g.gameId)||{diff:0,n:0};d.diff+=(q-y)**2-(p-y)**2;d.n++;a.games.set(g.gameId,d);}
 }
 return Object.fromEntries(Object.entries(groups).map(([market,g])=>[market,Object.fromEntries(Object.entries(g).map(([name,a])=>{const ci=bootstrapGameBrierDifference([...a.games.values()]);return [name,{matched:a.n,games:a.games.size,dates:a.dates.size,championBrier:a.p/a.n,candidateBrier:a.q/a.n,championLogLoss:a.lp/a.n,candidateLogLoss:a.lq/a.n,championHitRate:a.baseHits/a.n,candidateHitRate:a.candidateHits/a.n,alwaysHigher:a.higherHits/a.n,alwaysLower:a.lowerHits/a.n,pairedBrierCI:ci,reviewEligible:a.n>=200&&a.games.size>=60&&a.dates.size>=20&&ci?.upper<0&&a.lq<a.lp&&a.candidateHits>Math.max(a.baseHits,a.higherHits,a.lowerHits),productionApproved:false}];}))]));
}
module.exports={review};
