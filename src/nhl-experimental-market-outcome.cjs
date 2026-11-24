"use strict";
/**
 * Separate prospective outcome scorer for expanded NHL single-player
 * research picks. NEVER combine this cohort with the original champion
 * prospective hit rate or claim original-platform settlement.
 */
const {validArchiveChronology}=require("./grade-nhl-predictions.cjs");
const {evidenceForOfficialGrade}=require("./nhl-outcome-evidence.cjs");
const {INDIVIDUAL_MARKETS}=require("./nhl-experimental-offer-bridge.cjs");
function officialExperimentalActual(p,game){
 const rule=INDIVIDUAL_MARKETS[p?.market];
 if(!rule||!game)return {actual:null,reason:"unknown_experimental_nhl_market"};
 const value=game[rule.stat];
 if(!Number.isFinite(value))return {actual:null,reason:"missing_official_stat"};
 if(rule.unit==="minutes"){
  if(p.marketStatUnit!=="minutes"||
   p.marketOvertimeRule!=="includes_official_full_game"||
   !Number.isInteger(value)||value<0)
   return {actual:null,reason:"toi_exact_unit_or_overtime_rule_not_proven"};
  return {actual:value/60,unit:"minutes",officialRawSeconds:value,
   outcomeSource:"NHL_final_full_game_TOI_including_overtime"};
 }
 if(rule.unit==="count"&&(!Number.isInteger(value)||value<0))
  return {actual:null,reason:"invalid_official_count"};
 if(rule.unit==="signed_integer"&&!Number.isInteger(value))
  return {actual:null,reason:"invalid_official_signed_plus_minus"};
 // Fantasy scores may be negative; signed decimal scores are valid. Must
 // retain the original user-provided PrizePicks coefficient version.
 if(rule.unit==="prizepicks_points"&&
   p.marketRuleVersion!=="prizepicks-nhl-goalie-fantasy-user-provided-20261106")
  return {actual:null,reason:"prizepicks_scoring_rule_version_unverified"};
 return {actual:value,unit:rule.unit,
  outcomeSource:"official_NHL_final_game_player_stat_under_declared_market_rule"};
}
function gradeExperimentalFrozenPicks(picks,history){
 if(!Array.isArray(picks)||!history?.players)
  throw Error("Require frozen research picks and official NHL results");
 const outcomes=new Map();
 for(const p of Object.values(history.players))
  for(const g of p.games||[])
   if(Number.isInteger(g.gameId)&&Number.isInteger(g.playerId))
    outcomes.set(g.gameId+"|"+g.playerId,g);
 const graded=[],pending=[],rejected=[];
 for(const p of picks){
  const key=p?.gameId+"|"+p?.playerId;
  const times=[p?.capturedAt,p?.predictionRecordedAt,p?.snapshotArchivedAt,p?.gameStartAt]
   .map(x=>Date.parse(x));
  if(!p?.experimentalMarketResearchOnly||
   !Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
   !Number.isFinite(p.line)||!["Higher","Lower"].includes(p.lean)||
   !Number.isFinite(p.probability)||p.probability<=0||p.probability>=1||
   !validArchiveChronology(...times)){
   rejected.push({key,reason:"missing_first_git_commit_or_pregame_model_proof"});
   continue;
  }
  const game=outcomes.get(key);
  if(!game){pending.push({key,reason:"official_final_game_not_archived"});continue;}
  const result=officialExperimentalActual(p,game);
  if(!Number.isFinite(result.actual)){
   rejected.push({key,reason:result.reason});continue;
  }
  const actual=result.actual,side=actual>p.line?"Higher":actual<p.line?"Lower":"Push";
  const grade={gameId:p.gameId,playerId:p.playerId,market:p.market,
   actual,line:p.line,result:side,lean:p.lean,gameDate:game.gameDate,
   correct:side==="Push"?null:side===p.lean,
   probability:p.probability,unit:result.unit,
   officialOutcomeSource:result.outcomeSource,
   capturedAt:p.capturedAt,predictionRecordedAt:p.predictionRecordedAt,
   snapshotArchivedAt:p.snapshotArchivedAt,gameStartAt:p.gameStartAt,
   model:p.model,marketRuleVersion:p.marketRuleVersion||null,
   originalPlatformSettlementVerified:false};
  graded.push({...grade,...evidenceForOfficialGrade(grade)});
 }
 const decided=graded.filter(r=>r.correct!==null);
 return {kind:"nhl_expanded_market_prospective_selected_direction_audit_v1",
  graded,pending,rejected,
  summary:{selected:picks.length,graded:graded.length,decided:decided.length,
   correct:decided.filter(r=>r.correct).length,pushes:graded.length-decided.length,
   observedResearchHitRate:decided.length?
    decided.filter(r=>r.correct).length/decided.length:null},
  firstGitCommitChronologyRequired:true,
  neverMixedWithLegacyChampionAccuracy:true,
  originalPlatformSettlementVerified:false,calibrationVerified:false,
  returnOnInvestmentVerified:false,
  warning:"Official NHL final-stat directions in a separate experimental cohort. Third-party quotes are not original PrizePicks/Underdog settlement. TOI uses verified full-game minutes, not seconds or Underdog regulation-only semantics. No inferred betting edge."};
}
module.exports={officialExperimentalActual,gradeExperimentalFrozenPicks};
