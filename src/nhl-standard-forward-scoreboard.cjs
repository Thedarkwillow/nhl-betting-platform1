"use strict";
/**
 * Exact-line leaderboard from independently first-Git-frozen NHL Standard
 * challenger rows. No ex-post model reconstruction, no cross-coverage
 * comparison, no payout/EV and no selected-line optimization.
 *
 * Uncertainty is estimated by paired game-cluster bootstrap: every row from
 * a sampled game travels together. This is descriptive inference, not a
 * guarantee of independence between games or a production promotion gate.
 */
const {MODES}=require("./nhl-standard-triple-challenger-grader.cjs");
const {pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const KIND="nhl_standard_exact_line_forward_challenger_scoreboard_v1";
const pct=(n,d)=>d?Number((n/d).toFixed(6)):null;
const clamp=p=>Math.min(1-1e-6,Math.max(1e-6,p));
function eligible(row,name){
 if(row?.outcome?.status!=="decided"||
    row?.shadow?.variants?.[name]?.status!=="research_only"||
    !["Higher","Lower"].includes(row.shadow?.decisions?.[name]?.side))return false;
 if(name==="pointsStability"&&(
   row.market!=="points"||
   row.shadow.pointsShadowPolicyVersion!=="nhl-points-minutes-shot-opponent-zero-v1"))
  return false;
 if(name.startsWith("sog")){
  if(row.market!=="shotsOnGoal"||
   row.shadow.sogShadowPolicyVersion!=="sog-unfitted-opportunity-attempts-v1")
   return false;
  if(name==="sogMovement"&&(
    row.shadow.sogMovementPolicyVersion!=="nhl-sog-25pct-line-delta-capped-half-shot-v1"||
    row.shadow.variants.sogMovement.sourceOfferMovement?.status!==
      "exact_pregame_same_offer_quote"))return false;
 }
 return true;
}
function rowMetrics(r,name){
 const p=r.shadow.variants[name].probabilities,den=p?.higher+p?.lower;
 if(!Number.isFinite(den)||den<=0)throw Error("Frozen conditional probabilities missing");
 const q=clamp(p.higher/den),y=Number(r.outcome.side==="Higher");
 const side=r.shadow.decisions[name].side;
 return {hit:Number(side===r.outcome.side),brier:(q-y)**2,
  logLoss:y?-Math.log(q):-Math.log(1-q)};
}
function calibrationSummary(rows,name,{bins=10}={}) {
 if(!Number.isInteger(bins)||bins<2||bins>20)throw Error("Invalid calibration bin count");
 const cells=Array.from({length:bins},(_,i)=>({bin:i,lower:i/bins,upper:(i+1)/bins,
  count:0,probabilityTotal:0,higherTotal:0}));
 for(const r of rows){
  if(!eligible(r,name))continue;
  const p=r.shadow.variants[name].probabilities,den=p?.higher+p?.lower;
  if(!Number.isFinite(den)||den<=0)throw Error("Frozen conditional probabilities missing");
  const q=clamp(p.higher/den),idx=Math.min(bins-1,Math.floor(q*bins)),cell=cells[idx];
  cell.count++;cell.probabilityTotal+=q;cell.higherTotal+=Number(r.outcome.side==="Higher");
 }
 const populated=cells.filter(x=>x.count>0).map(x=>({
  bin:x.bin,lower:x.lower,upper:x.upper,count:x.count,
  meanPredictedHigher:pct(x.probabilityTotal,x.count),
  observedHigherRate:pct(x.higherTotal,x.count),
  calibrationGap:pct(x.probabilityTotal-x.higherTotal,x.count)
 }));
 const n=populated.reduce((s,x)=>s+x.count,0);
 const ece=n?populated.reduce((s,x)=>s+x.count*Math.abs(x.calibrationGap),0)/n:null;
 return {method:"fixed_width_higher_probability_reliability_bins",bins,
  eligibleDecisions:n,expectedCalibrationError:ece===null?null:Number(ece.toFixed(6)),
  populatedBins:populated,
  interpretation:"Descriptive reliability only. Sparse bins and shared game outcomes are not independent evidence; use the paired game-cluster intervals and prospective holdout before any calibration change."};
}
function quantile(sorted,q){
 if(!sorted.length)return null;
 const x=(sorted.length-1)*q,lo=Math.floor(x),hi=Math.ceil(x);
 return Number((sorted[lo]+(sorted[hi]-sorted[lo])*(x-lo)).toFixed(6));
}
function pairedGameClusterBootstrap(matched,name,{draws=2000}={}){
 if(!Number.isInteger(draws)||draws<200||draws>20000)throw Error("Invalid paired bootstrap draw count");
 const clusters=new Map();
 for(const r of matched){
  const id=String(r.gameId);
  if(!clusters.has(id))clusters.set(id,[]);
  clusters.get(id).push(r);
 }
 const games=[...clusters.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
 const gameCount=games.length;
 if(gameCount<10)return {method:"paired_game_cluster_percentile_bootstrap",
  independentGameClusters:gameCount,draws:0,confidenceLevel:.95,
  intervals:null,reason:"At least 10 game clusters are required even for exploratory intervals.",
  superiority:null};
 const championRows=matched.map(r=>({r,c:rowMetrics(r,"champion"),m:rowMetrics(r,name)}));
 const observed=()=>{
  const n=championRows.length;
  const sum=championRows.reduce((a,x)=>({
   hit:a.hit+x.m.hit-x.c.hit,
   brier:a.brier+x.m.brier-x.c.brier,
   logLoss:a.logLoss+x.m.logLoss-x.c.logLoss
  }),{hit:0,brier:0,logLoss:0});
  return {hitRateDelta:pct(sum.hit,n),brierDelta:pct(sum.brier,n),
   logLossDelta:pct(sum.logLoss,n)};
 };
 const point=observed();
 // Stable seed makes reports exactly reproducible for a fixed frozen cohort.
 const seedText=games.map(([id])=>id).join("|")+"|"+name;
 let seed=2166136261;
 for(let i=0;i<seedText.length;i++){seed^=seedText.charCodeAt(i);seed=Math.imul(seed,16777619);}
 let state=seed>>>0;if(!state)state=1;
 const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
 const samples={hitRateDelta:[],brierDelta:[],logLossDelta:[]};
 for(let b=0;b<draws;b++){
  let n=0,hit=0,brier=0,logLoss=0;
  for(let k=0;k<gameCount;k++){
   const rows=games[Math.floor(rand()*gameCount)][1];
   for(const r of rows){
    const c=rowMetrics(r,"champion"),m=rowMetrics(r,name);
    n++;hit+=m.hit-c.hit;brier+=m.brier-c.brier;logLoss+=m.logLoss-c.logLoss;
   }
  }
  samples.hitRateDelta.push(hit/n);
  samples.brierDelta.push(brier/n);
  samples.logLossDelta.push(logLoss/n);
 }
 for(const values of Object.values(samples))values.sort((a,b)=>a-b);
 const intervals=Object.fromEntries(Object.entries(samples).map(([k,v])=>
  [k,{lower:quantile(v,.025),upper:quantile(v,.975)}]));
 return {method:"paired_game_cluster_percentile_bootstrap",
  independentGameClusters:gameCount,draws,confidenceLevel:.95,
  pointEstimate:point,intervals,
  interpretation:{hitRateDelta:"positive favors challenger",
   brierDelta:"negative favors challenger",
   logLossDelta:"negative favors challenger"},
  exploratoryIntervalsExcludeZero:{
   hitRate:intervals.hitRateDelta.lower>0||intervals.hitRateDelta.upper<0,
   brier:intervals.brierDelta.lower>0||intervals.brierDelta.upper<0,
   logLoss:intervals.logLossDelta.lower>0||intervals.logLossDelta.upper<0
  },
  superiority:null};
}
function study(rows){
 const eligibleDecided=rows.filter(r=>r.outcome?.status==="decided");
 const evaluated={};
 for(const name of MODES){
  const matched=eligibleDecided.filter(r=>eligible(r,name)&&eligible(r,"champion"));
  const n=matched.length;
  const hit=m=>matched.filter(r=>r.shadow.decisions[m].side===r.outcome.side).length;
  const grades=(m)=>{
   let b=0,l=0;
   for(const r of matched){
    const metric=rowMetrics(r,m);
    b+=metric.brier;l+=metric.logLoss;
   }
   return {brier:pct(b,n),logLoss:pct(l,n)};
  };
  const baselineHit=hit("champion"),modelHit=hit(name);
  const higher=matched.filter(r=>r.outcome.side==="Higher").length;
  const lower=n-higher,model=grades(name),champion=grades("champion");
  const games=new Set(matched.map(r=>r.gameId)).size;
  const dates=new Set(matched.map(r=>pacificDay(r.gameStartAt))).size;
  const minimumSample=n>=200&&games>=30&&dates>=20;
  const bootstrap=pairedGameClusterBootstrap(matched,name);
  const reliability=calibrationSummary(matched,name);
  bootstrap.superiority=minimumSample&&bootstrap.intervals?{
   hitRate:bootstrap.intervals.hitRateDelta.lower>0,
   brier:bootstrap.intervals.brierDelta.upper<0,
   logLoss:bootstrap.intervals.logLossDelta.upper<0,
   allThree:bootstrap.intervals.hitRateDelta.lower>0&&
    bootstrap.intervals.brierDelta.upper<0&&bootstrap.intervals.logLossDelta.upper<0
  }:null;
  evaluated[name]={decided:n,
    coverageAgainstAllDecided:pct(n,eligibleDecided.length),
    registeredAllSameSelectedLines:rows.length,
    distinctGames:games,distinctDates:dates,
    originalChampionCorrect:baselineHit,challengerCorrect:modelHit,
    alwaysHigherOnSameLines:higher,alwaysLowerOnSameLines:lower,
    championRate:pct(baselineHit,n),challengerRate:pct(modelHit,n),
    challengerMinusChampion:pct(modelHit-baselineHit,n),
    championBrier:champion.brier,challengerBrier:model.brier,
    championLogLoss:champion.logLoss,challengerLogLoss:model.logLoss,
    neutralProbabilityBrier:n?0.25:null,neutralProbabilityLogLoss:n?Math.log(2):null,
    challengerBrierSkillVsNeutral:n?Number((1-model.brier/0.25).toFixed(6)):null,
    challengerBeatsBothConstantDirections:n?modelHit>Math.max(higher,lower):null,
    challengerHigherProbabilityReliability:reliability,
    pairedGameClusterBootstrap:bootstrap,
    changedDirectionOnlyCorrect:matched.filter(r=>
      r.shadow.decisions[name].side===r.outcome.side&&
      r.shadow.decisions.champion.side!==r.outcome.side).length,
    changedDirectionOnlyWrong:matched.filter(r=>
      r.shadow.decisions[name].side!==r.outcome.side&&
      r.shadow.decisions.champion.side===r.outcome.side).length,
    eligibleForMinimumSample:minimumSample,
    minimumSampleRequirements:{decisions:200,games:30,dates:20},
    gameClusterSignificanceVerified:false,platformSettlementVerified:false,
    modelPromotionApproved:false};
 }
 return {gradedOriginalLines:eligibleDecided.length,
  pendingOriginalLines:rows.length-eligibleDecided.length-
   rows.filter(r=>r.outcome?.status==="push").length,
  pushes:rows.filter(r=>r.outcome?.status==="push").length,
  byVariant:evaluated};
}
function scoreboard(committedRows){
 if(!Array.isArray(committedRows))throw Error("Require original Git-audited challenger frames");
 if(committedRows.some(r=>!Number.isInteger(r.gameId)||!Number.isInteger(r.playerId)||
   r.shadow?.status!=="research_only"||r.shadow?.generatedAt!==r.createdAt))
  throw Error("Cannot score retrospective or ambiguous frozen rows");
 const byMarket={},byOriginalSide={};
 for(const m of ["shotsOnGoal","points","assists","blockedShots","goals"])
  byMarket[m]=study(committedRows.filter(r=>r.market===m));
 for(const s of ["Higher","Lower"])
  byOriginalSide[s]=study(committedRows.filter(r=>r.originalSelectedSide===s));
 return {kind:KIND,status:"prospective_original_commit_same_line_only",
  all:study(committedRows),byMarket,byOriginalSide,
  source:"first_git_verified_original_snapshot_standard_shadow_plus_official_nhl_final",
  fixedVariantOrder:MODES,fullBoardStrategyCompared:false,
  differentVariantCoverageCannotBeRankedDirectly:true,
  modelReleased:false,
  note:"Paired champion, challenger, Higher and Lower are scored only on the same preselected frozen thresholds and each variant's own coverage. Paired game-cluster bootstrap intervals quantify sampling uncertainty descriptively; they do not prove independent games, executable sides, payouts or ROI. A minimum sample is necessary, never sufficient, for review."};
}
module.exports={KIND,eligible,study,scoreboard,pairedGameClusterBootstrap,calibrationSummary};
