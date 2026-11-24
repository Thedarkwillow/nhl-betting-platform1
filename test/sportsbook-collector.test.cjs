"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const {normalizeEvent}=require("../scripts/collect-nhl-sportsbook-odds.cjs");
test("normalizes only two-sided supported NHL sportsbook markets",()=>{
 const event={id:"evt",home_team:"Home",away_team:"Away",commence_time:"2026-11-02T00:00:00Z",bookmakers:[
  {key:"draftkings",markets:[{key:"player_shots_on_goal",outcomes:[
   {name:"Over",description:"Player One",point:2.5,price:-120},
   {name:"Under",description:"Player One",point:2.5,price:100},
   {name:"Over",description:"Player Two",point:3.5,price:-110}
  ]}]},
  {key:"unknown",markets:[{key:"player_points",outcomes:[{name:"Over",description:"Player One",point:1.5,price:-110},{name:"Under",description:"Player One",point:1.5,price:-110}]}]}
 ]};
 const rows=normalizeEvent(event);
 assert.equal(rows.length,1);
 assert.equal(rows[0].book,"DraftKings");
 assert.equal(rows[0].market,"shotsOnGoal");
 assert.equal(rows[0].overOdds,-120);
 assert.equal(rows[0].underOdds,100);
});
