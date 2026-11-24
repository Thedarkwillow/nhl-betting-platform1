"use strict";
/**
 * Strict first-Git true-future directional-vs-simple baselines.
 * Avoid using actual finals to invent predicted sides or retroselect thresholds.
 * New strict model may select zero, which must remain NULL hit rate.
 */
const {KIND,assess}=require("./nhl-strict-directional-abstention-v1.cjs");
const {key}=require("./nhl-standard-quality-challenger-v2.cjs");
const {validate}=require("./nhl-standard-input-ab-future-scorecard-v1.cjs");
const {officialOutcome}=require("./nhl-standard-abstention-audit.cjs");
const {ci}=require("./nhl-prospective-slate-baseline-audit.cjs");
const time=x=>typeof x==="string"?Date.parse(x):NaN;
const day=x=>Object.values(Object.fromEntries(new Intl.DateTimeFormat("en-US",{
 timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
}).formatToParts(new Date(x)).map(y=>[y.type,y.value]))).join("-");
function bucket(){
 return {registered:0,decided:0,pending:0,push:0,wins:0,losses:0,
  actualHigher:0,actualLower:0,games:new Set(),slates:new Set(),
  lowerGame:new Map(),lowerSlate:new Map(),higherGame:new Map(),higherSlate:new Map()};
}
function cluster(map,k,diff){
 const s=map.get(k)||{n:0,diff:0};
 s.n++;s.diff+=diff;map.set(k,s);
}
function add(b,p,out,direction){
 b.registered++;
 if(out.status!=="decided"){b[out.status==="push"?"push":"pending"]++;return;}
 const win=Number(direction===out.side),higher=Number(out.side==="Higher"),
  sl=day(p.gameStartAt);
 b.decided++;b.wins+=win;b.losses+=1-win;
 b.actualHigher+=higher;b.actualLower+=1-higher;
 b.games.add(p.gameId);b.slates.add(sl);
 cluster(b.lowerGame,p.gameId,win-(1-higher));
 cluster(b.lowerSlate,sl,win-(1-higher));
 cluster(b.higherGame,p.gameId,win-higher);
 cluster(b.higherSlate,sl,win-higher);
}
function pack(b){
 const n=b.decided;
 return {registered:b.registered,pending:b.pending,push:b.push,
  selections:n,wins:b.wins,losses:b.losses,hitRate:n?b.wins/n:null,
  alwaysHigherSameLines:n?b.actualHigher/n:null,
  alwaysLowerSameLines:n?b.actualLower/n:null,
  distinctGames:b.games.size,distinctSlates:b.slates.size,
  modelMinusAlwaysLowerGame95:ci([...b.lowerGame.values()]),
  modelMinusAlwaysLowerSlate95:ci([...b.lowerSlate.values()]),
  modelMinusAlwaysHigherGame95:ci([...b.higherGame.values()],{baseline:"Higher"}),
  modelMinusAlwaysHigherSlate95:ci([...b.higherSlate.values()],{baseline:"Higher"}),
  minimumEvidenceMet:n>=200&&b.games.size>=30&&b.slates.size>=20};
}
function group(){return {all:bucket(),kept:bucket(),skipped:bucket(),
  byDirection:{Higher:bucket(),Lower:bucket()},reasons:{}};}
