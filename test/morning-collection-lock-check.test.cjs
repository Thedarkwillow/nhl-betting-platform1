"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const {scheduledScope,check}=require("../scripts/morning-collection-lock-check.cjs");
const {pin,required}=require("../scripts/nba-esports-prepull-candidate-lock.cjs");
const at="2026-11-25T14:35:00Z",tree="7".repeat(40),scope={day:"2026-11-25",slot:"06:00"};
const doc={kind:"nba_esports_pre_pull_research_candidate_lock_v1",candidateRevision:pin,candidateTree:tree,pacificDate:scope.day,slot:scope.slot,generatedAt:"2026-11-25T13:15:00Z",diagnosticOnly:false,candidateLockDoesNotFreezeForecasts:true,forecastFreezeVerified:false,sports:Object.fromEntries(required.map(s=>[s,{candidateLocked:true}]))};
const lock={first:"2026-11-25T13:20:00Z",doc};
test("cron maps exact Pacific hour including DST and rejects a delayed neighboring slot",()=>{
 assert.deepEqual(scheduledScope("35 6 * * *",at),scope);
 assert.deepEqual(scheduledScope("35 9 * * *","2026-07-25T16:35:00Z"),{day:"2026-07-25",slot:"09:00"});
 assert.throws(()=>scheduledScope("35 6 * * *","2026-11-25T17:35:00Z"),/late/);
 assert.equal(scheduledScope("35 12 * * *",at),null);
});
test("valid lock verifies only code provenance, never source or forecast",()=>{
 const r=check({scope,lock,revision:pin,tree,at});
 assert.equal(r.lockVerified,true);assert.equal(r.forecastFreezeVerified,false);assert.equal(r.sourceAuthenticationVerified,false);
});
test("reject missing, late, diagnostic, wrong revision and wrong tree",()=>{
 const v={scope,lock,revision:pin,tree,at};
 for(const bad of [{lock:null},{lock:{...lock,first:"2026-11-25T13:55:00Z"}},{lock:{...lock,doc:{...doc,diagnosticOnly:true}}},{revision:"a".repeat(40)},{tree:"b".repeat(40)},{at:"2026-11-25T17:00:00Z"}])assert.throws(()=>check({...v,...bad}));
});

test("both existing morning workflows have a pinned checkout and fail-closed guard before execution",()=>{
 const fs=require("node:fs"),path=require("node:path");
 for(const name of ["nba-authorized-research.yml","esports-prospective-private.yml"]){
  const y=fs.readFileSync(path.join(__dirname,"../.github/workflows",name),"utf8");
  for(const s of ["cron: '35 6 * * *'","cron: '35 9 * * *'","ref: "+pin,"path: candidate","node public/scripts/morning-collection-lock-check.cjs archive candidate", name==='nba-authorized-research.yml'?'export NBA_LOCKED_MODEL_ROOT="$GITHUB_WORKSPACE/candidate"':'if [ "$LOCKED_MORNING" = true ]; then code=candidate; fi','--diff-filter=CDMRTUXB',name==='esports-prospective-private.yml'?'git merge-base --is-ancestor HEAD FETCH_HEAD':'git merge-base --is-ancestor HEAD origin/main'])assert.ok(y.includes(s),name+": "+s);
  assert.ok(y.indexOf("Verify morning collection lock and exact revision")<y.indexOf('code=public'));
 }
 const nba=fs.readFileSync(path.join(__dirname,"../.github/workflows/nba-authorized-research.yml"),"utf8");
 assert.ok(nba.indexOf("Preserve completed grade files before collection")<nba.indexOf("Verify morning collection lock and exact revision"));
});
