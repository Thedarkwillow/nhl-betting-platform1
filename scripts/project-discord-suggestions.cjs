'use strict';
// Transport only. This is not a model, offer verifier, or promotion pathway.
const {createHash}=require('node:crypto');
const {sports,books,tiers}=require('./project-discord-line-alerts.cjs');
const authorized=new WeakSet();
const digest=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const key=x=>typeof x==='string'&&/^[a-zA-Z0-9._:-]{1,96}$/.test(x);
const revision=x=>typeof x==='string'&&/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(x);
const label=(x,n)=>typeof x==='string'&&x===x.trim()&&x.length>0&&x.length<=n&&/^[\p{L}\p{M}\p{N} .,'’()+/&%:=-]+$/u.test(x);
const at=x=>typeof x==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(x)?Date.parse(x):NaN;
const M=60000;
const fresh=(t,now,minutes)=>t<=now&&now-t<=minutes*M;
const sportLabel={dota2:'Dota 2',valorant:'Valorant',lol:'LoL','college-basketball':'NCAAB','college-football':'NCAAF'};
function buildSuggestions(report,now){
 if(report?.kind!=='approved_individual_prop_research_v1'||report.researchOnly!==true||
  !fresh(at(report.generatedAt),now,15)||!Array.isArray(report.rows)||report.rows.length>2000)return [];
 const generated=at(report.generatedAt),result=new Map(),conflicts=new Set();
 for(const r of report.rows){
  const o=r?.offer,m=r?.model,q=r?.qualification;
  if(!o||!m||!q||!sports.has(o.sport)||!books.has(o.book)||!tiers.has(o.tier)||
   !key(o.providerOfferId)||!key(o.playerId)||!key(o.eventId)||!key(o.marketId)||!key(o.scope)||
   !label(o.player,44)||!label(o.opponent,28)||!label(o.market,34)||
   !['Higher','Lower'].includes(o.side)||!Number.isFinite(o.line)||Math.abs(o.line)>100000||
   o.originalPlatformVerified!==true||o.exactCurrentOfferVerified!==true||o.active!==true||
   o.playerIdentityVerified!==true||o.eventIdentityVerified!==true||o.gameStartVerified!==true||
   !digest(o.evidenceSha256)||!fresh(at(o.verifiedAt),now,15)||at(o.verifiedAt)>generated||
   !(at(o.gameStartAt)>now&&at(o.gameStartAt)-now<=24*60*M)||m.calibrated!==true||m.modelApproved!==true||
   !digest(m.calibrationEvidenceSha256)||!revision(m.modelRevision)||m.offerEvidenceSha256!==o.evidenceSha256||
   !Number.isFinite(m.projection)||Math.abs(m.projection)>100000||!Number.isFinite(m.probability)||m.probability<=0||m.probability>=1||
   !label(m.confidence,16)||!label(m.evidenceSummary,65)||!fresh(at(m.dataObservedAt),now,90)||at(m.dataObservedAt)>generated||
   q.individualResearchEligible!==true||q.existingGatesPassed!==true||q.offerEvidenceSha256!==o.evidenceSha256||q.calibrationEvidenceSha256!==m.calibrationEvidenceSha256||
   q.modelRevision!==m.modelRevision||
   !digest(q.reviewEvidenceSha256)||!fresh(at(q.reviewedAt),now,15)||at(q.reviewedAt)>generated||
   at(q.reviewedAt)<Math.max(at(o.verifiedAt),at(m.dataObservedAt)))continue;
  const id=createHash('sha256').update(JSON.stringify(['qualified-suggestion-v1',o.book,o.sport,o.eventId,o.playerId,o.marketId,o.scope,o.tier,o.line,o.side])).digest('hex');
  // One directional alert per exact line. Conflicting eligible inputs abstain together.
  const slot=JSON.stringify([o.book,o.sport,o.eventId,o.playerId,o.marketId,o.scope,o.tier,o.line]);
  const clock=m.dataObservedAt.slice(11,16)+'Z';
  const text=(sportLabel[o.sport]||o.sport.toUpperCase())+' · '+o.player+' vs '+o.opponent+' · '+o.market+
   ' '+o.side+' '+o.line+' · proj '+m.projection.toFixed(2)+' · '+(100*m.probability).toFixed(1)+
   '% est · '+m.confidence+' · data '+clock+' · '+m.evidenceSummary;
  if(result.has(slot)){
   const prior=result.get(slot);
   if(prior.id!==id||prior.text!==text||prior.offerEvidence!==o.evidenceSha256||prior.modelRevision!==m.modelRevision||prior.calibrationEvidence!==m.calibrationEvidenceSha256)conflicts.add(slot);
  }else result.set(slot,{id,kind:'suggestion',sport:o.sport,tier:o.tier,books:[o.book],
   observedAt:o.verifiedAt,text,offerEvidence:o.evidenceSha256,modelRevision:m.modelRevision,calibrationEvidence:m.calibrationEvidenceSha256});
 }
 return [...result].filter(([slot])=>!conflicts.has(slot)).map(([,event])=>{
  Object.freeze(event.books);Object.freeze(event);authorized.add(event);return event;
 });
}
module.exports={buildSuggestions,isQualifiedSuggestion:event=>authorized.has(event)};
