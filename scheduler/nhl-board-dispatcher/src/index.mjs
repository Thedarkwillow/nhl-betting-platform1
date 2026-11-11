/**
 * Independent Cloudflare Cron dispatch for the PUBLIC free GitHub runner.
 * Replaces the old private-minutes-exhausted NHL-only dispatcher when deployed
 * under the EXISTING Cloudflare Worker name "nhl-board-dispatcher".
 * Never fetches NHL/NFL props; only checks GitHub Actions and dispatches.
 */
export const REPO="Thedarkwillow/nhl-betting-platform1";
export const WORKFLOW="public-private-nhl-nfl-0900.yml";
export const TIMEZONE="America/Los_Angeles";
export const API="https://api.github.com";
export const API_VERSION="2022-11-28";
export const MAX_EXTERNAL_ATTEMPTS=4;
export const COOLDOWN_MS=10*60*1000;
export const SLOTS=Object.freeze({"6":"06:00","9":"09:00"});
export function pacificClock(at){
 const date=at instanceof Date?at:new Date(at);
 if(!Number.isFinite(date.getTime()))throw Error("Invalid UTC dispatch clock");
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:TIMEZONE,year:"numeric",month:"2-digit",day:"2-digit",
  hour:"2-digit",minute:"2-digit",hourCycle:"h23"
 }).formatToParts(date);
 const val=x=>parts.find(p=>p.type===x)?.value;
 const hour=Number(val("hour")),minute=Number(val("minute"));
 return {day:val("year")+"-"+val("month")+"-"+val("day"),
  hour,minute,slot:SLOTS[String(hour)]||null};
}
export function chooseDispatch(runs,{at,slot,day}={}){
 if(!Array.isArray(runs)||!["06:00","09:00"].includes(slot)||!day)
  throw Error("Cannot audit bounded public GitHub Actions runs");
 const now=new Date(at).getTime();
 if(!Number.isFinite(now))throw Error("Invalid independent dispatch timestamp");
 const recent=runs.filter(x=>{
  const start=Date.parse(x?.created_at);
  return Number.isFinite(start)&&start<=now&&
   pacificClock(start).day===day&&pacificClock(start).slot===slot&&
   (x.event==="schedule"||x.event==="workflow_dispatch");
 });
 const external=recent.filter(x=>x.event==="workflow_dispatch");
 if(external.length>=MAX_EXTERNAL_ATTEMPTS)
  return {decision:"bounded_attempt_limit",externalAttempts:external.length};
 if(recent.some(x=>x.status==="in_progress"))
  return {decision:"already_capturing",externalAttempts:external.length};
 // Do not allow a native 'schedule' that has been queued for 40 minutes
 // to suppress the independent dispatcher for the entire capture hour.
 const active=recent.filter(x=>["queued","pending","requested","waiting"].includes(x.status));
 if(active.some(x=>x.event==="workflow_dispatch"||
    now-Date.parse(x.created_at)<4*60*1000))
  return {decision:"active_recent_dispatch",externalAttempts:external.length};
 const latest=external.reduce((a,x)=>Math.max(a,Date.parse(x.created_at)||0),0);
 if(latest&&now-latest<COOLDOWN_MS)
  return {decision:"retry_cooldown",externalAttempts:external.length};
 // A GitHub workflow conclusion 'success' is NOT verified source archival.
 // Dispatch a bounded next check until private duplicate guard sees a source.
 return {decision:"dispatch",externalAttempts:external.length};
}
export async function dispatchTick({env,now=new Date(),client=fetch}={}){
 const clock=pacificClock(now),slot=clock.slot;
 if(!slot||clock.minute>54)
  return {decision:"outside_original_morning_hour",day:clock.day,
   providerRequests:0,originalBoardClaim:false};
 const token=env?.GITHUB_DISPATCH_TOKEN;
 if(typeof token!=="string"||!token.trim())
  throw Error("Cloudflare GITHUB_DISPATCH_TOKEN is not configured");
 const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json",
  "X-GitHub-Api-Version":API_VERSION,
  "User-Agent":"public-nhl-nfl-independent-morning-cron/1.0"};
 const base=API+"/repos/"+REPO+"/actions/workflows/"+WORKFLOW;
 const utcDay=(now instanceof Date?now:new Date(now)).toISOString().slice(0,10);
 const list=await client(base+"/runs?per_page=100&created="+utcDay,{headers});
 if(!list?.ok)throw Error("GitHub runs audit failed HTTP "+Number(list?.status||0));
 const d=await list.json();
 if(!Array.isArray(d?.workflow_runs)||!Number.isInteger(d.total_count)||
    d.total_count>d.workflow_runs.length)
  throw Error("GitHub run listing truncated; refusing duplicate dispatch");
 const result=chooseDispatch(d.workflow_runs,{at:now,slot,day:clock.day});
 if(result.decision!=="dispatch")
  return {...result,day:clock.day,slot,providerRequests:0};
 const response=await client(base+"/dispatches",{
  method:"POST",headers:{...headers,"Content-Type":"application/json"},
  body:JSON.stringify({ref:"main",inputs:{
   mode:slot==="06:00"?"capture_0600":"capture_0900"}})
 });
 if(response?.status!==204)
  throw Error("Public Github NHL/NFL capture dispatch failed HTTP "+Number(response?.status||0));
 return {decision:"dispatched",day:clock.day,slot,
  previousExternalAttempts:result.externalAttempts,
  providerRequests:0,noPlayerDataInWorker:true,originalCaptureVerified:false};
}
export default {
 async scheduled(_controller,env,ctx){
  ctx.waitUntil((async()=>{
   try{console.log(JSON.stringify(await dispatchTick({env})))}
   catch(e){console.error("Independent NHL/NFL public scheduler: "+e.message);throw e}
  })());
 }
};
