"use strict";
/**
 * Pre-registered, strictly historical NFL matchup/opportunity research.
 * Original PrizePicks/Underdog line and ORIGINAL frozen direction never edited.
 * Third-party paid websites without a licensed point-in-time feed are missing
 * evidence, not secretly scraped inputs. No odds/probabilities/EV produced.
 */
const {SOURCES}=require("./nfl-research-sources.cjs");
const {SPECS,marketValue}=require("../scripts/backtest-nfl-historical-stats.cjs");
const SPEC=new Map(SPECS.map(x=>[x.id,x]));
const METRIC=Object.freeze({
 passing_yards:"passing_yards",passing_attempts:"attempts",
 passing_completions:"completions",rushing_yards:"rushing_yards",
 rushing_attempts:"carries",receiving_yards:"receiving_yards",
 receptions:"receptions",receiving_targets:"targets"
});
const C=Object.freeze({defense:.20,offense:.12,pace:.12,playerUsage:.10,
  advanced:.04,ftn:.06,weather:.08});
const REFS=Object.freeze(["nflverse","nextgenstats","profootballreference",
 "ftncharting","rotowire","fantasylife","pfn","weather","pff","moneypuck","dailyfaceoff"]);
const num=x=>typeof x==="number"&&Number.isFinite(x);
const avg=x=>x.reduce((a,b)=>a+b,0)/x.length;
const cap=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const regular=r=>Number.isInteger(Number(r?.season))&&Number.isInteger(Number(r?.week))&&
 Number(r.week)>=1&&Number(r.week)<=18&&
 (r.season_type==null||["REG","REGULAR_SEASON"].includes(r.season_type));
const earlier=(r,s,w)=>regular(r)&&(Number(r.season)<s||
 Number(r.season)===s&&Number(r.week)<w);
const priorSameSeason=(r,s,w)=>regular(r)&&Number(r.season)===s&&Number(r.week)<w;
const last=(xs,n=5)=>xs.sort((a,b)=>Number(a.season)-Number(b.season)||
 Number(a.week)-Number(b.week)).slice(-n);
