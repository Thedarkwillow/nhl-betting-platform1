"use strict";
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {candidateMeans}=require("./nhl-season-model-lab.cjs");
const MODELS=["weighted-form-v1","last-5","last-10","prior-mean","stable-blend","stable-shrink-v2"];
const average=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
function estimates(prior){
 const five=average(prior.slice(-5)),ten=average(prior.slice(-10)),all=average(prior);
 const round=n=>Math.round(n*1000)/1000;
 return {
  "weighted-form-v1":round(.5*five+.3*ten+.2*all),
  "last-5":round(five),"last-10":round(ten),"prior-mean":round(all),
  "stable-blend":round(.25*five+.25*ten+.5*all),
  "stable-shrink-v2":round(candidateMeans(prior)["stable-shrink-v2"])
 };
}
function summarize(rows,model){
 const evaluated=rows.filter(x=>x.candidates?.[model]&&typeof x.candidates[model].correct==="boolean"),n=evaluated.length;
 const wins=evaluated.filter(x=>x.candidates[model].correct).length;
 const brier=n?evaluated.reduce((s,x)=>{const p=x.candidates[model];return s+(p.probability-(p.correct?1:0))**2;},0)/n:null;
 return {decisions:n,correct:wins,hitRate:n?wins/n:null,brierScore:brier,
  distinctGames:new Set(evaluated.map(x=>x.gameId)).size};
}
function compareCandidates(archivedLines,logsByPlayer){
 if(!Array.isArray(archivedLines)||!logsByPlayer||typeof logsByPlayer!=="object")throw Error("Missing PrizePicks outcomes or NHL official logs");
 const rows=[],exclusions={},seenQuotes=new Set();
 const skip=reason=>(exclusions[reason]=(exclusions[reason]||0)+1);
 for(const line of archivedLines){
  const logs=logsByPlayer[String(line.playerId)]||[];
  const game=logs.find(x=>String(x.gameId)===String(line.gameId));
  if(!game||!Number.isFinite(game[line.market])||game[line.market]!==line.actual){skip("official_result_missing_or_mismatched");continue;}
  if(!Number.isFinite(line.line)||line.line<0){skip("invalid_original_line");continue;}
  if(!["2025-26","2026-27"].includes(line.season)){
   skip("unsupported_training_or_holdout_season");continue;
  }
  // When a provider supplied a genuine observation clock, reject any quote
  // first seen after puck drop. Missing clocks remain retrospective-only.
  const observedAt=line.sourceObservedAt??line.observedAt??line.capturedAt??null;
  const startsAt=line.eventStartsAt??line.gameStartAt??null;
  if(observedAt!==null&&(!Number.isFinite(Date.parse(observedAt))||
     (startsAt!==null&&(!Number.isFinite(Date.parse(startsAt))||
       Date.parse(observedAt)>=Date.parse(startsAt))))){
   skip("quote_timing_invalid_or_not_pregame");continue;
  }
  const quoteKey=JSON.stringify([line.season,line.gameId,line.playerId,
   line.market,line.line,line.tier??null]);
  if(seenQuotes.has(quoteKey)){
   skip("duplicate_same_line_outcome_not_independent");continue;
  }
  seenQuotes.add(quoteKey);
  const officialOutcome=game[line.market]>line.line?"Higher":
   game[line.market]<line.line?"Lower":"Push";
  if(officialOutcome!==line.outcome){skip("archived_outcome_conflicts_with_official_boxscore");continue;}
  const prior=logs.filter(g=>g.gameDate<game.gameDate&&Number.isFinite(g[line.market])).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
  if(prior.length<5){skip("insufficient_pregame_history");continue;}
  const candidates={};
  const priorValues=prior.map(x=>x[line.market]);
  for(const [model,mean] of Object.entries(estimates(priorValues))){
   const probabilities=estimateCountProbabilities(mean,line.line);
   if(!probabilities||!Number.isFinite(probabilities.higher)||!Number.isFinite(probabilities.lower))continue;
   const side=probabilities.higher>=probabilities.lower?"Higher":"Lower",p=Math.max(probabilities.higher,probabilities.lower);
   if(!(p>0&&p<1))continue;
   candidates[model]={side,probability:p,mean,correct:line.outcome==="Push"?null:side===line.outcome};
  }
  if(MODELS.some(m=>!candidates[m])){skip("candidate_probability_unavailable");continue;}
  rows.push({season:line.season,gameId:line.gameId,playerId:line.playerId,market:line.market,
    outcome:line.outcome,priorGames:prior.length,candidates});
 }
 const bySeason={},byMarket={};
 for(const season of ["2025-26","2026-27"]){
  const subset=rows.filter(x=>x.season===season);
  bySeason[season]=Object.fromEntries(MODELS.map(m=>[m,summarize(subset,m)]));
 }
 for(const market of [...new Set(rows.map(x=>x.market))].sort())
  byMarket[market]=Object.fromEntries(MODELS.map(m=>[m,summarize(rows.filter(x=>x.market===market),m)]));
 // Pre-declared temporal split: pick a model on the *last* season only,
 // then report its results on the current season without fitting to it.
 // This is exploratory, not a validated model release.
 const train=bySeason["2025-26"],holdout=bySeason["2026-27"];
 const MIN_TRAIN_DECISIONS=100,MIN_TRAIN_GAMES=20;
 // Holdout evaluation is only meaningful if the challenger was selected
 // from a reasonably broad independent PRIOR-season sample. When none
 // qualifies, report candidate diagnostics but do not name a "winner".
 const trainReady=MODELS.every(m=>train[m].decisions>=MIN_TRAIN_DECISIONS&&
  train[m].distinctGames>=MIN_TRAIN_GAMES);
 const ordered=MODELS.slice().sort((a,b)=>
  (train[b].hitRate??-1)-(train[a].hitRate??-1)||
  (train[a].brierScore??Infinity)-(train[b].brierScore??Infinity)||
  MODELS.indexOf(a)-MODELS.indexOf(b));
 const chosen=trainReady?ordered[0]:null;
 const holdoutRows=rows.filter(x=>x.season==="2026-27"&&x.outcome!=="Push");
 const lowerWins=holdoutRows.filter(x=>x.outcome==="Lower").length;
 const selected=chosen?holdout[chosen]:null;
 return {schemaVersion:1,kind:"two_season_exploratory_nhl_model_comparison",
  candidates:MODELS,bySeason,byMarket,
  eligibleArchivedLines:rows.length,excluded:exclusions,
  independentlyTimedOriginalPlatformQuotesVerified:false,
  correlatedQuoteObservationsDeduplicated:true,
  temporalHoldout:{
   trainingSeason:"2025-26",holdoutSeason:"2026-27",chosenOnTrainingOnly:chosen,
   minimumTrainingDecisions:MIN_TRAIN_DECISIONS,minimumDistinctTrainingGames:MIN_TRAIN_GAMES,
   trainingSelectionGatePassed:trainReady,
   exploratoryTrainingLeader:ordered[0],
   trainingDecisionCount:chosen?train[chosen].decisions:0,
   observedTrainingDecisions:train[ordered[0]].decisions,
   observedTrainingGames:train[ordered[0]].distinctGames,
   heldOutDecisions:selected?.decisions??0,heldOutCorrect:selected?.correct??0,
   heldOutHitRate:selected?.hitRate??null,alwaysLowerHeldOutCorrect:lowerWins,
   alwaysLowerHeldOutHitRate:holdoutRows.length?lowerWins/holdoutRows.length:null,
   outperformAlwaysLower:selected?.decisions>0?selected.correct>lowerWins:null,
   eligibleToDeploy:false,
   warning:"Research challenger identified after inspecting earlier retrospective 2025-26 summaries; not an untouched preregistered holdout. Model selection is restricted to the prior season within this replay, but 2026-27 outcomes cover a narrow, nonrandom set of games. A frozen new prospective cohort is required."},
  retrospective:true,calibrated:false,verifiedProfitability:false,
  tierSpecificPayoutsAvailable:false,
  warning:"Exploratory model comparisons on incomplete archived PrizePicks lines, unknown tiers, correlated games and retrospectively reconstructed decisions. Do not deploy a winner or infer wagering EV without independent prospective calibration."};
}
module.exports={compareCandidates,estimates,MODELS};
