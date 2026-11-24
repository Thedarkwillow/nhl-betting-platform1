"use strict";
// Prior game-block resampling. A scenario keeps pace, pass rate and
// conversion paired in the same historical game rather than independent.
const n=Number.isFinite,avg=a=>a.reduce((s,x)=>s+x,0)/a.length,cap=(x,a,b)=>Math.max(a,Math.min(b,x));
function qbScenarios(own,opp,share,margin){
 if(own.length<8||opp.length<8||!n(share)||share<0||share>1||!n(margin))return null;
 const valid=x=>n(x.regulationScrimmagePlays)&&x.regulationScrimmagePlays>0&&n(x.dropbacks)&&n(x.designedPlays)&&x.designedPlays>0&&x.dropbacks<=x.designedPlays&&n(x.attemptsPerDropback)&&x.attemptsPerDropback>=0&&x.attemptsPerDropback<=1;
 if(!own.every(valid)||!opp.every(valid))return null;
 const values=[];for(const a of own.slice(-12))for(const b of opp.slice(-12)){
  const pace=.7*a.regulationScrimmagePlays+.3*b.regulationScrimmagePlays;
  const rate=cap(.7*a.dropbacks/a.designedPlays+.3*b.dropbacks/b.designedPlays-margin*.004,.2,.9);
  values.push(Math.round(pace*rate*a.attemptsPerDropback*share));
 }
 return {values,mean:avg(values),higher:line=>(1+values.filter(x=>x>line).length)/(values.length+2),scenarioCount:values.length,assumption:"paired historical team-game pace/rate; not play-level future simulation",calibrated:false};
}
// Preserve shared game outcomes when estimating historical residual association;
// never turn this into a claimed joint probability of a current entry.
function pairedResiduals(rows){
 const groups=new Map();for(const x of rows){if(!x.gameId||!x.market||!x.playerId||!n(x.actual)||!n(x.projection))continue;const a=groups.get(x.gameId)||[];a.push(x);groups.set(x.gameId,a);}
 const pairs=new Map();for(const [gameId,a] of groups){for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){const x=a[i],y=a[j];if(x.playerId===y.playerId)continue;const k=[x.market,y.market].sort().join("|")+"|"+(x.team===y.team?"same_team":"opponents");const q=pairs.get(k)||new Map(),z=q.get(gameId)||[];z.push([x.actual-x.projection,y.actual-y.projection]);q.set(gameId,z);pairs.set(k,q);}}
 return Object.fromEntries([...pairs].map(([k,m])=>[k,{games:m.size,meanResidualProduct:m.size>=30?avg([...m.values()].map(a=>avg(a.map(([x,y])=>x*y)))):null,jointProbabilityVerified:false}]));
}
module.exports={qbScenarios,pairedResiduals};