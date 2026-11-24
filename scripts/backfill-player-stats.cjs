"use strict";
const {spawnSync}=require("node:child_process");
const path=require("node:path");
function dateValue(value){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value+"T00:00:00Z"))) throw new Error("Invalid date");
  return new Date(value+"T00:00:00Z");
}
async function main(){
  const start=dateValue(process.argv[2]);
  const end=dateValue(process.argv[3]);
  const days=Math.round((end-start)/86400000)+1;
  if(days<1||days>14) throw new Error("Backfill requires a 1–14 day date range");
  if(end>new Date()) throw new Error("Cannot backfill future dates");
  for(let i=0;i<days;i++){
    const date=new Date(start.getTime()+i*86400000).toISOString().slice(0,10);
    console.log("Backfilling "+date);
    const run=spawnSync(process.execPath,[path.join(__dirname,"collect-player-stats.cjs"),date],{stdio:"inherit"});
    if(run.status!==0) throw new Error("Collection failed for "+date+"; stopping to avoid incomplete history");
    await new Promise(resolve=>setTimeout(resolve,350));
  }
  for(const script of ["build-player-history.cjs","build-projections.cjs"]){
    const run=spawnSync(process.execPath,[path.join(__dirname,script)],{stdio:"inherit"});
    if(run.status!==0) throw new Error("Build failed: "+script);
  }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
