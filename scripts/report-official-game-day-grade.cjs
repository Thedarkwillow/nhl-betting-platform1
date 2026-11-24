"use strict";
// Exact official-date postgame audit from the original private frozen cohorts.
// No backdated selections, real wagers, provider payout or calibration claims.
const fs=require("node:fs"),zlib=require("node:zlib"),path=require("node:path");
const root=path.resolve(__dirname,".."),read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),"utf8"));
function tally(rows){
 const a={registered:rows.length,correct:0,incorrect:0,push:0,pending:0,byTier:{},byMarket:{},bySide:{}};
 const add=(obj,key,status)=>{const t=obj[key]??={registered:0,correct:0,incorrect:0,push:0,pending:0};t.registered++;t[status]++;};
 for(const r of rows){const status=r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus;if(!["correct","incorrect","push","pending"].includes(status))throw Error("Unknown frozen NHL grading status");a[status]++;add(a.byTier,r.tier,status);add(a.byMarket,r.market,status);add(a.bySide,r.selectedSide,status);}
 a.decided=a.correct+a.incorrect;a.hitRate=a.decided?a.correct/a.decided:null;return a;
}
function main(date){
 if(!/^2026-\d\d-\d\d$/.test(date))throw Error("Explicit 2026 Pacific date required");
 const official=read("outputs/player-stats/"+date+".json");
 if(official.requestedDate!==date||official.source!=="NHL public API"||official.sourceSchemaVersion!==5||
  !Number.isInteger(official.scheduledGames)||official.scheduledGames<1||official.completedGames!==official.scheduledGames||official.collectedGames!==official.scheduledGames||
  !Array.isArray(official.players)||!Array.isArray(official.errors)||official.errors.length||new Set(official.players.map(x=>x.gameId)).size!==official.scheduledGames)
  throw Error("Official NHL date is not fully reconciled");
 const ledger=read("outputs/research/registry/nhl-precommitted-ledger-latest.json");
 if(ledger.kind!=="private_immutable_source_linked_nhl_selected_predictions"||ledger.cohort!=="explicit_original_Git_precommitted_standalone_model_directions"||!Array.isArray(ledger.records))throw Error("Original NHL Git-frozen registry missing");
 const ids=[...new Set(official.players.map(x=>x.gameId))].sort((a,b)=>a-b);
 const nhl=ids.map(id=>{
  const rows=ledger.records.filter(x=>x.gameId===id);
  if(rows.some(x=>x.selectionStatus!=="pending_official_player_stats"&&x.officialGameDate!==date))throw Error("NHL settled result date conflicts with final day");
  const teams=[...new Set(official.players.filter(x=>x.gameId===id).map(x=>x.team).filter(Boolean))].sort();
  return {gameId:id,teams,originalFrozen:tally(rows),officialPlayerRows:official.players.filter(x=>x.gameId===id).length};
 });
 const nflReport=read("outputs/nfl/backtests/pregame-forecast-proof-latest.json");
 const sides=nflReport.explicitFrozenDirections;
 if(nflReport.kind!=="nfl_private_pregame_evidence_separated_outcome_audit_v1"||sides?.kind!=="nfl_original_git_precommitted_directional_research_grade_v1"||sides.platformPayoutSettlementsVerified!==false||
 sides.firstDistinctThresholdGrade?.originalFirstGitBeforeKickoffProven!==true)throw Error("NFL original frozen audit not valid");
 const archive=readGzip("outputs/nfl/history/2026/schedule.json.gz");
 const {finalScorePresent}=require("../src/nfl-precommitted-grading.cjs");
 const nfl=archive.rows.filter(x=>x.game_type==="REG"&&x.gameday===date).map(g=>{
  if(!finalScorePresent(g))throw Error("NFL game is not verified final");
  const first=sides.firstDistinctThresholdGrade.earliestPerPlayerGameMarketAndLine.byGame?.[g.game_id]||null;
  const playerMarket=sides.firstDistinctThresholdGrade.earliestPerPlayerGameMarket.byGame?.[g.game_id]||null;
  const decidedRows=(sides.rows||[]).filter(x=>x.officialScheduleGameId===g.game_id&&x.status==="decided");
  return {officialGameId:g.game_id,home:g.home_team,away:g.away_team,homeScore:g.home_score,awayScore:g.away_score,
   frozenDecidedSourceIDs:decidedRows.length,sourceIdDecisionsCorrect:decidedRows.filter(x=>x.selectedSideResult==="correct").length,
   firstDistinctThreshold:first||{registered:0,decided:0,correct:0,incorrect:0,pushes:0,pending:0},
   firstPlayerMarket:playerMarket||{registered:0,decided:0,correct:0,incorrect:0,pushes:0,pending:0},
   officialStatReconciled:true,platformSettlementVerified:false};
 });
 const result={kind:"private_official_nhl_nfl_daily_original_frozen_grade_v1",date,
  nhl:{officialGames:official.scheduledGames,officialPlayerRows:official.players.length,games:nhl,
   combined:tally(ledger.records.filter(r=>ids.includes(r.gameId)))},
  nfl:{officialGames:nfl.length,games:nfl,nflverseSourceOnly:true},
  originalGitFirstFrozenOnly:true,estimatedProbabilitiesValidated:false,actualPlatformSettlementVerified:false,
  realWagersGraded:0,sourceNote:"Game finals do not imply each prop is decided; missing results remain pending."};
 console.log(JSON.stringify(result));
 return result;
}
function readGzip(rel){const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(root,rel))).toString("utf8"));if(j.sport!=="NFL"||j.dataset!=="schedule"||j.recordCount!==j.rows.length||j.retrospectivePlayerStatsNotPregameLines!==true)throw Error("NFL schedule archive provenance incomplete");return j;}
if(require.main===module){const day=process.argv[2];const r=main(day);const out=path.join(root,"outputs/health/official-game-grade-"+day+".json");fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(r,null,2)+"\n");}
module.exports={main,tally,readGzip};
