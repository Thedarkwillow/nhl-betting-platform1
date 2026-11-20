"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const {build,toSummary}=require("./publish-accuracy-evidence-desk.cjs");
const {view}=require("../assets/accuracy-platform-evidence.js");
const summary=build();
assert.equal(summary.kind,"public_six_priority_accuracy_platform_evidence_desk_v1");
assert.equal(summary.dailyNhl.games,12);
assert.equal(summary.dailyNhl.all.correct,279);
assert.equal(summary.dailyNhl.all.incorrect,226);
assert.equal(summary.dailyNhl.all.decided,505);
assert.equal(summary.dailyNhl.originalPendingImmutable,4);
assert.equal(summary.dailyNhl.confirmedNoAppearance,4);
assert.equal(summary.dailyNhl.outstandingAppearanceReconciliation,0);
assert.equal(summary.dailyNfl.all.decided,269);
assert.equal(summary.dailyNfl.all.correct,145);
assert.equal(summary.dailyNfl.all.push,2);
assert.equal(summary.collection.slots["06:00"].complete,true);
assert.equal(summary.providerProof.authenticatedOriginalAppOffers,0);
assert.equal(summary.providerProof.authenticatedSpecificEntryPayouts,0);
assert.equal(summary.providerProof.authenticatedFinalSettlements,0);
assert.equal(summary.providerProof.authenticatedPayoutEV,null);
assert.equal(summary.uncalibratedPercentagesNotApproved,true);
assert.equal(summary.privatePlayerRowsExposed,0);
assert.equal(summary.automaticWagers,0);
assert.equal(toSummary({registered:3,decided:2,correct:1,incorrect:1,push:1,unresolvedPerSlate:0}).push,1);
const v=view(summary);
assert.equal(v.ready,true);
assert.equal(v.tiers.length,3);
assert.equal(v.standardMarkets.length,4);
assert.equal(v.nhlAll.rate,279/505);
assert.equal(v.nonappearances,4);
assert.equal(v.proof.payouts,0);
assert.equal(v.verifiedExpectedValue,null);
assert.equal(view({...summary,privatePlayerRowsExposed:1}).ready,false);
assert.equal(view({...summary,automaticWagers:1}).ready,false);
const html=fs.readFileSync(path.join(root,"index.html"),"utf8");
for(const key of ["accuracyEvidenceContent","refreshAccuracyEvidence",
 "./assets/accuracy-platform-evidence.js","./assets/accuracy-platform-evidence.css"]){
 assert.ok(html.includes(key),"Missing "+key);
}
const src=fs.readFileSync(path.join(root,"assets/accuracy-platform-evidence.js"),"utf8");
assert.ok(!src.includes("innerHTML"),"No untrusted HTML rendering");
console.log(JSON.stringify({status:"PASS",dailyNhl:summary.dailyNhl.all.decided,
 dailyNfl:summary.dailyNfl.all.decided,gradesVerified:true,privateRows:0,promoted:false}));
