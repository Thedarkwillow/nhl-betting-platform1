"use strict";
const MARKETS=["saves","shotsOnGoal","blockedShots"];
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
const rnd=x=>Number(x.toFixed(5));
function compareUsageForecasts(index,{minGames=5}={}){
 if(!index?.players||!Number.isInteger(minGames)||minGames<5)throw Error("Official NHL usage index required");
 const rows=[];
 for(const [id,gameRows] of Object.entries(index.players)){
  const previous=Object.fromEntries(MARKETS.map(m=>[m,[]]));
  const sorted=[...gameRows].sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
  for(const game of sorted){
   for(const market of MARKETS){
    if((market==="saves")!==(game.type==="goalie"))continue;
    const prior=previous[market],actual=game[market],toi=game.timeOnIceSeconds;
    if(Number.isInteger(actual)&&actual>=0&&Number.isFinite(toi)&&toi>0&&prior.length>=minGames){
     const all=prior.map(r=>r.actual),five=all.slice(-5),ten=all.slice(-10);
     const champion=.5*mean(five)+.3*mean(ten)+.2*mean(all);
     const priorTen=prior.slice(-10),priorFive=prior.slice(-5);
     const avgToi=items=>mean(items.map(x=>x.toi));
     const expectedSeconds=.65*avgToi(priorTen)+.35*avgToi(priorFive);
     const minuteEstimate=expectedSeconds/60;
     const totalSavesOrSkaterStat=priorTen.reduce((s,r)=>s+r.actual,0);
     const totalToi=priorTen.reduce((s,r)=>s+r.toi,0);
     const rate=totalToi>0?totalSavesOrSkaterStat/totalToi:null;
     const shadow=rate===null?null:Math.max(0,rate*expectedSeconds);
     rows.push({playerId:Number(id),gameId:game.gameId,gameDate:game.gameDate,
      market,actual,champion,shadow,priorGames:prior.length,
      source:"official_final_gamecenter_boxscore",actualGoalieStarterKnown:game.type==="goalie"&&typeof game.started==="boolean",
      actualGoalieStarter:game.type==="goalie"?game.started:null,
      expectedMinutesShadow:minuteEstimate,actualMinutes:toi/60});
    }
   }
   // Use earlier dates only. No same-date data should enter later same-date forecasts.
   // Player's same-date NHL double appearances are quarantined rather than sequenced.
   if(sorted.some(x=>x!==game&&x.gameDate===game.gameDate))continue;
   for(const market of MARKETS){
    const n=game[market];
    if(Number.isInteger(n)&&n>=0&&Number.isFinite(game.timeOnIceSeconds)&&game.timeOnIceSeconds>0)
     previous[market].push({actual:n,toi:game.timeOnIceSeconds});
   }
  }
 }
 const byMarket={};for(const market of MARKETS){
  const subset=rows.filter(x=>x.market===market&&Number.isFinite(x.shadow));
  const n=subset.length;
  const mae=f=>n?rnd(mean(subset.map(x=>Math.abs(x[f]-x.actual)))):null;
  const championMAE=mae("champion"),shadowMAE=mae("shadow");
  byMarket[market]={observations:n,distinctGames:new Set(subset.map(x=>x.gameId)).size,
   distinctDates:new Set(subset.map(x=>x.gameDate)).size,
   championMAE,usageRateShadowMAE:shadowMAE,
   deltaChampionMinusShadow:n?rnd(championMAE-shadowMAE):null,
   canPromote:false,statLineHitRate:null};
 }
 return {schemaVersion:1,kind:"nhl_goalie_and_skater_role_stat_backtest",
  method:"Walk-forward per-player official NHL boxscores; weighted count baseline versus prior TOI-rate times prior estimated minutes; minimum five past valid games",
  source:"Official NHL final gamecenter boxscore",
  byMarket,evaluatedRows:rows.length,distinctPlayers:new Set(rows.map(r=>r.playerId)).size,
  allHistoricalPicksPregamePublished:false,starterConfirmationsAvailable:false,
  injuryContextAvailable:false,actualPrizePicksLinesUsed:false,
  calibrated:false,prospectiveHitRate:null,
  modelReleaseEligible:false,
  warning:"Only observed players who appeared in games. Future starter/goalie pulls, injuries, and scratches cannot be predicted from final boxscores; source data is selected 2026-27 partial regular season, no independent untouched season and no original bet line. Compare MAE only; no hit rate, payout/EV or automatic deployment."};
}
module.exports={compareUsageForecasts};
