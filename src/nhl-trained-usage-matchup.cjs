"use strict";
// Historical official-stat research, conditional on observed participation.
// Fit fixed candidate blends on earlier dates only. Do not deploy or infer offers.
const MARKETS=["shotsOnGoal","goals","assists","points","blockedShots","hits","faceoffsWon","saves"];
const CUT="2026-11-08",END="2026-11-14";
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const sum=a=>a.reduce((s,x)=>s+x,0);
const valid=x=>Number.isInteger(x)&&x>=0;
const toi=x=>Number.isFinite(x)&&x>0&&x<=3900;
const round=x=>Number(x.toFixed(6));
const canon=s=>({SJ:"SJS",LA:"LAK",TB:"TBL",NJ:"NJD"}[s]||s);
const form=a=>.5*mean(a.slice(-5))+.3*mean(a.slice(-10))+.2*mean(a);
const grid=Object.freeze([
 ["form",1,0,0,0],["priorMean",0,1,0,0],["usage",0,0,1,0],["usageMatchup",0,0,0,1],
 ["formMean",.5,.5,0,0],["formUsage",.5,0,.5,0],["formMatchup",.5,0,0,.5],
 ["meanUsage",0,.5,.5,0],["meanMatchup",0,.5,0,.5],["balanced",.25,.25,.25,.25],
 ["contextBlend",0,0,.5,.5]
]);
function forecasts(rows,opponentSamples,leagueSamples){
 if(rows.length<5)return null;
 const counts=rows.map(r=>r.stat),past=rows.filter(r=>toi(r.toi)).slice(-10);
 if(past.length<5||opponentSamples.length<3||leagueSamples.length<12)return null;
 const ref=mean(leagueSamples);
 if(!(ref>0))return null;
 const minutes=.65*mean(past.map(x=>x.toi))+.35*mean(past.slice(-5).map(x=>x.toi));
 const rate=sum(past.map(x=>x.stat))/sum(past.map(x=>x.toi));
 const usage=rate*minutes;
 const n=opponentSamples.length;
 const ratio=mean(opponentSamples)/ref;
 const factor=Math.min(1.2,Math.max(.8,1+(ratio-1)*n/(n+12)));
 const values=[form(counts),mean(counts),usage,usage*factor];
 return {values,candidates:Object.fromEntries(grid.map(([id,...w])=>[id,sum(w.map((x,i)=>x*values[i]))])),priorGames:rows.length,usageGames:past.length,opponentGames:n};
}
function validDate(s){return typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(Date.parse(s)).toISOString().slice(0,10)===s;}
function rowsFromReports(reports){
 const dates=new Map(),ids=new Set(),excluded=[];
 for(const report of reports){
  const d=report?.requestedDate;
  if(!validDate(d)||d>=END||report.source!=="NHL public API"||
   ![3,4,5].includes(report.sourceSchemaVersion)||!Array.isArray(report.errors)||report.errors.length||
   !Number.isInteger(report.scheduledGames)||report.scheduledGames!==report.completedGames||
   report.scheduledGames!==report.collectedGames||!Array.isArray(report.players)){
   excluded.push(d||"unknown");continue;
  }
  if(dates.has(d))throw Error("Duplicate official day");
  const games=new Map(),local=new Set();
  for(const x of report.players){
   if(x.gameDate!==d||!Number.isInteger(x.playerId)||!Number.isInteger(x.gameId)||
    !["OFF","FINAL"].includes(x.gameState)||!["skater","goalie"].includes(x.type)||
    typeof x.team!=="string"||!x.team)throw Error("Invalid official player-game row");
   const id=x.gameId+"|"+x.playerId;
   if(ids.has(id)||local.has(id))throw Error("Duplicate official player-game");
   local.add(id);
   if(!games.has(x.gameId))games.set(x.gameId,[]);
   games.get(x.gameId).push({...x,team:canon(x.team)});
  }
  if(games.size!==report.scheduledGames){excluded.push(d);continue;}
  for(const id of local)ids.add(id);
  dates.set(d,games);
 }
 return {dates,excluded};
}
function fullTeams(rows){
 const teams=[...new Set(rows.map(x=>x.team))];
 if(teams.length!==2)return null;
 const map=new Map(teams.map(t=>[t,rows.filter(x=>x.team===t&&x.type==="skater"&&toi(x.timeOnIceSeconds))]));
 if([...map.values()].some(a=>a.length!==18))return null;
 return {teams,map};
}
function buildRows(reports){
 const {dates,excluded}=rowsFromReports(reports);
 const players=new Map(),opponents=new Map(),league=new Map(),out=[],coverage={};
 const get=(m,k)=>m.get(k)||[];
 const push=(m,k,v)=>{if(!m.has(k))m.set(k,[]);m.get(k).push(v);};
 for(const [date,games] of [...dates].sort(([a],[b])=>a.localeCompare(b))){
  // Entire day evaluated before any same-day outcomes update features.
  const dayUpdates=[],defUpdates=[];
  for(const [gameId,rows] of games){
   const teams=fullTeams(rows);
   for(const p of rows){
    if(!toi(p.timeOnIceSeconds))continue; // conditional on appearing
    const opp=teams?.teams.find(x=>x!==p.team);
    for(const market of MARKETS){
     if((market==="saves")!==(p.type==="goalie")||!valid(p[market]))continue;
     const k=p.playerId+"|"+market,prior=get(players,k);
     const c=coverage[market]??={appearances:0,priorReady:0,matched:0,usageOrMatchupMissing:0};
     c.appearances++;
     if(prior.length>=5)c.priorReady++;
     const f=opp?forecasts(prior,get(opponents,opp+"|"+market).slice(-20),get(league,market)):null;
     if(f){out.push({date,gameId,market,actual:p[market],candidates:f.candidates});c.matched++;}
     else if(prior.length>=5)c.usageOrMatchupMissing++;
     dayUpdates.push([k,{stat:p[market],toi:p.timeOnIceSeconds}]);
    }
   }
   if(!teams)continue;
   for(const defense of teams.teams){
    const attack=teams.map.get(teams.teams.find(t=>t!==defense));
    for(const market of MARKETS){
     // Saves opportunity = opposing team's actual historical shots on goal.
     // Skater opponent factors = team totals allowed by the defense.
     // Blocked shots use opposing shot volume as opportunity proxy, not blocks allowed.
     const field=market==="saves"||market==="blockedShots"?"shotsOnGoal":market;
     // For saves use opponent's own shots generated, not shots it allowed.
     const sample=market==="saves"||market==="blockedShots"?teams.map.get(defense):attack;
     if(!sample.every(x=>valid(x[field])))continue;
     const value=sum(sample.map(x=>x[field]));
     defUpdates.push([defense+"|"+market,market,value]);
    }
   }
  }
  for(const [k,v] of dayUpdates)push(players,k,v);
  for(const [k,m,v] of defUpdates){push(opponents,k,v);push(league,m,v);}
 }
 return {rows:out,coverage,acceptedDates:[...dates.keys()].sort(),excludedDates:excluded};
}
function score(rows,id){
 if(!rows.length)return null;
 const err=rows.map(r=>r.candidates[id]-r.actual);
 return {mae:round(mean(err.map(Math.abs))),rmse:round(Math.sqrt(mean(err.map(x=>x*x)))),bias:round(mean(err))};
}
function evaluate(reports){
 const data=buildRows(reports),byMarket={};
 for(const market of MARKETS){
  const all=data.rows.filter(r=>r.market===market);
  const train=all.filter(r=>r.date<CUT),test=all.filter(r=>r.date>=CUT);
  const training=Object.fromEntries(grid.map(([id])=>[id,score(train,id)]));
  const evaluation=Object.fromEntries(grid.map(([id])=>[id,score(test,id)]));
  const trainDates=new Set(train.map(r=>r.date)).size;
  const choice=train.length>=100&&trainDates>=5?grid.map(([id])=>id).reduce((best,id)=>training[id].mae<training[best].mae?id:best,"form"):null;
  byMarket[market]={trainingRows:train.length,trainingDates:trainDates,testRows:test.length,
   testDates:new Set(test.map(r=>r.date)).size,testGames:new Set(test.map(r=>r.gameId)).size,
   selectedFromTrainingOnly:choice,training,evaluation,
   selectedMinusBaselineMAE:choice&&test.length?round(evaluation[choice].mae-evaluation.form.mae):null,
   coverage:data.coverage[market]||null};
 }
 return {kind:"nhl_trained_usage_matchup_stat_lab_v1",trainBefore:CUT,testBefore:END,acceptedDates:data.acceptedDates,excludedDates:data.excludedDates,
  evaluatedRows:data.rows.length,byMarket,selectionMetric:"training matched MAE",modelPromoted:false,
  genuinelyProspective:false,originalPlatformHitRate:null,verifiedPayoutROI:null,
  limitations:"Previously observed official final boxscores; conditional on recorded player appearance and final game identity, no confirmed pregame lineup. Usage and opponent statistics strictly before evaluated day. Partial current-season archive, mutually correlated observations; no blind independent test. No actual-line or payout inference."};
}
module.exports={MARKETS,CUT,END,grid,forecasts,rowsFromReports,buildRows,evaluate};
