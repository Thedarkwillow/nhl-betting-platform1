"use strict";
/**
 * Four new full-game NHL market research projections. Never feed these into
 * the live champion, published picks, lineups, EV, or settled grades.
 * Exact official player-game samples only; absent stats are not zero.
 */
const {NHL_MARKET_STATS}=require("./nhl-four-priority-markets.cjs");
const MIN_SAMPLES=8;
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const round=n=>Number(n.toFixed(4));
function projectFourPriorityMarkets(player,asOf){
 const instant=Date.parse(asOf);
 if(!Number.isFinite(instant)||!player||!Array.isArray(player.games)||
   !["skater","goalie"].includes(player.type))
  throw Error("Invalid NHL priority projection time/player");
 const cutoff=new Date(instant).toISOString().slice(0,10);
 const games=player.games.filter(g=>/^\d{4}-\d{2}-\d{2}$/.test(g?.gameDate||"")&&
   g.gameDate<cutoff).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||
    Number(a.gameId||0)-Number(b.gameId||0));
 const projections={};
 for(const [market,meta] of Object.entries(NHL_MARKET_STATS)){
  if(meta.playerType!=="either"&&meta.playerType!==player.type)continue;
  // Fantasy score is signed: goals against can produce a negative value.
  // Rejecting negative scores would systematically inflate goalie forecasts.
  // Only counts and TOI must be nonnegative.
  const samples=games.map(g=>g[market]).filter(v=>
    Number.isFinite(v)&&
    (meta.unit==="count"?(Number.isInteger(v)&&v>=0):
     meta.unit==="seconds"?v>=0:true));
  const n=samples.length,ready=n>=MIN_SAMPLES,
   last5=samples.slice(-5),last10=samples.slice(-10);
  const baseline=n?mean(samples):null,
   recent5=n?mean(last5):null,
   recent10=n?mean(last10):null,
   // Deterministic fixed research rules only; need prospective evaluation.
   raw=ready?(market==="timeOnIceSeconds"?
    0.45*recent5+0.55*recent10:
    0.25*recent5+0.25*recent10+0.5*baseline):null;
  const unit=meta.unit==="seconds"?"minutes":meta.unit;
  const factor=market==="timeOnIceSeconds"?1/60:1;
  const variance=n>=2?mean(samples.map(v=>(v-baseline)**2)):null;
  projections[market]={
   projection:ready?round(raw*factor):null,unit,
   readyForResearch:ready,readyForLivePicks:false,
   observations:n,minObservations:MIN_SAMPLES,
   seasonMean:baseline===null?null:round(baseline*factor),
   last5Mean:recent5===null?null:round(recent5*factor),
   last10Mean:recent10===null?null:round(recent10*factor),
   sampleStdDev:variance===null?null:round(Math.sqrt(variance)*factor),
   firstDate:games.find(g=>Number.isFinite(g[market]))?.gameDate||null,
   mostRecentOfficialDate:games.findLast(g=>Number.isFinite(g[market]))?.gameDate||null,
   model:"nhl-priority-four-static-form-shadow-v1",
   distributionCalibrated:false,higherProbability:null,lowerProbability:null,
   pricingEV:null,originalPlatformSettlementVerified:false,
   sourceRule:market==="timeOnIceSeconds"?
    "Official NHL full-game TOI may include OT; Underdog TOI excludes OT. Not an Underdog game-total quote.":
    market==="underdogGoalieFantasyScore"?
    "Only official NHL starter W/L/O+saves+goals-against under Underdog 2026-06-07 rules; NOT PrizePicks NHL goalie scoring.":
    market==="prizePicksGoalieFantasyScore"?
    "User-provided PrizePicks NHL goalie values: +10 official individual win, +10 official shutout, +0.3 saves, -2 goals against. Official gamecenter+goalie/summary matches, starter only; no confirmed PrizePicks app settlement or independent rule-chart authentication.":
    market==="faceoffsWon"?
    "Exact official faceoffsWon integer only; percent without attempts is not enough.":
    "Official NHL gamecenter final hits, not provider fantasy projections."
  };
 }
 return {playerId:player.playerId,name:player.name,team:player.team,
  playerType:player.type,latestIncludedGameDate:games.at(-1)?.gameDate||null,
  projections};
}
function buildFourPriorityShadow(history,{asOf=new Date().toISOString()}={}){
 if(!history?.players||!Number.isFinite(Date.parse(asOf)))
  throw Error("Official NHL history and valid as-of time required");
 const players={},coverage=Object.fromEntries(Object.keys(NHL_MARKET_STATS).map(
  m=>[m,{eligiblePlayers:0,playersWithAnyOfficialStats:0,statObservations:0}]));
 for(const [id,p] of Object.entries(history.players)){
  if(!p||!["skater","goalie"].includes(p.type)||!Array.isArray(p.games))
   continue;
  const result=projectFourPriorityMarkets(p,asOf);
  players[id]=result;
  for(const [market,projection] of Object.entries(result.projections)){
   coverage[market].statObservations+=projection.observations;
   if(projection.observations>0)coverage[market].playersWithAnyOfficialStats++;
   if(projection.readyForResearch)coverage[market].eligiblePlayers++;
  }
 }
 return {schemaVersion:1,kind:"nhl_priority_four_market_stat_shadow",
  builtAt:new Date(Date.parse(asOf)).toISOString(),
  cutoffDateExclusive:new Date(asOf).toISOString().slice(0,10),
  source:"official_NHL_archived_final_player_game_boxscores",
  status:"research_shadow_not_deployed",model:"nhl-priority-four-static-form-shadow-v1",
  categories:["hits","timeOnIce","faceoffsWon","goalieFantasyScore"],
  markets:["hits","timeOnIceSeconds","faceoffsWon","underdogGoalieFantasyScore",
    "prizePicksGoalieFantasyScore"],
  prizePicksGoalieFantasyFormulaImplemented:true,
  prizePicksGoalieFantasyRuleSource:"user_provided_2026_11_06",
  modelProbabilitiesCalibrated:false,pregameStarterValidationAvailable:false,
  underdogTOIRegulationMinutesVerified:false,
  prizePicksNhlGoalieFantasyScoringVerified:false,
  originalPlatformOffersAuthenticated:false,commercialReuseVerified:false,
  productionChampionChanged:false,liveLineupsChanged:false,
  estimatedPayouts:null,verifiedHitRate:null,
  sourceSampleCoverage:coverage,playerCount:Object.keys(players).length,
  players,
  warning:"Statistical exploratory player-history means only; no validated higher/lower probability, provider tier/payout or sportsbook edge. No goalie starter forecast. Exact faceoff wins require official Stats REST. PrizePicks goalie scoring uses user-provided coefficients and official individual win/shutout counts but is NOT independently verified against the PrizePicks app or its settlement/reboot rules. Underdog non-OT TOI requires a separate verified source; do not publish these as playable picks."};
}
module.exports={projectFourPriorityMarkets,buildFourPriorityShadow,MIN_SAMPLES};
