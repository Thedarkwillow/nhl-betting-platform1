"use strict";
/** Pregame-only, zero-credit NFL schedule corroboration.
 * A pre-existing Git-archived nflverse schedule has game ids/GSIS game
 * context, NOT source/player identity and NOT positive active status.
 * No provider player id is linked to GSIS based on a name or team.
 */
const dt=s=>typeof s==="string"?Date.parse(s):NaN;
const team=s=>({
 JAC:"JAX",WSH:"WAS",LA:"LAR",STL:"LAR",SD:"LAC",
 OAK:"LV",AZ:"ARI"
})[String(s||"").toUpperCase()]||String(s||"").toUpperCase();
const validTeam=s=>/^[A-Z]{2,3}$/.test(team(s))&&team(s)!=="LA";
const pair=(a,b)=>[team(a),team(b)].sort().join("|");
const eastern=new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",
 year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
function kickoffUTC(day,clock){
 if(!/^2026-\d{2}-\d{2}$/.test(String(day))||
    !/^\d{2}:\d{2}$/.test(String(clock)))return null;
 const [y,mo,da]=day.split("-").map(Number),
  [h,mi]=clock.split(":").map(Number);
 if(h>23||mi>59||mo<1||mo>12||da<1||da>31)return null;
 const matches=[];
 for(const offset of [4,5]){
  const candidate=new Date(Date.UTC(y,mo-1,da,h+offset,mi)),
   p=Object.fromEntries(eastern.formatToParts(candidate).map(x=>[x.type,x.value]));
  if(Number(p.year)===y&&Number(p.month)===mo&&
     Number(p.day)===da&&Number(p.hour)===h&&Number(p.minute)===mi)
   matches.push(candidate.toISOString());
 }
 return matches.length===1?matches[0]:null; // ambiguous DST hour fails closed
}
function build(offers,schedule,{scheduleCommittedAt,sourceCapturedAt,now}={}){
 const report={kind:"nfl_independent_pregame_schedule_crosswalk_v1",
  source:"archived_nflverse_schedule_and_source_board",
  scheduleSourceFirstParty:false,
  verifiedGameMappings:0,sourceGameKeys:0,conflictingSourceGames:0,
  missingScheduleMatches:0,ambiguousScheduleMatches:0,
  invalidSourceGames:0,provenanceValid:false,
  playerGSISMappingsVerified:0,officialGameDayActiveVerified:0,
  paidProviderRequests:0,modelPromoted:false,rows:[]};
 const committed=dt(scheduleCommittedAt),captured=dt(sourceCapturedAt),at=dt(now);
 if(![committed,captured,at].every(Number.isFinite)||committed>captured||
    captured>at||committed>=at||at-captured>30*60000||
    !Array.isArray(schedule)||!Array.isArray(offers))
  return {...report,status:"uncertified_source_or_schedule_chronology"};
 report.provenanceValid=true;
 const games=new Map();
 for(const g of schedule){
  if(Number(g?.season)!==2026||!["REG","REGULAR_SEASON"].includes(g.game_type)||
     !Number.isInteger(Number(g.week))||Number(g.week)<1||Number(g.week)>18||
     !/^2026_\d{1,2}_[A-Z]{2,3}_[A-Z]{2,3}$/.test(String(g.game_id||""))||
     !validTeam(g.home_team)||!validTeam(g.away_team)||
     team(g.home_team)===team(g.away_team))continue;
  const kick=kickoffUTC(g.gameday,g.gametime);
  if(!kick||dt(kick)-at<15*60000)continue;
  const key=pair(g.home_team,g.away_team)+"|"+kick;
  if(!games.has(key))games.set(key,[]);
  games.get(key).push({gameId:g.game_id,homeTeam:team(g.home_team),
   awayTeam:team(g.away_team),kickoff:kick});
 }
 // One provider game ID must contain exactly one coherent team pairing and
 // start. Team and matchup are supplied with the original provider offer.
 const source=new Map();
 for(const o of offers){
  if(typeof o?.providerGameId!=="string"||!o.providerGameId||
     o?.status!=="pre_game"||!validTeam(o.team)||!validTeam(o.opponent)||
     !Number.isFinite(dt(o.eventStartsAt)))continue;
  const p=pair(o.team,o.opponent),start=dt(o.eventStartsAt);
  if(team(o.team)===team(o.opponent)||start-at<15*60000)continue;
  const k=o.providerGameId,v=source.get(k)||new Map();
  v.set(p+"|"+start,{p,start});source.set(k,v);
 }
 report.sourceGameKeys=source.size;
 for(const [providerGameId,observed] of source){
  if(observed.size!==1){report.conflictingSourceGames++;continue;}
  const {p,start}=[...observed.values()][0],matches=[];
  for(const [key,match] of games){
   if(!key.startsWith(p+"|"))continue;
   const kick=dt(match[0].kickoff);
   if(Math.abs(kick-start)<=5*60000)matches.push(...match);
  }
  if(!matches.length){report.missingScheduleMatches++;continue;}
  if(matches.length!==1){report.ambiguousScheduleMatches++;continue;}
  const m=matches[0];
  report.rows.push({providerGameId,officialGameId:m.gameId,
   officialKickoffAt:m.kickoff,homeTeam:m.homeTeam,awayTeam:m.awayTeam,
   verifiedBeforeKickoff:true,firstGitAt:scheduleCommittedAt,
   source:"pregame_nflverse_schedule_git_verified",
   originalPlatformIdentityAuthenticated:false,
   independentScheduleOnly:true});
  report.verifiedGameMappings++;
 }
 report.status="independent_pregame_schedule_reconciled_not_player_or_roster";
 return report;
}
module.exports={build,kickoffUTC,team};
