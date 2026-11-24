"use strict";
/**
 * NFL Ballpark-Pal-style research matrix for the complete NFL market registry.
 * A URL/reference is NEVER evidence of a working connector or model feature.
 * Distinguish historical files, as-of pregame context, settlement and model use.
 */
const {MARKET_REGISTRY}=require("./nfl-market-registry.cjs");
const {SOURCES}=require("./nfl-research-sources.cjs");

const FAMILY=Object.freeze({
 passing:{base:["player_weekly","team_weekly","schedule"],
   enriched:["nextgen_passing","snap_counts","weekly_rosters","injuries"],
   references:["rotowire","nextgenstats","profootballreference","pff"],
   features:["pass volume","completion rate","opponent pass efficiency","pressure","wind/roof","QB usage/injuries"]},
 rushing:{base:["player_weekly","team_weekly","schedule"],
   enriched:["snap_counts","weekly_rosters","injuries","nextgen_rushing"],
   references:["rotowire","fantasylife","nextgenstats","profootballreference","pff"],
   features:["rush share","red-zone carries","defensive front","yards after contact","game script"]},
 receiving:{base:["player_weekly","team_weekly","schedule"],
   enriched:["snap_counts","weekly_rosters","injuries","nextgen_receiving"],
   references:["fantasylife","rotowire","nextgenstats","profootballreference","pff"],
   features:["routes","target share","targets per route","air yards","opponent coverage","red-zone targets"]},
 kicking:{base:["kicking_pbp","team_weekly","schedule"],
   enriched:["snap_counts","weekly_rosters","injuries"],
   references:["rotowire","profootballreference","weather"],
   features:["FG attempts and distances","XP opportunity","wind and roof","scoring drives","kicker availability"]},
 punting:{base:["team_weekly","schedule","pbp_specialty_events"],
   enriched:["snap_counts","weekly_rosters"],
   references:["profootballreference","weather"],
   features:["drive count","punt opportunities","inside 20","gross distance","field position"]},
 defense:{base:["team_weekly","schedule","pbp_specialty_events"],
   enriched:["snap_counts","injuries","pfr_def"],
   references:["rotowire","profootballreference","nextgenstats","pff"],
   features:["opponent dropbacks","pressure rate","tackle opportunity","pass-blocking","snap share"]},
 fantasy:{base:["player_weekly","schedule","scoring_rules_versioned"],
   enriched:["snap_counts","nextgen_passing","nextgen_rushing","nextgen_receiving"],
   references:["fantasylife","profootballreference"],
   features:["all versioned scoring components","usage","opponent","correlation"]},
 combo:{base:["player_weekly","schedule","component_identity_and_joint_distribution"],
   enriched:["team_weekly","snap_counts","weekly_rosters"],
   references:["fantasylife","rotowire","profootballreference"],
   features:["component identity","joint distribution","correlation","exact period","void rules"]},
 period:{base:["schedule","pbp_specialty_events","period_settlement_rules"],
   enriched:["team_weekly","snap_counts","weekly_rosters"],
   references:["fantasylife","rotowire","profootballreference"],
   features:["period volume","quarter pace","first attempt","drive chronology","overtime exclusions"]},
 special_teams:{base:["schedule","pbp_specialty_events"],
   enriched:["team_weekly","snap_counts"],
   references:["rotowire","profootballreference","weather"],
   features:["return attempts","punt opportunities","opponent special teams"]},
 returns:{base:["schedule","pbp_specialty_events"],
   enriched:["team_weekly","snap_counts"],
   references:["profootballreference","weather"],
   features:["kick returns","punt returns","returns allowed","game script"]},
 touchdown:{base:["player_weekly","schedule","pbp_specialty_events"],
   enriched:["snap_counts","weekly_rosters","injuries"],
   references:["fantasylife","rotowire","nextgenstats"],
   features:["red-zone usage","endzone targets","goal-line shares","opponent defense"]},
 opportunity:{base:["player_weekly","schedule","pbp_specialty_events"],
   enriched:["snap_counts","weekly_rosters"],
   references:["fantasylife","rotowire"],
   features:["snap rate","drive rate","third-down usage","role volatility"]},
 ball_security:{base:["player_weekly","schedule"],
   enriched:["team_weekly","snap_counts","injuries"],
   references:["profootballreference","rotowire"],
   features:["fumble rate","offensive touches","opponent strips"]},
 team:{base:["team_weekly","schedule"],
   enriched:["injuries","weekly_rosters"],
   references:["profootballreference","weather"],
   features:["pace","opponent strength","weather","availability"]},
 futures:{base:["schedule","team_weekly"],
   enriched:["injuries","weekly_rosters"],
   references:["profootballreference"],
   features:["season horizon","schedule strength","roster continuity"]},
});
const FAMILY_ALIAS=Object.freeze({
 special_teams:"special_teams",drive:"period",event:"period",
 milestone:"period",leader:"combo"
});
const NON_ARCHIVED=new Set(["period_settlement_rules",
 "scoring_rules_versioned","component_identity_and_joint_distribution",
 "pregame_forecast_weather","original_platform_quote","original_platform_settlement"]);
const HISTORICAL_DATA_ONLY=true;

