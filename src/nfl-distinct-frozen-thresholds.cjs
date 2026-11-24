"use strict";
/**
 * Official stat outcomes over the earliest ORIGINAL Git-committed NFL quote
 * for every distinct game/player/market/line (and stricter one-per-player-market).
 * A later 6 AM/9 AM capture of the same underlying prop is not an independent
 * model decision, even if its synthetic source-offer ID differs.
 */
const KIND="nfl_original_first_distinct_threshold_official_stat_audit_v1";
const pct=(v,n)=>n?Number((v/n).toFixed(6)):null;
const threshold=p=>[p.sourceGameId,p.historicalPlayerId,p.market,p.line,p.tier].join("|");
const playerMarket=p=>[p.sourceGameId,p.historicalPlayerId,p.market,p.tier].join("|");
function metrics(x){
 const d=x.filter(e=>e.r.status==="decided"),push=x.filter(e=>e.r.status==="push");
 const correct=d.filter(e=>e.r.selectedSideResult==="correct").length;
 const higher=d.filter(e=>e.r.actualSide==="Higher").length;
 const lower=d.filter(e=>e.r.actualSide==="Lower").length;
 return {registered:x.length,decided:d.length,correct,incorrect:d.length-correct,
  pushes:push.length,pending:x.length-d.length-push.length,
  distinctFinalGames:new Set(d.map(e=>e.r.officialScheduleGameId)).size,
  hitRate:pct(correct,d.length),
  alwaysHigherSameLines:higher,alwaysLowerSameLines:lower,
  alwaysHigherRate:pct(higher,d.length),alwaysLowerRate:pct(lower,d.length),
  originalPlatformSettlementVerified:false,expectedValue:null};
}
function aggregate(x,key){
 const groups=new Map();
 for(const v of x){
  const k=key(v);
  if(!groups.has(k))groups.set(k,[]);
  groups.get(k).push(v);
 }
 return Object.fromEntries([...groups.entries()]
  .sort(([a],[b])=>a.localeCompare(b)).map(([k,rows])=>[k,metrics(rows)]));
}
function audit(originalIndex,gradedRows){
 if(!(originalIndex?.earliest instanceof Map)||!Array.isArray(gradedRows))
  throw Error("Require pregame first-Git verified source and official outcome list");
 const grades=new Map();
 for(const row of gradedRows){
  if(!row?.id||grades.has(row.id)||
   !["decided","push","pending_official_final","pending_official_game_match",
    "unresolved_player_appearance","missing_official_stat",
    "unsupported_market_or_projection"].includes(row.status))
   throw Error("Inconsistent NFL final-grade row status or duplicate ID");
  grades.set(row.id,row);
 }
 if(grades.size!==originalIndex.earliest.size)
  throw Error("Original NFL grading does not cover first-Git unique source rows");
 const seenThreshold=new Map(),seenMarket=new Map(),exclude={sameLineLaterObservation:0,
  samePlayerMarketLaterQuote:0};
 // Map insertion order is sorted by the first commit in firstOriginals().
 for(const source of originalIndex.earliest.values()){
  const p=source.p,r=grades.get(p.id);
  if(!r||r.firstGitCommittedAt!==source.firstCommittedAt||
   r.sourceGameId!==p.sourceGameId||r.market!==p.market||
   r.line!==p.line||r.modeledSide!==p.selectedSide||
   (r.status==="decided"&&(
    !["correct","incorrect"].includes(r.selectedSideResult)||
    !["Higher","Lower"].includes(r.actualSide)||
    r.selectedSideResult!==(r.actualSide===p.selectedSide?"correct":"incorrect"))))
   throw Error("The NFL grade does not match its earliest original Git frozen line");
  const record={p,r,firstCommittedAt:source.firstCommittedAt};
  const t=threshold(p),m=playerMarket(p);
  if(!seenThreshold.has(t))seenThreshold.set(t,record);
  else exclude.sameLineLaterObservation++;
  if(!seenMarket.has(m))seenMarket.set(m,record);
  else exclude.samePlayerMarketLaterQuote++;
 }
 const lines=[...seenThreshold.values()],markets=[...seenMarket.values()];
 const officialGame=e=>e.r.officialScheduleGameId||e.p.sourceGameId;
 return {kind:KIND,status:"original_first_git_distinct_same_thresholds",
  originalPrecommittedDirectionsUnchanged:true,
  allSourceIds:grades.size,excludedExactIDDuplicates:originalIndex.exactRepeated,
  excludedLaterObservationCounts:exclude,
  earliestPerPlayerGameMarketAndLine:{
   ...metrics(lines),
   byGame:aggregate(lines,officialGame),
   byMarket:aggregate(lines,e=>e.p.market),
   bySelectedSide:aggregate(lines,e=>e.p.selectedSide)
  },
  earliestPerPlayerGameMarket:{
   ...metrics(markets),
   byGame:aggregate(markets,officialGame),
   byMarket:aggregate(markets,e=>e.p.market)
  },
  originalFirstGitBeforeKickoffProven:true,
  statisticsDerivedFromNflverseNotPlatformSettlement:true,
  notIndependentBetsDueSharedGame:true,
  platformAppOfferAvailabilityUnverified:true,
  releaseApproved:false,
  note:"First frozen quote is counted once per player/game/market/line regardless of repeat morning source IDs. Different alternate lines still share an outcome and are not independent; one-per-player-market is an even stricter descriptive lens. Do not interpret either as payout-adjusted value or an executable platform wager."};
}
module.exports={KIND,threshold,playerMarket,metrics,aggregate,audit};
