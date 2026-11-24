"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {freeze,sourceOK}=require("../src/nhl-older-season-trained-shadow-v1.cjs");
const {audit}=require("../src/nhl-older-season-trained-forward-v1.cjs");
const srcAt="2026-11-21T01:30:00Z",
 snapAt="2026-11-21T02:00:00Z",firstGit="2026-11-21T02:00:30Z";
const gameStart="2026-11-23T02:00:00Z",
 capture="2026-11-21T01:58:00Z";
function fixture(){
 const p={gameId:2026020601,playerId:8481001,market:"shotsOnGoal",
  line:2.5,tier:"Standard",lean:"Higher",gameStartAt:gameStart,
  capturedAt:capture,team:"TOR",opponent:"MTL"};
 const source={...p,originalSide:p.lean,originalHigher:.81,
  marketSpecificHigher:.7,usageHigher:.77,poissonHigher:.8,
  shiftedHigher:.74,empiricalHigher:.75,hurdleHigher:.71,
  status:"research_only_conditional_on_official_appearance",
  bettingEligible:false,priorLastGameDate:"2026-11-19"};
 const s={generatedAt:snapAt,rankedProps:[{...p,probabilities:{higher:.81}}],
  individualPropSelections:[p],
  marketDirectionResearchV1:{generatedAt:snapAt,rows:[source]}};
 const markets=["shotsOnGoal","points","assists","blockedShots"];
 const report={kind:"nhl_older_season_locked_market_family_trial_v1",
  generatedAt:"2026-11-20T22:00:00Z",trainingSeason:"2024-25",
  evaluationSeason:"2025-26",evaluationNeverUsedForFamilySelection:true,
  flags:{noAutomatedPromotion:true,noHistoricalPrizePicksOrUnderdogQuotes:true},
  selectedFamilies:Object.fromEntries(markets.map(m=>[m,"poisson"])),
  checks:Object.fromEntries(markets.map(m=>[m,{sufficientTraining:true}]))};
 const history={players:{[p.playerId]:{games:[{
  gameId:p.gameId,playerId:p.playerId,gameDate:"2026-11-22",
  type:"skater",gameState:"FINAL",shotsOnGoal:4,timeOnIceSeconds:950}]}}};
 return {p,s,report,history};
}
test("only artifact already Git-archived before freeze can create train-chosen shadow",()=>{
 const {s,report,p}=fixture();
 a.equal(sourceOK(s,report,srcAt),true);
 const f=freeze(s,report,{sourceFirstGitAt:srcAt});
 a.equal(f.originalPopulation,1);
 a.equal(f.rows[0].higher,.8);
 a.equal(f.rows[0].direction,"Higher");
 a.equal(f.rows[0].sameSideAsOriginalOffer,true);
 a.equal(f.bettingEligible,false);
 a.equal(f.modelPromoted,false);
 a.throws(()=>freeze(s,report,{sourceFirstGitAt:"2026-11-21T03:00:00Z"}),
  /Not a committed/);
 const altered=structuredClone(report);altered.evaluationNeverUsedForFamilySelection=false;
 a.throws(()=>freeze(s,altered,{sourceFirstGitAt:srcAt}),/Not a committed/);
});
test("future-only audit grades exact-original-side, and refuses tampered predictions",()=>{
 const {s,report,history}=fixture();
 s.olderSeasonTrainedShadowV1=freeze(s,report,{sourceFirstGitAt:srcAt});
 const f={snapshot:s,firstCommittedAt:firstGit,gitHistoryCount:1},
  score=frames=>audit(frames,history,"2026-11-21T01:00:00Z");
 const r=score([f]);
 a.equal(r.acceptedFrames,1);
 a.equal(r.overall.trained.decided,1);
 a.equal(r.overall.trained.trainedWins,1);
 a.equal(r.overall.originalOfferedSide.decided,1);
 a.equal(r.modelPromoted,false);
 a.equal(score([f,f]).uniqueOriginalOffers,1);
 const corrupted=structuredClone(f);
 corrupted.snapshot.olderSeasonTrainedShadowV1.rows[0].higher=.999;
 a.equal(score([corrupted]).rejectedTamperedFrames,1);
 const after=structuredClone(f);after.firstCommittedAt="2026-11-23T03:00:00Z";
 a.equal(score([after]).acceptedFrames,0);
});
test("unavailable Poisson component never fakes a trained forecast",()=>{
 const {s,report}=fixture();
 delete s.marketDirectionResearchV1.rows[0].poissonHigher;
 const r=freeze(s,report,{sourceFirstGitAt:srcAt});
 a.equal(r.rows[0].direction,null);
 a.equal(r.rows[0].status,"shadow_abstain");
});
