'use strict';
// Add statistical namespaces to existing verified identity evidence. ESPN IDs are
// never interpreted as league-native IDs and these bridges never verify an offer.
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
module.exports={crosswalk};
