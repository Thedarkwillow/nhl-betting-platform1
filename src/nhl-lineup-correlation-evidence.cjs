"use strict";
/**
 * Structural pairwise dependency diagnostics, NOT an estimated correlation
 * coefficient or measured joint payout probability. Use only for disclosure.
 */
const norm=x=>String(x??"").trim().toUpperCase();
function inspectLineupDependencies(picks){
 const pairs=[],rows=Array.isArray(picks)?picks:[];
 for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
  const a=rows[i],b=rows[j];
  if(!a?.matchup||norm(a.matchup)!==norm(b?.matchup))continue;
  const signals=["same_official_matchup"];
  if(a.team&&b.team&&norm(a.team)===norm(b.team))signals.push("same_team");
  else if(a.team&&b.team&&norm(a.team)!==norm(b.team))signals.push("opposing_teams");
  if((a.market==="saves"&&b.market==="shotsOnGoal")||
     (b.market==="saves"&&a.market==="shotsOnGoal"))
    signals.push("goalie_shooter_stat_interaction");
  if(a.market==="points"&&b.market==="assists"||
     a.market==="assists"&&b.market==="points")
    signals.push("scoring_assist_stat_overlap");
  const scoring=new Set(["goals","assists","points","powerPlayPoints"]);
  if(scoring.has(a.market)&&scoring.has(b.market)&&a.market!==b.market)
   signals.push("shared_offensive_scoring_event_risk");
  const goalie=new Set(["saves","goalsAgainst","goalieFantasyScore"]);
  const shooters=new Set(["shotsOnGoal","goals","powerPlayPoints"]);
  if(goalie.has(a.market)&&shooters.has(b.market)||
     goalie.has(b.market)&&shooters.has(a.market))
   signals.push("goalie_against_opponent_scoring_shots_interaction");
  if(a.market==="plusMinus"||b.market==="plusMinus")
   signals.push("shared_game_score_state_plusminus_risk");
  pairs.push({a:i,b:j,signals,measuredCorrelation:null});
 }
 return {status:pairs.length?"structural_shared_game_risk":"no_same_game_pair_detected",
  sharedGamePairs:pairs.length,pairs,
  estimatedJointHitProbability:null,calibratedCorrelationCoefficients:false,
  payoutAdjustedExpectedValue:null,
  note:"Same-game structural overlap is not a measured pairwise correlation. Cross-game dependencies, injury/role news and lineup rules still require verification."};
}
module.exports={inspectLineupDependencies};
