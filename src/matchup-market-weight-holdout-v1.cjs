"use strict";
// Predeclared grid: train only before a fixed date/season split, score the
// unchanged weights on later data. No fitting to the reported holdout.
const GRID=[0,.25,.5,.75,1].flatMap(a=>[0,.25,.5,.75,1].map(b=>({a,b})));
function create(){return {training:0,loss:GRID.map(()=>0),games:new Set(),holdout:0,baselineAbs:0,fixedAbs:0,learnedAbs:0,thresholds:0,baseWins:0,learnedWins:0,alwaysHigher:0,alwaysLower:0,weights:null};}
function observe(s,{base,position,combined,actual,gameId,train,lines=[]}){
 if(![base,position,combined,actual].every(Number.isFinite))return;
 const predict=w=>base+w.a*(position-base)+w.b*(combined-position);
 if(train){if(s.weights)throw Error("Training after holdout");s.training++;s.games.add(gameId);GRID.forEach((w,i)=>{s.loss[i]+=Math.abs(predict(w)-actual)});return;}
 if(!s.weights){
  // A small regularization penalty prefers no adjustment for uncertain effects.
  s.weights=s.training>=100&&s.games.size>=30?GRID.reduce((best,w,i)=>{const loss=s.loss[i]/s.training+.01*(w.a+w.b);return loss<best.loss?{...w,loss}:best},{a:0,b:0,loss:Infinity}):{a:0,b:0};
 }
 const mu=predict(s.weights);s.holdout++;s.baselineAbs+=Math.abs(base-actual);s.fixedAbs+=Math.abs(combined-actual);s.learnedAbs+=Math.abs(mu-actual);
 for(const line of lines){if(actual===line)continue;const y=actual>line;s.thresholds++;s.baseWins+=Number(base!==line&&(base>line)===y);s.learnedWins+=Number(mu!==line&&(mu>line)===y);s.alwaysHigher+=Number(y);s.alwaysLower+=Number(!y);}
}
function summarize(s){return {trainingAppearances:s.training,trainingGames:s.games.size,holdoutAppearances:s.holdout,weights:s.weights?{position:s.weights.a,headToHead:s.weights.b}:null,baselineMAE:s.holdout?s.baselineAbs/s.holdout:null,fixedMAE:s.holdout?s.fixedAbs/s.holdout:null,learnedMAE:s.holdout?s.learnedAbs/s.holdout:null,thresholds:s.thresholds,baseWins:s.baseWins,learnedWins:s.learnedWins,alwaysHigher:s.alwaysHigher,alwaysLower:s.alwaysLower,modelPromoted:false};}
module.exports={create,observe,summarize};
