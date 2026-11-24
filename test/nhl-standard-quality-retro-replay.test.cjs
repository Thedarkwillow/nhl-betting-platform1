"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {replay,KIND}=require("../src/nhl-standard-quality-retro-replay.cjs");
const CREATED="2026-11-20T05:00:00Z",GIT="2026-11-20T05:00:20Z",
 START="2026-11-20T20:00:00Z",CAPTURE="2026-11-20T04:58:00Z";
const makeP=(id,market="assists")=>({
 gameId:2026020430+id,playerId:8482000+id,team:"PIT",opponent:"OTT",
 market,tier:"Standard",lean:"Higher",line:.5,probability:.72,
 gameStartAt:START,capturedAt:CAPTURE
});
const prior=p=>({...p,originalSide:"Higher",priorGames:26,opponentGames:14,
 trainingGames:140,trainingDates:35,expectedIceSeconds:1040,
 opponentHistoryUsed:true,priorComponentVerified:true,
 predictions:{learned:.78,fixed:.76},pointsSourceEvidence:{projectedPP:"pp1",
 linemateCount:2}});
const pos=p=>({...p,side:"Higher",position:"F",
 defense:{last10:{games:10}},defenseFactor:1.05,offenseFactor:1.03,
 probabilities:{offenseDefense:{higher:.74}}});
const snap=(props,{missing=false}={})=>({
 generatedAt:CREATED,
 rankedProps:props.map(p=>({...p,probabilities:{higher:.72,lower:.28}})),
 individualPropSelections:props,
 ...(missing?{}:{standardAdaptiveResearchV2:{rows:props.map(prior)},
 positionRateMatchupV2:{rows:props.map(pos)}})
});
const frame=(snapshot)=>({snapshot,firstCommittedAt:GIT,gitHistoryCount:1});
const official=(p,count)=>({gameId:p.gameId,playerId:p.playerId,
 type:"skater",timeOnIceSeconds:1000,gameState:"FINAL",[p.market]:count});
test("Nov20 strict quality rule CAN replay with frozen source vectors, never prospective proof",()=>{
 const keep=makeP(1),skip=makeP(2);
 const s=snap([keep,skip]);s.standardAdaptiveResearchV2.rows[1].priorGames=8;
 const h={players:{[String(keep.playerId)]:{games:[official(keep,1)]},
  [String(skip.playerId)]:{games:[official(skip,0)]}}};
 const r=replay([frame(s)],h);
 a.equal(r.kind,KIND);
 a.equal(r.all.registered,2);a.equal(r.all.decided,2);
 a.equal(r.selected.registered,1);a.equal(r.selected.correct,1);
 a.equal(r.skipped.registered,1);a.equal(r.skipped.correct,0);
 a.equal(r.selected.hitRate,1);
 a.equal(r.observedSelectedMinusSkipped,1);
 a.equal(r.abstentionReasons.insufficient_prior_usage_ice_time_or_opponent_sample,1);
 a.equal(r.asOfEvidenceGapCounts.priorGameSampleBelowPolicy,1);
 a.equal(r.asOfEvidenceGapCounts.trainingGamesBelow30||0,0);
 a.equal(r.newQualityPolicyAppliedToOldDataPosthoc,true);
 a.equal(r.independentlyValidatedImprovement,false);
 a.equal(r.bettingRecommendationsApproved,false);
});
test("Original pregame feature vectors not reconstructed from future history",()=>{
 const p=makeP(1),r=replay([frame(snap([p],{missing:true}))],{players:{}});
 a.equal(r.all.registered,0);
 a.equal(r.exclusions.original_pregame_feature_vectors_absent,1);
 a.equal(r.originalFramesWithBothFeatureVectors,0);
});
test("Missing appearance pending, duplicate threshold not counted twice, policy dates blocked",()=>{
 const p=makeP(1),f=frame(snap([p]));
 const x=replay([f,f],{players:{}});
 a.equal(x.all.registered,1);a.equal(x.selected.pending,1);a.equal(x.selected.decided,0);
 a.equal(x.selected.hitRate,null);
 a.equal(replay([{...f,gitHistoryCount:2}],{players:{}}).all.registered,0);
 a.equal(replay([{...f,firstCommittedAt:"2026-11-21T00:00:01Z"}],{players:{}}).all.registered,0);
 a.equal(replay([frame({...snap([p]),generatedAt:"2026-11-21T02:00:00Z"})],{players:{}}).all.registered,0);
});
