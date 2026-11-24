"use strict";
const fs=require("node:fs");
const path=require("node:path");
const KEY=process.env.TINYFISH_API_KEY;
const PROFILE=process.env.TINYFISH_PROFILE_ID;
const PAGES=Number(process.env.PICKFINDER_PAGES||1);
if(!KEY||!PROFILE){console.error("Set TINYFISH_API_KEY and TINYFISH_PROFILE_ID in GitHub Secrets");process.exit(1);}
if(!Number.isInteger(PAGES)||PAGES<1||PAGES>12)throw Error("PICKFINDER_PAGES must be 1..12");
const goal=`Use the already-authorized PickFinder browser profile. Open NHL player props and show standard full-game markets (Shots on Goal, Goals, Points, Assists, Blocked Shots, Goalie Saves). Extract exactly the currently loaded page and then advance to the next page, up to ${PAGES} pages total. Visit each standard full-game market separately, paginate each market, and report categoriesVisited, pagesVisited, complete and rows. Mark complete true only after exhausting every market and its pages; each row has player, team, matchup, prop_type, line, and optionally player_prop_url. Never fabricate values. Do not place bets, change account settings, or visit unrelated sites. If the page is logged out or blocked, return zero rows and an error message.`;
async function main(){
  const started=Date.now();
  const base="https://agent.tinyfish.ai";
  const headers={"X-API-Key":KEY,"Content-Type":"application/json"};
  const payload={url:"https://www.pickfinder.app/props",goal,use_profile:true,profile_id:PROFILE,
    agent_config:{max_duration_seconds:420},
    output_schema:{type:"object",properties:{pagesVisited:{type:"integer"},categoriesVisited:{type:"array",items:{type:"string"}},complete:{type:"boolean"},rows:{type:"array",items:{type:"object",properties:{player:{type:"string"},team:{type:"string"},matchup:{type:"string"},prop_type:{type:"string"},line:{type:"number"},player_prop_url:{type:"string"}},required:["player","prop_type","line"]}},error:{type:"string"}},required:["pagesVisited","rows"]}};
  console.log("Starting asynchronous TinyFish PickFinder collection");
  const startedResponse=await fetch(base+"/v1/automation/run-async",{
    method:"POST",headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)
  });
  if(!startedResponse.ok)throw Error("TinyFish start HTTP "+startedResponse.status+": "+(await startedResponse.text()).slice(0,250));
  const start=await startedResponse.json();
  const runId=start.run_id||start.runId;
  if(!runId)throw Error("TinyFish start did not return run_id: "+JSON.stringify(start).slice(0,300));
  console.log("TinyFish run started: "+runId);
  let envelope;
  for(let attempt=0;attempt<60;attempt++){
    if(Date.now()-started>720000)throw Error("TinyFish run polling exceeded 12 minutes; run_id="+runId);
    await new Promise(resolve=>setTimeout(resolve,12000));
    const response=await fetch(base+"/v1/runs/"+encodeURIComponent(runId),{headers:{"X-API-Key":KEY},signal:AbortSignal.timeout(30000)});
    if(!response.ok)throw Error("TinyFish status HTTP "+response.status+" run_id="+runId);
    envelope=await response.json();
    const status=String(envelope.status||"").toUpperCase();
    console.log("TinyFish status="+status+" elapsedSeconds="+Math.round((Date.now()-started)/1000));
    if(status==="COMPLETED")break;
    if(["FAILED","CANCELLED","TIMED_OUT"].includes(status))throw Error("TinyFish run "+status+": "+JSON.stringify(envelope.error||"unknown").slice(0,350));
    if(attempt===59)throw Error("TinyFish run still pending after 60 polls: "+runId);
  }
  if(!envelope||String(envelope.status).toUpperCase()!=="COMPLETED")throw Error("TinyFish run did not complete");
  let data=envelope.result??envelope;
  if(typeof data==="string"){try{data=JSON.parse(data);}catch{throw Error("TinyFish returned non-JSON result");}}
  if(!Array.isArray(data.rows)||!Number.isInteger(data.pagesVisited))throw Error("Unexpected TinyFish response schema");
  if(data.rows.length===0||data.error)throw Error("No accessible PickFinder NHL props: "+(data.error||"empty board"));
  const capturedAt=new Date().toISOString();
  const rows=data.rows.map(r=>({...r,league:"NHL",extracted_at_utc:capturedAt}));
  const out={source:"PickFinder",capturedAt,pagesVisited:data.pagesVisited,categoriesVisited:data.categoriesVisited||[],complete:data.complete===true,rows,partial:data.complete!==true};
  const folder="outputs/pickfinder";fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,"nhl-collected-latest.json"),JSON.stringify(out,null,2)+"\n");
  console.log(JSON.stringify({capturedAt,pagesVisited:data.pagesVisited,rows:rows.length,partial:out.partial,complete:out.complete,categoriesVisited:out.categoriesVisited}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
