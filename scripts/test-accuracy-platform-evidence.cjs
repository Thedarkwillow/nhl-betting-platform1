"use strict";
const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.resolve(__dirname,"..");
const {build,toSummary}=require("./publish-accuracy-evidence-desk.cjs");
const {view}=require("../assets/accuracy-platform-evidence.js");
const summary=build();
assert.equal(summary.kind,"public_six_priority_accuracy_platform_evidence_desk_v1");
assert.ok(summary.dailyNhl.games>=1);
assert.equal(summary.dailyNhl.all.correct+summary.dailyNhl.all.incorrect,summary.dailyNhl.all.decided);
assert.equal(summary.dailyNhl.all.registered,
 summary.dailyNhl.all.decided+summary.dailyNhl.all.push+summary.dailyNhl.all.pending);
assert.equal(summary.dailyNhl.originalPendingImmutable,summary.dailyNhl.all.pending);
if(summary.dailyNhl.confirmedNoAppearance!==null)
 assert.ok(summary.dailyNhl.confirmedNoAppearance<=summary.dailyNhl.all.pending);
if(summary.dailyNfl.all){
 assert.equal(summary.dailyNfl.all.correct+summary.dailyNfl.all.incorrect,summary.dailyNfl.all.decided);
 assert.equal(summary.dailyNfl.all.registered,summary.dailyNfl.all.decided+
  summary.dailyNfl.all.push+summary.dailyNfl.all.pending);
}
for(const slot of ["06:00","09:00"])
 assert.equal(typeof summary.collection.slots[slot].complete,"boolean");
for(const field of ["authenticatedOriginalAppOffers","authenticatedSpecificEntryPayouts",
 "authenticatedFinalSettlements"]){
 assert.ok(Number.isInteger(summary.providerProof[field])&&summary.providerProof[field]>=0);
}
assert.equal(summary.providerProof.authenticatedPayoutEV,null);
assert.equal(summary.uncalibratedPercentagesNotApproved,true);
assert.equal(summary.privatePlayerRowsExposed,0);
assert.equal(summary.automaticWagers,0);
assert.equal(toSummary({registered:3,decided:2,correct:1,incorrect:1,push:1,unresolvedPerSlate:0}).push,1);
const v=view(summary);
assert.equal(v.ready,true);
assert.equal(v.tiers.length,3);
assert.equal(v.standardMarkets.length,4);
assert.equal(v.nhlAll.rate,summary.dailyNhl.all.rate);
assert.equal(v.nonappearances,summary.dailyNhl.confirmedNoAppearance);
// Unknown appearance reconciliation must remain unknown on the website,
// and never be displayed as a verified zero or an assumed completed grade.
const unknown=view({...summary,dailyNhl:{...summary.dailyNhl,
 confirmedNoAppearance:null,outstandingAppearanceReconciliation:null}});
assert.equal(unknown.ready,true);
assert.equal(unknown.nonappearances,null);
assert.equal(unknown.remaining,null);
const verifiedZero=view({...summary,dailyNhl:{...summary.dailyNhl,
 confirmedNoAppearance:0,outstandingAppearanceReconciliation:0}});
assert.equal(verifiedZero.remaining,0);
assert.equal(v.proof.payouts,summary.providerProof.authenticatedSpecificEntryPayouts);
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
 dailyNfl:summary.dailyNfl.all?.decided??0,gradesVerified:true,privateRows:0,promoted:false}));
