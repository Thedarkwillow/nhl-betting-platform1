"use strict";
// Recover only pre-existing private NBA historical research bytes, never stale boards,
// schedules, rankings or forecasts. Esports branches are inspected read-only.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto"),{execFileSync}=require("node:child_process");
const {indexHistory}=require("../src/nba-research-pipeline-v1.cjs");
const PIN="402d4fceb29a2ec2f3d3b09d06ede8ba2dd4ef9a";
const files=[
 ["2023-24","20261124T181858234Z.json","53d09f434b1bad962c79cf04c20a1e16295a5bbf"],
 ["2024-25","20261124T181925059Z.json","7c6d9b27b7d46c4f658ba1c5b4f4ae0fdf2cbabb"],
 ["2025-26","20261124T181951858Z.json","b7bb0cb42f756e1552a217713bb5198131eb2649"],
 ["2026-27","20261124T182018692Z.json","52c36e5efb547b3c4a3170a713afcd3de0e2a909"]];
const titles=["CS2","VALORANT","LOL","DOTA2","COD"];
const git=(root,args)=>execFileSync("git",args,{cwd:root,encoding:"utf8",maxBuffer:32*1024*1024,timeout:30000,stdio:["ignore","pipe","pipe"]}).trim();
const hash=raw=>crypto.createHash("sha1").update("blob "+raw.length+"\0").update(raw).digest("hex");
const dt=Date.parse;
function safePath(root,rel){
 let p=root;
 for(const x of rel.split("/")){
  if(!x||x==="."||x==="..")throw Error("unsafe path");
  p=path.join(p,x);
  if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw Error("symbolic link");
 }
 return p;
}
function validate(raw,season,sha){
 if(hash(raw)!==sha)throw Error("pinned blob mismatch");
 const d=JSON.parse(raw);
 if(d.kind!=="nba_historical_mirror_research_v1"||d.season!==season||d.source!=="Hugging Face cbratkovics/nba-game-logs"||d.historicalAppearancesOnly!==true||d.officialFinalClockVerified!==false||!Number.isFinite(dt(d.capturedAt))||!Array.isArray(d.rows)||!d.rows.length||d.rows.length>40000)throw Error("historical archive contract");
 const h=indexHistory([d]);if(h.rows.length!==d.rows.length||new Set(h.rows.map(r=>r.gameId)).size!==d.gameCount||h.rows.some(r=>typeof r.gameDate!=="string"||r.gameDate>=d.capturedAt.slice(0,10)))throw Error("history row contract");
 return {season,rows:d.rows.length,games:d.gameCount,capturedAt:d.capturedAt,officialFinalClockVerified:false};
}
function recover(source,dest,{authorized=false,at=new Date().toISOString()}={}){
 if(source===dest||git(source,["rev-parse","HEAD"])!==PIN||!Number.isFinite(dt(at)))throw Error("pinned private archive required");
 const manifest=[];
 for(const [season,name,sha] of files){
  const rel="outputs/nba/history/"+season+"/"+name;
  const raw=fs.readFileSync(safePath(source,rel));const evidence=validate(raw,season,sha);
  if(git(source,["status","--porcelain","--",rel]))throw Error("source worktree changed");
  const commits=git(source,["log","--format=%H","--",rel]).split("\n").filter(Boolean);
  if(commits.length!==1||git(source,["rev-parse",commits[0]+":"+rel])!==sha)throw Error("source history not immutable");
  const first=git(source,["show","-s","--format=%cI",commits[0]]);
  if(!(dt(first)>=dt(evidence.capturedAt)&&dt(first)<=dt(at)))throw Error("source time");
  const target=safePath(dest,rel),folder=path.dirname(target);
  const exists=fs.existsSync(folder)&&fs.readdirSync(folder).some(n=>/^\d{8}T\d{9}Z\.json$/.test(n));
  let status=exists?"existing_cache_preserved":authorized?"ready_to_import":"mirror_authorization_required";
  if(fs.existsSync(target)&&hash(fs.readFileSync(target))!==sha)throw Error("existing cache conflicts");
  manifest.push({...evidence,rel,sha,originalCommit:commits[0],originalFirstGitAt:first,status,raw,target});
 }
 // Validate every source before adding anything. Never overwrite any target or backdate an import.
 const imports=manifest.filter(x=>x.status==="ready_to_import");
 for(const x of imports){fs.mkdirSync(path.dirname(x.target),{recursive:true,mode:0o700});fs.writeFileSync(x.target,x.raw,{flag:"wx",mode:0o600});x.status="imported_historical_only";}
 const entries=manifest.map(({raw,target,...x})=>x);
 const report={kind:"nba_private_history_recovery_v1",sourceRevision:PIN,importedAt:at,authorized,entries,importedSeasons:imports.length,originalSourceClockPreserved:true,newDestinationCommitClockNotBackdated:true,officialFinalClockVerified:false,freshBoardsImported:0,forecastsImported:0,paidRequests:0,rawRowsPublished:0};
 if(imports.length){
  const rel="research/nba-history-recovery/"+at.replace(/[-:.]/g,"")+".json",receipt=safePath(dest,rel);
  fs.mkdirSync(path.dirname(receipt),{recursive:true,mode:0o700});fs.writeFileSync(receipt,JSON.stringify(report)+"\n",{flag:"wx",mode:0o600});
 }
 return report;
}
function providerSummary(doc){
 if(doc?.kind!=="restricted_esports_free_provider_observations_v1")throw Error("provider schema");
 const out=Object.fromEntries(titles.map(t=>[t,{nativeFixtures:0,nativeCompletedMaps:0,nativePlayerRows:0,originalOffersVerified:0,independentlyVerifiedMapRows:0}]));
 for(const f of [...(doc.pandascore?.fixtures||[]),...(doc.grid?.fixtures||[])])if(out[f.title])out[f.title].nativeFixtures++;
 for(const g of doc.opendota?.games||[]){out.DOTA2.nativeCompletedMaps++;out.DOTA2.nativePlayerRows+=Array.isArray(g.players)?g.players.length:0;}
 for(const s of doc.grid?.finals||[]){const t=s.fixture?.title;if(!out[t])continue;for(const g of s.games||[]){if(g.providerReportedGameFinal!==true)continue;out[t].nativeCompletedMaps++;out[t].nativePlayerRows+=Array.isArray(g.players)?g.players.length:0;}}
 return out;
}
function providerArchive(root){
 const dir="research/esports-free-providers",base=safePath(root,dir),reports=[];
 if(!fs.existsSync(base))return {files:0,countsAreNotUnique:true,byTitle:providerSummary({kind:"restricted_esports_free_provider_observations_v1"})};
 const counts=providerSummary({kind:"restricted_esports_free_provider_observations_v1"});
 for(const name of fs.readdirSync(base).filter(n=>/^\d+-\d+\.json$/.test(n)).sort().slice(-100)){
  const rel=dir+"/"+name,p=safePath(root,rel);
  try{
   if(fs.statSync(p).size>16e6||git(root,["status","--porcelain","--",rel]))continue;
   const commits=git(root,["log","--format=%H","--",rel]).split("\n").filter(Boolean);
   if(commits.length!==1)continue;
   const d=JSON.parse(fs.readFileSync(p));if(!(dt(d.observedAt)<=dt(git(root,["show","-s","--format=%cI",commits[0]]))))continue;
   const s=providerSummary(d);reports.push(d.observedAt);
   for(const t of titles)for(const k of Object.keys(s[t]))counts[t][k]+=s[t][k];
  }catch{}
 }
 return {files:reports.length,latestObservedAt:reports.sort().at(-1)||null,countsAreNotUnique:true,byTitle:counts,sourceNativeOnly:true};
}
if(require.main===module){try{
 const [s,d,e]=process.argv.slice(2),source=fs.realpathSync(s),dest=fs.realpathSync(d),esports=fs.realpathSync(e);
 const r=recover(source,dest,{authorized:process.env.NBA_MIRROR_SOURCE_AUTHORIZED==="1"});
 console.log(JSON.stringify({kind:"private_source_connection_repair_v1",nbaDirectAuthorized:process.env.NBA_DIRECT_SOURCE_AUTHORIZED==="1",nba:r,esports:providerArchive(esports),paidRequests:0,rawRowsPublished:0,forecastFreezeVerified:false}));
}catch{console.error("Private source connection repair failed closed");process.exitCode=1;}}
module.exports={validate,providerSummary,providerArchive,recover,files,PIN};
