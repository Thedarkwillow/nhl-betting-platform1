'use strict';
// Counts-only calibration. Fit in a separate commit, then score forecasts
// genuinely made after that commit. Never publish edges or qualified props.
const fs=require('node:fs'),path=require('node:path');
const {git}=require('./pickfinder-public-evidence-audit.cjs');
const {sha}=require('./pickfinder-public-archive.cjs');
const {history,save}=require('./pickfinder-public-model-validation.cjs');
const {receipts}=require('./prizepicks-native-context-readiness.cjs');
const {nativeIndex,indexFromArchive}=require('./pickfinder-native-history-reconciliation.cjs');
const nba=require('./rolling-probability-performance.cjs');
const nhl=require('./nhl-public-sog-shadow.cjs');
const other=require('./pickfinder-reviewed-history-forward.cjs');
const {compareByGame}=require('./prospective-game-comparison.cjs');
const {fitPlatt,applyPlatt,eligible,MIN_TRAIN,MIN_GAMES,MIN_SLATES}=require('../src/past-only-calibration-research.cjs');
const dt=Date.parse,key=x=>JSON.stringify(x),hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x),q=x=>Number.isFinite(x)&&x>=0&&x<=1;
const SPORT=['NHL','NFL','NBA'],FITS='prop-calibration-fits',KIND='public_prop_calibration_fit_v1',POLICY='precommitted_platt_game_equal_v1';
const MIN_TEST=100,MIN_TEST_GAMES=30,MIN_TEST_SLATES=10;
const norm=x=>String(x??'').trim().toLowerCase();
const pacific=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'});
function versioner(root){
 const cache=new Map();
 const paths={NHL:['src/projections.cjs','src/prop-probabilities.cjs','scripts/prizepicks-multisport-model-bridge.cjs'],
 NFL:['scripts/backtest-nfl-historical-stats.cjs','scripts/prizepicks-multisport-model-bridge.cjs'],
 NBA:['src/nba-research-pipeline-v1.cjs','scripts/pickfinder-public-model-validation.cjs']};
 return (sport,rev,lane)=>{
  if(!paths[sport]||!/^[a-f0-9]{40}$/.test(rev||'')||!lane)return null;
  const k=key([sport,rev,lane]);if(cache.has(k))return cache.get(k);
  let out=null;
  try{const blobs=git(root,['rev-parse',...paths[sport].map(p=>rev+':'+p)]).split('\n');
   if(blobs.length===paths[sport].length&&blobs.every(x=>/^[a-f0-9]{40}$/.test(x)))out=sha(key([lane,...blobs]));
  }catch{}
  cache.set(k,out);return out;
 };
}
function observation({sport,lane,p,side,selected,first,finalAt,actual,start,source,revision,method='model',tier},version){
 const t=({standard:'Standard',goblin:'Goblin',demon:'Demon'})[norm(tier)];
 if(!t||!SPORT.includes(sport)||!['prizepicks','underdog'].includes(norm(p.book))||!p.market||!p.gameId||!p.playerId||
  !['Higher','Lower'].includes(side)||!q(selected)||!Number.isFinite(actual)||!Number.isFinite(p.line)||
  actual===p.line||!Number.isFinite(dt(start))||!Number.isFinite(dt(finalAt))||dt(finalAt)<=dt(start))return null;
 const model=version(sport,revision,lane+':'+method);if(!hash(model))return null;
 const book=norm(p.book),period='full_game',contract='conditional_on_decided',stratum=Number.isInteger(p.line)?'integer':'noninteger';
 const cohort=key([sport,book,t,period,p.market,contract,stratum,lane,model]);
 return {sport,book,tier:t,period,market:p.market,contract,stratum,lane,model,cohort,
  gameId:String(p.gameId),slate:pacific.format(new Date(start)),
  originalOfferKey:key([String(p.gameId),String(p.playerId),p.line]),
  originalHigher:side==='Higher'?selected:1-selected,higherOutcome:Number(actual>p.line),
  originalSourceAt:source,originalFirstGitAt:first,gameStartsAt:start,officialFinalAt:finalAt,
  originalFirstGitVerified:true,sideUnchanged:true,officialStatVerified:true};
}
function pastOnlyRows(root,at){
 const version=versioner(root),all=[],h=x=>history(root,x);
 const n=nhl.committed(h('nhl-public-sog-forecasts'),at);
 if(n.size){
  const finals=receipts(root,'research/pickfinder-public-identity-v1/nhl-final-stat-facts','nhl_official_recent_final_stats_v1',at);
  const official=nhl.officialGrades(n,nativeIndex({facts:[],nhlFinals:finals,nflSeasons:[]},at),at);
  const grades=nhl.verifiedGrades(h('nhl-public-sog-grades'),official,at);
  // The final archive date is the first outcome evidence, not puck-drop time.
  for(const [id,g] of grades){const f=n.get(id),p=f.row;
   all.push(observation({sport:'NHL',lane:'nhl_sog_partner',p,side:'Higher',selected:p.higherProbability,
     first:new Date(f.first).toISOString(),finalAt:g.gradeCommittedAt,actual:g.actual,start:p.startAt,
     source:p.sourceObservedAt,revision:p.modelRevision,method:p.method,tier:p.tier},version));
  }
 }
 const o=other.committedForecasts(h('nhlnfl-reviewed-history-forecasts'),at);
 if(o.size){
  const independent=new Map(other.results(o,indexFromArchive(root,at),at).map(g=>[g.id,g]));
  const used=new Set();
  for(const f of h('nhlnfl-reviewed-history-grades').sort((a,b)=>dt(a.first)-dt(b.first)))if(f.doc.kind==='pickfinder_nhlnfl_reviewed_history_shadow_grades_v1'&&dt(f.first)<=dt(at)&&dt(f.doc.generatedAt)<=dt(f.first)+999){
   for(const g of f.doc.rows||[]){
    const v=independent.get(g.id),fr=o.get(g.id),p=fr?.p;
    if(!p||used.has(g.id)||!v||dt(v.officialFinalAvailableAt)>dt(f.first)||
     ['id','forecastDigest','officialFinalDigest','officialFinalAvailableAt','actual','outcome'].some(k=>v[k]!==g[k]))continue;
    used.add(g.id);
    all.push(observation({sport:p.sport,lane:'nhlnfl_reviewed_history',p,side:p.side,selected:p.reviewedHistoryPair.existing,
     first:fr.first,finalAt:f.first,actual:v.actual,start:p.startAt,source:p.sourceObservedAt,
     revision:p.modelRevision,method:p.method,tier:p.tier},version));
   }
  }
 }
 const nbaLinks=nba.linkedGrades(h('nba-forecasts'),h('nba-grades'),at);
 const officialSources=new Set(['cdn','stats_v3','nba.com official game box score']);
 for(const r of nbaLinks.decided){
  const p=r.f.p;if(!officialSources.has(r.officialSource)||p.probabilityConditionalOnDecided!==true)continue;
  all.push(observation({sport:'NBA',lane:r.f.kind,p,side:p.offeredSide,selected:p.rawSelectedEstimate,
   first:r.f.first,finalAt:r.officialCommitAt,actual:r.actual,start:p.gameStartAt,source:p.sourceObservedAt,revision:r.f.rev,tier:p.tier},version));
 }
 return all.filter(Boolean);
}
function organize(rows,at){
 const groups=new Map(),rejected=new Set();
 for(const r of rows){
  if(!r||!eligible(r,at,true))continue;
  const sel=groups.get(r.cohort)||new Map(),old=sel.get(r.originalOfferKey);
  if(old&&(old.higherOutcome!==r.higherOutcome||Math.abs(old.originalHigher-r.originalHigher)>1e-9)){
   rejected.add(key([r.cohort,r.originalOfferKey]));continue;
  }
  if(!old||dt(r.originalFirstGitAt)<dt(old.originalFirstGitAt))sel.set(r.originalOfferKey,r);
  groups.set(r.cohort,sel);
 }
 return new Map([...groups].map(([k,m])=>[k,[...m.values()].filter(r=>!rejected.has(key([k,r.originalOfferKey]))).sort((a,b)=>a.originalOfferKey.localeCompare(b.originalOfferKey))]));
}
function freezeValid(f,rows,at){
 const d=f.doc;
 if(d.kind!==KIND||d.policy!==POLICY||!hash(f.digest)||!(dt(f.first)<=dt(at))||
  !(dt(d.fitAt)<=dt(f.first)+999)||!Array.isArray(d.coefficients)||d.coefficients.length!==2||
  !d.coefficients.every(x=>Number.isFinite(x)&&Math.abs(x)<=15)||d.coefficients[1]<=0)return false;
 const training=rows.filter(r=>eligible(r,d.fitAt,true));
 if(sha(key(training))!==d.trainingDigest)return false;
 const fit=fitPlatt(training,d.fitAt);
 return !!fit&&key(fit.coefficients)===key(d.coefficients)&&key([fit.decisions,fit.games,fit.slates])===key(d.training);
}
function hits(rows,predict){
 const a=rows.map(r=>({gameId:r.gameId,slate:r.slate,p:predict(r),side:'Higher',y:r.higherOutcome}));
 const s=nba.score(a),games=new Map();
 for(const r of a){
  const g=games.get(r.gameId)||{n:0,m:0,h:0};g.n++;g.h+=r.y;g.m+=r.p===.5?.5:Number(Number(r.p>.5)===r.y);games.set(r.gameId,g);
 }
 const avg=k=>games.size?[...games.values()].reduce((z,v)=>z+v[k]/v.n,0)/games.size:null;
 const hi=avg('h');
 return {reliability:s.bins,gameEqualHits:{model:avg('m'),alwaysHigher:hi,alwaysLower:hi===null?null:1-hi}};
}
function run(root,{clock=()=>new Date().toISOString(),collect=pastOnlyRows}={}){
 const at=clock(),cohorts=organize(collect(root,at),at),frames=history(root,FITS),reports=[];
 const rawCounts=Object.fromEntries(SPORT.map(s=>[s,{eligibleDecisions:0,cohorts:0,fitted:0,newFitsStaged:0,prospectiveDecisions:0,reviewReady:0}]));
 for(const [cohort,rows] of cohorts){
  if(!rows.length)continue;
  const {sport,book,tier,period,market,contract,stratum,lane,model}=rows[0],counts=rawCounts[sport];
  counts.cohorts++;counts.eligibleDecisions+=rows.length;
  const scoped=frames.filter(x=>x.doc.cohort===cohort).sort((a,b)=>dt(a.first)-dt(b.first)||a.digest.localeCompare(b.digest));
  const f=scoped[0],fit=f?null:fitPlatt(rows,at),record={sport,book,tier,period,market,contract,stratum,lane,model,
    observations:rows.length,status:'insufficient_frozen_training',calibrated:false};
  if(!f&&fit){
   save(root,FITS,{kind:KIND,policy:POLICY,cohort,fitAt:at,coefficients:fit.coefficients,
    training:[fit.decisions,fit.games,fit.slates],trainingDigest:sha(key(rows))});
   counts.newFitsStaged++;record.status='first_fit_staged_uncommitted';
  }else if(f){
   if(!freezeValid(f,rows,at)||scoped.length!==1){record.status='fit_commit_or_training_mismatch';reports.push(record);continue;}
   const after=new Date(Math.max(dt(f.first)+999,dt(f.doc.fitAt))).toISOString();
   const future=rows.filter(r=>eligible(r,after,false)),pair=compareByGame(future.map(r=>({gameId:r.gameId,candidate:applyPlatt(r.originalHigher,f.doc.coefficients),benchmark:r.originalHigher,outcome:r.higherOutcome})));
   const games=pair.distinctGames,slates=new Set(future.map(r=>r.slate)).size,floor=future.length>=MIN_TEST&&games>=MIN_TEST_GAMES&&slates>=MIN_TEST_SLATES;
   record.fitDigest=f.digest;record.fitFirstGitAt=f.first;record.training=f.doc.training;record.prospective={decisions:future.length,games,slates,
    pairedProbabilityScores:pair,constantHalf:{brier:.25,logLoss:Math.log(2)},raw:hits(future,r=>r.originalHigher),challenger:hits(future,r=>applyPlatt(r.originalHigher,f.doc.coefficients))};
   const rates=record.prospective.challenger.gameEqualHits;
   const ready=floor&&pair.delta.brier<0&&pair.delta.logLoss<0&&pair.candidate.brier<.25&&pair.candidate.logLoss<Math.log(2)&&pair.uncertainty.brier?.[1]<0&&rates.model>Math.max(rates.alwaysHigher,rates.alwaysLower);
   counts.fitted++;counts.prospectiveDecisions+=future.length;
   if(ready)counts.reviewReady++;
   record.status=ready?'independent_review_required':floor?'prospective_gate_not_met':'waiting_for_prospective_sample';
  }
  reports.push(record);
 }
 return {kind:'public_prop_calibration_readiness_v1',generatedAt:at,policy:POLICY,
  trainingFloor:{decisions:MIN_TRAIN,games:MIN_GAMES,slates:MIN_SLATES},
  prospectiveFloor:{decisions:MIN_TEST,games:MIN_TEST_GAMES,slates:MIN_TEST_SLATES},
  bySport:rawCounts,cohorts:reports,unsupportedOrUnobservedMarketsQualified:false,
  calibratedProbabilityApproved:false,modelPromoted:false,productionChanged:false,researchOnly:true,paidRequests:0};
}
if(require.main===module){
 try{
  const root=process.cwd();if(git(root,['rev-parse','--is-shallow-repository'])!=='false')throw Error('full Git history required');
  const out=run(root),p=path.join(root,'data/public-prop-calibration.json');fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(out,null,2)+'\n');
  console.log(JSON.stringify({generatedAt:out.generatedAt,bySport:out.bySport,calibratedProbabilityApproved:false,paidRequests:0}));
 }catch(e){console.error(e.message);process.exitCode=1;}
}
module.exports={observation,organize,freezeValid,run,pastOnlyRows};
