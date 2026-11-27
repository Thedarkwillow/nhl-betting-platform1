'use strict';
// Review-only public map results, not native offer validation or settlement.
const archived=require('../config/esports/pickfinder-series-review-2026-11-27.json');
const results=require('../config/esports/pickfinder-cs2-player-review-2026-11-27.json');
const player=/^https:\/\/www\.hltv\.org\/player\/(\d+)\/[a-z0-9-]+$/;
const map=/^https:\/\/www\.hltv\.org\/stats\/matches\/mapstatsid\/(\d+)\/[a-z0-9-]+$/;
const shape=/^https:\/\/www\.hltv\.org\/stats\/matches\/\d+\/[a-z0-9-]+$/;
const date=Date.parse, n=x=>Number.isSafeInteger(x)&&x>=0;
function reconcile(clock,{finals=results,review=archived}={}){
 const facts=[],at=date(clock);
 if(finals?.kind==='pickfinder_reviewed_cs2_player_finals_v1'&&date(finals.reviewedAt)<=at&&date(review.reviewedAt)<=at){
  const repeats=new Map();
  for(const s of finals.series||[])for(const m of s.maps||[]){
   const id=map.exec(m.url)?.[1];if(id)repeats.set(id,(repeats.get(id)||0)+1);
  }
  for(const s of finals.series||[]){
   const match=review.series.filter(x=>x.sport==='cs2'&&x.sourceEventId===s.sourceEventId&&x.seriesUrl===s.seriesUrl&&x.reportedDate===s.completedDate);
   if(match.length!==1||!shape.test(s.resultsUrl)||!Array.isArray(s.maps)||s.maps.length!==2||
    JSON.stringify(s.maps.map(m=>m.name))!==JSON.stringify(match[0].firstTwoMapNames)||
    !(date(s.completedDate+'T23:59:59Z')<=at)||!Array.isArray(match[0].roster))continue;
   const roster=match[0].roster,rows=[];
   const teams=s.maps.map((m,i)=>{
    const mapId=map.exec(m.url)?.[1],seen=new Set();
    if(!mapId||repeats.get(mapId)!==1||!Array.isArray(m.rounds)||m.rounds.length!==2||
      m.rounds.some(x=>!n(x)||x>99)||Math.max(...m.rounds)<13||m.rounds[0]===m.rounds[1]||!Array.isArray(m.sides)||m.sides.length!==2)return null;
    const roundCount=m.rounds[0]+m.rounds[1],teamRows=[];
    for(const [t,side] of m.sides.entries()){
     if(!Array.isArray(side)||side.length!==5)return null;
     const ids=[];
     for(const row of side){
      if(!Array.isArray(row)||row.length!==5||row.some(x=>!n(x)))return null;
      const [id,k,h,a,d]=row;const rr=roster.filter(x=>player.exec(x.profileUrl)?.[1]===String(id));
      if(rr.length!==1||!/^\/players\/cs2\/[a-z0-9]+$/.test(rr[0].pickfinderProfilePath)||seen.has(rr[0].pickfinderProfilePath)||
       h>k||k>roundCount*5||a>roundCount*5||d>roundCount)return null;
      seen.add(rr[0].pickfinderProfilePath);ids.push(id);
      for(const [market,value] of Object.entries({kills:k,headshotKills:h,assists:a,deaths:d}))
       rows.push({player:rr[0].pickfinderProfilePath,sourceEventId:s.sourceEventId,nativeMapId:mapId,mapOrdinal:i+1,teamPartition:t,market,value,mapUrl:m.url,profileUrl:rr[0].profileUrl});
     }
     teamRows.push(ids.sort((a,b)=>a-b));
    }
    return teamRows;
   });
   if(teams.every(Boolean)&&JSON.stringify(teams[0])===JSON.stringify(teams[1]))facts.push(...rows);
  }
 }
 const byMarket={};for(const x of facts)byMarket[x.market]=(byMarket[x.market]||0)+1;
 return {facts,summary:{kind:'pickfinder_cs2_historical_player_map_facts_v1',qualifiedHistoricalMapStats:facts.length,
  byMarket,distinctSeries:new Set(facts.map(x=>x.sourceEventId)).size,distinctPlayers:new Set(facts.map(x=>x.player)).size,
  joinedMaps:new Set(facts.map(x=>x.nativeMapId)).size,modelApproved:false,platformSettlementVerified:false,prospective:false,paidRequests:0}};
}
module.exports={reconcile};
