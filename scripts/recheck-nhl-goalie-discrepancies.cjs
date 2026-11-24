"use strict";
const fs=require("node:fs"),{load}=require("./report-nhl-position-multiseason-v3.cjs"),{collect,reconcile}=require("./collect-nhl-goalie-starter-history.cjs"),{normalizeOfficialUsage}=require("../src/nhl-usage-goalie.cjs");
async function main(){
 const {history,schedules}=load(),schedule=schedules.find(s=>s.season==="2026-27");if(!schedule?.complete)throw Error("Missing official schedule");
 const raw=await collect("20262027"),usage=JSON.parse(fs.readFileSync("outputs/nhl-usage/latest.json","utf8")),before=reconcile(raw,history,schedule,usage);
 const matched=new Set(Object.values(before.players).flat().map(x=>x.gameId+"|"+x.playerId)),historical=new Set(Object.values(history.players).flatMap(p=>(p.games||[]).filter(x=>x.type==="goalie").map(x=>x.gameId+"|"+x.playerId)));
 const targets=raw.filter(x=>historical.has(x.gameId+"|"+x.playerId)&&!matched.has(x.gameId+"|"+x.playerId)),ids=[...new Set(targets.map(x=>x.gameId))];if(ids.length>40)throw Error("Unexpected conflict count; bounded review refused");
 const refreshed=JSON.parse(JSON.stringify(usage)),attempts=[];for(const id of ids){try{const res=await fetch("https://api-web.nhle.com/v1/gamecenter/"+id+"/boxscore",{signal:AbortSignal.timeout(20000)});if(!res.ok)throw Error("HTTP "+res.status);const doc=await res.json();if(doc.id!==id)throw Error("wrong game");const rows=normalizeOfficialUsage(doc).filter(r=>r.type==="goalie");for(const r of rows){const k=String(r.playerId);refreshed.players[k]=[...(refreshed.players[k]||[]).filter(x=>x.gameId!==id),r];}attempts.push({gameId:id,verifiedFinal:true,rows:rows.length});}catch(e){attempts.push({gameId:id,verifiedFinal:false,reason:e.message});}}
 const after=reconcile(raw,history,schedule,refreshed),old=JSON.parse(fs.readFileSync("outputs/nhl-usage/goalie-starts-rest-latest.json","utf8"));
 if(after.counts.matched<before.counts.matched||after.counts.conflicts>before.counts.conflicts)throw Error("Regression; existing archive preserved");
 const oldRows=Object.values(old.players).flat().filter(x=>String(x.gameId).startsWith("202502")),players={};for(const r of [...oldRows,...Object.values(after.players).flat()])(players[r.playerId]??=[]).push(r);
 const report={kind:"official_goalie_conflict_refresh_v1",generatedAt:new Date().toISOString(),before:before.counts,after:after.counts,attempts,originalHistoryRewritten:false,researchOnly:true,modelPromoted:false};
 fs.mkdirSync("outputs/health",{recursive:true});fs.writeFileSync("outputs/health/goalie-conflict-refresh-latest.json",JSON.stringify(report,null,2)+"\n");
 if(after.counts.matched>before.counts.matched)fs.writeFileSync("outputs/nhl-usage/goalie-starts-rest-latest.json",JSON.stringify({...old,generatedAt:report.generatedAt,results:[...old.results.filter(x=>x.season!=="20262027"),{season:"20262027",...after.counts}],players})+"\n");
 console.log(JSON.stringify({before:before.counts.conflicts,after:after.counts.conflicts,verifiedFinal:attempts.filter(x=>x.verifiedFinal).length,attempted:attempts.length}));
}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
