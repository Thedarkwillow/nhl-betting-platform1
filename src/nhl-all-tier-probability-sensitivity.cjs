"use strict";
// Research only. Freeze a fixed, predeclared probability shrink candidate for
// every originally selected tier. Never fit on the game being scored, alter
// original directions, or publish a probability as independently calibrated.
const {POLICY}=require("./nhl-frozen-individual-props.cjs");
const {validArchiveChronology}=require("./grade-nhl-predictions.cjs");
const KIND="nhl_all_tier_probability_sensitivity_v1";
const TIERS=["Standard","Goblin","Demon"];
const outcomes=["higher","lower","push"];
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const key=r=>[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
const round=x=>Number(x.toFixed(8));
function vector(raw){
 if(!outcomes.every(k=>Number.isFinite(raw?.[k])&&raw[k]>=0&&raw[k]<=1))return null;
 const sum=outcomes.reduce((a,k)=>a+raw[k],0);
 if(Math.abs(sum-1)>.0001)return null;
 return Object.fromEntries(outcomes.map(k=>[k,raw[k]/sum]));
}
function shrink(raw){
 const p=vector(raw);if(!p)return null;
 const directional=1-p.push;
 // Shrink towards equal conditional directions, leaving exact push mass alone.
 return {higher:.5*p.higher+.25*directional,lower:.5*p.lower+.25*directional,push:p.push};
}
function freeze(s){
 if(s?.individualPropSelectionPolicy!==POLICY||!Number.isFinite(dt(s.generatedAt))||
 !Array.isArray(s.individualPropSelections)||!Array.isArray(s.rankedProps))throw Error("Original frozen selections required");
 const selections=s.individualPropSelections,ids=new Set(selections.map(key)),rows=[];
 if(ids.size!==selections.length)throw Error("Duplicate original selections");
 for(const o of selections){
  if(!TIERS.includes(o.tier)||!["Higher","Lower"].includes(o.lean)||
   !Number.isInteger(o.gameId)||!Number.isInteger(o.playerId)||!Number.isFinite(o.line)||
   !Number.isFinite(dt(o.capturedAt))||dt(o.capturedAt)>dt(s.generatedAt)||
   !Number.isFinite(dt(o.gameStartAt))||dt(o.gameStartAt)-dt(s.generatedAt)<900000)continue;
  const raw=s.rankedProps.filter(r=>key(r)===key(o)&&r.lean===o.lean&&r.capturedAt===o.capturedAt);
  if(raw.length!==1||!Number.isFinite(o.probability)||!Number.isFinite(raw[0].probability)||
   Math.abs(raw[0].probability-o.probability)>.0001)continue;
  const p=vector(raw[0].probabilities);
  if(!p||Math.abs(p[o.lean.toLowerCase()]-o.probability)>.0001)continue;
  rows.push({gameId:o.gameId,playerId:o.playerId,market:o.market,line:o.line,tier:o.tier,
   capturedAt:o.capturedAt,gameStartAt:o.gameStartAt,lean:o.lean,raw:p,shrunk:shrink(p)});
 }
 return {kind:KIND,generatedAt:s.generatedAt,rows,researchOnly:true,calibrated:false,modelPromoted:false};
}
function summarize(rows){
 const resolved=rows.filter(r=>r.outcome),n=resolved.length;
 const avg=f=>n?round(resolved.reduce((s,r)=>s+f(r),0)/n):null;
 const brier=(r,field)=>outcomes.reduce((s,k)=>s+(r[field][k]-Number(r.outcome===k))**2,0);
 const logloss=(r,field)=>-Math.log(Math.max(1e-8,r[field][r.outcome]));
 const reliability=field=>Array.from({length:10},(_,i)=>{
  const bin=resolved.filter(r=>Math.min(9,Math.floor(r[field][r.lean.toLowerCase()]*10))===i);
  return {min:i/10,max:(i+1)/10,n:bin.length,
   meanPrediction:bin.length?round(bin.reduce((s,r)=>s+r[field][r.lean.toLowerCase()],0)/bin.length):null,
   selectedOutcomeRate:bin.length?round(bin.filter(r=>r.outcome===r.lean.toLowerCase()).length/bin.length):null};
 });
 return {registered:rows.length,resolved:n,pending:rows.length-n,pushes:resolved.filter(r=>r.outcome==="push").length,
  distinctGames:new Set(resolved.map(r=>r.gameId)).size,distinctDates:new Set(resolved.map(r=>r.gameDate)).size,
  rawBrier:avg(r=>brier(r,"raw")),shrunkBrier:avg(r=>brier(r,"shrunk")),
  rawLogLoss:avg(r=>logloss(r,"raw")),shrunkLogLoss:avg(r=>logloss(r,"shrunk")),
  rawReliability:reliability("raw"),shrunkReliability:reliability("shrunk"),
  clusterInferenceValidated:false,modelPromoted:false};
}
function grade(frames,history,policyAt){
 const collected=[],seen=new Set();let rejected=0;
 if(Number.isFinite(dt(policyAt)))for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot,v=s?.allTierProbabilitySensitivity;
  if(v?.kind!==KIND||f.gitHistoryCount!==1||dt(s.generatedAt)<=dt(policyAt)||dt(f.firstCommittedAt)<=dt(policyAt)||
   !Number.isFinite(dt(s.generatedAt))||!Number.isFinite(dt(f.firstCommittedAt))||
   dt(f.firstCommittedAt)-dt(s.generatedAt)>=900000)continue;
  let expected;try{expected=freeze(s)}catch{rejected++;continue;}
  if(JSON.stringify(v)!==JSON.stringify(expected)){rejected++;continue;}
  for(const r of v.rows){
   const id=key(r),start=dt(r.gameStartAt);
   if(seen.has(id)||!validArchiveChronology(dt(r.capturedAt),dt(s.generatedAt),dt(f.firstCommittedAt),start)||
      start-dt(f.firstCommittedAt)<900000){rejected++;continue;}
   seen.add(id);
   const games=(history?.players?.[String(r.playerId)]?.games||[]).filter(g=>g.gameId===r.gameId&&g.playerId===r.playerId);
   const g=games.length===1?games[0]:null;
   // Do not treat nonparticipants, incomplete games or absent stats as zero.
   const actual=g&&["OFF","FINAL"].includes(g.gameState)&&Number.isFinite(g.timeOnIceSeconds)&&g.timeOnIceSeconds>0&&Number.isFinite(g[r.market])?g[r.market]:null;
   collected.push({...r,gameDate:g?.gameDate||null,outcome:actual===null?null:actual>r.line?"higher":actual<r.line?"lower":"push"});
  }
 }
 const byTier=Object.fromEntries(TIERS.map(t=>[t,summarize(collected.filter(r=>r.tier===t))]));
 const byTierAndMarket={};for(const r of collected){const k=r.tier+"|"+r.market;(byTierAndMarket[k]??=[]).push(r);}
 return {kind:KIND,firstPolicyCommitVerified:Number.isFinite(dt(policyAt)),all:summarize(collected),byTier,
  byTierAndMarket:Object.fromEntries(Object.entries(byTierAndMarket).map(([k,v])=>[k,summarize(v)])),rejected,
  researchOnly:true,calibrated:false,modelPromoted:false,platformSettlementVerified:false,
  warning:"Fixed unfitted sensitivity only; no independently validated improvement or joint lineup probabilities. Reliability bins include pushes as non-wins."};
}
module.exports={KIND,vector,shrink,freeze,grade,summarize};
