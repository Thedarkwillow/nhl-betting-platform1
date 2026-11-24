"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const model=require("../src/nhl-shot-point-opportunity-v1.cjs"),{mergeHistory}=require("../src/nhl-specialist-history-recovery.cjs"),{pacificDay}=require("../src/nhl-standard-forward-diagnostics.cjs");
const selective=require("../src/nhl-selective-opportunity-future-v1.cjs");
const {audit:zeroStatAudit,privateExceptions}=require("../src/nhl-zero-stat-integrity-audit.cjs");
const {replay:opportunityReplay}=require("../src/nhl-synthetic-opportunity-replay.cjs");
const root=path.resolve(__dirname,".."),dt=Date.parse,read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")),git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:96*1024*1024}).trim();
const list=(d,re)=>fs.existsSync(path.join(root,d))?fs.readdirSync(path.join(root,d)).filter(n=>re.test(n)).sort():[];
function original(p){try{const a=git(["log","--format=%H","--",p]).split("\n").filter(Boolean);if(a.length!==1)return null;const s=JSON.parse(git(["show",a[0]+":"+p])),at=git(["show","-s","--format=%cI",a[0]]);if(!Number.isFinite(dt(s.generatedAt))||dt(at)<Math.floor(dt(s.generatedAt)/1000)*1000||dt(at)-dt(s.generatedAt)>=900000)return null;return {s,at,commit:a[0],path:p};}catch{return null;}}
function save(p,x,immutable=false){const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+"\n",immutable?{flag:"wx"}:{});}
function main(){
 const now=new Date().toISOString(),cutoff=pacificDay(now),src="outputs/research/snapshots",dest="outputs/research/shot-point-opportunity-v1",priorDir="outputs/period-stats/training-source",ppDir="outputs/research/nhl-pp-history";
 const h=mergeHistory(read("outputs/history/players.json"),list(priorDir,/^\d{4}-\d{2}-\d{2}\.json$/).map(n=>read(priorDir+"/"+n)),list(ppDir,/^\d{4}-\d{2}-\d{2}\.json$/).flatMap(n=>{const d=read(ppDir+"/"+n);return d.kind==="official_nhl_exact_game_pp_time_v1"?d.rows:[];}));
 const cur=read("outputs/official-nhl/season-schedules/2026-27.json"),prev=read("outputs/official-nhl/season-schedules/2025-26.json");if(cur.complete!==true||prev.complete!==true)throw Error("complete official schedules required");const schedule={...cur,games:[...prev.games,...cur.games]};
 const c=model.prepare(h.history,schedule,{cutoff,holdout:"2026-07-01"}),historyHead=git(["rev-parse","HEAD"]),policy=git(["log","--diff-filter=A","--format=%cI","--","src/nhl-shot-point-opportunity-v1.cjs"]).split("\n").filter(Boolean),policyAt=policy.length===1?policy[0]:null;
 const latestSelectivePolicy=git(["log","--diff-filter=A","--format=%cI","--","src/nhl-selective-opportunity-future-v1.cjs"]).split("\n").filter(Boolean),selectivePolicyAt=latestSelectivePolicy.length===1?latestSelectivePolicy[0]:null;
 const accepted=[],seen=new Set(),rejected={},sources=new Map();
 const skip=k=>rejected[k]=(rejected[k]||0)+1;
 const latest=list(src,/^\d{8}T\d{6}Z\.json$/).at(-1),source=latest?original(src+"/"+latest):null;
 for(const n of list(dest,/^\d{8}T\d{9}Z\.json$/)){const f=original(dest+"/"+n);if(!policyAt||!f||dt(f.s.generatedAt)<=dt(policyAt)||f.s.kind!=="shot_point_opportunity_original_v1"||f.s.modelPromoted!==false){skip("policy_or_archive");continue;}
  const path=f.s.sourceSnapshot;if(typeof path!=="string"||!/^outputs\/research\/snapshots\/\d{8}T\d{6}Z\.json$/.test(path)){skip("source_path");continue;}
  let o=sources.get(path);if(!o){o=original(path);if(o)sources.set(path,o);}
  if(!o||o.commit!==f.s.sourceCommit||dt(o.s.generatedAt)<=dt(policyAt)||dt(o.at)>dt(f.s.generatedAt)||dt(f.s.generatedAt)-dt(o.s.generatedAt)>1800000){skip("source_clock");continue;}
  for(const r of f.s.rows||[]){const k=model.key(r),p=(o.s.rankedProps||[]).filter(x=>model.key(x)===k&&x.lean===r.side&&x.capturedAt===r.capturedAt&&x.gameStartAt===r.gameStartAt);
   if(seen.has(k)||p.length!==1||p[0].probabilities?.higher!==r.originalHigher||r.tier!=="Standard"||!["points","shotsOnGoal"].includes(r.market)||!["F","D"].includes(r.role)||r.latestPriorDate>=f.s.cutoff||dt(f.at)>=dt(r.gameStartAt)-900000||dt(r.capturedAt)>dt(o.s.generatedAt)||!["empirical","rate","opportunity","pooled","position"].every(n=>Number.isFinite(r.variants?.[n])&&r.variants[n]>=0&&r.variants[n]<=1)){skip("row_identity_or_clock");continue;}if(r.selective?.kind===selective.KIND&&!selective.originalSourceAfterNewPolicy({
    sourceGeneratedAt:o.s.generatedAt,sourceFirstGitCommittedAt:o.at,
    policyFirstGitCommittedAt:selectivePolicyAt,shadowFirstGitCommittedAt:f.at
   })){skip("selective_original_source_not_postpolicy");continue;}
  seen.add(k);accepted.push({...r,firstGitCommittedAt:f.at});}
 }
 let newRows=[];
 if(policyAt&&source&&dt(source.s.generatedAt)>dt(policyAt)&&dt(source.at)<=dt(now)){
  const eligibleSource=selective.originalSourceAfterNewPolicy({
   sourceGeneratedAt:source.s.generatedAt,sourceFirstGitCommittedAt:source.at,
   policyFirstGitCommittedAt:selectivePolicyAt,shadowFirstGitCommittedAt:now
  });
  newRows=model.freeze(source.s,c.c,now,{selectivePolicyEligible:eligibleSource})
   .filter(x=>!seen.has(model.key(x)));
  const at=new Date().toISOString();newRows=newRows.filter(x=>dt(x.gameStartAt)>dt(at)+900000&&dt(at)-dt(source.s.generatedAt)<=1800000);
  if(newRows.length)save(dest+"/"+at.replace(/[-:.]/g,"")+".json",{kind:"shot_point_opportunity_original_v1",generatedAt:at,cutoff,sourceSnapshot:source.path,sourceCommit:source.commit,historyGitHead:historyHead,rows:newRows,modelPromoted:false},true);
 }
 const out={kind:"private_shot_point_opportunity_research_v1",generatedAt:new Date().toISOString(),policyAt,historyCounts:h.counts,zeroStatIntegrity:zeroStatAudit(h.history),
  experimentalOpportunityReplay:opportunityReplay(h.history),historical:c.report,forward:model.grade(accepted,h.history),selectiveFuture:selective.grade(accepted,h.history,{policyFirstCommittedAt:selectivePolicyAt}),newRows:newRows.length,newPP:newRows.filter(r=>r.expectedPPSeconds!==null).length,rejected,providerRequests:0,confidenceApproved:false,lineupsApproved:false,modelPromoted:false};
 save("outputs/health/nhl-zero-stat-reconciliation-private-latest.json",privateExceptions(h.history));
 save("outputs/health/nhl-shot-point-opportunity-latest.json",out);console.log(JSON.stringify({history:h.counts.uniquePlayerGames,pp:h.counts.ppMatched,holdoutMarkets:Object.keys(c.report.byMarketAndPosition),ppThresholds:c.report.ppThresholds,registered:out.forward.registered,decided:out.forward.decided,newRows:newRows.length,providerRequests:0}));
}
if(require.main===module)main();