function summarize(g){
 return {allOriginal:pack(g.all),kept:pack(g.kept),skipped:pack(g.skipped),
  keptByDirection:Object.fromEntries(Object.entries(g.byDirection).map(([k,v])=>[k,pack(v)])),
  abstentionReasons:g.reasons,
  edgeAgainstBothSimpleStrategiesVerified:false,
  selectedVsSkippedLift: g.kept.decided&&g.skipped.decided?
   g.kept.wins/g.kept.decided-g.skipped.wins/g.skipped.decided:null};
}
function audit(frames,history,{abPolicyAt,policyAt}={}){
 const global=group(),markets={},seen=new Set(),stats={
  acceptedFrames:0,rejectedEarlyOrInvalid:0,rejectedMissingShadow:0,
  rejectedTamperedShadow:0,duplicates:0,pregameFrozenOriginals:0};
 for(const f of [...(frames||[])].sort((a,b)=>time(a.firstGitCommittedAt)-time(b.firstGitCommittedAt))){
  const v=validate(f,abPolicyAt),snap=f?.snapshot,
    shadow=snap?.strictDirectionalShadowV1;
  if(!v.ok||!Number.isFinite(time(policyAt))||
    time(snap.generatedAt)<=time(policyAt)||
    time(f.firstGitCommittedAt)<=time(policyAt)||
    time(f.firstGitCommittedAt)>=Math.min(...v.eligible.map(x=>time(x.gameStartAt)),Infinity)){
   stats.rejectedEarlyOrInvalid++;continue;
  }
  if(shadow?.kind!==KIND||shadow.generatedAt!==snap.generatedAt||
    shadow.bettingEligible!==false||shadow.modelPromoted!==false||
    !Array.isArray(shadow.rows)||shadow.registered!==v.eligible.length||
    shadow.rows.length!==v.eligible.length){
   stats.rejectedMissingShadow++;continue;
  }
  const rows=new Map(shadow.rows.map(r=>[key(r),r]));
  const eight=snap.eightAccuracyResearchV1;
  const eightRows=new Map((eight?.rows||[]).map(r=>[key(r),r]));
  const originals=new Map(v.eligible.map(p=>[key(p),p]));
  if(eight?.generatedAt!==snap.generatedAt||
    eightRows.size!==originals.size||rows.size!==originals.size||
    [...originals].some(([k,p])=>{
    const r=rows.get(k);
    if(!r||!eightRows.has(k))return true;
    // Recalculate selected direction and all gates strictly from the SAME
    // pregame frozen evidence, not an outcome-dependent after-game rule.
    const expected=assess(p,eightRows.get(k));
    if(r.status!==expected.status||r.reason!==expected.reason||
     r.direction!==expected.direction||
     r.selectedResearchOnly!==expected.selectedResearchOnly||
     r.directionHigherProbability!==expected.directionHigherProbability)
     return true;
    return r.gameStartAt!==p.gameStartAt||r.capturedAt!==p.capturedAt||
      r.originalSide!==p.lean||r.line!==p.line||r.tier!==p.tier||
      r.bettingEligible!==false||
      (r.selectedResearchOnly===true&&
       (r.status!=="shadow_selected_research_only"||r.direction!==p.lean))||
      (r.selectedResearchOnly!==true&&r.status!=="shadow_abstain")||
      (r.directionHigherProbability!==null&&
       !(Number.isFinite(r.directionHigherProbability)&&
        r.directionHigherProbability>=0&&r.directionHigherProbability<=1));
  })){
   stats.rejectedTamperedShadow++;continue;
  }
  stats.acceptedFrames++;
  for(const [k,p] of originals){
   if(seen.has(k)){stats.duplicates++;continue;}seen.add(k);
   const r=rows.get(k),out=officialOutcome(p,history),chosen=r.selectedResearchOnly===true;
   const groups=[global,markets[p.market]??=group()];
   for(const g of groups){
    add(g.all,p,out,p.lean);
    if(chosen){add(g.kept,p,out,r.direction);add(g.byDirection[r.direction],p,out,r.direction);}
    else {add(g.skipped,p,out,p.lean);const why=r.reason||"unspecified";
     g.reasons[why]=(g.reasons[why]||0)+1;}
   }
   stats.pregameFrozenOriginals++;
  }
 }
 return {kind:"nhl_strict_directional_abstention_first_git_future_scorecard_v1",
  policyAt,abPolicyAt,...stats,
  all:summarize(global),
  byMarket:Object.fromEntries(Object.entries(markets).map(([k,v])=>[k,summarize(v)])),
  modelSelectionAppliedOnlyToOriginalOfferedDirection:true,
  allRowsSameOriginalLines:true,officialAppearanceRequired:true,
  historicalRetroReplayExcluded:true,
  minimumRequiredSelections:200,minimumDistinctGames:30,minimumDistinctSlates:20,
  zeroSelectionsValidAbstention:true,actualPlatformSettlementVerified:false,
  calibrationApproved:false,bettingEdgeVerified:false,
  modelPromoted:false,bettingEligible:false,placedWagers:0};
}
module.exports={audit};
