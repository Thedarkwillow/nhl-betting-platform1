"use strict";
/** Historical goalies who PLAYED, not predictions of who will start. */
const {parseCsv}=require("./nhl-approved-source-adapters.cjs");
const {seasonOf,normalizeDay}=require("./nhl-moneypuck-game-lab.cjs");
const {pairedGameInterval}=require("./nhl-season-model-lab.cjs");
const mean=arr=>arr.reduce((a,b)=>a+b,0)/arr.length;
const round=x=>Number(x.toFixed(6));
function parseGoalieGameCsv(text){
 const {headers,rows}=parseCsv(text);
 const names=["playerId","gameId","gameDate","situation","icetime",
  "xOnGoal","xGoals","ongoal","goals"];
 const at=Object.fromEntries(names.map(x=>[x,headers.indexOf(x)]));
 if(names.some(x=>at[x]<0))throw Error("MoneyPuck goalie game CSV missing required column: "+names.filter(x=>at[x]<0).join(","));
 const results=[],seen=new Set();
 for(const line of rows){
  const get=k=>line[at[k]];
  if(get("situation")!=="all")continue;
  const playerId=Number(get("playerId")),gameId=Number(get("gameId")),
   day=normalizeDay(get("gameDate")),season=seasonOf(gameId),
   toi=Number(get("icetime")),xon=Number(get("xOnGoal")),
   xg=Number(get("xGoals")),on=Number(get("ongoal")),goals=Number(get("goals"));
  if(!Number.isInteger(playerId)||playerId<1||!Number.isInteger(gameId)||!season||!day||
    ![toi,xon,xg,on,goals].every(Number.isFinite)||toi<=0||xon<0||xg<0||
    xon<xg||!Number.isInteger(on)||on<0||!Number.isInteger(goals)||
    goals<0||on<goals)throw Error("Invalid goalie historical game/stat identity");
  const key=playerId+"|"+gameId;
  if(seen.has(key))throw Error("Duplicate goalie player/game");
  seen.add(key);
  results.push({playerId,gameId,gameDate:day,season,toiSeconds:toi,
   xOnGoalAgainst:xon,xGoalsAgainst:xg,saves:on-goals});
 }
 return results;
}
function candidateSaves(prior){
 if(prior.length<5)return null;
 const values=prior.map(x=>x.saves),s=prior.slice(-20),ten=prior.slice(-10),five=prior.slice(-5);
 const base=.5*mean(values.slice(-5))+.3*mean(ten.map(x=>x.saves))+.2*mean(values);
 const seconds=.65*mean(ten.map(x=>x.toiSeconds))+.35*mean(five.map(x=>x.toiSeconds));
 const weight=s.reduce((acc,x)=>acc+x.toiSeconds,0);
 if(weight<=0)return null;
 const rate=s.reduce((acc,x)=>acc+Math.max(0,x.xOnGoalAgainst-x.xGoalsAgainst),0)/weight;
 const quality=rate*seconds;
 return {champion:base,shadow:.75*base+.25*quality,
  expectedMinutesIfPlaying:seconds/60,sourceMean:quality};
}
function evaluateGoalieHistory(rows,{holdoutSeason="2025-26"}={}){
 if(!Array.isArray(rows)||!["2024-25","2025-26","2026-27"].includes(holdoutSeason))
  throw Error("Invalid historical goalie season");
 const byId=new Map(),seen=new Set();
 for(const row of rows){
  if(!row||!Number.isInteger(row.playerId)||!Number.isInteger(row.gameId)||
   !row.gameDate||row.season!==seasonOf(row.gameId)||
   !Number.isInteger(row.saves)||row.saves<0||
   ![row.toiSeconds,row.xOnGoalAgainst,row.xGoalsAgainst].every(Number.isFinite)||
   row.toiSeconds<=0||row.xOnGoalAgainst<row.xGoalsAgainst)
   throw Error("Invalid historical goalie row");
  const key=row.playerId+"|"+row.gameId;
  if(seen.has(key))throw Error("Repeated historical goalie appearance");
  seen.add(key);
  if(!byId.has(row.playerId))byId.set(row.playerId,[]);
  byId.get(row.playerId).push(row);
 }
 const forecasts=[];
 for(const [id,games] of byId){
  games.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
  let prior=[];
  for(let i=0;i<games.length;){
   const day=games[i].gameDate,batch=[];
   while(i<games.length&&games[i].gameDate===day)batch.push(games[i++]);
   for(const g of batch){
    if(g.season!==holdoutSeason)continue;
    const result=candidateSaves(prior);
    if(result)forecasts.push({gameId:g.gameId,gameDate:g.gameDate,playerId:id,
     market:"saves",actual:g.saves,
     champion:result.champion,shadow:result.shadow,
     candidates:{"weighted-form-v1":result.champion,"moneypuck-goalie":result.shadow},
     lastFeatureDay:prior.at(-1).gameDate});
   }
   prior=prior.concat(batch);
  }
 }
 const n=forecasts.length,avgError=k=>n?round(mean(forecasts.map(x=>Math.abs(x[k]-x.actual)))):null;
 return {schemaVersion:1,kind:"nhl_moneypuck_goalie_conditional_playing_retro_ablation",
  holdoutSeason,eligibleGoalieAppearances:n,
  distinctGames:new Set(forecasts.map(x=>x.gameId)).size,
  distinctDates:new Set(forecasts.map(x=>x.gameDate)).size,
  championMae:avgError("champion"),shotQualityMae:avgError("shadow"),
  differenceChampionMinusShadow:n?round(avgError("champion")-avgError("shadow")):null,
  pairedGameInterval:pairedGameInterval(forecasts,"moneypuck-goalie"),
  conditionalOnActualGoalieAppearance:true,actualPregameStartKnown:false,
  selectionBiasGoaliesWhoPlayed:true,calibrated:false,offerLinesUsed:false,
  retrospectiveNotPublishedPregame:true,modelPromoted:false,
  warning:"Game-level goalie saves and TOI are only observed when a goalie actually appeared. Selection and pulled-goalie effects remain. No verified starting prediction, platform quote, prospective hit rate, payout or ROI."};
}
module.exports={parseGoalieGameCsv,candidateSaves,evaluateGoalieHistory};
