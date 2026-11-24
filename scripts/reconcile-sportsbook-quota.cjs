"use strict";
// Read-only provider reconciliation. GET /events is documented zero quota.
// Never access an odds endpoint; never retry; never release a reservation.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const root=path.resolve(__dirname,".."),dir=path.join(root,"outputs/sportsbooks/bounded-live"),read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
const number=(r,name)=>{const s=r.headers.get(name);return s!==null&&/^\d+$/.test(s)?Number(s):null;};
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
function reconcile({prior,marker,remaining,cost,used,at,archiveFound}){
 const delta=Number.isInteger(remaining)&&Number.isInteger(prior?.remainingCredits)?prior.remainingCredits-remaining:null;
 return {kind:"private_sportsbook_quota_reconciliation_v1",generatedAt:at,pacificDate:marker?.pacificDate??null,priorConfirmedCredits:prior?.quotaCreditsReported??null,priorBalance:prior?.remainingCredits??null,nhlReservedCredits:marker?.reservedCredits??null,currentRemaining:remaining,providerUsedSinceReset:used,freeProbeCost:cost,balanceDeltaSincePrior:delta,nhlQuoteArchiveFound:!!archiveFound,nhlActualUsageVerified:!!archiveFound,nhlActualUsage:archiveFound?.quotaCreditsReported??null,attribution:archiveFound?"archive_receipt":delta===null?"balance_unverified":delta===0?"no_net_balance_decrease_not_request_receipt":delta>=0&&delta<=Number(marker?.reservedCredits)?"consistent_with_reserved_batch_not_unique_attribution":"balance_change_not_uniquely_attributable",additionalPaidRequestsAllowed:0,reservationReleased:false};
}
async function main(){
 const at=new Date().toISOString(),date=today(),markerPath=path.join(dir,"reservation-"+date+"-NHL.json"),marker=fs.existsSync(markerPath)?read(markerPath):null;
 const archives=fs.readdirSync(dir).filter(n=>/^\d{8}T\d{9}Z\.json$/.test(n)).map(n=>read(path.join(dir,n)));
 const prior=archives.filter(a=>a.pacificDate===date&&a.results?.NFL?.eventsQueried>0&&a.results?.NHL==null).sort((x,y)=>Date.parse(y.generatedAt)-Date.parse(x.generatedAt))[0];
 const found=archives.find(a=>a.pacificDate===date&&a.results?.NHL?.eventsQueried>0&&Date.parse(a.generatedAt)>=Date.parse(marker?.createdAt));
 let remaining=null,cost=null,used=null,providerStatus="missing_key",eventCount=null;
 if(process.env.ODDS_API_KEY){
  try{
   const u=new URL("https://api.the-odds-api.com/v4/sports/icehockey_nhl/events");u.searchParams.set("apiKey",process.env.ODDS_API_KEY);
   const r=await fetch(u,{redirect:"error",signal:AbortSignal.timeout(20000)});remaining=number(r,"x-requests-remaining");cost=number(r,"x-requests-last");used=number(r,"x-requests-used");providerStatus=r.ok&&cost===0&&remaining!==null?"free_balance_verified":"http_or_quota_header_unverified";
   if(r.ok&&cost===0){const events=await r.json();eventCount=Array.isArray(events)?events.length:null;}
  }catch{providerStatus="network_error";}
 }
 const result={...reconcile({prior,marker,remaining,cost,used,at,archiveFound:found?{quotaCreditsReported:found.quotaCreditsReported}:null}),providerStatus,eventCount,paidOddsRequests:0};
 // List public runner metadata, not logs or environment. This permits exact
 // run IDs to be investigated without saving secret-bearing log content.
 if(process.env.GH_TOKEN&&process.env.GITHUB_REPOSITORY){
  try{
   const base="https://api.github.com/repos/"+process.env.GITHUB_REPOSITORY+"/actions/workflows/private-bounded-sportsbook-quotes.yml/runs?per_page=15";
   const r=await fetch(base,{headers:{Authorization:"Bearer "+process.env.GH_TOKEN,Accept:"application/vnd.github+json"},redirect:"error",signal:AbortSignal.timeout(15000)});
   const d=await r.json();result.workflows=(d.workflow_runs||[]).map(x=>({id:x.id,headSha:x.head_sha,event:x.event,status:x.status,conclusion:x.conclusion,createdAt:x.created_at,startedAt:x.run_started_at,updatedAt:x.updated_at}));
  }catch{result.workflowMetadataUnavailable=true;}
 }
 const name="quota-reconciliation-"+at.replace(/[-:.]/g,"")+".json";
 fs.writeFileSync(path.join(dir,name),JSON.stringify(result,null,2)+"\n",{flag:"wx"});
 fs.writeFileSync(path.join(dir,"quota-reconciliation-latest.json"),JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({providerStatus,remaining,cost,paidOddsRequests:0,archiveFound:!!found}));
}
if(require.main===module)main().catch(()=>{console.error("Quota reconciliation failed closed");process.exitCode=1;});
module.exports={reconcile};
