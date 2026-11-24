"use strict";
/**
 * Source-labeled, aggregate public NHL player history and feed health.
 * Does NOT expose private model features, weights, raw provider quotes or
 * claims about original fantasy-app availability/settlements.
 */
const STATS=new Set(["shotsOnGoal","points","goals","assists","blockedShots","saves","shotsAgainst"]);
const round=x=>Math.round(x*100)/100;
const average=values=>values.length?round(values.reduce((s,n)=>s+n,0)/values.length):null;
const key=(name,team,market)=>JSON.stringify([name,team,market]);
function buildPlayerInsights(props,history){
 const out=[],seen=new Set();
 if(!history?.players||!Array.isArray(props))return out;
 for(const p of props){
  const id=Number(p?.playerId),k=key(p?.player,p?.team,p?.market);
  if(seen.has(k)||!Number.isInteger(id)||!STATS.has(p.market))continue;
  seen.add(k);
  const athlete=history.players[id];
  if(!athlete||athlete.name!==p.player||athlete.team!==p.team||
     !Array.isArray(athlete.games)||!Number.isFinite(Date.parse(p.capturedAt)))continue;
  const cutoff=p.capturedAt.slice(0,10); // deliberately excludes same-day games
  const prior=athlete.games.filter(g=>typeof g.gameDate==="string"&&
    g.gameDate<cutoff&&["FINAL","OFF"].includes(g.gameState)&&Number.isFinite(g.timeOnIceSeconds)&&g.timeOnIceSeconds>0&&Number.isFinite(g[p.market]))
   .sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
  if(!prior.length)continue;
  const year=Number(cutoff.slice(0,4)),seasonStart=(Number(cutoff.slice(5,7))>=7?year:year-1)+"-07-01";
  const season=prior.filter(g=>g.gameDate>=seasonStart);
  if(new Set(prior.map(g=>g.gameId)).size!==prior.length)continue;
  const values=prior.map(g=>g[p.market]);
  out.push({player:p.player,team:p.team,market:p.market,
   last5:values.length>=5?average(values.slice(-5)):null,last10:values.length>=10?average(values.slice(-10)):null,
   last20:values.length>=20?average(values.slice(-20)):null,seasonAverage:average(season.map(g=>g[p.market])),
   recentOfficialValues:prior.slice(-20).map(g=>({date:g.gameDate,value:g[p.market]})),
   historicalGames:prior.length,seasonGames:season.length,
   lastGameDate:prior[prior.length-1].gameDate,
   source:"Official NHL completed-game statistics",
   futureGameStatsExcluded:true});
 }
 return out;
}
function buildMovementSummary(movement){
 const allowed=["increased","decreased","new_offer","observed_tier_change","not_seen_unverified"];
 const changes=Array.isArray(movement?.changes)?movement.changes:[];
 const counts=Object.fromEntries(allowed.map(k=>[k,changes.filter(c=>c.type===k).length]));
 return {previousAt:typeof movement?.previousAt==="string"?movement.previousAt:null,
  currentAt:typeof movement?.currentAt==="string"?movement.currentAt:null,
  observedChanges:changes.length,increased:counts.increased,decreased:counts.decreased,
  newlySeen:counts.new_offer,observedTierTransitions:counts.observed_tier_change,
  notSeenUnverified:counts.not_seen_unverified,
  removalsVerified:false,source:"Third-party independently archived observations",
  note:"Counts compare two independent source snapshots, not original PrizePicks moves or removals. No verified closing-line value."};
}
function buildResultBreakdown(audit){
 const allowed=group=>Object.entries(group||{}).filter(([k,v])=>
  /^[A-Za-z][A-Za-z0-9]{0,30}$/.test(k)&&v&&
  Number.isInteger(v.graded)&&Number.isInteger(v.decided)&&
  Number.isInteger(v.correct)&&Number.isInteger(v.pushes)&&
  v.correct>=0&&v.correct<=v.decided&&v.decided+v.pushes===v.graded)
  .map(([market,v])=>({market,graded:v.graded,decided:v.decided,
   correct:v.correct,pushes:v.pushes,losses:v.decided-v.correct,
   observedHitRate:v.decided>=10?round(v.correct/v.decided*100)/100:null,
   smallSampleWithheld:v.decided>0&&v.decided<10}))
  .sort((a,b)=>b.decided-a.decided||a.market.localeCompare(b.market)).slice(0,20);
 return {byMarket:allowed(audit?.individualByMarket),
  byTier:allowed(audit?.individualByTier),
  noPrecommittedDecisions:!(audit?.gradedDecisions>0)};
}
function sanitizePlatformResearch(lineShop){
 const licensed=lineShop?.derivedDisplayAuthorized===true&&
  lineShop?.sourceFreshAtBuild===true;
 const allowed=licensed&&Array.isArray(lineShop.comparedLines)?
  lineShop.comparedLines.slice(0,30).filter(r=>
   Number.isInteger(r.gameId)&&typeof r.playerKey==="string"&&
   typeof r.market==="string"&&["Higher","Lower"].includes(r.side)&&
   Number.isFinite(r.prizePicksLine)&&Number.isFinite(r.underdogLine))
  .map(r=>({player:r.playerKey.slice(0,90),gameId:r.gameId,
   market:r.market,side:r.side,prizePicksLine:r.prizePicksLine,
   underdogLine:r.underdogLine,
   favorableThresholdPlatform:r.side==="Higher"?
    (r.prizePicksLine<r.underdogLine?"PrizePicks":r.underdogLine<r.prizePicksLine?"Underdog":"Same"):
    (r.prizePicksLine>r.underdogLine?"PrizePicks":r.underdogLine>r.prizePicksLine?"Underdog":"Same")}))
  :[];
 return {status:licensed?"licensed_fresh_independent_comparison":"not_available_or_not_authorized",
  matches:allowed,scopedToVerifiedStandardSides:true,
  firstPartyAvailabilityVerified:false,payoutsVerified:false,
  source:"Independent sources, not original fantasy platform confirmations"};
}
module.exports={buildPlayerInsights,buildMovementSummary,buildResultBreakdown,sanitizePlatformResearch};
