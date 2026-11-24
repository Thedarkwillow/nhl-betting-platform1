"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {normalizeOfficialSkaterSummary,mergeOfficialSkaterSummary,skaterSummaryUrl}=
 require("../src/nhl-official-skater-summary.cjs");
const {projectExtraMarket,buildExtraMarketShadow}=
 require("../src/nhl-extra-market-shadow.cjs");
const {estimateExperimentalMarketProbability,sampleHistoricValues}=
 require("../src/nhl-new-market-model.cjs");
const {prepareExperimentalMarketOffer}=require("../src/nhl-experimental-offer-bridge.cjs");
const {validateOffer,resolveMarket,MARKETS}=require("../src/nhl-market-registry.cjs");
const {buildFreeNhlResearch}=require("../src/free-nhl-research.cjs");
const id=2026020264;
test("NHL Stats REST summary identifies full-game ppPoints, not PPG, and signed plusMinus",()=>{
 const url=new URL(skaterSummaryUrl(id));
 assert.equal(url.hostname,"api.nhle.com");
 assert.equal(url.pathname,"/stats/rest/en/skater/summary");
 assert.equal(url.searchParams.get("cayenneExp"),"gameId="+id);
 const stats=normalizeOfficialSkaterSummary({total:2,data:[
  {gameId:id,playerId:1,ppPoints:2,ppGoals:1,plusMinus:-2},
  {gameId:id,playerId:2,ppPoints:0,ppGoals:0,plusMinus:1}
 ]},{gameId:id});
 const players=mergeOfficialSkaterSummary([
  {gameId:id,playerId:1,type:"skater",points:3,plusMinus:-2,powerPlayPoints:null},
  {gameId:id,playerId:2,type:"skater",points:0,plusMinus:1,powerPlayPoints:null},
  {gameId:id,playerId:3,type:"goalie",goalsAgainst:2}
 ],stats,{gameId:id});
 assert.equal(players[0].powerPlayPoints,2);
 assert.equal(players[0].plusMinus,-2);
 assert.equal(players[2].powerPlayPoints,undefined);
 assert.throws(()=>normalizeOfficialSkaterSummary({total:3,data:[]},{gameId:id}),/incomplete/);
 assert.throws(()=>mergeOfficialSkaterSummary([
  {...players[0],plusMinus:2},players[1],players[2]
 ],stats,{gameId:id}),/disagreement/);
 assert.throws(()=>mergeOfficialSkaterSummary([
  {...players[0],points:1},players[1],players[2]
 ],stats,{gameId:id}),/exceed/);
});
test("all listed full-game markets recognized; combo identity cannot be forged",()=>{
 const data={
  powerPlayPoints:"Power Play Points",goalsAgainst:"Goals Allowed",
  plusMinus:"Plus/Minus",shotsOnGoalCombo:"Shots On Goal (Combo)",
  goalieSavesCombo:"Goalie Saves (Combo)",goalsCombo:"Goals (Combo)"};
 for(const [id,label] of Object.entries(data)){
  assert.equal(resolveMarket(label),id);
  assert.equal(MARKETS[id].researchOnly,true);
  assert.equal(validateOffer({market:label,tier:"Standard",side:"Higher"}).eligible,false);
 }
 assert.equal(Object.keys(MARKETS).length,16);
 const hits=validateOffer({market:"Hits",tier:"Standard",side:"Higher",
  playerType:"skater",researchMode:true,modelReady:true,
  exactHistoricalStats:true,providerRuleVerified:true});
 assert.equal(hits.eligible,true);
 assert.equal(hits.productionEligible,false);
 assert.equal(hits.calibrated,false);
 assert.equal(validateOffer({market:"Goals (Combo)",tier:"Standard",side:"Higher",
  researchMode:true,modelReady:true,exactHistoricalStats:true,providerRuleVerified:true,
  exactComboIdentity:true}).reason,"joint_combo_model_not_validated");
 assert.equal(validateOffer({market:"Shots",period:"1st Period",tier:"Standard",side:"Higher"}).reason,
  "non_full_game");
});
test("extra-market projections exclude future dates and preserve negative plus-minus",()=>{
 const games=Array.from({length:9},(_,i)=>({
  gameId:2026020001+i,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  powerPlayPoints:i%2,plusMinus:i%2===0?-2:2
 }));
 games.push({gameId:2026021111,gameDate:"2026-11-07",
  powerPlayPoints:999,plusMinus:999});
 const result=projectExtraMarket({playerId:1,type:"skater",games},"2026-11-07T00:00:00Z");
 assert.equal(result.projections.plusMinus.observations,9);
 assert.ok(result.projections.plusMinus.estimate<0);
 assert.ok(result.projections.powerPlayPoints.estimate<1);
 assert.equal(result.projections.plusMinus.readyForLivePicks,false);
 const short=projectExtraMarket({playerId:1,type:"skater",games:games.slice(0,7)},
  "2026-11-07T00:00:00Z");
 assert.equal(short.projections.plusMinus.estimate,null);
 const goalie=projectExtraMarket({playerId:2,type:"goalie",
  games:games.slice(0,9).map(g=>({...g,goalsAgainst:2}))},"2026-11-07T00:00:00Z");
 assert.equal(goalie.projections.goalsAgainst.estimate,2);
 const shadow=buildExtraMarketShadow({players:{"1":{playerId:1,type:"skater",games}}},
  {asOf:"2026-11-07T00:00:00Z"});
 assert.equal(shadow.sourceCoverage.plusMinus.readyPlayers,1);
 assert.equal(shadow.productionChampionChanged,false);
});
test("new signed/continuous/Poisson estimators do not invent zero-tail certainty",()=>{
 const counts=estimateExperimentalMarketProbability({market:"hits",
  mean:2.5,line:1.5,samples:Array.from({length:8},()=>2)});
 assert.equal(counts.distribution,"poisson-exploratory");
 assert.ok(counts.higher>counts.lower);
 const plus=estimateExperimentalMarketProbability({market:"plusMinus",
  mean:-0.5,line:-0.5,samples:[-3,-2,-1,-1,0,1,1,2]});
 assert.equal(plus.distribution,"empirical-smoothed-research-v1");
 assert.ok(plus.higher>0&&plus.lower>0);
 const fantasy=estimateExperimentalMarketProbability({market:"prizePicksGoalieFantasyScore",
  mean:1,line:0,samples:[-6,-3,-2,-1,0,1,2,6]});
 assert.ok(fantasy.higher>0&&fantasy.lower>0);
 const toi=estimateExperimentalMarketProbability({market:"timeOnIceSeconds",
  mean:1120,line:1080,samples:[950,1000,1100,1200,1250,1180,1060,1160]});
 assert.equal(toi.distribution,"normal-toi-research-v1");
 assert.ok(toi.higher>0&&toi.lower>0);
 assert.equal(estimateExperimentalMarketProbability({market:"timeOnIceSeconds",
  mean:1120,line:1050,samples:[950,1000]}),null);
});
test("source + history + model date gate applies before research pick eligibility",()=>{
 const history={playerId:1,type:"skater",games:Array.from({length:9},(_,i)=>({
  gameId:id+i,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  hits:3,plusMinus:i%2===0?-1:1,powerPlayPoints:i%2,
  timeOnIceSeconds:1000
 }))};
 const p={playerId:1,name:"A. Skater",team:"NYR",type:"skater"};
 const capture="2026-11-06T18:00:00Z",game="2026-11-07T02:00:00Z";
 const priority={builtAt:"2026-11-06T17:00:00Z",players:{"1":{projections:{
  hits:{projection:3,readyForResearch:true,observations:9},
  timeOnIceSeconds:{projection:1000/60,readyForResearch:true,observations:9}}}}};
 const extra={builtAt:"2026-11-06T17:00:00Z",players:{"1":{projections:{
  plusMinus:{estimate:0,readyForResearch:true,observations:9},
  powerPlayPoints:{estimate:.4,readyForResearch:true,observations:9}}}}};
 const extension={priorityShadow:priority,extraShadow:extra,
  officialHistory:{players:{"1":history}}};
 const row={line:2.5,capturedAt:capture,eventStartsAt:game,
  unit:"minutes",overtimeTreatment:"includes_official_full_game"};
 const x=prepareExperimentalMarketOffer({market:"hits",player:p,row,
  source:"PrizePicks",extension});
 assert.equal(x.eligible,true);
 assert.equal(x.experimentalResearchOnly,true);
 assert.equal(x.probabilities.calibrated,false);
 assert.equal(prepareExperimentalMarketOffer({market:"plusMinus",player:p,
  row:{...row,line:-.5},source:"PrizePicks",extension}).eligible,true);
 assert.equal(prepareExperimentalMarketOffer({market:"timeOnIceSeconds",player:p,
  row:{...row,unit:undefined},source:"PrizePicks",extension}).reason,
  "toi_platform_overtime_or_unit_unverified");
 assert.equal(prepareExperimentalMarketOffer({market:"hits",player:p,row,
  source:"PrizePicks",extension:{...extension,priorityShadow:{
   ...priority,builtAt:"2026-11-07T03:00:00Z"}}}).reason,
  "experimental_shadow_was_not_frozen_before_offer");
});
test("experimental side is auto-ranked only with optional official shadow and current pregame source",()=>{
 const now="2026-11-06T18:00:00Z";
 const skater={playerId:1,name:"A. Skater",team:"NYR",type:"skater",
  latestGameDate:"2026-10-09",projections:{shotsOnGoal:{
   estimate:3.5,observations:9,ready:true,last5:3,last10:3.5}}};
 const history={playerId:1,name:"A. Skater",type:"skater",games:Array.from(
  {length:9},(_,i)=>({gameId:id+i,gameDate:"2026-10-"+String(i+1).padStart(2,"0"),
  hits:3,powerPlayPoints:i%2,plusMinus:i%2===0?-1:1}))};
 const extension={
  priorityShadow:{builtAt:"2026-11-06T17:00:00Z",players:{"1":{projections:{
   hits:{projection:3,readyForResearch:true,observations:9}}}}},
  extraShadow:{builtAt:"2026-11-06T17:00:00Z",players:{"1":{projections:{
   powerPlayPoints:{estimate:.44,readyForResearch:true,observations:9},
   plusMinus:{estimate:-.1,readyForResearch:true,observations:9}}}}},
  officialHistory:{players:{"1":history}}};
 const projections={builtAt:"2026-11-06T17:00:00Z",players:{"1":skater}};
 const row={player:"Alex Skater",team:"NYR",matchup:"BOS",
  market:"Hits",line:2.5,tier:"Standard",side:"Higher",
  observedAt:"2026-11-06T17:59:00Z",
  capturedAt:"2026-11-06T17:59:30Z",
  eventStartsAt:"2026-11-07T02:00:00Z",period:"Full game"};
 const board={generatedAt:now,provider:"prizepicksapi.com",
  completePagination:true,rows:[row,{...row,market:"Plus/Minus",line:-.5}]};
 const off=buildFreeNhlResearch(board,projections,now);
 assert.equal(off.matchedRows,0);
 const on=buildFreeNhlResearch(board,projections,now,null,null,extension);
 assert.equal(on.matchedRows,2);
 assert.ok(on.rankedProps.every(x=>x.experimentalMarketResearchOnly===true));
 assert.ok(on.rankedProps.every(x=>x.probabilityCalibrated===false));
 assert.ok(on.rankedProps.some(x=>x.market==="plusMinus"&&x.line===-.5));
 assert.ok(on.rankedProps.every(x=>x.expectedValue===null));
 assert.equal(on.lineups[2],null); // same player must not form a 2-pick slip.
});


