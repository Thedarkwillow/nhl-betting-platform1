"use strict";
// Fixed official-boxscore analogue of the three-season Brier-selected research.
// Exactly matches the historical shifted-count law with two pseudo-outcomes on
// half lines. Integer lines add a third pseudo-outcome; no claim of calibration.
const {priorContext}=require("./nhl-forward-expanded-market.cjs");
const {canonical}=require("./nhl-opponent-context.cjs");
const {POLICY}=require("./nhl-frozen-individual-props.cjs");
const {provenance}=require("./nhl-standard-triple-challenger-grader.cjs");
const KIND="nhl_recent_rate_forward_v1",MARKETS=["shotsOnGoal","goals","saves","assists","points","hits","blockedShots","faceoffsWon"],TIERS=["Standard","Goblin","Demon"],OUT=["higher","lower","push"];
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const id=x=>JSON.stringify([x.gameId,x.playerId,x.market,x.line,x.tier]);
const count=x=>Number.isInteger(x)&&x>=0;
const toi=x=>Number.isFinite(x)&&x>0&&x<=3900;
const mean=a=>a.reduce((s,x)=>s+x,0)/a.length;
const sum=a=>a.reduce((s,x)=>s+x,0);
const vector=p=>OUT.every(k=>Number.isFinite(p?.[k])&&p[k]>=0&&p[k]<=1)&&Math.abs(sum(OUT.map(k=>p[k]))-1)<1e-5;
const pacific=t=>{const p=Object.fromEntries(new Intl.DateTimeFormat("en-CA",{timeZone:"America/Los_Angeles",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date(t)).map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day;};
function mass(values,mu,line){
 if(values.length<8||!values.every(count)||!Number.isFinite(mu)||mu<0||!Number.isFinite(line)||line<0)return null;
 const a=values.slice(-30),center=mean(a),n={higher:1,lower:1,push:Number(Number.isInteger(line))};
 for(const x of a){const v=Math.max(0,Math.round(x-center+mu));n[v>line?"higher":v<line?"lower":"push"]++;}
 const total=sum(OUT.map(k=>n[k]));return Object.fromEntries(OUT.map(k=>[k,n[k]/total]));
}
function candidate(p,c){
 const prior=(c.byPlayer.get(Number(p.playerId))||[]).filter(g=>g.type===(p.market==="saves"?"goalie":"skater")&&toi(g.timeOnIceSeconds)&&count(g[p.market])).sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId).slice(-60);
 if(!MARKETS.includes(p.market)||prior.length<8)return null;
 const a=prior.slice(-20),f=x=>x.timeOnIceSeconds,expected=.65*mean(a.slice(-10).map(f))+.35*mean(a.slice(-5).map(f));
 let estimate=sum(a.map(x=>x[p.market]))*expected/sum(a.map(f)),opponentGames=0;
 // Predeclared: historical Brier leaders were recent rate for SOG/goals,
 // opponent rate for saves. Other markets are explicitly exploratory.
 if(p.market==="saves"){
  const opp=(c.team[canonical(p.opponent)]?.saves||[]).slice(-20),league=(c.league.saves||[]).slice(-1200);
  if(opp.length<5||league.length<20||mean(league)<=0)return null;
  estimate*=Math.max(.8,Math.min(1.2,1+(mean(opp)/mean(league)-1)*opp.length/(opp.length+20)));opponentGames=opp.length;
 }
 const probabilities=mass(prior.map(x=>x[p.market]),estimate,p.line);
 if(!probabilities)return null;
 return {estimate,probabilities,priorGames:prior.length,opponentGames,policy:p.market==="saves"?"opponent_rate":"recent_rate",exploratoryMarket:!["shotsOnGoal","goals","saves"].includes(p.market)};
}
function freeze(s,history,prepared=null){
 if(s?.individualPropSelectionPolicy!==POLICY||!Array.isArray(s.individualPropSelections)||!Array.isArray(s.rankedProps)||!Number.isFinite(dt(s.generatedAt)))throw Error("original snapshot required");
 const c=prepared||priorContext(history,pacific(s.generatedAt)),rows=[],seen=new Set();
 for(const o of s.individualPropSelections){
  const key=id(o),raw=s.rankedProps.filter(x=>id(x)===key&&x.lean===o.lean&&x.capturedAt===o.capturedAt);
  if(seen.has(key)||!MARKETS.includes(o.market)||!TIERS.includes(o.tier)||!["Higher","Lower"].includes(o.lean)||(o.tier!=="Standard"&&o.lean!=="Higher")||raw.length!==1||!vector(raw[0].probabilities)||!Number.isFinite(dt(o.capturedAt))||dt(o.capturedAt)>dt(s.generatedAt)||!Number.isFinite(dt(o.gameStartAt))||dt(o.gameStartAt)-dt(s.generatedAt)<900000)continue;
  seen.add(key);const v=candidate(o,c);if(!v)continue;
  rows.push({gameId:o.gameId,playerId:o.playerId,market:o.market,line:o.line,tier:o.tier,side:o.lean,capturedAt:o.capturedAt,gameStartAt:o.gameStartAt,champion:raw[0].probabilities,candidate:v});
 }
 return {kind:KIND,generatedAt:s.generatedAt,rows,researchOnly:true,modelPromoted:false};
}
function score(frames,history,policyAt,{retrospective=false}={}){
 const by={},seen=new Set(),contexts=new Map(),reject={};const skip=k=>reject[k]=(reject[k]||0)+1;
 if(!retrospective&&!Number.isFinite(dt(policyAt)))return {kind:KIND,status:"missing_policy",byTierMarket:{},modelPromoted:false};
 for(const f of [...frames].sort((a,b)=>dt(a.firstCommittedAt)-dt(b.firstCommittedAt))){
  const s=f.snapshot;if(!provenance(s,f.firstCommittedAt,f.gitHistoryCount)||s.individualPropSelectionPolicy!==POLICY||!Array.isArray(s.individualPropSelections)||!Array.isArray(s.rankedProps))continue;
  let v=s.recentRateForwardV1;
  if(retrospective){try{const day=pacific(s.generatedAt);if(!contexts.has(day))contexts.set(day,priorContext(history,day));v=freeze(s,history,contexts.get(day))}catch{skip("replay_history_invalid");continue;}}
  if(v?.kind!==KIND||v.generatedAt!==s.generatedAt||v.modelPromoted!==false||!Array.isArray(v.rows)||(!retrospective&&(dt(s.generatedAt)<=dt(policyAt)||dt(f.firstCommittedAt)<=dt(policyAt))))continue;
  for(const x of v.rows){
   const k=id(x),original=s.individualPropSelections.filter(o=>id(o)===k&&o.lean===x.side&&o.capturedAt===x.capturedAt&&o.gameStartAt===x.gameStartAt),raw=s.rankedProps.filter(o=>id(o)===k&&o.lean===x.side&&o.capturedAt===x.capturedAt);
   if(seen.has(k)||original.length!==1||raw.length!==1||!MARKETS.includes(x.market)||!TIERS.includes(x.tier)||!["Higher","Lower"].includes(x.side)||(x.tier!=="Standard"&&x.side!=="Higher")||!Number.isFinite(dt(x.capturedAt))||dt(x.capturedAt)>dt(s.generatedAt)||!Number.isFinite(dt(x.gameStartAt))||dt(x.gameStartAt)-dt(f.firstCommittedAt)<900000||JSON.stringify(raw[0].probabilities)!==JSON.stringify(x.champion)||!vector(x.champion)||!vector(x.candidate?.probabilities)){skip("invalid_or_repeated");continue;}
   seen.add(k);const a=by[x.tier+"|"+x.market]??={registered:0,resolved:0,rawBrier:0,candidateBrier:0,rawLogLoss:0,candidateLogLoss:0,games:new Set(),dates:new Set()};
   a.registered++;
   const final=(history?.players?.[String(x.playerId)]?.games||[]).filter(g=>g.gameId===x.gameId&&g.type===(x.market==="saves"?"goalie":"skater")&&["FINAL","OFF"].includes(g.gameState)&&toi(g.timeOnIceSeconds));
   if(final.length!==1||!count(final[0][x.market]))continue;
   const actual=final[0][x.market],y=actual>x.line?"higher":actual<x.line?"lower":"push";
   const b=p=>sum(OUT.map(t=>(p[t]-Number(t===y))**2)),l=p=>-Math.log(Math.max(1e-8,p[y]));
   a.resolved++;a.games.add(x.gameId);a.dates.add(final[0].gameDate);a.rawBrier+=b(x.champion);a.candidateBrier+=b(x.candidate.probabilities);a.rawLogLoss+=l(x.champion);a.candidateLogLoss+=l(x.candidate.probabilities);
  }
 }
 return {kind:KIND,status:retrospective?"retrospective_original_quote_reconstruction":"original_frozen_only",byTierMarket:Object.fromEntries(Object.entries(by).map(([k,a])=>[k,{registered:a.registered,resolved:a.resolved,pending:a.registered-a.resolved,distinctGames:a.games.size,distinctDates:a.dates.size,rawBrier:a.resolved?a.rawBrier/a.resolved:null,candidateBrier:a.resolved?a.candidateBrier/a.resolved:null,rawLogLoss:a.resolved?a.rawLogLoss/a.resolved:null,candidateLogLoss:a.resolved?a.candidateLogLoss/a.resolved:null}])),rejected:reject,actualArchiveThresholds:true,actualPlatformSettlementVerified:false,calibrated:false,modelPromoted:false,retrospective,independentHistoricalFinalAvailabilityVerified:false};
}
module.exports={KIND,mass,candidate,freeze,score};
