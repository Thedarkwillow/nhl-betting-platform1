"use strict";
// Prior-only period distributions: separate count, duration, role and
// goaltending exposure. Official period participation conditional, no bets.
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {COUNT_MARKETS,bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const MARKETS=[...COUNT_MARKETS,"timeOnIceSeconds"],P=[1,2,3];
const num=x=>Number.isFinite(x),mean=a=>a.reduce((s,x)=>s+x,0)/a.length,valid=(r,m)=>r?.playedInPeriod===true&&P.includes(r.period)&&Number.isInteger(r.gameId)&&/^\d{4}-\d{2}-\d{2}$/.test(r.gameDate||"")&&Number.isInteger(r[m])&&r[m]>=0&&(m!=="timeOnIceSeconds"||r[m]<=1200);
const lines={shotsOnGoal:[.5,1.5,2.5],goals:[.5,1.5],assists:[.5,1.5],points:[.5,1.5],blockedShots:[.5,1.5],hits:[.5,1.5,2.5],faceoffsWon:[1.5,2.5,3.5],saves:[5.5,8.5,10.5],goalsAgainst:[.5,1.5,2.5],timeOnIceSeconds:[239.5,359.5,479.5]};
function empirical(values,line,mu=null,max=Infinity){
 const a={higher:1,lower:1,push:Number(Number.isInteger(line))},center=mean(values);
 for(const y of values){const z=mu===null?y:Math.min(max,Math.max(0,Math.round(y-center+mu)));a[z>line?"higher":z<line?"lower":"push"]++;}
 const n=Object.values(a).reduce((s,x)=>s+x,0);return Object.fromEntries(Object.entries(a).map(([k,v])=>[k,v/n]));
}
function forecast(rows,m,line){
 if(!MARKETS.includes(m)||!num(line)||line<0||!Array.isArray(rows)||rows.length<8||!rows.every(r=>valid(r,m))||new Set(rows.map(r=>r.gameId)).size!==rows.length)return null;
 const a=rows.slice(-30),values=a.map(r=>r[m]),recent=values.slice(-5),old=mean(values),mu=(5*mean(recent)+10*old)/15,baseline=empirical(values,line);
 let mass=empirical(values,line,mu,m==="timeOnIceSeconds"?1200:Infinity),method="shrunk_recent_empirical";
 if(["goals","assists","points","goalsAgainst"].includes(m)){
  // Hurdle: probability of scoring plus conditional positive count.
  const positive=values.filter(v=>v>0),p=(positive.length+1)/(values.length+2);
  const tail=positive.length?empirical(positive,line):null;
  // Positive-count tail is evaluated exactly when line below one;
  // otherwise use empirical conditional positive count, no invented counts.
  const high=line<1?p:tail?p*tail.higher:0, push=line===0?1-p:Number.isInteger(line)&&line>=1&&tail?p*tail.push:0;
  mass={higher:high,lower:Math.max(0,1-high-push),push};method="zero_hurdle_conditional_positive_counts";
 }else if(["shotsOnGoal","hits","blockedShots","saves","faceoffsWon"].includes(m)){
  // Overdispersed count distribution: preserve observed empirical tail while
  // allowing fixed Poisson shrinkage toward the player's prior period mean.
  // Faceoff attempts are not available in this archive; no fabricated rate.
  const p=estimateCountProbabilities(mu,line);
  if(p){mass=Object.fromEntries(["higher","lower","push"].map(k=>[k,.7*mass[k]+.3*p[k]]));const t=Object.values(mass).reduce((s,x)=>s+x,0);for(const k of Object.keys(mass))mass[k]/=t;method="empirical_count_poisson_mixture";}
 }else method="bounded_shifted_duration_empirical";
 // Fixed, earlier-period workload sensitivity; no current-period TOI enters.
 let usageAdjusted=null;
 const exposure=a.filter(r=>Number.isInteger(r.timeOnIceSeconds)&&r.timeOnIceSeconds>0&&r.timeOnIceSeconds<=1200);
 if(m!=="timeOnIceSeconds"&&exposure.length>=8){
  const seconds=exposure.reduce((z,r)=>z+r.timeOnIceSeconds,0),total=exposure.reduce((z,r)=>z+r[m],0),expected=mean(exposure.slice(-5).map(r=>r.timeOnIceSeconds));
  const adjusted=(total/seconds)*expected,p=estimateCountProbabilities(adjusted,line);
  if(p&&["higher","lower","push"].every(k=>Number.isFinite(p[k]))){
   usageAdjusted=Object.fromEntries(["higher","lower","push"].map(k=>[k,.8*mass[k]+.2*p[k]]));const t=Object.values(usageAdjusted).reduce((z,x)=>z+x,0);
   if(t>0)for(const k of Object.keys(usageAdjusted))usageAdjusted[k]/=t;else usageAdjusted=null;
  }
 }
 return {estimate:mu,probabilities:mass,baseline,usageAdjusted,method,priorGames:rows.length,conditionalOnPeriodParticipation:true,calibrated:false};
}
function study(history){
 if(history?.kind!=="nhl_official_period_history_v1"||!history.players)throw Error("Official period archive required");
 const out={};
 for(const periods of Object.values(history.players))for(const p of P)for(const m of MARKETS){
  const a=(periods[String(p)]||[]).filter(r=>valid(r,m)&&r.period===p).sort((x,y)=>x.gameDate.localeCompare(y.gameDate)||x.gameId-y.gameId);
  const counts=new Map();for(const r of a)counts.set(r.gameId,(counts.get(r.gameId)||0)+1);
  const clean=a.filter(r=>counts.get(r.gameId)===1);
  for(const row of clean){
   const prior=clean.filter(r=>r.gameDate<row.gameDate);if(prior.length<8)continue;
   // Goaltender save / GA role supported by official non-null stats only.
   const k=p+"|"+m,s=out[k]??={n:0,t:0,b:0,c:0,bl:0,cl:0,games:new Set(),dates:new Set(),diff:new Map()};
   s.n++;s.games.add(row.gameId);s.dates.add(row.gameDate);
   for(const line of lines[m]){
    const f=forecast(prior,m,line);if(!f)continue;
    const y=Number(row[m]>line),q=f.probabilities.higher,b=f.baseline.higher,clip=x=>Math.max(1e-8,Math.min(1-1e-8,x)),g=s.diff.get(row.gameId)||{diff:0,n:0};
    if(f.usageAdjusted){s.usageN=(s.usageN||0)+1;s.usageBrier=(s.usageBrier||0)+(f.usageAdjusted.higher-y)**2;s.usageReference=(s.usageReference||0)+(q-y)**2;}
    s.t++;s.b+=(b-y)**2;s.c+=(q-y)**2;s.bl-=Math.log(clip(y?b:1-b));s.cl-=Math.log(clip(y?q:1-q));g.diff+=(q-y)**2-(b-y)**2;g.n++;s.diff.set(row.gameId,g);
   }
  }
 }
 return {kind:"nhl_dedicated_period_distribution_study_v1",policies:P.flatMap(p=>MARKETS.map(m=>p+"|"+m)),byMarket:Object.fromEntries(Object.entries(out).filter(([,a])=>a.t).map(([k,a])=>[k,{appearances:a.n,thresholds:a.t,distinctGames:a.games.size,distinctDates:a.dates.size,baselineBrier:a.b/a.t,candidateBrier:a.c/a.t,baselineLogLoss:a.bl/a.t,candidateLogLoss:a.cl/a.t,usageSensitivity:{matchedThresholds:a.usageN||0,referenceBrier:a.usageN?a.usageReference/a.usageN:null,challengerBrier:a.usageN?a.usageBrier/a.usageN:null,approved:false},gameCluster95:bootstrapGameBrierDifference([...a.diff.values()]),approved:false}])),sourceDates:history.sourceDates?.length||0,syntheticThresholds:true,conditionalOnObservedParticipation:true,actualPlatformSettlementVerified:false,modelPromoted:false};
}
module.exports={MARKETS,lines,forecast,study};
