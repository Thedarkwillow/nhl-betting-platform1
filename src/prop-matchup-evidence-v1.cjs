"use strict";
// Descriptive exact-threshold context and an explicitly unvalidated shadow.
// No probability, selection, or incumbent projection changes.
const num=Number.isFinite;
const mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
function split(values,line){
 const a=values.filter(num),n=a.length;
 if(!num(line))return null;
 const higher=a.filter(v=>v>line).length,lower=a.filter(v=>v<line).length;
 return {games:n,average:mean(a),higher,lower,push:n-higher-lower,
  higherRate:n?higher/n:null,lowerRate:n?lower/n:null,values:a};
}
function windows(values,line){
 return Object.fromEntries([["all",values],["last20",values.slice(-20)],["last10",values.slice(-10)],["last5",values.slice(-5)]].map(([k,v])=>[k,split(v,line)]));
}
function h2hShadow(base,prior,matchup){
 // Fixed experimental residual shrinkage; not fitted or validated.
 // Compare matched opponent history to the player's own prior baseline,
 // not a second raw average added on top of an already adjusted forecast.
 if(!num(base)||!num(prior?.average)||prior.games<12||!num(matchup?.average)||matchup.games<3)return null;
 const cap=Math.max(.25,Math.abs(base)*.20);
 const adjustment=Math.max(-cap,Math.min(cap,(matchup.average-prior.average)*matchup.games/(matchup.games+12)));
 return {projection:base+adjustment,adjustment,priorGames:prior.games,matchupGames:matchup.games,
  shrinkagePriorGames:12,calibrated:false,researchOnly:true,modelPromoted:false};
}
function leagueRank(rows,target,minimum=10){
 // 1 = most allowed, NOT strongest defense. Equal values share a rank.
 // All 32 clubs must have comparable complete-game denominators.
 if(rows.length!==32||new Set(rows.map(x=>x.team)).size!==32||
  rows.some(x=>!x.team||!Number.isInteger(x.games)||x.games<minimum||!num(x.rate)||x.rate<0))return null;
 const r=rows.find(x=>x.team===target);if(!r)return null;
 return {rankMostAllowed:1+rows.filter(x=>x.rate>r.rate).length,teams:32,
  rankDirection:"1_most_allowed",rate:r.rate,games:r.games,leagueMean:mean(rows.map(x=>x.rate))};
}
module.exports={split,windows,h2hShadow,leagueRank};
