"use strict";
const fs=require("node:fs"),path=require("node:path"),{execFileSync}=require("node:child_process");
const {dunkHistoryEstimate,dunkHistory}=require("./collect-nba-alternate-providers.cjs");
const root=path.resolve(__dirname,".."),base="outputs/nba/authorized-providers",dir=base+"/cohort-v1";
const plan=require("../config/nba/dunk-cohort-study-v1.json");
const {teamSnapshot,buildRows,audit,scores}=require("../src/nba-context-calibration-v2.cjs");
const {normalizeGame,roleSplits,positionDefense,priorPosition,pregameAbsenceCandidate}=require("../src/nba-rotation-position-v3.cjs");
const contextDates=["2026-01-05","2026-01-12","2026-01-19","2026-01-26","2026-02-02","2026-02-09"];
const norm=s=>String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const day=t=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
const dt=Date.parse,finite=Number.isFinite,integer=x=>Number.isInteger(x)&&x>=0;
const git=args=>execFileSync("git",args,{cwd:root,encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}).trim();
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8")),exists=p=>fs.existsSync(path.join(root,p));
function save(rel,x){const p=path.join(root,rel);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(x,null,2)+"\n",{flag:"wx",mode:0o600});}
function normalizeIdentity(raw,name){
 const d=raw?.data;if(!Array.isArray(d?.players)||d.count!==d.players.length)throw Error("identity schema");
 const a=d.players.filter(x=>norm(x.name)===norm(name)&&/^\d+$/.test(String(x.player_id)));
 if(a.length!==1)throw Error("ambiguous provider identity");
 return {providerPlayerId:String(a[0].player_id),player:a[0].name,namespace:"dunkapi:nba"};
}
function normalizeLogs(raw,id,season){
 const d=raw?.data;if(String(d?.player_id)!==id||!Array.isArray(d.games)||d.count!==d.games.length||d.next_offset!=null||d.games.length>100)throw Error("incomplete game log page");
 const rows=[],nonAppearances=[],seen=new Set(),fields=["pts","reb","ast","tpm","fga","fta","tov"];let dnp=0;
 for(const g of d.games){
  if(typeof g.game_id!=="string"||!g.game_id||seen.has(g.game_id)||!Number.isFinite(dt(g.date))||g.season!==season||g.season_type!==2||typeof g.did_not_play!=="boolean"||!/^[A-Z]{2,3}$/.test(g.opponent||""))throw Error("invalid game identity");
  seen.add(g.game_id);if(g.did_not_play){dnp++;nonAppearances.push({gameId:g.game_id,date:g.date,opponent:g.opponent,reason:typeof g.reason==="string"?g.reason:null,finalParticipationOnly:true});continue;}
  if(!finite(g.minutes)||g.minutes<=0||g.minutes>70||!fields.every(k=>integer(g[k])))throw Error("incomplete played game statistics");
  rows.push({gameId:g.game_id,date:g.date,opponent:g.opponent,minutes:g.minutes,points:g.pts,rebounds:g.reb,assists:g.ast,threePointersMade:g.tpm,pra:g.pts+g.reb+g.ast,usageProxyPerMinute:(g.fga+.44*g.fta+g.tov)/g.minutes,home:g.home,starter:typeof g.starter==="boolean"?g.starter:null});
 }
 return {kind:"nba_dunk_full_player_log_v1",providerPlayerId:id,season,source:"DunkAPI",capturedAt:new Date().toISOString(),completeProviderPagination:true,officialIndependentlyVerified:false,playedRows:rows.length,dnp,nonAppearances,rows:rows.sort((a,b)=>a.date.localeCompare(b.date))};
}
const field={player_points:"points",player_rebounds:"rebounds",player_assists:"assists",player_threes:"threePointersMade",player_points_rebounds_assists:"pra"};
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const smooth=(a,line)=>(1+a.filter(x=>x>line).length)/(2+a.filter(x=>x!==line).length);
const odds=x=>Number.isInteger(x)&&Math.abs(x)>=100?(x<0?-x/(-x+100):100/(100+x)):null;
function evaluate(log,history){
 if(log?.kind!=="nba_dunk_full_player_log_v1"||history?.kind!=="nba_dunkapi_historical_market_research_v1"||log.providerPlayerId!==history.request.player_id)throw Error("identity namespace mismatch");
 const m=field[history.request.market];if(!m)throw Error("unsupported market");
 const rows=[],excluded={identityOrActual:0,warmup:0,unsupportedLine:0};
 for(const r of history.rows){
  const matches=log.rows.filter(x=>x.gameId===r.providerGameId&&x.date===r.gameDate);
  if(matches.length!==1||matches[0][m]!==r.actual){excluded.identityOrActual++;continue;}
  const target=matches[0],past=log.rows.filter(x=>x.date<target.date).slice(-30);
  if(past.length<12){excluded.warmup++;continue;}
  if(r.closingLine%1!==.5){excluded.unsupportedLine++;continue;}
  const line=r.closingLine,old=smooth(past.map(x=>x[m]),line),recent=past.slice(-10),rec=smooth(recent.map(x=>x[m]),line);
  const mins=mean(recent.map(x=>x.minutes)),usage=mean(recent.map(x=>x.usageProxyPerMinute));
  const minAdjusted=smooth(past.map(x=>x[m]/x.minutes*mins),line);
  const opp=past.filter(x=>x.opponent===target.opponent),oppAdjusted=opp.length>=4?.75*old+.25*smooth(opp.map(x=>x[m]),line):null;
  const a=odds(r.overOdds),b=odds(r.underOdds);
  rows.push({gameId:target.gameId,date:target.date,playerId:log.providerPlayerId,market:history.request.market,y:Number(r.actual>line),line,actual:r.actual,old,rec,minAdjusted,oppAdjusted,expectedMinutes:mins,priorUsageProxyPerMinute:usage,opponentSample:opp.length,marketHigher:a!==null&&b!==null?a/(a+b):null});
 }
 return {rows,excluded,fullPriorGameLogUsed:true,trueUsageRateVerified:false,teamContextVerified:false,paceAndDefenseVerified:false};
}
function metrics(rows,predict){
 const a=rows.map(x=>({x,p:predict(x)})).filter(x=>finite(x.p)&&x.p>0&&x.p<1);
 return {n:a.length,distinctGames:new Set(a.map(y=>y.x.gameId)).size,distinctDates:new Set(a.map(y=>y.x.date)).size,brier:mean(a.map(y=>(y.p-y.x.y)**2)),logLoss:mean(a.map(y=>-(y.x.y?Math.log(y.p):Math.log1p(-y.p)))),directionalAccuracy:mean(a.filter(y=>y.p!==.5).map(y=>Number((y.p>.5)===(y.x.y===1))))};
}
function compare(rows,cut=plan.holdoutStarts){
 const seen=new Set();for(const x of rows){const k=[x.gameId,x.playerId,x.market].join("|");if(seen.has(k))throw Error("duplicate evaluation");seen.add(k);}
 const dev=rows.filter(x=>x.date<cut),hold=rows.filter(x=>x.date>=cut);
 const candidates=plan.weights.map(w=>({w,development:metrics(dev,x=>(1-w)*x.old+w*x.rec)}));
 const selected=dev.length?candidates.reduce((a,b)=>a.development.brier<=b.development.brier?a:b).w:null;
 const paired=hold.filter(x=>finite(x.marketHigher));
 const commonOpp=hold.filter(x=>finite(x.oppAdjusted));
 return {developmentRows:dev.length,holdoutRows:hold.length,holdoutStarts:cut,weightTrials:candidates,selectedWeight:selected,holdoutBaseline:metrics(hold,x=>x.old),holdoutOriginal:metrics(hold,x=>.65*x.old+.35*x.rec),holdoutSelected: selected===null?null:metrics(hold,x=>(1-selected)*x.old+selected*x.rec),holdoutMinutes:metrics(hold,x=>x.minAdjusted),opponentPaired:{baseline:metrics(commonOpp,x=>x.old),adjusted:metrics(commonOpp,x=>x.oppAdjusted)},marketPaired:{baseline:metrics(paired,x=>x.old),original:metrics(paired,x=>.65*x.old+.35*x.rec),market:metrics(paired,x=>x.marketHigher)},retrospectiveOnly:true,correlatedPlayerGameRows:true,prospectiveApproval:false,productionModelChanged:false};
}
function tasks(){
 const a=[];
 for(const p of plan.players){
  const slug=norm(p.name),identity=dir+"/identity/"+slug+".json";
  if(!p.verifiedId&&!exists(identity)){a.push({kind:"identity",slug,name:p.name,cost:1,path:identity,tool:"search_players",q:{name:p.name,limit:10,league:"nba"}});continue;}
  const id=p.verifiedId||read(identity).providerPlayerId;
  const log=dir+"/logs/"+slug+".json";
  if(!exists(log)){a.push({kind:"log",slug,name:p.name,cost:5,path:log,tool:"get_player_games",q:{player_id:id,season:plan.season,season_type:"regular",limit:100,offset:0,league:"nba"}});continue;}
  for(const m of p.markets){const file=dir+"/history/"+slug+"-"+m+".json";if(!exists(file))a.push({kind:"history",slug,name:p.name,cost:10,path:file,tool:"get_prop_history",q:{player_id:id,market:m,from_date:plan.from,to_date:plan.to,limit:plan.maxHistoryGames,league:"nba"}});}
 }
 for(const before of contextDates){const file=dir+"/team-context/"+before+".json";if(!exists(file))a.push({kind:"team",name:"All NBA teams",cost:5,path:file,tool:"get_team_stats",q:{season:plan.season,season_type:"regular",before,league:"nba"}});}
 // Fixed pre-period coverage pilot: up to 11 Jokic games and one per other player. No result selection.
 const wanted=new Map();
 for(const p of plan.players){const lp=dir+"/logs/"+norm(p.name)+".json";if(!exists(lp))continue;
  const prior=read(lp).rows.filter(x=>x.date<plan.from).sort((x,y)=>x.date.localeCompare(y.date));
  for(const g of (p.verifiedId==="3112335"?prior.slice(-11):prior.slice(-1))){if(!wanted.has(g.gameId))wanted.set(g.gameId,g.date);}
 }
 for(const [id,date] of [...wanted].sort((x,y)=>x[1].localeCompare(y[1])||x[0].localeCompare(y[0]))){const file=dir+"/rotation-box/"+id+".json";if(!exists(file))a.push({kind:"box",name:"Historical game "+id,cost:5,path:file,tool:"get_game",q:{game_id:id,league:"nba"}});}
 return a.sort((x,y)=>({log:0,identity:1,team:2,history:3,box:4}[x.kind]-{log:0,identity:1,team:2,history:3,box:4}[y.kind]));
}
function priorReservationKeys(){
 const p=path.join(root,dir,"reservations"),keys=new Set();if(!fs.existsSync(p))return keys;
 for(const n of fs.readdirSync(p).filter(n=>n.endsWith(".json"))){const x=read(dir+"/reservations/"+n);if(typeof x.tool!=="string"||!x.request)throw Error("invalid prior reservation");keys.add(JSON.stringify([x.tool,x.request]));}return keys;
}
async function call(key,tool,q){const res=await fetch("https://mcp.dunkapi.com/v1/"+tool,{method:"POST",headers:{"x-api-key":key,Accept:"application/json","Content-Type":"application/json"},redirect:"error",signal:AbortSignal.timeout(25000),body:JSON.stringify(q)});if(!res.ok)throw Error("provider HTTP "+res.status);return res.json();}
function studySpent(){const p=path.join(root,dir,"reservations");if(!fs.existsSync(p))return 0;return fs.readdirSync(p).filter(n=>n.endsWith(".json")).reduce((s,n)=>s+read(dir+"/reservations/"+n).maxCredits,0);}
async function collectOne(){
 if(process.env.NBA_DUNK_COHORT_MANUAL!=="1"||!process.env.NBA_DUNKAPI_API_KEY)throw Error("manual cohort approval and key required");
 const date=day(new Date()),shared=base+"/dunk-reservations/"+date+".json",marker=dir+"/reservations/"+date+".json";
 if(exists(shared)||exists(marker))return {status:"daily_reservation_already_used",meteredRequests:0};
 const pending=tasks(),reserved=priorReservationKeys();
 const task=pending.find(t=>!reserved.has(JSON.stringify([t.tool,t.q])));if(!task)return {status:pending.length?"pending_previously_reserved_manual_review":"complete",meteredRequests:0};
 if(process.env.NBA_DUNK_COHORT_EXPECTED_TASK==="jokic_log_20261125"&&(date!=="2026-11-25"||task.kind!=="log"||task.tool!=="get_player_games"||task.q.player_id!=="3112335"||task.q.season!==2026||task.cost!==5))return {status:"one_time_task_not_eligible",meteredRequests:0};
 if(process.env.NBA_DUNK_COHORT_EXPECTED_TASK==="bounded_daily_cohort_v2"){
  if(date<"2026-11-26"||date>"2027-01-31")return {status:"outside_authorized_study_window",meteredRequests:0};
  if(!exists(dir+"/logs/nikolajokic.json"))return {status:"awaiting_first_verified_player_log",meteredRequests:0};
  if(pending.some(t=>reserved.has(JSON.stringify([t.tool,t.q]))))return {status:"previous_unresolved_request_manual_review",meteredRequests:0};
 }
 if(studySpent()+task.cost>plan.maxStudyCredits+130)throw Error("study credit cap");
 const key=process.env.NBA_DUNKAPI_API_KEY,estimate=task.kind==="history"?await dunkHistoryEstimate(key,task.q):null;
 if(estimate&&estimate.credits>task.cost)throw Error("estimate exceeds reserved cap");
 git(["fetch","-q","origin","main"]);if(git(["branch","--show-current"])!=="main"||git(["rev-parse","HEAD"])!==git(["rev-parse","origin/main"]))throw Error("concurrent Git update; no request");
 const reservation={kind:"nba_dunk_cohort_reservation_v1",date,createdAt:new Date().toISOString(),maxCredits:task.cost,tool:task.tool,request:task.q};
 save(shared,reservation);save(marker,reservation);git(["add","-f",shared,marker]);git(["commit","-qm","research: reserve one bounded NBA cohort data request"]);git(["push","-q","origin","HEAD:main"]);
 let doc;if(task.kind==="history")doc=await dunkHistory(key,task.q,{estimate,reservation:{committed:true,maxCredits:10,request:task.q}});
 else{const raw=await call(key,task.tool,task.q);doc=task.kind==="identity"?normalizeIdentity(raw,task.name):task.kind==="team"?teamSnapshot(raw,task.q,new Date().toISOString()):task.kind==="box"?normalizeGame(raw,task.q.game_id,new Date().toISOString()):normalizeLogs(raw,task.q.player_id,plan.season);}
 save(task.path,doc);
 return {status:"collected",task:task.kind,player:task.name,market:task.q.market||null,reservedCredits:task.cost,meteredRequests:1,studyReservedCredits:studySpent()};
}
function report(){
 const rows=[],coverage=[],advanced=[],rotationCoverage=[];
 const boxDir=path.join(root,dir,"rotation-box"),boxes=fs.existsSync(boxDir)?fs.readdirSync(boxDir).filter(x=>/^\d+\.json$/.test(x)).map(x=>read(dir+"/rotation-box/"+x)):[];
 const snapshots=contextDates.map(d=>dir+"/team-context/"+d+".json").filter(exists).map(read);
 for(const p of plan.players){const slug=norm(p.name),log=dir+"/logs/"+slug+".json";
  for(const m of p.markets){const file=dir+"/history/"+slug+"-"+m+".json";if(!exists(log)||!exists(file))continue;const a=evaluate(read(log),read(file));rows.push(...a.rows);const logged=read(log),f=buildRows(logged,read(file),snapshots);for(const row of f.rows){const t=logged.rows.find(x=>x.gameId===row.gameId),prior=priorPosition(boxes,row.playerId,row.date),marketField=field[row.market];const pos=prior&&t?positionDefense(boxes,row.date,t.opponent,prior.position,marketField):null;const splits=roleSplits(boxes,row.playerId,row.date);rotationCoverage.push({id:row.id,positionKnown:!!prior,positionDefenseAvailable:!!pos,adequateHistoricalTeammateSplits:splits.filter(x=>x.minSampleMet).length});row.positionDefense=pos;row.teammateAbsenceAdjustment=null;
   const past=logged.rows.filter(x=>x.date<row.date).sort((a,b)=>a.date.localeCompare(b.date)).slice(-30),threshold=read(file).rows.find(x=>x.providerGameId===row.gameId)?.closingLine;
   row.positionDefenseP=pos&&past.length>=12&&finite(threshold)&&past.every(x=>x.minutes>0&&finite(x[marketField]))?smooth(past.map(x=>x[marketField]/x.minutes*row.predictedMinutes*pos.shrunkRatio),threshold):null;
   const availabilityFile=dir+"/pregame-availability/"+row.gameId+".json";const availability=exists(availabilityFile)?read(availabilityFile):null;
   row.teammateAbsenceAdjustment=pregameAbsenceCandidate(boxes,availability,{gameId:row.gameId,date:row.date},row.playerId,marketField,threshold,past,row.predictedMinutes);row.teammateAbsenceP=row.teammateAbsenceAdjustment?.probability??null;}advanced.push(...f.rows);coverage.push({player:p.name,market:m,rows:a.rows.length,excluded:a.excluded});}
 }
 const pending=tasks(),reserved=priorReservationKeys(),blocked=pending.filter(t=>reserved.has(JSON.stringify([t.tool,t.q])));
 const pilotPath=base+"/dunk-history/20261124T190300595Z.json",pilotLog=dir+"/logs/nikolajokic.json";
 const pilotReplay=exists(pilotPath)&&exists(pilotLog)?(()=>{const a=evaluate(read(pilotLog),read(pilotPath));return {source:pilotPath,rows:a.rows.length,excluded:a.excluded,baseline:metrics(a.rows,x=>x.old),original:metrics(a.rows,x=>.65*x.old+.35*x.rec),minutes:metrics(a.rows,x=>x.minAdjusted),excludedFromCohortWeightSelection:true};})():null;
 return {kind:"nba_dunk_cohort_status_v1",generatedAt:new Date().toISOString(),studyReservedCredits:studySpent(),studyCreditCap:plan.maxStudyCredits+130,teamContextSnapshots:snapshots.length,advancedAudit:audit(advanced),rotationPosition:{boxScores:boxes.length,positionKnownRows:rotationCoverage.filter(x=>x.positionKnown).length,positionDefenseRows:rotationCoverage.filter(x=>x.positionDefenseAvailable).length,withWithoutAdequateRows:rotationCoverage.filter(x=>x.adequateHistoricalTeammateSplits>0).length,verifiedHistoricalPregameAbsenceRows:advanced.filter(x=>finite(x.teammateAbsenceP)).length,allLeagueCoverage:false},coverage,remainingRunnableTasks:pending.length-blocked.length,previouslyReservedTasksAwaitingReview:blocked.length,pilotReplay,results:compare(rows),sourceRights:"private DunkAPI research; no raw data redistribution",actualWagersPlaced:0};
}
async function main(){const collect=process.argv.includes("--collect-one")?await collectOne():{status:"offline",meteredRequests:0};const out={...report(),collection:collect};console.log(JSON.stringify(out));}
if(require.main===module)main().catch(e=>{console.error("Cohort stopped: "+String(e.message).split("\n")[0].slice(0,160));process.exitCode=1;});
module.exports={normalizeIdentity,normalizeLogs,evaluate,compare,report};
