"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {replay,forward}=require("../src/nhl-dual-real-line-hit-rates-v1.cjs");
const prior="2026-11-16T14:00:00Z",first="2026-11-16T14:00:15Z",
 start="2026-11-17T02:00:00Z",captured="2026-11-16T13:58:00Z",
 policyAt="2026-11-21T00:00:00Z";
const markets=["shotsOnGoal","points","assists","blockedShots"];
function fixture(){
 const ps=markets.map((market,i)=>({tier:"Standard",market,
  playerId:8470001+i,gameId:2026020110+i,team:"TOR",opponent:"MTL",
  capturedAt:captured,gameStartAt:start,line:market==="shotsOnGoal"?2.5:.5,
  lean:"Higher",probability:.72}));
 const s={source:"partner-api.prizepicks.com",generatedAt:prior,
  rankedProps:ps.map(p=>({...p,probabilities:{higher:.72,lower:.28,push:0}})),
  individualPropSelections:ps};
 const history={players:{}};
 for(let j=0;j<ps.length;j++){
  const p=ps[j];
  const games=Array.from({length:15},(_,i)=>({
   playerId:p.playerId,gameId:2026020010+i,
   gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
   gameState:"FINAL",type:"skater",team:"TOR",
   timeOnIceSeconds:950,powerPlayTimeOnIceSeconds:140,
   shotsOnGoal:i%3+1,points:1+(i%2),assists:i%2,
   blockedShots:i%3,goals:1
  }));
  games.push({playerId:p.playerId,gameId:p.gameId,gameDate:"2026-11-16",
   gameState:"FINAL",type:"skater",team:"TOR",timeOnIceSeconds:980,
   shotsOnGoal:j===0?4:1,points:2,assists:1,blockedShots:0});
  history.players[String(p.playerId)]={games};
 }
 return {ps,s,history,f:{snapshot:s,firstGitCommittedAt:first,gitHistoryCount:1}};
}
test("replay uses only original exact first-Git lines; reports all markets and both baselines",()=>{
 const {f,history}=fixture(),r=replay([f],history,{policyAt});
 a.equal(r.originalEligible,4);
 a.equal(r.all.original.selections,4);
 a.equal(r.all.original.wins,3);
 a.equal(r.all.original.losses,1);
 a.equal(r.all.exactSameLinePaired.selections,4);
 a.equal(r.all.exactSameLinePaired.newModel.wins+
  r.all.exactSameLinePaired.newModel.losses,4);
 a.equal(r.all.exactSameLinePaired.originalOnTheseLines.wins,3);
 a.equal(r.all.exactSameLinePaired.alwaysHigher,.75);
 a.equal(r.all.exactSameLinePaired.alwaysLower,.25);
 a.deepEqual(Object.keys(r.byMarket).sort(),[...markets].sort());
 a.equal(r.historicalOfficialGamesOnlyPriorDates,true);
 a.equal(r.historicalStatFeedAsOfOriginalCaptureIndependentlyVerified,false);
 a.equal(r.prospectiveResultsNotMerged,true);
 a.equal(r.modelPromoted,false);
});
test("replay never uses altered / late original props or repeats from a second frame",()=>{
 const {f,history}=fixture();
 const late=structuredClone(f);late.firstGitCommittedAt=
   "2026-11-17T01:59:00Z";
 a.equal(replay([late],history,{policyAt}).all.original.selections,0);
 const tampered=structuredClone(f);tampered.snapshot.rankedProps[0].line=99.5;
 a.equal(replay([tampered],history,{policyAt}).all.original.selections,3);
 const r=replay([f,f],history,{policyAt});
 a.equal(r.all.original.selections,4);
 a.equal(r.excluded.repeatedLines,4);
 const post=structuredClone(f);
 post.snapshot.generatedAt="2026-11-22T14:00:00Z";
 a.equal(replay([post],history,{policyAt}).all.original.selections,0);
});
test("prospective report never substitutes a retrospective calculation for frozen predictions",()=>{
 const score={kind:"nhl_eight_accuracy_first_git_future_scorecard_v1",
  originals:4,acceptedFrames:1,officialDecided:2,policyAt,
  overall:{originals:4,unsupported:1,pending:1,
   selectedResearch:1,
   models:{
    opponentAdjusted:{decided:2,hits:1,directionalHitRate:.5,
     alwaysHigherSameLines:.5,alwaysLowerSameLines:.5},
    originalChampion:{decided:2,hits:2,directionalHitRate:1,
     alwaysHigherSameLines:.5,alwaysLowerSameLines:.5}
   },
   strictSameLinePair:{
    newModel:{decided:2,hits:1,directionalHitRate:.5,
     alwaysHigherSameLines:.5,alwaysLowerSameLines:.5},
    originalFrozenSide:{decided:2,hits:2,directionalHitRate:1}
   },
   selectedModel:{decided:1,hits:1,directionalHitRate:1,
    alwaysHigherSameLines:1,alwaysLowerSameLines:0},
   sourceCoverage:{historicalPowerPlayMinutes:2}},
  byMarket:{shotsOnGoal:{originals:4,unsupported:1,pending:1,
   selectedResearch:1,models:{
    opponentAdjusted:{decided:2,hits:1,directionalHitRate:.5,
     alwaysHigherSameLines:.5,alwaysLowerSameLines:.5},
    originalChampion:{decided:2,hits:2,directionalHitRate:1,
     alwaysHigherSameLines:.5,alwaysLowerSameLines:.5}},
   strictSameLinePair:{newModel:{decided:2,hits:1,directionalHitRate:.5,
    alwaysHigherSameLines:.5,alwaysLowerSameLines:.5},
    originalFrozenSide:{decided:2,hits:2,directionalHitRate:1}},
   selectedModel:{decided:1,hits:1,directionalHitRate:1,
    alwaysHigherSameLines:1,alwaysLowerSameLines:0}}}};
 const result=forward(score,{generatedAt:"2026-11-21T03:00:00Z"});
 a.equal(result.originals,4);
 a.equal(result.all.newModel.wins,1);
 a.equal(result.all.newModel.losses,1);
 a.equal(result.all.exactSameLinePaired.originalOnTheseLines.wins,2);
 a.equal(result.all.exploratorySelected.decided,1);
 a.equal(result.all.exploratorySelected.losses,0);
 a.equal(result.calibrated,false);
 a.equal(result.noRetrospectiveReconstructionInThisCohort,true);
 a.throws(()=>forward({kind:"fake_result"}),/authenticated prospective/);
});
test("replay shows null hit rates for ungraded future games, never zero or 100 percent",()=>{
 const {f,history}=fixture();
 for(const p of Object.values(history.players))p.games=p.games.slice(0,-1);
 const r=replay([f],history,{policyAt});
 a.equal(r.all.original.selections,0);
 a.equal(r.all.original.hitRate,null);
 a.equal(r.all.exactSameLinePaired.newModel.hitRate,null);
 a.equal(r.all.officialPendingOrPush,4);
});
