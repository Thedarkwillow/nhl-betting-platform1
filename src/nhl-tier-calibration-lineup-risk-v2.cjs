"use strict";
const {forecast}=require("./forward-calibration-evidence.cjs"),{bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs"),{STANDARD}=require("./prizepicks-payouts.cjs"),{scenario}=require("./nhl-lineup-format-scenario.cjs");
const dt=Date.parse,clip=x=>Math.max(.001,Math.min(.999,x)),loss=(p,y)=>-Math.log(y?clip(p):1-clip(p));
const TIERS=["Standard","Goblin","Demon"];
function usable(state){
 const quarantine=new Set(state?.quarantined||[]),by=new Map();
 for(const r of state?.firstObserved||[]){if(!r.id||quarantine.has(r.id)||!TIERS.includes(r.tier)||!["Higher","Lower"].includes(r.side)||r.tier!=="Standard"&&r.side!=="Higher"||!Number.isFinite(r.p)||r.p<=0||r.p>=1||![0,1].includes(r.y)||!Number.isFinite(dt(r.frozenAt))||!(dt(r.frozenAt)<dt(r.startAt)&&dt(r.startAt)<dt(r.observedFinalAt)))continue;const a=by.get(r.id)||[];a.push(r);by.set(r.id,a);}
 return [...by.values()].filter(a=>a.length===1).map(a=>a[0]).sort((a,b)=>dt(a.frozenAt)-dt(b.frozenAt));
}
function calibrate(r,prior){
 const a=prior.filter(x=>x.tier===r.tier&&x.side===r.side&&dt(x.observedFinalAt)<dt(r.frozenAt)&&x.gameId!==r.gameId);
 const game=new Map();
 for(const p of a){const v=game.get(p.gameId)||[];v.push(p);game.set(p.gameId,v);}
 if(game.size<15||a.length<60)return null;
 // Same-tier, same-side game-balanced intercept and slope with shrinkage.
 let intercept=0,slope=1;
 for(let i=0;i<35;i++){let a0=0,a1=0;for(const v of game.values())for(const x of v){const z=Math.log(clip(x.p)/(1-clip(x.p))),p=1/(1+Math.exp(-(intercept+slope*z))),e=p-x.y;a0+=e/v.length/game.size;a1+=e*z/v.length/game.size;}intercept=Math.max(-1,Math.min(1,intercept-.15*(a0+.1*intercept)));slope=Math.max(.15,Math.min(1.5,slope-.15*(a1+.1*(slope-1))));}
 const z=Math.log(clip(r.p)/(1-clip(r.p))),p=1/(1+Math.exp(-(intercept+slope*z))),h=forecast(r,a);
 return {p:clip(h?.probability!=null ? .6*p+.4*h.probability : p),tier:r.tier,trainingGames:game.size,trainingRows:a.length,calibrated:false};
}
function study(state){
 const all=usable(state),buckets={};
 for(const r of all){const key=r.tier+"|"+r.market+"|"+r.side,b=buckets[key]??={n:0,matched:0,raw:0,fit:0,rawLoss:0,fitLoss:0,diff:new Map(),dates:new Set()};b.n++;const v=calibrate(r,all);if(!v)continue;const d=(v.p-r.y)**2-(r.p-r.y)**2,g=b.diff.get(r.gameId)||{diff:0,n:0};g.diff+=d;g.n++;b.diff.set(r.gameId,g);b.matched++;b.raw+=(r.p-r.y)**2;b.fit+=(v.p-r.y)**2;b.rawLoss+=loss(r.p,r.y);b.fitLoss+=loss(v.p,r.y);b.dates.add(r.startAt.slice(0,10));}
 return {kind:"tier_market_selected_side_calibration_v2",observationRows:all.length,byTierMarket:Object.fromEntries(Object.entries(buckets).map(([k,b])=>{const ci=bootstrapGameBrierDifference([...b.diff.values()]);return [k,{observed:b.n,matched:b.matched,games:b.diff.size,dates:b.dates.size,rawBrier:b.matched?b.raw/b.matched:null,fitBrier:b.matched?b.fit/b.matched:null,rawLogLoss:b.matched?b.rawLoss/b.matched:null,fitLogLoss:b.matched?b.fitLoss/b.matched:null,gameClusterCI:ci,reviewEligible:b.matched>=200&&b.diff.size>=50&&b.dates.size>=20&&ci?.upper<0&&b.fitLoss<b.rawLoss,calibrationApproved:false}];})),firstObservedBeforeFreezeOnly:true,strictSelectedHitNotSettlement:true,modelPromoted:false};
}
// Marginal-only payout stress bounds from the expectation of the number
// of successes. NOT an estimate of correlation or a calibrated joint model.
function bounds(ps,format){
 if(!Array.isArray(ps)||ps.length<2||ps.length>6||ps.some(p=>!Number.isFinite(p)||p<0||p>1)||!["power","flex"].includes(format)||format==="flex"&&ps.length===2)return null;
 const n=ps.length,payout=STANDARD[format][n],mean=ps.reduce((s,p)=>s+p,0);let low=Infinity,high=-Infinity;
 for(let i=0;i<=n;i++)for(let j=i;j<=n;j++){if(mean<i-1e-10||mean>j+1e-10)continue;const w=i===j?1:(j-mean)/(j-i),v=w*(payout[i]||0)+(1-w)*(payout[j]||0);low=Math.min(low,v);high=Math.max(high,v);}
 return {allHitLower:Math.max(0,mean-(n-1)),allHitUpper:Math.min(...ps),grossLower:low,grossUpper:high,independentGross:scenario(ps,format).hypotheticalGrossWeight,measuredCorrelation:null,referencePayoutOnly:true};
}
function dependencyEvidence(state){
 const rows=usable(state),days=new Map();
 for(const r of rows){const day=r.startAt.slice(0,10),a=days.get(day)||new Map();days.set(day,a);const v=a.get(r.gameId)||[];v.push(r.y-r.p);a.set(r.gameId,v);}
 const pairs=[];const pairMoments=[];
 for(const games of days.values()){const a=[...games.values()].map(v=>v.reduce((s,x)=>s+x,0)/v.length);if(a.length<2)continue;let n=0,cross=0,m=0,second=0;for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){cross+=a[i]*a[j];m+=(a[i]+a[j])/2;second+=(a[i]**2+a[j]**2)/2;n++;}pairs.push(cross/n);pairMoments.push({cross:cross/n,mean:m/n,second:second/n});}
 const mean=k=>pairMoments.reduce((s,x)=>s+x[k],0)/pairMoments.length,variance=pairMoments.length?mean("second")-mean("mean")**2:0;const corr=pairMoments.length>=20&&variance>0?Math.max(-1,Math.min(1,(mean("cross")-mean("mean")**2)/variance)):null;
 return {distinctMultiGameDates:pairs.length,gameMeanResidualPairCorrelationDescriptive:corr,correlationUnit:"equal-date weighted symmetric pair of different game mean residuals",minimumDatesForDescriptiveCorrelation:20,notLegCorrelation:true,meanGameResidualCrossProduct:pairs.length?pairs.reduce((s,x)=>s+x,0)/pairs.length:null,measuredLegCorrelation:null,validatedJointProbability:false};
}
function gate({actualLineHeldout,calibrationApproved,payoutVerified,correlationValidated}={}){
 return actualLineHeldout===true&&calibrationApproved===true&&payoutVerified===true&&correlationValidated===true;
}
module.exports={study,calibrate,usable,bounds,dependencyEvidence,gate};
