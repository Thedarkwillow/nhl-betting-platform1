"use strict";
const fs=require("node:fs"),path=require("node:path");
const {normalizeSchedule}=require("../src/schedule.cjs");
const {gradeHistoricalBoard,summarizeBacktest}=require("../src/nhl-retrospective-backtest.cjs");
const root=path.resolve(__dirname,"..");
const checkpoints=["2026-10-29T16:00:00Z","2026-10-30T16:00:00Z","2026-10-31T16:00:00Z","2026-11-01T16:00:00Z"];
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function boardAt(asOf,key){
 const offers=[],seen=new Set();let pages=0,cursor=null;
 do{
  if(pages>=35)throw Error("Historical NHL board exceeded 35 pages (7,000 offers); partial backtest rejected");
  const url=new URL("https://prizepicksapi.com/api/v1/board");
  url.searchParams.set("as_of",asOf);url.searchParams.set("league","NHL");url.searchParams.set("limit","200");
  if(cursor)url.searchParams.set("cursor",cursor);
  const response=await fetch(url,{headers:{Authorization:"Bearer "+key,Accept:"application/json"},signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error("Historical PrizePicks board HTTP "+response.status+" (no incomplete board archived)");
  const page=await response.json();
  if(page.meta?.mode!=="live"||!Array.isArray(page.data)||Date.parse(page.meta?.as_of)!==Date.parse(asOf))
   throw Error("Historical board has an invalid replay timestamp or schema");
  offers.push(...page.data);pages++;cursor=page.meta.next_cursor||null;
  console.log(JSON.stringify({asOf,page:pages,offersLoaded:offers.length,hasMore:!!cursor}));
  if(cursor){if(seen.has(cursor))throw Error("Historical board pagination cursor loop");seen.add(cursor);}
  await sleep(6500);
 }while(cursor);
 return {asOf,pages,offers};
}
async function getGames(dates){
 const games=new Map();
 for(const date of dates){
  const res=await fetch("https://api-web.nhle.com/v1/schedule/"+date,{signal:AbortSignal.timeout(18000)});
  if(!res.ok)throw Error("Official NHL schedule HTTP "+res.status+" for "+date);
  for(const g of normalizeSchedule(await res.json()))games.set(g.id,g);
 }
 return [...games.values()];
}
async function main(){
 const key=process.env.PRIZEPICKSAPI_KEY;
 if(!key)throw Error("Missing PRIZEPICKSAPI_KEY GitHub Actions secret");
 const history=JSON.parse(fs.readFileSync(path.join(root,"outputs/history/players.json"),"utf8"));
 const dates=new Set();
 for(const time of checkpoints){
  const stamp=Date.parse(time);
  for(let day=-1;day<=1;day++)dates.add(new Date(stamp+day*86400000).toISOString().slice(0,10));
 }
 const games=await getGames([...dates]);
 const replays=[],boards=[],retrievedAt=new Date().toISOString();
 for(const asOf of checkpoints){
  const board=await boardAt(asOf,key);
  boards.push({asOf,retrievedAt,pages:board.pages,offers:board.offers.map(o=>({
   id:o.id,source:o.source,is_demo:o.is_demo,league:o.league,status:o.status,
   player:o.player,event:o.event,market:o.market,line:o.line,selections:o.selections,
   observed_at:o.observed_at,pricing:o.pricing,source_fields:o.source_fields
  }))});
  replays.push(gradeHistoricalBoard(board.offers,history,games,asOf));
  console.log(JSON.stringify({asOf,sourceOffers:board.offers.length,pages:board.pages,graded:replays.at(-1).decisions.length,pending:replays.at(-1).pending.length}));
 }
 const summary=summarizeBacktest(replays),report={generatedAt:new Date().toISOString(),retrievedAt,
  source:"prizepicksapi.com independent historical board replay",sourceFirstAvailable:"2026-10-28",
  historicalCheckpoints:checkpoints,summary,
  audits:replays.map(r=>({asOf:r.asOf,offers:r.totalOffers,graded:r.decisions.length,pending:r.pending.length,excluded:r.excluded})),
  decisions:replays.flatMap(r=>r.decisions)};
 const dir=path.join(root,"outputs/historical-prizepicks/nhl");
 fs.mkdirSync(path.join(dir,"boards"),{recursive:true});
 for(const b of boards)fs.writeFileSync(path.join(dir,"boards",b.asOf.slice(0,10)+".json"),JSON.stringify(b,null,2)+"\n");
 fs.writeFileSync(path.join(dir,"backtest-latest.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({summary,audits:report.audits}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1;});
module.exports={boardAt,main};
