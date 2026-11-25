'use strict';
// Research-only comparison of fixed low-count models. Reused chronological history is not untouched.
const {archiveRows}=require('./independent-chronological-challenger.cjs');
const {estimateCountProbabilities}=require('../src/prop-probabilities.cjs');
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const clip=x=>Math.max(.0001,Math.min(.9999,x));
const key=x=>JSON.stringify(x);
const metrics=['threePointersMade','blocks'];
function poissonTail(mu,line){
 if(!finite(mu)||!finite(line)||mu>100||line>100)return null;
 let term=Math.exp(-mu),cdf=term;
 for(let k=1;k<=Math.floor(line);k++){term*=mu/k;cdf+=term;}
 return clip(1-cdf);
}
function forecast(prior,metric,line){
 if(!metrics.includes(metric)||!finite(line)||line%1!==.5)return null;
 const a=prior.filter(x=>finite(x.values?.[metric])&&finite(x.exposure)&&x.exposure>0).slice(-30);
 if(a.length<12)return null;
 const v=a.map(x=>x.values[metric]),recent=a.slice(-10),m=mean(v);
 const minutes=mean(recent.map(x=>x.exposure));
 const perMinute=v.reduce((s,x)=>s+x,0)/a.reduce((s,x)=>s+x.exposure,0);
 const workload=perMinute*minutes;
 const empirical=clip((1+v.filter(x=>x>line).length)/(v.length+2));
 const rate=poissonTail(workload,line);
 if(rate===null)return null;
 // Hurdle separates zero mass from positive-count severity, with fixed Laplace smoothing.
 const positive=v.filter(x=>x>0),nonzero=(1+positive.length)/(2+v.length);
 const conditional=line<1?1:(1+positive.filter(x=>x>line).length)/(2+positive.length);
 return {baseline:empirical,workloadPoisson:rate,hurdle:clip(nonzero*conditional),blend:clip(.5*empirical+.5*rate),mean:m,workloadMean:workload,history:a.length};
}
function evaluate(rows){
 const groups=new Map(),result={},bins=new Map(),residuals=new Map();
 for(const x of rows){if(x.sport!=='NBA')continue;const k=key([x.player,x.scope]);const a=groups.get(k)||[];a.push(x);groups.set(k,a);}
 const examples=[];
 for(const a of groups.values()){
  a.sort((x,y)=>x.start-y.start);
  for(let i=0;i<a.length;i++){
   const x=a[i],prior=a.slice(0,i).filter(p=>p.date<x.date&&p.end<x.start&&p.known<x.start).slice(-30);
   for(const metric of metrics){const v=prior.map(p=>p.values[metric]).filter(finite);if(v.length<12||!finite(x.values[metric]))continue;
    const line=Math.floor(mean(v))+.5, p=forecast(prior,metric,line);if(p)examples.push({date:x.date,event:x.event,player:x.player,metric,y:Number(x.values[metric]>line),actual:x.values[metric],p});
   }
  }
 }
 const methods=['baseline','workloadPoisson','hurdle','blend'];
 for(const e of examples.filter(e=>e.date>='2024-07-01'&&e.date<'2025-07-01'))for(const m of methods){const k=key([e.metric,m,Math.floor(e.p[m]*10)]),b=bins.get(k)||{n:0,y:0};b.n++;b.y+=e.y;bins.set(k,b);}
 for(const e of examples.filter(e=>e.date>='2025-07-01')){
  const a=result[e.metric]??={n:0,events:new Set(),dates:new Set(),scores:{},maeBaseline:0,maeWorkload:0};a.n++;a.events.add(e.event);a.dates.add(e.date);
  a.maeBaseline+=Math.abs(e.actual-e.p.mean);a.maeWorkload+=Math.abs(e.actual-e.p.workloadMean);
  for(const m of methods){const p=e.p[m],b=bins.get(key([e.metric,m,Math.floor(p*10)]));const q=b?.n>=50?clip((b.y+100*p)/(b.n+100)):p;
   const z=a.scores[m]??={rawBrier:0,calibratedBrier:0,rawLogLoss:0,calibratedLogLoss:0,calibratedRows:0};
   z.rawBrier+=(p-e.y)**2;z.calibratedBrier+=(q-e.y)**2;z.rawLogLoss-=e.y?Math.log(p):Math.log1p(-p);z.calibratedLogLoss-=e.y?Math.log(q):Math.log1p(-q);z.calibratedRows+=Number(b?.n>=50);
  }
  const k=key([e.event,e.player]),v=residuals.get(k)||{};v[e.metric]=e.actual-e.p.workloadMean;residuals.set(k,v);
 }
 const pairs=[...residuals.values()].filter(x=>metrics.every(m=>finite(Math.abs(x[m])))).map(x=>metrics.map(m=>x[m]));
 const {correlation}=require('./chronological-player-stat-audit.cjs');
 return {kind:'nba_low_count_research_v1',sourceRows:rows.length,groups:Object.fromEntries(Object.entries(result).map(([m,a])=>[m,{n:a.n,events:a.events.size,dates:a.dates.size,baselineMAE:a.maeBaseline/a.n,workloadMAE:a.maeWorkload/a.n,scores:Object.fromEntries(Object.entries(a.scores).map(([k,z])=>[k,Object.fromEntries(Object.entries(z).map(([f,v])=>[f,f==='calibratedRows'?v:v/a.n]))]))}])),samePlayerSameEventResidualCorrelation:{pairs:pairs.length,pearson:correlation(pairs)},thresholds:'synthetic_prior_mean_half_point',calibrationPeriod:'2024-07-01 through 2025-06-30',evaluationPeriod:'2025-07-01 onward',untouched:false,modelPromoted:false,originalOffersVerified:0,prospective:false,rawRowsPublished:0,paidRequests:0};
}
module.exports={forecast,evaluate};
if(require.main===module){try{console.log(JSON.stringify(evaluate(archiveRows(require('node:fs').realpathSync(process.argv[2])))));}catch{console.error('Low count audit failed closed');process.exitCode=1;}}
