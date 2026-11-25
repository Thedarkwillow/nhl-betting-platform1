"use strict";
// Bind original ranking bytes to the actual scheduled execution of the locked code.
// This is a provenance receipt, not a calibration or first-party offer certification.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{execFileSync}=require("node:child_process");
const {verify}=require("./morning-collection-lock-check.cjs");
const {slotTime}=require("./morning-private-archive-health.cjs");
const git=(root,args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",stdio:["ignore","pipe","pipe"],timeout:30000,maxBuffer:16*1024*1024}).trim();
const sha=raw=>crypto.createHash("sha256").update(raw).digest("hex");
function validateRanking(doc,scope,observedAt){
 return doc?.kind==="nba_private_research_rankings_v1"&&Array.isArray(doc.rows)&&doc.calibrated===false&&doc.prospectivelyValidated===false&&doc.actualWagersPlaced===0&&doc.highConfidenceApproved===0&&slotTime(doc.generatedAt,scope.day,scope.slot)&&slotTime(doc.boardCapturedAt,scope.day,scope.slot)&&Date.parse(doc.boardCapturedAt)<=Date.parse(doc.generatedAt)&&Date.parse(doc.generatedAt)<=Date.parse(observedAt)&&doc.rows.every(r=>r.researchOnly===true&&r.sourceObservedAt===doc.boardCapturedAt);
}
function create(root,candidate,schedule,observedAt){
 const proof=verify(root,candidate,schedule,observedAt),scope={day:proof.pacificDate,slot:proof.slot};
 const files=git(root,["ls-files","--others","--exclude-standard","--","outputs/nba/rankings"]).split("\n").filter(Boolean);
 // Some private repositories deliberately gitignore outputs. Find new files, but
 // never write a receipt for a path already present in Git.
 const dir=path.join(root,"outputs/nba/rankings");
 if(fs.existsSync(dir))for(const name of fs.readdirSync(dir))if(/^\d{8}T\d{9}Z\.json$/.test(name)){const rel="outputs/nba/rankings/"+name;if(!files.includes(rel)&&!git(root,["ls-files","--",rel]))files.push(rel);}
 let written=0;
 for(const rel of files){
  if(!/^outputs\/nba\/rankings\/\d{8}T\d{9}Z\.json$/.test(rel))throw Error("unexpected ranking path");
  const p=path.join(root,rel),st=fs.lstatSync(p);if(st.isSymbolicLink()||!st.isFile()||st.size>8e6)throw Error("unsafe ranking file");
  const raw=fs.readFileSync(p),doc=JSON.parse(raw);if(!validateRanking(doc,scope,observedAt))throw Error("ranking scope");
  const receipt={kind:"nba_locked_ranking_receipt_v1",rankingPath:rel,rankingSha256:sha(raw),generatedAt:observedAt,pacificDate:scope.day,slot:scope.slot,modelRevision:proof.revision,candidateTree:proof.tree,lockFirstGitAt:proof.lockFirstGitAt,originalAppAvailabilityVerified:false,calibrationApproved:false,forecastFreezeVerified:false};
  const dest=path.join(root,"outputs/nba/ranking-provenance");fs.mkdirSync(dest,{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(dest,path.basename(rel)),JSON.stringify(receipt)+"\n",{flag:"wx",mode:0o600});written++;
 }
 return {kind:"nba_locked_ranking_receipts_written_v1",receipts:written,slot:scope.slot,paidRequests:0,rawRowsPublished:0,forecastFreezeVerified:false};
}
if(require.main===module){try{console.log(JSON.stringify(create(fs.realpathSync(process.argv[2]),fs.realpathSync(process.argv[3]),process.argv[4],new Date().toISOString())));}catch{console.error("Locked ranking receipt failed closed");process.exitCode=1;}}
module.exports={validateRanking,create};
