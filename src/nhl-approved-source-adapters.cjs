"use strict";
/** User-approved source adapter, PRIVATE shadow research; never infer official line/start. */
const {parseNhlRosters,identifyPlayer,matchOfficialGame,canonicalTeam}=require("./nhl-pregame-intel.cjs");
const BASE="https://moneypuck.com/moneypuck/playerData/seasonSummary/2026/regular/";
function parseCsv(text){
 if(typeof text!=="string"||text.length<20||text.length>9000000)throw Error("CSV size invalid");
 const rows=[],rec=[];let s="",quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){s+='"';i++;}else if(c==='"')quoted=false;else s+=c;}
  else if(c==='"'){if(s.trim())throw Error("CSV quote in field");quoted=true;}
  else if(c===","){rec.push(s);s="";}
  else if(c==="\n"){rec.push(s.replace(/\r$/,""));s="";if(rec.some(x=>x!==""))rows.push([...rec]);rec.length=0;}
  else s+=c;
 }
 if(quoted)throw Error("Unterminated CSV field");
 if(s||rec.length){rec.push(s);rows.push(rec);}
 if(rows.length<2)throw Error("Empty CSV");
 const headers=rows.shift().map(x=>x.replace(/^\uFEFF/,"").trim());
 if(headers.length<20||rows.some(r=>r.length!==headers.length))throw Error("Invalid MoneyPuck header/row width");
 return {headers,rows};
}
const num=x=>x!==""&&x!==null&&x!==undefined&&Number.isFinite(Number(x))&&Number(x)>=0?Number(x):null;
const round=x=>Number(x.toFixed(3));
function parseMoneyPuckSeason(text,kind,at){
 const parsed=parseCsv(text),find=x=>parsed.headers.indexOf(x);
 for(const k of ["situation","games_played",kind==="teams"?"team":"playerId"])if(find(k)<0)throw Error("Missing MoneyPuck "+k);
 if(!Number.isFinite(Date.parse(at)))throw Error("No MoneyPuck capture time");
 const rows={};let skipped=0;
 for(const line of parsed.rows){
  const get=k=>find(k)>=0?line[find(k)]:"";
  if(get("situation")!=="all"){skipped++;continue;}
  const id=kind==="teams"?canonicalTeam(get("team")):Number(get("playerId"));
  if(kind==="teams"?!/^[A-Z]{3}$/.test(id):!Number.isInteger(id)||id<1){skipped++;continue;}
  const games=num(get("games_played")),seconds=num(get(kind==="teams"?"iceTime":"icetime"));
  if(games===null||games<1||seconds===null||seconds<=0){skipped++;continue;}
  const names=kind==="skaters"?
   [["xGoals","I_F_xGoals"],["xOnGoal","I_F_xOnGoal"],["shotsOnGoal","I_F_shotsOnGoal"],["shotAttempts","I_F_shotAttempts"],["highDangerShots","I_F_highDangerShots"]]:
   kind==="goalies"?
   [["xGoalsAgainst","xGoals"],["xOnGoalAgainst","xOnGoal"],["shotsOnGoalAgainst","ongoal"],["goalsAgainst","goals"]]:
   kind==="teams"?
   [["xGoalsAgainst","xGoalsAgainst"],["xGoalsFor","xGoalsFor"],["shotsOnGoalAgainst","shotsOnGoalAgainst"],["shotsOnGoalFor","shotsOnGoalFor"],["shotAttemptsAgainst","shotAttemptsAgainst"]]:null;
  if(!names)throw Error("Unknown MoneyPuck dataset");
  const metrics={};for(const [key,c]of names)metrics[key]=num(get(c));
  if(Object.values(metrics).some(v=>v===null)){skipped++;continue;}
  const key=String(id);
  if(rows[key])throw Error("Conflicting MoneyPuck IDs "+key);
  rows[key]={playerId:kind==="teams"?null:id,team:kind==="teams"?key:canonicalTeam(get("team")),
   gamesPlayed:games,iceTimeSeconds:seconds,
   ...Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k+"Per60",round(v*3600/seconds)])),
   sourceObservedAt:at};
 }
 return {source:"MoneyPuck",kind,season:"2026-27",sourceCapturedAt:at,
  sampleIsSeasonToDate:true,notHistoricalPregameForEarlierGames:true,
  rows,matchedRows:Object.keys(rows).length,skipped};
}
function extractNextData(html){
 if(typeof html!=="string"||html.length<1000||html.length>4000000)throw Error("DFO page size invalid");
 const i=html.indexOf('<script id="__NEXT_DATA__"'),open=i>=0?html.indexOf(">",i):-1,
  close=open>=0?html.indexOf("</script>",open):-1;
 if(open<0||close<0)throw Error("Missing Daily Faceoff page data");
 const page=JSON.parse(html.slice(open+1,close)).props?.pageProps;
 if(!page)throw Error("Daily Faceoff page shape changed");
 return page;
}
function normalizeFaceoffGoalies(page,rosterPayloads,schedule,at){
 if(!Array.isArray(page?.data)||!Number.isFinite(Date.parse(at)))throw Error("Invalid Daily Faceoff goalie page");
 const roster=parseNhlRosters(rosterPayloads),seen=new Set(),games=[];
 const errors={unmatchedGames:0,unmatchedGoalies:0};
 for(const e of page.data){
  const t=Date.parse(e.dateGmt);
  if(!Number.isFinite(t)||t<=Date.parse(at))continue;
  const game=matchOfficialGame([e.homeTeamAbbreviation,e.awayTeamAbbreviation],e.dateGmt,schedule);
  if(!game||canonicalTeam(game.home)!==canonicalTeam(e.homeTeamAbbreviation)||
    canonicalTeam(game.away)!==canonicalTeam(e.awayTeamAbbreviation)){errors.unmatchedGames++;continue;}
  if(seen.has(game.id))throw Error("Duplicate Daily Faceoff game");
  seen.add(game.id);
  const goalies=[];
  for(const side of ["home","away"]){
   const team=canonicalTeam(e[side+"TeamAbbreviation"]),
    player=identifyPlayer(team,e[side+"GoalieName"],roster);
   if(!player||player.type!=="goalie"){errors.unmatchedGoalies++;continue;}
   const published=e[side+"NewsCreatedAt"],ts=Date.parse(published);
   const valid=Number.isFinite(ts)&&ts<=Date.parse(at)&&ts<t;
   const raw=String(e[side+"NewsStrengthName"]||"").toLowerCase();
   const status=valid&&raw==="confirmed"?"reported_confirmed":valid&&raw==="expected"?"expected":"unconfirmed";
   const url=e[side+"NewsSourceUrl"];
   goalies.push({playerId:player.playerId,team,name:player.name,status,
    reportAt:valid?published:null,reportSource:e[side+"NewsSourceName"]||null,
    reportUrl:typeof url==="string"&&url.startsWith("https://")?url:null,
    originalClubStarterConfirmed:false});
  }
  games.push({gameId:game.id,eventStartsAt:game.startTimeUTC,
   home:canonicalTeam(game.home),away:canonicalTeam(game.away),goalies});
 }
 return {source:"Daily Faceoff",kind:"goalie_report",sourceCapturedAt:at,
  games,errors,reportedConfirmed:games.reduce((s,g)=>s+g.goalies.filter(p=>p.status==="reported_confirmed").length,0),
  originalClubStarterVerified:false};
}
function normalizeFaceoffLines(page,rosterPayloads,at){
 const c=page?.combinations;
 if(!c||!Array.isArray(c.players)||!Number.isFinite(Date.parse(at)))throw Error("Invalid DFO line combination");
 const team=canonicalTeam(c.teamAbbreviation),time=Date.parse(c.updatedAt);
 if(!Number.isFinite(time)||time>Date.parse(at)||Date.parse(at)-time>48*3600000)throw Error("DFO lines stale or future dated");
 const roster=parseNhlRosters(rosterPayloads),byPlayer=new Map(),conflicted=new Set();
 let unmatched=0,duplicateRoles=0;
 for(const p of c.players){
  const match=identifyPlayer(team,p.name,roster);
  if(!match){unmatched++;continue;}
  if(conflicted.has(match.playerId))continue;
  const category=String(p.categoryIdentifier||""),group=String(p.groupIdentifier||"");
  const role={groupIdentifier:group,groupName:String(p.groupName||""),
   categoryIdentifier:category,categoryName:String(p.categoryName||"")};
  const existing=byPlayer.get(match.playerId);
  if(existing){
   // Same player legitimately appears at even-strength and on the power play.
   // Conflicting assignments to two lines *within the same category* fail closed.
   const same=existing.roles.find(r=>r.categoryIdentifier===category);
   if(same&&same.groupIdentifier!==group){byPlayer.delete(match.playerId);conflicted.add(match.playerId);continue;}
   if(same){duplicateRoles++;continue;}
   existing.roles.push(role);
   existing.gameTimeDecision ||= !!p.gameTimeDecision;
  }else byPlayer.set(match.playerId,{playerId:match.playerId,team,
   groupIdentifier:group,groupName:role.groupName,categoryIdentifier:category,
   categoryName:role.categoryName,roles:[role],
   injuryStatus:String(p.injuryStatus||""),gameTimeDecision:!!p.gameTimeDecision,
   projectedOnly:true});
 }
 return {source:"Daily Faceoff",team,sourceUpdatedAt:c.updatedAt,sourceCapturedAt:at,
  reporter:c.sourceName||null,players:[...byPlayer.values()],unmatchedPlayers:unmatched,
  ambiguousRolePlayers:conflicted.size,duplicateRoles,clubLineupsConfirmed:false};
}
module.exports={BASE,parseCsv,parseMoneyPuckSeason,extractNextData,normalizeFaceoffGoalies,normalizeFaceoffLines};