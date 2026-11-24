"use strict";
/**
 * Experimental, read-only ESPN game-day availability signal validated against
 * official NHL schedule and roster identities.
 * ESPN's public endpoints are undocumented. They are not licensed for resale.
 * ESPN "Confirmed" is a SECONDARY REPORT, not an NHL/team statement.
 */
const canonicalTeam=x=>({SJ:"SJS",LA:"LAK",TB:"TBL",NJ:"NJD",VEG:"VGK",UTAH:"UTA",ARI:"UTA"}[String(x||"").toUpperCase()]||String(x||"").toUpperCase());
const nameKey=x=>String(x||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();
const validTime=x=>Number.isFinite(Date.parse(x));
function parseNhlRosters(rosters){
 const out={},ambiguous=[];
 for(const [team,payload] of Object.entries(rosters||{})){
  const players=new Map(),dupes=new Set();
  for(const group of ["forwards","defensemen","goalies"])for(const p of payload?.[group]||[]){
   const name=[p.firstName?.default,p.lastName?.default].filter(Boolean).join(" ");
   const key=nameKey(name);
   if(!key||!Number.isInteger(p.id))continue;
   if(players.has(key))dupes.add(key);
   players.set(key,{playerId:p.id,name,position:p.positionCode||null,type:group==="goalies"?"goalie":"skater"});
  }
  out[canonicalTeam(team)]={players,ambiguous:dupes};
  for(const k of dupes)ambiguous.push(canonicalTeam(team)+"|"+k);
 }
 return {byTeam:out,ambiguous};
}
function identifyPlayer(team,name,roster){
 const t=roster?.byTeam?.[canonicalTeam(team)],key=nameKey(name);
 if(!t||!key||t.ambiguous.has(key))return null;
 return t.players.get(key)||null;
}
function matchOfficialGame(teams,date,officialSchedule){
 const codes=[...teams].map(canonicalTeam).sort(),when=Date.parse(date);
 if(codes.length!==2||new Set(codes).size!==2||!Number.isFinite(when))return null;
 const matches=(officialSchedule?.games||[]).filter(g=>{
  const a=[canonicalTeam(g.home),canonicalTeam(g.away)].sort();
  return a[0]===codes[0]&&a[1]===codes[1]&&Math.abs(Date.parse(g.startTimeUTC)-when)<=600000;
 });
 return matches.length===1?matches[0]:null;
}
function goalieStatus(value){
 const s=String(value?.type||value?.name||"").toLowerCase();
 if(s==="confirmed")return "reported_confirmed";
 if(["probable","expected","projected","likely"].includes(s))return "expected";
 return "unknown";
}
function normalizeScoreboard(payload,roster,schedule,at){
 if(!Array.isArray(payload?.events)||!validTime(at))throw Error("ESPN pregame scoreboard contract changed");
 const events=[],counts={sourceEvents:payload.events.length,eligibleGames:0,matchedGoalies:0,unmatchedGames:0,unmatchedPlayers:0,startedOrPast:0,reportConfirmed:0};
 const now=Date.parse(at);
 for(const e of payload.events){
  const c=e.competitions?.[0],list=c?.competitors;
  if(!Array.isArray(list)||list.length!==2){counts.unmatchedGames++;continue;}
  const start=Date.parse(e.date),state=e.status?.type?.state;
  if(state!=="pre"||!Number.isFinite(start)||start<=now){counts.startedOrPast++;continue;}
  const teams=list.map(x=>canonicalTeam(x.team?.abbreviation));
  const g=matchOfficialGame(teams,e.date,schedule);
  // Opponents and scheduled start alone do not prove the listed home/away side.
  if(!g||list.some(t=>canonicalTeam(t.team?.abbreviation)!==
    canonicalTeam(t.homeAway==="home"?g.home:t.homeAway==="away"?g.away:""))){
   counts.unmatchedGames++;continue;
  }
  const goalies=[];
  for(const team of list){
   const code=canonicalTeam(team.team?.abbreviation);
   const contenders=team.probables||[];
   if(contenders.length!==1){continue;}
   const reported=contenders[0],name=reported.athlete?.fullName||reported.athlete?.displayName;
   const identity=identifyPlayer(code,name,roster);
   if(!identity||identity.type!=="goalie"){counts.unmatchedPlayers++;continue;}
   const status=goalieStatus(reported.status);
   goalies.push({team:code,playerId:identity.playerId,player:identity.name,
    sourceStatus:status,sourceStatusRaw:String(reported.status?.name||""),
    sourceProvider:"ESPN public NHL scoreboard",
    sourceCapturedAt:at,nhlOfficialGameId:g.id,
    officialRosterIdentityMatched:true,officialTeamStarterConfirmation:false});
   counts.matchedGoalies++;
   if(status==="reported_confirmed")counts.reportConfirmed++;
  }
  events.push({nhlGameId:g.id,eventStartsAt:g.startTimeUTC,home:canonicalTeam(g.home),
   away:canonicalTeam(g.away),sourceStatus:"espn_pregame",goalies});
  counts.eligibleGames++;
 }
 return {events,counts};
}
function normalizeInjuries(payload,roster,at){
 if(!Array.isArray(payload?.injuries)||!validTime(at))throw Error("ESPN injury feed contract changed");
 const reportTimestamp=validTime(payload.timestamp)?payload.timestamp:null;
 const rows=[],seen=new Set(),counts={sourceTeams:payload.injuries.length,sourceRecords:0,matchedPlayers:0,unmatchedPlayers:0,duplicates:0};
 for(const group of payload.injuries){
  if(!Array.isArray(group.injuries))continue;
  for(const record of group.injuries){
   counts.sourceRecords++;
   const team=canonicalTeam(record.athlete?.team?.abbreviation),
    name=record.athlete?.displayName||[record.athlete?.firstName,record.athlete?.lastName].filter(Boolean).join(" "),
    match=identifyPlayer(team,name,roster);
   if(!match){counts.unmatchedPlayers++;continue;}
   if(validTime(record.date)&&Date.parse(record.date)>Date.parse(at)+60000){
    counts.unmatchedPlayers++;continue;
   }
   const status=String(record.status||"").trim();
   if(!status){counts.unmatchedPlayers++;continue;}
   const key=team+"|"+match.playerId;
   if(seen.has(key)){
    counts.duplicates++;
    // Never choose one of two contradictory reports by array order.
    for(const old of rows)if(old.team===team&&old.playerId===match.playerId)
     {old.status="AMBIGUOUS";old.ambiguousSourceRecords=true;}
    continue;
   }
   seen.add(key);counts.matchedPlayers++;
   rows.push({team,playerId:match.playerId,player:match.name,status,
    reportedAt:validTime(record.date)?record.date:null,
    sourceCapturedAt:at,sourceTimestamp:reportTimestamp,
    sourceProvider:"ESPN NHL injuries",nhlRosterIdentityMatched:true,
    originalTeamMedicalClearanceVerified:false});
  }
 }
 return {rows,reportTimestamp,counts};
}
function normalizePregame(espnInjuries,espnScoreboard,rosterPayloads,officialSchedule,at){
 const roster=parseNhlRosters(rosterPayloads);
 const goalie=normalizeScoreboard(espnScoreboard,roster,officialSchedule,at);
 const injury=normalizeInjuries(espnInjuries,roster,at);
 return {schemaVersion:1,kind:"nhl_external_pregame_availability_research",
  generatedAt:at,source:"undocumented_ESPN_site_API_and_official_NHL_identity",
  sourceEndpoints:["ESPN NHL injuries","ESPN NHL date-scoped scoreboard","Official NHL season schedule","Official NHL team rosters"],
  licenseForCommercialRedistributionVerified:false,editorialLineCombinationsLicensed:false,
  feedVerifiedFirstPartyNHL:false,officialStarterConfirmations:0,
  goalieReportedConfirmed:goalie.counts.reportConfirmed,
  injuries:injury.rows,events:goalie.events,
  coverage:{goalies:goalie.counts,injuries:injury.counts,
   officialRosterTeams:Object.keys(roster.byTeam).length,ambiguousRosterNames:roster.ambiguous.length},
  injuryFeedTimestamp:injury.reportTimestamp,
  warning:"ESPN reported Confirmed does not mean confirmed by our official NHL/team feed. Only exact official roster+game matches retained. Injury absence is never medical clearance. No actual future forward line/PP unit verified. Use only as experimental source-risk review until redistribution rights and confirmation provenance are resolved."};
}
const harmfulStatus=s=>/out|injured reserve|long.term|suspended|suspension|inactive|disabled|ir\b/i.test(s||"");
const uncertainStatus=s=>/day.to.day|dtd|questionable|doubtful|gtd|game.time|probable/i.test(s||"");
function applyPregameSignal(prop,report,at){
 const current=Date.parse(at),start=Date.parse(prop.eventStartsAt),snapshot=Date.parse(report?.generatedAt);
 const valid=report?.kind==="nhl_external_pregame_availability_research"&&
  Number.isFinite(current)&&Number.isFinite(start)&&start>current&&
  Number.isFinite(snapshot)&&snapshot<=current&&current-snapshot<=90*60000;
 const out={...prop},prior=prop.roleEvidence||{};
 const reasons=new Set(prior.reasons||[]);
 const injury=valid?(report.injuries||[]).filter(x=>x.team===canonicalTeam(prop.team)&&
  x.playerId===prop.playerId):[];
 const status=injury.length===1?injury[0].status:null;
 if(status==="AMBIGUOUS")reasons.add("AMBIGUOUS_INJURY_SOURCE");
 // A negative report is a quarantined candidate. No injury record means
 // UNKNOWN, not cleared, and missing/ambiguous rows are not safely joined.
 if(injury.length>1)reasons.add("AMBIGUOUS_INJURY_SOURCE");
 if(status&&harmfulStatus(status))reasons.add("EXTERNAL_INJURY_OUT_OR_IR_REPORT");
 else if(status&&uncertainStatus(status))reasons.add("EXTERNAL_INJURY_UNCERTAIN_REPORT");
 const games=valid?(report.events||[]).filter(g=>g.nhlGameId===prop.gameId&&
  Math.abs(Date.parse(g.eventStartsAt)-start)<=600000):[];
 let goalie=null;
 if(prop.market==="saves"&&games.length===1){
  const found=(games[0].goalies||[]).filter(x=>x.team===canonicalTeam(prop.team)&&
   x.playerId===prop.playerId);
  if(found.length===1)goalie=found[0];
  if(found.length>1)reasons.add("AMBIGUOUS_GOALIE_REPORT");
 }
 if(prop.market==="saves"&&!goalie)reasons.add("STARTING_GOALIE_NOT_CONFIRMED");
 if(!valid)reasons.add("PREGAME_AVAILABILITY_FEED_MISSING_OR_STALE");
 // ESPN is a second-party reported starter; never silently elevate to
 // an independent official confirmed or authorized “playable” pick.
 const starter=goalie?.sourceStatus||"unconfirmed";
 if(starter==="reported_confirmed")reasons.add("ESPN_REPORTED_GOALIE_CONFIRMED_UNCORROBORATED");
 else if(starter==="expected")reasons.add("ESPN_GOALIE_ONLY_EXPECTED");
 const blocked=prop.researchEligibility==="watchlist"||
  (prop.market==="saves")||
  reasons.has("EXTERNAL_INJURY_OUT_OR_IR_REPORT")||
  reasons.has("EXTERNAL_INJURY_UNCERTAIN_REPORT")||
  reasons.has("AMBIGUOUS_INJURY_SOURCE");
 out.researchEligibility=blocked?"watchlist":"research_only";
 out.roleEvidence={...prior,classification:out.researchEligibility,
  reasons:[...reasons],injuryStatus:status||"unknown",
  starterStatus:starter,externalEvidenceAt:valid?report.generatedAt:null,
  externalSource:valid?report.source:null,officialStarterVerified:false,
  injuryCleared:false,verifiedBettingReadiness:false,
  eligibleForResearchLineup:!blocked};
 return out;
}
module.exports={canonicalTeam,nameKey,parseNhlRosters,identifyPlayer,matchOfficialGame,
 goalieStatus,normalizeScoreboard,normalizeInjuries,normalizePregame,applyPregameSignal};
