"use strict";
// Specialist models, each using its own observed target. No inferred provider
// rules and no synthetic combo advertised as a genuine platform offer.
const {uniqueRows,scheduleIndex,scheduledOpponent}=require("./nhl-fixed-ensemble-research.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const {smoothProbability}=require("./nhl-learned-matchup-v1.cjs");
const {empiricVector,theoreticalVector,convolution}=require("./nhl-combo-joint-shadow.cjs");
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length,valid=x=>Number.isFinite(x),count=x=>Number.isInteger(x)&&x>=0;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function bucket(out,k,y,p,q,line,game,date){
 const x=out[k]??={n:0,base:0,challenger:0,games:new Set(),dates:new Set()};x.n++;x.base+=(p-Number(y>line))**2;x.challenger+=(q-Number(y>line))**2;x.games.add(game);x.dates.add(date);
}
function summary(out){return Object.fromEntries(Object.entries(out).map(([k,a])=>[k,{thresholds:a.n,games:a.games.size,dates:a.dates.size,baselineBrier:a.base/a.n,challengerBrier:a.challenger/a.n}]));}
function periodStudy(periodHistory,schedule,fullRows=[]){
 const days=new Map(),idx=scheduleIndex(schedule),out={},players=new Map(),team=new Map(),league={};
 const identity=new Map(fullRows.map(g=>[g.gameId+'|'+g.playerId,g]));let totalPeriodRows=0,joinedRows=0;
 const fields=["shotsOnGoal","goals","assists","points","blockedShots","hits","faceoffsWon","saves","goalsAgainst"];
 for(const [id,periods] of Object.entries(periodHistory?.players||{}))for(const p of [1,2,3])for(const g of periods[String(p)]||[]){
  if(g.playedInPeriod!==true||g.period!==p||!Number.isInteger(g.gameId)||!g.gameDate)continue;
  totalPeriodRows++;const x=identity.get(g.gameId+'|'+id);if(!x||x.gameDate!==g.gameDate||!x.team||!['skater','goalie'].includes(x.type))continue;joinedRows++;const a=days.get(g.gameDate)||[];a.push({...g,playerId:Number(id),team:x.team,type:x.type});days.set(g.gameDate,a);
 }
 for(const [day,rows] of [...days].sort()){
  const grouped=new Map();
  for(const g of rows){
   const own=canonical(g.team),opp=canonical(scheduledOpponent(g,idx));if(!own||!opp)continue;
   for(const m of fields){
    if(!count(g[m]))continue;
    const k=g.playerId+"|"+g.period+"|"+m,prior=players.get(k)||[],ctx=team.get(opp+"|"+g.period+"|"+m)||[],lg=league[g.period+"|"+m]||[];
    if(prior.length>=8&&ctx.length>=5&&lg.length>=20&&mean(lg)>0){
     const base=mean(prior.slice(-20)),factor=clamp(1+(mean(ctx.slice(-10))/mean(lg)-1)*.25,.85,1.15);
     for(const l of m==="saves"?[3.5,6.5,9.5]:[.5,1.5,2.5])bucket(out,g.period+"|"+m,g[m],smoothProbability(prior,base,l),smoothProbability(prior,base*factor,l),l,g.gameId,day);
    }
   }
   const key=g.gameId+"|"+g.period,a=grouped.get(key)||[];a.push(g);grouped.set(key,a);
  }
  // Same period, same prior game, opponent-specific shot/scoring environment.
  for(const a of grouped.values()){
   const clubs=[...new Set(a.map(g=>canonical(g.team)))];if(clubs.length!==2||clubs.some(t=>a.filter(g=>canonical(g.team)===t&&g.type==="skater").length<10))continue;
   for(const t of clubs)for(const m of fields){
    const src=a.filter(g=>g.type==="skater"&&(m==="saves"||m==="blockedShots"||m==="goalsAgainst"?canonical(g.team)===t:canonical(g.team)!==t)),field=m==="saves"||m==="blockedShots"?"shotsOnGoal":m==="goalsAgainst"?"goals":m;
    if(!src.length||!src.every(g=>count(g[field])))continue;
    const v=src.reduce((s,g)=>s+g[field],0),k=t+"|"+a[0].period+"|"+m,l=a[0].period+"|"+m,x=team.get(k)||[];x.push(v);team.set(k,x.slice(-20));(league[l]??=[]).push(v);if(league[l].length>500)league[l].shift();
   }
  }
  for(const g of rows)for(const m of fields)if(count(g[m])){const k=g.playerId+"|"+g.period+"|"+m,a=players.get(k)||[];a.push(g[m]);players.set(k,a.slice(-30));}
 }
 return {byPeriodMarket:summary(out),actualPeriodObservations:true,requiresPeriodTeamAndRole:true,totalPeriodRows,joinedRows};
}
function fantasyStudy(rows,schedule){
 const idx=scheduleIndex(schedule),by={},past=new Map(),team=new Map(),league=[],days=new Map(),counts={prizePicks:0,underdog:0};
 const specs=[["prizePicksGoalieFantasyScore",.3],["underdogGoalieFantasyScore",.6]];
 for(const g of rows){if(g.type!=="goalie"||g.goalieStarted!==true||!specs.some(([m])=>valid(g[m]))||!count(g.saves)||!count(g.goalsAgainst))continue;const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);for(const [m] of specs)if(valid(g[m]))counts[m.startsWith("prize")?"prizePicks":"underdog"]++;}
 for(const [date,rs] of [...days].sort()){
  for(const g of rs)for(const [m,coefficient] of specs){if(!valid(g[m]))continue;const prior=(past.get(g.playerId)||[]).filter(x=>valid(x[m])),opp=canonical(scheduledOpponent(g,idx)),o=team.get(opp)||[];
   if(prior.length<8||o.length<5||league.length<20||!(mean(league)>0))continue;
   const vals=prior.map(x=>x[m]),base=mean(vals),f=clamp(1+(mean(o.slice(-10))/mean(league)-1)*.25,.85,1.15);
   const mu=base+coefficient*mean(prior.map(x=>x.saves))*(f-1);
   for(const l of [10.5,15.5,20.5])bucket(by,m,g[m],smoothProbability(vals,base,l),smoothProbability(vals,mu,l),l,g.gameId,date);
  }
  for(const g of rs){const a=past.get(g.playerId)||[];a.push(g);past.set(g.playerId,a.slice(-30));const opp=canonical(scheduledOpponent(g,idx));if(opp&&count(g.shotsAgainst)&&g.timeOnIceSeconds>=2400){const o=team.get(opp)||[];o.push(g.shotsAgainst);team.set(opp,o.slice(-20));league.push(g.shotsAgainst);if(league.length>1000)league.shift();}}
 }
 return {byMarket:summary(by),sourceRows:counts,scoring:"separate platform-specific goalie fields, PrizePicks user-provided scoring version not independently authenticated",skaterFantasy:"no_verified_scoring_contract"};
}
function comboStudy(rows,schedule){
 const idx=scheduleIndex(schedule),days=new Map(),past=new Map(),pairs=new Map(),out={};
 for(const g of rows){const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);}
 for(const [day,rs] of [...days].sort()){
  const games=new Map(),pending=[];
  for(const g of rs){const a=games.get(g.gameId)||[];a.push(g);games.set(g.gameId,a);}
  for(const [id,group] of games){
   const official=idx.get(id);if(!official)continue;
   // Fixed bounded identity-based pairing, not selected on target results.
   for(const [m,lines] of Object.entries({shotsOnGoal:[3.5,5.5],goals:[.5,1.5],saves:[39.5,49.5]})){
    const eligible=group.filter(g=>g.type===(m==="saves"?"goalie":"skater")&&count(g[m])).sort((a,b)=>a.playerId-b.playerId).slice(0,12);
    for(let i=0;i<eligible.length;i++)for(let j=i+1;j<eligible.length;j++){
     const a=eligible[i],b=eligible[j],k=m+"|"+a.playerId+"|"+b.playerId,h=pairs.get(k)||[],pa=past.get(m+"|"+a.playerId)||[],pb=past.get(m+"|"+b.playerId)||[];
     if(pa.length>=8&&pb.length>=8){
      const pmf=v=>{const x=new Map();for(const n of v)x.set(n,(x.get(n)||0)+1/v.length);return x;};
      const independent=convolution([pmf(pa),pmf(pb)]);
      for(const l of lines)if(h.length>=8)bucket(out,m,a[m]+b[m],theoreticalVector(independent,l).higher,empiricVector(h,l).higher,l,id,day);
     }
     pending.push([k,a[m]+b[m]]);
    }
   }
  }
  for(const [k,value] of pending){const a=pairs.get(k)||[];a.push(value);pairs.set(k,a.slice(-20));}
  for(const g of rs)for(const m of ["shotsOnGoal","goals","saves"])if(count(g[m])){const k=m+"|"+g.playerId,a=past.get(k)||[];a.push(g[m]);past.set(k,a.slice(-20));}
 }
 return {byMarket:summary(out),pairing:"observed same game exact member IDs, deterministic bounded synthetic pairs",crossGame:"existing convolution research; no observed platform combo members inferred"};
}
function study(history,schedule,periodHistory){
 const rows=uniqueRows(history);
 return {kind:"nhl_specialist_matchup_ablation_v1",period:periodStudy(periodHistory,schedule,rows),combo:comboStudy(rows,schedule),fantasy:fantasyStudy(rows,schedule),syntheticThresholds:true,modelPromoted:false,sourcePlatformRulesVerified:false};
}
module.exports={study,periodStudy,comboStudy,fantasyStudy};
