"use strict";
/** Bounded no-paid-source historical official PP scoring recovery.
 * Output requires an immutable Git commit before any future research freeze.
 */
const fs=require("node:fs"),path=require("node:path");
const {mergeHistory}=require("../src/nhl-specialist-history-recovery.cjs");
const {validateScoringDay}=require("../src/nhl-strict-official-evidence-v1.cjs");
const root=path.resolve(__dirname,"..");
const abs=p=>path.join(root,p),read=p=>JSON.parse(fs.readFileSync(abs(p),"utf8"));
const dir="outputs/research/nhl-pp-scoring-history";
const dates=d=>fs.existsSync(abs(d))?fs.readdirSync(abs(d))
 .filter(n=>/^\d{4}-\d\d-\d\d\.json$/.test(n)).sort():[];
async function fetchDay(day,{client=fetch}={}){
 const rows=[];let total=null;
 for(let page=0;page<20;page++){
  const query=new URLSearchParams({isAggregate:"false",isGame:"true",
   start:String(rows.length),limit:"500",
   cayenneExp:'gameDate>="'+day+'" and gameDate<="'+day+' 23:59:59" and gameTypeId=2',
   sort:JSON.stringify([{property:"gameId",direction:"ASC"},{property:"playerId",direction:"ASC"}])});
  const r=await client("https://api.nhle.com/stats/rest/en/skater/summary?"+query,
   {signal:AbortSignal.timeout(25000),redirect:"error"});
  if(!r.ok)throw Error("NHL official HTTP "+r.status);
  const json=await r.json();
  if(!Number.isInteger(json.total)||!Array.isArray(json.data)||
    total!==null&&total!==json.total||json.total>800||json.total<1)
   throw Error("Incomplete official scoring pagination");
  total=json.total;
  const seen=new Set(rows.map(x=>x.gameId+"|"+x.playerId));
  for(const x of json.data){const k=x.gameId+"|"+x.playerId;
   if(seen.has(k))throw Error("Duplicate scoring page identity");seen.add(k);}
  rows.push(...json.data);
  if(rows.length===total)return {data:rows,total};
  if(rows.length>total||!json.data.length)throw Error("Invalid official page length");
 }
 throw Error("Official scoring page cap exceeded");
}
function prioritizeDates(days){
 const sorted=[...new Set(days)].sort(),
  current=sorted.filter(d=>d>="2026-07-01"),
  older=sorted.filter(d=>d<"2026-07-01");
 return [...new Set([...current.slice(0,5),...current.slice(-3),
  ...older.slice(0,4)])].slice(0,12);
}
async function main(){
 const h=read("outputs/history/players.json");
 const training=dates("outputs/period-stats/training-source").map(n=>
  read("outputs/period-stats/training-source/"+n));
 const hist=mergeHistory(h,training).history,byDay=new Map();
 for(const p of Object.values(hist.players))for(const g of p.games){
  if(g.type!=="skater"||String(g.gameId).slice(4,6)!=="02")continue;
  const a=byDay.get(g.gameDate)||[];a.push(g);byDay.set(g.gameDate,a);
 }
 const latest=new Date().toISOString().slice(0,10);
 const missing=[...byDay.keys()].filter(d=>d<latest&&
  !fs.existsSync(abs(dir+"/"+d+".json"))).sort();
 // Prioritize contiguous early current-season player histories (needed
 // for verified last-10 PP-assist involvement) while keeping fresh late
 // dates and 2025-26 backfill progressing. Bounded 12 free official days.
 const upcoming=prioritizeDates(missing);
 const summary={kind:"nhl_verified_pp_assist_recovery_progress_v1",
  generatedAt:new Date().toISOString(),missingDays:missing.length,attempts:[],
  zeroPaidRequests:true,productionUnaffected:true};
 for(const day of upcoming){
  try{
   const parsed=validateScoringDay(await fetchDay(day),byDay.get(day),day);
   if(parsed.expected<20||parsed.matched<Math.ceil(.90*parsed.expected))
    throw Error("PP scoring schema/coverage insufficient: "+parsed.matched+"/"+parsed.expected);
   const doc={kind:"official_nhl_exact_game_pp_scoring_v1",date:day,
    observedAt:new Date().toISOString(),...parsed,source:parsed.source,
    noEarlierPregameClaims:true,paidProviderRequests:0};
   fs.mkdirSync(abs(dir),{recursive:true});
   fs.writeFileSync(abs(dir+"/"+day+".json"),JSON.stringify(doc,null,2)+"\n",{flag:"wx"});
   summary.attempts.push({date:day,status:"archived",rows:parsed.matched});
  }catch(e){summary.attempts.push({date:day,status:"not_verified",reason:e.message});
   if(/HTTP (403|429)/.test(e.message))break;}
 }
 fs.mkdirSync(abs("outputs/health"),{recursive:true});
 fs.writeFileSync(abs("outputs/health/nhl-pp-scoring-recovery-latest.json"),
  JSON.stringify(summary,null,2)+"\n");
 console.log(JSON.stringify(summary));
}
if(require.main===module)main().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fetchDay,prioritizeDates,main};