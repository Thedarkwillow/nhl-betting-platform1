"use strict";
/**
 * Specialized exploratory probability distributions for NHL full-game props.
 * These are NOT historically calibrated or deployment-approved probabilities.
 * All samples must be from official final games strictly before game date.
 */
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const COUNT=new Set(["hits","faceoffsWon","powerPlayPoints","goalsAgainst"]);
const SIGNED=new Set(["plusMinus"]);
const CONTINUOUS=new Set(["timeOnIceSeconds"]);
const FANTASY=new Set(["prizePicksGoalieFantasyScore","underdogGoalieFantasyScore"]);
const round=x=>Number(x.toFixed(5));
const normalCdf=z=>{
 if(!Number.isFinite(z))return null;
 const a=Math.abs(z),t=1/(1+0.2316419*a);
 const d=0.3989422804014327*Math.exp(-.5*a*a);
 const tail=d*t*(.319381530+t*(-.356563782+t*(1.781477937+
  t*(-1.821255978+t*1.330274429))));
 return Math.max(0,Math.min(1,z>=0?1-tail:tail));
};
function sampleHistoricValues(player,market,eventStartsAt){
 const at=Date.parse(eventStartsAt);
 if(!Number.isFinite(at)||!Array.isArray(player?.games))return [];
 const day=new Date(at).toISOString().slice(0,10);
 return player.games.filter(r=>/^\d{4}-\d{2}-\d{2}$/.test(r?.gameDate||"")&&
   r.gameDate<day).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||
   Number(a.gameId||0)-Number(b.gameId||0)).map(r=>r[market])
  .filter(x=>Number.isFinite(x)&&
   (COUNT.has(market)?Number.isInteger(x)&&x>=0:
    CONTINUOUS.has(market)?x>=0:SIGNED.has(market)?Number.isInteger(x):true));
}
function estimateExperimentalMarketProbability({market,mean,line,samples}={}){
 if(!Number.isFinite(mean)||!Number.isFinite(line)||!
    Array.isArray(samples)||samples.length<8||samples.some(x=>!Number.isFinite(x)))
  return null;
 if(COUNT.has(market)){
  if(mean<0||line<0)return null;
  const p=estimateCountProbabilities(mean,line);
  return p&&{...p,distribution:"poisson-exploratory",
   calibrated:false,marketSampleCount:samples.length};
 }
 if(!SIGNED.has(market)&&!CONTINUOUS.has(market)&&!FANTASY.has(market))
  return null;
 if(CONTINUOUS.has(market)&&line<0)return null;
 // Negative plus-minus and negative goalie fantasy scores are valid.
 if(SIGNED.has(market)||FANTASY.has(market)){
  // Signed + discrete fantasy counts are most safely modeled by
  // an observed empirical distribution with Laplace tail smoothing.
  // Push at exact integer/fantasy-score line stays explicit.
  const n=samples.length,higher=samples.filter(x=>x>line+1e-9).length,
   lower=samples.filter(x=>x<line-1e-9).length,
   push=n-higher-lower,den=n+2;
  return {higher:round((higher+1)/den),lower:round((lower+1)/den),
   push:round(push/den),distribution:"empirical-smoothed-research-v1",
   calibrated:false,marketSampleCount:n};
 }
 // NHL skater TOI is measured in minutes. A gamecenter full-game total
 // includes OT; cannot grade an Underdog regulation-only TOI quote from it.
 const n=samples.length,avg=samples.reduce((a,b)=>a+b,0)/n;
 const variance=samples.reduce((s,v)=>s+(v-avg)**2,0)/n;
 const sigma=Math.max(45,Math.sqrt(variance)); // seconds; floor 0.75 min.
 const z=(line-mean)/sigma,p=normalCdf(z);
 return p===null?null:{higher:round(1-p),lower:round(p),push:0,
  distribution:"normal-toi-research-v1",calibrated:false,
  marketSampleCount:n,estimatedSigmaSeconds:round(sigma)};
}
module.exports={COUNT,SIGNED,CONTINUOUS,FANTASY,
 sampleHistoricValues,estimateExperimentalMarketProbability,normalCdf};
