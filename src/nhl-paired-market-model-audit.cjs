"use strict";
/**
 * Paired NHL model research evaluation using source-archived, Git-frozen
 * experimental forecasts and OFFICIAL NHL final game statistics.
 * No parameter tuning, post-hoc promotion, odds, wagers or provider calls.
 */
const isNum=n=>typeof n==="number"&&Number.isFinite(n);
const round=n=>isNum(n)?Number(n.toFixed(6)):null;
const average=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const quantile=(xs,p)=>{
 if(!xs.length)return null;
 const v=[...xs].sort((a,b)=>a-b),at=(v.length-1)*p;
 const l=Math.floor(at),h=Math.ceil(at);
 return round(v[l]+(v[h]-v[l])*(at-l));
};
function validRow(row){
 if(!Number.isInteger(row?.gameId)||!Number.isInteger(row?.playerId)||
  !["Higher","Lower"].includes(row?.selectedSide)||
  !/^[A-Za-z][A-Za-z0-9]{1,40}$/.test(row?.market||"")||
  !Number.isFinite(row.line)||row.line<0||row.statsOfficialNhlFinal!==true||
  ![0,1].includes(row.actualHigher))return false;
 const received=Date.parse(row.sourceObservedAt),
  committed=Date.parse(row.githubSnapshotFirstCommitAt);
 if(!Number.isFinite(received)||!Number.isFinite(committed)||received>committed)return false;
 return [row.championHigher,row.shadowHigher].every(x=>isNum(x)&&x>0&&x<1);
}
function groupsMetric(rows,{samples=512}={}){
 const n=rows.length, games=new Map();
 for(const r of rows){
  const g=String(r.gameId),arr=games.get(g)||[];
  arr.push(r);games.set(g,arr);
 }
 const count=games.size;
 const champion=average(rows.map(r=>(r.championHigher-r.actualHigher)**2));
 const challenger=average(rows.map(r=>(r.shadowHigher-r.actualHigher)**2));
 const delta=n?rows.reduce((sum,r)=>sum+
  (r.championHigher-r.actualHigher)**2-(r.shadowHigher-r.actualHigher)**2,0)/n:null;
 const uniqueGames=[...games.values()];
 // Fixed PRNG supports reproducible offline diagnostic bootstraps.
 // Game sampling respects within-game correlated props.
 let state=0x91f263d9,replicates=[];
 if(count>=10){
  for(let i=0;i<samples;i++){
   let sum=0,observations=0;
   for(let j=0;j<count;j++){
    state^=state<<13;state^=state>>>17;state^=state<<5;
    const game=uniqueGames[(state>>>0)%count];
    for(const r of game){
     sum+=(r.championHigher-r.actualHigher)**2-
      (r.shadowHigher-r.actualHigher)**2;
     observations++;
    }
   }
   if(observations)replicates.push(sum/observations);
  }
 }
 const ci=count>=10&&replicates.length>=samples?
  {lower:quantile(replicates,.025),upper:quantile(replicates,.975),
   method:"deterministic_game_cluster_bootstrap_descriptive"}:null;
 return {propSides:n,distinctOfficialGames:count,
  championBrier:round(champion),challengerBrier:round(challenger),
  brierImprovementPositiveFavorsChallenger:round(delta),
  gameCluster95:ci,
  clusterEvidenceSuggestsPositiveImprovement:ci!==null&&ci.lower>0,
  modelPromotionEligible:false,calibratedProbabilityClaimAllowed:false,
  minIndependentGamesForModelPromotion:30,
  clusterBootstrapCannotProveProfitability:true};
}
function validateNhlModelShadow(scorecard){
 const rows=scorecard?.scoreRows;
 if(scorecard?.kind!=="nhl_money_puck_dfo_prospective_shadow_scorecard"||
  !Array.isArray(rows))throw Error("Missing official NHL frozen shadow scorecard");
 const excluded={},valid=[],seen=new Set();
 const reject=r=>excluded[r]=(excluded[r]||0)+1;
 for(const row of rows){
  if(!validRow(row)){reject("invalid_or_not_proven_prior_to_commit");continue;}
  const key=[row.gameId,row.playerId,row.market,row.line,row.tier,row.selectedSide].join("|");
  if(seen.has(key)){reject("duplicate_selected_offer_side");continue;}
  seen.add(key);valid.push(row);
 }
 const byField=(key)=>Object.fromEntries([...new Set(valid.map(r=>String(r[key]||"unknown")))].sort()
  .map(label=>[label,groupsMetric(valid.filter(r=>String(r[key]||"unknown")===label))]));
 const overall=groupsMetric(valid);
 return {kind:"private_nhl_paired_market_model_shadow_audit_v1",
  generatedAt:new Date().toISOString(),sourceScorecardAt:scorecard.scoredAt||null,
  originalArchiveDataRows:rows.length,acceptedRows:valid.length,excluded,
  overall,byMarket:byField("market"),byTier:byField("tier"),
  historicalAndProspectiveShadowExplorationOnly:true,
  newIndependentUnseenHoldoutRequired:true,
  noPostHocChampionPromotion:true,modelPromoted:false,
  noFantasyPlatformPayoutsVerified:true,profitabilityVerified:false,
  warning:"Game-cluster bootstrap intervals reflect selected archived experimental forecasts only; they do not establish calibrated betting probabilities, fantasy platform settlements, or expected return."};
}
module.exports={validateNhlModelShadow,groupsMetric,validRow};
