"use strict";
/**
 * Future-facing, immutable research shadow: same original offered line and
 * same champion model mean, alternate probability distribution only.
 * Capturing a file before event start is NOT sufficient to verify pregame
 * provenance until the actual Git commit time is independently checked.
 */
const {challengerProbabilities}=require("./nhl-count-distribution-shadow.cjs");
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const MARKETS=new Set(["shotsOnGoal","goals","assists","points","blockedShots","saves"]);
function prepareDistributionSnapshot(research,history,marketShadow=null){
 if(!Number.isFinite(Date.parse(research?.generatedAt))||
  !Array.isArray(research?.rankedProps)||!history?.players)
  throw Error("Real captured research and canonical NHL player history required");
 const at=Date.parse(research.generatedAt),out=[],exclusions={};
 const skip=reason=>{exclusions[reason]=(exclusions[reason]||0)+1;};
 const seen=new Set();
 for(const prop of research.rankedProps){
  const start=Date.parse(prop.eventStartsAt),capture=Date.parse(prop.capturedAt),
   observed=Date.parse(prop.observedAt),gameId=Number(prop.gameId);
  if(!Number.isInteger(gameId)||gameId<=0||!Number.isInteger(Number(prop.playerId))||Number(prop.playerId)<=0||
   !MARKETS.has(prop.market)||!Number.isFinite(prop.line)||prop.line<0||
   !Number.isFinite(prop.projection)||prop.projection<0||
   !["Higher","Lower"].includes(prop.lean)){
   skip("invalid_official_identity_market_or_prop");continue;
  }
  if(!Number.isFinite(start)||start<=at||
   !Number.isFinite(capture)||capture>at||capture>=start||
   !Number.isFinite(observed)||observed>capture||at-capture>30*60000){
   skip("no_time_matched_pregame_quote");continue;
  }
  const key=[gameId,prop.playerId,prop.market,prop.line,String(prop.tier||"").toLowerCase(),prop.lean].join("|");
  if(seen.has(key)){skip("duplicate_exact_offer");continue;}
  seen.add(key);
  const player=history.players[String(prop.playerId)];
  if(!player?.games){skip("missing_official_player_history");continue;}
  const cutoff=new Date(start).toISOString().slice(0,10);
  const stats=player.games.filter(g=>g.gameDate<cutoff&&
   Number.isInteger(g[prop.market])&&g[prop.market]>=0)
   .sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId)
   .map(g=>g[prop.market]);
  if(stats.length<8){skip("insufficient_earlier_count_history");continue;}
  const probabilities=challengerProbabilities(prop.projection,prop.line,stats);
  if(!probabilities){skip("distribution_could_not_be_evaluated");continue;}
  const side=prop.lean==="Higher"?"higher":"lower";
  // If there is a genuinely pregame, training-only market model, freeze
  // BOTH candidate probabilities against this SAME immutable source line.
  // No v3 result is imputed for untrained or stale player/market evidence.
  const v3=marketShadow?.players?.[String(prop.playerId)]?.projections?.[prop.market];
  const built=Date.parse(marketShadow?.builtAt);
  const trained=marketShadow?.model==="nhl-market-trained-v3-shadow"&&
    marketShadow?.status==="research_shadow_not_deployed"&&
    marketShadow?.trainingSeason==="2024-25"&&
    marketShadow?.holdoutNotUsedForMethodSelection===true&&
    /^nhl-2024-train-market-v3-[a-f0-9]{24}$/.test(marketShadow?.trainingPolicyId||"")&&
    Number.isFinite(built)&&built<=at&&at-built<=48*3600000&&built<start&&
    v3?.ready===true&&Number.isFinite(v3.estimate)&&v3.estimate>=0&&
    ["prior-mean","stable-blend","stable-shrink-v2","weighted-form-v1"].includes(v3.method)&&
    v3.lastHistoricalGameDate<cutoff&&
    v3.lastHistoricalGameDate<new Date(built).toISOString().slice(0,10);
  const v3Vector=trained?estimateCountProbabilities(v3.estimate,prop.line):null;
  const marketTrainedV3=v3Vector?{
    model:"nhl-market-trained-v3-shadow",
    policyId:marketShadow.trainingPolicyId,method:v3.method,
    projectionMean:v3.estimate,distribution:"poisson-v0",
    higher:v3Vector.higher,lower:v3Vector.lower,
    offeredSideProbability:v3Vector[side],
    probabilityCalibrated:false,originalPlatformPayoutVerified:false,
    trainingUsesHoldout:false,marketSelectedFrom:"2024-25"
  }:null;
  out.push({playerId:Number(prop.playerId),gameId,gameStartAt:prop.gameStartAt||prop.eventStartsAt,
   eventStartsAt:prop.eventStartsAt,sourceObservedAt:prop.observedAt,
   sourceCapturedAt:prop.capturedAt,sourceProjectionId:prop.projectionId||null,
   team:prop.team,market:prop.market,line:prop.line,tier:prop.tier,
   selectedSide:prop.lean,asOf:research.generatedAt,
   originalModel:research.model||"weighted-form-v1",
   originalProjectionMean:prop.projection,originalPoissonProbability:probabilities.champion[side],
   shadowOverdispersedProbability:probabilities.challenger[side],
   originalHigher:probabilities.champion.higher,
   shadowHigher:probabilities.challenger.higher,
   championDistribution:"poisson-v0",
   challengerDistribution:probabilities.challenger.distribution,
   challengerUsedNegativeBinomial:probabilities.challengerUsesNB,
   dispersion:probabilities.dispersion,
   marketTrainedV3,
   platformOfferIndependentlyVerified:false,originalTierPayoutVerified:false,
   prospectiveEligibleUntilGitCommitProof:false,
   verifiedOfficialNhlResult:null,prospectiveHitRate:null,
   isRealWager:false});
 }
 return {schemaVersion:1,kind:"nhl_live_distribution_shadow_unconfirmed_git_archive",
  generatedAt:research.generatedAt,modelVersion:"negative-binomial-shrink-v1",
  championsUnchanged:true,source:research.source,
  originalProviderOffersIndependentlyVerified:false,
  verifiedCommitBeforeGameStart:false,
  picksBeforeGameStartDemonstrated:false,
  period:"full-game",lineupsAffected:false,
  marketTrainedV3MatchedRows:out.filter(r=>r.marketTrainedV3!==null).length,
  marketTrainedV3ProductionDeployed:false,
  rows:out,exclusions,
  warning:"Same live source-observed lines with alternative probability distribution. Git commit time vs puck drop must be verified before any prospective accuracy claim. No reliable platform payouts, independent original offer authentication, or calibrated probabilities; no wagers."};
}
module.exports={prepareDistributionSnapshot};
