"use strict";
/**
 * Original first-Git NHL picked-prop grade for one fully FINAL official slate.
 * No reconstructed bets, opposite-side fantasy offers, payouts, EV, wagers,
 * user-account data, external API calls, or invented settlements.
 */
const KIND="private_nhl_final_slate_tier_game_grade_v1",TIERS=["Standard","Goblin","Demon"];
const tm=x=>typeof x==="string"?Date.parse(x):NaN;
const date=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x);
const group=()=>({registered:0,correct:0,incorrect:0,push:0,pending:0,
 decided:0,actualHigher:0,actualLower:0});
const show=g=>({...g,hitRate:g.decided?Number((g.correct/g.decided).toFixed(6)):null,
 hypotheticalAlwaysHigher:g.decided?Number((g.actualHigher/g.decided).toFixed(6)):null,
 hypotheticalAlwaysLower:g.decided?Number((g.actualLower/g.decided).toFixed(6)):null});
function audit({date:day,stats,schedule,ledger}={}){
 const fail=reason=>({kind:KIND,slateDate:day||null,status:"unavailable",
  reason,all12GamesVerified:false,calibrated:false,officialPlatformSettlement:false,
  paidRequests:0});
 if(!date(day)||stats?.requestedDate!==day||stats.source!=="NHL public API"||
    stats.sourceSchemaVersion!==5||!Array.isArray(stats.players)||
    !Number.isInteger(stats.scheduledGames)||stats.scheduledGames<=0||
    stats.scheduledGames!==stats.completedGames||
    stats.scheduledGames!==stats.collectedGames||
    !Array.isArray(stats.errors)||stats.errors.length||
    !schedule?.complete||!Array.isArray(schedule.games)||
    ledger?.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
    ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
    !Array.isArray(ledger.records))
  return fail("unverified_official_final_slate_or_original_frozen_ledger");
 const games=schedule.games.filter(g=>g.gameDate===day).sort((a,b)=>a.id-b.id);
 const officialIds=new Set(stats.players.map(x=>x.gameId));
 if(games.length!==stats.scheduledGames||games.some(g=>!Number.isInteger(g.id)||
    !officialIds.has(g.id)||!Number.isFinite(tm(g.startTimeUTC))||
    !g.away||!g.home))
  return fail("official_final_game_identity_or_schedule_coverage_mismatch");
 const officialGameRows=new Map();
 for(const p of stats.players)if(officialIds.has(p.gameId))
  officialGameRows.set(p.gameId,(officialGameRows.get(p.gameId)||0)+1);
 if(games.some(g=>(officialGameRows.get(g.id)||0)<20))
  return fail("incomplete_player_boxscores_for_final_game");
 const byId=new Map(games.map(g=>[g.id,g])),seen=new Set(),
  all=group(),tiers=Object.fromEntries(TIERS.map(t=>[t,group()])),
  markets={},gameGrades={};
 for(const g of games){
  gameGrades[g.id]={gameId:g.id,matchup:g.away+" @ "+g.home,
   all:group(),tiers:Object.fromEntries(TIERS.map(t=>[t,group()]))};
 }
 let otherDatesExcluded=0;
 for(const r of ledger.records){
  if(!byId.has(r?.gameId)){otherDatesExcluded++;continue;}
  if(!r||typeof r.id!=="string"||!r.id||seen.has(r.id)||
     !TIERS.includes(r.tier)||!["Higher","Lower"].includes(r.selectedSide)||
     !["correct","incorrect","push","pending_official_player_stats"].includes(r.selectionStatus)||
     !Number.isInteger(r.playerId)||!Number.isFinite(tm(r.firstCaptureAt))||
     !Number.isFinite(tm(r.firstResearchAt))||
     !Number.isFinite(tm(r.firstGitCommittedAt))||
     !Number.isFinite(tm(r.gameStartAt))||
     tm(r.firstCaptureAt)>tm(r.firstResearchAt)||
     tm(r.firstResearchAt)>tm(r.firstGitCommittedAt)+999||
     tm(r.firstGitCommittedAt)>=tm(r.gameStartAt)||
     Math.abs(tm(byId.get(r.gameId).startTimeUTC)-tm(r.gameStartAt))>300000)
   return fail("duplicate_or_invalid_original_pregame_selection");
  seen.add(r.id);
  if(!markets[r.market])markets[r.market]=group();
  const sets=[all,tiers[r.tier],markets[r.market],gameGrades[r.gameId].all,gameGrades[r.gameId].tiers[r.tier]];
  for(const b of sets){
   b.registered++;
   if(r.selectionStatus==="pending_official_player_stats"){b.pending++;continue;}
   if(r.selectionStatus==="push"){b.push++;continue;}
   if(!["Higher","Lower"].includes(r.officialResult)||
      r.officialGameDate!==day||
      (r.selectionStatus==="correct")!==(r.selectedSide===r.officialResult))
    return fail("invalid_official_player_result_reconciliation");
   b[r.selectionStatus]++;b.decided++;
   if(r.officialResult==="Higher")b.actualHigher++;
   else b.actualLower++;
  }
 }
 const displayedGames=Object.values(gameGrades).map(g=>({
  gameId:g.gameId,matchup:g.matchup,
  all:show(g.all),tiers:Object.fromEntries(TIERS.map(t=>[t,show(g.tiers[t])]))
 }));
 const output={
  kind:KIND,status:"all_games_official_final_original_frozen_prop_research_only",
  slateDate:day,officialGamesTotal:stats.scheduledGames,all12GamesVerified:games.length===12,
  completeOfficialPlayerRows:stats.players.length,
  all:show(all),tiers:Object.fromEntries(TIERS.map(t=>[t,show(tiers[t])])),
  byMarket:Object.fromEntries(Object.entries(markets).sort().map(([m,v])=>[m,show(v)])),
  games:displayedGames,otherDatesExcluded,
  firstGitPregameOnly:true,pushExcludedFromDecided:true,
  standardBaselinesHypotheticalOnly:true,nonStandardOppositeSideNotAuthorized:true,
  independentlyCalibrated:false,originalPlatformSettlementVerified:false,
  payoutAdjustedEVVerified:false,automaticBettingLineupsApproved:false,
  actualWagersPlaced:0,paidRequests:0};
 return output;
}
module.exports={KIND,audit};
