"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {summarize}=require("../src/nfl-goblin-independent-injury-corroboration.cjs");
const now="2026-11-19T23:55:00Z",capture="2026-11-19T23:50:00Z";
const official={kind:"nfl_first_party_published_game_status_v1",
 capturedAt:"2026-11-18T23:00:00Z",missingIsHealthy:false,
 activeGameRosterVerified:false,
 sources:["https://fantasy-www.nfl.com/news/nfl-week-11-injury-report-2026-season"],
 rows:[{season:2026,week:11,team:"HOU",gsisId:"00-0030001",status:"out",
 modifiedAt:"2026-11-18T22:00:00Z"},
 {season:2026,week:11,team:"IND",gsisId:"00-0030002",status:"questionable",
 modifiedAt:"2026-11-18T22:00:00Z"}]};
const player=(id,gsisId,team)=>({providerPlayerId:id,gsisId,team,
 officialGameId:"2026_11_IND_HOU",priorWeeksUsed:[10,9],
 gameDayActiveVerified:false,independentlyVerifiedProviderGSIS:false,
 source:"conditional_unique_name_team_position_prior_roster"});
const players=[player("pp-1","00-0030001","HOU"),
 player("pp-2","00-0030002","IND"),
 player("pp-3","00-0030003","IND")];
const cfg={officialFirstGitAt:"2026-11-19T02:30:00Z",boardCapturedAt:capture,now};
test("official report explicitly corroborates only listed GSIS, not no-report as active",()=>{
 const s=summarize(players,official,cfg);
 a.equal(s.conditionalPlayers,3);a.equal(s.officialGsisCorroborated,2);
 a.equal(s.confirmedOut,1);a.equal(s.questionableHold,1);
 a.equal(s.notOfficiallyStatusMatched,1);
 a.equal(s.positiveActiveGameday,0);a.equal(s.authenticatedProviderGSIS,0);
 a.equal(s.productionEligible,0);a.equal(s.sourceFirstGitBeforeBoard,true);
});
test("late, untrusted and modified-after-capture injury records fail closed",()=>{
 const cases=[
  [official,{...cfg,officialFirstGitAt:"2026-11-19T23:54:00Z"}],
  [{...official,missingIsHealthy:true},cfg],
  [{...official,activeGameRosterVerified:true},cfg],
  [{...official,sources:["https://example.com/news/forgery"]},cfg]];
 for(const [doc,opts] of cases){
  const s=summarize(players,doc,opts);
  a.equal(s.sourceFirstGitBeforeBoard,false);a.equal(s.officialGsisCorroborated,0);
 }
 const manipulated={...official,rows:[{...official.rows[0],
  modifiedAt:"2026-11-19T23:59:00Z"}]};
 a.equal(summarize(players,manipulated,cfg).confirmedOut,0);
});
test("duplicate official statuses are quarantined, never converted to active",()=>{
 const doc={...official,rows:[...official.rows,{...official.rows[0],
  status:"questionable"}]};
 const s=summarize(players,doc,cfg);
 a.equal(s.duplicateOrConflictingStatuses,1);
 a.equal(s.confirmedOut,0);a.equal(s.productionEligible,0);
});
