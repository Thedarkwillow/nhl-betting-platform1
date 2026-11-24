"use strict";
// Export private historical feature rows, using only earlier NHL dates / NFL
// weeks. Target outcomes are labels, never columns in the feature object.
const fs=require("node:fs"),path=require("node:path"),{dataset}=require("./build-nfl-partner-board-research.cjs"),{load}=require("./report-nhl-position-multiseason-v3.cjs");
const {uniqueRows,scheduleIndex,scheduledOpponent}=require("../src/nhl-fixed-ensemble-research.cjs"),nhl=require("../src/nhl-goal-credit-shared-ice-v1.cjs");
const {matchupSample,describeMatchup}=require("../src/nfl-partner-board-research.cjs"),{SPECS,forecast}=require("./backtest-nfl-historical-stats.cjs");
const vol=require("../src/nfl-priority-volume-v1.cjs"),qb=require("../src/nfl-qb-attempt-directional-v1.cjs"),pace=require("../src/nfl-qb-pace-proe-v1.cjs"),expected=require("../src/nfl-expected-receiving-components-v2.cjs"),scenario=require("../src/priority-game-scenarios-v1.cjs");
const root=path.resolve(__dirname,".."),avg=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null,n=Number.isFinite,add=(m,k,x)=>{const a=m.get(k)||[];a.push(x);m.set(k,a);};
const expanded=require("../src/priority-expanded-ml-markets.json"),{nhlCommon,kickerFeatures,KICK_MARKETS}=require("../src/priority-common-ml-shadow-v1.cjs");
function main(){
 const out=[],loaded=load(),{schedules}=loaded;let history=loaded.history;try{history=require("../src/priority-common-ml-shadow-v1.cjs").joinGoalieUsage(history,JSON.parse(fs.readFileSync(path.join(root,"outputs/nhl-usage/latest.json"),"utf8")));}catch{}try{history=require("../src/priority-common-ml-shadow-v1.cjs").joinGoalieUsage(history,JSON.parse(fs.readFileSync(path.join(root,"outputs/nhl-usage/goalie-starts-rest-latest.json"),"utf8")));}catch{}const idx=scheduleIndex({...schedules.at(-1),games:schedules.flatMap(x=>x.games)}),days=new Map(),past=new Map(),goalies=new Map();
 const componentMap=new Map();
 for(const folder of ["goal-credit-shifts","playerwon-reconciled"]){const dir=path.join(root,"outputs/nhl/research",folder);if(!fs.existsSync(dir))continue;for(const file of fs.readdirSync(dir).filter(x=>/^\d+\.json$/.test(x))){
  const d=JSON.parse(fs.readFileSync(path.join(dir,file),"utf8"));if(d.goalCreditsVerified!==true||d.gameId!==Number(file.slice(0,-5))||folder==="playerwon-reconciled"&&d.officialBoxscoreReconciled!==true)continue;
  if(!componentMap.has(d.gameId)||!componentMap.get(d.gameId).shiftsVerified&&d.shiftsVerified)componentMap.set(d.gameId,d);
 }}const components=[...componentMap.values()];
 for(const r of uniqueRows(history))add(days,r.gameDate,r);
 for(const [day,rows] of [...days.entries()].sort(([a],[b])=>a.localeCompare(b))){
  for(const r of rows){
   for(const name of Object.keys(expanded).filter(k=>k.startsWith("nhl_"))){const market=name.slice(4);if(market==="saves"&&r.started!==true||r.type!==(market==="saves"?"goalie":"skater")||!Number.isInteger(r[market])||r[market]<0||!scheduledOpponent(r,idx))continue;const features=nhlCommon(market,past.get(r.playerId)||[],r.team,day);if(features)out.push({market:name,split:day<"2026-07-01"?"train":"holdout",date:day,gameId:r.gameId,playerId:r.playerId,team:r.team,actual:r[market],base:features.recent20,features});}
   if(r.type!=="skater"||!Number.isInteger(r.points))continue;
   const opponent=scheduledOpponent(r,idx);if(!opponent)continue;
   const own=past.get(r.playerId)||[],v=nhl.features(own,components,r.playerId,r.team,day);if(!v)continue;
   const h=own.filter(x=>x.team===r.team&&Number.isInteger(x.points)).slice(-20),g=(goalies.get(opponent)||[]).slice(-15),sav=g.filter(x=>n(x.shotsAgainst)&&n(x.saves)&&x.shotsAgainst>=x.saves&&x.shotsAgainst>0);
   const recentShared=components.filter(x=>x.shiftsVerified&&x.gameDate<day&&h.some(z=>z.gameId===x.gameId)).flatMap(x=>x.shared.filter(z=>z.a===r.playerId||z.b===r.playerId).map(z=>({id:z.a===r.playerId?z.b:z.a,seconds:z.seconds})));
   const total=new Map();for(const z of recentShared)total.set(z.id,(total.get(z.id)||0)+z.seconds);
   out.push({market:"nhl_points",split:day<"2026-07-01"?"train":"holdout",date:day,gameId:r.gameId,playerId:r.playerId,team:r.team,actual:r.points,base:avg(h.slice(-10).map(x=>x.points)),features:{recent5:avg(h.slice(-5).map(x=>x.points)),recent20:avg(h.map(x=>x.points)),goals:v.goals,assists:v.assists,shootingRate:v.shootingRate,ice:v.expectedIce,primary:v.split?.primary,secondary:v.split?.secondary,even:v.split?.even,powerPlay:v.split?.powerPlay,opponentTeamSaveFraction:sav.length>=5?sav.reduce((s,x)=>s+x.saves,0)/sav.reduce((s,x)=>s+x.shotsAgainst,0):null,topSharedIceSeconds:total.size?Math.max(...total.values()):null,defender:Number(r.position==="D")}});
  }
  for(const r of rows){add(past,r.playerId,r);if(r.type==="goalie")add(goalies,r.team,r);}
 }
 const participation=[2024,2025].flatMap(y=>{try{return dataset(y,"receiver_dropback_participation")}catch{return []}}),part=require("../src/nfl-receiver-dropback-participation-v1.cjs");
 const years=[2024,2025,2026],ds=k=>years.flatMap(y=>{try{return dataset(y,k)}catch{return []}}),weekly=ds("player_weekly"),schedule=ds("schedule"),teams=ds("team_weekly"),volume=vol.teamVolume(weekly,teams,schedule),scores=qb.scoreHistory(schedule),paceRows=pace.build(ds("drive_boundary_plays"),volume),receiver=expected.build(ds("receiving_expected_targets"),weekly,schedule),targetShare=require("../src/nfl-target-share-workload-v1.cjs"),targetIdx=targetShare.teamTargets(weekly,teams,schedule);
 for(const [market,position] of [["passing_attempts","QB"],["receiving_yards","WR"],["receiving_yards","TE"],["receiving_yards","RB"],...Object.keys(expanded).filter(k=>k.startsWith("nfl_")).flatMap(k=>{const m=k.slice(4),spec=SPECS.find(x=>x.id===m);if(KICK_MARKETS.has(m))return [];return (spec.family==="passing"?["QB"]:spec.family==="rushing"?["QB","RB","FB","WR"]:["WR","TE","RB","FB"]).map(pos=>[m,pos]);})]){
  const spec=SPECS.find(x=>x.id===market),rows=matchupSample(weekly,schedule,2027,1,spec,position),weeks=new Map(),prior=[];
  for(const r of rows)add(weeks,r.y+"|"+r.w,r);
  for(const [,rs] of [...weeks.entries()].sort(([a],[b])=>{const x=a.split("|").map(Number),y=b.split("|").map(Number);return x[0]-y[0]||x[1]-y[1];})){
   for(const r of rs){
    if(r.y<2025)continue;const h=prior.filter(x=>x.playerId===r.playerId&&x.team===r.team).slice(-20);if(h.length<12)continue;
    const base=forecast(h.map(x=>x.value))?.shrunk_last5;if(!n(base))continue;
    const m=describeMatchup(prior,r.playerId,r.team,r.opponent,0,base,r.y);
    const features={base,recent5:avg(h.slice(-5).map(x=>x.value)),opportunity:avg(h.slice(-10).map(x=>x.opportunity)),oppRate:m.opponentPositionDefense?.average,ownRate:m.ownPositionOffense?.average};
    if(market==="passing_attempts"){
      const f=qb.features(h,volume,scores,r.team,r.opponent,r.y,r.w),v=vol.passingAttempts(h,volume,r.team,r.opponent,r.y,r.w);
      if(v&&f){Object.assign(features,f.variants,{margin:f.relativeMargin,share:v.qbShare});const p=pace.features(paceRows,r.team,r.opponent,r.y,r.w,v.qbShare);if(p)Object.assign(features,{pace:p.pace,neutral:p.neutralDropbackRate,proe:p.proePercentagePoints});const prev=paceRows.filter(x=>x.y<r.y||x.y===r.y&&x.w<r.w),sim=scenario.qbScenarios(prev.filter(x=>x.team===r.team),prev.filter(x=>x.opponent===r.opponent),v.qbShare,f.relativeMargin);if(sim)features.scenarioMean=sim.mean;}
    }else if(market==="receiving_yards"){
     const t=targetShare.project(h.map(x=>({...x,teamTargets:targetIdx.get(JSON.stringify([x.y,x.w,x.team]))?.targets})),[...targetIdx.entries()].filter(([k])=>{const [y,w,t]=JSON.parse(k);return t===r.team&&(y<r.y||y===r.y&&w<r.w)}).sort(([a],[b])=>{const x=JSON.parse(a),z=JSON.parse(b);return x[0]-z[0]||x[1]-z[1]}).map(([,v])=>v.targets));
     const e=t&&expected.features(receiver,r.playerId,r.team,r.y,r.w,t.targetVolume*t.share);
     const rp=participation.length?part.project(h,participation,r.playerId,r.team,r.y,r.w):null;
     Object.assign(features,{historicalDropbackShare:rp?.onFieldShare,targetsPerOnFieldDropback:rp?.targetsPerOnFieldDropback,participationProjection:rp?.projection,targetShare:t?.share,targetVolume:t?.targetVolume,expectedCatchRate:e?.expectedCatchRate,expectedYardsPerTarget:e?.expectedYardsPerTarget,expectedYards:e?.projection,positionWR:Number(position==="WR"),positionTE:Number(position==="TE")});
    }
    out.push({market:"nfl_"+market,split:r.y<2026?"train":"holdout",date:r.y+"-"+String(r.w).padStart(2,"0"),gameId:r.gameId,playerId:r.playerId,team:r.team,actual:r.value,base,features});
   }
   prior.push(...rs);
  }
 }
 const kicks=years.flatMap(y=>require("../src/nfl-kicker-reconciled-appearances.cjs").reconcile({schedule:dataset(y,"schedule"),rosters:dataset(y,"weekly_rosters"),snaps:dataset(y,"snap_counts"),kicks:dataset(y,"kicking_pbp"),teams:dataset(y,"team_weekly")}).rows).sort((a,b)=>a.year-b.year||a.week-b.week);
 const kickerPrior=new Map();for(const r of kicks){const key=JSON.stringify([r.playerId,r.team]),prior=kickerPrior.get(key)||[],h=prior.filter(x=>x.year<r.year||x.year===r.year&&x.week<r.week);for(const market of KICK_MARKETS){const features=kickerFeatures(h,market),actual=r.measures[market];if(features&&Number.isInteger(actual)&&actual>=0&&r.year>=2025)out.push({market:"nfl_"+market,split:r.year<2026?"train":"holdout",date:r.year+"-"+String(r.week).padStart(2,"0"),gameId:r.gameId,playerId:r.playerId,team:r.team,actual,base:features.base,features});}prior.push(r);kickerPrior.set(key,prior);}
 const dest=path.join(root,"outputs/research/priority-component-features-private.json");fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify({rows:out,researchOnly:true,syntheticThresholdsOnly:true,routeParticipationVerified:false,goalieStarterVerified:false}));console.log(JSON.stringify({rows:out.length,nhlComponentGames:components.length,nhlShiftGames:components.filter(x=>x.shiftsVerified).length,nflExpectedReceivingGames:receiver.length,modelPromoted:false}));
}
if(require.main===module)main();module.exports={main};