"use strict";
const fs=require("node:fs"),path=require("node:path"),{extract}=require("../src/nhl-goal-credit-shared-ice-v1.cjs"),{load}=require("./report-nhl-position-multiseason-v3.cjs");
const root=path.resolve(__dirname,".."),dir=path.join(root,"outputs/nhl/research/goal-credit-shifts");
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:"error"});if(!r.ok)throw Error("source unavailable");return r.json();}
async function main(){
 fs.mkdirSync(dir,{recursive:true});const {schedules}=load(),all=schedules.flatMap(x=>x.games).filter(g=>Number.isInteger(g.id)&&g.gameDate<new Date().toISOString().slice(0,10)).sort((a,b)=>b.gameDate.localeCompare(a.gameDate)||b.id-a.id);
 const limit=Number(process.env.NHL_COMPONENT_BATCH||12);if(!Number.isInteger(limit)||limit<1||limit>30)throw Error("invalid batch limit");
 const todo=all.filter(g=>!fs.existsSync(path.join(dir,g.id+".json"))).slice(0,limit);let goals=0,shifts=0,failed=0;
 for(const g of todo){try{
  const base="https://api-web.nhle.com/v1/gamecenter/"+g.id+"/";
  const [p,b]=await Promise.all([get(base+"play-by-play"),get(base+"boxscore")]);
  let s=[];try{const x=await get("https://api.nhle.com/stats/rest/en/shiftcharts?cayenneExp=gameId%3D"+g.id);s=x.data||[];if(Number.isFinite(x.total)&&x.total!==s.length)s=[];}catch{}
  const v=extract(p,b,s);if(!v)throw Error("inconsistent official totals");
  fs.writeFileSync(path.join(dir,g.id+".json"),JSON.stringify({...v,collectedAt:new Date().toISOString(),researchOnly:true,commercialDisplayCleared:false})+"\n",{flag:"wx"});goals++;shifts+=Number(v.shiftsVerified);
 }catch{failed++;} }
 console.log(JSON.stringify({attempted:todo.length,verifiedGoalCreditGames:goals,verifiedSharedIceGames:shifts,failed,modelPromoted:false}));
}
if(require.main===module)main().catch(()=>{console.error("Component collector unavailable");process.exitCode=1;});
module.exports={main};