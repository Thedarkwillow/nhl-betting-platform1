"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const quality=require("../src/nhl-standard-quality-challenger-v2.cjs");
const inputAB=require("../src/nhl-standard-input-frozen-ab-v1.cjs");
const lab=require("../src/nhl-eight-accuracy-research-v1.cjs");
const audit=require("../src/nhl-eight-accuracy-forward-audit-v1.cjs").audit;
const time="2026-11-21T02:00:00Z",commit="2026-11-21T02:00:35Z",
 start="2026-11-22T02:00:00Z",captured="2026-11-21T01:55:00Z";
function dataset(){
 const ps=["shotsOnGoal","assists","points","blockedShots"].map((market,i)=>({
  market,playerId:8484001+i,gameId:2026020650+i,
  tier:"Standard",lean:"Higher",line:market==="shotsOnGoal"?2.5:.5,
  team:"TOR",opponent:"MTL",capturedAt:captured,gameStartAt:start,
  probability:.8}));
 const nonhalf={...ps[0],playerId:8489999,gameId:2026020725,line:2,probability:.4};
 ps.push(nonhalf);
 const snapshots={generatedAt:time,individualPropSelections:ps,
  rankedProps:ps.map(p=>({...p,probabilities:p.line%1===0?
   {higher:.4,lower:.4,push:.2}:{higher:.8,lower:.2,push:0}}))};
 const adapt=()=>({kind:"adaptive",generatedAt:time,modelPromoted:false,
  rows:ps.map(p=>({...p,originalSide:p.lean,priorGames:24,
   opponentGames:16,trainingGames:150,trainingDates:25,
   opponentHistoryUsed:true,expectedIceSeconds:850,priorComponentVerified:true,
   predictions:{learned:.74,fixed:.75},
   pointsSourceEvidence:{projectedPP:"pp1",linemateCount:2}}))});
 const pos={kind:"pos",generatedAt:time,modelPromoted:false,
  rows:ps.map(p=>({...p,side:p.lean,position:"C",
   defenseFactor:1.03,offenseFactor:1.07,defense:{last10:{games:10}},
   probabilities:{usage:{higher:.6},offenseDefense:{higher:.72}}}))};
 snapshots.standardAdaptiveResearchV2=adapt();
 snapshots.positionRateMatchupV2=pos;
 snapshots.standardQualityShadowV2=quality.freeze(snapshots);
 snapshots.standardQualityInputABV1=inputAB.freeze(snapshots,{
  currentAdaptive:adapt(),currentPosition:pos,
  inputSource:{available:true,seasons:["2025-26","2026-27"]}});
 const history={players:{}};
 for(const p of ps){
  const games=Array.from({length:12},(_,i)=>{
   const date="2026-10-"+String(i+1).padStart(2,"0");
   return {playerId:p.playerId,gameId:2026020100+i,
    gameDate:date,team:"TOR",type:"skater",gameState:"FINAL",
    timeOnIceSeconds:900+i*10,powerPlayTimeOnIceSeconds:100+i,
    shotsOnGoal:i%3+1,assists:i%2,points:1+i%2,
    blockedShots:i%3,goals:1};
  });
  games.push({playerId:p.playerId,gameId:p.gameId,gameDate:"2026-11-21",
   team:"TOR",type:"skater",gameState:"FINAL",timeOnIceSeconds:950,
   shotsOnGoal:4,assists:1,points:2,blockedShots:1});
  history.players[String(p.playerId)]={games};
 }
 return {ps,s:snapshots,history};
}
test("situation exposure is past-only and never invents unavailable PK or EV minutes",()=>{
 const {ps,history}=dataset();
 const rows=lab.historyBefore(history,ps[0],time),f=lab.ice(rows);
 a.equal(rows.length,12);
 a.equal(f.ppVerifiedHistory,true);
 a.equal(f.pkVerifiedHistory,false);
 a.equal(f.evVerifiedHistory,false);
 a.equal(f.ppSeconds>0,true);
 a.equal(f.totalSeconds>f.ppSeconds,true);
 a.equal(rows.every(g=>g.gameDate<"2026-11-20"),true);
});
test("all eight hypotheses use immutable originals; missing sources abstain, not bet",()=>{
 const {ps,s,history}=dataset();const v=lab.freeze(s,{history});
 s.eightAccuracyResearchV1=v;
 a.equal(v.registered,5);
 a.equal(v.modelPromoted,false);
 a.equal(v.bettingEligible,false);
 a.equal(v.rows.filter(r=>r.status==="research_only_conditional_on_appearance").length,4);
 const bad=v.rows.find(r=>r.playerId===8489999);
 a.equal(bad.status,"unsupported_nonbinary_source_line");
 const shots=v.rows.find(r=>r.market==="shotsOnGoal"&&r.line===2.5);
 a.equal(shots.shotConversion.status,"no_git_verified_pregame_moneypuck_source");
 a.equal(shots.iceTime.ppVerifiedHistory,true);
 a.equal(shots.iceTime.pkVerifiedHistory,false);
 a.equal(shots.evidence.recording.trackingChangeCorrectionVerified,false);
 a.equal(shots.models.shotAttemptConversion,undefined);
 const assists=v.rows.find(r=>r.market==="assists");
 a.equal(assists.evidence.assists.individualPPAssistHistoryVerified,false);
 a.equal(assists.researchAbstention!=="shadow_candidate_only"||
  assists.candidateResearchOnly===true,true);
 const blocks=v.rows.find(r=>r.market==="blockedShots");
 a.equal(blocks.evidence.blocks.opponentShotAttemptsVerified,false);
 a.equal(blocks.evidence.blocks.rinkSpecificRecordingVerified,false);
});
test("first-git official outcomes grade the full source population but exclude unsupported source lines",()=>{
 const {s,history}=dataset();
 s.eightAccuracyResearchV1=lab.freeze(s,{history});
 const f={snapshot:s,firstGitCommittedAt:commit,gitHistoryCount:1};
 const r=audit([f],history,"2026-11-21T00:30:00Z","2026-11-21T01:00:00Z");
 a.equal(r.acceptedFrames,1);a.equal(r.originals,5);
 a.equal(r.overall.unsupported,1);
 a.equal(r.officialDecided,4);
 a.equal(r.byMarket.shotsOnGoal.models.opponentAdjusted.decided,1);
 a.equal(r.overall.models.originalChampion.decided,4);
 a.equal(r.benefitsToHitRateVerified,false);
 a.equal(r.calibrationApproved,false);
 a.equal(r.modelPromoted,false);
});
test("postgame freeze, duplicate and source tampering are never admissible",()=>{
 const {s,history}=dataset();
 s.eightAccuracyResearchV1=lab.freeze(s,{history});
 const f={snapshot:s,firstGitCommittedAt:commit,gitHistoryCount:1};
 const read=frames=>audit(frames,history,"2026-11-21T00:30:00Z",
  "2026-11-21T01:00:00Z");
 a.equal(read([{...f,firstGitCommittedAt:"2026-11-23T00:00:00Z"}]).acceptedFrames,0);
 a.equal(read([{...f,gitHistoryCount:2}]).acceptedFrames,0);
 a.equal(read([f,f]).originals,5);
 const tampered=structuredClone(f);
 tampered.snapshot.eightAccuracyResearchV1.rows[0].line=99.5;
 a.equal(read([tampered]).invalidLabFrames,1);
});
