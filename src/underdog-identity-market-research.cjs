"use strict";
// Independent candidate-only market/identity evidence. No recommendation or provider ID verification.
const {eventCrosswalk}=require("./underdog-event-crosswalk.cjs");
const {audit:identityCollisionAudit}=require("./underdog-source-player-collision.cjs");
const {classifyMarket}=require("./nfl-market-registry.cjs");
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const name=x=>typeof x==="string"?x.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,""):"";
const team=(s,x)=>{const k=String(x||"").trim().toUpperCase();return (s==="NHL"?{SJ:"SJS",LA:"LAK",TB:"TBL",NJ:"NJD",VEG:"VGK",UTAH:"UTA"}:{JAC:"JAX",WSH:"WAS"})[k]||k;};
const nhl={shots_on_goal:"shotsOnGoal",shots:"shotsOnGoal",sog:"shotsOnGoal",goals:"goals",assists:"assists",points:"points",blocked_shots:"blockedShots",blocks:"blockedShots",saves:"saves",goalie_saves:"saves",hits:"hits",faceoffs_won:"faceoffsWon",power_play_points:"powerPlayPoints",goals_against:"goalsAgainst",plus_minus:"plusMinus",goalie_goals_allowed:"goalsAgainst",goals_allowed:"goalsAgainst",faceoff_wins:"faceoffsWon",powerplay_points:"powerPlayPoints"};
const nfl={passing_yards:"Passing Yards",passing_attempts:"Passing Attempts",passing_completions:"Passing Completions",passing_touchdowns:"Passing Touchdowns",rushing_yards:"Rushing Yards",rushing_attempts:"Rushing Attempts",receiving_yards:"Receiving Yards",receiving_targets:"Targets",receiving_touchdowns:"Receiving Touchdowns",receptions:"Receptions",fg_made:"Field Goals Made",kicking_points:"Kicking Points",passing_yds:"Passing Yards",passing_att:"Passing Attempts",passing_comps:"Passing Completions",passing_tds:"Passing Touchdowns",rushing_yds:"Rushing Yards",rushing_att:"Rushing Attempts",receiving_yds:"Receiving Yards",receiving_rec:"Receptions",extra_points_made:"Extra Points Made",passing_long:"Longest Completion",rushing_long:"Longest Rush",receiving_long:"Longest Reception"};
// Published third-party market codes are a catalog, not proof of settlement or offer availability.
function catalogMarket(row,league){
 const code=typeof row?.market?.stat==="string"?row.market.stat.trim().toLowerCase():null;
 if(!code)return null;
 if(league==="NHL"&&code==="fantasy_points")return {market:"fantasy_points",period:"unverified",specialist:true,scoringVerified:false};
 if(league!=="NFL")return null;
 const prefix=/^period_(1_2|1|2|3|4)_(.+)$/.exec(code),suffix=prefix?prefix[2]:code;
 const codes={receiving_yds:"receiving_yards",passing_yds:"passing_yards",rushing_yds:"rushing_yards",receiving_rec:"receptions",passing_tds:"passing_touchdowns",passing_and_rushing_yds:"pass_rush_yards",rush_rec_yds:"rush_receive_yards",rush_rec_tds:"rush_receive_tds",tackles_and_assists:"tackles_plus_assists",fantasy_points:"fantasy_score_offense"};
 if(!Object.hasOwn(codes,suffix))return null;
 if(!prefix&&!["passing_and_rushing_yds","rush_rec_yds","rush_rec_tds","tackles_and_assists","fantasy_points"].includes(suffix))return null;
 return {market:codes[suffix],period:prefix?(prefix[1]==="1_2"?"half_1":"quarter_"+prefix[1]):"full_game",specialist:true,periodFromCodeOnly:!!prefix,scoringVerified:false};
}
function market(row,league){
 const label=row?.market?.stat,period=row?.market?.period;
 if(typeof label!=="string"||typeof period!=="string")return null;
 const k=label.toLowerCase().trim().replace(/[ -]+/g,"_");
 if(league==="NHL"){if(!["full game","full_game","full","game"].includes(period.toLowerCase().trim())||!Object.hasOwn(nhl,k))return null;return {market:nhl[k],period:"full_game"};}
 const x=classifyMarket("underdog",Object.hasOwn(nfl,k)?nfl[k]:label,{period,sourceAuthenticity:"independent_research"});
 return x.status==="recognized_research_only"&&x.period==="full_game"&&!x.comboValidationNeeded&&!x.periodSpecificValidationNeeded?{market:x.marketId,period:x.period}:null;
}
function identity(row,league,roster,now,gameId){
 if(!Array.isArray(roster?.rows)||roster.league!==league||!Number.isFinite(dt(roster.observedAt))||dt(roster.observedAt)>dt(now)||dt(now)-dt(roster.observedAt)>7*86400000)return null;
 const n=name(row?.player?.name),t=team(league,row?.player?.team);
 if(!n||!t||!row?.player?.id)return null;
 const week=league==="NFL"?Number(String(gameId).split("_")[1]):null;
 if(league==="NFL"&&(!Number.isInteger(week)||week<1||week>18))return null;
 const a=roster.rows.filter(x=>name(x.name)===n&&team(league,x.team)===t&&(league==="NHL"||Number(x.season)===2026&&Number(x.week)===week));
 const ids=new Set(a.map(x=>x.playerId).filter(x=>typeof x==="string"&&x||Number.isInteger(x)));
 return a.length>0&&ids.size===1&&a.every(x=>ids.has(x.playerId))?{playerId:[...ids][0],sourcePlayerIdVerified:false,participationVerified:false,identityMethod:"exact_name_and_team_roster_candidate"}:null;
}
// Historical prior-week identity is diagnostic only. It cannot prove current team or participation.
function priorRosterIdentity(row,roster,now,gameId){
 if(roster?.league!=="NFL"||!Array.isArray(roster.rows)||!Number.isFinite(dt(roster.observedAt))||dt(roster.observedAt)>dt(now))return null;
 const n=name(row?.player?.name),t=team("NFL",row?.player?.team),week=Number(String(gameId).split("_")[1]);
 if(!n||!t||!row?.player?.id||!Number.isInteger(week)||week<1||week>18)return null;
 const a=roster.rows.filter(x=>name(x.name)===n&&Number(x.season)===2026&&Number.isInteger(Number(x.week))&&Number(x.week)>=1&&Number(x.week)<week);
 if(!a.length)return null;
 const ids=new Set(a.map(x=>x.playerId));if(ids.size!==1||![...ids][0])return null;
 const recent=Math.max(...a.map(x=>Number(x.week))),latest=a.filter(x=>Number(x.week)===recent);
 if(week-recent>2||latest.some(x=>team("NFL",x.team)!==t))return null;
 return {playerId:[...ids][0],priorWeek:recent,currentRosterVerified:false,sourcePlayerIdVerified:false,productionEligible:false};
}
function audit(doc,league,now,schedule,roster){
 let eventCandidates=0,identityCandidates=0,recognizedMarkets=0,eligibleResearchSides=0,knownMultipliers=0,priorRosterCandidates=0,recognizedMarketIndependentOfIdentity=0,specialistCatalogCandidates=0;const reasons={},seen=new Set();
 const skip=x=>reasons[x]=(reasons[x]||0)+1;
 const sourceIdentity=identityCollisionAudit(doc);
 for(const r of doc?.data||[]){
  if(sourceIdentity.rejectedOfferIds.has(r?.line_id)){skip("provider_player_identity_collision");continue;}
  const e=eventCrosswalk(r,league,now,schedule);if(!e.matched){skip(e.reason);continue;}eventCandidates++;
  const m=market(r,league);if(m)recognizedMarketIndependentOfIdentity++;else if(catalogMarket(r,league))specialistCatalogCandidates++;
  const i=identity(r,league,roster,now,e.scheduleGameId);if(!i){if(league==="NFL"&&priorRosterIdentity(r,roster,now,e.scheduleGameId))priorRosterCandidates++;skip("roster_identity_unresolved");continue;}identityCandidates++;
  if(!m){skip("unrecognized_exact_market_period");continue;}recognizedMarkets++;
  if(typeof r.line_id!=="string"||!r.line_id||seen.has(r.line_id)||!Number.isFinite(r.line)||r.status!=="active"||!Array.isArray(r.selections)){skip("invalid_offer_contract");continue;}seen.add(r.line_id);
  const sides=r.selections.filter(x=>x&&["higher","lower"].includes(x.side)&&x.available===true);
  if(!sides.length||new Set(sides.map(x=>x.side)).size!==sides.length){skip("missing_or_ambiguous_sides");continue;}
  eligibleResearchSides+=sides.length;knownMultipliers+=sides.filter(x=>Number.isFinite(x.payout_multiplier)&&x.payout_multiplier>0).length;
 }
 return {eventCandidates,identityCandidates,priorRosterCandidates,recognizedMarketIndependentOfIdentity,specialistCatalogCandidates,recognizedMarkets,eligibleResearchSides,knownMultipliers,rejectionCounts:reasons,providerIdentityVerified:false,platformAvailableVerified:false,productionEligible:false,completeBoardVerified:false,rawRowsPublished:0};
}
module.exports={identity,market,audit,priorRosterIdentity,catalogMarket};
