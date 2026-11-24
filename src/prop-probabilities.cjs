"use strict";
// Exploratory Poisson model for integer-count NHL props. Not historically calibrated.
function poissonCdf(k,lambda){
 if(!Number.isFinite(lambda)||lambda<0||!Number.isInteger(k))return null;
 if(k<0)return 0;
 if(lambda===0)return 1;
 if(lambda>150)return null;
 let term=Math.exp(-lambda),sum=term;
 for(let i=1;i<=k;i++){term*=lambda/i;sum+=term;}
 return Math.min(1,Math.max(0,sum));
}
function estimateCountProbabilities(mean,line){
 if(!Number.isFinite(mean)||mean<0||!Number.isFinite(line)||line<0)return null;
 const underCut=Math.ceil(line)-1;
 const overCut=Math.floor(line);
 const lower=poissonCdf(underCut,mean);
 const higher=1-poissonCdf(overCut,mean);
 if(lower===null||higher===null)return null;
 const push=Math.abs(line-Math.round(line))<1e-9?
  Math.max(0,1-lower-higher):0;
 return {higher:Number(higher.toFixed(5)),lower:Number(lower.toFixed(5)),
  push:Number(push.toFixed(5)),distribution:"poisson-v0",
  calibrated:false};
}
module.exports={poissonCdf,estimateCountProbabilities};
