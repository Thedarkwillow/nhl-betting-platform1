"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {classify,analyze}=require("../scripts/audit-prizepicks-tier-evidence.cjs");
const row=(tier="Demon")=>({projectionId:"abc",tier,market:"Shots On Goal",
 line:4.5,side:"Higher",observedAt:"2026-10-31T00:00:00Z",
 eventStartsAt:"2026-11-01T00:00:00Z",sourceFields:{oddsType:tier.toLowerCase()},
 payoutMultiplier:null,tierPayoutVerified:false});
test("adopts only observed pregame matching tier labels",()=>{
 assert.equal(classify(row()).tier,"demon");
 const mismatch=row();mismatch.sourceFields.oddsType="standard";
 assert.equal(classify(mismatch).reason,"conflicting_tier_fields");
 const late=row();late.observedAt="2026-11-01T01:00:00Z";
 assert.equal(classify(late).reason,"unverified_pregame");
 const bad=row("Goblin");bad.side="Lower";
 assert.equal(classify(bad).reason,"invalid_side");
});
test("never backfills earlier seasons by inference or treats absent multiplier as verified",()=>{
 const source={provider:"prizepicksapi.com",completePagination:true,
  rows:[row(),row(),{...row("Goblin"),projectionId:"second"}]};
 const result=analyze([source,source]);
 assert.deepEqual(result.observedTierValues,{standard:0,goblin:1,demon:1});
 assert.equal(result.validObservations,2);
 assert.equal(result.exactMultiplierRecords,0);
 assert.equal(result.bySeason["2023-24"].originalOfferTierEvidence,"not_established");
 assert.equal(result.bySeason["2024-25"].originalOfferTierEvidence,"not_established");
 assert.equal(result.sourceIsOriginalPrizePicks,false);
});
