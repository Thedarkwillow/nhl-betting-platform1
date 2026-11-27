'use strict';

// Each verified outcome remains a paired comparison; each game contributes
// one mean so a crowded game cannot dominate the descriptive comparison.
const method='equal_game_paired_v1';
const minimumGamesForInterval=30;
const lossFloor=1e-15;
const validProbability=p=>Number.isFinite(p)&&p>=0&&p<=1;
const mean=(sum,n)=>n?sum/n:null;
const brier=(p,y)=>(p-y)**2;
const logLoss=(p,y)=>-Math.log(Math.max(lossFloor,y?p:1-p));

function interval(values,center){
 if(values.length<minimumGamesForInterval)return null;
 const variance=values.reduce((s,x)=>s+(x-center)**2,0)/(values.length-1);
 const halfWidth=1.96*Math.sqrt(variance/values.length);
 return [center-halfWidth,center+halfWidth];
}

function compareByGame(rows){
 const games=new Map();
 let decisions=0;
 for(const {gameId,candidate,benchmark,outcome} of rows){
  if(!((Number.isSafeInteger(gameId)&&gameId>0)||(typeof gameId==='string'&&gameId.trim()))||
     !validProbability(candidate)||!validProbability(benchmark)||![0,1].includes(outcome))continue;
  const id=String(gameId);
  const g=games.get(id)??{n:0,cb:0,bb:0,cl:0,bl:0,cp:0,bp:0,hit:0};
  g.n++;decisions++;
  g.cb+=brier(candidate,outcome);g.bb+=brier(benchmark,outcome);
  g.cl+=logLoss(candidate,outcome);g.bl+=logLoss(benchmark,outcome);
  g.cp+=candidate;g.bp+=benchmark;g.hit+=outcome;games.set(id,g);
 }
 const distinctGames=games.size,groups=[...games.values()];
 const gameMean=k=>mean(groups.reduce((s,g)=>s+g[k]/g.n,0),distinctGames);
 const candidate={brier:gameMean('cb'),logLoss:gameMean('cl'),meanProbability:gameMean('cp')};
 const benchmark={brier:gameMean('bb'),logLoss:gameMean('bl'),meanProbability:gameMean('bp')};
 const outcomes=gameMean('hit');
 const brierDeltas=groups.map(g=>(g.cb-g.bb)/g.n);
 const logLossDeltas=groups.map(g=>(g.cl-g.bl)/g.n);
 const delta={brier:mean(brierDeltas.reduce((s,x)=>s+x,0),distinctGames),logLoss:mean(logLossDeltas.reduce((s,x)=>s+x,0),distinctGames)};
 return {method,decisionCount:decisions,distinctGames,candidate,benchmark,hitRate:outcomes,delta,
  uncertainty:{method:'descriptive_normal_interval_over_game_deltas_v1',minimumGames:minimumGamesForInterval,
   level:.95,brier:interval(brierDeltas,delta.brier),logLoss:interval(logLossDeltas,delta.logLoss)},
  researchOnly:true,productionApproved:false};
}

module.exports={compareByGame,method,minimumGamesForInterval};
