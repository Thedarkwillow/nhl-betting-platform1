"use strict";
// Coherence of archived vectors, NOT directional ranking, fitting, or betting value.
const EPS=0.00005;
const at=x=>typeof x==="string"?Date.parse(x):NaN;
function auditFrames(frames){
 const result={kind:"nhl_original_alternate_probability_coherence_v1",frames:0,excludedFrames:0,comparedGroups:0,
  comparedAdjacentThresholds:0,invalidVectors:0,conflictingVectors:0,higherMonotonicityViolations:0,
  lowerMonotonicityViolations:0,byMarket:{},researchOnly:true,modelChanged:false,calibrationApproved:false};
 for(const f of frames){
  const s=f?.snapshot,g=at(s?.generatedAt),c=at(f?.firstCommittedAt);
  if(f?.gitHistoryCount!==1||!Number.isFinite(g)||!Number.isFinite(c)||Math.floor(c/1000)<Math.floor(g/1000)||!Array.isArray(s?.rankedProps)){
   result.excludedFrames++;continue;
  }
  result.frames++;
  const groups=new Map();
  for(const p of s.rankedProps){
   if(!Number.isInteger(p?.gameId)||!Number.isInteger(p?.playerId)||!p.market||!p.model||
    !Number.isFinite(p.projection)||!Number.isFinite(p.line)||p.line<0||
    !Number.isFinite(at(p.capturedAt))||at(p.capturedAt)>g||
    !Number.isFinite(at(p.eventStartsAt))||c>=at(p.eventStartsAt))continue;
   const v=p.probabilities;
   if(!v||![v.higher,v.lower,v.push].every(x=>Number.isFinite(x)&&x>=0&&x<=1)||
    Math.abs(v.higher+v.lower+v.push-1)>EPS){result.invalidVectors++;continue;}
   // Compare only within the same source observation, model, projection mean and distribution.
   // Period is retained; no cross-snapshot or cross-market comparison.
   const k=JSON.stringify([p.gameId,p.playerId,p.market,p.model,p.projection,p.capturedAt,p.period||null,v.distribution||null]);
   if(!groups.has(k))groups.set(k,{market:p.market,lines:new Map(),conflict:false});
   const group=groups.get(k),prior=group.lines.get(p.line);
   if(prior&&["higher","lower","push"].some(x=>Math.abs(prior[x]-v[x])>EPS)){group.conflict=true;result.conflictingVectors++;}
   else if(!prior)group.lines.set(p.line,v);
  }
  for(const group of groups.values()){
   if(group.conflict||group.lines.size<2)continue;
   const rows=[...group.lines.entries()].sort((a,b)=>a[0]-b[0]);
   result.comparedGroups++;
   const m=result.byMarket[group.market]??={adjacentThresholds:0,higherViolations:0,lowerViolations:0};
   for(let i=1;i<rows.length;i++){
    const a=rows[i-1][1],b=rows[i][1];
    result.comparedAdjacentThresholds++;m.adjacentThresholds++;
    if(b.higher>a.higher+EPS){result.higherMonotonicityViolations++;m.higherViolations++;}
    if(b.lower<a.lower-EPS){result.lowerMonotonicityViolations++;m.lowerViolations++;}
   }
  }
 }
 return {...result,interpretation:"A coherent probability curve is necessary but not evidence of accurate forecasts, calibration or profitable selection. Unsupported or differing model inputs are not compared."};
}
module.exports={auditFrames};
