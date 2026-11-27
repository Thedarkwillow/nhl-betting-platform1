'use strict';
// Rebuild current crosswalks from immutable receipts at their original pregame cutoff.
// A historical confirmation remains reusable identity evidence, never a fresh forecast.
const {build:buildNative}=require('./prizepicks-native-context-readiness.cjs');
const {recover,profileContexts}=require('./pickfinder-clock-reconciliation.cjs');
const dt=Date.parse,key=(...x)=>JSON.stringify(x),DAY=86400000;
const hash=x=>/^[a-f0-9]{64}$/.test(x||'');
function replay({facts,controls,profiles,clock,revision}){
 const at=dt(clock),byEvent=new Map(),candidates=[],certifiedProfiles=profileContexts(profiles,clock).records;
 for(const f of controls){
  if(!hash(f.digest)||!Number.isFinite(dt(f.first))||dt(f.first)>at||f.doc.schema!=='pickfinder-controlled-clock-v1')continue;
  for(const r of f.doc.records||[]){
   if(!r.routeVerified||!r.playerLabelVerified||!Number.isFinite(dt(r.observedAt))||dt(r.observedAt)>dt(f.first)+999||dt(r.observedAt)>at)continue;
   const k=key(r.sport,r.eventId),a=byEvent.get(k)||[];
   a.push({...r,clockDigest:f.digest,clockAvailableAt:f.first});byEvent.set(k,a);
  }
 }
 // Each archived schedule/roster snapshot is replayed at its own committed
 // availability. We do not use live freshness to erase prior verified IDs.
 for(const f of facts){
  const c=dt(f.first),observed=dt(f.doc.observedAt),sport=f.doc.sport;
  if(!hash(f.digest)||!Number.isFinite(c)||c>at||observed>c||c-observed>3600000)continue;
  const relevant=[...byEvent.values()].filter(a=>a[0].sport===sport&&a.some(r=>Math.abs(dt(r.observedAt)-observed)<=DAY));
  if(!relevant.length)continue;
  const context=buildNative({facts:[f],nhlFinals:[],nflSeasons:[],archive:{invalid:[],latest:[]},clock:f.first,revision});
  const scopeByGame=new Map();
  for(const x of context.identityScopes){const k=key(x.nativeNamespace,x.gameId),a=scopeByGame.get(k)||[];a.push(x);scopeByGame.set(k,a);}
  for(const triplets of relevant){
   const grouped=new Map();
   for(const rec of triplets){
    const t=key(rec.detailId,rec.player),a=grouped.get(t)||[];a.push(rec);grouped.set(t,a);
   }
   for(const group of grouped.values()){
    const first=group[0],now=Math.max(c,...group.map(r=>dt(r.clockAvailableAt)));
    if(now>at||now-c>DAY)continue;
    const scoped=certifiedProfiles.filter(p=>p.sport===sport&&p.eventId===first.eventId&&dt(p.observedAt)<=now&&dt(p.sourceProfileAvailableAt)<=now);
    const scope=context.identityScopes.filter(x=>dt(x.startAt)>now);
    const r=recover({preparedAt:new Date(now).toISOString(),identityScopes:scope},[
     {schema:'pickfinder-controlled-clock-v1',records:group},
     {schema:'pickfinder-public-nba-context-v1',records:scoped}
    ]);
    for(const hit of r.qualifiedEvents){
     const profilesByRef=new Map(scoped.map(p=>[key(p.sourceProfileDigest,p.detailId),p]));
     const event={sport,sourceEventId:first.eventId,namespace:hit.scope.nativeNamespace,
      eventId:String(hit.scope.gameId),startAt:new Date(dt(hit.scope.startAt)).toISOString(),proofAvailableAt:new Date(now).toISOString(),
      nativeReceiptDigest:f.digest,timezoneReceiptDigests:[...new Set(group.map(x=>x.clockDigest))].sort()};
     if(!event.namespace||event.timezoneReceiptDigests.length!==3)continue;
     const rows=r.rows.map(x=>({...x,sourcePlayer:x.player,sourcePlayerPath:x.playerPath,
      profileDigest:x.sourceProfileDigest,detailId:x.sourceDetailId,...event,
      playerId:String(x.nativePlayerId),team:x.nativeTeam,opponent:x.nativeOpponent,
      sourceTeam:x.team,sourceOpponent:x.opponent,observedAt:profilesByRef.get(key(x.sourceProfileDigest,x.sourceDetailId))?.observedAt}));
     rows.push({...event,sourcePlayer:first.player,sourcePlayerPath:first.playerPath,detailId:first.detailId,
      playerId:String(hit.scope.playerId),team:hit.scope.team,opponent:hit.scope.opponent,sourceTeam:first.team,sourceOpponent:first.opponent});
     const nativePlayers=scopeByGame.get(key(event.namespace,event.eventId))||[];
     // A registry row must still resolve uniquely on the separately sourced roster.
     for(const row of rows)if(nativePlayers.filter(p=>String(p.playerId)===row.playerId&&p.team===row.team).length===1)candidates.push(row);
    }
   }
  }
 }
 const conflicts=new Set(),eventKeys=new Map(),identities=new Map(),rows=new Map();
 for(const r of candidates){
  const e=key(r.sport,r.sourceEventId,r.namespace),p=key(r.sport,r.sourcePlayerPath,r.namespace);
  for(const [m,k,v] of [[eventKeys,e,key(r.eventId,r.startAt)],[identities,p,r.playerId]]){
   if(m.has(k)&&m.get(k)!==v)conflicts.add(k);
   m.set(k,v);
  }
  const k=key(r.sport,r.sourceEventId,r.sourcePlayerPath,r.namespace,r.profileDigest??null,r.detailId);
  if(!rows.has(k)||dt(r.proofAvailableAt)<dt(rows.get(k).proofAvailableAt))rows.set(k,r);
 }
 const accepted=[...rows.values()].filter(r=>!conflicts.has(key(r.sport,r.sourceEventId,r.namespace))&&!conflicts.has(key(r.sport,r.sourcePlayerPath,r.namespace)));
 const events=new Map(),players=new Map(),aliases=new Map();
 for(const r of accepted){
  const {sport,sourceEventId,namespace,eventId,startAt,proofAvailableAt,nativeReceiptDigest,timezoneReceiptDigests}=r;
  const e=key(sport,sourceEventId,namespace);
  if(!events.has(e)||dt(proofAvailableAt)<dt(events.get(e).proofAvailableAt))events.set(e,{sport,sourceEventId,namespace,eventId,startAt,proofAvailableAt,nativeReceiptDigest,timezoneReceiptDigests});
  players.set(key(sport,r.sourcePlayerPath,namespace),{sport,sourcePlayerPath:r.sourcePlayerPath,sourcePlayer:r.sourcePlayer,namespace,playerId:r.playerId,receiptDigest:nativeReceiptDigest});
  for(const [sourceCode,nativeCode] of [[r.sourceTeam,r.team],[r.sourceOpponent,r.opponent]])if(sourceCode!==nativeCode){
   const a=key(sport,namespace,sourceCode),v=aliases.get(a);
   aliases.set(a,v===null||v&&v.nativeCode!==nativeCode?null:{sport,namespace,sourceCode,nativeCode,nativeReceiptDigest});
  }
 }
 return {rows:accepted,events:[...events.values()],players:[...players.values()],aliases:[...aliases.values()].filter(Boolean),conflicts:conflicts.size};
}
function qualifyResearch(independentFacts,durable,clock){
 const at=dt(clock),ns={nba:'nba:official',nhl:'nhl:official',nfl:'nfl:gsis'},identities=new Map(),out=[];
 const norm=x=>String(x||'').normalize('NFKC').trim().toLowerCase();
 for(const r of durable.rows){
  const k=key(r.sport,r.sourcePlayerPath,r.playerId),prev=identities.get(k);
  if(r.namespace!==ns[r.sport]||!hash(r.nativeReceiptDigest)||r.timezoneReceiptDigests?.length!==3||
     new Set(r.timezoneReceiptDigests).size!==3||!r.timezoneReceiptDigests.every(hash)||!Number.isFinite(dt(r.proofAvailableAt))||dt(r.proofAvailableAt)>at)continue;
  if(!prev||dt(r.proofAvailableAt)<dt(prev.proofAvailableAt))identities.set(k,r);
 }
 for(const x of independentFacts.values()){
  const path=require('./pickfinder-native-history-reconciliation.cjs').profilePath(x.sport,x.sourceDetailId);
  const id=identities.get(key(x.sport,path,x.playerId));
  const start=dt(x.officialStartAt),profile=dt(x.profileAvailableAt),native=dt(x.nativeAvailableAt),observed=dt(x.profileObservedAt);
  if(!id||norm(id.sourcePlayer)!==norm(x.sourcePlayer)||!hash(x.nativeDigest)||!hash(x.profileDigest)||
     ![start,profile,native,observed].every(Number.isFinite)||start>=native||start>=observed||observed>profile+999||
     Math.max(profile,native)>at||!Number.isFinite(x.value))continue;
  out.push({sport:x.sport,playerId:x.playerId,eventId:x.eventId,market:x.market,value:x.value,officialStartAt:x.officialStartAt,
   availableAt:new Date(Math.max(profile,native,dt(id.proofAvailableAt))).toISOString(),
   profileDigest:x.profileDigest,nativeDigest:x.nativeDigest,identityReceiptDigest:id.nativeReceiptDigest,
   timezoneReceiptDigests:id.timezoneReceiptDigests,evidenceKind:'verified_current_identity_and_independent_final_stat',
   shadowResearchEligible:true,productionModelEligible:false,operatorOfferVerified:false,settlementVerified:false});
 }
 return out;
}
module.exports={replay,qualifyResearch};
