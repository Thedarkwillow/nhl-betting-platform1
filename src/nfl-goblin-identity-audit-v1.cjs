"use strict";
/** NFL Goblin source-identity and injury preconditions, NOT a live-pick engine.
 * Provider player IDs are not GSIS IDs. Names or absence from the injury
 * report are never sufficient to mark a player available. Research only.
 */
const finite=x=>Number.isFinite(x),date=x=>typeof x==="string"?Date.parse(x):NaN;
const clean=s=>typeof s==="string"&&s.length>0&&s.length<170;
const {team}=require("./nfl-goblin-schedule-bridge-v1.cjs");
function auditNFL(offers,{sourceAt,now,gameCrosswalk=[],playerCrosswalk=[],
 officialStatus=null,originalArchiveFirstGitAt=null}={}){
 const reasons={},count=k=>reasons[k]=(reasons[k]||0)+1;
 const result={kind:"nfl_goblin_official_identity_availability_audit_v1",
  originalOfferRows:0,eligibleModelInputRows:0,
  prerequisiteGaps:{officialGame:0,providerToGSIS:0,positiveActiveRoster:0},
  reasons,firstGitOriginalBoardVerified:false,
  originalAppAvailabilityVerified:false,officialActiveRostersVerified:false,
  noNameOnlyPlayerIdentity:true,paidProviderRequests:0,
  recommendationsReleased:0,modelPromoted:false};
 const current=date(now),capture=date(sourceAt),archived=date(originalArchiveFirstGitAt);
 const verified=finite(current)&&finite(capture)&&finite(archived)&&
  current>=capture&&current-capture<=30*60000&&
  archived>=capture-1000&&archived<=current;
 result.firstGitOriginalBoardVerified=verified;
 const games=Array.isArray(gameCrosswalk)?gameCrosswalk:[],players=Array.isArray(playerCrosswalk)?playerCrosswalk:[],
  statuses=Array.isArray(officialStatus?.rows)?officialStatus.rows:[];
 for(const o of Array.isArray(offers)?offers:[]){
  if(String(o?.tier).toLowerCase()!=="goblin"||o.period!=="Full"||
   o.eventType==="combo"||o.combo===true||o.status!=="pre_game")continue;
  result.originalOfferRows++;
  if(!verified){count("no_fresh_first_git_full_board");continue;}
  if(!clean(o.providerPlayerId)||!clean(o.providerGameId)||
    !finite(date(o.eventStartsAt))||date(o.eventStartsAt)-current<15*60000||
    !finite(o.line)){count("invalid_provider_identity_or_kickoff");continue;}
  const m=games.filter(x=>x.providerGameId===o.providerGameId&&
    x.source==="pregame_nflverse_schedule_git_verified"&&
    x.independentScheduleOnly===true&&
    x.originalPlatformIdentityAuthenticated===false&&
    [x.homeTeam,x.awayTeam].includes(team(o.team))&&
    (!o.opponent||[x.homeTeam,x.awayTeam].includes(team(o.opponent))&&
       team(o.opponent)!==team(o.team))&&
    finite(date(x.officialKickoffAt))&&
    Math.abs(date(x.officialKickoffAt)-date(o.eventStartsAt))<=5*60000&&
    x.verifiedBeforeKickoff===true&&
    finite(date(x.firstGitAt))&&date(x.firstGitAt)<=capture&&
    date(x.firstGitAt)<=current);
  const identity=players.filter(x=>x.providerPlayerId===o.providerPlayerId&&
    clean(x.gsisId)&&x.team===o.team&&
    x.source==="independently_verified_provider_gsis_bridge"&&
    finite(date(x.firstGitAt))&&date(x.firstGitAt)<=current);
  // Independent missing-source counts are NOT extra picks. They reveal
  // all simultaneous blockers even when the first validation gate fails.
  if(m.length!==1)result.prerequisiteGaps.officialGame++;
  if(identity.length!==1)result.prerequisiteGaps.providerToGSIS++;
  if(officialStatus?.activeGameRosterVerified!==true)
   result.prerequisiteGaps.positiveActiveRoster++;
  if(m.length!==1){count("official_game_crosswalk_unverified");continue;}
  if(identity.length!==1){count("exact_provider_player_to_gsis_bridge_unverified");continue;}
  // NFL published report currently carries OUT notices; it does not prove
  // all unlisted players ACTIVE. Require a positive game-specific record.
  if(officialStatus?.activeGameRosterVerified!==true||
     !finite(date(officialStatus.capturedAt))||
     date(officialStatus.capturedAt)>current||
     current-date(officialStatus.capturedAt)>12*3600000){
    count("official_current_active_roster_missing");continue;
  }
  const on=statuses.filter(x=>x.gsisId===identity[0].gsisId&&
    x.team===o.team&&x.gameId===m[0].officialGameId&&
    finite(date(x.modifiedAt))&&date(x.modifiedAt)<=current);
  if(on.length!==1||on[0].status!=="active"||
    on[0].officialPregameConfirmed!==true){
    count("player_active_status_not_confirmed");continue;
  }
  result.eligibleModelInputRows++;
 }
 result.officialActiveRostersVerified=officialStatus?.activeGameRosterVerified===true;
 return result;
}
module.exports={auditNFL};
