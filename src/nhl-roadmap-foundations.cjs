"use strict";
/** Research data foundations. None of these calculations authorizes wagering. */
const {createHash}=require("node:crypto");
const {removeVig}=require("./sportsbook-consensus.cjs");
const finite=Number.isFinite,clean=x=>String(x??"").trim();
const round=x=>Number(x.toFixed(4));
function stablePickId(p){
 if(!Number.isInteger(p?.gameId)||!Number.isInteger(p?.playerId)||
  !clean(p.market)||!finite(p.line)||!["Standard","Goblin","Demon"].includes(p.tier))
  throw Error("An exact official NHL game, player, market, line and tier is required");
 return "nhl-"+createHash("sha256").update(JSON.stringify([
  p.gameId,p.playerId,clean(p.market),p.line,p.tier
 ])).digest("hex").slice(0,24);
}
function canonicalSelectedLedger(picks,gradedResult){
 if(!Array.isArray(picks)||!gradedResult||
  !Array.isArray(gradedResult.graded)||!Array.isArray(gradedResult.pending)||
  !Array.isArray(gradedResult.rejected))throw Error("Missing verifiable selected cohort or official grade");
 if(gradedResult.rejected.length)throw Error("Refuse to silently drop rejected committed selections");
 const results=new Map(gradedResult.graded.map(p=>[stablePickId(p),p]));
 const pending=new Set(gradedResult.pending.map(p=>p.gameId+"|"+p.playerId));
 const ledger=[],seen=new Set();
 for(const p of picks){
  if(p.retrospectivePolicyOnly!==false||!p.snapshotArchivedAt||
   !Number.isFinite(Date.parse(p.snapshotArchivedAt))||
   !(Date.parse(p.snapshotArchivedAt)<Date.parse(p.gameStartAt)))
   throw Error("Only original pregame Git-frozen selected prop directions are allowed");
  const id=stablePickId(p);
  if(seen.has(id))throw Error("Duplicate selected-pick registry identity");
  seen.add(id);
  const result=results.get(id);
  if(!result&&!pending.has(p.gameId+"|"+p.playerId))
   throw Error("Frozen selection lacks an official-grade or pending reason");
  ledger.push({id,gameId:p.gameId,playerId:p.playerId,
   market:p.market,line:p.line,tier:p.tier,selectedSide:p.lean,
   estimatedProbability:finite(p.probability)?p.probability:null,
   team:p.team,opponent:p.opponent,gameStartAt:p.gameStartAt,
   firstCaptureAt:p.capturedAt,firstResearchAt:p.predictionRecordedAt,
   firstGitCommittedAt:p.snapshotArchivedAt,
   recordedModelVersion:p.model,selectionStatus:result?
    (result.result==="Push"?"push":result.correct?"correct":"incorrect"):"pending_official_player_stats",
   officialResult:result?result.result:null,officialStat:result?.actual??null,
   officialGameDate:result?.gameDate??null,
   originalPlatformSettlementVerified:false,payoutAdjustedROI:null});
 }
 ledger.sort((a,b)=>Date.parse(a.gameStartAt)-Date.parse(b.gameStartAt)||
  a.id.localeCompare(b.id));
 const counts={registered:ledger.length,correct:0,incorrect:0,push:0,pending:0};
 for(const p of ledger){
  const key={correct:"correct",incorrect:"incorrect",push:"push",
   pending_official_player_stats:"pending"}[p.selectionStatus];counts[key]++;
 }
 if(counts.correct!==gradedResult.summary.correct||
  counts.push!==gradedResult.summary.pushes||
  counts.correct+counts.incorrect!==gradedResult.summary.decisions)
  throw Error("Selected official graded summary does not reconcile with ledger");
 return {schemaVersion:1,kind:"private_immutable_source_linked_nhl_selected_predictions",
  cohort:"explicit_original_Git_precommitted_standalone_model_directions",
  registryStatus:"derived_index_rebuildable_from_Git_originals",
  statsSource:"official_NHL_FINAL_player_game_stats",
  counts,records:ledger,retrospectiveReconstructedIncluded:false,
  sourceBoardDirectionsNotModelChoices:true,originalPlatformSettlementVerified:false,
  realizedReturn:null};
}
function describeHistoricalMatchup(prop,history){
 const p=history?.players?.[String(prop?.playerId)];
 if(!p||!Array.isArray(p.games)||!Number.isFinite(Date.parse(prop?.capturedAt)))return null;
 const cutoff=prop.capturedAt.slice(0,10);
 const prior=p.games.filter(g=>typeof g.gameDate==="string"&&g.gameDate<cutoff&&
   Number.isFinite(g[prop.market])&&g.type===p.type)
  .sort((a,b)=>a.gameDate.localeCompare(b.gameDate)||a.gameId-b.gameId);
 if(prior.length<5)return {sampleGames:prior.length,status:"insufficient_past_game_sample",
  modelAdjusted:false};
 const last=prior.at(-1),priorDate=Date.parse(last.gameDate+"T00:00:00Z"),
  date=Date.parse(cutoff+"T00:00:00Z");
 const gamesSince=Number.isFinite(date-priorDate)?Math.max(0,Math.round((date-priorDate)/86400000)):null;
 const recent=prior.slice(-10),home=recent.filter(x=>x.side==="home"),away=recent.filter(x=>x.side==="away");
 const avg=rows=>rows.length?round(rows.reduce((a,x)=>a+x[prop.market],0)/rows.length):null;
 return {status:"official_past_only_descriptive",
  market:prop.market,playerId:prop.playerId,sampleGames:prior.length,
  last10Average:avg(recent),recentHomeAverage:avg(home),recentAwayAverage:avg(away),
  recentHomeGames:home.length,recentAwayGames:away.length,
  daysSinceLastOfficialAppearance:gamesSince,
  opponentImpactFactorVerified:false,starterStatusVerified:false,
  modelAdjusted:false,source:"Official NHL historical FINAL player-game boxscores"};
}
function fairConsensusCoverage(quotes,{now,ageLimitMinutes=240}={}){
 if(!Array.isArray(quotes)||!Number.isFinite(Date.parse(now)))throw Error("Valid archived quote array and assessment time required");
 const asOf=Date.parse(now),groups=new Map(),counts={observed:quotes.length,eligible:0,stale:0,
  started:0,malformed:0};
 for(const q of quotes){
  const at=Date.parse(q?.capturedAt),start=Date.parse(q?.commenceTime),
   update=Date.parse(q?.marketUpdatedAt||q?.capturedAt);
  if(!finite(at)||!finite(start)||!finite(update)||!clean(q.book)||
   !clean(q.player)||!clean(q.eventId)||!clean(q.market)||!finite(q.line)||
   !finite(q.overOdds)||!finite(q.underOdds)){counts.malformed++;continue;}
  if(start<=asOf||update>=start){counts.started++;continue;}
  if(at>asOf||update>asOf||asOf-at>ageLimitMinutes*60000||
   asOf-update>ageLimitMinutes*60000){counts.stale++;continue;}
  const fair=removeVig(q.overOdds,q.underOdds);
  if(!fair){counts.malformed++;continue;}
  counts.eligible++;
  const key=JSON.stringify([q.eventId,clean(q.player).toLowerCase(),
   q.market,q.line,q.period||"full_game"]);
  if(!groups.has(key))groups.set(key,new Map());
  // Never overweight a sportsbook that supplied duplicate markets.
  const byBook=groups.get(key);
  if(!byBook.has(q.book))byBook.set(q.book,{book:q.book,higher:fair.higher});
 }
 const summary=[...groups].map(([key,books])=>{
  const rows=[...books.values()],xs=rows.map(x=>x.higher),
   avg=xs.reduce((a,b)=>a+b,0)/xs.length;
  return {marketIdentity:JSON.parse(key),distinctBooks:rows.length,
   fairHigher:round(avg),fairLower:round(1-avg),
   highLowSpread:round(Math.max(...xs)-Math.min(...xs)),
   reliableMultiBookSample:rows.length>=2,liquidityOrSharpWeightVerified:false};
 });
 return {kind:"private_nhl_no_vig_consensus_coverage_v1",asOf:now,
  source:"Previously archived The Odds API sportsbook quotes, no new requests",
  counts,groups:summary.length,multiBookGroups:summary.filter(x=>x.reliableMultiBookSample).length,
  bookIndependentConsensusEstimates:summary,
  fairPricingIsNotFantasyAppPayout:true,noMarketQuotedReturnVerified:true};
}
function groupAlternateLadders(props){
 if(!Array.isArray(props))throw Error("Require archived prop candidate array");
 const grouped=new Map(),bad={invalid:0};
 for(const p of props){
  if(!Number.isInteger(p?.gameId)||!Number.isInteger(p.playerId)||
    !clean(p.market)||!finite(p.line)||!["Higher","Lower"].includes(p.lean)||
    !["Standard","Goblin","Demon"].includes(p.tier)||
    !finite(Date.parse(p.capturedAt))||Date.parse(p.capturedAt)>=Date.parse(p.eventStartsAt)){
   bad.invalid++;continue;
  }
  const id=JSON.stringify([p.gameId,p.playerId,p.market,p.lean]);
  if(!grouped.has(id))grouped.set(id,new Map());
  const r=grouped.get(id),entryKey=JSON.stringify([p.line,p.tier]);
  if(!r.has(entryKey))r.set(entryKey,{line:p.line,tier:p.tier,side:p.lean,
   sourceCapturedAt:p.capturedAt,modelProbabilityEstimate:finite(p.probability)?p.probability:null,
   originalTierPayoutVerified:false});
 }
 const ladders=[...grouped].filter(([key,map])=>map.size>1).map(([id,entries])=>({
  identity:JSON.parse(id),alternates:[...entries.values()].sort((a,b)=>a.line-b.line||
   a.tier.localeCompare(b.tier)),standardPresent:[...entries.values()].some(x=>x.tier==="Standard"),
  originalTierTermsVerified:false,expectedValue:null
 }));
 return {kind:"private_nhl_offered_side_alternate_ladders_v1",
  candidateMarketSides:grouped.size,multiThresholdSides:ladders.length,
  ladders,invalidExcluded:bad.invalid,originalTierPayoutsVerified:false,
  completeFantasyAppOriginalBoardProven:false,
  note:"Source observed selections, not verified original platform tiers or priced payout ladders."};
}
module.exports={stablePickId,canonicalSelectedLedger,describeHistoricalMatchup,
 fairConsensusCoverage,groupAlternateLadders};
