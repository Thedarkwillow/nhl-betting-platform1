"use strict";
/**
 * Sequential held-out NHL official-game replay.
 * Synthetic fixed threshold is NOT an original PrizePicks/Underdog offer.
 * All matchup volume and league rates are updated strictly AFTER scoring a
 * completed calendar date. Models remain research-only even if MAE improves.
 */
const {nhlSkater}=require("./sport-opportunity-production-shadow.cjs");
const mk=()=>new Map(),sum=a=>a.reduce((s,x)=>s+x,0),mean=a=>sum(a)/a.length;
const ok=x=>Number.isInteger(x)&&x>=0,validTime=x=>ok(x)&&x>0&&x<=3900;
function games(history){
 const by=mk(),invalid={};
 for(const p of Object.values(history?.players||{})){
  for(const r of p?.games||[]){
   if(r.type!=="skater"||!["FINAL","OFF"].includes(r.gameState)||!ok(r.gameId)||
    !ok(r.playerId)||!r.gameDate||!r.team||!validTime(r.timeOnIceSeconds))continue;
   const a=by.get(r.gameId)||[];a.push(r);by.set(r.gameId,a);
  }
 }
 const full=[];
 for(const [gameId,a] of by){
  const byTeam=mk();
  for(const r of a){const x=byTeam.get(r.team)||[];x.push(r);byTeam.set(r.team,x);}
  if(byTeam.size!==2||[...byTeam.values()].some(x=>x.length!==18)||
    new Set(a.map(x=>x.playerId)).size!==36||
    new Set(a.map(x=>x.gameDate)).size!==1){invalid.incompleteRoster=(invalid.incompleteRoster||0)+1;continue;}
  if(a.some(x=>!ok(x.shotsOnGoal)||!ok(x.blockedShots))){invalid.missingMarketStat=(invalid.missingMarketStat||0)+1;continue;}
  const teams=[...byTeam],shots=Object.fromEntries(teams.map(([t,rs])=>
   [t,sum(rs.map(x=>x.shotsOnGoal))]));
  const opponent=Object.fromEntries(teams.map(([t],i)=>[t,teams[1-i][0]]));
  full.push({gameId,date:a[0].gameDate,skaters:a,shots,opponent});
 }
 full.sort((a,b)=>a.date.localeCompare(b.date)||a.gameId-b.gameId);
 return {full,invalid};
}
function replay(history,{holdoutFrom="2026-10-01"}={}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(holdoutFrom)||!history?.players)
  throw Error("Valid official history and fixed holdout date required");
 const {full,invalid}=games(history),players=mk(),teamShots=mk(),leagueShots=[],
  leagueRate={shotsOnGoal:{counts:0,seconds:0},blockedShots:{counts:0,seconds:0}};
 const buckets=Object.fromEntries(["shotsOnGoal","blockedShots"].map(m=>[m,{
  matchedAppearanceRows:0,predicted:0,abstained:0,maeBaselineSum:0,maeShadowSum:0,
  fixedThresholdBrierSum:0,games:new Set(),dates:new Set(),zeroActualCount:0,
  abstentionReasons:{}}]));
 let trainingGames=0,holdoutGames=0;
 for(let i=0;i<full.length;){
  const d=full[i].date,batch=[];
  while(i<full.length&&full[i].date===d)batch.push(full[i++]);
  if(d>=holdoutFrom)holdoutGames+=batch.length;
  for(const game of batch){
   if(d<holdoutFrom)continue;
   for(const r of game.skaters){
    const prior=players.get(r.playerId)||[];
    for(const market of Object.keys(buckets)){
     const b=buckets[market];b.matchedAppearanceRows++;
     const opp=game.opponent[r.team],oppHist=teamShots.get(opp)||[];
     const known=oppHist.at(-1),lg=leagueRate[market];
     const context=known&&leagueShots.length>0&&lg.seconds>0?{
      source:"prior_complete_official_games",games:oppHist.length,
      knownAt:known.date+"T23:59:59Z",gameDate:known.date,
      ratio:mean(oppHist.map(x=>x.shots))/mean(leagueShots),
      // Contextual proxy is opponent SOG, never mislabeled shot attempts.
      leagueRatePer3600:lg.counts/lg.seconds*3600}:null;
     const line=market==="shotsOnGoal"?2.5:1.5;
     const q=nhlSkater(prior,{market,cutoff:d+"T12:00:00Z",line,opponent:context});
     if(q.status!=="research_shadow_only"){
      b.abstained++;b.abstentionReasons[q.reason]=(b.abstentionReasons[q.reason]||0)+1;
      continue;
     }
     const values=prior.slice(-10).map(x=>x[market]);
     if(values.length<10)throw Error("Model accepted shorter than 10-game baseline");
     b.predicted++;b.maeBaselineSum+=Math.abs(mean(values)-r[market]);
     b.maeShadowSum+=Math.abs(q.projectedMean-r[market]);
     const actualHigher=Number(r[market]>line);
     b.fixedThresholdBrierSum+=(q.probabilityHigherResearchOnly-actualHigher)**2;
     b.zeroActualCount+=Number(r[market]===0);
     b.games.add(game.gameId);b.dates.add(d);
    }
   }
  }
  // All same-date results become available only AFTER the entire date was
  // evaluated. No same-day early game can inform a later game.
  for(const game of batch){
   trainingGames++;
   for(const [team,shots] of Object.entries(game.shots)){
    const arr=teamShots.get(team)||[];arr.push({date:d,shots});teamShots.set(team,arr.slice(-30));
    leagueShots.push(shots);if(leagueShots.length>600)leagueShots.shift();
   }
   for(const r of game.skaters){
    const arr=players.get(r.playerId)||[];arr.push(r);players.set(r.playerId,arr.slice(-35));
    for(const market of Object.keys(leagueRate)){
     leagueRate[market].counts+=r[market];
     leagueRate[market].seconds+=r.timeOnIceSeconds;
    }
   }
  }
 }
 return {kind:"nhl_fixed_threshold_two_stage_chronological_official_replay_v1",
  holdoutFrom,completeOfficialGames:full.length,excludedOfficialGames:invalid,
  pastGamesLoaded:trainingGames,holdoutGames,
  byMarket:Object.fromEntries(Object.entries(buckets).map(([market,b])=>[market,{
   matchedAppearanceRows:b.matchedAppearanceRows,predicted:b.predicted,
   abstained:b.abstained,distinctGames:b.games.size,distinctDates:b.dates.size,
   zeroActualAppearances:b.zeroActualCount,
   simplePast10MAE:b.predicted?b.maeBaselineSum/b.predicted:null,
   twoStageMAE:b.predicted?b.maeShadowSum/b.predicted:null,
   syntheticFixedThresholdBrier:b.predicted?b.fixedThresholdBrierSum/b.predicted:null,
   abstentionReasons:b.abstentionReasons}])),
  realPlatformLinesUsed:false,syntheticThresholds:true,
  marketCalibrationApproved:false,independentFutureModelSuperiorityProven:false,
  productionDirectionReplaced:false,modelPromoted:false,
  noSameDayOutcomeFeatures:true,noProviderRequests:true};
}
module.exports={games,replay};
