"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {games,replay}=require("../src/nhl-synthetic-opportunity-replay.cjs");
function history(){
 const obj={players:{}};
 for(let day=1;day<=16;day++)for(let club=0;club<2;club++)
  for(let i=0;i<18;i++){
   const id=200+club*30+i;
   const row={gameId:2026000+day,playerId:id,
    gameDate:"2026-01-"+String(day).padStart(2,"0"),gameState:"FINAL",
    type:"skater",team:club===0?"ABC":"XYZ",position:i<6?"D":"C",
    timeOnIceSeconds:960,shotsOnGoal:i%5===0?0:2,
    blockedShots:i%3===0?0:1,hits:1,goals:0,assists:0,points:0};
   (obj.players[id]??={games:[]}).games.push(row);
  }
 return obj;
}
test("NHL synthetic fixed thresholds use only earlier official calendar dates",()=>{
 const s=replay(history(),{holdoutFrom:"2026-01-14"});
 assert.equal(s.completeOfficialGames,16);
 assert.equal(s.holdoutGames,3);
 assert.equal(s.byMarket.shotsOnGoal.matchedAppearanceRows,108);
 assert.ok(s.byMarket.shotsOnGoal.predicted>0);
 assert.ok(s.byMarket.blockedShots.predicted>0);
 assert.equal(s.byMarket.blockedShots.zeroActualAppearances>0,true);
 assert.equal(s.noSameDayOutcomeFeatures,true);
 assert.equal(s.realPlatformLinesUsed,false);
 assert.equal(s.productionDirectionReplaced,false);
 assert.equal(s.marketCalibrationApproved,false);
 assert.equal(s.modelPromoted,false);
});
test("incomplete rosters are excluded and never given imputed zeros",()=>{
 const h=history();h.players[200].games.pop();
 const b=games(h);
 assert.equal(b.invalid.incompleteRoster,1);
 assert.equal(b.full.length,15);
 const r=replay(h,{holdoutFrom:"2026-01-14"});
 assert.equal(r.excludedOfficialGames.incompleteRoster,1);
 assert.equal(r.noSameDayOutcomeFeatures,true);
});
test("invalid replay input fails before making any wager or data request",()=>{
 assert.throws(()=>replay(null),/required/);
 assert.throws(()=>replay(history(),{holdoutFrom:"bad"}),/required/);
});
