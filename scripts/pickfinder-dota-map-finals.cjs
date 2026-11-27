'use strict';
const review=require('../config/esports/pickfinder-series-review-2026-11-27.json');
const playerReview=require('../config/esports/pickfinder-dota-player-review-2026-11-27.json');
const hash=x=>/^[a-f0-9]{64}$/.test(x||''),dt=Date.parse;
const ids=a=>Array.isArray(a)&&a.length===2&&new Set(a).size===2&&a.every(x=>/^[0-9]+$/.test(x));
function playerMap(g,r,record){
 if(record.nativeMapId!==g.providerGameId||record.sourceEventId!==r.sourceEventId||record.sourceUrl!==r.seriesUrl||
   !/^https:\/\/dotascore\.org\/matches\/[a-z0-9-]+$/.test(record.sourceUrl)||!Array.isArray(r.roster)||
   !Array.isArray(record.sides)||record.sides.length!==2)return null;
 const distinct=new Set(),rows=[];
 for(const [i,side] of record.sides.entries()){
  if(!Array.isArray(side)||side.length!==5)return null;
  let kills=0;
  for(const p of side){
   if(!p||!/^https:\/\/dotascore\.org\/players\/[a-z0-9-]+$/.test(p.profileUrl)||!Array.isArray(p.kda)||p.kda.length!==3||
      p.kda.some(n=>!Number.isSafeInteger(n)||n<0||n>g.teamScores[0]+g.teamScores[1]))return null;
   const roster=r.roster.filter(x=>x.profileUrl===p.profileUrl);
   if(roster.length!==1||!/^\/players\/dota2\/[a-z0-9]+$/.test(roster[0].pickfinderProfilePath)||distinct.has(roster[0].pickfinderProfilePath))return null;
   const player=roster[0].pickfinderProfilePath;distinct.add(player);kills+=p.kda[0];
   rows.push({player,teamId:g.teamIds[i],sourceUrl:record.sourceUrl,playerEvidenceUrl:p.profileUrl,kda:p.kda});
  }
  if(kills!==g.teamScores[i])return null;
 }
 return rows;
}
function reconcile(receipts,clock,reviewed=review,players=reviewed===review?playerReview:null){
 const at=dt(clock),map=new Map(),bad=new Set(),facts=[],playerFacts=[],playerMaps=new Map(),conflictMaps=new Set();
 if(players?.kind==='pickfinder_reviewed_dota_player_finals_v1'&&dt(players.reviewedAt)<=at&&Array.isArray(players.maps))for(const r of players.maps){
  if(playerMaps.has(r?.nativeMapId))conflictMaps.add(r?.nativeMapId);else playerMaps.set(r?.nativeMapId,r);
 }
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
  const matched=maps.map(({game:g})=>playerMaps.has(g.providerGameId)&&!conflictMaps.has(g.providerGameId)?playerMap(g,r,playerMaps.get(g.providerGameId)):null);
  const sameRoster=matched.every(Boolean)&&JSON.stringify(matched[0].map(x=>[x.player,x.teamId]).sort())===JSON.stringify(matched[1].map(x=>[x.player,x.teamId]).sort());
  for(const [i,{game:g,digest}] of maps.entries()){
   if(sameRoster&&dt(g.endAt)<=dt(players.reviewedAt))for(const row of matched[i]){
    const {kda,...identity}=row;
    for(const [market,value] of Object.entries({kills:kda[0],deaths:kda[1],assists:kda[2],killsPlusAssists:kda[0]+kda[2]}))
     playerFacts.push({...identity,sourceEventId:r.sourceEventId,nativeMapId:g.providerGameId,mapOrdinal:i+1,nativeDigest:digest,market,value});
   }
   for(const [j,teamId] of g.teamIds.entries()){
    facts.push({sourceEventId:r.sourceEventId,mapOrdinal:i+1,nativeMapId:g.providerGameId,teamId,market:'teamKills',value:g.teamScores[j],nativeDigest:digest});
   }
  }
 }
 const playerByMarket={};for(const p of playerFacts)playerByMarket[p.market]=(playerByMarket[p.market]||0)+1;
 return {facts,playerFacts,summary:{kind:'pickfinder_dota2_reconciled_team_map_facts_v1',qualifiedHistoricalTeamStats:facts.length,
  joinedEvents:new Set(facts.map(f=>f.sourceEventId)).size,joinedMaps:new Set(facts.map(f=>f.nativeMapId)).size,
  byMarket:facts.length?{teamKills:facts.length}:{},playerStatsQualified:playerFacts.length,playerByMarket,playerJoinedMaps:new Set(playerFacts.map(x=>x.nativeMapId)).size,distinctPlayers:new Set(playerFacts.map(x=>x.player)).size,modelApproved:false,platformSettlementVerified:false,prospective:false,paidRequests:0}};
}
module.exports={reconcile};
