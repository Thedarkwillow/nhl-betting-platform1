"use strict";
/**
 * NFL-06 / P06-02: structural, independent-game candidate combinations from
 * ORIGINAL immutable, explicitly frozen Standard directions. This is NOT a
 * probabilistic lineup optimizer, a playable PrizePicks slip, or EV.
 */
const {verifyCommitChronology}=require("./nfl-prospective-freeze.cjs");
const safeTime=t=>typeof t==="string"?Date.parse(t):NaN;
function buildStructuralLineups(snapshot,{firstCommittedAt,now=new Date().toISOString(),
 maxSize=6}={}){
 const verification=verifyCommitChronology(snapshot,firstCommittedAt);
 const at=safeTime(now);
 if(!Number.isFinite(at)||!Number.isInteger(maxSize)||maxSize<2||maxSize>6)
  throw Error("Invalid time or NFL research lineup-size cap");
 const result={kind:"nfl_original_precommitted_distinct_game_research_lineups_v1",
  generatedAt:now,originalCommitChronologyVerified:verification.verified,
  eligibleDistinctGameCount:0,eligibleResearchSelections:0,bySize:{},
  constructionIsOnlyStructural:true,calibratedJointHitProbability:null,
  correlationModelValidated:false,originalPlatformEligibilityVerified:false,
  exactPlatformPayoutVerified:false,expectedValue:null,autoWagersPlaced:0};
 const eligible=[];
 if(verification.verified&&
    snapshot?.kind==="nfl_independent_partner_standard_directional_original_research_v1"){
  const seen=new Set();
  for(const p of snapshot.selections){
   const start=safeTime(p.eventStartsAt);
   const key=[p.sourceGameId,p.historicalPlayerId,p.market,p.line].join("|");
   if(p.tier!=="Standard"||!["Higher","Lower"].includes(p.selectedSide)||
      p.offeredSide!==p.selectedSide||p.autoPickEligible!==false||
      p.probability!==null||p.authenticatedPrizePicksAppQuote!==false||
      !p.historicalPlayerId||!p.sourceGameId||
      !Number.isFinite(start)||start-at<15*60000||seen.has(key))continue;
   seen.add(key);eligible.push(p);
  }
 }
 eligible.sort((a,b)=>safeTime(a.eventStartsAt)-safeTime(b.eventStartsAt)||
   String(a.id).localeCompare(String(b.id)));
 const representative=[],games=new Set(),players=new Set();
 for(const p of eligible){
  if(games.has(p.sourceGameId)||players.has(p.historicalPlayerId))continue;
  games.add(p.sourceGameId);players.add(p.historicalPlayerId);
  representative.push(p);
 }
 result.eligibleResearchSelections=eligible.length;
 result.eligibleDistinctGameCount=games.size;
 for(let size=2;size<=maxSize;size++){
  const can=representative.length>=size;
  result.bySize[String(size)]={
   status:can?"structural_research_candidates_only":"insufficient_independent_games",
   candidates:can?1:0,distinctGamesRequired:size,
   distinctGamesFound:games.size,
   selectionIds:can?representative.slice(0,size).map(x=>x.id):[],
   playerNamesOrLinesPublic:false,
   independentGameStructuralOnly:true,
   modelJointProbability:null,expectedValue:null,
   platformRestrictionsVerified:false,
   warning:"Uncalibrated directions; missing authenticated platform lines, correlation-adjusted probabilities and lineup payout terms."
  };
 }
 return result;
}
module.exports={buildStructuralLineups};
