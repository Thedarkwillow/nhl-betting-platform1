"use strict";
/**
 * First-Git future-only audit for prior-season TRAINING-CHOSEN family.
 * Reconstructs expected probabilities from the unchanged source components
 * embedded alongside original offers. No synthetic holdout outcomes count.
 */
const {KIND,pMap}=require("./nhl-older-season-trained-shadow-v1.cjs");
const {key,LIMITS}=require("./nhl-standard-quality-challenger-v2.cjs");
const {officialOutcome}=require("./nhl-standard-abstention-audit.cjs");
const {ci}=require("./nhl-prospective-slate-baseline-audit.cjs");
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
function day(t){const p=Object.fromEntries(
 new Intl.DateTimeFormat("en-US",{timeZone:"America/Los_Angeles",
  year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(
   new Date(t)).map(x=>[x.type,x.value]));
 return [p.year,p.month,p.day].join("-");
}
function bucket(){return {registered:0,decided:0,pending:0,push:0,
 modelWins:0,originalWins:0,higherWins:0,lowerWins:0,
 games:new Set(),slates:new Set(),vsLower:new Map(),vsHigher:new Map(),vsOriginal:new Map()};}
function group(){return {all:bucket(),modeled:bucket(),sameOriginalSide:bucket(),skipped:bucket()};}
function update(b,p,o,direction){
 b.registered++;
 if(o.status!=="decided"){b[o.status==="push"?"push":"pending"]++;return;}
 const w=direction?Number(direction===o.side):null,
  orig=Number(o.side===p.lean),high=Number(o.side==="Higher"),
  low=1-high;
 b.decided++;b.originalWins+=orig;b.higherWins+=high;b.lowerWins+=low;
 b.games.add(p.gameId);b.slates.add(day(p.gameStartAt));
 if(w===null)return;
 b.modelWins+=w;
 for(const [map,diff] of [[b.vsLower,w-low],[b.vsHigher,w-high],
  [b.vsOriginal,w-orig]]){
  const g=map.get(p.gameId)||{n:0,diff:0};
  g.n++;g.diff+=diff;map.set(p.gameId,g);
 }
}
function summary(b,hasModel=false){
 const n=b.decided;
 return {registered:b.registered,decided:n,pending:b.pending,push:b.push,
  originalWins:b.originalWins,originalRate:n?b.originalWins/n:null,
  alwaysHigherWins:b.higherWins,alwaysHigherRate:n?b.higherWins/n:null,
  alwaysLowerWins:b.lowerWins,alwaysLowerRate:n?b.lowerWins/n:null,
  trainedWins:hasModel?b.modelWins:null,
  trainedLosses:hasModel?n-b.modelWins:null,
  trainedRate:hasModel&&n?b.modelWins/n:null,
  games:b.games.size,slates:b.slates.size,
  modelVsLowerGame95:hasModel?ci([...b.vsLower.values()]):null,
  modelVsHigherGame95:hasModel?
   ci([...b.vsHigher.values()],{baseline:"Higher"}):null,
  modelVsOriginalGame95:hasModel?ci([...b.vsOriginal.values()]):null,
  minimumEvidence:hasModel&&n>=200&&b.games.size>=30&&b.slates.size>=20};
}
const pack=g=>({all:summary(g.all),trained:summary(g.modeled,true),
 originalOfferedSide:summary(g.sameOriginalSide,true),skipped:summary(g.skipped)});
function audit(frames,history,policyAt){
 const total=group(),markets={},seen=new Set(),excluded={};
 let accepted=0,tampered=0;
 const skip=k=>excluded[k]=(excluded[k]||0)+1;
 for(const f of [...(frames||[])].sort((a,b)=>
  dt(a?.firstCommittedAt)-dt(b?.firstCommittedAt))){
  const s=f?.snapshot,d=s?.olderSeasonTrainedShadowV1,
   source=s?.marketDirectionResearchV1,
   t=dt(s?.generatedAt),first=dt(f?.firstCommittedAt),p=dt(policyAt);
  if(f?.gitHistoryCount!==1||![t,first,p].every(Number.isFinite)||
    t<=p||first<=p||first<t||first-t>=900000||
    d?.kind!==KIND||d.generatedAt!==s.generatedAt||
    !Array.isArray(d.rows)||d.bettingEligible!==false||
    d.modelPromoted!==false||!d.sourceTrainingPrecedesOriginalFreeze||
    d.artifactTrainingSeason!=="2024-25"||
    d.artifactEvaluationSeason!=="2025-26"||
    !(dt(d.artifactGeneratedAt)<=dt(d.artifactFirstGitAt)&&
      dt(d.artifactFirstGitAt)<t)||
    !Array.isArray(source?.rows)||source?.generatedAt!==s.generatedAt||
    !Array.isArray(s?.individualPropSelections)||
    !Array.isArray(s?.rankedProps)){
    skip("not_same_original_first_git_with_older_training");continue;
  }
  const originals=s.individualPropSelections.filter(x=>
   x.tier==="Standard"&&!!LIMITS[x.market]),
   rows=new Map(d.rows.map(x=>[key(x),x])),
   research=new Map(source.rows.map(x=>[key(x),x]));
  if(originals.length!==d.rows.length||d.originalPopulation!==originals.length||
    rows.size!==originals.length||research.size!==originals.length){
   tampered++;continue;
  }
  let good=true;
  for(const p0 of originals){
   const k=key(p0),r=rows.get(k),v=research.get(k),
    raw=s.rankedProps.filter(x=>key(x)===k&&x.lean===p0.lean&&
     x.capturedAt===p0.capturedAt&&x.gameStartAt===p0.gameStartAt),
    a=dt(p0.capturedAt),start=dt(p0.gameStartAt);
   if(!r||raw.length!==1||!v||![a,start].every(Number.isFinite)||
     start-first<900000||a>t||t-a>1800000||
     r.originalSide!==p0.lean||r.line!==p0.line||
     r.capturedAt!==p0.capturedAt||r.gameStartAt!==p0.gameStartAt||
     r.market!==p0.market||r.modelPromoted!==false||
     r.bettingEligible!==false||
     r.chosenFamily!==d.selectedFamilies?.[p0.market]){
    good=false;break;
   }
   const expected=v[pMap[r.chosenFamily]];
   const ready=v.status==="research_only_conditional_on_official_appearance"&&
    Number.isFinite(expected)&&expected>0&&expected<1&&
    v.originalHigher===raw[0].probabilities?.higher;
   if(!ready){
    if(r.status!=="shadow_abstain"||r.higher!==null||r.direction!==null){
     good=false;break;
    }
   }else{
    const expectedSide=expected>.5?"Higher":expected<.5?"Lower":null;
    if(r.higher!==expected||r.direction!==expectedSide||
     r.sameSideAsOriginalOffer!==(expectedSide===p0.lean)||
     r.status!==(expectedSide?
       "research_conditional_on_official_appearance":"shadow_abstain")){
      good=false;break;
    }
   }
  }
  if(!good){tampered++;continue;}
  accepted++;
  for(const p0 of originals){
   const k=key(p0);
   if(seen.has(k)){skip("repeated_original_offer");continue;}
   seen.add(k);
   const r=rows.get(k),grade=officialOutcome(p0,history),
    models=!!r.direction,matched=models&&r.sameSideAsOriginalOffer,
    groups=[total,markets[p0.market]??=group()];
   for(const g of groups){
    update(g.all,p0,grade,null);
    if(models)update(g.modeled,p0,grade,r.direction);
    if(matched)update(g.sameOriginalSide,p0,grade,r.direction);
    else update(g.skipped,p0,grade,null);
   }
  }
 }
 return {kind:"nhl_older_season_family_true_future_first_git_scorecard_v1",
  policyAt,acceptedFrames:accepted,uniqueOriginalOffers:seen.size,
  rejectedTamperedFrames:tampered,excluded,
  overall:pack(total),
  byMarket:Object.fromEntries(Object.entries(markets).map(([k,v])=>[k,pack(v)])),
  trainingSeasonFrozen:"2024-25",
  historicalEvaluationPreviouslyStudiedNotProspective:true,
  originalExactOfferedLineAndSideUnchanged:true,
  noRetrospectiveReconstructionInThisScorecard:true,
  futureObservedOfficialAppearanceOnly:true,
  independentlyValidatedEdge:false,calibrated:false,
  modelPromoted:false,bettingEligible:false,placedWagers:0};
}
module.exports={audit};
