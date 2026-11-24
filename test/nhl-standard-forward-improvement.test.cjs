"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {audit}=require("../src/nhl-standard-forward-diagnostics.cjs");
const {shrink,freeze,grade,KIND,VERSION}=require("../src/nhl-standard-forward-calibration.cjs");
const {study,scoreboard,pairedGameClusterBootstrap,calibrationSummary}=require("../src/nhl-standard-forward-scoreboard.cjs");
const POLICY=require("../src/nhl-frozen-individual-props.cjs").POLICY;
const t="2026-11-13T16:00:00Z",start="2026-11-13T22:00:00Z",at="2026-11-13T15:58:00Z";
function selected(){return {gameId:2026020351,playerId:999901,gameStartAt:start,market:"shotsOnGoal",line:2.5,
 tier:"Standard",lean:"Higher",probability:.7,gameStartAt:start,capturedAt:at};}
function snapshot(){
 const o=selected();
 return {generatedAt:t,individualPropSelectionPolicy:POLICY,
  individualPropSelections:[o],rankedProps:[{...o}]};
}
function frame(){
 const s=snapshot();
 s.standardForwardCalibrationShadow=freeze(s);
 return {snapshot:s,firstCommittedAt:"2026-11-13T16:01:00Z",gitHistoryCount:1};
}
const history={players:{"999901":{games:[{gameId:2026020351,type:"skater",
 gameState:"FINAL",shotsOnGoal:4}]}}};
