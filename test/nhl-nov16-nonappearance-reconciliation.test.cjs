"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {resolve}=require("../scripts/reconcile-nhl-nov16-dnp.cjs");
const {audit}=require("../scripts/audit-nhl-nov16-pending-appearances.cjs");
test("Nov16 final-only original selections classify four nonparticipants, never four losses or wins",()=>{
 const a=resolve(audit());
 assert.equal(a.researchDnpEligible,4);
 assert.equal(a.unexplainedStatisticalPending,0);
 assert.equal(a.platformDnpSettlementsVerified,0);
 assert.equal(a.gradingResultsChanged,false);
 assert.deepEqual(a.rows.map(x=>x.market),["shotsOnGoal","shotsOnGoal","shotsOnGoal","points"]);
 assert.ok(a.rows.every(x=>x.officialPlayerStat===null));
});
test("playing/skewed player identity cannot be tagged DNP",()=>{
 const x=audit();x.findings[0].officialGameRowFound=true;
 assert.throws(()=>resolve(x),/Nonappearance/);
 const y=audit();y.findings[0].playerId=999;
 assert.throws(()=>resolve(y),/Absent authenticated/);
});
