"use strict";
/** Independent first-Git official-appearance grade of all eight hypotheses. */
const {key}=require("./nhl-standard-quality-challenger-v2.cjs");
const {validate}=require("./nhl-standard-input-ab-future-scorecard-v1.cjs");
const {officialOutcome}=require("./nhl-standard-abstention-audit.cjs");
const {KIND}=require("./nhl-eight-accuracy-research-v1.cjs");
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const prob=x=>Number.isFinite(x)&&x>=0&&x<=1;
const MODEL_NAMES=["originalChampion","dist_empirical","dist_shifted",
 "dist_poisson","dist_negativeBinomial","dist_hurdle","dist_blend",
 "opponentAdjusted","opponentRemoved","distributionPoisson",
 "distributionHurdle","shotAttemptConversion",
 "teammateAndRole","teammateXGoalsSource","defensiveExposure",
 "pastSeasonShotRateAdjustment","sportsbookConditionalHigher"];
function cell(){
 return {decided:0,hits:0,forecastTotal:0,actualHigher:0,brier:0,
  logLoss:0,gameIds:new Set(),slates:new Set(),
  buckets:Array.from({length:5},()=>({n:0,p:0,y:0}))};
}
function pacific(t){
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",
  day:"2-digit"}).formatToParts(new Date(t)).map(z=>[z.type,z.value]));
 return parts.year+"-"+parts.month+"-"+parts.day;
}
function add(c,p,y,game,day){
 if(!prob(p))return;
 c.decided++;c.hits+=Number((p>.5)===Boolean(y));
 c.forecastTotal+=p;c.actualHigher+=y;c.brier+=(p-y)**2;
 c.logLoss-=Math.log(Math.max(1e-8,y?p:1-p));
 c.gameIds.add(game);c.slates.add(day);
 const b=c.buckets[Math.min(4,Math.floor(p*5))];
 b.n++;b.p+=p;b.y+=y;
}
function summarize(c){
 const n=c.decided;
 return {decided:n,distinctGames:c.gameIds.size,
  distinctPacificSlates:c.slates.size,
  directionalHitRate:n?c.hits/n:null,brier:n?c.brier/n:null,
  logLoss:n?c.logLoss/n:null,
  alwaysHigherSameLines:n?c.actualHigher/n:null,
  alwaysLowerSameLines:n?1-c.actualHigher/n:null,
  forecastMean:n?c.forecastTotal/n:null,
  reliabilityBins:c.buckets.map((z,i)=>({bin:i,
   decided:z.n,meanForecast:z.n?z.p/z.n:null,
   observedHigher:z.n?z.y/z.n:null})),
  independentlyCalibrated:false};
}
function group(){
 return {originals:0,unsupported:0,pending:0,
  selectedResearch:0,selectedDecided:0,selectedHits:0,
  selectedModel:cell(),
  pairNew:cell(),pairOriginalSide:cell(),
  gates:{},sources:{},metrics:Object.fromEntries(MODEL_NAMES.map(n=>[n,cell()]))};
}
function pack(g){
 return {originals:g.originals,unsupported:g.unsupported,pending:g.pending,
  selectedResearch:g.selectedResearch,selectedDecided:g.selectedDecided,
  selectedHitRate:g.selectedDecided?g.selectedHits/g.selectedDecided:null,
  selectedModel:summarize(g.selectedModel),
  strictSameLinePair:{
   newModel:summarize(g.pairNew),
   originalFrozenSide:summarize(g.pairOriginalSide)
  },
  reasons:g.gates,sourceCoverage:g.sources,
  models:Object.fromEntries(Object.entries(g.metrics).map(([k,v])=>[k,summarize(v)]))};
}
function audit(frames,history,abPolicyAt,policyAt){
 const by={},all=group(),seen=new Set(),c={
  originalFramesInspected:0,acceptedFrames:0,
  rejectedFirstGitFrames:0,missingPrecommittedLab:0,invalidLabFrames:0,
  duplicates:0,officialDecided:0};
 const validPolicy=Number.isFinite(at(policyAt));
 for(const f of [...(frames||[])].sort((a,b)=>at(a.firstGitCommittedAt)-at(b.firstGitCommittedAt))){
  const strict=validate(f,abPolicyAt);
  if(!strict.ok){c.rejectedFirstGitFrames++;continue;}
  c.originalFramesInspected++;
  const s=f.snapshot,lab=s?.eightAccuracyResearchV1;
  if(!validPolicy||at(s.generatedAt)<=at(policyAt)||lab?.kind!==KIND||
   lab.generatedAt!==s.generatedAt||lab.modelPromoted!==false||
   lab.bettingEligible!==false||lab.registered!==strict.eligible.length||
   lab.rows?.length!==strict.eligible.length){
   c.missingPrecommittedLab++;continue;
  }
  const rowMap=new Map(lab.rows.map(r=>[key(r),r])),
    originals=new Map(strict.eligible.map(r=>[key(r),r]));
  if(rowMap.size!==originals.size||[...originals].some(([k,p])=>{
   const r=rowMap.get(k),raw=s.rankedProps.filter(x=>
    key(x)===k&&x.capturedAt===p.capturedAt&&
    x.gameStartAt===p.gameStartAt&&x.lean===p.lean);
   return !r||r.originalSide!==p.lean||r.capturedAt!==p.capturedAt||
    r.gameStartAt!==p.gameStartAt||r.line!==p.line||
    r.tier!=="Standard"||r.bettingEligible!==false||
    r.platformSettlementVerified!==false||
    raw.length!==1||Object.keys(r.models||{}).some(x=>
     !MODEL_NAMES.includes(x)||r.models[x]!==null&&!prob(r.models[x]))||
    (r.candidateResearchOnly===true&&r.researchAbstention!=="shadow_candidate_only");
  })){c.invalidLabFrames++;continue;}
  c.acceptedFrames++;
  for(const [k,p] of originals){
   if(seen.has(k)){c.duplicates++;continue;}seen.add(k);
   const r=rowMap.get(k),out=officialOutcome(p,history);
   const groups=[all,by[p.market]??=group()];
   for(const g of groups){
    g.originals++;
    const reason=r.researchAbstention||r.status||"source_unavailable";
    g.gates[reason]=(g.gates[reason]||0)+1;
    for(const [name,flag] of Object.entries({
     historicalPowerPlayMinutes:r.iceTime?.ppVerifiedHistory===true,
     historicalPenaltyKillMinutes:r.iceTime?.pkVerifiedHistory===true,
     individualVerifiedPowerPlayAssists:r.evidence?.assists?.individualPPAssistHistoryVerified===true,
     officialTeamGoalOpportunity:r.evidence?.assists?.officialTeamGoalHistory?.verified===true,
     verifiedOpponentShotAttempts:r.evidence?.blocks?.opponentShotAttemptsVerified===true,
     verifiedDefensiveZoneStarts:r.evidence?.blocks?.defensiveZoneStartsVerified===true,
     verifiedAttemptConversion:r.shotConversion?.status==="source_verified_pregame",
     independentBookmakerQuote:r.sportsbookBenchmark?.status==="conditional_identity_name_team_game_line",
     verifiedTrackingAdjustment:r.evidence?.recording?.trackingChangeCorrectionVerified===true
    }))g.sources[name]=(g.sources[name]||0)+Number(flag);
    if(r.status!=="research_only_conditional_on_appearance"){
     g.unsupported++;continue;
    }
    if(r.candidateResearchOnly===true)g.selectedResearch++;
    if(out.status!=="decided"){g.pending++;continue;}
    const y=Number(out.side==="Higher"),day=pacific(p.gameStartAt),
     raw=s.rankedProps.filter(x=>key(x)===k&&
      x.capturedAt===p.capturedAt&&x.lean===p.lean);
    if(raw.length!==1)continue;
    const prices={originalChampion:raw[0].probabilities.higher,...r.models};
    for(const [name,price] of Object.entries(prices))
     if(g.metrics[name]&&prob(price))add(g.metrics[name],price,y,p.gameId,day);
    const q=prices.opponentAdjusted;
    if(prob(q)&&q!==.5){
     add(g.pairNew,q,y,p.gameId,day);
     // The original selected direction, not a posthoc inverted price.
     add(g.pairOriginalSide,p.lean==="Higher"?1:0,y,p.gameId,day);
    }
    if(r.candidateResearchOnly===true&&prob(q)&&q!==.5){
     g.selectedDecided++;
     g.selectedHits+=Number((q>.5)===Boolean(y));
     add(g.selectedModel,q,y,p.gameId,day);
    }
   }
   if(r.status==="research_only_conditional_on_appearance"&&out.status==="decided")c.officialDecided++;
  }
 }
 return {kind:"nhl_eight_accuracy_first_git_future_scorecard_v1",
  policyAt:policyAt??null,firstGitPolicyAt:abPolicyAt??null,
  ...c,originals:seen.size,overall:pack(all),
  byMarket:Object.fromEntries(Object.entries(by).map(([m,v])=>[m,pack(v)])),
  historicalSyntheticResultsNotTreatedAsFuture:true,
  oppositeSelectionBookabilityUnverified:true,
  countDistributionComparisonsNotSelectionPromotion:true,
  conditionalOnVerifiedOfficialAppearance:true,
  prospectiveMinimum: {selected:200,games:30,slates:20},
  benefitsToHitRateVerified:false,
  payoutEVVerified:false,calibrationApproved:false,
  modelPromoted:false,bettingEligible:false,placedWagers:0};
}
module.exports={audit,MODEL_NAMES};
