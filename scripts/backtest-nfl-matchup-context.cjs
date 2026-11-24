"use strict";
/**
 * NFL matchups challenger: real historical nflverse team-week / snap / FTN
 * charting are read, not just listed as website research references.
 *
 * PURELY RETROSPECTIVE, CONDITIONAL-ON-OBSERVED PLAYER-GAME COHORT.
 * The 2026 evaluation design was written after seeing 2026 outcomes: not
 * blinded, prospective, an authentic posted-line edge or lineup validation.
 *
 * All team/defense/snap features are lagged to previous WEEK. FTN charting
 * arrives after the game so is delayed by TWO full weeks for the experiment.
 * No actual future game weather, undated injuries or retrospective matchup
 * labels are accepted as prior-week numeric features.
 *
 * FTN is INCLUDED in this model comparison (not isolated from research).
 * FTN data: CC BY-SA 4.0; resulting model publication or commercial usage
 * requires license compliance. No closed-source production model promotion.
 */
const fs=require("node:fs"),path=require("node:path"),zlib=require("node:zlib");
const {forecast,isRoleEligible,marketValue,SPECS}=require("./backtest-nfl-historical-stats.cjs");
const ROOT=path.resolve(__dirname,"..");
const YEARS=[2024,2025,2026],MIN_PRIOR=3;
const MAP=Object.freeze({
 passing_yards:"passing_yards",passing_attempts:"attempts",
 passing_completions:"completions",rushing_yards:"rushing_yards",
 rushing_attempts:"carries",receiving_yards:"receiving_yards",
 receptions:"receptions",receiving_targets:"targets"
});
const MARKETS=Object.freeze(SPECS.filter(x=>Object.hasOwn(MAP,x.id)));
const ALPHA=Object.freeze({defense:0.20,pace:0.12,ftn:0.12});
function read(year,dataset,root=ROOT){
 const name=path.join(root,"outputs/nfl/history",String(year),dataset+".json.gz");
 const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(name)).toString("utf8"));
 if(j.sport!=="NFL"||j.dataset!==dataset||j.recordCount!==j.rows.length||
    j.retrospectivePlayerStatsNotPregameLines!==true)
  throw Error("Historical NFL provenance missing: "+dataset+" "+year);
 return j.rows;
}
const avg=a=>a.reduce((x,y)=>x+y,0)/a.length;
const number=x=>typeof x==="number"&&Number.isFinite(x);
const seasonWeek=x=>Number.isInteger(Number(x.season))&&
 Number.isInteger(Number(x.week))&&Number(x.week)>=1&&Number(x.week)<=18&&
 (x.season_type==null||x.season_type==="REG");
