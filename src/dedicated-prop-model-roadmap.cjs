"use strict";
// Architecture/coverage inventory, NOT implemented models or release approval.
// Every canonical market requires independently versioned parameters, target,
// probability calibration, historical/forward evaluation and settlement rules.
const {MARKETS}=require("./nhl-market-registry.cjs");
const {MARKET_REGISTRY}=require("./nfl-market-registry.cjs");
const {requirementsFor}=require("./nfl-context-source-matrix.cjs");
const NHL=Object.freeze({
 shotsOnGoal:["shot_attempt_volume × on_net_rate","attempts, shot locations, participation, opponent shot suppression"],
 goals:["shot_quality × finishing_rate","individual expected goals, shot mix, opposing goalie, usage"],
 assists:["teammate_scoring × assist_involvement","primary/secondary assists, line combinations, teammate xG, power play"],
 points:["joint goals_and_assists","same-game goal and assist dependence; never add independent marginal probabilities"],
 blockedShots:["opponent_attempt_volume × block_share","opponent shot attempts, defensive zone time, penalty kill, player block share"],
 saves:["shots_faced × save_rate","opponent volume and quality, goalie workload, starting status"],
 hits:["contact_opportunities × hit_rate","forecheck, opponent possession, score state, player role, arena effects"],
 timeOnIceSeconds:["role_conditioned_continuous_minutes","even-strength, power-play and PK shifts; availability and overtime"],
 faceoffsWon:["attempt_count_mixture × shrunk_win_probability","exact faced/won/lost draws, opponent strength, prior role and zone/situation"],
 goalieFantasyScore:["joint_goalie_outcomes_then_versioned_scoring","exact starter, win, shutout, saves and goals against; platform rules"],
 powerPlayPoints:["power_play_opportunities × participation × scoring","penalty opportunities, PP unit, deployment, team scoring"],
 goalsAgainst:["shots_faced × goal_probability","shot quality, opponent scoring, goalie save rates, workload"],
 plusMinus:["signed_on_ice_goal_differential","even-strength goals for and against, deployment, official exclusions"],
 shotsOnGoalCombo:["joint_shot_counts","exact component players and games; shared pace and teammate effects"],
 goalieSavesCombo:["joint_goalie_save_counts","exact component players, starts, shared game shot dependence"],
 goalsCombo:["joint_goal_counts","exact component players and goal involvement dependence"]
});
const NFL_FAMILY={passing:"dropbacks, attempts, efficiency and pressure",rushing:"carries, share, efficiency and game script",receiving:"routes, targets, catch probability and yards",kicking:"drive outcomes, attempt distance, conversion, weather",punting:"stalled drives, field position and punt distances",defense:"opponent plays, player snaps and event rates",fantasy:"joint components then exact versioned scoring",combo:"joint component outcomes and exact identities",period:"ordered period/drive events and exposure",special_teams:"special-teams opportunities and event rates",returns:"returnable kicks, return opportunity and distance",touchdown:"scoring opportunities and usage shares",opportunity:"role-specific event count and conversion",ball_security:"touches and fumble hazard",team:"team possessions, pace and opponent strength",futures:"season horizon and schedule outcomes"};
function inventory(){
 const nhl=Object.entries(MARKETS).map(([marketId])=>{
  if(!NHL[marketId])throw Error("Unspecified dedicated NHL model: "+marketId);
  return {sport:"NHL",marketId,policyId:"nhl:"+marketId+":dedicated-v1",target:marketId,architecture:NHL[marketId][0],featurePlan:NHL[marketId][1],status:"historical_candidate_implemented_pending_validation",researchScope:["shotsOnGoalCombo","goalsCombo","goalieSavesCombo"].includes(marketId)?"synthetic_same_event_pairs_only":["plusMinus","powerPlayPoints","goalieFantasyScore"].includes(marketId)?"current_official_archive_only":"multi_season_source_replay",releaseApproved:false};
 });
 const periods=require("./nfl-dedicated-period-lab.cjs");
 const implemented=new Set([...Object.keys(require("./nfl-dedicated-core-market-lab.cjs").SPEC),...Object.keys(periods.MILESTONES),...Object.keys(require('./nfl-dedicated-component-lab.cjs').SPECS)]);
 const nfl=MARKET_REGISTRY.map(m=>{
  const f=requirementsFor(m),family=NFL_FAMILY[f.researchFamily];
  if(!family)throw Error("Unspecified NFL dedicated family: "+m.id);
  const distribution=m.group==="combo"||m.group==="fantasy"?"joint_component_distribution":m.requiredData==="event"?"event_hazard_or_categorical":/longest|first_.*yards/.test(m.id)?"ordered_event_distance":/pct|percentage/.test(m.id)?"opportunity_conditioned_ratio":/yards|distance|score/.test(m.id)?"role_conditioned_magnitude_or_count":"opportunity_conditioned_count";
  return {sport:"NFL",marketId:m.id,policyId:"nfl:"+m.id+":dedicated-v1",target:m.id,architecture:distribution,featurePlan:family,requiredHistoricalDatasets:f.requiredHistoricalDatasets,status:implemented.has(m.id)?"historical_candidate_implemented_pending_validation":"dedicated_design_pending_independent_validation",releaseApproved:false};
 });
 const models=[...nhl,...nfl];
 if(new Set(models.map(m=>m.policyId)).size!==models.length)throw Error("Duplicate dedicated policy IDs");
 return {kind:"private_dedicated_prop_model_inventory_v1",models,scope:"canonical current registry, not verified complete current offers",periodPolicies:Object.keys(periods.FIELDS).flatMap(m=>Object.keys(periods.PERIODS).map(p=>({sport:"NFL",marketId:m,period:p,policyId:"nfl:"+m+":"+p+":dedicated-v1",status:"historical_candidate_implemented_pending_validation",releaseApproved:false}))),requiresOwnChronologicalBacktest:true,requiresOwnProspectiveCalibration:true,unknownMarketPolicy:"quarantine_until_model_and_settlement_defined",tiers:"Separate line-side calibration by Standard/Goblin/Demon; shared coherent underlying stat when appropriate",futureSports:["NBA","CS2","Valorant","League of Legends","other esports","MLB last"],periodMarkets:"Exact event and period registry required; no full-game model substitution",modelPromoted:false};
}
module.exports={inventory};
