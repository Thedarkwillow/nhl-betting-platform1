"use strict";
/** Historical MoneyPuck count study only; never feed to production lineups. */
const {parseCsv}=require("./nhl-approved-source-adapters.cjs");
const {pairedGameInterval}=require("./nhl-season-model-lab.cjs");
const round=x=>Number(x.toFixed(6));
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
const supported=new Set(["shotsOnGoal","goals"]);
function seasonOf(gameId){
 const x=String(gameId);
 if(!/^20\d{2}02\d{4}$/.test(x))return null;
 const season=Number(x.slice(0,4));
 return season>=2024&&season<=2026?season+"-"+String(season+1).slice(-2):null;
}
function normalizeDay(s){
 const x=String(s||"").trim();
 const date=/^\d{8}$/.test(x)?x.slice(0,4)+"-"+x.slice(4,6)+"-"+x.slice(6):x;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+"T00:00:00Z"))||
  new Date(date+"T00:00:00Z").toISOString().slice(0,10)!==date)return null;
 return date;
}
function validDateForSeason(day,gameId){
 const yr=Number(String(gameId).slice(0,4));
 return day.startsWith(String(yr))||day.startsWith(String(yr+1));
}
function parseSkaterGameCsv(text){
 const {headers,rows}=parseCsv(text);
 const required=["playerId","gameId","gameDate","situation","icetime","I_F_xOnGoal",
  "I_F_xGoals","I_F_shotsOnGoal","I_F_goals"];
 const idx=Object.fromEntries(required.map(k=>[k,headers.indexOf(k)]));
 if(required.some(k=>idx[k]<0))throw Error("MoneyPuck game-level skater CSV missing required columns: "+required.filter(k=>idx[k]<0).join(","));
 const values=[],seen=new Set();let skippedNonAll=0;
 for(const line of rows){
  const g=k=>line[idx[k]];
  if(g("situation")!=="all"){skippedNonAll++;continue;}
  const playerId=Number(g("playerId")),gameId=Number(g("gameId")),
   gameDate=normalizeDay(g("gameDate")),season=seasonOf(g("gameId"));
  const iceTimeSeconds=Number(g("icetime")),shots=Number(g("I_F_shotsOnGoal")),
   goals=Number(g("I_F_goals")),xOnGoal=Number(g("I_F_xOnGoal")),xGoals=Number(g("I_F_xGoals"));
  if(!Number.isInteger(playerId)||playerId<=0||!Number.isInteger(gameId)||!season||!gameDate||
   !validDateForSeason(gameDate,gameId)||
   ![iceTimeSeconds,shots,goals,xOnGoal,xGoals].every(Number.isFinite)||
   iceTimeSeconds<=0||shots<0||goals<0||xOnGoal<0||xGoals<0||
   ![shots,goals].every(Number.isInteger))throw Error("Invalid MoneyPuck game-level skater identity or stat");
  const key=playerId+"|"+gameId;
  if(seen.has(key))throw Error("Duplicate MoneyPuck all-situation player/game "+key);
  seen.add(key);
  values.push({playerId,gameId,gameDate,season,type:"skater",iceTimeSeconds,
   shotsOnGoal:shots,goals,xOnGoal,xGoals});
 }
 return {source:"MoneyPuck published game-by-game CSV",kind:"historic_skater_games",
  rows:values,excludedNonAll:skippedNonAll,
  rawRowsNotPubliclySyndicated:true,historicallyReconstructedNotPublishedPregame:true};
}
function estimateFromPast(prior,market){
 if(!supported.has(market)||prior.length<5)return null;
 const field=market==="shotsOnGoal"?"xOnGoal":"xGoals";
 const values=prior.map(r=>r[market]);
 const champion=.5*mean(values.slice(-5))+.3*mean(values.slice(-10))+.2*mean(values);
 const sample=prior.slice(-20),ten=prior.slice(-10),five=prior.slice(-5);
 const minutesSeconds=.65*mean(ten.map(x=>x.iceTimeSeconds))+.35*mean(five.map(x=>x.iceTimeSeconds));
 const sumIce=sample.reduce((s,r)=>s+r.iceTimeSeconds,0),
  sumQuality=sample.reduce((s,r)=>s+r[field],0);
 if(!sumIce||!Number.isFinite(sumQuality))return null;
 const qualityPer60=sumQuality*3600/sumIce;
 const sourceMean=qualityPer60*minutesSeconds/3600;
 const shadow=.75*champion+.25*sourceMean;
 return {champion,shadow,sourceMean,qualityPer60,
  estimatedMinutes:minutesSeconds/60,priorGames:prior.length};
}
function comparePastOnly(rows,{holdoutSeason="2025-26",minGames=5}={}){
 if(!Array.isArray(rows)||!Number.isInteger(minGames)||minGames<5||
  !["2024-25","2025-26","2026-27"].includes(holdoutSeason))throw Error("Invalid MoneyPuck historical study inputs");
 const byPlayer=new Map(),identities=new Set();
 for(const r of rows){
  if(!Number.isInteger(r.playerId)||r.playerId<=0||!Number.isInteger(r.gameId)||
   r.season!==seasonOf(r.gameId)||r.gameDate!==normalizeDay(r.gameDate)||
   !validDateForSeason(r.gameDate,r.gameId)||
   ![r.iceTimeSeconds,r.shotsOnGoal,r.goals,r.xOnGoal,r.xGoals].every(v=>Number.isFinite(v)&&v>=0)||
   r.iceTimeSeconds<=0)throw Error("Historical game row failed validation");
  const key=r.playerId+"|"+r.gameId;
  if(identities.has(key))throw Error("Repeated player/game identity");
  identities.add(key);
  if(!byPlayer.has(r.playerId))byPlayer.set(r.playerId,[]);
  byPlayer.get(r.playerId).push(r);
 }
 const forecasts=[];
 for(const [playerId,games] of byPlayer){
  games.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
  let prior=[];
  for(let i=0;i<games.length;){
   const day=games[i].gameDate,batch=[];
   while(i<games.length&&games[i].gameDate===day)batch.push(games[i++]);
   for(const game of batch){
    if(game.season!==holdoutSeason||prior.length<minGames)continue;
    for(const market of supported){
     const estimate=estimateFromPast(prior,market);
     if(!estimate)continue;
     forecasts.push({playerId,gameId:game.gameId,gameDate:day,season:game.season,
      market,actual:game[market],sourceActualFromMoneyPuck:true,
      lastFeatureDay:prior.at(-1).gameDate,
      champion:estimate.champion,shadow:estimate.shadow,
      sourceMean:estimate.sourceMean,priorGames:prior.length,
      candidates:{"weighted-form-v1":estimate.champion,"moneypuck":estimate.shadow}});
    }
   }
   // No target-game or other same-day outcome enters either projection.
   prior=prior.concat(batch);
  }
 }
 const byMarket={};
 for(const market of supported){
  const x=forecasts.filter(f=>f.market===market),n=x.length;
  const champ=n?mean(x.map(y=>Math.abs(y.champion-y.actual))):null,
   shadow=n?mean(x.map(y=>Math.abs(y.shadow-y.actual))):null;
  byMarket[market]={observations:n,distinctGames:new Set(x.map(r=>r.gameId)).size,
   distinctDates:new Set(x.map(r=>r.gameDate)).size,
   championMAE:champ===null?null:round(champ),
   shotQualityShadowMAE:shadow===null?null:round(shadow),
   maeDifference:champ===null?null:round(champ-shadow),
   pairedGameBootstrap95:pairedGameInterval(x,"moneypuck"),
   prospectiveHitRate:null,canPromote:false};
 }
 return {schemaVersion:1,kind:"moneypuck_historical_skater_shot_quality_walkforward",
  holdoutSeason,source:"MoneyPuck player game-level observations (historical reconstructed features)",
  evaluatedForecasts:forecasts.length,distinctPlayers:new Set(forecasts.map(f=>f.playerId)).size,
  byMarket,scoredRows:forecasts,
  chronologicallyPriorGamesOnly:true,sameDayResultsExcludedFromFeatures:true,
  lineOffersUsed:false,modelHitRate:null,calibrated:false,prospectivelyVerified:false,
  modelDeployed:false,goalieModelDeployed:false,
  warning:"Historical reconstruction, not an originally time-stamped pregame prediction or PrizePicks/Underdog quote. MoneyPuck files can contain later corrections. MAE only, not Higher/Lower hit rate, EV or ROI. Cannot promote from this test."};
}
module.exports={parseSkaterGameCsv,estimateFromPast,comparePastOnly,normalizeDay,seasonOf};