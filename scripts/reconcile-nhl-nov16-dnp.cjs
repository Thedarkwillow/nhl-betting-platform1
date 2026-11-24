"use strict";
// Historical, case-specific official non-appearance reconciliation.
// No fake zero stat, no change to first-Git model selections, no assertion of
// PrizePicks account-level settlement.
const fs=require("node:fs"),path=require("node:path");
const {audit}=require("./audit-nhl-nov16-pending-appearances.cjs");
const root=path.resolve(__dirname,"..");
const evidence=Object.freeze({
  8476981:{player:"Josh Anderson",team:"MTL",reason:"lower_body_injury",
    source:"NHL.com projected lineups and injuries, Nov 16 2026",
    sourceUrl:"https://www.nhl.com/news/nhl-lineup-projections-2026-27-season"},
  8481604:{player:"Pavel Dorofeyev",team:"NYR",reason:"lower_body_late_scratch",
    source:"Sportsnet, Rangers Dorofeyev last minute scratch, Nov 16 2026",
    sourceUrl:"https://www.sportsnet.ca/nhl/article/rangers-dorofeyev-last-minute-scratch-vs-montreal-due-to-injury/"}
});
function resolve(d,source=evidence){
 if(d?.kind!=="private_nhl_nov16_unresolved_selection_identity_audit_v1"||
    d.date!=="2026-11-16"||d.gameId!==2026020331||
    d.finalGames!==2||d.officialGamePlayerRows!==40||d.pendingSelections!==4||
    !Array.isArray(d.findings)||d.findings.length!==4)throw Error("Expected verified frozen final-only unresolved cohort");
 const counts={};
 const rows=d.findings.map(r=>{
  if(r.resultStatus!=="player_id_absent_from_final_boxscore"||r.officialGameRowFound!==false||
  r.historyGameFound!==false||r.officialOtherGameId!==null||r.originalCommitProven!==true||
  !["shotsOnGoal","points"].includes(r.market)||!["Higher","Lower"].includes(r.side)||
  !["Goblin","Standard"].includes(r.tier))throw Error("Nonappearance not securely established");
  const proof=source[r.playerId];
  if(!proof||r.team!==proof.team||!proof.player||!proof.sourceUrl)throw Error("Absent authenticated independent injury/scratch report");
  counts[r.playerId]=(counts[r.playerId]||0)+1;
  return {playerId:r.playerId,playerName:proof.player,team:r.team,
    market:r.market,line:r.line,selectedSide:r.side,tier:r.tier,
    verification:"official_final_no_player_appearance_plus_reported_injury_or_scratch",
    reason:proof.reason,source:proof.source,sourceUrl:proof.sourceUrl,
    statisticalDisposition:"DNP_candidate_excluded_from_correct_incorrect_denominator",
    officialPlayerStat:null,notARecordedPlatformSettlement:true};
 });
 if(counts[8476981]!==1||counts[8481604]!==3||Object.keys(counts).length!==2)throw Error("Case mix inconsistent with frozen originals");
 return {kind:"private_nhl_nov16_official_dnp_candidate_reconciliation_v1",
  date:"2026-11-16",gameId:2026020331,originallyUnresolved:4,
  officialNonappearancesIndependentlyConfirmed:4,unexplainedStatisticalPending:0,
  researchDnpEligible:4,platformDnpSettlementsVerified:0,
  gradingResultsChanged:false,countsInHitRate:false,noMissingStatsImputedAsZero:true,
  noGuaranteedLineupReversionWithoutPlatformEvidence:true,
  prizePicksRulesUrl:"https://www.prizepicks.com/help-center/dnps-reboots-and-ties",
  rows};
}
if(require.main===module){
 const data=resolve(audit());
 const dest=path.join(root,"outputs/health/nhl-nov16-nonappearance-reconciled.json");
 fs.writeFileSync(dest,JSON.stringify(data,null,2)+"\n");
 const gradePath=path.join(root,"outputs/health/official-game-grade-2026-11-16.json");
 const grade=JSON.parse(fs.readFileSync(gradePath,"utf8"));
 if(grade.kind!=="private_official_nhl_nfl_daily_original_frozen_grade_v1"||
 grade.date!=="2026-11-16"||grade.nhl?.combined?.pending!==4||
 grade.nhl.combined.correct!==53||grade.nhl.combined.incorrect!==30)throw Error("Existing research grade mismatch");
 grade.nhl.nonappearanceReconciliation={
  researchDnpEligible:data.researchDnpEligible,
  missingOfficialPlayerAppearanceConfirmed:data.officialNonappearancesIndependentlyConfirmed,
  unexplainedStatisticalPending:data.unexplainedStatisticalPending,
  actualPlatformDnpSettlementsVerified:0,
  gradingDenominatorUnchanged:true,
  sourceFile:"outputs/health/nhl-nov16-nonappearance-reconciled.json"};
 fs.writeFileSync(gradePath,JSON.stringify(grade,null,2)+"\n");
 console.log(JSON.stringify({kind:data.kind,officialDnpCandidates:4,
   unexplainedStatisticalPending:0,gradedCorrectUnchanged:53,gradedIncorrectUnchanged:30,
   actualPlatformDnpSettlementsVerified:0}));
}
module.exports={resolve,evidence};
