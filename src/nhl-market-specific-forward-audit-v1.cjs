"use strict";
/**
 * First-Git prospective audit of four fixed market-specific shadow models.
 * Only forecasts embedded in original Git snapshots AFTER policy commit count.
 * Never retrofit the new model onto old snapshots or call an opposite side
 * bookable. Official missing appearances remain pending.
 */
const {KIND,POLICY}=require("./nhl-market-direction-research-v1.cjs");
const {key,LIMITS}=require("./nhl-standard-quality-challenger-v2.cjs");
const {officialOutcome}=require("./nhl-standard-abstention-audit.cjs");
const {ci}=require("./nhl-prospective-slate-baseline-audit.cjs");
const time=x=>typeof x==="string"?Date.parse(x):NaN;
function day(x){
 const v=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",
  day:"2-digit"}).formatToParts(new Date(x)).map(x=>[x.type,x.value]));
 return [v.year,v.month,v.day].join("-");
}
function init(){return {registered:0,pending:0,push:0,decided:0,wins:0,
 originalWins:0,higher:0,lower:0,games:new Set(),days:new Set(),
 lowerGames:new Map(),higherGames:new Map(),originalGames:new Map()};}
function group(){return {all:init(),modeled:init(),watchlist:init(),skipped:init()};}
function add(b,p,out,side){
 b.registered++;
 if(out.status!=="decided"){b[out.status==="push"?"push":"pending"]++;return;}
 const ori=Number(p.lean===out.side),
  h=Number(out.side==="Higher"),l=1-h,w=side?Number(side===out.side):null;
 b.decided++;b.originalWins+=ori;b.higher+=h;b.lower+=l;
 b.games.add(p.gameId);b.days.add(day(p.gameStartAt));
 if(w===null)return;
 b.wins+=w;
 for(const [m,diff] of [[b.lowerGames,w-l],[b.higherGames,w-h],
  [b.originalGames,w-ori]]){
  const z=m.get(p.gameId)||{n:0,diff:0};
  z.n++;z.diff+=diff;m.set(p.gameId,z);
 }
}
function stats(b,model=false){
 const n=b.decided;
 return {registered:b.registered,decided:n,pending:b.pending,push:b.push,
  originalWins:b.originalWins,originalHitRate:n?b.originalWins/n:null,
  alwaysHigherWins:b.higher,alwaysHigherHitRate:n?b.higher/n:null,
  alwaysLowerWins:b.lower,alwaysLowerHitRate:n?b.lower/n:null,
  shadowWins:model?b.wins:null,shadowLosses:model?n-b.wins:null,
  shadowHitRate:model&&n?b.wins/n:null,
  distinctGames:b.games.size,distinctSlates:b.days.size,
  shadowMinusLowerGame95:model?ci([...b.lowerGames.values()]):null,
  shadowMinusHigherGame95:model?
   ci([...b.higherGames.values()],{baseline:"Higher"}):null,
  shadowMinusOriginalGame95:model?ci([...b.originalGames.values()]):null,
  minimumFutureSampleMet:model&&n>=200&&b.games.size>=30&&b.days.size>=20};
}
const pack=g=>({all:stats(g.all),modeled:stats(g.modeled,true),
 watchlist:stats(g.watchlist,true),skipped:stats(g.skipped)});
