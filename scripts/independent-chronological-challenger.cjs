"use strict";
// Fixed chronological research challenger. Synthetic thresholds are NOT archived platform lines.
// Training and residual calibration use strictly earlier dates; no production promotion.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {files,validate}=require("./private-source-history-connections.cjs");
const {nbaRows,esportsRows,immutableMaps,correlation}=require("./chronological-player-stat-audit.cjs");
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const finite=v=>typeof v==="number"&&Number.isFinite(v)&&v>=0;
const cut={train:"2024-07-01",calibrate:"2025-07-01"};
const key=a=>JSON.stringify(a);
function examples(rows){
 const groups=new Map(),out=[];
 for(const x of rows){const k=key([x.sport,x.player,x.scope]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}
 for(const list of groups.values()){
  list.sort((a,b)=>a.start-b.start);
  for(let i=0;i<list.length;i++){
   const x=list[i];if(!Number.isFinite(x.start)||typeof x.date!=="string")continue;
   const prior=list.slice(0,i).filter(p=>p.date<x.date&&p.end<x.start&&p.known<x.start&&(!x.series||p.series!==x.series));
   for(const [metric,y] of Object.entries(x.values)){
    if(!finite(y))continue;const vals=prior.map(p=>p.values[metric]).filter(finite).slice(-30);
    if(vals.length<12)continue;
    const base=mean(vals),recent=mean(vals.slice(-10)),scale=Math.max(1,base);
    out.push({group:key([x.sport,x.scope,metric]),player:x.player,event:x.series||x.event,date:x.date,y,base,vals,features:[1,(recent-base)/scale,(mean(vals.slice(-5))-base)/scale],scale,threshold:Math.floor(base)+.5});
   }
  }
 }
 return out;
}
function fit(rows){
 // Fixed ridge regression of scale-normalized residuals on past-only recent-form features.
 const a=Array.from({length:3},()=>Array(4).fill(0));
 for(const r of rows)for(let i=0;i<3;i++){
  for(let j=0;j<3;j++)a[i][j]+=r.features[i]*r.features[j];
  a[i][3]+=r.features[i]*(r.y-r.base)/r.scale;
 }
 for(let i=0;i<3;i++)a[i][i]+=10;
 for(let i=0;i<3;i++){
  const pivot=a[i][i];if(!Number.isFinite(pivot)||Math.abs(pivot)<1e-10)throw Error("ridge solve");
  for(let j=i;j<4;j++)a[i][j]/=pivot;
  for(let k=0;k<3;k++)if(k!==i){const f=a[k][i];for(let j=i;j<4;j++)a[k][j]-=f*a[i][j];}
 }
 return a.map(x=>x[3]);
}
function predict(r,b){return Math.max(0,r.base+r.scale*r.features.reduce((s,v,i)=>s+v*b[i],0));}
function probability(values,threshold){return (1+values.filter(v=>v>threshold).length)/(values.length+2);}
function cdf(sorted,t){let lo=0,hi=sorted.length;while(lo<hi){const m=(lo+hi)>>1;if(sorted[m]<=t)lo=m+1;else hi=m;}return lo;}
function score(p,y){return {brier:(p-y)**2,loss:-(y?Math.log(p):Math.log1p(-p))};}
function stats(){return {n:0,mae:0,brier:0,loss:0,bins:Array.from({length:10},()=>({n:0,p:0,y:0}))};}
function add(s,projection,actual,p,y){const q=score(p,y),b=s.bins[Math.min(9,Math.floor(10*p))];s.n++;s.mae+=Math.abs(actual-projection);s.brier+=q.brier;s.loss+=q.loss;b.n++;b.p+=p;b.y+=y;}
function summarize(s){return {n:s.n,mae:s.n?s.mae/s.n:null,brier:s.n?s.brier/s.n:null,logLoss:s.n?s.loss/s.n:null,reliability:s.bins.map((b,i)=>({bin:i,n:b.n,meanProbability:b.n?b.p/b.n:null,observedFraction:b.n?b.y/b.n:null}))};}
function evaluate(rows,split=cut){
 if(!(split.train<split.calibrate))throw Error("split order");
 const groups=new Map(),result={},residuals=new Map();
 for(const r of examples(rows)){if(!groups.has(r.group))groups.set(r.group,[]);groups.get(r.group).push(r);}
 for(const [k,list] of groups){
  const train=list.filter(r=>r.date<split.train),cal=list.filter(r=>r.date>=split.train&&r.date<split.calibrate),test=list.filter(r=>r.date>=split.calibrate);
  if(train.length<100||cal.length<100||test.length<100){result[k]={training:train.length,calibration:cal.length,holdout:test.length,status:"insufficient_sample"};continue;}
  const b=fit(train),errs=cal.map(r=>(r.y-predict(r,b))/r.scale).sort((a,z)=>a-z);
  const base=stats(),model=stats(),events=new Map(),dates=new Set();let higher=0;
  for(const r of test){
   const m=predict(r,b),y=Number(r.y>r.threshold),p=probability(r.vals,r.threshold),q=(1+errs.length-cdf(errs,(r.threshold-m)/r.scale))/(errs.length+2);
   add(base,r.base,r.y,p,y);add(model,m,r.y,q,y);higher+=y;dates.add(r.date);
   const event=events.get(r.event)||{n:0,d:0};event.n++;event.d+=score(p,y).brier-score(q,y).brier;events.set(r.event,event);
   const rk=key([JSON.parse(k).slice(0,2),r.event,r.player]);if(!residuals.has(rk))residuals.set(rk,{});residuals.get(rk)[JSON.parse(k)[2]]=r.y-m;
  }
  const n=test.length,delta=(base.brier-model.brier)/n,c=events.size,variance=c>1?c/(c-1)*[...events.values()].reduce((s,g)=>s+(g.d-delta*g.n)**2,0)/(n*n):null;
  const margin=variance!==null&&c>=30&&dates.size>=10?1.96*Math.sqrt(variance):null;
  result[k]={training:train.length,calibration:cal.length,holdout:n,events:c,dates:dates.size,baseline:summarize(base),challenger:summarize(model),alwaysHigher:higher/n,alwaysLower:1-higher/n,brierImprovement:delta,approxCluster95Interval:margin===null?null:[delta-margin,delta+margin],calibrationApproved:false};
 }
 const pairs=new Map();
 for(const [k,v] of residuals){const [sportScope,event]=JSON.parse(k),metrics=Object.keys(v).sort();for(let i=0;i<metrics.length;i++)for(let j=i+1;j<metrics.length;j++){
  const id=key([...sportScope,metrics[i],metrics[j]]);if(!pairs.has(id))pairs.set(id,{rows:[],events:new Set()});const p=pairs.get(id);p.rows.push([v[metrics[i]],v[metrics[j]]]);p.events.add(event);
 }}
 return {kind:"independent_chronological_challenger_v1",split,sourceRows:rows.length,groups:result,withinPlayerResidualCorrelation:Object.fromEntries([...pairs].map(([k,p])=>[k,{pairs:p.rows.length,events:p.events.size,pearson:p.events.size>=30?correlation(p.rows):null}])),thresholdType:"synthetic_prior_mean_half_point",historicalOnly:true,untouched:false,prospective:false,originalOffersVerified:0,platformSettlementVerified:false,modelPromoted:false,paidRequests:0,rawRowsPublished:0};
}
function archiveRows(root){
 if(root===path.resolve(__dirname,"..")||!fs.existsSync(path.join(root,".git")))throw Error("private checkout required");
 const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:15000,maxBuffer:2e6,stdio:["ignore","pipe","pipe"]}).trim(),rows=[],seen=new Set();
 for(const [season,name,sha] of files){const rel="outputs/nba/history/"+season+"/"+name,p=path.join(root,rel);
  if(!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p||git(["status","--porcelain","--",rel])||git(["rev-parse","HEAD:"+rel])!==sha)throw Error("recovered archive mismatch");
  const raw=fs.readFileSync(p),meta=validate(raw,season,sha),a=nbaRows(JSON.parse(raw));if(a.length!==meta.rows)throw Error("incomplete cohort");
  for(const r of a){const k=key([r.player,r.event]);if(seen.has(k))throw Error("duplicate appearance");seen.add(k);rows.push(r);}
 }
 return [...rows,...esportsRows(immutableMaps(root))];
}
module.exports={examples,fit,predict,evaluate,archiveRows};
if(require.main===module){try{console.log(JSON.stringify(evaluate(archiveRows(fs.realpathSync(process.argv[2])))));}catch{console.error("Independent challenger failed closed");process.exitCode=1;}}
