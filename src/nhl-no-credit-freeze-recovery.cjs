"use strict";
/**
 * 06:00 missing pregame pick recovery gate. Runs after the original scheduled
 * capture completed, and NEVER calls an independent paid quote provider.
 */
const {pacificDate}=require("./nhl-daily-prospective-gate.cjs");
function recoveryGate({now,board,alreadyFrozen=0}={}){
 const epoch=Date.parse(now),captured=Date.parse(board?.generatedAt);
 if(!Number.isFinite(epoch))throw Error("Invalid recovery clock");
 const date=pacificDate(now),sameDay=Number.isFinite(captured)&&pacificDate(board.generatedAt)===date;
 const complete=board?.provider==="prizepicksapi.com"&&
  board?.sourceStatus==="fresh"&&board?.completePagination===true&&
  board?.requestedScheduledSlotPacific==="06:00"&&
  Array.isArray(board.rows)&&board.rows.length>0;
 const ageMinutes=Number.isFinite(captured)?Math.round((epoch-captured)/60000):null;
 const fresh=sameDay&&complete&&ageMinutes!==null&&ageMinutes>=0&&ageMinutes<=25;
 const result=alreadyFrozen>0?"verified_original_pregame_selections_already_archived":
  fresh?"fresh_archived_board_eligible_for_no_credit_recovery":
  !sameDay?"no_same_day_06_board_archived":
  !complete?"unverified_or_incomplete_06_board":
  "board_no_longer_fresh_for_pregame_freeze";
 return {datePacific:date,status:result,
  recover:result==="fresh_archived_board_eligible_for_no_credit_recovery",
  existingFrozenSelected:alreadyFrozen,
  sourceAgeMinutes:ageMinutes,providerQuoteRequestsAuthorized:0,
  sourceOriginalAppAvailabilityVerified:false,
  note:"This gate cannot mark a successful model freeze until first Git archival and the original official NHL schedule both verify a pre-puck-drop selected direction."};
}
module.exports={recoveryGate};
