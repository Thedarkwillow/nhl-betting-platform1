"use strict";
const t=require("node:test"),a=require("node:assert/strict");
const {build}=require("../src/nfl-goblin-free-identity-research.cjs");
const now="2026-11-18T23:40:00Z",captured="2026-11-18T23:34:00Z";
const date="2026-11-17T22:00:00Z";
const g={providerGameId:"provider-game-A",officialGameId:"2026_11_IND_HOU",
 homeTeam:"HOU",awayTeam:"IND",source:"pregame_nflverse_schedule_git_verified",
 officialKickoffAt:"2026-11-20T01:15:00Z",verifiedBeforeKickoff:true,firstGitAt:date};
const offer={status:"pre_game",eventType:"individual",combo:false,
 providerPlayerId:"provider-only-player-id",providerGameId:g.providerGameId,
 player:"C.J. Stroud",team:"HOU",position:"QB"};
const rr=(id,week,rest={})=>({gsis_id:id,full_name:"C.J. Stroud",
 position:"QB",team:"HOU",season:2026,week,...rest});
const options={sourceCapturedAt:captured,rosterFirstGitAt:date,now};
t("Two uniquely corroborating prior roster weeks yield an explicit CONDITIONAL GSIS candidate",()=>{
 const r=build([offer,offer],[rr("00-0039896",9),rr("00-0039896",10)],[g],options);
 a.equal(r.originalProviderPlayers,1);a.equal(r.candidateMatches,1);
 a.equal(r.rows[0].gsisId,"00-0039896");
 a.deepEqual(r.rows[0].priorWeeksUsed,[10,9]);
 a.equal(r.rows[0].independentlyVerifiedProviderGSIS,false);
 a.equal(r.independentlyVerifiedMappings,0);
 a.equal(r.officialGameDayActiveVerified,0);
 a.equal(r.productionEligible,0);
});
t("Single past week, conflicting GSIS players and wrong team or position abstain",()=>{
 const one=build([offer],[rr("00-0039896",10)],[g],options);
 a.equal(one.candidateMatches,0);a.equal(one.insufficientPriorWeeks,1);
 const duplicated=build([offer],[rr("00-0039896",9),rr("00-0039896",10),
  rr("00-0049999",9),rr("00-0049999",10)],[g],options);
 a.equal(duplicated.candidateMatches,0);a.equal(duplicated.ambiguousPlayers,1);
 for(const x of [{...offer,team:"IND"},{...offer,position:"WR"},
  {...offer,player:"C. Stroud"}]){
  const result=build([x],[rr("00-0039896",9),rr("00-0039896",10)],[g],options);
  a.equal(result.candidateMatches,0);
 }
});
t("Pre-frozen roster provenance is essential; no retroactive crosswalks",()=>{
 const rows=[rr("00-0039896",9),rr("00-0039896",10)];
 const late=build([offer],rows,[g],{...options,rosterFirstGitAt:"2026-11-18T23:38:00Z"});
 a.equal(late.rosterProvenanceVerified,false);
 a.equal(late.candidateMatches,0);
 const stale=build([offer],rows,[g],{...options,now:"2026-11-19T01:00:00Z"});
 a.equal(stale.candidateMatches,0);
});
t("Different player IDs for same GSIS are quarantined",()=>{
 const rows=[rr("00-0039896",9),rr("00-0039896",10)];
 const candidates=build([offer,{...offer,providerPlayerId:"another-PP-id"}],rows,[g],options);
 a.equal(candidates.candidateMatches,0);
 a.ok(candidates.ambiguousPlayers>0);
});
