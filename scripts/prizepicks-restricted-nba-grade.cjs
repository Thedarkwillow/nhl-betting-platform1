'use strict';
// Adapter only: restricted input/output stays in caller-controlled memory.
// Caller must supply a trusted store receipt verifier; local filesystem dates
// alone cannot establish prospective chronology. No API calls or app settlement.
const crypto=require('node:crypto');
const {official}=require('./grade-nba-frozen-research-v1.cjs');
const {gradePaper}=require('../src/nba-research-pipeline-v1.cjs');
const dt=Date.parse,digest=x=>crypto.createHash('sha256').update(x).digest('hex');
async function gradeFrame({archiveBytes,receipt,verifyReceipt,officialFinals,clock}){
 if(!Buffer.isBuffer(archiveBytes)||archiveBytes.length>8e6||typeof verifyReceipt!=='function'||!Number.isFinite(dt(clock)))throw Error('grading_configuration');
 const frameDigest=digest(archiveBytes),verified=await verifyReceipt(receipt,frameDigest);
 if(!verified||verified.digest!==frameDigest||!Number.isFinite(dt(verified.archivedAt))||dt(verified.archivedAt)>dt(clock))throw Error('archive_chronology_unverified');
 const frame=JSON.parse(archiveBytes);
 if(frame.kind!=='restricted_individual_forecast_v1'||frame.modelApproved!==false||frame.originalPlatformVerified!==false||!Array.isArray(frame.rows))throw Error('invalid_frame');
 const rows=[],seen=new Set();
 for(const p of frame.rows){
  if(p.sport!=='NBA'||p.restricted!==true||p.calibrated!==false||!p.team||!Number.isInteger(p.nativePlayerId)||!Number.isInteger(p.nativeGameId)||!Number.isFinite(p.line)||!['Higher','Lower'].includes(p.side)||!Number.isFinite(dt(p.forecastAt))||!Number.isFinite(dt(p.sourceObservedAt))||!Number.isFinite(dt(p.gameStartAt))||dt(p.sourceObservedAt)>dt(p.forecastAt)||dt(p.forecastAt)>dt(verified.archivedAt)||dt(verified.archivedAt)+900000>=dt(p.gameStartAt))continue;
  const k=JSON.stringify([p.nativeGameId,p.nativePlayerId,p.market,p.line,p.tier,p.side]);if(seen.has(k))continue;seen.add(k);
  const final=officialFinals.get(p.nativeGameId);
  if(!final||!Buffer.isBuffer(final.bytes)||final.bytes.length>4e6||!Number.isFinite(dt(final.observedAt))||dt(final.observedAt)>dt(clock))continue;
  let stat;try{stat=official(JSON.parse(final.bytes),p.nativeGameId,p.gameStartAt,final.observedAt)?.get(p.nativePlayerId);}catch{continue;}
  if(!stat||stat.team!==p.team)continue;
  const result=gradePaper({gameId:p.nativeGameId,playerId:p.nativePlayerId,market:p.market,line:p.line,offeredSide:p.side},stat);
  if(result==='pending')continue;
  rows.push({id:k,forecastDigest:frameDigest,modelRevision:p.modelRevision,result,actual:stat[p.market],estimate:p.rawConditionalEstimate,officialDigest:digest(final.bytes),officialObservedAt:final.observedAt});
 }
 return {kind:'restricted_nba_independent_grade_v1',rows,appSettlementVerified:false,calibrated:false,modelApproved:false};
}
module.exports={gradeFrame};
