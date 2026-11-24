"use strict";
// Fixed, prospective three-outcome confidence sensitivity. No promotion or payout claim.
const {POLICY}=require("./nhl-frozen-individual-props.cjs");
const {provenance}=require("./nhl-standard-triple-challenger-grader.cjs");
const {bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const KIND="nhl_all_tier_exact_mass_fixed_shrink_v1";
const TIERS=["Standard","Goblin","Demon"], OUT=["higher","lower","push"];
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const key=r=>[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
const round=x=>Number(x.toFixed(6));
function vector(p){
 if(!OUT.every(k=>Number.isFinite(p?.[k])&&p[k]>=0&&p[k]<=1))return null;
 const total=OUT.reduce((s,k)=>s+p[k],0);
 if(Math.abs(total-1)>1e-4)return null;
 return Object.fromEntries(OUT.map(k=>[k,p[k]/total]));
}
function shrink(p){
 const v=vector(p);
 if(!v)return null;
 // Half-shrink conditional direction toward 50/50; preserve original push mass.
 return {higher:.5*v.higher+.25*(1-v.push),lower:.5*v.lower+.25*(1-v.push),push:v.push};
}
function freeze(s){
 if(s?.individualPropSelectionPolicy!==POLICY||!Number.isFinite(dt(s.generatedAt))||
 !Array.isArray(s.individualPropSelections)||!Array.isArray(s.rankedProps))throw Error("Original snapshot required");
 const seen=new Set(),rows=[];
 for(const o of s.individualPropSelections){
  const k=key(o),raw=s.rankedProps.filter(p=>key(p)===k&&p.lean===o.lean&&p.capturedAt===o.capturedAt);
  if(seen.has(k)||!TIERS.includes(o.tier)||!["Higher","Lower"].includes(o.lean)||
  (o.tier!=="Standard"&&o.lean!=="Higher")||raw.length!==1||
  !Number.isInteger(o.gameId)||!Number.isInteger(o.playerId)||!Number.isFinite(o.line)||
  !Number.isFinite(dt(o.capturedAt))||dt(o.capturedAt)>dt(s.generatedAt)||
  !Number.isFinite(dt(o.gameStartAt))||dt(o.gameStartAt)-dt(s.generatedAt)<900000)continue;
  const original=vector(raw[0].probabilities),candidate=shrink(raw[0].probabilities);
  if(!original||!candidate)continue;
  seen.add(k);
  rows.push({gameId:o.gameId,playerId:o.playerId,market:o.market,line:o.line,tier:o.tier,
    side:o.lean,capturedAt:o.capturedAt,gameStartAt:o.gameStartAt,original,candidate});
 }
 return {kind:KIND,createdAt:s.generatedAt,rows,researchOnly:true,calibrated:false,modelPromoted:false};
}
function summarize(rows){
 const resolved=rows.filter(r=>r.outcome),n=resolved.length;
 const avg=fn=>n?round(resolved.reduce((s,r)=>s+fn(r),0)/n):null;
 const brier=f=>avg(r=>OUT.reduce((s,k)=>s+(r[f][k]-Number(r.outcome===k))**2,0));
 const logloss=f=>avg(r=>-Math.log(Math.max(1e-6,r[f][r.outcome])));
 const rawBrier=brier("original"),candidateBrier=brier("candidate");
 const groups=new Map();
 for(const r of resolved){
  const g=groups.get(r.gameId)||{diff:0,n:0};
  g.diff+=OUT.reduce((s,k)=>s+(r.candidate[k]-Number(r.outcome===k))**2-(r.original[k]-Number(r.outcome===k))**2,0);
  g.n++;groups.set(r.gameId,g);
 }
 const interval=bootstrapGameBrierDifference([...groups.values()]);
 const dates=new Set(resolved.map(r=>r.gameDate).filter(Boolean));
 const pushes=resolved.filter(r=>r.outcome==="push").length,decided=n-pushes;
 const selectedWins=resolved.filter(r=>r.outcome===r.side.toLowerCase()).length;
 const higherWins=resolved.filter(r=>r.outcome==="higher").length;
 const lowerWins=resolved.filter(r=>r.outcome==="lower").length;
 const standardOnly=rows.length>0&&rows.every(r=>r.tier==="Standard");
 const adequate=n>=100&&groups.size>=30&&dates.size>=10;
 const bins=[0,.2,.4,.6,.8].map((lo,i)=>{
  const group=resolved.filter(r=>{const p=r.candidate[r.side.toLowerCase()];return p>=lo&&(i===4?p<=1:p<lo+.2);});
  return {lower:lo,upper:round(lo+.2),n:group.length,meanForecast:group.length?round(group.reduce((s,r)=>s+r.candidate[r.side.toLowerCase()],0)/group.length):null,
    observedStrictHit:group.length?round(group.filter(r=>r.outcome===r.side.toLowerCase()).length/group.length):null};
 });
 return {registered:rows.length,resolved:n,pushes:resolved.filter(r=>r.outcome==="push").length,pending:rows.length-n,
  decided,selectedWins,strictSelectedHitRate:n?round(selectedWins/n):null,decidedSelectedHitRate:decided?round(selectedWins/decided):null,
  hypotheticalAlwaysHigherWins:higherWins,hypotheticalAlwaysLowerWins:standardOnly?lowerWins:null,
  sameOfferBaselinesDescriptiveOnly:true,
  distinctGames:new Set(resolved.map(r=>r.gameId)).size,rawBrier,candidateBrier,
  rawLogLoss:logloss("original"),candidateLogLoss:logloss("candidate"),
  candidateMinusRawBrier:n?round(candidateBrier-rawBrier):null,selectedHitReliability:bins,
  distinctFinalDates:dates.size,gameClusterBrierDifference95:interval?{lower:interval.lower,upper:interval.upper,replicates:interval.simulations,unit:"official_game",exploratoryOnly:true}:null,
  minimumEvidenceSizeReached:adequate,exploratoryCandidateSuperiority:adequate&&interval!==null&&interval.upper<0&&logloss("candidate")<=logloss("original"),
  independentlyCalibrated:false,modelPromoted:false};
}
function grade(frames,history,policyAt){
 const seen=new Set(),rows=[];let rejected=0;
 if(!Number.isFinite(dt(policyAt)))return {kind:KIND,status:"missing_policy_commit",byTier:{},modelPromoted:false};
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot,v=s?.allTierExactMassCalibrationShadow;
  if(v?.kind!==KIND||v.createdAt!==s.generatedAt||dt(s.generatedAt)<=dt(policyAt)||
    dt(f.firstCommittedAt)<=dt(policyAt)||!provenance(s,f.firstCommittedAt,f.gitHistoryCount)||
    v.calibrated!==false||v.modelPromoted!==false||!Array.isArray(v.rows))continue;
  let expected;
  try{expected=freeze(s);}catch{rejected++;continue;}
  // Fully reproduce the fixed transformation from the immutable original vector.
  if(JSON.stringify(v.rows)!==JSON.stringify(expected.rows)){rejected++;continue;}
  for(const r of v.rows){
   if(seen.has(key(r))||dt(r.gameStartAt)-dt(f.firstCommittedAt)<900000){rejected++;continue;}
   seen.add(key(r));
   const games=(history?.players?.[String(r.playerId)]?.games||[]).filter(g=>
    g.gameId===r.gameId&&["OFF","FINAL"].includes(g.gameState)&&
    g.type===(r.market==="saves"?"goalie":"skater")&&Number.isFinite(g.timeOnIceSeconds)&&g.timeOnIceSeconds>0);
   const actual=games.length===1?games[0][r.market]:null;
   const outcome=Number.isInteger(actual)&&actual>=0?(actual>r.line?"higher":actual<r.line?"lower":"push"):null;
   rows.push({...r,outcome,gameDate:games.length===1?games[0].gameDate||null:null});
  }
 }
 return {kind:KIND,status:"prospective_research_only",byTier:Object.fromEntries(TIERS.map(t=>{
  const a=rows.filter(r=>r.tier===t);
  return [t,{overall:summarize(a),byMarket:Object.fromEntries([...new Set(a.map(r=>r.market))].sort().map(m=>[m,summarize(a.filter(r=>r.market===m))]))}];
 })),rejected,researchOnly:true,modelPromoted:false,calibrated:false,platformSettlementVerified:false};
}
module.exports={KIND,vector,shrink,freeze,grade,summarize};
