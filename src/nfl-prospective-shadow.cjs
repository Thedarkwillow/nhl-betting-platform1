"use strict";
/**
 * Prospective NFL challengers to the UNCHANGED original Standard model.
 *
 * Both policies were designed after the November 9 game was graded; that game
 * can NEVER be scored as a precommitted policy trial. A shadow is evidence only
 * when its own first remote Git addition precedes every included kickoff.
 * These alternatives ABSTAIN; they NEVER retroactively flip Higher to Lower.
 */
const {verifyCommitChronology}=require("./nfl-prospective-freeze.cjs");
const KIND="nfl_standard_margin_abstention_first_git_shadow_v1";
const POLICY={
  relativeMargin10:"abs(original_projection - original_standard_line) / max(1, abs(line)) >= 0.10",
  baselineAgreementAndMargin10:"relativeMargin10 AND sign(original_last5_baseline - line) == original_direction"
};
const time=t=>typeof t==="string"&&t.trim()?Date.parse(t):NaN;
function decision(p){
 const diff=p.historicalProjection-p.line,
  relative=Math.abs(diff)/Math.max(1,Math.abs(p.line)),
  last5=p.last5Baseline-p.line,
  agree=p.selectedSide==="Higher"?last5>0:last5<0;
 return {relativeMargin10:relative>=.1?"include":"abstain",
  baselineAgreementAndMargin10:relative>=.1&&agree?"include":"abstain"};
}
function createShadow(snapshot,{sourceFirstGitCommittedAt,now=new Date().toISOString(),
 maximumSourceAgeMinutes=30,minimumLeadMinutes=15}={}){
 const at=time(now),asOf=time(snapshot?.sourceBoardAsOfAt),origin=time(sourceFirstGitCommittedAt);
 if(snapshot?.kind!=="nfl_independent_partner_standard_directional_original_research_v1"||
  !verifyCommitChronology(snapshot,sourceFirstGitCommittedAt).verified||
  !Number.isFinite(at)||!Number.isFinite(asOf)||!Number.isFinite(origin)||
  at<origin||at<asOf||at-asOf>maximumSourceAgeMinutes*60000||
  minimumLeadMinutes<15||maximumSourceAgeMinutes>45||maximumSourceAgeMinutes<1)
  throw Error("Refusing stale, unsigned or retroactively shadowed NFL source");
 const selected=[],skip={};
 for(const p of snapshot.selections){
  const start=time(p.eventStartsAt);
  if(!Number.isFinite(start)||start-at<minimumLeadMinutes*60000){
   skip.game_started_or_too_close=(skip.game_started_or_too_close||0)+1;continue;
  }
  if(p.tier!=="Standard"||p.offeredSide!==p.selectedSide||
    !["Higher","Lower"].includes(p.selectedSide)||p.autoPickEligible!==false||
    p.probability!==null||!Number.isFinite(p.historicalProjection)||
    !Number.isFinite(p.last5Baseline)||!Number.isFinite(p.line)||
    !Number.isInteger(p.priorRecordedGames)||p.priorRecordedGames<5){
   skip.unverified_market_identity_or_frozen_projection=
    (skip.unverified_market_identity_or_frozen_projection||0)+1;continue;
  }
  selected.push({id:p.id,sourceGameId:p.sourceGameId,
   historicalPlayerId:p.historicalPlayerId,team:p.team,opponent:p.opponent,
   eventStartsAt:p.eventStartsAt,market:p.market,tier:p.tier,line:p.line,
   selectedSide:p.selectedSide,offeredSide:p.offeredSide,
   historicalProjection:p.historicalProjection,last5Baseline:p.last5Baseline,
   priorRecordedGames:p.priorRecordedGames,policyDecisions:decision(p),
   sourceSnapshotFirstGitCommitAt:sourceFirstGitCommittedAt,
   probability:null,bettingEligible:false});
 }
 if(!selected.length)throw Error("No pregame eligible frozen NFL Standard rows for a true future shadow");
 return {kind:KIND,schemaVersion:1,createdAt:now,
  sourceBoardAsOfAt:snapshot.sourceBoardAsOfAt,
  sourceSnapshotCreatedAt:snapshot.createdAt,
  sourceSnapshotFirstGitCommittedAt:sourceFirstGitCommittedAt,
  policyDefinedAfterObservedNovember9Results:true,
  predeclaredProspectiveOnlyAfterFirstGitCommit:true,
  originalDirectionsNeverChanged:true,
  policies:POLICY,selected,excluded:skip,
  researchOnly:true,automaticSelectionsAllowed:false,
  calibratedProbabilities:false,firstPartyPlatformQuotesVerified:false,
  settlementTermsVerified:false,expectedValue:null,officialWagersPlaced:0};
}
function verifyShadow(shadow,firstGitCommittedAt,{minimumLeadMinutes=15}={}){
 const at=time(shadow?.createdAt),commit=time(firstGitCommittedAt),
  source=time(shadow?.sourceBoardAsOfAt),orig=time(shadow?.sourceSnapshotFirstGitCommittedAt);
 if(shadow?.kind!==KIND||shadow.schemaVersion!==1||
  !Number.isFinite(at)||!Number.isFinite(commit)||!Number.isFinite(source)||
  !Number.isFinite(orig)||source>at||orig>at||at-commit>=1000||
  !Array.isArray(shadow.selected)||!shadow.selected.length||
  minimumLeadMinutes<15||shadow.originalDirectionsNeverChanged!==true||
  JSON.stringify(shadow.policies)!==JSON.stringify(POLICY))
  return {verified:false,reason:"missing_or_late_predeclared_shadow_provenance"};
 const ids=new Set();
 for(const p of shadow.selected){
  const start=time(p.eventStartsAt);
  if(!p.id||ids.has(p.id)||!Number.isFinite(start)||
    start-commit<minimumLeadMinutes*60000||
    p.sourceSnapshotFirstGitCommitAt!==shadow.sourceSnapshotFirstGitCommittedAt||
    p.selectedSide!==p.offeredSide||
    p.policyDecisions?.relativeMargin10!==decision(p).relativeMargin10||
    p.policyDecisions?.baselineAgreementAndMargin10!==decision(p).baselineAgreementAndMargin10||
    p.probability!==null||p.bettingEligible!==false)
   return {verified:false,reason:"selection_or_kickoff_inconsistent"};
  ids.add(p.id);
 }
 return {verified:true,reason:"original_shadow_policy_precommitted_before_each_kickoff"};
}
module.exports={createShadow,verifyShadow,decision,KIND,POLICY};
