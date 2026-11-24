"use strict";
/**
 * NFL weekly stats-only chronological replay.
 *
 * NOT a backtest of PrizePicks or Underdog Higher/Lower bets: neither original
 * offered pregame lines nor original platform settlement/payouts are present.
 * Predictions are retrospective, conditional on an existing observed game row.
 * All same-week games are withheld until ALL that week's forecasts are made.
 */
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const ROOT=path.resolve(__dirname,"..");
const SEASONS=Object.freeze([2024,2025,2026]);
const FIRST_EVAL_YEAR=2025;
const MIN_PRIOR_GAMES=3;
const ALPHA=0.35;
const RESAMPLES=500;
// Gate evaluation using recorded position plus PREVIOUS weeks' role/opportunity.
// These pragmatic eligibility thresholds were not optimized on the 2026 holdout.
const ROLE=Object.freeze({
 passing:new Set(["QB"]),rushing:new Set(["QB","RB","FB","WR"]),
 receiving:new Set(["RB","FB","WR","TE"]),combo:new Set(["QB","RB","FB","WR","TE"])
});
const MIN_PRIOR_USAGE=Object.freeze({passingAttempts:10,rushAttempts:2,targets:2,comboTouches:3});
const SPECS=Object.freeze([
 {id:"passing_yards",family:"passing",key:"passing_yards"},
 {id:"passing_attempts",family:"passing",key:"attempts"},
 {id:"passing_completions",family:"passing",key:"completions"},
 {id:"passing_touchdowns",family:"passing",key:"passing_tds"},
 {id:"interceptions_thrown",family:"passing",key:"interceptions"},
 {id:"rushing_yards",family:"rushing",key:"rushing_yards"},
 {id:"rushing_attempts",family:"rushing",key:"carries"},
 {id:"rushing_touchdowns",family:"rushing",key:"rushing_tds"},
 {id:"receiving_yards",family:"receiving",key:"receiving_yards"},
 {id:"receptions",family:"receiving",key:"receptions"},
 {id:"receiving_targets",family:"receiving",key:"targets"},
 {id:"receiving_touchdowns",family:"receiving",key:"receiving_tds"},
 {id:"rush_receive_yards",family:"combo",keys:["rushing_yards","receiving_yards"]},
 {id:"pass_rush_yards",family:"combo",keys:["passing_yards","rushing_yards"]},
 {id:"fg_made",family:"kicking",key:"fg_made"},
 {id:"fg_attempts",family:"kicking",key:"fg_attempts"},
 {id:"pat_made",family:"kicking",key:"xp_made"},
 {id:"kicking_points",family:"kicking",key:"kicking_points"},
]);
function positiveInteger(v){return Number.isInteger(Number(v))&&Number(v)>0;}
function validNumber(v){return typeof v==="number"&&Number.isFinite(v);}
function marketValue(spec,row){
 const keys=spec.keys||[spec.key];
 if(!keys.every(k=>validNumber(row[k])))return null;
 return keys.reduce((sum,k)=>sum+row[k],0);
}
function readDataset(root,year,name){
 const filename=path.join(root,"outputs/nfl/history",String(year),name+".json.gz");
 const payload=JSON.parse(zlib.gunzipSync(fs.readFileSync(filename)).toString("utf8"));
 if(payload?.sport!=="NFL"||payload?.dataset!==name||!Array.isArray(payload?.rows)||
    payload.recordCount!==payload.rows.length||
    payload.retrospectivePlayerStatsNotPregameLines!==true)
  throw Error("Invalid NFL archived dataset provenance: "+year+"/"+name);
 return payload.rows;
}
function isRegular(row){
 return Number.isInteger(Number(row.season))&&
   Number.isInteger(Number(row.week))&&Number(row.week)>=1&&Number(row.week)<=18&&
   (row.season_type==null||["REG","REGULAR_SEASON"].includes(row.season_type));
}
function weeklyObservations(rows){
 const out=[],ids=new Set(),rejected={missingIdentity:0,nonRegular:0,duplicate:0};
 for(const r of rows){
  if(!isRegular(r)){rejected.nonRegular++;continue;}
  if(typeof r.player_id!=="string"||!r.player_id.trim()){
   rejected.missingIdentity++;continue;
  }
  const season=Number(r.season),week=Number(r.week),key=season+"|"+week+"|"+r.player_id;
  if(ids.has(key)){rejected.duplicate++;continue;}
  ids.add(key);
  const measures={};
  for(const s of SPECS.filter(x=>x.family!=="kicking")){
   const value=marketValue(s,r);
   if(value!==null)measures[s.id]=value;
  }
  if(!Object.keys(measures).length)continue;
  out.push({year:season,week,identity:"player:"+r.player_id,
    position:typeof r.position==="string"?r.position.toUpperCase().trim():null,
    measures,observedSource:"nflverse player_weekly"});
 }
 if(rejected.duplicate)throw Error("Duplicate weekly player IDs; refuse silent merge");
 return {observations:out,rejected};
}
function kickingObservations(rows){
 const games=new Map(),seenPlays=new Set();
 const audit={inputEvents:rows.length,acceptedPlays:0,missingKickerId:0,
   missingGameIdentity:0,unknownResult:0,duplicatePlayIds:0,nonRegular:0};
 for(const r of rows){
  if(!isRegular(r)){audit.nonRegular++;continue;}
  if(!r.game_id||!r.play_id){audit.missingGameIdentity++;continue;}
  const playId=String(r.game_id)+"|"+String(r.play_id);
  if(seenPlays.has(playId)){audit.duplicatePlayIds++;continue;}
  seenPlays.add(playId);
  if(typeof r.kicker_player_id!=="string"||!r.kicker_player_id.trim()){
   audit.missingKickerId++;continue;
  }
  const fg=Number(r.field_goal_attempt)===1;
  const xp=Number(r.extra_point_attempt)===1;
  if(!fg&&!xp)continue;
  if((fg&&!["made","missed","blocked"].includes(r.field_goal_result))||
     (xp&&!["good","failed","blocked","missed"].includes(r.extra_point_result))){
    audit.unknownResult++;continue;
  }
  const key=[r.season,r.week,r.game_id,r.kicker_player_id].join("|");
  if(!games.has(key))games.set(key,{year:Number(r.season),week:Number(r.week),
    identity:"kicker:"+r.kicker_player_id,
    measures:{fg_made:0,fg_attempts:0,pat_made:0,kicking_points:0},
    observedSource:"nflverse kicking_pbp"});
  const item=games.get(key).measures;
  item.fg_attempts+=Number(fg);
  if(fg&&r.field_goal_result==="made"){item.fg_made++;item.kicking_points+=3;}
  if(xp&&r.extra_point_result==="good"){item.pat_made++;item.kicking_points+=1;}
  audit.acceptedPlays++;
 }
 if(audit.duplicatePlayIds)throw Error("Duplicate kicker play IDs in archive");
 // No zero-attempt kicker games can be inferred from an attempt-only file.
 const appearances=new Set();
 for(const v of games.values()){
  const k=v.year+"|"+v.week+"|"+v.identity;
  if(appearances.has(k))throw Error("Multiple kicker games in a single week require manual identity reconciliation");
  appearances.add(k);
 }
 return {observations:[...games.values()],audit};
}
function loadObservations(root=ROOT,seasons=SEASONS){
 const all=[],sourceCounts=[],kickingAudit={};
 for(const year of seasons){
  const weekly=weeklyObservations(readDataset(root,year,"player_weekly"));
  const kicks=kickingObservations(readDataset(root,year,"kicking_pbp"));
  if(!weekly.observations.length||!kicks.observations.length)
   throw Error("Empty NFL required history for "+year);
  all.push(...weekly.observations,...kicks.observations);
  sourceCounts.push({year,weeklyRows:weekly.observations.length,
    kickerGameRows:kicks.observations.length});
  kickingAudit[year]=kicks.audit;
 }
 return {observations:all,sourceCounts,kickingAudit};
}
function mean(xs){return xs.reduce((sum,x)=>sum+x,0)/xs.length;}
function forecast(history){
 if(history.length<MIN_PRIOR_GAMES)return null;
 const career=mean(history),last5=mean(history.slice(-5)),
    last10=mean(history.slice(-10));
 let ewma=history[0];
 for(let i=1;i<history.length;i++)ewma=ALPHA*history[i]+(1-ALPHA)*ewma;
 // Hyperparameters fixed in advance; no fitting on 2026.
 const shrinkWeight=Math.min(5,history.length)/(Math.min(5,history.length)+3);
 return {career_mean:career,last5_mean:last5,last10_mean:last10,
   shrunk_last5:shrinkWeight*last5+(1-shrinkWeight)*career,
   ewma_035:ewma};
}
function isRoleEligible(row,market,histories){
 if(row.identity.startsWith("kicker:"))return true;
 const spec=SPECS.find(s=>s.id===market);
 if(!spec||!ROLE[spec.family]?.has(row.position))return false;
 const priorMean=key=>{
  const history=histories.get(row.identity+"|"+key)||[];
  return history.length>=MIN_PRIOR_GAMES?mean(history.slice(-5)):null;
 };
 const passes=priorMean("passing_attempts"),rushes=priorMean("rushing_attempts"),
   targets=priorMean("receiving_targets");
 if(spec.family==="passing"||market==="pass_rush_yards")
  return row.position==="QB"&&passes!==null&&passes>=MIN_PRIOR_USAGE.passingAttempts;
 if(spec.family==="rushing")return rushes!==null&&rushes>=MIN_PRIOR_USAGE.rushAttempts;
 if(spec.family==="receiving")return targets!==null&&targets>=MIN_PRIOR_USAGE.targets;
 if(market==="rush_receive_yards")return rushes!==null&&targets!==null&&
  rushes+targets>=MIN_PRIOR_USAGE.comboTouches;
 return false;
}
function chronology(observations,{firstEvalYear=FIRST_EVAL_YEAR}={}){
 const ordered=[...observations].sort((a,b)=>a.year-b.year||a.week-b.week);
 const histories=new Map(),scores=new Map();
 const counts={inputRows:ordered.length,eligibleForecastTargets:0,
   skippedNoHistory:0,skippedRoleOrPriorUsage:0,skippedBadTarget:0,
   yearsScored:{},sameWeekWithheld:true,duplicatePlayerWeekMarket:0};
 let cursor=0;
 while(cursor<ordered.length){
  const year=ordered[cursor].year,week=ordered[cursor].week;
  const batch=[];
  while(cursor<ordered.length&&ordered[cursor].year===year&&ordered[cursor].week===week)
   batch.push(ordered[cursor++]);
  const currentKeys=new Set();
  // Forecast entire week's slate before any outcomes are introduced.
  for(const row of batch){
   for(const [market,actual] of Object.entries(row.measures)){
    const key=row.identity+"|"+market;
    const weekKey=year+"|"+week+"|"+key;
    if(currentKeys.has(weekKey)){
     counts.duplicatePlayerWeekMarket++;
     throw Error("Duplicate same-week player-market outcome");
    }
    currentKeys.add(weekKey);
    if(!validNumber(actual)){counts.skippedBadTarget++;continue;}
    const f=forecast(histories.get(key)||[]);
    if(year>=firstEvalYear){
     if(f===null){counts.skippedNoHistory++;continue;}
     if(!isRoleEligible(row,market,histories)){
      counts.skippedRoleOrPriorUsage++;continue;
     }
     const match=market+"|"+year;
     if(!scores.has(match))scores.set(match,[]);
     scores.get(match).push({year,week,actual,predictions:f});
     counts.eligibleForecastTargets++;
     counts.yearsScored[year]=(counts.yearsScored[year]||0)+1;
    }
   }
  }
  for(const row of batch)for(const [market,actual] of Object.entries(row.measures)){
   if(!validNumber(actual))continue;
   const key=row.identity+"|"+market;
   if(!histories.has(key))histories.set(key,[]);
   histories.get(key).push(actual);
  }
 }
 return {scores,counts};
}
function round(n){return Number(n.toFixed(4));}
function bootstrapWeekCI(rows,candidate,seed=62026){
 const byWeek=new Map();
 for(const r of rows){
  const delta=Math.abs(r.actual-r.predictions.last5_mean)-
    Math.abs(r.actual-r.predictions[candidate]);
  if(!byWeek.has(r.week))byWeek.set(r.week,[]);
  byWeek.get(r.week).push(delta);
 }
 const groups=[...byWeek.values()];
 if(groups.length<4)return null;
 let state=seed>>>0;
 const random=()=>{state^=state<<13;state^=state>>>17;state^=state<<5;return(state>>>0)/4294967296;};
 const draws=[];
 for(let i=0;i<RESAMPLES;i++){
  let total=0,count=0;
  for(let j=0;j<groups.length;j++){
   const group=groups[Math.floor(random()*groups.length)];
   for(const x of group){total+=x;count++;}
  }
  draws.push(total/count);
 }
 draws.sort((a,b)=>a-b);
 return {lower:round(draws[Math.floor(RESAMPLES*.025)]),
   upper:round(draws[Math.floor(RESAMPLES*.975)]),
   clusterUnit:"season_week",weeks:groups.length,draws:RESAMPLES};
}
function summarize(scores){
 const byMarketYear=[];
 for(const [key,rows] of [...scores.entries()].sort()){
  const [market,yearText]=key.split("|"),year=Number(yearText),models={};
  const names=Object.keys(rows[0].predictions);
  for(const name of names){
   const absolute=rows.map(r=>Math.abs(r.actual-r.predictions[name]));
   const squared=rows.map(r=>(r.actual-r.predictions[name])**2);
   const mae=mean(absolute);
   models[name]={mae:round(mae),rmse:round(Math.sqrt(mean(squared))),
     maeImprovementVsLast5:name==="last5_mean"?0:
      round(mean(rows.map((r,i)=>Math.abs(r.actual-r.predictions.last5_mean)-absolute[i]))),
     improvementWeekBootstrap95:name==="last5_mean"?null:bootstrapWeekCI(rows,name)};
  }
  byMarketYear.push({year,market,pairedObservations:rows.length,
    distinctWeeks:new Set(rows.map(r=>r.week)).size,
    lowSampleSize:rows.length<100||new Set(rows.map(r=>r.week)).size<8,models,
    noOriginalOfferedLines:true});
 }
 return byMarketYear;
}
function buildReport(loaded,{at=new Date().toISOString()}={}){
 const replay=chronology(loaded.observations);
 if(!replay.counts.yearsScored[2025]||!replay.counts.yearsScored[2026])
  throw Error("Missing developer or current-season evaluation evidence");
 const perMarket=summarize(replay.scores);
 return {schemaVersion:1,kind:"nfl_retro_chronological_stats_only_v1",
  generatedAt:at,sources:["nflverse player_weekly","nflverse kicking_pbp"],
  seasonsLoaded:SEASONS,developmentSeason:2025,retrospectiveTestSeason:2026,
  scoringOnlyRegularSeason:true,minPriorObservedPlayerGames:MIN_PRIOR_GAMES,
  alwaysUsePriorWeeksOnly:true,sameWeekResultsWithheldUntilBatchEnd:true,
  positionAndPriorUsageGated:true,
  requiredPreviousWeeklyUsage:MIN_PRIOR_USAGE,
  paramsFixedWithout2026Optimization:{ewmaAlpha:ALPHA,
   shrinkagePseudoGames:3,rollingWindows:[5,10],minPriorGames:MIN_PRIOR_GAMES},
  sourceCounts:loaded.sourceCounts,kickingEventAudit:loaded.kickingAudit,
  cohortWarning:"Conditional on a player appearing in a stats archive row. Position comes from retrospective weekly file, NOT a time-stamped pregame roster. Eligible only when previous games show role-relevant opportunity; no current-week performance eligibility. Kicker data exclude games with zero attempts and unresolved kicker IDs. Not a complete pregame prop board.",
  backtestClassification:"retrospective_stat_projection_comparison_not_pregame_precommitted",
  historicalPrizePicksLinesMatched:false,historicalUnderdogLinesMatched:false,
  prizePicksHigherLowerHitRate:null,underdogHigherLowerHitRate:null,
  alwaysHigherOrLowerAgainstOfferedLine:null,calibratedProbabilities:null,
  realizedBettingEV:null,verifiedProspectiveEdge:false,autoPickEligible:false,
  rawPerPlayerDataNotPublished:true,counts:replay.counts,byMarketYear:perMarket};
}
function main(){
 const loaded=loadObservations();
 const report=buildReport(loaded);
 const dir=path.join(ROOT,"outputs/nfl/backtests");
 fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(path.join(dir,"stats-only-latest.json"),JSON.stringify(report,null,2)+"\n");
 const summary=report.byMarketYear.filter(x=>x.year===2026)
  .map(x=>({market:x.market,n:x.pairedObservations,maeLast5:x.models.last5_mean.mae,
    maeShrunk:x.models.shrunk_last5.mae,maeCareer:x.models.career_mean.mae,
    shrunkDiffCI:x.models.shrunk_last5.improvementWeekBootstrap95}));
 console.log(JSON.stringify({status:"retrospective_stats_only",
  seasons:SEASONS,rows:report.counts.inputRows,
  evaluated:report.counts.yearsScored,
  kickerAudit:report.kickingEventAudit,
  markets2026:summary,
  postedHistoricalLinesAvailable:false,
  prospectiveNFLHitRate:null}));
}
if(require.main===module)try{main();}catch(e){console.error(e.stack||e.message);process.exitCode=1;}
module.exports={SPECS,marketValue,weeklyObservations,kickingObservations,
  isRoleEligible,forecast,chronology,summarize,buildReport,bootstrapWeekCI,loadObservations};
