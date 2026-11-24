"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {freezeSimpleBenchmarks,makeForecast,cachedPastSamples}=
 require("../src/nhl-simple-pregame-challengers.cjs");
const {score,evaluate}=require("../src/nhl-frozen-simple-challenger-grader.cjs");
const {recoveryGate}=require("../src/nhl-no-credit-freeze-recovery.cjs");
const {stablePickId}=require("../src/nhl-roadmap-foundations.cjs");
const capture="2026-11-08T14:00:00Z",commit="2026-11-08T14:01:00Z",
 start="2026-11-09T01:00:00Z";
const pick=(id=5,options={})=>({gameId:555,playerId:id,market:"shotsOnGoal",
 line:2.5,tier:"Standard",lean:"Higher",gameStartAt:start,
 capturedAt:"2026-11-08T13:59:00Z",...options});
const games=()=>Array.from({length:10},(_,i)=>({
 gameId:10+i,gameDate:"2026-10-"+String(10+i),
 shotsOnGoal:3,blockedShots:1,goals:0,points:1,assists:1}));
const history={players:{"5":{type:"skater",playerId:5,games:games()}}};
test("both simple mean sides and consensus are frozen on original Standard offer only",()=>{
 const report=freezeSimpleBenchmarks([pick()],history,{now:capture});
 assert.equal(report.originalStandardSelections,1);
 const row=report.rows[0];
 assert.equal(row.strategies.last5,"Higher");
 assert.equal(row.strategies.last10,"Higher");
 assert.equal(row.strategies.consensus5And10MarginHalf,"Higher");
 assert.equal(row.means.last5,3);
 assert.equal(row.means.last10,3);
 assert.equal(report.originalPlatformSidesAuthenticated,false);
 assert.equal(freezeSimpleBenchmarks([pick(5,{tier:"Demon"})],history,{now:capture}).rows.length,0);
});
test("reject even official same-day or future results and impossible duplicated game history",()=>{
 const more={players:{"5":{type:"skater",games:[
 ...games(),{gameId:100,gameDate:"2026-11-08",shotsOnGoal:100},
 {gameId:101,gameDate:"2026-11-09",shotsOnGoal:100}]}}};
 const r=makeForecast(pick(),more,capture);
 assert.equal(r.means.last5,3);
 assert.equal(r.strategies.last10,"Higher");
 const bad={players:{"5":{type:"skater",games:[...games(),games()[0]]}}};
 assert.equal(cachedPastSamples(bad,pick(),capture).length,0);
 assert.equal(makeForecast(pick(),bad,capture).strategies.last5,null);
});
test("no historical games, exact mean ties, or short history produce an abstention",()=>{
 const insufficient={players:{"5":{type:"skater",games:games().slice(0,4)}}};
 const r=makeForecast(pick(),insufficient,capture);
 assert.equal(r.strategies.last5,null);
 assert.equal(r.strategies.last10,null);
 assert.equal(r.strategies.consensus5And10MarginHalf,null);
 const tied=makeForecast(pick(5,{line:3}),history,capture);
 assert.equal(tied.strategies.last5,null);
 assert.equal(tied.strategies.consensus5And10MarginHalf,null);
});
test("never reconstruct a pregame benchmark after puck drop",()=>{
 assert.equal(makeForecast(pick(),history,"2026-11-09T01:10:00Z"),null);
 assert.throws(()=>freezeSimpleBenchmarks([pick()],history,{now:"bad"}));
 assert.throws(()=>freezeSimpleBenchmarks([pick(),pick()],history,{now:capture}),/Duplicate/);
});
function ledger(entries){
 const counts={registered:entries.length,correct:0,incorrect:0,push:0,pending:0};
 for(const r of entries)counts[r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus]++;
 return {kind:"private_immutable_source_linked_nhl_selected_predictions",
  cohort:"explicit_original_Git_precommitted_standalone_model_directions",
  records:entries,counts};
}
function entry(p,status="correct",outcome="Higher"){
 return {...p,id:stablePickId(p),tier:"Standard",selectedSide:p.lean,
  firstGitCommittedAt:commit,firstResearchAt:capture,
  gameStartAt:start,selectionStatus:status,officialResult:outcome,
  officialStat:outcome==="Higher"?4:outcome==="Lower"?1:2.5};
}
function frame(p,forecast){
 return {gitHistoryCount:1,firstCommittedAt:commit,
  snapshot:{generatedAt:capture,individualPropSelections:[p],
    simplePregameBenchmarks:forecast}};
}
test("post-policy original Git-frozen last5/10 are scored on exact same selected Standard line",()=>{
 const p=pick(),f=freezeSimpleBenchmarks([p],history,{now:capture});
 const r=evaluate(ledger([entry(p)]),[frame(p,f)],{
  firstPolicyCommittedAt:"2026-11-08T13:00:00Z"});
 assert.equal(r.uniqueFrozenSelectedMatchCount,1);
 assert.equal(r.fullyFrozenFutureCohort,true);
 assert.equal(r.strategyComparison.last5.decidedOnCoveredLines,1);
 assert.equal(r.strategyComparison.last5.challengerWins,1);
 assert.equal(r.strategyComparison.last5.modelWinsOnSameCoveredLines,1);
 assert.equal(r.strategyComparison.consensus5And10MarginHalf.challengerHitRate,1);
 assert.equal(r.bettingEdgeEstablished,false);
 assert.equal(r.originalPlatformOfferAvailableSidesAuthenticated,false);
});
test("declared-only future comparisons never relabel historical or mutated snapshot picks",()=>{
 const p=pick(),f=freezeSimpleBenchmarks([p],history,{now:capture});
 const r=evaluate(ledger([entry(p)]),[frame(p,f)],{
  firstPolicyCommittedAt:"2026-11-08T14:02:00Z"});
 assert.equal(r.originalFrozenFutureStandardSelectionCount,0);
 assert.equal(r.uniqueFrozenSelectedMatchCount,0);
 assert.throws(()=>evaluate(ledger([entry(p)]),[frame(p,{...f,rows:[{...f.rows[0],
  modelSelectedSide:"Lower"}]})],{firstPolicyCommittedAt:"2026-11-08T13:00:00Z"}),
  /mismatched/);
 assert.throws(()=>evaluate(ledger([entry(p)]),[{
  ...frame(p,f),gitHistoryCount:2}],{firstPolicyCommittedAt:"2026-11-08T13:00:00Z"}),
  /invalid_single_commit/);
});
test("challenger abstentions are counted, not quietly excluded from original model cohort",()=>{
 const p=pick(),f=freezeSimpleBenchmarks([p],{players:{}},{now:capture});
 const r=evaluate(ledger([entry(p)]),[frame(p,f)],{
  firstPolicyCommittedAt:"2026-11-08T13:00:00Z"});
 assert.equal(r.archivedStandardSelections,1);
 assert.equal(r.strategyComparison.last5.decidedOnCoveredLines,0);
 assert.equal(r.strategyComparison.last5.abstainedOnAllOriginalStandardSelections,1);
 assert.equal(r.strategyComparison.last5.challengerHitRate,null);
});
test("preflight never requests new paid boards, deduplicates verified freezes and blocks stale source",()=>{
 const board={provider:"prizepicksapi.com",sourceStatus:"fresh",
  completePagination:true,requestedScheduledSlotPacific:"06:00",
  generatedAt:"2026-11-08T14:02:00Z",rows:[{projectionId:"a"}]};
 const at="2026-11-08T14:10:00Z";
 assert.equal(recoveryGate({now:at,board}).recover,true);
 assert.equal(recoveryGate({now:at,board}).providerQuoteRequestsAuthorized,0);
 assert.equal(recoveryGate({now:at,board,alreadyFrozen:3}).recover,false);
 assert.equal(recoveryGate({now:"2026-11-08T14:45:00Z",board}).recover,false);
 assert.equal(recoveryGate({now:at,board:{...board,completePagination:false}}).recover,false);
 assert.equal(recoveryGate({now:at,board:{...board,generatedAt:"2026-11-07T14:02:00Z"}}).recover,false);
});
test("github automation cannot use a provider key in the no-credit repair workflow",()=>{
 const fs=require("node:fs"),path=require("node:path");
 const wf=fs.readFileSync(path.join(__dirname,"../.github/workflows/nhl-no-credit-pregame-freeze-recovery.yml"),"utf8");
 assert.match(wf,/workflow_run:/);
 assert.match(wf,/node scripts\/build-free-nhl-research\.cjs/);
 assert.match(wf,/node scripts\/verify-nhl-frozen-pregame-commit\.cjs/);
 assert.doesNotMatch(wf,/PRIZEPICKSAPI_KEY|collect-prizepicks-asof-nhl|secrets\.PRIZEPICKS/);
 assert.match(wf,/if: failure\(\)/);
});
