"use strict";
const fs=require("node:fs");
const {isInsufficientCredits}=require("../src/tinyfish-errors.cjs");
const source=process.env.NHL_BOARD_SOURCE;
const index=Number(process.env.NHL_CATEGORY_INDEX);
const key=process.env.TINYFISH_API_KEY;
const profile=process.env.TINYFISH_PROFILE_ID;
if(!["pickfinder","prizepicks"].includes(source))throw Error("Invalid NHL_BOARD_SOURCE");
if(!Number.isInteger(index)||index<0)throw Error("Invalid NHL_CATEGORY_INDEX");
if(!key||(source==="pickfinder"&&!profile))throw Error("Missing TinyFish credentials");
const inventory=JSON.parse(fs.readFileSync("outputs/discovery/"+source+"-nhl-categories-latest.json","utf8"));
const category=inventory.categories[index];
if(!category||category.accessible!==true)throw Error("Category index unavailable: "+index);
const goal="Open the NHL player-prop board. Select ONLY the category named "+JSON.stringify(category.name)+". Collect every currently accessible entry in that category by scrolling and paging until exhausted, but do not navigate to another category. Preserve exact displayed market names, player names, teams, matchups, numeric lines, alternative lines, payout tiers, period, and live status. Return JSON {selectedCategory:string,rows:[{player:string,team:string,market:string,line:number,matchup:string,tier:string,period:string,isLive:boolean}],complete:boolean,pagesVisited:number,blocker:string}. Set complete true ONLY if the selected category was actually opened and every accessible entry exhausted. Never fabricate entries. Do not log in, bypass access restrictions, or place bets.";
async function main(){
 const payload={url:source==="pickfinder"?"https://www.pickfinder.app/props":"https://app.prizepicks.com/",goal,agent_config:{max_duration_seconds:420},output_schema:{type:"object",properties:{selectedCategory:{type:"string"},rows:{type:"array",items:{type:"object",properties:{player:{type:"string"},team:{type:"string"},market:{type:"string"},line:{type:"number"},matchup:{type:"string"},tier:{type:"string"},period:{type:"string"},isLive:{type:"boolean"}},required:["player","market","line"]}},complete:{type:"boolean"},pagesVisited:{type:"integer"},blocker:{type:"string"}},required:["selectedCategory","rows","complete"]}};
 if(source==="pickfinder"){payload.use_profile=true;payload.profile_id=profile;}
 const headers={"X-API-Key":key,"Content-Type":"application/json"};
 const res=await fetch("https://agent.tinyfish.ai/v1/automation/run-async",{method:"POST",headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(60000)});
 if(!res.ok){
  const body=await res.text();
  if(isInsufficientCredits(res.status,body)){
   const e=new Error("TinyFish wallet lacks credits (HTTP 402). Collection stopped without retry.");
   e.code="INSUFFICIENT_CREDITS";
   throw e;
  }
  throw Error("TinyFish start HTTP "+res.status+": "+body.slice(0,250));
 }
 const start=await res.json(),id=start.run_id||start.runId;
 if(!id)throw Error("Missing run ID");
 let result;
 for(let i=0;i<60;i++){
  await new Promise(resolve=>setTimeout(resolve,12000));
  const poll=await fetch("https://agent.tinyfish.ai/v1/runs/"+encodeURIComponent(id),{headers:{"X-API-Key":key},signal:AbortSignal.timeout(30000)});
  if(!poll.ok)throw Error("TinyFish status HTTP "+poll.status);
  const envelope=await poll.json(),status=String(envelope.status||"").toUpperCase();
  if(status==="COMPLETED"){result=envelope.result??envelope;break;}
  if(["FAILED","CANCELLED","TIMED_OUT"].includes(status))throw Error("TinyFish "+status+": "+JSON.stringify(envelope.error||""));
 }
 if(typeof result==="string")result=JSON.parse(result);
 if(!result||!Array.isArray(result.rows))throw Error("Collection timed out or invalid result for "+category.name);
 const normalizeLabel=s=>String(s||"").normalize("NFKC").replace(/[^\p{L}\p{N}]+/gu," ").trim().toLowerCase();
 const selectedMatches=normalizeLabel(result.selectedCategory)===normalizeLabel(category.name);
 const rows=result.rows.filter(r=>r&&typeof r.player==="string"&&typeof r.market==="string"&&Number.isFinite(Number(r.line))).map(r=>({...r,line:Number(r.line),category:category.name,source,capturedAt:new Date().toISOString()}));
 const report={source,category:category.name,index,capturedAt:new Date().toISOString(),complete:selectedMatches&&result.complete===true,selectedCategory:result.selectedCategory||null,pagesVisited:result.pagesVisited||null,blocker:result.blocker||null,rows};
 const dir="outputs/board-categories/"+source;
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(dir+"/"+String(index).padStart(3,"0")+".json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({source,category:category.name,index,rows:rows.length,complete:report.complete,blocker:report.blocker}));
 if(!selectedMatches)throw Error("Wrong category selected; saved incomplete report");
 if(!report.complete)throw Error("Category incomplete: "+(report.blocker||"not exhausted"));
}
main().catch(e=>{console.error(e.stack||e.message);process.exitCode=e.code==="INSUFFICIENT_CREDITS"?42:1;});
