"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {training,fit,freeze,grade}=require("../src/nhl-goblin-past-only-calibration-v1.cjs");
const base={tier:"Goblin",selectedSide:"Higher",market:"shotsOnGoal",
 firstCaptureAt:"2026-11-01T10:00:00Z",firstResearchAt:"2026-11-01T10:01:00Z",
 firstGitCommittedAt:"2026-11-01T10:02:00Z",
 gameStartAt:"2026-11-01T20:00:00Z",estimatedProbability:.81};
const ledger=rows=>({kind:"private_immutable_source_linked_nhl_selected_predictions",records:rows});
const past=Array.from({length:120},(_,i)=>({...base,id:"p"+i,gameId:100+i%20,playerId:i+1,
 officialGameDate:"2026-11-"+String(1+i%10).padStart(2,"0"),
 officialResult:i%3===0?"Lower":"Higher",
 selectionStatus:i%3===0?"incorrect":"correct"}));
test("Goblin fit never pools Standard/Demon, nor future or same-day results",()=>{
 const future={...past[0],id:"future",gameId:1000,
   officialGameDate:"2026-11-20",gameStartAt:"2026-11-20T20:00:00Z"};
 const rows=[...past,{...past[0],id:"standard",tier:"Standard"},{...past[0],id:"demon",tier:"Demon"},future];
 assert.equal(training(ledger(rows),"2026-11-20T16:00:00Z").length,120);
 const f=fit(ledger(rows),"2026-11-20T16:00:00Z");
 assert.equal(f.byMarket.shotsOnGoal.trainingDecisions,120);
 assert.ok(Math.abs(f.byMarket.shotsOnGoal.offset)<=.35);
 assert.equal(f.modelPromoted,false);
});
test("Goblin holds out before training minimum; never publishes calibrated confidence",()=>{
 const s={generatedAt:"2026-11-20T16:00:00Z",individualPropSelections:[
  {gameId:9,playerId:4,market:"shotsOnGoal",tier:"Goblin",line:.5,lean:"Higher",
   probability:.8,capturedAt:"2026-11-20T15:58:00Z",gameStartAt:"2026-11-21T20:00:00Z"}]};
 const q=freeze(s,ledger(past));
 assert.equal(q.rows.length,1);assert.equal(q.rows[0].status,"frozen_experimental_adjustment");
 assert.equal(q.rows[0].calibrated,false);
 const frames=[{snapshot:{...s,goblinPastOnlyCalibrationV1:q},
   firstCommittedAt:"2026-11-20T16:02:00Z",gitHistoryCount:1}];
 const h={players:{"4":{games:[{gameId:9,gameState:"FINAL",shotsOnGoal:2,timeOnIceSeconds:700}]}}};
 const result=grade(frames,h,"2026-11-19T00:00:00Z");
 assert.equal(result.all.decided,1);
 assert.equal(result.all.minimumSampleMet,false);
 assert.equal(result.calibrationApproved,false);
});