function requirementsFor(market){
 if(!market?.id||!market?.group)throw Error("Canonical NFL market required");
 let group=market.group;
 if(group==="kicking"||market.group==="fantasy"&&market.id==="kicker_fantasy_score")
  group="kicking";
 if(group==="combo"&&market.id.includes("fg_"))group="kicking";
 if(group==="combo"&&market.id.includes("punt"))group="punting";
 if(group==="event"&&market.id.includes("fg_"))group="kicking";
 if(group==="period"&&market.id.includes("fg_"))group="kicking";
 group=FAMILY_ALIAS[group]||group;
 const base=FAMILY[group];
 if(!base)throw Error("Unmapped NFL research family "+group);
 const must=new Set(base.base),enhanced=new Set(base.enriched);
 if(market.requiredData==="play_by_play"&&!["kicking","period"].includes(group))
  must.add("pbp_specialty_events");
 if(["event","drive_chart","period"].includes(market.requiredData) && group!=="kicking")
  must.add("pbp_specialty_events");
 if(market.requiredData==="tracking")
  enhanced.add("ftn_charting_research_only");
 if(market.group==="combo"){
  must.add("component_identity_and_joint_distribution");
 }
 if(market.id==="sacks_taken")must.add("pbp_specialty_events");
 if(market.id.includes("first_")||market.id.includes("quarters_")||
    market.id.includes("halves_")||market.id.includes("_quarter"))
  must.add("pbp_specialty_events");
 const refs=new Set(base.references);
 if(market.group==="kicking"||group==="punting")refs.add("weather");
 return Object.freeze({marketId:market.id,group:market.group,
  researchFamily:group,requiredHistoricalDatasets:[...must],
  supplementalHistoricalDatasets:[...enhanced],
  contextualWebsites:[...refs],featureTargets:[...base.features],
  mustValidatePlatformSettlement:true,requiresPrematchContext:true,
  historicalDataAloneNotEligibleForBetting:true});
}
function manifestIndex(manifest){
 const result=new Map();
 if(!manifest||!Array.isArray(manifest.datasets))return result;
 for(const d of manifest.datasets){
  if(d.status!=="saved"||!Number.isInteger(d.season)||typeof d.dataset!=="string"||
     !Number.isInteger(d.records)||d.records<1)continue;
  if(!result.has(d.dataset))result.set(d.dataset,new Set());
  result.get(d.dataset).add(d.season);
 }
 return result;
}
function auditContext({manifest=null,backtest=null,seasons=[2025,2026]}={}){
 const available=manifestIndex(manifest);
 const used=new Set((backtest?.byMarketYear||[])
  .filter(x=>x.year===2026&&x.pairedObservations>0).map(x=>x.market));
 const knownSources=new Set([...SOURCES.map(x=>x.id),"weather"]);
 const markets=MARKET_REGISTRY.map(m=>{
  const need=requirementsFor(m);
  const missing=need.requiredHistoricalDatasets.filter(key=>
   NON_ARCHIVED.has(key)||!seasons.every(year=>available.get(key)?.has(year)));
  const loaded=need.requiredHistoricalDatasets.filter(key=>!missing.includes(key));
  const supplementalAvailable=need.supplementalHistoricalDatasets.filter(key=>
    seasons.every(year=>available.get(key)?.has(year)));
  const missingContextualWebsites=need.contextualWebsites.filter(x=>
   x!=="nextgenstats"&&x!=="profootballreference");
  if(need.contextualWebsites.some(x=>!knownSources.has(x)))
   throw Error("Unregistered NFL matchup research source for "+m.id);
  return {id:m.id,group:m.group,researchFamily:need.researchFamily,
   requiredHistoricalDatasets:need.requiredHistoricalDatasets,
   archivedHistoricalInputs:loaded,missingHistoricalInputs:missing,
   availableSupplementalHistory:supplementalAvailable,
   contextualSourcesToConnect:missingContextualWebsites,
   plannedStatFeatures:need.featureTargets,
   historicalBaseDataComplete:missing.length===0,
   historicalSpecialtyEventsArchived:seasons.every(year=>available.get("pbp_specialty_events")?.has(year)),
   specialistMarketActualGradeReconciled:false,
   officialPeriodVoidAndSettlementRuleVersionValidated:false,
   correlatedJointDistributionValidated:false,
   previouslyBacktestedStatsOnly:used.has(m.id),
   actualExternalMatchupAPIConnected:false,
   historicalContextInputsFedIntoProductionModel:false,
   pregameRosterAndWeatherAsOfVerified:false,
   actualOfferedPrizePicksAndUnderdogLinesMatched:false,
   platformSettlementVerified:false,autoPickEligible:false};
 });
 return {schemaVersion:1,kind:"nfl_all_market_context_readiness_v1",
  generatedAt:new Date().toISOString(),
  yearRangeRequired:seasons,marketCount:markets.length,
  status:"research_source_requirements_and_archive_audit_only",
  archiveSnapshotAt:manifest?.collectedAt||null,
  archiveDataDoesNotImplyPregameAvailability:HISTORICAL_DATA_ONLY,
  specialistEventsArchiveIsOutcomesNotForecasts:true,
  perMarketSpecialistSettlementAndForecastStillRequiresValidation:true,
  noLicensedLiveRotoWireOrFantasyLifeConnectors:true,
  noVerifiedWeatherForecastAsOfKickoff:true,
  noMarketAutoPickPromoted:true,
  contextReadyForModeling:markets.filter(x=>x.historicalBaseDataComplete).length,
  missingContextMarketCount:markets.filter(x=>x.missingHistoricalInputs.length).length,
  statsOnlyBacktestMarketCount:markets.filter(x=>x.previouslyBacktestedStatsOnly).length,
  sites:SOURCES.map(s=>({id:s.id,name:s.name,url:s.url,
   sourceOnlyNotAConfirmedIntegration:true})),
  markets};
}
module.exports={FAMILY,NON_ARCHIVED,requirementsFor,manifestIndex,auditContext};
