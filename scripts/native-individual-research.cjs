'use strict';
// Native individual projections and archived offer research. No network, no paid requests.
// An old offer is a historical reference, never a current executable offer.
const {fromArchive}=require('./prizepicks-native-context-readiness.cjs');
const {git}=require('./pickfinder-public-evidence-audit.cjs');
const {read}=require('./pickfinder-public-archive.cjs');
const {target,key:contextKey,localMatchup}=require('./pickfinder-public-nba-context.cjs');
const {project}=require('./prizepicks-multisport-model-bridge.cjs');
const nhl=require('../src/projections.cjs');
const fs=require('node:fs');
const norm=x=>typeof x==='string'?x.trim().toLowerCase():'';
// Legacy browser collector emits null for an isolated ordinary book badge.
// This is a research classification, not independently verified platform tier.
function researchTier(o){
 const tier=norm(o.tier);
 if(['standard','goblin','demon'].includes(tier))return tier;
 if(o.tier===null&&o.source==='pickfinder_premium'&&['prizepicks','underdog'].includes(o.book)&&typeof o.displayedPrice==='string'&&/^[+-]\d{2,4}$/.test(o.displayedPrice)&&Math.abs(Number(o.displayedPrice))>=100)return 'standard';
 return null;
}

// Candidate-only reconciliation: native schedule supplies UTC, never the local label.
// Without documented source timezone this is NOT an independently verified source clock.
function reconcileLocal(r,ctx){
 const at=Date.parse(ctx.preparedAt),observed=Date.parse(r.observedAt);
 if(r.state!=='context_incomplete'||r.routeVerified!==true||r.playerLabelVerified!==true||r.startAt||!Number.isFinite(observed)||observed>at||at-observed>6*3600000)return null;
 if((r.displayedClocks||[]).length)return null; // do not override conflicting explicit evidence
 const local=localMatchup(r.displayedEvidence||[]);
 if(!local||local.team!==r.team||local.opponent!==r.opponent)return null;
 const parsed=target({sport:r.sport,eventId:r.eventId,player:r.player,market:new URL(r.detailId,'https://www.pickfinder.app').searchParams.get('prop')?.split(':')[1],detailId:r.detailId});
 if(!parsed||contextKey(parsed)!==contextKey(r))return null;
 const matches=ctx.scopes.filter(s=>s.sport===r.sport.toUpperCase()&&norm(s.name)===norm(r.player)&&norm(s.team)===norm(r.team)&&norm(s.opponent)===norm(r.opponent)&&s.identityReviewed===true&&s.eventReviewed===true&&s.rosterReviewed===true&&s.evidenceKind==='automated_native_schedule_roster_history'&&/^[a-f0-9]{64}$/.test(s.receiptDigest||'')&&Number.isFinite(Date.parse(s.firstGitAt))&&Date.parse(s.firstGitAt)<=at&&Date.parse(s.startAt)>Math.max(at+900000,observed));
 if(matches.length!==1)return null;
 const s=matches[0];
 return {sport:r.sport,eventId:r.eventId,player:r.player,playerPath:r.playerPath,team:r.team,opponent:r.opponent,observedAt:r.observedAt,localMatchup:local,nativeGameId:s.gameId,nativePlayerId:s.playerId,nativeStartAt:s.startAt,nativeReceiptDigest:s.receiptDigest,state:'native_schedule_candidate',sourceClockVerified:false,modelApproved:false};
}
function reconcileArchive(ctx,receipts){
 const groups=new Map(),counts={attempts:0,candidates:0,unresolved:0,conflicting:0};
 for(const doc of receipts.filter(x=>x.schema==='pickfinder-public-nba-context-v1'))for(const r of doc.records||[]){
  counts.attempts++;let c=null;try{c=reconcileLocal(r,ctx)}catch{}
  if(!c){counts.unresolved++;continue;}
  const k=contextKey(r),a=groups.get(k)||[];a.push(c);groups.set(k,a);
 }
 const rows=[];
 for(const a of groups.values()){
  if(new Set(a.map(x=>JSON.stringify([x.nativeGameId,x.nativePlayerId,x.nativeStartAt,x.team,x.opponent,x.localMatchup]))).size!==1){counts.conflicting+=a.length;continue;}
  counts.candidates+=a.length;rows.push(a.sort((x,y)=>Date.parse(y.observedAt)-Date.parse(x.observedAt))[0]);
 }
 // Exclude inconsistent provider-event to native-event associations across players.
 const eventMap=new Map();for(const r of rows){const k=r.sport+'/'+r.eventId,a=eventMap.get(k)||new Set();a.add(String(r.nativeGameId));eventMap.set(k,a);}
 const candidates=rows.filter(r=>eventMap.get(r.sport+'/'+r.eventId).size===1);
 return {counts,uniqueCandidates:candidates.length,eventConflicts:rows.length-candidates.length,rows:candidates,sourceClockVerified:false};
}

