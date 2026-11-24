"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {checkQuote,summarize,run}=require("../scripts/audit-free-nfl-prizepicks-mirror.cjs");
const sha="a".repeat(40),when="2026-11-08T12:05:58.000Z";
const quote={projectionId:"123456",playerId:"987654",gameId:"123987",player:"Player A",
 sport:"NFL",stat:"Pass Yards",line:"277.5",oddsType:"standard",status:"pre_game",
 providerFetchedAt:"2026-11-08T12:04:46.000Z",startTimeIso:"2026-11-08T09:30:00.000-05:00"};
const snapshot={sport:"NFL",scrapedAt:"2026-11-08T12:05:55.655Z",
 collectionStatus:{providerFetchedAt:"2026-11-08T12:04:46.000Z"},props:[quote]};
test("pinned historical GitHub commit and source timestamp both precede kickoff",()=>{
 const x=checkQuote(quote,snapshot,when);
 assert.equal(x.eligible,true);
 assert.equal(x.line,277.5);
 assert.equal(x.platformClaim,"prizepicks");
 assert.equal(x.originalPlatformAuthenticated,false);
 assert.equal(x.selectedSide,null);
 assert.equal(x.payoutTerms,null);
 assert.equal(x.finalSettlement,null);
 assert.equal(x.precommittedPick,false);
});
test("reject postgame Git commits, missing player identity and future source fetch",()=>{
 assert.equal(checkQuote(quote,snapshot,"2026-11-08T16:00:00Z").eligible,false);
 assert.equal(checkQuote({...quote,playerId:null},snapshot,when).eligible,false);
 assert.equal(checkQuote({...quote,providerFetchedAt:"2026-11-08T13:00:00Z"},snapshot,when).eligible,false);
 assert.equal(checkQuote({...quote,oddsType:"unknown"},snapshot,when).eligible,false);
});
test("only aggregate market counts and SHA are archived, not player details",()=>{
 const x=summarize(snapshot,sha,when);
 assert.equal(x.qualifiedPregameMirrorRows,1);
 assert.equal(x.tiers.standard,1);
 assert.equal(x.originPlatformVerified,false);
 assert.equal(JSON.stringify(x).includes("Player A"),false);
 assert.equal(x.originalModelSideFrozen,false);
});
test("network test fixture consumes only pinned commit, no guessed selection or settlement",async()=>{
 const commit={sha,commit:{committer:{date:when}}};
 const fake=async uri=>({ok:true,json:async()=>String(uri).includes("/commits?")?[commit]:snapshot});
 const x=await run({fetcher:fake,limit:1});
 assert.equal(x.historicalCommitSnapshotsRead,1);
 assert.equal(x.totalPregameQuoteRowsInSample,1);
 assert.equal(x.validProspectiveWinningBetEvidence,false);
 assert.equal(x.exactOfferedLineMarketSideExists,false);
});
