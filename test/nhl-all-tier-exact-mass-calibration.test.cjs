"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {POLICY}=require("../src/nhl-frozen-individual-props.cjs");
const {shrink,freeze,grade}=require("../src/nhl-all-tier-exact-mass-calibration.cjs");
const now="2026-11-15T17:00:00Z",first="2026-11-15T17:01:00Z",policy="2026-11-14T20:00:00Z";
function snapshot(){
 const rows=["Standard","Goblin","Demon"].map((tier,i)=>({gameId:2026020400+i,playerId:50+i,market:"shotsOnGoal",line:2,tier,lean:"Higher",capturedAt:now,gameStartAt:"2026-11-15T22:00:00Z",probabilities:{higher:.7,lower:.1,push:.2}}));
 const s={generatedAt:now,individualPropSelectionPolicy:POLICY,rankedProps:rows,individualPropSelections:rows.map(x=>({...x}))};
 s.allTierExactMassCalibrationShadow=freeze(s);return s;
}
test("fixed exact-mass calibrator preserves pushes and direction across tiers",()=>{
 const p=shrink({higher:.7,lower:.1,push:.2});
 assert.ok(Math.abs(p.higher-.55)<1e-12);assert.equal(p.push,.2);
 assert.ok(Math.abs(p.higher+p.lower+p.push-1)<1e-12);
 assert.equal(shrink({higher:1,lower:1,push:0}),null);
 assert.equal(snapshot().allTierExactMassCalibrationShadow.rows.length,3);
});
test("grade only original future snapshots with official appearance; keep pushes separate",()=>{
 const s=snapshot(),f={snapshot:s,firstCommittedAt:first,gitHistoryCount:1};
 const history={players:Object.fromEntries(s.rankedProps.map((r,i)=>[r.playerId,{games:[{gameId:r.gameId,type:"skater",gameState:"OFF",timeOnIceSeconds:1000,shotsOnGoal:[3,2,1][i]}]}]))};
 const a=grade([f,f],history,policy);
 assert.equal(a.byTier.Standard.overall.resolved,1);
 assert.equal(a.byTier.Goblin.overall.pushes,1);
 assert.equal(a.byTier.Demon.overall.resolved,1);
 assert.equal(a.rejected,3);
 assert.equal(a.modelPromoted,false);
 assert.equal(grade([f],history,"2026-11-16T00:00:00Z").byTier.Standard.overall.registered,0);
 s.allTierExactMassCalibrationShadow.rows[0].candidate.higher=.99;
 assert.equal(grade([f],history,policy).byTier.Standard.overall.registered,0);
});

test("many correlated rows cannot satisfy the distinct-game or date evidence gate",()=>{
 const {summarize}=require("../src/nhl-all-tier-exact-mass-calibration.cjs");
 const original={higher:.9,lower:.1,push:0},candidate=shrink(original);
 const rows=Array.from({length:200},(_,i)=>({gameId:10+i%2,gameDate:"2026-11-15",side:"Higher",original,candidate,outcome:"lower"}));
 const report=summarize(rows);
 assert.equal(report.distinctGames,2);
 assert.equal(report.minimumEvidenceSizeReached,false);
 assert.equal(report.exploratoryCandidateSuperiority,false);
 assert.equal(report.gameClusterBrierDifference95,null);
});
