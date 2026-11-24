"use strict";
/**
 * NHL multiplayer/period prop source contract. A string such as
 * "Skater A + Skater B" does NOT establish the actual participant IDs.
 * Combo historical samples must be real simultaneous official player games:
 * never multiply independent probabilities for correlated team prop pairs.
 */
const COMBOS=Object.freeze({
 shotsOnGoalCombo:{stat:"shotsOnGoal",role:"skater"},
 goalieSavesCombo:{stat:"saves",role:"goalie"},
 goalsCombo:{stat:"goals",role:"skater"}
});
const PERIODS=Object.freeze({"1st period":1,"first period":1,
 "2nd period":2,"second period":2,
 "3rd period":3,"third period":3});
function periodCode(value){
 const v=String(value||"").toLowerCase().trim();
 if(["full game","game","full"].includes(v))return "full_game";
 return PERIODS[v]??null;
}
function validateComboIdentity(offer,history){
 const spec=COMBOS[offer?.market];
 if(!spec)return {valid:false,reason:"unknown_nhl_combo_market"};
 const ids=offer?.officialMemberPlayerIds,gameId=offer?.officialGameId;
 if(!Array.isArray(ids)||ids.length<2||ids.length>3||
  ids.some(x=>!Number.isInteger(x)||x<=0)||
  new Set(ids).size!==ids.length||
  !Number.isInteger(gameId)||gameId<=0)
  return {valid:false,reason:"exact_nhl_combo_member_and_game_ids_required"};
 if(periodCode(offer.period)!=="full_game")
  return {valid:false,reason:"unsupported_combo_period"};
 if(!history?.players)return {valid:false,reason:"official_combo_history_unavailable"};
 const players=ids.map(x=>history.players[String(x)]);
 if(players.some(p=>!p||p.type!==spec.role||!Array.isArray(p.games)))
  return {valid:false,reason:"combo_athlete_official_role_unmatched"};
 return {valid:true,stat:spec.stat,ids,gameId,players,
  originalPlatformOfferVerified:false,providerRuleVerified:false};
}
function sharedOfficialComboSamples(offer,history,{eventStartsAt}={}){
 const identity=validateComboIdentity(offer,history);
 if(!identity.valid)return {...identity,samples:[]};
 const at=Date.parse(eventStartsAt);
 if(!Number.isFinite(at))return {valid:false,reason:"future_event_time_missing",samples:[]};
 const day=new Date(at).toISOString().slice(0,10),byGame=new Map();
 for(const p of identity.players){
  const playerGames=new Map();
  for(const g of p.games){
   if(!Number.isInteger(g.gameId)||!g.gameDate||g.gameDate>=day||
      !Number.isInteger(g[identity.stat])||g[identity.stat]<0)continue;
   playerGames.set(g.gameId,{date:g.gameDate,value:g[identity.stat]});
  }
  byGame.set(p.playerId,playerGames);
 }
 const out=[];
 for(const [gameId,first] of byGame.get(identity.ids[0])??[]){
  const members=identity.ids.map(id=>byGame.get(id)?.get(gameId));
  if(members.some(x=>!x)||members.some(x=>x.date!==first.date))continue;
  out.push({gameId,date:first.date,value:members.reduce((s,x)=>s+x.value,0)});
 }
 out.sort((a,b)=>a.date.localeCompare(b.date)||a.gameId-b.gameId);
 return {...identity,samples:out,
  // Co-game opponent/team composition shifts; past shared games are a
  // selected subset, not an independent calibrated matchup distribution.
  researchModelReady:out.length>=8,liveAutoPickEligible:false,
  lineupEligible:false,calibrated:false,originalProviderSettlementVerified:false};
}
function validatePeriodStatOffer(offer,periodHistory){
 const period=periodCode(offer?.period);
 if(![1,2,3].includes(period))return {eligible:false,reason:"period_not_supported"};
 if(!Number.isInteger(offer?.officialGameId)||!Number.isInteger(offer?.officialPlayerId)||
   !["shotsOnGoal","goals","assists","points","blockedShots","saves"].includes(offer?.market))
  return {eligible:false,reason:"period_player_game_market_unmatched"};
 const rows=periodHistory?.players?.[String(offer.officialPlayerId)]?.[String(period)];
 const valid=Array.isArray(rows)?rows.filter(x=>
  Number.isInteger(x[offer.market])&&x[offer.market]>=0&&
  Number.isInteger(x.gameId)&&/^\d{4}-\d{2}-\d{2}$/.test(x.gameDate||"")&&
  x.playedInPeriod===true&&x.period===period):[];
 if(valid.length<8)
  return {eligible:false,reason:"period_official_historical_stats_missing",
   observedOfficialPeriodSamples:valid.length};
 // This module cannot itself validate third-party exact period settlement,
 // currently no complete per-period official history collector is wired.
 return {eligible:false,reason:"original_period_offer_and_settlement_not_verified",
  officialSampleCount:valid.length,period,
  calibrated:false,productionEligible:false};
}
function auditCompositeAndPeriodBoard(rows,history,periodHistory=null){
 const summary={comboRows:0,periodRows:0,comboReadyForLivePicks:0,
  periodReadyForLivePicks:0,comboWithExactIdentity:0,
  comboSharedHistoryAtLeastEight:0,notReadyReasons:{}};
 const reasons=summary.notReadyReasons;
 function note(s){reasons[s]=(reasons[s]||0)+1;}
 for(const row of Array.isArray(rows)?rows:[]){
  const code=periodCode(row?.period);
  const key=String(row?.market||"").toLowerCase().replace(/[^a-z0-9]+/g,"").trim();
  const map={"shotsongoalcombo":"shotsOnGoalCombo","goaliesavescombo":"goalieSavesCombo",
    "goalscombo":"goalsCombo"};
  const combo=map[key];
  if(combo){
   summary.comboRows++;
   const result=sharedOfficialComboSamples({
    ...row,market:combo,officialGameId:row.officialGameId,
    officialMemberPlayerIds:row.officialMemberPlayerIds
   },history,{eventStartsAt:row.eventStartsAt});
   if(result.valid)summary.comboWithExactIdentity++;
   if(result.researchModelReady)summary.comboSharedHistoryAtLeastEight++;
   note(result.reason||(result.researchModelReady?
    "joint_combo_probability_and_platform_settlement_unverified":
    "insufficient_shared_historical_player_games"));
  }else if([1,2,3].includes(code)){
   summary.periodRows++;
   const verdict=validatePeriodStatOffer({
    ...row,market:row?.canonicalMarket||row.market,
    officialGameId:row.officialGameId,
    officialPlayerId:row.officialPlayerId
   },periodHistory);
   note(verdict.reason);
  }
 }
 return {kind:"nhl_extended_market_source_readiness_v1",...summary,
  researchOnly:true,noSyntheticCombinationProbabilities:true,
  originalPlatformComboRulesAuthenticated:false,
  periodOutcomeCollectorConnected:periodHistory?.kind==="nhl_official_period_history_v1",
  officialPeriodCompletedGames:periodHistory?.completedGames??0,
  officialPeriodHistoricalRows:periodHistory?.playerPeriodObservations??0};
}
module.exports={COMBOS,PERIODS,periodCode,validateComboIdentity,
 sharedOfficialComboSamples,validatePeriodStatOffer,
 auditCompositeAndPeriodBoard};
