"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {classify,MARKETS,RULES,assertTeamPick,evaluateResearchLineup}=
 require("../src/prizepicks-game-lines.cjs");
const input={sport:"NFL",market:"team_spread",sourceKind:"authorized_original_platform_capture",
 observedAt:"2026-11-08T11:30:00Z",startsAt:"2026-11-08T18:00:00Z",
 eventId:"2026_09_JAX_BAL",homeTeam:"BAL",awayTeam:"JAX",
 line:-3.5,selection:"home",multiplier:1.9,originalSourceOfferId:"pp-source-123"};
test("both NHL/NFL have three Team Pick research markets, no player-prop higher/lower alias",()=>{
 for(const sport of ["NHL","NFL"])for(const market of Object.keys(MARKETS)){
  const result=classify({sport,market});
  assert.equal(result.status,"known_market_only");
  assert.equal(result.teamPick,true);
  assert.equal(result.playerProp,false);
  assert.equal(result.autoPickEligible,false);
 }
 assert.equal(classify({sport:"NFL",market:"point_total"}).status,"quarantine");
});
test("immutable pregame quote ingest validates market, original source and multiplier",()=>{
 const v=assertTeamPick(input,{now:new Date("2026-11-08T12:00:00Z")});
 assert.equal(v.marketId,"team_spread");
 assert.equal(v.sourceAuthenticatedFirstParty,false);
 assert.equal(v.autoPickEligible,false);
 assert.equal(v.line,-3.5);
 assert.equal(v.callerSourceClaimNotIndependentlyVerified,"authorized_original_platform_capture");
 for(const patch of [{observedAt:"2026-11-08T19:00:00Z"},
  {selection:"over"},{multiplier:null},{sourceKind:"any_website"},
  {originalSourceOfferId:""},{homeTeam:"JAX",awayTeam:"JAX"},
  {eventId:"<script>"},{line:null}]){
  assert.throws(()=>assertTeamPick({...input,...patch},{now:new Date("2026-11-08T20:00:00Z")}));
 }
});
test("NHL mixed Team Picks not silently treated as same NFL rule",()=>{
 assert.equal(RULES.NFL.teamPlayerMixedRulesDocumented,true);
 assert.equal(RULES.NHL.teamPlayerMixedRulesDocumented,false);
 assert.equal(evaluateResearchLineup("NHL",[{autoPickEligible:false}]).eligible,false);
 assert.equal(evaluateResearchLineup("NFL",[{autoPickEligible:true}]).eligible,false);
});

test("authorized data-file import archives a validated NHL or NFL Game Line only as private research",()=>{
 const {normalizeExport}=require("../scripts/import-prizepicks-game-lines.cjs");
 const payload={sourceDescription:"explicit owner authorized export",offers:[input]};
 const result=normalizeExport(payload,{sport:"NFL",now:new Date("2026-11-08T12:00:00Z")});
 assert.equal(result.kind,"prizepicks_team_picks_authorized_export_research_only");
 assert.equal(result.exactLineCount,1);
 assert.equal(result.providerIdentityIndependentlyVerified,false);
 assert.equal(result.notACompleteLiveBoard,true);
 assert.equal(result.autoPickEligible,false);
 assert.equal(result.offers[0].sourceAuthenticatedFirstParty,false);
 assert.throws(()=>normalizeExport(payload,{sport:"NHL",now:new Date("2026-11-08T12:00:00Z")}),/Cross-league/);
});
