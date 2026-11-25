"use strict";
// Verify existing private archive and code provenance before a scheduled data workflow.
// No data generation, authorization changes, model approval, or network access.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {pin,pacific}=require("./nba-esports-prepull-candidate-lock.cjs");
const {validLock,slotTime}=require("./morning-private-archive-health.cjs");
const git=(root,args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:15000,maxBuffer:16*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
function scheduledScope(schedule,at){
 const slot={"35 6 * * *":"06:00","35 9 * * *":"09:00"}[schedule];
 if(!slot)return null;
 if(!Number.isFinite(Date.parse(at)))throw Error("invalid clock");
 const day=pacific(at).split(" ")[0];
 if(!slotTime(at,day,slot))throw Error("late morning collection");
 return {day,slot};
}
function check({scope,lock,revision,tree,at}){
 if(!scope||!slotTime(at,scope.day,scope.slot)||!validLock(lock,scope.day,scope.slot))throw Error("missing or invalid pre-pull lock");
 if(revision!==pin||lock.doc.candidateTree!==tree||!/^[a-f0-9]{40}$/.test(tree)||Date.parse(lock.first)>Date.parse(at))throw Error("locked revision or tree mismatch");
 return {kind:"morning_collection_lock_provenance_v1",pacificDate:scope.day,slot:scope.slot,checkedAt:at,revision,tree,lockFirstGitAt:lock.first,lockVerified:true,forecastFreezeVerified:false,sourceAuthenticationVerified:false};
}
function verify(root,candidate,schedule,at){
 const scope=scheduledScope(schedule,at);if(!scope)throw Error("not a morning schedule");
 const rel="research/nba-esports-prepull-locks/"+scope.day+"/"+scope.slot.replace(":","")+".json";
 const file=path.join(root,rel),s=fs.lstatSync(file);
 if(!s.isFile()||s.isSymbolicLink()||s.size>1e6||git(root,["status","--porcelain","--",rel]))throw Error("lock not immutable");
 const commits=git(root,["log","--format=%H","--",rel]).split("\n").filter(Boolean);
 if(commits.length!==1)throw Error("lock not immutable");
 const first=git(root,["show","-s","--format=%cI",commits[0]]);
 const doc=JSON.parse(git(root,["show",commits[0]+":"+rel]));
 if(git(candidate,["status","--porcelain","--untracked-files=all"]))throw Error("candidate checkout changed");
 return check({scope,lock:{first,doc},revision:git(candidate,["rev-parse","HEAD"]),tree:git(candidate,["rev-parse","HEAD^{tree}"]),at});
}
if(require.main===module){try{
 const [rootArg,codeArg,schedule]=process.argv.slice(2),root=fs.realpathSync(rootArg),candidate=fs.realpathSync(codeArg);
 if(root===candidate||!fs.existsSync(path.join(root,".git"))||!fs.existsSync(path.join(candidate,".git")))throw Error("separate checkouts required");
 console.log(JSON.stringify(verify(root,candidate,schedule,new Date().toISOString())));
}catch{console.error("Morning lock provenance failed closed; no slot certification");process.exitCode=1}}
module.exports={scheduledScope,check,verify};
