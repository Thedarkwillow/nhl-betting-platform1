"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs");
const source=fs.readFileSync(require("node:path").join(__dirname,"../scripts/expand-oddspapi-nhl-history.cjs"),"utf8");
test("OddsPapi backfill retains prior archive and limits free requests",()=>{
 assert.match(source,/archive-expanded-latest\.json/);
 assert.match(source,/if\(done\.has\(key\)\)continue/);
 assert.match(source,/fixtureCalls>=8/);
 assert.match(source,/historyCalls>=40/);
 assert.match(source,/existing\.has\(f\.fixtureId\)/);
});
