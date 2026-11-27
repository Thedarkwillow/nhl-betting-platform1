'use strict';
// One date, one approved NBA request after authenticated coverage. Counts-only evidence.
const {check,quota}=require('./esports-zero-credit-coverage.cjs');
const {pacific}=require('./pacific-morning-capture-gate.cjs');
const {prizepicksCompact}=require('../src/independent-provider-export-v1.cjs');
const {exactOffsetTime}=require('./pickfinder-quote-features.cjs');
const DAY='2026-11-27',RESERVE=100;
const inWindow=t=>{const p=pacific(t);return p.day===DAY&&p.hour===6;};
const inTimeToStart=t=>inWindow(t)&&pacific(t).minute<=55;
const parseClock=t=>typeof t==='string'?exactOffsetTime(t):NaN;
async function capture({key,clock=()=>new Date().toISOString(),client=fetch,coverage=check}={}){
 const first=clock();
 const receipt={kind:'prizepicks_api_nba_morning_receipt_v1',requestedPacificDay:DAY,requestedPacificSlot:'06:00',startedAt:first,
  coverageAttempts:0,projectionAttempts:0,providerSourceDigest:null,appOfferVerified:false,modelPromoted:false,rawRowsPublished:0,rawRowsPersisted:0};
 const result=(status,details={})=>({...receipt,...details,status,finishedAt:clock()});
 if(!inTimeToStart(first))return result('outside_approved_window');
 if(!key)return result('missing_api_secret');
 receipt.coverageAttempts=1;
 const c=await coverage('PrizePicks',key,client),okAt=clock(),q=c?.quota;
 if(c?.status!=='authenticated_independent_metadata'||c.chargedCredits!==0||q?.usageUnit!=='requests'||
    !Number.isSafeInteger(q.remainingRequests)||q.remainingRequests<=RESERVE||!(Date.parse(q.resetAt)>Date.parse(okAt)))return result('coverage_or_quota_not_verified');
 const nba=c.traditionalSportRows?.filter(r=>r.code==='NBA')??[];
 if(nba.length!==1||!nba[0].freshnessVerified||!(nba[0].offers>0))return result('nba_live_coverage_missing');
 if(!inTimeToStart(okAt))return result('window_closed_after_coverage');
 const u=new URL('https://prizepicksapi.com/api/v1/projections');
 u.search=new URLSearchParams({league:'NBA',view:'compact',limit:'1000',start_after:new Date(Date.parse(okAt)+900001).toISOString()});
 receipt.projectionAttempts=1;
 try{
  const response=await client(u.toString(),{headers:{Authorization:'Bearer '+key,Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok)return result('projection_http_failure',{httpStatus:response.status});
  const usage=quota(response.headers),costs=['X-Credits-Cost','X-Credits-Charged'].map(k=>response.headers.get(k)).filter(v=>v!==null);
  if(usage.usageUnit!=='requests'||!Number.isSafeInteger(usage.remainingRequests)||usage.remainingRequests<RESERVE||
     ![q.remainingRequests,q.remainingRequests-1].includes(usage.remainingRequests)||costs.some(x=>x!=='0'))
   return result('projection_quota_unverified');
  const counted={requestQuotaUsed:q.remainingRequests-usage.remainingRequests,creditChargeVerifiedZero:costs.length>0};
  const reader=response.body.getReader(),parts=[];let bytes=0;
  try{for(;;){
   const chunk=await reader.read();if(chunk.done)break;
   bytes+=chunk.value.length;if(bytes>8_000_000){await reader.cancel();return result('projection_payload_limit',counted);}
   parts.push(Buffer.from(chunk.value));
  }}finally{reader.releaseLock();}
  const fetched=clock(),body=JSON.parse(Buffer.concat(parts).toString('utf8')),source=parseClock(body?.meta?.observed_at);
  if(!inWindow(fetched))return result('capture_finished_after_window',counted);
  if(!Number.isFinite(source)||!inWindow(new Date(source))||source>Date.parse(fetched)||Date.parse(fetched)-source>900000)return result('provider_observation_outside_window',counted);
  const n=prizepicksCompact(body,fetched),rows=n.rows.filter(x=>x.sport==='NBA'&&inWindow(x.observedAt));
  const marketCounts={};for(const p of rows){const key=/^[A-Za-z0-9 +._()-]{1,43}$/.test(p.stat)?p.stat:'other';marketCounts[key]=(marketCounts[key]||0)+1;}
  const details={...counted,received:body.data.length,acceptedInWindow:rows.length,marketCounts,providerObservesAt:new Date(source).toISOString(),
   payloadReceivedAt:fetched,providerSourceDigest:n.sourceDocumentSha256,providerPageComplete:n.completePage,
   completeUpcomingNbaPage:n.completePage&&rows.length>0&&rows.length===body.data.length};
  return result(rows.length?'captured_in_0600_window':'no_qualified_nba_rows_in_window',details);
 }catch{return result('projection_transport_or_schema_failure');}
}
module.exports={capture};
if(require.main===module){
 const fs=require('node:fs');
 if(process.env.GITHUB_EVENT_NAME!=='push'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_RUN_ATTEMPT!=='1'||process.env.AUTHORIZED_NBA_WINDOW!=='2026-11-27T06'){
  console.error('One-time authorization does not apply');process.exitCode=1;
 }else capture({key:process.env.PRIZEPICKSAPI_KEY}).then(x=>{
  fs.writeFileSync(process.argv[2],JSON.stringify(x,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(x));if(x.status!=='captured_in_0600_window')process.exitCode=1;
 }).catch(()=>{console.error('NBA morning capture failed closed without retry');process.exitCode=1;});
}
