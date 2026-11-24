"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {guardNhlOfferClaims,guardNhlPublicClaim}=require("../src/nhl-offer-claim-guard.cjs");
const {publicEvidenceLabels,publicResponsibleResearch}=require("../src/nhl-public-evidence-labels.cjs");
const root=path.resolve(__dirname,"..");
const file=p=>fs.readFileSync(path.join(root,p),"utf8");
const model=JSON.parse(file("config/canonical-research-entities-v1.json"));
test("P08-01 canonical 21-entity v1 contract has unique keys, FK targets and write-once event types",()=>{
 assert.equal(model.kind,"canonical_multi_sport_research_entity_contract_v1");
 assert.equal(Object.keys(model.entities).length,21);
 const keys=new Set();
 for(const [name,e] of Object.entries(model.entities)){
  assert.ok(e.requiredFields.includes(e.primaryKey),"Missing primary key "+name);
  assert.ok(!keys.has(e.primaryKey),"Cross-entity identity collision "+name);
  keys.add(e.primaryKey);
  assert.equal(new Set(e.requiredFields).size,e.requiredFields.length);
  for(const target of e.references)assert.ok(model.entities[target],"Unknown FK "+name+"→"+target);
 }
 for(const name of ["sourceSnapshots","sourceOffers","forecasts","frozenSelections",
  "officialOutcomes","platformSettlements","payoutRules","researchLineups"])
  assert.ok(model.entities[name]);
 for(const name of ["sourceSnapshots","forecasts","frozenSelections",
  "officialOutcomes","platformSettlements","backtests"])
  assert.equal(model.entities[name].appendOnly,true,name);
 for(const t of ["observedAt","capturedAt","storedAt"])
  assert.ok(model.entities.sourceSnapshots.requiredFields.includes(t));
 assert.match(file("docs/CANONICAL_RESEARCH_ENTITY_CONTRACT_V1.md"),/P08-02/);
});
test("P02-12 independently labelled tier never authenticates price or original platform availability",()=>{
 for(const tier of ["Standard","Goblin","Demon"]){
  const r=guardNhlOfferClaims({tier,gameId:2026020010,playerId:8470000,
   market:"shotsOnGoal",line:2.5,side:"Higher",period:"Full game",
   bookmakerAmericanOdds:-137,originalMultiplier:99,guessedPayout:40});
  assert.equal(r.providerIndicatedTier,tier);
  assert.equal(r.originalTierVerified,false);
  assert.equal(r.platformPriceVerified,false);
  assert.equal(r.exactSelectedLineMultiplier,null);
  assert.equal(r.expectedValueAvailable,false);
  assert.equal(guardNhlPublicClaim({tier}).expectedValue,null);
 }
 assert.equal(guardNhlPublicClaim({tier:"FakeTier"}).tier,null);
});
test("P02-12 only dated exact primary platform proof can verify original tier, but not live availability",()=>{
 const input={tier:"Demon",gameId:12345,playerId:987,market:"shotsOnGoal",
  side:"Higher",period:"Full game",line:3.5};
 const proof={kind:"dated_authenticated_original_platform_evidence",
  originalPlatform:"PrizePicks",authenticatedOriginalAppEvidence:true,
  observedAt:"2026-11-06T23:40:00Z",originalOfferId:"prizepicks_a12",
  exactMarketKey:"shotsOnGoal",tier:"Demon",gameId:12345,playerId:987,
  market:"shotsOnGoal",side:"Higher",period:"Full game",line:3.5,
  payoutRuleAuthenticated:true,exactSelectedLineMultiplier:5,payoutFormat:"Power"};
 const r=guardNhlOfferClaims({...input,proof});
 assert.equal(r.originalTierVerified,true);
 assert.equal(r.platformPriceVerified,true);
 assert.equal(r.originalPlatformLiveAvailabilityVerified,false);
 assert.equal(r.expectedValueAvailable,false);
 assert.equal(guardNhlOfferClaims({...input,proof:{...proof,line:4.5}}).originalTierVerified,false);
 assert.equal(guardNhlOfferClaims({...input,proof:{...proof,originalPlatform:"unlicensed"}}).originalTierVerified,false);
 const pub=guardNhlPublicClaim({...input,proof});
 assert.equal(pub.exactSelectedLineMultiplier,null,"Private primary payout proof never leaks to public feed");
 assert.equal(pub.expectedValue,null);
});
test("P09-06 / P11-06 evidence classes distinguish reconstructed, estimates and settlements",()=>{
 const labels=publicEvidenceLabels(),responsible=publicResponsibleResearch();
 assert.match(labels.modelEstimate,/uncalibrated|not verified/i);
 assert.match(labels.retrospective,/not a prospective/i);
 assert.match(labels.frozenPregame,/saved pregame/i);
 assert.match(labels.officialStats,/NOT original fantasy settlement/i);
 assert.match(labels.platformSettlement,/UNVERIFIED/);
 assert.match(labels.tier,/UNVERIFIED/);
 assert.equal(responsible.noAutoplacement,true);
 assert.equal(responsible.noBettingActionOnSite,true);
 assert.equal(responsible.noPressure,true);
 assert.match(responsible.risk,/financial risk/);
});
test("P01-08 legacy manual workflows are harmless stubs and do not reintroduce paid collectors",()=>{
 const paths=[
  "collect-pickfinder-cloud.yml","probe-pickfinder.yml","import-pickfinder.yml",
  "collect-prizepicks-cloud.yml","nhl-immediate-board-capture-20261106.yml",
  "nhl-recover-immutable-board-20261106.yml","one-shot-nhl-prospective-freeze-20261103.yml",
  "nhl-one-time-compact-repair-freeze.yml","verify-prizepicksapi-once.yml"
 ];
 for(const p of paths){
  const text=file(".github/workflows/"+p);
  assert.match(text,/Retired|retired/);
  assert.match(text,/workflow_dispatch/);
  assert.doesNotMatch(text,/^\s+schedule:/m);
  assert.doesNotMatch(text,/^\s+push:/m);
  assert.doesNotMatch(text,/\$\{\{\s*secrets\./);
  assert.doesNotMatch(text,/^\s+uses:\s*\.\/\.github\/workflows\/trial-free-prizepicks-nhl/m);
  assert.doesNotMatch(text,/run:\s*node scripts\//);
  assert.doesNotMatch(text,/^\s+contents:\s*write/m);
 }
 // These two old metered routes were *deliberately* paused following the
 // November quota warning. Treating them as recurring jobs is dangerous:
 // it would silently reintroduce paid board calls just to satisfy CI.
 for(const paused of ["nhl-bounded-daily-pregame-freeze.yml","nhl-0900-board-delta.yml"]){
  const text=file(".github/workflows/"+paused);
  assert.match(text,/Paused \(No Vendor Calls\)/);
  assert.match(text,/workflow_dispatch:/);
  assert.doesNotMatch(text,/^\s+schedule:/m);
  assert.doesNotMatch(text,/collect-prizepicks-asof-nhl\.cjs|secrets\.PRIZEPICKSAPI_KEY/);
 }
 const trial=file(".github/workflows/trial-free-prizepicks-nhl.yml");
 assert.match(trial,/cron: '15 16 1 \* \*'/);
 assert.match(trial,/node scripts\/collect-prizepicks-asof-nhl\.cjs/);
});
test("OPS-10 mobile service runbook covers degraded states and incident steps",()=>{
 const runbook=file("docs/NHL_MOBILE_DEGRADED_MODE_AND_RECOVERY.md");
 for(const token of ["Android","offline","source","6 AM","9 AM","Reboot",
  "Underdog","Refresh saved research","GitHub Actions","recovery","privacy"])
  assert.ok(runbook.toLowerCase().includes(token.toLowerCase()),token);
 assert.match(runbook,/do not place|no auto-wager|no wagers placed|no auto.*wager/i);
});
