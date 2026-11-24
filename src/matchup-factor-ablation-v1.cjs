"use strict";
// Compare distinct inputs on the same chronological cohort. Missing H2H
// does not disqualify a player from the position/workload study.
const num=Number.isFinite,mean=a=>a.reduce((s,x)=>s+x,0)/a.length,cap=(x,a,b)=>Math.max(a,Math.min(b,x));
function nflOpportunity(prior,base){
 const a=prior.filter(x=>num(x.value)&&num(x.opportunity)&&x.opportunity>0).slice(-20);
 if(a.length<8||!num(base))return null;
 const recent=a.slice(-5),long=a.slice(-10),volume=.65*mean(recent.map(x=>x.opportunity))+.35*mean(long.map(x=>x.opportunity));
 const exposure=a.reduce((s,x)=>s+x.opportunity,0),rate=a.reduce((s,x)=>s+x.value,0)/exposure;
 return {projection:volume*rate,expectedOpportunities:volume,historicalValuePerOpportunity:rate,priorAppearances:a.length,liveRoleVerified:false,conditionalOnOpportunity:true};
}
function nflFactors(context,base){
 const own=context.ownPositionOffense,opp=context.opponentPositionDefense,lg=context.leaguePosition;
 const adjust=(a,f)=>a?.games>=5&&lg?.games>=30&&num(a[f])&&num(lg[f])&&Math.abs(lg[f])>.01?cap(1+(a[f]-lg[f])/Math.abs(lg[f])*a.games/(a.games+20),.85,1.15):null;
 const d=adjust(opp,"average"),o=adjust(own,"average"),dr=adjust(opp,"valuePerOpportunity");
 return {defense:d===null?null:base*d,offense:o===null?null:base*o,defenseRate:dr===null?null:base*dr};
}
function create(){return {models:{}};}
function observe(state,{base,actual,gameId,lines=[],train,candidates}){
 if(!num(base)||!num(actual))return;
 for(const [name,mu] of Object.entries(candidates)){
  if(!num(mu))continue;
  const m=state.models[name]??={training:0,loss:[0,0,0,0,0],games:new Set(),weight:null,n:0,baseAbs:0,rawAbs:0,learnedAbs:0,thresholds:0,baseWins:0,rawWins:0,learnedWins:0,alwaysHigher:0,alwaysLower:0,holdoutGames:new Set()};
  const grid=[0,.25,.5,.75,1],predict=w=>base+w*(mu-base);
  if(train){if(m.weight!==null)throw Error("Training after holdout");m.training++;m.games.add(gameId);grid.forEach((w,i)=>m.loss[i]+=Math.abs(predict(w)-actual));continue;}
  if(m.weight===null){m.weight=0;if(m.training>=100&&m.games.size>=30){let best=Infinity;for(let i=0;i<grid.length;i++){const z=m.loss[i]/m.training+.01*grid[i];if(z<best){best=z;m.weight=grid[i];}}}}
  const learned=predict(m.weight);m.n++;m.holdoutGames.add(gameId);m.baseAbs+=Math.abs(base-actual);m.rawAbs+=Math.abs(mu-actual);m.learnedAbs+=Math.abs(learned-actual);
  for(const line of lines){if(!num(line)||actual===line)continue;const y=actual>line;m.thresholds++;m.baseWins+=Number(base!==line&&(base>line)===y);m.rawWins+=Number(mu!==line&&(mu>line)===y);m.learnedWins+=Number(learned!==line&&(learned>line)===y);m.alwaysHigher+=Number(y);m.alwaysLower+=Number(!y);}
 }
}
function summarize(s){return Object.fromEntries(Object.entries(s.models).map(([k,m])=>[k,{trainingAppearances:m.training,trainingGames:m.games.size,holdoutAppearances:m.n,holdoutGames:m.holdoutGames.size,weight:m.weight,baselineMAE:m.n?m.baseAbs/m.n:null,rawMAE:m.n?m.rawAbs/m.n:null,learnedMAE:m.n?m.learnedAbs/m.n:null,thresholds:m.thresholds,baseWins:m.baseWins,rawWins:m.rawWins,learnedWins:m.learnedWins,alwaysHigher:m.alwaysHigher,alwaysLower:m.alwaysLower,modelPromoted:false}]));}
module.exports={nflOpportunity,nflFactors,create,observe,summarize};
