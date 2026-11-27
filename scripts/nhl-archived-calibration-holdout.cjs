'use strict';
// Aggregate-only chronology. Never read private rows or recompute forecasts.
const {execFileSync}=require('node:child_process');
const trainingCutoff='2026-11-23T08:00:00Z'; // Midnight Pacific, before all holdout slates.
const dateFile=d=>`data/daily-grade-${d}.json`;
const days=(start,end)=>Array.from({length:end-start+1},(_,i)=>`2026-11-${i+start}`);
const trainingDays=days(14,22),holdoutDays=days(23,25);
const tiers=['Standard','Goblin','Demon'];
const tierWeight=40,marketWeight=40;
const dt=Date.parse,isDate=x=>Number.isFinite(dt(x));
const count=x=>Number.isSafeInteger(x)&&x>=0;
const prob=x=>Number.isFinite(x)&&x>=0&&x<=1;
const fields=['registered','decided','correct','incorrect','pushes','pending','resolved'];
const requireThat=(v,msg)=>{if(!v)throw Error(msg);};
function totals(x,daily){
 const o={registered:x?.registered,decided:x?.decided,correct:x?.correct,incorrect:x?.incorrect,
  pushes:daily?x?.push:x?.pushes,pending:x?.pending};
 o.resolved=o.decided+o.pushes;
 requireThat(fields.every(k=>count(o[k]))&&o.registered===o.resolved+o.pending&&
  o.decided===o.correct+o.incorrect&&(daily||o.resolved===x.resolved),'Invalid archived count totals');
 return o;
}
function reconcile(a,b){requireThat(fields.every(k=>a[k]===b[k]),'Daily and frozen scorecard cohorts disagree');}
function sum(rows){return Object.fromEntries(fields.map(k=>[k,rows.reduce((n,x)=>n+x[k],0)]));}
function validateDaily(frame,date){
 const d=frame?.doc,n=d?.nhl;
 requireThat(isDate(frame?.publishedAt)&&d?.kind==='public_original_daily_grade_v1'&&d.slateDate===date&&
  d.rawPropRowsExposed===0&&d.platformSettlementVerified===false&&n?.status==='official_final_slate_graded'&&
  count(n.scheduledGames)&&n.scheduledGames===n.finalGames&&[n.statsFetchedAt,n.ledgerBuiltAt,d.generatedAt].every(isDate)&&
  dt(date+'T08:00:00Z')<dt(n.statsFetchedAt)&&dt(n.statsFetchedAt)<=dt(n.ledgerBuiltAt)&&
  dt(n.ledgerBuiltAt)<=dt(d.generatedAt)&&dt(d.generatedAt)<=dt(frame.publishedAt)+999,'Invalid archived NHL daily evidence');
 const t=Object.fromEntries(tiers.map(k=>[k,{...totals(n.byTier?.[k],true),games:n.byTier[k].distinctGradedGames}]));
 requireThat(Object.values(t).every(x=>count(x.games)&&x.games<=n.finalGames&&x.games<=x.resolved),'Invalid archived game count');
 const markets=Object.fromEntries(Object.entries(n.standardByMarket||{}).map(([k,v])=>[k,totals(v,true)]));
 reconcile(t.Standard,sum(Object.values(markets)));
 return {t,markets};
}
function lossFor(rate,x,p){return x.correct*rate(p,1)+(x.resolved-x.correct)*rate(p,0);}
const brier=(p,y)=>(p-y)**2,logLoss=(p,y)=>-(y?Math.log(p):Math.log1p(-p));
function fit(earlier){
 const trainedTiers=Object.fromEntries(tiers.map(k=>[k,sum(earlier.map(e=>e.t[k]))]));
 const probabilities=Object.fromEntries(tiers.map(k=>[k,(trainedTiers[k].correct+tierWeight/2)/(trainedTiers[k].resolved+tierWeight)]));
 const markets=new Map();
 for(const row of earlier)for(const [m,t] of Object.entries(row.markets))markets.set(m,sum([markets.get(m)||sum([]),t]));
 const marketProbabilities=Object.fromEntries([...markets].map(([m,t])=>[m,
  (t.correct+marketWeight*probabilities.Standard)/(t.resolved+marketWeight)]));
 return {tierProbabilities:probabilities,marketProbabilities,trainCounts:Object.fromEntries(tiers.map(k=>[k,trainedTiers[k].resolved]))};
}
function evaluate({training,heldOut,report}){
 const src=report?.nhl?.rollingProbabilityPerformance;
 requireThat(report?.kind==='public_nhl_nfl_original_git_frozen_model_scorecards_v1'&&src?.kind==='public_nhl_rolling_probability_reliability_v1'&&
  src.target==='strict_selected_side_hit_given_resolved_stat'&&src.pushIsNonHitOnlyForProbabilityScoring===true&&
  src.calibrated===false&&src.modelPromoted===false&&src.platformSettlementVerified===false&&src.byTier?.length===3,'Original NHL scorecard missing or ineligible');
 const train=trainingDays.flatMap(d=>{
  const f=training[d];if(!f||dt(f.publishedAt)>=dt(trainingCutoff))return [];
  const a=validateDaily(f,d);return a.t.Standard.resolved||a.t.Goblin.resolved||a.t.Demon.resolved?[{...a,d}]:[];
 });
 const prior=fit(train);
 requireThat(train.length>=5&&tiers.every(t=>prior.trainCounts[t]>=100),'Insufficient previously published training evidence');
 const groups=Object.fromEntries(tiers.map(t=>[t,[]]));
 for(const day of holdoutDays){
  const actual=validateDaily(heldOut[day],day);
  requireThat(dt(heldOut[day].publishedAt)>dt(trainingCutoff),'Holdout outcomes must follow the training cutoff');
  for(const t of tiers){
   const x=actual.t[t],views=src.byTier.filter(k=>k.tier===t);
   const rows=views[0]?.byPacificDate?.filter(r=>r.date===day);
   requireThat(views.length===1&&rows?.length===1&&x.resolved>0,'Missing uniquely scored holdout slate');
   const orig=rows[0];reconcile(x,totals(orig,false));
   requireThat(orig.distinctGames===x.games&&prob(orig.brier)&&Number.isFinite(orig.logLoss)&&orig.logLoss>=0,'Frozen aggregate scores invalid');
   const methods={frozenOriginal:[orig.brier*x.resolved,orig.logLoss*x.resolved],flat50:[x.resolved*.25,x.resolved*Math.log(2)],
    tierPrior:[lossFor(brier,x,prior.tierProbabilities[t]),lossFor(logLoss,x,prior.tierProbabilities[t])]};
   if(t==='Standard')methods.marketPrior=[brier,logLoss].map(fn=>Object.entries(actual.markets).reduce((s,[m,c])=>
    s+lossFor(fn,c,prior.marketProbabilities[m]??prior.tierProbabilities[t]),0));
   groups[t].push({day,x,methods});
  }
 }
 const byTier=Object.fromEntries(tiers.map(t=>{
  const rows=groups[t],n=rows.reduce((s,r)=>s+r.x.resolved,0);
  const measure=(key,i,slateEqual)=>slateEqual?rows.reduce((s,r)=>s+r.methods[key][i]/r.x.resolved,0)/rows.length:
   rows.reduce((s,r)=>s+r.methods[key][i],0)/n;
  const scores=Object.fromEntries(Object.keys(rows[0].methods).map(k=>[k,{brier:measure(k,0,false),logLoss:measure(k,1,false),
   slateEqualBrier:measure(k,0,true),slateEqualLogLoss:measure(k,1,true)}]));
  return [t,{resolved:n,pushes:rows.reduce((s,r)=>s+r.x.pushes,0),distinctGames:rows.reduce((s,r)=>s+r.x.games,0),scores}];
 }));
 return {kind:'nhl_archive_chronological_calibration_v1',trainingCutoff,trainingDates:train.map(r=>r.d),holdoutDates:holdoutDays,
  trainingPublishedBeforeCutoff:true,tierWeight,marketWeight,...prior,byTier,
  target:'strict_selected_side_hit_given_resolved_stat',retrospective:true,challengerSeparatelyFrozen:false,
  modelPromoted:false,calibrationApproved:false,rawPropRowsExposed:0,paidRequests:0};
}
function run(root,ref='HEAD'){
 const git=(...args)=>execFileSync('git',['-C',root,...args],{encoding:'utf8',timeout:10000}).trim();
 const rev=git('rev-parse','--verify','--end-of-options',`${ref}^{commit}`);
 const read=(commit,file)=>JSON.parse(git('show',`${commit}:${file}`));
 function frames(wanted,before){
  return Object.fromEntries(wanted.flatMap(d=>{
   const file=dateFile(d),v=git('log','--first-parent','-1','--format=%H %cI',...(before?[`--until=${before}`]:[]),rev,'--',file);
   if(!v)return [];
   const [hash,publishedAt]=v.split(' ');
   return [[d,{doc:read(hash,file),publishedAt}]];
  }));
 }
 return {archiveRevision:rev,...evaluate({training:frames(trainingDays,trainingCutoff),heldOut:frames(holdoutDays),report:read(rev,'data/model-scorecards.json')})};
}
if(require.main===module)try{console.log(JSON.stringify(run(process.argv[2]||'.',process.argv[3]),null,2));}
catch(e){console.error(`NHL calibration holdout withheld: ${e.message}`);process.exitCode=1;}
module.exports={evaluate,run};
