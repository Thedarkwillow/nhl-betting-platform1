'use strict';
const review=require('../config/esports/pickfinder-series-review-2026-11-27.json');
const hash=x=>/^[a-f0-9]{64}$/.test(x||''),dt=Date.parse;
const ids=a=>Array.isArray(a)&&a.length===2&&new Set(a).size===2&&a.every(x=>/^[0-9]+$/.test(x));
function reconcile(receipts,clock,reviewed=review){
 const at=dt(clock),map=new Map(),bad=new Set(),facts=[];
 for(const {doc,digest,first} of receipts){
  if(!hash(digest)||doc.kind!=='opendota_index_detail_reconciliation_v1'||!hash(doc.indexDigest)||
    !Number.isFinite(dt(first))||dt(first)>at||!Number.isFinite(dt(doc.observedAt))||dt(doc.observedAt)>dt(first)+999)continue;
  for(const x of doc.finals||[]){
   const g=x.game,s=dt(g?.startAt),e=dt(g?.endAt),o=dt(x.observedAt);
   if(!g||g.provider!=='opendota'||g.title!=='DOTA2'||!/^[1-9][0-9]+$/.test(g.providerSeriesId??'')||!/^[0-9]+$/.test(g.providerGameId)||
     g.providerReportedFinal!==true||x.playerCount!==10||!ids(g.teamIds)||!g.teamIds.includes(g.winnerTeamId)||!hash(x.sourceDigest)||
     ![s,e,o].every(Number.isFinite)||s>=e||e>o||o>dt(doc.observedAt)||
     !Array.isArray(g.teamScores)||g.teamScores.length!==2||g.teamScores.some(n=>!Number.isSafeInteger(n)||n<0))continue;
   const record={game:g,digest},prior=map.get(g.providerGameId);
   if(prior&&JSON.stringify(prior.game)!==JSON.stringify(g))bad.add(g.providerGameId);
   if(!prior)map.set(g.providerGameId,record);
  }
 }
 for(const id of bad)map.delete(id);
 const seen=new Set(),used=new Set(),seenEvents=new Set(),badEvents=new Set(),series=[];
 if(Number.isFinite(dt(reviewed.reviewedAt))&&dt(reviewed.reviewedAt)<=at)
 for(const r of reviewed.series||[]){
  if(r.sport!=='dota2'||!r.sourceEventId||!ids(r.firstTwoValveMatchIds))continue;
  const [a,b]=r.firstTwoValveMatchIds.map(x=>map.get(x));
  if(!a||!b||a.game.providerSeriesId!==b.game.providerSeriesId||dt(a.game.endAt)>dt(b.game.startAt)||
    JSON.stringify([...a.game.teamIds].sort())!==JSON.stringify([...b.game.teamIds].sort()))continue;
  series.push({r,maps:[a,b]});
  if(seenEvents.has(r.sourceEventId))badEvents.add(r.sourceEventId);
  seenEvents.add(r.sourceEventId);
  const k=a.game.providerSeriesId;if(seen.has(k))used.add(k);seen.add(k);
 }
 for(const {r,maps} of series){
  if(used.has(maps[0].game.providerSeriesId)||badEvents.has(r.sourceEventId))continue;
  for(const [i,{game:g,digest}] of maps.entries()){
   for(const [j,teamId] of g.teamIds.entries()){
    facts.push({sourceEventId:r.sourceEventId,mapOrdinal:i+1,nativeMapId:g.providerGameId,teamId,market:'teamKills',value:g.teamScores[j],nativeDigest:digest});
   }
  }
 }
 return {facts,summary:{kind:'pickfinder_dota2_reconciled_team_map_facts_v1',qualifiedHistoricalTeamStats:facts.length,
  joinedEvents:new Set(facts.map(f=>f.sourceEventId)).size,joinedMaps:new Set(facts.map(f=>f.nativeMapId)).size,
  byMarket:facts.length?{teamKills:facts.length}:{},playerStatsQualified:0,modelApproved:false,platformSettlementVerified:false,prospective:false,paidRequests:0}};
}
module.exports={reconcile};
