"use strict";
// Compare retrospective model decisions to simple pre-declared directions.
// These are counterfactual OUTCOMES, not eligible payouts or independent bets.
const valid=d=>d&&d.status==="evaluated"&&typeof d.correct==="boolean"&&
 ["Higher","Lower"].includes(d.officialOutcome)&&["Higher","Lower"].includes(d.modelChosenSide)&&
 Number.isFinite(d.modelSelectedProbability)&&d.modelSelectedProbability>0&&d.modelSelectedProbability<1&&
 Number.isInteger(Number(d.gameId))&&["2025-26","2026-27"].includes(d.season);
function summarize(rows){
 const n=rows.length,modelWins=rows.filter(d=>d.correct).length,
  alwaysHigherWins=rows.filter(d=>d.officialOutcome==="Higher").length,
  alwaysLowerWins=rows.filter(d=>d.officialOutcome==="Lower").length;
 const ratio=x=>n?Number((x/n).toFixed(6)):null;
 const modelBrier=n?Number((rows.reduce((s,d)=>s+(d.modelSelectedProbability-(d.correct?1:0))**2,0)/n).toFixed(6)):null;
 return {samples:n,distinctGames:new Set(rows.map(d=>d.gameId)).size,
  model:{wins:modelWins,hitRate:ratio(modelWins),brierScore:modelBrier},
  alwaysLower:{wins:alwaysLowerWins,hitRate:ratio(alwaysLowerWins)},
  alwaysHigher:{wins:alwaysHigherWins,hitRate:ratio(alwaysHigherWins)},
  coinFlipBrierScore:n?.25:null,
  modelVsAlwaysLowerPoints:n?Number(((modelWins-alwaysLowerWins)/n*100).toFixed(3)):null,
  modelVsAlwaysHigherPoints:n?Number(((modelWins-alwaysHigherWins)/n*100).toFixed(3)):null,
  beatsBothDirectionBaselines:n?modelWins>alwaysLowerWins&&modelWins>alwaysHigherWins:false};
}
function pairedGameBootstrap(rows,{draws=1500,seed=73421}={}){
 const groups=new Map();
 for(const d of rows){
  const k=String(d.season)+"|"+String(d.gameId);
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(d);
 }
 const games=[...groups.values()];
 if(games.length<8||draws<100||draws>10000)return null;
 let state=seed>>>0;
 const next=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
 const delta=[];
 for(let i=0;i<draws;i++){
  let n=0,model=0,lower=0;
  for(let j=0;j<games.length;j++){
   const sample=games[Math.floor(next()*games.length)];
   for(const d of sample){n++;model+=d.correct?1:0;lower+=d.officialOutcome==="Lower"?1:0;}
  }
  delta.push(100*(model-lower)/n);
 }
 delta.sort((a,b)=>a-b);
 return {lower95: Number(delta[Math.floor(.025*(draws-1))].toFixed(3)),
  upper95:Number(delta[Math.floor(.975*(draws-1))].toFixed(3)),
  unit:"percentage points",method:"exploratory paired bootstrap by NHL game",
  caveat:"Game-cluster bootstrap reflects only this nonrepresentative retrospective sample. Not a prospective validation interval."};
}
function benchmarkHistoricalSelections(decisions){
 const rows=(decisions||[]).filter(valid);
 const bySeason=Object.fromEntries(["2025-26","2026-27"].map(season=>
  [season,summarize(rows.filter(x=>x.season===season))]));
 const byMarket=Object.fromEntries([...new Set(rows.map(x=>x.market))].sort().map(market=>
  [market,summarize(rows.filter(x=>x.market===market))]));
 const all=summarize(rows);
 return {schemaVersion:1,kind:"retrospective_direction_baseline_comparison",
  all,bySeason,byMarket,pairedDifferenceVsAlwaysLower95:pairedGameBootstrap(rows),
  observedHistoricalLineOutcomesOnly:true,standardGoblinDemonVerified:false,
  prospectivelyValidated:false,modelProbabilityCalibrated:false,payoutAdjustedEV:null,
  gating:{modelOutperformedBothDirectionBaselines:all.beatsBothDirectionBaselines,
   edgeEstablished:false,safeToUseForVerifiedLineupProbabilities:false,
   status:"research_only_not_validated"},
  warning:"Always-Higher and Always-Lower are fixed directional counterfactuals on the same archived lines, not payout- or eligibility-aware strategies. Archived sample is incomplete; model choices were calculated retrospectively; many props share NHL games. Do not infer profitability or calibrated lineup probabilities."};
}
module.exports={benchmarkHistoricalSelections,summarize,pairedGameBootstrap};
