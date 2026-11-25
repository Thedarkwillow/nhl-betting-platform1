"use strict";
// Fixed moment-based count distribution. Research only; no fitting to future outcomes.
function countMass(values,line){
 if(values.length<12||values.some(x=>!Number.isSafeInteger(x)||x<0)||!Number.isFinite(line)||line<0||line>10000||!Number.isInteger(line*2))return null;
 const mu=values.reduce((s,x)=>s+x,0)/values.length,v=values.reduce((s,x)=>s+(x-mu)**2,0)/(values.length-1);
 if(mu===0)return {higher:0,lower:line>0?1:0,push:line===0?1:0,distribution:"point_mass"};
 const nb=v>mu+.001,r=nb?mu*mu/(v-mu):null,p=nb?mu/v:null;
 let lp=nb?r*Math.log(p):-mu,lo=0,eq=0;
 for(let k=0;k<=Math.floor(line);k++){
  if(k<line)lo+=Math.exp(lp);else eq=Math.exp(lp);
  lp+=nb?Math.log(k+r)-Math.log(k+1)+Math.log1p(-p):Math.log(mu)-Math.log(k+1);
 }
 lo=Math.max(0,Math.min(1,lo));eq=Math.max(0,Math.min(1-lo,eq));
 return {higher:1-lo-eq,lower:lo,push:eq,distribution:nb?"negative_binomial":"poisson",mean:mu,variance:v};
}
module.exports={countMass};
