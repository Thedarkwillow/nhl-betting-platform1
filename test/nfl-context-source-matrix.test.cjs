"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {MARKET_REGISTRY}=require("../src/nfl-market-registry.cjs");
const {SOURCES,sourceStatus}=require("../src/nfl-research-sources.cjs");
const {FAMILY,requirementsFor,auditContext}=require("../src/nfl-context-source-matrix.cjs");
function makeManifest(datasets,seasons=[2025,2026]){
 const records=[];
 for(const dataset of datasets)for(const season of seasons)
  records.push({dataset,season,status:"saved",records:100});
 return {collectedAt:"2026-11-08T12:00:00Z",datasets:records};
}
test("every NFL market has a category-aware matchup/usage research contract",()=>{
 assert.equal(MARKET_REGISTRY.length,132);
 for(const market of MARKET_REGISTRY){
  const r=requirementsFor(market);
  assert.ok(FAMILY[r.researchFamily],market.id);
  assert.ok(r.requiredHistoricalDatasets.length,market.id);
  assert.ok(r.contextualWebsites.length,market.id);
  assert.ok(r.featureTargets.length,market.id);
  assert.equal(r.historicalDataAloneNotEligibleForBetting,true);
 }
});
test("kickers require distance/drive/weather data and quarter props need event timing",()=>{
 const k=requirementsFor(MARKET_REGISTRY.find(x=>x.id==="fg_made"));
 assert.ok(k.requiredHistoricalDatasets.includes("kicking_pbp"));
 assert.ok(k.requiredHistoricalDatasets.includes("team_weekly"));
 assert.ok(k.contextualWebsites.includes("weather"));
 const q=requirementsFor(MARKET_REGISTRY.find(x=>x.id==="quarters_10_plus_receiving_yards"));
 assert.ok(q.requiredHistoricalDatasets.includes("pbp_specialty_events"));
 assert.ok(q.requiredHistoricalDatasets.includes("period_settlement_rules"));
});
test("premium/restricted sources must not be misrepresented as active feeds",()=>{
 assert.ok(SOURCES.find(s=>s.id==="ftncharting").commercialDisplay.includes("CC-BY-SA"));
 for(const id of ["rotowire","fantasylife","weather","pfn"])
  assert.equal(SOURCES.find(s=>s.id===id).collector,null,id);
 assert.ok(sourceStatus().every(s=>s.connected===false&&s.livePullVerified===false));
});
test("source audit uses actual per-season files, never website references as data",()=>{
 const manifest=makeManifest(["player_weekly","schedule","kicking_pbp",
  "team_weekly","snap_counts","weekly_rosters","injuries","nextgen_passing"]);
 const backtest={byMarketYear:[
  {year:2026,market:"passing_yards",pairedObservations:258},
  {year:2026,market:"fg_made",pairedObservations:235}
 ]};
 const r=auditContext({manifest,backtest});
 assert.equal(r.marketCount,132);
 assert.equal(r.statsOnlyBacktestMarketCount,2);
 assert.ok(r.contextReadyForModeling>0);
 assert.ok(r.missingContextMarketCount>0);
 const p=r.markets.find(x=>x.id==="passing_yards");
 assert.equal(p.historicalBaseDataComplete,true);
 assert.equal(p.previouslyBacktestedStatsOnly,true);
 assert.equal(p.historicalContextInputsFedIntoProductionModel,false);
 assert.equal(p.actualOfferedPrizePicksAndUnderdogLinesMatched,false);
 const q=r.markets.find(x=>x.id==="quarters_5_plus_receiving_yards");
 assert.ok(q.missingHistoricalInputs.includes("pbp_specialty_events"));
 assert.equal(q.historicalBaseDataComplete,false);
 assert.ok(r.markets.every(x=>x.autoPickEligible===false));
 assert.equal(r.noLicensedLiveRotoWireOrFantasyLifeConnectors,true);
});
test("2025-only archive cannot count as 2025 and 2026 completeness",()=>{
 const r=auditContext({manifest:makeManifest(["player_weekly","schedule",
  "team_weekly"],[2025])});
 assert.equal(r.contextReadyForModeling,0);
});
