'use strict';
// Research-only probability scoring. No model fitting or promotion.
const dt=Date.parse;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const hash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const day=x=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(x));
function score(rows){
 const n=rows.length,avg=f=>n?rows.reduce((s,r)=>s+f(r),0)/n:null;
 const groups=new Map();for(const r of rows){const a=groups.get(r.gameId)||[];a.push(r);groups.set(r.gameId,a);}
 const brier=r=>(r.p-r.y)**2,loss=r=>-Math.log(Math.max(1e-15,r.y?r.p:1-r.p));
 const bins=Array.from({length:10},(_,i)=>{const a=rows.filter(r=>Math.min(9,Math.floor(r.p*10))===i);return {low:i/10,high:(i+1)/10,n:a.length,meanProbability:a.length?a.reduce((s,r)=>s+r.p,0)/a.length:null,hitRate:a.length?a.reduce((s,r)=>s+r.y,0)/a.length:null,distinctGames:new Set(a.map(r=>r.gameId)).size};});
 return {n,wins:rows.reduce((s,r)=>s+r.y,0),hitRate:avg(r=>r.y),meanProbability:avg(r=>r.p),brier:avg(brier),logLoss:avg(loss),constantHalfBrier:n?0.25:null,constantHalfLogLoss:n?Math.log(2):null,alwaysHigher:avg(r=>r.side==='Higher'?r.y:1-r.y),alwaysLower:avg(r=>r.side==='Lower'?r.y:1-r.y),distinctGames:groups.size,distinctSlates:new Set(rows.map(r=>r.slate)).size,gameEqualBrier:groups.size?[...groups.values()].reduce((s,a)=>s+a.reduce((q,r)=>q+brier(r),0)/a.length,0)/groups.size:null,bins};
}
// Internal links only. Public aggregates must never serialize these offer rows.
function linkedGrades(frames,grades,clock){
 const at=dt(clock);if(!Number.isFinite(at))throw Error('invalid clock');
 const index=new Map(),conflicts=new Set(),accepted=new Map(),bad=new Set();let invalid=0,pushes=0;
 for(const f of [...frames].sort((a,b)=>dt(a.first)-dt(b.first)||String(a.digest).localeCompare(String(b.digest)))){
  if(!hash(f.digest)||!['pickfinder_public_nba_shadow_forecasts_v1','pickfinder_public_nba_mirror_shadow_forecasts_v1'].includes(f.doc?.kind)||!Number.isFinite(dt(f.first))||!Number.isFinite(dt(f.doc.generatedAt))||dt(f.doc.generatedAt)>dt(f.first)+999||dt(f.first)>at)continue;
  for(const p of f.doc.rows||[]){
   const rev=f.doc.modelRevision||p.modelRevision;
   if(!/^[a-f0-9]{40}$/.test(rev||'')||!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||!finite(p.line)||!finite(p.rawSelectedEstimate)||p.rawSelectedEstimate<0||p.rawSelectedEstimate>1||!['Higher','Lower'].includes(p.offeredSide)||!Number.isFinite(dt(p.gameStartAt))||dt(f.first)+900000>=dt(p.gameStartAt)||!p.book||!p.market||!p.tier)continue;
   const id=JSON.stringify([rev,p.book,p.gameId,p.playerId,p.market,p.line,p.offeredSide,p.tier]);
   if(!index.has(id))index.set(id,{p,rev,digest:f.digest,kind:f.doc.kind,first:f.first,generatedAt:f.doc.generatedAt,slate:day(p.gameStartAt)});
  }
 }
 for(const g of [...grades].sort((a,b)=>dt(a.first)-dt(b.first))){
  if(!hash(g.digest)||g.doc?.kind!=='pickfinder_public_nba_independent_grades_v1'||g.doc.appSettlementVerified!==false||!Number.isFinite(dt(g.first))||dt(g.first)>at||!Number.isFinite(dt(g.doc.generatedAt))||dt(g.doc.generatedAt)>dt(g.first)+999)continue;
  for(const r of g.doc.rows||[]){
   const f=index.get(r.id);if(!f||f.digest!==r.forecastDigest||r.gameId!==f.p.gameId||r.playerId!==f.p.playerId||r.market!==f.p.market||r.side!==f.p.offeredSide||r.modelEstimate!==f.p.rawSelectedEstimate||!finite(r.actual)||!hash(r.officialResponseSha256)||!Number.isFinite(dt(r.officialObservedAt))||dt(r.officialObservedAt)<=dt(f.p.gameStartAt)||dt(r.officialObservedAt)>dt(g.first)+999){invalid++;continue;}
   const expected=r.actual===f.p.line?'push':(r.side==='Higher'?r.actual>f.p.line:r.actual<f.p.line)?'correct':'incorrect';
   if(expected!==r.result){bad.add(r.id);continue;}
   const old=accepted.get(r.id);if(old&&(old.result!==r.result||old.actual!==r.actual||old.estimate!==r.modelEstimate)){conflicts.add(r.id);continue;}
   if(!old)accepted.set(r.id,{result:r.result,actual:r.actual,estimate:r.modelEstimate,f,officialSource:r.officialSource,officialCommitAt:g.first,officialResponseSha256:r.officialResponseSha256});
  }
 }
 const decided=[];for(const [id,r] of accepted){if(bad.has(id)||conflicts.has(id))continue;if(r.result==='push'){pushes++;continue;}decided.push({id,...r});}
 return {registered:index.size,decided,pushes,invalidGrades:invalid,conflictingGradesExcluded:new Set([...bad,...conflicts]).size};
}
function audit(frames,grades,clock){
 const {decided, ...counts}=linkedGrades(frames,grades,clock);
 const rows=decided.map(r=>({p:r.estimate,y:Number(r.result==='correct'),gameId:r.f.p.gameId,slate:r.f.slate,side:r.f.p.offeredSide,tier:r.f.p.tier,revision:r.f.rev}));
 const group=key=>Object.fromEntries([...new Set(rows.map(key))].sort().map(k=>[k,score(rows.filter(r=>key(r)===k))]));
 return {kind:'rolling_original_probability_performance_v1',researchOnly:true,calibrated:false,modelPromoted:false,appSettlementVerified:false,...counts,decided:rows.length,byRevision:group(r=>r.revision),bySlateAndRevision:group(r=>JSON.stringify([r.slate,r.revision])),byRevisionAndTier:group(r=>JSON.stringify([r.revision,r.tier])),preferredStandardByRevision: Object.fromEntries([...new Set(rows.map(r=>r.revision))].sort().map(k=>[k,score(rows.filter(r=>r.revision===k&&String(r.tier).toLowerCase()==='standard'&&r.p>.5))])),noPrivateRows:true};
}
module.exports={audit,score,linkedGrades};
