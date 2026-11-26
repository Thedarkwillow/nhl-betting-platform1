"use strict";
// Fixed descriptive challengers. Never edit original forecasts, fit on the
// evaluated slate, invent availability, or treat hypothetical sides as offers.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {rowValid}=require("../src/nhl-frozen-baseline-challenge.cjs");
const {pacificDay}=require("../src/nhl-standard-forward-diagnostics.cjs");
const dt=Date.parse,tiers=["Standard","Goblin","Demon"],safe=x=>Number.isSafeInteger(x)&&x>=0;
const mean=(xs,f)=>xs.length?xs.reduce((s,x)=>s+f(x),0)/xs.length:null;
const clamp=p=>Math.max(1e-12,Math.min(1-1e-12,p));
function nhlScore(rows){
 const final=rows.filter(r=>r.selectionStatus!=="pending_official_player_stats"),decided=final.filter(r=>r.selectionStatus!=="push"),y=r=>Number(r.selectionStatus==="correct");
 const raw=r=>r.estimatedProbability,shrink=r=>.5+.5*(raw(r)-.5),b=(p,r)=>(p(r)-y(r))**2,l=(p,r)=>-Math.log(clamp(y(r)?p(r):1-p(r)));
 const games=new Map();for(const r of final){const g=games.get(r.gameId)||[];g.push(r);games.set(r.gameId,g);}
 return {registered:rows.length,resolved:final.length,decided:decided.length,pushes:final.length-decided.length,pending:rows.length-final.length,distinctGames:games.size,distinctSlates:new Set(final.map(r=>pacificDay(r.gameStartAt))).size,meanOriginal:mean(final,raw),meanHalfShrink:mean(final,shrink),strictObservedRate:mean(final,y),originalBrier:mean(final,r=>b(raw,r)),halfShrinkBrier:mean(final,r=>b(shrink,r)),constantHalfBrier:final.length?0.25:null,originalLogLoss:mean(final,r=>l(raw,r)),halfShrinkLogLoss:mean(final,r=>l(shrink,r)),constantHalfLogLoss:final.length?Math.log(2):null,gameEqualOriginalBrier:mean([...games.values()],g=>mean(g,r=>b(raw,r))),gameEqualHalfShrinkBrier:mean([...games.values()],g=>mean(g,r=>b(shrink,r))),originalDirectionalHitRate:mean(decided,y),alwaysHigher:mean(decided,r=>Number(r.officialResult==="Higher")),alwaysLower:mean(decided,r=>Number(r.officialResult==="Lower"))};
}
function nhl(ledger,policyFirstGitAt){
 if(ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||!Array.isArray(ledger.records)||!ledger.counts)throw Error("NHL original cohort missing");
 const seen=new Set(),keys=new Set(),tally={registered:0,correct:0,incorrect:0,push:0,pending:0};
 for(const r of ledger.records){
  const key=JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier]);
  if(!rowValid(r)||seen.has(r.id)||keys.has(key)||!Number.isFinite(r.estimatedProbability)||r.estimatedProbability<=0||r.estimatedProbability>=1||(r.tier!=="Standard"&&r.selectedSide!=="Higher"))throw Error("NHL immutable source invalid");
  seen.add(r.id);keys.add(key);tally.registered++;tally[r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus]++;
 }
 if(Object.keys(tally).some(k=>tally[k]!==ledger.counts[k]))throw Error("NHL original counts mismatch");
 const cutoff=dt(policyFirstGitAt),future=Number.isFinite(cutoff)?ledger.records.filter(r=>dt(r.firstGitCommittedAt)>cutoff&&dt(r.gameStartAt)>cutoff):[];
 const describe=rs=>Object.fromEntries(tiers.map(t=>{const a=rs.filter(r=>r.tier===t);return [t,{overall:nhlScore(a),byMarket:Object.fromEntries([...new Set(a.map(r=>r.market))].sort().map(m=>[m,nhlScore(a.filter(r=>r.market===m))]))}];}));
 return {kind:"nhl_fixed_half_shrink_all_tier_research_v1",policyFirstGitAt:Number.isFinite(cutoff)?policyFirstGitAt:null,transform:"0.5 + 0.5 * (original - 0.5)",probabilityTarget:"strict hit event given resolved official stat; push not a settlement loss",historicalDescriptive:describe(ledger.records),postPolicyOriginalsOnly:describe(future),candidateNotSeparatelyFrozen:true,modelPromoted:false,calibrationApproved:false};
}
function nflMarket(x){
 if(!x||!["registered","decided","correct","incorrect","push","unresolvedPerSlate"].every(k=>safe(x[k]))||x.registered!==x.decided+x.push+x.unresolvedPerSlate||x.decided!==x.correct+x.incorrect)throw Error("NFL market counts invalid");
 const n=x.decided,h=n?Math.round(x.alwaysHigher*n):0,l=n?Math.round(x.alwaysLower*n):0;
 if(n&&(!Number.isFinite(x.alwaysHigher)||!Number.isFinite(x.alwaysLower)||Math.abs(h/n-x.alwaysHigher)>1e-6||Math.abs(l/n-x.alwaysLower)>1e-6)||h+l!==n)throw Error("NFL directional counts invalid");
 return {n,w:x.correct,h,l};
}
function nfl(docs){
 const seen=new Set(),history=new Map(),rows=[],exclusions={};
 for(const doc of [...docs].sort((a,b)=>String(a.slateDate).localeCompare(String(b.slateDate)))){
  const day=doc.slateDate,f=doc.nfl;
  if(doc.kind!=="public_original_daily_grade_v1"||!/^\d{4}-\d{2}-\d{2}$/.test(day)||seen.has(day)||doc.rawPropRowsExposed!==0||doc.platformSettlementVerified!==false)throw Error("NFL report identity");
  seen.add(day);
  if(f?.status!=="archived_official_stat_outcomes_only"||f.originalIdsReconciled!==true||f.scheduledGames!==f.finalGames||!f.finalGames){exclusions.ineligibleSlate=(exclusions.ineligibleSlate||0)+1;continue;}
  const groups=Object.entries(f.distinctByMarket||{}).map(([market,x])=>({market,...nflMarket(x)})),total=nflMarket(f.firstDistinctThreshold);
  if(["n","w","h","l"].some(k=>groups.reduce((s,x)=>s+x[k],0)!==total[k]))throw Error("NFL first threshold market totals mismatch");
  for(const x of groups){
   const h=history.get(x.market)||{n:0,w:0,h:0,l:0,dates:0};
   // No current-slate results influence a policy. Past date ordering is NOT proof
   // that final results were available before historical kickoff.
   const ready=h.n>=50&&h.dates>=3;
   const side=ready&&Math.max(h.h,h.l)/h.n>=.55?(h.h>h.l?"Higher":"Lower"):null;
   const retain=ready&&h.w/h.n>=Math.max(h.h,h.l)/h.n+.02;
   rows.push({day,market:x.market,...x,side,retain,ready});
  }
  for(const x of groups.filter(x=>x.n)){const h=history.get(x.market)||{n:0,w:0,h:0,l:0,dates:0};for(const k of ["n","w","h","l"])h[k]+=x[k];h.dates++;history.set(x.market,h);}
 }
 const sum=(a,k)=>a.reduce((s,x)=>s+x[k],0),view=a=>{const n=sum(a,"n");return {decided:n,modelCorrect:sum(a,"w"),alwaysHigherCorrect:sum(a,"h"),alwaysLowerCorrect:sum(a,"l"),slates:new Set(a.filter(x=>x.n).map(x=>x.day)).size,markets:new Set(a.filter(x=>x.n).map(x=>x.market)).size};};
 const eligible=rows.filter(x=>x.ready),baseline=eligible.filter(x=>x.side),selected=eligible.filter(x=>x.retain);
 return {kind:"nfl_prior_market_direction_research_v1",policy:{minimumPriorRows:50,minimumPriorSlates:3,minimumPriorDirectionRate:.55,minimumModelAdvantage:.02},all:view(rows),eligiblePriorEvidence:view(eligible),priorDirectionBenchmark:{...view(baseline),priorMarketDirectionCorrect:baseline.reduce((s,x)=>s+(x.side==="Higher"?x.h:x.l),0)},retainOriginalWhenPriorModelBeatsBoth:view(selected),abstainedEligibleDecisions:sum(eligible,"n")-sum(selected,"n"),bySlate:[...new Set(rows.map(x=>x.day))].sort().map(day=>({date:day,all:view(rows.filter(x=>x.day===day)),eligible:view(eligible.filter(x=>x.day===day)),retained:view(selected.filter(x=>x.day===day)),priorDirectionBenchmark:{...view(baseline.filter(x=>x.day===day)),correct:baseline.filter(x=>x.day===day).reduce((s,x)=>s+(x.side==="Higher"?x.h:x.l),0)}})),exclusions,retrospectiveOnly:true,originalOutcomeAvailabilityBeforeHistoricalKickoffVerified:false,oppositeSideOfferVerified:false,modelPromoted:false,calibrated:false};
}
function main(privateRoot,publicRoot){
 const read=p=>JSON.parse(fs.readFileSync(p,"utf8")),dir=path.join(publicRoot,"data"),docs=fs.readdirSync(dir).filter(n=>/^daily-grade-\d{4}-\d{2}-\d{2}\.json$/.test(n)).map(n=>read(path.join(dir,n)));
 const at=execFileSync("git",["log","--diff-filter=A","-1","--format=%cI","--","scripts/model-accuracy-research.cjs"],{cwd:publicRoot,encoding:"utf8",timeout:10000}).trim();
 const doc={kind:"public_model_accuracy_challenger_research_v1",generatedAt:new Date().toISOString(),nhl:nhl(read(path.join(privateRoot,"outputs/research/registry/nhl-precommitted-ledger-latest.json")),at),nfl:nfl(docs),rawPropRowsExposed:0,paidRequests:0,modelPromoted:false,calibrationApproved:false,platformSettlementVerified:false};
 fs.writeFileSync(path.join(dir,"model-accuracy-challenger-research.json"),JSON.stringify(doc,null,2)+"\n");
 console.log(JSON.stringify({nhlStandardResolved:doc.nhl.historicalDescriptive.Standard.overall.resolved,nflArchivedDecisions:doc.nfl.all.decided,nflEligible:doc.nfl.eligiblePriorEvidence.decided,nflRetained:doc.nfl.retainOriginalWhenPriorModelBeatsBoth.decided,paidRequests:0,rawPropRowsExposed:0}));
}
if(require.main===module)try{main(process.argv[2],process.argv[3]);}catch(e){console.error("Accuracy research failed closed: "+e.message);process.exitCode=1;}
module.exports={nhl,nhlScore,nfl};
