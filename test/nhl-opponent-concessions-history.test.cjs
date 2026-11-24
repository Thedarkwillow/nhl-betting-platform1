"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {NAME,isConcessionArchiveFilename,collectOne,prioritizeGames}=require("../scripts/collect-nhl-opponent-concessions-history.cjs");
const players=["PHI","BOS"].flatMap((team,k)=>Array.from({length:13},(_,i)=>({
 type:"skater",gameId:2026020999,gameDate:"2026-11-20",
 playerId:8480000+k*100+i,team,
 shotsOnGoal:i===0?1:0,goals:i===0?1:0,
 assists:0,points:i===0?1:0
})));
const pbp={id:2026020999,gameDate:"2026-11-20",gameState:"OFF",
 homeTeam:{id:1,abbrev:"PHI",sog:1,score:1},
 awayTeam:{id:2,abbrev:"BOS",sog:1,score:1},
 plays:[...[1,2,3].map(n=>({eventId:100+n,typeDescKey:"period-end",
 periodDescriptor:{number:n,periodType:"REG"}})),
 ...[1,2].map(n=>({eventId:n,typeDescKey:"goal",
 periodDescriptor:{number:1,periodType:"REG"},
 details:{eventOwnerTeamId:n}}))]};
const c={day:"2026-11-20",gameId:2026020999,players};
test("official game-only concession archive is separate, bounded and immutable",async()=>{
 const doc=await collectOne(c,{pbp:async()=>pbp});
 assert.equal(NAME(c),"2026-11-20__2026020999.json");
 assert.equal(doc.kind,"official_nhl_exact_game_block_exposure_v1");
 assert.equal(doc.opponentSogConcessionVerified,true);
 assert.equal(doc.opponentScoringConcessionsVerified,true);
 assert.equal(doc.attemptRows.length,26);
 assert.equal(doc.verifiedShotAttemptGames,1);
 assert.equal(doc.paidProviderRequests,0);
 assert.equal(doc.neverRetrospectivelyFreezesPredictions,true);
 assert.equal(doc.bettingEligible,false);
});
test("partial game and inconsistent scoring do not certify independent concessions",async()=>{
 await assert.rejects(()=>collectOne(c,{pbp:async()=>({...pbp,gameState:"LIVE"})}));
 await assert.rejects(()=>collectOne(c,{pbp:async()=>({...pbp,homeTeam:{...pbp.homeTeam,sog:2}})}));
 const doc=await collectOne(c,{pbp:async()=>({...pbp,homeTeam:{...pbp.homeTeam,score:2}})});
 assert.equal(doc.opponentScoringConcessionsVerified,false);
 assert.equal(doc.opponentSogConcessionVerified,true);
});

function archiveFor(gameId,day,teams=["PHI","BOS"]){
 const attemptRows=teams.flatMap((team,k)=>Array.from({length:13},(_,i)=>({
  gameId,gameDate:day,team,playerId:8481000+k*100+i,
  opponentShotAttempts:48,opponentShotAttemptSource:"NHL_official_exact_team_attempts_verified",
  opponentShotsOnGoal:30,
  opponentSogConcessionSource:"NHL_official_SOG_independently_reconciled"
 })));
 return {kind:"official_nhl_exact_game_block_exposure_v1",
  date:day,gameId,observedAt:day+"T23:00:00Z",
  verifiedShotAttemptGames:1,attemptRows,
  source:"NHL_Gamecenter_events_official_final_sog_reconciled"};
}
function candidate(gameId,day,teams){
 return {day,gameId,players:teams.flatMap(team=>
  Array.from({length:13},(_,i)=>({team,playerId:8490000+i})))};
}
test("undercovered opposing teams are prioritized without altering source proof or increasing free API budget",()=>{
 const history=Array.from({length:7},(_,i)=>
  archiveFor(2026020110+i,"2026-11-"+String(i+1).padStart(2,"0")));
 const queue=[
  candidate(2026020221,"2026-11-21",["PHI","BOS"]),
  candidate(2026020222,"2026-11-22",["TOR","NYR"]),
  candidate(2026020223,"2026-11-23",["PHI","TOR"]),
  candidate(2026020224,"2026-11-24",["PHI","BOS"])
 ];
 const selected=prioritizeGames(queue,history,3);
 assert.deepEqual(selected.map(x=>x.gameId),[2026020224,2026020222,2026020223]);
 assert.equal(selected.length,3);
 assert.deepEqual(selected[0].players,queue[0].players);
 assert.deepEqual(prioritizeGames(queue,history,1).map(x=>x.gameId),[2026020224]);
 assert.throws(()=>prioritizeGames(queue,history,13),/Invalid/);
});
test("invalid archive cannot manufacture opponent coverage and bad metadata abstains",()=>{
 const invalid={...archiveFor(2026020155,"2026-11-17"),
  verifiedShotAttemptGames:2};
 const a=candidate(2026020245,"2026-11-18",["PHI","BOS"]);
 const b=candidate(2026020246,"2026-11-19",["TOR","NYR"]);
 assert.deepEqual(prioritizeGames([a,b],[invalid],1).map(x=>x.gameId),[b.gameId]);
 assert.deepEqual(prioritizeGames([{...a,players:[{team:"?"}]}],[],5),[]);
});

