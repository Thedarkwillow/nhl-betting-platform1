"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {getPayout}=require("../src/prizepicks-payouts.cjs");
test("official standard Power and Flex payout tables",()=>{
 assert.equal(getPayout({pickCount:6,playType:"power"}).multiplier,37.5);
 assert.equal(getPayout({pickCount:5,playType:"flex",correct:4}).multiplier,2);
 assert.equal(getPayout({pickCount:6,playType:"flex",correct:4}).multiplier,.4);
});
test("Demon and Goblin have no invented fixed multiplier",()=>{
 for(const tier of ["Goblin","Demon"]){const p=getPayout({pickCount:3,tiers:[tier]});assert.equal(p.verified,false);assert.equal(p.multiplier,null);}
});
