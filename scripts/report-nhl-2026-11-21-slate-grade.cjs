"use strict";
/**
 * Final-only ORIGINAL-Git NHL slate grade, including per-prop names and
 * identical-line always-Higher/Lower benchmarks. Never score every observed
 * offer as if it were a selected pick. No provider calls, betting/ROI claims.
 */
const fs=require("node:fs"),path=require("node:path");
const {audit}=require("../src/nhl-slate-graded-summary.cjs");
const root=path.resolve(__dirname,"..");
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
const finite=x=>typeof x==="number"&&Number.isFinite(x);
function grade(day="2026-11-21"){
 if(!/^2026-\d\d-\d\d$/.test(day))throw Error("Explicit 2026 game day required");
 const official=read("outputs/player-stats/"+day+".json"),
  schedule=read("outputs/official-nhl/season-schedules/2026-27.json"),
  ledger=read("outputs/research/registry/nhl-precommitted-ledger-latest.json");
 if(!Number.isFinite(Date.parse(official.fetchedAt))||
  !Number.isFinite(Date.parse(ledger.builtAt))||
  Date.parse(ledger.builtAt)<Date.parse(official.fetchedAt))
  throw Error("Do not grade from frozen ledger built BEFORE yesterday's official finals");
 const result=audit({date:day,stats:official,schedule,ledger});
 if(result.status!=="all_games_official_final_original_frozen_prop_research_only"||
    result.officialGamesTotal!==official.scheduledGames||
    official.scheduledGames<1||result.games.length!==official.scheduledGames||
    result.completeOfficialPlayerRows!==official.players.length)
  throw Error("All original NHL slate games must have verified FINAL player boxscores");
 const seen=new Set(),players=new Map();
 for(const p of official.players){
  const k=p.gameId+"|"+p.playerId;
  if(seen.has(k))throw Error("Official final player-game duplicate");
  seen.add(k);players.set(k,p);
 }
 const officialIds=new Set(result.games.map(g=>g.gameId));
 const rows=ledger.records.filter(r=>officialIds.has(r.gameId)).map(r=>{
  const p=players.get(r.gameId+"|"+r.playerId),
   status=r.selectionStatus==="pending_official_player_stats"?"pending":r.selectionStatus;
  if(!["correct","incorrect","push","pending"].includes(status))
   throw Error("Unrecognized original selected direction grade");
  // A player who did not appear cannot be silently graded via another identity.
  if(status!=="pending"&&!p)throw Error("Decided selected player is absent from official final");
  if(status!=="pending"&&r.officialGameDate!==day)
   throw Error("Grade from wrong NHL final day");
  // For count-valued markets the frozen official grade value must reconcile.
  if(status!=="pending"&&finite(r.officialStat)&&finite(p?.[r.market])&&
    Math.abs(r.officialStat-p[r.market])>1e-8)
   throw Error("Official stat does not match frozen-grade identity");
  const game=result.games.find(g=>g.gameId===r.gameId);
  return {id:r.id,gameId:r.gameId,matchup:game?.matchup||null,
   playerId:r.playerId,player:p?.name??null,team:r.team,opponent:r.opponent,
   market:r.market,tier:r.tier,line:r.line,originalSide:r.selectedSide,
   officialStat:finite(r.officialStat)?r.officialStat:null,
   officialSide:status==="correct"||status==="incorrect"?r.officialResult:null,
   grade:status,firstCapturedAt:r.firstCaptureAt,firstGitAt:r.firstGitCommittedAt,
   modelProbabilityCalibrationApproved:false,originalPlatformOfferAuthenticated:false,
   originalEntrySettlementVerified:false};
 });
 const counts={correct:0,incorrect:0,push:0,pending:0};
 rows.forEach(r=>counts[r.grade]++);
 if(rows.length!==result.all.registered||
  counts.correct!==result.all.correct||counts.incorrect!==result.all.incorrect||
  counts.push!==result.all.push||counts.pending!==result.all.pending)
  throw Error("Individual original rows do not reconcile with full-slate counters");
 const output={...result,allGamesVerified:true,
  all14GamesVerified:result.officialGamesTotal===14,
  playerDetails:rows,
  officialSourceFetchedAt:official.fetchedAt,
  pregameFrozenOnly:true,originalSelectedSideNeverRecomputed:true,
  fullSlateNHLGamesReconciled:true,allResultsFromOriginalOfficialFinalStats:true,
  totalDistinctOriginalSelectionIds:new Set(rows.map(x=>x.id)).size,
  perMarketAndTierOriginalOnly:true,oppositeSideAlwaysHigherLowerHypothetical:true,
  noPrizePicksOrUnderdogSettlements:true,noBettingEdgeInferred:true,
  generatedAt:new Date().toISOString()};
 const rel="outputs/health/nhl-"+day+"-all-games-graded.json";
 fs.mkdirSync(path.dirname(path.join(root,rel)),{recursive:true});
 fs.writeFileSync(path.join(root,rel),JSON.stringify(output,null,2)+"\n");
 console.log(JSON.stringify({date:day,officialGames:result.officialGamesTotal,
  firstGitSelections:result.all.registered,decided:result.all.decided,
  wins:result.all.correct,losses:result.all.incorrect,pushes:result.all.push,
  pending:result.all.pending,tiers:Object.fromEntries(
  Object.entries(result.tiers).map(([k,v])=>[k,{
   decided:v.decided,wins:v.correct,losses:v.incorrect,push:v.push,pending:v.pending,
   alwaysHigher:v.hypotheticalAlwaysHigher,alwaysLower:v.hypotheticalAlwaysLower}])),
  source:"NHL public API final official player boxscores",approved:false,
  originalAppSettlementVerified:false,paidCalls:0,output:rel}));
 return output;
}
if(require.main===module)try{
 const day=process.argv[2];
 if(!day)throw Error("Explicit completed official Pacific slate day required");
 grade(day);
}catch(e){
 console.error(e.message);process.exitCode=1;}
module.exports={grade};
