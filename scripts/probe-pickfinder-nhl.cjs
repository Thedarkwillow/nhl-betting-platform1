"use strict";
const fs=require("node:fs/promises");
const path=require("node:path");
const {normalizePickFinder}=require("../src/pickfinder.cjs");
async function main(){
  const url="https://api-v3.pickfinder.app/props?sport=nhl&modifier=none&page=1&perPage=25";
  const response=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(20000)});
  console.log("PickFinder NHL HTTP status: "+response.status);
  if(!response.ok)throw new Error("PickFinder NHL API access unavailable ("+response.status+"); authenticated browser session may be needed");
  const body=await response.json();
  const result=normalizePickFinder(body,new Date().toISOString());
  const dir=path.join(__dirname,"..","outputs","pickfinder");
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,"nhl-probe.json"),JSON.stringify(result,null,2)+"\n");
  console.log("Items: "+result.totalItems+"; recognized: "+result.rows.length+"; skipped: "+result.skipped.length);
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