test("unfitted fixed shrink keeps original side and never includes official outcome at freeze",()=>{
 assert.equal(shrink(.7),.6);
 const s=snapshot(),before=JSON.stringify(s.individualPropSelections);
 const x=freeze(s);
 assert.equal(x.kind,KIND);
 assert.equal(x.policyVersion,VERSION);
 assert.equal(x.rows[0].shrinkProbability,.6);
 assert.equal(x.rows[0].originalSelectedSide,"Higher");
 assert.equal(JSON.stringify(s.individualPropSelections),before);
 assert.equal(x.rows[0].calibrated,false);
 assert.equal(x.rows[0].officialResult,undefined);
 assert.throws(()=>shrink(1));
});
test("original first-Git and pregame proof required, old snapshots earn zero forward credit",()=>{
 const a=frame(),p="2026-11-13T15:00:00Z";
 const done=grade([a],history,{firstPolicyCommit:p});
 assert.equal(done.all.decided,1);
 assert.equal(done.all.originalCorrect,1);
 assert.equal(done.byMarket.shotsOnGoal.decided,1);
 assert.equal(done.all.championPromotionApproved,undefined);
 assert.equal(done.modelPromoted,false);
 assert.equal(grade([{...a,firstCommittedAt:start}],history,{firstPolicyCommit:p}).all.decided,0);
 assert.equal(grade([a],history,{firstPolicyCommit:"2026-11-13T23:00:00Z"}).all.decided,0);
 assert.equal(grade([{...a,snapshot:{...a.snapshot,standardForwardCalibrationShadow:undefined}}],history,{firstPolicyCommit:p}).all.decided,0);
 assert.equal(grade([{...a,gitHistoryCount:2}],history,{firstPolicyCommit:p}).all.decided,0);
});
test("changed frozen selected side, quote, or confidence is rejected, never revised",()=>{
 const a=frame(),p="2026-11-13T15:00:00Z";
 for(const patch of [
  {originalSelectedSide:"Lower"},{originalProbability:.9},
  {shrinkProbability:.95},{originalCapturedAt:"2026-11-13T18:00:00Z"}]){
  const x=structuredClone(a);Object.assign(x.snapshot.standardForwardCalibrationShadow.rows[0],patch);
  assert.equal(grade([x],history,{firstPolicyCommit:p}).all.decided,0);
 }
 assert.throws(()=>freeze({...snapshot(),individualPropSelections:[
  {...selected(),probability:.75}]}));
});
test("uncertainty experiment honors pending official games and never backfills an old frame",()=>{
 const a=frame(),p="2026-11-13T15:00:00Z";
 const pending=grade([a],{players:{}},{firstPolicyCommit:p});
 assert.equal(pending.all.pending,1);
 assert.equal(pending.all.decided,0);
 assert.equal(grade([a,a],history,{firstPolicyCommit:p}).all.decided,1);
});
function frozenLedger(){
 const row=(id,market,side,result,status,stat,p=.65)=>({
  id,gameId:2026020200+Number(id.slice(1)),playerId:999900+Number(id.slice(1)),
  market,line:2.5,tier:"Standard",selectedSide:side,
  estimatedProbability:p,team:"TOR",opponent:"NJD",
  gameStartAt:"2026-11-11T22:00:00Z",
  firstCaptureAt:"2026-11-11T19:40:00Z",
  firstResearchAt:"2026-11-11T19:45:00Z",
  firstGitCommittedAt:"2026-11-11T19:45:05Z",
  selectionStatus:status,officialResult:result,
  officialStat:stat,officialGameDate:"2026-11-11"
 });
 const records=[row("r1","shotsOnGoal","Lower","Higher","incorrect",4,.8),
  row("r2","shotsOnGoal","Higher","Higher","correct",3,.6),
  row("r3","assists","Lower","Lower","correct",1,.65)];
 return {kind:"private_immutable_source_linked_nhl_selected_predictions",
  cohort:"explicit_original_Git_precommitted_standalone_model_directions",
  counts:{registered:3,correct:2,incorrect:1,push:0,pending:0},
  builtAt:"2026-11-12T14:20:00Z",records};
}
test("diagnostics use only originally frozen, reconciled Standard rows and fixed market/side bins",()=>{
 const l=frozenLedger(),r=audit(l);
 assert.equal(r.status,"descriptive_original_precommitted_only");
 assert.equal(r.fullStandard.decided,3);
 assert.equal(r.fullStandard.correct,2);
 assert.equal(r.sogBySelectedSide.Lower.correct,0);
 assert.equal(r.sogByOriginalConfidence["80_to_100_pct"].wrong,1);
 assert.equal(r.byMarket.shotsOnGoal.decided,2);
 assert.equal(r.bySelectedConfidence["80_to_100_pct"].decided,1);
 assert.equal(r.bySelectedConfidence["60_to_69_pct"].decided,2);
 assert.equal(r.byMarketAndSelectedConfidence["shotsOnGoal|80_to_100_pct"].wrong,1);
 assert.equal(r.byMarketAndSelectedSide["shotsOnGoal|Lower"].decided,1);
 assert.equal(r.byMarketAndLineBucket["shotsOnGoal|line_2_0_to_2_5"].decided,2);
 assert.equal(r.actionableModelChangeApproved,false);
 assert.equal(audit({...l,counts:{...l.counts,correct:999}}).status,
  "unavailable_inconsistent_ledger_counts");
 const withPending=structuredClone(l);
 const wait={...withPending.records[0],id:"r4",gameId:2026020204,
  gameStartAt:"2026-11-12T03:00:00Z",
  selectionStatus:"pending_official_player_stats",officialResult:null,officialStat:null,officialGameDate:null};
 withPending.records.push(wait);
 withPending.counts.registered++;withPending.counts.pending++;
 const pacific=audit(withPending);
 assert.equal(pacific.lastCompletedDate.registered,4);
 assert.equal(pacific.lastCompletedDate.decided,3);
 assert.equal(pacific.lastCompletedDate.pending,1);
 const poisoned=structuredClone(l);poisoned.records[0].firstGitCommittedAt=start;
 assert.equal(audit(poisoned).status,"unavailable_invalid_or_repeated_original");
});
function pairedRow(){
 return {gameId:2026020351,playerId:999901,market:"shotsOnGoal",
  gameDate:"2026-11-13",originalSelectedSide:"Higher",
  createdAt:t,outcome:{status:"decided",side:"Higher"},
  shadow:{status:"research_only",generatedAt:t,
   variants:{champion:{status:"research_only",probabilities:{higher:.7,lower:.3}},
    usage:{status:"research_only",probabilities:{higher:.45,lower:.55}}},
   decisions:{champion:{side:"Higher"},usage:{side:"Lower"}}}};
}
test("challenger scoreboard enforces identical frozen line coverage, separate SOG feature abstention",()=>{
 const a=pairedRow(),r=scoreboard([a]);
 assert.equal(r.all.byVariant.champion.decided,1);
 assert.equal(r.all.byVariant.usage.originalChampionCorrect,1);
 assert.equal(r.all.byVariant.usage.challengerCorrect,0);
 assert.equal(r.all.byVariant.sogMovement.decided,0);
 assert.equal(r.byMarket.shotsOnGoal.byVariant.usage.alwaysHigherOnSameLines,1);
 assert.equal(r.all.byVariant.usage.modelPromotionApproved,false);
 assert.throws(()=>scoreboard([{...a,createdAt:"2026-11-14T00:00:00Z"}]));
 assert.equal(study([{...a,outcome:{status:"pending_official_player_stat"}}])
   .byVariant.champion.decided,0);
});

