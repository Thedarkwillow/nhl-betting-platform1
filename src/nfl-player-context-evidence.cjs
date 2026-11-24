"use strict";
// Normalized official-results-derived NFL weekly source. Never infer an
// appearance from a zero stat. A past week with an observed offensive
// opportunity qualifies; zero-opportunity and kicking cases need a
// separate reconciled participation adapter.
const {SPEC}=require("./nfl-dedicated-core-market-lab.cjs");
const day=x=>typeof x==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x));
const num=x=>typeof x==="number"&&Number.isFinite(x);
const key=(...a)=>JSON.stringify(a);
function unique(rows,fn){const m=new Map();for(const x of rows||[]){const k=fn(x),a=m.get(k)||[];a.push(x);m.set(k,a);}return [...m.values()].filter(a=>a.length===1).map(a=>a[0]);}
function adapt(weekly,schedule,beforeDate){
 if(!day(beforeDate))return [];
 const games=new Map();
 for(const g of unique(schedule,g=>g.game_id)){
  if(!g.game_id||g.game_type!=="REG"||!day(g.gameday)||g.gameday>=beforeDate||!num(g.home_score)||!num(g.away_score)||!g.home_team||!g.away_team||g.home_team===g.away_team)continue;
  for(const [team,opp,venue] of [[g.home_team,g.away_team,"home"],[g.away_team,g.home_team,"away"]]){
   const k=key(Number(g.season),Number(g.week),team);games.set(k,games.has(k)?null:{g,opp,venue});
  }
 }
 const rows=[];
 for(const x of unique(weekly,x=>key(Number(x.season),Number(x.week),x.player_id))){
  if(!x.player_id||x.season_type&&x.season_type!=="REG"||![x.attempts,x.carries,x.targets].some(v=>num(v)&&v>0))continue;
  const team=x.recent_team||x.team,m=games.get(key(Number(x.season),Number(x.week),team));if(!m)continue;
  if(x.opponent_team&&x.opponent_team!==m.opp)continue;
  for(const [market,s] of Object.entries(SPEC)){
   if(!num(x[s.target])||!Number.isInteger(x[s.exposure])||x[s.exposure]<0||s.role&&x.position!==s.role)continue;
   if(["conversion","rare_conversion","percentage"].includes(s.kind)&&(x[s.target]<0||x[s.target]>x[s.exposure]))continue;
   if(s.kind!=="rate"&&!Number.isInteger(x[s.target]))continue;
   const value=s.kind==="percentage"?(x[s.exposure]>0?100*x[s.target]/x[s.exposure]:null):x[s.target];
   if(!num(value))continue;
   rows.push({sport:"NFL",gameId:m.g.game_id,playerId:x.player_id,gameDate:m.g.gameday,season:Number(x.season),week:Number(x.week),opportunity:x[s.roleExposure||s.exposure],rateExposure:x[s.exposure],rawStat:x[s.target],team,opponent:m.opp,venue:m.venue,position:x.position||null,market,period:"full_game",value,officialFinal:true,participated:true,completeGame:false});
  }
 }
 return rows;
}
function report(weekly,schedule,cutoff){const rows=adapt(weekly,schedule,cutoff);return {kind:"nfl_player_context_coverage_v1",cutoff,markets:Object.fromEntries(Object.keys(SPEC).map(m=>{const a=rows.filter(x=>x.market===m);return [m,{appearances:a.length,players:new Set(a.map(x=>x.playerId)).size,games:new Set(a.map(x=>x.gameId)).size}]})),scope:"historical regular season offensive opportunity appearances; no roster completeness or kicking coverage",historicalAsOfVerified:false,forecastValidated:false};}
module.exports={adapt,report};
