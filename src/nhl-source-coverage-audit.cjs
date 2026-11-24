"use strict";
/**
 * Source-agnostic source-coverage facts. A complete independent API response
 * does NOT establish that we saw the entire original PrizePicks app board.
 * All analysis is done on saved observations. There are zero provider calls.
 */
const {officialGame,marketOf,periodOf}=require("./nhl-platform-line-shop.cjs");
const date=x=>typeof x==="string"&&Number.isFinite(Date.parse(x))?Date.parse(x):null;
const nonNeg=x=>Number.isInteger(x)&&x>=0?x:0;
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function analyzeNhlSourceCoverage(board,research,schedule,{asOf=new Date().toISOString(),horizonHours=48}={}){
 const now=date(asOf),capture=date(board?.generatedAt);
 if(now===null||!Number.isInteger(horizonHours)||horizonHours<1||horizonHours>96)
  throw Error("Invalid source health clock or NHL official-game window");
 const base={schemaVersion:1,kind:"private_nhl_independent_source_coverage_v1",
  calculatedAt:asOf,boardCapturedAt:board?.generatedAt||null,sourceProvider:board?.provider||null,
  independentThirdParty:true,originalPlatformOffersAuthenticated:false,
  entireOriginalPrizePicksBoardVerified:false,originalUnderdogOffersAuthenticated:false,
  sourcePricingAndPayoutVerified:false,providerCallsByAssessment:0,
  expectedWindowHours:horizonHours,
  sourceCompletePagination:board?.completePagination===true,
  sourceRows:nonNeg(board?.rows?.length),providerProjectionCount:nonNeg(board?.totalOffers),
  sourceFreshForLiveUse:false,
  sourceAgeMinutes:null,
  boardCoverageWindowNotPlatformInventory:true};
 if(!Array.isArray(board?.rows)||capture===null||
  schedule?.complete!==true||!Array.isArray(schedule?.games)){
  return {...base,status:"missing_source_or_complete_official_schedule",
   officialGamesInWindow:null,officialGamesWithObservedOffers:0,
   officialGameObservedShare:null,matchedEligibleSideRows:0,matchedOfficialGames:0,
   uniqueProviderProjectionIds:0,modelMatchedRankedSides:0,
   modelMatchRatio:null,marketCounts:{},tierCounts:{},
   rejectedRows:{sourceOrOfficialScheduleUnavailable:1},
   note:"No source coverage percentage without complete archived source and official schedule."};
 }
 const ageMin=(now-capture)/60000;
 const sourceFresh=ageMin>=0&&ageMin<=30&&board.completePagination===true&&
  board.sourceStatus==="fresh"&&board.safeForLiveUse!==false;
 const games=schedule.games.filter(g=>{
  const st=date(g.startTimeUTC);
  return Number.isInteger(g.id)&&st!==null&&st>capture&&
   st<=capture+horizonHours*3600000;
 });
 const availableIds=new Set(games.map(g=>g.id)),matchedGameIds=new Set(),
  names=new Set(),projections=new Set(),marketCounts={},tierCounts={},
  rejected={staleOrAfterStart:0,marketOrPeriodUnsupported:0,unmatchedOfficialGame:0,
   invalidRow:0,notWithinOfficialWindow:0},recognized=[];
 for(const r of board.rows){
  if(!r||!r.projectionId||!r.player||!r.team||!finite(r.line)||
    !["Higher","Lower"].includes(r.side)){
   rejected.invalidRow++;continue;
  }
  projections.add(String(r.projectionId));
  const seen=date(r.observedAt),at=date(r.capturedAt),start=date(r.eventStartsAt);
  if(seen===null||at===null||start===null||seen>at||at>capture+5000||
    seen>capture+5000||at>=start||start<=capture){
   rejected.staleOrAfterStart++;continue;
  }
  const market=marketOf(r.market);
  if(!market||periodOf(r.period)!=="full_game"){
   rejected.marketOrPeriodUnsupported++;continue;
  }
  const g=officialGame(r.team,r.matchup,r.eventStartsAt,schedule);
  if(!g){rejected.unmatchedOfficialGame++;continue;}
  if(!availableIds.has(g.id)){rejected.notWithinOfficialWindow++;continue;}
  matchedGameIds.add(g.id);
  names.add(g.id+"|"+r.player+"|"+r.team);
  marketCounts[market]=(marketCounts[market]||0)+1;
  const tier=String(r.tier||"Unknown");
  tierCounts[tier]=(tierCounts[tier]||0)+1;
  recognized.push(r);
 }
 const matched=Array.isArray(research?.rankedProps)?
  research.rankedProps.filter(p=>Number.isInteger(p.gameId)&&
   matchedGameIds.has(p.gameId)&&Number.isInteger(p.playerId)).length:0;
 const total=games.length;
 return {...base,status:board.completePagination===true?
   "complete_independent_source_response_not_original_platform_coverage":
   "incomplete_independent_source_response",
  sourceAgeMinutes:Math.round(ageMin*10)/10,
  sourceFreshForLiveUse:sourceFresh,
  officialGamesInWindow:total,
  officialGamesWithObservedOffers:matchedGameIds.size,
  officialGameObservedShare:total?Number((matchedGameIds.size/total).toFixed(4)):null,
  matchedEligibleSideRows:recognized.length,
  matchedOfficialGames:matchedGameIds.size,
  uniqueObservedPlayerGames:names.size,
  uniqueProviderProjectionIds:projections.size,
  modelMatchedRankedSides:matched,
  // The ranked model has different eligibility rules; this is a
  // descriptive join ratio, NEVER a projection of source completeness.
  modelMatchRatio:null,
  twoDifferentEligibilityPopulationsCannotBeDivided:true,
  marketCounts,tierCounts,rejectedRows:rejected,
  sourceOutcomeCoverageNotAuthenticated:true,
  note:"Fraction of official NHL games in a 48-hour window with >=1 matching independent-source prop. NOT percentage of PrizePicks offers or app boards; no original platform availability verified."};
}
module.exports={analyzeNhlSourceCoverage};
