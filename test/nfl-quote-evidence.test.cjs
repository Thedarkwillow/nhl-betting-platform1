"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),path=require("node:path"),os=require("node:os");
const {audit}=require("../scripts/audit-nfl-quote-evidence.cjs");
test("no saved NFL original board means no invented betting hit rate",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nfl-quote-gate-"));
 try{
  const report=audit(dir);
  assert.equal(report.quoteFileCount,0);
  assert.equal(report.prizePicksHistoricalHitRate,null);
  assert.equal(report.underdogHistoricalHitRate,null);
  assert.equal(report.alwaysHigherAndAlwaysLowerMatchedLineBaseline,null);
  assert.equal(report.canReportVerifiedEdge,false);
  assert.equal(report.partnerObservationAudit.captureCount,0);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("independent source as-of NFL board is not promoted without frozen matched model",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nfl-quote-gate-"));
 try{
  const base=path.join(dir,"outputs/nfl/boards/2026-11-08");
  fs.mkdirSync(base,{recursive:true});
  fs.writeFileSync(path.join(base,"0600.json"),JSON.stringify({league:"NFL",offers:[{
   line:246.5,observedAt:"2026-11-08T14:00:00Z",
   startsAt:"2026-11-08T18:00:00Z",
   platformOfferAuthenticated:false,modelPredictionFrozenBeforeStart:true
  }]}));
  const report=audit(dir);
  assert.equal(report.quoteFileCount,1);
  assert.equal(report.files[0].partialOrUnauthenticated,1);
  assert.equal(report.rawEligibleProspectiveByPlatform.prizepicks,0);
  assert.equal(report.prizePicksHistoricalHitRate,null);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("partner API captures are counted as research observations but never as authenticated app offers",()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"nfl-partner-observation-"));
 try{
  const capture=path.join(dir,"outputs/manual-board-captures/2026-11-13/20261113T170522Z");
  fs.mkdirSync(capture,{recursive:true});
  const columns=["projectionId","providerPlayerId","player","team","position",
   "providerGameId","gameExternalId","eventStartsAt","opponent","market","line",
   "tier","offeredWagerTypes","boardTime","lineUpdatedAt","status","inGame",
   "isLive","eventType","period","groupKey","combo"];
  fs.writeFileSync(path.join(capture,"manifest.json"),JSON.stringify({
   kind:"actual_time_private_partner_offer_observations",
   source:"partner-api.prizepicks.com",sourceAuthenticatedFirstParty:false,
   originalSourceRawResponseStored:false,completePagination:true,
   captureSlotPacific:"09:00",captureFinishedUTC:"2026-11-13T17:05:22.666Z",
   columns,sports:[{sport:"NFL",rawCount:2,normalizedCount:2}]
  }));
  const row=(id,market,line)=>[id,"player-1","Player","NE","QB","game-1","game-1",
   "2026-11-15T14:30:00Z","NYJ",market,line,"standard","over",
   "2026-11-13T17:05:22Z",null,"pre_game",false,false,"team","Full","group-1",false];
  fs.writeFileSync(path.join(capture,"nfl-01.json"),JSON.stringify({
   rows:[row("offer-1","Passing Yards",250.5),row("offer-2","Passing Attempts",35.5)]
  }));
  const report=audit(dir),p=report.partnerObservationAudit;
  assert.equal(report.quoteFileCount,0);
  assert.equal(p.captureCount,1);
  assert.equal(p.completeCaptureCount,1);
  assert.equal(p.partnerObservedRows,2);
  assert.equal(p.uniqueOfferRowsWithinCaptures,2);
  assert.equal(p.distinctPlayersAcrossCaptures,1);
  assert.equal(p.distinctGamesAcrossCaptures,1);
  assert.equal(p.captureSlotsPacific["09:00"],1);
  assert.equal(p.firstPartyAuthenticatedCaptures,0);
  assert.equal(p.eligibleAuthenticatedPlatformOffers,0);
  assert.equal(report.rawEligibleProspectiveByPlatform.prizepicks,0);
  assert.equal(report.canReportVerifiedEdge,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
