"use strict";
// Predeclared selective shadow, frozen alongside original selections.
// Never changes the original Higher/Lower choice or authorizes a wager.
const KIND="nhl_standard_future_agreement_v1";
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const key=r=>[r.gameId,r.playerId,r.market,r.line,r.tier].join("|");
const prob=x=>Number.isFinite(x)&&x>0&&x<1;
const markets=new Set(["shotsOnGoal","points","assists","blockedShots"]);
function freeze(s){
 if(!Array.isArray(s?.individualPropSelections)||!Number.isFinite(dt(s.generatedAt)))
  return {kind:KIND,status:"missing_original_snapshot",rows:[],researchOnly:true};
 const rows=[],adaptive=s.standardAdaptiveResearchV2?.rows||[];
 for(const p of s.individualPropSelections.filter(x=>x.tier==="Standard"&&markets.has(x.market))){
  const matches=adaptive.filter(x=>key(x)===key(p)&&x.capturedAt===p.capturedAt&&x.gameStartAt===p.gameStartAt&&x.originalSide===p.lean);
  const x=matches.length===1?matches[0]:null, fixed=x?.predictions?.fixed,learned=x?.predictions?.learned;
  const clock=Number.isFinite(dt(p.capturedAt))&&dt(p.capturedAt)<=dt(s.generatedAt)&&dt(p.gameStartAt)-dt(s.generatedAt)>=900000;
  const supported=p.lean==="Higher"?(prob(fixed)&&prob(learned)&&fixed>=.62&&learned>=.62):
    p.lean==="Lower"?(prob(fixed)&&prob(learned)&&fixed<=.38&&learned<=.38):false;
  const reason=!clock?"unproven_original_clock":!x?"missing_exact_frozen_adaptive_row":
    !(x.availableSides||[]).includes(p.lean)?"selected_side_not_originally_offered":
    !Number.isInteger(x.trainingGames)||x.trainingGames<30||
    !Number.isInteger(x.trainingDates)||x.trainingDates<10||
    !Number.isInteger(x.priorGames)||x.priorGames<20?"insufficient_training":
    !supported?"independent_forecasts_disagree_or_weak":"precommitted_concordance";
  rows.push({gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,tier:p.tier,
    capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,originalSide:p.lean,
    originalSelectedProbability:p.probability,learnedHigher:prob(learned)?learned:null,
    fixedHigher:prob(fixed)?fixed:null,
    status:reason==="precommitted_concordance"?"shadow_selected":"shadow_abstain",reason,
    originalSideUnchanged:true,researchOnly:true,calibrated:false,bettingEligible:false});
 }
 return {kind:KIND,status:"frozen_research_only",generatedAt:s.generatedAt,rows,
   eligible:rows.filter(x=>x.status==="shadow_selected").length,
   changesChampion:false,approved:false,providerCalls:0};
}
function score(rows){
 const n=rows.length,slates=new Map(),games=new Set(rows.map(r=>r.gameId));
 const hit=rows.filter(r=>r.hit).length,high=rows.filter(r=>r.actual==="Higher").length;
 for(const r of rows){
  const z=slates.get(r.day)||{n:0,low:0,high:0};
  z.n++;z.low+=Number(r.hit)-Number(r.actual==="Lower");
  z.high+=Number(r.hit)-Number(r.actual==="Higher");
  slates.set(r.day,z);
 }
 const {ci}=require("./nhl-prospective-slate-baseline-audit.cjs");
 const low=ci([...slates.values()].map(x=>({n:x.n,diff:x.low})));
 const hi=ci([...slates.values()].map(x=>({n:x.n,diff:x.high})));
 const enough=n>=200&&games.size>=30&&slates.size>=20;
 return {decided:n,distinctGames:games.size,distinctSlates:slates.size,
   hitRate:n?hit/n:null,alwaysHigherSameLines:n?high/n:null,
   alwaysLowerSameLines:n?(n-high)/n:null,pairedSlate95vsLower:low,
   pairedSlate95vsHigher:hi,minimumSampleMet:enough,
   exploratorySuperiorToBoth:enough&&!!low&&!!hi&&low.lower>0&&hi.lower>0,
   modelApproved:false};
}
function grade(frames,history,policyAt){
 const cut=dt(policyAt),out=[],used=new Set(),excluded={};
 const skip=k=>excluded[k]=(excluded[k]||0)+1;
 if(!Array.isArray(frames)||!history?.players||!Number.isFinite(cut))
  return {kind:KIND,status:"policy_or_history_unavailable",modelApproved:false};
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot,t=dt(f.firstCommittedAt);
  if(f.gitHistoryCount!==1||!(t>cut)||!(dt(s?.generatedAt)>cut)||
     s?.standardFutureAgreementV1?.kind!==KIND||
     s.standardFutureAgreementV1.generatedAt!==s.generatedAt)continue;
  for(const r of s.standardFutureAgreementV1.rows||[]){
   const k=key(r);
   if(used.has(k)){skip("repeated_line");continue;} used.add(k);
   const original=(s.individualPropSelections||[]).filter(x=>key(x)===k&&
    x.lean===r.originalSide&&x.capturedAt===r.capturedAt&&x.gameStartAt===r.gameStartAt);
   if(!markets.has(r.market)||r.tier!=="Standard"||original.length!==1||
      original[0].probability!==r.originalSelectedProbability||
      !r.originalSideUnchanged||t>=dt(r.gameStartAt)-900000||
      dt(r.capturedAt)>dt(s.generatedAt)){skip("unverified_source_timing_or_side");continue;}
   if(r.status!=="shadow_selected")continue;
   const g=(history.players[String(r.playerId)]?.games||[]).filter(x=>
    x.gameId===r.gameId&&["OFF","FINAL"].includes(x.gameState)&&
    Number.isInteger(x[r.market])&&x[r.market]>=0&&x.timeOnIceSeconds>0);
   if(g.length!==1){skip("unresolved_official_result");continue;}
   if(g[0][r.market]===r.line){skip("push");continue;}
   const p=new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
    year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(r.gameStartAt));
   const day=k=>p.find(x=>x.type===k)?.value;
   const actual=g[0][r.market]>r.line?"Higher":"Lower";
   out.push({...r,day:day("year")+"-"+day("month")+"-"+day("day"),
     actual,hit:actual===r.originalSide});
  }
 }
 return {kind:KIND,status:"future_original_git_research_only",
   all:score(out),byMarket:Object.fromEntries([...markets].map(m=>
     [m,score(out.filter(x=>x.market===m))])),excluded,
   policyAt,modelApproved:false,calibrated:false,providerCalls:0};
}
module.exports={KIND,freeze,grade,score};
