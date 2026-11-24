"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {build,kickoffUTC}=require("../src/nfl-goblin-schedule-bridge-v1.cjs");
const {auditNFL}=require("../src/nfl-goblin-identity-audit-v1.cjs");
const now="2026-11-18T23:40:00Z",
 sourceAt="2026-11-18T23:34:00Z",
 commit="2026-11-17T18:00:00Z",
 kick="2026-11-20T01:15:00Z";
const schedule={season:2026,week:11,game_type:"REG",
 game_id:"2026_11_IND_HOU",gameday:"2026-11-19",gametime:"20:15",
 home_team:"HOU",away_team:"IND"};
const offer={tier:"goblin",period:"Full",eventType:"individual",
 status:"pre_game",providerPlayerId:"prizepicks-local-id",
 providerGameId:"NFL_game_Example",team:"IND",opponent:"HOU",
 eventStartsAt:kick,line:79.5};
const args={now,sourceAt,originalArchiveFirstGitAt:"2026-11-18T23:35:00Z"};
const scheduleOpts={now,sourceCapturedAt:sourceAt,scheduleCommittedAt:commit};
test("correctly reconstruct actual Eastern kickoff with DST-aware roundtrip",()=>{
 assert.equal(Date.parse(kickoffUTC("2026-11-19","20:15")),Date.parse(kick));
 assert.equal(kickoffUTC("2026-10-22","20:15"),"2026-10-23T00:15:00.000Z");
 assert.equal(kickoffUTC("2026-11-19","bad"),null);
 assert.equal(kickoffUTC("2026-11-01","01:30"),null);
});
test("only unique future team/event/kickoff schedule gets a source-backed bridge",()=>{
 const s=build([offer], [schedule],scheduleOpts);
 assert.equal(s.provenanceValid,true);
 assert.equal(s.verifiedGameMappings,1);
 assert.equal(s.rows[0].officialGameId,"2026_11_IND_HOU");
 assert.equal(s.rows[0].source,"pregame_nflverse_schedule_git_verified");
 assert.equal(s.scheduleSourceFirstParty,false);
 assert.equal(s.playerGSISMappingsVerified,0);
 assert.equal(s.officialGameDayActiveVerified,0);
 const audit=auditNFL([offer],{...args,gameCrosswalk:s.rows});
 assert.equal(audit.prerequisiteGaps.officialGame,0);
 assert.equal(audit.reasons.exact_provider_player_to_gsis_bridge_unverified,1);
 assert.equal(audit.eligibleModelInputRows,0);
 assert.equal(audit.originalAppAvailabilityVerified,false);
});
test("schedule source committed after original board is never retrospective pregame proof",()=>{
 const s=build([offer],[schedule],{...scheduleOpts,
  scheduleCommittedAt:"2026-11-19T00:00:00Z"});
 assert.equal(s.provenanceValid,false);
 assert.equal(s.rows.length,0);
});
test("wrong team, conflicting provider game, stale kickoff and ambiguous calendar all abstain",()=>{
 assert.equal(build([offer],[{...schedule,home_team:"BAL"}],scheduleOpts)
  .verifiedGameMappings,0);
 assert.equal(build([offer,{...offer,opponent:"BAL"}],[schedule],scheduleOpts)
  .conflictingSourceGames,1);
 assert.equal(build([{...offer,eventStartsAt:"2026-11-20T02:15:00Z"}],
  [schedule],scheduleOpts).verifiedGameMappings,0);
 assert.equal(build([offer],[schedule,{...schedule,game_id:"2026_12_IND_HOU"}],
  scheduleOpts).ambiguousScheduleMatches,1);
});
test("untrusted/manual crosswalks and name-only GSIS remain ineligible",()=>{
 const s=build([offer],[schedule],scheduleOpts);
 const forged={...s.rows[0],source:"matched_by_name_only"};
 assert.equal(auditNFL([offer],{...args,gameCrosswalk:[forged]})
  .reasons.official_game_crosswalk_unverified,1);
 const nameOnly={providerPlayerId:offer.providerPlayerId,gsisId:"00-0030000",
  team:"IND",source:"matched_by_name_only",firstGitAt:commit};
 assert.equal(auditNFL([offer],{...args,gameCrosswalk:s.rows,
  playerCrosswalk:[nameOnly]})
  .reasons.exact_provider_player_to_gsis_bridge_unverified,1);
});
