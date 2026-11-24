"use strict";
// One independent provider observation per Pacific day, only after primary NHL
// budget exhausted. No primary API key, no retries, no automatic paid upgrade.
const fs=require("node:fs"),{execFileSync}=require("node:child_process");
const {fetchOne,extractQuotes}=require("./collect-sportsgameodds-nhl.cjs");
const {study}=require("../src/bounded-sportsbook-consensus.cjs");
const {querySportsGameOdds}=require("./check-provider-api-quotas.cjs");
function accountAllows(q,eventLimit=2){
 if(!Number.isInteger(eventLimit)||eventLimit<1||eventLimit>6)return false;
 if(q?.status!=="ok"||q.isActive!==true||!q.limits||!Object.keys(q.limits).length)return false;
 for(const x of Object.values(q.limits)){
  if(x.maxRequests!=="unlimited"&&(!Number.isFinite(x.maxRequests)||!Number.isFinite(x.currentRequests)||x.maxRequests-x.currentRequests<1))return false;
  if(x.maxObjects!=="unlimited"&&(!Number.isFinite(x.maxObjects)||!Number.isFinite(x.currentObjects)||x.maxObjects-x.currentObjects<eventLimit))return false;
 }
 return true;
}
const dir="outputs/sportsbooks/independent-nhl",primary="outputs/sportsbooks/bounded-live";
const dt=Date.parse,books=["draftkings","fanduel","betmgm","caesars"];
const day=t=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
const stamp=t=>new Date(t).toISOString().replace(/[-:.]/g,"");
function eligible({legacy,legacyMarker,repeat,primaryFresh,alreadyAttempted,boardFresh,keyPresent}){
 return Boolean(keyPresent&&boardFresh&&!primaryFresh&&!alreadyAttempted&&(legacy||legacyMarker||repeat));
}
function normalize(body,at,eventLimit=2){
 if(!Number.isInteger(eventLimit)||eventLimit<1||eventLimit>6)throw Error('Invalid bounded event limit');
 if(body?.success!==true||!Array.isArray(body.data)||body.data.length>eventLimit)throw Error("provider_schema");
 const rows=[];
 for(const e of body.data){
  const q=extractQuotes(e,at,books).quotes;
  for(const r of q){
   if(!(dt(r.marketUpdatedAt)<=dt(at)&&dt(at)-dt(r.marketUpdatedAt)<=1800000&&dt(r.commenceTime)>dt(at)+900000))continue;
   rows.push({...r,sport:"NHL",period:"full_game",book:r.bookKey});
  }
 }
 return {kind:"independent_nhl_sportsbook_capture_v1",status:rows.length?"fresh_independent_archive":"no_fresh_quotes",generatedAt:at,source:"SportsGameOdds",researchOnly:true,primaryCredits:0,partialPagination:Boolean(body.nextCursor),eventsRequestedLimit:eventLimit,eventsReturned:body.data.length,rows};
}
function mainBoard(now){
 const root="outputs/manual-board-captures/"+day(now);
 if(!fs.existsSync(root))return false;
 for(const n of fs.readdirSync(root).filter(n=>/^\d{8}T\d{6}Z$/.test(n)).sort().reverse().slice(0,5)){
  const p=root+"/"+n+"/manifest.json";
  try{const ids=git(["log","--format=%H","HEAD","--",p]).split("\n");if(ids.length!==1||!ids[0])continue;
   const d=JSON.parse(git(["show",ids[0]+":"+p])),t=dt(d.captureFinishedUTC),c=dt(git(["show","-s","--format=%cI",ids[0]]));
   if(d.source==="partner-api.prizepicks.com"&&d.completePagination===true&&d.sports?.some(x=>x.sport==="NHL"&&x.rawCount>0)&&t<=now&&now-t<1200000&&Math.floor(t/1000)*1000<=c&&c<=now)return true;
  }catch{}
 }
 return false;
}
function freshPrimary(now){
 if(!fs.existsSync(primary))return false;
 for(const n of fs.readdirSync(primary).filter(n=>/^\d{8}T\d{9}Z\.json$/.test(n)).sort().slice(-8)){
  try{const p=primary+"/"+n,c=git(["log","--format=%H","HEAD","--",p]).split("\n");if(c.length!==1||!c[0])continue;
   const a=JSON.parse(git(["show",c[0]+":"+p]));
   if(study(a,{now:new Date(now).toISOString()}).groups.some(x=>x.sport==="NHL"))return true;
  }catch{}
 }
 return false;
}
function git(args){return execFileSync("git",args,{encoding:"utf8",timeout:30000,maxBuffer:16*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();}
async function main(){
 const now=Date.now(),date=day(now),marker=dir+"/reservation-"+date+".json",key=process.env.SPORTSGAMEODDS_API_KEY;
 const flags={legacy:fs.existsSync(primary+"/budget-"+date+".json"),legacyMarker:fs.existsSync(primary+"/reservation-"+date+"-NHL.json"),repeat:fs.existsSync(primary+"/reservation-"+date+"-NHL-repeat.json"),primaryFresh:freshPrimary(now),alreadyAttempted:fs.existsSync(marker),boardFresh:mainBoard(now),keyPresent:!!key};
 if(!eligible(flags)){console.log(JSON.stringify({status:"fallback_not_eligible",...flags,primaryCredits:0}));return;}
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(marker,JSON.stringify({kind:"independent_nhl_daily_attempt_v1",date,createdAt:new Date().toISOString(),requestCap:1,accountUsageCheckCap:1,primaryCredits:0})+"\n",{flag:"wx"});
 git(["config","user.name","github-actions[bot]"]);git(["config","user.email","41898282+github-actions[bot]@users.noreply.github.com"]);
 git(["add","-f",marker]);git(["commit","-qm","data: reserve independent NHL fallback attempt"]);
 // A competing reservation or stale checkout fails without a provider call.
 git(["push","-q","origin","HEAD:main"]);
 if(day(Date.now())!==date||!mainBoard(Date.now()))return;
 let archive;
 try{const q=await querySportsGameOdds(key,(url,opts)=>fetch(url,{...opts,redirect:"error"}));
  if(!accountAllows(q))archive={kind:"independent_nhl_sportsbook_capture_v1",status:"account_allowance_unverified",generatedAt:new Date().toISOString(),source:"SportsGameOdds",primaryCredits:0,rows:[],researchOnly:true};
  else {const limit=accountAllows(q,6)?6:accountAllows(q,4)?4:2;
   const t=Date.now(),body=await fetchOne(key,fetch,{limit,startsAfter:new Date(t+900000).toISOString(),startsBefore:new Date(t+36*3600000).toISOString()});
   archive=normalize(body,new Date().toISOString(),limit);
  }
 }
 catch(e){archive={kind:"independent_nhl_sportsbook_capture_v1",status:"provider_unavailable",generatedAt:new Date().toISOString(),source:"SportsGameOdds",primaryCredits:0,rows:[],researchOnly:true};}
 const p=dir+"/"+stamp(archive.generatedAt)+".json";
 fs.writeFileSync(p,JSON.stringify(archive)+"\n",{flag:"wx"});
 console.log(JSON.stringify({status:archive.status,rows:archive.rows.length,primaryCredits:0}));
}
if(require.main===module)main().catch(()=>{console.error("Independent NHL fallback failed closed.");process.exitCode=1;});
module.exports={eligible,normalize,day,main,accountAllows};
