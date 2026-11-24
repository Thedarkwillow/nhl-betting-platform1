"use strict";
const t=require("node:test"),a=require("node:assert/strict");
const g=require("../src/goblin-opportunity-evidence.cjs");
const now="2026-11-18T14:10:00Z",start="2026-11-19T23:00:00Z";
const date=i=>"2026-10-"+String(i+1).padStart(2,"0");
const p={tier:"Goblin",market:"shotsOnGoal",line:1.5,lean:"Higher",
 playerId:100,gameId:1234,capturedAt:"2026-11-18T14:05:30Z",gameStartAt:start,
 probabilities:{higher:.72,lower:.28,push:0}};
const h=Array.from({length:16},(_,i)=>({gameDate:date(i),type:"skater",
 gameState:"FINAL",position:"C",team:"AAA",timeOnIceSeconds:950,
 shotsOnGoal:i%4?2:0,blockedShots:i%2,points:i%3?1:0,
 assists:i%4?1:0}));
const opp={source:"prior_complete_official_games",games:12,ratio:1.2,
 knownAt:"2026-11-15T12:00:00Z",gameDate:"2026-11-14",leagueRatePer3600:2.2};
t("NHL Goblin shots, blocks, assists and points use only prior official opportunities",()=>{
 for(const market of ["shotsOnGoal","blockedShots","assists","points"]){
  const r=g.makeNHL({...p,market},h,{now,opponent:opp});
  a.equal(r.kind,"goblin_two_stage_nhl_first_git_shadow_v1",market);
  a.equal(r.tier,"Goblin");
  a.equal(r.priorGames,16);
  a.equal(r.bettingEligible,false);
  a.equal(r.probabilityCalibrated,false);
  a.equal(r.originalAppAvailabilityAuthenticated,false);
  a.ok(r.challengerHigher>=0&&r.challengerHigher<=1);
 }
});
t("NHL Goblin retains zero-shot appearances, never invents missing blocks",()=>{
 const r=g.makeNHL(p,h,{now,opponent:opp});
 a.equal(r.zeroGamesRetained,4);
 a.equal(g.makeNHL({...p,market:"blockedShots"},h,{now}).status,"abstain");
 a.equal(g.makeNHL(p,h.map((r,i)=>i===0?{...r,shotsOnGoal:null}:r),
  {now,opponent:opp}).status,"abstain");
});
t("wrong tiers, stale lines and source-side mismatches are not live picks",()=>{
 for(const bad of [{tier:"Standard"},{tier:"Demon"},
  {capturedAt:"2026-11-17T14:05:30Z"},
  {gameStartAt:"2026-11-18T14:20:00Z"},
  {probabilities:{higher:.9,lower:.6}},
  {lean:"UNKNOWN"}]){
  const r=g.makeNHL({...p,...bad},h,{now,opponent:opp});
  a.equal(r.status,"abstain");
  a.equal(r.bettingEligible,false);
 }
});
t("NFL yardage Goblins reject unverified availability and use prior opportunity when verified",()=>{
 const prior=Array.from({length:16},(_,i)=>({gameDate:date(i),
  gameState:"FINAL",team:"AAA",position:"WR",receiving_yards:38+i,
  targets:7+i%3,sourceAvailableAt:date(i)+"T21:00:00Z"}));
 const line={...p,market:"receiving_yards",line:24.5,
  gameId:"2026_11_AAA_BBB",playerId:"00-001",officialKickoffIdentityVerified:true,
  sourcePlayerIdMatchedOfficial:true};
 const opts={now,opponent:opp,injuryStatus:{verifiedPregame:true,
  active:true,knownAt:"2026-11-18T12:00:00Z"}};
 const s=g.makeNFL(line,prior,opts);
 a.equal(s.status,"shadow_candidate");
 a.equal(s.sport,"NFL");
 a.equal(s.priorGames,16);
 a.equal(s.originalAppAvailabilityAuthenticated,false);
 a.equal(g.makeNFL({...line,officialKickoffIdentityVerified:false},prior,opts)
  .reason,"nfl_official_game_and_player_identity_unverified");
 a.equal(g.makeNFL(line,prior,{now,opponent:opp}).reason,
  "player_availability_not_verified_pregame");
});
function frozen(o={}){
 return {kind:"goblin_two_stage_nhl_first_git_shadow_v1",sport:"NHL",
  gameId:1234,playerId:100,market:"shotsOnGoal",tier:"Goblin",
  line:1.5,originalSide:"Higher",internalChallengerSide:"Higher",
  originalHigher:.73,challengerHigher:.65,status:"shadow_candidate",
  sourceCapturedAt:"2026-11-18T14:05:30Z",
  sourceFirstGitAt:"2026-11-18T14:06:30Z",
  shadowCreatedAt:"2026-11-18T14:10:00Z",
  shadowFirstGitAt:"2026-11-18T14:11:00Z",
  gameStartsAt:start,
  originalFirstGitVerified:true,shadowFirstGitVerified:true,
  sourceIdentityVerified:true,modelPromoted:false,bettingEligible:false,...o};
}
const policy="2026-11-17T22:00:00Z";
t("prospective original goblin lines share champion and naive Higher denominators",()=>{
 const x=g.gradeFrozen([frozen()], [{sport:"NHL",gameId:1234,playerId:100,
  market:"shotsOnGoal",actual:3,gameState:"FINAL",
  officialVerified:true,officialFinalAt:"2026-11-20T06:00:00Z"}],
  {policyFirstGitAt:policy});
 a.equal(x.registered,1);a.equal(x.decided,1);
 a.equal(x.championHitRate,1);a.equal(x.alwaysHigherSameLineRate,1);
 a.equal(x.challengerHitRate,1);a.equal(x.modelsPromoted,false);
 a.equal(x.minimumReviewSampleMet,false);
});
t("first-Git missing, post-kickoff freezes, duplicates and pushes never count as wins",()=>{
 for(const bad of [{shadowFirstGitVerified:false},
  {shadowFirstGitAt:"2026-11-19T22:57:00Z"},
  {sourceFirstGitAt:"2026-11-18T14:00:00Z"}]){
  const x=g.gradeFrozen([frozen(bad)],[],{policyFirstGitAt:policy});
  a.equal(x.registered,0);a.equal(x.rejected.missing_prospective_first_git_or_identity,1);
 }
 const push=g.gradeFrozen([frozen(),frozen()], [{sport:"NHL",
  gameId:1234,playerId:100,market:"shotsOnGoal",actual:1.5,
  gameState:"FINAL",officialVerified:true,officialFinalAt:"2026-11-20T06:00:00Z"}],
  {policyFirstGitAt:policy});
 a.equal(push.registered,1);a.equal(push.pushes,1);a.equal(push.decided,0);
 a.equal(push.rejected.duplicate_original_prop,1);
});
t("Goblin probability calibration is independently isolated by sport and market",()=>{
 const x=g.calibrateGoblin([{sport:"NHL",market:"shotsOnGoal",tier:"Goblin"},
   {sport:"NFL",market:"receiving_yards",tier:"Goblin"}],{fitAt:now});
 a.equal(x.status,"must_calibrate_each_sport_and_market_separately");
 a.equal(x.calibrationApproved,false);
 const y=g.calibrateGoblin([{sport:"NHL",market:"shotsOnGoal",tier:"Goblin"}],
  {fitAt:now});
 a.equal(y.calibratedProbabilityApproved,false);
 a.deepEqual(y.fittedModels,[]);
});
