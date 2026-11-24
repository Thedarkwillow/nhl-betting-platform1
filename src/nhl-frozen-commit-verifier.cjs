"use strict";
/**
 * Prove a new cohort's actual selected direction was Git-archived pregame.
 * This is not a winning/settlement or original-platform authentication test.
 */
const {POLICY,freezeIndividualPreferences}=require("./nhl-frozen-individual-props.cjs");
function verifyFrozenCommit({research,snapshot,gitCommittedAt,gitHistoryCount,officialGames}={}){
 if(research?.individualPropSelectionPolicy!==POLICY||
  !Array.isArray(research.individualPropSelections)||
  !research.individualPropSelections.length)
  return {verified:false,reason:"missing_explicit_original_selection",eligible:0};
 if(!snapshot||snapshot.generatedAt!==research.generatedAt||
  JSON.stringify(snapshot.individualPropSelections)!==JSON.stringify(research.individualPropSelections))
  return {verified:false,reason:"immutable_snapshot_differs_from_latest",eligible:0};
 if(!Array.isArray(officialGames)||!officialGames.length)
  return {verified:false,reason:"no_official_schedule_available",eligible:0};
 const frame={snapshot,firstCommittedAt:gitCommittedAt,
  gitHistoryCount,path:"original_single_commit_snapshot"};
 const result=freezeIndividualPreferences([frame],officialGames);
 const expected=research.individualPropSelections.length;
 const verified=result.explicit.length===expected&&
  result.audit.acceptedExplicitSnapshotSelections===expected&&
  result.audit.invalidIdentityOrPregameProof===0&&
  result.audit.inconsistentExplicitSelections===0&&
  result.audit.unprovenSnapshots===0;
 return {verified,reason:verified?null:"original_commit_or_game_identity_not_proven",
  eligible:result.explicit.length,originalSelections:expected,
  firstCommittedAt:gitCommittedAt,
  firstCommittedBeforeEveryPuckDrop:verified,
  originalPlatformOfferAuthenticated:false,
  prospectiveOutcomesGraded:0,
  wagerReturnVerified:false,
  audit:result.audit};
}
module.exports={verifyFrozenCommit};
