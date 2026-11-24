"use strict";
const {identifyGame}=require("./nhl-game-identity.cjs");
const normalizeTeam=s=>String(s||"").toUpperCase().trim()
 .replace(/^SJ$/,"SJS").replace(/^TB$/,"TBL").replace(/^NJ$/,"NJD").replace(/^LA$/,"LAK");
const WEEKDAYS=new Set(["sun","mon","tue","wed","thu","fri","sat"]);

function parseOriginalMatchup(value){
 // Use ONLY an explicit opponent and @/vs venue token archived with the forecast.
 // Reject unstructured matchup prose rather than inferring opponents from player names.
 const m=String(value||"").trim().match(/^(@|vs\.?)\s+([A-Za-z]{2,4})(?:\s+(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s+(\d{1,2}):(\d{2})(am|pm))?$/i);
 if(!m)return null;
 const hh=m[4]==null?null:Number(m[4]),mm=m[5]==null?null:Number(m[5]);
 if((hh!==null&&(hh<1||hh>12||mm>59))||(m[3]&&!WEEKDAYS.has(m[3].toLowerCase())))return null;
 return {venue:m[1]==="@"?"away":"home",opponent:normalizeTeam(m[2]),
  day:m[3]?.toLowerCase()||null,hour:hh,minute:mm,ampm:m[6]?.toLowerCase()||null};
}
function originalDayTimeMatches(hint,dateString){
 if(!hint.day)return true;
 const d=new Date(dateString);
 if(!Number.isFinite(d.getTime()))return false;
 // The archived Sun 8:00pm / Mon 9:00pm labels are Eastern venue-screen times.
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/New_York",weekday:"short",hour:"numeric",minute:"2-digit",hour12:true
 }).formatToParts(d).filter(x=>x.type!=="literal").map(x=>[x.type,x.value]));
 return parts.weekday.toLowerCase()===hint.day &&
  Number(parts.hour)===hint.hour && Number(parts.minute)===hint.minute &&
  parts.dayPeriod.toLowerCase()===hint.ampm;
}
function recoverFromArchivedMatchup(prop,games){
 const hint=parseOriginalMatchup(prop.matchup);
 if(!hint||!prop.team||!prop.capturedAt)return {prop,status:"insufficient_original_match_metadata"};
 const capture=Date.parse(prop.capturedAt),team=normalizeTeam(prop.team);
 if(!Number.isFinite(capture)||!team||hint.opponent===team)
  return {prop,status:"insufficient_original_match_metadata"};
 const pair=(Array.isArray(games)?games:[]).filter(g=>{
  const start=Date.parse(g.startTimeUTC);
  return Number.isInteger(g.id)&&Number.isFinite(start)&&Math.abs(start-capture)<=48*3600000 &&
   [normalizeTeam(g.home),normalizeTeam(g.away)].includes(team)&&
   [normalizeTeam(g.home),normalizeTeam(g.away)].includes(hint.opponent)&&
   originalDayTimeMatches(hint,g.startTimeUTC);
 });
 if(pair.length===0)return {prop,status:"insufficient_original_match_metadata"};
 const oriented=pair.filter(g=>normalizeTeam(hint.venue==="away"?g.away:g.home)===team);
 if(!oriented.length)return {prop,status:"archived_matchup_venue_conflict"};
 const prospective=oriented.filter(g=>{
  const start=Date.parse(g.startTimeUTC);
  return capture<start&&start-capture<=48*3600000;
 });
 if(!prospective.length)return {prop,status:"matchup_source_capture_after_game_start"};
 if(prospective.length!==1)return {prop,status:"ambiguous_archived_matchup_schedule"};
 const match=identifyGame(prop,prospective);
 if(!match||match.gameId!==prospective[0].id)
  return {prop,status:"identity_crosscheck_failed"};
 return {prop:{...prop,...match,gameIdentityResolvedAtGrading:true,
  gameIdentitySource:"archived_matchup_plus_official_nhl_schedule",
  originalSnapshotHadGameId:false},status:"recovered_from_archived_matchup_and_official_schedule"};
}
/**
 * Grade-time metadata enrichment only. Never alter the original saved prediction.
 * Exact event timestamp path is preferred; the fallback requires the ORIGINAL
 * @/vs opponent and, when present, Eastern weekday/time plus a UNIQUE official
 * game within 48 hours AFTER original source capture. The grader separately
 * rejects snapshots first committed after puck drop.
 */
function resolveArchivedGameIdentity(prop,games){
 if(!prop||typeof prop!=="object")return {prop,status:"invalid_prop"};
 if(Number.isInteger(prop.gameId))return {prop,status:"already_identified"};
 if(!prop.capturedAt||!prop.team)return {prop,status:"insufficient_original_match_metadata"};
 if(!prop.opponent||!prop.eventStartsAt)return recoverFromArchivedMatchup(prop,games);
 const expected=Date.parse(prop.eventStartsAt),capture=Date.parse(prop.capturedAt);
 if(!Number.isFinite(expected)||!Number.isFinite(capture)||capture>=expected)
  return {prop,status:"invalid_or_poststart_metadata"};
 const team=normalizeTeam(prop.team),opponent=normalizeTeam(prop.opponent);
 if(!team||!opponent||team===opponent)return {prop,status:"ambiguous_teams"};
 const within=(Array.isArray(games)?games:[]).filter(g=>{
  if(!Number.isInteger(g.id)||!g.startTimeUTC)return false;
  const start=Date.parse(g.startTimeUTC);
  if(!Number.isFinite(start)||Math.abs(start-expected)>5*60000||capture>=start)return false;
  const home=normalizeTeam(g.home),away=normalizeTeam(g.away);
  return (home===team&&away===opponent)||(away===team&&home===opponent);
 });
 if(within.length!==1)return {prop,status:within.length?"ambiguous_schedule_match":"no_exact_official_schedule_match"};
 const match=identifyGame(prop,within);
 if(!match||match.gameId!==within[0].id)return {prop,status:"identity_crosscheck_failed"};
 return {prop:{...prop,...match,
  gameIdentityResolvedAtGrading:true,gameIdentitySource:"cached_official_nhl_schedule",
  originalSnapshotHadGameId:false},
  status:"recovered_from_official_schedule"};
}
module.exports={resolveArchivedGameIdentity,parseOriginalMatchup,originalDayTimeMatches};
