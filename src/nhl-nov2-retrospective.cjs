"use strict";
/**
 * Nov 2/3: retrospectively inspect source-captured pregame player-prop
 * lines. The rule selecting individual directions was fixed AFTER the games.
 * Never turn this into a prospective hit rate, promotion, or public model IP.
 */
const {gradePredictions}=require("./grade-nhl-predictions.cjs");
const {compareCandidates,MODELS}=require("./nhl-temporal-model-comparison.cjs");
const DAY="2026-11-02";
function auditDay(legacySelections,history,originalFrozenAudit,gameDate=DAY){
 if(!["2026-11-02","2026-11-03"].includes(gameDate))throw Error("Unsupported game day");
 if(!Array.isArray(legacySelections)||!history?.players)throw Error("Original archived selections and official history required");
 const scored=gradePredictions(legacySelections,history);
 const matches=scored.graded.filter(p=>p.gameDate===gameDate);
 const decided=matches.filter(p=>typeof p.correct==="boolean");
 const games=[...new Set(decided.map(x=>x.gameId))],n=decided.length;
 const correct=decided.filter(p=>p.correct).length;
 const lower=decided.filter(p=>p.result==="Lower").length;
 const higher=decided.filter(p=>p.result==="Higher").length;
 const probabilityRows=decided.filter(p=>Number.isFinite(p.probability)&&p.probability>0&&p.probability<1);
 const meanP=probabilityRows.length?probabilityRows.reduce((s,p)=>s+p.probability,0)/probabilityRows.length:null;
 const brier=probabilityRows.length?probabilityRows.reduce((s,p)=>s+(p.probability-(p.correct?1:0))**2,0)/probabilityRows.length:null;
 const lines=matches.map(p=>({playerId:p.playerId,gameId:p.gameId,season:"2026-27",
  market:p.market,line:p.line,actual:p.actual,outcome:p.result}));
 const logs=Object.fromEntries(Object.entries(history.players).map(([id,p])=>[id,p.games||[]]));
 const challenger=compareCandidates(lines,logs);
 const byMarket={};
 for(const p of decided){
  const x=byMarket[p.market]||(byMarket[p.market]={decisions:0,correct:0,alwaysLower:0});
  x.decisions++;x.correct+=Number(p.correct);x.alwaysLower+=Number(p.result==="Lower");
 }
 return {schemaVersion:1,kind:gameDate===DAY?"nov2_original_pregame_quote_retrospective_diagnostic":
   "nhl_original_pregame_quote_retrospective_diagnostic",
  gameDate,sourceCohort:"legacy_offered_side_probability_vectors_reconstructed_using_postgame_written_selection_rule",
  quotedLinesArchivedBeforeGames:true,
  specificDirectionRulePrecommittedBeforeGames:false,
  prospectiveSelectionsCounted:0,
  officialBoxscoreScoring:true,independentFantasyPlatformSettlementsVerified:false,
  oldModel:{evaluatedDecisions:n,correct,observedRate:n?correct/n:null,
   meanUncalibratedProbability:meanP,brier: brier,
   alwaysLowerDecisions:lower,alwaysLowerRate:n?lower/n:null,
   alwaysHigherDecisions:higher,alwaysHigherRate:n?higher/n:null,
   distinctOfficialGames:games.length,
   byMarket:Object.fromEntries(Object.entries(byMarket).map(([market,x])=>[market,{
    ...x,observedRate:x.correct/x.decisions,alwaysLowerRate:x.alwaysLower/x.decisions}]))},
  alternativeModels:{basis:"ONLY official NHL player game logs with date strictly BEFORE each game's date; no evaluated game results enter features",
   eligibleSameLineDecisions:challenger.eligibleArchivedLines,
   excluded:challenger.excluded,
   byModel:Object.fromEntries(MODELS.map(m=>[m,challenger.bySeason["2026-27"][m]])),
   selectedWinner:null,approvedForDeployment:false,prospectiveAccuracyVerified:false},
  originalFrozenAudit:{legacyReconstructedDecisions:originalFrozenAudit?.legacyRetrospective?.decided??null,
   explicitPrecommittedDecisions:originalFrozenAudit?.explicitProspective?.decided??null},
  caveat:"This diagnoses model miscalibration and alternate formula behaviour on old quoted lines. Selection rule was fixed after games. All model comparisons are retrospective, potentially correlated by NHL game, selected archive coverage only; no profit or future hit rate proven."
 };
}
const auditNov2=(legacySelections,history,originalFrozenAudit)=>
 auditDay(legacySelections,history,originalFrozenAudit,DAY);
module.exports={DAY,auditNov2,auditDay};
