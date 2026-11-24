"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const m=require("../src/nhl-selective-opportunity-future-v1.cjs");
const cutoff="2026-11-20",policy="2026-11-17T20:00:00Z";
const base={
 gameId:2026020300,playerId:8479999,market:"shotsOnGoal",tier:"Standard",line:2.5,side:"Higher",
 gameStartAt:"2026-11-20T23:00:00Z",capturedAt:"2026-11-20T19:00:00Z",
 role:"F",originalHigher:.67,variants:{empirical:.60,rate:.64,opportunity:.69,position:.67},
 priorGames:15,opponentGames:12,expectedIceSeconds:1040,
 expectedPPSeconds:150,ppTimeEvidenceVerified:true,ppPointsRows:12,latestPriorDate:"2026-11-18",
 firstGitCommittedAt:"2026-11-20T19:04:00Z"
};
test("future NHL Standard original shot line may enter predeclared research subset without promotion",()=>{
 const p=m.assess(base,{cutoff});
 a.equal(p.status,"prospective_research_candidate_only");
 a.equal(p.originalSideUnchanged,true);a.equal(p.bettingEligible,false);
 a.equal(m.assess({...base,variants:{...base.variants,position:.44}},{cutoff}).reason,
  "position_and_opportunity_disagree");
 a.equal(m.assess({...base,priorGames:4},{cutoff}).reason,"insufficient_prior_player_appearances");
 a.equal(m.assess({...base,opponentGames:4},{cutoff}).reason,"insufficient_opponent_team_games");
 a.equal(m.assess({...base,expectedIceSeconds:300},{cutoff}).reason,"unreliable_prior_ice_time_exposure");
 a.equal(m.assess({...base,latestPriorDate:"2026-11-01"},{cutoff}).reason,"stale_recent_appearance");
 a.equal(m.assess({...base,side:"Lower"},{cutoff}).reason,"original_side_not_supported_by_independent_models");
});
test("NHL points require authentic prior PP-time and component evidence; unknown is not zero",()=>{
 const p={...base,market:"points",line:.5,expectedPPSeconds:null,
  ppTimeEvidenceVerified:false,ppPointsRows:0};
 a.equal(m.assess(p,{cutoff}).reason,"unverified_power_play_scoring_exposure");
 const pass={...p,expectedPPSeconds:190,ppTimeEvidenceVerified:true,ppPointsRows:8};
 a.equal(m.assess(pass,{cutoff}).eligible,true);
});
test("first-Git frozen future NHL lines grade against the same-line Lower baseline only",()=>{
 const frozen={...base,selective:m.assess(base,{cutoff})};
 const history={players:{8479999:{games:[{gameId:base.gameId,playerId:base.playerId,
  gameState:"OFF",shotsOnGoal:4,gameDate:"2026-11-20"}]}}};
 const x=m.grade([frozen],history,{policyFirstCommittedAt:policy});
 a.equal(x.status,"new_future_only_original_git_research_unapproved");
 a.equal(x.eligible,1);a.equal(x.decided,1);
 a.equal(x.byMarket.shotsOnGoal.originalSelectedHitRate,1);
 a.equal(x.byMarket.shotsOnGoal.sameLineAlwaysLowerRate,0);
 a.equal(x.byMarket.shotsOnGoal.distinctPacificSlates,1);
 a.equal(x.byMarket.shotsOnGoal.minimumEvidenceMet,false);
 a.equal(x.calibrationApproved,false);a.equal(x.modelPromoted,false);
 a.equal(x.lineupsApproved,false);
});
test("incomplete games, unverified shadow chronology and duplicates fail closed",()=>{
 const orig={...base,selective:m.assess(base,{cutoff})};
 const noResult=m.grade([orig],{players:{}},{policyFirstCommittedAt:policy});
 a.equal(noResult.pending,1);a.equal(noResult.decided,0);
 a.equal(m.grade([orig,orig],{players:{}},{policyFirstCommittedAt:policy}).status,
  "duplicate_original_frozen_threshold");
 a.equal(m.grade([{...orig,firstGitCommittedAt:"2026-11-16T19:00:00Z"}],{players:{}},{policyFirstCommittedAt:policy}).status,
  "future_original_git_source_or_shadow_reconciliation_failed");
 a.equal(m.grade([orig],{players:{}},{policyFirstCommittedAt:null}).status,
  "new_policy_git_commit_unverified");
 a.equal(m.grade([{...orig,selective:null}],{players:{}},{policyFirstCommittedAt:policy}).registered,0);
});

test("new NHL selective trial needs original first-Git board AFTER its precommitted policy",()=>{
 const valid={policyFirstGitCommittedAt:"2026-11-17T20:00:00Z",
  sourceGeneratedAt:"2026-11-17T20:01:00Z",
  sourceFirstGitCommittedAt:"2026-11-17T20:01:20Z",
  shadowFirstGitCommittedAt:"2026-11-17T20:02:00Z"};
 a.equal(m.originalSourceAfterNewPolicy(valid),true);
 a.equal(m.originalSourceAfterNewPolicy({...valid,sourceGeneratedAt:"2026-11-17T19:50:00Z"}),false);
 a.equal(m.originalSourceAfterNewPolicy({...valid,sourceFirstGitCommittedAt:"2026-11-17T19:50:00Z"}),false);
 a.equal(m.originalSourceAfterNewPolicy({...valid,sourceFirstGitCommittedAt:"2026-11-17T20:03:00Z"}),false);
 a.equal(m.originalSourceAfterNewPolicy({...valid,shadowFirstGitCommittedAt:"2026-11-17T20:00:30Z"}),false);
 a.equal(m.originalSourceAfterNewPolicy({...valid,policyFirstGitCommittedAt:null}),false);
});
