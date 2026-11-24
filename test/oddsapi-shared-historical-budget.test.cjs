"use strict";
const assert=require("node:assert/strict"),test=require("node:test");
const {MAX_COMBINED_HISTORICAL_CREDITS,readSpent,status,canSpend}=
 require("../scripts/oddsapi-shared-historical-budget.cjs");
test("combined historical cap covers fall and all-prop collectors",()=>{
 assert.equal(MAX_COMBINED_HISTORICAL_CREDITS,2500);
 const s=status({fall:458,all:344});
 assert.equal(s.combinedCredits,802);
 assert.equal(s.remainingCombinedCredits,1698);
 assert.equal(s.accountReserveCredits,350);
});
test("fall uncommitted spend counts toward combined cap before another paid request",()=>{
 assert.equal(canSpend(10,{override:{fall:980,all:1510},fallUncommitted:0,accountRemaining:10000}).allowed,true);
 const stopped=canSpend(11,{override:{fall:980,all:1510},accountRemaining:10000});
 assert.equal(stopped.allowed,false);
 assert.equal(stopped.reason,"historical_shared_cap");
 const buffered=canSpend(10,{override:{fall:1000,all:1480},fallUncommitted:20,accountRemaining:10000});
 assert.equal(buffered.allowed,false);
});
test("provider monthly reserve must survive each call",()=>{
 assert.equal(canSpend(20,{override:{fall:0,all:0},accountRemaining:369}).reason,"provider_credit_reserve");
 assert.equal(canSpend(20,{override:{fall:0,all:0},accountRemaining:370}).allowed,true);
 assert.equal(canSpend(1,{override:{fall:0,all:0},accountRemaining:null}).allowed,false);
});
test("invalid, truncated or missing spend totals fail closed",()=>{
 const fake={existsSync:()=>true,readFileSync:()=>"{invalid"};
 assert.throws(()=>readSpent("/any/partial/progress.json",fake),/Invalid shared history budget state/);
 const bad={existsSync:()=>true,readFileSync:()=>JSON.stringify({creditsSpentTotal:-5})};
 assert.throws(()=>readSpent("/any/partial/progress.json",bad),/Missing or invalid/);
 assert.throws(()=>status({fall:-1,all:0}),/Invalid shared/);
 assert.equal(readSpent("/not-present",{existsSync:()=>false}),0);
});
test("rejects invalid values instead of allowing unlimited API credits",()=>{
 assert.throws(()=>canSpend(-1,{override:{fall:0,all:0}}),/Invalid anticipated/);
 assert.throws(()=>canSpend(1,{fallUncommitted:-2,override:{fall:0,all:0}}),/Invalid anticipated/);
});

test("both paid historical workflows serialize and do not run from code pushes",()=>{
 const fs=require("node:fs"),path=require("node:path");
 for(const file of [
  "backfill-2025-26-fall-prizepicks-odds-api.yml",
  "collect-2025-26-all-nhl-prizepicks-markets.yml"
 ]){
  const y=fs.readFileSync(path.resolve(__dirname,"../.github/workflows/"+file),"utf8");
  assert.match(y,/group: shared-nhl-2025-26-oddsapi-paid-history/);
  assert.match(y,/workflow_dispatch:/);
  assert.match(y,/schedule:/);
  assert.doesNotMatch(y,/^  push:/m);
  assert.match(y,/cancel-in-progress: false/);
 }
});
test("both paid clients consult the shared cap ahead of each charge",()=>{
 const fs=require("node:fs"),path=require("node:path");
 for(const file of [
  "backfill-2025-26-fall-prizepicks-odds-api.cjs",
  "collect-2025-26-all-prizepicks-nhl-markets.cjs"
 ]){
  const s=fs.readFileSync(path.resolve(__dirname,"../scripts/"+file),"utf8");
  assert.match(s,/require\("\.\/oddsapi-shared-historical-budget\.cjs"\)/);
  assert.ok((s.match(/canSpendShared\(/g)||[]).length>=2);
 }
});
