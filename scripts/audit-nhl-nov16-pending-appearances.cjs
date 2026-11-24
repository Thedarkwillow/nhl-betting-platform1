"use strict";
const fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,".."),load=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
function audit(day="2026-11-16",gameId=2026020331){
 const official=load("outputs/player-stats/"+day+".json");
 if(official.requestedDate!==day||official.sourceSchemaVersion!==5||
 official.completedGames!==official.scheduledGames||
 official.collectedGames!==official.scheduledGames||
 !Array.isArray(official.errors)||official.errors.length||
 !Array.isArray(official.players))throw Error("Official final boxscores incomplete");
 const ledger=load("outputs/research/registry/nhl-precommitted-ledger-latest.json");
 const hist=load("outputs/history/players.json");
 if(ledger.kind!=="private_immutable_source_linked_nhl_selected_predictions"||
 ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||
 !Array.isArray(ledger.records)||!hist.players)throw Error("No original frozen ledger or official history");
 const all=ledger.records.filter(x=>x.gameId===gameId);
 const pending=all.filter(x=>x.selectionStatus==="pending_official_player_stats");
 const gameRows=official.players.filter(x=>x.gameId===gameId);
 if(!gameRows.length)throw Error("Game boxscore missing");
 const statsByPlayer=new Map(gameRows.map(x=>[x.playerId,x]));
 if(statsByPlayer.size!==gameRows.length)throw Error("Duplicate official game player");
 const findings=pending.map(x=>{
  const histPlayer=hist.players[String(x.playerId)];
  const officialRow=statsByPlayer.get(x.playerId);
  const historyGame=histPlayer?.games?.find(g=>g.gameId===gameId);
  const sameDateOther=official.players.filter(g=>g.playerId===x.playerId&&g.gameId!==gameId);
  const resultStatus=officialRow&&Number.isFinite(officialRow[x.market])?"official_stat_present_but_ledger_pending":
   officialRow?"official_row_present_stat_missing":
   sameDateOther.length?"player_id_in_different_official_game_on_date":"player_id_absent_from_final_boxscore";
  return {playerName:histPlayer?.name??null,playerId:x.playerId,team:x.team,opponent:x.opponent,market:x.market,
    line:x.line,side:x.selectedSide,tier:x.tier,
    selectedProbabilityUncalibrated:x.estimatedProbability,
    originalCommitProven:Date.parse(x.firstGitCommittedAt)<Date.parse(x.gameStartAt),
    resultStatus,recordedHistoryTeam:histPlayer?.team??null,
    previousHistoryGameDate:histPlayer?.games?.filter(g=>g.gameDate<day).at(-1)?.gameDate??null,
    officialGameRowFound:!!officialRow,officialStat:officialRow?.[x.market]??null,
    historyGameFound:!!historyGame,officialOtherGameId:sameDateOther.length===1?sameDateOther[0].gameId:null,
    verifiedPlatformSettlement:false,
    proposedHandling:officialRow?"manual_grading_integrity_review":"no_statistical_grade_absent_official_appearance_verify_DNP_or_roster"};
 });
 const statuses={};for(const f of findings)statuses[f.resultStatus]=(statuses[f.resultStatus]||0)+1;
 return {kind:"private_nhl_nov16_unresolved_selection_identity_audit_v1",date:day,gameId,
  finalGames:official.scheduledGames,officialGamePlayerRows:gameRows.length,
  originallyFrozenSelections:all.length,pendingSelections:findings.length,
  originallyFrozenStatusOnly:true,identityNamesFromOfficialPreviouslyArchivedHistory:true,
  statuses,findings,officialNHLBoxscoreNotPlatformDNPSettlement:true,
  noSyntheticMissingPlayerZeros:true,gradeChanged:false};
}
if(require.main===module){
 const a=audit();
 const dir=path.join(root,"outputs/health");
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,"nhl-nov16-pending-identity-audit.json"),JSON.stringify(a,null,2)+"\n");
 if(a.pendingSelections!==4)throw Error("Expected four pending frozen selection records before reconciliation");
 console.log(JSON.stringify({kind:a.kind,pendingSelections:a.pendingSelections,statuses:a.statuses,
    originalFrozenStatusOnly:a.originallyFrozenStatusOnly,noSyntheticMissingPlayerZeros:true}));
}
module.exports={audit};
