"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {study,scheduleIndex,scheduledOpponent}=require("../src/nhl-fixed-ensemble-research.cjs");
test("official schedule joins only an exact, unique event, date, and team",()=>{
 const g={id:1,gameDate:"2026-10-01",home:"BOS",away:"NYR"};
 const s={source:"Official NHL Web API",complete:true,games:[g]};
 const r={gameId:1,gameDate:g.gameDate,team:"BOS"};
 assert.equal(scheduledOpponent(r,scheduleIndex(s)),"NYR");
 assert.equal(scheduledOpponent({...r,team:"TOR"},scheduleIndex(s)),null);
 assert.equal(scheduledOpponent({...r,gameDate:"2026-10-02"},scheduleIndex(s)),null);
 assert.equal(scheduledOpponent(r,scheduleIndex({...s,games:[g,g]})),null);
 assert.equal(scheduledOpponent(r,scheduleIndex({...s,complete:false})),null);
});
test("past-only shots allowed and shots generated are separately supported without opponent field",()=>{
 const players={},games=[];
 for(let d=1;d<=12;d++){
  const gameDate="2026-10-"+String(d).padStart(2,"0");games.push({id:d,gameDate,home:"BOS",away:"NYR"});
  for(const [i,t] of ["BOS","NYR"].entries()){
   for(let j=1;j<=19;j++){
    const playerId=20*i+j,type=j===19?"goalie":"skater";
    (players[playerId]??={games:[]}).games.push({playerId,gameId:d,gameDate,team:t,type,gameState:"FINAL",timeOnIceSeconds:type==="goalie"?3600:900,shotsOnGoal:type==="skater"?(i===0?2:1):null,saves:type==="goalie"?(i===0?16:34):null,shotsAgainst:type==="goalie"?(i===0?18:36):null});
   }
  }
 }
 const schedule={source:"Official NHL Web API",complete:true,games};
 const a=study({players},{from:"2026-10-11",schedule});
 const b=study({players},{from:"2026-10-11",schedule:null});
 assert.equal(a.byMarket.shotsOnGoal.opponentAdjustmentRows,72);
 assert.equal(a.byMarket.saves.opponentAdjustmentRows,4);
 assert.equal(a.byMarket.shotsOnGoal.opponentAdjustedNonNeutralRows,72);
 assert.equal(b.byMarket.shotsOnGoal.opponentAdjustmentRows,0);
 assert.equal(a.historicalScheduleAsOfAvailabilityVerified,false);
});
