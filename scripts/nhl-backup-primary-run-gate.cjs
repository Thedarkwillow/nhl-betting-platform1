"use strict";
/** GitHub metadata only, never a paid provider request. */
const {primaryFailedBeforeBackup}=require("../src/nhl-backup-primary-run-gate.cjs");
const API="https://api.github.com/repos/Thedarkwillow/nhl-betting-platform/actions/workflows/one-shot-nhl-prospective-freeze-20261103.yml/runs?event=schedule&per_page=40";
async function status({token=process.env.GITHUB_TOKEN,client=fetch,
 now=new Date().toISOString()}={}){
 if(!token)throw Error("Missing read-only GitHub Actions token");
 const r=await client(API,{method:"GET",
  headers:{Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
   "X-GitHub-Api-Version":"2022-11-28",
   "User-Agent":"nhl-private-backup-primary-status"},
  signal:AbortSignal.timeout(18000)});
 if(!r?.ok)throw Error("GitHub primary Action status HTTP "+Number(r?.status||0));
 const data=await r.json();
 if(!Array.isArray(data?.workflow_runs))
  throw Error("GitHub primary Action metadata schema unavailable");
 return primaryFailedBeforeBackup(data.workflow_runs,now);
}
if(require.main===module)status().then(s=>{
 console.log(JSON.stringify(s));
 if(!s.eligible)process.exitCode=1;
}).catch(e=>{
 console.error("::error::NHL primary run safety gate unavailable: "+e.message);
 process.exitCode=2;
});
module.exports={status,API};
