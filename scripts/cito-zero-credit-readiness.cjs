"use strict";
const BASE="https://api.citoapi.com/api/v1";
const SPORTS=["cs2","valorant","lol","dota2","cod"];
const TIERS=new Set(["FREE","STARTER","PRO","BUSINESS","ENTERPRISE","BASIC","DEV","SCALE","ONE_GAME"]);
const count=x=>Number.isSafeInteger(x)&&x>=0?x:null;
function healthSummary(d){
 const valid=d?.status==="healthy"&&d?.key?.valid===true;
 const tier=valid&&TIERS.has(d.key.tier)?d.key.tier:null;
 const monthly=d?.rateLimit?.monthly||{};
 return {keyValid:valid,tier,monthlyLimit:valid?count(monthly.limit):null,monthlyUsed:valid?count(monthly.used):null,monthlyRemaining:valid?count(monthly.remaining):null};
}
async function bounded(url,headers,client=fetch){
 const r=await client(url,{headers,redirect:"error",signal:AbortSignal.timeout(25000)});
 if(!r.ok)return {http:r.status,text:null};
 if(!r.body)throw Error("empty response");
 const reader=r.body.getReader(),chunks=[];let bytes=0;
 try{for(;;){const x=await reader.read();if(x.done)break;bytes+=x.value.length;if(bytes>2_000_000){await reader.cancel();throw Error("bound");}chunks.push(Buffer.from(x.value));}}finally{reader.releaseLock();}
 return {http:r.status,text:Buffer.concat(chunks).toString("utf8")};
}
function schema(text){
 // CSV header only; never print rows. Reject non-CSV/error bodies.
 const h=text.split(/\r?\n/,1)[0].replace(/^\uFEFF/,"");
 const cols=h.split(",").map(s=>s.replace(/^"|"$/g,""));
 if(cols.length<2||cols.length>250||!cols.every(x=>/^[A-Za-z_][A-Za-z0-9_ ]{0,79}$/.test(x)))throw Error("invalid header");
 return cols;
}
async function run(key,client=fetch){
 let health={configured:!!key,keyValid:false,tier:null,monthlyLimit:null,monthlyUsed:null,monthlyRemaining:null};
 if(key)try{const r=await bounded(BASE+"/health",{"x-api-key":key,Accept:"application/json"},client);
  health={...health,http:r.http,...(r.text?healthSummary(JSON.parse(r.text)):{})};
 }catch{health.status="health_unavailable";}
 const previews=[];
 for(const sport of SPORTS){
  for(const dataset of ["matches","players"]){
   try{const r=await bounded(BASE+"/exports/sample/"+sport+"/"+dataset+".csv",{Accept:"text/csv"},client);
    previews.push({sport,dataset,http:r.http,columns:r.text?schema(r.text):null,trainingEligible:false});
   }catch{previews.push({sport,dataset,status:"preview_unavailable",trainingEligible:false});}
  }
 }
 return {kind:"cito_zero_credit_readiness_v1",health,previews,documentedMeteredDataCalls:0,rawRowsPublished:0,actualPropLines:0,modelPromoted:false};
}
function credentialReady(r){return r?.health?.configured===true&&r.health.keyValid===true;}
if(require.main===module)run(process.env.CITO_API_KEY||process.env.CITO_KEY||process.env.CITO).then(r=>{console.log(JSON.stringify(r));if(process.argv.includes("--require-key")&&!credentialReady(r)){console.error("Cito credential not verified");process.exitCode=1;}}).catch(()=>{console.error("Cito readiness failed closed");process.exitCode=1;});
module.exports={healthSummary,schema,run,credentialReady};
