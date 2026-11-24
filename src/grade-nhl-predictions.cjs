"use strict";
const {evidenceForOfficialGrade,summarizeOutcomeEvidence}=
 require("./nhl-outcome-evidence.cjs");
// Git commit times have whole-second precision; a saved JSON millisecond
// timestamp in that same second is still evidenced by the committed file.
function validArchiveChronology(capture,recorded,archived,start){
 if(![capture,recorded,archived,start].every(Number.isFinite))return false;
 if(capture>recorded||recorded>=start||archived>=start)return false;
 return recorded<=archived||Math.floor(recorded/1000)===Math.floor(archived/1000);
}
function gradePredictions(predictions,history){
 const outcomes=new Map();
 for(const p of Object.values(history?.players||{}))for(const g of p.games||[])outcomes.set(String(g.gameId)+"|"+String(g.playerId),g);
 const graded=[],pending=[],rejected=[];
 for(const p of predictions){
  if(!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||!Number.isFinite(p.line)||!p.market||!p.capturedAt||!p.gameStartAt){rejected.push({reason:"missing_verified_game_identity_or_timestamp",playerId:p.playerId??null});continue;}
  if(!p.predictionRecordedAt||!p.snapshotArchivedAt){rejected.push({reason:"missing_prediction_archive_proof",playerId:p.playerId});continue;}
  const capture=Date.parse(p.capturedAt),recorded=Date.parse(p.predictionRecordedAt),archived=Date.parse(p.snapshotArchivedAt),start=Date.parse(p.gameStartAt);
  if(!validArchiveChronology(capture,recorded,archived,start)){
   rejected.push({reason:"not_proven_pregame",playerId:p.playerId});continue;
  }
  const game=outcomes.get(p.gameId+"|"+p.playerId);
  if(!game){pending.push({playerId:p.playerId,gameId:p.gameId});continue;}
  const actual=game[p.market];
  if(!Number.isFinite(actual)){rejected.push({reason:"missing_stat",playerId:p.playerId,gameId:p.gameId});continue;}
  const result=actual>p.line?"Higher":actual<p.line?"Lower":"Push";
  const base={playerId:p.playerId,gameId:p.gameId,market:p.market,
   line:p.line,gameDate:game.gameDate,actual,result,lean:p.lean,
   correct:result==="Push"?null:p.lean===result,
   probability:p.probability??null,tier:p.tier??null,
   capturedAt:p.capturedAt,predictionRecordedAt:p.predictionRecordedAt,
   snapshotArchivedAt:p.snapshotArchivedAt,gameStartAt:p.gameStartAt};
  graded.push({...base,...evidenceForOfficialGrade(base)});
 }
 const decisions=graded.filter(p=>p.correct!==null);
 return {graded,pending,rejected,
  outcomeEvidence:summarizeOutcomeEvidence({graded,pending}),
  summary:{graded:graded.length,decisions:decisions.length,
   correct:decisions.filter(p=>p.correct).length,
   verifiedHitRate:decisions.length?decisions.filter(p=>p.correct).length/decisions.length:null,
   pushes:graded.length-decisions.length},
  warning:"Require actual Git commit archival timestamp and prediction creation timestamp before game start; no synthetic thresholds. Official NHL direction is not original PrizePicks or Underdog settlement."};
}
module.exports={gradePredictions,validArchiveChronology};
