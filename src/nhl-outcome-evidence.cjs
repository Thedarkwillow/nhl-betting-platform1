"use strict";
/**
 * NHL final-stat direction is NEVER an authenticated PrizePicks/Underdog
 * settlement. This contract preserves independent proof for both.
 * Platform Push, DNP, Reboot, void, promotional payout or late rescoring
 * must come from independently verified platform-specific evidence.
 */
const DIRECTIONS=new Set(["Higher","Lower","Push"]);
function evidenceForOfficialGrade(p){
 if(!p||!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
   !Number.isFinite(p.line)||!Number.isFinite(p.actual)||
   !DIRECTIONS.has(p.result))throw Error("Validated official NHL scored row required");
 const calculated=p.actual>p.line?"Higher":p.actual<p.line?"Lower":"Push";
 if(p.result!==calculated)throw Error("Official NHL market direction inconsistent with stat and line");
 const status=p.result==="Push"?"official_stat_push":"official_stat_decided";
 return {
  officialNhlStatDirection:{status,source:"NHL_FINAL_player_game_stats",
   market:p.market,actual:p.actual,line:p.line,direction:calculated,
   gameId:p.gameId,playerId:p.playerId,originalSourceLineFrozenBeforeGame:
    typeof p.snapshotArchivedAt==="string"&&
    typeof p.gameStartAt==="string"&&
    Number.isFinite(Date.parse(p.snapshotArchivedAt))&&
    Number.isFinite(Date.parse(p.gameStartAt))&&
    Date.parse(p.snapshotArchivedAt)<Date.parse(p.gameStartAt)},
  originalPrizePicksSettlement:{status:"not_verified",source:null,
   settledResult:null,settlementAt:null,payoutMultiplier:null,
   stake:null,realizedNetReturn:null,
   dnpRebootOrVoidVerified:false,requiresFirstPartyEvidence:true},
  originalUnderdogSettlement:{status:"not_verified",source:null,
   settledResult:null,settlementAt:null,payoutMultiplier:null,
   stake:null,realizedNetReturn:null,
   dnpRebootOrVoidVerified:false,requiresFirstPartyEvidence:true}
 };
}
function summarizeOutcomeEvidence(grading,{sourceCohort="raw_offered_directions"}={}){
 const rows=grading?.graded||[],pending=grading?.pending||[];
 if(!Array.isArray(rows)||!Array.isArray(pending))throw Error("Validated NHL grading required");
 const officialDecided=rows.filter(p=>p.result==="Higher"||p.result==="Lower").length;
 const pushes=rows.filter(p=>p.result==="Push").length;
 return {schemaVersion:1,kind:"nhl_official_direction_vs_platform_settlement",
  sourceCohort,
  officialNhl:{decided:officialDecided,pushes,missingOrUnfinished:pending.length,
   gradedRows:rows.length,source:"official_NHL_final_player_boxscores",
   gamesInProgressNeverScoredAsLosses:true},
  prizepicks:{authenticatedSettlements:0,status:"not_verified",
   dnpRebootVoidConfirmed:0,actualLineupPayoutsVerified:0,realizedReturn:null},
  underdog:{authenticatedSettlements:0,status:"not_verified",
   dnpRebootVoidConfirmed:0,actualLineupPayoutsVerified:0,realizedReturn:null},
  resultFromNhlFinalIsNotPlatformSettlement:true,
  noDnpOrRebootRuleInferred:true,estimatedModelProbabilityIsNotHitRate:true,
  bettingReturnAndProfitVerified:false};
}
module.exports={evidenceForOfficialGrade,summarizeOutcomeEvidence};
