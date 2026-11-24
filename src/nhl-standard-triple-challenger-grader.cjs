"use strict";
/**
 * Test pre-committed shadow policies without altering champion selections.
 * Distinguish forecasts added to the ORIGINAL private Git snapshot from
 * later retrospective reconstructions of already archived original lines.
 */
const {evaluateOne}=require("./nhl-standard-triple-challenger.cjs");
const {pacificGameDate}=require("./nhl-points-stability-shadow.cjs");
const {pairedResearch}=require("./nhl-paired-shadow-research.cjs");
const {buildOpponentContext}=require("./nhl-opponent-context.cjs");
const MODES=["champion","usage","matchup","distribution","sogOpportunity","sogAttempts","sogMovement","pointsStability"];
const validDateTime=s=>typeof s==="string"&&Number.isFinite(Date.parse(s));
const k=p=>[p.gameId,p.playerId,p.market,p.line,p.tier].join("|");
function officialOutcome(r,history){
 const g=(history?.players?.[String(r.playerId)]?.games||[]).filter(x=>
  x.gameId===r.gameId&&x.type==="skater");
 if(g.length!==1)return {status:"pending_official_player_stat"};
 if(!["FINAL","OFF"].includes(g[0].gameState))
  return {status:"not_verified_final_boxscore"};
 const v=g[0][r.market];
 if(!Number.isInteger(v)||v<0)return {status:"missing_official_market"};
 if(v===r.line)return {status:"push",actual:v};
 return {status:"decided",actual:v,side:v>r.line?"Higher":"Lower"};
}
function provenance(s,firstCommit,historyCount){
 const generated=Date.parse(s?.generatedAt),added=Date.parse(firstCommit);
 return Number.isFinite(generated)&&Number.isFinite(added)&&historyCount===1&&
  added>=generated&&added-generated<15*60000;
}
function shadowFrames(frames,history,{approved=null,mode="original_precommitted_only"}={}){
 if(!Array.isArray(frames)||!history?.players)throw Error("Require original Git frames and official NHL history");
 const seen=new Set(),rows=[],excluded={};
 const skip=reason=>excluded[reason]=(excluded[reason]||0)+1;
 for(const frame of frames.sort((a,b)=>Date.parse(a.firstCommittedAt)-Date.parse(b.firstCommittedAt))){
  const s=frame?.snapshot,at=s?.generatedAt;
  if(!provenance(s,frame?.firstCommittedAt,frame?.gitHistoryCount)){
   skip("no_single_original_git_precommit");continue;
  }
  const present=mode==="original_precommitted_only";
  if(present&&s?.standardTripleChallenger?.kind!=="nhl_standard_precommitted_three_challengers_v1"){
   skip("shadow_not_in_original_snapshot");continue;
  }
  const selected=(s?.individualPropSelections||[]).filter(x=>x.tier==="Standard");
  const frozen=present?s.standardTripleChallenger.rows:[];
  if(present&&(frozen.length!==selected.length||
    s.standardTripleChallenger.originalSnapshotGeneratedAt!==at||
    s.standardTripleChallenger.createdAt!==at)){
   skip("shadow_not_in_original_snapshot");continue;
  }
  const contexts=new Map(),originalMap=new Map(selected.map(x=>[k(x),x]));
  if(originalMap.size!==selected.length){skip("duplicate_original_standard_selection");continue;}
  for(const original of selected){
   const id=k(original),pick=frozen.filter(x=>k(x)===id);
   if(present&&pick.length!==1){skip("missing_frozen_shadow_entry");continue;}
   const matching=(s.rankedProps||[]).filter(x=>k(x)===id&&x.lean===original.lean&&
    x.capturedAt===original.capturedAt);
   if(matching.length!==1){skip("unverified_original_selected_side");continue;}
   const raw=matching[0],start=Date.parse(original.gameStartAt);
   if(!Number.isFinite(start)||Date.parse(at)>=start-15*60000||
    Date.parse(frame.firstCommittedAt)>=start-15*60000||
    Date.parse(original.capturedAt)>Date.parse(at)||
    Date.parse(original.capturedAt)>=start){
    skip("not_15min_genuine_pregame");continue;
   }
   const key=[original.gameId,original.playerId,original.market,original.line].join("|");
   if(seen.has(key)){skip("duplicate_existing_original_threshold");continue;}seen.add(key);
   let shadow;
   if(present){
    shadow=pick[0];
    if(shadow.originalSelectedSide!==original.lean||
      shadow.originalCapturedAt!==original.capturedAt||
      shadow.gameStartAt!==original.gameStartAt||
      shadow.generatedAt!==at||shadow.calibrated!==false){
     skip("frozen_shadow_mismatch");continue;
    }
   }else{
    const d=pacificGameDate(original.gameStartAt);
    if(!contexts.has(d))contexts.set(d,buildOpponentContext(history,{beforeDate:d}));
    shadow=evaluateOne(raw,history,{asOf:at,approved,opponentContext:contexts.get(d)});
    if(shadow.status!=="research_only"){skip("historical_input_unavailable");continue;}
   }
   const result=officialOutcome(shadow,history);
   rows.push({gameId:original.gameId,playerId:original.playerId,gameStartAt:original.gameStartAt,
    market:original.market,line:original.line,originalSelectedSide:original.lean,
    originalChampionModelProbability:original.probability,
    createdAt:at,originalGitCommit:frame.firstCommittedAt,
    gameDate:result.status==="decided"?original.gameStartAt.slice(0,10):null,
    outcome:result,shadow});
  }
 }
 return {mode,rows,excluded};
}
function summarize(rows){
 const graded=rows.filter(x=>x.outcome.status==="decided");
 const push=rows.filter(x=>x.outcome.status==="push").length;
 const variants={};
 for(const name of MODES){
  const s=graded.filter(x=>(name!=="pointsStability"||
   (x.market==="points"&&x.shadow.pointsShadowPolicyVersion===
    "nhl-points-minutes-shot-opponent-zero-v1"))&&
   (!name.startsWith("sog")||
   (x.market==="shotsOnGoal"&&
    x.shadow.sogShadowPolicyVersion==="sog-unfitted-opportunity-attempts-v1"&&
    (name!=="sogMovement"||
     (x.shadow.sogMovementPolicyVersion==="nhl-sog-25pct-line-delta-capped-half-shot-v1"&&
      x.shadow.variants?.sogMovement?.sourceOfferMovement?.status===
       "exact_pregame_same_offer_quote"))))&&
   x.shadow.variants?.[name]?.status==="research_only"&&
   ["Higher","Lower"].includes(x.shadow.decisions?.[name]?.side));
  let win=0,delta=0,loss=0,hi=0,lo=0;
  for(const r of s){
   const side=r.shadow.decisions[name].side;
   if(side===r.outcome.side)win++;
   if(r.outcome.side==="Higher")hi++;else lo++;
   const p=r.shadow.variants[name].probabilities;
   // Compare binary directions on no-push games using properly normalized
   // conditional-on-no-push probabilities; no platform settlement implied.
   const den=p.higher+p.lower;
   if(den>0){
    const conditional=p.higher/den,y=Number(r.outcome.side==="Higher");
    delta+=(conditional-y)**2;
    loss-=y?Math.log(Math.max(1e-6,conditional)):
      Math.log(Math.max(1e-6,1-conditional));
   }
  }
  variants[name]={decided:s.length,correct:win,incorrect:s.length-win,
   hitRate:s.length?win/s.length:null,coverage:graded.length?s.length/graded.length:null,
   alwaysHigherOnSameLines:hi,alwaysLowerOnSameLines:lo,
   meanConditionalNoPushBrier:s.length?delta/s.length:null,
   meanConditionalNoPushLogLoss:s.length?loss/s.length:null,
   uncalibrated:true};
 }
 const subset=graded.filter(x=>x.shadow.researchFilter?.status==="shadow_candidate_only");
 const abstained=graded.length-subset.length;
 const wins=subset.filter(x=>x.originalSelectedSide===x.outcome.side).length;
 const alwaysHigher=subset.filter(x=>x.outcome.side==="Higher").length;
 const alwaysLower=subset.filter(x=>x.outcome.side==="Lower").length;
 return {registered:rows.length,gradedDecisions:graded.length,pushes:push,
  pending:rows.length-graded.length-push,
  distinctDecidedGames:new Set(graded.map(x=>x.gameId)).size,
  distinctDecidedDates:new Set(graded.map(x=>x.gameDate)).size,
  variants,
  researchFilter:{eligible:subset.length,abstained,correct:wins,
   hitRate:subset.length?wins/subset.length:null,
   alwaysHigherWinsOnExactSameLines:alwaysHigher,
   alwaysLowerWinsOnExactSameLines:alwaysLower,
   noIndependentFullBoardSelectionComparison:true},
  // Fewer than 30 independent game clusters => don't invent a confidence bound.
  positiveGameClusterLowerConfidenceBound:null,
  historicalPlatformROI:null,
  championPromotionPermitted:false};
}
function compare(frames,history,{approved=null}={}){
 const committed=shadowFrames(frames,history,{mode:"original_precommitted_only"});
 const diagnostic=shadowFrames(frames,history,{approved,mode:"retrospective_reconstruction_only"});
 const byMarket={};
 for(const market of ["shotsOnGoal","points","assists","goals","blockedShots"]){
  byMarket[market]=summarize(committed.rows.filter(x=>x.market===market));
 }
 // Break down SOG outcomes by ORIGINAL champion-selected side on identical
 // source lines; do not cherry-pick shadow sides or historical thresholds.
 const sogDirectional=Object.fromEntries(["Higher","Lower"].map(side=>[side,
  summarize(committed.rows.filter(x=>x.market==="shotsOnGoal"&&
   x.originalSelectedSide===side))]));
 return {kind:"nhl_standard_three_challengers_git_proven_separate_validation_v1",
  generatedAt:new Date().toISOString(),
  actualPrecommitted:{...summarize(committed.rows),exclusions:committed.excluded,byMarket,
   sogDirectional,sogTimeSafeFeaturePolicy:"sog-unfitted-opportunity-attempts-v1",
   pairedSameLineResearch:pairedResearch(committed.rows,{originalPrecommitted:true}),
   originalShadowPicksFrozenBeforeGames:true},
  retrospectiveResearchOnly:{...summarize(diagnostic.rows),exclusions:diagnostic.excluded,
   pairedSameLineResearch:pairedResearch(diagnostic.rows,{originalPrecommitted:false}),
   originalShadowPicksFrozenBeforeGames:false,postResultModelCodeRisk:true},
  licensedSourceAvailabilityNotOriginalAppProof:true,
  fullBoardLineSelectionExperiment:false,
  originalPrizePicksAppPayoutSettlementVerified:false,
  calibratedProbabilities:false,
  gameClusterOutperformanceEstablished:false,modelDeployed:false,expectedValue:null,
  warning:"Post-result recomputation of new challenger code against OLD original selections is a retrospective diagnostic, NOT an original forecast or validated historical hit rate. Only future snapshots containing the new challenger, proven in one private original Git commit before puck drop, can become true prospective challenger evidence."};
}
module.exports={MODES,k,officialOutcome,provenance,shadowFrames,summarize,compare};
