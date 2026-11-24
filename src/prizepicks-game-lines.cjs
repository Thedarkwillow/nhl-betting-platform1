"use strict";
/**
 * PrizePicks TEAM PICKS (aka Game Lines) for NHL/NFL.
 * These are Win / Spread / Total team-outcome markets, NOT Higher/Lower
 * player props. Metadata and archive ingestion only -- not an authentic
 * platform quote collector until an approved source is connected.
 */
const SPORTS=new Set(["NFL","NHL"]);
const MARKETS=Object.freeze({
 team_win:{kind:"winner",requiresNumber:false,eligibleSports:["NFL","NHL"]},
 team_spread:{kind:"spread",requiresNumber:true,eligibleSports:["NFL","NHL"]},
 game_total:{kind:"total",requiresNumber:true,eligibleSports:["NFL","NHL"]},
});
const SOURCE_TYPES=new Set(["authorized_original_platform_capture","authorized_provider_team_picks_export"]);
const INELIGIBLE="unverified_authentic_team_pick_and_settlement";
function classify({sport,market}={}){
 const s=String(sport||"").toUpperCase();
 const m=String(market||"").toLowerCase();
 if(!SPORTS.has(s))return {status:"quarantine",reason:"unsupported_sport"};
 if(!Object.hasOwn(MARKETS,m))return {status:"quarantine",reason:"unknown_game_line_type"};
 return {status:"known_market_only",sport:s,marketId:m,
  marketType:MARKETS[m].kind,playerProp:false,teamPick:true,
  currentOriginalPrizePicksQuoteVerified:false,
  needsMarketSpecificSettlement:true,autoPickEligible:false};
}
function assertTeamPick(record,{now=new Date()}={}){
 if(!record||typeof record!=="object")throw Error("Team Pick record object required");
 const kind=classify(record);
 if(kind.status!=="known_market_only")throw Error("Unknown sport/game line");
 if(!SOURCE_TYPES.has(record.sourceKind))throw Error("Authorized original team-pick source required");
 const at=Date.parse(record.observedAt),start=Date.parse(record.startsAt);
 if(!Number.isFinite(at)||!Number.isFinite(start)||at>=start||at>Date.parse(now.toISOString())+60000)
  throw Error("Game Line quote must be observed strictly before kickoff");
 if(!/^[A-Za-z0-9_.:-]{4,128}$/.test(record.eventId||"") ||
  !/^[A-Z]{2,4}$/.test(record.homeTeam||"")||
  !/^[A-Z]{2,4}$/.test(record.awayTeam||"")||record.homeTeam===record.awayTeam)
  throw Error("Game Line missing validated matchup identity");
 const m=MARKETS[record.market];
 if(m.requiresNumber&&!Number.isFinite(record.line))
  throw Error("Spread/total require a numeric original line");
 if(!["home","away","over","under"].includes(record.selection))
  throw Error("Original Team Pick selection required");
 if(record.market==="game_total"&&!["over","under"].includes(record.selection))
  throw Error("Total Team Pick must use over or under");
 if(record.market!=="game_total"&&!["home","away"].includes(record.selection))
  throw Error("Winner/spread Team Pick must identify home or away");
 if(!Number.isFinite(record.multiplier)||record.multiplier<=1)
  throw Error("Original Team Pick payout multiplier required");
 if(!record.originalSourceOfferId||typeof record.originalSourceOfferId!=="string")
  throw Error("Original source offer ID required");
 return {...kind,eventId:record.eventId,
  homeTeam:record.homeTeam,awayTeam:record.awayTeam,
  line:record.market==="team_win"?null:record.line,
  selection:record.selection,multiplier:record.multiplier,
  originalSourceOfferId:record.originalSourceOfferId,
  sourceKind:record.sourceKind,observedAt:record.observedAt,
  startsAt:record.startsAt,platform:"prizepicks",
  archivedResearchOnly:true,sourceAuthenticatedFirstParty:false,
  callerSourceClaimNotIndependentlyVerified:record.sourceKind,
  priceAndAvailabilityCurrent:false,
  noPublicRedistributionWithoutRights:true,
  estimatedProbability:null,verifiedProspectiveHitRate:null,
  autoPickEligible:false,reason:INELIGIBLE};
}
/**
 * PrizePicks' Oct 2026 help text includes NFL among mixed eligible sports,
 * NOT NHL. Never assert all hockey Team Picks are DFS mix-eligible.
 */
const RULES=Object.freeze({
 NFL:{teamOnly:true,teamPlayerMixedRulesDocumented:true,
  mixedRequiresAtLeast2PlayersDifferentTeams:true,
  maxTeamPicksInMixed:4,maxPicks:6,
  teamOnlyMaxPicks:6,playerTeamMixedPowerOnly:true,
  forbidSameTeamSpreadAndWinner:true,
  source:"https://www.prizepicks.com/playbook-article/combine-multiple-games-players-prizepicks-nfl-more-sports"},
 NHL:{teamOnly:"product_or_jurisdiction_dependent_unverified",
  teamPlayerMixedRulesDocumented:false,
  maxPicks:null,teamOnlyMaxPicks:null,
  playerTeamMixedPowerOnly:null,
  forbidSameTeamSpreadAndWinner:"unverified",
  source:"https://www.prizepicks.com/help-center/potential-outcomes"}
});
function evaluateResearchLineup(sport,picks){
 const s=String(sport||"").toUpperCase(),rules=RULES[s];
 if(!rules||!Array.isArray(picks)||!picks.length)return {eligible:false,reason:"unknown_sport_or_empty"};
 if(picks.some(x=>!x||x.autoPickEligible!==true))
  return {eligible:false,reason:"unverified_team_picks_or_player_props",rules};
 if(s==="NHL")return {eligible:false,reason:"nhl_mixed_team_rules_unverified",rules};
 // Even when authenticated pick records eventually exist, correlation,
 // settlement, geographic eligibility and account restrictions remain.
 return {eligible:false,reason:"production_risk_and_settlement_validation_pending",rules};
}
module.exports={SPORTS,MARKETS,SOURCE_TYPES,RULES,classify,assertTeamPick,evaluateResearchLineup};
