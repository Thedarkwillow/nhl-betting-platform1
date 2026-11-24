"use strict";
const MARKETS=["shotsOnGoal","goals","assists","points","blockedShots"];
const canonical=x=>String(x||"").toUpperCase().replace(/[^A-Z]/g,"").replace(/^SJ$/,"SJS").replace(/^LA$/,"LAK").replace(/^TB$/,"TBL").replace(/^NJ$/,"NJD");
function buildOpponentContext(history,{beforeDate=null}={}){
 const games=new Map();
 for(const player of Object.values(history?.players||{}))for(const g of player.games||[]){
  if(g.type!=="skater"||!g.gameId||!g.team||beforeDate&&g.gameDate>=beforeDate)continue;
  const id=g.gameId,team=canonical(g.team);
  if(!games.has(id))games.set(id,new Map());
  const teams=games.get(id);
  if(!teams.has(team))teams.set(team,{date:g.gameDate,count:0,totals:Object.fromEntries(MARKETS.map(m=>[m,0]))});
  const record=teams.get(team);record.count++;
  for(const market of MARKETS)record.totals[market]+=Number.isFinite(g[market])?g[market]:0;
 }
 const defenses=new Map(),league=Object.fromEntries(MARKETS.map(m=>[m,[]]));
 for(const teams of games.values()){
  if(teams.size!==2)continue;
  const [[a,ag],[b,bg]]=[...teams.entries()];
  // Prevent projections using incomplete or partially collected boxscores.
  if(ag.count<10||bg.count<10)continue;
  for(const [defense,attack] of [[a,bg],[b,ag]]){
   if(!defenses.has(defense))defenses.set(defense,Object.fromEntries(MARKETS.map(m=>[m,[]])));
   for(const m of MARKETS){defenses.get(defense)[m].push(attack.totals[m]);league[m].push(attack.totals[m]);}
  }
 }
 const avg=a=>a.reduce((s,x)=>s+x,0)/(a.length||1);
 const leagueMean=Object.fromEntries(MARKETS.map(m=>[m,avg(league[m])]));
 const factors={};
 for(const [team,values] of defenses){
  factors[team]={};
  for(const m of MARKETS){
   const n=values[m].length,ref=leagueMean[m];
   const raw=n>=3&&ref>0?avg(values[m])/ref:1;
   // Strong shrinkage and a 10% ceiling mitigate tiny NHL samples.
   const smoothed=1+(raw-1)*(n/(n+12));
   factors[team][m]={multiplier:Math.max(.9,Math.min(1.1,smoothed)),games:n,observedRatio:n>=3&&ref>0?raw:null,ready:n>=3};
  }
 }
 return {schemaVersion:1,method:"Opponent team totals allowed, 12-game empirical shrinkage; capped 10% correction",factors,leagueMean,teams:Object.keys(factors).length,injuryDataAvailable:false,goalieStartDataAvailable:false,iceTimeDataAvailable:false};
}
function adjustProjection(base,market,opponent,context){
 if(!Number.isFinite(base)||base<0)return {estimate:null,applied:false};
 const value=context?.factors?.[canonical(opponent)]?.[market];
 const factor=value?.ready?value.multiplier:1;
 return {estimate:Number((base*factor).toFixed(4)),applied:factor!==1,multiplier:factor,defenseGames:value?.games||0,verifiedOutcomeCalibration:false};
}
module.exports={buildOpponentContext,adjustProjection,canonical};
