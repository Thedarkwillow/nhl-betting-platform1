"use strict";
const ablation=require("./matchup-factor-ablation-v1.cjs");
const weightHoldout=require("./matchup-market-weight-holdout-v1.cjs");
// Chronological reconstruction on archived final stats, never original live
// offers or genuine prospective accuracy. Report paired cohorts only.
const {matchupSample,describeMatchup}=require("./nfl-partner-board-research.cjs");
const {SPECS,forecast}=require("../scripts/backtest-nfl-historical-stats.cjs");
const core=require("./nfl-dedicated-core-market-lab.cjs").SPEC,components=require("./nfl-dedicated-component-lab.cjs").SPECS;
const num=Number.isFinite,key=(...x)=>JSON.stringify(x);
function add(m,k,x){const a=m.get(k)||[];a.push(x);m.set(k,a);}
function study(weekly,schedule,teamWeekly=[]){
 const targetShare=require("./nfl-target-share-workload-v1.cjs"),teamTargets=targetShare.teamTargets(weekly,teamWeekly,schedule);
 const priority=require("./nfl-priority-volume-v1.cjs"),volume=priority.teamVolume(weekly,teamWeekly,schedule);
 const byMarketPosition={};
 for(const spec of SPECS.filter(s=>s.family!=="kicking")){
  const positions=spec.family==="passing"?["QB"]:spec.family==="rushing"?["QB","RB","FB","WR"]:spec.family==="receiving"?["RB","FB","WR","TE"]:["QB","RB","FB","WR","TE"];
  for(const position of positions){
   const rows=matchupSample(weekly,schedule,2027,1,spec,position),weeks=new Map(),history=[],byGame=new Map();
   for(const x of rows)add(weeks,key(x.y,x.w),x);
   const weights=weightHoldout.create(),broad=ablation.create();
   const direction={thresholds:0,baseWins:0,positionWins:0,combinedWins:0,alwaysHigher:0,alwaysLower:0};
   let n=0,positionN=0,positionBase=0,positionAdjusted=0,combinedBase=0,combinedPosition=0,combined=0;
   for(const group of weeks.values()){
    for(const r of group){
     if(r.y<2025)continue;
     const own=history.filter(x=>x.playerId===r.playerId&&x.team===r.team);
     if(own.length<12)continue;
     const base=forecast(own.map(x=>x.value))?.shrunk_last5;if(!num(base))continue;
     // Arbitrary threshold 0 is used only to compute descriptive averages;
     // no directional accuracy or probability is inferred from it.
     const c=describeMatchup(history,r.playerId,r.team,r.opponent,0,base,r.y);
     const p=c.positionShadow?.projection,h=c.combinedShadow?.projection;
     const workload=ablation.nflOpportunity(own,base);
     const depth=spec.id==="receiving_yards"?require("./nfl-receiving-depth-components-v1.cjs").components(own,history.filter(x=>x.y===r.y&&x.opponent===r.opponent)):null;
     const target=spec.family==="receiving"?targetShare.project(own.map(x=>({...x,teamTargets:teamTargets.get(key(x.y,x.w,x.team))?.targets})),[...teamTargets.entries()].filter(([k])=>{const [y,w,t]=JSON.parse(k);return t===r.team&&(y<r.y||y===r.y&&w<r.w)}).sort(([a],[b])=>{const x=JSON.parse(a),y=JSON.parse(b);return x[0]-y[0]||x[1]-y[1]}).map(([,v])=>v.targets)):null;
     const passVolume=spec.id==="passing_attempts"?priority.passingAttempts(own,volume,r.team,r.opponent,r.y,r.w):null;
     const receivingMatchup=spec.id==="receiving_yards"?priority.receiving(own,teamTargets,history,r.team,r.opponent,r.y,r.w):null;
     ablation.observe(broad,{base,actual:r.value,gameId:r.gameId,train:r.y<2026,lines:core[spec.id]?.lines||components[spec.id]?.lines||[],candidates:{...ablation.nflFactors(c,base),workload:workload?.projection,targetShare:target?.projection,receivingDepth:depth?.projection,passVolume:passVolume?.projection,receivingMatchup:receivingMatchup?.projection,positionCombined:p,headToHead:h}});
     n++;
     if(num(p)){positionN++;positionBase+=Math.abs(base-r.value);positionAdjusted+=Math.abs(p-r.value);}
     if(!num(p)||!num(h))continue;
     const b=Math.abs(base-r.value),a=Math.abs(p-r.value),m=Math.abs(h-r.value);
     weightHoldout.observe(weights,{base,position:p,combined:h,actual:r.value,gameId:r.gameId,train:r.y<2026,lines:core[spec.id]?.lines||components[spec.id]?.lines||[]});
     combinedBase+=b;combinedPosition+=a;combined+=m;
     for(const line of core[spec.id]?.lines||components[spec.id]?.lines||[]){const y=r.value>line;direction.thresholds++;direction.baseWins+=Number((base>line)===y);direction.positionWins+=Number((p>line)===y);direction.combinedWins+=Number((h>line)===y);direction.alwaysHigher+=Number(y);direction.alwaysLower+=Number(!y);}
     const g=byGame.get(r.gameId)||{n:0,diff:0};g.n++;g.diff+=m-a;byGame.set(r.gameId,g);
    }
    history.push(...group);
   }
   const groups=[...byGame.values()],combinedN=groups.reduce((s,g)=>s+g.n,0);
   byMarketPosition[spec.id+"|"+position]={eligible:n,independentFactorHoldout:ablation.summarize(broad),positionPaired:positionN,positionBaselineMAE:positionN?positionBase/positionN:null,positionMAE:positionN?positionAdjusted/positionN:null,learnedMatchupHoldout:weightHoldout.summarize(weights),combinedPaired:combinedN,syntheticDirection:direction,combinedDistinctGames:groups.length,combinedBaselineMAE:combinedN?combinedBase/combinedN:null,combinedPositionMAE:combinedN?combinedPosition/combinedN:null,combinedMAE:combinedN?combined/combinedN:null,gameWeightedCombinedMinusPositionMAE:groups.length?groups.reduce((s,g)=>s+g.diff/g.n,0)/groups.length:null};
  }
 }
 return {kind:"nfl_position_h2h_paired_replay_v1",byMarketPosition,retrospective:true,priorWeeksOnly:true,conditionalOnRecordedOpportunity:true,exactOriginalLines:false,calibrated:false,modelPromoted:false};
}
module.exports={study};
