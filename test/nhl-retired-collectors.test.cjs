"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const load=name=>fs.readFileSync(path.resolve(__dirname,"../.github/workflows/"+name),"utf8");
test("retired PickFinder cannot dispatch historical TinyFish source collection",()=>{
 const retired=load("collect-pickfinder-cloud.yml");
 assert.match(retired,/Retired PickFinder/);
 assert.doesNotMatch(retired,/TINYFISH_API_KEY|TINYFISH_PROFILE_ID|scripts\/collect-pickfinder-cloud/);
 assert.match(retired,/No TinyFish requests/);
});
test("legacy market batch fails closed on retired or injected source parameter",()=>{
 const flow=load("collect-nhl-market-batch.yml");
 assert.match(flow,/if: inputs.source == 'prizepicks'/);
 assert.match(flow,/if: inputs.source != 'prizepicks'/);
 assert.doesNotMatch(flow,/^\s+- pickfinder\s*$/m);
});
test("legacy category discovery cannot schedule a PickFinder scan",()=>{
 const flow=load("discover-nhl-categories.yml");
 assert.match(flow,/source: \[prizepicks\]/);
 assert.doesNotMatch(flow,/source: \[pickfinder,/);
});
