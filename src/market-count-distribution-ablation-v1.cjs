"use strict";
// Count-distribution research. Predictive tails differ even for the same mean.
// Integer threshold pushes are explicit, not folded into Lower.
const num=Number.isFinite,mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
function mass(mu,line,dispersion=0){
 if(!num(mu)||mu<0||!num(line)||line<0||!num(dispersion)||dispersion<0||mu>1000||line>1000)return null;
 if(mu===0)return {higher:0,lower:Number(line>0),push:Number(line===0)};
 const k=Math.floor(line),r=dispersion>0?1/dispersion:null;
 let p=r===null?Math.exp(-mu):Math.exp(-r*Math.log1p(mu/r)),cdf=p;
 for(let j=1;j<=k;j++){p*=r===null?mu/j:(j-1+r)/j*mu/(mu+r);cdf+=p;}
 const push=Number.isInteger(line)?p:0,lower=Math.max(0,Math.min(1,cdf-push));
 return {higher:Math.max(0,1-lower-push),lower,push};
}
function candidates(values,mu,line){
 if(!Array.isArray(values)||values.length<10||values.some(x=>!Number.isInteger(x)||x<0)||!num(mu)||mu<0)return null;
 const m=mean(values),v=values.reduce((s,x)=>s+(x-m)**2,0)/(values.length-1);
 const d=m>0?Math.max(0,Math.min(2,(v-m)/(m*m)))*values.length/(values.length+20):0;
 const p=mass(mu,line),nb=mass(mu,line,d);
 if(!p||!nb)return null;
 const counts={higher:1,lower:1,push:Number.isInteger(line)?1:0};
 for(const x of values){const z=Math.max(0,Math.round(x-m+mu));counts[z>line?"higher":z<line?"lower":"push"]++;}
 const total=counts.higher+counts.lower+counts.push;
 return {poisson:p,negativeBinomial:nb,empirical:Object.fromEntries(Object.entries(counts).map(([k,x])=>[k,x/total]))};
}
function record(bucket,predictions,actual,line,gameId){
 if(!predictions)return;
 const y=actual>line?"higher":actual<line?"lower":"push";
 bucket.n=(bucket.n||0)+1;bucket.games??=new Set();bucket.games.add(gameId);
 for(const [k,p] of Object.entries(predictions)){const s=(bucket.models??={})[k]??={brier:0,logLoss:0};s.brier+=["higher","lower","push"].reduce((a,h)=>a+(p[h]-Number(h===y))**2,0);s.logLoss-=Math.log(Math.max(1e-8,p[y]));}
}
function summary(b){return {thresholds:b.n||0,distinctGames:b.games?.size||0,models:Object.fromEntries(Object.entries(b.models||{}).map(([k,v])=>[k,{brier:v.brier/b.n,logLoss:v.logLoss/b.n}])),calibrated:false,modelPromoted:false};}
module.exports={mass,candidates,record,summary};
