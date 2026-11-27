'use strict';
// Public aggregate only. Different kinds of evidence must never be substituted
// for a platform offer or an independently verified result for that offer.
const titles=['cs2','valorant','dota2','lol','cod'];
const sourceEvidence={
 cs2:['licensed_native_player_map_finals','independent_actual_start'],
 valorant:['new_complete_player_map_finals_for_relisted_fixture','original_platform_settlement'],
 dota2:['authorized_native_player_rows_with_exact_map_ordinals','reviewed_player_namespace'],
 lol:['exact_original_offer_scope','independent_player_game_result'],
 cod:['exact_original_offer_scope_and_mode','independent_player_map_result']
};
function report(audit,valorant){
 const bySport={};
 for(const s of titles){
  const observed=audit?.boards?.esportsEvidence?.[s]||{};
  const scope=Number.isSafeInteger(observed.explicitSupportedScopes)?observed.explicitSupportedScopes:0;
  const supported=Number.isSafeInteger(observed.offerObservations)?observed.offerObservations:0;
  const replay=s==='valorant'&&valorant?.kind==='pickfinder_valorant_matched_retrospective_v1'&&
   valorant.prospective===false&&valorant.platformSettlementVerified===false&&valorant.modelApproved===false;
  bySport[s]={archiveOfferObservations:supported,explicitSupportedScopeObservations:scope,
   independentlyMatchedRetrospectiveExamples:replay?valorant.examples:0,
   independentlyMatchedRetrospectiveSeries:replay?valorant.series:0,
   originalPlatformSettlementsVerified:0,prospectiveGradesVerified:0,
   nextEvidence:sourceEvidence[s]};
 }
 return {kind:'pickfinder_esports_original_offer_readiness_v1',bySport,rawRowsPublished:0,paidRequests:0,modelApproved:false};
}
module.exports={report};
