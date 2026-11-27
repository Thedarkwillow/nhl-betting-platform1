'use strict';
// Native individual projections and archived offer research. No network, no paid requests.
// An old offer is a historical reference, never a current executable offer.
const {fromArchive}=require('./prizepicks-native-context-readiness.cjs');
const {git}=require('./pickfinder-public-evidence-audit.cjs');
const {read}=require('./pickfinder-public-archive.cjs');
const {target,key:contextKey,localMatchup}=require('./pickfinder-public-nba-context.cjs');
const {project,pickfinderProject}=require('./prizepicks-multisport-model-bridge.cjs');
const nhl=require('../src/projections.cjs');
const clockRepair=require('./pickfinder-clock-reconciliation.cjs');
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
function reconcileLocal(r,ctx,diagnose=()=>{},expectedKind='automated_native_schedule_roster_history'){
 const fail=reason=>{diagnose(reason);return null;};
 const at=Date.parse(ctx.preparedAt),observed=Date.parse(r.observedAt);
 if(r.state!=='context_incomplete'||r.startAt)return fail('not_incomplete_local_context');
 if(r.routeVerified!==true||r.playerLabelVerified!==true)return fail('unverified_profile');
 if(!Number.isFinite(observed)||observed>at||at-observed>6*3600000)return fail('invalid_or_stale_observation');
 if((r.displayedClocks||[]).length)return fail('explicit_clock_present'); // do not override conflicting explicit evidence
 const local=localMatchup(r.displayedEvidence||[]);
 if(!local||local.team!==r.team||local.opponent!==r.opponent)return fail('missing_or_conflicting_matchup');
 const parsed=target({sport:r.sport,eventId:r.eventId,player:r.player,market:new URL(r.detailId,'https://www.pickfinder.app').searchParams.get('prop')?.split(':')[1],detailId:r.detailId});
 if(!parsed||contextKey(parsed)!==contextKey(r))return fail('invalid_source_identity');
 const matches=ctx.scopes.filter(s=>s.sport===r.sport.toUpperCase()&&norm(s.name)===norm(r.player)&&norm(s.team)===norm(r.team)&&norm(s.opponent)===norm(r.opponent)&&s.identityReviewed===true&&s.eventReviewed===true&&s.rosterReviewed===true&&s.evidenceKind===expectedKind&&/^[a-f0-9]{64}$/.test(s.receiptDigest||'')&&Number.isFinite(Date.parse(s.firstGitAt))&&Date.parse(s.firstGitAt)<=at&&Date.parse(s.startAt)>Math.max(at+900000,observed));
 if(matches.length!==1)return fail(matches.length?'ambiguous_native_match':'no_eligible_native_match');
 const s=matches[0];
 return {sport:r.sport,eventId:r.eventId,player:r.player,playerPath:r.playerPath,team:r.team,opponent:r.opponent,observedAt:r.observedAt,localMatchup:local,nativeGameId:s.gameId,nativePlayerId:s.playerId,nativeStartAt:s.startAt,nativeReceiptDigest:s.receiptDigest,state:'native_schedule_candidate',sourceClockVerified:false,modelApproved:false};
}
// Separate roster-only matches from model-ready candidates; never upgrade eligibility.
function reconcileIdentityOnly(r,ctx){
 const scopes=(ctx.identityScopes||[]).filter(s=>s.evidenceKind==='automated_native_schedule_roster_only'&&s.historyVerified===false&&s.nativeNamespace);
 const c=reconcileLocal(r,{...ctx,scopes},()=>{},'automated_native_schedule_roster_only');
 if(!c)return null;
 const matched=scopes.filter(s=>s.sport===c.sport.toUpperCase()&&String(s.gameId)===String(c.nativeGameId)&&String(s.playerId)===String(c.nativePlayerId)&&s.receiptDigest===c.nativeReceiptDigest);
 if(matched.length!==1||matched[0].homeAway!==c.localMatchup.homeAway)return null;
 return {...c,state:'native_roster_only_candidate',nativeNamespace:matched[0].nativeNamespace,historyVerified:false};
}
// Diagnostic offset evidence only: compare local weekday/time with independent native UTC.
// A common offset is not a verified display timezone or an exact source timestamp.
function clockAudit(rows){
 const events=new Map();
 for(const r of rows){const local=r.localMatchup,d=new Date(r.nativeStartAt),day=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(local?.weekday);if(day<0||!Number.isFinite(d.getTime())||!Number.isInteger(local.hour)||!Number.isInteger(local.minute))continue;
  const localMinute=day*1440+(local.hour%12+(local.dayPeriod==='PM'?12:0))*60+local.minute,utcMinute=d.getUTCDay()*1440+d.getUTCHours()*60+d.getUTCMinutes();
  const offset=((localMinute-utcMinute+5040+10080)%10080)-5040;
  const k=r.sport+'/'+r.eventId,a=events.get(k)||new Set();a.add(offset);events.set(k,a);
 }
 const histogram={};let conflicts=0,outsideRange=0;
 for(const a of events.values()){if(a.size!==1){conflicts++;continue;}const v=[...a][0];if(v< -720||v>840){outsideRange++;continue;}histogram[v]=(histogram[v]||0)+1;}
 return {distinctEvents:events.size,conflictingEvents:conflicts,outsideRange,offsetMinutesByEvent:histogram,sourceClockVerified:false};
}
function reconcileArchive(ctx,receipts){
 const bySport={},identityOnly=[],reasons={},groups=new Map(),counts={attempts:0,candidates:0,unresolved:0,conflicting:0};
 for(const doc of receipts.filter(x=>x.schema==='pickfinder-public-nba-context-v1'))for(const r of doc.records||[]){
  counts.attempts++;const sport=['nba','nhl','nfl'].includes(r.sport)?r.sport:'other',st=bySport[sport]||={attempts:0,historyCandidateAttempts:0,rosterOnlyAttempts:0,neitherAttempts:0,reasons:{}};st.attempts++;const reject=k=>{reasons[k]=(reasons[k]||0)+1;st.reasons[k]=(st.reasons[k]||0)+1;};let c=null;try{c=reconcileLocal(r,ctx,reject)}catch{reject('invalid_record');}
  if(!c){counts.unresolved++;let identity=null;try{identity=reconcileIdentityOnly(r,ctx);}catch{}if(identity){identityOnly.push(identity);st.rosterOnlyAttempts++;}else st.neitherAttempts++;continue;}
  st.historyCandidateAttempts++;
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
 const identityEvents=new Map();for(const r of [...candidates,...identityOnly]){const k=r.sport+'/'+r.eventId,a=identityEvents.get(k)||new Set();a.add(r.nativeStartAt);identityEvents.set(k,a);}
 const identityRows=[...new Map(identityOnly.filter(r=>identityEvents.get(r.sport+'/'+r.eventId).size===1).map(r=>[contextKey(r),r])).values()];
 return {counts,reasons,bySport,clockAudit:clockAudit([...candidates,...identityRows]),identityOnlyAttempts:identityOnly.length,identityOnlyUnique:identityRows.length,identityOnlyRows:identityRows,uniqueCandidates:candidates.length,eventConflicts:rows.length-candidates.length,rows:candidates,sourceClockVerified:false};
}

// Join exact archived offer references to candidate identities for diagnostics only.
function candidateOffers(ctx,reconciliation){
 const candidates=new Map(reconciliation.rows.map(r=>[contextKey(r),r]));
 const seen=new Set(),rows=[];
 for(const b of ctx.archive.latest||[])for(const o of b.offers||[]){
  const t=target(o),c=t&&candidates.get(contextKey(t));
  if(!c||!Number.isFinite(o.line)||!['higher','lower'].includes(norm(o.side))||!researchTier(o))continue;
  if(!Number.isFinite(Date.parse(o.observedAt))||Date.parse(o.observedAt)>Date.parse(ctx.preparedAt)||Date.parse(b.first)>Date.parse(ctx.preparedAt))continue;
  if(Number(new URL(o.detailId,'https://www.pickfinder.app').searchParams.get('prop').split(':')[3])!==o.line)continue;
  const k=JSON.stringify([b.digest,o.detailId,o.side,o.line,o.period,researchTier(o)]);if(seen.has(k))continue;seen.add(k);
  rows.push({sport:o.sport,book:o.book,sourceDetailId:o.detailId,sourceEventId:o.eventId,player:o.player,market:o.market,period:o.period,line:o.line,side:o.side,tier:researchTier(o),sourceObservedAt:o.observedAt,nativeGameId:c.nativeGameId,nativePlayerId:c.nativePlayerId,nativeStartAt:c.nativeStartAt,sourceClockVerified:false,modelApproved:false,probability:null});
 }
 return rows;
}
function clockOfferContext(o,clockRows,at){
 const t=target(o);if(!t)return null;
 const a=clockRows.filter(r=>contextKey(r)===contextKey(t)&&r.clockCorroborated===true&&Date.parse(r.observedAt)<=at&&Date.parse(r.nativeStartAt)>at+900000);
 const signatures=new Set(a.map(r=>JSON.stringify([r.nativeGameId,r.nativePlayerId,r.nativeStartAt,r.team,r.opponent])));
 if(signatures.size!==1)return null;
 const r=a.sort((x,y)=>Date.parse(y.observedAt)-Date.parse(x.observedAt))[0];
 if(!r.team||!r.opponent||Date.parse(o.observedAt)>=Date.parse(r.nativeStartAt))return null;
 const prop=new URL(o.detailId,'https://www.pickfinder.app').searchParams.get('prop')?.split(':');
 if(prop?.length!==4||Number(prop[3])!==o.line)return null;
 return {...r,startAt:r.nativeStartAt};
}
function generate(ctx,receipts=[],reviewedHistory=null){
 const reconciliation=reconcileArchive(ctx,receipts);
 const clockRecovery=clockRepair.recover(ctx,receipts);
 reconciliation.clockRecovery=clockRecovery.summary;
 reconciliation.clockRecoveredRows=clockRecovery.rows;
 const contexts=new Map();for(const doc of receipts.filter(x=>x.schema==='pickfinder-public-nba-context-v1'))for(const r of doc.records||[]){if(r.state!=='explicit_context_observed'||r.routeVerified!==true||r.playerLabelVerified!==true||!r.team||!r.opponent||!Number.isFinite(Date.parse(r.startAt))||!Number.isFinite(Date.parse(r.observedAt))||Date.parse(r.observedAt)>Date.parse(ctx.preparedAt)||Date.parse(r.startAt)<=Date.parse(ctx.preparedAt)+900000)continue;const k=contextKey(r),a=contexts.get(k)||[];a.push(r);contexts.set(k,a);}

 const clock=ctx.preparedAt,at=Date.parse(clock),native=[],rows=[],excluded={},modelScopeByMarket={};
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
   const explicit=e.sort((a,b)=>Date.parse(b.observedAt)-Date.parse(a.observedAt))[0];
   const corroborated=clockOfferContext(o,clockRecovery.rows,at);
   if(explicit&&corroborated&&(Date.parse(explicit.startAt)!==Date.parse(corroborated.startAt)||norm(explicit.team)!==norm(corroborated.team)||norm(explicit.opponent)!==norm(corroborated.opponent))){reject('conflicting_recovered_context');continue;}
   const recovered=explicit||corroborated;
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
   const s=a[0],result=pickfinderProject(o,s,clock),p=result.prediction;
   if(!p){reject('model_scope');const k=JSON.stringify([o.sport,o.market,o.period??null,result.reason]);modelScopeByMarket[k]=(modelScopeByMarket[k]||0)+1;continue;}
   const key=JSON.stringify([b.digest,o.detailId,o.eventId,o.market,o.period,o.line,side,tier]);if(seen.has(key))continue;seen.add(key);
   const q=p.probabilities;
   const reviewedHistoryPair=reviewedHistory?require('./pickfinder-reviewed-history-model.cjs').compareOffer({...o,side},s,reviewedHistory,clock,b.first,p):null;
   rows.push({sport:s.sport,book:b.m.book,player:s.name,playerId:s.playerId,gameId:s.gameId,team:s.team,opponent:s.opponent,startAt:s.startAt,market:p.metric,line:o.line,side,tier,sourceTier:o.tier,platformTierVerified:false,projection:p.projection,probability:q?q[side.toLowerCase()]:null,pushProbability:q?.push??null,priorObservations:p.prior,method:p.method,sourceObservedAt:o.observedAt,contextObservedAt:recovered?.observedAt??null,clockCorroborated:!!corroborated,sourceClockVerified:false,researchOnly:true,forecastAt:clock,manifestDigest:b.digest,sourceEventId:o.eventId,sourceDetailId:o.detailId,...(reviewedHistoryPair&&{reviewedHistoryPair}),historyDigests:s.historyDigests,modelRevision:ctx.revision,offerFresh:at-Date.parse(o.observedAt)<=300000,originalPlatformVerified:false,calibrated:false,modelApproved:false,expectedValue:null});
  }
 }
 return {kind:'native_individual_research_v1',generatedAt:clock,modelRevision:ctx.revision,native,rows,excluded,modelScopeByMarket,reconciliation,candidateOffers:candidateOffers(ctx,reconciliation),paidRequests:0,modelApproved:false};
}
module.exports={generate,researchTier,reconcileLocal,reconcileArchive,candidateOffers,reconcileIdentityOnly,clockAudit,clockOfferContext};
if(require.main===module){
 const root=process.cwd(),clock=new Date().toISOString(),revision=git(root,['rev-parse','HEAD']);
 const {committedProfiles}=require('./pickfinder-archived-model-inputs.cjs');
 const {fromArchive:reviewedFromArchive}=require('./pickfinder-native-history-reconciliation.cjs');
 const reviewedHistory=reviewedFromArchive(root,committedProfiles(root),clock).reviewedCache;
 const out=generate(fromArchive(root,clock,revision),read(root,'directory'),reviewedHistory);
fs.mkdirSync('individual-research',{recursive:true});fs.writeFileSync('individual-research/forecasts.json',JSON.stringify(out,null,2));console.log(JSON.stringify({native:out.native.length,offers:out.rows.length,reviewedHistoryComparisons:out.rows.filter(r=>r.reviewedHistoryPair).length,candidateOfferReferences:out.candidateOffers.length,excluded:out.excluded,modelScopeByMarket:out.modelScopeByMarket,reconciliation:{...out.reconciliation,rows:undefined,identityOnlyRows:undefined,clockRecoveredRows:undefined}}));}
