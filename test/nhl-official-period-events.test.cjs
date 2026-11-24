"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {officialPbpUrl,officialShiftsUrl,validateShiftPages,
 normalizeOfficialPeriods}=require("../src/nhl-official-period-events.cjs");
const {buildNhlPeriodHistory}=require("../src/nhl-period-history.cjs");
const {collectPeriodArchive}=require("../scripts/collect-nhl-official-period-events.cjs");
const {validatePeriodStatOffer}=require("../src/nhl-combo-period-research.cjs");
const gameId=2026020264,day="2026-11-06",skater=8481100,goalie=8482200;
function base(){
 const plays=[];let order=0;
 const add=(type,n,details={})=>plays.push({eventId:1000+order,
  sortOrder:++order,periodDescriptor:{number:n,periodType:"REG"},
  typeDescKey:type,details});
 for(let n=1;n<=3;n++){
  add("period-start",n);
  if(n===1){
   add("goal",n,{scoringPlayerId:skater,goalieInNetId:goalie});
   add("faceoff",n,{winningPlayerId:skater});
   add("hit",n,{hittingPlayerId:skater});
  }else{
   add("shot-on-goal",n,{shootingPlayerId:skater,goalieInNetId:goalie});
   if(n===3)add("blocked-shot",n,{blockingPlayerId:skater});
  }
  add("period-end",n);
 }
 add("game-end",3);
 const shifts=[],ids=[skater,goalie];let index=100;
 for(const n of [1,2,3])for(const id of ids)
  shifts.push({id:index++,gameId,playerId:id,period:n,
   typeCode:517,duration:id===goalie?"20:00":"10:00"});
 const players=[
  {gameId,playerId:skater,gameDate:day,type:"skater",
   shotsOnGoal:3,goals:1,assists:0,points:1,
   blockedShots:1,hits:1,faceoffsWon:1,timeOnIceSeconds:1800},
  {gameId,playerId:goalie,gameDate:day,type:"goalie",
   saves:2,goalsAgainst:1,timeOnIceSeconds:3600}
 ];
 return {pbp:{id:gameId,gameDate:day,gameState:"OFF",plays},
  shifts,players};
}
test("period source URLs and fully paginated official shifts require exact game/player IDs",()=>{
 assert.equal(new URL(officialPbpUrl(gameId)).pathname,
  "/v1/gamecenter/"+gameId+"/play-by-play");
 const url=new URL(officialShiftsUrl(gameId,{start:500,limit:500}));
 assert.equal(url.searchParams.get("cayenneExp"),"gameId="+gameId);
 assert.equal(url.searchParams.get("start"),"500");
 assert.throws(()=>officialShiftsUrl(1),/Invalid/);
 const a=base();
 const shifts=validateShiftPages([{total:6,data:a.shifts.slice(0,4)},
  {total:6,data:a.shifts.slice(4)}],gameId);
 assert.equal(shifts.length,6);
 // Live 2026-11-06 official shiftcharts include typeCode 505
 // administrative events with duration=null. They are not played shifts.
 const admin={...a.shifts[0],id:1000,typeCode:505,duration:null};
 const withAdmin=validateShiftPages([{total:7,data:[...a.shifts,admin]}],gameId);
 assert.equal(withAdmin.length,7);
 assert.equal(normalizeOfficialPeriods(a.pbp,withAdmin,a.players).quarantined.length,0);
 assert.throws(()=>validateShiftPages([{total:6,data:a.shifts.slice(0,4)}],gameId),
  /Incomplete/);
 assert.throws(()=>validateShiftPages([{total:7,data:a.shifts}],gameId),
  /Incomplete/);
 assert.throws(()=>validateShiftPages([{total:7,data:[...a.shifts,a.shifts[0]]}],gameId),
  /Unverified/);
});
test("official events + positive player shifts produce three period counts including zero",()=>{
 const a=base(),r=normalizeOfficialPeriods(a.pbp,a.shifts,a.players);
 assert.deepEqual(r.completedPeriods,[1,2,3]);
 assert.equal(r.playerPeriodRows.length,6);
 assert.equal(r.quarantined.length,0);
 const p1=r.playerPeriodRows.find(x=>x.playerId===skater&&x.period===1);
 const p2=r.playerPeriodRows.find(x=>x.playerId===skater&&x.period===2);
 const p3=r.playerPeriodRows.find(x=>x.playerId===skater&&x.period===3);
 assert.equal(p1.stats.goals,1);
 assert.equal(p1.stats.shotsOnGoal,1);
 assert.equal(p1.stats.points,1);
 assert.equal(p1.stats.faceoffsWon,1);
 assert.equal(p1.stats.hits,1);
 assert.equal(p2.stats.goals,0);
 assert.equal(p2.stats.shotsOnGoal,1);
 assert.equal(p3.stats.blockedShots,1);
 assert.equal(p1.stats.timeOnIceSeconds,600);
 const g1=r.playerPeriodRows.find(x=>x.playerId===goalie&&x.period===1);
 assert.equal(g1.stats.goalsAgainst,1);
 assert.equal(g1.stats.saves,0);
 const g3=r.playerPeriodRows.find(x=>x.playerId===goalie&&x.period===3);
 assert.equal(g3.stats.saves,1);
});
test("final official boxscore disagrees with raw block events: quarantine only blocks",()=>{
 const a=base();a.players[0].blockedShots=0;
 const r=normalizeOfficialPeriods(a.pbp,a.shifts,a.players);
 assert.ok(r.quarantined.some(x=>x.market==="blockedShots"&&x.playerId===skater));
 for(const p of r.playerPeriodRows.filter(x=>x.playerId===skater)){
  assert.equal(p.stats.blockedShots,null);
  assert.equal(typeof p.stats.shotsOnGoal,"number");
 }
});
test("no official shift means player is not marked eligible for that period",()=>{
 const a=base();a.shifts=a.shifts.filter(x=>x.playerId!==goalie||x.period!==3);
 const r=normalizeOfficialPeriods(a.pbp,a.shifts,a.players);
 assert.equal(r.playerPeriodRows.some(x=>x.playerId===goalie&&x.period===3),false);
 assert.ok(r.quarantined.some(x=>x.market==="timeOnIceSeconds"&&x.playerId===goalie));
});
test("NHL 1st–3rd period outcomes do not include overtime or shootout",()=>{
 const a=base(),plays=a.pbp.plays;
 const max=Math.max(...plays.map(x=>x.sortOrder));
 plays.push({eventId:9991,sortOrder:max+1,
  periodDescriptor:{number:4,periodType:"OT"},
  typeDescKey:"goal",details:{scoringPlayerId:skater,goalieInNetId:goalie}});
 plays.push({eventId:9992,sortOrder:max+2,
  periodDescriptor:{number:5,periodType:"SO"},
  typeDescKey:"goal",details:{scoringPlayerId:skater,goalieInNetId:goalie}});
 a.players[0].goals=2;a.players[0].shotsOnGoal=4;a.players[0].points=2;
 a.players[1].goalsAgainst=2;
 const r=normalizeOfficialPeriods(a.pbp,a.shifts,a.players);
 assert.equal(r.quarantined.length,0);
 const p3=r.playerPeriodRows.find(x=>x.playerId===skater&&x.period===3);
 assert.equal(p3.stats.goals,0);
 assert.equal(r.playerPeriodRows.filter(x=>x.playerId===skater).reduce(
  (s,x)=>s+x.stats.goals,0),1);
});
test("missing full period-end or late in-progress feed aborts before generating data",()=>{
 const a=base();a.pbp.plays=a.pbp.plays.filter(p=>p.periodDescriptor?.number!==2||
  p.typeDescKey!=="period-end");
 assert.throws(()=>normalizeOfficialPeriods(a.pbp,a.shifts,a.players),
  /Three complete/);
 a.pbp.gameState="LIVE";
 assert.throws(()=>normalizeOfficialPeriods(a.pbp,a.shifts,a.players),/completed/);
});
test("separate period history preserves market-specific missing stats and date-scoped samples",()=>{
 const a=base(),r=normalizeOfficialPeriods(a.pbp,a.shifts,a.players);
 const daily={kind:"nhl_official_period_event_history_daily",complete:true,
  requestedDate:day,gameCount:1,completedGameResults:1,errors:[],
  playerPeriodRows:r.playerPeriodRows};
 const h=buildNhlPeriodHistory([daily]);
 assert.equal(h.completedGames,1);
 assert.equal(h.playerPeriodObservations,6);
 assert.equal(h.players[String(skater)]["1"][0].goals,1);
 assert.equal(h.players[String(skater)]["2"][0].goals,0);
 assert.equal(h.originalPlatformSettlementVerified,false);
 assert.throws(()=>buildNhlPeriodHistory([daily,daily]),/duplicate/i);
 const partial={...daily,complete:false};
 assert.throws(()=>buildNhlPeriodHistory([partial]),/Incomplete/);
});
test("date collector accepts only complete NHL final source and exact game IDs",async()=>{
 const a=base(),source={requestedDate:day,scheduledGames:1,
  completedGames:1,collectedGames:1,errors:[],players:a.players};
 const client=async url=>({ok:true,json:async()=>url.includes("shiftcharts")?
  {total:a.shifts.length,data:a.shifts}:a.pbp});
 const r=await collectPeriodArchive(day,{source,client});
 assert.equal(r.complete,true);
 assert.equal(r.gameCount,1);
 assert.equal(r.playerPeriodRows.length,6);
 assert.equal(r.sourceReconciliationQuarantine.length,0);
 assert.equal(r.baseOfficialPlayerStatSchemaVersion,1);
 assert.equal(r.fullStatSourceCoverageSchemaReady,false);
 const upgraded=await collectPeriodArchive(day,{
  source:{...source,sourceSchemaVersion:5,fetchedAt:"2026-11-07T05:00:00Z"},client
 });
 assert.equal(upgraded.fullStatSourceCoverageSchemaReady,true);
 assert.equal(upgraded.baseOfficialPlayerStatSchemaVersion,5);
 assert.equal(upgraded.baseOfficialPlayerStatsFetchedAt,"2026-11-07T05:00:00Z");
 await assert.rejects(()=>collectPeriodArchive(day,{
  source:{...source,completedGames:0},client}),/Incomplete/);
});
test("period offer readiness sees actual per-market official rows but remains settlement-gated",()=>{
 const a=base(),r=normalizeOfficialPeriods(a.pbp,a.shifts,a.players);
 const first=r.playerPeriodRows.find(x=>x.playerId===skater&&x.period===1);
 const rows=Array.from({length:8},(_,i)=>({
  ...first,gameId:2026020400+i,
  gameDate:"2026-10-"+String(i+1).padStart(2,"0")}));
 const {players}=buildNhlPeriodHistory([{
  kind:"nhl_official_period_event_history_daily",
  requestedDate:day,gameCount:8,completedGameResults:8,complete:true,errors:[],
  playerPeriodRows:rows.map(x=>({...x,gameDate:day}))
 }]);
 const testRows=players[String(skater)]["1"];
 assert.equal(testRows.length,8);
 const history={players:{[String(skater)]:{"1":testRows}}};
 const verdict=validatePeriodStatOffer({officialPlayerId:skater,
  officialGameId:2026020666,period:"1st period",market:"shotsOnGoal"},history);
 assert.equal(verdict.eligible,false);
 assert.equal(verdict.officialSampleCount,8);
 assert.equal(verdict.reason,"original_period_offer_and_settlement_not_verified");
});


test("official NHL retry policy respects 429 Retry-After and 5xx exponential backoff",()=>{
 const {retryDelayMs}=require("../scripts/collect-nhl-official-period-events.cjs");
 assert.equal(retryDelayMs(429,0,"12"),12000);
 assert.equal(retryDelayMs(429,2,null),20000);
 assert.equal(retryDelayMs(500,1,null),2400);
 assert.equal(retryDelayMs(429,10,null),90000);
});
test("historical empty shiftchart has actionable diagnostics and stays incomplete",async()=>{const {fetchShiftPages}=require("../scripts/collect-nhl-official-period-events.cjs");await assert.rejects(fetchShiftPages(2025020001,{client:async()=>({ok:true,json:async()=>({total:0,data:[]})})}),/reported=0, received=0, pages=1/);});
