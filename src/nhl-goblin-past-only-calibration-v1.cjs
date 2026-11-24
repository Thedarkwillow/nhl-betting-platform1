"use strict";
// Goblin-only shrinkage fitted from previously settled, first-Git-frozen outcomes.
// Historical fit is diagnostic; a live frozen shadow is not an approved probability.
const KIND="nhl_goblin_past_only_calibration_v1";
const dt=s=>typeof s==="string"?Date.parse(s):NaN;
const clip=x=>Math.max(.001,Math.min(.999,x));
const logit=p=>Math.log(clip(p)/(1-clip(p)));
const sigmoid=x=>1/(1+Math.exp(-Math.max(-15,Math.min(15,x))));
const key=r=>[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
function training(ledger,asOf){
 const t=dt(asOf);
 if(!Number.isFinite(t)||!Array.isArray(ledger?.records)||
    ledger.kind!=="private_immutable_source_linked_nhl_selected_predictions")return [];
 const ids=new Set(),out=[];
 for(const r of ledger.records){
  if(!r||typeof r.id!=="string"||ids.has(r.id))continue;ids.add(r.id);
  if(r.tier!=="Goblin"||r.selectedSide!=="Higher"||
    !["correct","incorrect"].includes(r.selectionStatus)||
    !Number.isInteger(r.gameId)||!Number.isInteger(r.playerId)||
    !Number.isFinite(r.estimatedProbability)||r.estimatedProbability<=0||
    r.estimatedProbability>=1||typeof r.market!=="string"||
    !/^\d{4}-\d{2}-\d{2}$/.test(r.officialGameDate||"")||
    !(dt(r.firstCaptureAt)<=dt(r.firstResearchAt)&&
      dt(r.firstResearchAt)<=dt(r.firstGitCommittedAt)+999&&
      dt(r.firstGitCommittedAt)<dt(r.gameStartAt)&&dt(r.gameStartAt)<t)||
    // Never use a same-day or possibly not-yet-observed official result.
    !(Date.parse(r.officialGameDate+"T23:59:59Z")<t)||
    r.officialResult!==(r.selectionStatus==="correct"?"Higher":"Lower"))continue;
  out.push({gameId:r.gameId,day:r.officialGameDate,market:r.market,
    p:r.estimatedProbability,y:Number(r.selectionStatus==="correct")});
 }
 return out;
}
function fit(ledger,asOf){
 const a=training(ledger,asOf),markets={};
 for(const m of [...new Set(a.map(x=>x.market))].sort()){
  const rows=a.filter(x=>x.market===m),games=new Set(rows.map(x=>x.gameId)),
    dates=new Set(rows.map(x=>x.day)),n=rows.length;
  // Do not borrow a Standard or Demon adjustment or pool special tiers.
  if(n<100||games.size<20||dates.size<8)continue;
  const actual=(rows.filter(x=>x.y).length+8)/(n+16),
    raw=rows.reduce((s,x)=>s+x.p,0)/n;
  const offset=Math.max(-.35,Math.min(.35,logit(actual)-logit(raw)));
  markets[m]={offset,trainingDecisions:n,trainingGames:games.size,
    trainingDates:dates.size,latestTrainingDate:[...dates].sort().at(-1)};
 }
 return {kind:KIND,status:"past_only_research_fit",trainedBefore:asOf,
   totalTrainingDecisions:a.length,byMarket:markets,tier:"Goblin",
   fitOnStandard:false,fitOnDemon:false,approved:false,modelPromoted:false};
}
function freeze(snapshot,ledger){
 const f=fit(ledger,snapshot?.generatedAt),rows=[];
 for(const p of snapshot?.individualPropSelections||[]){
  if(p.tier!=="Goblin"||p.lean!=="Higher"||!Number.isFinite(p.probability))continue;
  const m=f.byMarket[p.market],at=dt(snapshot.generatedAt);
  if(!(dt(p.capturedAt)<=at&&at+900000<=dt(p.gameStartAt)))continue;
  rows.push({gameId:p.gameId,playerId:p.playerId,market:p.market,tier:p.tier,
   line:p.line,side:p.lean,gameStartAt:p.gameStartAt,capturedAt:p.capturedAt,
   raw:p.probability,adjusted:m?sigmoid(logit(p.probability)+m.offset):null,
   training: m||null,calibrated:false,modelPromoted:false,
   status:m?"frozen_experimental_adjustment":"abstain_insufficient_prior_market_evidence"});
 }
 return {kind:KIND,createdAt:snapshot?.generatedAt,rows,fitSummary:f,
   researchOnly:true,calibrationApproved:false,
   validatedHitProbability:null,providerCalls:0};
}
function summarize(rows){
 const n=rows.length,games=new Map(),dates=new Set();
 for(const r of rows){
  dates.add(r.day);const x=games.get(r.gameId)||{n:0,diff:0};
  x.n++;x.diff+=(r.adjusted-r.y)**2-(r.raw-r.y)**2;games.set(r.gameId,x);
 }
 const avg=f=>n?rows.reduce((s,x)=>s+f(x),0)/n:null;
 const brier=require("./nhl-period-count-model.cjs").bootstrapGameBrierDifference([...games.values()]);
 return {decided:n,distinctGames:games.size,distinctDates:dates.size,
  rawBrier:avg(r=>(r.raw-r.y)**2),
  experimentalBrier:avg(r=>(r.adjusted-r.y)**2),
  brierDifference:avg(r=>(r.adjusted-r.y)**2-(r.raw-r.y)**2),
  pairedGame95:brier,minimumSampleMet:n>=200&&games.size>=50&&dates.size>=20,
  exploratoryImprovement:n>=200&&games.size>=50&&dates.size>=20&&
    !!brier&&brier.upper<0,approved:false};
}
function grade(frames,history,policyAt){
 const policy=dt(policyAt),rows=[],used=new Set(),excluded={};
 const skip=k=>excluded[k]=(excluded[k]||0)+1;
 if(!Number.isFinite(policy)||!Array.isArray(frames)||!history?.players)
  return {kind:KIND,status:"policy_or_history_unavailable",approved:false};
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f?.snapshot,t=dt(f?.firstCommittedAt);
  if(f.gitHistoryCount!==1||!(t>policy)||!(dt(s?.generatedAt)>policy)||
     s.goblinPastOnlyCalibrationV1?.kind!==KIND||
     s.goblinPastOnlyCalibrationV1.createdAt!==s.generatedAt)continue;
  for(const r of s.goblinPastOnlyCalibrationV1.rows||[]){
   const k=key(r);if(used.has(k)){skip("repeated_line");continue;}used.add(k);
   const original=(s.individualPropSelections||[]).filter(p=>key(p)===k&&
     p.lean==="Higher"&&p.capturedAt===r.capturedAt&&p.gameStartAt===r.gameStartAt);
   if(original.length!==1||original[0].probability!==r.raw||
      r.side!=="Higher"||r.tier!=="Goblin"||
      !(dt(r.capturedAt)<=dt(s.generatedAt)&&t<dt(r.gameStartAt)-900000)||
      r.status!=="frozen_experimental_adjustment"||
      !Number.isFinite(r.adjusted)||r.adjusted<=0||r.adjusted>=1){
    skip("unmatched_original_or_unfitted");continue;
   }
   const matching=(history.players[String(r.playerId)]?.games||[]).filter(g=>
    g.gameId===r.gameId&&["FINAL","OFF"].includes(g.gameState)&&
    Number.isInteger(g[r.market])&&g[r.market]>=0&&g.timeOnIceSeconds>0);
   if(matching.length!==1){skip("missing_official_final");continue;}
   const n=matching[0][r.market];
   if(n===r.line){skip("push");continue;}
   const day=new Date(r.gameStartAt).toISOString().slice(0,10);
   rows.push({...r,day,y:Number(n>r.line)});
  }
 }
 return {kind:KIND,status:"strict_future_goblin_shadow_only",policyAt,
   all:summarize(rows),byMarket:Object.fromEntries([...new Set(rows.map(x=>x.market))]
    .sort().map(m=>[m,summarize(rows.filter(x=>x.market===m))])),
   excluded,calibrationApproved:false,payoutEVVerified:false,
   modelPromoted:false,providerCalls:0};
}
module.exports={KIND,training,fit,freeze,grade,summarize};
