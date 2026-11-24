"use strict";
/**
 * Research-only first-Git source adapter. Extends history at freeze time with
 * prior official seasons; never changes original offers or strict policy.
 * Caller must load the data from its already checked-out private Git HEAD
 * before freeze (not from live/postgame results).
 */
const KIND="nhl_strict_multi_season_pregame_inputs_v1";
const validDay=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&
 Number.isFinite(Date.parse(x+"T00:00:00Z"));
function adapt(loaded,cutoff){
 const fail=reason=>({kind:KIND,available:false,reason,history:null,schedules:[],
  combinedSchedule:null,historyCounts:null,researchOnly:true,modelPromoted:false});
 if(!validDay(cutoff)||!loaded?.history?.players||!Array.isArray(loaded.schedules)||
    loaded.schedules.length<2||!loaded.counts||
    loaded.counts.conflicts>0||!Number.isInteger(loaded.counts.uniquePlayerGames)||
    loaded.counts.uniquePlayerGames<1)
  return fail("asof_history_archive_contract_missing_or_conflicted");
 const list=[...loaded.schedules],seasons=new Set(),ids=new Set(),games=[];
 for(const schedule of list){
  if(schedule?.source!=="Official NHL Web API"||schedule.complete!==true||
     !/^(20\d{2})-(\d{2})$/.test(schedule.season||"")||
     !Array.isArray(schedule.games)||schedule.games.length<1||
     seasons.has(schedule.season))
   return fail("official_schedule_not_unique_and_complete");
  seasons.add(schedule.season);
  for(const g of schedule.games){
   if(!Number.isInteger(g.id)||!validDay(g.gameDate)||ids.has(g.id)||
      !g.home||!g.away||g.home===g.away||g.season!==schedule.season)
    return fail("official_game_schedule_identity_conflict");
   ids.add(g.id);games.push(g);
  }
 }
 if(!seasons.has("2026-27")||!seasons.has("2025-26"))
  return fail("current_and_previous_seasons_not_both_available");
 return {kind:KIND,available:true,cutoff,seasons:[...seasons].sort(),
  history:loaded.history,schedules:list,
  combinedSchedule:{source:"Official NHL Web API",complete:true,
   season:"MULTI_SEASON_RESEARCH_ONLY",games},
  historyCounts:{current:loaded.counts.current,prior:loaded.counts.prior,
   duplicates:loaded.counts.duplicates,
   uniquePlayerGames:loaded.counts.uniquePlayerGames,
   distinctDates:loaded.counts.distinctDates},
  officialScheduleGameIds:ids.size,
  beforeDateExclusive:cutoff,
  verifiedFromPreviouslyArchivedGitCheckoutOnly:true,
  originalMarketSideAndLineUnchanged:true,asOfFullHistoricalProvenanceIndependentlyAuthenticated:false,
  bettingEligible:false,probabilityCalibrated:false,
  researchOnly:true,modelPromoted:false};
}
module.exports={KIND,adapt};
