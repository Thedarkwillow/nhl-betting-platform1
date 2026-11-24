"use strict";
// Descriptive first-frozen quote-direction audit; no replayed pick policy.
const safe=(x)=>Number.isInteger(x)&&x>=0;
const stat=r=>r&&[r.decided,r.correct,r.incorrect,r.alwaysHigherSameLines,r.alwaysLowerSameLines,r.distinctFinalGames].every(safe)&&
 r.decided===r.correct+r.incorrect&&r.decided===r.alwaysHigherSameLines+r.alwaysLowerSameLines;
function summarize(g){
 if(!stat(g))return null;
 const n=g.decided;return {decided:n,correct:g.correct,incorrect:g.incorrect,
 modelRate:n?g.correct/n:null,higherBaseline:n?g.alwaysHigherSameLines/n:null,
 lowerBaseline:n?g.alwaysLowerSameLines/n:null,
 modelVsAlwaysHigher:n?(g.correct-g.alwaysHigherSameLines)/n:null,
 modelVsAlwaysLower:n?(g.correct-g.alwaysLowerSameLines)/n:null,
 distinctFinalGames:g.distinctFinalGames,smallOrDependentSample:g.distinctFinalGames<30,
 bothSidesAuthenticatedAtOriginalPlatform:false};
}
function audit(grade){
 const f=grade?.explicitFrozenDirections?.firstDistinctThresholdGrade;
 if(grade?.kind!=="nfl_private_pregame_evidence_separated_outcome_audit_v1"||
 grade?.nflverseFinalStatsNotPlatformSettlement!==true||
 f?.kind!=="nfl_original_first_distinct_threshold_official_stat_audit_v1"||
 f.originalFirstGitBeforeKickoffProven!==true||f.statisticsDerivedFromNflverseNotPlatformSettlement!==true)
 throw Error("Original first-Git deduplicated threshold grade required");
 const raw=f.earliestPerPlayerGameMarketAndLine,one=f.earliestPerPlayerGameMarket;
 if(!stat(raw)||!stat(one))throw Error("Cannot reconcile unmodified first-threshold cohort");
 const markets=Object.fromEntries(Object.entries(raw.byMarket||{}).map(([k,v])=>[k,summarize(v)]));
 const sides=Object.fromEntries(Object.entries(raw.bySelectedSide||{}).map(([k,v])=>[k,summarize(v)]));
 for(const v of [...Object.values(markets),...Object.values(sides)])if(!v)throw Error("Malformed market/side historical cohort");
 const totals=Object.values(markets).reduce((o,v)=>({decided:o.decided+v.decided,correct:o.correct+v.correct,
 higher:o.higher+Math.round(v.higherBaseline*v.decided),lower:o.lower+Math.round(v.lowerBaseline*v.decided)}),{decided:0,correct:0,higher:0,lower:0});
 if(totals.decided!==raw.decided||totals.correct!==raw.correct||totals.higher!==raw.alwaysHigherSameLines||totals.lower!==raw.alwaysLowerSameLines)
 throw Error("Market subtotal differs from original official-stat cohort");
 const byGame=Object.fromEntries(Object.entries(raw.byGame||{}).map(([k,v])=>[k,summarize(v)]));
 return {kind:"nfl_first_frozen_exact_threshold_direction_review_v1",
  generatedAt:grade.generatedAt,overall:summarize(raw),onePerPlayerMarket:summarize(one),byMarket:markets,byOriginalSelectedSide:sides,
  byOriginalGame:byGame,mostConcerningMarkets:Object.entries(markets).filter(([_,x])=>x.decided>=20&&x.modelVsAlwaysLower<0)
    .sort((a,b)=>a[1].modelVsAlwaysLower-b[1].modelVsAlwaysLower).map(([k,v])=>({market:k,decided:v.decided,modelVsAlwaysLower:v.modelVsAlwaysLower})),
  automaticDirectionFlipsAllowed:false,sourceMatchesOriginalAppUnverified:true,
  injuryRoleBiasMustBeTestedOnFutureGames:true,clusterSupportedEdgeEstablished:false,
  productionApproved:false,noPaidCalls:true};
}
module.exports={audit,summarize};
