"use strict";
const fs=require("node:fs");
const source=process.env.NHL_BOARD_SOURCE||"prizepicks";
const key=process.env.TINYFISH_API_KEY;
const profile=process.env.TINYFISH_PROFILE_ID;
if(!["prizepicks","pickfinder"].includes(source))throw Error("Invalid NHL_BOARD_SOURCE");
if(!key)throw Error("Missing TINYFISH_API_KEY");
if(source==="pickfinder"&&!profile)throw Error("Missing TINYFISH_PROFILE_ID");
const goal="Discover the NHL player-prop board navigation categories currently available. Do not extract individual props. Open the NHL sport selector and enumerate EVERY visible prop market/category and nested subcategory, including period, alternative-line, goalie, special, and fantasy markets when present. Scroll category navigation to its end and expand any category menus. Record each category's exact displayed name and whether it was accessible. Do not log in, bypass geolocation, change account settings, or place picks. Return JSON {categories:[{name:string,accessible:boolean}],navigationExhausted:boolean,blocker:string}. Set navigationExhausted true only if the full category navigation was checked. Do not invent categories.";
const url=source==="pickfinder"?"https://www.pickfinder.app/props":"https://app.prizepicks.com/";
async function main(){
 const payload={url,goal,agent_config:{max_duration_seconds:420},output_schema:{type:"object",properties:{categories:{type:"array",items:{type:"object",properties:{name:{type:"string"},accessible:{type:"boolean"}},required:["name","accessible"]}},navigationExhausted:{type:"boolean"},blocker:{type:"string"}},required:["categories","navigationExhausted"]}};
 if(source==="pickfinder"){payload.use_profile=true;payload.profile_id=profile;}
 const headers={"X-API-Key":key,"Content-Type":"application/json"};
 const res=await fetch("https://agent.tinyfish.ai/v1/automation/run-async",{method:"POST",headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
 if(!res.ok)throw Error("TinyFish start HTTP "+res.status+": "+(await res.text()).slice(0,250));
 const start=await res.json(),id=start.run_id||start.runId;
 if(!id)throw Error("Missing TinyFish run ID");
 let result;
 for(let i=0;i<60;i++){
  await new Promise(resolve=>setTimeout(resolve,12000));
  const poll=await fetch("https://agent.tinyfish.ai/v1/runs/"+encodeURIComponent(id),{headers:{"X-API-Key":key},signal:AbortSignal.timeout(30000)});
  if(!poll.ok)throw Error("TinyFish poll HTTP "+poll.status);
  const envelope=await poll.json(),status=String(envelope.status||"").toUpperCase();
  if(status==="COMPLETED"){result=envelope.result??envelope;break;}
  if(["FAILED","CANCELLED","TIMED_OUT"].includes(status))throw Error("TinyFish "+status+": "+JSON.stringify(envelope.error||""));
 }
 if(typeof result==="string")result=JSON.parse(result);
 if(!result||!Array.isArray(result.categories))throw Error("Category discovery did not complete");
 const categories=[...new Map(result.categories.filter(x=>x&&typeof x.name==="string"&&x.name.trim()).map(x=>[x.name.trim().toLowerCase(),{name:x.name.trim(),accessible:x.accessible===true}])).values()];
 const report={source,capturedAt:new Date().toISOString(),categories,navigationExhausted:result.navigationExhausted===true,complete:result.navigationExhausted===true&&categories.length>0,blocker:result.blocker||null};
 fs.mkdirSync("outputs/discovery",{recursive:true});
 fs.writeFileSync("outputs/discovery/"+source+"-nhl-categories-latest.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({source,categories:categories.length,complete:report.complete,names:categories.map(x=>x.name),blocker:report.blocker}));
 if(!categories.length)throw Error("No NHL categories discovered; report saved");
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
