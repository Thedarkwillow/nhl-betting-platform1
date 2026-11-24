"use strict";
/** Pregame source-time-verified NHL exclusion research. Never grant active
 * clearance from missing injury rows, projections or postgame lineups. */
const KIND="nhl_point_in_time_availability_gate_20261120_v2";
const BLOCK=new Set(["out","injured","injured reserve","injured_reserve",
 "scratched","healthy scratch","suspended","inactive","doubtful",
 "questionable","game-time decision","game time decision","day-to-day"]);
const at=x=>typeof x==="string"?Date.parse(x):NaN;
const team=x=>({"SJ":"SJS","LA":"LAK","TB":"TBL","NJ":"NJD"}[String(x||"").toUpperCase()]||String(x||"").toUpperCase());
function status(r){
 return String(r?.status||"").toLowerCase().trim().replace(/\s+/g," ");
}
function assess(p,{now,official=null,external=null,officialGitAt=null,externalGitAt=null}={}){
 const start=at(p?.gameStartAt),t=at(now);
 const fail=(reason,extra={})=>({kind:KIND,status:"abstain",
  reason,confirmedNotPlaying:false,activeParticipationVerified:false,
  bettingEligible:false,...extra});
 if(!Number.isInteger(p?.playerId)||!Number.isInteger(p?.gameId)||
    !team(p?.team)||![start,t].every(Number.isFinite)||start<=t+15*60000)
  return fail("invalid_original_game_player_or_pregame_clock");
 const hits=[],sourceIssues=[];
 const use=(source,gitAt,name)=>{
  if(!source)return;
  const captured=at(source.capturedAt??source.generatedAt),git=at(gitAt);
  if(!Number.isFinite(captured)||captured>t||!Number.isFinite(git)||
     git>t||git<captured-1000||t-git>12*3600000){
   sourceIssues.push(name+"_unverified_or_stale_capture");return;
  }
  const officialSource=name==="official";
  if(officialSource&&source.kind!=="nhl_league_published_pregame_status_v1"||
     !officialSource&&source.kind!=="nhl_external_pregame_availability_research"||
     !Array.isArray(officialSource?source.rows:source.injuries)){
   sourceIssues.push(name+"_schema_invalid");return;
  }
  const matches=(officialSource?source.rows:source.injuries).filter(x=>
   x.playerId===p.playerId&&team(x.team)===team(p.team)&&
   (!officialSource||x.gameId===p.gameId&&
    Number.isFinite(at(x.eventStartsAt))&&Math.abs(at(x.eventStartsAt)-start)<=300000));
  if(matches.length>1){sourceIssues.push(name+"_duplicate_or_conflicting_status");return;}
  if(!matches.length)return;
  const x=matches[0],issued=at(x.reportedAt),observed=officialSource?captured:at(x.sourceCapturedAt);
  if(!Number.isFinite(issued)||issued>captured||issued>=start||
      !Number.isFinite(observed)||observed>t||observed<issued){
   sourceIssues.push(name+"_report_was_not_available_pregame");return;
  }
  const s=status(x);
  hits.push({source:name,status:s,reportedAt:x.reportedAt,capturedAt:source.capturedAt??source.generatedAt,
   blocks:BLOCK.has(s)});
 };
 use(official,officialGitAt,"official");
 use(external,externalGitAt,"external");
 if(sourceIssues.length)return fail("conflicting_or_unverified_availability_source",{
  sourceIssues,sourceStatuses:hits,requiresHumanReview:true});
 const blocked=hits.filter(x=>x.blocks);
 if(blocked.length)return fail("pregame_injury_scratch_or_uncertain_status",{
  confirmedNotPlaying:blocked.some(x=>["out","injured","injured reserve","injured_reserve",
    "scratched","healthy scratch","suspended","inactive"].includes(x.status)),
  sourceStatuses:hits,requiresHumanReview:true});
 return {kind:KIND,status:"research_only_unknown_active_roster",
  reason:"no_positive_official_game_day_active_confirmation",
  sourceStatuses:hits,sourceIssues:[],
  confirmedNotPlaying:false,activeParticipationVerified:false,
  bettingEligible:false};
}
module.exports={KIND,assess};
