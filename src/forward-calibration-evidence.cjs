"use strict";
// Predeclared hierarchical residual shrinkage. Strict selected-side hit
// probability (push is a non-hit, not a settlement loss). No production use.
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const pacificDay=timestamp=>{
 if(!Number.isFinite(dt(timestamp)))return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(timestamp)).map(x=>[x.type,x.value]));
 return [parts.year,parts.month,parts.day].join("-");
};
const num=x=>typeof x==="number"&&Number.isFinite(x);
const clip=x=>Math.max(.000001,Math.min(.999999,x));
const loss=(p,y)=>-Math.log(y?clip(p):1-clip(p));
const key=(...x)=>JSON.stringify(x);
const valid=r=>typeof r?.id==="string"&&r.id&&typeof r.market==="string"&&r.market&&typeof r.gameId!=="undefined"&&r.gameId!==null&&["Standard","Goblin","Demon"].includes(r.tier)&&["Higher","Lower"].includes(r.side)&&(r.tier==="Standard"||r.side==="Higher")&&num(r.p)&&r.p>0&&r.p<1&&[0,1].includes(r.y)&&Number.isFinite(dt(r.frozenAt))&&Number.isFinite(dt(r.startAt))&&dt(r.frozenAt)<dt(r.startAt);
function observe(current,previous,now){
 const at=dt(now);if(!Number.isFinite(at))throw Error("Valid observation clock required");
 const old=new Map((previous?.firstObserved||[]).map(r=>[r.id,r])),quarantine=new Set(previous?.quarantined||[]),seen=new Map();
 for(const r of current||[]){if(!valid(r)||at<=dt(r.startAt))continue;const a=seen.get(r.id)||[];a.push(r);seen.set(r.id,a);}
 for(const [id,a] of seen){
  if(a.length!==1){quarantine.add(id);continue;}
  const r=a[0],p=old.get(id);
  if(p&&["market","gameId","tier","side","period","p","y","frozenAt","startAt"].some(k=>r[k]!==p[k])){quarantine.add(id);continue;}
  if(!p)old.set(id,{...r,observedFinalAt:now});
 }
 return {firstObserved:[...old.values()],quarantined:[...quarantine].sort()};
}
function residual(rows,anchor,weight){
 const games=new Map();
 for(const r of rows){const a=games.get(r.gameId)||{n:0,sum:0};a.n++;a.sum+=r.y-r.p;games.set(r.gameId,a);}
 return {offset:([...games.values()].reduce((s,x)=>s+x.sum/x.n,0)+weight*anchor)/(games.size+weight),games:games.size,rows:rows.length};
}
function baseRate(r,prior){const h=prior.filter(x=>x.tier===r.tier&&x.side===r.side&&x.market===r.market&&x.period===r.period),games=new Map();for(const x of h){const a=games.get(x.gameId)||[];a.push(x.y);games.set(x.gameId,a);}if(games.size<10||h.length<30)return null;return (1+[...games.values()].reduce((s,a)=>s+a.reduce((q,y)=>q+y,0)/a.length,0))/(2+games.size);}
function forecast(r,prior){
 const tier=prior.filter(x=>x.tier===r.tier&&x.side===r.side),market=tier.filter(x=>x.market===r.market&&x.period===r.period);
 if(tier.length<60||new Set(tier.map(x=>x.gameId)).size<15)return null;
 const a=residual(tier,0,30),b=residual(market,a.offset,20);
 // Preserves separate tiers, sides, and period target; sparse markets borrow
 // only a shrunk same-tier/side correction. No target outcomes enter fit.
 return {probability:clip(r.p+Math.max(-.15,Math.min(.15,b.offset))),tierGames:a.games,marketGames:b.games,marketRows:b.rows};
}
function study(state){
 const q=new Set(state?.quarantined||[]),all=(state?.firstObserved||[]).filter(r=>valid(r)&&!q.has(r.id)&&dt(r.observedFinalAt)>dt(r.startAt)).sort((a,b)=>dt(a.frozenAt)-dt(b.frozenAt)),buckets={};
 for(const r of all){
  const prior=all.filter(x=>x.gameId!==r.gameId&&dt(x.observedFinalAt)<dt(r.frozenAt)&&dt(x.frozenAt)<dt(r.frozenAt));
  const f=forecast(r,prior),k=key(r.market,r.period||"full_game",r.tier,r.side),a=buckets[k]??={observed:0,n:0,raw:0,fit:0,rawLoss:0,fitLoss:0,observedHits:0,rawProbabilitySum:0,fitProbabilitySum:0,games:new Set(),dates:new Set(),diff:new Map(),baselineN:0,baselineBrier:0,baselineRawBrier:0,baselineFitBrier:0,baselineGames:new Set()};
  a.observed++;if(!f)continue;const baseline=baseRate(r,prior);if(baseline!==null){a.baselineN++;a.baselineGames.add(r.gameId);a.baselineBrier+=(baseline-r.y)**2;a.baselineRawBrier+=(r.p-r.y)**2;a.baselineFitBrier+=(f.probability-r.y)**2;}
  const y=r.y,p=r.p,v=f.probability,delta=(v-y)**2-(p-y)**2,g=a.diff.get(r.gameId)||{diff:0,n:0,rawBrier:0,fitBrier:0};
  const bin=(q)=>Math.min(9,Math.floor(q*10)),record=(bins,q)=>{const b=bins[bin(q)]??={n:0,p:0,y:0,games:new Map()};b.n++;b.p+=q;b.y+=y;const g=b.games.get(r.gameId)||{n:0,p:0,y:0};g.n++;g.p+=q;g.y+=y;b.games.set(r.gameId,g);};
  record(a.rawBins??={},p);record(a.fitBins??={},v);
  a.n++;a.observedHits+=y;a.rawProbabilitySum+=p;a.fitProbabilitySum+=v;a.raw+=(p-y)**2;a.fit+=(v-y)**2;a.rawLoss+=loss(p,y);a.fitLoss+=loss(v,y);a.games.add(r.gameId);a.dates.add(pacificDay(r.startAt));g.diff+=delta;g.rawBrier+=(p-y)**2;g.fitBrier+=(v-y)**2;g.n++;a.diff.set(r.gameId,g);
 }
 return {kind:"first_observed_hierarchical_calibration_v1",byMarketTierSide:Object.fromEntries(Object.entries(buckets).map(([k,a])=>[k,{observed:a.observed,matchedHeldout:a.n,distinctGames:a.games.size,distinctDates:a.dates.size,observedSelectedRate:a.n?a.observedHits/a.n:null,rawMeanSelectedProbability:a.n?a.rawProbabilitySum/a.n:null,challengerMeanSelectedProbability:a.n?a.fitProbabilitySum/a.n:null,rawSignedCalibrationGap:a.n?(a.rawProbabilitySum-a.observedHits)/a.n:null,challengerSignedCalibrationGap:a.n?(a.fitProbabilitySum-a.observedHits)/a.n:null,rawBrier:a.n?a.raw/a.n:null,challengerBrier:a.n?a.fit/a.n:null,rawLogLoss:a.n?a.rawLoss/a.n:null,challengerLogLoss:a.n?a.fitLoss/a.n:null,gameEqualRawBrier:a.diff.size?[...a.diff.values()].reduce((s,g)=>s+g.rawBrier/g.n,0)/a.diff.size:null,gameEqualChallengerBrier:a.diff.size?[...a.diff.values()].reduce((s,g)=>s+g.fitBrier/g.n,0)/a.diff.size:null,gameCluster95:require("./nhl-period-count-model.cjs").bootstrapGameBrierDifference([...a.diff.values()]),matchedPriorMarketRateBaseline:{n:a.baselineN,distinctGames:a.baselineGames.size,priorRateBrier:a.baselineN?a.baselineBrier/a.baselineN:null,rawBrier:a.baselineN?a.baselineRawBrier/a.baselineN:null,challengerBrier:a.baselineN?a.baselineFitBrier/a.baselineN:null,priorOnly:true},reliabilityBins:{raw:Object.entries(a.rawBins||{}).map(([i,b])=>({low:Number(i)/10,high:(Number(i)+1)/10,count:b.n,meanProbability:b.p/b.n,observedRate:b.y/b.n,distinctGames:b.games.size,gameEqualMeanProbability:[...b.games.values()].reduce((s,g)=>s+g.p/g.n,0)/b.games.size,gameEqualObservedRate:[...b.games.values()].reduce((s,g)=>s+g.y/g.n,0)/b.games.size})),challenger:Object.entries(a.fitBins||{}).map(([i,b])=>({low:Number(i)/10,high:(Number(i)+1)/10,count:b.n,meanProbability:b.p/b.n,observedRate:b.y/b.n,distinctGames:b.games.size,gameEqualMeanProbability:[...b.games.values()].reduce((s,g)=>s+g.p/g.n,0)/b.games.size,gameEqualObservedRate:[...b.games.values()].reduce((s,g)=>s+g.y/g.n,0)/b.games.size}))},minimumEvidenceReached:a.n>=100&&a.games.size>=30&&a.dates.size>=10,releaseDiagnostics:{enoughRows:a.n>=250,enoughGames:a.games.size>=30,enoughSlates:a.dates.size>=20,matchedPriorRateCoverage:a.n?a.baselineN/a.n:null,beatsMatchedPriorRate:a.baselineN>=250&&a.baselineFitBrier<a.baselineBrier,beatsMatchedRaw:a.baselineN>=250&&a.baselineFitBrier<a.baselineRawBrier,beatsRawLogLoss:a.n>=250&&a.fitLoss<a.rawLoss,requiresIndependentProspectiveReview:true},calibrationApproved:false}])),firstObservationClockOnly:true,backdatedResultsAllowed:false,modelPromoted:false};
}
module.exports={observe,forecast,study,baseRate,pacificDay};