const mean=(rows,key)=>{const xs=rows.map(x=>x[key]).filter(num);return xs.length?avg(xs):null};
function eligibleEvidence(e,source,original,now,{maxAgeHours=24}={}){
 if(!e||e.sourceId!==source||e.licenseForResearch!==true||
   e.sourceGameId!==original.sourceGameId||
   e.team!==original.team||e.opponent!==original.opponent||
   e.eventStartsAt!==original.eventStartsAt)return false;
 const asOf=Date.parse(e.observedAt),issued=Date.parse(e.issuedAt);
 const check=Date.parse(now),start=Date.parse(original.eventStartsAt);
 if(![asOf,issued,check,start].every(Number.isFinite)||issued>asOf||
    asOf>check||check>=start-15*60000||
    start-asOf>maxAgeHours*3600000||
    asOf<check-maxAgeHours*3600000)return false;
 return true;
}
function historicalFeatureSet(p,{teamWeekly=[],playerWeekly=[],snapCounts=[]}){
 const y=Number(p.season),w=Number(p.week),team=String(p.team||"").toUpperCase(),
  opponent=String(p.opponent||"").toUpperCase(),
  key=METRIC[p.market],pid=String(p.historicalPlayerId||"");
 const result={status:"insufficient_prior_history",units:key||null,
  priorTeamGames:0,priorOpponentGames:0,historyCutoffSeason:y,historyCutoffWeek:w,
  source:"nflverse_prior_season_week_derived_not_original_weekly_asof_archive",
  opponentDefenseFactor:null,teamOffenseFactor:null,paceFactor:null,
  playerUsageFactor:null,snapShareLast5:null,usageLast5:null,
  missing:[]};
 if(!Number.isInteger(y)||!Number.isInteger(w)||!team||!opponent||!key||!pid||
    !num(p.historicalProjection)||!num(p.line)||p.historicalProjection<0)
   return {...result,status:"unsupported_market_or_invalid_identity"};
 // One unique team-week observation per source; ambiguous duplicates never count
 // toward the sample threshold. Restrict metric sample sizes to real values.
 const groups=new Map();
 for(const x of teamWeekly.filter(x=>priorSameSeason(x,y,w))){
  const k=JSON.stringify([Number(x.season),Number(x.week),String(x.team||"").toUpperCase()]);
  const a=groups.get(k)||[];a.push(x);groups.set(k,a);
 }
 const teams=[...groups.values()].filter(a=>a.length===1&&a[0].team).map(a=>a[0]);
 const own=last(teams.filter(x=>String(x.team).toUpperCase()===team));
 const opp=last(teams.filter(x=>String(x.opponent_team).toUpperCase()===opponent));
 const league=teams.filter(x=>num(x[key]));
 result.priorTeamGames=own.length;result.priorOpponentGames=opp.length;
 // Offensive and defensive allowances must use prior actual team game rows,
 // never opponent's next game, same-week stats or a reconstructed result.
 const mOwn=mean(own,key),mOpp=mean(opp,key),mLeague=mean(league,key);
 if(mOwn!==null&&mOpp!==null&&mLeague>0&&
   own.filter(x=>num(x[key])).length>=3&&opp.filter(x=>num(x[key])).length>=3&&league.length>=24){
  result.opponentDefenseFactor=cap(mOpp/mLeague,.85,1.15);
  result.teamOffenseFactor=cap(mOwn/mLeague,.85,1.15);
 }else result.missing.push("three_prior_team_opponent_games_and_league_offense");
 const ownSnaps=mean(own.filter(x=>num(x.priorOffenseSnaps)), "priorOffenseSnaps");
 const oppSnaps=mean(opp.filter(x=>num(x.priorOffenseSnaps)), "priorOffenseSnaps");
 const lgSnaps=mean(teams.filter(x=>num(x.priorOffenseSnaps)),"priorOffenseSnaps");
 if(ownSnaps>0&&oppSnaps>0&&lgSnaps>0)
  result.paceFactor=cap((ownSnaps+oppSnaps)/(2*lgSnaps),.88,1.12);
 else result.missing.push("prior_team_and_opponent_offensive_snap_pace");
 const usageKey=p.market.startsWith("receiv")||p.market==="receptions"?"targets":
  p.market.startsWith("rush")?"carries":
  p.market.startsWith("pass")?"attempts":null;
 const player=last(playerWeekly.filter(x=>earlier(x,y,w)&&String(x.player_id)===pid&&
   (x.recent_team||x.team||"").toUpperCase()===team&&num(x[usageKey])),5);
 const current=last(player.filter(x=>Number(x.season)===y),3);
 const old=last(player.filter(x=>Number(x.season)===y),5);
 if(usageKey&&current.length>=2&&old.length>=3){
  const newer=mean(current,usageKey),historic=mean(old,usageKey);
  if(historic>0){
   result.playerUsageFactor=cap(newer/historic,.85,1.15);
   result.usageLast5=historic;
  }
 }
 if(result.playerUsageFactor===null)result.missing.push("player_recent_opportunity_trend");
 const snaps=last(snapCounts.filter(x=>priorSameSeason(x,y,w)&&
   String(x.player_id||x.gsis_id||"")===pid&&
   String(x.team||x.recent_team||"").toUpperCase()===team&&num(x.offense_snaps)),5);
 const pct=snaps.map(x=>num(x.offense_pct)?x.offense_pct:
  num(x.offense_snap_pct)?x.offense_snap_pct:null).filter(num);
 if(pct.length>=3){
  const m=avg(pct);result.snapShareLast5=cap(m>1?m/100:m,0,1);
 }else result.missing.push("exact_player_id_lagged_snap_share");
 result.status=result.opponentDefenseFactor!==null&&result.teamOffenseFactor!==null?
  "partial_past_week_context":"insufficient_prior_history";
 return result;
}
function externalEvidence(p,{now,external=[]}){
 const result={status:"no_licensed_timestamped_pregame_feeds",
  weather:null,injury:null,paidMatchup:null,advanced:null,
  ftn:null,availableSourceIds:[],unavailableSourceIds:[]};
 const sources=SOURCES.map(x=>x.id);
 const candidates=["weather","rotowire","fantasylife","pfn","pff"];
 for(const id of candidates){
  const found=external.filter(e=>eligibleEvidence(e,id,p,now));
  if(found.length!==1){result.unavailableSourceIds.push(id);continue;}
  const e=found[0];result.availableSourceIds.push(id);
  if(id==="weather"&&e.isForecastRun===true&&e.stadiumVenueVerified===true&&
    num(e.windSpeedKmh)&&e.windSpeedKmh>=0&&num(e.precipitationMm)&&
    e.precipitationMm>=0&&e.gameTimeMatched===true){
   result.weather={sourceId:id,issuedAt:e.issuedAt,observedAt:e.observedAt,
    windSpeedKmh:e.windSpeedKmh,precipitationMm:e.precipitationMm,
    forecastNotActualWeather:true,gameTimeMatched:true};
  }else if(id==="rotowire"||id==="fantasylife"||id==="pfn"||id==="pff"){
   // Authorized third-party site reports require a reviewed feature schema;
   // never silently turn a consumer subscription into a live model number.
   result.paidMatchup={status:"licensed_input_not_model_calibrated",sourceId:id,
    evidenceCapturedBeforeKickoff:true};
  }
 }
 const health=external.filter(e=>eligibleEvidence(e,"nflverse_injury_snapshot",p,now)&&
   e.historicalPlayerId===p.historicalPlayerId);
 if(health.length===1&&["OUT","DOUBTFUL","QUESTIONABLE","ACTIVE"].includes(health[0].status)){
  result.injury={status:health[0].status,observedAt:health[0].observedAt,
   sourceId:"nflverse_injury_snapshot",team:p.team,
   exactPlayerIdentity:true,preKickoff:true};
 }
 result.status=result.availableSourceIds.length||result.injury?"partial_pregame_evidence":
  "no_licensed_timestamped_pregame_feeds";
 return result;
}
function advancedContext(p,{nextgen=[],pfr=[],ftn=[]}={}){
 const status={nextgen:"unavailable_or_unmatched",
  pfr:"unavailable_or_unmatched",ftn:"license_isolated_do_not_promote",
  featureValues:{},sourceRightsChecked:false,productionAllowed:false};
 const y=Number(p.season),w=Number(p.week),pid=String(p.historicalPlayerId);
 const find=(records,id,fields)=>{
  const matches=last(records.filter(x=>earlier(x,y,w)&&
     String(x.player_gsis_id||x.player_id||x.gsis_id||"")===pid),5);
  for(const name of fields){
   const m=mean(matches,name);
   if(m!==null&&matches.length>=3)return {field:name,priorMean:m,priorGames:matches.length};
  }return null;
 };
 const a=find(nextgen,"nextgen",["avg_separation","avg_time_to_throw","efficiency"]),
  b=find(pfr,"pfr",["yards_per_route_run","pass_rating","yards_after_contact"]);
 if(a){status.nextgen="past_week_player_identity_matched";status.featureValues.nextgen=a;}
 if(b){status.pfr="past_week_player_identity_matched";status.featureValues.pfr=b;}
 // FTN archived data is permitted for research comparison only. Individual
 // play charting cannot be attached to a player unless stable source IDs and
 // publication lag are verified. Existing chronological FTN study has these.
 if(ftn?.length)status.ftn="historical_charting_available_but_no_stable_player_asof_join";
 return status;
}
function project(p,{teamWeekly=[],playerWeekly=[],snapCounts=[],nextgen=[],
 pfr=[],ftn=[],external=[],now=new Date().toISOString()}={}){
 const h=historicalFeatureSet(p,{teamWeekly,playerWeekly,snapCounts});
 const live=externalEvidence(p,{now,external});
 const advanced=advancedContext(p,{nextgen,pfr,ftn});
 const base=p.historicalProjection,parts=[];
 const factors={defense:h.opponentDefenseFactor,offense:h.teamOffenseFactor,
  pace:h.paceFactor,playerUsage:h.playerUsageFactor,
  liveInjury:null,weather:null,advancedNGS:null,pfr:null,ftn:null};
 const reasons=[...h.missing];
 // Keep the coefficients explicitly unfitted, bounded and separate from the
 // normal champion. Missing data contributes NO factor rather than 0 defense.
 let ratio=1;
 for(const [key,alpha] of [["defense",C.defense],["offense",C.offense],
  ["pace",C.pace],["playerUsage",C.playerUsage]]){
  const x=factors[key];if(x!==null){ratio*=1+alpha*(x-1);parts.push(key);}
 }
 if(live.weather&&["passing_yards","receiving_yards","receptions","receiving_targets",
   "passing_attempts","passing_completions"].includes(p.market)){
  const wx=live.weather;
  const wind=cap((wx.windSpeedKmh-18)/30,0,1);
  const rain=cap(wx.precipitationMm/10,0,1);
  factors.weather=1-C.weather*(.7*wind+.3*rain);
  ratio*=factors.weather;parts.push("pregame_forecast_weather");
 }else reasons.push("timestamped_venue_weather_forecast_not_available");
 if(live.injury?.status==="OUT"||live.injury?.status==="DOUBTFUL"||
   live.injury?.status==="QUESTIONABLE")reasons.push("pregame_injury_risk_abstain");
 else if(!live.injury)reasons.push("verified_exact_player_pregame_injury_status_missing");
 // NGS/PFR source evidence is surfaced but not fitted from arbitrary rating
 // fields; naive FTN multiplier worsened all 8 earlier retrospective markets.
 if(advanced.nextgen==="past_week_player_identity_matched")parts.push("NGS_covariate_observed_only");
 if(advanced.pfr==="past_week_player_identity_matched")parts.push("PFR_covariate_observed_only");
 const eligibility=h.opponentDefenseFactor!==null&&h.teamOffenseFactor!==null&&
  !reasons.includes("pregame_injury_risk_abstain");
 return {id:p.id,sourceSnapshotFirstGitCommitAt:p.sourceSnapshotFirstGitCommitAt,
  originalSelectedSide:p.selectedSide,originalLine:p.line,
  originalProjection:base,shadowProjection:eligibility?Math.max(0,base*cap(ratio,.75,1.25)):null,
  shadowDirection:eligibility?(base*cap(ratio,.75,1.25)>p.line?"Higher":
   base*cap(ratio,.75,1.25)<p.line?"Lower":"ABSTAIN"):null,
  hypothesisOnly:true,shadowStatus:eligibility?"research_shadow_only":"abstain_missing_core_or_injury",
  factorEvidence:factors,history:h,sourceAvailability:live,advancedResearch:advanced,
  featuresApplied:parts,reasons,
  originalOfferedSideUnchanged:true,gameStartAt:p.eventStartsAt,
  noActualInjuryOrWeatherAssumed:true,
  originalPlatformOfferVerified:false,calibratedProbability:null,
  authenticatedSettlementVerified:false,expectedValue:null,autoPickEligible:false};
}
module.exports={METRIC,C,REFS,eligibleEvidence,historicalFeatureSet,externalEvidence,
 advancedContext,project};
