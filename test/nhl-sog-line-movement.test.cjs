"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {COLUMNS}=require("../src/partner-prizepicks-board.cjs");

const {exactPair,buildMovementContext,candidateArchives,loadStoredNhl}=
 require("../src/nhl-sog-line-movement.cjs");
const {sogOpportunity,sogMovement}=require("../src/nhl-sog-opportunity-challengers.cjs");
const {buildPartnerPregameFreeze}=require("../src/nhl-partner-pregame-freeze.cjs");
const {evaluateOne}=require("../src/nhl-standard-triple-challenger.cjs");
const {compare}=require("../src/nhl-standard-triple-challenger-grader.cjs");
const NOW="2026-11-12T17:00:00Z",START="2026-11-12T21:00:00Z";
const ID="source-projection-123",SOURCE="partner-api.prizepicks.com";
const prop={gameId:2026020993,playerId:200001,providerPlayerId:"pp-200001",
 providerGameId:"g-200",projectionId:ID,player:"Test Skater",team:"TOR",
 opponent:"NJD",market:"shotsOnGoal",line:3.5,tier:"Standard",lean:"Higher",
 projection:3.2,probability:.65,gameStartAt:START,eventStartsAt:START,
 capturedAt:"2026-11-12T16:57:00Z",model:"weighted-form-v1"};
const hist={players:{"200001":{type:"skater",playerId:200001,
 games:Array.from({length:12},(_,i)=>({
  playerId:200001,gameId:2026020100+i,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  gameState:"OFF",type:"skater",team:"TOR",shotsOnGoal:i%4+1,
  timeOnIceSeconds:1000+i*15
 }))}}};
