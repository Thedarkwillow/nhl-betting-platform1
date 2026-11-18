"use strict";
const test=require("node:test"),a=require("node:assert/strict"),fs=require("node:fs");
const y=fs.readFileSync(".github/workflows/private-nhl-period-backfill.yml","utf8");
test("official backfill does not lose partial source evidence on an otherwise failed batch",()=>{
 a.match(y,/id: source\n\s+continue-on-error: true/);
 a.match(y,/git add -f outputs\/period-stats\/prior-season-backfill-status-latest\.json/);
 a.match(y,/git add -f "\$pattern"/);
 a.match(y,/if: steps\.source\.outcome == 'success'/);
 a.match(y,/if: steps\.source\.outcome == 'failure'/);
 a.match(y,/failed date stays unverified/);
 assertJobOrder();
});
function assertJobOrder(){
 const collect=y.indexOf("- name: Collect at most five");
 const archive=y.indexOf("- name: Archive isolated source");
 const rebuild=y.indexOf("- name: Rebuild private specialist");
 const fail=y.indexOf("- name: Mark unsuccessful collection");
 a.ok(0<collect&&collect<archive&&archive<rebuild&&rebuild<fail);
}
