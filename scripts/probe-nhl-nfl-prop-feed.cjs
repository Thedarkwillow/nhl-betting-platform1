"use strict";
/** Public repo has only sanitized board health, NEVER raw lines, ID arrays or app credentials. */
const LEAGUES=[["NHL",8,200],["NFL",9,1000]];
async function main({client=fetch}={}){
 const begin=new Date().toISOString(),out={kind:"public_aggregate_partner_endpoint_health",
  checkedAt:begin,allSourcesComplete:false,sports:[],noRawPropRowsPersisted:true,
  originalAppAvailabilityVerified:false};
 for(const [sport,id,min] of LEAGUES){
  const url="https://partner-api.prizepicks.com/projections?league_id="+id+"&per_page=250&single_stat=true";
  const response=await client(url,{headers:{Accept:"application/json",
   "User-Agent":"Public-no-secret-research-health/1.0"},signal:AbortSignal.timeout(45000)});
  if(!response?.ok)throw Error(sport+" endpoint unavailable: HTTP "+response?.status);
  const x=await response.json();
  if(x.meta?.current_page!==1||x.meta?.total_pages!==1||
   !Array.isArray(x.data)||x.data.length<min||!Array.isArray(x.included))
   throw Error(sport+" incomplete source board; no private archive established");
  out.sports.push({sport,projectionCount:x.data.length,
   responseReportedCompletePagination:true,sourceObservedAt:new Date().toISOString()});
 }
 out.allSourcesComplete=true;
 console.log(JSON.stringify(out));
 if(process.env.GITHUB_STEP_SUMMARY){
  require("node:fs").appendFileSync(process.env.GITHUB_STEP_SUMMARY,
   "\nNHL/NFL public probe (counts only): "+out.sports.map(s=>s.sport+" "+s.projectionCount).join(", ")+
   ". No raw provider lines saved; not a private archive or validated original-app offer.\n");
 }
 return out;
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={main};
