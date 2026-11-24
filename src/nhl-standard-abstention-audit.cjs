"use strict";
/** Prospective NHL Standard abstention audit. NEVER fits or promotes models.
 * Measures entire first-Git original source cohort, not only winning selected
 * survivors. Same-line Higher/Lower baselines are hypothetical directions.
 * Missing official appearances are pending, not auto-graded as losses.
 */
const {KIND:NHL_KIND,LIMITS,key}=require("./nhl-standard-quality-challenger-v2.cjs");
const {ci}=require("./nhl-prospective-slate-baseline-audit.cjs");
const KIND="nhl_first_git_standard_abstention_coverage_review_20261120_v1";
const CUT=Date.parse("2026-11-21T00:00:00Z");
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const finite=Number.isFinite;
const day=x=>{
 const p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(x)).map(v=>[v.type,v.value]));
 return [p.year,p.month,p.day].join("-");
};
function bucket(){return {registered:0,pending:0,push:0,decided:0,hits:0,higher:0,lower:0,
 games:new Map(),slates:new Map(),higherGames:new Map(),higherSlates:new Map(),slateHits:new Map()};}
function add(b,p,outcome){
 b.registered++;
 if(outcome.status==="pending"){b.pending++;return;}
 if(outcome.status==="push"){b.push++;return;}
 b.decided++;
 const hit=Number(p.lean===outcome.side),higher=Number(outcome.side==="Higher"),lower=1-higher;
 b.hits+=hit;b.higher+=higher;b.lower+=lower;
 const d=day(p.gameStartAt);
 const sh=b.slateHits.get(d)||{n:0,hits:0};
 sh.n++;sh.hits+=hit;b.slateHits.set(d,sh);
 for(const [map,k,diff] of [[b.games,p.gameId,hit-lower],
 [b.slates,d,hit-lower],[b.higherGames,p.gameId,hit-higher],
 [b.higherSlates,d,hit-higher]]){
  const x=map.get(k)||{n:0,diff:0};x.n++;x.diff+=diff;map.set(k,x);
 }
}
function result(b){
 const lgame=ci([...b.games.values()]),lslate=ci([...b.slates.values()]),
  hgame=ci([...b.higherGames.values()],{baseline:"Higher"}),
  hslate=ci([...b.higherSlates.values()],{baseline:"Higher"});
 const n=b.decided,sample=n>=200&&b.games.size>=30&&b.slates.size>=20;
 return {registered:b.registered,pending:b.pending,push:b.push,decided:n,
  correct:b.hits,distinctGames:b.games.size,distinctPacificSlates:b.slates.size,
  selectedDirectionalHitRate:n?b.hits/n:null,
  alwaysHigherSameThresholdRate:n?b.higher/n:null,
  alwaysLowerSameThresholdRate:n?b.lower/n:null,
  pairedGame95VsLower:lgame,pairedSlate95VsLower:lslate,
  pairedGame95VsHigher:hgame,pairedSlate95VsHigher:hslate,
  minimumFutureSampleMet:sample,
  descriptiveBothBaselineBoundsPositive:!!(sample&&lgame?.lower>0&&
   lslate?.lower>0&&hgame?.lower>0&&hslate?.lower>0),
  validatedEdge:false,modelPromoted:false};
}
function selectedVsSkippedSlates(kept,skipped){
 const paired=[...kept.slateHits.entries()].filter(([d])=>skipped.slateHits.has(d))
   .map(([d,k])=>({slate:d,kept:k,skipped:skipped.slateHits.get(d)}));
 const days=paired.length,point=days?
  (paired.reduce((a,x)=>a+x.kept.hits,0)/
   paired.reduce((a,x)=>a+x.kept.n,0))-
  (paired.reduce((a,x)=>a+x.skipped.hits,0)/
   paired.reduce((a,x)=>a+x.skipped.n,0)):null;
 if(days<10)return {overlappingPacificSlates:days,observedLiftOnSharedSlates:point,
   pairedSlate95:null,confidenceApproved:false};
 const sample=1800,values=[],n=paired.length;let seed=0x20a11c0d;
 for(let i=0;i<sample;i++){
  let hn=0,hh=0,wn=0,wh=0;
  for(let j=0;j<n;j++){
   seed=(Math.imul(1664525,seed)+1013904223)>>>0;
   const x=paired[Math.floor(seed/4294967296*n)];
   hn+=x.kept.n;hh+=x.kept.hits;
   wn+=x.skipped.n;wh+=x.skipped.hits;
  }
  values.push(hh/hn-wh/wn);
 }
 values.sort((a,b)=>a-b);
 return {overlappingPacificSlates:days,observedLiftOnSharedSlates:point,
  pairedSlate95:{lower:values[Math.floor((sample-1)*.025)],
   upper:values[Math.ceil((sample-1)*.975)],
   draws:sample,clusterUnit:"Pacific_game_date"},
  minimumSharedSlateCountMet:days>=20,
  confidenceApproved:false};
}
function officialOutcome(p,history){
 const rows=(history?.players?.[String(p.playerId)]?.games||[]).filter(g=>
  g.gameId===p.gameId&&g.playerId===p.playerId&&
  ["OFF","FINAL"].includes(g.gameState)&&g.type==="skater"&&
  Number.isFinite(g.timeOnIceSeconds)&&g.timeOnIceSeconds>0&&
  Number.isInteger(g[p.market])&&g[p.market]>=0);
 if(rows.length!==1)return {status:"pending",reason:"unique_official_appearance_unverified"};
 const actual=rows[0][p.market];
 return actual===p.line?{status:"push"}:
  {status:"decided",side:actual>p.line?"Higher":"Lower"};
}
function review(frames,history){
 const all=bucket(),selected=bucket(),abstained=bucket(),byMarket={},
  reasons={},seen=new Set();
 let invalidFrames=0,invalidOriginals=0,unscored=0,selectedWithoutActiveProof=0,
  eligibleOriginals=0;
 for(const f of [...(frames||[])].sort((a,b)=>at(a?.firstGitCommittedAt)-at(b?.firstGitCommittedAt))){
  const s=f?.snapshot,created=at(s?.generatedAt),git=at(f?.firstGitCommittedAt);
  if(f?.gitHistoryCount!==1||![created,git].every(finite)||created<CUT||
     git<created||git-created>15*60000||
     s?.standardQualityShadowV2?.kind!==NHL_KIND||
     s.standardQualityShadowV2.generatedAt!==s.generatedAt||
     !Array.isArray(s?.individualPropSelections)||!Array.isArray(s?.rankedProps)||
     !Array.isArray(s.standardQualityShadowV2.rows)){invalidFrames++;continue;}
  for(const p of s.individualPropSelections){
   if(p?.tier!=="Standard"||!LIMITS[p?.market])continue;
   const identity=key(p),observed=at(p?.capturedAt),start=at(p?.gameStartAt);
   if(seen.has(identity))continue; // First precommitted exact threshold wins.
   seen.add(identity);
   if(!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
      !["Higher","Lower"].includes(p.lean)||!finite(p.line)||
      p.line<0||p.line%1!==.5||![observed,start].every(finite)||
      observed>created||created-observed>30*60000||start-git<15*60000||
      s.rankedProps.filter(x=>key(x)===identity&&x.lean===p.lean&&
       x.gameStartAt===p.gameStartAt&&x.capturedAt===p.capturedAt).length!==1){
     invalidOriginals++;continue;
   }
   eligibleOriginals++;
   const shadows=s.standardQualityShadowV2.rows.filter(x=>key(x)===identity&&
    x.originalSide===p.lean&&x.gameStartAt===p.gameStartAt&&x.capturedAt===p.capturedAt);
   const q=shadows.length===1?shadows[0]:null;
   if(!q||!["shadow_abstain","shadow_selected_research_only"].includes(q.status)||
      q.modelSideNeverReversed!==true||q.platformSettlementVerified!==false||
      (q.status==="shadow_selected_research_only"&&
       (q.bettingEligible!==false||q.originalLine!==p.line))){
    unscored++;reasons.invalid_or_missing_frozen_shadow=(reasons.invalid_or_missing_frozen_shadow||0)+1;
    continue;
   }
   const chosen=q.status==="shadow_selected_research_only";
   const out=officialOutcome(p,history);
   add(all,p,out);
   const bucketFor=chosen?selected:abstained;
   add(bucketFor,p,out);
   const market=byMarket[p.market]??={selected:bucket(),abstained:bucket()};
   add(chosen?market.selected:market.abstained,p,out);
   if(chosen){
    // A prospectively frozen heuristic forecast is conditional on playing.
    // Never infer game-day availability from a research-only flag.
    selectedWithoutActiveProof++;
   }else{
    const reason=String(q.reason||"unspecified_model_abstention");
    reasons[reason]=(reasons[reason]||0)+1;
   }
  }
 }
 const s=result(selected),a=result(abstained),r=result(all);
 return {kind:KIND,policyEffectiveAt:new Date(CUT).toISOString(),
  acceptedOriginalFrozenThresholds:eligibleOriginals,invalidFrames,invalidOriginals,
  unscoredOriginalThresholds:unscored,abstentionReasons:reasons,
  all:r,selected:s,abstained:a,
  byMarket:Object.fromEntries(Object.entries(byMarket).map(([k,v])=>
   [k,{selected:result(v.selected),abstained:result(v.abstained)}])),
  selectionCoverage:eligibleOriginals?s.registered/eligibleOriginals:null,
  scoredCoverage:eligibleOriginals?r.registered/eligibleOriginals:null,
  selectedMinusAbstainedObservedHitRate:s.decided&&a.decided?
   s.selectedDirectionalHitRate-a.selectedDirectionalHitRate:null,
  selectedVsAbstainedSameSlateEvidence:selectedVsSkippedSlates(selected,abstained),
  selectedWithoutPositiveGameDayParticipation:selectedWithoutActiveProof,
  researchSelectionOnly:true,descriptiveSubgroupComparisonNotCausal:true,
  futureOriginalsOnly:true,oppositeSideBookabilityVerified:false,
  selectionQualityProven:false,calibrationApproved:false,modelPromoted:false,
  bettingEligible:false,verifiedPayoutEV:null,
  note:"No retrospective rule changes: compare all eligible frozen originals, selected and abstained. Selected-side accuracy equals original model accuracy on that subset. Rates and confidence bounds are research diagnostics, not betting recommendations."};
}
module.exports={KIND,review,officialOutcome,selectedVsSkippedSlates};
