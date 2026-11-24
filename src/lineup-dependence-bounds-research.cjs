"use strict";
// Dependence uncertainty without claiming fitted joint probabilities.
// Mathematical all-hit bounds hold for any Bernoulli dependence with these marginals.
// Research only; does not rank or publish lineup recommendations.
function summarize(legs){
 if(!Array.isArray(legs)||legs.length<2||legs.length>6||legs.some(p=>!p||!Number.isFinite(p.probability)||p.probability<0||p.probability>1))return null;
 const ps=legs.map(p=>p.probability),n=ps.length;
 const groups={samePlayer:0,sameGame:0,sameTeam:0,unknownIdentity:0};
 for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){
  const a=legs[i],b=legs[j];
  if(!a.playerId||!b.playerId||!a.gameId||!b.gameId){groups.unknownIdentity++;continue;}
  if(a.playerId===b.playerId)groups.samePlayer++;
  if(a.gameId===b.gameId){groups.sameGame++;if(a.team&&a.team===b.team)groups.sameTeam++;}
 }
 const min=Math.min(...ps),max=Math.max(...ps),total=ps.reduce((s,x)=>s+x,0);
 return {kind:"research_lineup_uncertainty_v1",size:n,minimumMarginal:min,maximumMarginal:max,meanMarginal:total/n,
  expectedHits:total,independentAllHitScenario:ps.reduce((s,x)=>s*x,1),
  arbitraryDependenceAllHitBounds:{lower:Math.max(0,total-(n-1)),upper:min},
  weakestMarginalCount:ps.filter(x=>x===min).length,pairFlags:groups,
  riskFlags:{pushOrVoidUnmodeled:legs.some(p=>p.probabilities?.push!==0),availabilityUnverified:legs.some(p=>p.availabilityVerified!==true)},
  marginalsCalibrated:false,jointProbabilityVerified:false,researchOnly:true};
}
// Paired historical actual outcomes on two fixed, synthetic thresholds (not platform win events).
// Estimate smoothed empirical joint frequency and compare heldout paired targets.
// Group by unique game ID, dates strictly earlier than heldout; no missing-as-zero.
function pairStudy(rows,{firstHoldout="2026-07-01",minPrior=20}={}){
 const byGame=new Map();
 for(const r of rows||[]){if(!r.gameId||!/^\d{4}-\d{2}-\d{2}$/.test(r.day||"")||![0,1].includes(r.a)||![0,1].includes(r.b))continue;
  const list=byGame.get(r.gameId)||[];list.push(r);byGame.set(r.gameId,list);}
 const a=[...byGame.values()].filter(x=>x.length===1).map(x=>x[0]).sort((x,y)=>x.day.localeCompare(y.day));
 let n=0,base=0,joint=0,shrunk=0;const dates=new Set();
 for(const r of a){if(r.day<firstHoldout)continue;const prior=a.filter(x=>x.day<r.day);if(prior.length<minPrior)continue;
  const p=(prior.reduce((s,x)=>s+x.a,0)+1)/(prior.length+2),q=(prior.reduce((s,x)=>s+x.b,0)+1)/(prior.length+2);
  const j=(prior.filter(x=>x.a&&x.b).length+1)/(prior.length+4);
  const w=prior.length/(prior.length+50),bounded=Math.max(0,p+q-1,Math.min(p,q,(1-w)*p*q+w*j));
  const y=r.a*r.b; n++;base+=(p*q-y)**2;joint+=(j-y)**2;shrunk+=(bounded-y)**2;dates.add(r.day);
 }
 return {heldoutGames:n,distinctDates:dates.size,independenceBrier:n?base/n:null,pairedJointBrier:n?joint/n:null,shrunkCoherentJointBrier:n?shrunk/n:null,usesMarginalDependenceBounds:true,syntheticOnly:true,productionEligible:false};
}
// One deterministic team side per game to avoid duplicating a game as independent.
// These are aggregate script proxies, not matching a specific prop pair.
function nhlProxy(history){
 const games=new Map();
 for(const p of Object.values(history?.players||{}))for(const g of p.games||[]){
  if(!["FINAL","OFF"].includes(g.gameState)||!g.team||!Number.isInteger(g.gameId)||!Number.isInteger(g.playerId)||!Number.isFinite(g.timeOnIceSeconds)||g.timeOnIceSeconds<=0)continue;
  const a=games.get(g.gameId)||[];a.push(g);games.set(g.gameId,a);
 }
 const rows=[];
 for(const [gameId,g] of games){const teams=[...new Set(g.map(x=>x.team))].sort();
  if(teams.length!==2||new Set(g.map(x=>x.playerId)).size!==g.length||new Set(g.map(x=>x.gameDate)).size!==1)continue;
  const shooters=g.filter(x=>x.team===teams[0]&&x.type==="skater"),goalie=g.filter(x=>x.team===teams[1]&&x.type==="goalie");
  if(shooters.length!==18||goalie.length!==1||!shooters.every(x=>Number.isInteger(x.shotsOnGoal)&&x.shotsOnGoal>=0)||!Number.isInteger(goalie[0].saves)||goalie[0].saves<0)continue;
  rows.push({gameId,day:g[0].gameDate,a:Number(shooters.reduce((s,x)=>s+x.shotsOnGoal,0)>29.5),b:Number(goalie[0].saves>27.5)});
 }
 return {...pairStudy(rows),eligibleHistoricalGames:rows.length,cohort:"one observed opposing goalie and complete team shots; appearance-conditioned",actualIndividualOfferPairs:false};
}
function nflProxy(schedule,weekly){
 const byTeamWeek=new Map();
 for(const r of weekly||[]){if(!r.player_id||!r.position||!r.recent_team&&!r.team||!Number.isInteger(Number(r.season))||!Number.isInteger(Number(r.week)))continue;
  if(r.season_type&&r.season_type!=="REG")continue;
  const k=JSON.stringify([Number(r.season),Number(r.week),r.recent_team||r.team]);const a=byTeamWeek.get(k)||[];a.push(r);byTeamWeek.set(k,a);}
 const rows=[];
 for(const g of schedule||[]){if(g.game_type!=="REG"||!g.game_id||!Number.isFinite(g.home_score)||!Number.isFinite(g.away_score))continue;
  const team=byTeamWeek.get(JSON.stringify([Number(g.season),Number(g.week),g.home_team]))||[];
  if(new Set(team.map(x=>x.player_id)).size!==team.length)continue;
  const qbs=team.filter(x=>x.position==="QB"&&Number.isFinite(x.attempts)&&x.attempts>0),wr=team.filter(x=>x.position==="WR"&&Number.isFinite(x.targets)&&x.targets>0);
  if(qbs.length!==1||wr.length<2||!Number.isFinite(qbs[0].passing_yards)||!wr.every(x=>Number.isFinite(x.receiving_yards)))continue;
  rows.push({gameId:g.game_id,day:g.gameday,a:Number(qbs[0].passing_yards>224.5),b:Number(wr.reduce((s,x)=>s+x.receiving_yards,0)>119.5)});
 }
 return {...pairStudy(rows),eligibleHistoricalGames:rows.length,cohort:"observed home QB and aggregate WR receiving yards; appearance-conditioned",actualIndividualOfferPairs:false};
}
// Coverage is reported for every eligible format/size, including no original scenarios.
// Never pool overlapping formats or label independent scenarios calibrated.
function formatCoverage(groups,calibration){
 const result={};
 for(const format of ["power","flex"])for(let size=format==="power"?2:3;size<=6;size++){
  const key=format+"_"+size,g=groups?.[key],h=calibration?.byFormat?.[key];
  const n=x=>Number.isInteger(x)&&x>=0?x:0;
  result[key]={registered:n(g?.registered),decided:n(g?.decided),pending:n(g?.pending),
   excludedPush:n(g?.excludedPush??g?.pushExcluded),missingFinalStat:n(g?.missingFinalStat),
   distinctResolvedSlates:n(h?.distinctResolvedSlates),heldoutSlates:n(h?.heldoutSlates),
   countMassTrainingSlateGate:20,heldoutSlateGate:30,
   status:!g?.registered?"no_original_scenarios":!g.decided?"awaiting_final_evidence":"descriptive_only",
   calibrationApproved:false,verifiedJointProbability:null,payoutSettlementVerified:false};
 }
 return result;
}
module.exports={summarize,pairStudy,nhlProxy,nflProxy,formatCoverage};
