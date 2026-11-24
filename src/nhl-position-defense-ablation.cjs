"use strict";
// Historical experiment only; no future prediction or model release.
const {adapt}=require("./nhl-player-context-evidence.cjs");
const MARKETS={shotsOnGoal:[1.5,2.5,3.5],points:[.5,1.5],assists:[.5,1.5],goals:[.5,1.5],blockedShots:[.5,1.5,2.5],faceoffsWon:[5.5,7.5,9.5]};
const avg=a=>a.reduce((s,x)=>s+x,0)/a.length;
const bound=(x,l,h)=>Math.max(l,Math.min(h,x));
function ablation(rows,market){
 const lines=MARKETS[market];if(!lines)return null;
 const days=new Map(),players=new Map(),defense=new Map(),league=new Map(),games=new Set(),dates=new Set();
 const valid=(rows||[]).filter(r=>r.market===market&&r.period==="full_game"&&r.sport==="NHL"&&r.officialFinal===true&&r.participated===true&&Number.isInteger(r.value)&&r.value>=0);
 const counts=new Map();for(const r of valid){const k=r.gameId+"|"+r.playerId;counts.set(k,(counts.get(k)||0)+1);}
 for(const r of valid){if(counts.get(r.gameId+"|"+r.playerId)!==1)continue;const a=days.get(r.gameDate)||[];a.push(r);days.set(r.gameDate,a);}
 const scores=Object.fromEntries(["last5","last10","recentForm","positionDefense","positionDefenseAndRecent"].map(k=>[k,{mae:0,brier:0,logLoss:0,correct:0}]));
 let n=0,thresholds=0,above=0;
 for(const [d,batch] of [...days].sort(([a],[b])=>a.localeCompare(b))){
  for(const r of batch){
   const p=(players.get(r.playerId)||[]).filter(x=>x.team===r.team).slice(-20);
   if(p.length<8)continue;
   // Prior observed position only, not the realized target game's position.
   const position=p.at(-1).position;if(!["C","LW","RW","D"].includes(position))continue;
   const a=(defense.get(r.opponent+"|"+position)||[]).slice(-10),lg=(league.get(position)||[]).slice(-320);
   if(a.length<5||lg.length<30)continue;
   const old=p.map(x=>x.value),base=avg(old.slice(-10)),recent=.6*avg(old.slice(-5))+.4*base,ref=avg(lg.flat());
   if(!(ref>0))continue;
   const ratio=bound(1+(avg(a.flat())/ref-1)*a.length/(a.length+15),.8,1.2);
   const estimates={last5:avg(old.slice(-5)),last10:base,recentForm:recent,positionDefense:base*ratio,positionDefenseAndRecent:recent*ratio};
   above+=lines.filter(line=>r.value>line).length;
   n++;games.add(r.gameId);dates.add(d);thresholds+=lines.length;
   for(const [k,mu] of Object.entries(estimates)){
    scores[k].mae+=Math.abs(r.value-mu);
    for(const line of lines){const hit=Number(r.value>line),v=old.filter(x=>Math.round(Math.max(0,x-avg(old)+mu))>line).length,q=(v+1)/(old.length+2);scores[k].brier+=(q-hit)**2;scores[k].logLoss-=Math.log(hit?q:1-q);scores[k].correct+=Number(Number(q>=.5)===hit);}
   }
  }
  // Entire day evaluated before updating player or team history.
  const clusters=new Map();
  for(const r of batch){
   const p=players.get(r.playerId)||[];p.push(r);players.set(r.playerId,p);
   if(!r.completeGame||!["C","LW","RW","D"].includes(r.position))continue;
   const k=JSON.stringify([r.opponent,r.position,r.gameId]),a=clusters.get(k)||[];a.push(r.value);clusters.set(k,a);
  }
  for(const [k,v] of clusters){const [opp,pos]=JSON.parse(k),key=opp+"|"+pos,a=defense.get(key)||[],l=league.get(pos)||[];a.push(v);l.push(v);defense.set(key,a);league.set(pos,l);}
 }
 return {market,appearances:n,distinctGames:games.size,distinctDates:dates.size,syntheticThresholds:thresholds,models:Object.fromEntries(Object.entries(scores).map(([k,v])=>[k,{mae:n?v.mae/n:null,brier:thresholds?v.brier/thresholds:null,logLoss:thresholds?v.logLoss/thresholds:null,descriptiveDirectionAccuracy:thresholds?v.correct/thresholds:null}])),syntheticDirectionBaselines:{alwaysHigher:thresholds?above/thresholds:null,alwaysLower:thresholds?(thresholds-above)/thresholds:null},roleFromPriorAppearance:true,actualOfferLines:false,conditionalOnAppearance:true,modelPromoted:false};
}
function study(history,schedule,cutoff){const {rows}=adapt(history,schedule,cutoff);return {kind:"nhl_position_defense_ablation_v1",markets:Object.keys(MARKETS).map(m=>ablation(rows,m)),researchOnly:true,historicalAsOfVerified:false};}
module.exports={ablation,study};
