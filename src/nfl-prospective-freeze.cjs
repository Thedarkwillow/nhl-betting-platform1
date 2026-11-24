"use strict";
/**
 * NFL source-line research snapshot: save immutable STANDARD directional
 * hypotheses only from previously recorded numeric projections, before start.
 * No probabilities, payouts, original-app authentication, or wager placement.
 */
const crypto=require("node:crypto");
const {SPECS}=require("../scripts/backtest-nfl-historical-stats.cjs");
const SUPPORTED=new Set(SPECS.filter(s=>s.family!=="kicking").map(s=>s.id));
const parseTime=s=>typeof s==="string"&&s.trim()?Date.parse(s):NaN;
function freeze(preview,{now=new Date().toISOString(),minimumLeadMinutes=15}={}){
 const at=parseTime(now),asOf=parseTime(preview?.sourceBoardAsOfAt);
 if(preview?.kind!=="nfl_partner_past_only_boxscore_projection_preview_v1"||
    !Array.isArray(preview.rows)||!Number.isFinite(at)||!Number.isFinite(asOf)||
    at<asOf||at-asOf>30*60000||!Number.isInteger(minimumLeadMinutes)||
    minimumLeadMinutes<15)
   throw Error("Refuse missing, future, or stale NFL source research preview");
 const unique=new Map(),excluded={};
 const exclude=k=>{excluded[k]=(excluded[k]||0)+1;};
 for(const r of preview.rows){
   if(r.sport!=="NFL"||r.tier!=="Standard"){exclude("not_standard");continue;}
   if(!SUPPORTED.has(r.market)){exclude("no_supported_full_game_boxscore");continue;}
   if(!r.historicalPlayerId||!r.playerSourceId||!r.observedProviderGameId||
      !r.sourceProjectionId||!r.player||!r.team||!r.opponent||
      !Number.isInteger(r.season)||!Number.isInteger(r.week)||
      !Number.isFinite(Number(r.line))||Number(r.line)<0||
      !Number.isFinite(r.projection)||!Number.isFinite(r.baseline)||
      !Number.isInteger(r.priorGames)||r.priorGames<5){
     exclude("identity_or_projection_missing");continue;
   }
   const start=parseTime(r.eventStartsAt);
   if(!Number.isFinite(start)||start-at<minimumLeadMinutes*60000){
     exclude("already_started_or_below_cutoff");continue;
   }
   if(parseTime(r.capturedAt)!==asOf){
     exclude("source_asof_mismatch");continue;
   }
   const side=r.projection>r.line?"Higher":r.projection<r.line?"Lower":null;
   if(side===null){exclude("projection_equals_line");continue;}
   // The partner data may offer only one side of a tier. Never infer
   // that an unobserved Higher/Lower side is an actual available offer.
   if(r.side!==side){exclude("projected_direction_not_offered");continue;}
   const key=[r.observedProviderGameId,r.historicalPlayerId,r.market,r.line].join("|");
   const id=crypto.createHash("sha256").update(key+"|"+asOf).digest("hex").slice(0,24);
   if(unique.has(key)){
     const prev=unique.get(key);
     if(prev.sourceProjectionId!==r.sourceProjectionId||prev.selectedSide!==side)
       exclude("duplicated_player_game_market_line");
     continue;
   }
   unique.set(key,{
     id:"nfl-"+id,sport:"NFL",season:r.season,week:r.week,
     player:r.player,sourcePlayerId:r.playerSourceId,
     historicalPlayerId:r.historicalPlayerId,team:r.team,opponent:r.opponent,
     sourceGameId:r.observedProviderGameId,eventStartsAt:r.eventStartsAt,
     market:r.market,line:r.line,tier:"Standard",offeredSide:r.side,
     selectedSide:side,sourceProjectionId:r.sourceProjectionId,
     historicalProjection:r.projection,last5Baseline:r.baseline,
     priorRecordedGames:r.priorGames,sourceObservedAt:preview.sourceBoardAsOfAt,
     projectionRecordedAt:preview.generatedAt,
     probability:null,selectedSideAvailableFromIndependentSource:true,
     authenticatedPrizePicksAppQuote:false,platformSettlementVerified:false,
     officialKickoffIdentityVerified:false,autoPickEligible:false
   });
 }
 const selections=[...unique.values()].sort((a,b)=>a.eventStartsAt.localeCompare(b.eventStartsAt)||
   a.id.localeCompare(b.id));
 return {
   schemaVersion:1,kind:"nfl_independent_partner_standard_directional_original_research_v1",
   createdAt:now,sourceBoardAsOfAt:preview.sourceBoardAsOfAt,
   sourceResearchCreatedAt:preview.generatedAt,
   preregisteredRule:"strict_past_only_shrunk_last5_projection_gt_or_lt_original_standard_line",
   sourceAuthenticity:"independent_partner_not_prizepicks_original_app",
   status:"pending_independent_first_git_commit_proof",
   selections,exclusions:excluded,sourceMatchedSideRows:preview.rows.length,
   prospectiveOnlyAfterFirstGitCommitBeforeEveryGame:true,
   calibratedProbabilities:false,verifiedHitRate:null,
   authenticatedPlatformAvailability:false,validatedPayoutEV:false,
   wagersPlaced:0
 };
}
function verifyCommitChronology(snapshot,firstGitCommittedAt,{minimumLeadMinutes=15}={}){
 const commit=parseTime(firstGitCommittedAt),captured=parseTime(snapshot?.sourceBoardAsOfAt),
   created=parseTime(snapshot?.createdAt);
 if(!Number.isFinite(commit)||!Number.isFinite(created)||!Number.isFinite(captured)||
    !Array.isArray(snapshot?.selections)||!snapshot.selections.length||
    captured>created||!Number.isInteger(minimumLeadMinutes)||minimumLeadMinutes<15)
   return {verified:false,reason:"missing_source_or_commit_chronology"};
 // Git commit timestamps carry only whole-second precision.
 if(created-commit>=1000)
   return {verified:false,reason:"model_created_after_git_commit"};
 for(const s of snapshot.selections){
   const start=parseTime(s.eventStartsAt);
   if(!Number.isFinite(start)||start-commit<minimumLeadMinutes*60000)
     return {verified:false,reason:"insufficient_before_kickoff"};
 }
 return {verified:true,reason:"git_commit_precedes_all_games",firstGitCommittedAt};
}
module.exports={freeze,verifyCommitChronology};
