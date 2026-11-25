'use strict';
// Schedule corroboration only. Never infer calendar dates from provider identifiers.
const {key,target,localMatchup}=require('./pickfinder-public-nba-context.cjs');
const {classify,clockAt,ZONES}=require('./pickfinder-controlled-clock.cjs');
const dt=Date.parse, norm=x=>String(x??'').trim().toLowerCase();
const same=(a,b)=>!!a&&!!b&&['weekday','hour','minute','dayPeriod'].every(k=>a[k]===b[k]);
function nativeMatches(r,scopes,at){
 return scopes.filter(s=>s.sport===r.sport.toUpperCase()&&norm(s.name)===norm(r.player)&&norm(s.team)===norm(r.team)&&norm(s.opponent)===norm(r.opponent)&&s.homeAway===r.localMatchup?.homeAway&&s.identityReviewed===true&&s.eventReviewed===true&&s.rosterReviewed===true&&s.evidenceKind==='automated_native_schedule_roster_only'&&/^[a-f0-9]{64}$/.test(s.receiptDigest||'')&&Number.isFinite(dt(s.firstGitAt))&&dt(s.firstGitAt)<=at&&Number.isFinite(dt(s.startAt))&&dt(s.startAt)>dt(r.observedAt)&&dt(s.startAt)<=dt(r.observedAt)+7*86400000);
}
function recover(ctx,docs){
 const at=dt(ctx.preparedAt),scopes=ctx.identityScopes||[],groups=new Map(),sample={},rows=[],reasons={};
 for(const d of docs.filter(x=>x.schema==='pickfinder-controlled-clock-v1'))for(const r of d.records||[]){const k=key(r),a=groups.get(k)||[];a.push(r);groups.set(k,a);}
 const qualified=new Map();
 for(const a of groups.values()){
  const r=a[0],sport=r.sport,st=sample[sport]??={targets:0,matched:0,unresolved:0};st.targets++;
  const m=nativeMatches(r,scopes,at).filter(s=>a.every(x=>x.browserClock?.zone===x.requestedZone&&same(x.localMatchup,clockAt(s.startAt,x.requestedZone))));
  if(m.length!==1){st.unresolved++;continue;}
  const s=m[0],result=classify(a,{sport,providerEventId:r.eventId,nativeEventId:s.gameId,source:s.receiptDigest,team:r.team,opponent:r.opponent,homeAway:s.homeAway,startAt:s.startAt,independentReviewVerified:true});
  if(result!=='browser_local_matches_schedule'){st.unresolved++;continue;}
  st.matched++;const k=sport+'/'+r.eventId,old=qualified.get(k);if(old&&old!==s.startAt)qualified.set(k,null);else if(!qualified.has(k))qualified.set(k,s.startAt);
 }
 let attempts=0;
 for(const d of docs.filter(x=>x.schema==='pickfinder-public-nba-context-v1'))for(const r of d.records||[]){
  attempts++;const reject=k=>{reasons[k]=(reasons[k]||0)+1;};
  try{
   if(!r.routeVerified||!r.playerLabelVerified||!Number.isFinite(dt(r.observedAt))||dt(r.observedAt)>at||r.startAt||(r.displayedClocks||[]).length){reject('invalid_or_explicit_context');continue;}
   const local=localMatchup(r.displayedEvidence||[]),zone=r.browserClock?.zone;
   if(!local||local.team!==r.team||local.opponent!==r.opponent||!ZONES.includes(zone)){reject('missing_clock_metadata');continue;}
   const t=target({sport:r.sport,eventId:r.eventId,player:r.player,market:new URL(r.detailId,'https://www.pickfinder.app').searchParams.get('prop')?.split(':')[1],detailId:r.detailId});
   if(!t||key(t)!==key(r)){reject('invalid_identity');continue;}
   const verifiedSample=qualified.get(r.sport+'/'+r.eventId);
   if(!verifiedSample){reject('event_not_independently_sampled');continue;}
   const m=nativeMatches({...r,localMatchup:local},scopes,at).filter(s=>s.startAt===verifiedSample&&same(local,clockAt(s.startAt,zone)));
   if(m.length!==1){reject('missing_or_conflicting_native_scope');continue;}
   const s=m[0];rows.push({sport:r.sport,eventId:r.eventId,player:r.player,playerPath:r.playerPath,observedAt:r.observedAt,nativeGameId:s.gameId,nativePlayerId:s.playerId,nativeStartAt:s.startAt,nativeReceiptDigest:s.receiptDigest,clockCorroborated:true,sourceClockVerified:false,modelApproved:false});
  }catch{reject('invalid_record');}
 }
 return {rows,summary:{sample,attempts,corroboratedAttempts:rows.length,reasons,modelApproved:false,paidRequests:0}};
}
module.exports={recover,nativeMatches};
