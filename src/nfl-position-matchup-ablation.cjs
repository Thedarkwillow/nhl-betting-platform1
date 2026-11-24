"use strict";
// Research only. Compare same-position prior-week player appearances against
// an opponent. No ranking is claimed from an incomplete appearance cohort.
const {adapt}=require("./nfl-player-context-evidence.cjs");
const {SPEC}=require("./nfl-dedicated-core-market-lab.cjs");
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const pos=new Set(["QB","RB","WR","TE","FB"]);
const clamp=(v,l,h)=>Math.max(l,Math.min(h,v));
function study(weekly,schedule,cutoff){
 const rows=adapt(weekly,schedule,cutoff),games=new Map((schedule||[]).map(g=>[g.game_id,g])),batches=new Map();
 for(const r of rows){const g=games.get(r.gameId);if(!g||!pos.has(r.position)||!Number.isInteger(Number(g.week)))continue;
  const key=String(g.season)+"|"+String(g.week).padStart(2,"0"),a=batches.get(key)||[];a.push(r);batches.set(key,a);}
 const player=new Map(),defense=new Map(),league=new Map(),metrics={};
 for(const [week,batch] of [...batches].sort(([a],[b])=>a.localeCompare(b))){
  const season=week.split("|")[0];
  for(const r of batch){
   const s=SPEC[r.market],old=(player.get(r.playerId+"|"+r.market)||[]).filter(x=>x.team===r.team).slice(-12);
   if(old.length<5||!s)continue;
   const role=old.at(-1).position;if(!pos.has(role))continue;
   const k=season+"|"+r.market+"|"+role,opp=(defense.get(k+"|"+r.opponent)||[]).slice(-40),lg=(league.get(k)||[]).slice(-400);
   if(opp.length<10||new Set(opp.map(x=>x.gameId)).size<4||lg.length<60)continue;
   const ref=mean(lg.map(x=>x.value));if(!(ref>0))continue;
   const values=old.map(x=>x.value),base=mean(values.slice(-10)),ratio=clamp(1+(mean(opp.map(x=>x.value))/ref-1)*opp.length/(opp.length+40),.8,1.2);
   const m=metrics[r.market+"|"+role]??={n:0,thresholds:0,games:new Set(),weeks:new Set(),baselineMAE:0,adjustedMAE:0,baselineBrier:0,adjustedBrier:0};
   m.n++;m.games.add(r.gameId);m.weeks.add(week);m.baselineMAE+=Math.abs(r.value-base);m.adjustedMAE+=Math.abs(r.value-base*ratio);
   for(const line of s.lines){const y=Number(r.value>line);for(const [name,mu] of [["baselineBrier",base],["adjustedBrier",base*ratio]]){
    const hits=values.filter(v=>v-mean(values)+mu>line).length,q=(hits+1)/(values.length+2);m[name]+=(q-y)**2;
   }m.thresholds++;}
  }
  // embargo the entire NFL week, including early and late games.
  for(const r of batch){const pk=r.playerId+"|"+r.market,k=season+"|"+r.market+"|"+r.position,dk=k+"|"+r.opponent;
   for(const [map,id] of [[player,pk],[defense,dk],[league,k]]){const a=map.get(id)||[];a.push(r);map.set(id,a);}}
 }
 return {kind:"nfl_position_matchup_ablation_v1",markets:Object.fromEntries(Object.entries(metrics).map(([k,m])=>[k,{appearances:m.n,distinctGames:m.games.size,distinctWeeks:m.weeks.size,syntheticThresholds:m.thresholds,baselineMAE:m.baselineMAE/m.n,adjustedMAE:m.adjustedMAE/m.n,baselineBrier:m.thresholds?m.baselineBrier/m.thresholds:null,adjustedBrier:m.thresholds?m.adjustedBrier/m.thresholds:null}])),priorWeekEmbargo:true,conditionalOnObservedOffensiveOpportunity:true,completeDefenseRanking:false,actualOfferLines:false,modelPromoted:false};
}
module.exports={study};
