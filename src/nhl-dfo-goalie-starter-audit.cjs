"use strict";
/**
 * DFO pregame report reconciliation with NHL official FINAL goalie starter flag.
 * No inference from appearance or saves count. No retrospective synthetic report.
 */
const {canonicalTeam}=require("./nhl-pregame-intel.cjs");
const time=x=>Number.isFinite(Date.parse(x))?Date.parse(x):null;
function verifyReportedGoalies(snapshots,usage){
 if(!Array.isArray(snapshots)||!usage?.players)throw Error("Need original DFO snapshot list and official final usage");
 const records=new Map(),excluded={};
 const skip=key=>{excluded[key]=(excluded[key]||0)+1;};
 for(const source of snapshots){
  const report=source?.snapshot,firstCommittedAt=time(source?.firstCommittedAt);
  const capture=time(report?.generatedAt);
  if(report?.kind!=="approved_nhl_source_research_snapshots"||!capture||
    !firstCommittedAt||firstCommittedAt<capture||source?.historyCount!==1) {skip("missing_first_git_commit_evidence");continue;}
  for(const g of report.dailyFaceoff?.games||[]){
   const start=time(g.eventStartsAt);
   if(!Number.isInteger(g.gameId)||!start||capture>=start||firstCommittedAt>=start){
    skip("not_proven_pregame");continue;
   }
   for(const p of g.goalies||[]){
    if(!Number.isInteger(p.playerId)||!["reported_confirmed","expected","unconfirmed"].includes(p.status)){
     skip("invalid_report_identity");continue;
    }
    if(p.status==="reported_confirmed"&&(!time(p.reportAt)||time(p.reportAt)>capture||
      time(p.reportAt)>=start)){skip("report_timestamp_not_pregame");continue;}
    const team=canonicalTeam(p.team);
    if(![canonicalTeam(g.home),canonicalTeam(g.away)].includes(team)){
     skip("team_mismatch");continue;
    }
    const id=[g.gameId,p.playerId,team].join("|");
    const row={gameId:g.gameId,playerId:p.playerId,team,reportedStatus:p.status,
     reportAt:p.reportAt||null,firstObservedAt:report.generatedAt,
     firstGitCommitAt:source.firstCommittedAt,
     officialClubConfirmedAtPregame:false};
    const previous=records.get(id);
    // Only the latest already-committed pregame observation may represent the
    // final reported DFO status. No poststart edits.
    if(!previous||capture>time(previous.firstObservedAt))records.set(id,row);
   }
  }
 }
 const outcomes=[],pending=[],officialMissingStarterFlag=[];
 for(const row of records.values()){
  const player=(usage.players[String(row.playerId)]||[]).filter(x=>x.gameId===row.gameId&&
    canonicalTeam(x.team)===row.team&&x.type==="goalie");
  if(!player.length){pending.push(row);continue;}
  if(player.length!==1){skip("ambiguous_official_goalie");continue;}
  if(typeof player[0].started!=="boolean"){
   officialMissingStarterFlag.push(row);continue;
  }
  outcomes.push({...row,officialStarter:player[0].started,
   dfoReportedConfirmed:row.reportedStatus==="reported_confirmed",
   reportMatchedActualStarter:row.reportedStatus==="reported_confirmed"?
    player[0].started:null,officialResultSource:"NHL final boxscore",
   independentOriginalPlatformSettlementVerified:false});
 }
 const confirmed=outcomes.filter(x=>x.dfoReportedConfirmed);
 return {schemaVersion:1,kind:"nhl_dfo_goalie_report_official_start_audit",
  reportedUniqueGoalies:records.size,gradedStarts:outcomes.length,
  dfoConfirmedReportsVerifiedAfterFinal:confirmed.length,
  reportedConfirmedActualStarts:confirmed.filter(x=>x.officialStarter).length,
  reportedConfirmedNotActualStarts:confirmed.filter(x=>!x.officialStarter).length,
  officialStarterFlagMissing:officialMissingStarterFlag.length,
  pendingOfficialFinalAppearance:pending.length,excluded,
  outcomes,sourceCommitMetadataOnly:true,
  independentGitHubServerReceiptVerified:false,
  officialPregameTeamConfirmationVerified:false,
  goalieStartProbabilityCalibrated:false,bettingEligible:false,
  note:"Tests accuracy of secondary DFO pregame reports only when archived before puck drop and official FINAL explicitly supplies starter boolean. No appearance-based starter inference. Missing player/starter flag does not count as failure; no commercial source license asserted."};
}
module.exports={verifyReportedGoalies};
