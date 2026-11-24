"use strict";
const fs=require("node:fs"),path=require("node:path");
const {execFileSync}=require("node:child_process");
const {createHash}=require("node:crypto");
const core=require("../src/nba-research-pipeline-v1.cjs");
const {toRows}=require("./collect-live-partner-nhl-nfl.cjs");
const {querySportsGameOdds}=require("./check-provider-api-quotas.cjs");
const {accountAllows}=require("./collect-independent-nhl-sportsbook-fallback.cjs");
const ROOT=path.resolve(__dirname,".."),OUT=path.join(ROOT,"outputs/nba");
const stamp=t=>t.replace(/[-:.]/g,""),now=()=>new Date().toISOString();
const pacific=t=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
const save=(p,d)=>{const f=path.join(OUT,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(d)+"\n",{flag:"wx",mode:0o600});return f;};
const latest=dir=>{const p=path.join(OUT,dir);if(!fs.existsSync(p))return null;const files=fs.readdirSync(p).filter(n=>/^\d{8}T\d{9}Z\.json$/.test(n)).sort();return files.length?JSON.parse(fs.readFileSync(path.join(p,files.at(-1)),"utf8")):null;};
const git=args=>execFileSync("git",args,{cwd:ROOT,encoding:"utf8",timeout:30000,stdio:["ignore","pipe","pipe"]}).trim();
async function json(url,client=fetch,headers={}){
 const r=await client(url,{headers:{Accept:"application/json",...headers},redirect:"error",signal:AbortSignal.timeout(25000)});
 if(!r.ok)throw Error("source_http_"+r.status);return r.json();
}
async function collectHistory(season,client=fetch){
 const url=new URL("https://stats.nba.com/stats/leaguegamelog");
 for(const [k,v] of Object.entries({Counter:"0",DateFrom:"",DateTo:"",Direction:"ASC",LeagueID:"00",PlayerOrTeam:"P",Season:season,SeasonType:"Regular Season",Sorter:"DATE"}))url.searchParams.set(k,v);
 const d=await json(url,client,{"User-Agent":"NBA-private-research/1.0"}),a=core.normalizeLogs(d,season,now());
 save("history/"+season+"/"+stamp(a.capturedAt)+".json",a);return a;
}
const etDay=t=>new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(t));
function officialPageSchedule(html,date,at){
 const m=html.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
 if(!m)throw Error("official_page_no_structured_data");
 const root=JSON.parse(m[1]),found=new Map(),bad=new Set();
 function walk(x){
  if(!x||typeof x!=="object")return;
  if(Array.isArray(x)){for(const y of x)walk(y);return;}
  const id=String(x.gameId||""),time=x.gameDateTimeUTC||x.gameTimeUTC||x.startTimeUTC;
  const home=core.teams(x.homeTeam?.teamTricode),away=core.teams(x.awayTeam?.teamTricode);
  if(/^002\d{7}$/.test(id)&&Number.isFinite(Date.parse(time))&&etDay(time)===date&&/^[A-Z]{3}$/.test(home)&&/^[A-Z]{3}$/.test(away)&&home!==away&&[1,2,3].includes(Number(x.gameStatus))){
   const y={gameId:Number(id),startAt:time,home,away,status:Number(x.gameStatus)},old=found.get(id);
   if(old&&(Date.parse(old.startAt)!==Date.parse(time)||old.home!==home||old.away!==away||old.status!==y.status))bad.add(id);
   else found.set(id,y);
  }
  for(const y of Object.values(x))if(y&&typeof y==="object")walk(y);
 }
 walk(root);
 const games=[...found.entries()].filter(([k])=>!bad.has(k)).map(([,v])=>v);
 if(!games.length)throw Error("official_page_no_exact_games");
 return {kind:"nba_official_schedule_v1",capturedAt:at,source:"www.nba.com",scope:"dated_page_structured",sourceUrl:"https://www.nba.com/games?date="+date,games};
}
function datedManualSchedule(date,at){
 const p=path.join(ROOT,"config/nba/official-schedule-reviewed-"+date+".json");if(!fs.existsSync(p))return null;
 const d=JSON.parse(fs.readFileSync(p,"utf8")),clock=Date.parse(at);
 if(d.kind!=="nba_reviewed_official_schedule_v1"||d.date!==date||d.sourceUrl!=="https://www.nba.com/games?date="+date||!Number.isFinite(Date.parse(d.observedAt))||Date.parse(d.observedAt)>clock||clock-Date.parse(d.observedAt)>6*3600000||!Array.isArray(d.games)||!d.games.length)return null;
 const games=d.games.filter(g=>Number.isInteger(g.gameId)&&g.status===1&&g.sourceUrl==="https://www.nba.com/game/"+g.away.toLowerCase()+"-vs-"+g.home.toLowerCase()+"-"+String(g.gameId).padStart(10,"0")&&etDay(g.startAt)===date&&Date.parse(g.startAt)>clock+900000);
 if(!games.length||new Set(games.map(g=>g.gameId)).size!==games.length)return null;
 return {kind:"nba_official_schedule_v1",capturedAt:at,source:"www.nba.com human-reviewed dated schedule",sourceObservedAt:d.observedAt,sourceUrl:d.sourceUrl,scope:"reviewed_date_only",games};
}
async function collectSchedule(client=fetch){
 const urls=["https://cdn.nba.com/static/json/staticData/scheduleLeagueV2_1.json","https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json"];
 for(const url of urls){try{const a=core.schedule(await json(url,client),now());a.sourceUrl=url;save("schedule/"+stamp(a.capturedAt)+".json",a);return a;}catch{}}
 const date=etDay(now()),errors=[];
 try{const url="https://www.nba.com/games?date="+date,r=await client(url,{redirect:"error",signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error("official_page_http_"+r.status);
 const a=officialPageSchedule(await r.text(),date,now());save("schedule/"+stamp(a.capturedAt)+".json",a);return a;
 }catch(e){errors.push(e.message);}
 try{const url="https://cdn.nba.com/static/json/liveData/scoreboard/todaysScoreboard_00.json",d=await json(url,client),x=d?.scoreboard,at=now();
 if(!["00",0,undefined].includes(x?.leagueId)||!Array.isArray(x.games)||!x.games.length)throw Error("NBA scoreboard schema unavailable");
 const games=x.games.filter(g=>/^002\d{7}$/.test(String(g.gameId))&&Number.isFinite(Date.parse(g.gameTimeUTC))&&etDay(g.gameTimeUTC)===date&&g.homeTeam?.teamTricode&&g.awayTeam?.teamTricode).map(g=>({gameId:Number(g.gameId),startAt:g.gameTimeUTC,home:core.teams(g.homeTeam.teamTricode),away:core.teams(g.awayTeam.teamTricode),status:Number(g.gameStatus)}));
 if(!games.length||new Set(games.map(x=>x.gameId)).size!==games.length)throw Error("NBA scoreboard lacks exact game identity");
 const a={kind:"nba_official_schedule_v1",capturedAt:at,source:"cdn.nba.com",sourceUrl:url,scope:"today_only",games};save("schedule/"+stamp(at)+".json",a);return a;
 }catch(e){errors.push(e.message);}
 const a=datedManualSchedule(date,now());if(a){a.fallbackReasons=errors;save("schedule/"+stamp(a.capturedAt)+".json",a);return a;}
 throw Error("NBA schedule all sources unavailable: "+errors.join(";"));
}
async function collectBoard(){
 // Uses the existing strict complete-source collector; no missing or assumed tiers.
 const rows=[],ids=new Set();let expected=null,started=now();
 for(let page=1;page<=12;page++){
  const url=new URL("https://partner-api.prizepicks.com/projections");
  for(const [k,v] of Object.entries({league_id:"7",per_page:"250",single_stat:"true",page:String(page)}))url.searchParams.set(k,v);
  const raw=await json(url),m=raw?.meta;
  if(m?.current_page!==page||!Number.isInteger(m.total_pages)||m.total_pages<page||m.total_pages>12||(expected!==null&&m.total_pages!==expected))throw Error("NBA board pagination incomplete");
  expected=m.total_pages;
  const a=toRows({...raw,meta:{...m,current_page:1,total_pages:1}},{sport:"NBA",leagueId:7,minimumRows:1});
  for(const row of a.rows){if(ids.has(row[0]))throw Error("NBA board duplicate across pages");ids.add(row[0]);rows.push(row);}
  if(page===expected)break;
 }
 if(!rows.length||Date.parse(now())-Date.parse(started)>180000)throw Error("NBA board capture window too long");
 const d={kind:"nba_private_partner_board_v1",source:"partner-api.prizepicks.com",captureStartedAt:started,capturedAt:now(),completePagination:true,pages:expected,rows,originalAppOfferAuthenticated:false};
 save("boards/"+stamp(d.capturedAt)+".json",d);return d;
}
async function collectInjuryIndex(client=fetch){
 // Capture official document provenance, not inferred status from absence.
 const sourcePage="https://www.nba.com/players/injury-report",r=await client(sourcePage,{redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error("injury_index_http_"+r.status);const html=await r.text();
 const links=[...new Set([...html.matchAll(/href=["']([^"']+)["']/gi)].map(x=>{try{return new URL(x[1],sourcePage).href}catch{return ""}}).filter(x=>/^https:\/\/(?:ak-static\.cms\.nba\.com|official\.nba\.com)\/referee\/injury\/Injury-Report_\d{4}-\d{2}-\d{2}_\d{2}_\d{2}(?:AM|PM)\.pdf$/.test(x)))];
 const d={kind:"nba_official_injury_source_index_v1",capturedAt:now(),source:"NBA official injury report index",sourcePage,links:links.slice(0,120),playerStatusesVerified:false,startingLineupsVerified:false};
 save("injury-index/"+stamp(d.capturedAt)+".json",d);return d;
}
const teamNames=Object.fromEntries("ATL:Atlanta Hawks|BOS:Boston Celtics|BKN:Brooklyn Nets|CHA:Charlotte Hornets|CHI:Chicago Bulls|CLE:Cleveland Cavaliers|DAL:Dallas Mavericks|DEN:Denver Nuggets|DET:Detroit Pistons|GSW:Golden State Warriors|HOU:Houston Rockets|IND:Indiana Pacers|LAC:LA Clippers|LAL:Los Angeles Lakers|MEM:Memphis Grizzlies|MIA:Miami Heat|MIL:Milwaukee Bucks|MIN:Minnesota Timberwolves|NOP:New Orleans Pelicans|NYK:New York Knicks|OKC:Oklahoma City Thunder|ORL:Orlando Magic|PHI:Philadelphia 76ers|PHX:Phoenix Suns|POR:Portland Trail Blazers|SAC:Sacramento Kings|SAS:San Antonio Spurs|TOR:Toronto Raptors|UTA:Utah Jazz|WAS:Washington Wizards".split("|").map(x=>{const i=x.indexOf(":");return [x.slice(i+1),x.slice(0,i)];}));
function reportClock(url){
 const m=url.match(/Injury-Report_(\d{4}-\d{2}-\d{2})_(\d{2})_(\d{2})(AM|PM)\.pdf$/);if(!m)return null;
 const hour=Number(m[2])%12+(m[4]==="PM"?12:0),minute=Number(m[3]);
 if(Number(m[2])<1||Number(m[2])>12||minute>59)return null;
 const z=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",timeZoneName:"longOffset"}).formatToParts(new Date(m[1]+"T12:00:00Z")).find(x=>x.type==="timeZoneName")?.value;
 if(!/^GMT[+-]\d{2}:\d{2}$/.test(z||""))return null;
 return new Date(m[1]+"T"+String(hour).padStart(2,"0")+":"+m[3]+":00"+z.slice(3)).toISOString();
}
function parseInjuryLayout(txt){
 const rows=[],notSubmitted=[],seen=new Set();let date=null,match=null,team=null;
 for(const line of txt.split(/\r?\n/)){
  const cells=line.trim().split(/\s{2,}/).filter(Boolean);
  const d=cells.find(x=>/^\d{2}\/\d{2}\/\d{4}$/.test(x));
  if(d){const [m,n,y]=d.split("/");date=y+"-"+m+"-"+n;match=null;team=null;}
  const g=cells.find(x=>/^[A-Z]{2,3}@[A-Z]{2,3}$/.test(x));
  if(g){match=g;team=null;}
  const name=cells.find(x=>Object.hasOwn(teamNames,x));if(name)team=teamNames[name];
  if(!date||!match||!team||!match.split("@").includes(team))continue;
  if(cells.includes("NOT YET SUBMITTED")){notSubmitted.push({date,match,team});continue;}
  const i=cells.findIndex(x=>/^(Out|Doubtful|Questionable|Probable|Available|Game-Time Decision)$/i.test(x));
  if(i<1||!cells[i-1].includes(","))continue;
  const [last,...first]=cells[i-1].split(",");if(!last.trim()||!first.join(",").trim())continue;
  const player=first.join(",").trim()+" "+last.trim(),status=cells[i].toLowerCase(),k=[date,match,team,player].join("|");
  if(seen.has(k))throw Error("ambiguous injury report row");seen.add(k);rows.push({date,match,team,player,status});
 }
 return {rows,notSubmitted};
}
async function collectInjuryDocument(index,client=fetch){
 if(!index)return null;
 const t=Date.now(),options=index.links.map(url=>({url,publishedAt:reportClock(url)})).filter(x=>x.publishedAt&&Date.parse(x.publishedAt)<=t&&t-Date.parse(x.publishedAt)<=6*3600000).sort((a,b)=>Date.parse(b.publishedAt)-Date.parse(a.publishedAt));
 if(!options.length)return null;
 const x=options[0],r=await client(x.url,{redirect:"error",signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error("NBA injury PDF unavailable");
 const bytes=Buffer.from(await r.arrayBuffer());if(bytes.length>4*1024*1024||bytes.subarray(0,4).toString()!=="%PDF")throw Error("invalid NBA injury PDF");
 const txt=execFileSync("pdftotext",["-layout","-","-"],{input:bytes,encoding:"utf8",timeout:20000,maxBuffer:4*1024*1024});
 const parsed=parseInjuryLayout(txt);if(!parsed.rows.length&&!parsed.notSubmitted.length)throw Error("NBA report schema unverified");
 const at=now(),doc={kind:"nba_official_injury_report_observed_v1",capturedAt:at,reportPublishedAt:x.publishedAt,sourceDocumentUrl:x.url,sha256:createHash("sha256").update(bytes).digest("hex"),...parsed,positiveParticipationVerified:false,firstGitPregameVerificationPending:true};
 save("injury-reports/"+stamp(at)+".json",doc);return doc;
}
function reviewedInjury(at){
 const date=etDay(at),rel="config/nba/official-injury-reviewed-"+date+".json",p=path.join(ROOT,rel);if(!fs.existsSync(p))return null;
 const d=JSON.parse(fs.readFileSync(p,"utf8")),c=git(["log","--format=%cI","--",rel]).split("\n").filter(Boolean);
 const obs=Date.parse(c[0]),pub=Date.parse(d.reportPublishedAt),t=Date.parse(at);
 if(c.length!==1||d.kind!=="nba_reviewed_injury_report_v1"||reportClock(d.sourceDocumentUrl)!==d.reportPublishedAt.replace("Z",".000Z")||!(pub<=obs&&obs<=t&&t-pub<=6*3600000)||!Array.isArray(d.rows)||d.rows.some(x=>x.date!==date||!["out","questionable","doubtful","probable","available"].includes(x.status)))return null;
 return {...d,kind:"nba_official_injury_report_observed_v1",capturedAt:at,sourceObservedAt:c[0],reviewedTranscription:true,positiveParticipationVerified:false};
}
async function collectLineups(sc,client=fetch){
 if(!sc)return [];
 const t=Date.now(),result=[];
 for(const g of sc.games.filter(x=>x.status===1&&Date.parse(x.startAt)-t>=900000&&Date.parse(x.startAt)-t<=90*60000).slice(0,6)){
  try{const id=String(g.gameId).padStart(10,"0"),url="https://cdn.nba.com/static/json/liveData/boxscore/boxscore_"+id+".json",d=await json(url,client),x=d.game;
   if(Number(x?.gameId)!==g.gameId||x.gameStatus!==1||Math.abs(Date.parse(x.gameTimeUTC)-Date.parse(g.startAt))>300000)continue;
   for(const [side,expected] of [["homeTeam",g.home],["awayTeam",g.away]]){const team=x[side],players=(team?.players||[]).filter(p=>p.starter==="1"||p.starter===1||p.starter===true);
    if(core.teams(team?.teamTricode)!==expected||players.length!==5||players.some(p=>!Number.isInteger(p.personId))||new Set(players.map(p=>p.personId)).size!==5)continue;
    result.push({gameId:g.gameId,team:expected,playerIds:players.map(p=>p.personId),capturedAt:now(),sourceUrl:url,sourceReportedStarters:true,positiveParticipationVerified:false});
   }
  }catch{}
 }
 if(result.length)save("lineups/"+stamp(now())+".json",{kind:"nba_pregame_source_reported_lineups_v1",rows:result,firstGitPregameVerificationPending:true});
 return result;
}
async function collectOdds(){
 // Only a distinct NBA account key plus explicit enablement can enter this path.
 // The shared NHL/NFL key is never read or used. No provider request before
 // durable, unique NBA reservation. One event request, no retries.
 if(process.env.NBA_ODDS_ENABLE!=="1"||process.env.NBA_ODDS_SEPARATE_ACCOUNT_CONFIRMED!=="1"||!process.env.NBA_SPORTSGAMEODDS_API_KEY)return {status:"disabled_separate_budget_required",rows:[]};
 const t=now(),date=pacific(t),rel="outputs/nba/sportsbooks/reservations/"+date+".json",p=path.join(ROOT,rel);
 if(fs.existsSync(p))return {status:"already_reserved",rows:[]};
 save("sportsbooks/reservations/"+date+".json",{kind:"nba_separate_daily_odds_reservation_v1",createdAt:t,maxEvents:2,maxOddsRequests:1,sharedKeyUsed:false});
 git(["config","user.name","github-actions[bot]"]);git(["config","user.email","41898282+github-actions[bot]@users.noreply.github.com"]);
 git(["add","-f",rel]);git(["commit","-qm","data: reserve separate NBA odds request"]);git(["push","-q","origin","HEAD:main"]);
 const key=process.env.NBA_SPORTSGAMEODDS_API_KEY,q=await querySportsGameOdds(key,(u,o)=>fetch(u,{...o,redirect:"error"}));
 if(!accountAllows(q,2))return {status:"allowance_unverified",rows:[]};
 const url=new URL("https://api.sportsgameodds.com/v2/events");
 for(const [k,v] of Object.entries({leagueID:"NBA",oddsAvailable:"true",started:"false",limit:"2",bookmakerID:"draftkings,fanduel,betmgm,caesars"}))url.searchParams.set(k,v);
 const d=await json(url,fetch,{"x-api-key":key});if(d.success!==true||!Array.isArray(d.data)||d.data.length>2)throw Error("NBA provider schema");
 const at=now(),a={kind:"nba_private_sportsbook_pairs_v1",capturedAt:at,status:"captured",partialPagination:!!d.nextCursor,rows:core.oddsPairs(d,at),sharedKeyUsed:false};
 save("sportsbooks/archives/"+stamp(at)+".json",a);return a;
}
async function main(){
 if(process.env.NBA_DIRECT_SOURCE_AUTHORIZED!=="1"){console.log(JSON.stringify({status:"blocked_direct_nba_source_authorization",providerRequests:0}));return;}
 const status={},logs=[],started=now();
 for(const season of ["2023-24","2024-25","2025-26","2026-27"]){
  let a=latest("history/"+season);
  if(!a||(season==="2026-27"&&Date.parse(started)-Date.parse(a.capturedAt)>20*3600000)){
   try{a=await collectHistory(season);status["history_"+season]="collected";}
   catch(e){status["history_"+season]="unavailable_"+(e?.name==="TimeoutError"?"timeout":"source_or_schema");
    if(process.env.NBA_HISTORICAL_MIRROR_RESEARCH==="1"){try{execFileSync("python",["scripts/collect-nba-historical-mirror.py",season],{cwd:ROOT,timeout:90000,stdio:"ignore"});a=latest("history/"+season);status["history_"+season]="mirror_research_only";}catch{status["history_"+season]+="_mirror_unavailable";}}
   }
  }else status["history_"+season]="cached";
  if(a)logs.push(a);
 }
 let sc=null,b=null,inj=null,odds={status:"not_collected",rows:[]};
 for(const [k,f] of [["schedule",collectSchedule],["board",collectBoard],["injuryIndex",collectInjuryIndex],["sportsbooks",collectOdds]]){
  try{const x=await f();status[k]=x.status||"collected";if(k==="schedule")sc=x;if(k==="board")b=x;if(k==="injuryIndex")inj=x;if(k==="sportsbooks")odds=x;}
  catch(e){status[k]="unavailable_"+(e?.name==="TimeoutError"?"timeout":"source_or_schema");if(k==="schedule")status.scheduleDiagnostic=String(e.message).slice(0,240);}
 }
 let injuryDoc=null,lineups=[];
 try{injuryDoc=await collectInjuryDocument(inj);status.injuryDocument=injuryDoc?"observed":"no_current_report";}catch(e){status.injuryDocument="unavailable";status.injuryDocumentDiagnostic=String(e.message).split("\n")[0].slice(0,160);}
 if(!injuryDoc){try{injuryDoc=reviewedInjury(now());if(injuryDoc){save("injury-reports/"+stamp(injuryDoc.capturedAt)+".json",injuryDoc);status.injuryDocument="reviewed_official_report_fallback";}}catch{}}
 try{lineups=await collectLineups(sc);status.lineups=lineups.length?"source_reported":"not_yet_reported";}catch{status.lineups="unavailable";}
 let hist=null,backtest=null,offers=[],rows=[];
 if(logs.length){hist=core.indexHistory(logs);backtest=core.backtest(hist);save("validation/"+stamp(now())+".json",backtest);}
 if(hist&&sc&&b){const at=now();offers=core.board(b,hist,sc,at);rows=core.rankings(offers,hist,sc,odds.rows||[],[],at).map(p=>{
   const date=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/New_York",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(p.gameStartAt));
   const g=sc.games.find(x=>x.gameId===p.gameId),match=g?g.away+"@"+g.home:null;
   const entries=(injuryDoc?.rows||[]).filter(x=>x.date===date&&x.match===match&&x.team===p.team&&core.norm(x.player)===core.norm(p.player));
   const starter=lineups.find(x=>x.gameId===p.gameId&&x.team===p.team);
   return {...p,injuryStatus:entries.length===1?"observed_"+entries[0].status:"unknown_not_clearance",injurySourceFirstGitVerified:false,startingLineupSourceStatus:starter?(starter.playerIds.includes(p.playerId)?"source_reported_starter":"not_reported_starter"):"unverified",liveAvailabilityConfirmed:false};
  }).filter(p=>!["observed_out","observed_doubtful","observed_questionable","observed_game-time decision"].includes(p.injuryStatus));
  save("rankings/"+stamp(at)+".json",{kind:"nba_private_research_rankings_v1",generatedAt:at,boardCapturedAt:b.capturedAt,source:"original private partner observations",rows:rows.slice(0,500),rankedRowsBeforeExportCap:rows.length,exportCap:500,calibrated:false,prospectivelyValidated:false,highConfidenceApproved:0,actualWagersPlaced:0,verifiedEV:null,injuryStatusesVerified:false,originalAppAvailabilityVerified:false});
 }
 const report={kind:"nba_isolated_research_readiness_v1",generatedAt:now(),status,history:logs.map(x=>({season:x.season,games:x.gameCount,rows:x.rows.length,complete:x.seasonCompletenessVerified,source:x.source,expectedRegularSeasonGames:x.expectedRegularSeasonGames??null,mirrorCountMatchesExpected:x.mirrorObservedGameCountMatchesExpected??null})),boardRows:b?.rows.length||0,officialScheduleGames:sc?.games.length||0,eligibleResearchSides:offers.length,rankedRows:rows.length,exactSportsbookComparisons:rows.filter(x=>x.benchmark).length,injurySourceLinks:inj?.links.length||0,injuryReportObservedRows:injuryDoc?.rows.length||0,notSubmittedTeams:injuryDoc?.notSubmitted.length||0,sourceReportedStartingFives:lineups.length,syntheticBacktestGroups:Object.keys(backtest?.groups||{}).length,backtestSummary:Object.fromEntries(Object.entries(backtest?.groups||{}).filter(([k])=>k.startsWith("historical_holdout|")||k.startsWith("current_season_replay|")).map(([k,x])=>[k,{n:x.n,brier:x.brier,baselineBrier:x.baselineBrier,adjustedBrier:x.adjustedBrier,adjustedN:x.adjustedN,pairedRawBrier:x.pairedRawBrier,distinctDates:x.distinctDates}])),calibrated:false,prospectiveValidationApproved:false,highConfidenceApproved:0,actualWagersPlaced:0,sharedPaidProviderRequests:0,liveLineupVerification:false,sourceRightsIndependentlyReviewed:false,mirrorArchivePrivateResearchOnly:true};
 save("health/"+stamp(report.generatedAt)+".json",report);console.log(JSON.stringify(report));
}
if(require.main===module)main().catch(()=>{console.error("NBA private research failed closed");process.exitCode=1;});
module.exports={officialPageSchedule,datedManualSchedule,collectHistory,collectSchedule,collectBoard,collectInjuryIndex,collectInjuryDocument,parseInjuryLayout,reportClock,collectLineups,collectOdds};
