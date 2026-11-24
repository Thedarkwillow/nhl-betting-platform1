"use strict";
/** Prepaid-request readiness based only on cached official games and NHL
 * historical projections. No provider access. Model details stay private.
 */
const {POLICY}=require("./nhl-frozen-individual-props.cjs");
const at=x=>typeof x==="string"?Date.parse(x):NaN;
function sourceReadiness({schedule,history,projections,now=new Date().toISOString()}={}){
 const t=at(now),sourceFile=history?.sourceFiles?.at(-1)||null,
  lastSource=typeof sourceFile==="string"&&/^\d{4}-\d{2}-\d{2}(?:\.json)?$/.test(sourceFile)?
   sourceFile.replace(/\.json$/,""):null;
 if(!Number.isFinite(t))throw Error("Invalid pregame readiness clock");
 const reasons=[];
 if(schedule?.complete!==true||!Array.isArray(schedule.games)||schedule.games.length<500)
  reasons.push("official_season_schedule_not_complete");
 if(!history?.players||!Object.keys(history.players).length)
  reasons.push("historical_player_database_missing");
 if(projections?.model!=="weighted-form-v1"||!projections?.players||
    !Object.keys(projections.players).length)reasons.push("frozen_champion_model_missing");
 const gameStarts=(schedule?.games||[]).filter(g=>Number.isInteger(g.id)&&
  /^[A-Z]{3}$/.test(g.home||"")&&/^[A-Z]{3}$/.test(g.away||"")&&
  g.home!==g.away&&Number.isFinite(at(g.startTimeUTC))&&
  at(g.startTimeUTC)>t+15*60000&&at(g.startTimeUTC)<=t+72*3600000);
 if(!gameStarts.length)reasons.push("no_confirmed_future_NHL_game_within_72_hours");
 const last=lastSource?at(lastSource+"T00:00:00Z"):NaN;
 if(!Number.isFinite(last)||last>t+24*3600000||
  (t-last)>10*86400000)reasons.push("historical_official_stats_unavailable_or_too_old");
 return {ready:reasons.length===0,reasons,upcomingOfficialGames:gameStarts.length,
  lastOfficialStatsDate:lastSource,model:"weighted-form-v1",
  originalSelectionPolicy:POLICY,preflightsPaidProviderRequest:true,
  providerRequests:0,payoutVerified:false,calibrationVerified:false};
}
function frozenSelectionReadiness({research,now=new Date().toISOString()}={}){
 const t=at(now),captured=at(research?.generatedAt),reasons=[];
 if(!Number.isFinite(t)||!Number.isFinite(captured)||captured>t||
  t-captured>30*60000)reasons.push("research_not_recently_generated");
 // A verifiably complete selected-event capture may support an
 // explicitly scope-limited prospective model cohort, but never qualifies
 // as a complete league board or original-platform authenticated offer.
 const completeBoard=research?.boardCoverageComplete===true;
 const completeSubset=research?.sourceScope==="verified_selected_events"&&
  research?.captureScopeComplete===true&&research?.boardCoverageComplete===false;
 if((!completeBoard&&!completeSubset)||research?.boardFresh!==true)
  reasons.push("source_board_incomplete_or_stale");
 if(research?.individualPropSelectionPolicy!==POLICY)
  reasons.push("selection_policy_not_precommitted");
 const picks=Array.isArray(research?.individualPropSelections)?research.individualPropSelections:[];
 if(!picks.length)reasons.push("no_eligible_explicit_individual_model_preferences");
 const ids=new Set();
 for(const p of picks){
  const key=[p.gameId,p.playerId,p.market,p.line,p.tier].join("|");
  if(!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||p.gameId<=0||
    !Number.isFinite(p.line)||!["Higher","Lower"].includes(p.lean)||
    !Number.isFinite(p.probability)||p.probability<=.5||p.probability>=1||
    !Number.isFinite(at(p.capturedAt))||!Number.isFinite(at(p.eventStartsAt))||
    !Number.isFinite(at(p.gameStartAt))||at(p.capturedAt)>captured||
    captured>=at(p.eventStartsAt)||at(p.eventStartsAt)-t<15*60000||
    Math.abs(at(p.eventStartsAt)-at(p.gameStartAt))>300000||
    ids.has(key)){
   reasons.push("invalid_or_too_late_selection_identity_or_chronology");
   break;
  }
  ids.add(key);
 }
 return {ready:reasons.length===0,reasons,selectedIndividualProps:picks.length,
  uniqueSelectedProps:ids.size,requiresGitCommitBeforeEveryPuckDrop:true,
  precommitmentEstablishedByLocalFileAlone:false};
}
module.exports={sourceReadiness,frozenSelectionReadiness};
