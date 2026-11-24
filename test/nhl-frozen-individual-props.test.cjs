"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {POLICY,selectIndividualProps,gradeIndividualPreferences}=require("../src/nhl-frozen-individual-props.cjs");
const start="2026-11-03T00:00:00Z",at="2026-11-02T20:00:00Z";
const games=[{id:2026020232,home:"BOS",away:"VGK",startTimeUTC:start}];
const h={players:{"111":{games:[{gameId:games[0].id,playerId:111,gameDate:"2026-11-02",shotsOnGoal:4}]},
 "222":{games:[{gameId:games[0].id,playerId:222,gameDate:"2026-11-02",goals:1}]}}};
const skater={playerId:111,gameId:games[0].id,gameStartAt:start,
 team:"BOS",opponent:"VGK",market:"shotsOnGoal",line:2.5,tier:"Standard",
 model:"weighted-form-v1",lean:"Higher",probability:.72,
 probabilities:{higher:.72,lower:.28,push:0},
 capturedAt:"2026-11-02T19:59:59Z",eventStartsAt:start};
const skaterLower={...skater,lean:"Lower",probability:.28};
const demon={...skater,playerId:222,market:"goals",line:1.5,tier:"Demon",
 probability:.19,probabilities:{higher:.19,lower:.81}};
const goblin={...demon,tier:"Goblin",line:.5,probability:.63,
 probabilities:{higher:.63,lower:.37}};
const snap={generatedAt:at,rankedProps:[skater,skaterLower,demon,goblin],lineups:{}};
const frame={snapshot:snap,firstCommittedAt:"2026-11-02T20:01:00Z",
 gitHistoryCount:1,path:"prestart.json"};
test("individual preferred props do not require any lineup",()=>{
 const result=selectIndividualProps(snap.rankedProps);
 assert.equal(result.selected.length,2);
 assert.equal(result.selected[0].lean,"Higher");
 assert.equal(result.selected.find(x=>x.tier==="Standard").probability,.72);
 assert.equal(result.selected.find(x=>x.tier==="Goblin").probability,.63);
 assert.equal(result.abstained.no_offered_side_with_model_probability_over_half,1);
 assert.equal(result.optimizerLineupMembershipNotRequired,true);
});
test("legacy pregame model preferences are retrospectively reconstructed, not precommitted hit rate",()=>{
 const r=gradeIndividualPreferences([frame],games,h);
 assert.equal(r.legacyRetrospective.decided,2);
 assert.equal(r.legacyRetrospective.correct,2);
 assert.equal(r.legacyRetrospective.hitRate,1);
 assert.equal(r.legacyRetrospective.distinctGradedGames,1);
 assert.equal(r.legacyRetrospective.distinctGradedDates,1);
 assert.equal(r.explicitProspective.hitRate,null);
 assert.equal(r.postgamePolicySelectionForbidden,true);
});
test("new snapshot explicit individually selected props are prospective and lineage-matched",()=>{
 const fresh=selectIndividualProps(snap.rankedProps);
 const explicit={...frame,snapshot:{...snap,individualPropSelectionPolicy:POLICY,
  individualPropSelections:fresh.selected}};
 const r=gradeIndividualPreferences([explicit],games,h);
 assert.equal(r.explicitProspective.decided,2);
 assert.equal(r.legacyRetrospective.decided,0);
 assert.equal(r.explicitProspective.correct,2);
});
test("changing stored original selection, missing pregame Git evidence, or official game mismatch fails closed",()=>{
 const fresh=selectIndividualProps(snap.rankedProps);
 const altered={...frame,snapshot:{...snap,individualPropSelectionPolicy:POLICY,
  individualPropSelections:fresh.selected.map((x,i)=>i===0?{...x,lean:"Lower"}:x)}};
 const wrong=gradeIndividualPreferences([altered],games,h);
 assert.equal(wrong.explicitProspective.decided,0);
 assert.equal(wrong.inconsistentExplicitSelections>0,true);
 const late=gradeIndividualPreferences([{...frame,firstCommittedAt:"2026-11-03T00:10:00Z"}],games,h);
 assert.equal(late.legacyRetrospective.decided,0);
 const rewritten=gradeIndividualPreferences([{...frame,gitHistoryCount:2}],games,h);
 assert.equal(rewritten.legacyRetrospective.decided,0);
 const different=gradeIndividualPreferences([frame],
  [{...games[0],away:"TOR"}],h);
 assert.equal(different.legacyRetrospective.decided,0);
});
test("repeated pregame snapshots do not double count individual props and later flips cannot replace the first",()=>{
 const old=selectIndividualProps(snap.rankedProps);
 const different={...skater,probability:.25,probabilities:{higher:.25,lower:.75}};
 const lower={...different,lean:"Lower",probability:.75};
 const nextSnap={generatedAt:"2026-11-02T21:00:00Z",
  rankedProps:[different,lower,demon,goblin]};
 const later={snapshot:nextSnap,firstCommittedAt:"2026-11-02T21:01:00Z",
  gitHistoryCount:1,path:"later.json"};
 const r=gradeIndividualPreferences([later,frame],games,h);
 assert.equal(r.legacyRetrospective.uniqueSelections,2);
 assert.equal(r.changedLaterPreferences,1);
 assert.equal(r.legacyRetrospective.correct,2);
 assert.equal(old.selectedUniqueProps,2);
});
test("source watchlist and conflicting probability vectors are excluded",()=>{
 const ineligible={...skater,researchEligibility:"watchlist"};
 const r=selectIndividualProps([ineligible,skaterLower]);
 assert.equal(r.selected.length,0);
 const conflicting=selectIndividualProps([skater,{...skaterLower,probabilities:{higher:.8,lower:.2},probability:.2}]);
 assert.equal(conflicting.selected.length,0);
 assert.equal(conflicting.abstained.conflicting_original_offer_rows,1);
});
