"use strict";
// Separate chronological multi-season trial. No post-outcome weights in 2026 replay.
const v2=require("./nhl-position-rate-matchup-v2.cjs"),{adapt}=require("./nhl-player-context-evidence.cjs"),{poisson}=require("./nhl-shot-block-tail-v2.cjs"),{bootstrapGameBrierDifference}=require("./nhl-period-count-model.cjs");
const GRID=[[0,0,0],[.25,0,0],[.5,0,0],[1,0,0],[0,.5,0],[.5,.25,0],[.75,.25,0],[.5,.25,.5],[1,.5,.5],[.5,.25,1]];
const LINES={shotsOnGoal:[1.5,2.5,3.5],goals:[.5,1.5],assists:[.5,1.5],points:[.5,1.5],blockedShots:[.5,1.5,2.5],hits:[.5,1.5,2.5],faceoffsWon:[5.5,7.5,9.5],powerPlayPoints:[.5,1.5]};
const finite=Number.isFinite,dt=Date.parse,cap=(x,a,b)=>Math.max(a,Math.min(b,x)),key=(...a)=>JSON.stringify(a),sum=a=>a.reduce((s,v)=>s+v,0),id=x=>key(x.gameId,x.playerId,x.market,x.line,x.tier);
function candidate(all,current,p){const a=v2.candidate(all,p),b=v2.candidate(current,p);if(!a)return null;const d=b?.position===a.position?b.defenseFactor:a.defenseFactor,o=b?.position===a.position?b.offenseFactor:a.offenseFactor;return {base:a.forecasts.usage,baseWithoutIceTimeAdjustment:sum(a.values)/a.values.length,priorPowerPlayEvidencePresent:(a.powerPlayTime?.knownGames??0)>=8,position:a.position,d,o,oldD:a.defenseFactor,oldO:a.offenseFactor,priorGames:a.priorGames,latestPriorDate:a.latestPriorDate,currentSeasonCovered:!!b};}
function estimate(p,w){const [d,o,mix]=w;return Math.max(0,p.base*cap(1+d*((1-mix)*(p.d-1)+mix*(p.oldD-1))+o*((1-mix)*(p.o-1)+mix*(p.oldO-1)),.70,1.30));}
function build(history,schedules,cutoff){
 const days=new Map(),all=v2.newState(),training={},test={},chosen={};let current=v2.newState(),season=null,priorRows=0;
 for(const s of schedules){for(const r of adapt(history,s,cutoff).rows){if(!LINES[r.market])continue;const a=days.get(r.gameDate)||[];a.push(r);days.set(r.gameDate,a);if(r.season==="2025-26")priorRows++;}}
 function pick(m){const a=training[m];if(!a||a.games.size<30||a.n<300)return 0;return a.loss.reduce((best,x,i)=>x<a.loss[best]-1e-9?i:best,0);}
 for(const [day,rows] of [...days].sort(([a],[b])=>a.localeCompare(b))){
  if(rows[0].season!==season){season=rows[0].season;current=v2.newState();if(season==="2026-27")for(const m of Object.keys(LINES))chosen[m]=pick(m);}
  for(const r of rows){const f=candidate(all,current,r);if(!f)continue;const lines=LINES[r.market],probs=GRID.map(w=>lines.map(l=>poisson(estimate(f,w),l)));
   if(season==="2025-26"){const a=training[r.market]??={n:0,games:new Set(),loss:GRID.map(()=>0)};a.n+=lines.length;a.games.add(r.gameId);for(let i=0;i<GRID.length;i++)for(let j=0;j<lines.length;j++)a.loss[i]+=(probs[i][j]-Number(r.value>lines[j]))**2;}
   else if(season==="2026-27"){const a=test[r.market]??={n:0,games:new Set(),baseline:0,challenger:0,diff:new Map(),currentSeasonCovered:0,gridLoss:GRID.map(()=>0),gridGame:GRID.map(()=>new Map()),iceTimeAblationLoss:0,iceTimeAblationGame:new Map(),priorPP:{present:{n:0,brier:0},absent:{n:0,brier:0}}};const selected=chosen[r.market]??0;a.games.add(r.gameId);a.currentSeasonCovered+=Number(f.currentSeasonCovered);for(let j=0;j<lines.length;j++){const y=Number(r.value>lines[j]),base=(probs[0][j]-y)**2,fit=(probs[selected][j]-y)**2;a.n++;a.baseline+=base;a.challenger+=fit;const z=a.diff.get(r.gameId)||{diff:0,n:0};z.diff+=fit-base;z.n++;a.diff.set(r.gameId,z);
   for(let i=0;i<GRID.length;i++){
    if(i===0){
     const noIce=poisson(estimate({...f,base:f.baseWithoutIceTimeAdjustment},GRID[selected]),lines[j]);
     const noIceErr=(noIce-y)**2,enhancedErr=(probs[selected][j]-y)**2;
     a.iceTimeAblationLoss+=noIceErr;
     const ig=a.iceTimeAblationGame.get(r.gameId)||{n:0,diff:0};
     ig.n++;ig.diff+=enhancedErr-noIceErr;
     a.iceTimeAblationGame.set(r.gameId,ig);
     const pp=f.priorPowerPlayEvidencePresent?a.priorPP.present:a.priorPP.absent;
     pp.n++;pp.brier+=enhancedErr;
    }
    const gridError=(probs[i][j]-y)**2,delta=gridError-base;
    a.gridLoss[i]+=gridError;
    const gg=a.gridGame[i].get(r.gameId)||{diff:0,n:0};
    gg.diff+=delta;gg.n++;a.gridGame[i].set(r.gameId,gg);
   }}}
  }
  v2.update(all,rows);v2.update(current,rows);
 }
 return {all,current,report:{kind:"nhl_position_multiseason_weight_trial_v3",cutoff,priorRows,chosen:Object.fromEntries(Object.keys(LINES).map(m=>[m,{gridIndex:chosen[m]??pick(m),weights:GRID[chosen[m]??pick(m)],trainingThresholds:training[m]?.n??0,trainingGames:training[m]?.games.size??0}])),holdout:Object.fromEntries(Object.entries(test).map(([m,a])=>[m,{thresholds:a.n,games:a.games.size,baselineBrier:a.baseline/a.n,challengerBrier:a.challenger/a.n,pairedGameCI:bootstrapGameBrierDifference([...a.diff.values()]),currentSeasonCovered:a.currentSeasonCovered,
   expectedIceTimeAdjustmentAblation:{
    enhancedBrier:a.challenger/a.n,
    rawPriorCountMeanBrier:a.iceTimeAblationLoss/a.n,
    enhancedMinusNoIceTimeBrier:(a.challenger-a.iceTimeAblationLoss)/a.n,
    pairedGameCI:bootstrapGameBrierDifference([...a.iceTimeAblationGame.values()]),
    unchangedPriorStatistics:true,historicalSyntheticThresholdsOnly:true
   },
   pregamePowerPlayUsageEvidenceStrata:Object.fromEntries(Object.entries(a.priorPP).map(([name,q])=>[
    name,{thresholds:q.n,enhancedBrier:q.n?q.brier/q.n:null}
   ])),
   pregamePPUnitCausalAblationNotAvailable:true,
   prespecifiedGridHoldout:GRID.map((weights,i)=>({
    weights,holdoutBrier:a.gridLoss[i]/a.n,
    modelMinusBaselineBrier:(a.gridLoss[i]-a.gridLoss[0])/a.n,
    pairedGameCI:bootstrapGameBrierDifference([...a.gridGame[i].values()]),
    baselineGridIndex:0,selectedAfterHoldout:false
   }))}])),selectionSeason:"2025-26",evaluationSeason:"2026-27",syntheticOnly:true,calibrated:false,modelPromoted:false}};
}
function freeze(s,prepared){const rows=[],seen=new Set();for(const p of s.individualPropSelections||[]){if(!LINES[p.market]||!finite(p.line)||p.line%1!==.5||!["Standard","Goblin","Demon"].includes(p.tier)||!["Higher","Lower"].includes(p.lean)||p.tier!=="Standard"&&p.lean!=="Higher"||!(dt(p.gameStartAt)-dt(s.generatedAt)>=900000)||!(dt(p.capturedAt)<=dt(s.generatedAt)&&dt(s.generatedAt)-dt(p.capturedAt)<=1800000)||seen.has(id(p)))continue;
 const raw=(s.rankedProps||[]).filter(x=>id(x)===id(p)&&x.lean===p.lean&&x.capturedAt===p.capturedAt);if(raw.length!==1||!finite(raw[0].probabilities?.higher))continue;
 const f=candidate(prepared.all,prepared.current,p),w=prepared.report.chosen[p.market];if(!f||!w||w.trainingGames<30||w.trainingThresholds<300)continue;
 seen.add(id(p));rows.push({gameId:p.gameId,playerId:p.playerId,market:p.market,tier:p.tier,line:p.line,side:p.lean,capturedAt:p.capturedAt,gameStartAt:p.gameStartAt,position:f.position,latestPriorDate:f.latestPriorDate,originalHigher:raw[0].probabilities.higher,baselineHigher:poisson(f.base,p.line),challengerHigher:poisson(estimate(f,w.weights),p.line),weights:w.weights});
 }return {kind:"nhl_position_multiseason_weight_trial_v3",generatedAt:s.generatedAt,rows,researchOnly:true,modelPromoted:false};}
module.exports={GRID,candidate,estimate,build,freeze};
