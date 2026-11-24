"use strict";
// A source-supplied export is not equivalent to authenticated app settlement.
const fs=require("node:fs"),path=require("node:path"),{createHash}=require("node:crypto");
const {validOffer,TITLES}=require("../src/esports-research-v1.cjs");
const dt=Date.parse;
const hosts={PrizePicks:["prizepicks.com"],Underdog:["underdogfantasy.com","underdogsports.com"]};
const official=(platform,url)=>{try{const u=new URL(url);return u.protocol==="https:"&&!u.username&&!u.password&&!u.port&&!u.hash&&hosts[platform]?.some(h=>u.hostname===h||u.hostname.endsWith("."+h))===true;}catch{return false;}};
function validate(doc,platform,now){
 if(!hosts[platform]||doc?.kind!=="authorized_esports_original_offer_export_v1"||doc.platform!==platform||doc.isDemo!==false||
 typeof doc.exportId!=="string"||!doc.exportId||!official(platform,doc.sourceUrl)||
 !Number.isFinite(dt(doc.capturedAt))||dt(doc.capturedAt)>dt(now)||dt(now)-dt(doc.capturedAt)>900000||
 !Array.isArray(doc.rows)||doc.rows.length>5000)throw Error("invalid authenticated export envelope");
 const seen=new Set(),accepted=[],excluded={};
 for(const r of doc.rows){
  const k=[r.offerId,r.capturedAt].join("|");
  let why=null;
  if(r.platform!==platform||!official(platform,r.sourceUrl)||!validOffer(r)||r.originalPlatformOfferVerified!==true||r.authorizedExportVerified!==true)why="identity_scope_or_provenance";
  else if(dt(r.capturedAt)>dt(doc.capturedAt)||dt(doc.capturedAt)-dt(r.capturedAt)>900000||dt(r.seriesStartAt)<=dt(now)+900000)why="stale_or_started";
  else if(seen.has(k))why="duplicate";
  if(why){excluded[why]=(excluded[why]||0)+1;continue;}
  seen.add(k);accepted.push(r);
 }
 return {accepted,excluded};
}
async function collect(platform,url,key,archive,client=fetch){
 if(!official(platform,url)||!key)throw Error("approved HTTPS export URL and credential required");
 const res=await client(url,{headers:{Accept:"application/json",Authorization:"Bearer "+key},redirect:"error",signal:AbortSignal.timeout(25000)});
 if(!res.ok||!res.body||!(res.headers.get("content-type")||"").includes("json"))throw Error("export source unavailable");
 const chunks=[];let n=0;const reader=res.body.getReader();
 try{for(;;){const x=await reader.read();if(x.done)break;n+=x.value.length;if(n>8_000_000){await reader.cancel();throw Error("response bound");}chunks.push(Buffer.from(x.value));}}finally{reader.releaseLock();}
 const bytes=Buffer.concat(chunks),doc=JSON.parse(bytes.toString("utf8")),now=new Date().toISOString();
 const out=validate(doc,platform,now);
 if(!out.accepted.length)return {platform,status:"no_eligible_rows",excluded:out.excluded,accepted:0};
 const dir=path.join(archive,"outputs/esports/authorized-original-offers");fs.mkdirSync(dir,{recursive:true,mode:0o700});
 // Retain the eligible source rows plus hash of the response; raw response body is not stored.
 const name=now.replace(/[-:.]/g,"")+".json";
 fs.writeFileSync(path.join(dir,name),JSON.stringify({kind:doc.kind,platform:doc.platform,isDemo:doc.isDemo,exportId:doc.exportId,sourceUrl:doc.sourceUrl,capturedAt:doc.capturedAt,rows:out.accepted,sourceResponseSha256:createHash("sha256").update(bytes).digest("hex"),authenticatedExportTransport:true,originalAppAvailabilityIndependentlyVerified:false,receivedAt:now})+"\n",{flag:"wx",mode:0o600});
 return {platform,status:"captured_authenticated_export_transport",accepted:out.accepted.length,excluded:out.excluded,originalAppAvailabilityIndependentlyVerified:false};
}
async function main(){
 const a=fs.realpathSync(process.argv[2]||".");
 if(a===path.resolve(__dirname,"..")||!fs.existsSync(path.join(a,".git")))throw Error("restricted archive required");
 const pairs=[["PrizePicks","PP_ESPORTS_EXPORT_URL","PP_ESPORTS_EXPORT_TOKEN"],["Underdog","UD_ESPORTS_EXPORT_URL","UD_ESPORTS_EXPORT_TOKEN"]];
 const results=[];
 for(const [platform,u,k] of pairs){
  const configured=!!(process.env[u]&&process.env[k]);
  if(!configured||process.env.ESPORTS_NO_METERED_EXPORT_APPROVED!=="1"){results.push({platform,configured,status:"not_called_missing_no_charge_authorization_or_credentials",accepted:0});continue;}
  try{results.push(await collect(platform,process.env[u],process.env[k],a));}catch{results.push({platform,configured,status:"source_or_contract_failed",accepted:0});}
 }
 console.log(JSON.stringify({kind:"esports_authenticated_export_transport_v1",results,existingIndependentKeys:{PrizePicks:!!process.env.PRIZEPICKSAPI_KEY,Underdog:!!process.env.UNDERDOG_API_KEY},meteredProviderCalls:0,rawRowsPublished:0,originalAppAvailabilityIndependentlyVerified:false}));
}
if(require.main===module)main().catch(()=>{console.error("Export intake failed closed");process.exitCode=1;});
module.exports={official,validate};