function audit(frames,history,policyAt){
 const all=group(),markets={},seen=new Set(),exclusions={};
 let acceptedFrames=0,originalLines=0,tampered=0;
 const inc=x=>exclusions[x]=(exclusions[x]||0)+1;
 for(const f of [...(frames||[])].sort((a,b)=>
  time(a?.firstCommittedAt)-time(b?.firstCommittedAt))){
  const s=f?.snapshot,t=time(s?.generatedAt),git=time(f?.firstCommittedAt),
   policy=time(policyAt),doc=s?.marketDirectionResearchV1;
  if(f?.gitHistoryCount!==1||![t,git,policy].every(Number.isFinite)||
   t<=policy||git<=policy||git<t||git-t>=15*60000||
   doc?.kind!==KIND||doc.generatedAt!==s.generatedAt||
   doc.modelPromoted!==false||doc.bettingEligible!==false||
   !Array.isArray(doc.rows)||!Array.isArray(s?.rankedProps)||
   !Array.isArray(s?.individualPropSelections)){
   inc("not_original_first_git_after_policy");continue;
  }
  const originals=s.individualPropSelections.filter(x=>
   x.tier==="Standard"&&!!LIMITS[x.market]);
  if(doc.rows.length!==originals.length||
   doc.registered!==originals.length){inc("incomplete_original_cohort");continue;}
  const source=new Map(doc.rows.map(x=>[key(x),x]));
  if(source.size!==originals.length){inc("duplicate_shadow_keys");continue;}
  const verified=originals.every(p=>{
   const r=source.get(key(p)),capture=time(p.capturedAt),
    start=time(p.gameStartAt),raw=s.rankedProps.filter(x=>
      key(x)===key(p)&&x.capturedAt===p.capturedAt&&
      x.gameStartAt===p.gameStartAt&&x.lean===p.lean);
   if(!r||raw.length!==1||![start,capture].every(Number.isFinite)||
     start-git<15*60000||capture>t||t-capture>30*60000||
     r.originalSide!==p.lean||r.line!==p.line||
     r.gameStartAt!==p.gameStartAt||r.capturedAt!==p.capturedAt||
     r.tier!=="Standard"||r.bettingEligible!==false||
     r.modelPromoted!==false||r.strictQualified!==false||
     r.fixedPolicy!==POLICY[p.market].family)return false;
   const active=r.status==="research_only_conditional_on_official_appearance";
   if(!active)return r.exploratoryDirection===null&&
     r.marketSpecificHigher===null;
   const y=r.marketSpecificHigher,config=POLICY[p.market],
    expected=p.market==="shotsOnGoal"?
     config.nb*r.usageHigher+config.shift*r.shiftedHigher:
     p.market==="points"?
      config.nb*r.usageHigher+config.hurdle*r.hurdleHigher:
      p.market==="assists"?
       config.hurdle*r.hurdleHigher+config.empirical*r.empiricalHigher:
       config.nb*r.usageHigher+config.empirical*r.empiricalHigher;
   if(!Number.isFinite(expected)||Math.abs(expected-y)>1e-12||
     !Number.isFinite(y)||y<0||y>1||
     r.originalHigher!==raw[0].probabilities?.higher||
     r.matchedOriginalOffer!==true||
     r.priorLastGameDate>=day(p.gameStartAt)||
     r.noTargetOrLaterGameStatisticUsed!==true||
     r.originalOfferedSideNeverInverted!==true||
     r.exploratoryDirection!==(y>.5?"Higher":y<.5?"Lower":null))
    return false;
   return r.researchWatchlist!==true||(
     r.exploratoryDirection===p.lean&&
     r.historicalDirection===p.lean&&
     Math.abs(y-.5)>=.10&&r.opponentSourceVerified===true);
  });
  if(!verified){tampered++;continue;}
  acceptedFrames++;
  for(const p of originals){
   const k=key(p);
   if(seen.has(k)){inc("repeat_same_original_threshold");continue;}
   seen.add(k);originalLines++;
   const r=source.get(k),out=officialOutcome(p,history),
    modeled=r.status==="research_only_conditional_on_official_appearance"&&
     r.exploratoryDirection!==null,
    watch=modeled&&r.researchWatchlist===true,
    groups=[all,markets[p.market]??=group()];
   for(const g of groups){
    add(g.all,p,out,null);
    if(modeled)add(g.modeled,p,out,r.exploratoryDirection);
    if(watch)add(g.watchlist,p,out,r.exploratoryDirection);
    else add(g.skipped,p,out,null);
   }
  }
 }
 return {kind:"nhl_market_specific_first_git_future_proof_v1",policyAt,
  acceptedFrames,originalLines,exclusions,tamperedFrames:tampered,
  overall:pack(all),
  byMarket:Object.fromEntries(Object.entries(markets).map(([k,v])=>[k,pack(v)])),
  fixedModels:POLICY,strictSelectionPolicyUnchanged:true,
  noRetrospectiveModelsIncluded:true,firstGitBeforePuckRequired:true,
  officialAppearanceRequired:true,oppositeSideBookabilityUnverified:true,
  calibrated:false,bettingEdgeVerified:false,
  modelPromoted:false,bettingEligible:false,placedWagers:0};
}
module.exports={audit};
