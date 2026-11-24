"use strict";
/**
 * Revalidate saved research lineups against an independently captured NEW
 * source snapshot. A quote missing from a provider does not prove removal
 * from the PrizePicks app. Never modify original archived selections.
 */
const {review:officialPreviewReview}=require("./nhl-official-preview-abstention.cjs");
const norm=x=>String(x??"").trim().toLowerCase();
const pair=p=>[p?.gameId,p?.playerId,norm(p?.market)].join("|");
const unique=s=>[...new Set(s)];
function revalidateResearchLineups(previous,current,{
 newBoardComplete=false,now=new Date().toISOString(),sourceSame=true,officialPreview=null}={}){
 const at=Date.parse(now),fresh=Date.parse(current?.generatedAt);
 if(!Number.isFinite(at))throw Error("Invalid NHL lineup revalidation clock");
 const sourceEvidence=sourceSame===true&&newBoardComplete===true&&
  Number.isFinite(fresh)&&fresh<=at&&at-fresh<=30*60000;
 const report={schemaVersion:1,kind:"nhl_lineup_reoptimization_and_stale_offer_audit",
  previousAt:previous?.generatedAt||null,newAt:current?.generatedAt||null,
  sourceScopeEquivalent:sourceSame===true,
  newlyCapturedSourceComplete:!!newBoardComplete,
  sourceEvidenceFresh:sourceEvidence,
  previousResearchAvailable:!!previous?.lineups,
  oldLineupCount:0,invalidatedLineups:0,
  compatibleLineups:0,needFreshIndependentCapture:0,
  changedLines:0,changedTiers:0,changedDirections:0,officialPreviewInjuryBlocks:0,
  newlyUnmatchedQuotes:0,startedOrImminentGames:0,
  bySize:{},oldPicksCannotBeSilentlyCarried:true,
  providerNotSeenIsNotAuthenticatedPlatformRemoval:true,
  originalPublishedPredictionHistoryUnmodified:true,
  newLineupModelRunRequiredForChange:true,
  proposedWagerActions:0};
 const newProps=Array.isArray(current?.rankedProps)?current.rankedProps:[];
 const byPlayer=new Map();
 for(const prop of newProps){
  if(!Number.isInteger(prop?.gameId)||!Number.isInteger(prop?.playerId))continue;
  const key=pair(prop),bucket=byPlayer.get(key)||[];
  bucket.push(prop);byPlayer.set(key,bucket);
 }
 for(const size of [2,3,4,5,6]){
  const old=previous?.lineups?.[String(size)];
  if(!old?.picks?.length)continue;
  report.oldLineupCount++;
  const reasons=[];
  for(const p of old.picks){
   if(officialPreview){const status=officialPreviewReview(p,officialPreview,now);if(status.blocksResearch){report.officialPreviewInjuryBlocks++;reasons.push("official_preview_injury_or_scratch_requires_abstention");continue;}}
   const start=Date.parse(p.eventStartsAt);
   if(!Number.isFinite(start)||start<=at+15*60000){
    report.startedOrImminentGames++;reasons.push("started_or_imminent_game");
    continue;
   }
   if(!sourceEvidence){
    reasons.push("fresh_equivalent_provider_board_not_confirmed");
    continue;
   }
   const next=byPlayer.get(pair(p))||[];
   if(!next.length){
    report.newlyUnmatchedQuotes++;reasons.push("not_seen_in_new_independent_snapshot_unverified_removal");
    continue;
   }
   if(!next.some(q=>q.tier===p.tier)){
    report.changedTiers++;reasons.push("tier_not_seen_on_new_independent_snapshot");
    continue;
   }
   const tier=next.filter(q=>q.tier===p.tier);
   if(!tier.some(q=>q.line===p.line)){
    report.changedLines++;reasons.push("line_moved_in_new_independent_snapshot");
    continue;
   }
   if(!tier.some(q=>q.line===p.line&&q.lean===p.lean)){
    report.changedDirections++;reasons.push("previous_model_direction_not_in_new_research");
    continue;
   }
   if(tier.some(q=>q.line===p.line&&q.lean===p.lean&&(
    q.researchEligibility==="watchlist"||
    q.roleEvidence?.eligibleForResearchLineup===false))){
    reasons.push("new_risk_watchlist_restricts_lineup");
    continue;
   }
  }
  const changes=unique(reasons);
  const state=changes.length?sourceEvidence?"invalidate_and_reoptimize":"needs_new_capture":
   "compatible_with_current_research_not_original_platform_verified";
  report.bySize[size]={state,reasons:changes,pickCount:old.picks.length,
   notAnAuthenticatedPrizePicksLineup:true};
  if(changes.length){
   report.invalidatedLineups++;
   if(!sourceEvidence)report.needFreshIndependentCapture++;
  }else report.compatibleLineups++;
 }
 return report;
}
module.exports={revalidateResearchLineups};
