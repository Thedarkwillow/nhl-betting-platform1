"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const model=require("../src/nhl-shot-block-tail-v2.cjs"),{mergeHistory}=require("../src/nhl-specialist-history-recovery.cjs"),{pacificDay}=require("../src/nhl-standard-forward-diagnostics.cjs");
const root=path.resolve(__dirname,".."),dt=Date.parse,read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")),git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:96*1024*1024}).trim();
const list=(d,re)=>fs.existsSync(path.join(root,d))?fs.readdirSync(path.join(root,d)).filter(n=>re.test(n)).sort():[];
function original(p){try{const a=git(["log","--format=%H","--",p]).split("\n").filter(Boolean);if(a.length!==1)return null;const s=JSON.parse(git(["show",a[0]+":"+p])),at=git(["show","-s","--format=%cI",a[0]]);if(!Number.isFinite(dt(s.generatedAt))||dt(at)<Math.floor(dt(s.generatedAt)/1000)*1000||dt(at)-dt(s.generatedAt)>=900000)return null;return {s,at,commit:a[0],path:p};}catch{return null;}}
function save(p,x,immutable=false){const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(x,null,2)+"\n",immutable?{flag:"wx"}:{});}
function main(){
 const now=new Date().toISOString(),cutoff=pacificDay(now),src="outputs/research/snapshots",dest="outputs/research/shot-block-tail-v2",priorDir="outputs/period-stats/training-source",ppDir="outputs/research/nhl-pp-history";
 const h=mergeHistory(read("outputs/history/players.json"),list(priorDir,/^\d{4}-\d{2}-\d{2}\.json$/).map(n=>read(priorDir+"/"+n)),list(ppDir,/^\d{4}-\d{2}-\d{2}\.json$/).flatMap(n=>{const d=read(ppDir+"/"+n);return d.kind==="official_nhl_exact_game_pp_time_v1"?d.rows:[];}));
 const cur=read("outputs/official-nhl/season-schedules/2026-27.json"),prev=read("outputs/official-nhl/season-schedules/2025-26.json");if(cur.complete!==true||prev.complete!==true)throw Error("complete official schedules required");const schedule={...cur,games:[...prev.games,...cur.games]};
 const attemptRows=list("outputs/period-stats/dates",/^\d{4}-\d{2}-\d{2}\.json$/).flatMap(n=>{const d=read("outputs/period-stats/dates/"+n);return d.complete===true&&Array.isArray(d.shotAttemptRows)?d.shotAttemptRows:[];});
 const c=model.prepare(h.history,schedule,{cutoff,holdout:"2026-07-01",attemptRows}),historyHead=git(["rev-parse","HEAD"]),policy=git(["log","--diff-filter=A","--format=%cI","--","src/nhl-shot-block-tail-v2.cjs"]).split("\n").filter(Boolean),policyAt=policy.length===1?policy[0]:null;
 const accepted=[],seen=new Set(),rejected={},sources=new Map();
 const skip=k=>rejected[k]=(rejected[k]||0)+1;
 const latest=list(src,/^\d{8}T\d{6}Z\.json$/).at(-1),source=latest?original(src+"/"+latest):null;
 for(const n of list(dest,/^\d{8}T\d{9}Z\.json$/)){const f=original(dest+"/"+n);if(!policyAt||!f||dt(f.s.generatedAt)<=dt(policyAt)||f.s.kind!=="shot_block_tail_original_v2"||f.s.modelPromoted!==false){skip("policy_or_archive");continue;}
  const path=f.s.sourceSnapshot;if(typeof path!=="string"||!/^outputs\/research\/snapshots\/\d{8}T\d{6}Z\.json$/.test(path)){skip("source_path");continue;}
  let o=sources.get(path);if(!o){o=original(path);if(o)sources.set(path,o);}
  if(!o||o.commit!==f.s.sourceCommit||dt(o.s.generatedAt)<=dt(policyAt)||dt(o.at)>dt(f.s.generatedAt)||dt(f.s.generatedAt)-dt(o.s.generatedAt)>1800000){skip("source_clock");continue;}
  for(const r of f.s.rows||[]){const k=model.key(r),p=(o.s.rankedProps||[]).filter(x=>model.key(x)===k&&x.lean===r.side&&x.capturedAt===r.capturedAt&&x.gameStartAt===r.gameStartAt);
   if(seen.has(k)||p.length!==1||p[0].probabilities?.higher!==r.originalHigher||!["Standard","Goblin","Demon"].includes(r.tier)||(r.tier!=="Standard"&&r.side!=="Higher")||!["points","shotsOnGoal","blockedShots"].includes(r.market)||!["F","D"].includes(r.role)||r.latestPriorDate>=f.s.cutoff||dt(f.at)>=dt(r.gameStartAt)-900000||dt(r.capturedAt)>dt(o.s.generatedAt)||!["empirical","rate","opportunity","pooled","position"].every(n=>Number.isFinite(r.variants?.[n])&&r.variants[n]>=0&&r.variants[n]<=1)){skip("row_identity_or_clock");continue;}seen.add(k);accepted.push(r);}
 }
 let newRows=[];
 if(policyAt&&source&&dt(source.s.generatedAt)>dt(policyAt)&&dt(source.at)<=dt(now)){
  newRows=model.freeze(source.s,c.c,now).filter(x=>!seen.has(model.key(x)));
  const at=new Date().toISOString();newRows=newRows.filter(x=>dt(x.gameStartAt)>dt(at)+900000&&dt(at)-dt(source.s.generatedAt)<=1800000);
  if(newRows.length)save(dest+"/"+at.replace(/[-:.]/g,"")+".json",{kind:"shot_block_tail_original_v2",generatedAt:at,cutoff,sourceSnapshot:source.path,sourceCommit:source.commit,historyGitHead:historyHead,rows:newRows,modelPromoted:false},true);
 }
 const out={kind:"private_shot_block_tail_research_v2",generatedAt:new Date().toISOString(),policyAt,historyCounts:h.counts,historical:c.report,forward:model.grade(accepted,h.history),newRows:newRows.length,newPP:newRows.filter(r=>r.expectedPPSeconds!==null).length,rejected,providerRequests:0,confidenceApproved:false,lineupsApproved:false,modelPromoted:false};
 save("outputs/health/nhl-shot-block-tail-v2-latest.json",out);console.log(JSON.stringify({history:h.counts.uniquePlayerGames,pp:h.counts.ppMatched,holdoutMarkets:Object.keys(c.report.byMarketAndPosition),ppThresholds:c.report.ppThresholds,registered:out.forward.registered,decided:out.forward.decided,newRows:newRows.length,providerRequests:0}));
}
if(require.main===module)main();
