"use strict";
const ablation=require("./matchup-factor-ablation-v1.cjs");
const tails=require("./market-count-distribution-ablation-v1.cjs");
const weightHoldout=require("./matchup-market-weight-holdout-v1.cjs");
// Position-specific, past-only challenger. Original directions unchanged.
const matchup=require("./prop-matchup-evidence-v1.cjs");
const {adapt}=require("./nhl-player-context-evidence.cjs");
const {scheduleIndex}=require("./nhl-fixed-ensemble-research.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const {mass}=require("./nhl-recent-rate-forward-v1.cjs");
const {provenance}=require("./nhl-standard-triple-challenger-grader.cjs");
const {bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const POS=["C","LW","RW","D"],MARKETS=["shotsOnGoal","goals","assists","points","blockedShots","hits","faceoffsWon","powerPlayPoints"],LINES={shotsOnGoal:[1.5,2.5,3.5],goals:[.5,1.5],assists:[.5,1.5],points:[.5,1.5],blockedShots:[.5,1.5,2.5],hits:[.5,1.5,2.5],faceoffsWon:[5.5,7.5,9.5],powerPlayPoints:[.5,1.5]};
const KIND="nhl_position_rate_matchup_v2",sum=a=>a.reduce((s,v)=>s+v,0),mean=a=>sum(a)/a.length,num=Number.isFinite,cap=(v,a,b)=>Math.max(a,Math.min(b,v)),dt=Date.parse,key=(...a)=>JSON.stringify(a),valid=r=>MARKETS.includes(r.market)&&POS.includes(r.position)&&Number.isInteger(r.value)&&r.value>=0&&num(r.exposureSeconds)&&r.exposureSeconds>0;
const pkey=r=>key(r.gameId,r.playerId,r.market,r.line,r.tier),newState=()=>({player:new Map(),defense:new Map(),offense:new Map(),league:new Map()});
function asOfSeasonRows(history,schedule,beforeDate){
 const sources=Array.isArray(schedule)?schedule:[schedule];
 if(sources.length<1||sources.some(x=>!x||x.complete!==true||
    x.source!=="Official NHL Web API"))throw Error("verified season schedule required");
 const seen=new Set(),rows=[],clubs=new Set();
 for(const source of sources){
  if(seen.has(source.season))throw Error("duplicated official season");
  seen.add(source.season);
  const report=adapt(history,source,beforeDate);
  for(const row of report.rows)rows.push(row);
  for(const team of report.leagueTeams)clubs.add(team);
 }
 rows.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId||a.playerId-b.playerId);
 return {rows,leagueTeams:[...clubs].sort(),scheduleSeasons:[...seen]};
}
function add(m,k,v){const a=m.get(k)||[];a.push(v);m.set(k,a);}
function totals(a){const value=sum(a.map(r=>r.value)),ice=sum(a.map(r=>r.ice));return {games:a.length,appearances:sum(a.map(r=>r.n)),allowedPerAppearance:a.length?value/sum(a.map(r=>r.n)):null,per60:ice>0?3600*value/ice:null};}
function windows(a){return {season:totals(a),last20:totals(a.slice(-20)),last10:totals(a.slice(-10)),last5:totals(a.slice(-5))};}
function update(c,rows){
 const groups=new Map();for(const r of rows.filter(valid)){
  add(c.player,key(r.playerId,r.market),r);
  if(r.completeGame===true)add(groups,key(r.gameId,r.team,r.opponent,r.position,r.market),r);
 }
 for(const a of groups.values()){
  const r=a[0],v={value:sum(a.map(x=>x.value)),ice:sum(a.map(x=>x.exposureSeconds)),n:a.length,gameId:r.gameId,day:r.gameDate,season:r.season};
  add(c.defense,key(r.opponent,r.position,r.market),v);add(c.offense,key(r.team,r.position,r.market),v);add(c.league,key(r.position,r.market),v);
 }
}
function factor(a,ref){if(a.length<5||!(ref>0))return null;const w=windows(a);let n=0,d=0;for(const [label,weight,min] of [["season",.4,5],["last20",.2,20],["last10",.25,10],["last5",.15,5]]){const x=w[label];if(x.games<min||x.per60===null)continue;n+=weight*(x.per60/ref-1)*x.games/(x.games+20);d+=weight;}return d?cap(1+n/d,.8,1.2):null;}
function candidate(c,p,includeMatchup=false,includeRank=includeMatchup){
 const a=(c.player.get(key(p.playerId,p.market))||[]).filter(x=>x.team===canonical(p.team)).slice(-20);if(a.length<8)return null;
 const position=a.at(-1).position;if(!POS.includes(position)||a.slice(-5).filter(r=>r.position===position).length<4)return null;
 const lg=c.league.get(key(position,p.market))||[],opp=c.defense.get(key(canonical(p.opponent),position,p.market))||[],own=c.offense.get(key(canonical(p.team),position,p.market))||[];
 if(lg.length<32)return null;const ref=totals(lg).per60,d=factor(opp,ref),o=factor(own,ref);
 if(d===null||o===null)return null;
 const values=a.map(x=>x.value),toi=.65*mean(a.slice(-10).map(x=>x.exposureSeconds))+.35*mean(a.slice(-5).map(x=>x.exposureSeconds)),base=sum(values)*toi/sum(a.map(x=>x.exposureSeconds));
 const alternativeIceSeconds=.7*mean(a.slice(-3).map(x=>x.exposureSeconds))+.3*mean(a.slice(-10).map(x=>x.exposureSeconds));
 const workloadProjection=sum(values)*alternativeIceSeconds/sum(a.map(x=>x.exposureSeconds));
 const forecasts={usage:base,positionDefense:base*d,offenseDefense:base*(1+.65*(d-1)+.35*(o-1))};
 const pp=a.filter(x=>Number.isInteger(x.powerPlaySeconds)&&x.powerPlaySeconds>=0&&x.powerPlaySeconds<=x.exposureSeconds),recent=a.slice(-5);
 let powerPlayTime=null;if(pp.length>=8&&recent.every(x=>pp.includes(x))){const priorShare=sum(pp.map(x=>x.powerPlaySeconds))/sum(pp.map(x=>x.exposureSeconds)),recentShare=sum(recent.map(x=>x.powerPlaySeconds))/sum(recent.map(x=>x.exposureSeconds));powerPlayTime={priorShare,recentShare,expectedPowerPlaySeconds:toi*(.6*recentShare+.4*priorShare),knownGames:pp.length,projectedUnitVerified:false};}
 const all=includeMatchup?(c.player.get(key(p.playerId,p.market))||[]).filter(x=>x.position===position):[],sameTeam=all.filter(x=>x.team===canonical(p.team)),h2h=sameTeam.filter(x=>x.opponent===canonical(p.opponent));
 const rankSeason=a.at(-1).season;
 const ranks=includeRank&&rankSeason?[...c.defense.entries()].map(([k,v])=>({key:JSON.parse(k),v})).filter(x=>x.key[1]===position&&x.key[2]===p.market).map(x=>({team:x.key[0],v:x.v.filter(g=>g.season===rankSeason)})).map(x=>({team:x.team,games:new Set(x.v.map(g=>g.gameId)).size,rate:totals(x.v).allowedPerAppearance})):[];
 return {position,values,forecasts,powerPlayTime,expectedIceSeconds:toi,alternativeIceSeconds,workloadProjection,defenseFactor:d,offenseFactor:o,defense:windows(opp),offense:windows(own),leaguePer60:ref,priorGames:a.length,latestPriorDate:a.at(-1).gameDate,matchupValues:h2h.map(x=>x.value),sameRoleValues:sameTeam.map(x=>x.value),positionRank:matchup.leagueRank(ranks,canonical(p.opponent)),rankSeason};
}
function prepare(history,schedule,cutoff){
 const {rows,leagueTeams}=asOfSeasonRows(history,schedule,cutoff),days=new Map(),c=newState(),out={};
 for(const r of rows.filter(valid))add(days,r.gameDate,r);
 for(const [day,rs] of [...days].sort(([a],[b])=>a.localeCompare(b))){
  for(const r of rs){const p=candidate(c,r,true,false);if(!p)continue;for(const k of [r.market,r.market+"|"+p.position]){
   const a=out[k]??={n:0,games:new Set(),dates:new Set(),models:{},diff:new Map()};a.n++;a.games.add(r.gameId);a.dates.add(day);
   if(day>="2026-10-01"){const b=a.distributions??={};for(const line of LINES[r.market])tails.record(b,tails.candidates(p.values,p.forecasts.usage,line),r.value,line,r.gameId);}
   const h=matchup.h2hShadow(p.forecasts.offenseDefense,matchup.split(p.sameRoleValues,0),matchup.split(p.matchupValues,0));
   const broad=a.broad??=ablation.create();ablation.observe(broad,{base:p.forecasts.usage,actual:r.value,gameId:r.gameId,train:day<"2026-10-01",lines:LINES[r.market],candidates:{workload:p.workloadProjection,defense:p.forecasts.positionDefense,offense:p.forecasts.usage*p.offenseFactor,combined:p.forecasts.offenseDefense,headToHead:h? p.forecasts.usage+h.adjustment:null}});
   if(h){const weights=a.weightHoldout??=weightHoldout.create();weightHoldout.observe(weights,{base:p.forecasts.usage,position:p.forecasts.offenseDefense,combined:h.projection,actual:r.value,gameId:r.gameId,train:day<'2026-10-01',lines:LINES[r.market]});const paired=a.h2hPaired??={n:0,baselineAbs:0,combinedAbs:0,thresholds:0,baseWins:0,positionWins:0,combinedWins:0,alwaysHigher:0,alwaysLower:0};paired.n++;paired.baselineAbs+=Math.abs(p.forecasts.offenseDefense-r.value);paired.combinedAbs+=Math.abs(h.projection-r.value);for(const line of LINES[r.market]){const y=r.value>line;paired.thresholds++;paired.baseWins+=Number((p.forecasts.usage>line)===y);paired.positionWins+=Number((p.forecasts.offenseDefense>line)===y);paired.combinedWins+=Number((h.projection>line)===y);paired.alwaysHigher+=Number(y);paired.alwaysLower+=Number(!y);}}
   for(const [name,mu] of Object.entries(p.forecasts)){const b=a.models[name]??={mae:0,brier:0,log:0,n:0};b.mae+=Math.abs(mu-r.value);
    for(const line of LINES[r.market]){const q=mass(p.values,mu,line),ref=mass(p.values,p.forecasts.usage,line),y=Number(r.value>line);b.brier+=(q.higher-y)**2;b.log-=Math.log(Math.max(1e-8,y?q.higher:q.lower));b.n++;
      if(name==="offenseDefense"){const g=a.diff.get(r.gameId)||{diff:0,n:0};g.diff+=(q.higher-y)**2-(ref.higher-y)**2;g.n++;a.diff.set(r.gameId,g);}
    }
   }
  }}
  update(c,rs);
 }
 return {c,report:{kind:KIND,cutoff,leagueTeams:leagueTeams.length,byMarketPosition:Object.fromEntries(Object.entries(out).map(([k,a])=>[k,{appearances:a.n,countDistributionHoldout:a.distributions?tails.summary(a.distributions):null,independentFactorHoldout:a.broad?ablation.summarize(a.broad):null,distinctGames:a.games.size,distinctDates:a.dates.size,models:Object.fromEntries(Object.entries(a.models).map(([m,b])=>[m,{mae:b.mae/a.n,brier:b.brier/b.n,logLoss:b.log/b.n,thresholds:b.n}])),learnedMatchupHoldout:a.weightHoldout?weightHoldout.summarize(a.weightHoldout):null,headToHeadPairedMAE:a.h2hPaired?{appearances:a.h2hPaired.n,positionMAE:a.h2hPaired.baselineAbs/a.h2hPaired.n,combinedMAE:a.h2hPaired.combinedAbs/a.h2hPaired.n,syntheticDirection:{thresholds:a.h2hPaired.thresholds,baseWins:a.h2hPaired.baseWins,positionWins:a.h2hPaired.positionWins,combinedWins:a.h2hPaired.combinedWins,alwaysHigher:a.h2hPaired.alwaysHigher,alwaysLower:a.h2hPaired.alwaysLower}}:null,offenseDefenseMinusUsageBrierGameCI:bootstrapGameBrierDifference([...a.diff.values()])}])),retrospective:true,syntheticThresholdsOnly:true,modelPromoted:false}};
}
function freeze(s,history,schedule){
 const now=dt(s.generatedAt),cutoff=require("./nhl-standard-forward-diagnostics.cjs").pacificDay(s.generatedAt),
  {rows,scheduleSeasons}=asOfSeasonRows(history,schedule,cutoff),c=newState(),
  idx=scheduleIndex(Array.isArray(schedule)?{source:"Official NHL Web API",complete:true,
    games:schedule.flatMap(x=>x.games)}:schedule),out=[];
 update(c,rows.sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId));
 const seen=new Set();
 for(const p of s.individualPropSelections||[]){
  if(!MARKETS.includes(p.market)||!["Standard","Goblin","Demon"].includes(p.tier)||!["Higher","Lower"].includes(p.lean)||p.tier!=="Standard"&&p.lean!=="Higher"||!num(p.line)||dt(p.gameStartAt)-now<900000||!num(dt(p.capturedAt))||dt(p.capturedAt)>now||now-dt(p.capturedAt)>1800000||seen.has(pkey(p)))continue;
  const g=idx.get(p.gameId);if(!g||Math.abs(dt(g.startTimeUTC)-dt(p.gameStartAt))>300000)continue;
  const raw=(s.rankedProps||[]).filter(x=>pkey(x)===pkey(p)&&x.lean===p.lean&&x.capturedAt===p.capturedAt);
  if(raw.length!==1||!num(raw[0].probabilities?.higher)||raw[0].probabilities.higher<0||raw[0].probabilities.higher>1)continue;
  const v=candidate(c,p,true);if(!v)continue;
  const probabilities=Object.fromEntries(Object.entries(v.forecasts).map(([k,x])=>[k,mass(v.values,x,p.line)]));if(Object.values(probabilities).some(x=>!x))continue;
  seen.add(pkey(p));out.push({gameId:p.gameId,playerId:p.playerId,market:p.market,line:p.line,tier:p.tier,side:p.lean,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,originalHigher:raw[0].probabilities.higher,position:v.position,powerPlayTime:v.powerPlayTime,defense:v.defense,offense:v.offense,defenseFactor:v.defenseFactor,offenseFactor:v.offenseFactor,latestPriorDate:v.latestPriorDate,probabilities,matchupEvidenceV1:{countDistributionShadows:tails.candidates(v.values,v.forecasts.usage,p.line),workloadShadow:{originalLine:p.line,side:v.workloadProjection>p.line?"Higher":v.workloadProjection<p.line?"Lower":null,expectedIceSeconds:v.alternativeIceSeconds,projection:v.workloadProjection,liveLineAssignmentVerified:false,calibrated:false},independentFactors:{defense:v.forecasts.positionDefense,offense:v.forecasts.usage*v.offenseFactor,combined:v.forecasts.offenseDefense},scope:"prior archived regular-season games; same team and historical position; not current lineup confirmation",rankScope:"latest historical player season only; not a live lineup rank",rankSeason:v.rankSeason,opponentPositionRank:v.positionRank,playerForm:matchup.windows(v.sameRoleValues,p.line),headToHead:matchup.windows(v.matchupValues,p.line),shadow:matchup.h2hShadow(v.forecasts.offenseDefense,matchup.split(v.sameRoleValues,p.line),matchup.split(v.matchupValues,p.line)),calibrated:false,modelPromoted:false}});
 }
 return {kind:KIND,generatedAt:s.generatedAt,rows:out,historyScheduleSeasons:scheduleSeasons,researchOnly:true,modelPromoted:false};
}
function score(frames,history,policyAt){
 const by={},seen=new Set();
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot,v=s?.positionRateMatchupV2;if(!num(dt(policyAt))||dt(s?.generatedAt)<=dt(policyAt)||!provenance(s,f.firstCommittedAt,f.gitHistoryCount)||v?.kind!==KIND||v.generatedAt!==s.generatedAt)continue;
  for(const x of v.rows||[]){
   const k=pkey(x),raw=(s.rankedProps||[]).filter(p=>pkey(p)===k&&p.lean===x.side&&p.capturedAt===x.capturedAt),orig=(s.individualPropSelections||[]).filter(p=>pkey(p)===k&&p.lean===x.side&&p.capturedAt===x.capturedAt);
   if(seen.has(k)||raw.length!==1||orig.length!==1||raw[0].probabilities?.higher!==x.originalHigher||!Number.isFinite(dt(x.gameStartAt))||dt(x.gameStartAt)-dt(f.firstCommittedAt)<900000||x.line%1!==.5||!["usage","positionDefense","offenseDefense"].every(m=>num(x.probabilities?.[m]?.higher)))continue;
   seen.add(k);const a=by[x.tier+"|"+x.market]??={registered:0,decided:0,models:{},games:new Set(),dates:new Set()};a.registered++;
   const finals=(history.players[String(x.playerId)]?.games||[]).filter(g=>g.gameId===x.gameId&&g.playerId===x.playerId&&g.type==="skater"&&["FINAL","OFF"].includes(g.gameState)&&g.timeOnIceSeconds>0&&Number.isInteger(g[x.market]));if(finals.length!==1||finals[0][x.market]===x.line)continue;
   const g=finals[0],y=Number(g[x.market]>x.line);a.decided++;a.games.add(x.gameId);a.dates.add(g.gameDate);
   const variants=x.matchupEvidenceV1?.countDistributionShadows;
   if(variants&&["poisson","negativeBinomial","empirical"].every(k=>["higher","lower","push"].every(j=>num(variants[k]?.[j])&&variants[k][j]>=0&&variants[k][j]<=1)&&Math.abs(Object.values(variants[k]).reduce((s,v)=>s+v,0)-1)<1e-6)){
    a.distributionForward??={};tails.record(a.distributionForward,variants,g[x.market],x.line,x.gameId);
   }
   const w=x.matchupEvidenceV1?.workloadShadow;
   if(x.tier==="Standard"&&w?.calibrated===false&&w.originalLine===x.line&&num(w.projection)&&["Higher","Lower"].includes(w.side)&&w.side===(w.projection>x.line?"Higher":w.projection<x.line?"Lower":null)){
    const q=a.workload??={decided:0,originalWins:0,workloadWins:0,alwaysHigher:0,alwaysLower:0};q.decided++;q.originalWins+=Number((x.side==="Higher")===!!y);q.workloadWins+=Number((w.side==="Higher")===!!y);q.alwaysHigher+=y;q.alwaysLower+=1-y;
   }
   for(const [m,q] of Object.entries({original:x.originalHigher,...Object.fromEntries(Object.entries(x.probabilities).map(([k,v])=>[k,v.higher]))})){const b=a.models[m]??={brier:0};b.brier+=(q-y)**2;}
  }
 }
 return {kind:KIND,originalFrozenOnly:true,byTierMarket:Object.fromEntries(Object.entries(by).map(([k,a])=>[k,{registered:a.registered,decided:a.decided,distinctGames:a.games.size,distinctDates:a.dates.size,workloadDirectional:a.workload??null,distributionForward:a.distributionForward?tails.summary(a.distributionForward):null,brier:Object.fromEntries(Object.entries(a.models).map(([m,v])=>[m,v.brier/a.decided]))}])),registered:seen.size,calibrated:false,modelPromoted:false};
}
module.exports={POS,MARKETS,windows,factor,newState,update,candidate,prepare,freeze,score};
