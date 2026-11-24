"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {auditSnapshot}=require("../scripts/audit-nhl-distribution-git-proof.cjs");
const sourceAt="2026-11-03T02:24:03Z",
 sourceObs="2026-11-03T02:23:50Z",captured="2026-11-03T02:24:00Z",
 start="2026-11-04T01:00:00Z",commit="2026-11-03T02:24:05Z",sha="a".repeat(40);
const original={kind:"nhl_live_distribution_shadow_unconfirmed_git_archive",generatedAt:sourceAt,
 rows:[{gameId:2026020200,playerId:55,market:"shotsOnGoal",line:2.5,tier:"Standard",
  selectedSide:"Higher",eventStartsAt:start,asOf:sourceAt,sourceObservedAt:sourceObs,
  sourceCapturedAt:captured,originalHigher:.62,shadowHigher:.57}]};
const schedule={season:"2026-27",complete:true,games:[{
 id:2026020200,startTimeUTC:start,home:"BOS",away:"NYR"}]};
const config={gitCommitAt:commit,gitCommitSha:sha,pathInRepo:"outputs/projections/distribution-snapshots/test.json",
 gitCommitsTouchingFile:1,schedule};
test("strict official schedule and historical Git commit allow research-only pregame archive",()=>{
 const x=auditSnapshot(original,config);
 assert.equal(x.counts.proofRows,1);
 assert.equal(x.counts.rejectedRows,0);
 assert.equal(x.prospectiveStatForecastArchiveCandidates,1);
 assert.equal(x.details[0].eligibleForFutureOfficialNhlStatGrading,true);
 assert.equal(x.details[0].gitCommitBeforeGame,true);
 assert.equal(x.details[0].officialResult,null);
 assert.equal(x.authenticatedOriginalPrizePicksOfferAndSettlement,false);
 assert.equal(x.independentGitServerPushTimeVerified,false);
});
test("after-start Git commit cannot be considered pregame even with source capture before start",()=>{
 const x=auditSnapshot(original,{...config,gitCommitAt:"2026-11-04T01:05:00Z"});
 assert.equal(x.counts.proofRows,0);
 assert.equal(x.counts.gitCommittedAfterStart,1);
});
test("invalid source observations and changes after original commit are quarantined",()=>{
 const b=structuredClone(original);b.rows[0].sourceObservedAt="2026-11-03T02:24:10Z";
 assert.equal(auditSnapshot(b,config).counts.badSourceTimestamp,1);
 const c=auditSnapshot(original,{...config,gitCommitsTouchingFile:2});
 assert.equal(c.counts.modifiedAfterFirstCommit,1);
 assert.equal(c.prospectiveStatForecastArchiveCandidates,0);
});
test("unverified and duplicate game ID schedule cannot be invented as official proof",()=>{
 const no=auditSnapshot(original,{...config,schedule:{...schedule,games:[]}});
 assert.equal(no.counts.missingOfficialGame,1);
 const wrong=auditSnapshot(original,{...config,schedule:{...schedule,games:[{...schedule.games[0],startTimeUTC:"2026-11-04T03:00:00Z"}]}});
 assert.equal(wrong.counts.officialStartConflict,1);
 const duplicate=structuredClone(original);duplicate.rows.push({...original.rows[0]});
 const d=auditSnapshot(duplicate,config);
 assert.equal(d.counts.proofRows,1);
 assert.equal(d.counts.duplicateOffer,1);
});
test("absence of actual official schedule or git commit proof causes fail closed error",()=>{
 assert.throws(()=>auditSnapshot(original,{...config,gitCommitSha:"bad"}),/Missing/);
 assert.throws(()=>auditSnapshot(original,{...config,schedule:{games:[]}}),/Missing/);
});
