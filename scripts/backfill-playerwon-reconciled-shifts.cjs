"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process"),{createHash}=require("node:crypto");
const {reconcile}=require("../src/playerwon-shift-reconciliation-v1.cjs");
const root=path.resolve(__dirname,".."),src=path.join(root,"outputs/nhl/research/playerwon-shifts"),out=path.join(root,"outputs/nhl/research/playerwon-reconciled"),official=path.join(root,"outputs/nhl/research/goal-credit-shifts");
async function get(url){const r=await fetch(url,{redirect:"error",signal:AbortSignal.timeout(20000)});if(!r.ok)throw Error("official unavailable");return r.json();}
async function main(){
 const limit=Number(process.env.PLAYERWON_BATCH||3);if(!Number.isInteger(limit)||limit<1||limit>5)throw Error("invalid bounded batch");
 fs.mkdirSync(out,{recursive:true});fs.mkdirSync(src,{recursive:true});
 const {schedules}=require("./report-nhl-position-multiseason-v3.cjs").load(),day=new Date().toISOString().slice(0,10);
 const games=[...new Map(schedules.flatMap(s=>s.games).filter(g=>Number.isInteger(g.id)&&String(g.id).slice(4,6)==="02"&&g.gameDate<day).map(g=>[g.id,g])).values()].sort((a,b)=>b.gameDate.localeCompare(a.gameDate)||b.id-a.id);
 const statusPath=path.join(out,"backfill-status.json");let attempts={};try{attempts=JSON.parse(fs.readFileSync(statusPath,"utf8")).attempts||{}}catch{}
 const todo=games.filter(g=>{if(attempts[g.id]?.status==="unresolved"&&Date.now()-Date.parse(attempts[g.id].lastAttemptAt)<7*86400000)return false;if(fs.existsSync(path.join(out,g.id+".json")))return false;try{return JSON.parse(fs.readFileSync(path.join(official,g.id+".json"),"utf8")).shiftsVerified!==true;}catch{return true;}}).slice(0,limit);
 let verified=0,failed=0,intervals=0;
 for(const g of todo){try{
  let names=fs.readdirSync(src).filter(x=>x.startsWith(g.id+"-")&&x.endsWith(".json"));
  if(!names.length){execFileSync("python",["scripts/import-playerwon-shifts.py","--download","--game-id",String(g.id)],{cwd:root,timeout:35000,stdio:"pipe"});names=fs.readdirSync(src).filter(x=>x.startsWith(g.id+"-")&&x.endsWith(".json"));}
  if(names.length!==1)throw Error("ambiguous source version");
  const d=JSON.parse(fs.readFileSync(path.join(src,names[0]),"utf8")),raw=fs.readFileSync(path.join(src,names[0].replace(/\.json$/,".csv")));
  if(createHash("sha256").update(raw).digest("hex")!==d.sha256||d.gameDate!==g.gameDate)throw Error("source hash or schedule mismatch");
  const base="https://api-web.nhle.com/v1/gamecenter/"+g.id+"/",[p,b]=await Promise.all([get(base+"play-by-play"),get(base+"boxscore")]),v=reconcile(d,p,b);
  if(!v)throw Error("official reconciliation incomplete");
  fs.writeFileSync(path.join(out,g.id+".json"),JSON.stringify(v)+"\n",{flag:"wx"});verified++;intervals+=d.rows.length;attempts[g.id]={status:"verified",lastAttemptAt:new Date().toISOString()};
 }catch{failed++;attempts[g.id]={status:"unresolved",lastAttemptAt:new Date().toISOString()};}if(g!==todo.at(-1))await new Promise(r=>setTimeout(r,1500));}
 const coverage={scheduledPastRegularGames:games.length,officialVerified:0,playerwonOnlyVerified:0,unresolved:0};
 for(const g of games){
  let officialOk=false,fallbackOk=false;
  try{officialOk=JSON.parse(fs.readFileSync(path.join(official,g.id+".json"),"utf8")).shiftsVerified===true;}catch{}
  try{const v=JSON.parse(fs.readFileSync(path.join(out,g.id+".json"),"utf8"));fallbackOk=attempts[g.id]?.status==="verified"&&v!==null&&typeof v==="object";}catch{}
  if(officialOk)coverage.officialVerified++;else if(fallbackOk)coverage.playerwonOnlyVerified++;else coverage.unresolved++;
 }
 coverage.combinedVerified=coverage.officialVerified+coverage.playerwonOnlyVerified;
 coverage.coverageFraction=games.length?coverage.combinedVerified/games.length:null;
 fs.writeFileSync(statusPath,JSON.stringify({attempts,coverage,updatedAt:new Date().toISOString(),researchOnly:true})+"\n");
 console.log(JSON.stringify({playerwonAttempted:todo.length,playerwonVerified:verified,playerwonFailed:failed,verifiedIntervals:intervals,modelPromoted:false}));
}
if(require.main===module)main().catch(()=>{console.error("PlayerWON bounded backfill unavailable");process.exitCode=1;});module.exports={main};