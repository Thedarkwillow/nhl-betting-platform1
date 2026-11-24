"use strict";
/**
 * NHL count-prop distribution research challenger.
 * Baseline: existing Poisson-v0. Shadow: moment-estimated, shrinkage regularized
 * negative binomial for extra-Poisson variance. NEVER use fit after game start.
 */
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {candidateMeans}=require("./nhl-season-model-lab.cjs");
const MARKETS=new Set(["shotsOnGoal","goals","assists","points","blockedShots","saves"]);
const round=x=>Number(x.toFixed(6));
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
function negativeBinomialCdf(k,mean,r){
 if(!Number.isInteger(k)||!Number.isFinite(mean)||mean<0||
  !Number.isFinite(r)||r<=0||k>1000)return null;
 if(k<0)return 0;
 if(mean===0)return 1;
 const p=r/(r+mean),q=mean/(r+mean);
 let pmf=Math.exp(r*Math.log(p)),sum=pmf;
 for(let j=0;j<k;j++){
  pmf*=((j+r)/(j+1))*q;
  sum+=pmf;
 }
 return clamp(sum,0,1);
}
function fitDispersion(prior){
 if(!Array.isArray(prior)||prior.length<8||prior.some(x=>!Number.isInteger(x)||x<0))
  return {status:"insufficient_sample_or_invalid",priorGames:prior?.length||0,varianceRatio:null};
 const n=prior.length,avg=prior.reduce((a,b)=>a+b,0)/n;
 if(avg===0)return {status:"all_zero_observations",priorGames:n,varianceRatio:1,r:null};
 const variance=prior.reduce((a,b)=>a+(b-avg)**2,0)/(n-1);
 // Empirical extra-variance is shrunk toward a Poisson null. Cap very noisy
 // estimates to 5x variance; small sample cannot justify huge tails.
 const observedRatio=variance/avg,excess=Math.max(0,observedRatio-1);
 const shrunkRatio=1+Math.min(4,excess*n/(n+30));
 const r=shrunkRatio>1.02?avg/(shrunkRatio-1):null;
 return {status:r===null?"poisson_variance_not_exceeded":"overdispersed_shadow",
  priorGames:n,priorMean:round(avg),sampleVariance:round(variance),
  rawVarianceRatio:round(observedRatio),varianceRatio:round(shrunkRatio),
  r:r===null?null:round(r),shrinkageWeight:round(n/(n+30))};
}
function negativeBinomialProbabilities(mean,line,r){
 if(!Number.isFinite(mean)||mean<0||!Number.isFinite(line)||line<0||
  !Number.isFinite(r)||r<=0)return null;
 const underCut=Math.ceil(line)-1,overCut=Math.floor(line);
 const lower=negativeBinomialCdf(underCut,mean,r);
 const upper=negativeBinomialCdf(overCut,mean,r);
 if(lower===null||upper===null)return null;
 const higher=Math.max(0,1-upper),push=Math.abs(line-Math.round(line))<1e-9?
  Math.max(0,1-lower-higher):0;
 return {higher:round(higher),lower:round(lower),push:round(push),
  distribution:"negative-binomial-shrink-v1",calibrated:false};
}
function challengerProbabilities(mean,line,prior){
 const poisson=estimateCountProbabilities(mean,line);
 if(!poisson)return null;
 const dispersion=fitDispersion(prior);
 // If data do not support overdispersion, remain Poisson. Do not apply
 // synthetic certainty boosts or a global hard-coded special-tier correction.
 const alt=dispersion.r===null?null:negativeBinomialProbabilities(mean,line,dispersion.r);
 return {champion:poisson,challenger:alt||poisson,dispersion,
  challengerUsesNB:!!alt,
  prospectiveCalibrated:false,verifiedRealLineEdge:false,
  releaseStatus:"research_shadow_only"};
}
function summarize(rows){
 const valid=rows.filter(r=>Number.isFinite(r.champion?.higher)&&Number.isFinite(r.challenger?.higher)),n=valid.length;
 const brier=model=>n?round(valid.reduce((s,r)=>s+(r[model].higher-r.higherActual)**2,0)/n):null;
 const logloss=model=>n?round(valid.reduce((s,r)=>{
  const p=clamp(r[model].higher,1e-6,1-1e-6);
  return s-(r.higherActual?Math.log(p):Math.log(1-p));
 },0)/n):null;
 const base=brier("champion"),alt=brier("challenger");
 const higherCount=valid.reduce((s,r)=>s+r.higherActual,0);
 const higherRate=n?higherCount/n:null;
 const bins=[];
 for(let b=0;b<5;b++){
  const group=valid.filter(r=>r.challenger.higher>=b*.2&&
   (b===4?r.challenger.higher<=1:r.challenger.higher<(b+1)*.2));
  bins.push({interval:[round(b*.2),round((b+1)*.2)],
   n:group.length,meanForecast:group.length?round(group.reduce((s,r)=>s+r.challenger.higher,0)/group.length):null,
   observedHigher:group.length?round(group.reduce((s,r)=>s+r.higherActual,0)/group.length):null});
 }
 return {decisions:n,distinctGames:new Set(valid.map(r=>r.gameId)).size,
  distinctDates:new Set(valid.map(r=>r.gameDate)).size,
  championBrier:base,challengerBrier:alt,brierImprovement:base===null?null:round(base-alt),
  fixedHalfBrier:n?0.25:null,
  fixedHalfLogLoss:n?round(Math.log(2)):null,
  higherOutcomes:higherCount,observedHigherFrequency:higherRate===null?null:round(higherRate),
  exPostFrequencyBenchmarkBrier:higherRate===null?null:round(higherRate*(1-higherRate)),
  caveat:"Fixed 0.5 is a legitimate unfitted naive probability benchmark. Ex-post sample Higher prevalence is a hindsight descriptive floor, NOT a trained deployable baseline.",
  championLogLoss:logloss("champion"),challengerLogLoss:logloss("challenger"),
  estimatedOverdispersedN:valid.filter(x=>x.challengerUsesNB).length,
  buckets:bins,prospectiveVerified:false,verifiedROI:null};
}
function gameClusterInterval(rows,{iterations=300,seed=881}={}){
 const groups=new Map();
 for(const r of rows){
  const g=groups.get(r.gameId)||[];
  g.push((r.champion.higher-r.higherActual)**2-(r.challenger.higher-r.higherActual)**2);
  groups.set(r.gameId,g);
 }
 if(groups.size<15)return null;
 const byGame=[...groups.values()],samples=[];let state=seed>>>0;
 for(let j=0;j<iterations;j++){
  let score=0,count=0;
  for(let k=0;k<byGame.length;k++){
   state=(Math.imul(state,1664525)+1013904223)>>>0;
   const one=byGame[Math.floor((state/2**32)*byGame.length)];
   for(const d of one){score+=d;count++;}
  }
  samples.push(score/count);
 }
 samples.sort((a,b)=>a-b);
 return {lower95:round(samples[Math.floor((iterations-1)*.025)]),
  upper95:round(samples[Math.floor((iterations-1)*.975)]),
  unit:"paired Brier-score improvement; positive favors challenger",
  method:"NHL game-cluster bootstrap, descriptive selected archived sample"};
}
function evaluateArchivedLines(lines,logsByPlayer){
 if(!Array.isArray(lines)||!logsByPlayer||typeof logsByPlayer!=="object")
  throw Error("Actual archived lines and official player logs required");
 const exclusions={},used=new Set(),rows=[];
 const skip=x=>exclusions[x]=(exclusions[x]||0)+1;
 for(const offer of lines){
  if(!MARKETS.has(offer?.market)||!Number.isFinite(offer.line)||offer.line<0||
   !Number.isInteger(Number(offer.playerId))||!Number.isInteger(Number(offer.gameId))){
   skip("invalid_quote_or_market");continue;
  }
  const key=[offer.playerId,offer.gameId,offer.market,offer.line].join("|");
  if(used.has(key)){skip("duplicate_exact_player_game_stat_line");continue;}
  used.add(key);
  const logs=logsByPlayer[String(offer.playerId)]||[],
   game=logs.find(x=>String(x.gameId)===String(offer.gameId));
  if(!game||!Number.isInteger(game[offer.market])||game[offer.market]<0||
   game[offer.market]!==offer.actual||!game.gameDate){skip("unverified_official_outcome");continue;}
  const actual=game[offer.market],
   truth=actual>offer.line?"Higher":actual<offer.line?"Lower":"Push";
  if(truth!==offer.outcome){skip("source_official_direction_conflict");continue;}
  if(truth==="Push"){skip("push_no_binary_direction");continue;}
  const prior=logs.filter(g=>g.gameDate<game.gameDate&&
    Number.isInteger(g[offer.market])&&g[offer.market]>=0)
   .sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId)
   .map(g=>g[offer.market]);
  if(prior.length<8){skip("fewer_than_eight_prior_games");continue;}
  const mean=candidateMeans(prior)["weighted-form-v1"];
  const p=challengerProbabilities(mean,offer.line,prior);
  if(!p||!Number.isFinite(p.challenger.higher)||!Number.isFinite(p.champion.higher)){
   skip("unsupported_distribution_probability");continue;
  }
  rows.push({season:offer.season,gameDate:game.gameDate,gameId:Number(offer.gameId),
   playerId:Number(offer.playerId),market:offer.market,line:offer.line,
   higherActual:truth==="Higher"?1:0,champion:p.champion,
   challenger:p.challenger,challengerUsesNB:p.challengerUsesNB});
 }
 const bySeason=Object.fromEntries(["2025-26","2026-27"].map(s=>[s,summarize(rows.filter(x=>x.season===s))]));
 const byMarket=Object.fromEntries([...MARKETS].map(m=>[m,summarize(rows.filter(x=>x.market===m))]));
 return {schemaVersion:1,kind:"nhl_real_quote_poisson_vs_overdispersion_shadow",
  models:["poisson-v0","negative-binomial-shrink-v1"],
  actualArchivedQuoteRows:rows.length,sourceExcluded:exclusions,
  overall:summarize(rows),bySeason,byMarket,
  gameClusterDifferenceInterval:gameClusterInterval(rows),
  challengerBeatsFixedHalfOnSelectedArchive:rows.length>0&&summarize(rows).challengerBrier<0.25,
  heldoutForModelPromotion:false,prospectiveHitRate:null,settledActualPlatformPayouts:false,
  optimizedForProfit:false,originalHistoricalPregameModelSnapshots:false,
  probabilityCalibrated:false,modelReleaseEligible:false,
  warning:"Replayed incomplete historical PrizePicks-labelled REAL quote lines; original model predictions were not archived before games. Outcome stats are NHL official. Chosen NB method is research only and historical source selection/inspection may bias its measured results. Brier/log loss are for the common 'Higher' event, no pushes; do not conflate with verified future pick accuracy, payout or calibration."};
}
module.exports={fitDispersion,negativeBinomialCdf,negativeBinomialProbabilities,
 challengerProbabilities,evaluateArchivedLines,gameClusterInterval,summarize};
