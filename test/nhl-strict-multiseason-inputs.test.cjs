"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const multi=require("../src/nhl-strict-input-source-v1.cjs");
const ice=require("../src/nhl-expected-ice-time-evidence-v1.cjs");
const pos=require("../src/nhl-position-rate-matchup-v2.cjs");
const adaptive=require("../src/nhl-standard-adaptive-research.cjs");
const {POLICY}=require("../src/nhl-frozen-individual-props.cjs");
const season=(name,games)=>({source:"Official NHL Web API",
 season:name,complete:true,games});
function fixtures(){
 const history={players:{}},schedules=[season("2025-26",[]),season("2026-27",[])],
  teams=["CAR","BOS"],pattern=["C","C","C","C","LW","LW","LW","RW","RW","RW",
   "D","D","D","D","D","D","D","D"];
 for(let k=0;k<29;k++){
  const previous=k<25,date=previous?"2025-10-"+String(k+1).padStart(2,"0"):
    "2026-10-"+String(k-24).padStart(2,"0"),
    id=2025000001+k;
  const schedule=schedules[previous?0:1];
  schedule.games.push({id,gameDate:date,season:schedule.season,
   gameType:2,home:"CAR",away:"BOS",startTimeUTC:date+"T23:00:00Z"});
  for(const [t,team] of teams.entries())for(let i=0;i<18;i++){
   const playerId=100+t*100+i,g={gameId:id,playerId,gameDate:date,
    gameState:"FINAL",type:"skater",position:pattern[i],team,
    timeOnIceSeconds:1200,shotsOnGoal:2,goals:0,assists:1,points:1,
    blockedShots:1,hits:1,faceoffsWon:1,powerPlayPoints:0,plusMinus:0};
   (history.players[String(playerId)]??={playerId,games:[]}).games.push(g);
  }
 }
 const future={id:2026000500,gameDate:"2026-11-22",season:"2026-27",
  gameType:2,home:"CAR",away:"BOS",startTimeUTC:"2026-11-22T20:00:00Z"};
 schedules[1].games.push(future);
 const p={gameId:future.id,playerId:100,team:"CAR",opponent:"BOS",
  market:"shotsOnGoal",line:1.5,tier:"Standard",lean:"Higher",
  capturedAt:"2026-11-20T17:55:00Z",gameStartAt:future.startTimeUTC,
  probability:.7};
 const snapshot={generatedAt:"2026-11-20T18:00:00Z",
  individualPropSelectionPolicy:POLICY,individualPropSelections:[p],
  rankedProps:[{...p,probabilities:{higher:.7,lower:.3,push:0}}]};
 return {history,schedules,p,snapshot};
}
test("original schedule and multi-season source gate rejects duplicate or conflicted games",()=>{
 const f=fixtures(),loaded={history:f.history,schedules:f.schedules,
  counts:{current:144,prior:900,duplicates:0,conflicts:0,
   uniquePlayerGames:1044,distinctDates:29}};
 const r=multi.adapt(loaded,"2026-11-20");
 a.equal(r.available,true);a.equal(r.combinedSchedule.games.length,30);
 a.equal(r.historyCounts.uniquePlayerGames,1044);
 a.equal(r.originalMarketSideAndLineUnchanged,true);
 a.equal(multi.adapt({...loaded,counts:{...loaded.counts,conflicts:2}},"2026-11-20").available,false);
 const duplicate=structuredClone(loaded);
 duplicate.schedules[0].games.push({...duplicate.schedules[0].games[0]});
 a.equal(multi.adapt(duplicate,"2026-11-20").reason,
  "official_game_schedule_identity_conflict");
});
test("two archived seasons materially increase prior-games and position defense evidence",()=>{
 const f=fixtures();
 const prev=pos.freeze(f.snapshot,f.history,[f.schedules[1]]);
 const more=pos.freeze(f.snapshot,f.history,f.schedules);
 a.equal(prev.rows.length,0);
 a.equal(more.rows.length,1);
 a.equal(more.rows[0].position,"C");
 a.equal(more.rows[0].defense.last10.games,10);
 a.ok(more.rows[0].probabilities.offenseDefense.higher>0);
 const prepared=adaptive.prepare(f.history,
   {source:"Official NHL Web API",complete:true,
    games:f.schedules.flatMap(s=>s.games)},"2026-11-20");
 const v=adaptive.freeze(f.snapshot,f.history,
  {source:"Official NHL Web API",complete:true,
   games:f.schedules.flatMap(s=>s.games)},null,prepared);
 a.equal(v.rows.length,1);
 a.equal(v.rows[0].priorGames,29);
 a.ok(v.rows[0].opponentGames>=25);
 a.equal(v.rows[0].opponentHistoryUsed,true);
 a.equal(f.snapshot.individualPropSelections[0].lean,"Higher");
});
test("expected ice-time uses only pregame rows, marks role shifts but does not deploy alternative",()=>{
 const f=fixtures(),g=f.history.players["100"].games;
 const a0=ice.estimate(g,"2026-11-20");
 a.equal(a0.priorGames,29);
 a.equal(a0.originalExpectedIceSeconds,1200);
 a.equal(a0.alternateExpectedIceSeconds,1200);
 a.equal(a0.pregameOnly,true);
 const leak={...g.at(-1),gameId:1234567,
  gameDate:"2026-11-21",timeOnIceSeconds:3600};
 const b=ice.estimate([...g,leak],"2026-11-20");
 a.equal(b.originalExpectedIceSeconds,1200);
 const shadow=ice.freeze(f.snapshot,f.history);
 a.equal(shadow.rows.length,1);
 a.equal(shadow.rows[0].evidence.originalExpectedIceSeconds,1200);
 a.equal(shadow.rows[0].alternativeDeployed,false);
 const testRows=structuredClone(f.history);
 for(const z of Object.values(testRows.players))z.games.push({
  ...z.games.at(-1),gameId:2026000501,
  gameDate:"2026-10-05",timeOnIceSeconds:1250});
 const performance=ice.walkForward(testRows,"2026-10-06",
  {from:"2026-10-05"});
 a.equal(performance.decided,36);
 a.equal(performance.originalBaselineMAESeconds,50);
 a.equal(performance.alternateMAESeconds,50);
 a.equal(performance.alternateDeployed,false);
});
