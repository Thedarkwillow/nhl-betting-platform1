"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {classify,summarize}=require("../scripts/audit-2025-26-odds-api-tier-indications.cjs");
test("recognizes documented provider mapping only as unverified indication",()=>{
 const g=classify({market:"player_shots_on_goal_alternate",price:-137,side:"Over"});
 const d=classify({market:"player_shots_on_goal_alternate",price:100,side:"Over"});
 const s=classify({market:"player_shots_on_goal",price:100,side:"Over"});
 assert.equal(g.indicatedTier,"Goblin");
 assert.equal(d.indicatedTier,"Demon");
 assert.equal(s.indicatedTier,"Standard");
 assert.ok([g,d,s].every(x=>x.originalVerified===false));
 assert.equal(classify({market:"player_shots_on_goal_alternate",price:-110,side:"Over"}).indicatedTier,null);
 assert.equal(classify({market:"player_shots_on_goal_alternate",price:100,side:"Under"}).indicatedTier,null);
});
test("only counts actual dated pregame observations, deduplicates, no fabricated payouts",()=>{
 const row={season:"2025-26",snapshotAt:"2025-10-21T20:55:39Z",
  gameStartsAt:"2025-10-21T23:10:00Z",eventId:"abcdef",player:"Nico Hischier",
  market:"player_shots_on_goal_alternate",side:"Over",line:1.5,price:-137,source:"sample"};
 const out=summarize([row,row,{...row,price:100,line:3.5},
   {...row,snapshotAt:"2025-10-22T00:00:00Z"}],"2026-11-02T10:00:00Z");
 assert.equal(out.uniquePregamePriceLineObservations,2);
 assert.equal(out.duplicatesAcrossSources,1);
 assert.equal(out.invalidOrPostStartObservations,1);
 assert.equal(out.providerIndicatedTierCounts.Goblin,1);
 assert.equal(out.providerIndicatedTierCounts.Demon,1);
 assert.equal(out.exactPrizePicksPayoutMultipliersVerified,0);
 assert.equal(out.originalHistoricalTierVerification,false);
});