function packedKey(season,team){return season+"|"+team;}
function append(map,key,value){
 if(!map.has(key))map.set(key,[]);
 map.get(key).push(value);
}
function prepare(raw){
 const weeks=new Map(),schedule=new Map(),snapByGameTeam=new Map(),ftnByGame=new Map();
 const audit={inputTeamRows:0,snapRows:0,ftnPlays:0,ftnGames:0,
  unusableFtn:0,missingPlayerOpponent:0,missingFtnSchedule:0};
 for(const y of YEARS){
  for(const r of raw.schedule[y]){
   if(r.game_type==="REG"&&r.game_id&&r.home_team&&r.away_team)
    schedule.set(r.game_id,r);
  }
  for(const r of raw.snap_counts[y]){
   if(!r.game_id||!r.team||!number(r.offense_snaps))continue;
   const k=r.game_id+"|"+r.team;
   snapByGameTeam.set(k,Math.max(snapByGameTeam.get(k)||0,r.offense_snaps));
   audit.snapRows++;
  }
  for(const r of raw.ftn_charting_research_only[y]){
   if(!r.nflverse_game_id||!number(r.n_blitzers)){audit.unusableFtn++;continue;}
   const k=r.nflverse_game_id;
   const q=ftnByGame.get(k)||{n:0,blitz:0};
   q.n++;q.blitz+=r.n_blitzers>0?1:0;
   ftnByGame.set(k,q);audit.ftnPlays++;
  }
  const add=(week,type,row)=>{
   const k=y+"|"+week;
   if(!weeks.has(k))weeks.set(k,{year:y,week,players:[],teams:[],ftn:[]});
   weeks.get(k)[type].push(row);
  };
  for(const r of raw.player_weekly[y])if(seasonWeek(r)){
   if(!r.team||!r.opponent_team)audit.missingPlayerOpponent++;
   add(Number(r.week),"players",r);
  }
  for(const r of raw.team_weekly[y])if(seasonWeek(r)&&r.game_id&&r.team&&r.opponent_team){
   const clone={...r,priorOffenseSnaps:snapByGameTeam.get(r.game_id+"|"+r.team)??null};
   add(Number(r.week),"teams",clone);audit.inputTeamRows++;
  }
 }
 for(const [gameId,q] of ftnByGame){
  const game=schedule.get(gameId);
  if(!game||!q.n){audit.missingFtnSchedule++;continue;}
  const k=game.season+"|"+game.week;
  if(!weeks.has(k))continue;
  weeks.get(k).ftn.push({home:game.home_team,away:game.away_team,
   rate:q.blitz/q.n});
  audit.ftnGames++;
 }
 return {weeks:[...weeks.values()].sort((a,b)=>a.year-b.year||a.week-b.week),audit};
}
function buildRaw(root=ROOT){
 const out={};
 for(const kind of ["player_weekly","team_weekly","snap_counts","ftn_charting_research_only","schedule"]){
  out[kind]={};
  for(const year of YEARS)out[kind][year]=read(year,kind,root);
 }
 return out;
}
function sourceFeatures(player,market,base,ownHist,defHist,leagueHist,ftnHist){
 const y=player.season,team=player.team,opp=player.opponent_team,metric=MAP[market];
 if(!team||!opp||!metric||!number(base)||!number(player.week))
  return null;
 const own=ownHist.get(packedKey(y,team))||[],
   defense=defHist.get(packedKey(y,opp))||[],
   league=leagueHist.get(y)||[],
   ftnOpp=ftnHist.get(packedKey(y,opp))||[],
   ftnLeague=ftnHist.get(packedKey(y,"__league__"))||[];
 const okMetric=rows=>rows.map(r=>r[metric]).filter(number);
 const ownValues=okMetric(own.slice(-5)),allowed=okMetric(defense.slice(-5)),all=okMetric(league);
 const leaguePace=league.map(r=>r.priorOffenseSnaps).filter(x=>number(x)&&x>0);
 const ownPace=own.slice(-5).map(r=>r.priorOffenseSnaps).filter(x=>number(x)&&x>0);
 const oppPace=defense.slice(-5).map(r=>r.priorOffenseSnaps).filter(x=>number(x)&&x>0);
 if(ownValues.length<MIN_PRIOR||allowed.length<MIN_PRIOR||all.length<30||
    leaguePace.length<30||ownPace.length<MIN_PRIOR||oppPace.length<MIN_PRIOR||
    ftnOpp.length<2||ftnLeague.length<20)return null;
 const ownAvg=avg(ownValues),leagueMean=avg(all);
 if(ownAvg<=0||leagueMean<=0)return null;
 const share=Math.max(0,Math.min(1.1,base/ownAvg));
 const oppImpact=(avg(allowed)-leagueMean)*share;
 const paceFactor=Math.max(0.8,Math.min(1.2,
  (avg(ownPace)+avg(oppPace))/(2*avg(leaguePace))));
 const ftnDelta=avg(ftnOpp.slice(-5))-avg(ftnLeague);
 return {oppImpact,paceFactor,ftnDelta,ftnLagWeeks:2};
}
function adjusted(base,features){
 const opponent= Math.max(0,base+ALPHA.defense*features.oppImpact);
 const pace=Math.max(0,opponent*(1+ALPHA.pace*(features.paceFactor-1)));
 const withFtn=Math.max(0,pace*(1+ALPHA.ftn*features.ftnDelta));
 return {opponentOnly:opponent,opponentPace:pace,withFtn};
}
function weekClusterInterval(records,comparedTo,model,seed=260809){
 const weeks=new Map();
 for(const r of records){
  const key=String(r.year)+"|"+String(r.week);
  if(!weeks.has(key))weeks.set(key,[]);
  weeks.get(key).push(Math.abs(r.actual-r[comparedTo])-Math.abs(r.actual-r[model]));
 }
 const groups=[...weeks.values()];
 if(groups.length<4)return null;
 let state=seed>>>0;const draw=()=>{
  state^=state<<13;state^=state>>>17;state^=state<<5;
  return (state>>>0)/4294967296;
 };
 const samples=[];
 for(let i=0;i<500;i++){
  let delta=0,n=0;
  for(let j=0;j<groups.length;j++){
   const group=groups[Math.floor(draw()*groups.length)];
   for(const e of group){delta+=e;n++;}
  }
  samples.push(delta/n);
 }
 samples.sort((a,b)=>a-b);
 return {lower:Number(samples[Math.floor(samples.length*.025)].toFixed(4)),
  upper:Number(samples[Math.floor(samples.length*.975)].toFixed(4)),
  weeks:groups.length,unit:"season_week",draws:samples.length};
}
function rowScore(records){
 const models=["baseline","opponentOnly","opponentPace","withFtn"];
 const scores={};
 for(const m of models){
  const errs=records.map(r=>Math.abs(r.actual-r[m]));
  scores[m]={mae:Number(avg(errs).toFixed(4)),
   rmse:Number(Math.sqrt(avg(errs.map(x=>x*x))).toFixed(4))};
 }
 for(const m of models.slice(1)){
  scores[m].deltaMAEVsBaseline=Number((scores.baseline.mae-scores[m].mae).toFixed(4));
  scores[m].relativeChangePercent=Number((100*(scores.baseline.mae-scores[m].mae)/scores.baseline.mae).toFixed(3));
  scores[m].pairedWeekClusterImprovement95=weekClusterInterval(records,"baseline",m);
 }
 scores.withFtn.deltaMAEVsSameModelWithoutFtn=Number(
  (scores.opponentPace.mae-scores.withFtn.mae).toFixed(4));
 scores.withFtn.ftnIncrementalWeekCluster95=weekClusterInterval(records,"opponentPace","withFtn");
 return scores;
}
function replay(raw,{chosenModels}={}){
 if(!chosenModels||typeof chosenModels!=="object")throw Error("2025-only chosen models required");
 const {weeks,audit}=prepare(raw);
 const playerHist=new Map(),ownHist=new Map(),defHist=new Map(),
   leagueHist=new Map(),ftnHist=new Map(),pendingFtn=[];
 const result=new Map(),counts={playerMarketAttempts:0,eligibleUsage:0,
  enoughContext:0,missingContext:0,missingHistory:0,
  scored2025:0,scored2026:0,
  allSameWeekOutcomesWithheld:true,ftnMinLagWeeks:2};
 const sampleFeatures=[];
 for(const batch of weeks){
  const y=batch.year,w=batch.week;
  // Charting is postgame and typically published within 48h; two-week lag
  // ensures no same/previous-week FTN charts leak into earlier matchups.
  for(let i=pendingFtn.length-1;i>=0;i--){
   const v=pendingFtn[i];
   if(v.year<y||(v.year===y&&v.week<=w-2)){
    for(const team of [v.home,v.away])append(ftnHist,packedKey(v.year,team),v.rate);
    append(ftnHist,packedKey(v.year,"__league__"),v.rate);
    pendingFtn.splice(i,1);
   }
  }
  const currentKeys=new Set();
  for(const r of batch.players){
   if(typeof r.player_id!=="string"||!r.player_id.trim())continue;
   const ident="player:"+r.player_id;
   for(const market of MARKETS){
    counts.playerMarketAttempts++;
    const actual=marketValue(market,r);
    if(!number(actual))continue;
    const id=ident+"|"+market.id,old=playerHist.get(id)||[];
    const pred=forecast(old);
    if(!pred){counts.missingHistory++;continue;}
    const eligibility=isRoleEligible({identity:ident,position:r.position},
      market.id,playerHist);
    if(!eligibility)continue;
    counts.eligibleUsage++;
    if(y<2025)continue;
    const baselineName=chosenModels[market.id]??"last5_mean";
    const baseline=pred[baselineName];
    if(!number(baseline))throw Error("Missing fixed 2025 baseline for "+market.id);
    const f=sourceFeatures(r,market.id,baseline,ownHist,defHist,leagueHist,ftnHist);
    if(!f){counts.missingContext++;continue;}
    counts.enoughContext++;
    const preds=adjusted(baseline,f),k=y+"|"+market.id;
    const dup=y+"|"+w+"|"+ident+"|"+market.id;
    if(currentKeys.has(dup))throw Error("Duplicate NFL player/game/market in replay");
    currentKeys.add(dup);
    if(!result.has(k))result.set(k,[]);
    result.get(k).push({year:y,week:w,actual,baseline,...preds});
    counts[y===2025?"scored2025":"scored2026"]++;
    if(sampleFeatures.length<3)sampleFeatures.push({y,w,market:market.id,
     opponentAdjustment:Number(f.oppImpact.toFixed(4)),
     paceFactor:Number(f.paceFactor.toFixed(4)),
     ftnDelta:Number(f.ftnDelta.toFixed(4))});
   }
  }
  // Introduce ALL this week's outcomes at once AFTER that week's forecasts.
  for(const r of batch.players){
   if(typeof r.player_id!=="string"||!r.player_id.trim())continue;
   for(const market of MARKETS){
    const value=marketValue(market,r);
    if(number(value))append(playerHist,"player:"+r.player_id+"|"+market.id,value);
   }
  }
  for(const r of batch.teams){
   append(ownHist,packedKey(y,r.team),r);
   append(defHist,packedKey(y,r.opponent_team),r);
   append(leagueHist,y,r);
  }
  for(const f of batch.ftn)pendingFtn.push({...f,year:y,week:w});
 }
 const scored=[...result].sort(([a],[b])=>a.localeCompare(b)).map(([key,v])=>{
  const [year,market]=key.split("|");
  return {year:Number(year),market,observations:v.length,
   independentWeeks:new Set(v.map(r=>r.week)).size,models:rowScore(v)};
 });
 return {schemaVersion:1,kind:"nfl_2025_2026_context_matchup_ftn_retro_challenger_v1",
  generatedAt:new Date().toISOString(),seasons:YEARS,
  modelDesignAfter2026ResultsExisted:true,
  mustNotCall2026AnIndependentBlindedTest:true,
  teamStatsOnlyPriorWeeks:true,snapCountsOnlyPriorWeeks:true,
  ftnChartingLagWeeks:2,noCurrentGameWeatherOrInjuries:true,
  ftnIncludedInActualResearchPredictions:true,
  ftnLicense:"CC-BY-SA-4.0",commercialClosedModelPromotionForbiddenPendingLegalCompliance:true,
  fixedContextWeightsNotTunedOn2026:ALPHA,
  opponentContextAndFtnTestedOnSameCohort:true,
  noPostedPrizePicksLineHitRate:null,noPostedUnderdogLineHitRate:null,
  noProspectiveEdgeClaim:true,autoPickEligible:false,
  counts,sourceAudit:audit,perMarketYear:scored};
}
function main(){
 const selected=JSON.parse(fs.readFileSync(path.join(ROOT,"outputs/nfl/backtests/2025-dev-model-selection-latest.json"),"utf8"));
 if(selected.kind!=="nfl_2025_development_model_selection_2026_retro_v1")throw Error("Missing historical 2025-only selection provenance");
 const chosen=Object.fromEntries(selected.selections.map(x=>[x.market,x.selectedModel]));
 const report=replay(buildRaw(),{chosenModels:chosen});
 if(!report.counts.scored2026)throw Error("No contextual NFL test cohort: reject incomplete run");
 const folder=path.join(ROOT,"outputs/nfl/backtests");fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,"context-challenger-latest.json"),JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({kind:report.kind,counts:report.counts,
  per2026:report.perMarketYear.filter(x=>x.year===2026).map(x=>({
   market:x.market,n:x.observations,baseMAE:x.models.baseline.mae,
   matchupMAE:x.models.opponentPace.mae,withFtnMAE:x.models.withFtn.mae,
   matchupImproved:x.models.opponentPace.mae<x.models.baseline.mae,
   ftnImproved:x.models.withFtn.mae<x.models.opponentPace.mae,
   matchupCI:x.models.opponentPace.pairedWeekClusterImprovement95,
   ftnIncrementalCI:x.models.withFtn.ftnIncrementalWeekCluster95})),
  originalPrizePicksAndUnderdogLineHitRate:null}));
}
if(require.main===module)try{main();}catch(e){console.error(e.stack||e);process.exitCode=1;}
module.exports={MAP,MARKETS,ALPHA,prepare,sourceFeatures,adjusted,replay,rowScore,weekClusterInterval,buildRaw};
