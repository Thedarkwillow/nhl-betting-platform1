"use strict";
const fs=require("node:fs");
const {sanitizePublicDashboard}=require("../src/nhl-public-dashboard-payload.cjs");
const token=process.env.DASHBOARD_PUBLISH_TOKEN;
if(!token)throw Error("DASHBOARD_PUBLISH_TOKEN is not configured");
const repo="Thedarkwillow/nhl-betting-platform1",path="data.json";
const privateOutput=JSON.parse(fs.readFileSync("site/data.json","utf8"));
const content=JSON.stringify(sanitizePublicDashboard(privateOutput))+"\n";
(async()=>{
 const url="https://api.github.com/repos/"+repo+"/contents/"+path;
 const headers={Authorization:"Bearer "+token,Accept:"application/vnd.github+json","X-GitHub-Api-Version":"2022-11-28","User-Agent":"nhl-dashboard-publisher"};
 const current=await fetch(url,{headers});
 let sha;
 if(current.ok){sha=(await current.json()).sha;}
 else if(current.status!==404)throw Error("Cannot read public dashboard file: HTTP "+current.status);
 const response=await fetch(url,{method:"PUT",headers:{"Content-Type":"application/json",...headers},body:JSON.stringify({message:"data: update public NHL research snapshot",content:Buffer.from(content).toString("base64"),...(sha?{sha}:{})})});
 if(!response.ok)throw Error("Cannot publish dashboard: HTTP "+response.status);
 console.log("Published public allowlisted NHL results (not private research) to "+repo);
})().catch(e=>{console.error(e.message);process.exitCode=1});
