"use strict";
const fs=require("node:fs"),path=require("node:path");
const {normalizeSchedule}=require("../src/schedule.cjs");
const {identifyGame}=require("../src/nhl-game-identity.cjs");
const file=path.resolve(__dirname,"../outputs/research/nhl-latest.json");
async function main(){
 const data=JSON.parse(fs.readFileSync(file,"utf8"));
 const dates=new Set();
 for(let i=-1;i<=2;i++){const d=new Date(Date.now()+i*86400000).toISOString().slice(0,10);dates.add(d);}
 const games=new Map();
 for(const date of dates){
  const response=await fetch("https://api-web.nhle.com/v1/schedule/"+date,{signal:AbortSignal.timeout(18000)});
  if(!response.ok)throw Error("NHL schedule HTTP "+response.status);
  for(const game of normalizeSchedule(await response.json()))games.set(game.id,game);
 }
 let resolved=0;
 for(const prop of data.rankedProps||[]){
  const match=identifyGame(prop,[...games.values()]);
  if(match){Object.assign(prop,match);resolved++;}
 }
 data.gameIdentityResolved=resolved;
 data.gameIdentityMethod="Unambiguous NHL public schedule, exact team/opponent and captured-before-start validation";
 fs.writeFileSync(file,JSON.stringify(data,null,2)+"\n");
 console.log(JSON.stringify({resolved,total:data.rankedProps?.length||0}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
