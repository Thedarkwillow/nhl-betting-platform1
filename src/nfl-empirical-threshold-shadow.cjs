"use strict";
// Raw past-game empirical distributions (research only). No fit to final odds.
// NFL yards may be negative; count and kicking markets must be integer >= 0.
const {SPECS,marketValue}=require("../scripts/backtest-nfl-historical-stats.cjs");
const specs=new Map(SPECS.map(x=>[x.id,x]));
const num=x=>typeof x==="number"&&Number.isFinite(x);
function probabilities(values,line,mean,{nonnegative=false}={}){
 if(!Array.isArray(values)||values.length<8||!values.every(Number.isInteger)||!num(line)||!num(mean))return null;
 const historic=values.reduce((a,x)=>a+x,0)/values.length;
 const counts={higher:0,lower:0,push:0};
 // Equal blend of historical empirical mass and integer residuals recentered
 // on the existing pregame forecast. No independence assumption for combos.
 for(const x of values)for(const v of [x,(nonnegative?Math.max(0,Math.round(x-historic+mean)):Math.round(x-historic+mean))])counts[v>line?"higher":v<line?"lower":"push"]++;
 const denom=2*values.length;
 return Object.fromEntries(Object.entries(counts).map(([k,v])=>[k,v/denom]));
}
function candidate(p,history,createdAt){
 const spec=specs.get(p.market),season=Number(p.season),week=Number(p.week);
 if(!Array.isArray(history)||!spec||spec.family==="kicking"||!Number.isInteger(season)||!Number.isInteger(week)||
 !p.historicalPlayerId||!num(p.historicalProjection)||!num(p.line)||
 !Number.isFinite(Date.parse(createdAt))||!Number.isFinite(Date.parse(p.eventStartsAt))||
 Date.parse(createdAt)>=Date.parse(p.eventStartsAt)-900000)return null;
 const rows=history.filter(r=>r.player_id===p.historicalPlayerId&&
  (r.recent_team||r.team)===p.team&&Number(r.season)<=season&&
  (Number(r.season)<season||Number(r.week)<week)&&
  Number.isInteger(Number(r.week))&&Number(r.week)>=1&&Number(r.week)<=18&&
  (r.season_type==null||["REG","REGULAR_SEASON"].includes(r.season_type)));
 const seen=new Set(),values=[];
 for(const r of rows.sort((a,b)=>Number(a.season)-Number(b.season)||Number(a.week)-Number(b.week))){
  const k=r.season+"|"+r.week;if(seen.has(k))return null;seen.add(k);
  const v=marketValue(spec,r);
  if(Number.isInteger(v))values.push(v);
 }
 const tail=values.slice(-20),prob=probabilities(tail,p.line,p.historicalProjection,{nonnegative:!p.market.includes("yards")});
 if(!prob)return null;
 return {kind:"nfl_empirical_threshold_shadow_v1",probabilities:prob,priorGames:tail.length,
  originalLine:p.line,originalSide:p.selectedSide,originalMean:p.historicalProjection,
  sourceGameId:p.sourceGameId,historicalPlayerId:p.historicalPlayerId,
  createdAt,calibrated:false,conditionalOnPlaying:true,researchOnly:true,modelPromoted:false};
}
module.exports={probabilities,candidate};
