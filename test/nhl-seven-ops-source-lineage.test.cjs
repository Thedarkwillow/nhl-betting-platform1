"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path");
const {buildPublicData}=require("../scripts/export-public-nhl-data.cjs");
test("public source freshness references latest independently captured board, not the older selected research cohort",()=>{
 const root=path.resolve(__dirname,"..");
 const independent=JSON.parse(fs.readFileSync(path.join(root,
  "outputs/free-source/nhl/latest.json"),"utf8"));
 const d=buildPublicData(new Date().toISOString());
 assert.equal(d.researchIntelligence.operations.sourceCapturedAt,independent.generatedAt);
 assert.equal(d.researchIntelligence.operations.offeredSideRows,independent.rows.length);
 assert.equal(d.researchIntelligence.operations.completePagination,
  independent.completePagination===true);
 // A newer independent quote archive is not permission to relabel historical
 // research prop choices as current. The existing research/quote join stays.
 assert.equal(d.researchIntelligence.operations.originalPrizePicksOfferAuthenticated,false);
 assert.equal(d.researchIntelligence.grading.originalFantasyPlatformSettlementVerified,false);
});
