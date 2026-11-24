"use strict";
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {assessNhlResearchProbability,auditNhlResearchProbabilities}=require("./nhl-probability-safety.cjs");
const {optimize}=require("./nhl-lineup-optimizer.cjs");
const {adjustProjection}=require("./nhl-opponent-context.cjs");
const {assessPropRisk}=require("./nhl-usage-goalie.cjs");
const {prepareExperimentalMarketOffer}=require("./nhl-experimental-offer-bridge.cjs");
const {auditCompositeAndPeriodBoard}=require("./nhl-combo-period-research.cjs");
const {VERSION:MARKET_REGISTRY_VERSION,normalize:norm,resolveMarket,validateOffer}=
 require("./nhl-market-registry.cjs");
function buildFreeNhlResearch(board,projections,now=new Date().toISOString(),context=null,usageIndex=null,experimental=null){
 const time=Date.parse(now),sourceAt=Date.parse(board?.generatedAt),modelAt=Date.parse(projections?.builtAt);
 if(!Number.isFinite(time)||!Number.isFinite(sourceAt)||!Number.isFinite(modelAt)||
    !Array.isArray(board?.rows)||!projections?.players)throw Error("Missing valid source board or projections");
 const freshBoard=time>=sourceAt&&time-sourceAt<=30*60000;
 const freshProjections=time>=modelAt&&time-modelAt<=48*3600000;
 // Fixed-time /board reconstruction confirms OFFER MEMBERSHIP at boardAsOfAt.
 // Per-row observedAt is its last reported line-change time and may be old.
 // Keep that original evidence, but use verified as-of membership for freshness
 // only on fully paginated third-party reconstructed boards.
 const asOfAt=Date.parse(board?.boardAsOfAt);
 const verifiedMembershipProvider=
  (board?.provider==="prizepicksapi.com"&&board?.snapshotMode==="immutable_as_of")||
  (board?.provider==="partner-api.prizepicks.com"&&board?.snapshotMode==="direct_live_board");
 const fixedAsOf=verifiedMembershipProvider&&board?.completePagination===true&&
  board?.sourceStatus==="fresh"&&Number.isFinite(asOfAt)&&
  asOfAt<=sourceAt&&sourceAt-asOfAt<=5*60000&&
  time>=asOfAt&&time-asOfAt<=30*60000;
 const byName=new Map(),byInitial=new Map();
 function add(map,key,p){const a=map.get(key)||[];a.push(p);map.set(key,a);}
 for(const p of Object.values(projections.players)){
  const n=norm(p.name),t=norm(p.team),words=n.split(" ");
  add(byName,t+"|"+n,p);
  if(words.length>=2)add(byInitial,t+"|"+words[0][0]+"|"+words.slice(1).join(" "),p);
 }
 const excluded={},props=[],seen=new Set();
 function skip(why){excluded[why]=(excluded[why]||0)+1;}
 for(const row of board.rows){
  if(!freshBoard){skip("stale_board");continue;}
  if(!freshProjections){skip("stale_projections");continue;}
  const captured=Date.parse(row.capturedAt),observed=Date.parse(row.observedAt),start=Date.parse(row.eventStartsAt);
  const membershipAt=fixedAsOf?asOfAt:observed;
  if(!Number.isFinite(captured)||!Number.isFinite(observed)||!Number.isFinite(start)||
     observed>captured||captured>time||time-captured>30*60000||
     observed>membershipAt+60000||time-membershipAt>30*60000){
   skip("stale_or_invalid_capture");continue;
  }
  if(start<=time||captured>=start||row.isLive){skip("game_already_started");continue;}
  if(row.period&&norm(row.period)!=="full game"&&norm(row.period)!=="game"){skip("non_full_game");continue;}
  const tier=norm(row.tier);
  if(!["standard","goblin","demon"].includes(tier)||!["Higher","Lower"].includes(row.side)||tier!=="standard"&&row.side==="Lower"){skip("unavailable_side");continue;}
  const field=resolveMarket(row.market);
  if(!field){skip("unsupported_market");continue;}
  const team=norm(row.team),name=norm(row.player),names=name.split(" "),opponent=norm(row.matchup);
  if(!team||!opponent||team===opponent||!/^([a-z0-9]{2,4})$/.test(opponent)){skip("unverified_matchup");continue;}
  const exact=byName.get(team+"|"+name)||[];
  const matched=exact.length?exact:(names.length>=2?byInitial.get(team+"|"+names[0][0]+"|"+names.slice(1).join(" "))||[]:[]);
  if(matched.length!==1){skip(matched.length?"ambiguous_player":"unmatched_player");continue;}
  const p=matched[0];
  const extra=experimental?prepareExperimentalMarketOffer({
   market:field,player:p,row,
   source:board.provider==="The Odds API"?"UnverifiedBackup":"PrizePicks",
   extension:experimental}):null;
  const offerContract=validateOffer({
   market:row.market,period:row.period,tier:row.tier,side:row.side,playerType:p.type,
   researchMode:extra?.eligible===true,
   modelReady:extra?.modelReady===true,
   exactHistoricalStats:extra?.exactHistoricalStats===true,
   providerRuleVerified:extra?.providerRuleVerified===true
  });
  if(!offerContract.eligible){
   skip(extra&&!extra.eligible&&offerContract.reason==="research_shadow_not_validated_for_live_picks"?
    extra.reason:offerContract.reason);continue;
  }
  const isExperimental=offerContract.researchOnly===true;
  const proj=isExperimental?extra.model:p.projections?.[field];
  const estimate=isExperimental?extra.estimate:proj?.estimate;
  const minLine=field==="plusMinus"||field==="goalieFantasyScore"?-Infinity:0;
  if(!(isExperimental?proj?.readyForResearch:proj?.ready)||
    !Number.isFinite(estimate)||!Number.isFinite(row.line)||row.line<minLine){
    skip("insufficient_history_or_invalid_line");continue;
  }
  // A refreshed model must not be built from any player game occurring on or after this event.
  if(p.latestGameDate&&p.latestGameDate>=row.eventStartsAt.slice(0,10)){skip("lookahead_risk");continue;}
  const allowAdjustment=!isExperimental&&context?.approvedMarkets?.includes(field)===true;
  const adjustment=isExperimental?{
   estimate,applied:false,reason:"specialized_experimental_market_distribution",
   shadowResearchOnly:true
  }:adjustProjection(estimate,field,row.matchup,allowAdjustment?context:null);
  const probabilities=isExperimental?extra.probabilities:
   estimateCountProbabilities(adjustment.estimate,row.line);
  const probability=probabilities?.[row.side==="Higher"?"higher":"lower"];
  if(!Number.isFinite(probability)||probability<=0||probability>=1){skip("invalid_probability");continue;}
  const risk=assessPropRisk(p,usageIndex,row.eventStartsAt,field);
  const k=[p.playerId,field,row.line,tier,row.side,row.eventStartsAt].join("|");
  if(seen.has(k)){skip("duplicate");continue;}
  seen.add(k);
  const game=[norm(row.team).toUpperCase(),norm(row.matchup).toUpperCase()].sort().join(" vs ")+" | "+row.eventStartsAt;
  const probabilitySafety=assessNhlResearchProbability({probability,observations:proj.observations,market:field,roleEvidence:risk,researchEligibility:risk.classification,experimentalMarketResearchOnly:isExperimental});
  props.push({player:p.name,team:p.team,playerId:p.playerId,market:field,line:row.line,
   lean:row.side,tier:row.tier,projection:adjustment.estimate,baseProjection:proj.estimate,
   opponentAdjustment:{...adjustment,backtestApproved:allowAdjustment},edge:Number((adjustment.estimate-row.line).toFixed(3)),
   probability,probabilities,observations:proj.observations,probabilitySafety,
   last5:proj.last5??proj.last5Mean??null,
   last10:proj.last10??proj.last10Mean??null,
   experimentalMarketResearchOnly:isExperimental,
   experimentalMarketEvidence:isExperimental?extra.evidence:null,
   marketStatUnit:isExperimental&&field==="timeOnIceSeconds"?row.unit:null,
   marketOvertimeRule:isExperimental&&field==="timeOnIceSeconds"?row.overtimeTreatment:null,
   marketRuleVersion:isExperimental&&field==="goalieFantasyScore"?
    "prizepicks-nhl-goalie-fantasy-user-provided-20261106":null,
   sourceMarketRuleVerifiedForPlatform:false,
   independentProbabilityCalibrationVerified:false,
   matchup:game,opponent:row.matchup,eventStartsAt:row.eventStartsAt,
   capturedAt:row.capturedAt,observedAt:row.observedAt,
   verifiedThirdPartyBoardMembershipAt:fixedAsOf?board.boardAsOfAt:null,
   sourcePlayerName:typeof row.player==="string"?row.player:null,
   projectionId:row.projectionId,providerPlayerId:row.providerPlayerId||null,
   providerGameId:row.providerGameId||null,
   model:isExperimental?proj.model:projections.model,
   source:"PrizePicks",
   provider:board.provider==="The Odds API"?"The Odds API":
    board.provider==="partner-api.prizepicks.com"?"partner-api.prizepicks.com":"prizepicksapi.com",
   originalFantasyPlatformAuthenticated:false,
   originalPlatformTierVerified:false,
   roleEvidence:risk,starterConfirmed:false,injuryVerified:false,
   researchEligibility:risk.classification,
   probabilityCalibrated:false,verified:false,expectedValue:null,
   payoutMultiplier:null,tierPayoutVerified:false});
 }
 props.sort((a,b)=>Number(b.probabilitySafety.researchLineupEligible)-Number(a.probabilitySafety.researchLineupEligible)||b.probability-a.probability||b.observations-a.observations);
 const lineups=optimize(props,{at:now});
 return {schemaVersion:1,generatedAt:now,boardGeneratedAt:board.generatedAt,
  boardAsOfAt:fixedAsOf?board.boardAsOfAt:null,
  sourceBoardMode:fixedAsOf?"independent_fixed_time_reconstruction":"other_independent_source",
  projectionBuiltAt:projections.builtAt,model:projections.model,
  source:board.provider==="The Odds API"?"The Odds API":
   board.provider==="partner-api.prizepicks.com"?"partner-api.prizepicks.com":"prizepicksapi.com",
  sourceScope:board.sourceScope==="verified_selected_events"?"verified_selected_events":"full_provider_board",
  method:"Weighted-form+Poisson for six legacy markets; specialized research-only official-stat shadows (Poisson counts, empirical signed fantasy/plus-minus, Gaussian ice time) for new markets; none calibrated",
  roleEvidenceReport:{available:!!usageIndex,source:usageIndex?.source||null,
   goalieStartsConfirmed:false,injuriesVerified:false,
   watchlistProps:props.filter(p=>p.researchEligibility==="watchlist").length,
   goalieSaveProps:props.filter(p=>p.market==="saves").length},
  modelContext:context?{method:context.method,teamCount:context.teams,injuriesIncluded:false,startingGoaliesIncluded:false,iceTimeIncluded:false,approvedMarkets:context.approvedMarkets}:null,
  warning:"Research only. Experimental new-market probabilities are not calibrated or proven better than baselines. Original PrizePicks app and payout rules not authenticated. TOI requires exact platform overtime semantics, and goalie start status remains unconfirmed. Missing combo/period history does not become a synthetic pick. No validated EV or joint lineup probability; no automatic wager submission.",
  boardFresh:freshBoard,projectionsFresh:freshProjections,
  boardCoverageComplete:board.completePagination===true&&board.sourceScope!=="verified_selected_events",
  captureScopeComplete:board.completePagination===true,
  totalRows:board.rows.length,matchedRows:props.length,excluded,rankedProps:props,lineups,
  probabilitySafetyAudit:auditNhlResearchProbabilities(props),
  marketRegistryVersion:MARKET_REGISTRY_VERSION,
  extendedMarketSourceReadiness:auditCompositeAndPeriodBoard(board.rows,
   experimental?.officialHistory||null,experimental?.periodHistory||null),
  gameIdentityResolved:0,gradingEligibility:"No official NHL game IDs attached. Not eligible for verified grading until official game identity and pregame archival proof."};
}
module.exports={buildFreeNhlResearch};
