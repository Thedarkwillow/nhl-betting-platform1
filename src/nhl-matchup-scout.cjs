"use strict";
/**
 * MLB Ballpark Pal/Statcast-inspired NHL matchup EXPLAINER (not a model).
 * Strictly past-only official NHL final-game player minutes/stats and
 * official game-result opponent context; no proprietary third-party data.
 */
const {buildOpponentContext,canonical}=require("./nhl-opponent-context.cjs");
const SOURCE_CATALOG=Object.freeze([
 {id:"daily-faceoff",name:"Daily Faceoff",url:"https://www.dailyfaceoff.com/starting-goalies",
  focus:"Starting goalies, lines, PP units",integration:"private_report_shadow_and_reference",
  commercialDataLicenseVerified:false,modelFeatureImported:false},
 {id:"nhl-official",name:"NHL.com / NHL EDGE",url:"https://www.nhl.com/edge",
  focus:"Official results, shot locations and tracking",integration:"official_final_game_stats",
  commercialDataLicenseVerified:false,modelFeatureImported:true,
  note:"Existing official game and roster history only; no NHL EDGE tracking download imported."},
 {id:"rotowire",name:"RotoWire NHL lineups",url:"https://www.rotowire.com/hockey/nhl-lineups.php",
  focus:"Goalie reports, injury status and PP units",integration:"manual_review_link",
  commercialDataLicenseVerified:false,modelFeatureImported:false},
 {id:"moneypuck",name:"MoneyPuck",url:"https://moneypuck.com/data.htm",
  focus:"Expected goals and shot-quality history",integration:"private_rate_shadow_and_reference",
  commercialDataLicenseVerified:false,modelFeatureImported:false,
  note:"MoneyPuck season-summary CSV metrics privately imported to a separate research-only shadow; public Scout and production still use official NHL. Written commercial terms remain to be filed."},
 {id:"puckpedia",name:"PuckPedia lines",url:"https://puckpedia.com/team-lines",
  focus:"Forward lines, defense pairs and roster depth",integration:"manual_review_link",
  commercialDataLicenseVerified:false,modelFeatureImported:false}
]);
const CHECK_MARKETS=new Set(["shotsOnGoal","blockedShots","saves"]);
const round=x=>Number(x.toFixed(3));
function playerUsageMatchup(prop,usage){
 if(!Number.isInteger(prop?.playerId)||!Number.isFinite(Date.parse(prop.eventStartsAt)))
  return {sampleGames:0,playerCountPer60:null,last5CountPer60:null,last10CountPer60:null,
    last10AverageCount:null,last10AverageMinutes:null,status:"identity_or_start_missing"};
 if(!CHECK_MARKETS.has(prop.market))return {sampleGames:0,playerCountPer60:null,
  last5CountPer60:null,last10CountPer60:null,last10AverageCount:null,last10AverageMinutes:null,
  status:"stat_unavailable_in_usage_archive"};
 const cutoff=new Date(Date.parse(prop.eventStartsAt)).toISOString().slice(0,10),
  type=prop.market==="saves"?"goalie":"skater";
 const rows=(usage?.players?.[String(prop.playerId)]||[])
  .filter(r=>r.type===type&&r.gameDate<cutoff&&Number.isFinite(r.timeOnIceSeconds)&&
   r.timeOnIceSeconds>=60&&Number.isInteger(r[prop.market])&&r[prop.market]>=0)
  .sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
 const n=rows.length,ten=rows.slice(-10),five=rows.slice(-5);
 const rate=x=>{
  const seconds=x.reduce((s,r)=>s+r.timeOnIceSeconds,0);
  return seconds>0?round(x.reduce((s,r)=>s+r[prop.market],0)*3600/seconds):null;
 };
 const avg=x=>x.length?round(x.reduce((s,v)=>s+v,0)/x.length):null;
 return {sampleGames:n,
  playerCountPer60:n>=5?rate(rows):null,
  last5CountPer60:n>=5?rate(five):null,
  last10CountPer60:n>=5?rate(ten):null,
  last10AverageCount:n>=5?avg(ten.map(x=>x[prop.market])):null,
  last10AverageMinutes:n>=5?avg(ten.map(x=>x.timeOnIceSeconds/60)):null,
  status:n>=5?"official_past_only":"insufficient_official_history",
  source:"NHL official FINAL gamecenter boxscores",
  warning:"Historical usage rates are descriptive, not the current model projection or a verified player prop edge."};
}
function opponentSummary(prop,context){
 const val=context?.factors?.[canonical(prop?.opponent)]?.[prop?.market];
 if(!val||!val.ready||!Number.isFinite(val.observedRatio))
  return {status:"not_ready",opponent:canonical(prop?.opponent),observedRelativeToLeague:null,
   opponentGameSample:val?.games||0,liveModelOverrideAllowed:false};
 return {status:"historical_only",opponent:canonical(prop.opponent),
  observedRelativeToLeague:round(val.observedRatio),
  opponentGameSample:val.games,liveModelOverrideAllowed:false,
  warning:"Full-team historical boxscore volumes allowed; not adjusted for strength of schedule, upcoming starting goalie or special teams. Descriptive only."};
}
function buildOne(prop,usage,context){
 const player=playerUsageMatchup(prop,usage),
  opponent=opponentSummary(prop,context),
  reasons=[];
 if(!Number.isInteger(prop?.gameId))reasons.push("OFFICIAL_GAME_ID_UNRESOLVED");
 if(player.status!=="official_past_only")reasons.push("PLAYER_RATE_UNAVAILABLE");
 if(opponent.status!=="historical_only")reasons.push("OPPONENT_SAMPLE_INSUFFICIENT");
 if(prop?.researchEligibility==="watchlist")reasons.push("PLAYER_ON_SAFETY_WATCHLIST");
 return {kind:"official_nhl_historical_matchup_explainer",
  sources:["official NHL FINAL boxscores","official NHL game/roster/schedule"],
  player,opponent,qualityFlags:reasons,
  thirdPartyPlayerStatsIncluded:false,moneyPuckDataIncluded:false,
  thirdPartyLineupAndPPUnitsVerified:false,commercialSourceRightsVerified:false,
  modelProbabilityAdjusted:false,bookmakerConsensusVerified:false,verifiedEdge:false,
  warning:"Ballpark Pal-style explanatory context, not a calibrated hockey matchup model. Site links are research references and do not imply licensed feeds."};
}
function attachMatchups(props,{usage,history}={}){
 if(!Array.isArray(props))throw Error("A research prop array is required");
 const contexts=new Map();
 const annotated=props.map(prop=>{
  const when=Date.parse(prop.eventStartsAt);
  const date=Number.isFinite(when)?new Date(when).toISOString().slice(0,10):null;
  if(date&&!contexts.has(date))contexts.set(date,
   buildOpponentContext(history,{beforeDate:date}));
  return {...prop,matchupScout:buildOne(prop,usage,date?contexts.get(date):null)};
 });
 const status={playerRateAvailable:annotated.filter(x=>x.matchupScout.player.status==="official_past_only").length,
  opponentContextAvailable:annotated.filter(x=>x.matchupScout.opponent.status==="historical_only").length,
  matchupsWithBoth:annotated.filter(x=>x.matchupScout.player.status==="official_past_only"&&
   x.matchupScout.opponent.status==="historical_only").length,
  activeThirdPartyStatFeeds:0,
  thirdPartyRightsVerified:false,originalHistoricalOutcomeHitRate:null};
 return {props:annotated,summary:status};
}
module.exports={SOURCE_CATALOG,playerUsageMatchup,opponentSummary,buildOne,attachMatchups};
