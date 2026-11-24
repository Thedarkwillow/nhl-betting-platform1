"use strict";
/**
 * Paired original-line, first-Git research-only calibration trial scoring.
 * A raw probability and a precommitted fitted probability are evaluated on
 * the SAME originally selected side. No settlement or live-offer claim.
 */
const finite=Number.isFinite;
const safe=(p)=>finite(p)&&p>0&&p<1;
const loss=(p,y)=>-(y?Math.log(p):Math.log1p(-p));
function score(rows,{replicates=2000}={}){
 const unavailable=(reason)=>({status:reason,decided:0,distinctGames:0,distinctDates:0,
  rawBrier:null,adjustedBrier:null,rawLogLoss:null,adjustedLogLoss:null,
  gameEqualRawBrier:null,gameEqualAdjustedBrier:null,
  pairedGameCluster95:null,minimumEvidenceMet:false,calibrationApproved:false,
  payoutAdjustedEdgeVerified:false,modelPromoted:false});
 if(!Array.isArray(rows)||!Number.isInteger(replicates)||replicates<100||replicates>10000)
  return unavailable("invalid_paired_calibration_trial");
 const ids=new Set(),games=new Map(),dates=new Set(),gameDays=new Map();
 let raw=0,adj=0,rawLoss=0,adjLoss=0;
 for(const r of rows){
  if(typeof r?.id!=="string"||!r.id||ids.has(r.id)||
   (typeof r.gameId!=="string"&&!Number.isInteger(r.gameId))||
   typeof r.day!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(r.day)||
   !safe(r.raw)||!safe(r.adjusted)||![0,1].includes(r.y))
    return unavailable("invalid_duplicate_or_inconsistent_paired_rows");
  if(gameDays.has(String(r.gameId))&&gameDays.get(String(r.gameId))!==r.day)
   return unavailable("invalid_duplicate_or_inconsistent_paired_rows");
  gameDays.set(String(r.gameId),r.day);
  ids.add(r.id);dates.add(r.day);
  const b=(r.raw-r.y)**2,a=(r.adjusted-r.y)**2,
   g=games.get(r.gameId)||{n:0,raw:0,adjusted:0,diff:0};
  raw+=b;adj+=a;rawLoss+=loss(r.raw,r.y);adjLoss+=loss(r.adjusted,r.y);
  g.n++;g.raw+=b;g.adjusted+=a;g.diff+=a-b;games.set(r.gameId,g);
 }
 if(!ids.size)return unavailable("no_decided_original_line_calibration_trials");
 const n=ids.size,G=[...games.values()],m=G.length;
 const ci=()=>{
  if(m<10)return null;
  let seed=0x4ac915d7;const draws=[];
  for(let i=0;i<replicates;i++){
   let d=0,count=0;
   for(let j=0;j<m;j++){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const g=G[Math.floor(seed/4294967296*m)];
    d+=g.diff;count+=g.n;
   }
   draws.push(d/count);
  }
  draws.sort((a,b)=>a-b);
  return {lower:draws[Math.floor(.025*(replicates-1))],
   upper:draws[Math.ceil(.975*(replicates-1))],
   direction:"adjusted_minus_original_Brier_negative_favors_adjustment",
   unit:"NHL_independent_game_resampling",replicates};
 };
 const bound=ci(),enough=n>=100&&m>=30&&dates.size>=10;
 return {status:"paired_frozen_research_only",decided:n,distinctGames:m,
  distinctDates:dates.size,rawBrier:raw/n,adjustedBrier:adj/n,
  rawLogLoss:rawLoss/n,adjustedLogLoss:adjLoss/n,
  gameEqualRawBrier:G.reduce((s,g)=>s+g.raw/g.n,0)/m,
  gameEqualAdjustedBrier:G.reduce((s,g)=>s+g.adjusted/g.n,0)/m,
  pairedGameCluster95:bound,minimumEvidenceMet:enough,
  gameClusterEvidenceFavoringAdjustment:enough&&bound!==null&&bound.upper<0,
  enoughEvidenceForAutomaticRelease:false,calibrationApproved:false,
  payoutAdjustedEdgeVerified:false,modelPromoted:false,
  note:"Original frozen research probabilities, original selected direction and privately matched official NHL final stats only. Even favorable CI cannot establish authentic platform availability, settlement or ROI."};
}
module.exports={score};
