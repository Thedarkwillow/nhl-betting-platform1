"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const root=path.resolve(__dirname,".."),dir="outputs/authorized-sources/snapshots",read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")),git=a=>execFileSync("git",a,{cwd:root,encoding:"utf8",timeout:15000,maxBuffer:64*1024*1024}).trim(),dt=x=>typeof x==="string"?Date.parse(x):NaN;
function grade(frames,history){
 const actual=new Map(),seen=new Set(),ambiguous=new Set(),result={};
 for(const p of Object.values(history?.players||{}))for(const g of p.games||[]){
  if(!["OFF","FINAL"].includes(g.gameState)||!Number.isInteger(g.playerId)||!Number.isInteger(g.gameId)||g.type!=="skater")continue;const k=g.playerId+"|"+g.gameId;if(actual.has(k))ambiguous.add(k);actual.set(k,g);
 }
 for(const f of frames.sort((a,b)=>dt(a.committedAt)-dt(b.committedAt)))for(const r of f.rows){
  if(!(dt(r.asOf)<=dt(f.committedAt)+999&&dt(f.committedAt)<dt(r.gameStartAt)-900000&&dt(r.observedAt)<=dt(r.asOf))||!["goals","shotsOnGoal"].includes(r.market)||!Number.isFinite(r.champion)||!Number.isFinite(r.shadow)||!Number.isFinite(r.line)||!["Higher","Lower"].includes(r.originalSide))continue;
  const k=JSON.stringify([r.playerId,r.gameId,r.market,r.line,r.tier]);if(seen.has(k))continue;seen.add(k);
  const id=r.playerId+"|"+r.gameId,g=ambiguous.has(id)?null:actual.get(id),z=result[r.market]??={registered:0,decided:0,pending:0,push:0,championAbsoluteError:0,shadowAbsoluteError:0,championCorrect:0,shadowCorrect:0,matches:0,games:new Set()};
  z.registered++;if(!g||!Number.isInteger(g[r.market])||g[r.market]<0){z.pending++;continue;}
  const y=g[r.market];z.matches++;z.games.add(r.gameId);z.championAbsoluteError+=Math.abs(r.champion-y);z.shadowAbsoluteError+=Math.abs(r.shadow-y);
  if(y===r.line){z.push++;continue;}const side=y>r.line?"Higher":"Lower";z.decided++;z.championCorrect+=Number(r.originalSide===side);z.shadowCorrect+=Number(r.shadowSide===side);
 }
 return Object.fromEntries(Object.entries(result).map(([m,z])=>[m,{registered:z.registered,decided:z.decided,pending:z.pending,push:z.push,distinctResolvedGames:z.games.size,championMAE:z.matches?z.championAbsoluteError/z.matches:null,shadowMAE:z.matches?z.shadowAbsoluteError/z.matches:null,championCorrect:z.championCorrect,shadowCorrect:z.shadowCorrect}]));
}
function main(){
 const history=read("outputs/history/players.json"),frames=[];
 if(fs.existsSync(path.join(root,dir)))for(const f of fs.readdirSync(path.join(root,dir)).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x))){
  const file=dir+"/"+f,c=git(["log","--format=%H","--",file]).split("\n").filter(Boolean);if(c.length!==1)continue;
  const d=JSON.parse(git(["show",c[0]+":"+file])),at=git(["show","-s","--format=%cI",c[0]]);
  if(d.kind!=="private_authorized_source_archive_v1"||!(dt(d.generatedAt)<=dt(at)+999))continue;
  frames.push({committedAt:at,rows:d.providers?.nhl_edge?.shadowRows||[]});
 }
 const report={kind:"private_nhl_edge_forward_grading_v1",generatedAt:new Date().toISOString(),byMarket:grade(frames,history),modelPromoted:false,calibrated:false,officialActualsNotPlatformSettlement:true};
 fs.mkdirSync(path.join(root,"outputs/authorized-sources"),{recursive:true});
 fs.writeFileSync(path.join(root,"outputs/authorized-sources/edge-grading-latest.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({kind:report.kind,byMarket:report.byMarket,modelPromoted:false}));
}
if(require.main===module)main();
module.exports={grade};
