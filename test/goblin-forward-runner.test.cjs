"use strict";
const test=require("node:test"),a=require("node:assert/strict");
const {buildOpponentHistory,sourceEligibility,existingFirstGitSource,previouslyFrozenOriginalKeys,COHORT_FILE,earliestOriginalLineOnly}=require("../scripts/report-goblin-forward.cjs");
function history({bad=false,partial=false}={}){
 const h={players:{}};
 for(let d=1;d<=12;d++)for(let team=0;team<2;team++)
  for(let n=0;n<(partial&&d===12&&team===1?17:18);n++){
   const playerId=10+team*40+n,id=2026020000+d;
   const row={gameId:id,playerId,gameDate:"2026-11-"+String(d).padStart(2,"0"),
    gameState:"FINAL",type:"skater",team:team===0?"BOS":"MTL",
    goals:0,shotsOnGoal:team===1?1:3};
   (h.players[playerId]??={games:[]}).games.push(row);
  }
 if(bad)h.players[10].games[0].goals=9;
 return h;
}
test("blocked shots opponent volume uses only completed prior full rosters",()=>{
 const context=buildOpponentHistory(history(),"2026-11-18T14:05:00Z");
 const bos=context.get("BOS"),mtl=context.get("MTL");
 a.equal(bos.games,12);a.equal(mtl.games,12);
 a.equal(bos.source,"prior_complete_official_games");
 a.ok(bos.ratio<1);
 a.ok(mtl.ratio>1);
 a.ok(Date.parse(bos.knownAt)<Date.parse("2026-11-18T14:05:00Z"));
});
test("incomplete dates and impossible goals are never converted to verified opponent exposure",()=>{
 const a1=buildOpponentHistory(history({partial:true}),"2026-11-18T14:05:00Z");
 a.equal(a1.get("BOS").games,11);
 const a2=buildOpponentHistory(history({bad:true}),"2026-11-18T14:05:00Z");
 a.equal(a2.get("BOS").games,11);
 const tooSoon=buildOpponentHistory(history(),"2026-11-03T14:05:00Z");
 a.equal(tooSoon.get("BOS"),null);
});

test("Nov 18 9am verified NHL uses snapshotKind, not nonexistent kind",()=>{
 const source={at:"2026-11-18T17:06:27Z",data:{
   snapshotKind:"nhl_partner_direct_original_pregame_candidate_unproven_until_first_git_commit",
   generatedAt:"2026-11-18T17:06:21.851Z",boardFresh:true,
   originalModelSelectionGitFrozen:false,boardCoverageComplete:true,
   captureScopeComplete:true,rankedProps:[{tier:"Goblin",market:"shotsOnGoal"}]}};
 const policy={at:"2026-11-18T15:02:00Z"},now="2026-11-18T17:07:24Z";
 assertEligibility(sourceEligibility({policy,source,now}),"eligible_new_original_git_source");
 for(const obj of [
   {...source,data:{...source.data,snapshotKind:undefined}},
   {...source,data:{...source.data,snapshotKind:"wrong_old_kind"}},
   {...source,data:{...source.data,originalModelSelectionGitFrozen:true}},
   {...source,data:{...source.data,boardCoverageComplete:false}}
 ]){
   const x=sourceEligibility({policy,source:obj,now});
   a.equal(x.eligible,false);
   a.equal(x.status,"wrong_original_nhl_snapshot_schema");
 }
 a.equal(sourceEligibility({policy,source:{...source,at:"2026-11-18T17:05:00Z"},now}).eligible,false);
 a.equal(sourceEligibility({policy:{at:"2026-11-18T18:00:00Z"},source,now}).eligible,false);
 a.equal(sourceEligibility({policy,source,now:"2026-11-18T17:38:00Z"}).eligible,false);
 a.equal(sourceEligibility({policy,source:null,now}).eligible,false);
});
function assertEligibility(x,status){a.equal(x.eligible,true);a.equal(x.status,status);}

test("existing first-Git Goblin cohort is not refrozen on repeated 9AM runner",()=>{
 const at="2026-11-18T17:18:06Z",
  file="outputs/research/snapshots/20261118T170621Z.json",
  commit="b978cc7a954881491dbc187332440b673986a7af";
 const original={at,data:{kind:"nhl_goblin_first_git_pending_precommit_v1",
  sourceSnapshotFile:file,sourceCommit:commit,modelPromoted:false,
  records:[{tier:"Goblin",market:"shotsOnGoal",line:1.5}]}};
 const hit=existingFirstGitSource(file,commit,[original]);
 a.equal(hit,original);
 a.equal(existingFirstGitSource(file,"different",[original]),null);
 a.equal(existingFirstGitSource("different",commit,[original]),null);
 a.equal(existingFirstGitSource(file,commit,[{...original,data:{...original.data,records:[]}}]),null);
 a.equal(existingFirstGitSource(file,commit,[{...original,data:{...original.data,modelPromoted:true}}]),null);
 a.equal(existingFirstGitSource(file,commit,[{...original,at:"invalid"}]),null);
});

test("later 9AM same exact original line is not double-frozen, changed threshold remains new",()=>{
 const commit={at:"2026-11-18T17:18:06Z",
  data:{kind:"nhl_goblin_first_git_pending_precommit_v1",modelPromoted:false,
   records:[{tier:"Goblin",sourceRankedKey:"12|34|shotsOnGoal|1.5|Goblin"}]}};
 const keys=previouslyFrozenOriginalKeys([commit]);
 a.equal(keys.has("12|34|shotsOnGoal|1.5|Goblin"),true);
 a.equal(keys.has("12|34|shotsOnGoal|2.5|Goblin"),false);
 a.equal(keys.has("12|34|shotsOnGoal|1.5|Standard"),false);
 a.equal(previouslyFrozenOriginalKeys([{
   ...commit,data:{...commit.data,modelPromoted:true}}]).size,0);
});

test("first-Git archive scanner matches timestamp filenames instead of literal backslash d",()=>{
 a.equal(COHORT_FILE.test("20261118T171804Z.json"),true);
 a.equal(COHORT_FILE.test("20261118T171804Z.json.bak"),false);
 a.equal(COHORT_FILE.test("not-a-frozen-json"),false);
});

test("Nov18 overlapping 9AM first-Git archives count 54 not 162 original thresholds",()=>{
 const a0={sport:"NHL",tier:"Goblin",gameId:500,playerId:4,
   market:"shotsOnGoal",line:1.5,originalSide:"Higher",
   shadowFirstGitAt:"2026-11-18T17:18:06Z",
   sourceSnapshotFile:"outputs/research/snapshots/20261118T170621Z.json"};
 const late={...a0,shadowFirstGitAt:"2026-11-18T17:27:10Z"};
 const latest={...a0,shadowFirstGitAt:"2026-11-18T17:28:12Z"};
 const distinctLine={...latest,line:2.5};
 const r=earliestOriginalLineOnly([late,distinctLine,latest,a0]);
 a.equal(r.rows.length,2);
 a.equal(r.duplicatesQuarantined,2);
 a.equal(r.rows.find(x=>x.line===1.5).shadowFirstGitAt,a0.shadowFirstGitAt);
 a.equal(r.rows.find(x=>x.line===2.5).shadowFirstGitAt,latest.shadowFirstGitAt);
});
