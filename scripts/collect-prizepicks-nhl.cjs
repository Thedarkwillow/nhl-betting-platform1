"use strict";
const fs=require("node:fs/promises");
const path=require("node:path");
const {normalizeBoard}=require("../src/prizepicks.cjs");
async function json(url){
  const response=await fetch(url,{headers:{accept:"application/json"},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error("PrizePicks HTTP "+response.status+" at "+new URL(url).pathname);
  return response.json();
}
async function main(){
  // League IDs are provider-controlled: discover rather than assuming MLB's ID works for NHL.
  const leagues=await json("https://api.prizepicks.com/leagues");
  if(!Array.isArray(leagues?.data))throw new Error("PrizePicks leagues response format changed");
  const nhl=leagues.data.find(l=>String(l.attributes?.name||l.attributes?.abbreviation||"").toUpperCase()==="NHL");
  if(!nhl)throw new Error("NHL league not found in PrizePicks leagues endpoint");
  const url=new URL("https://api.prizepicks.com/projections");
  url.searchParams.set("league_id",String(nhl.id));
  url.searchParams.set("per_page","1000");
  url.searchParams.set("single_stat","true");
  const payload=await json(url.toString());
  const capturedAt=new Date().toISOString();
  const board=normalizeBoard(payload,capturedAt);
  const dir=path.join(__dirname,"..","outputs","prizepicks");
  await fs.mkdir(dir,{recursive:true});
  await fs.writeFile(path.join(dir,"nhl-raw-latest.json"),JSON.stringify(payload,null,2)+"\n");
  await fs.writeFile(path.join(dir,"nhl-latest.json"),JSON.stringify({...board,leagueId:nhl.id},null,2)+"\n");
  console.log("PrizePicks NHL rows: "+board.rows.length+"; skipped: "+board.skipped.length);
  if(!board.rows.length)throw new Error("No supported NHL lines; inspect provider response");
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
