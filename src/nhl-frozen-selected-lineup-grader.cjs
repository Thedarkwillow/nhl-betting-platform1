"use strict";
/**
 * Score ONLY directions included in a Git-frozen research optimizer lineup.
 * Raw independent provider Higher/Lower offer sides are never model selections.
 * No settlement, EV, or independent joint-lineup probability is inferred.
 */
const {gradePredictions,validArchiveChronology}=require("./grade-nhl-predictions.cjs");
const {gradeExperimentalFrozenPicks}=require("./nhl-experimental-market-outcome.cjs");
const {INDIVIDUAL_MARKETS}=require("./nhl-experimental-offer-bridge.cjs");
const canon=s=>({"SJ":"SJS","LA":"LAK","TB":"TBL","NJ":"NJD"}[String(s||"").toUpperCase()]||String(s||"").toUpperCase());
const time=x=>typeof x==="string"?Date.parse(x):NaN;
const selectionKey=p=>[p.gameId,p.playerId,p.market,p.line,p.tier].join("|");
function validPick(p,frame,official){
 if(!p||!Number.isInteger(p.gameId)||!Number.isInteger(p.playerId)||
  !["Higher","Lower"].includes(p.lean)||p.tier!=="Standard"||
  !Number.isFinite(p.line)||
  (p.line<0&&!["plusMinus","goalieFantasyScore"].includes(p.market))||
  !Number.isFinite(p.probability)||
  p.probability<=0||p.probability>=1||!official||!p.capturedAt||
  !frame.snapshot?.generatedAt||!frame.firstCommittedAt)return false;
 if(p.experimentalMarketResearchOnly===true){
  const rule=INDIVIDUAL_MARKETS[p.market],e=p.experimentalMarketEvidence;
  const built=time(e?.modelBuiltAt);
  if(!rule||e?.stat!==rule.stat||e.observations<8||
   !Number.isFinite(built)||built>time(p.capturedAt)||
   built>=time(p.eventStartsAt)||p.probabilityCalibrated!==false)
   return false;
  if(p.market==="timeOnIceSeconds"&&
   (p.marketStatUnit!=="minutes"||
    p.marketOvertimeRule!=="includes_official_full_game"))
   return false;
  if(p.market==="goalieFantasyScore"&&
   p.marketRuleVersion!=="prizepicks-nhl-goalie-fantasy-user-provided-20261106")
   return false;
 }
 const original=(frame.snapshot.rankedProps||[]).filter(r=>
   r.playerId===p.playerId&&r.gameId===p.gameId&&r.market===p.market&&
   r.line===p.line&&r.tier===p.tier&&r.lean===p.lean&&
   r.capturedAt===p.capturedAt&&r.eventStartsAt===p.eventStartsAt);
 if(original.length!==1)return false;
 const a=canon(p.team),b=canon(p.opponent),home=canon(official.home),away=canon(official.away);
 if(!a||!b||a===b||![home,away].includes(a)||![home,away].includes(b))return false;
 const start=time(official.startTimeUTC),originalStart=time(p.eventStartsAt),verified=time(p.gameStartAt);
 if(!Number.isFinite(start)||!Number.isFinite(originalStart)||!Number.isFinite(verified)||
  Math.abs(start-originalStart)>300000||Math.abs(start-verified)>300000)return false;
 return validArchiveChronology(time(p.capturedAt),time(frame.snapshot.generatedAt),
   time(frame.firstCommittedAt),start);
}
function freezeSelectedDirections(frames,officialGames){
 if(!Array.isArray(frames)||!Array.isArray(officialGames))
  throw Error("Original Git snapshot frames and NHL official schedule required");
 const official=new Map(officialGames.filter(x=>Number.isInteger(x?.id)).map(x=>[x.id,x]));
 const selected=new Map(),audit={snapshotsSeen:frames.length,snapshotsUnproven:0,
  missingOrIneligibleLineups:0,validFrozenLineups:0,
  ambiguousWithinSnapshot:0,duplicatedSelections:0,laterReversedSelections:0,
  selectedDistinctOriginalOffers:0};
 const sorted=[...frames].sort((a,b)=>time(a.firstCommittedAt)-time(b.firstCommittedAt)||
   String(a.path||"").localeCompare(String(b.path||"")));
 for(const frame of sorted){
  const s=frame.snapshot;
  if(!s||!Array.isArray(s.rankedProps)||frame.gitHistoryCount!==1||
    !Number.isFinite(time(frame.firstCommittedAt))||!Number.isFinite(time(s.generatedAt))){
   audit.snapshotsUnproven++;continue;
  }
  const picked=new Map(),ambiguous=new Set();
  for(const size of [2,3,4,5,6]){
   const lineup=s.lineups?.[String(size)];
   if(!lineup){continue;}
   if(lineup.status!=="research_only"||lineup.optimized!==true||
    !Array.isArray(lineup.picks)||lineup.picks.length!==size||
    new Set(lineup.picks.map(p=>p.playerId)).size!==size||
    lineup.picks.some(p=>!validPick(p,frame,official.get(p?.gameId)))){
    audit.missingOrIneligibleLineups++;continue;
   }
   audit.validFrozenLineups++;
   for(const p of lineup.picks){
    const key=selectionKey(p),v=picked.get(key);
    if(v&&v.lean!==p.lean){ambiguous.add(key);continue;}
    if(!v)picked.set(key,p);
   }
  }
  for(const key of ambiguous){picked.delete(key);audit.ambiguousWithinSnapshot++;}
  for(const [key,p] of picked){
   const existing=selected.get(key);
   if(existing){
    if(existing.lean!==p.lean)audit.laterReversedSelections++;
    else audit.duplicatedSelections++;
    continue;
   }
   selected.set(key,{...p,predictionRecordedAt:s.generatedAt,
    snapshotArchivedAt:frame.firstCommittedAt,
    selectionSource:"first_eligible_git_frozen_research_optimizer_lineup",
    selectedByOptimizerBeforeGame:true,originalPlatformOfferAuthenticated:false});
  }
 }
 audit.selectedDistinctOriginalOffers=selected.size;
 return {picks:[...selected.values()],audit};
}
function gradeFrozenSelectedLineups(frames,officialGames,history){
 const r=freezeSelectedDirections(frames,officialGames),
  championPicks=r.picks.filter(p=>p.experimentalMarketResearchOnly!==true),
  newMarketPicks=r.picks.filter(p=>p.experimentalMarketResearchOnly===true),
  grades=gradePredictions(championPicks,history),
  experimental=gradeExperimentalFrozenPicks(newMarketPicks,history),
  byGameDay={},byMarket={};
 for(const row of grades.graded){
  const day=byGameDay[row.gameDate]||(byGameDay[row.gameDate]={graded:0,decided:0,correct:0,pushes:0,games:new Set()});
  day.graded++;day.games.add(row.gameId);
  if(row.correct===null)day.pushes++;else{day.decided++;day.correct+=Number(row.correct);}
  const market=byMarket[row.market]||(byMarket[row.market]={graded:0,decided:0,correct:0,pushes:0});
  market.graded++;if(row.correct===null)market.pushes++;else{market.decided++;market.correct+=Number(row.correct);}
 }
 for(const value of Object.values(byGameDay))value.distinctGames=value.games.size,delete value.games;
 const decisions=grades.summary.decisions;
 return {schemaVersion:1,kind:"nhl_git_frozen_optimizer_selected_directions",
  ...r.audit,
  legacyChampionSelectedProps:championPicks.length,
  experimentalMarketSelectedProps:newMarketPicks.length,
  experimental:{summary:experimental.summary,
   pending:experimental.pending.length,rejected:experimental.rejected.length,
   gradedByMarket:Object.fromEntries(Object.keys(INDIVIDUAL_MARKETS).map(m=>[
    m,experimental.graded.filter(x=>x.market===m).length])),
   separateFromChampionRate:true,originalPlatformSettlementsVerified:false,
   officialScoringVersion:"nhl_expanded_market_prospective_selected_direction_audit_v1"},
  graded:grades.summary.graded,decided:decisions,
  correct:grades.summary.correct,pushes:grades.summary.pushes,
  pending:grades.pending.length,rejected:grades.rejected.length,
  observedSelectedDirectionHitRate:decisions?grades.summary.correct/decisions:null,
  selectedAlwaysLowerBaseline:decisions?
   grades.graded.filter(x=>x.correct!==null&&x.result==="Lower").length/decisions:null,
  selectedAlwaysHigherBaseline:decisions?
   grades.graded.filter(x=>x.correct!==null&&x.result==="Higher").length/decisions:null,
  byGameDay,byMarket,rawOfferedSidesNotUsed:true,
  firstRecordedSelectionWinsLaterRevisions:true,
  verifiedNhlFinalStatsOnly:true,originalPlatformSettlementsVerified:false,
  lineupJointProbabilityVerified:false,expectedReturnVerified:false,
  modelProbabilityCalibrated:false,
  warning:"Only first Git-frozen pregame Standard optimizer selections, deduplicated by exact player-game-stat-line-tiers, can be called prospective selected directions. Every offered Higher/Lower option is NOT a model pick. DNPs/missing final players stay pending and pushes are excluded from decided rate. Correlated selected props across games and snapshots are not independent, and no platform payout or commercial edge is verified."};
}
module.exports={validPick,freezeSelectedDirections,gradeFrozenSelectedLineups};
