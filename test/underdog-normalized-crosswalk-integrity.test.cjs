"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {conflictingNormalizedPlayerCrosswalk}=require("../scripts/audit-underdog-private-candidate-archives.cjs");
const r=(id,playerId,offerId)=>({sourcePlayerId:id,playerId,sourceOfferId:offerId});
test("Underdog private archives cannot mix provider ID with two roster players",()=>{
 a.equal(conflictingNormalizedPlayerCrosswalk([r("s1",123,"a"),r("s1",456,"b")]),true);
 a.equal(conflictingNormalizedPlayerCrosswalk([r("s1",123,"a"),r("s2",123,"b")]),true);
 a.equal(conflictingNormalizedPlayerCrosswalk([r("s1",123,"a"),r("s1",123,"b")]),false);
 a.equal(conflictingNormalizedPlayerCrosswalk([]),false);
 a.equal(conflictingNormalizedPlayerCrosswalk([r(null,123,"a")]),true);
});
