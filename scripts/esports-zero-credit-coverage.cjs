"use strict";
// Both documented coverage endpoints cost zero credits. No props, history, or account actions.
const providers={PrizePicks:{url:"https://prizepicksapi.com/api/v1/coverage",key:"PRIZEPICKSAPI_KEY"},Underdog:{url:"https://underdogapi.com/api/v1/coverage",key:"UNDERDOG_API_KEY"}};
const titles={CS:"CS2",CS2:"CS2",CSGO:"CS2",VAL:"VALORANT",VALORANT:"VALORANT",LOL:"LOL",DOTA:"DOTA2",DOTA2:"DOTA2",COD:"COD",CDL:"COD"};
const num=x=>Number.isSafeInteger(x)&&x>=0?x:null;
const time=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?new Date(Date.parse(x)).toISOString():null;
function summary(doc){
 if(!Array.isArray(doc?.data)||doc.meta?.mode!=="live"||doc.meta?.source_status==="demo"||doc.meta?.is_demo===true)throw Error("nonlive coverage");
 const rows=[];
 for(const r of doc.data){
  const code=r.league||r.sport;if(!titles[code]||r.is_demo===true)continue;
  rows.push({code,title:titles[code],offers:num(r.projection_count??r.offer_count??r.current_offers??r.active_count),marketCount:Array.isArray(r.markets)?r.markets.length:Array.isArray(r.stats)?r.stats.length:null,observedAt:time(r.last_observed_at??r.observed_at),historyAvailable:r.history_available===true,resultsAvailable:r.results_available===true,sourceStatus:["fresh","partial","stale","aging","unavailable","live","recent"].includes(r.status)?r.status:null});
 }
 return rows;
}
function quota(headers){
 const integer=v=>typeof v==="string"&&/^\d{1,12}$/.test(v)?Number(v):null;
 const unit=headers.get("X-Usage-Unit");
 const reset=headers.get("X-Quota-Reset");
 return {remainingCredits:integer(headers.get("X-Credits-Remaining")),remainingRequests:integer(headers.get("X-Requests-Remaining")),usageUnit:["credit","credits","request","requests"].includes(unit)?unit:null,resetAt:reset&&Number.isFinite(Date.parse(reset))?new Date(Date.parse(reset)).toISOString():null};
}
async function check(platform,key,client=fetch){
 if(!key)return {platform,configured:false,status:"missing_key"};
 const p=providers[platform];
 try{
  const r=await client(p.url,{headers:{Authorization:"Bearer "+key,"X-User-Request":"Esports coverage metadata integration check",Accept:"application/json"},redirect:"error",signal:AbortSignal.timeout(25000)});
  const costs=[r.headers.get("X-Credits-Cost"),r.headers.get("X-Credits-Charged")].filter(x=>x!==null);
  const charge=costs.find(x=>x!=="0")??costs[0]??null;
  if(!r.ok)return {platform,configured:true,http:r.status,status:"unavailable"};
  if(charge!==null&&charge!=="0")return {platform,configured:true,status:"unexpected_nonzero_charge",chargedCredits:/^\d+$/.test(charge)?Number(charge):null};
  if(!r.body)throw Error();
  const rd=r.body.getReader(),buf=[];let n=0;
  try{for(;;){const q=await rd.read();if(q.done)break;n+=q.value.length;if(n>2_000_000){await rd.cancel();throw Error();}buf.push(Buffer.from(q.value));}}finally{rd.releaseLock();}
  const checkedAt=new Date().toISOString(),rows=summary(JSON.parse(Buffer.concat(buf).toString("utf8"))).map(x=>({...x,ageMinutes:x.observedAt===null?null:Math.max(0,Math.round((Date.parse(checkedAt)-Date.parse(x.observedAt))/60000)),freshnessVerified:x.observedAt!==null&&Date.parse(x.observedAt)<=Date.parse(checkedAt)&&Date.parse(checkedAt)-Date.parse(x.observedAt)<=900000}));
  return {platform,configured:true,status:"authenticated_independent_metadata",checkedAt,chargedCredits:charge==="0"?0:null,quota:quota(r.headers),rows,originalAppAvailabilityVerified:false};
 }catch{return {platform,configured:true,status:"coverage_contract_unavailable"};}
}
// Planning only: no scheduled paid collection before live contracts and retention are approved.
function capturePlan(result,now){
 const at=Date.parse(now),seen=Date.parse(result?.checkedAt),reset=Date.parse(result?.quota?.resetAt);
 const balance=result?.quota?.remainingCredits;
 const valid=result?.platform==="Underdog"&&result.status==="authenticated_independent_metadata"&&result.chargedCredits===0&&Number.isSafeInteger(balance)&&balance>=0&&Number.isFinite(reset)&&reset>at&&Number.isFinite(seen)&&seen<=at&&at-seen<=60000;
 const days=valid?Math.max(1,Math.ceil((reset-at)/86400000)):null;
 const spendable=valid?Math.max(0,balance-30):0;
 const fresh=valid?result.rows.filter(r=>r.freshnessVerified&&r.offers>0).map(r=>r.title):[];
 return {kind:"esports_credit_budget_plan_v1",verifiedBalance:valid?balance:null,protectedReserve:30,spendable,dailyCreditCap:valid?Math.floor(spendable/days):0,freshLeagues:fresh,actualMeteredCalls:0,automaticPaidCollectionEnabled:false,reason:"Require validated provider contracts, approved storage and frozen identity evidence before activating paid schedule."};
}
async function main(){const results=[];for(const [p,c] of Object.entries(providers))results.push(await check(p,process.env[c.key]));console.log(JSON.stringify({kind:"esports_independent_zero_credit_coverage_v1",results,documentedMeteredEndpointsCalled:0,originalOffersVerified:0,rawRowsPublished:0,budgetPlan:capturePlan(results.find(r=>r.platform==='Underdog'),new Date().toISOString())}));if(results.some(x=>x.status==="unexpected_nonzero_charge"))process.exitCode=1;}
if(require.main===module)main().catch(()=>{console.error("Coverage failed closed");process.exitCode=1});
module.exports={summary,check,quota,capturePlan};
