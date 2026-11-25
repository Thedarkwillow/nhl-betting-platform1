"use strict";
// Fixed prior-only statistical evaluation of the four exact recovered historical caches.
// Historical availability and official final clocks remain unverified; never a forward trial.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {files,validate}=require("./private-source-history-connections.cjs");
const {nbaRows,evaluate}=require("./chronological-player-stat-audit.cjs");
const git=(root,args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:15000,maxBuffer:2e6,stdio:["ignore","pipe","pipe"]}).trim();
function audit(root){
 if(root===path.resolve(__dirname,"..")||!fs.existsSync(path.join(root,".git")))throw Error("private checkout required");
 const bySeason={},all=[],seen=new Set();
 for(const [season,name,sha] of files){
  const rel="outputs/nba/history/"+season+"/"+name,p=path.join(root,rel);
  if(!fs.lstatSync(p).isFile()||fs.lstatSync(p).isSymbolicLink()||fs.realpathSync(p)!==p||git(root,["status","--porcelain","--",rel])||git(root,["rev-parse","HEAD:"+rel])!==sha)throw Error("recovered archive mismatch");
  const raw=fs.readFileSync(p),meta=validate(raw,season,sha),rows=nbaRows(JSON.parse(raw));
  if(rows.length!==meta.rows)throw Error("incomplete normalized cohort");
  for(const row of rows){const k=JSON.stringify([row.event,row.player]);if(seen.has(k))throw Error("duplicate cross-season player appearance");seen.add(k);all.push(row);}
  const report=evaluate(rows);
  bySeason[season]={sourceRows:meta.rows,sourceGames:meta.games,groups:report.groups,pairedContextExperiments:report.pairedContextExperiments,withinPlayerEventResidualCorrelations:report.withinPlayerEventResidualCorrelations};
 }
 const pooled=evaluate(all);
 return {kind:"nba_four_season_statistical_audit_v1",sourceRows:all.length,bySeason,pooled:{groups:pooled.groups,pairedContextExperiments:pooled.pairedContextExperiments,withinPlayerEventResidualCorrelations:pooled.withinPlayerEventResidualCorrelations},historicalOnly:true,officialFinalClockVerified:false,untouched:false,prospective:false,calibrationApproved:false,modelPromoted:false,paidRequests:0,rawRowsPublished:0};
}
if(require.main===module){try{console.log(JSON.stringify(audit(fs.realpathSync(process.argv[2]))));}catch{console.error("Four-season statistical audit failed closed");process.exitCode=1;}}
module.exports={audit};
