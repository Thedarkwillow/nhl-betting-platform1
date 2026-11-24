"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {validate}=require("./audit-private-morning-archives.cjs");
const {validOffer,TITLES}=require("../src/esports-research-v1.cjs");
const dt=Date.parse;
function intake(rows,firstGitAt){
 const counts=Object.fromEntries(Object.keys(TITLES).map(t=>[t,{PrizePicks:0,Underdog:0}]));
 const seen=new Set();let excluded=0;
 for(const o of rows){
  const host=(()=>{try{return new URL(o.sourceUrl).hostname}catch{return ""}})();
  const domain=o.platform==="PrizePicks"?"prizepicks.com":"underdogfantasy.com";
  const officialHost=host===domain||host.endsWith("."+domain);
  const id=JSON.stringify([o.platform,o.offerId,o.capturedAt]);
  if(!validOffer(o)||!officialHost||o.originalPlatformOfferVerified!==true||o.authorizedExportVerified!==true||
   !Number.isFinite(dt(firstGitAt))||dt(o.capturedAt)>dt(firstGitAt)+999||dt(firstGitAt)>=dt(o.seriesStartAt)||
   seen.has(id)){excluded++;continue;}
  seen.add(id);counts[o.title][o.platform]++;
 }
 return {counts,excluded,accepted:seen.size,sourceClaimsRequireIndependentReview:true};
}
function morning(root,day){return {kind:"public_native_morning_source_audit_v1",day,slots:["06:00","09:00"].map(s=>validate(root,day,s,{requireGit:true})),paidRequests:0,rawRowsPublished:0};}
function esports(root){
 const d="outputs/esports/authorized-original-offers",dir=path.join(root,d);
 let files=0,accepted=0,excluded=0;const counts=Object.fromEntries(Object.keys(TITLES).map(t=>[t,{PrizePicks:0,Underdog:0}]));
 if(fs.existsSync(dir))for(const name of fs.readdirSync(dir).filter(x=>/^\d{8}T\d{6,9}Z\.json$/.test(x)).sort().slice(-100)){
  const f=d+"/"+name,git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:8*1024*1024}).trim();
  try{
   const commits=git(["log","--format=%H","--",f]).split("\n").filter(Boolean);
   if(commits.length!==1)continue;
   const v=JSON.parse(git(["show",commits[0]+":"+f]));
   if(v.kind!=="authorized_esports_original_offer_export_v1"||!Array.isArray(v.rows))continue;
   const r=intake(v.rows,git(["show","-s","--format=%cI",commits[0]]));
   files++;accepted+=r.accepted;excluded+=r.excluded;
   for(const t of Object.keys(counts))for(const p of Object.keys(counts[t]))counts[t][p]+=r.counts[t][p];
  }catch{continue;}
 }
 return {kind:"public_esports_original_export_intake_audit_v1",files,accepted,excluded,counts,sourceClaimsRequireIndependentReview:true,paidRequests:0,rawRowsPublished:0};
}
if(require.main===module){try{const [cmd,root,day]=process.argv.slice(2);
 if(!root||!["morning","esports"].includes(cmd))throw Error("Bad input");
 console.log(JSON.stringify(cmd==="morning"?morning(root,day):esports(root)));
 }catch{console.error("Archive evidence audit failed closed");process.exitCode=1;}}
module.exports={intake,morning,esports};
