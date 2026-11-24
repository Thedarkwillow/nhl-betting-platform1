"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const lab=require("../src/nhl-market-distribution-availability.cjs"),{review}=require("../src/nhl-matched-market-model-review.cjs"),{mergeHistory}=require("../src/nhl-specialist-history-recovery.cjs"),{pacificDay}=require("../src/nhl-standard-forward-diagnostics.cjs");
const root=path.resolve(__dirname,".."),dt=Date.parse,read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")),git=a=>execFileSync("git",a,{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:96*1024*1024}).trim(),finite=Number.isFinite,list=(d,re)=>fs.existsSync(path.join(root,d))?fs.readdirSync(path.join(root,d)).filter(n=>re.test(n)).sort():[];
function original(p){try{const cs=git(["log","--format=%H","--",p]).split("\n").filter(Boolean);if(cs.length!==1)return null;const s=JSON.parse(git(["show",cs[0]+":"+p])),at=git(["show","-s","--format=%cI",cs[0]]);if(!finite(dt(s.generatedAt))||dt(at)<Math.floor(dt(s.generatedAt)/1000)*1000||dt(at)-dt(s.generatedAt)>=900000)return null;return {s,at,commit:cs[0],p};}catch{return null;}}
function save(p,d,immutable=false){const f=path.join(root,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d,null,2)+"\n",immutable?{flag:"wx"}:{});}
function main(){
 const now=new Date().toISOString(),cutoff=pacificDay(now),src="outputs/research/snapshots",dest="outputs/research/market-distributions-v1",priorDir="outputs/period-stats/training-source",ppDir="outputs/research/nhl-pp-history";
 const h=mergeHistory(read("outputs/history/players.json"),list(priorDir,/^\d{4}-\d{2}-\d{2}\.json$/).map(n=>read(priorDir+"/"+n)),list(ppDir,/^\d{4}-\d{2}-\d{2}\.json$/).flatMap(n=>{const d=read(ppDir+"/"+n);return d.kind==="official_nhl_exact_game_pp_time_v1"?d.rows:[];}));
 const cur=read("outputs/official-nhl/season-schedules/2026-27.json"),prev=read("outputs/official-nhl/season-schedules/2025-26.json");if(!cur.complete||!prev.complete)throw Error("complete schedules required");const s={...cur,games:[...prev.games,...cur.games]},c=lab.prepare(h.history,s,{cutoff}),head=git(["rev-parse","HEAD"]);
 const policy=git(["log","--diff-filter=A","--format=%cI","--","src/nhl-market-distribution-availability.cjs"]).split("\n").filter(Boolean),policyAt=policy.length===1?policy[0]:null;
 const n=list(src,/^\d{8}T\d{6}Z\.json$/).at(-1),source=n?original(src+"/"+n):null,accepted=[],seen=new Set(),sources=new Map(),rejected={};const skip=k=>rejected[k]=(rejected[k]||0)+1;
 for(const name of list(dest,/^\d{8}T\d{9}Z\.json$/)){const f=original(dest+"/"+name);if(!policyAt||!f||dt(f.s.generatedAt)<=dt(policyAt)||f.s.kind!=="market_distribution_original_v1"||f.s.modelPromoted!==false){skip("policy_or_archive");continue;}
  const p=f.s.source;if(typeof p!=="string"||!/^outputs\/research\/snapshots\/\d{8}T\d{6}Z\.json$/.test(p)){skip("source_path");continue;}let o=sources.get(p);if(!o){o=original(p);if(o)sources.set(p,o);}if(!o||o.commit!==f.s.sourceCommit||dt(o.s.generatedAt)<=dt(policyAt)||dt(o.at)>dt(f.s.generatedAt)||dt(f.s.generatedAt)-dt(o.s.generatedAt)>1800000){skip("source_clock");continue;}
  for(const r of f.s.rows||[]){const k=lab.key(r),raw=(o.s.rankedProps||[]).filter(x=>lab.key(x)===k&&x.lean===r.side&&x.capturedAt===r.capturedAt&&x.gameStartAt===r.gameStartAt);if(seen.has(k)||raw.length!==1||raw[0].probabilities?.higher!==r.champion||!r.availability?.status||r.tier!=="Standard"||r.line%1!==.5||!Object.keys(lab.MARKETS).includes(r.market)||dt(f.at)>=dt(r.gameStartAt)-900000||dt(r.capturedAt)>dt(o.s.generatedAt)||!r.variants||!Object.values(r.variants).every(p=>finite(p)&&p>=0&&p<=1)){skip("row_provenance");continue;}seen.add(k);accepted.push({...r,variants:{...r.variants}});}
 }
 // Only same-source rows from independent fixed policies frozen before start.
 const byKey=new Map(accepted.map(r=>[lab.key(r),r]));
 const proofDir="outputs/research/standard-proof-v1",oppDir="outputs/research/shot-point-opportunity-v1";
 // Existing reports have independently audited clocks; avoid treating a
 // reconstructed variant as original. Strictly match capture, start and model.
 for(const [d,prefix] of [[proofDir,"proof"],[oppDir,"opportunity"]])for(const name of list(d,/^\d{8}T\d{9}Z\.json$/)){const f=original(d+"/"+name);if(!f||f.s.modelPromoted!==false)continue;
  const p=f.s.sourceSnapshot;if(typeof p!=="string"||!/^outputs\/research\/snapshots\/\d{8}T\d{6}Z\.json$/.test(p))continue;
  let o=sources.get(p);if(!o){o=original(p);if(o)sources.set(p,o);}if(!o||o.commit!==f.s.sourceCommit||dt(o.at)>dt(f.s.generatedAt)||dt(f.s.generatedAt)-dt(o.s.generatedAt)>1800000)continue;
  for(const r of f.s.rows||[]){const z=byKey.get(lab.key(r));if(!z||r.capturedAt!==z.capturedAt||r.gameStartAt!==z.gameStartAt||dt(f.at)>=dt(z.gameStartAt)-900000||!z.variants)continue;
   if(prefix==="proof"&&r.rawHigher===z.champion&&finite(r.challengerHigher))z.variants.proofBlend??=r.challengerHigher;
   if(prefix==="opportunity"&&r.originalHigher===z.champion)for(const [k,p] of Object.entries(r.variants||{}))if(finite(p)&&p>=0&&p<=1)z.variants["opportunity_"+k]??=p;
  }
 }
 let approved=null,approvedCommit=null;try{const p="outputs/approved-nhl-sources/latest.json",id=git(["log","-1","--format=%H","--",p]),at=git(["show","-s","--format=%cI",id]),x=JSON.parse(git(["show",id+":"+p]));if(dt(at)<=dt(now)&&dt(x.generatedAt)<=dt(now)&&dt(at)>=Math.floor(dt(x.generatedAt)/1000)*1000){approved=x;approvedCommit=id;}}catch{}
 const inventory={};if(source&&dt(source.at)<=dt(now)&&dt(now)-dt(source.s.generatedAt)<=1800000){const seenOffer=new Set();for(const p of source.s.rankedProps||[]){if(p.tier!=="Standard"||!finite(dt(p.gameStartAt))||dt(p.gameStartAt)<=dt(now)+900000||seenOffer.has(lab.key(p)))continue;seenOffer.add(lab.key(p));const q=lab.availability(p,approved,now),k=q.status;inventory[k]=(inventory[k]||0)+1;}}
 let newRows=[];if(policyAt&&source&&dt(source.s.generatedAt)>dt(policyAt)&&dt(source.at)<=dt(now)){
  newRows=lab.freeze(source.s,c,approved,now).filter(r=>!seen.has(lab.key(r)));const at=new Date().toISOString();newRows=newRows.filter(r=>dt(r.gameStartAt)>dt(at)+900000&&dt(at)-dt(source.s.generatedAt)<=1800000);
  if(newRows.length)save(dest+"/"+at.replace(/[-:.]/g,"")+".json",{kind:"market_distribution_original_v1",generatedAt:at,source:source.p,sourceCommit:source.commit,historyHead:head,approvedSourceCommit:approvedCommit,rows:newRows,modelPromoted:false},true);
 }
 const out={kind:"private_nhl_distribution_and_availability_review_v1",generatedAt:new Date().toISOString(),policyAt,history:h.counts,historyResearch:c.report,availabilityInventory:inventory,availabilitySourceCommit:approvedCommit,prospective:lab.grade(accepted,h.history),sameRowReview:review(accepted,h.history),newRows:newRows.length,rejected,limitations:["Specialty periods and combos use dedicated models; integer pushes and fantasy/TOI settlement not represented in exact half-point count trial","No authenticated app availability or official club starter inferred from reporter evidence","Historical distributions evaluated on synthetic thresholds; no market promotion"],modelPromoted:false,confidenceApproved:false,paidRequests:0};
 save("outputs/health/nhl-distribution-availability-review-latest.json",out);console.log(JSON.stringify({history:h.counts.uniquePlayerGames,markets:Object.keys(c.report.holdout),newRows:newRows.length,decided:out.prospective.decided,paidRequests:0,modelPromoted:false}));
}
if(require.main===module)main();
