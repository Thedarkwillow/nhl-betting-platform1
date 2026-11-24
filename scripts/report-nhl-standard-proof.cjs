"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {freeze,grade,key,candidate}=require("../src/nhl-standard-prospective-proof.cjs");
const {mergeHistory}=require("../src/nhl-specialist-history-recovery.cjs");
const root=path.resolve(__dirname,".."),dt=Date.parse,read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")),git=a=>execFileSync("git",a,{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:80*1024*1024}).trim();
const list=(d,re)=>fs.existsSync(path.join(root,d))?fs.readdirSync(path.join(root,d)).filter(n=>re.test(n)).sort():[];
function original(p){try{const cs=git(["log","--format=%H","--",p]).split("\n").filter(Boolean);if(cs.length!==1)return null;const s=JSON.parse(git(["show",cs[0]+":"+p])),at=git(["show","-s","--format=%cI",cs[0]]);
 if(!Number.isFinite(dt(s.generatedAt))||dt(at)<Math.floor(dt(s.generatedAt)/1000)*1000||dt(at)-dt(s.generatedAt)>=900000)return null;
 return {p,s,at,commit:cs[0]};}catch{return null;}}
function save(p,x,immutable=false){const d=path.join(root,p);fs.mkdirSync(path.dirname(d),{recursive:true});fs.writeFileSync(d,JSON.stringify(x,null,2)+"\n",immutable?{flag:"wx"}:{});}
function main(){
 const now=new Date().toISOString(),day=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(now)).map(x=>[x.type,x.value])),cutoff=day.year+"-"+day.month+"-"+day.day;
 const src="outputs/research/snapshots",dest="outputs/research/standard-proof-v1",hist=read("outputs/history/players.json"),prior=list("outputs/period-stats/training-source",/^\d{4}-\d{2}-\d{2}\.json$/).map(n=>read("outputs/period-stats/training-source/"+n)),h=mergeHistory(hist,prior).history;
 const s=read("outputs/official-nhl/season-schedules/2026-27.json"),source=list(src,/^\d{8}T\d{6}Z\.json$/).slice(-1).map(n=>original(src+"/"+n))[0];
 // First Git commit of the policy source defines genuine prospective use.
 let policyAt=null;
 try{const policy=git(["log","--diff-filter=A","--format=%H","--","src/nhl-standard-prospective-proof.cjs"]).split("\n").filter(Boolean);if(policy.length===1)policyAt=git(["show","-s","--format=%cI",policy[0]]);}catch{}
 const accepted=[],seen=new Set(),files=list(dest,/^\d{8}T\d{9}Z\.json$/),cache=new Map(),rejected={};
 const skip=k=>rejected[k]=(rejected[k]||0)+1;
 for(const n of files){const f=original(dest+"/"+n);if(!f||!policyAt||dt(f.at)<=dt(policyAt)||f.s.kind!=="standard_proof_v1"||f.s.modelPromoted!==false){skip("policy_or_immutable_archive");continue;}
  let o=cache.get(f.s.sourceSnapshot);if(!o&&typeof f.s.sourceSnapshot==="string"&&/^outputs\/research\/snapshots\/\d{8}T\d{6}Z\.json$/.test(f.s.sourceSnapshot)){o=original(f.s.sourceSnapshot);if(o)cache.set(o.p,o);}
  if(!o||o.commit!==f.s.sourceCommit||dt(o.at)>dt(f.s.generatedAt)||dt(o.s.generatedAt)<=dt(policyAt)||dt(f.s.generatedAt)-dt(o.s.generatedAt)>1800000){skip("source_provenance");continue;}
  for(const r of f.s.rows||[]){const k=key(r),q=candidate(r.rawHigher,r.last10Higher,r.last20Higher);
   const p=(o.s.rankedProps||[]).filter(x=>key(x)===k&&x.lean===r.originalSide&&x.capturedAt===r.capturedAt);
   if(seen.has(k)||r.tier!=="Standard"||!q||q.higher!==r.challengerHigher||q.direction!==r.challengerDirection||r.selected!==(q.selected&&q.direction===r.originalSide)||p.length!==1||p[0].probabilities?.higher!==r.rawHigher||dt(f.at)>=dt(r.gameStartAt)-900000||dt(r.capturedAt)>dt(o.s.generatedAt)||r.latestPriorGameDate>=f.s.cutoff){skip("row_chronology_or_identity");continue;}
   seen.add(k);accepted.push(r);
  }
 }
 let newRows=[];
 if(policyAt&&source&&dt(source.s.generatedAt)>dt(policyAt)&&dt(source.at)<=dt(now)){
  newRows=freeze(source.s,h,s,now,cutoff).filter(r=>!seen.has(key(r)));
  const at=new Date().toISOString();newRows=newRows.filter(r=>dt(r.gameStartAt)>dt(at)+900000&&dt(at)-dt(source.s.generatedAt)<=1800000);
  if(newRows.length)save(dest+"/"+at.replace(/[-:.]/g,"")+".json",{kind:"standard_proof_v1",generatedAt:at,cutoff,sourceSnapshot:source.p,sourceCommit:source.commit,rows:newRows,modelPromoted:false,calibrationApproved:false},true);
 }
 const report={kind:"private_nhl_standard_proof_v1",generatedAt:new Date().toISOString(),policyAt,existingSidecars:files.length,accepted:accepted.length,newRows:newRows.length,newSelected:newRows.filter(r=>r.selected).length,scorecard:grade(accepted,h),rejected,comparison:"same frozen exact half-point Standard lines; all baselines hypothetical if alternate offered side unverified",requirement:"200 decided, 60 distinct games, 20 distinct dates, paired game-cluster superiority vs simple baselines and improved Brier; independent review only",confidenceApproved:false,lineupsApproved:false,modelPromoted:false,paidProviderRequests:0};save("outputs/health/nhl-standard-proof-latest.json",report);console.log(JSON.stringify({policyAt,accepted:accepted.length,newRows:newRows.length,newSelected:report.newSelected,modelPromoted:false}));
}
if(require.main===module)main();