test("2-6 research optimizer accepts new individual categories but quarantines period/combo props",()=>{
 const {optimize}=require("../src/nhl-lineup-optimizer.cjs");
 const time="2026-11-06T18:00:00Z",base={
  tier:"Standard",lean:"Higher",probability:.67,
  capturedAt:"2026-11-06T17:59:30Z",
  observedAt:"2026-11-06T17:59:00Z",
  eventStartsAt:"2026-11-07T02:00:00Z",
  experimentalMarketResearchOnly:true,
  probabilityCalibrated:false,expectedValue:null
 };
 const props=[
  {...base,playerId:1,market:"hits",matchup:"NYR vs BOS"},
  {...base,playerId:2,market:"powerPlayPoints",probability:.7,matchup:"BUF vs OTT"},
  {...base,playerId:3,market:"shotsOnGoalCombo",probability:.99,
   memberPlayerIds:[3,4],matchup:"TOR vs MTL"},
  {...base,playerId:5,market:"goals",period:"1st period",
   probability:.99,matchup:"FLA vs WSH"}
 ];
 const slips=optimize(props,{at:time});
 assert.equal(slips[2].status,"research_only");
 assert.deepEqual(new Set(slips[2].picks.map(p=>p.playerId)),new Set([1,2]));
 assert.equal(slips[2].probability,null);
 assert.equal(slips[2].expectedValue,null);
 assert.equal(slips[3],null);
});
test("same-game experimental props disclose offensive and goalie interaction risk",()=>{
 const {inspectLineupDependencies}=require("../src/nhl-lineup-correlation-evidence.cjs");
 const matchup="NYR vs BOS | 2026-11-07T02:00:00Z";
 const picks=[
  {market:"powerPlayPoints",team:"NYR",matchup},
  {market:"points",team:"NYR",matchup},
  {market:"goalsAgainst",team:"BOS",matchup},
  {market:"plusMinus",team:"NYR",matchup}
 ];
 const report=inspectLineupDependencies(picks);
 assert.equal(report.sharedGamePairs,6);
 assert.ok(report.pairs.flatMap(p=>p.signals).includes(
  "shared_offensive_scoring_event_risk"));
 assert.ok(report.pairs.flatMap(p=>p.signals).includes(
  "goalie_against_opponent_scoring_shots_interaction"));
 assert.ok(report.pairs.flatMap(p=>p.signals).includes(
  "shared_game_score_state_plusminus_risk"));
 assert.equal(report.calibratedCorrelationCoefficients,false);
});
