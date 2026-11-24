"use strict";
// Private approved-provider connectivity. No paid calls unless explicitly
// enabled by operator with account credentials. Never log URLs containing keys.
const fs=require("node:fs"),path=require("node:path");
const ROUTES={NFL:"https://api.rotowire.com/Football/NFL/Injuries.php",NHL:"https://api.rotowire.com/Hockey/NHL/Injuries.php"};
const CODES={OUT:"OUT",D:"DOUBTFUL",DOUBTFUL:"DOUBTFUL",Q:"QUESTIONABLE",QUESTIONABLE:"QUESTIONABLE",GTD:"GAME_TIME_DECISION",IR:"INJURED_RESERVE","IR-LT":"INJURED_RESERVE","IR-R":"INJURED_RESERVE",PUP:"UNAVAILABLE",SUSP:"UNAVAILABLE"};
function injuries(doc,sport,observedAt){
 if(!Object.hasOwn(ROUTES,sport)||!Number.isFinite(Date.parse(observedAt))||!Array.isArray(doc?.Players))throw Error("Invalid source schema");
 const records=[],seen=new Set();
 for(const p of doc.Players){
  const id=String(p.Id??""),team=p.Team?.Code,status=CODES[String(p.Injury?.Status||"").toUpperCase()];
  if(!/^[0-9]+$/.test(id)||typeof team!=="string"||!team||!status)continue;
  if(seen.has(id))throw Error("Conflicting source identity");seen.add(id);
  records.push({providerPlayerId:id,team,status,observedAt,officialPlayerId:null,officialGameId:null});
 }
 return {sport,source:"RotoWire",observedAt,records,sourceRows:doc.Players.length,
  unmatchedOrUnsupported:doc.Players.length-records.length,missingPlayerNotHealthy:true,modelEligible:false};
}
async function get(url,opts={}){
 const r=await fetch(url,{...opts,redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error("Provider HTTP "+r.status);
 const txt=await r.text();if(Buffer.byteLength(txt)>8_000_000)throw Error("Provider payload bound");
 return JSON.parse(txt);
}
async function run(env=process.env){
 const observedAt=new Date().toISOString(),report={kind:"private_provider_connection_probe_v1",observedAt,providers:{},modelPromoted:false};
 const dir=path.resolve(__dirname,"../outputs/health/provider-access");
 fs.mkdirSync(dir,{recursive:true});
 if(env.PFF_API_KEY&&env.PROBE_PFF==="1"){
  try{
   const doc=await get("https://api.pff.com/v1/auth/whoami",{headers:{Authorization:"Bearer "+env.PFF_API_KEY}});
   report.providers.pff={status:doc.entitled===true?"entitlement_verified":"not_entitled",dataFeedVerified:false};
  }catch{report.providers.pff={status:"probe_failed"};}
 }else report.providers.pff={status:"credential_or_explicit_probe_required"};
 if(env.ROTOWIRE_API_KEY&&env.PULL_ROTOWIRE==="1"){
  for(const sport of Object.keys(ROUTES)){
   try{
    const u=new URL(ROUTES[sport]);u.searchParams.set("key",env.ROTOWIRE_API_KEY);u.searchParams.set("format","json");
    const data=injuries(await get(u),sport,new Date().toISOString());
    const name="rotowire-"+sport+"-"+observedAt.replace(/[:.]/g,"")+".json";
    fs.writeFileSync(path.join(dir,name),JSON.stringify(data)+"\n",{flag:"wx",mode:0o600});
    report.providers["rotowire_"+sport]={status:"source_received",records:data.records.length,identityJoinVerified:false};
   }catch{report.providers["rotowire_"+sport]={status:"probe_failed"};}
  }
 }else report.providers.rotowire={status:"credential_or_explicit_pull_required"};
 for(const source of ["natural_stat_trick","fantasy_life","nhl_lineup_projections"])
  report.providers[source]={status:"authorized_feed_schema_or_endpoint_required",modelEligible:false};
 fs.writeFileSync(path.join(dir,"latest.json"),JSON.stringify(report,null,2)+"\n");
 console.log("Private provider connection status generated. No credential or raw provider data printed.");
}
if(require.main===module)run().catch(()=>{console.error("Private provider probe failed.");process.exitCode=1;});
module.exports={injuries,run};
