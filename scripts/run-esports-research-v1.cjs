"use strict";
const fs=require("node:fs"),crypto=require("node:crypto"),path=require("node:path"),{execFileSync}=require("node:child_process");
const model=require("../src/esports-research-v1.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const sha=p=>crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const write=(p,v)=>{fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v,null,2)+"\n",{flag:"wx"});};
const time=x=>Date.parse(x);
function fitCalibration(rows){
 // Predeclared small grid, trained only on earlier decided records.
 if(rows.length<100||new Set(rows.map(r=>r.seriesId)).size<30||new Set(rows.map(r=>r.date)).size<10||new Set(rows.map(r=>r.y)).size!==2)return null;
 let best=null;
 for(const intercept of [-.5,-.25,0,.25,.5])for(const slope of [.5,.75,1,1.25,1.5]){
  const params={intercept,slope},loss=rows.reduce((s,r)=>s-logLikelihood(cal(r.p,params),r.y),0)/rows.length+.01*(intercept**2+(slope-1)**2);
  if(!best||loss<best.loss)best={...params,loss};
 }
 return best;
}
const logLikelihood=(p,y)=>y?Math.log(p):Math.log(1-p);
const bounded=p=>Math.min(.999,Math.max(.001,p));
function cal(p,m){const x=bounded(p);return bounded(1/(1+Math.exp(-(m.intercept+m.slope*Math.log(x/(1-x))))));}
function score(a,key){
 const n=a.length;if(!n)return {n:0,brier:null,logLoss:null,hitRate:null};
 return {n,brier:a.reduce((s,r)=>s+(r[key]-r.y)**2,0)/n,logLoss:-a.reduce((s,r)=>s+logLikelihood(bounded(r[key]),r.y),0)/n,
 hitRate:a.filter(r=>Number(r[key]>.5)===r.y).length/n,alwaysHigher:a.filter(r=>r.y===1).length/n,alwaysLower:a.filter(r=>r.y===0).length/n,
 series:new Set(a.map(r=>r.seriesId)).size,dates:new Set(a.map(r=>r.date)).size};
}
function calibrationAudit(rows,split){
 if(!Number.isFinite(time(split)))throw Error("invalid frozen calibration split");
 const groups={};for(const r of rows)(groups[r.group]??=[]).push(r);
 return Object.fromEntries(Object.entries(groups).map(([k,a])=>{
  const train=a.filter(r=>time(r.settledAt)<time(split)),test=a.filter(r=>time(r.capturedAt)>=time(split));
  const trainSeries=new Set(train.map(r=>r.seriesId));if(test.some(r=>trainSeries.has(r.seriesId)))throw Error("series leakage");
  const m=fitCalibration(train),paired=m?test.map(r=>({...r,adjusted:cal(r.p,m)})):[];
  return [k,{training:score(train,"p"),holdout:score(test,"p"),parameters:m,pairedRaw:score(paired,"p"),pairedAdjusted:score(paired,"adjusted"),approved:false}];
 }));
}
function freeze(offerFile,mapFile,out){
 const offers=read(offerFile),maps=model.uniqueMaps(read(mapFile)).rows,now=new Date().toISOString(),seen=new Set(),rows=[];
 for(const o of offers){
  if(!model.validOffer(o)||time(o.capturedAt)>time(now)||time(o.seriesStartAt)<=time(now)+15*60000)continue;
  const k=JSON.stringify([o.platform,o.title,o.seriesId,o.playerId,o.market,o.maps,o.line,o.tier,o.ruleVersion]);if(seen.has(k))continue;seen.add(k);
  const p=model.predict(o,maps);if(p.status==="research_only")rows.push({offer:o,forecast:p});
 }
 write(out,{kind:"esports_frozen_research_v1",generatedAt:now,sourceSha256:{offers:sha(offerFile),maps:sha(mapFile)},rows,researchOnly:true,appOfferAuthenticated:false,modelPromoted:false});
}
function verifiedFirstGit(file){
 const rel=path.relative(root,path.resolve(file));if(rel.startsWith("..")||!rel.startsWith("outputs/esports/frozen/"))throw Error("not a tracked research archive path");
 const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:15000}).trim();
 if(git(["rev-list","--count","HEAD","--",rel])!=="1")throw Error("archive missing or modified");
 if(git(["status","--porcelain","--",rel]))throw Error("working copy not immutable");
 const first=git(["log","--diff-filter=A","-1","--format=%cI","--",rel]);if(!Number.isFinite(time(first)))throw Error("missing first Git time");return first;
}
function gradeFrozen(frozenFile,mapFile,split){
 const f=read(frozenFile),first=verifiedFirstGit(frozenFile),maps=model.uniqueMaps(read(mapFile)).rows,rows=[],excluded={late:0,unresolved:0,push:0,invalid:0};
 if(f.kind!=="esports_frozen_research_v1"||time(f.generatedAt)>time(first))throw Error("invalid archive timing");
 for(const r of f.rows){
  const o=r.offer,p=r.forecast?.baseline;
  if(!model.validOffer(o)||!p||![p.higher,p.lower,p.push].every(x=>Number.isFinite(x)&&x>=0&&x<=1)||Math.abs(p.higher+p.lower+p.push-1)>1e-8||p.higher+p.lower===0){excluded.invalid++;continue;}
  if(time(o.capturedAt)>time(f.generatedAt)||time(first)+15*60000>time(o.seriesStartAt)){excluded.late++;continue;}
  const g=model.grade(o,maps);if(g.status!=="statistical_result_only"){excluded.unresolved++;continue;}if(g.outcome==="Push"){excluded.push++;continue;}
  const resultRows=maps.filter(x=>x.title===o.title&&x.seriesId===o.seriesId&&x.playerId===o.playerId&&o.maps.includes(x.mapIndex));
  const settledAt=new Date(Math.max(...resultRows.map(x=>time(x.observedAt)))).toISOString();
  rows.push({group:JSON.stringify([o.title,o.platform,o.market,o.maps,o.tier,o.ruleset,o.ruleVersion]),seriesId:o.title+"|"+o.seriesId,date:o.seriesStartAt.slice(0,10),capturedAt:o.capturedAt,settledAt,p:p.higher/(p.higher+p.lower),y:Number(g.outcome==="Higher")});
 }
 return {kind:"esports_first_git_statistical_grade_v1",firstGitAt:first,archiveSha256:sha(frozenFile),decided:rows.length,excluded,score:score(rows,"p"),calibration:split?calibrationAudit(rows,split):null,officialPlatformSettlementVerified:false,calibrationApproved:false,optimizedLineupsApproved:false,paidRequests:0};
}
function main(args){
 const [cmd,a,b,c]=args;
 if(cmd==="replay")console.log(JSON.stringify(model.evaluate(read(a),read(b)),null,2));
 else if(cmd==="freeze")freeze(a,b,c);
 else if(cmd==="grade")console.log(JSON.stringify(gradeFrozen(a,b,c),null,2));
 else if(cmd==="dota-import")console.log(JSON.stringify(model.decodeOpenDota(read(a)),null,2));
 else throw Error("usage: replay offers maps | freeze offers maps output | grade frozen maps [predeclared split] | dota-import source");
}
if(require.main===module){try{main(process.argv.slice(2));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={fitCalibration,calibrationAudit,gradeFrozen};
