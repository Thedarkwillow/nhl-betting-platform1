"use strict";
// Prior-week only, actual matched regular season schedule identities. Fixed
// candidate weights; synthetic thresholds; no wagering or promotion claim.
const {probabilities}=require("./nfl-empirical-threshold-shadow.cjs");
const SPEC={passing_yards:[["passing_yards"],[199.5,249.5,299.5],"attempts"],rushing_yards:[["rushing_yards"],[39.5,59.5,79.5],"carries"],receiving_yards:[["receiving_yards"],[29.5,49.5,69.5],"targets"],receptions:[["receptions"],[2.5,4.5,6.5],"targets"]};
const num=x=>typeof x==="number"&&Number.isFinite(x);
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const cap=(v,a,b)=>Math.max(a,Math.min(b,v));
const key=(s,w,t)=>[Number(s),Number(w),t].join("|");
function unique(rows,fn){const m=new Map(),dups=new Set();for(const x of rows){const k=fn(x);if(m.has(k))dups.add(k);else m.set(k,x);}for(const k of dups)m.delete(k);return [...m.values()];}
const regular=x=>Number.isInteger(Number(x.season))&&Number(x.week)>=1&&Number(x.week)<=18&&(!x.season_type||x.season_type==="REG"||x.season_type==="REGULAR_SEASON");
function candidate(p,prior,teams){
 const spec=SPEC[p.market];if(!spec)return null;
 const [fields,,usage]=spec,field=fields[0];
 const a=prior.filter(x=>num(x[field])&&Number.isInteger(x[field])&&num(x[usage])&&x[usage]>0).slice(-10);
 const own=teams.filter(x=>x.team===p.team&&num(x[field])).slice(-5);
 const opp=teams.filter(x=>x.opponent_team===p.opponent&&num(x[field])).slice(-5),league=teams.filter(x=>num(x[field]));
 if(a.length<8||own.length<3||opp.length<3||league.length<24)return null;
 const base=mean(a.map(x=>x[field])),lg=mean(league.map(x=>x[field]));if(lg<=0)return null;
 const offense=cap(mean(own.map(x=>x[field]))/lg,.75,1.25),defense=cap(mean(opp.map(x=>x[field]))/lg,.75,1.25);
 const rate=a.reduce((s,x)=>s+x[field],0)/a.reduce((s,x)=>s+x[usage],0),opportunity=.7*mean(a.slice(-3).map(x=>x[usage]))+.3*mean(a.map(x=>x[usage]));
 const usageMean=rate*opportunity;
 const context=usageMean*(1+.3*(offense-1)+.5*(defense-1));
 return {base,usageMean,context,values:a.map(x=>x[field]),offense,defense};
}
function study(weekly,schedule,teamWeekly){
 const games=new Map();
 for(const g of unique(schedule||[],x=>x.game_id)){
  if(g.game_type!=="REG"||!num(g.home_score)||!num(g.away_score))continue;
  for(const [t,o] of [[g.home_team,g.away_team],[g.away_team,g.home_team]]){const k=key(g.season,g.week,t);if(games.has(k)){games.set(k,null);continue;}games.set(k,{id:g.game_id,opponent:o});}
 }
 const weeks=new Map();
 for(const x of unique((weekly||[]).filter(x=>regular(x)&&x.player_id&&(x.recent_team||x.team)),x=>key(x.season,x.week,x.player_id))){
  const team=x.recent_team||x.team,g=games.get(key(x.season,x.week,team));if(!g)continue;
  const k=key(x.season,x.week,"");(weeks.get(k)||weeks.set(k,[]).get(k)).push({...x,team,game:g});
 }
 const teamRows=unique((teamWeekly||[]).filter(x=>regular(x)&&x.team&&games.get(key(x.season,x.week,x.team))?.opponent===x.opponent_team),x=>key(x.season,x.week,x.team)).sort((a,b)=>Number(a.season)-Number(b.season)||Number(a.week)-Number(b.week));
 const players=new Map(),out={};
 for(const [k,rows] of [...weeks.entries()].sort((a,b)=>{const x=a[0].split("|").map(Number),y=b[0].split("|").map(Number);return x[0]-y[0]||x[1]-y[1]})){
  const [season,week]=k.split("|").map(Number);
  const pastTeams=teamRows.filter(x=>Number(x.season)===season&&Number(x.week)<week);
  for(const x of rows)for(const [m,[fields,lines,usage]] of Object.entries(SPEC)){
   const actual=x[fields[0]];if(!num(actual)||!Number.isInteger(actual)||!num(x[usage])||x[usage]<=0)continue;
   const prior=(players.get(x.player_id)||[]).filter(y=>y.team===x.team);
   const p=candidate({market:m,team:x.team,opponent:x.game.opponent},prior,pastTeams);
   if(!p||season<2025)continue;
   const id=season+"|"+m,a=out[id]??={n:0,games:new Set(),thresholds:0,models:Object.fromEntries(["base","usageMean","context"].map(n=>[n,{mae:0,brier:0,logLoss:0}]))};
   a.n++;a.games.add(x.game.id);a.thresholds+=lines.length;
   for(const [name,v] of Object.entries(a.models)){v.mae+=Math.abs(p[name]-actual);for(const l of lines){const q=probabilities(p.values,l,p[name],{nonnegative:m==="receptions"});const y=actual>l?"higher":"lower";v.brier+=(q.higher-Number(y==="higher"))**2;v.logLoss-=Math.log(Math.max(1e-8,q[y]));}}
  }
  for(const x of rows){const a=players.get(x.player_id)||[];a.push(x);players.set(x.player_id,a);}
 }
 return {kind:"nfl_fixed_offense_defense_usage_synthetic_ablation_v1",bySeasonMarket:Object.fromEntries(Object.entries(out).map(([k,a])=>[k,{appearances:a.n,distinctGames:a.games.size,thresholds:a.thresholds,models:Object.fromEntries(Object.entries(a.models).map(([m,v])=>[m,{mae:v.mae/a.n,brier:v.brier/a.thresholds,logLoss:v.logLoss/a.thresholds}]))}])),actualOfferLines:false,historicalAsOfVerified:false,conditionalOnAppearance:true,modelPromoted:false,calibrated:false};
}
module.exports={candidate,study};