const row=(line,time,side="Higher",id=ID)=>({
 projectionId:id,providerPlayerId:"pp-200001",providerGameId:"g-200",
 player:"Test Skater",team:"TOR",matchup:"NJD",market:"Shots On Goal",
 eventStartsAt:START,line,tier:"Standard",period:"Full game",side,
 isLive:false,capturedAt:time,observedAt:"2026-11-12T13:00:00Z",
 source:"prizepicks_partner_direct",provider:SOURCE
});
const prior=[row(2.5,"2026-11-12T15:00:00Z"),row(2.5,"2026-11-12T15:00:00Z","Lower")];
const current=[row(3.5,prop.capturedAt),row(3.5,prop.capturedAt,"Lower")];
const official=(move=null)=>{
 const p={...prop,probabilities:{higher:.65,lower:.35}};
 return evaluateOne(p,hist,{asOf:NOW,movementEvidence:move});
};
test("Movement requires exact unchanged source identity and both offered sides",()=>{
 const good=exactPair(prop,current,prior);
 assert.equal(good.status,"exact_pregame_same_offer_quote");
 assert.equal(good.deltaLine,1);
 assert.equal(good.direction,"increased");
 assert.equal(good.sourceUpdatedAtIsNotObservationTime,true);
 for(const bad of [
  prior.map(r=>({...r,projectionId:"relisted-new-id"})),
  prior.map(r=>({...r,providerPlayerId:"unrelated"})),
  prior.map(r=>({...r,providerGameId:"other-game"})),
  prior.map(r=>({...r,eventStartsAt:"2026-11-12T22:00:00Z"})),
  prior.map(r=>({...r,tier:"Goblin"})),
  prior.map(r=>({...r,market:"Assists"})),
  prior.map(r=>({...r,team:"BOS"})),
  prior.map(r=>({...r,player:"Other Skater"})),
  [prior[0]],
  [...prior,prior[0]],
  prior.map(r=>({...r,observedAt:"2026-11-12T23:00:00Z"}))
 ]){
  assert.notEqual(exactPair(prop,current,bad).status,"exact_pregame_same_offer_quote");
 }
 assert.equal(exactPair(prop,current,[]).status,
  "same_provider_offer_id_absent_in_previous_observation");
 assert.equal(exactPair({...prop,line:2.5},current,prior).status,
  "ambiguous_or_changed_offer_identity_or_side_availability");
});
test("Movement is a third unfitted shadow; neither original sides nor models change",()=>{
 const m={...exactPair(prop,current,prior),
  previousObservedAt:"2026-11-12T15:00:00Z",
  currentObservedAt:prop.capturedAt};
 const base=official();
 assert.equal(base.variants.sogMovement.status,"no_verified_original_line_movement");
 const added=official(m);
 assert.equal(added.variants.sogMovement.status,"research_only");
 assert.equal(added.variants.sogMovement.additiveLineAdjustment,.25);
 assert.equal(added.variants.sogMovement.estimate,
   Number((added.variants.sogOpportunity.estimate+.25).toFixed(6)));
 assert.deepEqual(added.variants.sogOpportunity,base.variants.sogOpportunity);
 assert.deepEqual(added.variants.sogAttempts,base.variants.sogAttempts);
 assert.equal(added.originalSelectedSide,"Higher");
 assert.equal(added.automaticRecommendationEligible,false);
 assert.equal(added.variants.sogMovement.verifiedPlatformSettlement,false);
 const reversed={...m,currentObservedAt:"2026-11-12T14:00:00Z"};
 assert.equal(sogMovement(prop,added.variants.sogOpportunity,reversed).status,
  "inconsistent_quote_movement_chronology");
});
function root(){
 return fs.mkdtempSync(path.join(os.tmpdir(),"sog-movement-"));
}
function fixture(dir,stamp,observed,score,changeId=ID){
 const today="2026-11-12",rel="outputs/manual-board-captures/"+today+"/"+stamp;
 const out=path.join(dir,rel);fs.mkdirSync(out,{recursive:true});
 const started=new Date(Date.parse(observed)-3000).toISOString();
 const finished=new Date(Date.parse(observed)+3000).toISOString();
 const entry={sport:"NHL",leagueId:8,rawCount:1,normalizedCount:1,parts:1,
 source:"https://partner-api.prizepicks.com/projections?league_id=8&per_page=250&single_stat=true",
 sourceObservedAt:observed};
 const nfl={...entry,sport:"NFL",leagueId:9,
  source:"https://partner-api.prizepicks.com/projections?league_id=9&per_page=250&single_stat=true"};
 const manifest={schemaVersion:1,source:SOURCE,snapshotMode:"direct_live_board",
  completePagination:true,captureStartedUTC:started,captureFinishedUTC:finished,
  pacificDate:today,notSixOrNineAmSlot:true,captureSlotPacific:null,
  columns:COLUMNS,sports:[entry,nfl]};
 const raw={projectionId:changeId,providerPlayerId:"pp-200001",
  player:"Test Skater",team:"TOR",position:"C",providerGameId:"g-200",
  gameExternalId:null,eventStartsAt:START,opponent:"NJD",
  market:"Shots On Goal",line:score,tier:"standard",
  offeredWagerTypes:"under_or_over",boardTime:null,
  lineUpdatedAt:"2026-11-12T13:00:00Z",status:"pre_game",
  inGame:false,isLive:false,eventType:null,period:"Full",groupKey:null,combo:false};
 const chunk=(sport)=>({sport,startIndex:0,observedAtUTC:observed,
  rows:[COLUMNS.map(x=>raw[x])]});
 fs.writeFileSync(path.join(out,"manifest.json"),JSON.stringify(manifest));
 for(const sport of ["NHL","NFL"])fs.writeFileSync(path.join(out,sport.toLowerCase()+"-01.json"),
  JSON.stringify(chunk(sport)));
 return {rel,manifest};
}
test("Only latest complete previous source wins; chronology and first Git archived",()=>{
 const dir=root();
 try{
  const earliest=fixture(dir,"20261112T144003Z","2026-11-12T14:40:00Z",1.5);
  const earlier=fixture(dir,"20261112T150003Z","2026-11-12T15:00:00Z",2.5);
  const newer=fixture(dir,"20261112T165703Z",prop.capturedAt,3.5);
  const a=loadStoredNhl(newer.rel,{root:dir,now:NOW});
  const opts=candidateArchives(newer.rel,newer.manifest,{root:dir});
  assert.equal(opts.length,2);
  assert.equal(opts[0].rel,earlier.rel);
  const f=(rel)=>rel===earlier.rel?"2026-11-12T15:00:04Z":
   rel===newer.rel?"2026-11-12T16:57:04Z":"2026-11-12T14:40:04Z";
  const ctx=buildMovementContext(newer.rel,a,{asOf:NOW,root:dir,firstCommit:f});
  assert.equal(ctx.status,"ready_exact_match_only");
  const evidence=ctx.matchFor(prop);
  assert.equal(evidence.status,"exact_pregame_same_offer_quote");
  assert.equal(evidence.deltaLine,1); // NOT the 1.5 alternative earlier capture
  assert.equal(evidence.previousArchive,earlier.rel);
  assert.equal(evidence.notAppExecutionEvidence,true);
  const late=buildMovementContext(newer.rel,a,{asOf:NOW,root:dir,
   firstCommit:rel=>rel===newer.rel?"2026-11-12T22:00:00Z":f(rel)});
  assert.equal(late.status,"current_source_not_original_git_archived_before_freeze");
  const missing=fixture(dir,"20261112T163003Z","2026-11-12T16:30:00Z",
   3.5,"different-id");
  const chosen=buildMovementContext(newer.rel,a,{asOf:NOW,root:dir,
   firstCommit:rel=>rel===missing.rel?"2026-11-12T16:30:04Z":f(rel)});
  assert.equal(chosen.matchFor(prop).status,
   "same_provider_offer_id_absent_in_previous_observation");
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("Original snapshot attaches new research movement on exact offered SOG quote",()=>{
 const evidence={...exactPair(prop,current,prior),provider:SOURCE,
  previousObservedAt:"2026-11-12T15:00:00Z",currentObservedAt:prop.capturedAt};
 const movementContext={kind:"nhl_standard_sog_exact_partner_source_movement_v1",
   status:"ready_exact_match_only",currentObservedAt:prop.capturedAt,
   previousObservedAt:evidence.previousObservedAt,matchFor:()=>evidence};
 const board={provider:SOURCE,snapshotMode:"direct_live_board",
  sourceScope:"full_provider_board",sourceStatus:"fresh",completePagination:true,
  boardAsOfAt:prop.capturedAt,originalModelSelectionGitFrozen:false};
 const projections={players:{"200001":{}},builtAt:"2026-11-12T15:00:00Z"};
 const schedule={complete:true,games:[
  {id:prop.gameId,home:"NJD",away:"TOR",startTimeUTC:START}]};
 const fakeBuild=()=>({boardFresh:true,projectionsFresh:true,source:SOURCE,
  rankedProps:[{...prop,matchup:"NJD vs TOR | "+START,
   probabilities:{higher:.65,lower:.35},model:"weighted-form-v1",
   probabilitySafety:{researchLineupEligible:true},researchEligibility:"research_only",
   roleEvidence:{eligibleForResearchLineup:true}}]});
 const snap=buildPartnerPregameFreeze(board,projections,schedule,hist,NOW,
  fakeBuild,null,movementContext).snapshot;
 assert.equal(snap.individualPropSelections.length,1);
 assert.equal(snap.individualPropSelections[0].lean,"Higher");
 assert.equal(snap.standardTripleChallenger.rows.length,1);
 const rec=snap.standardTripleChallenger.rows[0];
 assert.equal(rec.variants.sogMovement.status,"research_only");
 assert.equal(rec.variants.sogMovement.sourceOfferMovement.deltaLine,1);
 assert.equal(snap.standardSogLineMovementSource.status,"ready_exact_match_only");
 const frame={snapshot:snap,firstCommittedAt:"2026-11-12T17:01:00Z",gitHistoryCount:1};
 const gradedHist=structuredClone(hist);
 gradedHist.players["200001"].games.push({playerId:200001,gameId:prop.gameId,
  gameDate:"2026-11-12",gameState:"OFF",type:"skater",shotsOnGoal:4});
 const result=compare([frame],gradedHist).actualPrecommitted;
 assert.equal(result.variants.sogMovement.decided,1);
 assert.equal(result.variants.sogMovement.alwaysHigherOnSameLines,1);
 const legacy=structuredClone(snap);
 delete legacy.standardTripleChallenger.rows[0].variants.sogMovement;
 delete legacy.standardTripleChallenger.rows[0].decisions.sogMovement;
 delete legacy.standardTripleChallenger.rows[0].sogMovementPolicyVersion;
 assert.equal(compare([{...frame,snapshot:legacy}],gradedHist)
  .actualPrecommitted.variants.sogMovement.decided,0);
});