test("paired game-cluster bootstrap preserves games, is deterministic, and reports uncertainty",()=>{
 const rows=[];
 for(let i=0;i<40;i++){
  const actual=i%2===0?"Higher":"Lower";
  const date=new Date(Date.UTC(2026,9,1+Math.floor(i/2))).toISOString();
  rows.push({gameId:2026021000+i,playerId:999000+i,market:"shotsOnGoal",
   gameStartAt:date,createdAt:t,outcome:{status:"decided",side:actual},
   shadow:{variants:{
    champion:{probabilities:{higher:.55,lower:.45}},
    distribution:{status:"research_only",probabilities:{
     higher:actual==="Higher"?.8:.2,lower:actual==="Higher"?.2:.8}}
   },decisions:{champion:{side:"Higher"},
    distribution:{side:actual}}}});
 }
 const a=pairedGameClusterBootstrap(rows,"distribution",{draws:500});
 const b=pairedGameClusterBootstrap(rows,"distribution",{draws:500});
 assert.equal(a.independentGameClusters,40);
 assert.equal(a.draws,500);
 assert.deepEqual(a,b);
 assert.ok(a.intervals.hitRateDelta.lower>0);
 assert.ok(a.intervals.brierDelta.upper<0);
 assert.ok(a.intervals.logLossDelta.upper<0);
 const insufficient=pairedGameClusterBootstrap(rows.slice(0,9),"distribution");
 assert.equal(insufficient.intervals,null);
 assert.equal(insufficient.draws,0);
});

test("fixed-width reliability diagnostics measure Higher probabilities without fitting or changing decisions",()=>{
 const rows=[];
 for(let i=0;i<20;i++){
  const actual=i<15?"Higher":"Lower",p=i<15?.7:.3;
  const r=pairedRow();
  r.gameId=2026022000+Math.floor(i/2);
  r.playerId=999100+i;
  r.outcome={status:"decided",side:actual};
  r.shadow.variants.champion.probabilities={higher:p,lower:1-p};
  r.shadow.decisions.champion.side=actual;
  rows.push(r);
 }
 const report=calibrationSummary(rows,"champion",{bins:5});
 assert.equal(report.eligibleDecisions,20);
 assert.equal(report.populatedBins.length,2);
 assert.equal(report.expectedCalibrationError,.3);
 assert.equal(report.method,"fixed_width_higher_probability_reliability_bins");
 assert.throws(()=>calibrationSummary(rows,"champion",{bins:1}));
 assert.equal(rows[0].shadow.decisions.champion.side,"Higher");
});
