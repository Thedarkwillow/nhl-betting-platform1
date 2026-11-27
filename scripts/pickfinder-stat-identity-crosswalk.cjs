'use strict';
// Add statistical namespaces to existing verified identity evidence. ESPN IDs are
// never interpreted as league-native IDs and these bridges never verify an offer.
const {createHash}=require('node:crypto');
const {indexReviews,teamCode}=require('./pickfinder-reviewed-game-context.cjs');
const dt=Date.parse,k=(...x)=>JSON.stringify(x),hash=x=>/^[a-f0-9]{64}$/.test(x||'');
const nflTeam=x=>({JAC:'JAX',WSH:'WAS',LA:'LAR',AZ:'ARI'}[x]||x);
const numeric=x=>/^\d+$/.test(String(x||''));
const profile=(sport,x)=>new RegExp('^/players/'+sport+'/[A-Za-z0-9_-]+$').test(x);
const valid=(h,at)=>hash(h.digest)&&Number.isFinite(dt(h.first))&&dt(h.first)<=at;
function crosswalk(durable,reviews,nflSeasons,clock){
 const at=dt(clock),out=[];
 if(!Number.isFinite(at))return out;
 const docs=reviews.filter(h=>valid(h,at));
 const trusted=indexReviews(docs.map(h=>h.doc),clock);
 for(const entry of trusted.values()){
  if(!entry)continue;
  const {r,g,signature}=entry;
  if(!profile('nba',r.playerPath)||!numeric(r.nbaPlayerId)||!numeric(r.espnPlayerId)||!/^\d{10}$/.test(g.nbaGameId||'')||
     !g.home||!g.away||g.home===g.away)continue;
  const h=docs.filter(h=>dt(h.first)<dt(g.scheduleStartAt)&&[r.observedAt,g.observedAt].every(t=>dt(t)<=dt(h.first)+999)&&
   indexReviews([h.doc],clock).get(k(g.eventId,r.playerPath))?.signature===signature).sort((a,b)=>dt(a.first)-dt(b.first))[0];
  if(!h)continue;
  const conflicts=durable.rows.filter(x=>x.sport==='nba'&&x.namespace==='espn:nba'&&x.sourceEventId===g.eventId&&x.sourcePlayerPath===r.playerPath);
  if(conflicts.some(x=>String(x.playerId)!==String(r.espnPlayerId)||String(x.eventId)!==String(g.espnGameId)||
    dt(x.startAt)!==dt(g.scheduleStartAt)||teamCode(x.team)!==r.team||teamCode(x.opponent)!==r.opponent))continue;
  out.push({sport:'nba',namespace:'nba:official',sourcePlayer:r.player,sourcePlayerPath:r.playerPath,sourceEventId:g.eventId,
   playerId:String(r.nbaPlayerId),eventId:g.nbaGameId,startAt:g.scheduleStartAt,team:r.team,opponent:r.opponent,
   proofAvailableAt:h.first,nativeReceiptDigest:h.digest,crosswalkReceiptDigest:h.digest,evidenceKind:'independent_nba_schedule_and_roster_review'});
 }
 for(const r of durable.rows){
  if(r.sport!=='nfl'||r.namespace!=='espn:nfl'||!profile('nfl',r.sourcePlayerPath)||!numeric(r.playerId)||!hash(r.nativeReceiptDigest)||
    ![dt(r.startAt),dt(r.proofAvailableAt)].every(Number.isFinite)||dt(r.proofAvailableAt)>=dt(r.startAt)||dt(r.proofAvailableAt)>at)continue;
  const start=dt(r.startAt),team=nflTeam(r.team),opponent=nflTeam(r.opponent);
  if(!team||!opponent||team===opponent)continue;
  for(const h of nflSeasons){
   if(!valid(h,at)||h.doc.kind!=='nflverse_public_native_history_v1')continue;
   const games=(h.doc.games||[]).filter(g=>String(g.espnEventId)===String(r.eventId)&&dt(g.startAt)===start&&
    [g.home,g.away].sort().join('|')===[team,opponent].sort().join('|'));
   if(games.length!==1)continue;
   const [g]=games,roster=(h.doc.rosters||[]).filter(p=>p.week===g.week&&String(p.espnId)===String(r.playerId)&&p.team===team);
   if(roster.length!==1||!/^00-\d{7}$/.test(roster[0].gsisId)||!g.gameId)continue;
   out.push({...r,namespace:'nfl:gsis',playerId:roster[0].gsisId,eventId:g.gameId,team,opponent,
     proofAvailableAt:new Date(Math.max(dt(h.first),dt(r.proofAvailableAt))).toISOString(),
     crosswalkReceiptDigest:h.digest,evidenceKind:'independent_nflverse_schedule_and_weekly_roster'});
  }
 }
 const seen=new Map(),bad=new Set();
 for(const r of out){
  const key=k(r.sport,r.sourcePlayerPath),prev=seen.get(key);
  if(prev&&prev.playerId!==r.playerId)bad.add(key);
  else if(!prev||dt(r.proofAvailableAt)<dt(prev.proofAvailableAt))seen.set(key,r);
 }
 return [...seen].filter(([key])=>!bad.has(key)).map(([,r])=>r);
}
// Reuse independently confirmed person IDs for statistical replay only. These
// dated receipts never substitute for a current game, market time or settlement.
function reviewedStatIdentities(known,durable,clock){
 const ns={nba:'nba:official',nhl:'nhl:official',nfl:'nfl:gsis'};
 const norm=x=>String(x??'').normalize('NFKC').trim().toLowerCase();
 const at=dt(clock),all=new Map(),conflicts=new Set();
 if(!Number.isFinite(at))return [];
 const verified=[...(durable.rows||[]),...(durable.statisticalCrosswalks||[])];
 for(const h of known){
  if(!valid(h,at)||h.doc.kind!=='pickfinder_historical_reviewed_identity_v1')continue;
  for(const r of h.doc.rows||[]){
   const e=r.identityEvidence,s=r.sport,id=String(r.nativePlayerId??''),path=r.profilePath,name=norm(r.sourcePlayer);
   if(!ns[s]||!profile(s,path)||!name||r.independentReviewVerified!==true||r.modelApproved!==false||
    !(s==='nfl'?/^00-\d{7}$/:/^\d+$/).test(id)||
    !e||!hash(r.identityEvidenceSha256)||createHash('sha256').update(JSON.stringify(e)).digest('hex')!==r.identityEvidenceSha256||
    String(e.nativePlayerId)!==id||norm(e.name)!==name||!hash(e.nativeRoster)||!hash(e.rosterProof)||!hash(e.boardManifest)||
    !Array.isArray(r.nativeDigests)||!r.nativeDigests.length||!r.nativeDigests.every(hash)||
    !Array.isArray(r.profileDigests)||!r.profileDigests.length||!r.profileDigests.every(hash))continue;
   const observed=[e.boardObservedAt,e.rosterObservedAt,r.verifiedAt].map(dt),available=dt(h.first);
   if(observed.some(t=>!Number.isFinite(t)||t>available+999||t>at)||Math.max(...observed.slice(0,2))>observed[2])continue;
   let u;try{u=new URL(e.providerDetail,'https://www.pickfinder.app');}catch{continue;}
   if(u.origin!=='https://www.pickfinder.app'||u.pathname!==path||u.hash||[...u.searchParams.keys()].join(',')!=='prop'||
    u.searchParams.get('prop')?.split(':')[2]!==e.providerEvent)continue;
   const key=k(s,path),prev=all.get(key);
   if(prev&&(prev.playerId!==id||norm(prev.sourcePlayer)!==name)||verified.some(x=>x.namespace===ns[s]&&x.sourcePlayerPath===path&&String(x.playerId)!==id)){conflicts.add(key);continue;}
   if(!prev||available<dt(prev.proofAvailableAt))all.set(key,{sport:s,namespace:ns[s],sourcePlayer:r.sourcePlayer,
    sourcePlayerPath:path,playerId:id,proofAvailableAt:new Date(Math.max(available,observed[2])).toISOString(),
    nativeReceiptDigest:h.digest,identityEvidenceSha256:r.identityEvidenceSha256,evidenceKind:'archived_independently_reviewed_player_identity'});
  }
 }
 return [...all].filter(([key])=>!conflicts.has(key)).map(([,r])=>r);
}
module.exports={crosswalk,reviewedStatIdentities};
