"use strict";
// Fixed, chronological statistical diagnostics. Synthetic thresholds only.
const MARKETS={shotsOnGoal:[1.5,2.5,3.5],points:[.5,1.5],assists:[.5,1.5],blockedShots:[.5,1.5,2.5],saves:[22.5,27.5,32.5]};
const team=x=>({SJ:"SJS",LA:"LAK",TB:"TBL",NJ:"NJD",VEG:"VGK",UTAH:"UTA"}[String(x||"").toUpperCase()]||String(x||"").toUpperCase());
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const sum=a=>a.reduce((s,v)=>s+v,0);
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
const count=x=>Number.isInteger(x)&&x>=0;
const date=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x));
const valid=g=>date(g.gameDate)&&Number.isInteger(g.gameId)&&Number.isInteger(g.playerId)&&["OFF","FINAL"].includes(g.gameState)&&["skater","goalie"].includes(g.type)&&Number.isFinite(g.timeOnIceSeconds)&&g.timeOnIceSeconds>0&&g.timeOnIceSeconds<=3900;
function uniqueRows(history){
 const map=new Map();
 for(const p of Object.values(history?.players||{}))for(const g of p.games||[]){
  if(!valid(g))continue;const k=g.gameId+"|"+g.playerId,a=map.get(k)||[];a.push(g);map.set(k,a);
 }
 return [...map.values()].filter(a=>a.length===1).map(a=>a[0]).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
}
function predict(prior,opponentShots,leagueShots,market,day){
 const a=prior.filter(g=>g.gameDate<day&&count(g[market])&&(market==="saves"?g.type==="goalie":g.type==="skater")).slice(-20);
 if(a.length<8)return null;
 const values=a.map(g=>g[market]),recent=a.slice(-5),ten=a.slice(-10);
 const baseline=mean(values.slice(-10)),form=.5*mean(recent.map(g=>g[market]))+.3*baseline+.2*mean(values);
 const toi=.65*mean(ten.map(g=>g.timeOnIceSeconds))+.35*mean(recent.map(g=>g.timeOnIceSeconds));
 const perMinute=sum(values)/sum(a.map(g=>g.timeOnIceSeconds)),restDays=(Date.parse(day)-Date.parse(a.at(-1).gameDate))/86400000;
 const contextSupported=(market==="saves"||market==="shotsOnGoal")&&opponentShots.length>=5&&leagueShots.length>=20&&mean(leagueShots)>0;
 const pace=contextSupported?clamp(1+(mean(opponentShots.slice(-10))/mean(leagueShots)-1)*.4,.8,1.2):1;
 // For goalie saves, adjust historical shots faced and save fraction separately.
 const restRows=a.slice(1).map((g,i)=>({rate:g[market]/g.timeOnIceSeconds,days:(Date.parse(g.gameDate)-Date.parse(a[i].gameDate))/86400000}));
 const sameRest=restRows.filter(r=>restDays<=1?r.days<=1:r.days>1);
 const restFactor=sameRest.length>=4&&perMinute>0?clamp(1+.25*(mean(sameRest.map(r=>r.rate))/perMinute-1),.9,1.1):1;
 let rate=perMinute*toi*pace*restFactor,goalieShotModel=false;
 if(market==="saves"){
  const g=a.filter(x=>count(x.shotsAgainst)&&x.shotsAgainst>=x.saves);
  if(g.length>=8&&sum(g.map(x=>x.shotsAgainst))>0){
    const shots60=sum(g.map(x=>x.shotsAgainst))*3600/sum(g.map(x=>x.timeOnIceSeconds));
    const sv=(sum(g.map(x=>x.saves))+9)/(sum(g.map(x=>x.shotsAgainst))+10);
    rate=shots60*toi/3600*sv*pace*restFactor;goalieShotModel=true;
  }
 }
 const ensemble=.5*form+.5*rate;
 const mass=(mu,line)=>{const v=values.map(x=>Math.max(0,Math.round(x-mean(values)+mu)));return (1+v.filter(x=>x>line).length)/(v.length+2);};
 return {baseline,form,rate,ensemble,restDays,restFactor,toi,pace,contextSupported,goalieShotModel,mass,historyCount:a.length};
}
function scheduleIndex(schedule){
 const map=new Map(),duplicate=new Set();
 if(schedule?.source!=="Official NHL Web API"||schedule.complete!==true||!Array.isArray(schedule.games))return map;
 for(const g of schedule.games){
  if(!Number.isInteger(g.id)||!date(g.gameDate)||!team(g.home)||!team(g.away)||team(g.home)===team(g.away))continue;
  if(map.has(g.id)){duplicate.add(g.id);continue;}map.set(g.id,g);
 }
 for(const id of duplicate)map.delete(id);
 return map;
}
function scheduledOpponent(row,index){
 const g=index.get(row.gameId),t=team(row.team);
 if(!g||g.gameDate!==row.gameDate)return null;
 return t===team(g.home)?team(g.away):t===team(g.away)?team(g.home):null;
}
function study(history,{from="2026-07-01",schedule=null}={}){
 const matchups=scheduleIndex(schedule);
 const rows=uniqueRows(history),days=new Map(),players=new Map(),teamShots=new Map(),teamAllowed=new Map(),leagueShots=[],out={};
 for(const g of rows){const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);}
 for(const [day,dayRows] of days){
  if(day>=from)for(const g of dayRows)for(const [market,lines] of Object.entries(MARKETS)){
   if(!count(g[market])||(market==="saves"?g.type!=="goalie":g.type!=="skater"))continue;
   // The official historical boxscore has team and side but no opponent.
   // The schedule supplies matchup identity; no target-day stat enters the forecast.
   const opponent=scheduledOpponent(g,matchups);
   const shots=market==="saves"?teamShots.get(opponent):teamAllowed.get(opponent);
   const p=predict(players.get(g.playerId)||[],shots||[],leagueShots,market,day);
   if(!p)continue;
   const s=out[market]??={games:new Set(),dates:new Set(),n:0,thresholds:0,goalieShotRows:0,contextRows:0,nonNeutralRows:0,scheduleMatches:0,models:Object.fromEntries(["baseline","form","rate","ensemble"].map(k=>[k,{mae:0,brier:0,logLoss:0}]))};
   s.n++;s.games.add(g.gameId);s.dates.add(day);s.goalieShotRows+=Number(p.goalieShotModel);s.contextRows+=Number(p.contextSupported);s.nonNeutralRows+=Number(p.contextSupported&&p.pace!==1);s.scheduleMatches+=Number(!!opponent);
   for(const k of Object.keys(s.models)){
    const a=s.models[k];a.mae+=Math.abs(p[k]-g[market]);
    for(const line of lines){const y=Number(g[market]>line),q=p.mass(p[k],line);a.brier+=(q-y)**2;a.logLoss-=y?Math.log(q):Math.log1p(-q);}
   }s.thresholds+=lines.length;
  }
  // Entire date is withheld before updating any histories.
  const games=new Map();
  for(const g of dayRows){const prior=players.get(g.playerId)||[];prior.push(g);players.set(g.playerId,prior);
   if(g.type==="skater"&&typeof g.team==="string"&&g.team){const a=games.get(g.gameId)||[];a.push(g);games.set(g.gameId,a);}}
  for(const game of games.values()){
   const teams=[...new Set(game.map(g=>team(g.team)))];if(teams.length!==2||teams.some(t=>game.filter(g=>team(g.team)===t).length!==18))continue;
   const totals=teams.map(t=>{const a=game.filter(g=>team(g.team)===t);return a.length===18&&a.every(g=>count(g.shotsOnGoal))?sum(a.map(g=>g.shotsOnGoal)):null;});
   if(totals.some(v=>v===null))continue;
   for(let i=0;i<2;i++){
    const t=teams[i],v=totals[i],allowed=totals[1-i];
    const own=teamShots.get(t)||[],against=teamAllowed.get(t)||[];
    own.push(v);against.push(allowed);teamShots.set(t,own);teamAllowed.set(t,against);leagueShots.push(v);
   }
  }
 }
 return {kind:"nhl_fixed_ensemble_walk_forward_synthetic_v1",byMarket:Object.fromEntries(Object.entries(out).map(([k,s])=>[k,{playerGames:s.n,distinctGames:s.games.size,distinctDates:s.dates.size,thresholdEvaluations:s.thresholds,goalieShotRows:s.goalieShotRows,opponentAdjustmentRows:s.contextRows,opponentAdjustedNonNeutralRows:s.nonNeutralRows,scheduleIdentityMatches:s.scheduleMatches,models:Object.fromEntries(Object.entries(s.models).map(([m,a])=>[m,{mae:a.mae/s.n,brier:a.brier/s.thresholds,logLoss:a.logLoss/s.thresholds}]))}])),conditionalOnAppearance:true,opponentIdentityFromArchivedOfficialSchedule:true,historicalScheduleAsOfAvailabilityVerified:false,actualOfferLines:false,calibrated:false,modelPromoted:false};
}
module.exports={uniqueRows,predict,study,scheduleIndex,scheduledOpponent};
