'use strict';
// Matches the past-only research policy without changing shared private runners.
const {eligible,features,MIN_TRAIN,MIN_GAMES,MIN_SLATES}=require('./past-only-calibration-research.cjs');
const sigmoid=z=>1/(1+Math.exp(-Math.max(-30,Math.min(30,z))));
function fitPlatt(rows,fitAt){
 const train=rows.filter(r=>eligible(r,fitAt,true)),byGame=new Map();
 for(const r of train){const a=byGame.get(r.gameId)||[];a.push(r);byGame.set(r.gameId,a);}
 const games=byGame.size,slates=new Set(train.map(r=>r.slate)).size;
 if(train.length<MIN_TRAIN||games<MIN_GAMES||slates<MIN_SLATES||new Set(train.map(r=>r.higherOutcome)).size!==2)return null;
 const data=[...byGame.values()].flatMap(a=>a.map(r=>({x:features(r.originalHigher,'platt')[1],y:r.higherOutcome,w:1/games/a.length})));
 const c=[0,1];
 for(let i=0;i<350;i++){
  let g0=0,g1=0;
  for(const {x,y,w} of data){const e=w*(sigmoid(c[0]+c[1]*x)-y);g0+=e;g1+=e*x;}
  c[0]-=.045*(g0+.2*c[0]);c[1]-=.045*(g1+.2*(c[1]-1));
 }
 return c[1]>0&&c.every(x=>Number.isFinite(x)&&Math.abs(x)<=15)?{coefficients:c,decisions:train.length,games,slates}:null;
}
function applyPlatt(p,c){return sigmoid(c[0]+c[1]*features(p,'platt')[1]);}
module.exports={fitPlatt,applyPlatt};
