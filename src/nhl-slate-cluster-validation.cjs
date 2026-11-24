"use strict";
// Private, read-only research. No wagering, release, or probability changes.
const {rowValid}=require("./nhl-frozen-baseline-challenge.cjs");
const {pacificDay}=require("./nhl-standard-forward-diagnostics.cjs");
const KIND="nhl_slate_cluster_validation_v1";
const END="2027-02-01T08:00:00Z";
const TARGET=Object.freeze({decisions:2000,games:200,dates:60});
const METRICS=["modelMinusHigher","modelMinusLower","brierMinusFairCoin"];
const round=x=>Number(x.toFixed(6));
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const win=r=>Number(r.selectionStatus==="correct");
const decided=r=>["correct","incorrect"].includes(r.selectionStatus);
const key=r=>[r.gameId,r.playerId,r.market,r.line].join("|");
function measures(rows){
 const n=rows.length;
 if(!n)return null;
 const a=rows.reduce((s,r)=>[s[0]+win(r),s[1]+Number(r.officialResult==="Higher"),
  s[2]+(r.estimatedProbability-win(r))**2,s[3]+r.estimatedProbability],[0,0,0,0]);
 return {hitRate:round(a[0]/n),alwaysHigher:round(a[1]/n),alwaysLower:round(1-a[1]/n),
  modelMinusHigher:round((a[0]-a[1])/n),modelMinusLower:round((a[0]+a[1]-n)/n),
  brier:round(a[2]/n),brierMinusFairCoin:round(a[2]/n-.25),
  meanSelectedConfidence:round(a[3]/n),signedCalibrationGap:round((a[3]-a[0])/n)};
}
function clusterIntervals(rows,cluster,{draws=4000}={}){
 if(!Number.isInteger(draws)||draws<1000||draws>20000)throw Error("Invalid bootstrap draw count");
 const grouped=new Map();
 for(const r of rows){const id=cluster(r);if(!id)throw Error("Missing cluster");if(!grouped.has(id))grouped.set(id,[]);grouped.get(id).push(r);}
 const groups=[...grouped.entries()].sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).map(x=>x[1]);
 if(groups.length<10)return {clusters:groups.length,intervals:null,reason:"fewer_than_10_clusters"};
 const totals=groups.map(g=>g.reduce((s,r)=>{const w=win(r),h=Number(r.officialResult==="Higher");return [s[0]+1,s[1]+w-h,s[2]+w-(1-h),s[3]+(r.estimatedProbability-w)**2-.25];},[0,0,0,0]));
 let state=0x629cde17;
 const rand=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return (state>>>0)/4294967296;};
 const values=METRICS.map(()=>[]);
 for(let b=0;b<draws;b++){
  const sum=[0,0,0,0];
  for(let i=0;i<totals.length;i++){const g=totals[Math.floor(rand()*totals.length)];for(let j=0;j<4;j++)sum[j]+=g[j];}
  values.forEach((v,i)=>v.push(sum[i+1]/sum[0]));
 }
 // Bonferroni across three prespecified metrics and two cluster sensitivities.
 const alpha=.05/(METRICS.length*2);
 const intervals=Object.fromEntries(METRICS.map((m,i)=>{
  const v=values[i].sort((a,b)=>a-b);
  return [m,{lower:round(v[Math.floor((alpha/2)*(v.length-1))]),upper:round(v[Math.ceil((1-alpha/2)*(v.length-1))])}];
 }));
 return {clusters:groups.length,draws,nominalFamilyConfidence:.95,perIntervalConfidence:1-alpha,intervals};
}
function study(rows){
 const done=rows.filter(decided),games=new Set(done.map(r=>r.gameId)).size,dates=new Set(done.map(r=>pacificDay(r.gameStartAt))).size;
 const counts={registered:rows.length,decisions:done.length,games,dates,pushes:rows.filter(r=>r.selectionStatus==="push").length,pending:rows.filter(r=>r.selectionStatus==="pending_official_player_stats").length};
 const game=clusterIntervals(done,r=>r.gameId),slate=clusterIntervals(done,r=>pacificDay(r.gameStartAt));
 const targetMet=Object.entries(TARGET).every(([k,v])=>counts[k]>=v);
 const favorable=[game,slate].every(x=>x.intervals&&x.intervals.modelMinusHigher.lower>0&&x.intervals.modelMinusLower.lower>0&&x.intervals.brierMinusFairCoin.upper<0);
 return {counts,point:measures(done),game,slate,targetMet,allIntervalDirectionsFavorable:favorable};
}
function audit(ledger,{firstPolicyCommit=null,asOf=new Date().toISOString()}={}){
 const unavailable=status=>({kind:KIND,status,researchOnly:true,modelPromoted:false,bettingEdgeEstablished:false,payoutAdjustedROI:null});
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
 ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
 !Array.isArray(ledger.records)||!ledger.counts)return unavailable("invalid_original_ledger");
 const counts={registered:0,correct:0,incorrect:0,push:0,pending:0},ids=new Set();
 for(const r of ledger.records){
  if(!rowValid(r)||ids.has(r.id)|| (r.tier==="Standard"&&(!Number.isFinite(r.estimatedProbability)||r.estimatedProbability<.5||r.estimatedProbability>=1)))return unavailable("invalid_original_row");
  ids.add(r.id);counts.registered++;counts[r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus]++;
 }
 if(Object.keys(counts).some(k=>counts[k]!==ledger.counts[k]))return unavailable("inconsistent_ledger_counts");
 const marketRows=ledger.records.filter(r=>r.tier==="Standard").sort((a,b)=>at(a.firstGitCommittedAt)-at(b.firstGitCommittedAt)||at(a.firstResearchAt)-at(b.firstResearchAt)||a.id.localeCompare(b.id));
 const first=new Map();for(const r of marketRows){
  const prior=first.get(key(r));
  if(prior&&at(prior.firstGitCommittedAt)===at(r.firstGitCommittedAt)&&at(prior.firstResearchAt)===at(r.firstResearchAt)&&(prior.selectedSide!==r.selectedSide||prior.estimatedProbability!==r.estimatedProbability||prior.officialResult!==r.officialResult))return unavailable("conflicting_first_threshold");
  if(!prior)first.set(key(r),r);
 }
 const original=[...first.values()],policyAt=at(firstPolicyCommit),now=at(asOf),end=at(END);
 const policyKnown=Number.isFinite(policyAt)&&policyAt<end&&Number.isFinite(now)&&policyAt<=now;
 const future=policyKnown?original.filter(r=>at(r.firstGitCommittedAt)>policyAt&&at(r.gameStartAt)<end&&at(r.firstResearchAt)>policyAt):[];
 const historical=study(original),prospective=study(future);
 const windowComplete=policyKnown&&now>=end;
 return {kind:KIND,status:"research_only",firstPolicyCommit:policyKnown?firstPolicyCommit:null,primaryEndUTC:END,windowComplete,
  targets:TARGET,duplicateThresholdsExcluded:marketRows.length-original.length,historicalDescriptive:historical,
  prospective,prospectiveStatisticalCriteriaMet:windowComplete&&prospective.targetMet&&prospective.counts.pending===0&&prospective.allIntervalDirectionsFavorable===true,
  multipleComparisonFamily:"three fixed metrics times two cluster definitions; no market-specific confirmatory claims",
  caveat:"Bootstrap is descriptive/approximate; games and slates may remain serially dependent. Targets are planning milestones, not a power calculation. No verified market probability or settlement evidence supplied.",
  researchOnly:true,modelPromoted:false,calibrationApproved:false,bettingEdgeEstablished:false,payoutAdjustedROI:null,originalPlatformSettlementVerified:false};
}
module.exports={KIND,END,TARGET,measures,clusterIntervals,study,audit};
