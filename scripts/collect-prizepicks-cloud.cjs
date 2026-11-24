"use strict";
const fs=require("node:fs");
const KEY=process.env.TINYFISH_API_KEY;
const PAGES=Number(process.env.PRIZEPICKS_PAGES||3);
if(!KEY)throw Error("Missing TINYFISH_API_KEY");
if(!Number.isInteger(PAGES)||PAGES<1||PAGES>30)throw Error("PRIZEPICKS_PAGES must be 1..30");
const goal=`Open the publicly visible PrizePicks NHL player props board. Do not log in, bypass geolocation, use a proxy, or place picks. Read all NHL markets, not only the default category. For each category scroll/load available entries and paginate where possible, up to ${PAGES} board pages or batches per category. Capture exactly what is displayed, including player, team, market, line, matchup, live status and selection tier if shown. Return JSON {rows:[{player,team,market,line,matchup,isLive,tier}],categoriesVisited:[string],pagesVisited:number,complete:boolean,blocker:string}. 'complete' is true ONLY if you verified that every NHL category and every entry in each category was exhausted. Never fabricate rows or mark complete if unsure. If a location gate prevents reading, report blocker and stop.`;
async function main(){
 const started=Date.now();
 const base="https://agent.tinyfish.ai";
 const headers={"X-API-Key":KEY,"Content-Type":"application/json"};
 const payload={url:"https://app.prizepicks.com/",goal,
   agent_config:{max_duration_seconds:600},
   output_schema:{type:"object",properties:{
    rows:{type:"array",items:{type:"object",properties:{player:{type:"string"},team:{type:"string"},market:{type:"string"},line:{type:"number"},matchup:{type:"string"},isLive:{type:"boolean"},tier:{type:"string"}},required:["player","market","line"]}},
    categoriesVisited:{type:"array",items:{type:"string"}},pagesVisited:{type:"integer"},complete:{type:"boolean"},blocker:{type:"string"}
   },required:["rows","complete"]}};
 console.log("Starting asynchronous PrizePicks NHL collection");
 const startedResponse=await fetch(base+"/v1/automation/run-async",{
  method:"POST",headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)
 });
 if(!startedResponse.ok)throw Error("TinyFish start HTTP "+startedResponse.status+": "+(await startedResponse.text()).slice(0,250));
 const start=await startedResponse.json();
 const runId=start.run_id||start.runId;
 if(!runId)throw Error("TinyFish start missing run_id: "+JSON.stringify(start).slice(0,300));
 console.log("TinyFish run started: "+runId);
 let envelope;
 for(let attempt=0;attempt<75;attempt++){
  if(Date.now()-started>1000000)throw Error("TinyFish run polling exceeded time budget: "+runId);
  await new Promise(resolve=>setTimeout(resolve,12000));
  const response=await fetch(base+"/v1/runs/"+encodeURIComponent(runId),{
   headers:{"X-API-Key":KEY},signal:AbortSignal.timeout(30000)
  });
  if(!response.ok)throw Error("TinyFish status HTTP "+response.status+" run_id="+runId);
  envelope=await response.json();
  const status=String(envelope.status||"").toUpperCase();
  console.log("TinyFish status="+status+" elapsedSeconds="+Math.round((Date.now()-started)/1000));
  if(status==="COMPLETED")break;
  if(["FAILED","CANCELLED","TIMED_OUT"].includes(status))throw Error("TinyFish run "+status+": "+JSON.stringify(envelope.error||"unknown").slice(0,350));
  if(attempt===74)throw Error("TinyFish run still pending after 75 polls: "+runId);
 }
 if(!envelope||String(envelope.status).toUpperCase()!=="COMPLETED")throw Error("TinyFish run did not complete");
 let data=envelope.result??envelope;
 if(typeof data==="string")data=JSON.parse(data);
 if(!Array.isArray(data.rows))throw Error("TinyFish response missing rows");
 const capturedAt=new Date().toISOString();
 const rows=data.rows.filter(r=>r&&typeof r.player==="string"&&typeof r.market==="string"&&Number.isFinite(Number(r.line))).map(r=>({...r,line:Number(r.line),source:"PrizePicks",sport:"NHL",capturedAt}));
 if(!rows.length)throw Error("No public NHL props collected: "+(data.blocker||"empty board"));
 fs.mkdirSync("outputs/prizepicks",{recursive:true});
 fs.writeFileSync("outputs/prizepicks/nhl-raw-latest.json",JSON.stringify({source:"PrizePicks",sport:"NHL",capturedAt,complete:data.complete===true,categoriesVisited:data.categoriesVisited||[],pagesVisited:data.pagesVisited||null,blocker:data.blocker||null,rows},null,2)+"\n");
 console.log(JSON.stringify({rows:rows.length,complete:data.complete===true,categoriesVisited:data.categoriesVisited||[],pagesVisited:data.pagesVisited||null}));
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=1;});
