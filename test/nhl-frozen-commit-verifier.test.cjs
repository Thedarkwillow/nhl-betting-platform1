"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {verifyFrozenCommit}=require("../src/nhl-frozen-commit-verifier.cjs");
const {POLICY,selectIndividualProps}=require("../src/nhl-frozen-individual-props.cjs");
const start="2026-11-05T00:30:00Z",captured="2026-11-04T17:24:00Z";
const game={id:2026020247,home:"BUF",away:"OTT",startTimeUTC:start};
const p={player:"Example",gameId:game.id,gameStartAt:start,playerId:111,
 team:"BUF",opponent:"OTT",market:"shotsOnGoal",line:2.5,tier:"Standard",model:"weighted-form-v1",
 lean:"Higher",probability:.7,probabilities:{higher:.7,lower:.3,push:0},
 capturedAt:captured,eventStartsAt:start};
const prefs=selectIndividualProps([p]);
const research={generatedAt:"2026-11-04T17:25:00Z",
 individualPropSelectionPolicy:POLICY,individualPropSelections:prefs.selected,
 rankedProps:[p]};
const options={research,snapshot:research,gitCommittedAt:"2026-11-04T17:26:00Z",gitHistoryCount:1,
 officialGames:[game]};
test("one original Git commit before official NHL start establishes explicit pregame selection proof",()=>{
 const r=verifyFrozenCommit(options);
 assert.equal(r.verified,true);
 assert.equal(r.eligible,1);
 assert.equal(r.firstCommittedBeforeEveryPuckDrop,true);
 assert.equal(r.originalPlatformOfferAuthenticated,false);
 assert.equal(r.prospectiveOutcomesGraded,0);
});
test("after-puckdrop Git commit never proves prospective selected direction",()=>{
 const r=verifyFrozenCommit({...options,gitCommittedAt:"2026-11-05T00:31:00Z"});
 assert.equal(r.verified,false);
 assert.equal(r.eligible,0);
});
test("immutable original file may never be edited and remain valid",()=>{
 assert.equal(verifyFrozenCommit({...options,gitHistoryCount:2}).verified,false);
 const mutated={...research,individualPropSelections:[{...prefs.selected[0],lean:"Lower"}]};
 assert.equal(verifyFrozenCommit({...options,snapshot:mutated}).verified,false);
});
test("missing explicit rule or conflicting official matchup cannot produce certified prospective claim",()=>{
 assert.equal(verifyFrozenCommit({...options,research:{...research,
  individualPropSelectionPolicy:null}}).verified,false);
 assert.equal(verifyFrozenCommit({...options,officialGames:[{...game,away:"FLA"}]}).verified,false);
});

test("retired one-shot cannot bill; current freeze verifier enforces original Git snapshots",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const retired=fs.readFileSync(path.join(__dirname,
  "../.github/workflows/one-shot-nhl-prospective-freeze-20261103.yml"),"utf8");
 const current=fs.readFileSync(path.join(__dirname,
  "../scripts/verify-nhl-frozen-pregame-commit.cjs"),"utf8");
 assert.match(retired,/Retired/);
 assert.doesNotMatch(retired,/schedule:|secrets\.|trial-free-prizepicks-nhl/);
 assert.match(current,/outputs\/research\/snapshots/);
 assert.match(current,/--diff-filter=A/);
 assert.match(current,/gitHistoryCount:historyCount/);
 assert.match(current,/if\(!proof\.verified\)/);
});
