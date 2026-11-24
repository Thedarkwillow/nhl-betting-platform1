"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {SOURCES}=require("../src/free-source-integration.cjs"),{project}=require("../src/nhl-open-shot-quality-shadow.cjs");
const root=path.resolve(__dirname,".."),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")),git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:20000,maxBuffer:64*1024*1024}).trim();
const opt=p=>{try{return read(p)}catch{return null;}};
const fresh=(s,t,ms)=>Number.isFinite(Date.parse(s))&&Date.parse(s)<=t&&t-Date.parse(s)<=ms;
function main(){
 const now=new Date().toISOString(),t=Date.parse(now),approved=opt("outputs/approved-nhl-sources/latest.json"),nfl=opt("outputs/nfl/history/manifest.json"),eff=opt("outputs/nfl/backtests/free-efficiency-latest.json"),coverage={};
 const history=opt("outputs/health/source-completion-readiness-latest.json");
 const saved=(k)=>nfl?.datasets?.filter(d=>d.dataset===k&&d.status==="saved").map(d=>({season:d.season,records:d.records}))||[];
 coverage["MoneyPuck"]={capturedAt:approved?.generatedAt??null,skaters:approved?.moneyPuck?.skaters?.matchedRows??0,teams:approved?.moneyPuck?.teams?.matchedRows??0,goalies:approved?.moneyPuck?.goalies?.matchedRows??0,freshForNewShadow:fresh(approved?.generatedAt,t,14400000)};
 coverage["Daily Faceoff"]={capturedAt:approved?.generatedAt??null,health:approved?.sourceHealth??null};
 coverage["NHL Stats"]={periodDays:history?.periodCoverage?.accountedDays??null,calendarDays:history?.periodCoverage?.calendarDays??null,editorialProjectedGames:approved?.sourceHealth?.nhlEditorialGames??null};
 for(const [name,keys] of [["nflverse",["player_weekly","team_weekly","snap_counts","schedule","pbp_specialty_events"]],["FTN Charting",["ftn_charting_research_only"]],["NFL Next Gen Stats",["nextgen_passing","nextgen_receiving","nextgen_rushing"]],["Pro Football Reference",["pfr_pass","pfr_rush","pfr_rec","pfr_def"]]])coverage[name]={manifestAt:nfl?.collectedAt??null,datasets:Object.fromEntries(keys.map(k=>[k,saved(k)]))};
 coverage.rbsdm={replacement:"nflverse-derived EPA and success rate, no site scrape",at:eff?.generatedAt??null,rows:eff?.teamGameTypeRows??null};
 coverage.SumerSports={replacement:"same independently derived efficiency inputs",directIngestion:false};
 coverage.FantasyPros={replacement:"nflverse prior usage research",directIngestion:false};
 const report={kind:"private_free_source_coverage_v1",generatedAt:now,sources:SOURCES.map(s=>({...s,evidence:coverage[s.name]??null})),nhl:{status:"no_fresh_original_source",frozen:0},modelPromoted:false,publicRawRows:0};
 const sourceDir="outputs/approved-nhl-sources/snapshots";
 const sourceFile=fresh(approved?.generatedAt,t,14400000)&&fs.existsSync(path.join(root,sourceDir))?fs.readdirSync(path.join(root,sourceDir)).filter(x=>x.endsWith(".json")).sort().reverse().find(x=>opt(sourceDir+"/"+x)?.generatedAt===approved.generatedAt):null;
 let approvedCommit=null;
 if(sourceFile){const rel=sourceDir+"/"+sourceFile,cs=git(["log","--format=%H","--",rel]).split("\n").filter(Boolean);if(cs.length===1){const c=git(["show","-s","--format=%cI",cs[0]]),doc=JSON.parse(git(["show",cs[0]+":"+rel]));if(Date.parse(c)<=t&&Date.parse(c)>=Math.floor(Date.parse(approved.generatedAt)/1000)*1000&&JSON.stringify(doc)===JSON.stringify(approved))approvedCommit=cs[0];}}
 const dir="outputs/research/snapshots",list=fs.readdirSync(path.join(root,dir)).filter(x=>/^\d{8}T\d{6}Z\.json$/.test(x)).sort();
 if(list.length&&approvedCommit){
  const file=dir+"/"+list.at(-1),s=read(file),commits=git(["log","--format=%H","--",file]).split("\n").filter(Boolean);
  if(commits.length===1&&s.source==="partner-api.prizepicks.com"&&s.boardFresh===true&&fresh(s.generatedAt,t,1800000)){
   const c=git(["show","-s","--format=%cI",commits[0]]);
   if(Date.parse(c)<=t&&Date.parse(c)>=Math.floor(Date.parse(s.generatedAt)/1000)*1000){
    const out=[],seen=new Set();
    for(const p of s.rankedProps||[]){const k=JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier,p.lean]);if(seen.has(k)||Date.parse(p.gameStartAt||p.eventStartsAt)<=Date.parse(c)+900000)continue;seen.add(k);const v=project(p,approved,now);if(v)out.push(v);}
    if(out.length){const folder="outputs/research/free-source-shadow";fs.mkdirSync(path.join(root,folder),{recursive:true});const stamp=now.slice(0,19).replace(/[-:]/g,"")+"Z";fs.writeFileSync(path.join(root,folder,stamp+".json"),JSON.stringify({kind:"nhl_open_shot_quality_original_line_shadow_v1",generatedAt:now,sourceSnapshot:file,sourceCommit:commits[0],approvedSourcePath:sourceDir+"/"+sourceFile,approvedSourceCommit:approvedCommit,rows:out,calibrated:false,modelPromoted:false})+"\n",{flag:"wx"});}
    report.nhl={status:out.length?"shadow_created_pending_original_git_commit":"no_eligible_recent_inputs",frozen:out.length,sourceSnapshot:file};
   }
  }
 }
 fs.writeFileSync(path.join(root,"outputs/health/free-source-coverage-latest.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({kind:report.kind,nhl:report.nhl,sources:SOURCES.length,nflEfficiencyRows:eff?.teamGameTypeRows??0,modelPromoted:false}));
}
if(require.main===module)main();
