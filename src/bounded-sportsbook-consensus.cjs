"use strict";
// Same-source exact player label+event+stat+period+line consensus, never a
// substitution for an independently authenticated cross-platform player ID.
const {removeVig}=require("./sportsbook-consensus.cjs");
const dt=x=>typeof x==="string"?Date.parse(x):NaN;
const key=x=>JSON.stringify([x.sport,x.eventId,x.homeTeam,x.awayTeam,x.commenceTime,x.player,x.market,x.period,x.line]);
function study(archive,{now=new Date().toISOString(),includePrivateBookBreakdown=false}={}){
 const groups=new Map(),reject={};const t=dt(now),skip=k=>reject[k]=(reject[k]||0)+1;
 const independent=archive?.kind==="independent_nhl_sportsbook_capture_v1"&&archive.status==="fresh_independent_archive"&&archive.source==="SportsGameOdds";
 if((!independent&&(archive?.kind!=="bounded_sportsbook_capture_v1"||archive.status!=="fresh_bounded_archive"))||!Array.isArray(archive.rows)||!Number.isFinite(t))return {kind:"bounded_source_consensus_v1",status:"no_verified_archive",groups:[],strictPlatformMatches:0,calibrated:false};
 for(const r of archive.rows){
  if(r.source!==(independent?"SportsGameOdds":"The Odds API")||independent&&r.sport!=="NHL"||!["NHL","NFL"].includes(r.sport)||typeof r.eventId!=="string"||!r.eventId||typeof r.player!=="string"||!r.player||typeof r.market!=="string"||!r.market||r.period!=="full_game"||!Number.isFinite(r.line)||!r.homeTeam||!r.awayTeam||r.homeTeam===r.awayTeam||!["draftkings","fanduel","betmgm","caesars"].includes(r.book)||!(dt(r.marketUpdatedAt)<=dt(r.capturedAt)&&dt(r.capturedAt)<=t&&t<dt(r.commenceTime))||t-dt(r.marketUpdatedAt)>1800000){skip("stale_or_invalid_quote");continue;}
  const p=removeVig(r.overOdds,r.underOdds);if(!p){skip("invalid_two_sided_price");continue;}
  const k=key(r),g=groups.get(k)||{identity:{source:r.source,sport:r.sport,eventId:r.eventId,player:r.player,market:r.market,period:r.period,line:r.line,homeTeam:r.homeTeam,awayTeam:r.awayTeam,commenceTime:r.commenceTime},books:new Map(),duplicate:new Set()};groups.set(k,g);
  if(g.books.has(r.book)){g.duplicate.add(r.book);g.books.delete(r.book);}else if(!g.duplicate.has(r.book))g.books.set(r.book,p);
 }
 const results=[];
 for(const g of groups.values()){
  const a=[...g.books.values()];if(a.length<2){skip("fewer_than_two_unique_books");continue;}
  const higher=a.reduce((s,p)=>s+p.higher,0)/a.length;
  results.push({...g.identity,books:a.length,...(includePrivateBookBreakdown?{bookHigherPrivate:Object.fromEntries([...g.books].map(([book,price])=>[book,price.higher]))}:{}),higher,lower:1-higher,conditionalOnNoPush:true,rangeHigher:[Math.min(...a.map(x=>x.higher)),Math.max(...a.map(x=>x.higher))],strictPlatformMatchVerified:false});
 }
 return {kind:"bounded_source_consensus_v1",status:results.length?"source_native_multibook_consensus":"no_fresh_multibook_groups",generatedAt:now,groups:results,exclusions:reject,strictPlatformMatches:0,calibrated:false,modelPromoted:false};
}
module.exports={study};
