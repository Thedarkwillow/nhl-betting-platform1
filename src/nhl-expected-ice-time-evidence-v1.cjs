"use strict";
/** Predeclared skater ice-time estimate ablation. No postgame features enter
 * a target-game forecast. Original quality thresholds and original NHL
 * directions are not modified by this experiment.
 */
const {uniqueRows}=require("./nhl-fixed-ensemble-research.cjs");
const KIND="nhl_pregame_expected_ice_time_history_shadow_20261120_v1";
const valid=x=>x?.type==="skater"&&["OFF","FINAL"].includes(x.gameState)&&
 Number.isInteger(x.playerId)&&Number.isInteger(x.gameId)&&
 typeof x.gameDate==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x.gameDate)&&
 Number.isFinite(x.timeOnIceSeconds)&&x.timeOnIceSeconds>=180&&
 x.timeOnIceSeconds<=3900;
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const median=a=>{const b=[...a].sort((x,y)=>x-y),n=b.length;
 return n%2?b[(n-1)/2]:(b[n/2-1]+b[n/2])/2;};
function estimate(prior,cutoff){
 const seen=new Set(),a=[];
 for(const g of [...(prior||[])].sort((x,y)=>x.gameDate.localeCompare(y.gameDate)||x.gameId-y.gameId)){
  if(!valid(g)||g.gameDate>=cutoff||seen.has(g.gameId))continue;
  seen.add(g.gameId);a.push(g);
 }
 if(a.length<10)return null;
 const tail=a.slice(-20),ten=tail.slice(-10),five=tail.slice(-5),three=tail.slice(-3),
  z=tail.map(g=>g.timeOnIceSeconds);
 const original=.65*avg(ten.map(g=>g.timeOnIceSeconds))+
  .35*avg(five.map(g=>g.timeOnIceSeconds));
 const mean10=avg(ten.map(g=>g.timeOnIceSeconds));
 const raw=.35*mean10+.4*median(five.map(g=>g.timeOnIceSeconds))+
  .25*avg(three.map(g=>g.timeOnIceSeconds));
 const alternate=Math.min(1.30*mean10,Math.max(.7*mean10,raw));
 const recentGames=tail.slice(-5),last=tail.at(-1);
 const volatility=Math.sqrt(avg(ten.map(g=>
  (g.timeOnIceSeconds-mean10)**2)))/mean10;
 const restDays=(Date.parse(cutoff+"T00:00:00Z")-
  Date.parse(last.gameDate+"T00:00:00Z"))/86400000;
 return {kind:KIND,cutoff,priorGames:a.length,priorRecentGames:tail.length,
  latestPriorDate:last.gameDate,originalExpectedIceSeconds:original,
  alternateExpectedIceSeconds:alternate,medianRecentIceSeconds:median(z.slice(-5)),
  recentRoleInstability:volatility>.24||
   Math.abs(avg(three.map(g=>g.timeOnIceSeconds))-mean10)/mean10>.20,
  restDays,uniqueOriginalGameRows:true,pregameOnly:true,
  alternateIsResearchOnly:true,calibrated:false};
}
function walkForward(history,cutoff,{from="2026-09-01"}={}){
 const rows=uniqueRows(history).filter(valid).filter(r=>r.gameDate<cutoff);
 const days=new Map(),players=new Map(),bySeason={};
 for(const g of rows){const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);}
 let decided=0,sumOld=0,sumAlt=0,better=0;
 const games=new Set(),dates=new Set();
 for(const [d,dayRows] of [...days].sort(([a],[b])=>a.localeCompare(b))){
  for(const g of dayRows){
   if(d<from)continue;
   const f=estimate(players.get(g.playerId)||[],d);
   if(!f||f.restDays>14)continue;
   const old=Math.abs(f.originalExpectedIceSeconds-g.timeOnIceSeconds),
    alt=Math.abs(f.alternateExpectedIceSeconds-g.timeOnIceSeconds),
    season=d.slice(0,4)+"/"+String(Number(d.slice(0,4))+1).slice(-2);
   const b=bySeason[season]??={appearances:0,baselineAbsError:0,alternateAbsError:0};
   b.appearances++;b.baselineAbsError+=old;b.alternateAbsError+=alt;
   decided++;sumOld+=old;sumAlt+=alt;better+=Number(alt<old);
   games.add(g.gameId);dates.add(d);
  }
  for(const g of dayRows){
   const a=players.get(g.playerId)||[];a.push(g);players.set(g.playerId,a.slice(-30));
  }
 }
 return {kind:KIND,cutoff,from,decided,distinctGames:games.size,distinctDates:dates.size,
  originalBaselineMAESeconds:decided?sumOld/decided:null,
  alternateMAESeconds:decided?sumAlt/decided:null,
  alternateBetterFraction:decided?better/decided:null,
  bySeason:Object.fromEntries(Object.entries(bySeason).map(([k,v])=>
   [k,{appearances:v.appearances,originalMAE:v.baselineAbsError/v.appearances,
   alternateMAE:v.alternateAbsError/v.appearances}])),
  historicalAsOfSourceIndependentlyVerified:false,
  alternateDeployed:false,modelPromoted:false,bettingEligible:false};
}
function freeze(snapshot,history){
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date(snapshot.generatedAt)).map(x=>[x.type,x.value]));
 const cutoff=[parts.year,parts.month,parts.day].join("-");
 const rows=[],seen=new Set();
 for(const p of snapshot.individualPropSelections||[]){
  if(p.tier!=="Standard"||!Number.isInteger(p.playerId)||!Number.isInteger(p.gameId))continue;
  const k=[p.gameId,p.playerId,p.market,p.line,p.tier].join("|");
  if(seen.has(k))continue;seen.add(k);
  const f=estimate(history?.players?.[String(p.playerId)]?.games||[],cutoff);
  rows.push({gameId:p.gameId,playerId:p.playerId,market:p.market,tier:p.tier,
   line:p.line,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,
   originalSide:p.lean,evidence:f,modelSideUnchanged:true,
   alternativeDeployed:false});
 }
 return {kind:KIND,generatedAt:snapshot.generatedAt,cutoff,rows,
  originalSideAndLineUnchanged:true,modelPromoted:false,
  alternateDeployed:false,bettingEligible:false};
}
module.exports={KIND,estimate,walkForward,freeze};
