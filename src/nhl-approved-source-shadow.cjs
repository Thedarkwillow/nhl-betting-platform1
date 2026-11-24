"use strict";
const {estimateCountProbabilities}=require("./prop-probabilities.cjs");
const {canonicalTeam}=require("./nhl-pregame-intel.cjs");
const validTime=x=>Number.isFinite(Date.parse(x));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const round=x=>Number(x.toFixed(4));
function safeRate(v){return Number.isFinite(v)&&v>=0&&v<180?v:null;}
function leagueRates(teams){
 const rows=Object.values(teams||{}).filter(t=>t.gamesPlayed>=3),mean=k=>{
  const valid=rows.map(t=>t[k]).filter(x=>safeRate(x)!==null);
  return valid.length>=12?valid.reduce((s,x)=>s+x,0)/valid.length:null;
 };
 return {shotsAgainstPer60:mean("shotsOnGoalAgainstPer60"),
  shotsForPer60:mean("shotsOnGoalForPer60"),xGoalsAgainstPer60:mean("xGoalsAgainstPer60")};
}
function estimateSourceModel(prop,approved,asOf){
 if(!prop||!approved||!validTime(asOf)||!validTime(prop.eventStartsAt)||
  !validTime(prop.capturedAt)||!validTime(approved.generatedAt)||
  Date.parse(approved.generatedAt)>Date.parse(asOf)||Date.parse(asOf)>=Date.parse(prop.eventStartsAt)||
  Date.parse(prop.capturedAt)>Date.parse(asOf)||
  Date.parse(asOf)-Date.parse(prop.capturedAt)>90*60000)
  return {status:"source_or_quote_stale_or_after_start",candidate:null};
 if(!Number.isInteger(prop.playerId)||prop.playerId<1||!Number.isInteger(prop.gameId)||
  prop.gameId<1||!Number.isFinite(prop.line)||prop.line<0||
  !Number.isFinite(prop.projection)||prop.projection<0)
  return {status:"invalid_original_source_offer",candidate:null};
 if(!["shotsOnGoal","goals","saves"].includes(prop.market))
  return {status:"market_not_yet_supported",candidate:null};
 const mp=approved.moneyPuck,stats=mp?.[prop.market==="saves"?"goalies":"skaters"]?.rows?.[String(prop.playerId)],
  teams=mp?.teams?.rows;
 if(!stats||stats.gamesPlayed<5||!teams||canonicalTeam(stats.team)!==canonicalTeam(prop.team))
  return {status:"missing_or_team_conflicted_moneypuck_history",candidate:null};
 const expectedMin=prop.roleEvidence?.usage?.expectedMinutesShadow;
 if(!Number.isFinite(expectedMin)||expectedMin<7||expectedMin>65)
  return {status:"unverified_expected_minutes",candidate:null};
 const own=prop.market==="shotsOnGoal"?safeRate(stats.xOnGoalPer60):
  prop.market==="goals"?safeRate(stats.xGoalsPer60):
  safeRate(stats.xOnGoalAgainstPer60)!==null&&safeRate(stats.xGoalsAgainstPer60)!==null?
   Math.max(0,stats.xOnGoalAgainstPer60-stats.xGoalsAgainstPer60):null;
 if(own===null)return {status:"source_rate_missing",candidate:null};
 const opponent=canonicalTeam(prop.opponent);
 const other=teams[opponent],league=leagueRates(teams);
 const key=prop.market==="shotsOnGoal"?"shotsOnGoalAgainstPer60":
  prop.market==="goals"?"xGoalsAgainstPer60":"shotsOnGoalForPer60";
 const baseline=prop.market==="shotsOnGoal"?league.shotsAgainstPer60:
  prop.market==="goals"?league.xGoalsAgainstPer60:league.shotsForPer60;
 let ratio=1;
 if(other&&other.gamesPlayed>=5&&safeRate(other[key])!==null&&baseline>0)
  ratio=clamp(other[key]/baseline,.75,1.25);
 const descriptiveRate=own*expectedMin/60;
 // Pre-registered, highly shrunk *research only* 75/25 blend. We must prove
 // it helps on forward frozen comparisons before deploying either coefficient.
 const candidateMean=clamp(.75*prop.projection+.25*descriptiveRate*(.8+.2*ratio),0,85);
 const probability=estimateCountProbabilities(candidateMean,prop.line);
 const champion=estimateCountProbabilities(prop.projection,prop.line);
 if(!probability||!champion)return {status:"unsupported_distribution",candidate:null};
 const matchingGame=(approved.dailyFaceoff?.games||[]).find(g=>g.gameId===prop.gameId&&
  Math.abs(Date.parse(g.eventStartsAt)-Date.parse(prop.eventStartsAt))<=5*60000);
 const goalie=matchingGame?.goalies?.find(g=>g.playerId===prop.playerId&&canonicalTeam(g.team)===canonicalTeam(prop.team));
 const role=(approved.dailyFaceoff?.lineups?.[canonicalTeam(prop.team)]?.players||[])
  .find(p=>p.playerId===prop.playerId);
 return {status:"research_shadow_only",candidate:{
  playerId:prop.playerId,gameId:prop.gameId,eventStartsAt:prop.eventStartsAt,
  market:prop.market,line:prop.line,tier:prop.tier,selectedSide:prop.lean,
  playerTeam:canonicalTeam(prop.team),opponentTeam:opponent,
  baseMean:round(prop.projection),sourceMean:round(descriptiveRate),
  shadowMean:round(candidateMean),opponentRelativeVolume:round(ratio),
  expectedMinutesShadow:round(expectedMin),sourceSeasonGames:stats.gamesPlayed,
  championHigher:champion.higher,shadowHigher:probability.higher,
  championLower:champion.lower,shadowLower:probability.lower,
  originalQuoteCapturedAt:prop.capturedAt,sourceCapturedAt:approved.generatedAt,
  shadowCreatedAt:asOf,model:"moneypuck-rate-25pct-shrink-shadow-v1",
  bookmakerOfferIndependentlyVerified:false,
  dataModelCalibrated:false,readyForBetting:false,
  moneyPuckSeasonToDateOnly:true,
  dfoGoalieStatus:goalie?.status||"unconfirmed",
  dfoLineGroup:role?.groupName||null,dfoCategory:role?.categoryName||null,
  dfoLinesProjectedNotConfirmed:true,
  dfoIndependentClubStarterVerified:false,
  sourceApprovalUserReported:true,
  commercialTermsWrittenVerificationPending:true,
  adjustmentNotDeployed:true}};
}
function buildApprovedShadow(research,approved,asOf=new Date().toISOString()){
 if(!Array.isArray(research?.rankedProps)||!approved?.moneyPuck||!approved.dailyFaceoff)
  throw Error("Original current NHL research and approved-source archive required");
 const items=[],reasons={},seen=new Set();
 for(const prop of research.rankedProps){
  const key=[prop.gameId,prop.playerId,prop.market,prop.line,prop.tier,prop.lean].join("|");
  if(seen.has(key))continue;seen.add(key);
  const result=estimateSourceModel(prop,approved,asOf);
  if(result.candidate)items.push(result.candidate);
  else reasons[result.status]=(reasons[result.status]||0)+1;
 }
 return {schemaVersion:1,kind:"nhl_approved_source_shadow_research",
  asOf,sourceCapturedAt:approved.generatedAt,sourceMode:"MoneyPuck rates and Daily Faceoff reported/projected context",
  providerApprovalUserReported:true,writtenCommercialTermsNotVerified:true,
  actualFutureOfficialGradingPending:true,prospectiveVerified:false,
  modelDeployed:false,calibrationPassed:false,sourceRows:items,
  counts:{originalResearchProps:research.rankedProps.length,shadowRows:items.length,
   goalieRows:items.filter(x=>x.market==="saves").length,
   dfoReporterConfirmed:items.filter(x=>x.dfoGoalieStatus==="reported_confirmed").length,
   excluded:reasons},
  method:"0.75 original weighted count projection + 0.25 MoneyPuck observed season-to-date xOnGoal/xG rate x conservatively estimated historical TOI; opponent relative-volume correction 20% of capped ratio. All coefficients deliberately preregistered as unvalidated shadow only.",
  warning:"No postgame backtest allowed on season-to-date file captured after the game; only actual future frozen offers may be graded. Daily Faceoff projected lines/confirmed reports are not independently authenticated club announcements. Shadow means and probabilities do not change production props or lineups."};
}
module.exports={estimateSourceModel,buildApprovedShadow,leagueRates};
