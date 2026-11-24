"use strict";
// Original archived NBA research only. No inferred DNP, payout or app settlement.
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {gradePaper,teams,fantasy}=require("../src/nba-research-pipeline-v1.cjs");
const ROOT=path.resolve(__dirname,".."),dir="outputs/nba/rankings",dt=Date.parse;
const git=args=>execFileSync("git",args,{cwd:ROOT,encoding:"utf8",timeout:30000,maxBuffer:128*1024*1024,stdio:["ignore","pipe","pipe"]}).trim();
function official(doc,gameId,startAt,observedAt){
 const g=doc?.game;
 if(Number(g?.gameId)!==gameId||g.gameStatus!==3||!Number.isFinite(dt(g.gameTimeUTC))||Math.abs(dt(g.gameTimeUTC)-dt(startAt))>300000||!(dt(observedAt)>dt(startAt)))return null;
 const rows=new Map();
 for(const t of [g.homeTeam,g.awayTeam]){
  if(!t?.teamTricode||!Array.isArray(t.players)||t.players.length<5)return null;
  for(const p of t.players){
   if(!Number.isInteger(p.personId)||rows.has(p.personId))return null;
   const s=p.statistics||{},appeared=p.played==="1"||p.played===1||p.played===true;
   const counts={points:s.points,rebounds:s.reboundsTotal,assists:s.assists,threePointersMade:s.threePointersMade,steals:s.steals,blocks:s.blocks,turnovers:s.turnovers};
   if(!appeared||!Object.values(counts).every(x=>Number.isInteger(x)&&x>=0))continue;
   rows.set(p.personId,{gameId,playerId:p.personId,team:teams(t.teamTricode),officialGameFinalVerified:true,identityVerified:true,appeared:true,...counts,prizePicksFantasyScore:fantasy(counts),
    pointsReboundsAssists:counts.points+counts.rebounds+counts.assists,pointsRebounds:counts.points+counts.rebounds,pointsAssists:counts.points+counts.assists,reboundsAssists:counts.rebounds+counts.assists});
  }
 }
 return rows;
}
function gradeFrame(frame,commitAt,finals){
 if(frame?.kind!=="nba_private_research_rankings_v1"||!Array.isArray(frame.rows)||frame.calibrated!==false||
 !Number.isFinite(dt(frame.generatedAt))||!Number.isFinite(dt(commitAt))||dt(frame.generatedAt)>dt(commitAt)+999||dt(frame.boardCapturedAt)>dt(frame.generatedAt))throw Error("Unverified original NBA freeze");
 const rows=[],seen=new Set();
 for(const p of frame.rows){
  if(p.researchOnly!==true||!(dt(commitAt)<dt(p.gameStartAt)-900000)||p.sourceObservedAt!==frame.boardCapturedAt)continue;
  const id=JSON.stringify([p.gameId,p.playerId,p.market,p.line,p.tier,p.offeredSide]);if(seen.has(id))continue;seen.add(id);
  const x=finals.get(p.gameId)?.get(p.playerId);
  const status=gradePaper(p,x?.team===p.team?x:null);
  rows.push({id,gameId:p.gameId,gameDate:new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(p.gameStartAt)),playerId:p.playerId,market:p.market,line:p.line,tier:p.tier,side:p.offeredSide,status,officialStat:status==="pending"?null:x[p.market],rawSelectedEstimate:p.rawSelectedEstimate});
 }
 return rows;
}
function prospectiveSummary(rows){
 const accepted=new Map(),conflicts=new Set();
 for(const r of rows){
  if(!r?.id||!["correct","incorrect"].includes(r.status)||!Number.isFinite(r.rawSelectedEstimate)||r.rawSelectedEstimate<=.5||r.rawSelectedEstimate>=1||!/^\d{4}-\d{2}-\d{2}$/.test(r.gameDate||"")||!Number.isInteger(r.gameId))continue;
  const old=accepted.get(r.id);if(old&&(old.status!==r.status||old.sourceCommit!==r.sourceCommit||old.rawSelectedEstimate!==r.rawSelectedEstimate))conflicts.add(r.id);else if(!old)accepted.set(r.id,r);
 }
 const groups={};for(const [id,r] of accepted){if(conflicts.has(id))continue;
  const k=JSON.stringify([r.tier,r.market,r.side]),a=groups[k]??={n:0,wins:0,brier:0,logLoss:0,meanP:0,games:new Set(),dates:new Set()};
  const y=Number(r.status==="correct"),p=r.rawSelectedEstimate;a.n++;a.wins+=y;a.brier+=(p-y)**2;a.logLoss-=y?Math.log(p):Math.log1p(-p);a.meanP+=p;a.games.add(r.gameId);a.dates.add(r.gameDate);
 }
 return {kind:"nba_actual_original_future_validation_v1",conflictingGradesExcluded:conflicts.size,groups:Object.fromEntries(Object.entries(groups).map(([k,a])=>[k,{decided:a.n,distinctGames:a.games.size,distinctDates:a.dates.size,hitRate:a.wins/a.n,meanRawProbability:a.meanP/a.n,brier:a.brier/a.n,logLoss:a.logLoss/a.n,minimumEvidenceMet:a.n>=100&&a.games.size>=30&&a.dates.size>=10,approved:false}])),calibrationApproved:false,modelPromoted:false,payoutVerified:false};
}
async function main(){
 if(process.env.NBA_DIRECT_SOURCE_AUTHORIZED!=="1"){console.log(JSON.stringify({status:"blocked_direct_nba_source_authorization",providerRequests:0}));return;}
 const root=path.join(ROOT,dir);if(!fs.existsSync(root)){console.log(JSON.stringify({status:"no_original_nba_research_archives",providerRequests:0}));return;}
 const names=fs.readdirSync(root).filter(n=>/^\d{8}T\d{9}Z\.json$/.test(n)).sort(),frames=[],games=new Map(),now=new Date().toISOString();
 const prior=new Map(),conflicts=new Set(),gradeDir="outputs/nba/paper-grades",gradeRoot=path.join(ROOT,gradeDir);
 if(fs.existsSync(gradeRoot))for(const n of fs.readdirSync(gradeRoot).filter(n=>/^\d{8}T\d{9}Z\.json$/.test(n)).sort()){
  try{const p=gradeDir+"/"+n,c=git(["log","--format=%H","--",p]).split("\n").filter(Boolean);if(c.length!==1)continue;const report=JSON.parse(git(["show",c[0]+":"+p]));if(report.kind!=="nba_original_frozen_paper_grade_v1"||report.actualWagersPlaced!==0||report.appSettlementVerified!==false)continue;
   for(const x of report.rows||[]){if(!["correct","incorrect","push"].includes(x.status)||!x.id||!x.sourceCommit)continue;const y=prior.get(x.id);if(y&&(y.status!==x.status||y.officialStat!==x.officialStat||y.sourceCommit!==x.sourceCommit))conflicts.add(x.id);else if(!y)prior.set(x.id,x);}
  }catch{}
 }
 for(const n of names){try{
  const p=dir+"/"+n,c=git(["log","--format=%H","--",p]).split("\n").filter(Boolean);if(c.length!==1)continue;
  const frame=JSON.parse(git(["show",c[0]+":"+p])),at=git(["show","-s","--format=%cI",c[0]]);
  for(const r of frame.rows||[])if(dt(now)-dt(r.gameStartAt)>3*3600000&&dt(now)-dt(r.gameStartAt)<72*3600000&&dt(at)<dt(r.gameStartAt)-900000){const id=JSON.stringify([r.gameId,r.playerId,r.market,r.line,r.tier,r.offeredSide]);if(!prior.has(id))games.set(r.gameId,r.gameStartAt);}
  frames.push({frame,at,sha:c[0]});
 }catch{}}
 const finals=new Map();let requests=0;
 for(const [id,start] of [...games].slice(0,12)){
  try{requests++;const r=await fetch("https://cdn.nba.com/static/json/liveData/boxscore/boxscore_"+String(id).padStart(10,"0")+".json",{redirect:"error",signal:AbortSignal.timeout(15000),headers:{Accept:"application/json"}});
   if(!r.ok)continue;const o=official(await r.json(),id,start,new Date().toISOString());if(o)finals.set(id,o);
  }catch{}
 }
 const grades=new Map(),firstOffers=new Set();for(const {frame,at,sha} of frames)for(const x of gradeFrame(frame,at,finals)){
 const k=JSON.stringify([x.gameId,x.playerId,x.market,x.line,x.tier]);if(firstOffers.has(k))continue;firstOffers.add(k);
 const old=prior.get(x.id);if(conflicts.has(x.id))continue;
 if(old&&old.sourceCommit===sha){if(x.status!=="pending"&&(old.status!==x.status||old.officialStat!==x.officialStat))continue;grades.set(x.id,old);}
 else grades.set(x.id,{...x,sourceCommit:sha});
 }
 const rows=[...grades.values()],report={kind:"nba_original_frozen_paper_grade_v1",generatedAt:new Date().toISOString(),officialFinalGames:finals.size,rows,conflictingHistoricalGradesExcluded:conflicts.size,prospectiveValidation:prospectiveSummary(rows),researchOnly:true,actualWagersPlaced:0,appSettlementVerified:false,payoutVerified:false,calibrated:false,paidRequests:0};
 if(rows.length){const f=path.join(ROOT,"outputs/nba/paper-grades",report.generatedAt.replace(/[-:.]/g,"")+".json");fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(report)+"\n",{flag:"wx",mode:0o600});}
 console.log(JSON.stringify({status:"research_grade_only",officialFinalGames:finals.size,registered:rows.length,decided:rows.filter(x=>["correct","incorrect"].includes(x.status)).length,officialSourceRequests:requests,paidRequests:0}));
}
if(require.main===module)main().catch(()=>{console.error("NBA paper grade failed closed");process.exitCode=1;});
module.exports={official,gradeFrame,prospectiveSummary};