function generate(ctx,receipts=[]){
 const reconciliation=reconcileArchive(ctx,receipts);
 const contexts=new Map();for(const doc of receipts.filter(x=>x.schema==='pickfinder-public-nba-context-v1'))for(const r of doc.records||[]){if(r.state!=='explicit_context_observed'||r.routeVerified!==true||r.playerLabelVerified!==true||!r.team||!r.opponent||!Number.isFinite(Date.parse(r.startAt))||!Number.isFinite(Date.parse(r.observedAt))||Date.parse(r.observedAt)>Date.parse(ctx.preparedAt)||Date.parse(r.startAt)<=Date.parse(ctx.preparedAt)+900000)continue;const k=contextKey(r),a=contexts.get(k)||[];a.push(r);contexts.set(k,a);}

 const clock=ctx.preparedAt,at=Date.parse(clock),native=[],rows=[],excluded={};
 const reject=k=>{excluded[k]=(excluded[k]||0)+1;};
 for(const s of ctx.scopes.filter(s=>s.sport==='NHL')){
  const p=nhl.projectPlayer(s.history);
  for(const [market,v] of Object.entries(p.projections))if(v.ready&&Number.isFinite(v.estimate))native.push({sport:s.sport,player:s.name,playerId:s.playerId,gameId:s.gameId,team:s.team,opponent:s.opponent,startAt:s.startAt,market,projection:v.estimate,priorObservations:v.observations,model:p.model,historyDigests:s.historyDigests,forecastAt:clock,modelRevision:ctx.revision,modelApproved:false});
 }
 const seen=new Set();
 for(const b of ctx.archive.latest.filter(b=>['nhl','nfl'].includes(b.m.sport)&&['prizepicks','underdog'].includes(b.m.book))){
  if(Date.parse(b.first)>at)continue;
  for(const o of b.offers){
   const side=({higher:'Higher',lower:'Lower'})[norm(o.side)],tier=researchTier(o);
   if(!o.detailId||!o.eventId){reject('missing_source_ids');continue;}
   if(!Number.isFinite(o.line)){reject('invalid_threshold');continue;}
   if(!side){reject('invalid_direction');continue;}
   if(!['standard','goblin','demon'].includes(tier)){reject('invalid_tier');continue;}
   if(!Number.isFinite(Date.parse(o.observedAt))||Date.parse(o.observedAt)>at){reject('invalid_observation_clock');continue;}
   const t=target(o),e=t?contexts.get(contextKey(t))||[]:[];
   const signatures=new Set(e.map(r=>JSON.stringify([r.team,r.opponent,Date.parse(r.startAt)])));
   if(signatures.size>1){reject('conflicting_event_context');continue;}
   const recovered=e.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
   if(recovered&&o.startAt&&Date.parse(o.startAt)!==Date.parse(recovered.startAt)){reject('conflicting_event_clock');continue;}
   const startAt=o.startAt||recovered?.startAt;
   if(!Number.isFinite(Date.parse(startAt))){reject('missing_event_timestamp');continue;}
   if(Date.parse(startAt)<=at+900000){reject('event_started_or_too_close');continue;}
   const meta=b.researchObservations.filter(x=>x.detailId===o.detailId&&x.observedAt===o.observedAt&&x.origin==='board');
   const values=k=>[...new Set(meta.filter(x=>x.metric===k).map(x=>norm(x.value)).filter(Boolean))];
   const teams=[...new Set([...values('Team'),...(recovered?[norm(recovered.team)]:[])])],opponents=[...new Set([...values('Opponent'),...(recovered?[norm(recovered.opponent)]:[])])];
   if(teams.length!==1||opponents.length!==1){reject('missing_exact_team_context');continue;}
   const a=ctx.scopes.filter(s=>s.sport===b.m.sport.toUpperCase()&&norm(s.name)===norm(o.player)&&norm(s.team)===teams[0]&&norm(s.opponent)===opponents[0]&&Date.parse(s.startAt)===Date.parse(startAt));
   if(a.length!==1){reject('native_match');continue;}
   const s=a[0],p=project({sport:s.sport,stat:o.market,period:o.period,line:o.line,observedAt:clock},s,clock,{researchProbabilities:true});
   if(!p){reject('model_scope');continue;}
   const key=JSON.stringify([b.digest,o.detailId,o.eventId,o.market,o.period,o.line,side,tier]);if(seen.has(key))continue;seen.add(key);
   const q=p.probabilities;
   rows.push({sport:s.sport,book:b.m.book,player:s.name,playerId:s.playerId,gameId:s.gameId,team:s.team,opponent:s.opponent,startAt:s.startAt,market:p.metric,line:o.line,side,tier,sourceTier:o.tier,platformTierVerified:false,projection:p.projection,probability:q?q[side.toLowerCase()]:null,pushProbability:q?.push??null,priorObservations:p.prior,method:p.method,sourceObservedAt:o.observedAt,contextObservedAt:recovered?.observedAt??null,forecastAt:clock,manifestDigest:b.digest,sourceEventId:o.eventId,sourceDetailId:o.detailId,historyDigests:s.historyDigests,modelRevision:ctx.revision,offerFresh:at-Date.parse(o.observedAt)<=300000,originalPlatformVerified:false,calibrated:false,modelApproved:false,expectedValue:null});
  }
 }
 return {kind:'native_individual_research_v1',generatedAt:clock,modelRevision:ctx.revision,native,rows,excluded,reconciliation,paidRequests:0,modelApproved:false};
}
module.exports={generate,researchTier,reconcileLocal,reconcileArchive};
if(require.main===module){const root=process.cwd(),clock=new Date().toISOString(),out=generate(fromArchive(root,clock,git(root,['rev-parse','HEAD'])),read(root,'directory'));fs.mkdirSync('individual-research',{recursive:true});fs.writeFileSync('individual-research/forecasts.json',JSON.stringify(out,null,2));console.log(JSON.stringify({native:out.native.length,offers:out.rows.length,excluded:out.excluded,reconciliation:{...out.reconciliation,rows:undefined}}));}
