"use strict";
// Distinct official-boxscore specialty designs. Historical synthetic
// thresholds only. Combo scenarios are same-game exact player-pair proxies,
// not an authenticated platform combo offer. All current-day rows withheld.
const {prizePicksGoalieFantasyScore}=require("./nhl-four-priority-markets.cjs");
const count=x=>Number.isInteger(x)&&x>=0;
const num=x=>typeof x==="number"&&Number.isFinite(x);
const mean=x=>x.reduce((a,b)=>a+b,0)/x.length;
const LINES={powerPlayPoints:[.5,1.5],plusMinus:[-.5,.5,1.5],goalieFantasyScore:[9.5,14.5,19.5],shotsOnGoalCombo:[4.5,6.5,8.5],goalsCombo:[.5,1.5,2.5],goalieSavesCombo:[39.5,49.5,59.5]};
const key=(...x)=>JSON.stringify(x);
const tail=(a,n)=>a.slice(-n);
const value=(g,m)=>m==="goalieFantasyScore"?prizePicksGoalieFantasyScore(g):g[m];
function shifted(a,mu,line,signed=false){
 const c=mean(a);return (1+a.filter(v=>{const x=Math.round(v-c+mu);return (signed?x:Math.max(0,x))>line;}).length)/(a.length+2);
}
function pairedMass(values,line,weights=values.map(()=>1)){
 if(!values.length||weights.length!==values.length||!weights.every(v=>num(v)&&v>0))return null;
 return (1+values.reduce((s,v,i)=>s+(v>line?weights[i]:0),0))/(2+weights.reduce((s,x)=>s+x,0));
}
function specialty(m,prior,line){
 const a=prior.filter(g=>num(value(g,m))).slice(-30);
 if(a.length<8)return null;
 const v=a.map(g=>value(g,m)),base=mean(v.slice(-10));
 if(m==="powerPlayPoints"){
  // Hurdle: shrink probability of a positive PP scoring event and estimate
  // positive count separately from prior games; requires explicit PP stats.
  if(!v.every(count))return null;
  const nonzero=v.filter(x=>x>0);if(!nonzero.length)return null;
  const active=(nonzero.length+1)/(v.length+2);
  return {base:shifted(v,base,line),candidate:line<0?1:active*(1+nonzero.filter(x=>x>line).length)/(nonzero.length+2)};
 }
 if(m==="plusMinus"){
  if(!v.every(Number.isInteger))return null;
  // Signed outcomes with separate negative/neutral/positive history;
  // shrink the recent distribution toward the player's longer baseline.
  return {base:shifted(v,base,line,true),candidate:.6*pairedMass(v.slice(-10),line)+.4*pairedMass(v,line)};
 }
 if(m==="goalieFantasyScore"){
  // Never infer win, shutout or starts. Resample fully scored official
  // component vectors together, reweighting by recent prior workload.
  const valid=a.filter(g=>count(g.saves)&&count(g.goalsAgainst)&&num(g.timeOnIceSeconds)&&g.timeOnIceSeconds>0);
  if(valid.length<8)return null;
  const scores=valid.map(g=>value(g,m)),workload=mean(valid.slice(-5).map(g=>g.timeOnIceSeconds));
  const weights=valid.map(g=>Math.max(.2,1-Math.abs(g.timeOnIceSeconds-workload)/3600));
  return {base:pairedMass(scores,line),candidate:pairedMass(scores,line,weights)};
 }
 return null;
}
function combo(a,b,line){
 // a,b are earlier exact same-game tuples, never independent marginal sums.
 const pairs=a.filter((x,i)=>num(x)&&num(b[i])).map((x,i)=>x);if(a.length!==b.length||a.length<8||pairs.length!==a.length)return null;
 const sums=a.map((v,i)=>v+b[i]),independent=a.flatMap(x=>b.map(y=>x+y));
 return {base:pairedMass(independent,line),candidate:pairedMass(sums,line)};
}
function study(history){
 const days=new Map(),seen=new Set(),dups=new Set(),rows=[];
 for(const p of Object.values(history?.players||{}))for(const g of p.games||[]){
  if(!["FINAL","OFF"].includes(g.gameState)||!Number.isInteger(g.gameId)||!Number.isInteger(g.playerId)||!/^\d{4}-\d{2}-\d{2}$/.test(g.gameDate||"")||!num(g.timeOnIceSeconds)||g.timeOnIceSeconds<=0)continue;
  const k=key(g.gameId,g.playerId);if(seen.has(k))dups.add(k);seen.add(k);rows.push(g);
 }
 for(const g of rows){if(dups.has(key(g.gameId,g.playerId)))continue;const a=days.get(g.gameDate)||[];a.push(g);days.set(g.gameDate,a);}
 const past=new Map(),pairPast=new Map(),out={};
 const add=(market,y,prob,gameId,date)=>{
  if(!prob||!num(prob.base)||!num(prob.candidate)||prob.base<0||prob.base>1||prob.candidate<0||prob.candidate>1)return;
  const a=out[market]??={n:0,games:new Set(),dates:new Set(),base:0,candidate:0};a.n++;a.games.add(gameId);a.dates.add(date);a.base+=(prob.base-y)**2;a.candidate+=(prob.candidate-y)**2;
 };
 for(const [day,batch] of [...days].sort(([a],[b])=>a.localeCompare(b))){
  const games=new Map(),updates=[];
  for(const g of batch){
   const e=games.get(g.gameId)||[];e.push(g);games.set(g.gameId,e);
   const p=past.get(g.playerId)||[];
   for(const m of ["powerPlayPoints","plusMinus","goalieFantasyScore"]){
    const y=value(g,m);if(!num(y)||(m==="goalieFantasyScore"?g.type!=="goalie":g.type!=="skater"))continue;
    for(const l of LINES[m])add(m,Number(y>l),specialty(m,p,l),g.gameId,day);
   }
  }
  // Track all historical same-event exact pairs with at most 30 past tuples.
  // Choose one deterministic pair per market/event by prior shared sample
  // count; the observed participants condition is explicitly acknowledged.
  for(const [gid,group] of games)for(const [market,field,role] of [["shotsOnGoalCombo","shotsOnGoal","skater"],["goalsCombo","goals","skater"],["goalieSavesCombo","saves","goalie"]]){
   const a=group.filter(g=>g.type===role&&count(g[field])).sort((x,y)=>x.playerId-y.playerId);
   const possibilities=[];
   for(let i=0;i<a.length;i++)for(let j=i+1;j<a.length;j++){
    const id=key(market,a[i].playerId,a[j].playerId),p=pairPast.get(id)||[];
    if(p.length>=8)possibilities.push({id,p,actual:a[i][field]+a[j][field]});
    updates.push({id,values:[a[i][field],a[j][field]]});
   }
   possibilities.sort((a,b)=>b.p.length-a.p.length||a.id.localeCompare(b.id));
   const best=possibilities[0];if(!best)continue;
   for(const l of LINES[market])add(market,Number(best.actual>l),combo(best.p.map(x=>x[0]),best.p.map(x=>x[1]),l),gid,day);
  }
  for(const g of batch){const a=past.get(g.playerId)||[];a.push(g);past.set(g.playerId,tail(a,60));}
  for(const x of updates){const a=pairPast.get(x.id)||[];a.push(x.values);pairPast.set(x.id,tail(a,30));}
 }
 return {kind:"nhl_dedicated_specialty_synthetic_lab_v1",markets:Object.fromEntries(Object.keys(LINES).map(m=>{const a=out[m];return [m,{thresholdEvaluations:a?.n||0,distinctGames:a?.games.size||0,distinctDates:a?.dates.size||0,baselineBrier:a?a.base/a.n:null,dedicatedBrier:a?a.candidate/a.n:null,status:a?"evaluated":"insufficient_exact_history"}]})),currentArchiveOnly:true,actualOfferLines:false,conditionalOnObservedAppearance:true,comboOfferIdentityVerified:false,goalieScoringRuleIndependentlyVerified:false,calibrated:false,modelPromoted:false};
}
module.exports={LINES,specialty,combo,study};