test("prior official concession archive filename matches real NAME output (not escaped literal d)",()=>{
 const record={day:"2026-11-20",gameId:2026020999};
 assert.equal(isConcessionArchiveFilename(NAME(record)),true);
 for(const bad of ["2026-11-20__2026020999.json.bak",
   "2026-11-20__202602099.json","2026-11-20__20260209999.json",
   "2026-11-20__2026020999xjson","2026_11_20__2026020999.json",
   "d{4}-d{2}-d{2}__d{10}.json",null])assert.equal(isConcessionArchiveFilename(bad),false);
});

test("source recovery prioritizes independent scoring/assist deficits even if SOG coverage is complete",()=>{
 const make=(id,day,teams,scoring)=>({
  ...archiveFor(id,day,teams),
  attemptRows:archiveFor(id,day,teams).attemptRows.map(r=>scoring?{
   ...r,opponentTeamGoals:2,opponentTeamAssists:3,opponentTeamPoints:5,
   opponentScoringSource:"NHL_official_final_scoring_and_gamecenter_goals_reconciled"
  }:r)
 });
 const dates=i=>"2026-11-"+String(i+1).padStart(2,"0");
 const history=[...Array.from({length:8},(_,i)=>make(2026020100+i,dates(i),["PHI","BOS"],false)),
  ...Array.from({length:8},(_,i)=>make(2026020200+i,dates(i),["TOR","NYR"],true))];
 const pending=[candidate(2026020511,"2026-11-21",["PHI","BOS"]),
  candidate(2026020512,"2026-11-22",["TOR","NYR"])];
 assert.deepEqual(prioritizeGames(pending,history,1).map(x=>x.gameId),[2026020511]);
 const complete=history.map(d=>({...d,attemptRows:d.attemptRows.map(r=>({
  ...r,opponentTeamGoals:2,opponentTeamAssists:3,opponentTeamPoints:5,
  opponentScoringSource:"NHL_official_final_scoring_and_gamecenter_goals_reconciled"
 }))}));
 assert.deepEqual(prioritizeGames(pending,complete,2),[]);
});

test("Conflicting NHL official final PBP source exposes its actual reconciliation reason without inventing concessions",async()=>{
 await assert.rejects(()=>collectOne(c,{pbp:async()=>({...pbp,
  homeTeam:{...pbp.homeTeam,sog:2}})}),
  /official_final_sog_and_events_do_not_reconcile/);
});
test("Source-only official reconciliation cooldown skips repeatedly conflicting games for 48h, then retries",()=>{
 const {blockedRetries}=require("../scripts/collect-nhl-opponent-concessions-history.cjs");
 const now="2026-11-22T22:00:00Z";
 const doc={kind:"nhl_official_concession_source_retry_cooldown_v1",
  failures:[{gameId:2026020123,reason:"official_final_sog_and_events_do_not_reconcile",
   failedAt:"2026-11-22T21:00:00Z",retryAfter:"2026-11-24T21:00:00Z"},
   {gameId:2026020124,reason:"provider_http_429",
    failedAt:"2026-11-22T21:00:00Z",retryAfter:"2026-11-24T21:00:00Z"},
   {gameId:2026020125,reason:"official_final_sog_and_events_do_not_reconcile",
    failedAt:"2026-11-22T21:00:00Z",retryAfter:"2027-01-01T00:00:00Z"}]};
 assert.deepEqual([...blockedRetries(doc,now).keys()],[2026020123]);
 assert.equal(blockedRetries(doc,"2026-11-24T21:00:00Z").size,0);
 assert.equal(blockedRetries({},now).size,0);
});
